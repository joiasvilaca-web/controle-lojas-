// atendimento-webhook v12 — v12: CONTEXTO da mensagem (anúncio/"Saiba mais", resposta a story, post/reel compartilhado,
//     encaminhada, citação) em atendimento_mensagens.contexto (+ atendimento_conversas.contexto_origem quando veio de anúncio),
//     miniatura salva no bucket (contexto/...). COMENTÁRIOS em tempo real: Instagram field "comments"/"live_comments" e
//     Facebook object "page" field "feed" (item "comment") → atendimento_comentarios.
// v11: Facebook MESSENGER (object="page", canal "messenger", instancia fb_<page_id>, token da página por bot)
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
  tipo: string; texto: string | null; midia: { path: string; mime: string } | null; mime: string | null; nomeArquivo: string | null; externoId: string | null; ts: Date; payload: any; autorNome: string | null; botId?: string | null; contexto?: any }) {
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
  const linha: any = {
    conversa_id: conversaId, canal: opts.canal, direcao: opts.fromMe ? "out" : "in", tipo: opts.tipo, texto: opts.texto,
    midia_path: opts.midia ? opts.midia.path : null, midia_mime: opts.midia ? opts.midia.mime : opts.mime, midia_nome: opts.nomeArquivo,
    externo_id: opts.externoId, autor_nome: opts.autorNome, status: opts.fromMe ? "enviada" : "recebida", enviada_em: opts.ts.toISOString(), payload: opts.payload,
  };
  if (opts.contexto) linha.contexto = opts.contexto;
  let { error: errMsg } = await admin.from("atendimento_mensagens").upsert(linha, { onConflict: "conversa_id,externo_id", ignoreDuplicates: true });
  if (errMsg && opts.contexto && /contexto/i.test(String(errMsg.message || ""))) { delete linha.contexto; ({ error: errMsg } = await admin.from("atendimento_mensagens").upsert(linha, { onConflict: "conversa_id,externo_id", ignoreDuplicates: true })); }
  if (errMsg) console.error("gravar mensagem", errMsg);
  // conversa que veio de anúncio / link de referência guarda a origem (a mais recente) pro cabeçalho
  if (opts.contexto && !opts.fromMe && (opts.contexto.tipo === "anuncio" || (opts.contexto.tipo === "link" && opts.contexto.ref))) {
    const { error } = await admin.from("atendimento_conversas").update({ contexto_origem: { ...opts.contexto, em: opts.ts.toISOString() } }).eq("id", conversaId);
    if (error) console.error("contexto_origem", error.message);
  }
}

