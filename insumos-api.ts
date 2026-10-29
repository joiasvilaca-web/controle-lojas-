// insumos-api v2 — card OFICINA: vias (O.S.) de todas as lojas + insumos (ouro, prata, cobre, pedras…).
// v2: ops vias / via / viaAtualizar. A Oficina atende todas as lojas, então vê as vias de todas,
// mas só pode mexer em: status (aguardando ⇄ oficina_pronto), local da peça (loja/fabrica) e
// observações internas (que a loja vê no Pedido; "avisar a loja" notifica quem é da loja da via).
// A Oficina não tem CNPJ: cada insumo PERTENCE a uma loja (quem comprou, dona fiscal) e fica
// em um de dois lugares: na própria loja (local "loja") ou em poder da Oficina (local "oficina").
// Saldo = soma das quantidades por (insumo, loja, local). Tudo é lançamento (Kardex): nada é
// apagado; corrigir = estornar (lança o movimento contrário).
//   COMPRA  +q  na loja dona (local escolhido; normalmente já "oficina")   [dados da nota]
//   ENVIO   −q loja/loja  +q loja/oficina                                  [par]
//   RETORNO −q loja/oficina +q loja/loja                                   [par]
//   CONSUMO −q loja-da-via/oficina — baixa de material numa via (O.S.), serviço ou fabricação
//   PERDA   −q ; AJUSTE ±q ; ESTORNO = contrário de um lançamento
// Sessão (sess_…) validada contra gestao_config, igual ao db-gateway.
// Permissão: módulo "insumos" com abas saldos / movimentos / cadastro / baixaVia.
// Ops: init, salvarInsumo, saldos, movimentos, lancar, consumoVia, estornar, vias, via, viaAtualizar
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
const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const ABAS = ["vias", "saldos", "movimentos", "cadastro", "baixaVia"];

/** Mesmo critério do app: o que foi salvo no acesso vale; sem nada salvo, padrão por nível. */
function permissoes(user: any) {
  const nivel = user.nivel || "vendedora";
  const padrao: Record<string, boolean> =
    nivel === "diretoria" || nivel === "gerente" ? { vias: true, saldos: true, movimentos: true, cadastro: true, baixaVia: true }
    : nivel === "oficina" ? { vias: true, saldos: true, movimentos: false, cadastro: false, baixaVia: true }
    : { vias: false, saldos: false, movimentos: false, cadastro: false, baixaVia: false };
  const ativoPadrao = nivel !== "vendedora";
  const m = user.permissoes && user.permissoes.insumos;
  const ativo = m && typeof m.ativo === "boolean" ? m.ativo : ativoPadrao;
  const out: Record<string, boolean> = { ativo };
  // aba salva no acesso vale; sem ela, o padrão do nível (com módulo ligado à mão numa vendedora, as abas salvas no DP decidem)
  for (const a of ABAS) out[a] = ativo && (m && m.abas && typeof m.abas[a] === "boolean" ? m.abas[a] : (ativoPadrao ? padrao[a] : !!(m && m.ativo)));
  return out;
}

