// disparo-webhook v5 (11/11/2026): (1) a resposta nunca fala em SAIR: quem escreve SAIR (PARAR, CANCELAR…) continua saindo da lista (tag MARKETING OFF +
//   pendentes canceladas), mas SEM receber mensagem; (2) a resposta depende só do que o CLIENTE mandou (não do histórico: o cliente compra nas duas lojas):
//   texto/legenda com "reforma", "reforma joias" ou "RJ", ou FOTO com a logo/nome REFORMA JOIAS ou RJ (conferida pela IA Gemini) → Instagram @reformajoias;
//   qualquer outra coisa → WhatsApp de atendimento da Vilaça (link wa.me sozinho = botão "Iniciar conversa"). Sem menu das lojas. Máx. 1 resposta a cada 12 h
//   por número e por assunto. O trabalho roda depois de responder 200 à Evolution (EdgeRuntime.waitUntil).
// disparo-webhook v3 (10/11/2026): (1) curtida/reação, figurinha, aviso do sistema, 👍 sozinho, "ok", "obrigado"… → NÃO responde nada;
//   (2) qualquer outra mensagem → manda o link do atendimento e o menu das lojas. Se o último disparo para aquele telefone (disparo_envios, 30 dias) foi de
//   Marechal Center, João Beraldo ou Jardim Norte, mostra só a opção dessa loja e o nome de quem atendeu; senão (aniversário, mala direta, Ecommerce,
//   Reforma ou sem registro), mostra as 3 lojas. Continua no máximo 1 resposta a cada 12 h por número. SAIR continua igual.
// disparo-webhook v2 (07/11/2026): quem responde SAIR (ou PARAR, CANCELAR…) ganha a tag MARKETING OFF no cadastro, tem as mensagens pendentes da fila canceladas e recebe uma confirmação.
// disparo-webhook v1 (05/11/2026) — webhook da instância "vilaca" (número só de disparo: vias, aniversário, campanhas).
// Não registra nada no CHAT e não aciona o bot. Se um cliente responder, manda UMA resposta automática
// (no máximo 1 a cada 12 h por número) dizendo que este número não atende e passando o número de atendimento.
// Token do webhook em atendimento_segredos.DISPARO_WEBHOOK_TOKEN (URL: ...?t=TOKEN). Controle de repetição: tabela disparo_respostas.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const INTERVALO_MS = 12 * 60 * 60 * 1000;

let cache: { em: number; seg: Record<string, string> } | null = null;
async function segredos(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.em < 60000) return cache.seg;
  const { data } = await admin.from("atendimento_segredos").select("chave, valor").in("chave", ["EVOLUTION_URL", "EVOLUTION_API_KEY", "DISPARO_WEBHOOK_TOKEN", "DISPARO_RESPOSTA_TEXTO"]);
  const seg: Record<string, string> = {}; for (const r of data || []) seg[r.chave] = r.valor;
  if (seg.EVOLUTION_URL) seg.EVOLUTION_URL = seg.EVOLUTION_URL.replace(/\/+$/, "");
  cache = { em: Date.now(), seg };
  return seg;
}
const ok = () => new Response("ok", { status: 200 });
const semAcento = (s: string) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const PALAVRAS_SAIR = ["sair", "parar", "pare", "cancelar", "descadastrar", "remover", "nao quero", "nao quero receber"];
async function sairDaLista(numero: string): Promise<void> {
  const f8 = numero.replace(/\D/g, "").slice(-8);
  const { data: cfg } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  const tags: any[] = (cfg && (cfg.payload as any) && (cfg.payload as any).tagsClientes) || [];
  const tag = tags.find((t: any) => semAcento(t.nome) === "marketing off");
  if (tag) await admin.rpc("marcar_marketing_off", { p_fone8: f8, p_tag: String(tag.id) });
  const { data: pend } = await admin.from("marketing_fila").select("id, telefone").eq("status", "pendente");
  const ids = (pend || []).filter((r: any) => String(r.telefone || "").replace(/\D/g, "").slice(-8) === f8).map((r: any) => r.id);
  if (ids.length) await admin.from("marketing_fila").update({ status: "cancelado", erro: "Cliente pediu para sair (respondeu SAIR)", atualizado_em: new Date().toISOString() }).in("id", ids);
}

