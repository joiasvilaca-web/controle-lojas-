import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * reforma-api — v2
 * v2: vários itens por pedido (foto + observação cada), orçamento e aprovação POR ITEM,
 *     frete (tabela própria ou API dos Correios) com frete grátis acima de X / manual,
 *     entrega e devolução (loja ou Correios), custódia auditada com foto obrigatória por item
 *     (entrada e saída), postagem com rastreio, envio de WhatsApp pela Evolution API
 *     (mesmos segredos do módulo Atendimento). Pedidos da v1 são convertidos ao abrir.
 *
 * Ops PÚBLICAS (reforma.html): publicInit, publicCriar, publicConsultar, publicAceitar
 * Ops INTERNAS (reforma-admin.html, `senha` = token de sessão): init, listar, obter, criarBalcao,
 *   orcar, calcularFrete, aceitePresencial, anotar, sugerirData, gerarOS, checkin, checkout,
 *   postar, entregar, cancelar, enviarWhatsApp, listarInstancias, salvarConfig, salvarSegredos
 *
 * Tabelas: reforma_pedidos, reforma_config (id=config e id=segredos). Bucket privado reforma-fotos.
 * Escreve em ordens_servico (só a O.S. que ela mesma cria), clientes_cadastro (só insere cliente
 * novo) e atendimento_conversas/atendimento_mensagens (registra o WhatsApp enviado).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BUCKET = "reforma-fotos";
const MAX_ITENS = 10;
const MAX_FOTOS_ITEM = 6;
const MAX_FOTO_BYTES = 3 * 1024 * 1024;
const LIMITE_PEDIDOS_TEL_24H = 5;
const LIMITE_PEDIDOS_IP_24H = 25;
const VALIDADE_ORCAMENTO_DIAS = 10;            // CDC art. 40
const SIGNED_CURTO = 60 * 60;
const SIGNED_LONGO = 60 * 60 * 24 * 365 * 10;
const CORREIOS_API = "https://api.correios.com.br";

const STATUS = {
  NOVO: "novo", ORCADO: "orcado", APROVADO: "aprovado", RECUSADO: "recusado",
  EM_CUSTODIA: "em_custodia", OS_GERADA: "os_gerada", PRONTO: "pronto", ENVIADO: "enviado",
  ENTREGUE: "entregue", CANCELADO: "cancelado",
};
const SERVICOS_PADRAO = [
  { id: "ajuste", nome: "Ajuste de tamanho" }, { id: "solda", nome: "Solda / conserto" },
  { id: "pedra", nome: "Troca ou cravação de pedra" }, { id: "polimento", nome: "Polimento / banho" },
  { id: "transformar", nome: "Transformar em outra peça" }, { id: "outro", nome: "Outro" },
];
const FRETE_TABELA_PADRAO: any = {
  SEDEX: { mesmaUf: { valor: 30, prazo: 2 }, sudeste: { valor: 40, prazo: 3 }, brasil: { valor: 60, prazo: 5 } },
  PAC:   { mesmaUf: { valor: 22, prazo: 5 }, sudeste: { valor: 28, prazo: 7 }, brasil: { valor: 38, prazo: 10 } },
};
const FRETE_PADRAO: any = {
  provider: "tabela", gratisAcima: null, servicoPadrao: "SEDEX", pesoEmbalagemG: 150, pesoMinimoG: 300,
  comprimento: 16, largura: 11, altura: 5, codSedex: "03220", codPac: "03298", valorDeclarado: false,
  tabela: FRETE_TABELA_PADRAO,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function onlyDigits(s: unknown) { return String(s || "").replace(/\D/g, ""); }
function maiusc(s: unknown) { return s == null ? "" : String(s).trim().toUpperCase(); }
function num(v: unknown) { let s = String(v ?? "").trim(); if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const n = Number(s); return isNaN(n) ? NaN : n; }
function round2(v: number) { return Math.round(v * 100) / 100; }
function uid(p: string) { return p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function gerarToken() {
  const alf = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => alf[b % alf.length]).join("");
}
function hojeBR() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }
function addDias(iso: string, n: number) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function fmtTel(d: string) {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
function fmtMoney(v: number) { return "R$ " + (Number(v) || 0).toFixed(2).replace(".", ","); }
function codigoDe(numero: number) { return "R" + String(numero).padStart(5, "0"); }
function ufDoCep(cep: string): string {
  const n = parseInt(onlyDigits(cep).slice(0, 5), 10); if (isNaN(n)) return "";
  const faixas: [number, number, string][] = [[1000, 19999, "SP"], [20000, 28999, "RJ"], [29000, 29999, "ES"], [30000, 39999, "MG"], [40000, 48999, "BA"], [49000, 49999, "SE"], [50000, 56999, "PE"], [57000, 57999, "AL"], [58000, 58999, "PB"], [59000, 59999, "RN"], [60000, 63999, "CE"], [64000, 64999, "PI"], [65000, 65999, "MA"], [66000, 68899, "PA"], [68900, 68999, "AP"], [69000, 69299, "AM"], [69300, 69399, "RR"], [69400, 69899, "AM"], [69900, 69999, "AC"], [70000, 72799, "DF"], [72800, 72999, "GO"], [73000, 73699, "DF"], [73700, 76799, "GO"], [76800, 76999, "RO"], [77000, 77999, "TO"], [78000, 78899, "MT"], [79000, 79999, "MS"], [80000, 87999, "PR"], [88000, 89999, "SC"], [90000, 99999, "RS"]];
  const f = faixas.find(([a, b]) => n >= a && n <= b); return f ? f[2] : "";
}

// ---------- sessão (mesma regra do db-gateway) ----------
function sessoesVivas(u: any): any[] { const agora = Date.now(); return (Array.isArray(u.sessoes) ? u.sessoes : []).filter((s: any) => s && s.token && (!s.exp || Number(s.exp) > agora)); }
function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_")) return false;
  if (u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return sessoesVivas(u).some((s: any) => s.token === senha);
}
function moduloAtivo(user: any): boolean {
  const perm = user.permissoes;
  if (perm && perm.reforma && typeof perm.reforma.ativo === "boolean") return perm.reforma.ativo;
  if (user.nivel === "diretoria" || user.nivel === "gerente") return true;
  if (user.nivel === "oficina") return false;
  return true;
}
function usuarioPublico(u: any) { return { id: u.id, nome: u.nome, nivel: u.nivel, lojas: Array.isArray(u.lojas) ? u.lojas : [] }; }
function gestaoTotal(u: any) { return u.nivel === "diretoria" || u.nivel === "gerente"; }

async function loadConfig() { const { data, error } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle(); if (error) throw error; return (data && data.payload) || {}; }
async function loadReformaRow(id: string) { const { data, error } = await admin.from("reforma_config").select("payload").eq("id", id).maybeSingle(); if (error) throw error; return (data && data.payload) || {}; }
function lojaDe(config: any, id: string) { return (config.lojas || []).find((l: any) => l.id === id) || null; }
function freteCfg(rcfg: any) { const f = { ...FRETE_PADRAO, ...(rcfg.frete || {}) }; f.tabela = { SEDEX: { ...FRETE_TABELA_PADRAO.SEDEX, ...((rcfg.frete || {}).tabela || {}).SEDEX }, PAC: { ...FRETE_TABELA_PADRAO.PAC, ...((rcfg.frete || {}).tabela || {}).PAC } }; return f; }
function servicosCfg(rcfg: any) { return Array.isArray(rcfg.servicos) && rcfg.servicos.length ? rcfg.servicos : SERVICOS_PADRAO; }

/** Lojas que aparecem para o cliente (config do módulo; padrão MC/JV/JN/RJ). */
function lojasPublicas(config: any, rcfg: any) {
  const padrao = ["loja_mc", "loja_jb", "loja_jn", "loja_rj"];
  const ids: string[] = Array.isArray(rcfg.lojasPublicas) && rcfg.lojasPublicas.length ? rcfg.lojasPublicas : padrao;
  const extras = rcfg.lojasInfo || {};
  return ids.map((id) => {
    const l = lojaDe(config, id); if (!l) return null;
    const ex = extras[id] || {};
    const end = [l.endereco, l.numero].filter(Boolean).join(", ") + (l.bairro ? " — " + l.bairro : "");
    return { id, nome: ex.apelido || l.nome, abreviacao: l.abreviacao || "", endereco: ex.endereco || end || "", horario: ex.horario || "", telefone: ex.telefone || l.telefone || "", cep: onlyDigits(ex.cep || l.cep || "") };
  }).filter(Boolean);
}
function cepDaLoja(config: any, rcfg: any, lojaId: string): string {
  const ex = (rcfg.lojasInfo || {})[lojaId] || {}; const l = lojaDe(config, lojaId) || {};
  const cep = onlyDigits(ex.cep || l.cep || "");
  if (cep.length === 8) return cep;
  const p = lojasPublicas(config, rcfg).find((x: any) => x.cep && x.cep.length === 8);
  return (p && p.cep) || onlyDigits(freteCfg(rcfg).cepOrigemPadrao || "") || "36010904";
}

// ---------- storage ----------
async function uploadDataUrl(path: string, dataUrl: string) {
  const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(dataUrl || "");
  if (!m) throw new Error("foto inválida (formato)");
  if (m[2].length > MAX_FOTO_BYTES * 1.4) throw new Error("foto grande demais");
  const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: m[1].replace("jpg", "jpeg"), upsert: false });
  if (error) throw error;
  return path;
}
async function subirFotos(pedidoId: string, tipo: string, fotos: any[], por: string, max = MAX_FOTOS_ITEM) {
  const out: any[] = [];
  for (const f of (Array.isArray(fotos) ? fotos : []).slice(0, max)) {
    const dataUrl = typeof f === "string" ? f : (f && f.dataUrl);
    if (!dataUrl) continue;
    const id = uid("ft"); const ext = /^data:image\/png/i.test(dataUrl) ? "png" : "jpg";
    const path = `pedidos/${pedidoId}/${tipo}_${id}.${ext}`;
    await uploadDataUrl(path, dataUrl);
    out.push({ id, path, tipo, nome: (f && f.nome) || `${tipo}_${id}.${ext}`, criadoEm: Date.now(), por });
  }
  return out;
}
async function assinarFotos(fotos: any[], exp = SIGNED_CURTO) {
  const paths = (fotos || []).map((f: any) => f.path).filter(Boolean);
  if (!paths.length) return fotos || [];
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(paths, exp);
  if (error) throw error;
  const mapa: Record<string, string> = {};
  (data || []).forEach((d: any) => { if (d && d.path && d.signedUrl) mapa[d.path] = d.signedUrl; });
  return (fotos || []).map((f: any) => ({ ...f, url: mapa[f.path] || null }));
}
async function assinarItens(itens: any[]) {
  const out: any[] = [];
  for (const it of itens || []) {
    const c = it.custodia || {};
    out.push({ ...it, fotos: await assinarFotos(it.fotos || []),
      custodia: { entrada: c.entrada ? { ...c.entrada, fotos: await assinarFotos(c.entrada.fotos || []) } : null, saida: c.saida ? { ...c.saida, fotos: await assinarFotos(c.saida.fotos || []) } : null } });
  }
  return out;
}