async function todosMovimentos(filtro?: (q: any) => any) {
  const linhas: any[] = [];
  for (let de = 0; de < 200000; de += 1000) {
    let q = admin.from("insumos_movimentos").select("id,insumo_id,loja_id,local,tipo,quantidade,valor_unit").order("id", { ascending: true }).range(de, de + 999);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return linhas;
}
/** saldo[insumo][loja] = { loja, oficina, custoMedio } — custo médio pelas compras com valor. */
function montarSaldos(movs: any[]) {
  const s: Record<string, Record<string, any>> = {};
  for (const m of movs) {
    const a = (s[m.insumo_id] ||= {});
    const l = (a[m.loja_id] ||= { loja: 0, oficina: 0, _q: 0, _v: 0 });
    l[m.local] = Math.round((l[m.local] + Number(m.quantidade)) * 10000) / 10000;
    if (m.tipo === "COMPRA" && m.valor_unit != null && Number(m.quantidade) > 0) { l._q += Number(m.quantidade); l._v += Number(m.quantidade) * Number(m.valor_unit); }
  }
  for (const a of Object.values(s)) for (const l of Object.values(a)) { l.custoMedio = l._q > 0 ? Math.round((l._v / l._q) * 10000) / 10000 : null; delete l._q; delete l._v; }
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    const { data: cfgRow } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config = (cfgRow && cfgRow.payload) || {};
    const user = (config.users || []).find((u: any) => sessaoValida(u, b.senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    const perm = permissoes(user);
    if (!perm.ativo) return json({ error: "Seu acesso não tem o módulo Insumos." }, 403);
    const funcs: any[] = config.funcionarios || [];
    const f = funcs.find((x) => x.id === (user.funcionarioId || user.id));
    const quem = { id: user.funcionarioId || user.id, nome: (f && (String(f.apelido || "").trim() || f.nome)) || user.nome || "" };
    const lojas = (config.lojas || []).map((l: any) => ({ id: l.id, nome: l.nome, abreviacao: l.abreviacao, cor: l.cor, interna: !!l.interna }));
    const lojaValida = (id: string) => lojas.some((l: any) => l.id === id && !l.interna);
    const precisa = (aba: string) => { if (!perm[aba]) throw Object.assign(new Error("Seu acesso não permite esta ação em Insumos."), { status: 403 }); };
    const op = String(b.op || "");
    const p = b.params || {};

    const insumoExiste = async (id: string) => {
      const { data } = await admin.from("insumos").select("id,payload,ativo").eq("id", id).maybeSingle();
      return data;
    };
    const saldoDe = async (insumoId: string, lojaId: string, local: string) => {
      const movs = await todosMovimentos((q) => q.eq("insumo_id", insumoId).eq("loja_id", lojaId));
      const s = montarSaldos(movs);
      const l = (s[insumoId] && s[insumoId][lojaId]) || { loja: 0, oficina: 0, custoMedio: null };
      return { saldo: Number(l[local] || 0), custoMedio: l.custoMedio };
    };
    const inserir = async (rows: any[]) => {
      const { data, error } = await admin.from("insumos_movimentos").insert(rows).select("id");
      if (error) throw error;
      return data;
    };

    if (op === "init") {
      let q = admin.from("insumos").select("id,payload,ativo").order("id");
      if (!perm.cadastro) q = q.eq("ativo", true);
      const { data, error } = await q;
      if (error) throw error;
      return json({ ok: true, perm, lojas, insumos: (data || []).map((r: any) => ({ id: r.id, ativo: r.ativo, ...r.payload })) });
    }

    if (op === "salvarInsumo") {
      precisa("cadastro");
      const nome = texto(p.nome, 80).toUpperCase();
      if (!nome) return json({ error: "Informe o nome do insumo." }, 400);
      const unidade = ["g", "ct", "un"].includes(p.unidade) ? p.unidade : "g";
      const categoria = ["metal", "pedra", "outro"].includes(p.categoria) ? p.categoria : "outro";
      const payload: any = {
        nome, categoria, unidade,
        teor: texto(p.teor, 20), origemPedra: categoria === "pedra" ? (p.origemPedra === "natural" ? "natural" : "sintetica") : "",
        dimensoes: texto(p.dimensoes, 60), peso: isNaN(num(p.peso)) ? null : num(p.peso), quilates: isNaN(num(p.quilates)) ? null : num(p.quilates),
        ncm: texto(p.ncm, 10).replace(/\D/g, ""), custoRef: isNaN(num(p.custoRef)) ? null : num(p.custoRef), obs: texto(p.obs, 300),
      };
      const id = p.id ? texto(p.id, 60) : "ins_" + crypto.randomUUID().slice(0, 8);
      const { error } = await admin.from("insumos").upsert({ id, payload, ativo: p.ativo !== false, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true, id });
    }

    if (op === "saldos") {
      precisa("saldos");
      return json({ ok: true, saldos: montarSaldos(await todosMovimentos()) });
    }

    if (op === "movimentos") {
      if (!perm.saldos && !perm.movimentos && !perm.baixaVia) precisa("saldos");
      let q = admin.from("insumos_movimentos").select("*").order("id", { ascending: false }).limit(Math.min(Number(p.limite) || 300, 1000));
      if (p.osId) q = q.eq("os_id", texto(p.osId, 80));
      else if (!perm.saldos && !perm.movimentos) return json({ error: "Sem acesso aos movimentos." }, 403);
      if (p.insumoId) q = q.eq("insumo_id", texto(p.insumoId, 60));
      if (p.lojaId) q = q.eq("loja_id", texto(p.lojaId, 60));
      if (p.tipo) q = q.eq("tipo", texto(p.tipo, 20));
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(p.de || ""))) q = q.gte("created_at", p.de + "T00:00:00-03:00");
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(p.ate || ""))) q = q.lte("created_at", p.ate + "T23:59:59-03:00");
      const { data, error } = await q;
      if (error) throw error;
      return json({ ok: true, movimentos: data || [] });
    }

    if (op === "lancar") {
      precisa("movimentos");
      const tipo = String(p.tipo || "");
      if (!["COMPRA", "ENVIO", "RETORNO", "PERDA", "AJUSTE"].includes(tipo)) return json({ error: "Tipo de lançamento inválido." }, 400);
      const ins = await insumoExiste(texto(p.insumoId, 60));
      if (!ins) return json({ error: "Insumo não encontrado." }, 400);
      const lojaId = texto(p.lojaId, 60);
      if (!lojaValida(lojaId)) return json({ error: "Escolha a loja dona do insumo (a Oficina não é dona de estoque)." }, 400);
      let q = num(p.quantidade);
      if (!(q > 0)) return json({ error: "Informe uma quantidade maior que zero." }, 400);
      q = Math.round(q * 10000) / 10000;
      const local = p.local === "loja" ? "loja" : "oficina";
      const base = { insumo_id: ins.id, loja_id: lojaId };
      const pl = { por: quem, obs: texto(p.obs, 300) };
      const conferir = async (lugar: string) => {
        const { saldo } = await saldoDe(ins.id, lojaId, lugar);
        if (saldo < q && p.forcar !== true) throw Object.assign(new Error(`Saldo insuficiente (${saldo} ${ins.payload.unidade || ""} ${lugar === "oficina" ? "na Oficina" : "na loja"}).`), { status: 409, saldo });
      };
      if (tipo === "COMPRA") {
        const v = num(p.valorUnit);
        const fiscal = { fornecedor: texto(p.fornecedor, 120), cnpjFornecedor: texto(p.cnpjFornecedor, 20), nf: texto(p.nf, 20), chave: texto(p.chave, 44).replace(/\D/g, ""), cfop: texto(p.cfop, 6), dataNota: /^\d{4}-\d{2}-\d{2}$/.test(String(p.dataNota || "")) ? p.dataNota : null };
        const r = await inserir([{ ...base, local, tipo, quantidade: q, valor_unit: isNaN(v) ? null : v, payload: { ...pl, fiscal } }]);
        return json({ ok: true, ids: r.map((x: any) => x.id) });
      }
      if (tipo === "ENVIO" || tipo === "RETORNO") {
        const de = tipo === "ENVIO" ? "loja" : "oficina", para = tipo === "ENVIO" ? "oficina" : "loja";
        await conferir(de);
        const par = crypto.randomUUID();
        const r = await inserir([
          { ...base, local: de, tipo, quantidade: -q, payload: { ...pl, par } },
          { ...base, local: para, tipo, quantidade: q, payload: { ...pl, par } },
        ]);
        return json({ ok: true, ids: r.map((x: any) => x.id) });
      }
      if (tipo === "PERDA") {
        await conferir(local);
        const r = await inserir([{ ...base, local, tipo, quantidade: -q, payload: pl }]);
        return json({ ok: true, ids: r.map((x: any) => x.id) });
      }
      // AJUSTE: sinal escolhido na tela (inventário)
      const sinal = p.sinal === "-" ? -1 : 1;
      if (sinal < 0) await conferir(local);
      const r = await inserir([{ ...base, local, tipo, quantidade: sinal * q, payload: pl }]);
      return json({ ok: true, ids: r.map((x: any) => x.id) });
    }

    if (op === "consumoVia") {
      precisa("baixaVia");
      const osId = texto(p.osId, 80);
      const { data: os } = await admin.from("ordens_servico").select("id,payload").eq("id", osId).maybeSingle();
      if (!os) return json({ error: "Via (O.S.) não encontrada." }, 404);
      const lojaId = os.payload && os.payload.lojaId;
      if (!lojaValida(lojaId)) return json({ error: "A via não tem uma loja válida — o material sai do estoque da loja da via." }, 400);
      const codigoVia = (os.payload && (os.payload.codigoVia || os.payload.via)) || "";
      const itens = Array.isArray(p.itens) ? p.itens.slice(0, 30) : [];
      if (!itens.length) return json({ error: "Informe ao menos um insumo." }, 400);
      const rows: any[] = [];
      const faltas: string[] = [];
      for (const it of itens) {
        const ins = await insumoExiste(texto(it.insumoId, 60));
        if (!ins) return json({ error: "Insumo não encontrado." }, 400);
        let q = num(it.quantidade);
        if (!(q > 0)) return json({ error: `Quantidade inválida para ${ins.payload.nome}.` }, 400);
        q = Math.round(q * 10000) / 10000;
        const { saldo, custoMedio } = await saldoDe(ins.id, lojaId, "oficina");
        if (saldo < q) faltas.push(`${ins.payload.nome}: saldo na Oficina ${saldo} ${ins.payload.unidade || ""}`);
        rows.push({ insumo_id: ins.id, loja_id: lojaId, local: "oficina", tipo: "CONSUMO", quantidade: -q, valor_unit: custoMedio,
          os_id: os.id, codigo_via: codigoVia, finalidade: it.finalidade === "fabricacao" ? "fabricacao" : "servico",
          payload: { por: quem, obs: texto(it.obs, 300), tipoOrdem: (os.payload && os.payload.serviceTypeName) || "" } });
      }
      if (faltas.length && p.forcar !== true) return json({ error: "Saldo insuficiente na Oficina para a loja da via.", faltas }, 409);
      const r = await inserir(rows);
      return json({ ok: true, ids: r.map((x: any) => x.id) });
    }

    if (op === "estornar") {
      const id = Number(p.id);
      const { data: m } = await admin.from("insumos_movimentos").select("*").eq("id", id).maybeSingle();
      if (!m) return json({ error: "Lançamento não encontrado." }, 404);
      precisa(m.tipo === "CONSUMO" ? "baixaVia" : "movimentos");
      if (m.tipo === "ESTORNO") return json({ error: "Um estorno não pode ser estornado." }, 400);
      // movimentos em par (envio/retorno) são estornados juntos
      let alvo: any[] = [m];
      if (m.payload && m.payload.par) {
        const { data } = await admin.from("insumos_movimentos").select("*").eq("payload->>par", m.payload.par);
        alvo = data || [m];
      }
      if (alvo.some((x) => x.payload && x.payload.estornado)) return json({ error: "Esse lançamento já foi estornado." }, 409);
      const motivo = texto(p.motivo, 200);
      const rows = alvo.map((x) => ({ insumo_id: x.insumo_id, loja_id: x.loja_id, local: x.local, tipo: "ESTORNO", quantidade: -Number(x.quantidade), valor_unit: x.valor_unit,
        os_id: x.os_id, codigo_via: x.codigo_via, finalidade: x.finalidade, ref_id: x.id, payload: { por: quem, obs: motivo, tipoOriginal: x.tipo } }));
      await inserir(rows);
      for (const x of alvo) await admin.from("insumos_movimentos").update({ payload: { ...(x.payload || {}), estornado: true, estornadoPor: quem, estornadoEm: new Date().toISOString() } }).eq("id", x.id);
      return json({ ok: true });
    }

    /* ---------- VIAS (O.S.) ---------- */
    const STATUS_VIA = ["rascunho", "aguardando", "oficina_pronto", "pronto", "entregue", "cancelado"];
    const resumoVia = (r: any) => {
      const o = r.payload || {};
      const obs = Array.isArray(o.observacoes) ? o.observacoes : [];
      return { id: r.id, codigoVia: o.codigoVia || o.via || "", cliente: o.cliente || "", lojaId: o.lojaId || "", serviceTypeId: o.serviceTypeId || "",
        serviceTypeName: o.serviceTypeName || "", data: o.data || "", status: o.status || "", descricao: o.descricao || "", localAtual: o.localAtual || "loja",
        criadoEm: o.criadoEm || null, vendedora: o.vendedora || "", itens: (Array.isArray(o.itens) ? o.itens : []).map((i: any) => ({ descricao: i.descricao || i.produtoNome || i.nome || "", qtd: i.qtd || i.quantidade || 1 })),
        fotos: (Array.isArray(o.fotos) ? o.fotos : []).map((f: any) => f && (f.driveUrl || f.url || f.thumb) || null).filter(Boolean).slice(0, 8),
        observacoes: obs.map((x: any) => ({ id: x.id, nome: x.nome, descricao: x.descricao, criadoEm: x.criadoEm, ciente: !!x.ciente, cienteNome: x.cienteNome || null, avisaLoja: (x.notificarPara || []).length > 0, origem: x.origem || "" })),
        historicoOficina: Array.isArray(o.historicoOficina) ? o.historicoOficina.slice(-20) : [] };
    };
    if (op === "vias") {
      precisa("vias");
      const status = (Array.isArray(p.status) ? p.status : ["aguardando", "oficina_pronto"]).filter((x: string) => STATUS_VIA.includes(x));
      let q = admin.from("ordens_servico").select("id,payload").order("updated_at", { ascending: false, nullsFirst: false }).limit(800);
      if (status.length) q = q.in("payload->>status", status);
      if (p.lojaId) q = q.eq("payload->>lojaId", texto(p.lojaId, 60));
      if (p.serviceTypeId) q = q.eq("payload->>serviceTypeId", texto(p.serviceTypeId, 60));
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(p.de || ""))) q = q.gte("payload->>data", p.de);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(p.ate || ""))) q = q.lte("payload->>data", p.ate);
      const { data, error } = await q;
      if (error) throw error;
      let lista = (data || []).map(resumoVia);
      const busca = texto(p.busca, 60).toUpperCase();
      if (busca) lista = lista.filter((v: any) => (v.codigoVia + " " + v.cliente + " " + v.descricao).toUpperCase().includes(busca));
      lista.sort((a: any, b: any) => String(a.data || "9999").localeCompare(String(b.data || "9999")));
      return json({ ok: true, vias: lista, tipos: (config.tiposServico || []).map((t: any) => ({ id: t.id, nome: t.nome })) });
    }
    if (op === "via") {
      precisa("vias");
      let row: any = null;
      if (p.id) { const { data } = await admin.from("ordens_servico").select("id,payload").eq("id", texto(p.id, 80)).maybeSingle(); row = data; }
      else if (p.codigo) {
        // leitor: código da via (ex. MC12P) — aceita com ou sem espaços/minúsculas
        const cod = texto(p.codigo, 40).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
        if (!cod) return json({ error: "Código vazio." }, 400);
        const { data } = await admin.from("ordens_servico").select("id,payload").or(`payload->>codigoVia.eq.${cod},payload->>via.eq.${cod},id.eq.${cod}`).limit(1);
        row = data && data[0];
      }
      if (!row) return json({ error: "Via não encontrada." }, 404);
      return json({ ok: true, via: resumoVia(row) });
    }
    if (op === "viaAtualizar") {
      precisa("vias");
      const id = texto(p.id, 80);
      const { data: row } = await admin.from("ordens_servico").select("id,payload").eq("id", id).maybeSingle();
      if (!row) return json({ error: "Via não encontrada." }, 404);
      const o = row.payload || {};
      const agora = Date.now();
      const hist = Array.isArray(o.historicoOficina) ? o.historicoOficina : [];
      const mudou: string[] = [];
      if (p.status !== undefined && p.status !== o.status) {
        // a Oficina só alterna entre Aguardando e Oficina pronto; pronto/entregue/cancelado são da loja
        if (!["aguardando", "oficina_pronto"].includes(p.status) || !["aguardando", "oficina_pronto"].includes(o.status))
          return json({ error: "Pela Oficina, a via só alterna entre Aguardando e Oficina pronto." }, 400);
        hist.push({ em: agora, por: quem.nome, de: o.status, para: p.status });
        o.status = p.status; mudou.push("status");
      }
      if (p.localAtual !== undefined && ["loja", "fabrica"].includes(p.localAtual) && p.localAtual !== (o.localAtual || "loja")) {
        o.localAtual = p.localAtual;
        o.historicoLocal = Array.isArray(o.historicoLocal) ? o.historicoLocal : [];
        o.historicoLocal.push({ local: p.localAtual, em: agora, por: quem.nome });
        mudou.push("local");
      }
      const txt = texto(p.observacao, 1000).toUpperCase();
      if (txt) {
        const lojaVia = o.lojaId;
        const avisar = p.avisarLoja === true
          ? (config.users || []).filter((u: any) => !u.bloqueado && (u.nivel === "vendedora" || u.nivel === "gerente") && Array.isArray(u.lojas) && u.lojas.includes(lojaVia)).map((u: any) => u.id)
          : [];
        o.observacoes = Array.isArray(o.observacoes) ? o.observacoes : [];
        o.observacoes.push({ id: "obs_" + crypto.randomUUID().slice(0, 12), nome: quem.nome, descricao: "[OFICINA] " + txt,
          notificarPara: avisar, criadoEm: agora, ciente: false, cienteNome: null, cienteEm: null, fotos: [], origem: "oficina" });
        mudou.push(avisar.length ? "observação (loja avisada)" : "observação");
      }
      if (!mudou.length) return json({ ok: true, via: resumoVia(row), nada: true });
      o.historicoOficina = hist.slice(-50);
      const { error } = await admin.from("ordens_servico").update({ payload: o, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return json({ ok: true, mudou, via: resumoVia({ id, payload: o }) });
    }

    return json({ error: "operação desconhecida" }, 400);
  } catch (e: any) {
    console.error(e);
    return json({ error: String((e && (e.message || e.error_description)) || JSON.stringify(e)), saldo: e && e.saldo }, (e && e.status) || 500);
  }
});
