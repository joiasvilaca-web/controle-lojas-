// atendimento-ia v1 — Agente de IA do Atendimento (Gemini).
// Ops de sessão (body.senha): sugerir, marcarUso, resumir, aprender*, conhecimentoLista, conhecimentoSalvar*,
//   conhecimentoExcluir*, config, configSalvar*   (* = só diretoria/gerente)
// Ops internas (header x-bot-token, chamadas pelo atendimento-bot): responderAuto, resumirAuto
// Base de conhecimento: atendimento_ia_conhecimento (bot_id null = vale para todos os bots).
// Log/aprendizado: atendimento_ia_log (tipos: sugestao, edicao, resumo, auto, aprender).
// Config por bot: atendimento_bots.config.ia (merge — nunca mexe em config.fluxo).
// verify_jwt: true (o painel chama com a anon key; o bot chama com a service role).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BOT_TOKEN = "vjw_bot_4d8e1b7a92c63f05";
const IG_API = "https://graph.instagram.com/v21.0";
const GRAPH = "https://graph.facebook.com/v21.0";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const str = (v: any, n = 2000) => String(v == null ? "" : v).slice(0, n);
const norm = (s: any) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
class Erro extends Error { status: number; constructor(m: string, status = 400) { super(m); this.status = status; } }

const IA_PADRAO = { ativo: false, persona: "", sugerir: true, resumoAuto: false, foraHorario: false, assinatura: "🤖 Assistente Vilaça", maxAuto: 6, mensagemFim: "" };
function iaLimpa(x: any, atual: any = {}) {
  const o = { ...IA_PADRAO, ...(atual || {}) } as any;
  if (!x || typeof x !== "object") return o;
  if ("ativo" in x) o.ativo = !!x.ativo;
  if ("persona" in x) o.persona = str(x.persona, 4000).trim();
  if ("sugerir" in x) o.sugerir = x.sugerir !== false;
  if ("resumoAuto" in x) o.resumoAuto = !!x.resumoAuto;
  if ("foraHorario" in x) o.foraHorario = !!x.foraHorario;
  if ("assinatura" in x) o.assinatura = str(x.assinatura, 60).trim() || IA_PADRAO.assinatura;
  if ("maxAuto" in x) o.maxAuto = Math.min(10, Math.max(1, Number(x.maxAuto) || 6));
  if ("mensagemFim" in x) o.mensagemFim = str(x.mensagemFim, 400).trim();
  return o;
}
const iaDoBot = (bot: any) => iaLimpa(null, bot && bot.config && bot.config.ia);

/* ---------- sessão ---------- */
function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
function podeAtender(user: any): boolean { const p = user.permissoes && user.permissoes.atendimento; if (p && typeof p.ativo === "boolean") return p.ativo; return true; }

/* ---------- horário (mesma regra do atendimento-bot) ---------- */
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
  const ordem = [1, 2, 3, 4, 5, 6, 0]; const linhas: string[] = [];
  const txt = (d: any) => (!d || !d.ativo) ? "fechado" : (Array.isArray(d.faixas) && d.faixas.length ? d.faixas.map((f: any) => f[0] === f[1] ? "24h" : `${f[0]}–${f[1]}`).join(" e ") : "24h");
  let j = 0;
  while (j < ordem.length) {
    let k = j; const t = txt(h.dias[String(ordem[j])]);
    while (k + 1 < ordem.length && txt(h.dias[String(ordem[k + 1])]) === t) k++;
    if (t !== "fechado") linhas.push((k > j ? `${NOMES[ordem[j]]} a ${NOMES[ordem[k]]}` : NOMES[ordem[j]]) + `: ${t}`);
    j = k + 1;
  }
  return linhas.join(" | ");
}

/* ---------- Gemini ---------- */
async function gemini(sistema: string, prompt: string, o: { json?: boolean; temperatura?: number; max?: number } = {}): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY"); if (!key) throw new Erro("GEMINI_API_KEY não configurada", 500);
  const modelo = Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-flash-latest";
  const gen: any = { temperature: o.temperatura ?? 0.5, maxOutputTokens: o.max || 4096 };
  if (o.json) gen.responseMimeType = "application/json";
  let ultimoErro = "";
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: gen }),
    });
    const r = await res.json().catch(() => null);
    if (res.ok) {
      const partes = (r && r.candidates && r.candidates[0] && r.candidates[0].content && r.candidates[0].content.parts) || [];
      const t = partes.filter((p: any) => p && typeof p.text === "string" && !p.thought).map((p: any) => p.text).join("").trim();
      if (t) return t;
      ultimoErro = "resposta vazia da IA" + (r && r.candidates && r.candidates[0] && r.candidates[0].finishReason ? " (" + r.candidates[0].finishReason + ")" : "");
    } else {
      ultimoErro = "Gemini " + res.status + ": " + JSON.stringify((r && r.error && r.error.message) || r).slice(0, 300);
      if (res.status !== 429 && res.status < 500) break;
    }
    await new Promise((x) => setTimeout(x, 1200));
  }
  throw new Erro(ultimoErro || "falha na IA", 502);
}
function jsonDe(t: string): any {
  try { return JSON.parse(t); } catch { /* tenta extrair */ }
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) { try { return JSON.parse(m[1]); } catch { /* */ } }
  const a = t.indexOf("{"), b = t.lastIndexOf("}"), c = t.indexOf("["), d = t.lastIndexOf("]");
  if (c >= 0 && d > c && (a < 0 || c < a)) { try { return JSON.parse(t.slice(c, d + 1)); } catch { /* */ } }
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* */ } }
  return null;
}
const limparSaida = (t: string) => String(t || "").replace(/^\s*(resposta|sugest[aã]o)\s*:\s*/i, "").replace(/^["“]|["”]$/g, "").trim();

