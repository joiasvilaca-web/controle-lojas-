// acompanhamento-auto v12 (11/11/2026): sem "responda SAIR" nas mensagens (quem escreve SAIR continua saindo da lista pelo disparo-webhook) e pós-venda SEM pedido de avaliação ({avaliacao} vira vazio).
// acompanhamento-auto v11 (10/11/2026): a instância do número de disparo vem de atendimento_segredos.DISPARO_INSTANCIA (padrão "vilaca"), sem redeploy para trocar de número.
// acompanhamento-auto v10 (10/11/2026) — FILA ÚNICA DO NÚMERO DE DISPARO (vilaca): planejamento das 9h às 19h (19h–20h fica de reserva para o que
//   atrasou/interrupções; nada sai depois das 20h); entre duas mensagens automáticas, no mínimo 5 min (5–7 min sorteados; com poucas mensagens, espalhadas pelo
//   dia) — a vez é pega no banco (disparo_vez), dividida com o Marketing; Venda/Pedido/Orçamento têm prioridade sobre aniversário/mala direta. Envio feito por
//   pessoa (orçamento salvo, botões) sai na hora e empurra o próximo automático 5 min (disparo_manual). O que não sair até as 20h vai para o COMEÇO do dia
//   seguinte. Texto: sai "Não responda", entra "Para falar com a gente, é só clicar no link" + "Responda com 👍…". Cada envio fica em disparo_envios.
// acompanhamento-auto v7 (10/11/2026) — PEDIDOS (ordens_servico) entram na fila automática (config.pedidoAcoes {auto, desde, posVendaDias, mensagemPronto?, mensagemPosVenda?}):
//   (a) status PRONTO (marcado depois de `desde`, `statusEm`) → mensagem de pronto na fila do dia (9h–18h, horário sorteado, o que não couber vai para o dia seguinte);
//   (b) PÓS-VENDA `posVendaDias` (padrão 7) dias depois de ENTREGUE (`recebidoEm`) → mensagem de pós-venda na mesma fila. Visto em `msgEnviadas.pronto` / `msgEnviadas.posvenda`; `autoAgenda.tipo` mostra o que é.
//   A mensagem do status APROVADO sai na hora, pela tela (sem fila). Mesmas checagens do orçamento (celular válido, MARKETING OFF, número com WhatsApp, pausa do número).
// acompanhamento-auto v6 (10/11/2026) — {link}: toda mensagem de orçamento leva o link do orçamento completo (via.html?t=orc&id=…, com fotos dos itens); o parágrafo do wa.me continua indo para o TOPO
//   (waMePrimeiro) para o WhatsApp mostrar o botão "Iniciar conversa".
// acompanhamento-auto v5 (10/11/2026) — op `abertoAgora` (com sessão do app): ao SALVAR o orçamento a tela chama esta op e a mensagem do status inicial (ação 0) sai NA HORA (sem esperar o minuto do
//   agendador, a qualquer horário), com as mesmas checagens (celular válido, MARKETING OFF, número com WhatsApp) e o mesmo registro (N=1, msgEnviadas, acoesLog). Reserva o orçamento (autoAgenda longe) para o
//   agendador não mandar de novo.
// acompanhamento-auto v4 (10/11/2026) — FLUXO POR STATUS: a ação 0 (status inicial, dias 0) sai logo que o orçamento é salvo (dentro do horário 9h–18h);
//   nunca volta de status (só passos à frente do status atual); orçamento movido à mão para um status conta os dias dele como já cumpridos; DESCONTO ESPECIAL por status
//   (status.descontoEspecial {ativo, percentual, mensagemWhatsapp}: com a chave ligada o passo manda a outra mensagem, com {desconto} e {valorDesconto}); `msgEnviadas` {statusId: data}
//   guarda o visto de mensagem enviada; {vendedora} sem nome vira "nossa equipe". 
// acompanhamento-auto v3 (10/11/2026) — REGRAS DO ANIVERSÁRIO + POSIÇÃO CERTA PELO PRAZO:
//   (1) cada ação vence pelos DIAS configurados; orçamento já atrasado recebe a ação CORRETA de agora (a mais avançada que já venceu, sem repetir as anteriores) e vai para o status dela;
//   (2) o dia é distribuído como o aniversário: a janela de agora (ou das 9h) até as 18h é cortada em partes iguais e cada mensagem sai num horário sorteado dentro da sua parte (mín. 1 min por mensagem);
//       o que não couber hoje, ou não puder sair (WhatsApp fora do ar, falha), entra na fila do dia seguinte; (3) só celular válido (DDD + 9 + 8 dígitos), tag MARKETING OFF e número sem WhatsApp não recebem
//       (nesses casos o status ainda muda pelo prazo, sem mensagem); (4) "digitando…", variação {a|b} e rodapé "responda SAIR" no número de disparo; (5) 3 falhas seguidas / 401 / 403 pausam (mesma pausa da fila do Marketing);
//       (6) convertido, rascunho e status que encerra ficam fora; (7) `incluirExistentes` (padrão ligado) vale também para orçamentos já registrados; (8) roda a cada minuto (trava no id 2 de marketing_disparo_estado).
// acompanhamento-auto (09/11/2026) — envio AUTOMÁTICO por WhatsApp, sem ação humana:
//  1) AÇÕES DE ORÇAMENTO (fixação): cada orçamento aberto recebe as mensagens nos prazos configurados (config.orcamentoAcoes);
//  2) PÓS-VENDA: X dias depois da venda (config.posVendaAuto).
// Só envia se o interruptor "auto" da respectiva configuração estiver ligado (padrão: DESLIGADO) e só para registros criados
// depois de `desde` (o dia em que foi ligado). Chamado pelo pg_cron (a cada 5 min) com o header x-cron-token
// (= atendimento_segredos.ACOMPANHAMENTO_CRON_TOKEN). Janela 9h–18h (Brasília), vários segundos entre mensagens, "digitando…",
// confere WhatsApp do número e a tag MARKETING OFF. O parágrafo do wa.me vai para o topo (botão "Iniciar conversa").
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const MIN_INI = 9 * 60, MIN_FIM = 19 * 60, MIN_FIM_ENVIO = 20 * 60, LIMITE_MS = 50000, PISO_SEG_MS = 5 * 60000, FALHAS_PARA_PAUSAR = 3;
const WA_ATENDIMENTO = "https://wa.me/5532988307617";
/** Instância do WhatsApp usada como número de DISPARO: atendimento_segredos.DISPARO_INSTANCIA (padrão "vilaca"). Trocar o valor troca o número sem redeploy (cache de 60 s). */
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
/** Janela de hoje (Brasília): de agora (ou das 9h, ou depois do último horário já reservado) até as 18h. null = não há mais tempo hoje. */
function janelaHoje(agoraMs: number, aposMs = 0) {
  const b = agoraBR(agoraMs);
  const ini = Date.parse(`${b.dia}T${hhmm(MIN_INI)}:00-03:00`);
  const fim = Date.parse(`${b.dia}T${hhmm(MIN_FIM)}:00-03:00`);
  const de = Math.max(agoraMs + 30000, ini, aposMs);
  if (de >= fim - 60000) return null;
  return { de, ate: fim };
}
/** Horários previstos de n mensagens na janela, nunca menos de 5 min entre uma e outra: com poucas mensagens, a janela é cortada em partes iguais
 *  (horário sorteado em cada parte, sempre ≥ 5 min da anterior); com muitas, uma atrás da outra a cada 5–7 min (sorteado). O que passa do fim não cabe hoje. */
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
/** Tempo até a PRÓXIMA mensagem automática (s): 5–7 min sorteados; se sobra tempo no dia, espalha (nunca menos de 5 min). */
function gapSeg(restantes: number, agoraMs = Date.now()) {
  const b = agoraBR(agoraMs);
  const fim = Date.parse(`${b.dia}T${hhmm(b.min < MIN_FIM ? MIN_FIM : MIN_FIM_ENVIO)}:00-03:00`);
  const base = 300 + Math.random() * 120;
  if (restantes <= 0) return Math.round(base);
  const espaco = (fim - agoraMs) / 1000 / restantes;
  return Math.round(espaco <= 420 ? base : Math.max(300, espaco * (0.75 + Math.random() * 0.5)));
}
const LINHA_JOINHA = "Responda com 👍 para confirmar que recebeu.";
/** Número de disparo: sem "não responda", com o link de atendimento e o pedido do 👍 (vale para textos antigos guardados nas configurações). */
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
  try { await admin.from("disparo_envios").insert({ fone8: fone8(tel), telefone: tel, loja_id: reg.lojaId || null, vendedora: reg.vendedora || null, tipo, registro_id: id, origem }); } catch (_) {}
}
const fmtBRL = (v: unknown) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (s: unknown) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };

