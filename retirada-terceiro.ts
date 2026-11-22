import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

/**
 * 22/11: `comprovante` = HISTÓRICO COMPLETO da via (também pagamentos, status da Oficina, local, avisos, mensagens, prazo de retirada/abandono e fila de disparo).
 * Retirada da via na loja (v4, 09/11; 08/11: ação `achar` = busca a via pelo código do cliente).
 * - CÓDIGO ROTATIVO (6 dígitos, muda a cada 60 s): o cliente vê no link da via; a loja só entrega com ele.
 *   Não é gravado: sai de um HMAC (chave do servidor + via + janela de tempo). Vale a janela atual e a anterior.
 * - TERCEIRO: o cliente informa o NOME de quem vai buscar e gera um código (4 caracteres) que vale 24 HORAS (ou até o cliente cancelar); depois gera outro.
 * - Cliente (link público): `estado`, `rotativo`, `gerar` (com nome do portador).
 * - Equipe (sessão do app): `historico`, `validar`, `concluir` (grava quem recebeu), `semcodigo` (só gerente/diretoria, com motivo),
 *   `invalidar`, `habilitar` (mantido por compatibilidade).
 * O código fixo de terceiro nunca é gravado (só HMAC). Tentativas erradas bloqueiam.
 */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ALFA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I
const MAX_TENTATIVAS = 5;
const PERIODO = 60;            // segundos que cada código rotativo dura
const MAX_ERROS_ROT = 8;       // erros seguidos do código rotativo antes de travar
const TRAVA_MIN = 10;          // minutos de trava
const VALIDADE_TERCEIRO_MS = 24 * 60 * 60 * 1000;   // o código de terceiro vale 24 horas; depois o cliente gera outro
const TABELA: Record<string, string> = { os: "ordens_servico", venda: "vendas_pdv", orc: "orcamentos", res: "reservas" };

