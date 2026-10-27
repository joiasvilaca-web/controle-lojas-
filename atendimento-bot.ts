// atendimento-bot v6 (v6: Agente de IA fora do horário via atendimento-ia responderAuto, resumo automático ao finalizar, canal Messenger) v5 (v5: provedor duplo Evolution/Cloud API, menus interativos, blacklist, carteira, protocolo sequencial, nota 0-10, motivo/contato finaliza, agrupamento, recado, resolve bot_id) v3 (v3: distribuição entre online, aviso de atendente, KPIs, catálogo de etiquetas/modelos; v2: ops com sessão) — bot de pré-atendimento: boas-vindas, menu por localidade/departamento,
// palavras-chave, fora do expediente (recado), opção inválida, enquete de satisfação.
// Chamado pelo webhook a cada mensagem recebida ({canal, instancia, contato_id}) e pela
// atendimento-api ({acao:"finalizou", conversa_id}). verify_jwt false — protegido por x-bot-token.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const BOT_TOKEN = "vjw_bot_4d8e1b7a92c63f05";
const IG_API = "https://graph.instagram.com/v21.0";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
const CHAVES_MSG = ["boasvindas", "escolha", "voltar", "invalida", "transferindo", "fora_bot", "fora_departamento", "recado_ok", "encerramento", "enquete", "enquete_invalida", "enquete_obrigado", "atendente_assumiu"];
function fluxoLimpo(x: any) {
  const str = (v: any, n = 1500) => String(v == null ? "" : v).slice(0, n);
  const msgs: any = {}; for (const k of CHAVES_MSG) if (x && x.msgs && typeof x.msgs[k] === "string") msgs[k] = str(x.msgs[k]);
  const menu = (Array.isArray(x.menu) ? x.menu : []).slice(0, 20).map((m: any) => ({ n: str(m.n, 3).trim(), departamento_id: str(m.departamento_id, 40), rotulo: str(m.rotulo, 80).trim() })).filter((m: any) => m.n && m.departamento_id);
  const palavras = (Array.isArray(x.palavras) ? x.palavras : []).slice(0, 50).map((p: any) => ({ chaves: (Array.isArray(p.chaves) ? p.chaves : String(p.chaves || "").split(",")).map((c: any) => str(c, 60).trim()).filter(Boolean).slice(0, 20), resposta: str(p.resposta), departamento_id: p.departamento_id ? str(p.departamento_id, 40) : null })).filter((p: any) => p.chaves.length && (p.resposta || p.departamento_id));
  return { ativo: !!x.ativo, empresa: str(x.empresa, 80), voltar_digito: str(x.voltar_digito || "9", 3).trim() || "9", reenviar_apos_horas: Math.min(168, Math.max(1, Number(x.reenviar_apos_horas) || 12)), enviar_encerramento: !!x.enviar_encerramento, enquete: { ativa: !!(x.enquete && x.enquete.ativa), escala: x.enquete && x.enquete.escala === "10" ? "10" : "5", tempo_min: Math.min(1440, Math.max(0, Number(x.enquete && x.enquete.tempo_min) || 0)) }, enviar_nome_atendente: !!x.enviar_nome_atendente, motivo_obrigatorio: !!x.motivo_obrigatorio, motivos: (Array.isArray(x.motivos) ? x.motivos : String(x.motivos || "").split(/[\n,;]+/)).map((m: any) => str(m, 60).trim().toUpperCase()).filter(Boolean).slice(0, 40), contato_pode_finalizar: !!x.contato_pode_finalizar, palavras_finalizar: (Array.isArray(x.palavras_finalizar) ? x.palavras_finalizar : String(x.palavras_finalizar || "sair,encerrar").split(",")).map((m: any) => str(m, 30).trim()).filter(Boolean).slice(0, 10), agrupar_segundos: Math.min(20, Math.max(0, Number(x.agrupar_segundos) || 0)), recado_minutos: Math.min(1440, Math.max(0, Number(x.recado_minutos) || 0)), interativo: !!x.interativo, potenciais: { modo: ["nunca", "novos", "msg_sem_atendimento"].includes(x.potenciais && x.potenciais.modo) ? x.potenciais.modo : "nunca", minutos: Math.min(1440, Math.max(1, Number(x.potenciais && x.potenciais.minutos) || 10)) }, avisar_assumiu: !!x.avisar_assumiu, distribuicao: x.distribuicao === "online" ? "online" : "manual", msgs, menu, palavras };
}

let __seg: Record<string, string> | null = null;
async function segredos() {
  if (__seg) return __seg;
  const out: Record<string, string> = {};
  for (const k of ["EVOLUTION_URL", "EVOLUTION_API_KEY", "INSTAGRAM_TOKEN", "FB_PAGE_TOKEN"]) { const v = Deno.env.get(k); if (v) out[k] = v; }
  const { data } = await admin.from("atendimento_segredos").select("chave, valor");
  for (const r of data || []) if (!out[r.chave]) out[r.chave] = r.valor;
  if (out.EVOLUTION_URL) out.EVOLUTION_URL = out.EVOLUTION_URL.replace(/\/+$/, "");
  __seg = out; return out;
}