/* ---------- contexto ---------- */
async function conversaOuErro(id: string) {
  if (!id) throw new Erro("conversaId obrigatório");
  const { data, error } = await admin.from("atendimento_conversas").select("*").eq("id", id).maybeSingle();
  if (error) throw error; if (!data) throw new Erro("conversa não encontrada", 404); return data;
}
async function botDe(id: string | null) {
  if (!id) return null; const { data } = await admin.from("atendimento_bots").select("*").eq("id", id).maybeSingle(); return data;
}
async function mensagensDe(convId: string, limite = 30, desde?: string) {
  let q = admin.from("atendimento_mensagens").select("id, direcao, tipo, texto, autor_nome, autor_funcionario_id, enviada_em, externo_id, midia_nome").eq("conversa_id", convId).neq("direcao", "interna").order("enviada_em", { ascending: false }).limit(limite); // notas internas da equipe nunca entram no contexto da IA (evita vazar para o cliente)
  if (desde) q = q.gte("enviada_em", desde);
  const { data } = await q; return (data || []).reverse();
}
const RESUMO_TIPO: Record<string, string> = { imagem: "[enviou uma foto]", audio: "[enviou um áudio]", video: "[enviou um vídeo]", documento: "[enviou um documento]", sticker: "[figurinha]" };
function fmtDH(iso: string) {
  try { return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}
function transcricao(msgs: any[], maxChars = 12000, porMsg = 600): string {
  const linhas = msgs.map((m) => {
    const t = (m.texto ? str(m.texto, porMsg) : "") + (m.tipo !== "texto" && m.tipo !== "sistema" ? (m.texto ? " " : "") + (RESUMO_TIPO[m.tipo] || `[${m.tipo}]`) : "");
    if (m.tipo === "sistema") return `(${fmtDH(m.enviada_em)}) [sistema] ${t}`;
    const quem = m.direcao === "in" ? "Cliente" : m.autor_funcionario_id ? `Atendente${m.autor_nome ? " (" + m.autor_nome + ")" : ""}` : /🤖|bot|assistente/i.test(m.autor_nome || "") ? "Bot/IA" : "Loja";
    return `(${fmtDH(m.enviada_em)}) ${quem}: ${t}`;
  });
  let out = linhas.join("\n");
  if (out.length > maxChars) out = "…\n" + out.slice(out.length - maxChars);
  return out;
}
async function conhecimentoDe(botId: string | null, maxChars = 14000): Promise<string> {
  let q = admin.from("atendimento_ia_conhecimento").select("titulo, conteudo, bot_id, origem").eq("ativo", true).order("origem").order("updated_at", { ascending: false }).limit(150);
  q = botId ? q.or(`bot_id.is.null,bot_id.eq.${botId}`) : q.is("bot_id", null);
  const { data } = await q;
  let out = ""; for (const k of data || []) { const l = `• ${str(k.titulo, 150)}: ${str(k.conteudo, 1500)}\n`; if (out.length + l.length > maxChars) break; out += l; }
  return out.trim();
}
async function contextoCrm(conv: any): Promise<string> {
  const partes: string[] = [];
  try {
    if (conv.cliente_id) {
      const { data: cl } = await admin.from("clientes_cadastro").select("payload").eq("id", conv.cliente_id).maybeSingle();
      const p = (cl && cl.payload) || {};
      if (p.nome) partes.push(`Cliente cadastrado: ${p.nome}${p.cidade ? " (" + p.cidade + (p.bairro ? ", " + p.bairro : "") + ")" : ""}`);
    }
    if (conv.contato_nome) partes.push(`Nome do contato: ${conv.contato_nome}`);
    if (Array.isArray(conv.tags) && conv.tags.length) partes.push(`Etiquetas: ${conv.tags.join(", ")}`);
    if (conv.setor) partes.push(`Departamento: ${conv.setor}`);
    if (conv.campos && typeof conv.campos === "object" && Object.keys(conv.campos).length) partes.push(`Campos do atendimento: ${str(JSON.stringify(conv.campos), 600)}`);
    const { data: ct } = await admin.from("atendimento_contatos").select("observacao, campos").eq("canal", conv.canal).eq("telefone", conv.contato_id).maybeSingle();
    if (ct && ct.observacao) partes.push(`Observação do contato: ${str(ct.observacao, 400)}`);
    const filtro = conv.cliente_id ? `conversa_id.eq.${conv.id},cliente_id.eq.${conv.cliente_id}` : `conversa_id.eq.${conv.id}`;
    const { data: ops } = await admin.from("crm_oportunidades").select("titulo, etapa, valor").or(filtro).order("updated_at", { ascending: false }).limit(5);
    for (const o of ops || []) partes.push(`Oportunidade: ${o.titulo} — etapa ${o.etapa}${o.valor ? ", valor R$ " + Number(o.valor).toFixed(2) : ""}`);
    const { data: notas } = await admin.from("crm_notas").select("texto, created_at").or(filtro).order("created_at", { ascending: false }).limit(5);
    for (const n of notas || []) partes.push(`Nota interna (${fmtDH(n.created_at)}): ${str(n.texto, 300)}`);
    const { data: tar } = await admin.from("crm_tarefas").select("titulo, prazo").or(filtro).eq("status", "aberta").limit(5);
    for (const t of tar || []) partes.push(`Tarefa aberta: ${t.titulo}${t.prazo ? " (prazo " + fmtDH(t.prazo) + ")" : ""}`);
    if (conv.ia_resumo) partes.push(`Resumo anterior da IA: ${str(conv.ia_resumo, 600)}`);
  } catch (e) { console.error("contextoCrm", e); }
  return partes.join("\n");
}
function sistemaAtendente(bot: any, ia: any, extra = ""): string {
  const empresa = (bot && bot.config && bot.config.fluxo && bot.config.fluxo.empresa) || (bot && bot.nome) || "Vilaça Joias";
  const horario = resumoHorario(bot && bot.horario);
  return [
    ia.persona || `Você é atendente da ${empresa}, joalheria e ourivesaria em Juiz de Fora - MG.`,
    `Empresa/canal: ${empresa}.${horario ? " Horário de atendimento: " + horario + "." : ""}`,
    "Regras obrigatórias:",
    "- Escreva em português do Brasil, tom de WhatsApp: cordial, próximo, direto, frases curtas, no máximo 2 emojis.",
    "- Responda à última mensagem do cliente levando em conta toda a conversa. Não repita cumprimentos se a conversa já está em andamento.",
    "- NUNCA invente preços, valores, estoque, disponibilidade, prazos ou condições que não estejam na BASE DE CONHECIMENTO ou já ditos pela loja na conversa. Se não souber, diga que a atendente vai confirmar.",
    "- Não prometa nada em nome da loja além do que está na base. Não peça dados sensíveis (CPF, cartão, senhas).",
    "- Se o cliente mandou foto/áudio, reconheça e faça perguntas úteis (tipo de peça, metal, o que deseja fazer).",
    "- Responda apenas com o texto da mensagem, sem aspas, sem prefixos, sem explicações.",
    extra,
  ].filter(Boolean).join("\n");
}

/* ---------- envio (mesma lógica do atendimento-bot + Messenger) ---------- */
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
const ehCloud = (conv: any) => conv.canal === "whatsapp" && String(conv.instancia || "").startsWith("wa_");
async function enviarCanal(conv: any, bot: any, texto: string): Promise<string | null> {
  if (ehCloud(conv)) {
    const { data: cfg } = await admin.from("atendimento_wa_cloud").select("phone_number_id, token").eq("instancia", conv.instancia).maybeSingle();
    if (!cfg) throw new Error("número oficial não cadastrado " + conv.instancia);
    const res = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.token }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: conv.contato_id, type: "text", text: { body: texto.slice(0, 4000), preview_url: false } }) });
    const r = await res.json().catch(() => null); if (!res.ok) throw new Error("cloud " + res.status + " " + JSON.stringify(r));
    return r && r.messages && r.messages[0] && r.messages[0].id || null;
  }
  if (conv.canal === "whatsapp") {
    const s = await segredos();
    const res = await fetch(`${s.EVOLUTION_URL}/message/sendText/${encodeURIComponent(conv.instancia)}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: s.EVOLUTION_API_KEY }, body: JSON.stringify({ number: conv.contato_id, text: texto }) });
    const r = await res.json().catch(() => null); if (!res.ok) throw new Error("evolution " + res.status + " " + JSON.stringify(r));
    return r && r.key && r.key.id ? r.key.id : null;
  }
  if (conv.canal === "instagram") {
    const token = (bot && bot.segredos && bot.segredos.INSTAGRAM_TOKEN) || (await segredos()).INSTAGRAM_TOKEN;
    const res = await fetch(`${IG_API}/me/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ recipient: { id: conv.contato_id }, message: { text: texto.slice(0, 1000) } }) });
    const r = await res.json().catch(() => null); if (!res.ok) throw new Error("instagram " + res.status + " " + JSON.stringify(r));
    return r && r.message_id ? r.message_id : null;
  }
  if (conv.canal === "messenger") {
    const token = (bot && bot.segredos && bot.segredos.FB_PAGE_TOKEN) || (await segredos()).FB_PAGE_TOKEN;
    if (!token) throw new Error("FB_PAGE_TOKEN não configurado");
    const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: conv.contato_id }, messaging_type: "RESPONSE", message: { text: texto.slice(0, 2000) } }) });
    const r = await res.json().catch(() => null); if (!res.ok) throw new Error("messenger " + res.status + " " + JSON.stringify(r));
    return r && r.message_id ? r.message_id : null;
  }
  throw new Error("canal não suportado: " + conv.canal);
}

