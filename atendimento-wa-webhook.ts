// atendimento-wa-webhook v2 — recebe o WhatsApp OFICIAL (Meta Cloud API) e grava no mesmo inbox do Evolution.
// v2: CONTEXTO da mensagem — referral (Click-to-WhatsApp / anúncio: headline, body, imagem, source_url, ctwa_clid),
//     context (encaminhada / muito encaminhada / resposta a mensagem / produto do catálogo) em atendimento_mensagens.contexto;
//     conversa que veio de anúncio guarda atendimento_conversas.contexto_origem; miniatura copiada pro bucket (contexto/...).
// GET = verificação do webhook (hub.verify_token). POST = mensagens e status. verify_jwt: false.
// Cada número oficial = linha em atendimento_wa_cloud (instancia "wa_<phone_number_id>"). Token fica só no banco.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const VERIFY_TOKEN = "vjw_wa_verify_5c1d9e3a";
const BOT_TOKEN = "vjw_bot_4d8e1b7a92c63f05";
const GRAPH = "https://graph.facebook.com/v21.0";
const BUCKET = "atendimento-midia";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function acionarBot(instancia: string, contatoId: string) {
  try {
    const p = fetch(`${SUPABASE_URL}/functions/v1/atendimento-bot`, { method: "POST", headers: { "Content-Type": "application/json", "x-bot-token": BOT_TOKEN }, body: JSON.stringify({ canal: "whatsapp", instancia, contato_id: contatoId }) }).catch((e) => console.error("bot", e));
    const er = (globalThis as any).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") er.waitUntil(p); else await p;
  } catch (e) { console.error("acionarBot", e); }
}
async function hmacOk(secret: string, raw: string, header: string | null): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === header.slice(7);
}
async function baixarMidia(cfg: any, mediaId: string, chave: string): Promise<{ path: string; mime: string } | null> {
  try {
    const meta = await (await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: "Bearer " + cfg.token } })).json().catch(() => null);
    if (!meta || !meta.url) return null;
    const res = await fetch(meta.url, { headers: { Authorization: "Bearer " + cfg.token } }); if (!res.ok) return null;
    const mime = meta.mime_type || res.headers.get("content-type") || "application/octet-stream";
    const bin = new Uint8Array(await res.arrayBuffer());
    const ext = (mime.split("/")[1] || "bin").split(";")[0];
    const path = `${cfg.instancia}/${chave}.${ext}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, bin, { contentType: mime, upsert: true });
    return error ? null : { path, mime };
  } catch (e) { console.error("midia wa", e); return null; }
}
const RESUMO: Record<string, string> = { imagem: "📷 Foto", audio: "🎤 Áudio", video: "🎥 Vídeo", sticker: "Figurinha" };

/* ---------- contexto ---------- */
function limparCtx(c: any): any | null {
  if (!c || !c.tipo) return null;
  const o: any = {};
  for (const [k, v] of Object.entries(c)) if (v !== undefined && v !== null && v !== "") o[k] = typeof v === "string" ? v.slice(0, 1500) : v;
  return o;
}
async function guardarImagemCtx(ctx: any, chave: string) {
  if (!ctx.imagem || !/^https?:\/\//.test(ctx.imagem)) return;
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(ctx.imagem, { signal: ac.signal });
    const ct = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !ct.startsWith("image/")) { try { await res.body?.cancel(); } catch { /* */ } return; }
    const bin = new Uint8Array(await res.arrayBuffer()); if (bin.length > 5_000_000) return;
    const path = `contexto/${chave.replace(/[^\w.\/-]/g, "_")}.${(ct.split("/")[1] || "jpg").replace("jpeg", "jpg")}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, bin, { contentType: ct, upsert: true });
    if (!error) ctx.imagem_path = path;
  } catch (e) { console.error("img contexto", e); } finally { clearTimeout(t); }
}
async function textoPorExterno(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const { data } = await admin.from("atendimento_mensagens").select("texto, tipo").eq("externo_id", String(id)).limit(1).maybeSingle();
  return data ? (data.texto || RESUMO[data.tipo] || null) : null;
}
async function contextoCloud(cfg: any, m: any): Promise<any | null> {
  let ctx: any = null;
  const r = m.referral;
  if (r) {
    ctx = { tipo: String(r.source_type || "").toLowerCase() === "ad" ? "anuncio" : "link", titulo: r.headline, texto: r.body, imagem: r.image_url || r.thumbnail_url, video: r.video_url,
      url: r.source_url, origem: r.source_type, ad_id: r.source_id, ctwa_clid: r.ctwa_clid, midia: r.media_type };
    await guardarImagemCtx(ctx, `${cfg.instancia}/${m.from}/${m.id}`);
  }
  const c = m.context;
  if (c) {
    const fwd = !!(c.forwarded || c.frequently_forwarded);
    if (!ctx && c.referred_product) ctx = { tipo: "link", titulo: "Produto do catálogo", texto: c.referred_product.product_retailer_id, produto_id: c.referred_product.product_retailer_id, catalogo_id: c.referred_product.catalog_id };
    else if (!ctx && c.id && !fwd) ctx = { tipo: "citacao", texto: await textoPorExterno(c.id), citado_id: c.id };
    if (fwd) { if (!ctx) ctx = { tipo: "encaminhada" }; ctx.encaminhada = true; if (c.frequently_forwarded) ctx.muito_encaminhada = true; }
  }
  return limparCtx(ctx);
}