/* ---------- horário ---------- */
function agoraSP() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  return { dia, min: (Number(g("hour")) % 24) * 60 + Number(g("minute")) };
}
const hm = (s: string) => { const [h, m] = String(s).split(":"); return Number(h) * 60 + Number(m || 0); };
function dentroDoHorario(h: any): boolean {
  if (!h || !h.dias) return true;
  const { dia, min } = agoraSP(); const d = h.dias[String(dia)];
  if (!d || !d.ativo) return false;
  const faixas = Array.isArray(d.faixas) && d.faixas.length ? d.faixas : [["00:00", "24:00"]];
  return faixas.some((f: any) => { const a = hm(f[0]), b = hm(f[1]); return a === b ? true : (min >= a && min < b); });
}
const NOMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
function resumoHorario(h: any): string {
  if (!h || !h.dias) return "";
  const linhas: string[] = []; let i = 1; const ordem = [1, 2, 3, 4, 5, 6, 0];
  const txt = (d: any) => (!d || !d.ativo) ? "fechado" : (Array.isArray(d.faixas) && d.faixas.length ? d.faixas.map((f: any) => f[0] === f[1] ? "24h" : `${f[0]}–${f[1]}`).join(" e ") : "24h");
  let j = 0;
  while (j < ordem.length) {
    let k = j; const t = txt(h.dias[String(ordem[j])]);
    while (k + 1 < ordem.length && txt(h.dias[String(ordem[k + 1])]) === t) k++;
    if (t !== "fechado") linhas.push((k > j ? `${NOMES[ordem[j]]} a ${NOMES[ordem[k]]}` : NOMES[ordem[j]]) + `: ${t}`);
    j = k + 1;
  }
  void i; return linhas.join(" | ");
}

/* ---------- texto ---------- */
const norm = (s: any) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
function tpl(t: string, v: Record<string, string>): string {
  return String(t || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k) => {
    const mapa: Record<string, string> = { "client.name": v.empresa, empresa: v.empresa, "contact.name": v.contato, contato: v.contato, "ticket.id": v.protocolo, protocolo: v.protocolo, departamento: v.departamento, atendente: v.atendente, horario: v.horario };
    return mapa[k] !== undefined ? mapa[k] : "";
  }).replace(/[ \t]+\n/g, "\n").trim();
}

/* ---------- envio ---------- */
const ehCloud = (conv: any) => conv.canal === "whatsapp" && String(conv.instancia || "").startsWith("wa_");
const GRAPH = "https://graph.facebook.com/v21.0";
async function cloudEnviar(conv: any, payload: any): Promise<string | null> {
  const { data: cfg } = await admin.from("atendimento_wa_cloud").select("phone_number_id, token").eq("instancia", conv.instancia).maybeSingle();
  if (!cfg) { console.error("número oficial não cadastrado", conv.instancia); return null; }
  const res = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.token }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: conv.contato_id, ...payload }) });
  const r = await res.json().catch(() => null);
  if (!res.ok) { console.error("bot cloud", res.status, JSON.stringify(r)); throw new Error("cloud " + res.status); }
  return r && r.messages && r.messages[0] && r.messages[0].id || null;
}
async function enviar(conv: any, bot: any, texto: string, interativo?: any) {
  if (!texto) return;
  let externoId: string | null = null;
  try {
    if (ehCloud(conv)) {
      if (interativo) { try { externoId = await cloudEnviar(conv, { type: "interactive", interactive: interativo }); } catch { externoId = await cloudEnviar(conv, { type: "text", text: { body: texto.slice(0, 4000), preview_url: false } }); } }
      else externoId = await cloudEnviar(conv, { type: "text", text: { body: texto.slice(0, 4000), preview_url: false } });
    } else if (conv.canal === "whatsapp") {
      const s = await segredos();
      const res = await fetch(`${s.EVOLUTION_URL}/message/sendText/${encodeURIComponent(conv.instancia)}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: s.EVOLUTION_API_KEY }, body: JSON.stringify({ number: conv.contato_id, text: texto }) });
      const r = await res.json().catch(() => null);
      if (!res.ok) { console.error("bot sendText", res.status, r); return; }
      externoId = r && r.key && r.key.id ? r.key.id : null;
    } else if (conv.canal === "instagram") {
      const token = (bot.segredos && bot.segredos.INSTAGRAM_TOKEN) || (await segredos()).INSTAGRAM_TOKEN;
      const res = await fetch(`${IG_API}/me/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ recipient: { id: conv.contato_id }, message: { text: texto.slice(0, 1000) } }) });
      const r = await res.json().catch(() => null);
      if (!res.ok) { console.error("bot instagram", res.status, r); return; }
      externoId = r && r.message_id ? r.message_id : null;
    } else if (conv.canal === "messenger") {
      const token = (bot.segredos && bot.segredos.FB_PAGE_TOKEN) || (await segredos()).FB_PAGE_TOKEN;
      if (!token) { console.error("bot messenger: FB_PAGE_TOKEN não configurado"); return; }
      const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: conv.contato_id }, messaging_type: "RESPONSE", message: { text: texto.slice(0, 2000) } }) });
      const r = await res.json().catch(() => null);
      if (!res.ok) { console.error("bot messenger", res.status, r); return; }
      externoId = r && r.message_id ? r.message_id : null;
    } else return;
  } catch (e) { console.error("bot enviar", e); return; }
  const agora = new Date().toISOString();
  await admin.from("atendimento_mensagens").upsert({ conversa_id: conv.id, canal: conv.canal, direcao: "out", tipo: "texto", texto, externo_id: externoId || ("bot_" + crypto.randomUUID()), autor_nome: "🤖 Bot", status: "enviada", enviada_em: agora }, { onConflict: "conversa_id,externo_id", ignoreDuplicates: false });
  await admin.from("atendimento_conversas").update({ ultima_mensagem_em: agora, ultima_mensagem_texto: texto, ultima_direcao: "out", updated_at: agora }).eq("id", conv.id);
}
// rótulo do botão/lista: até 20 caracteres, sem caracteres especiais
const tituloMenu = (m: any, deps: any[]) => String(m.rotulo || (deps.find((d) => d.id === m.departamento_id) || {}).nome || "").trim();
const rotuloOk = (t: string) => t.length > 0 && t.length <= 20 && /^[\p{L}\p{N} \-]+$/u.test(t);
// menu: no WhatsApp OFICIAL vira botões (até 3) ou lista (até 10) quando os rótulos permitem; senão (e em qualquer outro canal) segue em texto numerado
async function enviarMenu(conv: any, bot: any, f: any, deps: any[], intro: string, escolha: string) {
  const itens: any[] = f.menu || [];
  const textoPuro = [intro, listaMenu(f, deps), escolha].filter(Boolean).join("\n\n");
  if (f.interativo && ehCloud(conv) && itens.length && itens.length <= 10 && itens.every((m) => rotuloOk(tituloMenu(m, deps)))) {
    const body = { text: (intro || "Escolha uma opção:").slice(0, 1024) };
    const inter = itens.length <= 3
      ? { type: "button", body, action: { buttons: itens.map((m) => ({ type: "reply", reply: { id: String(m.n), title: tituloMenu(m, deps) } })) } }
      : { type: "list", body, action: { button: "Escolher", sections: [{ title: "Opções", rows: itens.map((m) => ({ id: String(m.n), title: tituloMenu(m, deps) })) }] } };
    return enviar(conv, bot, textoPuro, inter);
  }
  return enviar(conv, bot, textoPuro);
}