/* ---------- ops ---------- */
async function sugerir(conv: any, usuario: string) {
  const bot = await botDe(conv.bot_id); const ia = iaDoBot(bot);
  const msgs = await mensagensDe(conv.id, 30);
  if (!msgs.length) throw new Erro("conversa sem mensagens");
  const [kb, crm] = await Promise.all([conhecimentoDe(conv.bot_id), contextoCrm(conv)]);
  // exemplos de estilo: últimas sugestões que a equipe editou antes de enviar
  const { data: ex } = await admin.from("atendimento_ia_log").select("entrada, saida").eq("tipo", "edicao").or(conv.bot_id ? `bot_id.eq.${conv.bot_id},bot_id.is.null` : "bot_id.is.null").order("created_at", { ascending: false }).limit(4);
  const estilo = (ex || []).map((e: any) => `Sugestão da IA: ${str(e.entrada, 300)}\nComo a equipe enviou: ${str(e.saida, 300)}`).join("\n\n");
  const ultimaIn = [...msgs].reverse().find((m) => m.direcao === "in");
  const prompt = [
    kb ? `BASE DE CONHECIMENTO (fonte de verdade):\n${kb}` : "BASE DE CONHECIMENTO: (vazia — não informe valores nem prazos)",
    crm ? `DADOS DO CLIENTE / CRM:\n${crm}` : "",
    estilo ? `EXEMPLOS DO ESTILO DA EQUIPE (ajustes feitos em sugestões anteriores):\n${estilo}` : "",
    `CONVERSA (mais recente por último):\n${transcricao(msgs)}`,
    "Escreva a PRÓXIMA mensagem que a atendente deve enviar ao cliente agora (curta, pronta para enviar).",
  ].filter(Boolean).join("\n\n");
  const sugestao = limparSaida(await gemini(sistemaAtendente(bot, ia), prompt, { temperatura: 0.6, max: 2048 }));
  const { data: log } = await admin.from("atendimento_ia_log").insert({ conversa_id: conv.id, bot_id: conv.bot_id, tipo: "sugestao", entrada: ultimaIn ? str(ultimaIn.texto || ultimaIn.tipo, 2000) : null, saida: sugestao, usado: null, usuario }).select("id").single();
  return { sugestao, logId: log ? log.id : null };
}

