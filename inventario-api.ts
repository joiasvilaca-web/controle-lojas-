// inventario-api v3 — Inventário / contagem de estoque (CAIXA › Inventário).
// POST { senha, op, ... }  (senha = token de sessão sess_…). Permissão: módulo "transferencias" (ou diretoria/gerente).
//   op:'init'       {} → { lojas, categorias, subcategorias, inventarios, gestao, usuario }
//   op:'catalogo'   {} → { data:[{id,codigo,nome,categoriaId,subcategoriaId,fornecedor,gtin,custo,preco,unidade,contavel,estoque:{loja:qtd}}] }
//   op:'iniciar'    { lojaId, produtoIds[], nome?, cego?, obs?, categoriaIds? } → { inventario } (foto do saldo no início)
//   op:'abrir'      { id } → { inventario, leituras, catalogo? }   (catalogo só se em andamento)
//   op:'poll'       { id } → { sig }                               (assinatura das leituras, p/ vários aparelhos)
//   op:'ler'        { id, leituras:[{cid, codigo, qtd?}] } → { leituras (inseridas), sig }
//   op:'desfazer'   { id, seq } → { ok, sig }                       (anula uma leitura)
//   op:'concluir'   { id } → { relatorio }                          (resolve tudo no servidor com o saldo de agora)
//   op:'ajustar'    { id, produtoIds[] } → { ajustes }              (só diretoria/gerente; AJUSTE_INVENTARIO no Kardex)
//   op:'recontagem' { id } → { inventario }                         (nova contagem só com as divergências)
//   op:'cancelar'   { id } → { ok }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
// db-gateway v51: a sessão pode ter uma loja extra autorizada pela gerência (users[].sessoes[].lojaExtra)
function lojasDaSessao(u: any, token: string): string[] {
  const base: string[] = Array.isArray(u?.lojas) ? u.lojas.map(String) : [];
  const s = (Array.isArray(u?.sessoes) ? u.sessoes : []).find((x: any) => x && x.token === token);
  const e = s && s.lojaExtra;
  return e && e.id && Number(e.ate) > Date.now() && !base.includes(String(e.id)) ? [...base, String(e.id)] : base;
}
const ehGestao = (u: any) => u && (u.nivel === "diretoria" || u.nivel === "gerente");
function moduloAtivo(u: any, mod: string): boolean {
  const perm = u.permissoes;
  if (perm && perm[mod] && typeof perm[mod].ativo === "boolean") return perm[mod].ativo;
  if (ehGestao(u)) return true;
  if (u.nivel === "oficina") return ["os", "dashboard", "dp", "ia", "gravacoes"].includes(mod);
  return mod !== "config" || (perm && perm.config && perm.config.ativo === true);
}
const num = (v: any) => { const n = Number(v); return isFinite(n) ? n : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;

/* ---------- catálogo ---------- */
async function carregarProdutos(): Promise<any[]> {
  let todos: any[] = [];
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await admin.from("produtos_estoque").select("id,payload").order("id", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    todos = todos.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return todos.map((r: any) => {
    const p = r.payload || {};
    const estoque: Record<string, number> = {};
    for (const [k, v] of Object.entries(p.estoquePorLoja || {})) estoque[k] = num(v);
    return {
      id: r.id, codigo: String(p.codigoInterno || ""), nome: String(p.nome || ""),
      categoriaId: p.categoriaId || null, subcategoriaId: p.subcategoriaId || null,
      fornecedor: p.fornecedor || "", gtin: String(p.gtin || ""), custo: p.custo == null ? null : num(p.custo),
      preco: p.precoVenda == null ? null : num(p.precoVenda), unidade: p.unidade || "un", estoque,
      contavel: !/^serv/i.test(String(p.tipo || "")),   // "Serviço" não é peça física: saldo fictício, fora de qualquer contagem
    };
  });
}
async function carregarConfig(): Promise<any> {
  const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  return (data && data.payload) || {};
}
function indices(catalogo: any[]) {
  const porCodigo = new Map<string, any>(), porGtin = new Map<string, any>(), porId = new Map<string, any>();
  for (const p of catalogo) {
    porId.set(p.id, p);
    if (p.codigo) porCodigo.set(p.codigo.toUpperCase(), p);
    if (p.gtin) porGtin.set(p.gtin.toUpperCase(), p);
  }
  return { porCodigo, porGtin, porId };
}
/** Resolve o que foi lido/digitado para um produto: código interno, GTIN, id; "7" ou "000007" viram PRD000007. */
function resolver(bruto: string, ix: ReturnType<typeof indices>): any | null {
  const c = String(bruto || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!c) return null;
  if (ix.porCodigo.has(c)) return ix.porCodigo.get(c);
  if (ix.porGtin.has(c)) return ix.porGtin.get(c);
  if (ix.porId.has(c.toLowerCase())) return ix.porId.get(c.toLowerCase());
  const m = c.match(/PRD\d{3,}/);
  if (m && ix.porCodigo.has(m[0])) return ix.porCodigo.get(m[0]);
  if (/^\d{1,6}$/.test(c)) { const k = "PRD" + c.padStart(6, "0"); if (ix.porCodigo.has(k)) return ix.porCodigo.get(k); }
  return null;
}

/* ---------- relatório (acertos e falhas) ---------- */
function montarRelatorio(inv: any, leituras: any[], catalogo: any[], config: any, lojaNome: string) {
  const ix = indices(catalogo);
  const cats = (config.produtosOtica && config.produtosOtica.categorias) || [];
  const subs = (config.produtosOtica && config.produtosOtica.subcategorias) || [];
  const catNome = (id: string) => (cats.find((c: any) => c.id === id) || {}).nome || "";
  const subNome = (id: string) => (subs.find((c: any) => c.id === id) || {}).nome || "";
  const loja = inv.loja_id;
  const itens: { produtoId: string; esperado: number }[] = (inv.payload && inv.payload.itens) || [];
  const noEscopo = new Map<string, number>(itens.map((i) => [i.produtoId, num(i.esperado)]));

  const contado = new Map<string, number>();           // produto -> qtd lida
  const naoResolvidos = new Map<string, number>();      // código -> qtd
  for (const l of leituras) {
    if (l.anulada) continue;
    const p = resolver(l.codigo, ix);
    const q = num(l.qtd == null ? 1 : l.qtd);
    if (p) contado.set(p.id, (contado.get(p.id) || 0) + q);
    else { const k = String(l.codigo).trim().toUpperCase(); naoResolvidos.set(k, (naoResolvidos.get(k) || 0) + q); }
  }

  const linhas: any[] = [];
  for (const it of itens) {
    const p = ix.porId.get(it.produtoId);
    if (!p) continue;
    const atual = num(p.estoque[loja]);
    const c = contado.get(p.id) || 0;
    const diff = r2(c - atual);
    const status = diff === 0 ? "ok" : diff < 0 ? "falta" : "sobra";
    linhas.push({
      produtoId: p.id, codigo: p.codigo, nome: p.nome, categoriaId: p.categoriaId, categoria: catNome(p.categoriaId), subcategoria: subNome(p.subcategoriaId),
      esperadoInicio: num(it.esperado), esperado: atual, contado: c, diff, status,
      movimentado: atual !== num(it.esperado), custo: p.custo, preco: p.preco, unidade: p.unidade,
      motivo: status === "ok" ? "Conferido" : status === "falta" ? `Faltam ${-diff} (sistema ${atual}, contado ${c})` : `Sobram ${diff} (sistema ${atual}, contado ${c})`,
    });
  }
  const extras: any[] = [];
  for (const [pid, c] of contado) {
    if (noEscopo.has(pid)) continue;
    const p = ix.porId.get(pid)!;
    const saldoLoja = num(p.estoque[loja]);
    const outras = Object.entries(p.estoque).filter(([l, q]) => l !== loja && num(q) > 0).map(([l, q]) => `${l.replace("loja_", "").toUpperCase()}: ${q}`);
    let status = "vendido", motivo = "Consta como vendido / sem saldo nesta loja";
    if (!p.contavel) { status = "servico"; motivo = "Item de serviço — não entra no estoque"; }
    else if (saldoLoja > 0) { status = "fora_escopo"; motivo = "Tem saldo na loja, mas não estava na seleção desta contagem"; }
    else if (outras.length) { status = "outra_loja"; motivo = "Sem saldo nesta loja — consta em outra loja (" + outras.join(", ") + ")"; }
    extras.push({ produtoId: p.id, codigo: p.codigo, nome: p.nome, categoria: catNome(p.categoriaId), contado: c, esperado: saldoLoja, status, motivo, custo: p.custo, preco: p.preco });
  }
  for (const [cod, c] of naoResolvidos) extras.push({ produtoId: null, codigo: cod, nome: "", categoria: "", contado: c, esperado: 0, status: "nao_cadastrado", motivo: "Código não cadastrado no sistema", custo: null, preco: null });

  const val = (l: any, campo: "custo" | "preco") => (l[campo] == null ? 0 : l[campo]);
  const faltas = linhas.filter((l) => l.status === "falta"), sobras = linhas.filter((l) => l.status === "sobra");
  const itensEscopo = linhas.length;
  const ok = linhas.filter((l) => l.status === "ok").length;
  const total = (arr: any[], campo: "custo" | "preco", sinal = 1) => r2(arr.reduce((a, l) => a + Math.abs(l.diff) * val(l, campo) * sinal, 0));
  const ini = inv.created_at ? new Date(inv.created_at).getTime() : Date.now();
  const resumo = {
    itensEscopo, unidadesEsperadas: r2(linhas.reduce((a, l) => a + l.esperado, 0)), unidadesContadas: r2(linhas.reduce((a, l) => a + l.contado, 0)),
    ok, faltas: faltas.length, sobras: sobras.length,
    unidadesFalta: r2(faltas.reduce((a, l) => a + -l.diff, 0)), unidadesSobra: r2(sobras.reduce((a, l) => a + l.diff, 0)),
    vendidoLido: extras.filter((e) => e.status === "vendido").length, outraLoja: extras.filter((e) => e.status === "outra_loja").length,
    foraEscopo: extras.filter((e) => e.status === "fora_escopo").length, servico: extras.filter((e) => e.status === "servico").length, naoCadastrado: extras.filter((e) => e.status === "nao_cadastrado").length,
    acuracia: itensEscopo ? r2((ok / itensEscopo) * 100) : 0,
    valorFaltaCusto: total(faltas, "custo"), valorFaltaPreco: total(faltas, "preco"),
    valorSobraCusto: total(sobras, "custo"), valorSobraPreco: total(sobras, "preco"),
    movimentados: linhas.filter((l) => l.movimentado).length,
    totalLeituras: leituras.filter((l) => !l.anulada).reduce((a, l) => a + num(l.qtd == null ? 1 : l.qtd), 0),
    duracaoMin: Math.max(0, Math.round((Date.now() - ini) / 60000)),
  };
  return { geradoEm: new Date().toISOString(), loja, lojaNome, nome: inv.nome, resumo, linhas, extras };
}

/* ---------- ações ---------- */
const novoId = () => "inv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function carregarInv(id: string) {
  const { data, error } = await admin.from("inventarios").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
async function carregarLeituras(id: string) {
  let todas: any[] = [];
  for (let from = 0; from < 200000; from += 1000) {
    const { data, error } = await admin.from("inventario_leituras").select("seq,codigo,produto_id,por,em,anulada,qtd,cid").eq("inventario_id", id).order("seq", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    todas = todas.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return todas;
}
function assinatura(l: any[]) { return { n: l.length, max: l.reduce((a, x) => Math.max(a, x.seq), 0), anul: l.filter((x) => x.anulada).length }; }

async function criarInventario(user: any, lojaId: string, produtoIds: string[], opts: { nome?: string; cego?: boolean; obs?: string; categoriaIds?: string[] }, catalogo: any[], config: any) {
  const ix = indices(catalogo);
  const itens: any[] = [];
  for (const pid of new Set(produtoIds)) {
    const p = ix.porId.get(pid);
    const q = p && p.contavel ? num(p.estoque[lojaId]) : 0;
    if (p && q > 0) itens.push({ produtoId: pid, esperado: q });
  }
  if (!itens.length) return { erro: "Nenhum dos produtos escolhidos tem estoque nesta loja." };
  const lojaNome = ((config.lojas || []).find((l: any) => l.id === lojaId) || {}).nome || lojaId;
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const row = {
    id: novoId(), loja_id: lojaId, nome: (opts.nome || "").trim().slice(0, 80) || `Inventário ${lojaNome} ${hoje}`,
    status: "em_andamento", cego: !!opts.cego, criado_por: user.nome || "",
    payload: { itens, categoriaIds: opts.categoriaIds || [], obs: String(opts.obs || "").slice(0, 500) },
  };
  const { data, error } = await admin.from("inventarios").insert(row).select("*").single();
  if (error) throw error;
  return { inventario: data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    const config = await carregarConfig();
    const user = (Array.isArray(config.users) ? config.users : []).find((u: any) => sessaoValida(u, b.senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    if (!moduloAtivo(user, "transferencias")) return json({ error: "sem permissão para o inventário" }, 403);
    const gestao = ehGestao(user);
    const lojasUser: string[] = lojasDaSessao(user, b.senha);
    const lojaPermitida = (id: string) => gestao || lojasUser.includes(id);
    const lojasConfig = (config.lojas || []).filter((l: any) => l && !l.interna);
    const por = user.nome || "";

    if (b.op === "init") {
      const { data: invs, error } = await admin.from("inventarios").select("id,loja_id,nome,status,cego,criado_por,concluido_por,created_at,concluido_em,payload").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const inventarios = (invs || []).filter((i: any) => lojaPermitida(i.loja_id)).map((i: any) => ({
        id: i.id, lojaId: i.loja_id, nome: i.nome, status: i.status, cego: i.cego, criadoPor: i.criado_por, concluidoPor: i.concluido_por, criadoEm: i.created_at, concluidoEm: i.concluido_em,
        itens: ((i.payload && i.payload.itens) || []).length, resumo: i.payload && i.payload.relatorio ? i.payload.relatorio.resumo : null, ajustado: !!(i.payload && i.payload.ajustes && i.payload.ajustes.length),
      }));
      return json({
        ok: true, gestao, usuario: por,
        lojas: lojasConfig.filter((l: any) => lojaPermitida(l.id)).map((l: any) => ({ id: l.id, nome: l.nome, abrev: l.abrev || l.sigla || "" })),
        categorias: ((config.produtosOtica || {}).categorias || []).map((c: any) => ({ id: c.id, nome: c.nome })),
        subcategorias: ((config.produtosOtica || {}).subcategorias || []).map((c: any) => ({ id: c.id, nome: c.nome, categoriaId: c.categoriaId || null })),
        inventarios,
      });
    }
    if (b.op === "catalogo") return json({ ok: true, data: await carregarProdutos() });

    if (b.op === "iniciar") {
      const lojaId = String(b.lojaId || "");
      if (!lojasConfig.some((l: any) => l.id === lojaId)) return json({ error: "loja inválida" }, 400);
      if (!lojaPermitida(lojaId)) return json({ error: "sem acesso a esta loja" }, 403);
      const ids = Array.isArray(b.produtoIds) ? b.produtoIds.map(String).slice(0, 5000) : [];
      if (!ids.length) return json({ error: "Selecione ao menos um produto." }, 400);
      const r = await criarInventario(user, lojaId, ids, { nome: b.nome, cego: b.cego, obs: b.obs, categoriaIds: Array.isArray(b.categoriaIds) ? b.categoriaIds.slice(0, 100) : [] }, await carregarProdutos(), config);
      if ((r as any).erro) return json({ error: (r as any).erro }, 400);
      return json({ ok: true, ...r });
    }

    // daqui pra baixo, operações sobre um inventário existente
    const inv = b.id ? await carregarInv(String(b.id)) : null;
    if (!inv) return json({ error: "inventário não encontrado" }, 404);
    if (!lojaPermitida(inv.loja_id)) return json({ error: "sem acesso a esta loja" }, 403);

    if (b.op === "abrir") {
      const leituras = await carregarLeituras(inv.id);
      const out: any = { ok: true, inventario: inv, leituras, sig: assinatura(leituras) };
      if (inv.status === "em_andamento") out.catalogo = await carregarProdutos();
      return json(out);
    }
    if (b.op === "poll") return json({ ok: true, sig: assinatura(await carregarLeituras(inv.id)), status: inv.status });

    if (b.op === "ler") {
      if (inv.status !== "em_andamento") return json({ error: "Este inventário já foi " + (inv.status === "concluido" ? "concluído." : "cancelado.") }, 409);
      const lista = (Array.isArray(b.leituras) ? b.leituras : []).slice(0, 200).map((l: any) => ({
        inventario_id: inv.id, codigo: String(l.codigo || "").trim().toUpperCase().slice(0, 80), cid: l.cid ? String(l.cid).slice(0, 60) : null,
        qtd: l.qtd == null || !isFinite(Number(l.qtd)) || Number(l.qtd) === 0 ? 1 : Number(l.qtd), produto_id: l.produtoId ? String(l.produtoId).slice(0, 80) : null, por,
      })).filter((l: any) => l.codigo);
      if (lista.length) {
        const { error } = await admin.from("inventario_leituras").upsert(lista, { onConflict: "inventario_id,cid", ignoreDuplicates: true });
        if (error) throw error;
        await admin.from("inventarios").update({ updated_at: new Date().toISOString() }).eq("id", inv.id);
      }
      const todas = await carregarLeituras(inv.id);
      const cids = new Set(lista.map((l: any) => l.cid).filter(Boolean));
      return json({ ok: true, leituras: todas.filter((l) => l.cid && cids.has(l.cid)), sig: assinatura(todas) });
    }
    if (b.op === "desfazer") {
      if (inv.status !== "em_andamento") return json({ error: "inventário não está em andamento" }, 409);
      const { error } = await admin.from("inventario_leituras").update({ anulada: true, anulada_por: por }).eq("inventario_id", inv.id).eq("seq", Number(b.seq));
      if (error) throw error;
      return json({ ok: true, sig: assinatura(await carregarLeituras(inv.id)) });
    }
    if (b.op === "cancelar") {
      if (!gestao && inv.criado_por !== por) return json({ error: "só quem criou ou a gestão pode cancelar" }, 403);
      if (inv.status !== "em_andamento") return json({ error: "só dá para cancelar um inventário em andamento" }, 409);
      await admin.from("inventarios").update({ status: "cancelado", updated_at: new Date().toISOString() }).eq("id", inv.id);
      return json({ ok: true });
    }
    if (b.op === "concluir") {
      if (inv.status === "concluido") return json({ ok: true, relatorio: inv.payload.relatorio, jaConcluido: true });
      if (inv.status !== "em_andamento") return json({ error: "inventário cancelado" }, 409);
      const lojaNome = ((config.lojas || []).find((l: any) => l.id === inv.loja_id) || {}).nome || inv.loja_id;
      const relatorio = montarRelatorio(inv, await carregarLeituras(inv.id), await carregarProdutos(), config, lojaNome);
      const payload = { ...(inv.payload || {}), relatorio };
      const agora = new Date().toISOString();
      const { error } = await admin.from("inventarios").update({ status: "concluido", concluido_por: por, concluido_em: agora, updated_at: agora, payload }).eq("id", inv.id);
      if (error) throw error;
      return json({ ok: true, relatorio });
    }
    if (b.op === "ajustar") {
      if (!gestao) return json({ error: "só diretoria/gerente pode ajustar o estoque" }, 403);
      if (inv.status !== "concluido" || !inv.payload.relatorio) return json({ error: "conclua o inventário antes de ajustar" }, 409);
      const rel = inv.payload.relatorio;
      const jaFeitos = new Set(((inv.payload.ajustes as any[]) || []).map((a) => a.produtoId));
      const pedidos = new Set<string>((Array.isArray(b.produtoIds) ? b.produtoIds : []).map(String));
      const alvos: { produtoId: string; contado: number }[] = [];
      for (const l of rel.linhas) if (pedidos.has(l.produtoId) && l.status !== "ok") alvos.push({ produtoId: l.produtoId, contado: l.contado });
      for (const e of rel.extras) if (e.produtoId && pedidos.has(e.produtoId) && (e.status === "vendido" || e.status === "outra_loja")) alvos.push({ produtoId: e.produtoId, contado: e.contado });
      if (!alvos.length) return json({ error: "nenhum item elegível para ajuste" }, 400);
      const catalogo = await carregarProdutos(); const ix = indices(catalogo);
      const feitos: any[] = [], pulados: any[] = [];
      for (const a of alvos) {
        if (jaFeitos.has(a.produtoId)) { pulados.push({ produtoId: a.produtoId, motivo: "já ajustado" }); continue; }
        const p = ix.porId.get(a.produtoId); if (!p) continue;
        const atual = num(p.estoque[inv.loja_id]);
        const delta = r2(a.contado - atual);
        if (delta === 0) { pulados.push({ produtoId: a.produtoId, motivo: "saldo já igual" }); continue; }
        const { data, error } = await admin.rpc("registrar_movimento_estoque", {
          p_produto_id: a.produtoId, p_loja_id: inv.loja_id, p_tipo_movimento: "AJUSTE_INVENTARIO", p_quantidade: delta, p_usuario: por,
          p_referencia_id: inv.id, p_observacao: `Inventário "${inv.nome}": contado ${a.contado}, sistema ${atual}`,
        });
        if (error) throw error;
        feitos.push({ produtoId: a.produtoId, codigo: p.codigo, nome: p.nome, de: atual, para: data, delta, em: new Date().toISOString(), por });
      }
      const ajustes = [...((inv.payload.ajustes as any[]) || []), ...feitos];
      await admin.from("inventarios").update({ payload: { ...inv.payload, ajustes }, updated_at: new Date().toISOString() }).eq("id", inv.id);
      return json({ ok: true, ajustes: feitos, pulados });
    }
    if (b.op === "recontagem") {
      if (inv.status !== "concluido" || !inv.payload.relatorio) return json({ error: "conclua o inventário antes" }, 409);
      const ids = inv.payload.relatorio.linhas.filter((l: any) => l.status !== "ok").map((l: any) => l.produtoId);
      if (!ids.length) return json({ error: "Não há divergências para recontar." }, 400);
      const r = await criarInventario(user, inv.loja_id, ids, { nome: "Recontagem — " + inv.nome, cego: inv.cego, obs: "Recontagem das divergências de " + inv.id }, await carregarProdutos(), config);
      if ((r as any).erro) return json({ error: (r as any).erro }, 400);
      return json({ ok: true, ...r });
    }
    return json({ error: "op inválida" }, 400);
  } catch (e) { console.error(e); return json({ error: String((e as any)?.message || e) }, 500); }
});