const PADRAO = {
  empresa: "Vilaça Joias",
  msgs: {
    boasvindas: "Olá!\n\nSeja bem-vindo(a) à {{empresa}}!\n\nPara começarmos, digite o número correspondente a sua localidade:",
    escolha: "Digite o *NÚMERO* correspondente a sua localidade.",
    voltar: "Digite 9 para voltar ao menu principal.",
    invalida: "Opção inválida. Por favor, digite apenas o número de uma das opções abaixo.",
    transferindo: "Perfeito! Você será atendido(a) por *{{departamento}}*. Aguarde um instante que já vamos lhe responder. 😊\nProtocolo: {{protocolo}}",
    fora_bot: "Olá! No momento estamos fora do horário de atendimento.\n{{horario}}\nDeixe sua mensagem que responderemos assim que possível. 🙏",
    fora_departamento: "O setor *{{departamento}}* está fora do horário de atendimento agora.\n{{horario}}\nSua mensagem foi registrada e responderemos assim que abrirmos. 🙏\nProtocolo: {{protocolo}}",
    recado_ok: "Recebemos sua mensagem! Responderemos assim que possível. 🙏",
    encerramento: "Atendimento finalizado. Obrigado por falar com a {{empresa}}! 💎",
    enquete: "De 1 a 5, como você avalia o atendimento que recebeu? (1 = ruim, 5 = excelente)",
    enquete_invalida: "Por favor, responda apenas com um número de 1 a 5.",
    enquete_obrigado: "Obrigado pela avaliação! 💎",
    atendente_assumiu: "{{atendente}} iniciou o seu atendimento. 😊",
  },
  voltar_digito: "9", reenviar_apos_horas: 12, menu: [] as any[], palavras: [] as any[], enquete: { ativa: false, escala: "5", tempo_min: 0 }, enviar_nome_atendente: false, motivo_obrigatorio: false, motivos: [] as string[], contato_pode_finalizar: false, palavras_finalizar: ["sair", "encerrar"], agrupar_segundos: 0, recado_minutos: 0, interativo: false, potenciais: { modo: "nunca", minutos: 10 }, enviar_encerramento: false, avisar_assumiu: false, distribuicao: "manual",
};
function fluxoDe(bot: any) {
  const f = (bot.config && bot.config.fluxo) || {};
  const msgs: any = { ...PADRAO.msgs }; for (const k of Object.keys(f.msgs || {})) if (f.msgs[k]) msgs[k] = f.msgs[k];
  const enq = { ...PADRAO.enquete, ...(f.enquete || {}) } as any;
  if (enq.escala === "10") { if (!(f.msgs && f.msgs.enquete)) msgs.enquete = "De 0 a 10, como você avalia o atendimento que recebeu? (0 = péssimo, 10 = excelente)"; if (!(f.msgs && f.msgs.enquete_invalida)) msgs.enquete_invalida = "Por favor, responda apenas com um número de 0 a 10."; }
  return { ...PADRAO, ...f, empresa: f.empresa || PADRAO.empresa, msgs, enquete: enq };
}
function listaMenu(f: any, deps: any[]): string {
  return (f.menu || []).map((m: any) => `${m.n} - ${m.rotulo || (deps.find((d) => d.id === m.departamento_id) || {}).nome || ""}`).join("\n");
}