const ETAPAS = ["curioso", "orcamento", "negociando", "fechado", "pos-venda"];
async function resumir(conv: any, usuario: string) {
  const msgs = await mensagensDe(conv.id, 80);
  if (!msgs.length) throw new Erro("conversa sem mensagens");
  const crm = await contextoCrm({ ...conv, ia_resumo: null });
  const { data: tagsCat } = await admin.from("atendimento_tags").select("nome").order("nome").limit(80);
  const sistema = "Você analisa conversas de atendimento de uma joalheria/ourivesaria (Vilaça Joias / Reforma Joias) e devolve APENAS JSON válido, em português do Brasil.";
  const prompt = [
    crm ? `DADOS DO CLIENTE / CRM:\n${crm}` : "",
    (tagsCat || []).length ? `ETIQUETAS JÁ CADASTRADAS (prefira estas): ${(tagsCat || []).map((t: any) => t.nome).join(", ")}` : "",
    `CONVERSA:\n${transcricao(msgs, 20000, 500)}`,
    `Devolva um objeto JSON com exatamente estas chaves:
{"resumo": "resumo objetivo em até 4 frases",
 "interesse": "o que o cliente quer, em poucas palavras",
 "produtos": ["peças/serviços citados"],
 "etapa": "uma de: ${ETAPAS.join(", ")}",
 "sentimento": "positivo | neutro | negativo | irritado",
 "etiquetasSugeridas": ["até 4 etiquetas curtas"],
 "proximaAcao": "próximo passo recomendado para a atendente"}`,
  ].filter(Boolean).join("\n\n");
  const bruto = await gemini(sistema, prompt, { json: true, temperatura: 0.2, max: 2048 });
  const j = jsonDe(bruto); if (!j || typeof j !== "object") throw new Erro("a IA não devolveu um resumo válido", 502);
  const arr = (v: any, n: number) => (Array.isArray(v) ? v : v ? [v] : []).map((x: any) => str(x, 60).trim()).filter(Boolean).slice(0, n);
  const et = norm(j.etapa).replace(/\s+/g, "-");
  const r = {
    resumo: str(j.resumo, 1500).trim(), interesse: str(j.interesse, 300).trim(), produtos: arr(j.produtos, 10),
    etapa: ETAPAS.includes(et) ? et : et.includes("orc") ? "orcamento" : et.includes("negoc") ? "negociando" : et.includes("fech") ? "fechado" : et.includes("pos") ? "pos-venda" : "curioso",
    sentimento: str(j.sentimento, 30).trim(), etiquetasSugeridas: arr(j.etiquetasSugeridas, 4), proximaAcao: str(j.proximaAcao, 400).trim(),
  };
  const agora = new Date().toISOString();
  const dados = { ...((conv.ia_dados && typeof conv.ia_dados === "object") ? conv.ia_dados : {}), ...r, resumoEm: agora };
  await admin.from("atendimento_conversas").update({ ia_resumo: r.resumo, ia_resumo_em: agora, ia_dados: dados }).eq("id", conv.id);
  await admin.from("atendimento_ia_log").insert({ conversa_id: conv.id, bot_id: conv.bot_id, tipo: "resumo", entrada: null, saida: JSON.stringify(r), usado: true, usuario });
  return { ...r, ia_resumo_em: agora };
}