async function registrar(cfg: any, o: { contatoId: string; nome: string | null; tipo: string; texto: string | null; midia: { path: string; mime: string } | null; nomeArquivo: string | null; externoId: string; ts: Date; payload: any; contexto?: any }) {
  const resumo = o.texto || RESUMO[o.tipo] || (o.tipo === "documento" ? "📎 " + (o.nomeArquivo || "Documento") : "[mensagem]");
  const { data: ex } = await admin.from("atendimento_conversas").select("id, contato_nome, status, nao_lidas").eq("instancia", cfg.instancia).eq("contato_id", o.contatoId).maybeSingle();
  let id: string;
  if (!ex) {
    const { data: nova, error } = await admin.from("atendimento_conversas").insert({ canal: "whatsapp", instancia: cfg.instancia, bot_id: cfg.bot_id || null, contato_id: o.contatoId, contato_nome: o.nome, status: "aguardando", ultima_mensagem_em: o.ts.toISOString(), ultima_mensagem_texto: resumo, ultima_direcao: "in", nao_lidas: 1 }).select("id").single();
    if (error) throw error; id = nova.id;
  } else {
    id = ex.id;
    const upd: any = { ultima_mensagem_em: o.ts.toISOString(), ultima_mensagem_texto: resumo, ultima_direcao: "in", nao_lidas: (ex.nao_lidas || 0) + 1, updated_at: new Date().toISOString() };
    if (o.nome && !ex.contato_nome) upd.contato_nome = o.nome;
    if (ex.status === "finalizado") { upd.status = "aguardando"; upd.atendente_id = null; upd.atendente_nome = null; }
    await admin.from("atendimento_conversas").update(upd).eq("id", id);
  }
  const linha: any = { conversa_id: id, canal: "whatsapp", direcao: "in", tipo: o.tipo, texto: o.texto, midia_path: o.midia ? o.midia.path : null, midia_mime: o.midia ? o.midia.mime : null, midia_nome: o.nomeArquivo, externo_id: o.externoId, status: "recebida", enviada_em: o.ts.toISOString(), payload: o.payload };
  if (o.contexto) linha.contexto = o.contexto;
  let { error: e2 } = await admin.from("atendimento_mensagens").upsert(linha, { onConflict: "conversa_id,externo_id", ignoreDuplicates: true });
  if (e2 && o.contexto && /contexto/i.test(String(e2.message || ""))) { delete linha.contexto; ({ error: e2 } = await admin.from("atendimento_mensagens").upsert(linha, { onConflict: "conversa_id,externo_id", ignoreDuplicates: true })); }
  if (e2) console.error("gravar msg", e2);
  if (o.contexto && o.contexto.tipo === "anuncio") {
    const { error } = await admin.from("atendimento_conversas").update({ contexto_origem: { ...o.contexto, em: o.ts.toISOString() } }).eq("id", id);
    if (error) console.error("contexto_origem", error.message);
  }
}