/* ================= CONTEXTO (anúncio / story / post / encaminhada / citação) ================= */
// contexto = { tipo: 'anuncio'|'story'|'post'|'encaminhada'|'citacao'|'link', titulo, texto, imagem, imagem_path, url, origem, ... }
function limparCtx(c: any): any | null {
  if (!c || !c.tipo) return null;
  const o: any = {};
  for (const [k, v] of Object.entries(c)) if (v !== undefined && v !== null && v !== "") o[k] = typeof v === "string" ? v.slice(0, 1500) : v;
  return o;
}
// miniaturas de anúncio/story vêm de CDN com URL temporária → copia pro bucket (até 5 MB, só imagem)
async function guardarImagemCtx(ctx: any, chave: string, base64: string | null) {
  try {
    let bin: Uint8Array | null = null; let mime = "image/jpeg";
    if (base64 && typeof base64 === "string" && base64.length > 100 && base64.length < 7_000_000) bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    else if (ctx.imagem && /^https?:\/\//.test(ctx.imagem)) {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 8000);
      try {
        const res = await fetch(ctx.imagem, { signal: ac.signal });
        const ct = (res.headers.get("content-type") || "").split(";")[0];
        if (!res.ok || !ct.startsWith("image/")) { try { await res.body?.cancel(); } catch { /* */ } return; }
        const buf = new Uint8Array(await res.arrayBuffer()); if (buf.length > 5_000_000) return;
        bin = buf; mime = ct;
      } finally { clearTimeout(t); }
    }
    if (!bin) return;
    const ext = (mime.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `contexto/${chave.replace(/[^\w.\/-]/g, "_")}.${ext}`;
    if (await guardarBytes(path, bin, mime)) ctx.imagem_path = path;
  } catch (e) { console.error("img contexto", e); }
}
async function textoPorExterno(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const { data } = await admin.from("atendimento_mensagens").select("texto, tipo").eq("externo_id", String(id)).limit(1).maybeSingle();
  return data ? (data.texto || RESUMO_TIPO[data.tipo] || null) : null;
}
function ctxResumo(ctx: any): string | null {
  if (!ctx) return null;
  if (ctx.tipo === "anuncio") return "📣 Veio do anúncio" + (ctx.titulo ? ": " + ctx.titulo : "");
  if (ctx.tipo === "story") return ctx.mencao ? "📖 Mencionou você no story" : "📖 Respondeu ao story";
  if (ctx.tipo === "post") return "↪️ " + (ctx.titulo || "Post compartilhado");
  if (ctx.tipo === "link") return "🔗 " + (ctx.titulo || ctx.url || "Link");
  return null;
}
// WhatsApp (Evolution/Baileys): contextInfo fica no data ou dentro do tipo da mensagem (extendedTextMessage, imageMessage…)
function contextInfoWa(data: any): any {
  if (data && data.contextInfo && typeof data.contextInfo === "object" && Object.keys(data.contextInfo).length) return data.contextInfo;
  const m = (data && data.message) || {};
  for (const k of Object.keys(m)) { const v = m[k]; if (v && typeof v === "object" && v.contextInfo) return v.contextInfo; }
  return null;
}
async function contextoWa(instancia: string, numero: string, data: any): Promise<any | null> {
  const ci = contextInfoWa(data); if (!ci) return null;
  const ad = ci.externalAdReply;
  const fwd = !!ci.isForwarded || Number(ci.forwardingScore || 0) > 0;
  let ctx: any = null;
  if (ad && (ad.title || ad.body || ad.sourceUrl || ad.thumbnailUrl || ad.mediaUrl)) {
    const ehAd = String(ad.sourceType || "").toLowerCase() === "ad" || !!ad.sourceId || !!ci.conversionSource || !!ci.entryPointConversionSource || !!ad.ctwaClid;
    ctx = { tipo: ehAd ? "anuncio" : "link", titulo: ad.title, texto: ad.body, imagem: ad.thumbnailUrl || ad.originalImageUrl || (ad.mediaType === 1 ? ad.mediaUrl : null), url: ad.sourceUrl || ad.mediaUrl,
      origem: ci.entryPointConversionApp || ci.conversionSource || ci.entryPointConversionSource || ad.sourceApp || ad.sourceType, ad_id: ad.sourceId, ctwa_clid: ad.ctwaClid };
    await guardarImagemCtx(ctx, `${instancia}/${numero}/${(data.key && data.key.id) || Date.now()}`, typeof ad.thumbnail === "string" ? ad.thumbnail : null);
  } else if (ci.quotedMessage || ci.stanzaId) {
    let t: string | null = null;
    if (ci.quotedMessage) { const q = extrairConteudo(ci.quotedMessage, ""); t = q.texto || RESUMO_TIPO[q.tipo] || (q.tipo === "documento" ? "📎 " + (q.nome || "Documento") : null); }
    if (!t && ci.stanzaId) t = await textoPorExterno(ci.stanzaId);
    ctx = { tipo: "citacao", texto: t, citado_id: ci.stanzaId };
  } else if (fwd) ctx = { tipo: "encaminhada" };
  if (ctx && fwd) { ctx.encaminhada = true; if (Number(ci.forwardingScore || 0) >= 5) ctx.muito_encaminhada = true; }
  return limparCtx(ctx);
}
// Instagram / Messenger: referral (anúncio, ig.me/m.me?ref=), reply_to (story ou mensagem), anexos share/story_mention/ig_reel/template
async function contextoMeta(ev: any, msg: any, chave: string): Promise<any | null> {
  const ref = (msg && msg.referral) || ev.referral || (ev.postback && ev.postback.referral);
  let ctx: any = null;
  if (ref) {
    const ad = ref.ads_context_data || {};
    const ehAd = String(ref.source || "").toUpperCase() === "ADS" || !!ref.ad_id || !!ad.ad_title;
    ctx = { tipo: ehAd ? "anuncio" : "link", titulo: ad.ad_title || (ref.ref ? "Link com referência: " + ref.ref : (ehAd ? null : "Abriu pela referência " + (ref.source || ""))),
      imagem: ad.photo_url, video: ad.video_url, url: ref.referer_uri || null, origem: ref.source || ref.type, ad_id: ref.ad_id, ref: ref.ref, post_id: ad.post_id, produto_id: ad.product_id };
  }
  const rt = msg && msg.reply_to;
  if (!ctx && rt && rt.story) ctx = { tipo: "story", imagem: rt.story.url, url: rt.story.url, story_id: rt.story.id };
  else if (!ctx && rt && rt.mid) ctx = { tipo: "citacao", texto: await textoPorExterno(rt.mid), citado_id: rt.mid };
  if (!ctx && msg) for (const a of Array.isArray(msg.attachments) ? msg.attachments : []) {
    const t = String(a.type || ""); const p = a.payload || {};
    if (t === "story_mention") ctx = { tipo: "story", mencao: true, imagem: p.url, url: p.url };
    else if (["share", "ig_reel", "reel", "ig_post", "post"].includes(t)) ctx = { tipo: "post", titulo: p.title || a.title || (t.includes("reel") ? "Reel compartilhado" : "Post compartilhado"), imagem: (t === "share" || t.includes("post")) ? p.url : null, url: p.url, media_id: p.ig_post_media_id || p.reel_video_id };
    else if (t === "fallback" || t === "template") { const el = (p.generic && p.generic.elements && p.generic.elements[0]) || (p.elements && p.elements[0]) || {}; ctx = { tipo: "link", titulo: a.title || p.title || el.title, texto: el.subtitle, imagem: el.image_url, url: a.url || p.url || el.item_url || (el.default_action && el.default_action.url) }; }
    if (ctx) break;
  }
  if (ctx && ctx.imagem) await guardarImagemCtx(ctx, chave, null);
  return limparCtx(ctx);
}

/* ================= COMENTÁRIOS (tempo real) ================= */
async function upsertComentario(row: any) {
  // só colunas vindas da plataforma (resposta/respondido feitos no sistema não são sobrescritos)
  const { error } = await admin.from("atendimento_comentarios").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "plataforma,externo_id" });
  if (error) console.error("comentario upsert", error.message);
}
async function marcarRespondido(plataforma: string, paiId: string, texto: string | null, autor: string, extId: string | null, ts: Date) {
  const { error } = await admin.from("atendimento_comentarios").update({ respondido: true, resposta: texto, respondido_por: autor, respondido_em: ts.toISOString(), resposta_externo_id: extId, updated_at: new Date().toISOString() })
    .eq("plataforma", plataforma).eq("externo_id", paiId).eq("respondido", false);
  if (error) console.error("comentario respondido", error.message);
}
async function postConhecido(plataforma: string, postId: string): Promise<any | null> {
  const { data } = await admin.from("atendimento_comentarios").select("post_url, post_thumb, post_legenda").eq("plataforma", plataforma).eq("post_id", postId).not("post_url", "is", null).limit(1).maybeSingle();
  return data || null;
}
async function comentarioIg(contaId: string, bot: any, token: string | null, v: any, field: string, ts: Date) {
  if (!v || !v.id) return;
  const de = v.from || {};
  if (String(de.id || "") === contaId) { if (v.parent_id) await marcarRespondido("instagram", String(v.parent_id), v.text || null, "Instagram (app)", String(v.id), ts); return; }
  const mediaId = v.media && v.media.id ? String(v.media.id) : null;
  let post: any = mediaId ? await postConhecido("instagram", mediaId) : null;
  if (!post && mediaId && token) {
    try {
      const r = await (await fetch(`https://graph.instagram.com/v21.0/${mediaId}?fields=permalink,media_url,thumbnail_url,caption&access_token=${encodeURIComponent(token)}`)).json();
      if (r && !r.error) post = { post_url: r.permalink || null, post_thumb: r.thumbnail_url || r.media_url || null, post_legenda: r.caption ? String(r.caption).slice(0, 500) : null };
    } catch { /* */ }
  }
  await upsertComentario({ bot_id: bot ? bot.id : null, plataforma: "instagram", externo_id: String(v.id), pai_externo_id: v.parent_id ? String(v.parent_id) : null, post_id: mediaId,
    ...(post || {}), autor_nome: de.username ? "@" + de.username : null, autor_id: de.id ? String(de.id) : null, texto: v.text || null, criado_em: ts.toISOString(), raw: { ...v, _field: field } });
}
async function comentarioFb(pageId: string, bot: any, token: string | null, v: any) {
  if (!v || v.item !== "comment" || !v.comment_id) return;
  const id = String(v.comment_id); const verbo = String(v.verb || "add");
  if (verbo === "remove") { await admin.from("atendimento_comentarios").update({ removido: true, updated_at: new Date().toISOString() }).eq("plataforma", "facebook").eq("externo_id", id); return; }
  if (verbo === "hide" || verbo === "unhide") { await admin.from("atendimento_comentarios").update({ oculto: verbo === "hide", updated_at: new Date().toISOString() }).eq("plataforma", "facebook").eq("externo_id", id); return; }
  const ts = v.created_time ? new Date(Number(v.created_time) < 1e12 ? Number(v.created_time) * 1000 : Number(v.created_time)) : new Date();
  const de = v.from || {}; const postId = v.post_id ? String(v.post_id) : null;
  const pai = v.parent_id && String(v.parent_id) !== postId ? String(v.parent_id) : null;
  if (String(de.id || "") === pageId) { if (pai) await marcarRespondido("facebook", pai, v.message || null, "Facebook (app)", id, ts); return; }
  let post: any = postId ? await postConhecido("facebook", postId) : null;
  if (!post && postId && token) {
    try {
      const r = await (await fetch(`https://graph.facebook.com/v21.0/${postId}?fields=permalink_url,full_picture,message&access_token=${encodeURIComponent(token)}`)).json();
      if (r && !r.error) post = { post_url: r.permalink_url || null, post_thumb: r.full_picture || null, post_legenda: r.message ? String(r.message).slice(0, 500) : null };
    } catch { /* */ }
  }
  if (!post && v.post && v.post.permalink_url) post = { post_url: v.post.permalink_url };
  await upsertComentario({ bot_id: bot ? bot.id : null, plataforma: "facebook", externo_id: id, pai_externo_id: pai, post_id: postId, ...(post || {}),
    autor_nome: de.name || null, autor_id: de.id ? String(de.id) : null, texto: v.message || null, criado_em: ts.toISOString(), raw: v });
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
  let contexto: any = null;
  try { contexto = await contextoWa(instancia, numero, data); } catch (e) { console.error("contexto wa", e); }
  await registrar({ canal: "whatsapp", instancia, contatoId: numero, fromMe, nome: (!fromMe && data.pushName) ? data.pushName : null, foto: () => fotoPerfilWa(instancia, numero),
    tipo: c.tipo, texto: c.texto, midia, mime: c.mime, nomeArquivo: c.nome, externoId: key.id || null, ts, payload: data, autorNome: fromMe ? (data.source === "web" ? null : "Celular") : null, contexto });
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
    const entTs = entry.time ? new Date(Number(entry.time) < 1e12 ? Number(entry.time) * 1000 : Number(entry.time)) : new Date();
    for (const ch of Array.isArray(entry.changes) ? entry.changes : []) {
      if (ch && ch.field === "messages" && ch.value) eventos.push(ch.value);
      else if (ch && (ch.field === "comments" || ch.field === "live_comments") && ch.value) { try { await comentarioIg(contaId, botIg, tokenIg, ch.value, ch.field, entTs); } catch (e) { console.error("comentario ig", e); } }
    }
    for (const ev of eventos) {
      const msg = ev.message;
      // referral sem mensagem (clique em anúncio / ig.me?ref=) vira um registro com o contexto
      if (!msg && !ev.referral) { console.log("ig evento sem message (ignorado)", Object.keys(ev || {}).join(",")); continue; }
      const fromMe = !!(msg && msg.is_echo);
      const contatoId = String(fromMe ? (ev.recipient && ev.recipient.id) : (ev.sender && ev.sender.id) || "");
      if (!contatoId || contatoId === contaId) continue;
      const ts = ev.timestamp ? new Date(Number(ev.timestamp) < 1e12 ? Number(ev.timestamp) * 1000 : Number(ev.timestamp)) : new Date();
      let contexto: any = null;
      try { contexto = await contextoMeta(ev, msg, `instagram/${contatoId}/${(msg && msg.mid) || ts.getTime()}`); } catch (e) { console.error("contexto ig", e); }
      if (!msg) {
        await registrar({ canal: "instagram", instancia, contatoId, fromMe: false, nome: null, foto: async () => (await perfilIg(contatoId, tokenIg)).foto,
          tipo: "outro", texto: ctxResumo(contexto) || "📣 Abriu a conversa por um link/anúncio", midia: null, mime: null, nomeArquivo: null, externoId: "ref_" + ts.getTime(), ts, payload: ev, autorNome: null, botId: botIg ? botIg.id : null, contexto });
        continue;
      }
      const anexos: any[] = Array.isArray(msg.attachments) ? msg.attachments : [];
      if (!anexos.length) {
        await registrar({ canal: "instagram", instancia, contatoId, fromMe, nome: null, foto: fromMe ? null : async () => (await perfilIg(contatoId, tokenIg)).foto,
          tipo: "texto", texto: msg.text || ctxResumo(contexto) || "[mensagem]", midia: null, mime: null, nomeArquivo: null, externoId: msg.mid || null, ts, payload: ev, autorNome: fromMe ? "Instagram (app)" : null, botId: botIg ? botIg.id : null, contexto });
      } else {
        let i = 0;
        for (const a of anexos) {
          const t = String(a.type || ""); const url = a.payload && a.payload.url;
          const tipo = t === "image" ? "imagem" : t === "audio" ? "audio" : t === "video" ? "video" : t === "file" ? "documento" : "outro";
          const midia = (url && ["imagem", "audio", "video", "documento"].includes(tipo)) ? await baixarAnexoIg(url, `${contatoId}/${msg.mid || Date.now()}_${i}`) : null;
          const texto = (i === 0 && msg.text) ? msg.text : (tipo === "outro" ? ((i === 0 && ctxResumo(contexto)) || `[${t}] ${url || ""}`.trim()) : null);
          await registrar({ canal: "instagram", instancia, contatoId, fromMe, nome: null, foto: fromMe ? null : async () => (await perfilIg(contatoId, tokenIg)).foto,
            tipo, texto, midia, mime: midia ? midia.mime : null, nomeArquivo: null, externoId: (msg.mid || "") + (i ? "_" + i : ""), ts, payload: ev, autorNome: fromMe ? "Instagram (app)" : null, botId: botIg ? botIg.id : null, contexto: i === 0 ? contexto : null });
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
    for (const ch of Array.isArray(entry.changes) ? entry.changes : []) {
      if (ch && ch.field === "feed" && ch.value && ch.value.item === "comment") { try { await comentarioFb(pageId, bot, token, ch.value); } catch (e) { console.error("comentario fb", e); } }
    }
    for (const ev of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const msg = ev.message;
      const referral = ev.referral || (ev.postback && ev.postback.referral);
      if (!msg && !referral) { console.log("fb evento sem message (ignorado)", Object.keys(ev || {}).join(",")); continue; }
      const fromMe = !!(msg && msg.is_echo);
      const contatoId = String(fromMe ? (ev.recipient && ev.recipient.id) : (ev.sender && ev.sender.id) || "");
      if (!contatoId || contatoId === pageId) continue;
      const ts = ev.timestamp ? new Date(Number(ev.timestamp) < 1e12 ? Number(ev.timestamp) * 1000 : Number(ev.timestamp)) : new Date();
      const foto = fromMe ? null : async () => (await perfilFb(contatoId, token)).foto;
      let contexto: any = null;
      try { contexto = await contextoMeta(ev, msg, `messenger/${contatoId}/${(msg && msg.mid) || ts.getTime()}`); } catch (e) { console.error("contexto fb", e); }
      if (!msg) {
        await registrar({ canal: "messenger", instancia, contatoId, fromMe: false, nome: null, foto, tipo: "outro", texto: ctxResumo(contexto) || "📣 Abriu a conversa por um link/anúncio", midia: null, mime: null, nomeArquivo: null, externoId: "ref_" + ts.getTime(), ts, payload: ev, autorNome: null, botId: bot ? bot.id : null, contexto });
        continue;
      }
      const anexos: any[] = Array.isArray(msg.attachments) ? msg.attachments : [];
      // eco de mensagem enviada por este sistema (já gravada com o mesmo mid) é ignorado pelo upsert; eco enviado pela Caixa de Entrada da Meta entra como "Facebook (app)"
      if (!anexos.length) {
        await registrar({ canal: "messenger", instancia, contatoId, fromMe, nome: null, foto, tipo: "texto", texto: msg.text || ctxResumo(contexto) || "[mensagem]", midia: null, mime: null, nomeArquivo: null, externoId: msg.mid || null, ts, payload: ev, autorNome: fromMe ? "Facebook (app)" : null, botId: bot ? bot.id : null, contexto });
      } else {
        let i = 0;
        for (const a of anexos) {
          const t = String(a.type || ""); const url = a.payload && a.payload.url;
          const tipo = t === "image" ? "imagem" : t === "audio" ? "audio" : t === "video" ? "video" : t === "file" ? "documento" : "outro";
          const midia = (url && ["imagem", "audio", "video", "documento"].includes(tipo)) ? await baixarAnexoFb(url, `${contatoId}/${msg.mid || Date.now()}_${i}`) : null;
          const texto = (i === 0 && msg.text) ? msg.text : (tipo === "outro" ? ((i === 0 && ctxResumo(contexto)) || `[${t}] ${url || ""}`.trim()) : null);
          await registrar({ canal: "messenger", instancia, contatoId, fromMe, nome: null, foto, tipo, texto, midia, mime: midia ? midia.mime : null, nomeArquivo: null, externoId: (msg.mid || "") + (i ? "_" + i : ""), ts, payload: ev, autorNome: fromMe ? "Facebook (app)" : null, botId: bot ? bot.id : null, contexto: i === 0 ? contexto : null });
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