function chaveBot(b: any): string { const n = norm(b.nome); return n.includes("reforma") ? "reforma" : n.includes("vilaca") ? "vilaca" : "bot_" + String(b.id).slice(0, 6); }
async function aprender(botId: string | null, dias: number, usuario: string) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data: bots } = await admin.from("atendimento_bots").select("id, nome");
  const listaBots = (bots || []).filter((b: any) => !botId || b.id === botId);
  // conversas com resposta humana no período (inclui as já finalizadas — a conversa é reaproveitada a cada protocolo)
  const { data: saidas } = await admin.from("atendimento_mensagens").select("conversa_id, enviada_em").eq("direcao", "out").not("autor_funcionario_id", "is", null).gte("enviada_em", desde).order("enviada_em", { ascending: false }).limit(3000);
  const ids = [...new Set((saidas || []).map((m: any) => m.conversa_id))];
  if (!ids.length) return { inseridos: 0, analisadas: 0, ignorados: 0, aviso: "nenhuma conversa com resposta humana no período" };
  const { data: convs } = await admin.from("atendimento_conversas").select("id, bot_id, canal, status").in("id", ids.slice(0, 150));
  const porBot: Record<string, any[]> = {};
  for (const c of convs || []) { if (botId && c.bot_id !== botId) continue; const k = c.bot_id || "_"; (porBot[k] = porBot[k] || []).push(c); }
  // amostra equilibrada entre os bots, até 40 conversas
  const amostra: any[] = []; const filas = Object.values(porBot).map((l) => l.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
  while (amostra.length < 40 && filas.some((f) => f.length)) for (const f of filas) { const x = f.shift(); if (x && amostra.length < 40) amostra.push(x); }
  if (!amostra.length) return { inseridos: 0, analisadas: 0, ignorados: 0, aviso: "nenhuma conversa deste bot no período" };
  const nomeBot: Record<string, string> = {}; for (const b of bots || []) nomeBot[b.id] = chaveBot(b);
  let corpo = ""; let analisadas = 0;
  for (const c of amostra) {
    const msgs = (await mensagensDe(c.id, 40, desde)).filter((m: any) => m.tipo !== "sistema");
    if (msgs.length < 2) continue;
    const bloco = `### Conversa ${analisadas + 1} — bot: ${c.bot_id ? nomeBot[c.bot_id] || "?" : "?"} (${c.canal})\n${transcricao(msgs, 2200, 300)}\n\n`;
    if (corpo.length + bloco.length > 70000) break;
    corpo += bloco; analisadas++;
  }
  if (!analisadas) return { inseridos: 0, analisadas: 0, ignorados: 0, aviso: "conversas curtas demais para aprender" };
  const { data: ed } = await admin.from("atendimento_ia_log").select("entrada, saida").eq("tipo", "edicao").gte("created_at", desde).order("created_at", { ascending: false }).limit(15);
  const estilo = (ed || []).map((e: any) => `- IA sugeriu: ${str(e.entrada, 250)}\n  Equipe enviou: ${str(e.saida, 250)}`).join("\n");
  const { data: existentes } = await admin.from("atendimento_ia_conhecimento").select("titulo, bot_id");
  const jaTem = new Set((existentes || []).map((k: any) => (k.bot_id || "*") + "|" + norm(k.titulo)));
  const chaves = listaBots.map((b: any) => `"${chaveBot(b)}" = ${b.nome}`).join("; ");
  const sistema = "Você monta a base de conhecimento do atendimento de uma joalheria/ourivesaria a partir de conversas reais. Devolva APENAS JSON válido em português do Brasil.";
  const prompt = `Bots: ${chaves}; "ambos" = vale para todos.
Leia as conversas e extraia conhecimento reutilizável para responder clientes: perguntas frequentes e como a equipe responde, políticas, prazos, serviços oferecidos, formas de pagamento, entrega/retirada, garantias, endereços/horários citados pela equipe.
Regras: use só o que a EQUIPE afirmou (não o que o cliente supôs); não inclua nomes, telefones ou dados pessoais de clientes; não inclua preços pontuais de uma peça específica (só faixas/regras gerais quando a equipe as afirmou); itens curtos e objetivos; até 30 itens; sem duplicados.
${estilo ? "Também observe o ESTILO preferido da equipe (ajustes feitos nas sugestões da IA) e, se houver um padrão claro, crie 1 item com titulo \"Estilo de escrita da equipe\":\n" + estilo + "\n" : ""}
Formato: [{"titulo": "pergunta ou tema curto", "conteudo": "resposta/regra como a equipe pratica", "bot": "reforma" | "vilaca" | "ambos" (ou a chave do bot)}]

${corpo}`;
  const bruto = await gemini(sistema, prompt, { json: true, temperatura: 0.2, max: 8192 });
  let itens = jsonDe(bruto); if (itens && !Array.isArray(itens) && Array.isArray(itens.itens)) itens = itens.itens;
  if (!Array.isArray(itens)) throw new Erro("a IA não devolveu itens válidos", 502);
  const idPorChave: Record<string, string> = {}; for (const b of bots || []) idPorChave[chaveBot(b)] = b.id;
  const novos: any[] = []; let ignorados = 0;
  for (const it of itens.slice(0, 40)) {
    const titulo = str(it && it.titulo, 150).trim(); const conteudo = str(it && it.conteudo, 2000).trim();
    if (!titulo || !conteudo) { ignorados++; continue; }
    const k = norm(it.bot); let bid: string | null = k === "ambos" || !idPorChave[k] ? null : idPorChave[k];
    if (botId && bid && bid !== botId) { ignorados++; continue; }
    if (botId && !bid && listaBots.length === 1 && k !== "ambos") bid = botId;
    const chave = (bid || "*") + "|" + norm(titulo);
    if (jaTem.has(chave)) { ignorados++; continue; }
    jaTem.add(chave);
    novos.push({ bot_id: bid, titulo, conteudo, origem: "aprendido", ativo: true, criado_por: usuario });
  }
  if (novos.length) { const { error } = await admin.from("atendimento_ia_conhecimento").insert(novos); if (error) throw error; }
  await admin.from("atendimento_ia_log").insert({ conversa_id: null, bot_id: botId, tipo: "aprender", entrada: `dias=${dias} conversas=${analisadas}`, saida: `inseridos=${novos.length} ignorados=${ignorados}`, usado: true, usuario });
  return { inseridos: novos.length, analisadas, ignorados };
}