// ---------- modelo ----------
async function getPedido(id: string) { const { data, error } = await admin.from("reforma_pedidos").select("*").eq("id", id).maybeSingle(); if (error) throw error; if (data) normalizar(data.payload); return data; }
async function getPedidoPorToken(token: string) { const { data, error } = await admin.from("reforma_pedidos").select("*").eq("token", token).maybeSingle(); if (error) throw error; if (data) normalizar(data.payload); return data; }
async function salvarPedido(row: any, payload: any) {
  const { error } = await admin.from("reforma_pedidos").update({ payload, status: payload.status, loja_id: payload.lojaId || null, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (error) throw error;
}
function evento(p: any, tipo: string, por: string, detalhe?: string) { p.historico = Array.isArray(p.historico) ? p.historico : []; p.historico.push({ em: Date.now(), tipo, por, detalhe: detalhe || "" }); }
function orcamentoExpirado(p: any) { return p.status === STATUS.ORCADO && p.orcamento && p.orcamento.validadeAte && p.orcamento.validadeAte < hojeBR(); }
/** Converte pedido da v1 (um item só) para o modelo de itens. Roda em memória; persiste na próxima gravação. */
function normalizar(p: any) {
  if (!p || Array.isArray(p.itens)) return p;
  const c = p.custodia || {};
  p.itens = [{
    id: "it_legado", descricao: p.descricao || "", servico: p.servico || "outro", servicoNome: p.servicoNome || "", pesoInformado: p.pesoInformado || null,
    fotos: p.fotos || [], obsCliente: "",
    orcamento: p.orcamento ? { valor: p.orcamento.valor, obsPublica: p.orcamento.observacoesCliente || "", obsInterna: p.orcamento.observacoesInternas || "", inviavel: false } : null,
    aprovado: p.aceite ? true : (p.recusa ? false : null),
    custodia: { entrada: c.entrada ? { peso: c.entrada.peso, teor: c.entrada.teor, teorObs: c.entrada.teorObs, lacre: c.entrada.lacre, fotos: c.entrada.fotos || [] } : null,
      saida: c.saida ? { peso: c.saida.peso, lacre: c.saida.lacre, fotos: c.saida.fotos || [] } : null },
  }];
  p.entrega = p.entrega || { modo: "loja", lojaId: p.lojaId };
  p.devolucao = p.devolucao || { modo: "retirar", lojaId: p.lojaId };
  if (p.orcamento && !p.orcamento.frete) p.orcamento.frete = { ida: null, volta: null, gratis: false, reembolsarIda: false, gratisAcima: null };
  p.versao = 2;
  return p;
}
function itensAprovados(p: any) { return (p.itens || []).filter((it: any) => it.aprovado === true); }
function subtotalItens(itens: any[]) { return round2(itens.reduce((s: number, it: any) => s + (Number(it.orcamento?.valor) || 0), 0)); }
/** Totais do orçamento para um conjunto de itens (usado no aceite, na O.S. e na página do cliente). */
function calcularTotais(p: any, itens: any[]) {
  const o = p.orcamento || {}; const fr = o.frete || {};
  const subtotal = subtotalItens(itens);
  const voltaCorreios = p.devolucao?.modo === "correios" && fr.volta && Number(fr.volta.valor) > 0;
  const gratisRegra = fr.gratisAcima != null && Number(fr.gratisAcima) > 0 && subtotal >= Number(fr.gratisAcima);
  const gratis = !!fr.gratis || gratisRegra;
  const freteVolta = voltaCorreios ? Number(fr.volta.valor) : 0;
  const freteCobrado = voltaCorreios && !gratis ? freteVolta : 0;
  const reembolso = fr.reembolsarIda && p.entrega?.modo === "correios" && fr.ida && Number(fr.ida.valor) > 0 ? Number(fr.ida.valor) : 0;
  const absorvido = round2((voltaCorreios && gratis ? freteVolta : 0) + reembolso);
  return { subtotal, freteVolta: round2(freteVolta), freteCobrado: round2(freteCobrado), gratis, gratisRegra, reembolso: round2(reembolso), absorvido, total: round2(subtotal + freteCobrado - reembolso) };
}

/** Visão pública — nunca observação interna. */
async function visaoCliente(row: any, config: any, rcfg: any) {
  const p = row.payload || {};
  const pubs = lojasPublicas(config, rcfg);
  const lojaPub = (id: string) => pubs.find((l: any) => l.id === id) || (() => { const l = lojaDe(config, id); return l ? { id: l.id, nome: l.nome, endereco: "", horario: "", telefone: "" } : null; })();
  const itens = (await assinarItens(p.itens || [])).map((it: any) => ({
    id: it.id, descricao: it.descricao, servicoNome: it.servicoNome || it.servico, obsCliente: it.obsCliente || "", pesoInformado: it.pesoInformado || null,
    fotos: (it.fotos || []).map((f: any) => ({ id: f.id, url: f.url })),
    orcamento: it.orcamento ? { valor: it.orcamento.valor, obsPublica: it.orcamento.obsPublica || "", inviavel: !!it.orcamento.inviavel } : null,
    aprovado: it.aprovado,
    custodia: it.custodia?.entrada ? { entrada: { peso: it.custodia.entrada.peso, teor: it.custodia.entrada.teor, lacre: it.custodia.entrada.lacre, fotos: (it.custodia.entrada.fotos || []).map((f: any) => ({ id: f.id, url: f.url })) },
      saida: it.custodia.saida ? { peso: it.custodia.saida.peso, lacre: it.custodia.saida.lacre || "", fotos: (it.custodia.saida.fotos || []).map((f: any) => ({ id: f.id, url: f.url })) } : null } : null,
  }));
  const status = orcamentoExpirado(p) ? "expirado" : p.status;
  const o = p.orcamento; const c = p.custodia || {};
  return {
    codigo: codigoDe(row.numero), status, criadoEm: p.criadoEm,
    cliente: { nome: p.cliente?.nome || "", telefone: p.cliente?.telefone || "" },
    entrega: { modo: p.entrega?.modo || "loja", loja: p.entrega?.modo === "loja" ? lojaPub(p.entrega.lojaId) : null },
    devolucao: { modo: p.devolucao?.modo || "retirar", loja: p.devolucao?.modo === "retirar" ? lojaPub(p.devolucao.lojaId) : null, cep: p.endereco?.cep || "" },
    itens,
    orcamento: o ? { prazoDias: o.prazoDias, validadeAte: o.validadeAte, cotacaoOuroG: o.cotacaoOuroG || null, obsGeral: o.obsGeral || "", em: o.em,
      frete: { ida: o.frete?.ida || null, volta: o.frete?.volta || null, gratis: !!o.frete?.gratis, gratisAcima: o.frete?.gratisAcima ?? null, reembolsarIda: !!o.frete?.reembolsarIda } } : null,
    totais: o ? calcularTotais(p, p.status === STATUS.ORCADO ? (p.itens || []).filter((it: any) => it.orcamento && !it.orcamento.inviavel) : itensAprovados(p)) : null,
    aceite: p.aceite ? { em: p.aceite.em, modo: p.aceite.modo, totais: p.aceite.totais || null } : null,
    custodia: c.entrada ? { em: c.entrada.em, lojaId: c.entrada.lojaId, saidaEm: c.saida?.em || null, entrega: c.entrega ? { em: c.entrega.em, recebidoPor: c.entrega.recebidoPor || "" } : null } : null,
    postagem: p.postagem ? { rastreio: p.postagem.rastreio, em: p.postagem.em, servico: p.postagem.servico || "" } : null,
    os: p.os ? { codigoVia: p.os.codigoVia, dataPrevista: p.os.data } : null,
    historico: (p.historico || []).filter((h: any) => !["anotacao", "whatsapp"].includes(h.tipo)).map((h: any) => ({ em: h.em, tipo: h.tipo })),
  };
}

function validarNovo(params: any, config: any, rcfg: any) {
  const nome = maiusc(params.nome); const tel = onlyDigits(params.telefone);
  if (nome.length < 3) throw new Error("Informe o nome.");
  if (tel.length !== 10 && tel.length !== 11) throw new Error("Telefone inválido (use DDD + número).");
  const entrega = params.entrega && params.entrega.modo === "correios" ? { modo: "correios" } : { modo: "loja", lojaId: String(params.entrega?.lojaId || params.lojaId || "") };
  const devolucao = params.devolucao && params.devolucao.modo === "correios" ? { modo: "correios" } : { modo: "retirar", lojaId: String(params.devolucao?.lojaId || entrega.lojaId || params.lojaId || "") };
  if (entrega.modo === "loja" && !lojaDe(config, entrega.lojaId)) throw new Error("Escolha a loja onde vai entregar a peça.");
  if (devolucao.modo === "retirar" && !lojaDe(config, devolucao.lojaId)) throw new Error("Escolha a loja onde vai retirar.");
  const lojaId = entrega.modo === "loja" ? entrega.lojaId : (devolucao.modo === "retirar" ? devolucao.lojaId : String(params.lojaId || (lojasPublicas(config, rcfg)[0] || {}).id || ""));
  if (!lojaDe(config, lojaId)) throw new Error("Loja inválida.");
  const usaCorreios = entrega.modo === "correios" || devolucao.modo === "correios";
  const end = params.endereco || {};
  const endereco = { cep: onlyDigits(end.cep), logradouro: maiusc(end.logradouro).slice(0, 120), numero: maiusc(end.numero).slice(0, 20), complemento: maiusc(end.complemento).slice(0, 60), bairro: maiusc(end.bairro).slice(0, 60), cidade: maiusc(end.cidade).slice(0, 60), uf: maiusc(end.uf).slice(0, 2) };
  if (usaCorreios && endereco.cep.length !== 8) throw new Error("Informe o CEP para calcular o frete.");
  if (devolucao.modo === "correios" && (!endereco.logradouro || !endereco.numero || !endereco.cidade || !endereco.uf)) throw new Error("Complete o endereço para receber pelos Correios.");
  const servicos = servicosCfg(rcfg);
  const itensIn = Array.isArray(params.itens) ? params.itens.slice(0, MAX_ITENS) : [];
  if (!itensIn.length) throw new Error("Adicione pelo menos uma peça.");
  const itens = itensIn.map((it: any, i: number) => {
    const desc = String(it.descricao || "").trim().slice(0, 1500);
    if (desc.length < 5) throw new Error(`Descreva a peça ${i + 1}.`);
    const sv = servicos.find((s: any) => s.id === it.servico) || { id: "outro", nome: "Outro" };
    const peso = it.peso != null && it.peso !== "" ? num(it.peso) : NaN;
    if (!Array.isArray(it.fotos) || !it.fotos.length) throw new Error(`Envie pelo menos uma foto da peça ${i + 1}.`);
    return { id: uid("it"), descricao: desc, servico: sv.id, servicoNome: sv.nome, pesoInformado: peso > 0 ? peso : null, obsCliente: String(it.obs || "").trim().slice(0, 500), fotosIn: it.fotos, fotos: [], orcamento: null, aprovado: null, custodia: { entrada: null, saida: null } };
  });
  return { nome, tel, entrega, devolucao, lojaId, endereco: usaCorreios ? endereco : null, itens };
}

async function criarPedido(params: any, config: any, rcfg: any, origem: "cliente" | "balcao", por: string, ip: string) {
  const v = validarNovo(params, config, rcfg);
  const id = uid("ref_"); const token = gerarToken();
  const payload: any = {
    id, token, origem, versao: 2, status: STATUS.NOVO, criadoEm: Date.now(),
    cliente: { nome: v.nome, telefone: fmtTel(v.tel), email: String(params.email || "").trim().slice(0, 120) },
    lojaId: v.lojaId, entrega: v.entrega, devolucao: v.devolucao, endereco: v.endereco,
    itens: v.itens.map((it: any) => { const { fotosIn, ...rest } = it; return rest; }),
    aceiteTermos: origem === "cliente" ? { em: Date.now(), ip, ua: String(params.ua || "").slice(0, 200) } : null,
    historico: [],
  };
  evento(payload, "criado", por, origem === "cliente" ? `Pedido enviado pelo cliente (${v.itens.length} peça(s))` : `Pedido lançado no balcão (${v.itens.length} peça(s))`);
  const { data, error } = await admin.from("reforma_pedidos").insert({ id, token, status: STATUS.NOVO, loja_id: v.lojaId, telefone_digits: v.tel, payload }).select("numero").single();
  if (error) throw error;
  try {
    for (let i = 0; i < v.itens.length; i++) payload.itens[i].fotos = await subirFotos(id, "cliente_" + (i + 1), v.itens[i].fotosIn, por);
  } catch (e) { console.error("upload fotos", e); payload.fotosErro = String(e); }
  payload.numero = data.numero; payload.codigo = codigoDe(data.numero);
  await salvarPedido({ id }, payload);
  return { id, token, numero: data.numero, codigo: payload.codigo };
}

// ---------- frete ----------
let __correiosToken: { token: string; exp: number } | null = null;
async function correiosToken(seg: any) {
  if (__correiosToken && __correiosToken.exp > Date.now() + 60000) return __correiosToken.token;
  if (!seg.correiosUsuario || !seg.correiosCodigoAcesso || !seg.correiosCartao) throw new Error("Credenciais dos Correios não configuradas.");
  const res = await fetch(`${CORREIOS_API}/token/v1/autentica/cartaopostagem`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Basic " + btoa(`${seg.correiosUsuario}:${seg.correiosCodigoAcesso}`) }, body: JSON.stringify({ numero: String(seg.correiosCartao) }) });
  const r = await res.json().catch(() => null);
  if (!res.ok || !r || !r.token) throw new Error("Correios (token) " + res.status + ": " + JSON.stringify(r).slice(0, 300));
  __correiosToken = { token: r.token, exp: r.expiraEm ? new Date(r.expiraEm).getTime() : Date.now() + 20 * 3600 * 1000 };
  return r.token;
}
async function correiosCalcular(seg: any, fc: any, servico: string, cepOrigem: string, cepDestino: string, pesoG: number, valorDeclarado: number | null) {
  const token = await correiosToken(seg);
  const cod = servico === "PAC" ? String(fc.codPac || "03298") : String(fc.codSedex || "03220");
  const q = new URLSearchParams({ cepOrigem, cepDestino, psObjeto: String(Math.max(1, Math.round(pesoG))), tpObjeto: "2", comprimento: String(fc.comprimento || 16), largura: String(fc.largura || 11), altura: String(fc.altura || 5), diametro: "0" });
  if (fc.valorDeclarado && valorDeclarado && valorDeclarado > 0) { q.set("vlDeclarado", valorDeclarado.toFixed(2)); q.set("servicosAdicionais", servico === "PAC" ? "064" : "019"); }
  const h = { "Authorization": "Bearer " + token, "Accept": "application/json" };
  const rp = await fetch(`${CORREIOS_API}/preco/v1/nacional/${cod}?${q.toString()}`, { headers: h });
  const jp = await rp.json().catch(() => null);
  if (!rp.ok) throw new Error("Correios (preço) " + rp.status + ": " + JSON.stringify(jp).slice(0, 300));
  const valor = num(jp && (jp.pcFinal ?? jp.pcBase ?? "")); if (!(valor > 0)) throw new Error("Correios: preço não retornado: " + JSON.stringify(jp).slice(0, 200));
  let prazo: number | null = null;
  try { const rz = await fetch(`${CORREIOS_API}/prazo/v1/nacional/${cod}?cepOrigem=${cepOrigem}&cepDestino=${cepDestino}`, { headers: h }); const jz = await rz.json().catch(() => null); if (rz.ok && jz && jz.prazoEntrega != null) prazo = Number(jz.prazoEntrega); } catch (e) { console.error("prazo", e); }
  return { servico, valor: round2(valor), prazo, origem: "correios" };
}
function tabelaCalcular(fc: any, servico: string, cepOrigem: string, cepDestino: string) {
  const ufO = ufDoCep(cepOrigem), ufD = ufDoCep(cepDestino);
  const faixa = ufO && ufO === ufD ? "mesmaUf" : (["SP", "RJ", "ES", "MG"].includes(ufD) ? "sudeste" : "brasil");
  const t = (fc.tabela[servico === "PAC" ? "PAC" : "SEDEX"] || {})[faixa] || { valor: 0, prazo: null };
  return { servico: servico === "PAC" ? "PAC" : "SEDEX", valor: round2(Number(t.valor) || 0), prazo: t.prazo != null ? Number(t.prazo) : null, origem: "tabela", faixa, uf: ufD };
}
/** Calcula uma perna do frete. Se a API dos Correios falhar, cai na tabela e avisa. */
async function calcularPerna(config: any, rcfg: any, servico: string, cepOrigem: string, cepDestino: string, pesoG: number, valorDeclarado: number | null) {
  const fc = freteCfg(rcfg);
  if (onlyDigits(cepDestino).length !== 8 || onlyDigits(cepOrigem).length !== 8) throw new Error("CEP inválido para cálculo de frete.");
  if (fc.provider === "correios") {
    try { const seg = await loadReformaRow("segredos"); return await correiosCalcular(seg, fc, servico, onlyDigits(cepOrigem), onlyDigits(cepDestino), pesoG, valorDeclarado); }
    catch (e) { const t = tabelaCalcular(fc, servico, cepOrigem, cepDestino); return { ...t, aviso: "API dos Correios falhou, usado valor da tabela: " + String((e as any)?.message || e).slice(0, 200) }; }
  }
  return tabelaCalcular(fc, servico, cepOrigem, cepDestino);
}
function pesoPacoteG(rcfg: any, itens: any[]) {
  const fc = freteCfg(rcfg);
  const soma = (itens || []).reduce((s: number, it: any) => s + (Number(it.pesoInformado) || 0), 0);
  return Math.max(Number(fc.pesoMinimoG) || 300, Math.round(soma + (Number(fc.pesoEmbalagemG) || 150)));
}
/** Frete de ida (cliente → loja) e volta (loja → cliente) do pedido, conforme o que o cliente escolheu. */
async function calcularFretePedido(config: any, rcfg: any, p: any, servicoIda: string, servicoVolta: string, valorDeclarado: number | null) {
  const cepCliente = onlyDigits(p.endereco?.cep || "");
  const cepLoja = cepDaLoja(config, rcfg, p.lojaId);
  const peso = pesoPacoteG(rcfg, p.itens);
  const out: any = { ida: null, volta: null, cepCliente, cepLoja, pesoG: peso };
  if (p.entrega?.modo === "correios") out.ida = await calcularPerna(config, rcfg, servicoIda, cepCliente, cepLoja, peso, valorDeclarado);
  if (p.devolucao?.modo === "correios") out.volta = await calcularPerna(config, rcfg, servicoVolta, cepLoja, cepCliente, peso, valorDeclarado);
  return out;
}

// ---------- WhatsApp (Evolution — mesmos segredos do Atendimento) ----------
async function segredosAtendimento(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of ["EVOLUTION_URL", "EVOLUTION_API_KEY"]) { const v = Deno.env.get(k); if (v) out[k] = v; }
  const { data } = await admin.from("atendimento_segredos").select("chave, valor");
  for (const r of data || []) if (!out[r.chave]) out[r.chave] = r.valor;
  if (out.EVOLUTION_URL) out.EVOLUTION_URL = out.EVOLUTION_URL.replace(/\/+$/, "");
  return out;
}
async function evolution(caminho: string, body: any, metodo = "POST") {
  const s = await segredosAtendimento();
  if (!s.EVOLUTION_URL || !s.EVOLUTION_API_KEY) throw new Error("EVOLUTION_URL / EVOLUTION_API_KEY não configurados (módulo Atendimento).");
  const res = await fetch(`${s.EVOLUTION_URL}${caminho}`, { method: metodo, headers: { "Content-Type": "application/json", "apikey": s.EVOLUTION_API_KEY }, body: metodo === "GET" ? undefined : JSON.stringify(body) });
  const r = await res.json().catch(() => null);
  if (!res.ok) throw new Error("Evolution " + res.status + ": " + JSON.stringify(r).slice(0, 300));
  return r;
}
function instanciaPadrao(config: any, rcfg: any) {
  return (rcfg.whatsappInstancia || "").trim() || Object.keys(config.atendimentoInstancias || {}).find((k) => !k.startsWith("ig_")) || "reformajoias";
}
/** Envia texto pelo WhatsApp e registra na conversa do módulo Atendimento (cria a conversa se não existir). */
async function enviarWhatsApp(config: any, rcfg: any, user: any, telefone: string, texto: string) {
  const d = onlyDigits(telefone); if (d.length < 10) throw new Error("Telefone inválido.");
  const numero = d.startsWith("55") && d.length >= 12 ? d : "55" + d;
  const instancia = instanciaPadrao(config, rcfg);
  const r = await evolution(`/message/sendText/${encodeURIComponent(instancia)}`, { number: numero, text: texto });
  const externoId = r && r.key && r.key.id ? r.key.id : null;
  try {
    const meuId = user.funcionarioId || user.id; const meuNome = user.nome; const agora = new Date().toISOString();
    let { data: conv } = await admin.from("atendimento_conversas").select("id,atendente_id,status").eq("instancia", instancia).eq("contato_id", numero).maybeSingle();
    if (!conv) {
      const { data: nova } = await admin.from("atendimento_conversas").insert({ canal: "whatsapp", instancia, contato_id: numero, contato_nome: null, atendente_id: meuId, atendente_nome: meuNome, status: "em_atendimento" }).select("id,atendente_id,status").single();
      conv = nova;
    }
    if (conv) {
      await admin.from("atendimento_mensagens").upsert({ conversa_id: conv.id, canal: "whatsapp", direcao: "out", tipo: "texto", texto, externo_id: externoId, autor_funcionario_id: meuId, autor_nome: meuNome, status: "enviada", enviada_em: agora }, { onConflict: "conversa_id,externo_id", ignoreDuplicates: false });
      const upd: any = { ultima_mensagem_em: agora, ultima_mensagem_texto: texto, ultima_direcao: "out", nao_lidas: 0, updated_at: agora };
      if (!conv.atendente_id) { upd.atendente_id = meuId; upd.atendente_nome = meuNome; upd.status = "em_atendimento"; }
      await admin.from("atendimento_conversas").update(upd).eq("id", conv.id);
    }
  } catch (e) { console.error("registro atendimento", e); }
  return { externoId, instancia, numero };
}

/** Primeira data que respeita prazo e (se existir) limite diário do Tipo de Ordem. */
async function sugerirData(config: any, serviceTypeId: string, prazoDias: number) {
  const st = (config.serviceTypes || []).find((s: any) => s.id === serviceTypeId);
  const prazoMin = st && Number(st.prazoMinimoDias) > 0 ? Number(st.prazoMinimoDias) : 0;
  const maxDia = st && Number(st.maxPorDia) > 0 ? Number(st.maxPorDia) : 0;
  let d = addDias(hojeBR(), Math.max(prazoDias || 0, prazoMin));
  if (!maxDia) return { data: d, motivo: "prazo" };
  for (let i = 0; i < 90; i++) {
    const { count, error } = await admin.from("ordens_servico").select("id", { count: "exact", head: true }).eq("payload->>serviceTypeId", serviceTypeId).eq("payload->>data", d).eq("payload->>status", "aguardando");
    if (error) throw error;
    if ((count || 0) < maxDia) return { data: d, motivo: "vaga", ocupadas: count || 0, vagas: maxDia };
    d = addDias(d, 1);
  }
  return { data: d, motivo: "sem vaga em 90 dias" };
}
async function garantirCliente(p: any) {
  const digits = onlyDigits(p.cliente?.telefone); if (digits.length < 10) return null;
  const { data } = await admin.from("clientes_cadastro").select("id,payload").ilike("payload->>telefone", `%${digits.slice(-8)}%`).limit(10);
  const achado = (data || []).find((c: any) => onlyDigits(c.payload?.telefone) === digits);
  if (achado) return achado.id;
  const id = uid("cli_"); const e = p.endereco || {};
  const cli = { id, nome: p.cliente.nome, telefone: p.cliente.telefone, email: p.cliente.email || "", cpf: "", cep: e.cep || "", endereco: e.logradouro || "", numero: e.numero || "", complemento: e.complemento || "", bairro: e.bairro || "", cidade: e.cidade || "", estado: e.uf || "", criadoEm: Date.now(), origem: "reforma" };
  const { error } = await admin.from("clientes_cadastro").insert({ id, payload: cli });
  if (error) { console.error("cliente", error); return null; }
  return id;
}
function textoCustodiaItem(it: any) { const e = it.custodia?.entrada; if (!e) return ""; return `PESO ${e.peso} g · TEOR ${e.teor}${e.teorObs ? " (" + e.teorObs + ")" : ""} · LACRE ${e.lacre}`; }
function nomeItem(it: any, i: number) { return `PEÇA ${i + 1} — ${it.servicoNome || it.servico}: ${it.descricao}`; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || ""); const params = body.params || {};
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
    const config = await loadConfig();
    const rcfg = await loadReformaRow("config");
    const fc = freteCfg(rcfg);

    // ==================== PÚBLICO ====================
    if (op === "publicInit") {
      return json({ ok: true, lojas: lojasPublicas(config, rcfg), servicos: servicosCfg(rcfg), maxItens: MAX_ITENS,
        frete: { gratisAcima: fc.gratisAcima != null && Number(fc.gratisAcima) > 0 ? Number(fc.gratisAcima) : null, correiosDisponivel: rcfg.correiosAtivo !== false },
        textos: { titulo: rcfg.tituloPublico || "Reforma de joias", subtitulo: rcfg.subtituloPublico || "Mande as fotos de cada peça, receba o orçamento no WhatsApp e aprove só o que quiser.",
          termo: rcfg.termoCliente || "Ao enviar, você autoriza o uso das fotos e do seu telefone apenas para este orçamento (LGPD). O orçamento tem validade de 10 dias." } });
    }
    if (op === "publicCriar") {
      const tel = onlyDigits(params.telefone); const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count: cTel } = await admin.from("reforma_pedidos").select("id", { count: "exact", head: true }).eq("telefone_digits", tel).gte("created_at", desde);
      if ((cTel || 0) >= LIMITE_PEDIDOS_TEL_24H) return json({ error: "Limite de pedidos por dia atingido para este telefone." }, 429);
      const { count: cIp } = await admin.from("reforma_pedidos").select("id", { count: "exact", head: true }).eq("payload->aceiteTermos->>ip", ip).gte("created_at", desde);
      if ((cIp || 0) >= LIMITE_PEDIDOS_IP_24H) return json({ error: "Muitos pedidos deste dispositivo. Tente mais tarde." }, 429);
      if (!params.aceiteTermos) return json({ error: "É preciso aceitar os termos." }, 400);
      const r = await criarPedido(params, config, rcfg, "cliente", "CLIENTE", ip);
      return json({ ok: true, token: r.token, codigo: r.codigo });
    }
    if (op === "publicConsultar") {
      const row = await getPedidoPorToken(String(params.token || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      return json({ ok: true, pedido: await visaoCliente(row, config, rcfg) });
    }
    if (op === "publicAceitar") {
      const row = await getPedidoPorToken(String(params.token || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (p.status !== STATUS.ORCADO) return json({ error: "Este orçamento não está aguardando resposta." }, 400);
      if (orcamentoExpirado(p)) return json({ error: "Orçamento vencido. Peça um novo pela loja." }, 400);
      const ids = new Set(Array.isArray(params.itensAprovados) ? params.itensAprovados.map(String) : []);
      for (const it of p.itens) it.aprovado = ids.has(it.id) && !!it.orcamento && !it.orcamento.inviavel && Number(it.orcamento.valor) > 0;
      const aprov = itensAprovados(p);
      if (!aprov.length) {
        p.status = STATUS.RECUSADO; p.aceite = null;
        p.recusa = { em: Date.now(), motivo: String(params.motivo || "").slice(0, 300) };
        evento(p, "recusado", "CLIENTE", p.recusa.motivo || "Nenhuma peça aprovada");
      } else {
        const totais = calcularTotais(p, aprov);
        p.status = STATUS.APROVADO; p.recusa = null;
        p.aceite = { em: Date.now(), modo: "online", ip, ua: String(params.ua || "").slice(0, 200), itens: aprov.map((it: any) => ({ id: it.id, valor: it.orcamento.valor })), totais, prazoDias: p.orcamento.prazoDias, texto: String(params.texto || "").slice(0, 500) };
        evento(p, "aprovado", "CLIENTE", `Aceite online: ${aprov.length}/${p.itens.length} peça(s) · total ${fmtMoney(totais.total)}`);
      }
      await salvarPedido(row, p);
      return json({ ok: true, pedido: await visaoCliente({ ...row, payload: p }, config, rcfg) });
    }

    // ==================== INTERNO ====================
    const senha = body.senha;
    const user = (Array.isArray(config.users) ? config.users : []).find((u: any) => sessaoValida(u, senha)) || null;
    if (!user) return json({ error: "Sessão inválida ou expirada." }, 401);
    if (!moduloAtivo(user)) return json({ error: "Sem permissão para o módulo Reforma." }, 403);
    const por = user.nome; const lojasUser: string[] = Array.isArray(user.lojas) ? user.lojas : [];
    const podeVerLoja = (lojaId: string) => gestaoTotal(user) || !lojasUser.length || lojasUser.includes(lojaId);

    if (op === "init") {
      const seg = gestaoTotal(user) ? await loadReformaRow("segredos") : {};
      return json({ ok: true, user: usuarioPublico(user), lojas: (config.lojas || []).map((l: any) => ({ id: l.id, nome: l.nome, abreviacao: l.abreviacao, cor: l.cor, cep: onlyDigits(l.cep || "") })),
        serviceTypes: config.serviceTypes || [], servicos: servicosCfg(rcfg), config: rcfg, frete: fc, lojasPublicas: lojasPublicas(config, rcfg), gestao: gestaoTotal(user),
        whatsappInstancia: instanciaPadrao(config, rcfg), instanciasConhecidas: Object.keys(config.atendimentoInstancias || {}).filter((k) => !k.startsWith("ig_")),
        segredosStatus: { correios: !!(seg.correiosUsuario && seg.correiosCodigoAcesso && seg.correiosCartao), correiosUsuario: seg.correiosUsuario || "", correiosCartao: seg.correiosCartao || "" } });
    }
    if (op === "listar") {
      let q = admin.from("reforma_pedidos").select("id,numero,status,loja_id,created_at,updated_at,payload").order("created_at", { ascending: false }).limit(500);
      if (Array.isArray(params.status) && params.status.length) q = q.in("status", params.status);
      if (params.lojaId) q = q.eq("loja_id", params.lojaId);
      if (params.de) q = q.gte("created_at", params.de + "T00:00:00-03:00");
      if (params.ate) q = q.lte("created_at", params.ate + "T23:59:59-03:00");
      const { data, error } = await q; if (error) throw error;
      const busca = String(params.busca || "").trim().toUpperCase(); const bd = onlyDigits(busca);
      const lista = (data || []).filter((r: any) => podeVerLoja(r.loja_id)).map((r: any) => { normalizar(r.payload); return r; }).filter((r: any) => {
        if (!busca) return true; const p = r.payload || {};
        return codigoDe(r.numero).includes(busca) || String(p.cliente?.nome || "").includes(busca) || (bd.length >= 4 && onlyDigits(p.cliente?.telefone).includes(bd)) ||
          String(p.os?.codigoVia || "").toUpperCase().includes(busca) || (p.itens || []).some((it: any) => String(it.custodia?.entrada?.lacre || "").toUpperCase().includes(busca)) || String(p.postagem?.rastreio || "").toUpperCase().includes(busca);
      }).map((r: any) => {
        const p = r.payload || {}; const aprov = itensAprovados(p);
        const valor = p.aceite?.totais?.total ?? (p.orcamento ? calcularTotais(p, (p.itens || []).filter((it: any) => it.orcamento && !it.orcamento.inviavel)).total : null);
        return { id: r.id, codigo: codigoDe(r.numero), status: orcamentoExpirado(p) ? "expirado" : r.status, lojaId: r.loja_id, criadoEm: p.criadoEm, cliente: p.cliente,
          resumo: (p.itens || []).map((it: any) => it.servicoNome || it.servico).join(", "), nItens: (p.itens || []).length, nAprovados: aprov.length, valor, validadeAte: p.orcamento?.validadeAte || null,
          entrega: p.entrega?.modo, devolucao: p.devolucao?.modo, os: p.os ? { codigoVia: p.os.codigoVia, data: p.os.data } : null, origem: p.origem, rastreio: p.postagem?.rastreio || null };
      });
      return json({ ok: true, pedidos: lista });
    }
    if (op === "obter") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      if (!podeVerLoja(row.loja_id)) return json({ error: "Pedido de outra loja." }, 403);
      const p = row.payload;
      const out: any = { ...p, codigo: codigoDe(row.numero), numero: row.numero, statusCalc: orcamentoExpirado(p) ? "expirado" : p.status, itens: await assinarItens(p.itens || []) };
      if (out.custodia?.fotosPacote) out.custodia = { ...out.custodia, fotosPacote: await assinarFotos(out.custodia.fotosPacote) };
      if (out.postagem?.fotos) out.postagem = { ...out.postagem, fotos: await assinarFotos(out.postagem.fotos) };
      out.totaisPrevia = p.orcamento ? calcularTotais(p, p.aceite ? itensAprovados(p) : (p.itens || []).filter((it: any) => it.orcamento && !it.orcamento.inviavel)) : null;
      return json({ ok: true, pedido: out });
    }
    if (op === "criarBalcao") { const r = await criarPedido(params, config, rcfg, "balcao", por, ip); return json({ ok: true, ...r }); }
    if (op === "calcularFrete") {
      if (params.id) {
        const row = await getPedido(String(params.id)); if (!row) return json({ error: "Pedido não encontrado." }, 404);
        const p = row.payload;
        const valorDecl = params.valorDeclarado != null ? num(params.valorDeclarado) : subtotalItens((p.itens || []).filter((it: any) => it.orcamento));
        return json({ ok: true, ...(await calcularFretePedido(config, rcfg, p, String(params.servicoIda || fc.servicoPadrao), String(params.servicoVolta || fc.servicoPadrao), valorDecl > 0 ? valorDecl : null)) });
      }
      // teste livre (Configurações): origem = CEP da loja, destino = CEP informado
      const cepLoja = cepDaLoja(config, rcfg, String(params.lojaId || "loja_mc"));
      const r = await calcularPerna(config, rcfg, String(params.servico || fc.servicoPadrao), cepLoja, String(params.cepDestino || ""), Number(params.pesoG) || pesoPacoteG(rcfg, []), num(params.valorDeclarado) > 0 ? num(params.valorDeclarado) : null);
      return json({ ok: true, cepLoja, resultado: r });
    }
    if (op === "orcar") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (![STATUS.NOVO, STATUS.ORCADO, STATUS.RECUSADO].includes(p.status)) return json({ error: "Este pedido já passou da fase de orçamento." }, 400);
      const prazoDias = parseInt(params.prazoDias, 10); if (!(prazoDias >= 0)) return json({ error: "Prazo inválido." }, 400);
      const validadeDias = parseInt(params.validadeDias, 10) > 0 ? parseInt(params.validadeDias, 10) : VALIDADE_ORCAMENTO_DIAS;
      const itensIn: any[] = Array.isArray(params.itens) ? params.itens : [];
      let algumViavel = false;
      for (const it of p.itens) {
        const inp = itensIn.find((x: any) => String(x.id) === it.id) || {};
        const inviavel = !!inp.inviavel; const valor = num(inp.valor);
        if (!inviavel && !(valor > 0)) return json({ error: `Informe o valor da peça "${(it.descricao || "").slice(0, 40)}" ou marque como inviável.` }, 400);
        it.orcamento = { valor: inviavel ? 0 : round2(valor), obsPublica: String(inp.obsPublica || "").trim().slice(0, 600), obsInterna: String(inp.obsInterna || "").trim().slice(0, 600), inviavel };
        it.aprovado = null; if (!inviavel) algumViavel = true;
      }
      if (!algumViavel) return json({ error: "Marque pelo menos uma peça com valor." }, 400);
      const fIn = params.frete || {};
      const perna = (x: any) => x && num(x.valor) >= 0 ? { servico: String(x.servico || fc.servicoPadrao).toUpperCase(), valor: round2(num(x.valor) || 0), prazo: x.prazo != null && x.prazo !== "" ? Number(x.prazo) : null, origem: x.origem || "manual" } : null;
      p.orcamento = {
        prazoDias, validadeAte: addDias(hojeBR(), validadeDias), cotacaoOuroG: params.cotacaoOuroG ? num(params.cotacaoOuroG) : null,
        obsGeral: String(params.obsGeral || "").trim().slice(0, 800), obsInterna: String(params.obsInterna || "").trim().slice(0, 800), em: Date.now(), por,
        frete: { ida: p.entrega?.modo === "correios" ? perna(fIn.ida) : null, volta: p.devolucao?.modo === "correios" ? perna(fIn.volta) : null, gratis: !!fIn.gratis, reembolsarIda: !!fIn.reembolsarIda, gratisAcima: fc.gratisAcima != null && Number(fc.gratisAcima) > 0 ? Number(fc.gratisAcima) : null },
      };
      if (p.devolucao?.modo === "correios" && !(p.orcamento.frete.volta && p.orcamento.frete.volta.valor > 0)) return json({ error: "Informe o valor do frete de retorno (Correios) — calcule pelo botão ou digite. Se for grátis, informe o valor e marque 'frete grátis'." }, 400);
      p.status = STATUS.ORCADO; p.aceite = null; p.recusa = null;
      const tot = calcularTotais(p, p.itens.filter((it: any) => it.orcamento && !it.orcamento.inviavel));
      evento(p, "orcado", por, `${p.itens.filter((it: any) => !it.orcamento.inviavel).length} peça(s) · serviços ${fmtMoney(tot.subtotal)} · total ${fmtMoney(tot.total)} · ${prazoDias} dia(s)`);
      await salvarPedido(row, p);
      return json({ ok: true, totais: tot });
    }
    if (op === "aceitePresencial") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (p.status !== STATUS.ORCADO && p.status !== STATUS.RECUSADO) return json({ error: "Só é possível registrar aceite de orçamento enviado." }, 400);
      const ids = new Set(Array.isArray(params.itensAprovados) ? params.itensAprovados.map(String) : p.itens.filter((it: any) => it.orcamento && !it.orcamento.inviavel).map((it: any) => it.id));
      for (const it of p.itens) it.aprovado = ids.has(it.id) && !!it.orcamento && !it.orcamento.inviavel;
      const aprov = itensAprovados(p); if (!aprov.length) return json({ error: "Selecione pelo menos uma peça aprovada." }, 400);
      const totais = calcularTotais(p, aprov);
      p.status = STATUS.APROVADO; p.recusa = null;
      p.aceite = { em: Date.now(), modo: "presencial", por, itens: aprov.map((it: any) => ({ id: it.id, valor: it.orcamento.valor })), totais, prazoDias: p.orcamento?.prazoDias };
      evento(p, "aprovado", por, `Aceite presencial: ${aprov.length}/${p.itens.length} peça(s) · total ${fmtMoney(totais.total)}`);
      await salvarPedido(row, p);
      return json({ ok: true });
    }
    if (op === "anotar") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload; const texto = String(params.texto || "").trim().slice(0, 600); if (!texto) return json({ error: "Anotação vazia." }, 400);
      evento(p, "anotacao", por, texto); await salvarPedido(row, p); return json({ ok: true });
    }
    if (op === "sugerirData") return json({ ok: true, ...(await sugerirData(config, String(params.serviceTypeId || ""), parseInt(params.prazoDias, 10) || 0)) });
    if (op === "checkin") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (![STATUS.APROVADO, STATUS.OS_GERADA, STATUS.NOVO, STATUS.ORCADO].includes(p.status)) return json({ error: "Status não permite check-in." }, 400);
      if (p.custodia?.entrada) return json({ error: "Check-in já registrado." }, 400);
      const alvo = p.aceite ? itensAprovados(p) : p.itens;
      if (!alvo.length) return json({ error: "Nenhuma peça para receber." }, 400);
      const itensIn: any[] = Array.isArray(params.itens) ? params.itens : [];
      // valida tudo antes de subir qualquer foto
      for (let i = 0; i < alvo.length; i++) {
        const it = alvo[i]; const inp = itensIn.find((x: any) => String(x.id) === it.id) || {};
        if (!(num(inp.peso) > 0)) return json({ error: `Peso de entrada obrigatório na peça ${i + 1}.` }, 400);
        if (!String(inp.lacre || "").trim()) return json({ error: `Número do lacre obrigatório na peça ${i + 1}.` }, 400);
        if (!Array.isArray(inp.fotos) || !inp.fotos.length) return json({ error: `Fotografe a peça ${i + 1} na entrada — a foto é obrigatória.` }, 400);
      }
      for (let i = 0; i < alvo.length; i++) {
        const it = alvo[i]; const inp = itensIn.find((x: any) => String(x.id) === it.id);
        it.custodia = it.custodia || { entrada: null, saida: null };
        it.custodia.entrada = { peso: Math.round(num(inp.peso) * 1000) / 1000, teor: maiusc(inp.teor) || "NÃO TESTADO", teorObs: String(inp.teorObs || "").trim().slice(0, 200), lacre: maiusc(inp.lacre), observacoes: String(inp.observacoes || "").trim().slice(0, 400), fotos: await subirFotos(row.id, "entrada_" + (i + 1), inp.fotos, por), em: Date.now(), por };
      }
      p.custodia = { ...(p.custodia || {}), entrada: { em: Date.now(), por, lojaId: params.lojaId || p.lojaId, observacoes: String(params.observacoes || "").trim().slice(0, 600),
        assinatura: typeof params.assinatura === "string" && params.assinatura.startsWith("data:image/png") && params.assinatura.length < 400000 ? params.assinatura : null, recebidoPelosCorreios: p.entrega?.modo === "correios" },
        fotosPacote: Array.isArray(params.fotosPacote) && params.fotosPacote.length ? await subirFotos(row.id, "pacote", params.fotosPacote, por, 4) : [] };
      if (p.status !== STATUS.OS_GERADA) p.status = STATUS.EM_CUSTODIA;
      evento(p, "checkin", por, alvo.map((it: any, i: number) => `peça ${i + 1}: ${it.custodia.entrada.peso} g · lacre ${it.custodia.entrada.lacre}`).join(" | "));
      if (p.os?.id) {
        const { data: os } = await admin.from("ordens_servico").select("payload").eq("id", p.os.id).maybeSingle();
        if (os && os.payload && os.payload.reformaId === row.id) {
          const pl = os.payload; pl.infoInterna = [pl.infoInterna || "", "CUSTÓDIA: " + alvo.map((it: any, i: number) => `PEÇA ${i + 1} ${textoCustodiaItem(it)}`).join(" | ")].filter(Boolean).join("\n");
          await admin.from("ordens_servico").update({ payload: pl, updated_at: new Date().toISOString() }).eq("id", p.os.id);
        }
      }
      await salvarPedido(row, p);
      return json({ ok: true });
    }
    if (op === "gerarOS") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (p.os?.id) return json({ error: "Este pedido já tem O.S. " + (p.os.codigoVia || "") }, 400);
      if (![STATUS.APROVADO, STATUS.EM_CUSTODIA].includes(p.status) || !p.aceite) return json({ error: "Gere a O.S. só depois do aceite do cliente." }, 400);
      const aprov = itensAprovados(p); if (!aprov.length) return json({ error: "Nenhuma peça aprovada." }, 400);
      const lojaId = String(params.lojaId || p.lojaId); const loja = lojaDe(config, lojaId); if (!loja) return json({ error: "Loja inválida." }, 400);
      const st = (config.serviceTypes || []).find((s: any) => s.id === params.serviceTypeId); if (!st) return json({ error: "Escolha o Tipo de Ordem." }, 400);
      const data = /^\d{4}-\d{2}-\d{2}$/.test(String(params.data || "")) ? String(params.data) : (await sugerirData(config, st.id, p.orcamento.prazoDias)).data;
      const abrev = String(loja.abreviacao || "XX").toUpperCase().trim();
      const { data: seq, error: eSeq } = await admin.rpc("incrementar_via_sequence", { p_chave: `codigo_${abrev}_pedido` }); if (eSeq) throw eSeq;
      const codigoVia = `${abrev}${seq}P`; const codigo = codigoDe(row.numero);
      const totais = calcularTotais(p, aprov);
      const todasFotos = aprov.flatMap((it: any) => [...(it.fotos || []), ...((it.custodia?.entrada?.fotos) || [])]);
      const fotosOS = (await assinarFotos(todasFotos, SIGNED_LONGO)).filter((f: any) => f.url).map((f: any) => ({ id: f.id, nome: f.nome || f.id, criadoEm: f.criadoEm || Date.now(), driveUrl: f.url }));
      const linhas = aprov.map((it: any, i: number) => [nomeItem(it, i), it.orcamento.obsPublica ? "OBS: " + it.orcamento.obsPublica : "", textoCustodiaItem(it)].filter(Boolean).join(" · "));
      const descricao = maiusc([`REFORMA ${codigo} (${aprov.length} PEÇA(S))`, ...linhas, p.devolucao?.modo === "correios" ? `DEVOLUÇÃO PELOS CORREIOS (${p.orcamento.frete?.volta?.servico || ""}) — CEP ${p.endereco?.cep || ""}` : "", params.descricaoExtra].filter(Boolean).join(" | ")).slice(0, 4000);
      const itensOS: any[] = aprov.map((it: any, i: number) => ({ id: uid("it"), produto: maiusc(`REFORMA - ${it.servicoNome || it.servico}`), metal: "", quantidade: 1, valorUnitario: it.orcamento.valor, produtoEstoqueId: "", precoOriginal: "", ajusteTipo: "nenhum", ajusteModo: "percentual", ajusteQtd: "", ajustePerc: "", ajusteValR: "", observacaoItem: maiusc(nomeItem(it, i)).slice(0, 300) }));
      if (totais.freteCobrado > 0) itensOS.push({ id: uid("it"), produto: maiusc(`FRETE RETORNO CORREIOS ${p.orcamento.frete?.volta?.servico || ""}`), metal: "", quantidade: 1, valorUnitario: totais.freteCobrado, produtoEstoqueId: "", precoOriginal: "", ajusteTipo: "nenhum", ajusteModo: "percentual", ajusteQtd: "", ajustePerc: "", ajusteValR: "", observacaoItem: `CEP ${p.endereco?.cep || ""}` });
      if (totais.reembolso > 0) itensOS.push({ id: uid("it"), produto: "REEMBOLSO ENVIO DO CLIENTE (CORREIOS)", metal: "", quantidade: 1, valorUnitario: -totais.reembolso, produtoEstoqueId: "", precoOriginal: "", ajusteTipo: "nenhum", ajusteModo: "percentual", ajusteQtd: "", ajustePerc: "", ajusteValR: "", observacaoItem: "DESCONTO — CONFERIR COMPROVANTE DA AGÊNCIA" });
      const e = p.endereco || {};
      const order: any = {
        id: uid("ord"), cliente: maiusc(p.cliente.nome), telefone: p.cliente.telefone || "", email: p.cliente.email || "", cpf: "", dataNascimento: "",
        cep: e.cep || "", endereco: e.logradouro || "", numero: e.numero || "", complemento: e.complemento || "", bairro: e.bairro || "", cidade: e.cidade || "", estado: e.uf || "",
        via: "", numeroNota: "", vendedora: maiusc(params.vendedora || por), descricao, lojaId, serviceTypeId: st.id, serviceTypeName: st.nome || "",
        data, status: "aguardando", encaixe: false, autorizadoPor: null, valorTotal: totais.total, pagamentos: [], momentoPagamento: "na_volta", emissaoNota: "",
        lojaSaidaId: "", lojaPagamentoId: "", lojaNotaId: "", localAtual: "loja", historicoLocal: [{ local: "loja", em: Date.now(), por }], observacoes: [], fotos: fotosOS,
        infoInterna: [`GERADA PELO MÓDULO REFORMA (${codigo}) POR ${por}`, totais.absorvido > 0 ? `FRETE ABSORVIDO PELA LOJA: ${fmtMoney(totais.absorvido)}${totais.gratis ? " (FRETE GRÁTIS)" : ""}${totais.reembolso ? " · REEMBOLSO ENVIO " + fmtMoney(totais.reembolso) : ""}` : "",
          p.orcamento.obsInterna ? "OBS ORÇAMENTO: " + maiusc(p.orcamento.obsInterna) : "", ...aprov.map((it: any, i: number) => it.orcamento.obsInterna ? `PEÇA ${i + 1} INTERNO: ${maiusc(it.orcamento.obsInterna)}` : "")].filter(Boolean).join("\n"),
        creditoUsado: 0, fiadoDebitoId: null, criadoEm: Date.now(), codigoVia, itens: itensOS, origem: "reforma", reformaId: row.id, reformaCodigo: codigo,
      };
      const { error: eIns } = await admin.from("ordens_servico").insert({ id: order.id, payload: order, updated_at: new Date().toISOString() }); if (eIns) throw eIns;
      const clienteId = await garantirCliente(p);
      p.os = { id: order.id, codigoVia, lojaId, serviceTypeId: st.id, serviceTypeName: st.nome || "", data, em: Date.now(), por, clienteId, totais };
      p.status = STATUS.OS_GERADA;
      evento(p, "os_gerada", por, `O.S. ${codigoVia} · ${aprov.length} peça(s) · ${fmtMoney(totais.total)} · previsão ${data}`);
      await salvarPedido(row, p);
      return json({ ok: true, os: p.os });
    }
    if (op === "checkout") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (!p.custodia?.entrada) return json({ error: "Faça o check-in de entrada antes." }, 400);
      if (p.custodia?.saida) return json({ error: "Check-out já registrado." }, 400);
      const alvo = p.aceite ? itensAprovados(p) : p.itens; const itensIn: any[] = Array.isArray(params.itens) ? params.itens : [];
      for (let i = 0; i < alvo.length; i++) {
        const inp = itensIn.find((x: any) => String(x.id) === alvo[i].id) || {};
        if (!(num(inp.peso) > 0)) return json({ error: `Peso de saída obrigatório na peça ${i + 1}.` }, 400);
        if (!Array.isArray(inp.fotos) || !inp.fotos.length) return json({ error: `Fotografe a peça ${i + 1} pronta — a foto é obrigatória.` }, 400);
      }
      for (let i = 0; i < alvo.length; i++) {
        const it = alvo[i]; const inp = itensIn.find((x: any) => String(x.id) === it.id);
        it.custodia = it.custodia || { entrada: null, saida: null };
        it.custodia.saida = { peso: Math.round(num(inp.peso) * 1000) / 1000, lacre: maiusc(inp.lacre), observacoes: String(inp.observacoes || "").trim().slice(0, 400), fotos: await subirFotos(row.id, "saida_" + (i + 1), inp.fotos, por), em: Date.now(), por };
      }
      p.custodia.saida = { em: Date.now(), por, observacoes: String(params.observacoes || "").trim().slice(0, 600) };
      p.status = STATUS.PRONTO;
      evento(p, "checkout", por, alvo.map((it: any, i: number) => `peça ${i + 1}: ${it.custodia.saida.peso} g`).join(" | "));
      await salvarPedido(row, p);
      return json({ ok: true });
    }
    if (op === "postar") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (p.status !== STATUS.PRONTO) return json({ error: "Registre o check-out antes de postar." }, 400);
      const rastreio = maiusc(params.rastreio); if (rastreio.length < 8) return json({ error: "Informe o código de rastreio." }, 400);
      if (!Array.isArray(params.fotos) || !params.fotos.length) return json({ error: "Fotografe o comprovante de postagem." }, 400);
      p.postagem = { rastreio, servico: String(params.servico || p.orcamento?.frete?.volta?.servico || "").toUpperCase(), valorPago: num(params.valorPago) > 0 ? round2(num(params.valorPago)) : null, fotos: await subirFotos(row.id, "postagem", params.fotos, por, 4), em: Date.now(), por };
      p.status = STATUS.ENVIADO;
      evento(p, "postado", por, `Correios ${p.postagem.servico} · rastreio ${rastreio}`);
      await salvarPedido(row, p);
      return json({ ok: true });
    }
    if (op === "entregar") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (p.status !== STATUS.PRONTO && p.status !== STATUS.ENVIADO) return json({ error: "Registre o check-out (peso de saída) antes da entrega." }, 400);
      p.custodia = p.custodia || {};
      p.custodia.entrega = { em: Date.now(), por, modo: p.status === STATUS.ENVIADO ? "correios" : "loja", recebidoPor: maiusc(params.recebidoPor || p.cliente.nome), assinatura: typeof params.assinatura === "string" && params.assinatura.startsWith("data:image/png") && params.assinatura.length < 400000 ? params.assinatura : null };
      p.status = STATUS.ENTREGUE;
      evento(p, "entregue", por, `Recebido por ${p.custodia.entrega.recebidoPor}`);
      await salvarPedido(row, p);
      return json({ ok: true });
    }
    if (op === "cancelar") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if ([STATUS.ENTREGUE, STATUS.CANCELADO].includes(p.status)) return json({ error: "Pedido já encerrado." }, 400);
      const motivo = String(params.motivo || "").trim().slice(0, 300); if (!motivo) return json({ error: "Informe o motivo." }, 400);
      p.cancelamento = { motivo, em: Date.now(), por }; p.status = STATUS.CANCELADO;
      evento(p, "cancelado", por, motivo); await salvarPedido(row, p); return json({ ok: true });
    }
    if (op === "enviarWhatsApp") {
      const texto = String(params.texto || "").trim().slice(0, 3000); if (!texto) return json({ error: "Mensagem vazia." }, 400);
      if (params.id) {
        const row = await getPedido(String(params.id)); if (!row) return json({ error: "Pedido não encontrado." }, 404);
        const p = row.payload;
        const r = await enviarWhatsApp(config, rcfg, user, p.cliente?.telefone || "", texto);
        evento(p, "whatsapp", por, `${String(params.tipo || "mensagem")} enviada pela instância ${r.instancia}`);
        await salvarPedido(row, p);
        return json({ ok: true, ...r });
      }
      if (!gestaoTotal(user)) return json({ error: "Só gestão envia teste." }, 403);
      const r = await enviarWhatsApp(config, rcfg, user, String(params.telefone || ""), texto);
      return json({ ok: true, ...r });
    }
    if (op === "listarInstancias") {
      if (!gestaoTotal(user)) return json({ error: "Só Diretoria/Gerente." }, 403);
      const lista = await evolution("/instance/fetchInstances", null, "GET");
      const out = (Array.isArray(lista) ? lista : []).map((it: any) => ({ nome: it.name || (it.instance && it.instance.instanceName) || "", estado: it.connectionStatus || (it.instance && it.instance.status) || it.state || "", perfil: it.profileName || null })).filter((x: any) => x.nome);
      return json({ ok: true, instancias: out });
    }
    if (op === "salvarConfig") {
      if (!gestaoTotal(user)) return json({ error: "Só Diretoria/Gerente altera a configuração." }, 403);
      const novo = params.config && typeof params.config === "object" ? params.config : null; if (!novo) return json({ error: "Config inválida." }, 400);
      const { error } = await admin.from("reforma_config").upsert({ id: "config", payload: novo, updated_at: new Date().toISOString() }); if (error) throw error;
      return json({ ok: true });
    }
    if (op === "salvarSegredos") {
      if (!gestaoTotal(user)) return json({ error: "Só Diretoria/Gerente." }, 403);
      const atual = await loadReformaRow("segredos");
      const novo = { ...atual };
      for (const k of ["correiosUsuario", "correiosCodigoAcesso", "correiosCartao"]) if (params[k] !== undefined && String(params[k]).trim() !== "") novo[k] = String(params[k]).trim();
      if (params.limparCorreios) { delete novo.correiosUsuario; delete novo.correiosCodigoAcesso; delete novo.correiosCartao; }
      __correiosToken = null;
      const { error } = await admin.from("reforma_config").upsert({ id: "segredos", payload: novo, updated_at: new Date().toISOString() }); if (error) throw error;
      return json({ ok: true, correios: !!(novo.correiosUsuario && novo.correiosCodigoAcesso && novo.correiosCartao) });
    }
    return json({ error: "op desconhecida: " + op }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