// ---------- v3: o que é "só curtir / notificação" ----------
const TIPOS_SILENCIO = ["reactionMessage", "stickerMessage", "protocolMessage", "pollUpdateMessage", "senderKeyDistributionMessage", "messageContextInfo", "editedMessage", "keepInChatMessage", "pinInChatMessage", "encReactionMessage"];
const PALAVRAS_OK = ["ok", "okay", "okk", "blz", "beleza", "certo", "recebi", "recebido", "obrigado", "obrigada", "obg", "brigado", "brigada", "valeu", "vlw", "show", "top", "perfeito", "otimo", "sim", "ta", "ta bom", "ta certo", "entendi", "obrigado recebi", "recebi obrigada", "recebi obrigado", "ok obrigado", "ok obrigada"];
function soReacao(d: any, m: any): boolean {
  const tipo = String((d && d.messageType) || "");
  if (TIPOS_SILENCIO.includes(tipo)) return true;
  const chaves = Object.keys(m || {}).filter((k) => k !== "messageContextInfo");
  if (!chaves.length) return true;   // sem conteúdo (aviso do sistema)
  if (chaves.every((k) => TIPOS_SILENCIO.includes(k))) return true;
  const bruto = String(m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || "");
  if (!bruto && (m.conversation !== undefined || m.extendedTextMessage)) return true;
  if (bruto) {
    if (!/[\p{L}\p{N}]/u.test(bruto)) return true;   // só emoji/pontuação (👍, ❤️, 🙏…)
    const limpo = semAcento(bruto);
    if (PALAVRAS_OK.includes(limpo)) return true;
  }
  return false;
}
// ---------- v5: resposta Reforma Joias × Vilaça (pelo que o cliente mandou) ----------
const TEXTO_VILACA = "Olá! 😊 Este número só envia avisos. Vamos conversar pelo nosso WhatsApp de atendimento?\n\nhttps://wa.me/5532988307617";
const TEXTO_REFORMA = "Olá! 😊 Tudo da Reforma Joias é atendido e vendido pelo nosso Instagram. Vamos conversar por lá?\n\nhttps://www.instagram.com/reformajoias";
/** Texto que o cliente escreveu: mensagem, ou legenda de foto/vídeo/documento. */
function textoDoCliente(m: any): string {
  const doc = (m && m.documentWithCaptionMessage && m.documentWithCaptionMessage.message && m.documentWithCaptionMessage.message.documentMessage) || null;
  return String((m && (m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || (m.imageMessage && m.imageMessage.caption)
    || (m.videoMessage && m.videoMessage.caption) || (m.documentMessage && m.documentMessage.caption))) || (doc && doc.caption) || "");
}
/** "reforma", "reformar", "reforma joias", "@reformajoias" ou a sigla "RJ" (sem vínculo com Rio de Janeiro, a pedido). */
function falaDeReforma(t: string): boolean {
  const s = " " + semAcento(t) + " ";
  return / reforma/.test(s) || / rj /.test(s);
}
/** A foto mostra a logo/nome REFORMA JOIAS ou RJ? Baixa a imagem pela Evolution e pergunta à IA (Gemini). Na dúvida ou em erro: não. */
async function fotoDaReforma(seg: Record<string, string>, instancia: string, d: any): Promise<boolean> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key || !d || !d.message || !d.message.imageMessage) return false;
  try {
    const rm = await fetch(`${seg.EVOLUTION_URL}/chat/getBase64FromMediaMessage/${encodeURIComponent(instancia)}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY },
      body: JSON.stringify({ message: { key: d.key, message: d.message }, convertToMp4: false }), signal: AbortSignal.timeout(15000),
    });
    const jm = await rm.json().catch(() => null);
    const b64 = jm && jm.base64 ? String(jm.base64).replace(/^data:[^,]*,/, "") : "";
    if (!rm.ok || b64.length < 100 || b64.length > 7_000_000) return false;
    const mime = String((jm && jm.mimetype) || d.message.imageMessage.mimetype || "image/jpeg").split(";")[0];
    const modelo = Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-flash-latest";
    const pergunta = "Olhe a imagem com atenção. Em algum lugar dela (logo, marca d'água, etiqueta, embalagem, carimbo ou texto) aparece o nome \"REFORMA JOIAS\" ou a sigla/logo \"RJ\"? Responda apenas SIM ou NAO.";
    const rg = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: pergunta }] }], generationConfig: { temperature: 0 } }),
      signal: AbortSignal.timeout(20000),
    });
    const jg = await rg.json().catch(() => null);
    const resp = String((jg && jg.candidates && jg.candidates[0] && jg.candidates[0].content && jg.candidates[0].content.parts || []).map((x: any) => x.text || "").join(" "));
    return /\bsim\b/.test(semAcento(resp));
  } catch (e) { console.error("disparo-webhook foto", e); return false; }
}
/** Assunto da resposta: "reforma" pelo texto/legenda ou pela foto; senão "vilaca". */
async function assuntoDaMensagem(seg: Record<string, string>, instancia: string, d: any, m: any): Promise<"reforma" | "vilaca"> {
  if (falaDeReforma(textoDoCliente(m))) return "reforma";
  if (m && m.imageMessage && await fotoDaReforma(seg, instancia, d)) return "reforma";
  return "vilaca";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return ok();
  try {
    const seg = await segredos();
    const t = new URL(req.url).searchParams.get("t") || "";
    if (!seg.DISPARO_WEBHOOK_TOKEN || t !== seg.DISPARO_WEBHOOK_TOKEN) return new Response("unauthorized", { status: 401 });
    const body = await req.json().catch(() => ({}));
    const evento = String(body.event || "").toLowerCase().replace(/_/g, ".");
    if (evento !== "messages.upsert") return ok();
    const instancia = String(body.instance || "vilaca");
    const lista = Array.isArray(body.data) ? body.data : [body.data];
    // conferir a foto pela IA pode levar alguns segundos: responde 200 na hora e trabalha em segundo plano
    const tarefa = processar(seg, instancia, lista).catch((e) => console.error("disparo-webhook", e));
    const er = (globalThis as any).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") er.waitUntil(tarefa); else await tarefa;
    return ok();
  } catch (e) { console.error("disparo-webhook", e); return ok(); }
});

async function processar(seg: Record<string, string>, instancia: string, lista: any[]): Promise<void> {
    for (const d of lista) {
      const key = (d && d.key) || {};
      const jid = String(key.remoteJid || "");
      if (key.fromMe || !jid.endsWith("@s.whatsapp.net")) continue; // ignora o que a loja mandou, grupos, status e canais
      const numero = jid.split("@")[0];
      const m = (d && d.message) || {};
      const txt = semAcento(String(m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || ""));
      if (txt && PALAVRAS_SAIR.includes(txt)) {
        // sai da lista SEM receber mensagem (pedido do dono, 11/11); também não recebe a resposta automática nas próximas 12 h
        try { await sairDaLista(numero); } catch (e) { console.error("disparo-webhook sair", e); }
        await admin.from("disparo_respostas").upsert({ numero, respondido_em: new Date().toISOString(), instancia });
        continue;
      }
      if (soReacao(d, m)) continue;   // curtiu, figurinha, aviso do sistema, 👍, "ok"…: não responde
      const assunto = await assuntoDaMensagem(seg, instancia, d, m);
      const chave = assunto === "reforma" ? numero + ":rj" : numero;   // 12 h por número E por assunto
      const { data: ult } = await admin.from("disparo_respostas").select("respondido_em").eq("numero", chave).maybeSingle();
      if (ult && Date.now() - new Date(ult.respondido_em).getTime() < INTERVALO_MS) continue;
      await admin.from("disparo_respostas").upsert({ numero: chave, respondido_em: new Date().toISOString(), instancia });
      const texto = assunto === "reforma" ? TEXTO_REFORMA : TEXTO_VILACA;
      const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${encodeURIComponent(instancia)}`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY },
        body: JSON.stringify({ number: numero, text: texto }), signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) console.error("disparo-webhook envio", r.status, await r.text().catch(() => ""));
    }
}
