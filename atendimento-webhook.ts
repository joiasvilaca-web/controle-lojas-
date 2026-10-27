// atendimento-webhook v11 — v11: Facebook MESSENGER (object="page", canal "messenger", instancia fb_<page_id>, token da página por bot)
//     e Instagram com token do próprio bot (perfil/nome do contato); conversa nova já nasce com bot_id.
// v9: Instagram aceita também o formato entry[].changes (field=messages) e loga o corpo recebido.
// v8: aciona o bot (atendimento-bot) a cada mensagem recebida.
// v3: INSTAGRAM (Instagram API with Instagram Login). GET com hub.challenge pra validação
//     da Meta (verify token IG_VERIFY_TOKEN) e POST com object="instagram".
// v2: segredos da Evolution via tabela atendimento_segredos.
// verify_jwt: false — Evolution protegida pelo ?t=..., Meta pelo verify token + object.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_TOKEN = "vjw_7f3a9c2e51b84d6e";
const IG_VERIFY_TOKEN = "vjw_ig_verify_7f3a9c2e";
const BOT_TOKEN = "vjw_bot_4d8e1b7a92c63f05";
const BUCKET = "atendimento-midia";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function acionarBot(canal: string, instancia: string, contatoId: string) {
  try {
    const p = fetch(`${SUPABASE_URL}/functions/v1/atendimento-bot`, { method: "POST", headers: { "Content-Type": "application/json", "x-bot-token": BOT_TOKEN }, body: JSON.stringify({ canal, instancia, contato_id: contatoId }) }).catch((e) => console.error("bot", e));
    const er = (globalThis as any).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") er.waitUntil(p); else await p;
  } catch (e) { console.error("acionarBot", e); }
}

let __segredos: Record<string, string> | null = null;
async function segredos(): Promise<Record<string, string>> {
  if (__segredos) return __segredos;
  const out: Record<string, string> = {};
  for (const k of ["EVOLUTION_URL", "EVOLUTION_API_KEY", "INSTAGRAM_TOKEN", "INSTAGRAM_IG_ID", "FB_PAGE_TOKEN"]) { const v = Deno.env.get(k); if (v) out[k] = v; }
  const { data } = await admin.from("atendimento_segredos").select("chave, valor");
  for (const r of data || []) if (!out[r.chave]) out[r.chave] = r.valor;
  if (out.EVOLUTION_URL) out.EVOLUTION_URL = out.EVOLUTION_URL.replace(/\/+$/, "");
  __segredos = out;
  return out;
}

