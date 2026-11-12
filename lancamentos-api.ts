// lancamentos-api — módulo temporário "Lançamentos". Diretoria: tudo, inclusive folha. Gerente: tudo (sem salvar folha). Vendedora: lança vendedora/loja e vê fator/conferência. Oficina: sem acesso.
// AUTOMÁTICO (a partir de AUTO_DESDE): as vendas por vendedora × loja vêm sozinhas do Caixa (PDV + Pedido/O.S., regime de caixa,
// mesma regra do DP → Vendas e Comissões). Um lançamento salvo à mão (tipo 'vendedora') sempre vence o automático; excluí-lo volta ao automático.
// v18 (01/11): lista de vendedoras montada pelos logins do app (vendedora/gerente/diretoria, chave = 1º nome) + a lista antiga;
//   quem for desligado no DP sai da lista de lançamento (inativos). A lista vai para a tela em `vendedoras`.
//   Cashback usado (__cashback) não conta como recebido.
// v25 (12/11): o FECHAMENTO DA LOJA (tipo 'loja') também é automático: bruto, devolução e valor por categoria vêm da MESMA conta das vendedoras
//   (só entram movimentos atribuídos a uma vendedora, por isso a soma das vendedoras = a loja). Fechamento salvo à mão vence o automático.
//   Categoria: Pedido/O.S. pelo tipo do pedido (ALIANÇA, FABRICAÇÃO, RELÓGIO; o resto = SERVIÇO); Venda pelo produto de cada item
//   (categoria Aliança/Relógio/Serviço, senão tipo de venda: Representante Ouro/Prata; joia Vilaça = FABRICAÇÃO; sem produto = SERVIÇO),
//   rateado pelo peso de cada item; a devolução abate das categorias na mesma proporção.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const LOJAS = ["MARECHAL", "JOAO BERALDO", "JARDIM NORTE", "REFORMA"];
const VENDEDORAS_FIXAS = ["PATRICIA", "GISLAYNE", "CRISTINA", "MARIANA", "PAMELA", "TANIA", "FLAVIA", "EDILENE", "MEIRIELI", "AMANDA", "CAMILA", "LARISSA", "VICTORIA", "TIRZA", "FELIPE", "PHABRINNE"];
const NIVEIS_LISTA = ["vendedora", "gerente", "diretoria"];
let VENDEDORAS: string[] = [...VENDEDORAS_FIXAS];
const FATOR_LOJAS = ["MARECHAL", "JOAO BERALDO", "JARDIM NORTE"];
const CATEGORIAS = ["ALIANCA", "FABRICACAO", "SERVICO", "REPRES_OURO", "REPRES_PRATA", "RELOGIO"];
const FOLHA_NOMES = ["PATRICIA", "GISLAYNE", "CRISTINA", "MARIANA", "PAMELA", "CAMILA", "EDILENE", "FLAVIA", "TANIA", "LARISSA", "SILVANO", "AMANDA", "SAYMON", "KAUA"];
const FOLHA_GERENTES = ["CAMILA", "LARISSA"];
const FOLHA_FIXOS = ["AMANDA", "SAYMON", "KAUA"];
const FOLHA_CATEG = ["SILVANO"];
const CATS_FOLHA = ["ALIANCA", "FABRICACAO", "SERVICO"];
const FOLHA_MAN = ["salario", "vr", "diaEx", "comissao", "dsr", "assid", "hextra", "premio", "vt", "dental", "inss", "irrf", "descVT"];
const FOLHA_PARAMS = ["minimo", "salario", "vr", "diaExtraJN", "pctComissao", "pctAssid", "pctHextra", "passagem", "passagensDia", "dental", "valeAdiant", "pctDescVT", "depIR"];

