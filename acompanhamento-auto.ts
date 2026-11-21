// acompanhamento-auto v25 (22/11/2026): orçamento com MODELO POR SITUAÇÃO (orcModelo) — pronto / encerrado / aprovado nos modelos próprios de Utilidade (nº do orçamento + loja + botão "Ver orçamento") só depois que a Meta aprovar; lembretes (Ação de fixação, Prorrogado) sempre no modelo de lembrete (orc_lembrete, Marketing). Sem modelo próprio aprovado, cai no genérico "orcamento" como antes.
// acompanhamento-auto v24 (22/11/2026): orçamento pela API oficial leva só a FRASE CURTA (fraseOrc) — detalhes no link, para aprovar como Utilidade.
// acompanhamento-auto v23 (22/11/2026): variáveis conforme o modelo ATIVO (meta_modelos.corpo); pós-venda {{2}} = texto do pós-venda e botão "Avaliar no Google" com o link da loja (se o ativo tiver botao_dinamico); miolo igual ao disparo-cloud v9.
// acompanhamento-auto v22 (22/11/2026): Reforma Joias (chip reformajoias) sai SEM o link wa.me da Vilaça e sem o pedido de 👍 (limpaTextoReforma, igual ao enviar-via v18); orçamento: "Aqui é <vendedora>."
// acompanhamento-auto v21 (22/11/2026): miolo() do orçamento — links saem mas o texto do parágrafo fica (convite "o que podemos melhorar" do Recusado); "Aqui é <vendedora>, da <loja>." vira "Atendimento: <vendedora>." (loja não repete); sem emoji solto no início. supabase-js fixado em 2.119.0.
// acompanhamento-auto v20 (12/11/2026): o aviso de PEDIDO PRONTO deixou de sair sozinho (so automatico se config.pedidoAcoes.prontoAuto === true; padrao desligado) - o aviso de pronto e MANUAL pelo botao do WhatsApp. Continuam automaticos: orcamentos (todos os status), pos-venda (venda e pedido entregue).
// acompanhamento-auto v19 (11/11/2026): TUDO pela API OFICIAL da Meta (número 32 98830-7617), sem depender do chip. Pós-venda (venda e pedido entregue) → pos_venda_garantia; ações de ORÇAMENTO (inclusive a do orçamento salvo) → orcamento_acompanhamento (ORC_API='on'); aviso de PEDIDO PRONTO → pedido_pronto_acompanhamento (PRONTO_API='on'); campanhas da fila (tipo campanha) são promovidas para a fila oficial (CAMPANHA_API='on'). Envio oficial sai em sequência (2 s), dentro da janela 9h–20h. Desliga tudo com atendimento_segredos.OFICIAL_TUDO='off' (volta ao chip). v19: o nome do modelo vem da tabela meta_modelos (tela 'Modelos WhatsApp') e o envio grava modelo/categoria em disparo_envios (painel de custos). v12–v18 e anteriores: ver AGENTS.md.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const MIN_INI = 9 * 60, MIN_FIM = 19 * 60, MIN_FIM_ENVIO = 20 * 60, LIMITE_MS = 50000, PISO_SEG_MS = 5 * 60000, FALHAS_PARA_PAUSAR = 3;
const WA_ATENDIMENTO = "https://wa.me/5532988307617";
const NL = String.fromCharCode(10);
let MAPA_MOD: Record<string, { nome: string; categoria: string; nVars: number; botao: boolean; status: string }> | null = null, MAPA_EM = 0;
const nVarsDe = (corpo: string) => new Set(String(corpo || "").match(/\{\{\s*\d+\s*\}\}/g) || []).size;
const CHAVE_DO_NOME: Record<string, string> = { orcamento_acompanhamento: "orcamento", pos_venda_garantia: "posvenda", pedido_pronto_acompanhamento: "pedido_pronto" };
let ULTIMO_MODELO: { modelo: string; categoria: string } | null = null;
async function modeloAtivo(nome: string): Promise<{ nome: string; categoria: string; nVars?: number; botao?: boolean }> {
  if (!MAPA_MOD || Date.now() - MAPA_EM > 60000) {
    MAPA_MOD = {}; MAPA_EM = Date.now();
    try { const { data } = await admin.from("meta_modelos").select("chave,nome_template,categoria,corpo,botao_dinamico,status"); for (const m of data || []) MAPA_MOD[m.chave] = { nome: m.nome_template, categoria: m.categoria, nVars: nVarsDe(m.corpo), botao: !!m.botao_dinamico, status: String(m.status || "") }; } catch (_) {}
  }
  const a = MAPA_MOD[CHAVE_DO_NOME[nome] || nome];   // v25: aceita também a chave do modelo (ex.: orc_pronto)
  return a ? a : { nome, categoria: "" };
}
let cacheInst: { em: number; v: string } | null = null;
async function instanciaDisparo(): Promise<string> {
  if (cacheInst && Date.now() - cacheInst.em < 60000) return cacheInst.v;
  let v = "vilaca";
  try { const { data } = await admin.from("atendimento_segredos").select("valor").eq("chave", "DISPARO_INSTANCIA").maybeSingle(); if (data && data.valor && String(data.valor).trim()) v = String(data.valor).trim(); } catch (_) {}
  cacheInst = { em: Date.now(), v };
  return v;
}
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const semAcento = (s: string) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const fone8 = (t: string) => String(t || "").replace(/\D/g, "").slice(-8);
const bonito = (t: string) => String(t || "").trim().toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
function celular(t: string): string | null {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11 || Number(d.slice(0, 2)) < 11 || d[2] !== "9") return null;
  return "55" + d;
}
function agoraBR(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), min: Number(p.hour) * 60 + Number(p.minute) };
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
function diaDe(ms: number) { return agoraBR(ms).dia; }
function janelaHoje(agoraMs: number, aposMs = 0) {
  const b = agoraBR(agoraMs);
  const ini = Date.parse(`${b.dia}T${hhmm(MIN_INI)}:00-03:00`);
  const fim = Date.parse(`${b.dia}T${hhmm(MIN_FIM)}:00-03:00`);
  const de = Math.max(agoraMs + 30000, ini, aposMs);
  if (de >= fim - 60000) return null;
  return { de, ate: fim };
}
function distribuir(n: number, jan: { de: number; ate: number }) {
  const horas: number[] = [];
  if (n <= 0) return { cabem: 0, horas };
  const parte = (jan.ate - jan.de) / n;
  if (parte >= 7 * 60000) {
    for (let i = 0; i < n; i++) horas.push(Math.round(jan.de + parte * i + Math.random() * (parte - PISO_SEG_MS)));
    return { cabem: n, horas };
  }
  let t = jan.de;
  for (let i = 0; i < n; i++) { if (t > jan.ate) break; horas.push(Math.round(t)); t += PISO_SEG_MS + Math.random() * 2 * 60000; }
  return { cabem: horas.length, horas };
}
function gapSeg(restantes: number, agoraMs = Date.now()) {
  const b = agoraBR(agoraMs);
  const fim = Date.parse(`${b.dia}T${hhmm(b.min < MIN_FIM ? MIN_FIM : MIN_FIM_ENVIO)}:00-03:00`);
  const base = 300 + Math.random() * 120;
  if (restantes <= 0) return Math.round(base);
  const espaco = (fim - agoraMs) / 1000 / restantes;
  return Math.round(espaco <= 420 ? base : Math.max(300, espaco * (0.75 + Math.random() * 0.5)));
}
const LINHA_JOINHA = "Responda com 👍 para confirmar que recebeu.";
function ajustaTextoDisparo(t: string): string {
  let x = String(t || "");
  x = x.replace(/N[ãa]o responda (a |esta |essa )?mensagem[.!]?\s*/gi, "");
  x = x.replace(/Caso precise falar conosco,?\s*clique no link:?/gi, "Para falar com a gente, é só clicar no link:");
  x = x.replace(/Para não receber mais mensagens, responda SAIR\.?/gi, "");
  if (!/wa\.me\/5532988307617/.test(x)) x = x.trimEnd() + "\n\nPara falar com a gente, é só clicar no link:\n" + WA_ATENDIMENTO;
  if (!/Responda com 👍/.test(x)) x = x.trimEnd() + "\n\n" + LINHA_JOINHA;
  return x.replace(/\n{3,}/g, "\n\n").trim();
}
async function registrarEnvio(tel: string, reg: any, tipo: string, id: string, origem: string) {
  try { await admin.from("disparo_envios").insert({ fone8: fone8(tel), telefone: tel, loja_id: reg.lojaId || null, vendedora: reg.vendedora || null, tipo, registro_id: id, origem, modelo: origem === "cloud_api" && ULTIMO_MODELO ? ULTIMO_MODELO.modelo : null, categoria: origem === "cloud_api" && ULTIMO_MODELO && ULTIMO_MODELO.categoria ? ULTIMO_MODELO.categoria : null }); } catch (_) {}
}
const fmtBRL = (v: unknown) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (s: unknown) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
/** v22: texto da instância da Reforma — sem o link "falar com a gente" (wa.me da Vilaça) e sem o pedido do 👍 (igual ao enviar-via). */
function limpaTextoReforma(t: string): string {
  let s = String(t || "");
  s = s.replace(/(Para falar com a gente, é só clicar no link|Caso precise falar conosco,?\s*clique no link|Clique no link):?[ \t]*\n?[ \t]*https?:\/\/wa\.me\/\S+/gi, "");
  s = s.replace(/Responda com 👍 para confirmar que recebeu\.?/g, "");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
function waMePrimeiro(t: string): string {
  const links = t.match(/https?:\/\/\S+/g) || [];
  if (links.length < 2 || /wa\.me\//.test(links[0])) return t;
  const paras = t.split(/\n\s*\n/);
  let i = -1;
  for (let k = paras.length - 1; k >= 0; k--) { const ls = paras[k].match(/https?:\/\/\S+/g) || []; if (ls.length && ls.every((l) => /wa\.me\//.test(l))) { i = k; break; } }
  if (i <= 0) return t;
  const p = paras.splice(i, 1)[0];
  return [p, ...paras].join("\n\n");
}
const varia = (t: string) => String(t || "").replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, (_m, g) => { const o = String(g).split("|"); return o[Math.floor(Math.random() * o.length)].trim(); });

async function oficialFlags(): Promise<{ tudo: boolean; orc: boolean; pronto: boolean; campanha: boolean }> {
  const f = { tudo: false, orc: false, pronto: false, campanha: false };
  try {
    const { data } = await admin.from("atendimento_segredos").select("chave, valor").in("chave", ["OFICIAL_TUDO", "ORC_API", "PRONTO_API", "CAMPANHA_API"]);
    const v: Record<string, string> = {}; for (const r of data || []) v[r.chave] = String(r.valor || "").trim().toLowerCase();
    const cred = !!Deno.env.get("WHATSAPP_CLOUD_TOKEN") && !!Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    f.tudo = cred && v.OFICIAL_TUDO !== "off";
    f.orc = v.ORC_API === "on"; f.pronto = v.PRONTO_API === "on"; f.campanha = v.CAMPANHA_API === "on";
  } catch (_) {}
  return f;
}
async function enviaModelo(tel: string, nome: string, params: string[], botao?: string): Promise<{ ok: boolean; status: number }> {
  const tk = Deno.env.get("WHATSAPP_CLOUD_TOKEN"), pid = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const limpa = (t: string) => String(t || "").split(NL).join(" ").split("\t").join(" ").split("    ").join(" ").split("   ").join(" ").split("  ").join(" ").trim().slice(0, 900);
  const at = await modeloAtivo(nome);
  ULTIMO_MODELO = { modelo: at.nome, categoria: at.categoria };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pid}/messages`, { method: "POST", headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      // v23: só as variáveis do modelo ATIVO; botão com link variável só se o ativo tiver
      body: JSON.stringify({ messaging_product: "whatsapp", to: tel, type: "template", template: { name: at.nome, language: { code: "pt_BR" }, components: [
        { type: "body", parameters: (at.nVars ? params.slice(0, at.nVars) : params).map((x) => ({ type: "text", text: limpa(x) || "-" })) },
        ...(at.botao && botao ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: botao }] }] : [])] } }), signal: AbortSignal.timeout(15000) });
    const j: any = await r.json().catch(() => ({}));
    return { ok: r.ok && !!(j && j.messages && j.messages[0]), status: r.status };
  } catch (_) { return { ok: false, status: 0 }; }
}
/** 22/11: frase CURTA do orçamento para o WhatsApp oficial ({{3}}). Mensagem neutra, de atualização do orçamento (categoria Utilidade = mais barata);
 *  valores, fotos e condições ficam no link. O texto completo do status continua indo só pelo número da Reforma. */
function fraseOrc(cfg: any, statusId: string): string {
  const st = ((cfg && cfg.statusOrcamento) || []).find((s: any) => s && s.id === statusId) || null;
  if (!st) return "Seu orçamento foi atualizado.";
  if (st.inicial) return "Seu orçamento está pronto.";
  if (st.encerra && statusId !== "aprovado") return "Seu orçamento foi encerrado. Se puder, conte no link o que podemos melhorar.";
  if (st.encerra) return "Seu orçamento foi aprovado.";
  return "Seu orçamento continua disponível para você.";
}
/** v25: modelo de cada situação do orçamento. Lembrete (status em aberto que não é o inicial) é Marketing pela regra da Meta
 *  ("lembrete de oferta é marketing, mesmo pedido pelo cliente") e NUNCA sai por modelo de Utilidade. */
function chaveOrc(cfg: any, statusId: string): string {
  const st = ((cfg && cfg.statusOrcamento) || []).find((s: any) => s && s.id === statusId) || null;
  if (!st) return "orcamento";
  if (st.inicial) return "orc_pronto";
  if (st.encerra) return statusId === "aprovado" ? "orc_aprovado" : "orc_encerrado";
  return "orc_lembrete";
}
/** v25: modelo + variáveis do orçamento. Modelo próprio da situação só depois de aprovado pela Meta (e com nº do orçamento); senão, o genérico "orcamento" como antes. */
async function orcModelo(cfg: any, reg: any, statusId: string, id: string): Promise<{ nome: string; params: string[]; botao?: string }> {
  await modeloAtivo("orcamento_acompanhamento");   // carrega o mapa dos modelos
  const k = chaveOrc(cfg, statusId);
  const proprio = MAPA_MOD ? MAPA_MOD[k] : null;
  const generico = [primeiroNome(reg.cliente), nomeDaLoja(cfg, reg), fraseOrc(cfg, statusId), linkOrc(id)];
  if (k === "orc_lembrete" && proprio) return { nome: k, params: generico };
  const cod = String((reg && reg.codigoVia) || "").trim();
  if (k !== "orc_lembrete" && k !== "orcamento" && proprio && proprio.status === "APPROVED" && cod) return { nome: k, params: [primeiroNome(reg.cliente), cod, nomeDaLoja(cfg, reg)], botao: encodeURIComponent(id) };
  return { nome: "orcamento_acompanhamento", params: generico };
}
function miolo(texto: string): string {
  // 22/11: links saem do parágrafo mas o TEXTO fica (o convite "o que podemos melhorar" do Recusado voltava cortado);
  // "Aqui é <vendedora>, da <loja>." vira "Aqui é <vendedora>." (o modelo já diz "Aqui é da <loja>": a loja saía duas vezes); emoji solto no começo sai.
  const paras = String(texto || "").split(NL + NL)
    .map((p) => p.replace(/https?:[/][/]\S+/g, "").replace(/[ \t]+$/gm, "").trim())
    .map((p) => p.replace(/\bwww[.]\S+/gi, "").trim())
    .filter((p) => p && !/Para falar com a gente/i.test(p) && !/Responda com/i.test(p) && !/responda SAIR/i.test(p) && !/Veja o seu or/i.test(p) && !/^(Clique no link|Caso precise falar conosco|N[ãa]o responda|Atenciosamente|Equipe Vila[çc]a)/i.test(p));
  let s = paras.join(" ").split(NL).join(" ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(Ol[aá]|Oi),? [^!]+! ?/i, "").replace(/^Feliz anivers[aá]rio[^!]*! ?/i, "").replace(/^[^\p{L}\p{N}*]+/u, "").replace(/Aqui [eé] da [^.]+[.] ?/i, "")
    .replace(/Aqui [eé] ([^,.!]{1,60}), da [^.!]+[.!] ?/i, "Aqui é $1. ");
  return s.replace(/\s+/g, " ").trim().slice(0, 900);
}
const primeiroNome = (t: string) => bonito(String(t || "").trim().split(/\s+/)[0] || "") || "cliente";

const RODAPE = `Para falar com a gente, é só clicar no link:\n${WA_ATENDIMENTO}`;
const MSG_ACAO_PADRAO = [
  `Olá, {cliente}! 😊\n\nAqui é da {loja}. Passando para saber se ficou alguma dúvida sobre o seu orçamento de {valor}. Se quiser, ajustamos o que for preciso para você fechar do jeito ideal.\n\nO orçamento vale até {validade}.\n\n${RODAPE}`,
  `Oi, {cliente}! Tudo bem? 💛\n\nSeu orçamento de {valor} na {loja} continua reservado para você. Podemos seguir com o serviço? Se precisar de mais prazo ou de alguma condição, é só nos dizer.\n\n${RODAPE}`,
  `Olá, {cliente}! Esta é a nossa última lembrança do seu orçamento de {valor} na {loja}. Se ainda tiver interesse, será um prazer atender você — é só responder pelo link abaixo.\n\n${RODAPE}`,
];
const MSG_POSVENDA_PADRAO = `Olá, {cliente}! 💛\n\nAqui é da {loja}. Já faz alguns dias que você levou a sua joia e queremos saber: está tudo certo? Se precisar de qualquer ajuste, limpeza ou tiver alguma dúvida, estamos à disposição.\n\nObrigado por escolher a Vilaça Joias!\n\n${RODAPE}`;

type Passo = { id: string; nome: string; dias: number; statusId: string; mensagem: string };
function passosEfetivos(cfg: any): Passo[] {
  const a = cfg.orcamentoAcoes || {};
  if (Array.isArray(a.passos) && a.passos.length) return a.passos;
  const abertos = (cfg.statusOrcamento || []).filter((s: any) => !s.encerra);
  const t = cfg.orcamentoAutoMsgConfig || { t1: 3, t2: 6, t3: 9, tFinal: 15 };
  return [
    { id: "p1", nome: (abertos[1] || {}).nome || "Ação de fixação", dias: Number(t.t1) || 3, statusId: (abertos[1] || {}).id || "", mensagem: "" },
    { id: "p2", nome: (abertos[2] || {}).nome || "Prorrogado à ação", dias: Number(t.t2) || 6, statusId: (abertos[2] || {}).id || "", mensagem: "" },
    { id: "p3", nome: "Última ação", dias: Number(t.t3) || 9, statusId: "", mensagem: "" },
  ];
}
const finalEfetivo = (cfg: any) => { const a = cfg.orcamentoAcoes || {}; const t = cfg.orcamentoAutoMsgConfig || {}; return a.final || { ativo: true, dias: Number(t.tFinal) || 15, statusId: "recusado" }; };
function descontoDoPasso(cfg: any, passo: Passo): number {
  const st = (cfg.statusOrcamento || []).find((s: any) => s.id === passo.statusId);
  const d = st && st.descontoEspecial;
  return d && d.ativo && Number(d.percentual) > 0 ? Number(d.percentual) : 0;
}
function textoPasso(cfg: any, passo: Passo, idx: number): string {
  if (passo.mensagem && passo.mensagem.trim()) return passo.mensagem;
  const st = (cfg.statusOrcamento || []).find((s: any) => s.id === passo.statusId);
  if (descontoDoPasso(cfg, passo) && st.descontoEspecial.mensagemWhatsapp && String(st.descontoEspecial.mensagemWhatsapp).trim()) return st.descontoEspecial.mensagemWhatsapp;
  if (st && st.mensagemWhatsapp && st.mensagemWhatsapp.trim()) return st.mensagemWhatsapp;
  return MSG_ACAO_PADRAO[Math.min(idx, MSG_ACAO_PADRAO.length - 1)];
}
function lojaDe(cfg: any, id: string) { return (cfg.lojas || []).find((l: any) => l && l.id === id) || null; }
const nomeDaLoja = (cfg: any, reg: any) => { const lj = lojaDe(cfg, reg.lojaId); return (lj && (lj.nomePublico || lj.nomeFantasia || lj.nome)) || reg.loja || "Vilaça Joias"; };
function preencher(txt: string, cfg: any, reg: any, descPerc = 0, link = "") {
  const nomeLoja = nomeDaLoja(cfg, reg);
  const av = "";
  let t = String(txt || "")
    .replaceAll("{cliente}", bonito(String(reg.cliente || "").split(/\s+/)[0] || "cliente"))
    .replaceAll("{loja}", nomeLoja).replaceAll("{vendedora}", bonito(reg.vendedora || "") || "nossa equipe")
    .replaceAll("{desconto}", descPerc ? `${String(descPerc).replace(".", ",")}%` : "").replaceAll("{valorDesconto}", fmtBRL((Number(reg.valorTotal) || 0) * (1 - descPerc / 100)))
    .replaceAll("{link}", link)
    .replaceAll("{valor}", fmtBRL(reg.valorTotal)).replaceAll("{validade}", fmtData(reg.validade)).replaceAll("{avaliacao}", av);
  if (link && !String(txt || "").includes("{link}")) t = t.trimEnd() + `\n\nVeja o seu orçamento completo, com fotos:\n${link}`;
  return t.replace(/\n{3,}/g, "\n\n").trim();
}
const MSG_OS_PRONTO = `Olá, {cliente}! 💛\n\nSeu pedido {via} está *PRONTO* para retirada na {loja}.\n\nAcompanhe e veja o código de retirada pelo link:\n{linkAcompanhamento}`;
const MSG_OS_POSVENDA = `Olá, {cliente}! 💛\n\nAqui é da {loja}. Já faz alguns dias que você retirou o seu pedido {via} e queremos saber: ficou tudo certo? Se precisar de qualquer ajuste, estamos à disposição.\n\nObrigado por escolher a Vilaça Joias!`;
const STATUS_OS_NOME: Record<string, string> = { aguardando: "APROVADO", enviado_fabrica: "ENVIADO P/ FÁBRICA", em_producao: "EM PRODUÇÃO", pendencia: "PENDÊNCIA", oficina_pronto: "PRODUZIDO", pronto: "PRONTO", entregue: "ENTREGUE" };
function preencherOS(txt: string, cfg: any, o: any) {
  const nomeLoja = nomeDaLoja(cfg, o);
  const av = "";
  const nota = o.codigoVia || o.via || "";
  let t = String(txt || "")
    .replaceAll("{cliente}", bonito(o.cliente || "") || "cliente").replaceAll("{via}", String(o.codigoVia || o.via || ""))
    .replaceAll("{status}", STATUS_OS_NOME[o.status] || String(o.status || "")).replaceAll("{servico}", String(o.serviceTypeName || ""))
    .replaceAll("{data}", fmtData(o.data)).replaceAll("{loja}", nomeLoja).replaceAll("{vendedora}", bonito(o.vendedora || "") || "nossa equipe")
    .replaceAll("{recebidoPor}", String(o.recebidoPor || "")).replaceAll("{notaLinha}", nota ? `Número da nota: ${nota}\n` : "")
    .replaceAll("{linkAcompanhamento}", `https://vilaca.app/acompanhar.html?id=${encodeURIComponent(o.id || "")}`).replaceAll("{avaliacao}", av);
  if (!/wa\.me\//.test(t)) t = t.trimEnd() + `\n\n${RODAPE}`;
  return t.replace(/\n{3,}/g, "\n\n").trim();
}
const linkOrc = (id: string) => `https://vilaca.app/via.html?t=orc&id=${encodeURIComponent(id)}`;

let cacheSeg: Record<string, string> | null = null;
async function segredos() {
  if (cacheSeg) return cacheSeg;
  const { data } = await admin.from("atendimento_segredos").select("chave, valor").in("chave", ["EVOLUTION_URL", "EVOLUTION_API_KEY", "ACOMPANHAMENTO_CRON_TOKEN", "MARKETING_CRON_TOKEN"]);
  const v: Record<string, string> = {}; for (const r of data || []) v[r.chave] = r.valor;
  if (v.EVOLUTION_URL) v.EVOLUTION_URL = v.EVOLUTION_URL.replace(/\/+$/, "");
  return (cacheSeg = v);
}

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}

async function abertoAgora(body: any) {
  const seg = await segredos();
  const { data: cf } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  const cfg: any = (cf && cf.payload) || {};
  const user = (cfg.users || []).find((u: any) => sessaoValida(u, String(body.senha || "")));
  if (!user) return json({ error: "não autorizado" }, 401);
  const nao = (motivo: string) => json({ ok: true, enviado: false, motivo });
  const acoes = cfg.orcamentoAcoes || {};
  if (!(acoes.auto && acoes.desde)) return nao("envio automático desligado");
  const passos = passosEfetivos(cfg), p0 = passos[0];
  if (!p0 || Number(p0.dias) !== 0 || !p0.statusId) return nao("sem ação inicial configurada");
  const id = String(body.id || "");
  const { data: row } = await admin.from("orcamentos").select("payload").eq("id", id).maybeSingle();
  const o = row && row.payload; if (!o) return nao("orçamento não encontrado");
  const hoje = agoraBR().dia;
  const base = o.autoBaseData || o.data || (o.criadoEm ? diaDe(Number(o.criadoEm)) : "");
  if (o.rascunho || o.convertidoEm || o.status !== p0.statusId || Number(o.autoMensagensEnviadas || 0) !== 0 || (o.msgEnviadas && o.msgEnviadas[p0.statusId]) || !base || diasEntre(base, hoje) !== 0) return nao("já enviado ou fora do fluxo");
  { const { data: pz } = await admin.from("marketing_disparo_estado").select("pausado_motivo").eq("id", 1).maybeSingle(); if (pz && pz.pausado_motivo) return nao("envios pausados"); }
  const tel = celular(o.telefone);
  if (!tel) return nao("sem celular válido");
  const fl = await oficialFlags();
  const nuvemAg = fl.tudo && fl.orc && o.lojaId !== "loja_rj";
  o.autoAgenda = { dia: hoje, em: 9e15, passo: 0, tent: 0, imediato: true };
  await admin.from("orcamentos").update({ payload: o, updated_at: new Date().toISOString() }).eq("id", id);
  const liberar = async (motivo: string) => { const { data: r2 } = await admin.from("orcamentos").select("payload").eq("id", id).maybeSingle(); const x = r2 && r2.payload; if (x && x.autoAgenda && x.autoAgenda.imediato) { delete x.autoAgenda; await admin.from("orcamentos").update({ payload: x, updated_at: new Date().toISOString() }).eq("id", id); } return nao(motivo); };
  const H = { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY };
  const instD = await instanciaDisparo();
  const inst = o.lojaId === "loja_rj" ? "reformajoias" : instD;
  if (!nuvemAg) { try { const rs = await fetch(`${seg.EVOLUTION_URL}/instance/connectionState/${inst}`, { headers: H, signal: AbortSignal.timeout(8000) }); const js = await rs.json().catch(() => ({})); if (String((js && js.instance && js.instance.state) || js.state || "") !== "open") return await liberar("WhatsApp fora do ar (o sistema tenta de novo em seguida)"); } catch (_) { return await liberar("WhatsApp fora do ar (o sistema tenta de novo em seguida)"); } }
  const tagOff = ((cfg.tagsClientes || []).find((x: any) => semAcento(x.nome) === "marketing off") || {}).id || "";
  if (tagOff) { try { const { data: off } = await admin.rpc("cliente_marketing_off", { p_id: "", p_fone8: fone8(tel), p_tag: tagOff }); if (off === true) return await liberar("cliente com a tag MARKETING OFF"); } catch (_) {} }
  if (!nuvemAg) { try { const rw = await fetch(`${seg.EVOLUTION_URL}/chat/whatsappNumbers/${inst}`, { method: "POST", headers: H, body: JSON.stringify({ numbers: [tel] }), signal: AbortSignal.timeout(10000) }); const jw = await rw.json().catch(() => null); if (rw.ok && Array.isArray(jw) && jw[0] && jw[0].exists === false) return await liberar("número sem WhatsApp"); } catch (_) {} }
  const t0 = varia(preencher(textoPasso(cfg, p0, 0), cfg, o, descontoDoPasso(cfg, p0), linkOrc(id)));
  const texto = inst === instD ? waMePrimeiro(ajustaTextoDisparo(t0)) : limpaTextoReforma(t0);   // v22
  let ok = false, status = 0;
  if (nuvemAg) {
    const mo = await orcModelo(cfg, o, String(p0.statusId || ""), id);   // v25: modelo da situação (v24: frase curta no genérico)
    const rc = await enviaModelo(tel, mo.nome, mo.params, mo.botao);
    ok = rc.ok; status = rc.status;
  } else {
    try { const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${inst}`, { method: "POST", headers: H, body: JSON.stringify({ number: tel, text: texto, delay: 1200 }), signal: AbortSignal.timeout(25000) }); status = r.status; const rj = await r.json().catch(() => ({})); ok = r.ok && !!(rj && rj.key); } catch (_) {}
  }
  try { await admin.from("auditoria_log").insert({ usuario_nome: "SISTEMA (automático)", nivel: "sistema", loja_sessao: o.lojaId || null, acao: ok ? "via_whatsapp_enviada" : "via_whatsapp_falhou", modulo: "Acompanhamento automático", tabela: "orc_acao", registro_id: id, resumo: `${ok ? "Enviou" : "Falhou ao enviar"} ${p0.nome} (orçamento salvo) por WhatsApp (${nuvemAg ? "API oficial" : inst}) para …${tel.slice(-4)}`, detalhe: { instancia: nuvemAg ? "oficial" : inst, status, botao: "auto", rotulo: p0.nome, imediato: true } }); } catch (_) {}
  if (ok && inst === instD) { if (!nuvemAg) { try { await admin.rpc("disparo_manual"); } catch (_) {} } await registrarEnvio(tel, o, "orc_acao", id, nuvemAg ? "cloud_api" : "manual"); }
  const { data: r3 } = await admin.from("orcamentos").select("payload").eq("id", id).maybeSingle();
  const reg = (r3 && r3.payload) || o;
  const agoraIso = new Date().toISOString();
  if (!ok) { reg.autoAgenda = { dia: hoje, em: Date.now() + 5 * 60000, passo: 0, tent: 1 }; await admin.from("orcamentos").update({ payload: reg, updated_at: agoraIso }).eq("id", id); return nao("não foi possível enviar agora; o sistema tenta de novo em 5 minutos"); }
  delete reg.autoAgenda;
  reg.autoMensagensEnviadas = 1;
  reg.msgEnviadas = reg.msgEnviadas || {}; reg.msgEnviadas[p0.statusId] = agoraIso;
  (reg.acoesLog = reg.acoesLog || []).push({ em: agoraIso, passo: p0.id, nome: p0.nome, por: "sistema", via: "whatsapp", auto: true, imediato: true });
  await admin.from("orcamentos").update({ payload: reg, updated_at: agoraIso }).eq("id", id);
  return json({ ok: true, enviado: true, autoMensagensEnviadas: 1, msgEnviadas: reg.msgEnviadas, acoesLog: reg.acoesLog });
}

type Item = { tipo: "orcamento" | "posvenda" | "os_pronto" | "os_posvenda"; tabela: string; id: string; reg: any; passo: number; tel: string | null; texto: string; statusDestino: string; nomeAcao: string; pulados: number; agenda: any };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const inicio = Date.now();
  let travado = false;
  try {
    const body = await req.json().catch(() => ({}));
    if (body && body.op === "abertoAgora") return await abertoAgora(body);
    const seg = await segredos();
    if (!seg.ACOMPANHAMENTO_CRON_TOKEN || req.headers.get("x-cron-token") !== seg.ACOMPANHAMENTO_CRON_TOKEN) return json({ error: "não autorizado" }, 401);
    if (!body.simular) {
      try {
        const fl0 = await oficialFlags();
        if (fl0.tudo && fl0.campanha) {
          await admin.from("marketing_fila").update({ status: "cloud_fila", atualizado_em: new Date().toISOString() }).eq("status", "pendente").eq("tipo", "campanha");
          const { count } = await admin.from("marketing_fila").select("id", { count: "exact", head: true }).eq("status", "cloud_fila");
          if ((count || 0) > 0 && seg.MARKETING_CRON_TOKEN) { try { await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/disparo-cloud`, { method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": seg.MARKETING_CRON_TOKEN }, body: "{}", signal: AbortSignal.timeout(8000) }); } catch (_) {} }
        }
      } catch (_) {}
    }
    const agora = agoraBR();
    if (!body.ignorarHorario && !(agora.min >= MIN_INI && agora.min < MIN_FIM_ENVIO)) return json({ ok: true, fora_do_horario: true });
    const podePlanejar = !!body.ignorarHorario || agora.min < MIN_FIM;
    const { data: cf } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const cfg: any = (cf && cf.payload) || {};
    const dryRun = !!body.simular;
    const acoes = dryRun && body.assumirAuto ? { ...(cfg.orcamentoAcoes || {}), auto: true, desde: "2000-01-01" } : (cfg.orcamentoAcoes || {});
    const pv = dryRun && body.assumirAuto ? { ...(cfg.posVendaAuto || {}), auto: true, desde: "2000-01-01" } : (cfg.posVendaAuto || {});
    const po = dryRun && body.assumirAuto ? { ...(cfg.pedidoAcoes || {}), auto: true, desde: "2000-01-01" } : (cfg.pedidoAcoes || {});
    if (!dryRun && !(acoes.auto && acoes.desde) && !(pv.auto && pv.desde) && !(po.auto && po.desde)) return json({ ok: true, desligado: true });
    if (!dryRun) { const { data: pz } = await admin.from("marketing_disparo_estado").select("pausado_motivo").eq("id", 1).maybeSingle(); if (pz && pz.pausado_motivo) return json({ ok: true, pausado: true, motivo: pz.pausado_motivo }); }
    if (!dryRun) {
      const { data: trava } = await admin.from("marketing_disparo_estado").update({ rodando_ate: new Date(Date.now() + 58000).toISOString() }).eq("id", 2).or(`rodando_ate.is.null,rodando_ate.lt.${new Date().toISOString()}`).select().maybeSingle();
      if (!trava) return json({ ok: true, ocupado: true });
      travado = true;
    }
    const cand: Item[] = [];
    let proximoDia = 0;
    const fechar: { id: string; statusId: string }[] = [];

    if (acoes.auto && acoes.desde) {
      const desdeMs = Date.parse(acoes.desde + "T00:00:00-03:00");
      const soNovos = acoes.incluirExistentes === false;
      const passos = passosEfetivos(cfg), fin = finalEfetivo(cfg);
      const encerra = new Set((cfg.statusOrcamento || []).filter((s: any) => s.encerra).map((s: any) => s.id));
      for (let from = 0; from < 20000; from += 1000) {
        const { data } = await admin.from("orcamentos").select("id,payload").gte("updated_at", new Date(Date.now() - 120 * 86400000).toISOString()).range(from, from + 999);
        for (const r of (data || [])) {
          const o = r.payload || {};
          if (o.rascunho || o.convertidoEm || encerra.has(o.status)) continue;
          if (soNovos && Number(o.criadoEm || 0) < desdeMs) continue;
          const base = o.autoBaseData || o.data || (o.criadoEm ? diaDe(Number(o.criadoEm)) : "");
          if (!base) continue;
          const N = Number(o.autoMensagensEnviadas || 0);
          const idxSt = passos.findIndex((p) => p.statusId && p.statusId === o.status);
          const bonus = N === 0 && idxSt >= 1 && o.autoBaseData ? Number(passos[idxSt].dias) || 0 : 0;
          const dias = diasEntre(base, agora.dia) + bonus;
          if (fin.ativo && !o.editadoManualmente && dias >= Number(fin.dias)) { fechar.push({ id: r.id, statusId: fin.statusId || "recusado" }); continue; }
          let k = -1;
          for (let j = passos.length - 1; j >= Math.max(N, 0); j--) {
            if (j <= idxSt && j > 0) break;
            if (j === 0 && !(N === 0 && (idxSt <= 0))) break;
            if (dias >= Number(passos[j].dias)) { k = j; break; }
          }
          if (k < 0) continue;
          const tel = celular(o.telefone);
          cand.push({ tipo: "orcamento", tabela: "orcamentos", id: r.id, reg: o, passo: k, tel, pulados: Math.max(0, k - N), statusDestino: passos[k].statusId || "", nomeAcao: passos[k].nome || `ação ${k + 1}`, agenda: o.autoAgenda || null,
            texto: preencher(textoPasso(cfg, passos[k], k), cfg, o, descontoDoPasso(cfg, passos[k]), linkOrc(r.id)) });
        }
        if (!data || data.length < 1000) break;
      }
    }
    if (pv.auto && pv.desde) {
      const dias = Number(pv.dias) || 7;
      const desdeMs = Date.parse(pv.desde + "T00:00:00-03:00");
      for (let from = 0; from < 20000; from += 1000) {
        const { data } = await admin.from("vendas_pdv").select("id,payload").gte("updated_at", new Date(Date.now() - 60 * 86400000).toISOString()).range(from, from + 999);
        for (const r of (data || [])) {
          const v = r.payload || {};
          if (v.posVendaEnviadoEm || v.status === "cancelada" || v.status === "cancelado" || v.rascunho || !v.data) continue;
          if (Number(v.criadoEm || 0) < desdeMs) continue;
          if (diasEntre(String(v.data).slice(0, 10), agora.dia) < dias) continue;
          cand.push({ tipo: "posvenda", tabela: "vendas_pdv", id: r.id, reg: v, passo: 0, tel: celular(v.telefone), pulados: 0, statusDestino: "", nomeAcao: "pós-venda", agenda: v.autoAgenda || null,
            texto: preencher((pv.mensagem && pv.mensagem.trim()) || MSG_POSVENDA_PADRAO, cfg, v) });
        }
        if (!data || data.length < 1000) break;
      }
    }
    if (po.auto && po.desde) {
      const diasPV = Number(po.posVendaDias) || 7;
      const desdeMs = Date.parse(po.desde + "T00:00:00-03:00");
      for (let from = 0; from < 20000; from += 1000) {
        const { data } = await admin.from("ordens_servico").select("id,payload").gte("updated_at", new Date(Date.now() - 60 * 86400000).toISOString()).range(from, from + 999);
        for (const r of (data || [])) {
          const o = r.payload || {};
          if (o.rascunho || o.status === "cancelado") continue;
          const jaLog = (k: string) => (Array.isArray(o.acoesLog) ? o.acoesLog : []).some((a: any) => a && a.passo === k);
          if (o.status === "pronto" && po.prontoAuto === true && Number(o.statusEm || 0) >= desdeMs && !(o.msgEnviadas && o.msgEnviadas.pronto) && !jaLog("os_pronto")) {
            cand.push({ tipo: "os_pronto", tabela: "ordens_servico", id: r.id, reg: o, passo: 0, tel: celular(o.telefone), pulados: 0, statusDestino: "", nomeAcao: "aviso de pronto", agenda: o.autoAgenda || null,
              texto: preencherOS((po.mensagemPronto && po.mensagemPronto.trim()) || (cfg.mensagens && cfg.mensagens.pronto) || MSG_OS_PRONTO, cfg, o) });
          } else if (o.status === "entregue" && Number(o.recebidoEm || 0) >= desdeMs && !o.posVendaEnviadoEm && diasEntre(diaDe(Number(o.recebidoEm)), agora.dia) >= diasPV) {
            cand.push({ tipo: "os_posvenda", tabela: "ordens_servico", id: r.id, reg: o, passo: 0, tel: celular(o.telefone), pulados: 0, statusDestino: "", nomeAcao: "pós-venda", agenda: o.autoAgenda || null,
              texto: preencherOS((po.mensagemPosVenda && po.mensagemPosVenda.trim()) || MSG_OS_POSVENDA, cfg, o) });
          }
        }
        if (!data || data.length < 1000) break;
      }
    }
    if (dryRun) return json({ ok: true, simulacao: true, enviaria: cand.map((f) => ({ tipo: f.tipo, id: f.id, cliente: f.reg.cliente, acao: f.nomeAcao, passo: f.passo + 1, pulados: f.pulados, statusDestino: f.statusDestino, tel: f.tel ? "…" + f.tel.slice(-4) : "SEM TELEFONE VÁLIDO", texto: f.texto })), fecharia: fechar });

    const FL = await oficialFlags();
    const INST_D = await instanciaDisparo();
    const instanciaDe = (lojaId: string) => (lojaId === "loja_rj" ? "reformajoias" : INST_D);
    const nuvem = (it: Item) => FL.tudo && instanciaDe(String(it.reg.lojaId || "")) === INST_D && (it.tipo === "posvenda" || it.tipo === "os_posvenda" || (it.tipo === "orcamento" && FL.orc) || (it.tipo === "os_pronto" && FL.pronto));
    const reviewDe = (lojaId: string) => { const l = (cfg.lojas || []).find((x: any) => x && x.id === lojaId) || (cfg.lojas || []).find((x: any) => x && x.id === "loja_mc"); const g = String((l && l.googleReviewUrl) || "").match(/g[.]page[/]r[/](.+)$/); return g ? g[1] : ""; };
    const modeloRobot = async (it: Item, reg: any): Promise<{ nome: string; params: string[]; botao?: string } | null> => {
      // v23: {{2}} = texto do pós-venda (só vai se o modelo ativo tiver {{2}}) e botão Google da loja
      if (it.tipo === "posvenda" || it.tipo === "os_posvenda") return { nome: "pos_venda_garantia", params: [primeiroNome(reg.cliente), miolo(it.texto) || "Queremos agradecer a oportunidade de fazer parte de um momento especial com a sua nova joia."], botao: reviewDe(String(reg.lojaId || "")) };
      if (it.tipo === "orcamento") return await orcModelo(cfg, reg, it.statusDestino, it.id);   // v25: modelo da situação (v24: frase curta no genérico)
      if (it.tipo === "os_pronto") return { nome: "pedido_pronto_acompanhamento", params: [primeiroNome(reg.cliente), bonito(reg.vendedora || "") || "nossa equipe", nomeDaLoja(cfg, reg), `https://vilaca.app/acompanhar.html?id=${encodeURIComponent(it.id)}`] };
      return null;
    };
    const agoraIso0 = new Date().toISOString();
    for (const f of fechar) {
      const { data: row } = await admin.from("orcamentos").select("payload").eq("id", f.id).maybeSingle();
      const o = row && row.payload; if (!o || o.convertidoEm) continue;
      o.status = f.statusId; o.statusAtualizadoEm = agoraIso0; delete o.autoAgenda;
      (o.acoesLog = o.acoesLog || []).push({ em: agoraIso0, acao: "encerrado automaticamente (prazo final)", por: "sistema" });
      await admin.from("orcamentos").update({ payload: o, updated_at: agoraIso0 }).eq("id", f.id);
      try { await admin.from("auditoria_log").insert({ usuario_nome: "SISTEMA (automático)", nivel: "sistema", loja_sessao: o.lojaId || null, acao: "orcamento_status_auto", modulo: "Acompanhamento automático", tabela: "orcamentos", registro_id: f.id, resumo: `Encerrou o orçamento pelo prazo final (${f.statusId})`, detalhe: { botao: "auto" } }); } catch (_) {}
    }

    const validos = (it: Item) => it.agenda && it.agenda.dia === agora.dia && it.agenda.passo === it.passo;
    const sobra = (it: Item) => !!(it.agenda && it.agenda.dia && it.agenda.dia < agora.dia);
    const semHorario = !podePlanejar ? [] : cand.filter((it) => !validos(it)).sort((a, b) => (Number(sobra(b)) - Number(sobra(a))) || String(a.reg.autoBaseData || a.reg.data || "").localeCompare(String(b.reg.autoBaseData || b.reg.data || "")));
    if (!podePlanejar) proximoDia = cand.filter((it) => !validos(it)).length;
    let agendadosAgora = 0;
    const gravarAgenda = async (it: Item, em: number) => {
      const { data: row } = await admin.from(it.tabela).select("payload").eq("id", it.id).maybeSingle();
      const reg = row && row.payload; if (!reg) return;
      reg.autoAgenda = { dia: agora.dia, em, passo: it.passo, tent: 0, tipo: it.tipo };
      await admin.from(it.tabela).update({ payload: reg, updated_at: new Date().toISOString() }).eq("id", it.id);
      it.agenda = reg.autoAgenda; it.reg = reg; agendadosAgora++;
    };
    if (semHorario.length) {
      const fimDia = Date.parse(`${agora.dia}T${hhmm(MIN_FIM)}:00-03:00`);
      const iniDia = Date.parse(`${agora.dia}T${hhmm(MIN_INI)}:00-03:00`);
      let ultimo = Math.max(0, ...cand.filter(validos).map((it) => Number(it.agenda.em) || 0).filter((x) => x < 9e14));
      const imediatos = semHorario.filter((it) => sobra(it) || nuvem(it) || (it.tipo === "orcamento" && it.passo === 0 && it.statusDestino && it.pulados === 0));
      let t = Math.max(Date.now() + 25000, iniDia, ultimo ? ultimo + PISO_SEG_MS : 0);
      for (const it of imediatos) {
        if (t >= fimDia) { proximoDia++; continue; }
        await gravarAgenda(it, t);
        ultimo = Math.max(ultimo, t); t += nuvem(it) ? 2000 : PISO_SEG_MS + Math.floor(Math.random() * 120000);
      }
      const outros = semHorario.filter((it) => !imediatos.includes(it));
      if (outros.length) {
        const jan = janelaHoje(Date.now(), ultimo ? ultimo + PISO_SEG_MS : 0);
        const d = jan ? distribuir(outros.length, jan) : { cabem: 0, horas: [] as number[] };
        for (let i = 0; i < outros.length; i++) {
          if (i >= d.cabem) { proximoDia++; continue; }
          await gravarAgenda(outros[i], d.horas[i]);
        }
      }
    }

    const H = { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY };
    const estados: Record<string, boolean> = {};
    const aberta = async (inst: string) => {
      if (inst in estados) return estados[inst];
      try { const rs = await fetch(`${seg.EVOLUTION_URL}/instance/connectionState/${inst}`, { headers: H, signal: AbortSignal.timeout(8000) }); const js = await rs.json().catch(() => ({})); estados[inst] = String((js && js.instance && js.instance.state) || js.state || "") === "open"; } catch (_) { estados[inst] = false; }
      return estados[inst];
    };
    const tags: any[] = cfg.tagsClientes || [];
    const tagOff = (tags.find((x: any) => semAcento(x.nome) === "marketing off") || {}).id || "";
    const passos = passosEfetivos(cfg);
    let enviados = 0, semMensagem = 0, falhasSeguidas = 0, pausar = "";
    const feitos = new Set<string>();
    const pendHoje = cand.filter((it) => validos(it) && Number(it.agenda.em) < 9e14 && instanciaDe(String(it.reg.lojaId || "")) === INST_D && !nuvem(it));
    const devidos0 = pendHoje.filter((it) => Number(it.agenda.em) <= Date.now() && it.tel).length;
    if (!dryRun) await admin.from("marketing_disparo_estado").update({ cards_devidos: devidos0, cards_restantes: pendHoje.length, cards_em: new Date().toISOString() }).eq("id", 1);
    let usouVez = false;
    while (Date.now() - inicio < LIMITE_MS) {
      const devidos = cand.filter((it) => validos(it) && !feitos.has(it.id) && Number(it.agenda.em) <= Date.now()).sort((a, b) => Number(a.agenda.em) - Number(b.agenda.em));
      const f = devidos[0];
      if (!f) break;
      feitos.add(f.id);
      const inst = instanciaDe(String(f.reg.lojaId || ""));
      const viaNuvem = nuvem(f);
      const { data: row } = await admin.from(f.tabela).select("payload").eq("id", f.id).maybeSingle();
      const reg = row && row.payload; if (!reg) continue;
      if (f.tipo === "orcamento" && (Number(reg.autoMensagensEnviadas || 0) > f.passo || reg.convertidoEm || reg.rascunho)) continue;
      if (f.tipo === "posvenda" && reg.posVendaEnviadoEm) continue;
      if (f.tipo === "os_pronto" && (reg.status !== "pronto" || (reg.msgEnviadas && reg.msgEnviadas.pronto))) continue;
      if (f.tipo === "os_posvenda" && (reg.status !== "entregue" || reg.posVendaEnviadoEm)) continue;
      if (f.tel && !viaNuvem && !(await aberta(inst))) continue;
      let motivoSem = "", ok = false, status = 0;
      if (!f.tel) motivoSem = "sem celular válido";
      if (!motivoSem && tagOff) { try { const { data: off } = await admin.rpc("cliente_marketing_off", { p_id: "", p_fone8: fone8(f.tel!), p_tag: tagOff }); if (off === true) motivoSem = "cliente com a tag MARKETING OFF"; } catch (_) {} }
      if (!motivoSem && !viaNuvem) { try { const rw = await fetch(`${seg.EVOLUTION_URL}/chat/whatsappNumbers/${inst}`, { method: "POST", headers: H, body: JSON.stringify({ numbers: [f.tel] }), signal: AbortSignal.timeout(10000) }); const jw = await rw.json().catch(() => null); if (rw.ok && Array.isArray(jw) && jw[0] && jw[0].exists === false) motivoSem = "número sem WhatsApp"; } catch (_) {} }
      if (!motivoSem && inst === INST_D && !viaNuvem) {
        if (usouVez) break;
        const { data: est } = await admin.from("marketing_disparo_estado").select("mkt_restantes, cards_restantes").eq("id", 1).maybeSingle();
        const rest = Math.max(0, Number((est && est.cards_restantes) || 0) - 1) + Number((est && est.mkt_restantes) || 0);
        const { data: vez } = await admin.rpc("disparo_vez", { p_cards: true, p_gap_seg: gapSeg(rest) });
        if (vez !== true) break;
        usouVez = true;
      }
      if (!motivoSem) {
        if (viaNuvem) {
          const m = await modeloRobot(f, reg);
          if (m) { const rc = await enviaModelo(String(f.tel), m.nome, m.params, m.botao); ok = rc.ok; status = rc.status; }
          await espera(1100);
        } else {
          try {
            const texto = inst === INST_D ? waMePrimeiro(ajustaTextoDisparo(varia(f.texto))) : limpaTextoReforma(varia(f.texto));   // v22
            const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${inst}`, { method: "POST", headers: H, body: JSON.stringify({ number: f.tel, text: texto, delay: 2500 + Math.floor(Math.random() * 5500) }), signal: AbortSignal.timeout(25000) });
            status = r.status; const rj = await r.json().catch(() => ({})); ok = r.ok && !!(rj && rj.key);
          } catch (_) {}
        }
        try {
          await admin.from("auditoria_log").insert({ usuario_nome: "SISTEMA (automático)", nivel: "sistema", loja_sessao: reg.lojaId || null, acao: ok ? "via_whatsapp_enviada" : "via_whatsapp_falhou", modulo: "Acompanhamento automático", tabela: f.tipo === "orcamento" ? "orc_acao" : "posvenda", registro_id: f.id,
            resumo: `${ok ? "Enviou" : "Falhou ao enviar"} ${f.nomeAcao} (${f.tipo}) por WhatsApp (${viaNuvem ? "API oficial" : inst}) para …${String(f.tel).slice(-4)}`, detalhe: { instancia: viaNuvem ? "oficial" : inst, status, botao: "auto", rotulo: f.nomeAcao } });
        } catch (_) {}
        if (!ok) {
          const tent = Number((reg.autoAgenda && reg.autoAgenda.tent) || 0) + 1;
          reg.autoAgenda = tent >= 3 ? { dia: agora.dia, em: 9e15, passo: f.passo, tent } : { dia: agora.dia, em: Date.now() + 5 * 60000, passo: f.passo, tent };
          await admin.from(f.tabela).update({ payload: reg, updated_at: new Date().toISOString() }).eq("id", f.id);
          falhasSeguidas++;
          if (status === 401 || status === 403 || falhasSeguidas >= FALHAS_PARA_PAUSAR) { pausar = status === 401 || status === 403 ? `O WhatsApp negou o acesso (${status}) — número possivelmente restrito` : `${falhasSeguidas} falhas seguidas no envio automático de orçamentos/pós-venda`; break; }
          const idx = cand.findIndex((x) => x.id === f.id); if (idx >= 0) { cand[idx].agenda = reg.autoAgenda; feitos.delete(f.id); }
          continue;
        }
        falhasSeguidas = 0;
        if (inst === INST_D) await registrarEnvio(String(f.tel), reg, f.tipo, f.id, viaNuvem ? "cloud_api" : "auto");
      } else {
        semMensagem++;
        try { await admin.from("auditoria_log").insert({ usuario_nome: "SISTEMA (automático)", nivel: "sistema", loja_sessao: reg.lojaId || null, acao: "orcamento_status_auto", modulo: "Acompanhamento automático", tabela: f.tipo === "orcamento" ? "orcamentos" : "vendas_pdv", registro_id: f.id, resumo: `Não enviou ${f.nomeAcao}: ${motivoSem}`, detalhe: { botao: "auto", motivo: motivoSem } }); } catch (_) {}
      }
      const agoraIso = new Date().toISOString();
      delete reg.autoAgenda;
      if (f.tipo === "orcamento") {
        reg.autoMensagensEnviadas = f.passo + 1;
        if (f.statusDestino) { reg.status = f.statusDestino; reg.statusAtualizadoEm = agoraIso; }
        if (!motivoSem) { reg.msgEnviadas = reg.msgEnviadas || {}; reg.msgEnviadas[f.statusDestino || reg.status] = agoraIso; }
        (reg.acoesLog = reg.acoesLog || []).push({ em: agoraIso, passo: passos[f.passo].id, nome: passos[f.passo].nome, por: "sistema", via: motivoSem ? "sem mensagem (" + motivoSem + ")" : "whatsapp", auto: true, pulou: f.pulados || 0 });
      } else if (f.tipo === "os_pronto") {
        if (!motivoSem) { reg.msgEnviadas = reg.msgEnviadas || {}; reg.msgEnviadas.pronto = agoraIso; }
        (reg.acoesLog = reg.acoesLog || []).push({ em: agoraIso, passo: "os_pronto", nome: "Aviso de PRONTO", por: "sistema", via: motivoSem ? "sem mensagem (" + motivoSem + ")" : "whatsapp", auto: true });
      } else if (f.tipo === "os_posvenda") {
        reg.posVendaEnviadoEm = agoraIso; reg.posVendaPor = motivoSem ? "sistema (sem mensagem: " + motivoSem + ")" : "sistema";
        if (!motivoSem) { reg.msgEnviadas = reg.msgEnviadas || {}; reg.msgEnviadas.posvenda = agoraIso; }
        (reg.acoesLog = reg.acoesLog || []).push({ em: agoraIso, passo: "os_posvenda", nome: "Pós-venda", por: "sistema", via: motivoSem ? "sem mensagem (" + motivoSem + ")" : "whatsapp", auto: true });
      } else { reg.posVendaEnviadoEm = agoraIso; reg.posVendaPor = motivoSem ? "sistema (sem mensagem: " + motivoSem + ")" : "sistema"; }
      await admin.from(f.tabela).update({ payload: reg, updated_at: agoraIso }).eq("id", f.id);
      if (!motivoSem) enviados++;
    }
    if (pausar) {
      await admin.from("marketing_disparo_estado").update({ pausado_motivo: pausar, pausado_em: new Date().toISOString() }).eq("id", 1);
      try { await admin.from("auditoria_log").insert({ acao: "marketing_pausado", modulo: "Acompanhamento automático", tabela: "orcamentos", resumo: "Envio automático pausado: " + pausar }); } catch (_) {}
    }
    return json({ ok: true, enviados, semMensagem, agendadosAgora, ficouParaAmanha: proximoDia, encerrados: fechar.length, pausado: !!pausar });
  } catch (e) {
    console.error("acompanhamento-auto", e);
    return json({ ok: false, error: String(e) }, 500);
  } finally {
    if (travado) { try { await admin.from("marketing_disparo_estado").update({ rodando_ate: null }).eq("id", 2); } catch (_) {} }
  }
});
