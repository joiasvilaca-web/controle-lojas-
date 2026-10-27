// atendimento-social v1 — COMENTÁRIOS do Instagram e do Facebook + AVALIAÇÕES do Google (Perfil da Empresa) no módulo Atendimento,
// e leitura do CONTEXTO das mensagens (anúncio / story / post / encaminhada / citação) gravado pelo atendimento-webhook.
// verify_jwt: true. Sessão igual ao atendimento-api (body.senha = token "sess_…" do usuário).
// Ops: status | pendentes | sincronizar | listar | responder | responderPrivado | ocultar | sugerirComentario | contextos
//      | configurarGoogle | googleLocais
// Tokens por bot (atendimento_bots.segredos): INSTAGRAM_TOKEN (Instagram API with Instagram Login, instagram_business_manage_comments),
//      FB_PAGE_TOKEN (pages_read_engagement, pages_read_user_content, pages_manage_engagement), GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET /
//      GOOGLE_REFRESH_TOKEN / GOOGLE_ACCOUNT_ID / GOOGLE_LOCATION_ID (escopo https://www.googleapis.com/auth/business.manage).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IG_API = "https://graph.instagram.com/v21.0";
const GRAPH = "https://graph.facebook.com/v21.0";
const GBP = "https://mybusiness.googleapis.com/v4";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } }); }
class Erro extends Error { status: number; constructor(m: string, s = 400) { super(m); this.status = s; } }