// ---- automático ----
const AUTO_DESDE = "2026-11"; // outubro/2026 continua manual
const LOJA_ID_PARA_MODULO: Record<string, string> = { loja_mc: "MARECHAL", loja_jb: "JOAO BERALDO", loja_jn: "JARDIM NORTE", loja_rj: "REFORMA" };
const NAO_RECEBIDAS = ["__fiado", "__credito", "__sem_custo", "__cashback"];
const ALIAS_NOME: Record<string, string> = { LARYSSA: "LARISSA", EDYLENE: "EDILENE", MEIRE: "MEIRIELI", PATY: "PATRICIA", PHA: "PHABRINNE" };

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
// devolve { user, users } — a lista de logins também monta a lista de vendedoras
async function usuarioValido(senha: string): Promise<{ user: any | null; users: any[] }> {
  const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  const users = (data?.payload && data.payload.users) || [];
  return { user: users.find((u: any) => sessaoValida(u, senha)) || null, users };
}
const semAcento = (t: string) => String(t || "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().trim();
const primeiroNome = (t: string) => semAcento(t).split(/\s+/)[0] || "";
/** Lista de lançamento = lista antiga + 1º nome de todo login vendedora/gerente/diretoria (vendedora nova entra sozinha). */
function montarVendedoras(users: any[]): string[] {
  const set = new Set<string>(VENDEDORAS_FIXAS);
  for (const u of users || []) {
    if (!u || !NIVEIS_LISTA.includes(u.nivel) || !u.nome) continue;
    const k = primeiroNome(u.nome);
    if (k && /^[A-Z]+$/.test(k)) set.add(k);
  }
  return [...set];
}
// funcionários desligados no DP (status 'desligado'), ligados ao usuário por funcionarioId → chave da lista de lançamento
async function inativosLista(): Promise<string[]> {
  const [cfg, dp] = await Promise.all([
    admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle(),
    admin.from("dp_funcionarios").select("payload"),
  ]);
  const users = (cfg.data?.payload && cfg.data.payload.users) || [];
  const desligados = new Set((dp.data || []).filter((r: any) => r.payload && r.payload.status === "desligado" && r.payload.funcionarioId).map((r: any) => r.payload.funcionarioId));
  const out = new Set<string>();
  for (const u of users) {
    if (!u.funcionarioId || !desligados.has(u.funcionarioId)) continue;
    const k = primeiroNome(u.nome);
    if (VENDEDORAS.includes(k)) out.add(k);
  }
  return [...out];
}
const num = (v: any) => { const n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const r2 = (v: any) => Math.round((Number(v) || 0) * 100) / 100;
const nb = (v: any) => { let s = String(v == null ? "" : v).trim(); if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const n = Number(s); return isNaN(n) ? 0 : n; };
// data local (Brasil, UTC-3) AAAA-MM-DD
function dataLocal(v: any): string {
  if (v == null || v === "") return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const n = typeof v === "number" ? v : (/^\d+$/.test(String(v)) ? Number(v) : Date.parse(String(v)));
  if (!isFinite(n)) return "";
  return new Date(n - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
const mesAtualBR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);
function mesesAuto(): string[] {
  const out: string[] = []; const fim = mesAtualBR();
  let [a, m] = AUTO_DESDE.split("-").map(Number);
  while (`${a}-${String(m).padStart(2, "0")}` <= fim && out.length < 120) { out.push(`${a}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; a++; } }
  return out;
}

async function carregarBaseAuto() {
  const [cfg, dp, vp, os] = await Promise.all([
    admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle(),
    admin.from("dp_funcionarios").select("payload"),
    admin.from("vendas_pdv").select("payload"),
    admin.from("ordens_servico").select("payload"),
  ]);
  const users = (cfg.data?.payload && cfg.data.payload.users) || [];
  const idParaChave: Record<string, string> = {};
  for (const u of users) { const k = primeiroNome(u.nome); if (u.funcionarioId && VENDEDORAS.includes(k)) idParaChave[u.funcionarioId] = k; }
  const fichas = (dp.data || []).map((r: any) => r.payload).filter(Boolean);
  const nomeParaChave: Record<string, string> = {};
  for (const f of fichas) {
    const k = f.funcionarioId ? idParaChave[f.funcionarioId] : undefined; if (!k) continue;
    if (f.nome) nomeParaChave[semAcento(f.nome)] = k;
    if (f.apelido) nomeParaChave[semAcento(f.apelido)] = k;
  }
  const vendas = (vp.data || []).map((r: any) => r.payload).filter(Boolean);
  const ordens = (os.data || []).map((r: any) => r.payload).filter(Boolean);
  // produtos (tipo de venda e categoria) para classificar o que foi vendido
  const prods: Record<string, { tv: string; cat: string }> = {};
  for (let from = 0; from < 40000; from += 1000) {
    const { data } = await admin.from("produtos_estoque").select("id, tv:payload->>tipoVenda, cat:payload->>categoriaId").order("id").range(from, from + 999);
    for (const r of (data || []) as any[]) prods[r.id] = { tv: r.tv || "", cat: r.cat || "" };
    if (!data || data.length < 1000) break;
  }
  const cats: Record<string, string> = {};
  for (const c of ((cfg.data?.payload?.produtosOtica?.categorias) || [])) if (c && c.id) cats[c.id] = semAcento(c.nome);
  return { idParaChave, nomeParaChave, vendas, ordens, prods, cats };
}
function chaveDoRegistro(reg: any, base: any): string | null {
  if (reg && reg.vendedoraId && base.idParaChave[reg.vendedoraId]) return base.idParaChave[reg.vendedoraId];
  const nome = semAcento(reg && reg.vendedora);
  if (nome && base.nomeParaChave[nome]) return base.nomeParaChave[nome];
  const p = ALIAS_NOME[primeiroNome(nome)] || primeiroNome(nome);
  return VENDEDORAS.includes(p) ? p : null;
}

// ---- categoria do que foi vendido (para o fechamento da loja) ----
function catDoItemVenda(it: any, base: any): string {
  const p = it && it.produtoEstoqueId ? base.prods[it.produtoEstoqueId] : null;
  if (!p) return "SERVICO";
  const c = base.cats[p.cat] || "";
  if (c === "ALIANCA") return "ALIANCA";
  if (c === "RELOGIO") return "RELOGIO";
  if (c === "SERVICO") return "SERVICO";
  if (p.tv === "relogio") return "RELOGIO";
  if (p.tv === "aliancaOuro" || p.tv === "aliancaPrata") return "ALIANCA";
  if (p.tv === "joiaRepresentanteOuro") return "REPRES_OURO";
  if (p.tv === "joiaRepresentantePrata") return "REPRES_PRATA";
  if (p.tv === "joiaVilacaOuro" || p.tv === "joiaVilacaPrata") return "FABRICACAO";
  return "SERVICO";
}
function catDoPedido(o: any): string {
  const t = semAcento(o && o.serviceTypeName);
  if (t.startsWith("ALIANCA")) return "ALIANCA";
  if (t.startsWith("FABRICA")) return "FABRICACAO";
  if (t.startsWith("RELOGIO")) return "RELOGIO";
  return "SERVICO";
}
/** fatias do valor de um registro por categoria (soma = 1) */
function fatias(reg: any, origem: "venda" | "os", base: any): Record<string, number> {
  if (origem === "os") return { [catDoPedido(reg)]: 1 };
  const itens = (reg.itens || []).map((it: any) => ({ cat: catDoItemVenda(it, base), peso: Math.max(0, nb(it.quantidade || 1) * nb(it.valorUnitario)) }));
  const total = itens.reduce((a: number, i: any) => a + i.peso, 0);
  if (!itens.length || total <= 0) return { SERVICO: 1 };
  const out: Record<string, number> = {};
  for (const i of itens) out[i.cat] = (out[i.cat] || 0) + i.peso / total;
  return out;
}

// Mesma lógica de dp.html → comLancamentosDoMes (regime de caixa): entradas e devoluções do mês por vendedora × loja,
// e (v25) o fechamento de cada loja com os MESMOS movimentos (os que têm vendedora identificada).
function calcularAutoCompleto(mes: string, base: any) {
  const res: Record<string, any> = {};
  const lojasAcc: Record<string, { bruto: number; devolucao: number; cat: Record<string, number> }> = {};
  const semVend: Record<string, { venda: number; devolucao: number }> = {};
  const noMes = (d: string) => !!d && d.slice(0, 7) === mes;
  const somar = (reg: any, tipo: "venda" | "devolucao", data: string, valor: number, origem: "venda" | "os", refCat?: any) => {
    if (!(valor > 0.004) || !noMes(data)) return;
    const loja = LOJA_ID_PARA_MODULO[reg.lojaId]; const chave = chaveDoRegistro(reg, base);
    if (!loja) return;
    if (!chave) { const s = semVend[loja] || (semVend[loja] = { venda: 0, devolucao: 0 }); s[tipo] = r2(s[tipo] + valor); return; }
    const o = res[chave] || (res[chave] = { lojas: Object.fromEntries(LOJAS.map(l => [l, { venda: 0, devolucao: 0 }])) });
    o.lojas[loja][tipo] = r2(o.lojas[loja][tipo] + valor);
    const a = lojasAcc[loja] || (lojasAcc[loja] = { bruto: 0, devolucao: 0, cat: {} });
    const fx = fatias(refCat || reg, origem, base);
    const sinal = tipo === "venda" ? 1 : -1;
    if (tipo === "venda") a.bruto += valor; else a.devolucao += valor;
    for (const [c, f] of Object.entries(fx)) a.cat[c] = (a.cat[c] || 0) + sinal * valor * (f as number);
  };
  const recebido = (reg: any) => r2((reg.pagamentos || []).reduce((a: number, p: any) => a + (NAO_RECEBIDAS.includes(p.formaId) ? 0 : nb(p.valor)), 0));
  const emDinheiro = (reg: any) => (reg.pagamentos || []).filter((p: any) => !NAO_RECEBIDAS.includes(p.formaId) && nb(p.valor) > 0);
  const origemPorDebito: Record<string, any> = {};
  const ehOS = new Set<any>();
  for (const v of base.vendas) if (v.tipo !== "recebimentoFiado" && v.fiadoDebitoId) origemPorDebito[v.fiadoDebitoId] = v;
  for (const o of base.ordens) if (o && o.fiadoDebitoId) { origemPorDebito[o.fiadoDebitoId] = o; ehOS.add(o); }

  for (const v of base.vendas) {
    if (!v) continue;
    if (v.tipo === "recebimentoFiado") {
      const ref = v.refFiado && v.refFiado.debitoId ? origemPorDebito[v.refFiado.debitoId] : null;
      if (v.status !== "cancelada") somar(ref || v, "venda", dataLocal(v.data), recebido(v), ref && ehOS.has(ref) ? "os" : "venda");
      continue;
    }
    const dataVenda = dataLocal(v.data);
    for (const p of emDinheiro(v)) somar(v, "venda", dataLocal(p.data) || dataVenda, nb(p.valor), "venda");
    if (v.status === "cancelada") {
      const saiu = v.caixaSaidaCancelamento != null && v.caixaSaidaCancelamento !== "" ? nb(v.caixaSaidaCancelamento) : recebido(v);
      somar(v, "devolucao", dataLocal(v.canceladoEm), saiu, "venda");
    } else {
      for (const t of (v.trocas || [])) {
        const dif = nb(t.diferenca); const dt = dataLocal(t.data);
        if (dif > 0 && !NAO_RECEBIDAS.includes(t.formaDiferenca)) somar(v, "venda", dt, dif, "venda");
        else if (dif < 0 && t.formaDiferenca !== "__credito") somar(v, "devolucao", dt, Math.abs(dif), "venda");
      }
    }
  }
  for (const o of base.ordens) {
    if (!o || o.status === "rascunho") continue;
    const cancelada = /^cancel/.test(String(o.status || ""));
    const naVolta = o.momentoPagamento === "na_volta";
    const dataEntrega = o.status === "entregue" ? dataLocal(o.recebidoEm) : "";
    const dataCriacao = dataLocal(o.criadoEm) || dataLocal(o.data);
    let houveEntrada = false;
    for (const p of emDinheiro(o)) {
      const dt = naVolta ? dataEntrega : (dataLocal(p.data) || dataCriacao);
      if (dt) { somar(o, "venda", dt, nb(p.valor), "os"); houveEntrada = true; }
    }
    if (cancelada && houveEntrada) {
      const saiu = o.caixaSaidaCancelamento != null && o.caixaSaidaCancelamento !== "" ? nb(o.caixaSaidaCancelamento) : recebido(o);
      somar(o, "devolucao", dataLocal(o.canceladoEm), saiu, "os");
    }
  }
  // fechamento das lojas: arredonda e joga a diferença de centavos na maior categoria (soma das categorias = bruto − devolução)
  const lojas: Record<string, any> = {};
  for (const [loja, a] of Object.entries(lojasAcc)) {
    const bruto = r2(a.bruto), devolucao = r2(a.devolucao);
    const categorias: Record<string, number> = Object.fromEntries(CATEGORIAS.map(c => [c, r2(a.cat[c] || 0)]));
    const dif = r2((bruto - devolucao) - Object.values(categorias).reduce((x, y) => x + y, 0));
    if (dif !== 0) { const maior = CATEGORIAS.reduce((m, c) => Math.abs(categorias[c]) > Math.abs(categorias[m]) ? c : m, CATEGORIAS[0]); categorias[maior] = r2(categorias[maior] + dif); }
    lojas[loja] = { bruto, devolucao, categorias };
  }
  return { vend: res, lojas, semVend };
}
const calcularAuto = (mes: string, base: any) => calcularAutoCompleto(mes, base).vend;
// linhas 'vendedora' automáticas do mês, só para quem não tem lançamento manual
function linhasAuto(mes: string, base: any, manuais: Set<string>, calc?: any) {
  const agora = new Date().toISOString();
  return Object.entries((calc || calcularAutoCompleto(mes, base)).vend)
    .filter(([chave]) => !manuais.has(chave))
    .map(([chave, dados]) => ({ mes, tipo: "vendedora", chave, dados, atualizado_por: "Automático", updated_at: agora, auto: true }));
}
// linhas 'loja' automáticas (fechamento), só para as lojas sem fechamento salvo à mão
function linhasAutoLoja(mes: string, base: any, manuais: Set<string>, calc?: any) {
  const agora = new Date().toISOString();
  return Object.entries((calc || calcularAutoCompleto(mes, base)).lojas)
    .filter(([chave]) => !manuais.has(chave))
    .map(([chave, dados]) => ({ mes, tipo: "loja", chave, dados, atualizado_por: "Automático", updated_at: agora, auto: true }));
}

function limparDados(tipo: string, d: any) {
  d = d || {};
  if (tipo === "folha") {
    const params: any = {};
    for (const k of FOLHA_PARAMS) params[k] = num((d.params || {})[k]);
    const feriados = Array.isArray(d.feriados)
      ? [...new Set(d.feriados.map((x: any) => Math.floor(Number(x))).filter((x: number) => x >= 1 && x <= 31))].sort((a: any, b: any) => a - b).slice(0, 31)
      : null;
    const pessoas: any = {};
    for (const n of FOLHA_NOMES) {
      const x = (d.pessoas || {})[n]; if (!x) continue;
      const p: any = { extra: num(x.extra), outros: num(x.outros), dep: Math.min(20, Math.max(0, Math.floor(Number(x.dep)) || 0)) };
      if (x.vale != null) p.vale = num(x.vale);
      if (x.diasVT != null) p.diasVT = Math.min(31, Math.max(0, Math.floor(Number(x.diasVT)) || 0));
      const man: any = {};
      for (const k of FOLHA_MAN) if (x.man && x.man[k] != null) man[k] = num(x.man[k]);
      if (Object.keys(man).length) p.man = man;
      pessoas[n] = p;
    }
    const gerentes: any = {};
    for (const n of FOLHA_GERENTES) {
      const x = (d.gerentes || {})[n]; if (!x) continue;
      const pct: any = {}; for (const l of LOJAS) pct[l] = Math.min(100, Math.max(0, num((x.pct || {})[l])));
      gerentes[n] = { fixo: num(x.fixo), pct };
    }
    const categ: any = {};
    for (const n of FOLHA_CATEG) {
      const x = (d.categ || {})[n]; if (!x) continue;
      const pct: any = {}; for (const c of CATS_FOLHA) pct[c] = Math.min(100, Math.max(0, num((x.pct || {})[c])));
      categ[n] = { fixo: num(x.fixo), pct };
    }
    const fixos: any = {};
    for (const n of FOLHA_FIXOS) if ((d.fixos || {})[n] != null) fixos[n] = num(d.fixos[n]);
    return { params, feriados, pessoas, gerentes, categ, fixos };
  }
  if (tipo === "fator") {
    const faixas = (Array.isArray(d.faixas) ? d.faixas : []).slice(0, 30)
      .map((f: any) => ({ valor: num(f && f.valor), percentual: Math.min(100, Math.max(0, num(f && f.percentual))) }))
      .filter((f: any) => f.valor > 0 || f.percentual > 0)
      .sort((a: any, b: any) => a.valor - b.valor);
    return { faixas };
  }
  if (tipo === "vendedora") {
    const lojas: any = {};
    for (const l of LOJAS) { const x = (d.lojas || {})[l] || {}; lojas[l] = { venda: num(x.venda), devolucao: num(x.devolucao) }; }
    return { lojas };
  }
  const categorias: any = {};
  for (const c of CATEGORIAS) categorias[c] = num((d.categorias || {})[c]);
  return { bruto: num(d.bruto), devolucao: num(d.devolucao), categorias };
}
function chaveInvalida(tipo: string, chave: string): string | null {
  if (tipo !== "vendedora" && tipo !== "loja" && tipo !== "fator" && tipo !== "folha") return "tipo inválido";
  if (tipo === "fator" && !FATOR_LOJAS.includes(chave)) return "loja sem fator";
  if (tipo === "vendedora" && !VENDEDORAS.includes(chave)) return "vendedora inválida";
  if (tipo === "loja" && !LOJAS.includes(chave)) return "loja inválida";
  if (tipo === "folha" && chave !== "GERAL") return "chave de folha inválida";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    const { user, users } = await usuarioValido(b.senha);
    if (!user) return json({ error: "não autorizado" }, 401);
    VENDEDORAS = montarVendedoras(users);
    const total = user.nivel === "diretoria" || user.nivel === "gerente" || user.nivel === "vendedora";   // 04/11: vendedora = gerente
    if (!total && user.nivel !== "vendedora") return json({ error: "sem permissão" }, 403);
    if ((b.op === "salvar" || b.op === "excluir") && String(b.tipo || "") === "folha" && user.nivel !== "diretoria") return json({ error: "folha de pagamento é só da diretoria" }, 403);
    if (!total && (b.op === "salvar" || b.op === "excluir") && String(b.tipo || "") !== "vendedora" && String(b.tipo || "") !== "loja") return json({ error: "sem permissão (fator é só para diretoria/gerente)" }, 403);
    if (b.op === "meses") {
      const { data, error } = await admin.from("lancamentos_mensais").select("mes, tipo, chave, dados").in("tipo", ["vendedora", "loja"]).order("mes", { ascending: false }).limit(5000);
      if (error) throw error;
      const linhas: any[] = data || [];
      // meses automáticos (a partir de AUTO_DESDE): o card do mês existe sozinho e traz o que o Caixa já movimentou
      const lista = mesesAuto();
      if (lista.length) {
        let base: any = null; try { base = await carregarBaseAuto(); } catch (e) { console.error(e); }
        for (const m of lista) {
          const manuais = new Set(linhas.filter(x => x.mes === m && x.tipo === "vendedora").map(x => x.chave));
          const manuaisL = new Set(linhas.filter(x => x.mes === m && x.tipo === "loja").map(x => x.chave));
          if (base) {
            try {
              const calc = calcularAutoCompleto(m, base);
              linhas.push(...linhasAuto(m, base, manuais, calc).map(({ mes, tipo, chave, dados }) => ({ mes, tipo, chave, dados })));
              linhas.push(...linhasAutoLoja(m, base, manuaisL, calc).map(({ mes, tipo, chave, dados }) => ({ mes, tipo, chave, dados })));
            } catch (e) { console.error("auto mes", m, e); }
          }
          if (!linhas.some(x => x.mes === m)) linhas.push({ mes: m, tipo: "auto", chave: "AUTO", dados: {} });
        }
      }
      const inativos = await inativosLista().catch(() => [] as string[]);
      return json({ ok: true, data: linhas, vendedoras: VENDEDORAS, inativos });
    }
    const mes = String(b.mes || "");
    if (!/^\d{4}-\d{2}$/.test(mes)) return json({ error: "mês inválido" }, 400);

    if (b.op === "listar") {
      const [atual, hist, fat, inativos] = await Promise.all([
        admin.from("lancamentos_mensais").select("tipo, chave, dados, atualizado_por, updated_at").eq("mes", mes),
        admin.from("lancamentos_historico").select("id, tipo, chave, dados, atualizado_por, created_at").eq("mes", mes).order("created_at", { ascending: false }).limit(500),
        admin.from("lancamentos_mensais").select("mes, chave, dados, atualizado_por, updated_at").eq("tipo", "fator").lte("mes", mes).order("mes", { ascending: false }).limit(500),
        inativosLista().catch(() => [] as string[]),
      ]);
      if (atual.error) throw atual.error;
      if (hist.error) throw hist.error;
      if (fat.error) throw fat.error;
      const veFolha = user.nivel === "diretoria";
      let dados: any[] = (atual.data || []).filter((x: any) => x.tipo !== "fator" && (veFolha || x.tipo !== "folha"));
      const automatico = mes >= AUTO_DESDE && mes <= mesAtualBR();
      let semVendedora: any = {};
      if (automatico) {
        try {
          const base = await carregarBaseAuto();
          const calc = calcularAutoCompleto(mes, base);
          const manuais = new Set(dados.filter(x => x.tipo === "vendedora").map(x => x.chave));
          const manuaisL = new Set(dados.filter(x => x.tipo === "loja").map(x => x.chave));
          dados = dados.concat(linhasAuto(mes, base, manuais, calc).map(({ tipo, chave, dados: d, atualizado_por, updated_at, auto }) => ({ tipo, chave, dados: d, atualizado_por, updated_at, auto })));
          dados = dados.concat(linhasAutoLoja(mes, base, manuaisL, calc).map(({ tipo, chave, dados: d, atualizado_por, updated_at, auto }) => ({ tipo, chave, dados: d, atualizado_por, updated_at, auto })));
          semVendedora = calc.semVend;
        } catch (e) { console.error("auto", e); }
      }
      return json({ ok: true, data: dados, historico: (hist.data || []).filter((x: any) => veFolha || x.tipo !== "folha"), fatores: fat.data || [], inativos, automatico, vendedoras: VENDEDORAS, semVendedora });
    }
    if (b.op === "salvar") {
      const tipo = String(b.tipo || "");
      const chave = String(b.chave || "");
      const inv = chaveInvalida(tipo, chave);
      if (inv) return json({ error: inv }, 400);
      if (b.novo) {
        const { data: ja, error: ej } = await admin.from("lancamentos_mensais").select("chave").eq("mes", mes).eq("tipo", tipo).eq("chave", chave).maybeSingle();
        if (ej) throw ej;
        if (ja) return json({ error: `${chave} já tem lançamento neste mês — use Editar` }, 409);
      }
      const agora = new Date().toISOString();
      const dados = limparDados(tipo, b.dados);
      const row = { mes, tipo, chave, dados, atualizado_por: user.nome || "", updated_at: agora };
      const { error } = await admin.from("lancamentos_mensais").upsert(row, { onConflict: "mes,tipo,chave" });
      if (error) throw error;
      const { data: h, error: eh } = await admin.from("lancamentos_historico").insert({ mes, tipo, chave, dados, atualizado_por: user.nome || "", created_at: agora }).select("id, tipo, chave, dados, atualizado_por, created_at").single();
      if (eh) throw eh;
      return json({ ok: true, data: row, historico: h });
    }
    if (b.op === "excluir") {
      const tipo = String(b.tipo || "");
      const chave = String(b.chave || "");
      const inv = chaveInvalida(tipo, chave);
      if (inv) return json({ error: inv }, 400);
      const { data: apagados, error } = await admin.from("lancamentos_mensais").delete().eq("mes", mes).eq("tipo", tipo).eq("chave", chave).select("dados");
      if (error) throw error;
      if (!apagados || !apagados.length) return json({ error: "lançamento não encontrado" }, 404);
      const { error: eh } = await admin.from("lancamentos_historico").insert({ mes, tipo, chave, dados: { excluido: true, anterior: apagados[0].dados }, atualizado_por: user.nome || "", created_at: new Date().toISOString() });
      if (eh) throw eh;
      return json({ ok: true });
    }
    return json({ error: "op inválida" }, 400);
  } catch (e) { console.error(e); return json({ error: String(e) }, 500); }
});