let HMAC_KEY: CryptoKey | null = null;
async function hmac(txt: string) {
  const key = HMAC_KEY || (HMAC_KEY = await crypto.subtle.importKey("raw", new TextEncoder().encode(SERVICE_ROLE_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Código de terceiro: 6 dígitos DERIVADOS (via + momento em que foi gerado), assim o cliente pode ver de novo enquanto valer.
async function codigoTerceiro(tipo: string, id: string, geradoMs: number) {
  const h = await hmac("terc:" + tipo + ":" + id + ":" + geradoMs);
  return String(parseInt(h.slice(0, 8), 16) % 1000000).padStart(6, "0");
}
async function terceiroAtual(tipo: string, id: string, reg: any) {
  if (!reg || reg.status !== "ativo" || reg.code_hash !== "derivado" || !reg.gerado_em) return null;
  const t = new Date(reg.gerado_em).getTime();
  if (Date.now() - t > VALIDADE_TERCEIRO_MS) return null;
  return await codigoTerceiro(tipo, id, t);
}
const norm = (c: unknown) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const janelaAtual = () => Math.floor(Date.now() / 1000 / PERIODO);
async function codigoRotativo(tipo: string, id: string, janela: number) {
  const h = await hmac("rot:" + tipo + ":" + id + ":" + janela);
  return String(parseInt(h.slice(0, 8), 16) % 1000000).padStart(6, "0");
}

async function staff(senha: string) {
  if (!senha) return null;
  try {
    const r = await fetch(SUPABASE_URL + "/functions/v1/db-gateway", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: "Bearer " + ANON_KEY },
      body: JSON.stringify({ op: "validarSessao", senha }),
    });
    const j = await r.json();
    return j && j.ok && j.user ? j.user : null;
  } catch (_e) { return null; }
}
// 22/11: eventos guardados no próprio registro da via (pedido, venda, orçamento, reserva) para o Histórico da via.
const ST_NOME: Record<string, string> = { rascunho: "RASCUNHO", aguardando: "APROVADO", enviado_fabrica: "ENVIADO P/ FÁBRICA", em_producao: "EM PRODUÇÃO", pendencia: "PENDÊNCIA", oficina_pronto: "LIBERADO FÁBRICA", pronto: "DISPONÍVEL PARA RETIRADA", entregue: "ENTREGUE", cancelado: "CANCELADO", abandonada: "ABANDONADA" };
const isoDe = (x: any) => { if (x == null || x === "") return null; const n = typeof x === "number" ? x : (/^\d+$/.test(String(x)) ? Number(x) : Date.parse(String(x))); return isFinite(n) ? new Date(n).toISOString() : null; };
const brl = (v: any) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function eventosDoRegistro(v: any): any[] {
  const ev: any[] = []; if (!v) return ev;
  const push = (em: any, tipo: string, quem: any, texto: string) => { const i = isoDe(em); if (i) ev.push({ em: i, tipo, quem: String(quem || ""), texto }); };
  for (const p of (Array.isArray(v.pagamentos) ? v.pagamentos : [])) {
    if (!p || p._modo === "editar") continue;
    const nm = p.formaNome || p.forma || ({ __fiado: "SALDO PARA DEPOIS (FIADO)", __credito: "CRÉDITO DO CLIENTE", __cashback: "CASHBACK" } as any)[p.formaId] || p.formaId || "pagamento";
    push(p.data ? String(p.data).length <= 10 ? p.data + "T12:00:00-03:00" : p.data : (v.criadoEm || null), "pagamento", p.por || p.usuario || "", "Pagamento: " + nm + " " + brl(p.valor) + (p.parcelas > 1 ? " em " + p.parcelas + "x" : "") + (Number(p.creditoOuro) > 0 ? " (crédito de ouro " + brl(p.creditoOuro) + ")" : ""));
  }
  for (const h of (Array.isArray(v.historicoOficina) ? v.historicoOficina : [])) push(h.em, "status", h.por, "Oficina mudou o status: " + (ST_NOME[h.de] || h.de || "—") + " → " + (ST_NOME[h.para] || h.para || "—"));
  for (const h of (Array.isArray(v.historicoLocal) ? v.historicoLocal : [])) push(h.em, "local", h.por, "Local da peça: " + String(h.local || "—").toUpperCase());
  for (const a of (Array.isArray(v.acoesLog) ? v.acoesLog : [])) if (a) push(a.em, a.via === "whatsapp" ? "disparo" : "acao", a.auto ? "sistema" : a.por, (a.nome || a.passo || a.acao || "ação") + (a.via ? " — " + a.via : "") + (a.auto ? " (automático)" : ""));
  for (const o of (Array.isArray(v.observacoes) ? v.observacoes : [])) {
    if (!o) continue;
    push(o.criadoEm, "aviso", o.nome, "Aviso interno: " + String(o.descricao || "").slice(0, 200) + (o.recado ? " (recado ao cliente)" : ""));
    if (o.ciente) push(o.cienteEm, "aviso", o.cienteNome, "Ciente do aviso interno");
  }
  for (const h of (Array.isArray(v.historico) ? v.historico : [])) if (h && h.acao) push(h.em, "acao", h.por, String(h.acao));
  const ab = v.abandono || null;
  if (ab) {
    if (ab.base) push(ab.base, "prazo", "sistema", "Prazo de retirada começou a contar (pedido " + (Number(ab.pago) > 0 ? "com pagamento: 60 dias" : "sem pagamento: 30 dias") + ")");
    for (const [k, quando] of Object.entries(ab.etapas || {})) push(quando, k.startsWith("cliente") ? "disparo" : "aviso", "sistema", ({ cliente_lembrete: "Aviso ao cliente: lembrete do prazo de retirada", cliente_final: "Aviso ao cliente: prazo vencido, peça vai para desmanche", equipe: "Aviso à vendedora e gerentes: recolher a via e lançar ABANDONADA", diretoria: "Aviso à diretoria: cobrar da loja a retirada da via" } as any)[k] || k);
    if (ab.em) push(ab.em, "status", ab.por, "Via ABANDONADA: pago " + brl(ab.pago) + " − taxa de perda " + brl(ab.taxa) + " = crédito ao cliente " + brl(ab.credito) + (Number(ab.creditoOuro) > 0 ? " (crédito de ouro " + brl(ab.creditoOuro) + " não volta: o ouro retorna à diretoria)" : ""));
  }
  if (v.recebidoEm) push(v.recebidoEm, "status", v.recebidoPor, "Entregue ao cliente");
  if (v.canceladoEm) push(v.canceladoEm, "status", v.canceladoPor, "Cancelada" + (v.motivoCancelamento ? " — motivo: " + v.motivoCancelamento : ""));
  if (v.posVendaEnviadoEm) push(v.posVendaEnviadoEm, "disparo", v.posVendaPor || "sistema", "Pós-venda enviado");
  for (const [k, quando] of Object.entries((v.msgEnviadas && typeof v.msgEnviadas === "object") ? v.msgEnviadas : {})) push(quando, "disparo", "", "Mensagem marcada como enviada: " + (ST_NOME[k] || k));
  return ev;
}
async function lerVia(tipo: string, id: string) {
  const t = TABELA[tipo];
  if (!t) return null;
  const { data } = await admin.from(t).select("payload").eq("id", id).maybeSingle();
  return data ? data.payload : null;
}
function saldoDe(tipo: string, v: any) {
  if (!v || tipo === "orc") return 0;
  const total = Number(v.valorTotal) || 0;
  const pago = (Array.isArray(v.pagamentos) ? v.pagamentos : [])
    .filter((p: any) => p && p.formaId !== "__fiado" && p.formaId !== "__credito")
    .reduce((a: number, p: any) => a + (Number(p.valor) || 0), 0);
  return Math.max(0, Math.round((total - pago) * 100) / 100);
}
async function lojaInfo(lojaId: string) {
  if (!lojaId) return { nome: null as string | null, google: null as string | null };
  try {
    const { data: cfg } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const l = ((cfg && cfg.payload && cfg.payload.lojas) || []).find((x: any) => x && x.id === lojaId);
    return l ? { nome: l.nomePublico || l.nomeFantasia || l.nome || null, google: l.googleReviewUrl || null } : { nome: null, google: null };
  } catch (_e) { return { nome: null, google: null }; }
}
const lojaNome = async (lojaId: string) => (await lojaInfo(lojaId)).nome;

// ---------- ORÇAMENTO RECUSADO: "O QUE PODEMOS MELHORAR?" (18/11) ----------
// O cliente que não fechou conta o motivo no link do orçamento (payload.melhoria = {texto, motivos[], em, lida, resposta{texto,por,em}}).
// Gravação atômica pela função SQL orc_melhoria_gravar (um UPDATE só). A equipe vê (o orçamento já traz payload.melhoria) e responde no card Orçamento (melhoriaResponder / melhoriaLida); o cliente lê a resposta ao reabrir o link.
const MOTIVOS_MELHORIA = ["preco", "prazo", "modelo", "atendimento", "qualidade", "outra_loja", "desistiu", "outro"];
const melhoriaAberta = (tipo: string, via: any) => tipo === "orc" && via && (via.status === "recusado" || via.status === "vencido");
function melhoriaInfo(tipo: string, via: any) {
  const m = via && via.melhoria;
  return { disponivel: melhoriaAberta(tipo, via) && !m, feita: !!m, resposta: m && m.resposta ? { texto: m.resposta.texto, em: m.resposta.em } : null, em: m ? m.em : null };
}
function lojasDoUsuario(u: any): Set<string> { return new Set<string>([...(Array.isArray(u && u.lojas) ? u.lojas : []).map(String), ...(u && u.lojaExtra && u.lojaExtra.id ? [String(u.lojaExtra.id)] : [])]); }
const veTodasLojas = (u: any) => nivelDe(u) === "diretoria" || nivelDe(u) === "oficina";

// ---------- AVALIAÇÃO DO ATENDIMENTO (09/11) ----------
const AVAL_DESDE = Date.parse("2026-11-08T00:00:00-03:00");   // só vias criadas a partir daqui perguntam
const semAcento = (t: unknown) => String(t || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).join(" ");
const nivelDe = (u: any) => String(u && u.nivel || "").toLowerCase();
const gerencia = (u: any) => nivelDe(u) === "diretoria" || nivelDe(u) === "gerente";
async function lerAval(tipo: string, id: string) {
  const { data } = await admin.from("avaliacoes_cliente").select("*").eq("id", tipo + ":" + id).maybeSingle();
  return data;
}
async function avalInfo(tipo: string, id: string, via: any) {
  const a = await lerAval(tipo, id);
  const criado = Number(via.criadoEm) || 0;
  const elegivel = criado >= AVAL_DESDE || (!criado && String(via.data || "") >= "2026-11-08");
  const li = await lojaInfo(via.lojaId);
  return {
    pendente: !a && elegivel && via.status !== "cancelado" && via.status !== "cancelada" && via.status !== "abandonada",
    feita: !!a, estrelas: a ? a.estrelas : null,
    resposta: a && a.resposta ? { texto: a.resposta.texto, em: a.resposta.em } : null,
    // 22/11 (Felipe): a avaliação do ATENDIMENTO vem na 1ª abertura (junto da 1ª mensagem); o GOOGLE só no PEDIDO ENTREGUE
    // (na venda o Google vai no botão da mensagem de pós-venda). Por isso o link só devolve o Google do pedido entregue.
    google: tipo === "os" && via.status === "entregue" ? li.google : null, status: String(via.status || ""), loja: li.nome, atendente: via.vendedora || via.criadoPor || "",
  };
}
async function lerReg(tipo: string, id: string) {
  const { data } = await admin.from("retiradas_terceiro").select("*").eq("id", tipo + ":" + id).maybeSingle();
  return data;
}
async function gravar(tipo: string, id: string, patch: Record<string, unknown>, evento?: Record<string, unknown>) {
  const atual = await lerReg(tipo, id);
  const hist = Array.isArray(atual?.historico) ? atual.historico : [];
  if (evento) hist.push({ ...evento, em: new Date().toISOString() });
  const row = { id: tipo + ":" + id, tipo, ref_id: id, ...(atual || {}), ...patch, historico: hist, updated_at: new Date().toISOString() };
  const { error } = await admin.from("retiradas_terceiro").upsert(row);
  if (error) throw error;
  return row;
}
function publico(reg: any) {
  if (!reg) return { habilitada: true, status: "sem_codigo" };
  return {
    habilitada: true, status: reg.status, geradoEm: reg.gerado_em, usadoEm: reg.usado_em, usadoPor: reg.usado_por, loja: reg.loja, motivo: reg.motivo,
    expiraEm: reg.gerado_em && reg.status === "ativo" ? new Date(new Date(reg.gerado_em).getTime() + VALIDADE_TERCEIRO_MS).toISOString() : null,
    portador: reg.portador_nome || null, recebidoPor: reg.recebido_por || null, metodo: reg.metodo || null,
  };
}
function resumoVia(tipo: string, v: any, loja: string | null) {
  const itens = (Array.isArray(v.itens) ? v.itens : []).filter((it: any) => it && it._modo !== "editar").map((it: any) => ({
    nome: it.produto || it.nome || "Item", qtd: Number(it.quantidade) || 1,
    valor: Number(it.valorUnitario ?? it.valor) || 0, original: Number(it.precoOriginal) || null,
    produtoId: it.produtoEstoqueId || null, obs: String(it.observacaoItem || "").slice(0, 300),
    fotos: (Array.isArray(it.fotos) ? it.fotos : []).map((f: any) => f && (f.driveUrl || f.siteUrl || f.url)).filter((u: any) => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 4),
  }));
  return {
    tipo, deixouPeca: tipo === "orc" ? (Array.isArray(v.itens) ? v.itens : []).some((it: any) => it && it.deixouPeca === "sim") : undefined,
    cliente: v.cliente || "", loja, data: v.data || null, via: v.codigoVia || v.via || v.numero || null,
    status: v.status || null, itens, total: Number(v.valorTotal) || itens.reduce((a: number, i: any) => a + i.valor * i.qtd, 0),
    pago: tipo === "orc" ? 0 : (Number(v.valorTotal) || 0) - saldoDe(tipo, v), saldo: saldoDe(tipo, v),
    observacao: v.observacaoGeral || v.descricao || null, validade: v.validade || null,
  };
}
/** Orçamento: acrescenta as fotos do catálogo (produtos_estoque.fotos) aos itens do resumo público (até 4 por item), para o cliente ver o orçamento completo. */
async function comFotos(res: any) {
  try {
    if (res.tipo !== "orc") { for (const it of res.itens) delete it.produtoId; return res; }
    const ids = [...new Set(res.itens.map((i: any) => i.produtoId).filter(Boolean))] as string[];
    if (ids.length) {
      const { data } = await admin.from("produtos_estoque").select("id,payload").in("id", ids);
      const mapa: Record<string, string[]> = {};
      for (const r of (data || [])) {
        const fs = Array.isArray(r.payload && r.payload.fotos) ? r.payload.fotos : [];
        mapa[r.id] = fs.filter((f: any) => f && (f.tipo === "foto" || !f.tipo)).map((f: any) => f.siteUrl || f.driveUrl || f.url).filter((u: any) => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 4);
      }
      for (const it of res.itens) if (!it.fotos.length && it.produtoId && mapa[it.produtoId]) it.fotos = mapa[it.produtoId];
    }
    for (const it of res.itens) delete it.produtoId;
  } catch (_) { for (const it of res.itens) delete it.produtoId; }
  return res;
}
// "Ciente": comprovante de que o cliente viu a via NESTE status (e de novo quando o status muda ou a via é retirada).
const cienteChave = (via: any, reg: any) => String(via.status || "ativa") + (reg && reg.status === "usado" ? "|retirada" : "");
function cienteInfo(via: any, reg: any) {
  const chave = cienteChave(via, reg);
  const l = (Array.isArray(via.leituras) ? via.leituras : []).find((x: any) => x && x.status === chave && x.ciente);
  return { chave, feito: !!l, em: l ? l.confirmadoEm : null };
}
const encerrada = (tipo: string, via: any, reg: any) =>
  (reg && reg.status === "usado") || (tipo === "os" && (via.status === "entregue" || via.status === "cancelado")) || via.status === "cancelado" || via.status === "cancelada";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    const acao = String(b.acao || "");
    const tipo = String(b.tipo || "");
    const id = String(b.id || "");
    // ----- ações da EQUIPE sobre o "o que melhorar" dos orçamentos recusados (18/11) -----
    if (["melhoriaResponder", "melhoriaLida"].includes(acao)) {
      const u = await staff(String(b.senha || ""));
      if (!u) return json({ error: "Acesso não autorizado." });
      if (nivelDe(u) === "oficina") return json({ error: "A Oficina não vê orçamentos." });
      const lojas = lojasDoUsuario(u);
      const pode = (l: unknown) => veTodasLojas(u) || lojas.has(String(l || ""));
      const oid = String(b.id || "");
      const { data: row } = await admin.from("orcamentos").select("payload").eq("id", oid).maybeSingle();
      const o = row && row.payload;
      if (!o || !o.melhoria || !pode(o.lojaId)) return json({ error: "Retorno do cliente não encontrado." });
      if (acao === "melhoriaLida") { await admin.rpc("orc_melhoria_gravar", { p_id: oid, p_obj: { lida: true, lidaPor: String(u.nome || ""), lidaEm: new Date().toISOString() }, p_so_se_vazio: false }); return json({ ok: true }); }
      const texto = String(b.texto || "").trim().slice(0, 1500);
      if (texto.length < 3) return json({ error: "Escreva a resposta." });
      const { data: okR, error: eR } = await admin.rpc("orc_melhoria_gravar", { p_id: oid, p_obj: { lida: true, resposta: { texto, por: String(u.nome || ""), em: new Date().toISOString() } }, p_so_se_vazio: false });
      if (eR || okR !== true) return json({ error: "Não foi possível gravar a resposta. Tente de novo." });
      return json({ ok: true });
    }
    // ----- ações da EQUIPE sobre avaliações (não dependem de uma via) -----
    if (["avaliacoesLista", "avaliacoesMedias", "avaliacaoResponder", "avaliacaoCorrigir", "avaliacaoLida"].includes(acao)) {
      const u = await staff(String(b.senha || ""));
      if (!u) return json({ error: "Acesso não autorizado." });
      if (acao === "avaliacoesMedias") {
        const { data } = await admin.from("avaliacoes_cliente").select("atendente,estrelas").not("estrelas", "is", null).limit(20000);
        const mapa: Record<string, { soma: number; n: number; nome: string }> = {};
        for (const r of (data || [])) { const k = semAcento(r.atendente); if (!k) continue; (mapa[k] = mapa[k] || { soma: 0, n: 0, nome: r.atendente }); mapa[k].soma += r.estrelas; mapa[k].n++; }
        const todos = Object.entries(mapa).map(([k, v]) => ({ chave: k, nome: v.nome, media: Math.round(v.soma / v.n * 100) / 100, total: v.n }));
        if (gerencia(u)) return json({ ok: true, medias: todos });
        const meus = [semAcento(u.nome), semAcento(u.apelido)].filter(Boolean);
        return json({ ok: true, medias: todos.filter((x) => meus.includes(x.chave)) });   // o próprio atendente vê só a média, nunca as avaliações individuais
      }
      if (!gerencia(u)) return json({ error: "Só gerente ou diretoria vê as avaliações." });
      if (acao === "avaliacoesLista") {
        let q = admin.from("avaliacoes_cliente").select("*").order("criado_em", { ascending: false }).limit(500);
        if (b.baixas) q = q.lte("estrelas", 3);
        const { data } = await q;
        let lista = (data || []).filter((r: any) => !r.pulou);
        if (b.semResposta) lista = lista.filter((r: any) => !r.resposta);
        if (b.atendente) lista = lista.filter((r: any) => semAcento(r.atendente) === semAcento(b.atendente));
        return json({ ok: true, lista });
      }
      if (acao === "avaliacaoLida") { await admin.from("avaliacoes_cliente").update({ lida: true }).eq("id", String(b.avId || "")); return json({ ok: true }); }
      if (acao === "avaliacaoCorrigir") {
        const texto = String(b.texto || "").trim().slice(0, 1500);
        if (texto.length < 3) return json({ error: "Escreva a resposta primeiro." });
        const key = Deno.env.get("GEMINI_API_KEY");
        if (!key) return json({ error: "A correção por IA não está disponível neste ambiente. Revise o texto e envie." });
        const prompt = "Corrija ortografia, pontuação e clareza do texto abaixo, em português do Brasil, mantendo o mesmo sentido, tom educado e acolhedor de uma joalheria, sem acrescentar fatos nem promessas. Devolva SOMENTE o texto corrigido.\n\nTexto:\n" + texto;
        try {
          const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + (Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-flash-latest") + ":generateContent", { method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
          const j = await r.json();
          const out = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.map((p: any) => p.text || "").join("").trim();
          if (!out) return json({ error: "A IA não conseguiu corrigir agora. Revise o texto e envie." });
          return json({ ok: true, texto: out });
        } catch (_e) { return json({ error: "A IA não respondeu. Revise o texto e envie." }); }
      }
      if (acao === "avaliacaoResponder") {
        const texto = String(b.texto || "").trim().slice(0, 1500);
        if (texto.length < 3) return json({ error: "Escreva a resposta." });
        const avId = String(b.avId || "");
        const { data: a } = await admin.from("avaliacoes_cliente").select("id").eq("id", avId).maybeSingle();
        if (!a) return json({ error: "Avaliação não encontrada." });
        await admin.from("avaliacoes_cliente").update({ lida: true, resposta: { texto, por: String(u.nome || ""), em: new Date().toISOString(), original: String(b.original || "").slice(0, 1500) } }).eq("id", avId);
        return json({ ok: true });
      }
    }
    // ----- ACHAR a via pelo CÓDIGO que o cliente mostra (rotativo de 60 s ou de terceiro) — só equipe (08/11) -----
    if (acao === "achar") {
      const u = await staff(String(b.senha || ""));
      if (!u) return json({ error: "Acesso não autorizado." });
      const cod = norm(b.codigo);
      if (!/^\d{6}$/.test(cod)) return json({ ok: true, achados: [] });
      const nv = nivelDe(u);
      const todas = nv === "diretoria" || nv === "oficina";
      const lojas = new Set<string>([...(Array.isArray(u.lojas) ? u.lojas : []).map(String), ...(u.lojaExtra && u.lojaExtra.id ? [String(u.lojaExtra.id)] : [])]);
      const pode = (l: unknown) => todas || lojas.has(String(l || ""));
      const j = janelaAtual();
      const achados: any[] = [];
      const vistos = new Set<string>();
      const ENCERR = ["entregue", "cancelado", "cancelada", "rascunho"];
      for (const t of ["os", "venda", "orc", "res"]) {
        for (let from = 0; from < 20000; from += 1000) {
          let q = admin.from(TABELA[t]).select("id, cliente:payload->>cliente, via:payload->>codigoVia, via2:payload->>via, loja:payload->>lojaId, status:payload->>status").range(from, from + 999);
          if (t !== "os") q = q.gte("updated_at", new Date(Date.now() - 60 * 86400000).toISOString());
          const { data } = await q;
          for (const r of (data || [])) {
            if (ENCERR.includes(String(r.status || "")) || !pode(r.loja)) continue;
            if (cod === await codigoRotativo(t, r.id, j) || cod === await codigoRotativo(t, r.id, j - 1)) {
              vistos.add(t + ":" + r.id);
              achados.push({ tipo: t, id: r.id, cliente: r.cliente || "", via: r.via || r.via2 || "", loja: r.loja || "", metodo: "rotativo" });
            }
          }
          if (!data || data.length < 1000) break;
        }
      }
      const { data: regs } = await admin.from("retiradas_terceiro").select("tipo,ref_id,gerado_em,portador_nome").eq("status", "ativo").eq("code_hash", "derivado").gte("gerado_em", new Date(Date.now() - VALIDADE_TERCEIRO_MS).toISOString());
      for (const r of (regs || [])) {
        if (vistos.has(r.tipo + ":" + r.ref_id) || !TABELA[r.tipo]) continue;
        if (cod !== await codigoTerceiro(r.tipo, r.ref_id, new Date(r.gerado_em).getTime())) continue;
        const v = await lerVia(r.tipo, r.ref_id);
        if (!v || ENCERR.includes(String(v.status || "")) || !pode(v.lojaId)) continue;
        achados.push({ tipo: r.tipo, id: r.ref_id, cliente: v.cliente || "", via: v.codigoVia || v.via || "", loja: v.lojaId || "", metodo: "terceiro", portador: r.portador_nome || "" });
      }
      return json({ ok: true, achados });
    }
    if (!TABELA[tipo] || !id) return json({ error: "Via inválida." });
    const via = await lerVia(tipo, id);
    if (!via || via.status === "rascunho") return json({ error: "Via não encontrada." });

    // ---------- públicas (cliente) ----------
    if (acao === "estado") {
      const reg = await lerReg(tipo, id);
      const out: any = { retirada: publico(reg), encerrada: encerrada(tipo, via, reg), codigoTerceiro: encerrada(tipo, via, reg) ? null : await terceiroAtual(tipo, id, reg), ciente: cienteInfo(via, reg), avaliacao: await avalInfo(tipo, id, via), melhoria: melhoriaInfo(tipo, via) };
      if (b.resumo) out.via = await comFotos(resumoVia(tipo, via, await lojaNome(via.lojaId)));
      return json(out);
    }
    if (acao === "rotativo") {
      const reg = await lerReg(tipo, id);
      if (encerrada(tipo, via, reg)) return json({ encerrada: true, retirada: publico(reg) });
      const j = janelaAtual();
      const restante = (j + 1) * PERIODO - Math.floor(Date.now() / 1000);
      return json({ codigo: await codigoRotativo(tipo, id, j), restante, periodo: PERIODO, retirada: publico(reg), codigoTerceiro: await terceiroAtual(tipo, id, reg), ciente: cienteInfo(via, reg), avaliacao: await avalInfo(tipo, id, via) });
    }
    if (acao === "avaliar") {
      const info = await avalInfo(tipo, id, via);
      if (!info.pendente) return json({ ok: true, jaFeita: true, avaliacao: info });
      const pulou = !!b.pulou;
      const est = Math.round(Number(b.estrelas));
      if (!pulou && !(est >= 1 && est <= 5)) return json({ error: "Escolha de 1 a 5 estrelas." });
      const comentario = pulou ? "" : String(b.comentario || "").trim().slice(0, 1500);
      const { error } = await admin.from("avaliacoes_cliente").insert({ id: tipo + ":" + id, tipo, via_id: id, via_codigo: via.codigoVia || via.via || via.numero || null, loja_id: via.lojaId || null, atendente: info.atendente || null, cliente: via.cliente || null, estrelas: pulou ? null : est, comentario: comentario || null, pulou });
      if (error && !String(error.message || "").includes("duplicate")) throw error;
      return json({ ok: true, avaliacao: await avalInfo(tipo, id, via) });
    }
    if (acao === "melhoria") {
      const info = melhoriaInfo(tipo, via);
      if (info.feita) return json({ ok: true, jaFeita: true, melhoria: info });
      if (!melhoriaAberta(tipo, via)) return json({ error: "Este orçamento não está encerrado: não há o que contar por aqui." });
      const motivos = (Array.isArray(b.motivos) ? b.motivos : []).map((x: unknown) => String(x)).filter((x: string) => MOTIVOS_MELHORIA.includes(x)).slice(0, 8);
      const texto = String(b.texto || "").trim().slice(0, 1500);
      if (!motivos.length && texto.length < 3) return json({ error: "Escolha um motivo ou escreva um pouquinho do que podemos melhorar." });
      const { data: ok, error } = await admin.rpc("orc_melhoria_gravar", { p_id: id, p_obj: { texto, motivos, em: new Date().toISOString(), lida: false, ua: String(req.headers.get("user-agent") || "").slice(0, 160) }, p_so_se_vazio: true });
      if (error) throw error;
      via.melhoria = { texto, motivos, em: new Date().toISOString() };
      return json({ ok: true, jaFeita: ok !== true, melhoria: melhoriaInfo(tipo, via) });
    }
    if (acao === "ciente") {
      const reg = await lerReg(tipo, id);
      const chave = cienteChave(via, reg);
      // todo acesso gera um registro (log de acesso): não deduplica
      const evento = { status: chave, confirmadoEm: new Date().toISOString(), ciente: true, ua: String(req.headers.get("user-agent") || "").slice(0, 160), ip: String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() };
      // Acréscimo ATÔMICO (auditoria 11/11/2026): antes gravávamos o payload INTEIRO de volta
      // (ler → alterar → escrever). Se a loja salvasse a mesma via no mesmo instante, uma das duas
      // gravações era perdida em silêncio — inclusive um pagamento recém-lançado. A função SQL
      // via_ciente_append faz o append numa só instrução UPDATE (o Postgres trava a linha).
      // Se a função não existir ou falhar, cai no modo antigo: nunca deixa o cliente sem o Ciente.
      let gravado = false;
      try {
        const { data, error } = await admin.rpc("via_ciente_append", { p_tabela: TABELA[tipo], p_id: id, p_evento: evento });
        if (!error && data === true) gravado = true;
      } catch (_e) { /* cai no modo antigo */ }
      const leituras = Array.isArray(via.leituras) ? via.leituras : [];
      leituras.push(evento);
      via.leituras = leituras.slice(-300);
      if (!gravado) { const { error } = await admin.from(TABELA[tipo]).update({ payload: via, updated_at: new Date().toISOString() }).eq("id", id); if (error) throw error; }
      return json({ ok: true, ciente: cienteInfo(via, reg), avaliacao: await avalInfo(tipo, id, via) });
    }
    if (acao === "cancelar") {
      const reg = await lerReg(tipo, id);
      if (!reg || reg.status !== "ativo") return json({ error: "Não há código de terceiro ativo para cancelar." });
      await gravar(tipo, id, { status: "cancelado", motivo: "cancelado pelo cliente", code_hash: null }, { acao: "código de terceiro CANCELADO pelo cliente antes de ser usado — portador: " + (reg.portador_nome || "—") });
      return json({ ok: true, retirada: publico(await lerReg(tipo, id)) });
    }
    if (acao === "gerar") {
      const reg = await lerReg(tipo, id);
      if (encerrada(tipo, via, reg)) return json({ error: "Esta via já foi retirada ou encerrada." });
      const nome = String(b.nome || "").trim().toUpperCase().slice(0, 80);
      if (nome.length < 3) return json({ error: "Informe o nome de quem vai buscar." });
      const agora = Date.now();
      const codigo = await codigoTerceiro(tipo, id, agora);
      await gravar(tipo, id, { habilitada: true, code_hash: "derivado", status: "ativo", tentativas: 0, motivo: null, gerado_em: new Date(agora).toISOString(), portador_nome: nome },
        { acao: (reg?.status === "ativo" ? "novo código de terceiro gerado (o anterior deixou de valer)" : "código de terceiro gerado pelo cliente") + " — portador: " + nome });
      return json({ codigo, retirada: publico(await lerReg(tipo, id)) });
    }

    // ---------- equipe ----------
    const user = await staff(String(b.senha || ""));
    if (!user) return json({ error: "Acesso não autorizado." });
    const por = String(b.por || user.nome || "");
    const reg = await lerReg(tipo, id);

    if (acao === "historico") {
      return json({ retirada: publico(reg), historico: reg?.historico || [], tentativas: reg?.tentativas || 0, saldo: saldoDe(tipo, via), cliente: via.cliente || "", encerrada: encerrada(tipo, via, reg) });
    }
    if (acao === "comprovante") {
      // Linha do tempo COMPLETA da via (para provar o que aconteceu): criação, alterações/status (auditoria), cientes do cliente, códigos e retirada.
      const ev: any[] = [];
      const criado = via.criadoEm ? new Date(via.criadoEm).toISOString() : null;
      if (criado) ev.push({ em: criado, tipo: "via", quem: via.criadoPor || via.vendedora || "", texto: "Via criada" + (via.codigoVia || via.via ? " (" + (via.codigoVia || via.via) + ")" : "") });
      const { data: aud } = await admin.from("auditoria_log").select("em,usuario_nome,nivel,acao,resumo,em_outra_loja").eq("tabela", TABELA[tipo]).eq("registro_id", id).order("em", { ascending: true }).limit(300);
      for (const a of (aud || [])) ev.push({ em: a.em, tipo: "sistema", quem: a.usuario_nome || "", texto: String(a.acao || "") + (a.resumo ? " — " + a.resumo : "") + (a.em_outra_loja ? " (em outra loja)" : "") });
      for (const h of (reg?.historico || [])) ev.push({ em: h.em, tipo: "retirada", quem: h.por || "", texto: h.acao + (h.loja ? " · " + h.loja : "") });
      for (const l of (Array.isArray(via.leituras) ? via.leituras : [])) {
        if (!l) continue;
        ev.push({ em: l.confirmadoEm, tipo: "cliente", quem: "CLIENTE", texto: (l.ciente ? "CIENTE registrado pelo cliente" : "Visualização registrada automaticamente") + " — situação: " + String(l.status || "").replace("|retirada", " (após retirada)") + (l.ip ? " · IP " + l.ip : "") + (l.ua ? " · aparelho: " + l.ua : "") });
      }
      // 22/11: HISTÓRICO COMPLETO da via — também o que fica no próprio registro (pagamentos, status da Oficina, local da peça, avisos internos,
      //        mensagens enviadas/programadas, prazo de retirada/abandono) e a fila de disparo (marketing_fila / disparo_envios).
      for (const e of eventosDoRegistro(via)) ev.push(e);
      try {
        const { data: fila } = await admin.from("marketing_fila").select("criado_em,enviado_em,status,rotulo,botao,erro,criado_por,tipo").eq("registro_id", id).order("criado_em", { ascending: true }).limit(100);
        for (const f of (fila || [])) {
          const nome = f.rotulo || f.botao || f.tipo || "mensagem";
          ev.push({ em: f.criado_em, tipo: "disparo", quem: f.criado_por || "sistema", texto: "WhatsApp na fila: " + nome });
          if (f.enviado_em) ev.push({ em: f.enviado_em, tipo: "disparo", quem: "sistema", texto: "WhatsApp ENVIADO ao cliente: " + nome });
          else if (f.status === "falhou" || f.status === "cancelado") ev.push({ em: f.criado_em, tipo: "disparo", quem: "sistema", texto: "WhatsApp " + f.status.toUpperCase() + ": " + nome + (f.erro ? " — " + String(f.erro).slice(0, 120) : "") });
        }
        const { data: env } = await admin.from("disparo_envios").select("em,tipo,origem,modelo,vendedora").eq("registro_id", id).order("em", { ascending: true }).limit(100);
        for (const d of (env || [])) ev.push({ em: d.em, tipo: "disparo", quem: d.vendedora || "sistema", texto: "WhatsApp entregue à Meta/aparelho" + (d.modelo ? " — modelo " + d.modelo : "") + (d.origem ? " (" + d.origem + ")" : "") });
      } catch (_) { /* tabelas opcionais */ }
      const av = await lerAval(tipo, id);
      if (av) {
        ev.push({ em: av.criado_em, tipo: "cliente", quem: "CLIENTE", texto: av.pulou ? "Pulou a avaliação do atendimento" : "AVALIOU o atendimento de " + (av.atendente || "—") + ": " + av.estrelas + " estrela(s)" + (av.comentario ? " — \"" + av.comentario + "\"" : "") });
        if (av.resposta) ev.push({ em: av.resposta.em, tipo: "retirada", quem: av.resposta.por || "", texto: "Resposta da loja ao cliente: \"" + av.resposta.texto + "\"" });
      }
      if (reg?.status === "usado") ev.push({ em: reg.usado_em, tipo: "retirada", quem: reg.usado_por || "", texto: "RETIRADA: recebida por " + (reg.recebido_por || "—") + " · forma: " + (reg.metodo === "rotativo" ? "código do cliente" : reg.metodo === "terceiro" ? "código de terceiro (autorizado: " + (reg.portador_nome || "—") + ")" : "SEM código — motivo: " + (reg.motivo || "—")) + (reg.loja ? " · " + reg.loja : "") });
      ev.sort((a, b2) => String(a.em || "").localeCompare(String(b2.em || "")));
      return json({ ok: true, via: resumoVia(tipo, via, await lojaNome(via.lojaId)), retirada: publico(reg), eventos: ev, geradoEm: new Date().toISOString(), por });
    }
    if (acao === "habilitar") {
      const on = !!b.on;
      if (!on && reg?.status === "usado") return json({ error: "A retirada já foi feita." });
      const row = await gravar(tipo, id, on ? { habilitada: true } : { habilitada: false, status: reg?.status === "usado" ? "usado" : "sem_codigo", code_hash: null },
        { acao: on ? "retirada por terceiros liberada pela loja" : "código de terceiro desligado pela loja", por });
      return json({ retirada: publico(row) });
    }
    if (acao === "semcodigo") {
      const nivel = String(user.nivel || "").toLowerCase();
      if (nivel !== "diretoria" && nivel !== "gerente") return json({ error: "Só gerente ou diretoria libera a entrega sem o código." });
      const motivo = String(b.motivo || "").trim();
      const recebidoPor = String(b.recebidoPor || "").trim().toUpperCase();
      if (motivo.length < 5) return json({ error: "Explique o motivo (cliente sem celular, link perdido…)." });
      if (!recebidoPor) return json({ error: "Informe quem recebeu." });
      if (reg?.status === "usado") return json({ error: "Esta via já foi retirada." });
      const saldo = b.saldoConferido ? 0 : saldoDe(tipo, via);
      if (saldo > 0.009) return json({ error: "Ainda há saldo de R$ " + saldo.toFixed(2).replace(".", ",") + ". Lance o pagamento na via antes de liberar.", saldo });
      const loja = await lojaNome(String(b.lojaId || via.lojaId || ""));
      const row = await gravar(tipo, id, { status: "usado", usado_em: new Date().toISOString(), usado_por: por, recebido_por: recebidoPor, metodo: "sem_codigo", motivo, loja, code_hash: null },
        { acao: "entregue SEM código (" + motivo + ") — recebido por " + recebidoPor, por, loja });
      return json({ ok: true, retirada: publico(row) });
    }

    // Confere o código digitado (rotativo de 6 dígitos ou fixo de terceiro). Devolve {erro} ou {metodo}.
    async function conferir(): Promise<{ erro?: Response; metodo?: string }> {
      if (reg?.status === "usado") return { erro: json({ error: "Esta via já foi retirada em " + new Date(reg.usado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) + "." }) };
      const cod = norm(b.codigo);
      if (!cod) return { erro: json({ error: "Digite o código que o cliente mostrou." }) };
      if (/^\d{6}$/.test(cod)) {
        if (reg?.bloq_ate && new Date(reg.bloq_ate).getTime() > Date.now()) return { erro: json({ error: "Muitos códigos errados. Aguarde alguns minutos e tente de novo." }) };
        const j = janelaAtual();
        const ok = cod === await codigoRotativo(tipo, id, j) || cod === await codigoRotativo(tipo, id, j - 1);
        if (!ok && reg && reg.gerado_em && reg.portador_nome) {
          const der = await codigoTerceiro(tipo, id, new Date(reg.gerado_em).getTime());
          if (cod === der) {
            if (reg.status === "cancelado") return { erro: json({ error: "O cliente cancelou o código de terceiro. Peça o código que aparece agora no link da via." }) };
            if (reg.status === "invalidado") return { erro: json({ error: "Este código foi invalidado (" + (reg.motivo || "—") + "). O cliente precisa gerar um novo." }) };
            if (reg.status !== "ativo") return { erro: json({ error: "Código de terceiro indisponível. Peça ao cliente o código que aparece agora no link." }) };
            if (Date.now() - new Date(reg.gerado_em).getTime() > VALIDADE_TERCEIRO_MS) return { erro: json({ error: "O código de terceiro venceu (vale 24 horas). O cliente precisa gerar outro no link." }) };
            if (reg.tent_rot) await gravar(tipo, id, { tent_rot: 0, bloq_ate: null });
            return { metodo: "terceiro" };
          }
        }
        if (!ok) {
          const t = (reg?.tent_rot || 0) + 1;
          const trava = t >= MAX_ERROS_ROT;
          await gravar(tipo, id, { tent_rot: trava ? 0 : t, ...(trava ? { bloq_ate: new Date(Date.now() + TRAVA_MIN * 60000).toISOString() } : {}) },
            { acao: trava ? "código rotativo travado por " + t + " erros" : "código rotativo errado", por });
          return { erro: json({ error: trava ? "Código errado várias vezes: liberação travada por " + TRAVA_MIN + " minutos." : "Código errado ou vencido. Peça ao cliente o código que está aparecendo agora no link." }) };
        }
        if (reg?.tent_rot) await gravar(tipo, id, { tent_rot: 0, bloq_ate: null });
        return { metodo: "rotativo" };
      }
      // código fixo de terceiro
      if (reg?.status === "bloqueado") return { erro: json({ error: "Código bloqueado por tentativas erradas. O cliente precisa gerar um novo no link." }) };
      if (reg?.status === "cancelado") return { erro: json({ error: "O cliente cancelou o código de terceiro. Peça o código que aparece agora no link da via." }) };
      if (reg?.status === "invalidado") return { erro: json({ error: "Este código foi invalidado (" + (reg.motivo || "—") + "). O cliente precisa gerar um novo." }) };
      if (!reg || reg.status !== "ativo" || !reg.code_hash) return { erro: json({ error: "Código não confere. Peça ao cliente o código que aparece agora no link da via." }) };
      if (reg.gerado_em && Date.now() - new Date(reg.gerado_em).getTime() > VALIDADE_TERCEIRO_MS) return { erro: json({ error: "O código de terceiro venceu (vale 24 horas). O cliente precisa gerar outro no link." }) };
      const ok = (await hmac(tipo + ":" + id + ":" + cod)) === reg.code_hash;
      if (!ok) {
        const t = (reg.tentativas || 0) + 1;
        const bloq = t >= MAX_TENTATIVAS;
        await gravar(tipo, id, { tentativas: t, ...(bloq ? { status: "bloqueado", motivo: "tentativas erradas", code_hash: null } : {}) },
          { acao: bloq ? "código bloqueado após " + t + " tentativas erradas" : "tentativa com código errado", por });
        return { erro: json({ error: bloq ? "Código errado. Foram " + t + " tentativas: o código foi bloqueado e o cliente precisa gerar outro." : "Código errado. Restam " + (MAX_TENTATIVAS - t) + " tentativa(s).", tentativasRestantes: Math.max(0, MAX_TENTATIVAS - t) }) };
      }
      return { metodo: "terceiro" };
    }

    if (acao === "validar") {
      const c = await conferir(); if (c.erro) return c.erro;
      const saldo = b.saldoConferido ? 0 : saldoDe(tipo, via);   // a tela de edição já conferiu o saldo com os pagamentos ainda não salvos
      await gravar(tipo, id, {}, { acao: "código (" + c.metodo + ") conferido na loja" + (saldo > 0.009 ? " (saldo em aberto R$ " + saldo.toFixed(2).replace(".", ",") + ")" : ""), por });
      return json({ ok: true, saldo, metodo: c.metodo, cliente: via.cliente || "", portador: c.metodo === "terceiro" ? (reg?.portador_nome || null) : null });
    }
    if (acao === "concluir") {
      const c = await conferir(); if (c.erro) return c.erro;
      const recebidoPor = String(b.recebidoPor || "").trim().toUpperCase().slice(0, 80);
      if (!recebidoPor) return json({ error: "Informe o nome de quem recebeu." });
      const saldo = b.saldoConferido ? 0 : saldoDe(tipo, via);
      if (saldo > 0.009) return json({ error: "Ainda há saldo de R$ " + saldo.toFixed(2).replace(".", ",") + ". Lance o pagamento na via antes de liberar.", saldo });
      const loja = await lojaNome(String(b.lojaId || via.lojaId || ""));
      const row = await gravar(tipo, id, { status: "usado", usado_em: new Date().toISOString(), usado_por: por, recebido_por: recebidoPor, metodo: c.metodo, loja, code_hash: null },
        { acao: "mercadoria retirada (código " + c.metodo + ") — recebido por " + recebidoPor, por, loja });
      return json({ ok: true, retirada: publico(row) });
    }
    if (acao === "invalidar") {
      const c = await conferir(); if (c.erro) return c.erro;
      if (c.metodo !== "terceiro") return json({ error: "O código rotativo não precisa ser invalidado: ele muda sozinho." });
      const motivo = String(b.motivo || "Saldo não foi pago na retirada");
      const row = await gravar(tipo, id, { status: "invalidado", motivo, code_hash: null }, { acao: "código invalidado: " + motivo, por });
      return json({ ok: true, retirada: publico(row) });
    }
    return json({ error: "Ação inválida." });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