/* ---------- sessão (copiado do atendimento-api) ---------- */
async function getConfig(): Promise<any> { const { data, error } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle(); if (error) throw error; return (data && data.payload) || {}; }
function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_")) return false;
  if (u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  const lista = Array.isArray(u.sessoes) ? u.sessoes : [];
  return lista.some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
function findUserBySenha(config: any, senha: string): any { return (config.users || []).find((u: any) => sessaoValida(u, senha)) || null; }
function podeAtender(user: any): boolean { const p = user.permissoes && user.permissoes.atendimento; if (p && typeof p.ativo === "boolean") return p.ativo; return true; }
function ehGestao(user: any): boolean { return user.nivel === "diretoria" || user.nivel === "gerente"; }
function nomeExibicao(config: any, user: any): string { const f = (config.funcionarios || []).find((x: any) => x.id === user.funcionarioId); return (f && (f.apelido || "").trim()) || (f && f.nome) || user.nome || ""; }
function podeVerConversa(user: any, c: any): boolean { if (ehGestao(user)) return true; return !c.atendente_id || c.atendente_id === user.funcionarioId; }

/* ---------- segredos / bots ---------- */
let __seg: Record<string, string> | null = null;
async function segredosGlobais(): Promise<Record<string, string>> {
  if (__seg) return __seg;
  const out: Record<string, string> = {};
  for (const k of ["INSTAGRAM_TOKEN", "FB_PAGE_TOKEN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) { const v = Deno.env.get(k); if (v) out[k] = v; }
  const { data } = await admin.from("atendimento_segredos").select("chave, valor");
  for (const r of data || []) if (!out[r.chave]) out[r.chave] = r.valor;
  __seg = out; return out;
}
async function bots(): Promise<any[]> { const { data, error } = await admin.from("atendimento_bots").select("id, nome, ativo, canais, segredos").order("created_at"); if (error) throw error; return data || []; }
type Cfg = { ok: boolean; motivo?: string; token?: string; contaId?: string; conta?: string | null; g?: any };
async function cfgInstagram(b: any): Promise<Cfg> {
  const canal = (b.canais || []).find((c: any) => c.tipo === "instagram");
  const s = b.segredos || {};
  const token = s.INSTAGRAM_TOKEN || (canal ? (await segredosGlobais()).INSTAGRAM_TOKEN : null);
  if (!canal && !s.INSTAGRAM_TOKEN) return { ok: false, motivo: "Bot sem canal Instagram. Em Administrar › Bots, adicione o Instagram e cole o token (Instagram API with Instagram Login) com a permissão instagram_business_manage_comments." };
  if (!token) return { ok: false, motivo: "Falta o token do Instagram (INSTAGRAM_TOKEN) neste bot." };
  return { ok: true, token, contaId: canal ? String(canal.ig_id || "") : "", conta: canal ? (canal.usuario || null) : null };
}
async function cfgFacebook(b: any): Promise<Cfg> {
  const canal = (b.canais || []).find((c: any) => c.tipo === "messenger");
  const s = b.segredos || {};
  const token = s.FB_PAGE_TOKEN || (canal ? (await segredosGlobais()).FB_PAGE_TOKEN : null);
  if (!token) return { ok: false, motivo: "Falta o token da Página do Facebook (FB_PAGE_TOKEN). Em Administrar › Bots, adicione o canal Messenger com o ID da página e o token (permissões pages_read_engagement, pages_read_user_content, pages_manage_engagement)." };
  let pageId = canal && canal.page_id ? String(canal.page_id) : "";
  let nome: string | null = canal ? (canal.nome || null) : null;
  if (!pageId) { try { const r = await (await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(token)}`)).json(); if (r && r.id) { pageId = String(r.id); nome = r.name || nome; } } catch { /* */ } }
  if (!pageId) return { ok: false, motivo: "Não foi possível descobrir o ID da Página (cadastre o canal Messenger com page_id)." };
  return { ok: true, token, contaId: pageId, conta: nome };
}
async function cfgGoogle(b: any): Promise<Cfg> {
  const s = b.segredos || {}; const gl = await segredosGlobais();
  const g = { clientId: s.GOOGLE_CLIENT_ID || gl.GOOGLE_CLIENT_ID, clientSecret: s.GOOGLE_CLIENT_SECRET || gl.GOOGLE_CLIENT_SECRET, refresh: s.GOOGLE_REFRESH_TOKEN, account: s.GOOGLE_ACCOUNT_ID, location: s.GOOGLE_LOCATION_ID };
  const faltam = [!g.clientId && "GOOGLE_CLIENT_ID", !g.clientSecret && "GOOGLE_CLIENT_SECRET", !g.refresh && "GOOGLE_REFRESH_TOKEN"].filter(Boolean);
  if (faltam.length) return { ok: false, motivo: "Google não configurado: falta " + faltam.join(", ") + ". Use “Configurar Google” (precisa da Business Profile API liberada no Google Cloud e escopo business.manage).", g };
  if (!g.account || !g.location) return { ok: false, motivo: "Google: falta escolher a conta/local (GOOGLE_ACCOUNT_ID / GOOGLE_LOCATION_ID). Use “Configurar Google” › Buscar locais.", g };
  return { ok: true, g, conta: s.GOOGLE_LOCATION_NOME || null };
}
const __gtok: Record<string, { t: string; exp: number }> = {};
async function googleToken(g: any): Promise<string> {
  const k = g.refresh; const c = __gtok[k]; if (c && c.exp > Date.now() + 60000) return c.t;
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: g.refresh, grant_type: "refresh_token" }) });
  const r = await res.json().catch(() => null);
  if (!res.ok || !r || !r.access_token) throw new Erro("Google OAuth: " + JSON.stringify((r && (r.error_description || r.error)) || res.status), 502);
  __gtok[k] = { t: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3000) * 1000 };
  return r.access_token;
}
async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers }); const r = await res.json().catch(() => null);
  if (!res.ok || (r && r.error)) { const e = r && r.error; throw new Erro((e && (e.message || e.error_user_msg)) ? String(e.message || e.error_user_msg) + (e.code ? ` (código ${e.code})` : "") : "HTTP " + res.status, 502); }
  return r;
}
async function postGraph(url: string, params: Record<string, string>, bearer?: string): Promise<any> {
  const h: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" }; if (bearer) h.Authorization = "Bearer " + bearer;
  const res = await fetch(url, { method: "POST", headers: h, body: new URLSearchParams(params) }); const r = await res.json().catch(() => null);
  if (!res.ok || (r && r.error)) { const e = r && r.error; throw new Erro("Meta: " + ((e && e.message) || ("HTTP " + res.status)) + (e && e.code ? ` (código ${e.code})` : ""), 502); }
  return r;
}
const ESTRELAS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/* ---------- gravação preservando o que foi feito no sistema ---------- */
async function gravar(rows: any[]): Promise<number> {
  if (!rows.length) return 0;
  const agora = new Date().toISOString();
  let n = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const lote = rows.slice(i, i + 200).map((r) => ({ ...r, updated_at: agora }));
    const { error } = await admin.from("atendimento_comentarios").upsert(lote, { onConflict: "plataforma,externo_id" });
    if (error) throw error; n += lote.length;
  }
  return n;
}
// respondido só "sobe" (nunca desmarca o que foi respondido pelo sistema)
async function marcarRespondidos(plataforma: string, itens: { id: string; texto: string | null; por: string; em: string | null; extId: string | null }[]) {
  for (const it of itens) {
    await admin.from("atendimento_comentarios").update({ respondido: true, resposta: it.texto, respondido_por: it.por, respondido_em: it.em, resposta_externo_id: it.extId })
      .eq("plataforma", plataforma).eq("externo_id", it.id).eq("respondido", false);
  }
}

async function syncInstagram(b: any, cfg: Cfg, limitePosts: number) {
  const tk = encodeURIComponent(cfg.token!);
  const eu = await getJson(`${IG_API}/me?fields=user_id,username&access_token=${tk}`);
  const meuUser = String(eu.username || ""); const meuId = String(eu.user_id || eu.id || cfg.contaId || "");
  const midias = await getJson(`${IG_API}/me/media?fields=id,caption,permalink,media_url,thumbnail_url,media_type,timestamp,comments_count&limit=${limitePosts}&access_token=${tk}`);
  const rows: any[] = []; const resp: any[] = [];
  for (const m of midias.data || []) {
    if (!m.comments_count) continue;
    const post = { post_id: String(m.id), post_url: m.permalink || null, post_thumb: m.thumbnail_url || m.media_url || null, post_legenda: m.caption ? String(m.caption).slice(0, 500) : null };
    const cs = await getJson(`${IG_API}/${m.id}/comments?fields=id,text,username,timestamp,hidden,from,replies{id,text,username,timestamp,from}&limit=50&access_token=${tk}`);
    for (const c of cs.data || []) {
      const deMim = (c.username && c.username === meuUser) || (c.from && String(c.from.id) === meuId);
      if (!deMim) rows.push({ bot_id: b.id, plataforma: "instagram", externo_id: String(c.id), pai_externo_id: null, ...post, autor_nome: c.username ? "@" + c.username : null, autor_id: c.from ? String(c.from.id) : null, texto: c.text || null, criado_em: c.timestamp || null, oculto: !!c.hidden, raw: c });
      const reps: any[] = (c.replies && c.replies.data) || [];
      const minha = reps.filter((r) => (r.username && r.username === meuUser) || (r.from && String(r.from.id) === meuId)).pop();
      if (minha && !deMim) resp.push({ id: String(c.id), texto: minha.text || null, por: "Instagram (app)", em: minha.timestamp || null, extId: String(minha.id) });
      for (const r of reps) {
        if ((r.username && r.username === meuUser) || (r.from && String(r.from.id) === meuId)) continue;
        rows.push({ bot_id: b.id, plataforma: "instagram", externo_id: String(r.id), pai_externo_id: String(c.id), ...post, autor_nome: r.username ? "@" + r.username : null, autor_id: r.from ? String(r.from.id) : null, texto: r.text || null, criado_em: r.timestamp || null, raw: r });
      }
    }
  }
  const n = await gravar(rows); await marcarRespondidos("instagram", resp);
  return { ok: true, comentarios: n, conta: meuUser ? "@" + meuUser : cfg.conta };
}
async function syncFacebook(b: any, cfg: Cfg, limitePosts: number) {
  const tk = encodeURIComponent(cfg.token!); const pageId = cfg.contaId!;
  const posts = await getJson(`${GRAPH}/${pageId}/posts?fields=id,message,permalink_url,full_picture,created_time,comments.limit(50).order(reverse_chronological){id,message,from,created_time,is_hidden,comments.limit(25){id,message,from,created_time}}&limit=${limitePosts}&access_token=${tk}`);
  const rows: any[] = []; const resp: any[] = [];
  for (const p of posts.data || []) {
    const post = { post_id: String(p.id), post_url: p.permalink_url || null, post_thumb: p.full_picture || null, post_legenda: p.message ? String(p.message).slice(0, 500) : null };
    for (const c of (p.comments && p.comments.data) || []) {
      const deMim = c.from && String(c.from.id) === pageId;
      if (!deMim) rows.push({ bot_id: b.id, plataforma: "facebook", externo_id: String(c.id), pai_externo_id: null, ...post, autor_nome: (c.from && c.from.name) || null, autor_id: c.from ? String(c.from.id) : null, texto: c.message || null, criado_em: c.created_time || null, oculto: !!c.is_hidden, raw: c });
      const reps: any[] = (c.comments && c.comments.data) || [];
      const minha = reps.filter((r) => r.from && String(r.from.id) === pageId).pop();
      if (minha && !deMim) resp.push({ id: String(c.id), texto: minha.message || null, por: "Facebook (app)", em: minha.created_time || null, extId: String(minha.id) });
      for (const r of reps) {
        if (r.from && String(r.from.id) === pageId) continue;
        rows.push({ bot_id: b.id, plataforma: "facebook", externo_id: String(r.id), pai_externo_id: String(c.id), ...post, autor_nome: (r.from && r.from.name) || null, autor_id: r.from ? String(r.from.id) : null, texto: r.message || null, criado_em: r.created_time || null, raw: r });
      }
    }
  }
  const n = await gravar(rows); await marcarRespondidos("facebook", resp);
  return { ok: true, comentarios: n, conta: cfg.conta };
}
function gLoc(g: any): string { const a = String(g.account).replace(/^accounts\//, ""); const l = String(g.location).replace(/^.*locations\//, ""); return `accounts/${a}/locations/${l}`; }
async function syncGoogle(b: any, cfg: Cfg) {
  const at = await googleToken(cfg.g); const loc = gLoc(cfg.g);
  const rows: any[] = []; const resp: any[] = []; let pageToken = ""; let paginas = 0;
  do {
    const r = await getJson(`${GBP}/${loc}/reviews?pageSize=50&orderBy=updateTime%20desc${pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""}`, { Authorization: "Bearer " + at });
    for (const v of r.reviews || []) {
      rows.push({ bot_id: b.id, plataforma: "google", externo_id: String(v.reviewId), post_id: loc, post_url: null, post_thumb: null, post_legenda: null,
        autor_nome: (v.reviewer && v.reviewer.displayName) || "Cliente do Google", autor_id: null, texto: v.comment || null, nota: ESTRELAS[v.starRating] || null, criado_em: v.createTime || null, raw: { name: v.name, reviewer: v.reviewer, updateTime: v.updateTime } });
      if (v.reviewReply && v.reviewReply.comment) resp.push({ id: String(v.reviewId), texto: v.reviewReply.comment, por: "Google (painel)", em: v.reviewReply.updateTime || null, extId: null });
    }
    pageToken = r.nextPageToken || ""; paginas++;
  } while (pageToken && paginas < 4);
  const n = await gravar(rows); await marcarRespondidos("google", resp);
  return { ok: true, comentarios: n, conta: cfg.conta };
}

/* ---------- IA ---------- */
async function gemini(sistema: string, prompt: string): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY"); if (!key) throw new Erro("GEMINI_API_KEY não configurada", 500);
  const modelo = Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-flash-latest";
  let ultimo = "";
  for (let t = 0; t < 2; t++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 1024 } }) });
    const r = await res.json().catch(() => null);
    if (res.ok) { const partes = (r && r.candidates && r.candidates[0] && r.candidates[0].content && r.candidates[0].content.parts) || []; const tx = partes.filter((p: any) => p && typeof p.text === "string" && !p.thought).map((p: any) => p.text).join("").trim(); if (tx) return tx; ultimo = "resposta vazia da IA"; }
    else { ultimo = "Gemini " + res.status + ": " + JSON.stringify((r && r.error && r.error.message) || r).slice(0, 300); if (res.status !== 429 && res.status < 500) break; }
    await new Promise((x) => setTimeout(x, 1200));
  }
  throw new Erro(ultimo || "falha na IA", 502);
}

async function comentarioOuErro(id: string) { const { data, error } = await admin.from("atendimento_comentarios").select("*").eq("id", id).maybeSingle(); if (error) throw error; if (!data) throw new Erro("comentário não encontrado", 404); return data; }
async function botOuErro(id: string | null) { const lista = await bots(); const b = lista.find((x) => x.id === id) || (lista.length === 1 ? lista[0] : null); if (!b) throw new Erro("bot do comentário não encontrado", 404); return b; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  const { op, senha } = body || {};
  if (!op) return json({ error: "operação obrigatória" }, 400);
  try {
    const config = await getConfig();
    const user = findUserBySenha(config, senha);
    if (!user) return json({ error: "não autorizado" }, 401);
    if (!podeAtender(user)) return json({ error: "sem permissão para o Atendimento" }, 403);
    const gestao = ehGestao(user);
    const meuNome = nomeExibicao(config, user);

    /* ----- contexto das mensagens de uma conversa ----- */
    if (op === "contextos") {
      const { data: c } = await admin.from("atendimento_conversas").select("*").eq("id", String(body.conversaId || "")).maybeSingle();
      if (!c) return json({ error: "conversa não encontrada" }, 404);
      if (!podeVerConversa(user, c)) return json({ error: "sem acesso a esta conversa" }, 403);
      let q = admin.from("atendimento_mensagens").select("id, contexto, enviada_em").eq("conversa_id", c.id).not("contexto", "is", null).order("enviada_em", { ascending: false }).limit(500);
      if (body.depoisDe) q = q.gte("enviada_em", body.depoisDe);
      const { data, error } = await q;
      if (error) { if (/contexto/i.test(error.message || "")) return json({ ok: true, data: {}, origem: null, aviso: "coluna contexto ainda não criada" }); throw error; }
      const out: Record<string, any> = {}; for (const m of data || []) out[m.id] = m.contexto;
      return json({ ok: true, data: out, origem: c.contexto_origem || null });
    }

    if (op === "status") {
      const lista = (await bots()).filter((b) => !body.botId || b.id === body.botId);
      const out: any[] = [];
      for (const b of lista) {
        const ig = await cfgInstagram(b), fb = await cfgFacebook(b), gg = await cfgGoogle(b);
        out.push({ botId: b.id, nome: b.nome, ativo: b.ativo,
          instagram: { configurado: ig.ok, motivo: ig.motivo || null, conta: ig.conta || null },
          facebook: { configurado: fb.ok, motivo: fb.motivo || null, conta: fb.conta || null },
          google: { configurado: gg.ok, motivo: gg.motivo || null, conta: gg.conta || null, temCredenciais: !!(gg.g && gg.g.clientId && gg.g.clientSecret && gg.g.refresh) } });
      }
      return json({ ok: true, bots: out, gestao, temGemini: !!Deno.env.get("GEMINI_API_KEY") });
    }

    if (op === "pendentes") {
      let q = admin.from("atendimento_comentarios").select("plataforma", { count: "exact" }).eq("respondido", false).eq("oculto", false).eq("removido", false).limit(1000);
      if (body.botId) q = q.eq("bot_id", body.botId);
      const { data, count, error } = await q;
      if (error) { if (/atendimento_comentarios/.test(error.message || "")) return json({ ok: true, total: 0, porPlataforma: {}, aviso: "tabela atendimento_comentarios ainda não criada" }); throw error; }
      const por: Record<string, number> = {}; for (const r of data || []) por[r.plataforma] = (por[r.plataforma] || 0) + 1;
      return json({ ok: true, total: count || 0, porPlataforma: por });
    }

    if (op === "sincronizar") {
      const lista = (await bots()).filter((b) => (!body.botId || b.id === body.botId) && b.ativo !== false);
      const plats = body.plataforma ? [String(body.plataforma)] : ["instagram", "facebook", "google"];
      const limitePosts = Math.min(Math.max(Number(body.limitePosts) || 15, 1), 50);
      const resultado: any[] = [];
      for (const b of lista) for (const p of plats) {
        const item: any = { botId: b.id, bot: b.nome, plataforma: p };
        try {
          const cfg = p === "instagram" ? await cfgInstagram(b) : p === "facebook" ? await cfgFacebook(b) : await cfgGoogle(b);
          if (!cfg.ok) { item.status = "nao_configurado"; item.motivo = cfg.motivo; }
          else { const r = p === "instagram" ? await syncInstagram(b, cfg, limitePosts) : p === "facebook" ? await syncFacebook(b, cfg, limitePosts) : await syncGoogle(b, cfg); item.status = "ok"; item.comentarios = r.comentarios; item.conta = r.conta; }
        } catch (e) { item.status = "erro"; item.motivo = e instanceof Error ? e.message : String(e); }
        resultado.push(item);
      }
      return json({ ok: true, resultado });
    }

    if (op === "listar") {
      let q = admin.from("atendimento_comentarios").select("id, bot_id, plataforma, externo_id, pai_externo_id, post_id, post_url, post_thumb, post_legenda, autor_nome, autor_id, texto, nota, criado_em, respondido, resposta, respondido_por, respondido_em, privado_em, oculto").eq("removido", false).order("criado_em", { ascending: false, nullsFirst: false }).limit(Math.min(Number(body.limite) || 300, 1000));
      if (body.botId) q = q.eq("bot_id", body.botId);
      if (body.plataforma) q = q.eq("plataforma", body.plataforma);
      const st = body.status || "pendentes";
      if (st === "pendentes") q = q.eq("respondido", false).eq("oculto", false);
      else if (st === "respondidos") q = q.eq("respondido", true);
      else if (st === "ocultos") q = q.eq("oculto", true);
      const { data, error } = await q;
      if (error) { if (/atendimento_comentarios/.test(error.message || "")) return json({ ok: true, data: [], aviso: "Tabela atendimento_comentarios ainda não criada (rodar sql/atendimento_social.sql)." }); throw error; }
      return json({ ok: true, data: data || [] });
    }

    if (op === "responder" || op === "responderPrivado") {
      const texto = String(body.texto || "").trim(); if (!texto) return json({ error: "escreva a resposta" }, 400);
      if (texto.length > 2000) return json({ error: "resposta muito longa" }, 400);
      const c = await comentarioOuErro(String(body.id || "")); const b = await botOuErro(c.bot_id);
      const agora = new Date().toISOString();
      if (op === "responderPrivado") {
        if (c.plataforma === "google") return json({ error: "o Google não tem resposta privada" }, 400);
        if (c.privado_em) return json({ error: "já foi enviada uma resposta privada para este comentário (a Meta permite só uma)" }, 409);
        if (c.plataforma === "instagram") { const cfg = await cfgInstagram(b); if (!cfg.ok) throw new Erro(cfg.motivo!);
          const res = await fetch(`${IG_API}/me/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.token }, body: JSON.stringify({ recipient: { comment_id: c.externo_id }, message: { text: texto } }) });
          const r = await res.json().catch(() => null); if (!res.ok || (r && r.error)) throw new Erro("Instagram: " + ((r && r.error && r.error.message) || res.status), 502);
        } else { const cfg = await cfgFacebook(b); if (!cfg.ok) throw new Erro(cfg.motivo!);
          const res = await fetch(`${GRAPH}/${cfg.contaId}/messages?access_token=${encodeURIComponent(cfg.token!)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { comment_id: c.externo_id }, message: { text: texto } }) });
          const r = await res.json().catch(() => null); if (!res.ok || (r && r.error)) throw new Erro("Facebook: " + ((r && r.error && r.error.message) || res.status), 502);
        }
        await admin.from("atendimento_comentarios").update({ privado_em: agora, updated_at: agora }).eq("id", c.id);
        return json({ ok: true, aviso: "Mensagem privada enviada — a conversa aparece na caixa de entrada quando o cliente responder." });
      }
      let extId: string | null = null;
      if (c.plataforma === "instagram") {
        const cfg = await cfgInstagram(b); if (!cfg.ok) throw new Erro(cfg.motivo!);
        const alvo = c.pai_externo_id || c.externo_id; // IG não aceita resposta de resposta: responde no comentário principal
        const texto2 = c.pai_externo_id && c.autor_nome && !texto.includes(c.autor_nome) ? `${c.autor_nome} ${texto}` : texto;
        const r = await postGraph(`${IG_API}/${alvo}/replies`, { message: texto2 }, cfg.token); extId = r && r.id ? String(r.id) : null;
      } else if (c.plataforma === "facebook") {
        const cfg = await cfgFacebook(b); if (!cfg.ok) throw new Erro(cfg.motivo!);
        const alvo = c.pai_externo_id || c.externo_id;
        const r = await postGraph(`${GRAPH}/${alvo}/comments`, { message: texto, access_token: cfg.token! }); extId = r && r.id ? String(r.id) : null;
      } else {
        const cfg = await cfgGoogle(b); if (!cfg.ok) throw new Erro(cfg.motivo!);
        const at = await googleToken(cfg.g);
        const nome = (c.raw && c.raw.name) || `${gLoc(cfg.g)}/reviews/${c.externo_id}`;
        const res = await fetch(`${GBP}/${nome}/reply`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + at }, body: JSON.stringify({ comment: texto }) });
        const r = await res.json().catch(() => null); if (!res.ok) throw new Erro("Google: " + ((r && r.error && r.error.message) || res.status), 502);
      }
      await admin.from("atendimento_comentarios").update({ respondido: true, resposta: texto, respondido_por: meuNome, respondido_em: agora, resposta_externo_id: extId, updated_at: agora }).eq("id", c.id);
      return json({ ok: true });
    }

    if (op === "marcar") { // marcar como respondido/pendente sem publicar nada (ex.: respondido por fora)
      const c = await comentarioOuErro(String(body.id || "")); const agora = new Date().toISOString();
      await admin.from("atendimento_comentarios").update(body.respondido ? { respondido: true, respondido_por: meuNome + " (marcado)", respondido_em: agora, updated_at: agora } : { respondido: false, updated_at: agora }).eq("id", c.id);
      return json({ ok: true });
    }

    if (op === "ocultar") {
      if (!gestao) return json({ error: "só a gestão (diretoria/gerente) pode ocultar comentários" }, 403);
      const c = await comentarioOuErro(String(body.id || "")); const b = await botOuErro(c.bot_id);
      const ocultar = body.ocultar !== false;
      if (c.plataforma === "instagram") { const cfg = await cfgInstagram(b); if (!cfg.ok) throw new Erro(cfg.motivo!); await postGraph(`${IG_API}/${c.externo_id}`, { hide: String(ocultar) }, cfg.token); }
      else if (c.plataforma === "facebook") { const cfg = await cfgFacebook(b); if (!cfg.ok) throw new Erro(cfg.motivo!); await postGraph(`${GRAPH}/${c.externo_id}`, { is_hidden: String(ocultar), access_token: cfg.token! }); }
      else return json({ error: "avaliações do Google não podem ser ocultadas (só denunciadas pelo painel do Google)" }, 400);
      await admin.from("atendimento_comentarios").update({ oculto: ocultar, updated_at: new Date().toISOString() }).eq("id", c.id);
      return json({ ok: true });
    }

    if (op === "sugerirComentario") {
      const c = await comentarioOuErro(String(body.id || ""));
      const { data: kb } = await admin.from("atendimento_ia_conhecimento").select("titulo, conteudo, bot_id").eq("ativo", true).limit(200);
      const itens = (kb || []).filter((k: any) => !k.bot_id || !c.bot_id || String(k.bot_id) === String(c.bot_id));
      let base = ""; for (const k of itens) { const l = `- ${k.titulo}: ${k.conteudo}\n`; if (base.length + l.length > 12000) break; base += l; }
      const b = (await bots()).find((x) => x.id === c.bot_id);
      const onde = c.plataforma === "google" ? `avaliação no Google (${c.nota || "?"} estrela(s))` : `comentário público no ${c.plataforma === "instagram" ? "Instagram" : "Facebook"}`;
      const sistema = `Você responde ${onde} em nome da loja "${(b && b.nome) || "Vilaça Joias"}" (joalheria em Juiz de Fora/MG). Português do Brasil, tom cordial e próximo, 1 a 3 frases curtas, no máximo 1 emoji. ` +
        `É uma resposta PÚBLICA: nunca invente preços, prazos ou promessas que não estejam na base; para orçamento ou dúvida específica convide a chamar no direct/WhatsApp. ` +
        `Avaliação negativa: agradeça, peça desculpas sem discutir e ofereça resolver no privado. Responda só com o texto final, sem aspas.` + (base ? `\n\nBase de conhecimento da loja:\n${base}` : "");
      const prompt = `${c.post_legenda ? `Legenda do post: "${String(c.post_legenda).slice(0, 400)}"\n` : ""}Autor: ${c.autor_nome || "cliente"}\nTexto: "${c.texto || "(sem texto, só a nota)"}"`;
      const texto = await gemini(sistema, prompt);
      return json({ ok: true, texto: texto.replace(/^["“]|["”]$/g, "").trim() });
    }

    if (op === "configurarGoogle") {
      if (!gestao) return json({ error: "só a gestão configura" }, 403);
      const { data: b } = await admin.from("atendimento_bots").select("id, segredos").eq("id", String(body.botId || "")).maybeSingle();
      if (!b) return json({ error: "bot não encontrado" }, 404);
      const sg: any = { ...(b.segredos || {}) };
      const mapa: Record<string, string> = { clientId: "GOOGLE_CLIENT_ID", clientSecret: "GOOGLE_CLIENT_SECRET", refreshToken: "GOOGLE_REFRESH_TOKEN", accountId: "GOOGLE_ACCOUNT_ID", locationId: "GOOGLE_LOCATION_ID", locationNome: "GOOGLE_LOCATION_NOME" };
      for (const [k, chave] of Object.entries(mapa)) { if (body[k] === undefined) continue; const v = String(body[k] || "").trim(); if (v) sg[chave] = v; else delete sg[chave]; }
      if (body.remover) for (const chave of Object.values(mapa)) delete sg[chave];
      const { error } = await admin.from("atendimento_bots").update({ segredos: sg, updated_at: new Date().toISOString() }).eq("id", b.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (op === "googleLocais") {
      if (!gestao) return json({ error: "só a gestão configura" }, 403);
      const b = (await bots()).find((x) => x.id === body.botId); if (!b) return json({ error: "bot não encontrado" }, 404);
      const cfg = await cfgGoogle(b);
      if (!cfg.g || !cfg.g.clientId || !cfg.g.clientSecret || !cfg.g.refresh) return json({ error: cfg.motivo || "Google não configurado" }, 400);
      const at = await googleToken(cfg.g);
      const contas = await getJson("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { Authorization: "Bearer " + at });
      const out: any[] = [];
      for (const a of contas.accounts || []) {
        try {
          const ls = await getJson(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`, { Authorization: "Bearer " + at });
          for (const l of ls.locations || []) out.push({ accountId: String(a.name).replace("accounts/", ""), conta: a.accountName || a.name, locationId: String(l.name).replace("locations/", ""), titulo: l.title || l.name, endereco: l.storefrontAddress ? [(l.storefrontAddress.addressLines || []).join(", "), l.storefrontAddress.locality].filter(Boolean).join(" — ") : "" });
        } catch (e) { out.push({ accountId: String(a.name).replace("accounts/", ""), conta: a.accountName || a.name, erro: e instanceof Error ? e.message : String(e) }); }
      }
      return json({ ok: true, locais: out });
    }

    return json({ error: "operação desconhecida: " + op }, 400);
  } catch (e) {
    console.error(e);
    const st = e instanceof Erro ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : String((e as any)?.message || e) }, st);
  }
});