/** O WhatsApp monta cartão/botão pelo PRIMEIRO link: o parágrafo só com o wa.me sobe para o topo (botão "Iniciar conversa"). */
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

// ---------- mensagens padrão (mesmo texto da tela) ----------
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
function preencher(txt: string, cfg: any, reg: any, descPerc = 0, link = "") {
  const lj = lojaDe(cfg, reg.lojaId);
  const nomeLoja = (lj && (lj.nomePublico || lj.nomeFantasia || lj.nome)) || reg.loja || "Vilaça Joias";
  const av = "";   // 11/11: pós-venda não pede mais avaliação
  let t = String(txt || "")
    .replaceAll("{cliente}", bonito(String(reg.cliente || "").split(/\s+/)[0] || "cliente"))
    .replaceAll("{loja}", nomeLoja).replaceAll("{vendedora}", bonito(reg.vendedora || "") || "nossa equipe")
    .replaceAll("{desconto}", descPerc ? `${String(descPerc).replace(".", ",")}%` : "").replaceAll("{valorDesconto}", fmtBRL((Number(reg.valorTotal) || 0) * (1 - descPerc / 100)))
    .replaceAll("{link}", link)
    .replaceAll("{valor}", fmtBRL(reg.valorTotal)).replaceAll("{validade}", fmtData(reg.validade)).replaceAll("{avaliacao}", av);
  // orçamento: o link do orçamento completo (com fotos) vai sempre; se o texto não tem {link}, entra um parágrafo antes do fim.
  // O WhatsApp monta o botão "Iniciar conversa" pelo PRIMEIRO link: waMePrimeiro() leva o parágrafo do wa.me para o topo.
  if (link && !String(txt || "").includes("{link}")) t = t.trimEnd() + `\n\nVeja o seu orçamento completo, com fotos:\n${link}`;
  return t.replace(/\n{3,}/g, "\n\n").trim();
}
// ---------- PEDIDOS (O.S.) ----------
const MSG_OS_PRONTO = `Olá, {cliente}! 💛\n\nSeu pedido {via} está *PRONTO* para retirada na {loja}.\n\nAcompanhe e veja o código de retirada pelo link:\n{linkAcompanhamento}`;
const MSG_OS_POSVENDA = `Olá, {cliente}! 💛\n\nAqui é da {loja}. Já faz alguns dias que você retirou o seu pedido {via} e queremos saber: ficou tudo certo? Se precisar de qualquer ajuste, estamos à disposição.\n\nObrigado por escolher a Vilaça Joias!`;
const STATUS_OS_NOME: Record<string, string> = { aguardando: "APROVADO", enviado_fabrica: "ENVIADO P/ FÁBRICA", em_producao: "EM PRODUÇÃO", pendencia: "PENDÊNCIA", oficina_pronto: "PRODUZIDO", pronto: "PRONTO", entregue: "ENTREGUE" };
function preencherOS(txt: string, cfg: any, o: any) {
  const lj = lojaDe(cfg, o.lojaId);
  const nomeLoja = (lj && (lj.nomePublico || lj.nomeFantasia || lj.nome)) || "Vilaça Joias";
  const av = "";   // 11/11: pós-venda não pede mais avaliação
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
  const { data } = await admin.from("atendimento_segredos").select("chave, valor").in("chave", ["EVOLUTION_URL", "EVOLUTION_API_KEY", "ACOMPANHAMENTO_CRON_TOKEN"]);
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

/** Envia AGORA a mensagem do status inicial de um orçamento recém-salvo (chamada pela tela, com a sessão da pessoa). */
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
  if (!tel) return nao("sem celular válido");   // o agendador registra a ação sem mensagem
  // reserva: o agendador não manda a mesma ação enquanto esta está em andamento
  o.autoAgenda = { dia: hoje, em: 9e15, passo: 0, tent: 0, imediato: true };
  await admin.from("orcamentos").update({ payload: o, updated_at: new Date().toISOString() }).eq("id", id);
  const liberar = async (motivo: string) => { const { data: r2 } = await admin.from("orcamentos").select("payload").eq("id", id).maybeSingle(); const x = r2 && r2.payload; if (x && x.autoAgenda && x.autoAgenda.imediato) { delete x.autoAgenda; await admin.from("orcamentos").update({ payload: x, updated_at: new Date().toISOString() }).eq("id", id); } return nao(motivo); };
  const H = { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY };
  const instD = await instanciaDisparo();
  const inst = o.lojaId === "loja_rj" ? "reformajoias" : instD;
  try { const rs = await fetch(`${seg.EVOLUTION_URL}/instance/connectionState/${inst}`, { headers: H, signal: AbortSignal.timeout(8000) }); const js = await rs.json().catch(() => ({})); if (String((js && js.instance && js.instance.state) || js.state || "") !== "open") return await liberar("WhatsApp fora do ar (o sistema tenta de novo em seguida)"); } catch (_) { return await liberar("WhatsApp fora do ar (o sistema tenta de novo em seguida)"); }
  const tagOff = ((cfg.tagsClientes || []).find((x: any) => semAcento(x.nome) === "marketing off") || {}).id || "";
  if (tagOff) { try { const { data: off } = await admin.rpc("cliente_marketing_off", { p_id: "", p_fone8: fone8(tel), p_tag: tagOff }); if (off === true) return await liberar("cliente com a tag MARKETING OFF"); } catch (_) {} }
  try { const rw = await fetch(`${seg.EVOLUTION_URL}/chat/whatsappNumbers/${inst}`, { method: "POST", headers: H, body: JSON.stringify({ numbers: [tel] }), signal: AbortSignal.timeout(10000) }); const jw = await rw.json().catch(() => null); if (rw.ok && Array.isArray(jw) && jw[0] && jw[0].exists === false) return await liberar("número sem WhatsApp"); } catch (_) {}
  const t0 = varia(preencher(textoPasso(cfg, p0, 0), cfg, o, descontoDoPasso(cfg, p0), linkOrc(id)));
  const texto = inst === instD ? waMePrimeiro(ajustaTextoDisparo(t0)) : waMePrimeiro(t0);
  let ok = false, status = 0;
  try { const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${inst}`, { method: "POST", headers: H, body: JSON.stringify({ number: tel, text: texto, delay: 1200 }), signal: AbortSignal.timeout(25000) }); status = r.status; const rj = await r.json().catch(() => ({})); ok = r.ok && !!(rj && rj.key); } catch (_) {}
  try { await admin.from("auditoria_log").insert({ usuario_nome: "SISTEMA (automático)", nivel: "sistema", loja_sessao: o.lojaId || null, acao: ok ? "via_whatsapp_enviada" : "via_whatsapp_falhou", modulo: "Acompanhamento automático", tabela: "orc_acao", registro_id: id, resumo: `${ok ? "Enviou" : "Falhou ao enviar"} ${p0.nome} (orçamento salvo) por WhatsApp (${inst}) para …${tel.slice(-4)}`, detalhe: { instancia: inst, status, botao: "auto", rotulo: p0.nome, imediato: true } }); } catch (_) {}
  if (ok && inst === instD) { try { await admin.rpc("disparo_manual"); } catch (_) {} await registrarEnvio(tel, o, "orc_acao", id, "manual"); }
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
    if (body && body.op === "abertoAgora") return await abertoAgora(body);   // chamada da tela (sessão do app), não do agendador
    const seg = await segredos();
    if (!seg.ACOMPANHAMENTO_CRON_TOKEN || req.headers.get("x-cron-token") !== seg.ACOMPANHAMENTO_CRON_TOKEN) return json({ error: "não autorizado" }, 401);
    const agora = agoraBR();
    if (!body.ignorarHorario && !(agora.min >= MIN_INI && agora.min < MIN_FIM_ENVIO)) return json({ ok: true, fora_do_horario: true });
    const podePlanejar = !!body.ignorarHorario || agora.min < MIN_FIM;   // 19h–20h: só sai o que já estava previsto (reserva para atrasos)
    const { data: cf } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const cfg: any = (cf && cf.payload) || {};
    const dryRun = !!body.simular;
    // simulação: `assumirAuto` finge que o envio automático está ligado (só para conferir o que sairia; nada é enviado nem gravado)
    const acoes = dryRun && body.assumirAuto ? { ...(cfg.orcamentoAcoes || {}), auto: true, desde: "2000-01-01" } : (cfg.orcamentoAcoes || {});
    const pv = dryRun && body.assumirAuto ? { ...(cfg.posVendaAuto || {}), auto: true, desde: "2000-01-01" } : (cfg.posVendaAuto || {});
    const po = dryRun && body.assumirAuto ? { ...(cfg.pedidoAcoes || {}), auto: true, desde: "2000-01-01" } : (cfg.pedidoAcoes || {});
    if (!dryRun && !(acoes.auto && acoes.desde) && !(pv.auto && pv.desde) && !(po.auto && po.desde)) return json({ ok: true, desligado: true });
    // pausa do número de disparo (mesma da fila do Marketing)
    if (!dryRun) { const { data: pz } = await admin.from("marketing_disparo_estado").select("pausado_motivo").eq("id", 1).maybeSingle(); if (pz && pz.pausado_motivo) return json({ ok: true, pausado: true, motivo: pz.pausado_motivo }); }
    // trava: só uma execução por vez (roda a cada minuto)
    if (!dryRun) {
      const { data: trava } = await admin.from("marketing_disparo_estado").update({ rodando_ate: new Date(Date.now() + 58000).toISOString() }).eq("id", 2).or(`rodando_ate.is.null,rodando_ate.lt.${new Date().toISOString()}`).select().maybeSingle();
      if (!trava) return json({ ok: true, ocupado: true });
      travado = true;
    }
    const cand: Item[] = [];
    let proximoDia = 0;
    const fechar: { id: string; statusId: string }[] = [];

    // ---------- 1) ações de orçamento ----------
    if (acoes.auto && acoes.desde) {
      const desdeMs = Date.parse(acoes.desde + "T00:00:00-03:00");
      const soNovos = acoes.incluirExistentes === false;
      const passos = passosEfetivos(cfg), fin = finalEfetivo(cfg);
      const encerra = new Set((cfg.statusOrcamento || []).filter((s: any) => s.encerra).map((s: any) => s.id));
      for (let from = 0; from < 20000; from += 1000) {
        const { data } = await admin.from("orcamentos").select("id,payload").gte("updated_at", new Date(Date.now() - 120 * 86400000).toISOString()).range(from, from + 999);
        for (const r of (data || [])) {
          const o = r.payload || {};
          if (o.rascunho || o.convertidoEm || encerra.has(o.status)) continue;   // convertido/rascunho/encerrado: fora de qualquer ação
          if (soNovos && Number(o.criadoEm || 0) < desdeMs) continue;
          const base = o.autoBaseData || o.data || (o.criadoEm ? diaDe(Number(o.criadoEm)) : "");
          if (!base) continue;
          const N = Number(o.autoMensagensEnviadas || 0);
          // posição atual no fluxo (pelo status): nunca volta; o passo 0 (status inicial) só sai se nada foi enviado e o orçamento ainda está nele
          const idxSt = passos.findIndex((p) => p.statusId && p.statusId === o.status);
          // orçamento movido à mão para um status: os dias desse status contam como já cumpridos
          const bonus = N === 0 && idxSt >= 1 && o.autoBaseData ? Number(passos[idxSt].dias) || 0 : 0;
          const dias = diasEntre(base, agora.dia) + bonus;
          if (fin.ativo && !o.editadoManualmente && dias >= Number(fin.dias)) { fechar.push({ id: r.id, statusId: fin.statusId || "recusado" }); continue; }
          // ação correta pelo prazo: a mais avançada que já venceu (sem repetir as anteriores)
          let k = -1;
          for (let j = passos.length - 1; j >= Math.max(N, 0); j--) {
            if (j <= idxSt && j > 0) break;                       // não volta de status
            if (j === 0 && !(N === 0 && (idxSt <= 0))) break;     // ação 0: só orçamento novo, ainda no status inicial
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
    // ---------- 2) pós-venda ----------
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
    // ---------- 3) pedidos (O.S.): aviso de PRONTO e pós-venda de ENTREGUE ----------
    if (po.auto && po.desde) {
      const diasPV = Number(po.posVendaDias) || 7;
      const desdeMs = Date.parse(po.desde + "T00:00:00-03:00");
      for (let from = 0; from < 20000; from += 1000) {
        const { data } = await admin.from("ordens_servico").select("id,payload").gte("updated_at", new Date(Date.now() - 60 * 86400000).toISOString()).range(from, from + 999);
        for (const r of (data || [])) {
          const o = r.payload || {};
          if (o.rascunho || o.status === "cancelado") continue;
          const jaLog = (k: string) => (Array.isArray(o.acoesLog) ? o.acoesLog : []).some((a: any) => a && a.passo === k);
          if (o.status === "pronto" && Number(o.statusEm || 0) >= desdeMs && !(o.msgEnviadas && o.msgEnviadas.pronto) && !jaLog("os_pronto")) {
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

    const agoraIso0 = new Date().toISOString();
    // encerramento automático dos orçamentos que passaram do prazo final (sem mensagem)
    for (const f of fechar) {
      const { data: row } = await admin.from("orcamentos").select("payload").eq("id", f.id).maybeSingle();
      const o = row && row.payload; if (!o || o.convertidoEm) continue;
      o.status = f.statusId; o.statusAtualizadoEm = agoraIso0; delete o.autoAgenda;
      (o.acoesLog = o.acoesLog || []).push({ em: agoraIso0, acao: "encerrado automaticamente (prazo final)", por: "sistema" });
      await admin.from("orcamentos").update({ payload: o, updated_at: agoraIso0 }).eq("id", f.id);
      try { await admin.from("auditoria_log").insert({ usuario_nome: "SISTEMA (automático)", nivel: "sistema", loja_sessao: o.lojaId || null, acao: "orcamento_status_auto", modulo: "Acompanhamento automático", tabela: "orcamentos", registro_id: f.id, resumo: `Encerrou o orçamento pelo prazo final (${f.statusId})`, detalhe: { botao: "auto" } }); } catch (_) {}
    }

    // ---------- horários do dia (regras do aniversário) ----------
    const validos = (it: Item) => it.agenda && it.agenda.dia === agora.dia && it.agenda.passo === it.passo;
    // o que ficou de dias anteriores (não saiu até as 20h) vai na frente: começo do dia seguinte
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
      // primeiro: sobras de dias anteriores e ação 0 (orçamento recém-salvo) — logo, uma atrás da outra (5–7 min); o resto espalhado no dia
      const imediatos = semHorario.filter((it) => sobra(it) || (it.tipo === "orcamento" && it.passo === 0 && it.statusDestino && it.pulados === 0));
      let t = Math.max(Date.now() + 25000, iniDia, ultimo ? ultimo + PISO_SEG_MS : 0);
      for (const it of imediatos) {
        if (t >= fimDia) { proximoDia++; continue; }
        await gravarAgenda(it, t);
        ultimo = Math.max(ultimo, t); t += PISO_SEG_MS + Math.floor(Math.random() * 120000);
      }
      // demais: janela restante do dia cortada em partes iguais, horário sorteado em cada uma (regras do aniversário)
      const outros = semHorario.filter((it) => !imediatos.includes(it));
      if (outros.length) {
        const jan = janelaHoje(Date.now(), ultimo ? ultimo + PISO_SEG_MS : 0);
        const d = jan ? distribuir(outros.length, jan) : { cabem: 0, horas: [] as number[] };
        for (let i = 0; i < outros.length; i++) {
          if (i >= d.cabem) { proximoDia++; continue; }   // não coube hoje: entra na fila de amanhã
          await gravarAgenda(outros[i], d.horas[i]);
        }
      }
    }

    // ---------- envio ----------
    const H = { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY };
    const INST_D = await instanciaDisparo();
    const instanciaDe = (lojaId: string) => (lojaId === "loja_rj" ? "reformajoias" : INST_D);
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
    // conta para a fila única: o que já venceu (prioridade sobre o Marketing) e o que ainda sai hoje
    const pendHoje = cand.filter((it) => validos(it) && Number(it.agenda.em) < 9e14 && instanciaDe(String(it.reg.lojaId || "")) === INST_D);
    const devidos0 = pendHoje.filter((it) => Number(it.agenda.em) <= Date.now() && it.tel).length;
    if (!dryRun) await admin.from("marketing_disparo_estado").update({ cards_devidos: devidos0, cards_restantes: pendHoje.length, cards_em: new Date().toISOString() }).eq("id", 1);
    let usouVez = false;   // no número de disparo sai no máximo 1 automática por rodada (a próxima só daqui a ≥ 5 min)
    while (Date.now() - inicio < LIMITE_MS) {
      const devidos = cand.filter((it) => validos(it) && !feitos.has(it.id) && Number(it.agenda.em) <= Date.now()).sort((a, b) => Number(a.agenda.em) - Number(b.agenda.em));
      const f = devidos[0];
      if (!f) break;   // nada vence agora: a próxima rodada (1 min) confere de novo
      feitos.add(f.id);
      const inst = instanciaDe(String(f.reg.lojaId || ""));
      // relê o registro (evita sobrescrever edição recente) e confere que ainda precisa agir
      const { data: row } = await admin.from(f.tabela).select("payload").eq("id", f.id).maybeSingle();
      const reg = row && row.payload; if (!reg) continue;
      if (f.tipo === "orcamento" && (Number(reg.autoMensagensEnviadas || 0) > f.passo || reg.convertidoEm || reg.rascunho)) continue;
      if (f.tipo === "posvenda" && reg.posVendaEnviadoEm) continue;
      if (f.tipo === "os_pronto" && (reg.status !== "pronto" || (reg.msgEnviadas && reg.msgEnviadas.pronto))) continue;   // mudou de status ou o botão já enviou na hora
      if (f.tipo === "os_posvenda" && (reg.status !== "entregue" || reg.posVendaEnviadoEm)) continue;
      if (f.tel && !(await aberta(inst))) continue;   // WhatsApp fora do ar: fica para o próximo minuto / dia seguinte (sobra vai para o começo do dia seguinte)
      let motivoSem = "", ok = false, status = 0;
      if (!f.tel) motivoSem = "sem celular válido";
      if (!motivoSem && tagOff) { try { const { data: off } = await admin.rpc("cliente_marketing_off", { p_id: "", p_fone8: fone8(f.tel!), p_tag: tagOff }); if (off === true) motivoSem = "cliente com a tag MARKETING OFF"; } catch (_) {} }
      if (!motivoSem) { try { const rw = await fetch(`${seg.EVOLUTION_URL}/chat/whatsappNumbers/${inst}`, { method: "POST", headers: H, body: JSON.stringify({ numbers: [f.tel] }), signal: AbortSignal.timeout(10000) }); const jw = await rw.json().catch(() => null); if (rw.ok && Array.isArray(jw) && jw[0] && jw[0].exists === false) motivoSem = "número sem WhatsApp"; } catch (_) {} }
      if (!motivoSem && inst === INST_D) {
        // fila única: pega a vez (≥ 5 min da última; cards na frente do Marketing)
        if (usouVez) break;
        const { data: est } = await admin.from("marketing_disparo_estado").select("mkt_restantes, cards_restantes").eq("id", 1).maybeSingle();
        const rest = Math.max(0, Number((est && est.cards_restantes) || 0) - 1) + Number((est && est.mkt_restantes) || 0);
        const { data: vez } = await admin.rpc("disparo_vez", { p_cards: true, p_gap_seg: gapSeg(rest) });
        if (vez !== true) break;
        usouVez = true;
      }
      if (!motivoSem) {
        try {
          const texto = inst === INST_D ? waMePrimeiro(ajustaTextoDisparo(varia(f.texto))) : waMePrimeiro(varia(f.texto));
          const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${inst}`, { method: "POST", headers: H, body: JSON.stringify({ number: f.tel, text: texto, delay: 2500 + Math.floor(Math.random() * 5500) }), signal: AbortSignal.timeout(25000) });
          status = r.status; const rj = await r.json().catch(() => ({})); ok = r.ok && !!(rj && rj.key);
        } catch (_) {}
        try {
          await admin.from("auditoria_log").insert({ usuario_nome: "SISTEMA (automático)", nivel: "sistema", loja_sessao: reg.lojaId || null, acao: ok ? "via_whatsapp_enviada" : "via_whatsapp_falhou", modulo: "Acompanhamento automático", tabela: f.tipo === "orcamento" ? "orc_acao" : "posvenda", registro_id: f.id,
            resumo: `${ok ? "Enviou" : "Falhou ao enviar"} ${f.nomeAcao} (${f.tipo}) por WhatsApp (${inst}) para …${String(f.tel).slice(-4)}`, detalhe: { instancia: inst, status, botao: "auto", rotulo: f.nomeAcao } });
        } catch (_) {}
        if (!ok) {
          // falha: tenta de novo daqui a 5 min (até 3 vezes); depois fica para o dia seguinte
          const tent = Number((reg.autoAgenda && reg.autoAgenda.tent) || 0) + 1;
          reg.autoAgenda = tent >= 3 ? { dia: agora.dia, em: 9e15, passo: f.passo, tent } : { dia: agora.dia, em: Date.now() + 5 * 60000, passo: f.passo, tent };
          await admin.from(f.tabela).update({ payload: reg, updated_at: new Date().toISOString() }).eq("id", f.id);
          falhasSeguidas++;
          if (status === 401 || status === 403 || falhasSeguidas >= FALHAS_PARA_PAUSAR) { pausar = status === 401 || status === 403 ? `O WhatsApp negou o acesso (${status}) — número possivelmente restrito` : `${falhasSeguidas} falhas seguidas no envio automático de orçamentos/pós-venda`; break; }
          const idx = cand.findIndex((x) => x.id === f.id); if (idx >= 0) { cand[idx].agenda = reg.autoAgenda; feitos.delete(f.id); }
          continue;
        }
        falhasSeguidas = 0;
        if (inst === INST_D) await registrarEnvio(String(f.tel), reg, f.tipo, f.id, "auto");
      } else {
        semMensagem++;
        try { await admin.from("auditoria_log").insert({ usuario_nome: "SISTEMA (automático)", nivel: "sistema", loja_sessao: reg.lojaId || null, acao: "orcamento_status_auto", modulo: "Acompanhamento automático", tabela: f.tipo === "orcamento" ? "orcamentos" : "vendas_pdv", registro_id: f.id, resumo: `Não enviou ${f.nomeAcao}: ${motivoSem}`, detalhe: { botao: "auto", motivo: motivoSem } }); } catch (_) {}
      }
      // aplica o resultado: mensagem enviada (ou impossível) → próximo passo e status do prazo
      const agoraIso = new Date().toISOString();
      delete reg.autoAgenda;
      if (f.tipo === "orcamento") {
        reg.autoMensagensEnviadas = f.passo + 1;
        if (f.statusDestino) { reg.status = f.statusDestino; reg.statusAtualizadoEm = agoraIso; }
        if (!motivoSem) { reg.msgEnviadas = reg.msgEnviadas || {}; reg.msgEnviadas[f.statusDestino || reg.status] = agoraIso; }   // visto de mensagem enviada deste status
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