/* responde sozinho fora do horário (chamado pelo atendimento-bot) */
async function responderAuto(conversaId: string, ultimoId: string | null, contexto: string) {
  const conv = await conversaOuErro(conversaId);
  const bot = await botDe(conv.bot_id); if (!bot || !bot.ativo) return { enviado: false, motivo: "sem bot" };
  const ia = iaDoBot(bot); if (!ia.ativo || !ia.foraHorario) return { enviado: false, motivo: "IA desligada" };
  if (conv.atendente_id && conv.status === "em_atendimento") return { enviado: false, motivo: "com atendente" };
  const { data: bl } = await admin.from("atendimento_blacklist").select("id").eq("canal", conv.canal).eq("contato", conv.contato_id).maybeSingle(); if (bl) return { enviado: false, motivo: "blacklist" };
  let dep: any = null;
  if (conv.departamento_id) { const { data } = await admin.from("atendimento_departamentos").select("*").eq("id", conv.departamento_id).maybeSingle(); dep = data; }
  const fechado = !dentroDoHorario(bot.horario) || (dep && !dentroDoHorario(dep.horario));
  if (!fechado) return { enviado: false, motivo: "dentro do horário" };
  const msgs = await mensagensDe(conv.id, 30);
  const ultIn = [...msgs].reverse().find((m) => m.direcao === "in");
  if (!ultIn) return { enviado: false, motivo: "sem mensagem do cliente" };
  const marca = "in:" + (ultimoId || ultIn.externo_id || ultIn.id) + "|";
  // 1 resposta por mensagem recebida
  { const { data: ja } = await admin.from("atendimento_ia_log").select("id").eq("conversa_id", conv.id).eq("tipo", "auto").like("entrada", marca.replace(/[%_]/g, "\\$&") + "%").limit(1); if (ja && ja.length) return { enviado: false, motivo: "já respondida" }; }
  // no máximo N respostas por período fora do horário (zera quando um humano responde ou após 16h)
  const { data: ultHumano } = await admin.from("atendimento_mensagens").select("enviada_em").eq("conversa_id", conv.id).eq("direcao", "out").not("autor_funcionario_id", "is", null).order("enviada_em", { ascending: false }).limit(1).maybeSingle();
  let desde = Date.now() - 16 * 3600 * 1000; if (ultHumano) desde = Math.max(desde, new Date(ultHumano.enviada_em).getTime());
  const { count } = await admin.from("atendimento_ia_log").select("id", { count: "exact", head: true }).eq("conversa_id", conv.id).eq("tipo", "auto").gte("created_at", new Date(desde).toISOString());
  if ((count || 0) >= ia.maxAuto) return { enviado: false, motivo: "limite de respostas" };
  // reserva a vez (evita duas respostas para a mesma mensagem)
  const { data: log } = await admin.from("atendimento_ia_log").insert({ conversa_id: conv.id, bot_id: conv.bot_id, tipo: "auto", entrada: marca + str(ultIn.texto || ultIn.tipo, 1500), saida: null, usado: false, usuario: "bot" }).select("id").single();
  try {
    const [kb, crm] = await Promise.all([conhecimentoDe(conv.bot_id), contextoCrm(conv)]);
    const horario = resumoHorario((dep && dep.horario) || bot.horario);
    const sistema = sistemaAtendente(bot, ia, `- Agora a loja está FECHADA${horario ? " (horário: " + horario + ")" : ""}. Você é o assistente virtual e responde enquanto a equipe não chega.
- Responda o que der com base na BASE DE CONHECIMENTO; para o resto, diga que a equipe vai verificar e, se útil, peça informações/fotos que agilizem o atendimento.
- NÃO diga que um atendente vai continuar o atendimento (isso é acrescentado automaticamente). Não se apresente de novo se já se apresentou.
- No máximo 600 caracteres.`);
    const prompt = [
      kb ? `BASE DE CONHECIMENTO (fonte de verdade):\n${kb}` : "BASE DE CONHECIMENTO: (vazia — não informe valores nem prazos)",
      crm ? `DADOS DO CLIENTE:\n${crm}` : "",
      contexto ? `OBSERVAÇÃO: ${contexto}` : "",
      `CONVERSA (mais recente por último):\n${transcricao(msgs)}`,
      "Escreva a resposta para o cliente agora.",
    ].filter(Boolean).join("\n\n");
    let resposta = limparSaida(await gemini(sistema, prompt, { temperatura: 0.4, max: 2048 })).slice(0, 900);
    const fim = ia.mensagemFim || `Um(a) atendente da nossa equipe continua seu atendimento assim que abrirmos${horario ? " (" + horario + ")" : ""}. 😊`;
    resposta = `${resposta}\n\n${fim}`;
    const visivel = conv.canal === "whatsapp" ? `*${ia.assinatura}:*\n${resposta}` : `${ia.assinatura}:\n${resposta}`;
    const externoId = await enviarCanal(conv, bot, visivel);
    const agora = new Date().toISOString();
    await admin.from("atendimento_mensagens").upsert({ conversa_id: conv.id, canal: conv.canal, direcao: "out", tipo: "texto", texto: resposta, externo_id: externoId || ("ia_" + crypto.randomUUID()), autor_nome: ia.assinatura, status: "enviada", enviada_em: agora }, { onConflict: "conversa_id,externo_id", ignoreDuplicates: false });
    const dados = { ...((conv.ia_dados && typeof conv.ia_dados === "object") ? conv.ia_dados : {}), respondidaPorIA: true, iaRespondeuEm: agora };
    await admin.from("atendimento_conversas").update({ ultima_mensagem_em: agora, ultima_mensagem_texto: resposta, ultima_direcao: "out", ia_dados: dados, updated_at: agora }).eq("id", conv.id);
    if (log) await admin.from("atendimento_ia_log").update({ saida: resposta, usado: true }).eq("id", log.id);
    return { enviado: true };
  } catch (e) {
    console.error("responderAuto", e);
    if (log) await admin.from("atendimento_ia_log").delete().eq("id", log.id); // libera para o bot cair no recado padrão
    return { enviado: false, motivo: "erro: " + String(e).slice(0, 200) };
  }
}