// bot dono de um canal Meta (instagram: ig_id | messenger: page_id) — cada bot tem o próprio token em segredos
let __bots: any[] | null = null;
async function botDoCanal(tipo: string, id: string): Promise<any | null> {
  if (!__bots) { const { data } = await admin.from("atendimento_bots").select("id, canais, segredos"); __bots = data || []; }
  return (__bots || []).find((b: any) => (b.canais || []).some((c: any) => c.tipo === tipo && String(tipo === "messenger" ? c.page_id : c.ig_id) === String(id))) || null;
}

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function numeroDoJid(jid: string): string | null {
  if (!jid) return null;
  if (jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@broadcast")) return null;
  return jid.split("@")[0].split(":")[0];
}
const RESUMO_TIPO: Record<string, string> = { imagem: "📷 Foto", audio: "🎤 Áudio", video: "🎥 Vídeo", sticker: "Figurinha" };

async function guardarBytes(path: string, bin: Uint8Array, mime: string): Promise<boolean> {
  const { error } = await admin.storage.from(BUCKET).upload(path, bin, { contentType: mime, upsert: true });
  if (error) console.error("upload mídia", error);
  return !error;
}

/* ================= WHATSAPP (Evolution) ================= */
function extrairConteudo(msg: any, messageType: string): { tipo: string; texto: string | null; mime: string | null; nome: string | null } {
  const m = msg || {};
  if (m.conversation) return { tipo: "texto", texto: m.conversation, mime: null, nome: null };
  if (m.extendedTextMessage) return { tipo: "texto", texto: m.extendedTextMessage.text || "", mime: null, nome: null };
  if (m.imageMessage) return { tipo: "imagem", texto: m.imageMessage.caption || null, mime: m.imageMessage.mimetype || "image/jpeg", nome: null };
  if (m.videoMessage) return { tipo: "video", texto: m.videoMessage.caption || null, mime: m.videoMessage.mimetype || "video/mp4", nome: null };
  if (m.audioMessage) return { tipo: "audio", texto: null, mime: m.audioMessage.mimetype || "audio/ogg", nome: null };
  if (m.documentMessage) return { tipo: "documento", texto: m.documentMessage.caption || null, mime: m.documentMessage.mimetype || "application/octet-stream", nome: m.documentMessage.fileName || null };
  if (m.documentWithCaptionMessage?.message?.documentMessage) { const d = m.documentWithCaptionMessage.message.documentMessage; return { tipo: "documento", texto: d.caption || null, mime: d.mimetype || "application/octet-stream", nome: d.fileName || null }; }
  if (m.stickerMessage) return { tipo: "sticker", texto: null, mime: m.stickerMessage.mimetype || "image/webp", nome: null };
  if (m.contactMessage) return { tipo: "outro", texto: "[contato] " + (m.contactMessage.displayName || ""), mime: null, nome: null };
  if (m.locationMessage) return { tipo: "outro", texto: `[localização] ${m.locationMessage.degreesLatitude},${m.locationMessage.degreesLongitude}`, mime: null, nome: null };
  if (m.reactionMessage) return { tipo: "outro", texto: "[reação] " + (m.reactionMessage.text || ""), mime: null, nome: null };
  return { tipo: "outro", texto: messageType ? `[${messageType}]` : null, mime: null, nome: null };
}
async function baixarMidiaWa(instancia: string, data: any): Promise<{ path: string; mime: string } | null> {
  const s = await segredos(); if (!s.EVOLUTION_URL || !s.EVOLUTION_API_KEY) return null;
  try {
    const res = await fetch(`${s.EVOLUTION_URL}/chat/getBase64FromMediaMessage/${encodeURIComponent(instancia)}`, { method: "POST", headers: { "Content-Type": "application/json", "apikey": s.EVOLUTION_API_KEY }, body: JSON.stringify({ message: { key: data.key, message: data.message }, convertToMp4: false }) });
    const r = await res.json().catch(() => null);
    if (!res.ok || !r || !r.base64) { console.error("mídia não baixada", res.status, r); return null; }
    const mime = r.mimetype || "application/octet-stream";
    const bin = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const ext = (mime.split("/")[1] || "bin").split(";")[0];
    const path = `${instancia}/${data.key.remoteJid.split("@")[0]}/${data.key.id}.${ext}`;
    return (await guardarBytes(path, bin, mime)) ? { path, mime } : null;
  } catch (e) { console.error("baixarMidiaWa", e); return null; }
}
async function fotoPerfilWa(instancia: string, numero: string): Promise<string | null> {
  const s = await segredos(); if (!s.EVOLUTION_URL || !s.EVOLUTION_API_KEY) return null;
  try {
    const res = await fetch(`${s.EVOLUTION_URL}/chat/fetchProfilePictureUrl/${encodeURIComponent(instancia)}`, { method: "POST", headers: { "Content-Type": "application/json", "apikey": s.EVOLUTION_API_KEY }, body: JSON.stringify({ number: numero }) });
    const r = await res.json().catch(() => null);
    return r && r.profilePictureUrl ? r.profilePictureUrl : null;
  } catch { return null; }
}

/* ================= COMUM: conversa + mensagem ================= */
async function registrar(opts: { canal: string; instancia: string; contatoId: string; fromMe: boolean; nome: string | null; foto: (() => Promise<string | null>) | null;
  tipo: string; texto: string | null; midia: { path: string; mime: string } | null; mime: string | null; nomeArquivo: string | null; externoId: string | null; ts: Date; payload: any; autorNome: string | null; botId?: string | null }) {
  const resumo = opts.texto || RESUMO_TIPO[opts.tipo] || (opts.tipo === "documento" ? "📎 " + (opts.nomeArquivo || "Documento") : "[mensagem]");
  const { data: existente } = await admin.from("atendimento_conversas").select("id, contato_nome, contato_foto, status, nao_lidas, bot_id").eq("instancia", opts.instancia).eq("contato_id", opts.contatoId).maybeSingle();
  let conversaId: string;
  if (!existente) {
    const foto = opts.foto ? await opts.foto() : null;
    const { data: nova, error } = await admin.from("atendimento_conversas").insert({
      canal: opts.canal, instancia: opts.instancia, contato_id: opts.contatoId, contato_nome: opts.nome, contato_foto: foto, status: "aguardando", bot_id: opts.botId || null,
      ultima_mensagem_em: opts.ts.toISOString(), ultima_mensagem_texto: resumo, ultima_direcao: opts.fromMe ? "out" : "in", nao_lidas: opts.fromMe ? 0 : 1,
    }).select("id").single();
    if (error) throw error;
    conversaId = nova.id;
  } else {
    conversaId = existente.id;
    const upd: any = { ultima_mensagem_em: opts.ts.toISOString(), ultima_mensagem_texto: resumo, ultima_direcao: opts.fromMe ? "out" : "in", updated_at: new Date().toISOString() };
    if (!opts.fromMe) {
      upd.nao_lidas = (existente.nao_lidas || 0) + 1;
      if (opts.nome && !existente.contato_nome) upd.contato_nome = opts.nome;
      if (existente.status === "finalizado") { upd.status = "aguardando"; upd.atendente_id = null; upd.atendente_nome = null; }
    }
    if (!existente.contato_foto && opts.foto) { const foto = await opts.foto(); if (foto) upd.contato_foto = foto; }
    if (!existente.bot_id && opts.botId) upd.bot_id = opts.botId;
    await admin.from("atendimento_conversas").update(upd).eq("id", conversaId);
  }
  const { error: errMsg } = await admin.from("atendimento_mensagens").upsert({
    conversa_id: conversaId, canal: opts.canal, direcao: opts.fromMe ? "out" : "in", tipo: opts.tipo, texto: opts.texto,
    midia_path: opts.midia ? opts.midia.path : null, midia_mime: opts.midia ? opts.midia.mime : opts.mime, midia_nome: opts.nomeArquivo,
    externo_id: opts.externoId, autor_nome: opts.autorNome, status: opts.fromMe ? "enviada" : "recebida", enviada_em: opts.ts.toISOString(), payload: opts.payload,
  }, { onConflict: "conversa_id,externo_id", ignoreDuplicates: true });
  if (errMsg) console.error("gravar mensagem", errMsg);
}

async function processarMensagemWa(instancia: string, data: any) {
  const key = data.key || {};
  const numero = numeroDoJid(key.remoteJid || "");
  if (!numero) return;
  const fromMe = !!key.fromMe;
  const c = extrairConteudo(data.message, data.messageType);
  const ts = data.messageTimestamp ? new Date(Number(data.messageTimestamp) * 1000) : new Date();
  let midia: { path: string; mime: string } | null = null;
  if (["imagem", "audio", "video", "documento", "sticker"].includes(c.tipo)) midia = await baixarMidiaWa(instancia, data);
  await registrar({ canal: "whatsapp", instancia, contatoId: numero, fromMe, nome: (!fromMe && data.pushName) ? data.pushName : null, foto: () => fotoPerfilWa(instancia, numero),
    tipo: c.tipo, texto: c.texto, midia, mime: c.mime, nomeArquivo: c.nome, externoId: key.id || null, ts, payload: data, autorNome: fromMe ? (data.source === "web" ? null : "Celular") : null });
  if (!fromMe && c.tipo !== "outro") await acionarBot("whatsapp", instancia, numero);
}
async function processarStatusWa(data: any) {
  const lista = Array.isArray(data) ? data : [data];
  for (const u of lista) {
    const id = u?.keyId || u?.key?.id; const st = (u?.status || u?.update?.status || "").toString().toUpperCase();
    if (!id || !st) continue;
    const map: Record<string, string> = { SERVER_ACK: "enviada", DELIVERY_ACK: "entregue", READ: "lida", PLAYED: "lida", ERROR: "erro" };
    const novo = map[st]; if (!novo) continue;
    await admin.from("atendimento_mensagens").update({ status: novo }).eq("externo_id", id).neq("status", "lida");
  }
}
async function processarConexaoWa(instancia: string, data: any) {
  try {
    const { data: cfg } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const payload = (cfg && cfg.payload) || {};
    payload.atendimentoInstancias = payload.atendimentoInstancias || {};
    payload.atendimentoInstancias[instancia] = { estado: data.state || data.status || "desconhecido", atualizadoEm: new Date().toISOString() };
    await admin.from("gestao_config").update({ payload, updated_at: new Date().toISOString() }).eq("id", "config");
  } catch (e) { console.error("conexao", e); }
}

/* ================= INSTAGRAM (Meta) ================= */
async function perfilIg(igsid: string, token?: string | null): Promise<{ nome: string | null; foto: string | null }> {
  const s = await segredos(); const tk = token || s.INSTAGRAM_TOKEN; if (!tk) return { nome: null, foto: null };
  try {
    const res = await fetch(`https://graph.instagram.com/v21.0/${igsid}?fields=name,username,profile_pic&access_token=${encodeURIComponent(tk)}`);
    const r = await res.json().catch(() => null);
    if (!res.ok || !r) return { nome: null, foto: null };
    return { nome: r.name || (r.username ? "@" + r.username : null), foto: r.profile_pic || null };
  } catch { return { nome: null, foto: null }; }
}
async function baixarAnexoIg(url: string, chave: string): Promise<{ path: string; mime: string } | null> {
  try {
    const res = await fetch(url); if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "application/octet-stream";
    const bin = new Uint8Array(await res.arrayBuffer());
    const ext = (mime.split("/")[1] || "bin").split(";")[0];
    const path = `instagram/${chave}.${ext}`;
    return (await guardarBytes(path, bin, mime)) ? { path, mime } : null;
  } catch (e) { console.error("anexo ig", e); return null; }
}
async function processarInstagram(body: any) {
  const s = await segredos();
  for (const entry of body.entry || []) {
    const contaId = String(entry.id || s.INSTAGRAM_IG_ID || "instagram");
    const instancia = "ig_" + contaId;
    const botIg = await botDoCanal("instagram", contaId);
    const tokenIg: string | null = (botIg && botIg.segredos && botIg.segredos.INSTAGRAM_TOKEN) || null;
    // a Meta entrega em entry.messaging; o botão "Testar" (e alguns casos) usa entry.changes[{field:'messages', value}]
    const eventos: any[] = [...(Array.isArray(entry.messaging) ? entry.messaging : [])];
    for (const ch of Array.isArray(entry.changes) ? entry.changes : []) if (ch && ch.field === "messages" && ch.value) eventos.push(ch.value);
    for (const ev of eventos) {
      const msg = ev.message; if (!msg) { console.log("ig evento sem message (ignorado)", Object.keys(ev || {}).join(",")); continue; }
      const fromMe = !!msg.is_echo;
      const contatoId = String(fromMe ? (ev.recipient && ev.recipient.id) : (ev.sender && ev.sender.id) || "");
      if (!contatoId || contatoId === contaId) continue;
      const ts = ev.timestamp ? new Date(Number(ev.timestamp) < 1e12 ? Number(ev.timestamp) * 1000 : Number(ev.timestamp)) : new Date();
      const anexos: any[] = Array.isArray(msg.attachments) ? msg.attachments : [];
      if (!anexos.length) {
        await registrar({ canal: "instagram", instancia, contatoId, fromMe, nome: null, foto: fromMe ? null : async () => (await perfilIg(contatoId, tokenIg)).foto,
          tipo: "texto", texto: msg.text || "[mensagem]", midia: null, mime: null, nomeArquivo: null, externoId: msg.mid || null, ts, payload: ev, autorNome: fromMe ? "Instagram (app)" : null, botId: botIg ? botIg.id : null });
      } else {
        let i = 0;
        for (const a of anexos) {
          const t = String(a.type || ""); const url = a.payload && a.payload.url;
          const tipo = t === "image" ? "imagem" : t === "audio" ? "audio" : t === "video" ? "video" : t === "file" ? "documento" : "outro";
          const midia = (url && ["imagem", "audio", "video", "documento"].includes(tipo)) ? await baixarAnexoIg(url, `${contatoId}/${msg.mid || Date.now()}_${i}`) : null;
          const texto = (i === 0 && msg.text) ? msg.text : (tipo === "outro" ? `[${t}] ${url || ""}`.trim() : null);
          await registrar({ canal: "instagram", instancia, contatoId, fromMe, nome: null, foto: fromMe ? null : async () => (await perfilIg(contatoId, tokenIg)).foto,
            tipo, texto, midia, mime: midia ? midia.mime : null, nomeArquivo: null, externoId: (msg.mid || "") + (i ? "_" + i : ""), ts, payload: ev, autorNome: fromMe ? "Instagram (app)" : null, botId: botIg ? botIg.id : null });
          i++;
        }
      }
      // nome do contato (busca só se ainda não tem)
      if (!fromMe) {
        const { data: conv } = await admin.from("atendimento_conversas").select("id, contato_nome").eq("instancia", instancia).eq("contato_id", contatoId).maybeSingle();
        if (conv && !conv.contato_nome) { const p = await perfilIg(contatoId, tokenIg); if (p.nome) await admin.from("atendimento_conversas").update({ contato_nome: p.nome, contato_foto: p.foto }).eq("id", conv.id); }
        await acionarBot("instagram", instancia, contatoId);
      }
    }
  }
}

/* ================= FACEBOOK MESSENGER (Meta, object="page") ================= */
async function perfilFb(psid: string, token: string | null): Promise<{ nome: string | null; foto: string | null }> {
  if (!token) return { nome: null, foto: null };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${psid}?fields=first_name,last_name,name,profile_pic&access_token=${encodeURIComponent(token)}`);
    const r = await res.json().catch(() => null);
    if (!res.ok || !r) return { nome: null, foto: null };
    return { nome: r.name || [r.first_name, r.last_name].filter(Boolean).join(" ") || null, foto: r.profile_pic || null };
  } catch { return { nome: null, foto: null }; }
}
async function processarMessenger(body: any) {
  const s = await segredos();
  for (const entry of body.entry || []) {
    const pageId = String(entry.id || "");
    if (!pageId) continue;
    const instancia = "fb_" + pageId;
    const bot = await botDoCanal("messenger", pageId);
    const token: string | null = (bot && bot.segredos && bot.segredos.FB_PAGE_TOKEN) || s.FB_PAGE_TOKEN || null;
    for (const ev of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const msg = ev.message; if (!msg) { console.log("fb evento sem message (ignorado)", Object.keys(ev || {}).join(",")); continue; }
      const fromMe = !!msg.is_echo;
      const contatoId = String(fromMe ? (ev.recipient && ev.recipient.id) : (ev.sender && ev.sender.id) || "");
      if (!contatoId || contatoId === pageId) continue;
      const ts = ev.timestamp ? new Date(Number(ev.timestamp) < 1e12 ? Number(ev.timestamp) * 1000 : Number(ev.timestamp)) : new Date();
      const anexos: any[] = Array.isArray(msg.attachments) ? msg.attachments : [];
      const foto = fromMe ? null : async () => (await perfilFb(contatoId, token)).foto;
      // eco de mensagem enviada por este sistema (já gravada com o mesmo mid) é ignorado pelo upsert; eco enviado pela Caixa de Entrada da Meta entra como "Facebook (app)"
      if (!anexos.length) {
        await registrar({ canal: "messenger", instancia, contatoId, fromMe, nome: null, foto, tipo: "texto", texto: msg.text || "[mensagem]", midia: null, mime: null, nomeArquivo: null, externoId: msg.mid || null, ts, payload: ev, autorNome: fromMe ? "Facebook (app)" : null, botId: bot ? bot.id : null });
      } else {
        let i = 0;
        for (const a of anexos) {
          const t = String(a.type || ""); const url = a.payload && a.payload.url;
          const tipo = t === "image" ? "imagem" : t === "audio" ? "audio" : t === "video" ? "video" : t === "file" ? "documento" : "outro";
          const midia = (url && ["imagem", "audio", "video", "documento"].includes(tipo)) ? await baixarAnexoFb(url, `${contatoId}/${msg.mid || Date.now()}_${i}`) : null;
          const texto = (i === 0 && msg.text) ? msg.text : (tipo === "outro" ? `[${t}] ${url || ""}`.trim() : null);
          await registrar({ canal: "messenger", instancia, contatoId, fromMe, nome: null, foto, tipo, texto, midia, mime: midia ? midia.mime : null, nomeArquivo: null, externoId: (msg.mid || "") + (i ? "_" + i : ""), ts, payload: ev, autorNome: fromMe ? "Facebook (app)" : null, botId: bot ? bot.id : null });
          i++;
        }
      }
      if (!fromMe) {
        const { data: conv } = await admin.from("atendimento_conversas").select("id, contato_nome").eq("instancia", instancia).eq("contato_id", contatoId).maybeSingle();
        if (conv && !conv.contato_nome) { const p = await perfilFb(contatoId, token); if (p.nome) await admin.from("atendimento_conversas").update({ contato_nome: p.nome, contato_foto: p.foto }).eq("id", conv.id); }
        await acionarBot("messenger", instancia, contatoId);
      }
    }
  }
}
async function baixarAnexoFb(url: string, chave: string): Promise<{ path: string; mime: string } | null> {
  try {
    const res = await fetch(url); if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "application/octet-stream";
    const bin = new Uint8Array(await res.arrayBuffer());
    const ext = (mime.split("/")[1] || "bin").split(";")[0];
    const path = `messenger/${chave}.${ext}`;
    return (await guardarBytes(path, bin, mime)) ? { path, mime } : null;
  } catch (e) { console.error("anexo fb", e); return null; }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  // Validação do webhook pela Meta
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === IG_VERIFY_TOKEN) {
      return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
    }
    return json({ ok: true, servico: "atendimento-webhook" });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    if (body && body.object === "instagram") {
      console.log("ig webhook", JSON.stringify(body).slice(0, 1500));
      await processarInstagram(body);
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
    if (body && body.object === "page") {
      console.log("fb webhook", JSON.stringify(body).slice(0, 1500));
      await processarMessenger(body);
      return new Response("EVENT_RECEIVED", { status: 200 });
    }
    if (url.searchParams.get("t") !== WEBHOOK_TOKEN) return json({ error: "não autorizado" }, 401);
    const evento = String(body.event || "").toLowerCase().replace(/_/g, ".");
    const instancia = body.instance || "desconhecida";
    const data = body.data;
    if (evento === "messages.upsert" || evento === "send.message") {
      const lista = Array.isArray(data) ? data : (data && Array.isArray(data.messages) ? data.messages : [data]);
      for (const m of lista) if (m && m.key) await processarMensagemWa(instancia, m);
    } else if (evento === "messages.update") await processarStatusWa(data);
    else if (evento === "connection.update") await processarConexaoWa(instancia, data || {});
    return json({ ok: true });
  } catch (e) { console.error(e); return json({ error: String(e) }, 500); }
});