async function processarMensagem(cfg: any, m: any, nomes: Record<string, string>) {
  const from = String(m.from || ""); if (!from) return;
  const ts = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
  let tipo = "texto", texto: string | null = null, midia: { path: string; mime: string } | null = null, nomeArq: string | null = null;
  const t = m.type;
  const baixar = async (obj: any) => (obj && obj.id) ? await baixarMidia(cfg, obj.id, `${from}/${m.id}`) : null;
  if (t === "text") texto = m.text && m.text.body || "";
  else if (t === "image") { tipo = "imagem"; texto = m.image.caption || null; midia = await baixar(m.image); }
  else if (t === "video") { tipo = "video"; texto = m.video.caption || null; midia = await baixar(m.video); }
  else if (t === "audio") { tipo = "audio"; midia = await baixar(m.audio); }
  else if (t === "document") { tipo = "documento"; texto = m.document.caption || null; nomeArq = m.document.filename || null; midia = await baixar(m.document); }
  else if (t === "sticker") { tipo = "sticker"; midia = await baixar(m.sticker); }
  else if (t === "interactive") { const r = m.interactive && (m.interactive.button_reply || m.interactive.list_reply); texto = r ? (r.title || r.id) : "[resposta interativa]"; }
  else if (t === "button") texto = m.button && (m.button.text || m.button.payload) || "[botão]";
  else if (t === "location") { tipo = "outro"; texto = `[localização] ${m.location.latitude},${m.location.longitude}`; }
  else if (t === "contacts") { tipo = "outro"; texto = "[contato] " + ((m.contacts && m.contacts[0] && m.contacts[0].name && m.contacts[0].name.formatted_name) || ""); }
  else if (t === "reaction") { tipo = "outro"; texto = "[reação] " + (m.reaction && m.reaction.emoji || ""); }
  else { tipo = "outro"; texto = `[${t}]`; }
  let contexto: any = null;
  try { contexto = await contextoCloud(cfg, m); } catch (e) { console.error("contexto cloud", e); }
  await registrar(cfg, { contatoId: from, nome: nomes[from] || null, tipo, texto, midia, nomeArquivo: nomeArq, externoId: m.id, ts, payload: m, contexto });
  if (tipo !== "outro") await acionarBot(cfg.instancia, from);
}
async function processarStatus(s: any) {
  const map: Record<string, string> = { sent: "enviada", delivered: "entregue", read: "lida", failed: "erro" };
  const novo = map[s.status]; if (!novo || !s.id) return;
  await admin.from("atendimento_mensagens").update({ status: novo }).eq("externo_id", s.id).neq("status", "lida");
  if (s.status === "failed") console.error("wa falhou", JSON.stringify(s.errors || s));
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === VERIFY_TOKEN) return new Response(url.searchParams.get("hub.challenge") || "", { status: 200 });
    return json({ ok: true, servico: "atendimento-wa-webhook" });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const raw = await req.text(); let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "json inválido" }, 400); }
  try {
    if (body.object !== "whatsapp_business_account") return json({ ok: true });
    for (const entry of body.entry || []) for (const ch of entry.changes || []) {
      const v = ch.value || {}; const pnid = v.metadata && v.metadata.phone_number_id; if (!pnid) continue;
      const { data: cfg } = await admin.from("atendimento_wa_cloud").select("*").eq("phone_number_id", String(pnid)).maybeSingle();
      if (!cfg) { console.error("número oficial não cadastrado", pnid); continue; }
      if (cfg.app_secret && !(await hmacOk(cfg.app_secret, raw, req.headers.get("x-hub-signature-256")))) { console.error("assinatura inválida", pnid); return json({ error: "assinatura inválida" }, 401); }
      const nomes: Record<string, string> = {}; for (const c of v.contacts || []) if (c.wa_id && c.profile && c.profile.name) nomes[c.wa_id] = c.profile.name;
      for (const m of v.messages || []) await processarMensagem(cfg, m, nomes);
      for (const s of v.statuses || []) await processarStatus(s);
    }
    return json({ ok: true });
  } catch (e) { console.error(e); return json({ error: String(e) }, 500); }
});