/* ---------- servidor ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  const op = b && b.op;
  try {
    // chamadas internas (atendimento-bot)
    if (!b.senha) {
      if (req.headers.get("x-bot-token") !== BOT_TOKEN) return json({ error: "não autorizado" }, 401);
      if (op === "responderAuto") return json({ ok: true, ...(await responderAuto(String(b.conversaId || ""), b.ultimoId ? String(b.ultimoId) : null, str(b.contexto, 300))) });
      if (op === "resumirAuto") {
        const conv = await conversaOuErro(String(b.conversaId || "")); const bot = await botDe(conv.bot_id);
        if (!bot || !iaDoBot(bot).ativo || !iaDoBot(bot).resumoAuto) return json({ ok: true, feito: false });
        await resumir(conv, "bot"); return json({ ok: true, feito: true });
      }
      return json({ error: "operação desconhecida" }, 400);
    }
    const { data: cfgRow } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config = (cfgRow && cfgRow.payload) || {};
    const user = (config.users || []).find((u: any) => sessaoValida(u, b.senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    if (!podeAtender(user)) return json({ error: "sem permissão para o Atendimento" }, 403);
    const gestao = user.nivel === "diretoria" || user.nivel === "gerente";
    const meuId = user.funcionarioId || user.id;
    const podeVer = (c: any) => gestao || !c.atendente_id || c.atendente_id === meuId;
    const soGestao = () => { if (!gestao) throw new Erro("só diretoria/gerente", 403); };

    if (op === "sugerir") {
      const conv = await conversaOuErro(b.conversaId); if (!podeVer(conv)) throw new Erro("sem acesso a esta conversa", 403);
      const bot = await botDe(conv.bot_id); if (bot && bot.config && bot.config.ia && bot.config.ia.sugerir === false) throw new Erro("sugestões desligadas para este bot", 403);
      return json({ ok: true, ...(await sugerir(conv, meuId)) });
    }
    if (op === "marcarUso") {
      const { data: lg } = await admin.from("atendimento_ia_log").select("*").eq("id", Number(b.logId)).maybeSingle();
      if (!lg || lg.tipo !== "sugestao") throw new Erro("registro não encontrado", 404);
      if (lg.usuario !== meuId && !gestao) throw new Erro("sem acesso", 403);
      await admin.from("atendimento_ia_log").update({ usado: !!b.usado }).eq("id", lg.id);
      const final = str(b.textoFinal, 4000).trim();
      if (b.usado && final && norm(final) !== norm(lg.saida)) await admin.from("atendimento_ia_log").insert({ conversa_id: lg.conversa_id, bot_id: lg.bot_id, tipo: "edicao", entrada: lg.saida, saida: final, usado: true, usuario: meuId });
      return json({ ok: true });
    }
    if (op === "resumir") {
      const conv = await conversaOuErro(b.conversaId); if (!podeVer(conv)) throw new Erro("sem acesso a esta conversa", 403);
      return json({ ok: true, resumo: await resumir(conv, meuId) });
    }
    if (op === "aprender") {
      soGestao();
      const dias = Math.min(180, Math.max(1, Number(b.dias) || 30));
      return json({ ok: true, ...(await aprender(b.botId || null, dias, meuId)) });
    }
    if (op === "conhecimentoLista") {
      let q = admin.from("atendimento_ia_conhecimento").select("*").order("origem").order("titulo").limit(500);
      if (b.botId) q = q.or(`bot_id.is.null,bot_id.eq.${String(b.botId).replace(/[^0-9a-f-]/gi, "")}`);
      const { data, error } = await q; if (error) throw error;
      return json({ ok: true, data: data || [] });
    }
    if (op === "conhecimentoSalvar") {
      soGestao();
      const titulo = str(b.titulo, 150).trim(), conteudo = str(b.conteudo, 4000).trim();
      if (!titulo || !conteudo) throw new Erro("título e conteúdo obrigatórios");
      const reg: any = { bot_id: b.botId || null, titulo, conteudo, ativo: b.ativo !== false, updated_at: new Date().toISOString() };
      if (b.id) { const { error } = await admin.from("atendimento_ia_conhecimento").update(reg).eq("id", Number(b.id)); if (error) throw error; return json({ ok: true, id: b.id }); }
      const { data, error } = await admin.from("atendimento_ia_conhecimento").insert({ ...reg, origem: "manual", criado_por: meuId }).select("id").single(); if (error) throw error;
      return json({ ok: true, id: data.id });
    }
    if (op === "conhecimentoExcluir") {
      soGestao();
      const { error } = await admin.from("atendimento_ia_conhecimento").delete().eq("id", Number(b.id)); if (error) throw error;
      return json({ ok: true });
    }
    if (op === "config") {
      const bot = await botDe(b.botId); if (!bot) throw new Erro("bot não encontrado", 404);
      const ia = iaDoBot(bot);
      return json({ ok: true, ia: gestao ? ia : { ativo: ia.ativo, sugerir: ia.sugerir, assinatura: ia.assinatura }, horario: resumoHorario(bot.horario) || "sem restrição (24h)", temGemini: !!Deno.env.get("GEMINI_API_KEY") });
    }
    if (op === "configSalvar") {
      soGestao();
      const bot = await botDe(b.botId); if (!bot) throw new Erro("bot não encontrado", 404);
      const { data: atual } = await admin.from("atendimento_bots").select("config").eq("id", bot.id).maybeSingle();
      const cfg = (atual && atual.config) || {};
      const ia = iaLimpa(b.ia || {}, cfg.ia);
      const { error } = await admin.from("atendimento_bots").update({ config: { ...cfg, ia }, updated_at: new Date().toISOString() }).eq("id", bot.id); if (error) throw error;
      return json({ ok: true, ia });
    }
    return json({ error: "operação desconhecida" }, 400);
  } catch (e) {
    const st = e instanceof Erro ? e.status : 500;
    if (st >= 500) console.error(op, e);
    return json({ error: e instanceof Error ? e.message : String(e) }, st);
  }
});