async function salvarEstado(conv: any, est: any, extra: any = {}) {
  const novo = { ...est, em: new Date().toISOString() };
  await admin.from("atendimento_conversas").update({ bot_estado: novo, ...extra }).eq("id", conv.id);
  conv.bot_estado = novo; Object.assign(conv, extra);
}

/* ---------- Agente de IA (atendimento-ia) ---------- */
const iaCfg = (bot: any) => (bot && bot.config && bot.config.ia) || {};
const iaFora = (bot: any) => !!(iaCfg(bot).ativo && iaCfg(bot).foraHorario);
// cumprimento/agradecimento puro não merece resposta da IA logo depois da mensagem de "fora do horário"
const soCumprimento = (t: string) => { const x = norm(t).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim(); return !x || /^((oi+|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|tudo bem|tudo bom|ok|okay|obrigad[oa]|valeu|blz|beleza|sim|nao)\s*)+$/.test(x); };
async function chamarIA(op: string, corpo: any): Promise<any> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/atendimento-ia`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + SERVICE_ROLE_KEY, apikey: SERVICE_ROLE_KEY, "x-bot-token": BOT_TOKEN }, body: JSON.stringify({ op, ...corpo }) });
    const r = await res.json().catch(() => ({})); if (!res.ok) console.error("atendimento-ia", op, res.status, r); return r || {};
  } catch (e) { console.error("chamarIA", e); return {}; }
}
async function iaResponder(conv: any, ultimoId: string | null, contexto = ""): Promise<boolean> {
  const r = await chamarIA("responderAuto", { conversaId: conv.id, ultimoId, contexto });
  if (r && r.motivo && !r.enviado) console.log("ia não respondeu:", r.motivo);
  return !!(r && r.enviado);
}

async function rotear(conv: any, bot: any, f: any, deps: any[], dep: any, est: any) {
  const v = vars(conv, f, dep);
  await salvarEstado(conv, { ...est, etapa: "atendimento" }, { departamento_id: dep.id, setor: dep.nome });
  if (!dentroDoHorario(dep.horario)) { v.horario = resumoHorario(dep.horario); await enviar(conv, bot, tpl(f.msgs.fora_departamento, v)); return; }
  if (f.distribuicao === "online") {
    const at = await escolherAtendente(dep, bot);
    if (at) {
      await admin.from("atendimento_conversas").update({ atendente_id: at.id, atendente_nome: at.nome, status: "em_atendimento", updated_at: new Date().toISOString() }).eq("id", conv.id);
      conv.atendente_id = at.id; conv.atendente_nome = at.nome;
      await admin.from("atendimento_mensagens").insert({ conversa_id: conv.id, canal: conv.canal, direcao: "out", tipo: "sistema", texto: `Distribuída automaticamente para ${at.nome}`, autor_nome: "🤖 Bot", status: "enviada" });
      v.atendente = at.nome;
    }
  }
  await enviar(conv, bot, tpl(f.msgs.transferindo, v));
}
async function nomesFuncionarios(): Promise<Record<string, string>> {
  const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  const out: Record<string, string> = {};
  for (const f of ((data && data.payload && data.payload.funcionarios) || [])) out[f.id] = ((f.apelido || "").trim()) || f.nome || "";
  return out;
}
// atendente online do departamento, no expediente, com menos conversas em andamento
async function escolherAtendente(dep: any, bot: any): Promise<{ id: string; nome: string } | null> {
  const { data: ats } = await admin.from("atendimento_atendentes").select("*").eq("online", true);
  const cand = (ats || []).filter((a: any) => Array.isArray(a.departamentos) && a.departamentos.includes(dep.id) && dentroDoHorario(a.horario || dep.horario || bot.horario));
  if (!cand.length) return null;
  const { data: abertas } = await admin.from("atendimento_conversas").select("atendente_id").eq("status", "em_atendimento").not("atendente_id", "is", null);
  const carga: Record<string, number> = {}; for (const c of abertas || []) carga[c.atendente_id] = (carga[c.atendente_id] || 0) + 1;
  cand.sort((a: any, b: any) => ((carga[a.funcionario_id] || 0) - (carga[b.funcionario_id] || 0)) || String(a.updated_at).localeCompare(String(b.updated_at)));
  const esc = cand[0]; const nomes = await nomesFuncionarios();
  await admin.from("atendimento_atendentes").update({ updated_at: new Date().toISOString() }).eq("funcionario_id", esc.funcionario_id);
  return { id: esc.funcionario_id, nome: nomes[esc.funcionario_id] || "Atendente" };
}
async function aoAssumir(conversaId: string) {
  const { data: conv } = await admin.from("atendimento_conversas").select("*").eq("id", conversaId).maybeSingle();
  if (!conv || !conv.bot_id || !conv.atendente_id) return;
  const { data: bot } = await admin.from("atendimento_bots").select("*").eq("id", conv.bot_id).maybeSingle();
  if (!bot || !bot.ativo || !bot.config || !bot.config.fluxo || !bot.config.fluxo.ativo) return;
  const f = fluxoDe(bot); if (!f.avisar_assumiu) return;
  const est = conv.bot_estado || {}; if (est.avisou === conv.atendente_id) return;
  await salvarEstado(conv, { ...est, etapa: "atendimento", avisou: conv.atendente_id });
  await enviar(conv, bot, tpl(f.msgs.atendente_assumiu, vars(conv, f, null)));
}
function vars(conv: any, f: any, dep: any, horario?: string) {
  return { empresa: f.empresa || "", contato: conv.contato_nome || "", protocolo: conv.protocolo ? String(conv.protocolo) : String(conv.id).slice(0, 8).toUpperCase(), departamento: dep ? dep.nome : "", atendente: conv.atendente_nome || "", horario: horario || (dep ? resumoHorario(dep.horario) : "") };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function processar(canal: string, instancia: string, contatoId: string) {
  let { data: conv } = await admin.from("atendimento_conversas").select("*").eq("instancia", instancia).eq("contato_id", contatoId).maybeSingle();
  if (!conv) return;
  // contato na blacklist: ninguém responde
  { const { data: bl } = await admin.from("atendimento_blacklist").select("id").eq("canal", canal).eq("contato", contatoId).maybeSingle(); if (bl) return; }
  // conversa sem bot (webhook não preenche): descobre pelo canal
  if (!conv.bot_id) {
    const { data: bs } = await admin.from("atendimento_bots").select("id, canais");
    const ach = (bs || []).find((x: any) => (x.canais || []).some((c: any) => c.instancia === instancia || (c.tipo === "instagram" && "ig_" + c.ig_id === instancia) || (c.tipo === "messenger" && "fb_" + c.page_id === instancia)));
    if (ach) { await admin.from("atendimento_conversas").update({ bot_id: ach.id }).eq("id", conv.id); conv.bot_id = ach.id; }
  }
  // novo atendimento depois de finalizado: protocolo novo (a enquete em andamento mantém o mesmo)
  if (conv.encerrado_em && conv.status !== "finalizado" && !(conv.bot_estado && conv.bot_estado.etapa === "enquete")) {
    await admin.rpc("atendimento_renovar", { p_id: conv.id });
    const { data: c2 } = await admin.from("atendimento_conversas").select("*").eq("id", conv.id).maybeSingle(); if (c2) conv = c2;
  }
  // carteira: contato fixo de uma atendente vai direto para ela
  if (!conv.atendente_id && conv.status !== "em_atendimento" && !(conv.bot_estado && conv.bot_estado.etapa === "enquete")) {
    const { data: ct } = await admin.from("atendimento_contatos").select("atendente_id, atendente_nome, departamento_id").eq("canal", canal).eq("telefone", contatoId).eq("carteira", true).not("atendente_id", "is", null).maybeSingle();
    if (ct) {
      await admin.from("atendimento_conversas").update({ atendente_id: ct.atendente_id, atendente_nome: ct.atendente_nome, status: "em_atendimento", departamento_id: ct.departamento_id || conv.departamento_id, updated_at: new Date().toISOString() }).eq("id", conv.id);
      await admin.from("atendimento_mensagens").insert({ conversa_id: conv.id, canal: conv.canal, direcao: "out", tipo: "sistema", texto: `Carteira: direcionada para ${ct.atendente_nome || "atendente"}`, autor_nome: "🤖 Bot", status: "enviada" });
      conv.atendente_id = ct.atendente_id; conv.atendente_nome = ct.atendente_nome; conv.status = "em_atendimento";
      return;
    }
  }
  if (!conv.bot_id) return;
  const { data: bot } = await admin.from("atendimento_bots").select("*").eq("id", conv.bot_id).maybeSingle();
  if (!bot || !bot.ativo) return;
  if (!bot.config || !bot.config.fluxo || !bot.config.fluxo.ativo) {
    // fluxo (menu/boas-vindas) desligado: só o Agente de IA pode responder, e só fora do horário e sem atendente
    if (!iaFora(bot) || dentroDoHorario(bot.horario) || (conv.atendente_id && conv.status === "em_atendimento")) return;
    const { data: u1 } = await admin.from("atendimento_mensagens").select("externo_id").eq("conversa_id", conv.id).eq("direcao", "in").order("enviada_em", { ascending: false }).limit(1).maybeSingle();
    await dormir(6000); // espera a pessoa terminar de digitar: só a última mensagem da rajada é respondida
    const { data: u2 } = await admin.from("atendimento_mensagens").select("externo_id").eq("conversa_id", conv.id).eq("direcao", "in").order("enviada_em", { ascending: false }).limit(1).maybeSingle();
    if (!u2 || (u1 && u2.externo_id !== u1.externo_id)) return;
    await iaResponder(conv, u2.externo_id);
    return;
  }
  const f = fluxoDe(bot);
  const { data: deps } = await admin.from("atendimento_departamentos").select("*").eq("ativo", true);
  let { data: ult } = await admin.from("atendimento_mensagens").select("texto, tipo, externo_id").eq("conversa_id", conv.id).eq("direcao", "in").order("enviada_em", { ascending: false }).limit(1).maybeSingle();
  // agrupamento: espera a pessoa terminar de digitar; só a última mensagem da rajada dispara o bot
  if (f.agrupar_segundos > 0 && ult && !(conv.bot_estado && conv.bot_estado.etapa === "enquete")) {
    await dormir(f.agrupar_segundos * 1000);
    const { data: nova } = await admin.from("atendimento_mensagens").select("texto, tipo, externo_id").eq("conversa_id", conv.id).eq("direcao", "in").order("enviada_em", { ascending: false }).limit(1).maybeSingle();
    if (nova && ult && nova.externo_id !== ult.externo_id) return;
    const { data: ultOut } = await admin.from("atendimento_mensagens").select("enviada_em").eq("conversa_id", conv.id).eq("direcao", "out").order("enviada_em", { ascending: false }).limit(1).maybeSingle();
    let q = admin.from("atendimento_mensagens").select("texto").eq("conversa_id", conv.id).eq("direcao", "in").eq("tipo", "texto").order("enviada_em", { ascending: false }).limit(6);
    if (ultOut) q = q.gt("enviada_em", ultOut.enviada_em);
    const { data: lote } = await q; if (lote && lote.length > 1 && ult) ult = { ...ult, texto: lote.map((m: any) => m.texto).reverse().join(" ") };
  }
  const texto = ult && ult.tipo === "texto" ? String(ult.texto || "").trim() : "";
  let est = conv.bot_estado || {};
  if (est.ultimo_id && ult && est.ultimo_id === ult.externo_id) return; // mesma mensagem processada duas vezes
  est = { ...est, ultimo_id: ult ? ult.externo_id : null };
  const agora = Date.now();

  // o próprio contato encerra o atendimento (ex.: "sair")
  if (f.contato_pode_finalizar && texto && (conv.atendente_id || conv.status === "em_atendimento" || est.etapa === "atendimento")) {
    const t0 = norm(texto);
    if ((f.palavras_finalizar || []).some((k: string) => norm(k) === t0)) {
      const ag = new Date().toISOString();
      await admin.from("atendimento_conversas").update({ status: "finalizado", motivo_finalizacao: "ENCERRADO PELO CONTATO", encerrado_em: ag, nao_lidas: 0, updated_at: ag }).eq("id", conv.id);
      await admin.from("atendimento_mensagens").insert({ conversa_id: conv.id, canal: conv.canal, direcao: "out", tipo: "sistema", texto: "O contato encerrou o atendimento", autor_nome: "🤖 Bot", status: "enviada" });
      await admin.rpc("atendimento_arquivar", { p_id: conv.id });
      const { data: c3 } = await admin.from("atendimento_conversas").select("*").eq("id", conv.id).maybeSingle();
      await salvarEstado(c3 || conv, { ...est, etapa: "fim" });
      await aoFinalizar(conv.id); return;
    }
  }

  // enquete de satisfação em andamento
  if (est.etapa === "enquete") {
    const dez = f.enquete && f.enquete.escala === "10"; const tmax = Number(f.enquete && f.enquete.tempo_min) || 0;
    const expirou = tmax > 0 && est.em && (agora - new Date(est.em).getTime()) > tmax * 60000;
    const ok = dez ? /^(10|[0-9])$/.test(texto) : /^[1-5]$/.test(texto);
    if (ok && !expirou) { await salvarEstado(conv, { ...est, etapa: "fim" }, { avaliacao: Number(texto), avaliacao_em: new Date().toISOString(), status: "finalizado", nao_lidas: 0 }); await admin.rpc("atendimento_arquivar", { p_id: conv.id }); await enviar(conv, bot, tpl(f.msgs.enquete_obrigado, vars(conv, f, null))); return; }
    if (!expirou && !est.enq_tentou) { await salvarEstado(conv, { ...est, enq_tentou: true }); await enviar(conv, bot, f.msgs.enquete_invalida); return; }
    est = { ...est, etapa: "fim", enq_tentou: false }; // desistiu/expirou: conversa nova, protocolo novo
    { const np = await admin.rpc("atendimento_renovar", { p_id: conv.id }); if (np && np.data) conv.protocolo = np.data; }
  }
  // atendimento humano em curso: bot fica quieto
  if (conv.atendente_id || conv.status === "em_atendimento") { await salvarEstado(conv, { ...est, etapa: "atendimento" }); return; }

  const depAtual = deps && conv.departamento_id ? deps.find((d: any) => d.id === conv.departamento_id) : null;
  const botAberto = dentroDoHorario(bot.horario);
  const velho = est.em && (agora - new Date(est.em).getTime()) > (Number(f.reenviar_apos_horas) || 12) * 3600 * 1000;
  let novoCiclo = !est.etapa || est.etapa === "fim" || velho || (est.etapa === "fora" && botAberto);
  if (novoCiclo) est = { ultimo_id: est.ultimo_id, etapa: null };

  // palavras-chave (qualquer etapa, exceto cumprimentos iniciais do ciclo novo sem match)
  const t = norm(texto);
  if (t) {
    const kw = (f.palavras || []).find((p: any) => (Array.isArray(p.chaves) ? p.chaves : String(p.chaves || "").split(",")).some((c: string) => { const k = norm(c); return k && (t === k || (" " + t + " ").includes(" " + k + " ")); }));
    if (kw && kw.resposta) {
      const d = kw.departamento_id && deps ? deps.find((x: any) => x.id === kw.departamento_id) : null;
      await enviar(conv, bot, tpl(kw.resposta, vars(conv, f, d || depAtual)));
      if (d) { await rotear(conv, bot, f, deps || [], d, est); } else await salvarEstado(conv, { ...est, etapa: est.etapa || "menu" });
      return;
    }
  }

  if (novoCiclo) {
    if (!botAberto) {
      await salvarEstado(conv, { ...est, etapa: "fora", recado: false, fora_em: new Date().toISOString() }, { origem: "recado" });
      await enviar(conv, bot, tpl(f.msgs.fora_bot, vars(conv, f, null, resumoHorario(bot.horario))));
      // IA: a 1ª mensagem recebe o aviso de horário; se ela já traz uma pergunta/pedido (não só "oi"), a IA responde em seguida
      if (iaFora(bot) && (ult && (ult.tipo !== "texto" || !soCumprimento(texto)))) {
        if (await iaResponder(conv, ult ? ult.externo_id : null, "A mensagem automática de 'fora do horário' acabou de ser enviada ao cliente; não repita o horário nem cumprimente de novo.")) await salvarEstado(conv, { ...conv.bot_estado, recado: true });
      }
      return;
    }
    const v = vars(conv, f, null);
    if (!(f.menu || []).length) { await salvarEstado(conv, { ...est, etapa: "atendimento" }); await enviar(conv, bot, tpl(f.msgs.boasvindas, v)); return; }
    await salvarEstado(conv, { ...est, etapa: "menu" });
    await enviarMenu(conv, bot, f, deps || [], tpl(f.msgs.boasvindas, v), tpl(f.msgs.escolha, v));
    return;
  }
  if (est.etapa === "fora") {
    // IA ligada para fora do horário: responde de verdade (com limite por mensagem/por período); se não responder, cai no recado padrão
    if (iaFora(bot) && !botAberto && !(ult && ult.tipo === "texto" && soCumprimento(texto) && est.recado)) {
      if (await iaResponder(conv, ult ? ult.externo_id : null)) { await salvarEstado(conv, { ...est, recado: true }, { origem: "recado" }); return; }
    }
    const lim = Number(f.recado_minutos) || 0; const passou = lim > 0 && est.fora_em && (agora - new Date(est.fora_em).getTime()) > lim * 60000;
    if (passou) { if (!est.recado_fim) { await salvarEstado(conv, { ...est, recado_fim: true }); await enviar(conv, bot, tpl(f.msgs.fora_bot, vars(conv, f, null, resumoHorario(bot.horario)))); } return; }
    if (!est.recado) { await salvarEstado(conv, { ...est, recado: true }, { origem: "recado" }); await enviar(conv, bot, tpl(f.msgs.recado_ok, vars(conv, f, null))); }
    return;
  }
  if (est.etapa === "menu") {
    const item = (f.menu || []).find((m: any) => String(m.n).trim() === texto || (norm(texto) && norm(texto) === norm(tituloMenu(m, deps || []))));
    const d = item && deps ? deps.find((x: any) => x.id === item.departamento_id) : null;
    if (item && d) { await rotear(conv, bot, f, deps || [], d, est); return; }
    await salvarEstado(conv, { ...est, tentativas: (est.tentativas || 0) + 1 });
    await enviarMenu(conv, bot, f, deps || [], f.msgs.invalida, tpl(f.msgs.escolha, vars(conv, f, null)));
    return;
  }
  if (est.etapa === "atendimento" && (f.menu || []).length && texto === String(f.voltar_digito)) {
    await salvarEstado(conv, { ...est, etapa: "menu" }, { departamento_id: null, setor: null });
    await enviarMenu(conv, bot, f, deps || [], tpl(f.msgs.boasvindas, vars(conv, f, null)), tpl(f.msgs.escolha, vars(conv, f, null)));
    return;
  }
  // já direcionado a um setor que está fechado (fora_departamento enviado) e ninguém atendendo: IA responde as próximas mensagens
  if (est.etapa === "atendimento" && iaFora(bot) && !conv.atendente_id && ((depAtual && !dentroDoHorario(depAtual.horario)) || !botAberto)) {
    await salvarEstado(conv, est);
    await iaResponder(conv, ult ? ult.externo_id : null, depAtual ? `O cliente foi direcionado ao setor ${depAtual.nome}, que está fechado agora.` : "");
  }
}

async function aoFinalizar(conversaId: string) {
  const { data: conv } = await admin.from("atendimento_conversas").select("*").eq("id", conversaId).maybeSingle();
  if (!conv || !conv.bot_id) return;
  const { data: bot } = await admin.from("atendimento_bots").select("*").eq("id", conv.bot_id).maybeSingle();
  if (bot && iaCfg(bot).ativo && iaCfg(bot).resumoAuto) { // resumo IA automático ao finalizar (em segundo plano)
    const p = chamarIA("resumirAuto", { conversaId: conv.id }); const er = (globalThis as any).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") er.waitUntil(p); else await p;
  }
  if (!bot || !bot.ativo || !bot.config || !bot.config.fluxo || !bot.config.fluxo.ativo) return;
  const f = fluxoDe(bot); const v = vars(conv, f, null);
  if (f.enquete && f.enquete.ativa) {
    await salvarEstado(conv, { ...(conv.bot_estado || {}), etapa: "enquete", enq_tentou: false });
    await enviar(conv, bot, [f.enviar_encerramento ? tpl(f.msgs.encerramento, v) : "", tpl(f.msgs.enquete, v)].filter(Boolean).join("\n\n"));
  } else {
    await salvarEstado(conv, { ...(conv.bot_estado || {}), etapa: "fim" });
    if (f.enviar_encerramento) await enviar(conv, bot, tpl(f.msgs.encerramento, v));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    if (b.senha) { // chamadas do painel (sessão do usuário)
      const { data: cfgRow } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
      const user = ((cfgRow && cfgRow.payload && cfgRow.payload.users) || []).find((u: any) => sessaoValida(u, b.senha));
      if (!user) return json({ error: "não autorizado" }, 401);
      const gestao = user.nivel === "diretoria" || user.nivel === "gerente";
      if (b.op === "fluxoSalvar") {
        if (!gestao) return json({ error: "só diretoria/gerente" }, 403);
        const { data: bt } = await admin.from("atendimento_bots").select("config").eq("id", b.botId).maybeSingle(); if (!bt) return json({ error: "bot não encontrado" }, 404);
        const fluxo = fluxoLimpo(b.fluxo || {});
        const { error } = await admin.from("atendimento_bots").update({ config: { ...(bt.config || {}), fluxo }, updated_at: new Date().toISOString() }).eq("id", b.botId); if (error) throw error;
        return json({ ok: true, fluxo });
      }
      if (b.op === "finalizou" && b.conversaId) { await aoFinalizar(b.conversaId); return json({ ok: true }); }
      if (b.op === "assumiu" && b.conversaId) { await aoAssumir(b.conversaId); return json({ ok: true }); }
      const meuId = user.funcionarioId || user.id; const nomes = await nomesFuncionarios(); const meuNome = nomes[meuId] || user.nome || "";
      const { data: meuReg } = await admin.from("atendimento_atendentes").select("departamentos").eq("funcionario_id", meuId).maybeSingle();
      const meusDeps: string[] = (meuReg && meuReg.departamentos) || [];
      const visivel = (x: any) => gestao || x.criado_por === meuId || (x.compartilhada && (!x.departamento_id || meusDeps.includes(x.departamento_id)));
      const pode = (x: any) => gestao || x.criado_por === meuId;
      if (b.op === "kpis") {
        if (!gestao) return json({ error: "só diretoria/gerente" }, 403);
        const { data, error } = await admin.rpc("atendimento_kpis", { p_dias: Number(b.dias) || 30 }); if (error) throw error;
        return json({ ok: true, kpis: data });
      }
      if (b.op === "catalogo") {
        const { data: tags } = await admin.from("atendimento_tags").select("*").order("nome");
        const { data: modelos } = await admin.from("atendimento_modelos").select("*").order("ordem").order("titulo");
        return json({ ok: true, tags: (tags || []).filter(visivel).map((t: any) => ({ ...t, meu: pode(t) })), modelos: (modelos || []).filter(visivel).map((m: any) => ({ ...m, meu: pode(m) })) });
      }
      if (b.op === "tagSalvar") {
        const nome = String(b.nome || "").trim().slice(0, 40); if (!nome) return json({ error: "nome obrigatório" }, 400);
        const reg: any = { nome, cor: /^#[0-9a-fA-F]{6}$/.test(b.cor || "") ? b.cor : "#6b7280", departamento_id: gestao && b.departamento_id ? b.departamento_id : null, compartilhada: gestao ? b.compartilhada !== false : false };
        if (b.id) { const { data: t } = await admin.from("atendimento_tags").select("*").eq("id", b.id).maybeSingle(); if (!t || !pode(t)) return json({ error: "sem acesso" }, 403); await admin.from("atendimento_tags").update(reg).eq("id", b.id); }
        else await admin.from("atendimento_tags").insert({ ...reg, criado_por: meuId });
        return json({ ok: true });
      }
      if (b.op === "tagExcluir") { const { data: t } = await admin.from("atendimento_tags").select("*").eq("id", b.id).maybeSingle(); if (!t || !pode(t)) return json({ error: "sem acesso" }, 403); await admin.from("atendimento_tags").delete().eq("id", b.id); return json({ ok: true }); }
      if (b.op === "modeloSalvar") {
        const titulo = String(b.titulo || "").trim().slice(0, 80); const mensagens = (Array.isArray(b.mensagens) ? b.mensagens : []).map((m: any) => String(m || "").trim().slice(0, 3000)).filter(Boolean).slice(0, 10);
        if (!titulo || !mensagens.length) return json({ error: "título e ao menos uma mensagem" }, 400);
        const atalho = String(b.atalho || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30) || null;
        const reg: any = { titulo, atalho, mensagens, departamento_id: gestao && b.departamento_id ? b.departamento_id : null, compartilhada: gestao ? b.compartilhada !== false : false };
        if (b.id) { const { data: m } = await admin.from("atendimento_modelos").select("*").eq("id", b.id).maybeSingle(); if (!m || !pode(m)) return json({ error: "sem acesso" }, 403); await admin.from("atendimento_modelos").update(reg).eq("id", b.id); }
        else await admin.from("atendimento_modelos").insert({ ...reg, criado_por: meuId, criado_por_nome: meuNome });
        return json({ ok: true });
      }
      if (b.op === "modeloExcluir") { const { data: m } = await admin.from("atendimento_modelos").select("*").eq("id", b.id).maybeSingle(); if (!m || !pode(m)) return json({ error: "sem acesso" }, 403); await admin.from("atendimento_modelos").delete().eq("id", b.id); return json({ ok: true }); }
      return json({ error: "operação desconhecida" }, 400);
    }
    if (req.headers.get("x-bot-token") !== BOT_TOKEN) return json({ error: "não autorizado" }, 401);
    if (b.acao === "finalizou" && b.conversa_id) await aoFinalizar(b.conversa_id);
    else if (b.instancia && b.contato_id) await processar(b.canal || "whatsapp", b.instancia, String(b.contato_id));
    return json({ ok: true });
  } catch (e) { console.error(e); return json({ error: String(e) }, 500); }
});
