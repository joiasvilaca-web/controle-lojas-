// atendimento-extra v3 — v3: perfil no Atendimento (papel/instâncias do DP) e restrição por instância.
// v2 — v2: envio de texto/campanhas/programadas também pelo Facebook MESSENGER (token da página do bot).
// v1: recursos do Atendimento acima do núcleo (atendimento-api):
// envio com provedor duplo (Evolution = não oficial | Cloud API = oficial) + nome do atendente + blacklist,
// templates oficiais, finalizar com motivo/protocolo/histórico, reabrir, agenda/carteira, blacklist, campos
// customizados, retornos, mensagens programadas e campanhas (worker "tick"), relatórios, potenciais, recados,
// notas médias, supervisores e cadastro de números oficiais. verify_jwt false — sessão do usuário (sess_…)
// ou x-bot-token (cron/tick).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BOT_TOKEN = "vjw_bot_4d8e1b7a92c63f05";
const WA_VERIFY = "vjw_wa_verify_5c1d9e3a";
const GRAPH = "https://graph.facebook.com/v21.0";
const IG_API = "https://graph.instagram.com/v21.0";
const BUCKET = "atendimento-midia";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const up = (s: any, n = 200) => String(s == null ? "" : s).trim().toUpperCase().slice(0, n);
const txt = (s: any, n = 3000) => String(s == null ? "" : s).slice(0, n);
const digits = (s: any) => String(s || "").replace(/\D/g, "");
const normTel = (s: any) => { const d = digits(s); return d.startsWith("55") ? d : "55" + d; };
class Erro extends Error { status: number; extra: any; constructor(m: string, status = 400, extra: any = {}) { super(m); this.status = status; this.extra = extra; } }

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
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
async function evolution(caminho: string, body: any) {
  const s = await segredos(); if (!s.EVOLUTION_URL || !s.EVOLUTION_API_KEY) throw new Erro("Evolution não configurada", 500);
  const res = await fetch(`${s.EVOLUTION_URL}${caminho}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: s.EVOLUTION_API_KEY }, body: JSON.stringify(body) });
  const r = await res.json().catch(() => null); if (!res.ok) throw new Error("Evolution " + res.status + ": " + JSON.stringify(r)); return r;
}
async function cloudCfg(instancia: string) {
  const { data } = await admin.from("atendimento_wa_cloud").select("*").eq("instancia", instancia).maybeSingle();
  if (!data) throw new Erro("número oficial não cadastrado: " + instancia, 404); return data;
}
async function cloudSend(cfg: any, to: string, payload: any): Promise<string | null> {
  const res = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + cfg.token }, body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...payload }) });
  const r = await res.json().catch(() => null);
  if (!res.ok) {
    const code = r && r.error && r.error.code;
    if (code === 131047 || code === 131051) throw new Erro("JANELA_24H", 409);
    throw new Error("WhatsApp oficial " + res.status + ": " + JSON.stringify(r && r.error || r));
  }
  return r && r.messages && r.messages[0] && r.messages[0].id || null;
}
const ehCloud = (c: any) => c.canal === "whatsapp" && String(c.instancia || "").startsWith("wa_");
async function janelaAberta(conv: any): Promise<boolean> {
  const { data } = await admin.from("atendimento_mensagens").select("enviada_em").eq("conversa_id", conv.id).eq("direcao", "in").order("enviada_em", { ascending: false }).limit(1).maybeSingle();
  return !!(data && Date.now() - new Date(data.enviada_em).getTime() < 23.5 * 3600 * 1000);
}
async function igToken(botId: string | null) {
  if (botId) { const { data } = await admin.from("atendimento_bots").select("segredos").eq("id", botId).maybeSingle(); const t = data && data.segredos && data.segredos.INSTAGRAM_TOKEN; if (t) return t; }
  const s = await segredos(); if (!s.INSTAGRAM_TOKEN) throw new Erro("INSTAGRAM_TOKEN não configurado", 500); return s.INSTAGRAM_TOKEN;
}
function textoTemplate(t: any): string { // pré-visualização (e texto para canais não oficiais)
  let corpo = String(t.corpo || ""); (t.variaveis || []).forEach((v: any, i: number) => { corpo = corpo.split(`{{${i + 1}}}`).join(String(v)); }); return corpo || `[modelo ${t.nome}]`;
}
function payloadTemplate(t: any) {
  const comp: any[] = []; const vars = (t.variaveis || []).map((v: any) => ({ type: "text", text: String(v).slice(0, 1000) }));
  if (vars.length) comp.push({ type: "body", parameters: vars });
  return { type: "template", template: { name: t.nome, language: { code: t.idioma || "pt_BR" }, components: comp } };
}

/* envia texto/template por qualquer provedor; devolve {externoId, texto, tipo} */
async function enviarPara(conv: any, o: { texto?: string; template?: any }): Promise<{ externoId: string | null; texto: string; usouTemplate: boolean }> {
  if (conv.canal === "whatsapp" && !ehCloud(conv)) {
    const texto = o.texto || (o.template ? textoTemplate(o.template) : ""); if (!texto) throw new Erro("texto vazio");
    const r = await evolution(`/message/sendText/${encodeURIComponent(conv.instancia)}`, { number: conv.contato_id, text: texto });
    return { externoId: r && r.key && r.key.id || null, texto, usouTemplate: false };
  }
  if (conv.canal === "instagram") {
    const texto = o.texto || (o.template ? textoTemplate(o.template) : ""); if (!texto) throw new Erro("texto vazio");
    if (texto.length > 1000) throw new Erro("o Instagram limita a 1000 caracteres por mensagem");
    const res = await fetch(`${IG_API}/me/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + await igToken(conv.bot_id) }, body: JSON.stringify({ recipient: { id: conv.contato_id }, message: { text: texto } }) });
    const r = await res.json().catch(() => null); if (!res.ok) throw new Error("Instagram " + res.status + ": " + JSON.stringify(r));
    return { externoId: r && r.message_id || null, texto, usouTemplate: false };
  }
  if (conv.canal === "messenger") {
    const texto = o.texto || (o.template ? textoTemplate(o.template) : ""); if (!texto) throw new Erro("texto vazio");
    if (texto.length > 2000) throw new Erro("o Messenger limita a 2000 caracteres por mensagem");
    let token: string | null = null;
    if (conv.bot_id) { const { data } = await admin.from("atendimento_bots").select("segredos").eq("id", conv.bot_id).maybeSingle(); token = data && data.segredos && data.segredos.FB_PAGE_TOKEN || null; }
    token = token || (await segredos()).FB_PAGE_TOKEN || null; if (!token) throw new Erro("FB_PAGE_TOKEN não configurado neste bot", 500);
    const mandar = async (extra: any) => { const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token!)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: conv.contato_id }, message: { text: texto }, ...extra }) }); return { res, r: await res.json().catch(() => null) }; };
    let { res, r } = await mandar({ messaging_type: "RESPONSE" });
    // fora da janela de 24h: etiqueta HUMAN_AGENT (até 7 dias; exige a permissão aprovada no app da Meta)
    if (!res.ok && r && r.error && (r.error.error_subcode === 2018278 || r.error.code === 10)) ({ res, r } = await mandar({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }));
    if (!res.ok) throw new Error("Messenger " + res.status + ": " + JSON.stringify(r && r.error || r));
    return { externoId: r && r.message_id || null, texto, usouTemplate: false };
  }
  if (ehCloud(conv)) {
    const cfg = await cloudCfg(conv.instancia); const aberta = await janelaAberta(conv);
    if (o.texto && aberta) { const id = await cloudSend(cfg, conv.contato_id, { type: "text", text: { body: o.texto, preview_url: false } }); return { externoId: id, texto: o.texto, usouTemplate: false }; }
    if (o.template) { const id = await cloudSend(cfg, conv.contato_id, payloadTemplate(o.template)); return { externoId: id, texto: textoTemplate(o.template), usouTemplate: true }; }
    throw new Erro("JANELA_24H", 409);
  }
  throw new Erro("canal não suportado");
}
async function gravarSaida(conv: any, r: { externoId: string | null; texto: string }, autorId: string | null, autorNome: string, tipo = "texto") {
  const agora = new Date().toISOString();
  await admin.from("atendimento_mensagens").upsert({ conversa_id: conv.id, canal: conv.canal, direcao: "out", tipo, texto: r.texto, externo_id: r.externoId || ("x_" + crypto.randomUUID()), autor_funcionario_id: autorId, autor_nome: autorNome, status: "enviada", enviada_em: agora }, { onConflict: "conversa_id,externo_id", ignoreDuplicates: false });
  const upd: any = { ultima_mensagem_em: agora, ultima_mensagem_texto: r.texto, ultima_direcao: "out", nao_lidas: 0, updated_at: agora };
  if (autorId) { if (!conv.atendente_id) { upd.atendente_id = autorId; upd.atendente_nome = autorNome; upd.status = "em_atendimento"; } else if (conv.status === "aguardando") upd.status = "em_atendimento"; }
  await admin.from("atendimento_conversas").update(upd).eq("id", conv.id);
}
async function chamarBot(corpo: any) {
  try { await fetch(`${SUPABASE_URL}/functions/v1/atendimento-bot`, { method: "POST", headers: { "Content-Type": "application/json", "x-bot-token": BOT_TOKEN }, body: JSON.stringify(corpo) }); } catch (e) { console.error("bot", e); }
}
async function nomesFuncionarios(config: any): Promise<Record<string, string>> {
  const out: Record<string, string> = {}; for (const f of (config.funcionarios || [])) out[f.id] = ((f.apelido || "").trim()) || f.nome || ""; return out;
}
async function fluxoDoBot(botId: string | null): Promise<any> {
  if (!botId) return {}; const { data } = await admin.from("atendimento_bots").select("config").eq("id", botId).maybeSingle();
  return (data && data.config && data.config.fluxo) || {};
}
async function estaNaBlacklist(canal: string, contato: string) {
  const { data } = await admin.from("atendimento_blacklist").select("id").eq("canal", canal).eq("contato", contato).maybeSingle(); return !!data;
}
async function acharOuCriarConversa(o: { instancia: string; canal?: string; contatoId: string; nome?: string | null; botId?: string | null; atendenteId?: string | null; atendenteNome?: string | null; status?: string }) {
  const { data: ja } = await admin.from("atendimento_conversas").select("*").eq("instancia", o.instancia).eq("contato_id", o.contatoId).maybeSingle();
  if (ja) return ja;
  let botId = o.botId || null;
  if (!botId) { const { data: bs } = await admin.from("atendimento_bots").select("id, canais"); const b = (bs || []).find((x: any) => (x.canais || []).some((c: any) => c.instancia === o.instancia)); botId = b ? b.id : null; }
  const { data: nova, error } = await admin.from("atendimento_conversas").insert({ canal: o.canal || "whatsapp", instancia: o.instancia, bot_id: botId, contato_id: o.contatoId, contato_nome: o.nome || null, atendente_id: o.atendenteId || null, atendente_nome: o.atendenteNome || null, status: o.status || (o.atendenteId ? "em_atendimento" : "aguardando") }).select("*").single();
  if (error) throw error; return nova;
}
function proxData(d: Date, rec: string): Date | null {
  const n = new Date(d.getTime());
  if (rec === "diaria") n.setDate(n.getDate() + 1); else if (rec === "semanal") n.setDate(n.getDate() + 7); else if (rec === "mensal") n.setMonth(n.getMonth() + 1); else return null;
  return n;
}

/* ---------- perfil no Atendimento (cópia da regra da atendimento-api v12) ---------- */
const PAPEIS = ["atendente", "administrativo", "gerente", "diretoria"];
// Loja → instância do Atendimento (as lojas do funcionário definem as instâncias quando não há escolha manual).
// Vilaça: Marechal, JV (João Beraldo), Jardim Norte, Ecommerce · Reforma: Reforma Joias · Oficina e Up Case: nenhuma.
const BOT_VILACA = "1ad6780b-07c9-468f-ae72-ec65b5e3b4fd", BOT_REFORMA = "2b59b2d8-afd0-40a3-8827-2cc74b9f55fd";
const LOJA_BOT: Record<string, string> = { loja_mc: BOT_VILACA, loja_jb: BOT_VILACA, loja_jn: BOT_VILACA, loja_ec: BOT_VILACA, loja_rj: BOT_REFORMA };
// db-gateway v51: a sessão pode ter uma loja extra autorizada pela gerência (users[].sessoes[].lojaExtra)
function lojasDaSessao(u: any, token: string): string[] {
  const base: string[] = Array.isArray(u?.lojas) ? u.lojas.map(String) : [];
  const s = (Array.isArray(u?.sessoes) ? u.sessoes : []).find((x: any) => x && x.token === token);
  const e = s && s.lojaExtra;
  return e && e.id && Number(e.ate) > Date.now() && !base.includes(String(e.id)) ? [...base, String(e.id)] : base;
}
function botsDasLojas(user: any): string[] | null {
  const lojas: string[] = Array.isArray(user && user.lojas) ? user.lojas.map(String) : [];
  if (!lojas.length) return null; // cadastro sem lojas: comportamento antigo (todas)
  return [...new Set(lojas.map((l) => LOJA_BOT[l]).filter(Boolean))];
}
function perfilAtd(user: any) {
  const p = (user && user.permissoes && user.permissoes.atendimento) || {};
  const explicito = PAPEIS.includes(p.papel);
  const papel: string = explicito ? p.papel : user.nivel === "diretoria" ? "diretoria" : user.nivel === "gerente" ? "gerente" : "atendente";
  const bots: string[] | null = papel === "diretoria" ? null : (Array.isArray(p.bots) ? p.bots.map(String) : botsDasLojas(user));
  return { papel, bots, supervisao: papel === "gerente" || papel === "diretoria", admin: papel === "diretoria" || (!explicito && user.nivel === "gerente") };
}
function podeReceber(config: any, fid: string, botId: string | null): boolean {
  const u = (config.users || []).find((x: any) => (x.funcionarioId || x.id) === fid); if (!u) return true;
  const pa = u.permissoes && u.permissoes.atendimento; if (pa && pa.ativo === false) return false;
  const pf = perfilAtd(u); return !pf.bots || (!!botId && pf.bots.includes(botId));
}

/* ---------- tick: programadas ---------- */
async function tick(limite = 20) {
  const agora = new Date().toISOString();
  const { data: due } = await admin.from("atendimento_programadas").select("id").eq("status", "pendente").lte("quando", agora).order("quando").limit(limite);
  let ok = 0, erro = 0;
  for (const d of due || []) {
    const { data: tomada } = await admin.from("atendimento_programadas").update({ status: "ativo" }).eq("id", d.id).eq("status", "pendente").select("*").maybeSingle();
    if (!tomada) continue; const p = tomada;
    try {
      if (await estaNaBlacklist(p.canal || "whatsapp", p.contato_id)) throw new Error("contato na blacklist");
      const conv = p.conversa_id ? (await admin.from("atendimento_conversas").select("*").eq("id", p.conversa_id).maybeSingle()).data : await acharOuCriarConversa({ instancia: p.instancia, canal: p.canal || "whatsapp", contatoId: p.contato_id, nome: p.contato_nome, botId: p.bot_id, atendenteId: p.responsavel_id, atendenteNome: p.responsavel_nome });
      if (!conv) throw new Error("conversa não encontrada");
      const r = await enviarPara(conv, { texto: p.texto || undefined, template: p.template || undefined });
      await gravarSaida(conv, r, p.responsavel_id || null, p.responsavel_nome || "Programada");
      await admin.from("atendimento_programadas").update({ status: "finalizado", enviado_em: new Date().toISOString(), conversa_id: conv.id, erro: null }).eq("id", p.id); ok++;
    } catch (e) {
      const m = (e as any).message === "JANELA_24H" ? "fora da janela de 24h: use um modelo aprovado (template)" : String((e as any).message || e).slice(0, 300);
      await admin.from("atendimento_programadas").update({ status: "erro", erro: m }).eq("id", p.id); erro++;
    }
  }
  return { enviadas: ok, erros: erro };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    if (b.op === "tick" && req.headers.get("x-bot-token") === BOT_TOKEN) return json({ ok: true, ...(await tick()) });
    const { data: cfgRow } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config = (cfgRow && cfgRow.payload) || {};
    const user = (config.users || []).find((u: any) => sessaoValida(u, b.senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    const pAt = user.permissoes && user.permissoes.atendimento; if (pAt && pAt.ativo === false) return json({ error: "sem permissão para o Atendimento" }, 403);
    // v3: perfil no Atendimento (DP › Perfis de Acesso: permissoes.atendimento.papel/bots) — mesma regra da atendimento-api
    const pf = perfilAtd({ ...user, lojas: lojasDaSessao(user, b.senha) }); // v51: inclui a loja extra da sessão
    const gestao = pf.supervisao; const podeAdmin = pf.admin; const adm = pf.papel === "administrativo";
    const okBot = (botId: string | null) => !pf.bots || (!!botId && pf.bots.includes(botId));
    const filtrarBots = (q: any, col = "bot_id") => pf.bots ? q.in(col, pf.bots.length ? pf.bots : ["00000000-0000-0000-0000-000000000000"]) : q;
    const meuId = user.funcionarioId || user.id; const nomes = await nomesFuncionarios(config);
    const meuNome = nomes[meuId] || user.nome || "";
    const { data: meuReg } = await admin.from("atendimento_atendentes").select("*").eq("funcionario_id", meuId).maybeSingle();
    const P = (meuReg && meuReg.permissoes) || {};
    const supDeps: string[] = gestao ? [] : (Array.isArray(P.supervisor) ? P.supervisor : []);
    const perm = (k: string) => gestao || !!P[k];
    const eSup = (dep: any) => gestao || (!!dep && supDeps.includes(dep));
    const sup = gestao || supDeps.length > 0;
    const podeVer = (c: any) => okBot(c.bot_id) && (gestao || c.atendente_id === meuId || (!c.atendente_id && !adm) || eSup(c.departamento_id));
    const conversa = async (id: string) => { const { data } = await admin.from("atendimento_conversas").select("*").eq("id", id).maybeSingle(); if (!data) throw new Erro("conversa não encontrada", 404); return data; };
    const exigeGestao = () => { if (!podeAdmin) throw new Erro("só a diretoria configura o Atendimento", 403); };
    const op = b.op;

    if (op === "tick") return json({ ok: true, ...(await tick()) });

    /* ===== envio ===== */
    if (op === "enviarTexto") {
      const c = await conversa(b.conversaId); if (!podeVer(c)) throw new Erro("sem acesso a esta conversa", 403);
      const texto = txt(b.texto).trim(); if (!texto) throw new Erro("texto vazio");
      if (await estaNaBlacklist(c.canal, c.contato_id)) throw new Erro("este contato está na blacklist");
      const fl = await fluxoDoBot(c.bot_id);
      const envio = fl.enviar_nome_atendente && !b.semNome ? `*${meuNome}:*\n${texto}` : texto;
      const r = await enviarPara(c, { texto: envio, template: b.template });
      await gravarSaida(c, { externoId: r.externoId, texto: r.usouTemplate ? r.texto : texto }, meuId, meuNome);
      return json({ ok: true, externoId: r.externoId, usouTemplate: r.usouTemplate });
    }
    if (op === "enviarTemplate") {
      const c = await conversa(b.conversaId); if (!podeVer(c)) throw new Erro("sem acesso a esta conversa", 403);
      if (!ehCloud(c)) throw new Erro("modelos aprovados só existem na API oficial");
      if (await estaNaBlacklist(c.canal, c.contato_id)) throw new Erro("este contato está na blacklist");
      const cfg = await cloudCfg(c.instancia); const t = b.template || {};
      const id = await cloudSend(cfg, c.contato_id, payloadTemplate(t));
      await gravarSaida(c, { externoId: id, texto: textoTemplate(t) }, meuId, meuNome);
      return json({ ok: true });
    }
    if (op === "enviarMidiaCloud") {
      const c = await conversa(b.conversaId); if (!podeVer(c)) throw new Erro("sem acesso", 403);
      if (!ehCloud(c)) throw new Erro("use o envio padrão para este canal");
      if (!(await janelaAberta(c))) throw new Erro("JANELA_24H", 409);
      const { base64, mimetype, nome, legenda } = b; if (!base64 || !mimetype) throw new Erro("arquivo obrigatório");
      const tipoWa = mimetype.startsWith("image/") ? "image" : mimetype.startsWith("video/") ? "video" : mimetype.startsWith("audio/") ? "audio" : "document";
      const tipo = tipoWa === "image" ? "imagem" : tipoWa === "video" ? "video" : tipoWa === "audio" ? "audio" : "documento";
      const bin = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0)); const ext = (mimetype.split("/")[1] || "bin").split(";")[0];
      const path = `${c.instancia}/${c.contato_id}/out_${Date.now()}.${ext}`;
      await admin.storage.from(BUCKET).upload(path, bin, { contentType: mimetype, upsert: true });
      const { data: ass } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 30);
      const cfg = await cloudCfg(c.instancia);
      const obj: any = { link: ass!.signedUrl }; if (legenda && tipoWa !== "audio") obj.caption = String(legenda).slice(0, 1000); if (tipoWa === "document") obj.filename = nome || ("arquivo." + ext);
      const id = await cloudSend(cfg, c.contato_id, { type: tipoWa, [tipoWa]: obj });
      const agora = new Date().toISOString();
      await admin.from("atendimento_mensagens").upsert({ conversa_id: c.id, canal: "whatsapp", direcao: "out", tipo, texto: legenda || null, midia_path: path, midia_mime: mimetype, midia_nome: nome || null, externo_id: id || ("x_" + crypto.randomUUID()), autor_funcionario_id: meuId, autor_nome: meuNome, status: "enviada", enviada_em: agora }, { onConflict: "conversa_id,externo_id" });
      const resumo = tipo === "imagem" ? "📷 Foto" : tipo === "audio" ? "🎤 Áudio" : tipo === "video" ? "🎥 Vídeo" : "📎 " + (nome || "Documento");
      const upd: any = { ultima_mensagem_em: agora, ultima_mensagem_texto: resumo, ultima_direcao: "out", nao_lidas: 0, updated_at: agora };
      if (!c.atendente_id) { upd.atendente_id = meuId; upd.atendente_nome = meuNome; upd.status = "em_atendimento"; }
      await admin.from("atendimento_conversas").update(upd).eq("id", c.id);
      return json({ ok: true });
    }
    if (op === "templatesListar") {
      const cfg = await cloudCfg(String(b.instancia || "")); if (!cfg.waba_id) throw new Erro("informe o WABA ID do número oficial");
      const res = await fetch(`${GRAPH}/${cfg.waba_id}/message_templates?limit=100&fields=name,language,status,category,components`, { headers: { Authorization: "Bearer " + cfg.token } });
      const r = await res.json().catch(() => null); if (!res.ok) throw new Error("Meta " + res.status + ": " + JSON.stringify(r && r.error || r));
      const lista = (r.data || []).filter((t: any) => t.status === "APPROVED").map((t: any) => {
        const body = (t.components || []).find((c: any) => c.type === "BODY"); const corpo = body ? body.text : "";
        const n = (corpo.match(/\{\{\d+\}\}/g) || []).length;
        return { nome: t.name, idioma: t.language, categoria: t.category, corpo, nvars: n, botoes: ((t.components || []).find((c: any) => c.type === "BUTTONS") || {}).buttons || [] };
      });
      return json({ ok: true, templates: lista });
    }
    if (op === "novaAtiva") {
      if (!adm && !perm("criarAtivo")) throw new Erro("sem permissão para criar atendimento ativo", 403);
      if (!okBot(b.botId)) throw new Erro("você não atende esta instância", 403);
      const numero = normTel(b.numero); if (numero.length < 12) throw new Erro("número inválido");
      const { data: bot } = await admin.from("atendimento_bots").select("id, canais").eq("id", b.botId).maybeSingle(); if (!bot) throw new Erro("escolha o bot");
      const cans = (bot.canais || []).filter((x: any) => x.tipo === "whatsapp");
      const instancia = b.instancia || (cans[0] && cans[0].instancia); if (!instancia || !cans.some((x: any) => x.instancia === instancia)) throw new Erro("o bot não tem esse número de WhatsApp");
      if (await estaNaBlacklist("whatsapp", numero)) throw new Erro("este contato está na blacklist");
      const conv = await acharOuCriarConversa({ instancia, contatoId: numero, nome: b.nome ? up(b.nome) : null, botId: bot.id, atendenteId: meuId, atendenteNome: meuNome });
      if (conv.atendente_id !== meuId && !gestao) {
        if (conv.atendente_id && conv.status !== "finalizado") throw new Erro("este contato já está em atendimento com " + (conv.atendente_nome || "outra pessoa"), 409);
        if (conv.status === "finalizado") await admin.rpc("atendimento_renovar", { p_id: conv.id });
        await admin.from("atendimento_conversas").update({ atendente_id: meuId, atendente_nome: meuNome, status: "em_atendimento", updated_at: new Date().toISOString() }).eq("id", conv.id);
        conv.atendente_id = meuId; conv.atendente_nome = meuNome; conv.status = "em_atendimento";
      }
      if (b.template || b.texto) { const r = await enviarPara(conv, { texto: b.texto ? txt(b.texto) : undefined, template: b.template }); await gravarSaida(conv, r, meuId, meuNome); }
      else if (ehCloud(conv)) throw new Erro("na API oficial o primeiro contato exige um modelo aprovado");
      return json({ ok: true, conversaId: conv.id });
    }

    /* ===== finalizar / reabrir ===== */
    if (op === "finalizar") {
      const c = await conversa(b.conversaId); if (!podeVer(c)) throw new Erro("sem acesso a esta conversa", 403);
      const fl = await fluxoDoBot(c.bot_id); const motivo = up(b.motivo, 120);
      if (fl.motivo_obrigatorio && !motivo) throw new Erro("informe o motivo da finalização");
      if (fl.motivos && fl.motivos.length && motivo && !fl.motivos.map((m: string) => up(m)).includes(motivo)) throw new Erro("motivo inválido");
      const agora = new Date().toISOString();
      await admin.from("atendimento_conversas").update({ status: "finalizado", nao_lidas: 0, motivo_finalizacao: motivo || null, encerrado_em: agora, updated_at: agora }).eq("id", c.id);
      await admin.from("atendimento_mensagens").insert({ conversa_id: c.id, canal: c.canal, direcao: "out", tipo: "sistema", texto: `${meuNome} finalizou o atendimento${motivo ? " — " + motivo : ""}`, autor_nome: meuNome, status: "enviada" });
      await admin.rpc("atendimento_arquivar", { p_id: c.id });
      await chamarBot({ acao: "finalizou", conversa_id: c.id });
      return json({ ok: true });
    }
    if (op === "reabrir") {
      if (!perm("reabrir")) throw new Erro("sem permissão para reabrir atendimento", 403);
      const c = await conversa(b.conversaId); if (!podeVer(c)) throw new Erro("sem acesso", 403);
      if (c.status === "finalizado") await admin.rpc("atendimento_renovar", { p_id: c.id });
      await admin.from("atendimento_conversas").update({ status: "em_atendimento", atendente_id: meuId, atendente_nome: meuNome, nao_lidas: 0, updated_at: new Date().toISOString() }).eq("id", c.id);
      await admin.from("atendimento_mensagens").insert({ conversa_id: c.id, canal: c.canal, direcao: "out", tipo: "sistema", texto: `${meuNome} reabriu o atendimento`, autor_nome: meuNome, status: "enviada" });
      return json({ ok: true });
    }

    /* ===== agenda / carteira ===== */
    if (op === "contatosLista") {
      if (!perm("verAgenda")) throw new Erro("sem permissão para a agenda", 403);
      let q = admin.from("atendimento_contatos").select("*").order("nome").limit(Math.min(Number(b.limite) || 200, 5000));
      if (b.carteira) q = q.eq("carteira", true); if (b.atendenteId) q = q.eq("atendente_id", b.atendenteId); if (b.departamentoId) q = q.eq("departamento_id", b.departamentoId);
      if (b.busca) { const s = String(b.busca).replace(/[%,]/g, " ").trim(); if (s) q = q.or(`nome.ilike.%${s}%,telefone.ilike.%${s}%`); }
      const { data, error } = await q; if (error) throw error; return json({ ok: true, data: data || [] });
    }
    if (op === "contatoSalvar") {
      if (!perm("verAgenda")) throw new Erro("sem permissão para a agenda", 403);
      const canal = b.canal === "instagram" ? "instagram" : "whatsapp"; const tel = canal === "whatsapp" ? normTel(b.telefone) : txt(b.telefone, 60).trim();
      if (!tel || (canal === "whatsapp" && tel.length < 12)) throw new Erro("telefone inválido");
      if (b.carteira && !b.atendente_id) throw new Erro("contato de carteira precisa de um atendente");
      if (b.carteira && !gestao && !sup) throw new Erro("só diretoria, gerente ou supervisor definem carteira", 403);
      const reg: any = { canal, telefone: tel, nome: up(b.nome, 120) || null, bot_id: b.bot_id || null, departamento_id: b.departamento_id || null, atendente_id: b.atendente_id || null, atendente_nome: b.atendente_id ? (nomes[b.atendente_id] || null) : null, observacao: up(b.observacao, 500) || null, carteira: !!b.carteira, campos: b.campos && typeof b.campos === "object" ? b.campos : {}, cliente_id: b.cliente_id || null, updated_at: new Date().toISOString() };
      if (b.id) { const { error } = await admin.from("atendimento_contatos").update(reg).eq("id", b.id); if (error) throw error; }
      else { const { error } = await admin.from("atendimento_contatos").upsert({ ...reg, criado_por: meuId }, { onConflict: "canal,telefone" }); if (error) throw error; }
      return json({ ok: true });
    }
    if (op === "contatoExcluir") { if (!perm("verAgenda")) throw new Erro("sem permissão", 403); await admin.from("atendimento_contatos").delete().eq("id", b.id); return json({ ok: true }); }

    /* ===== blacklist ===== */
    if (op === "blacklistIds") { const { data } = await admin.from("atendimento_blacklist").select("canal, contato"); return json({ ok: true, ids: (data || []).map((x: any) => x.canal + ":" + x.contato) }); }
    if (op === "blacklistLista") { if (!sup) throw new Erro("só diretoria, gerente ou supervisor", 403); const { data } = await admin.from("atendimento_blacklist").select("*").order("created_at", { ascending: false }).limit(1000); return json({ ok: true, data: data || [] }); }
    if (op === "blacklistSalvar") {
      if (!sup) throw new Erro("só diretoria, gerente ou supervisor", 403);
      const canal = b.canal === "instagram" ? "instagram" : "whatsapp"; const contato = canal === "whatsapp" ? normTel(b.contato) : txt(b.contato, 60).trim(); if (!contato) throw new Erro("contato inválido");
      const { error } = await admin.from("atendimento_blacklist").upsert({ canal, contato, nome: up(b.nome, 120) || null, atendente_id: meuId, atendente_nome: meuNome, observacao: up(b.observacao, 300) || null }, { onConflict: "canal,contato" }); if (error) throw error;
      await admin.from("atendimento_programadas").update({ status: "cancelado" }).eq("contato_id", contato).eq("status", "pendente");
      return json({ ok: true });
    }
    if (op === "blacklistExcluir") { if (!sup) throw new Erro("só diretoria, gerente ou supervisor", 403); await admin.from("atendimento_blacklist").delete().eq("id", b.id); return json({ ok: true }); }

    /* ===== campos customizados ===== */
    if (op === "camposLista") { const { data } = await admin.from("atendimento_campos").select("*").order("entidade").order("ordem").order("nome"); return json({ ok: true, data: data || [] }); }
    if (op === "campoSalvar") {
      exigeGestao(); const nome = up(b.nome, 60); if (!nome) throw new Erro("nome obrigatório");
      const tipo = ["texto", "numero", "data", "lista"].includes(b.tipo) ? b.tipo : "texto";
      const reg: any = { entidade: b.entidade === "atendimento" ? "atendimento" : "contato", nome, nome_integracao: txt(b.nome_integracao, 60).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_") || null, tipo, opcoes: tipo === "lista" ? (Array.isArray(b.opcoes) ? b.opcoes : String(b.opcoes || "").split(",")).map((o: any) => up(o, 60)).filter(Boolean).slice(0, 50) : null, ordem: Number(b.ordem) || 0 };
      if (b.id) await admin.from("atendimento_campos").update(reg).eq("id", b.id); else await admin.from("atendimento_campos").insert(reg);
      return json({ ok: true });
    }
    if (op === "campoExcluir") { exigeGestao(); await admin.from("atendimento_campos").delete().eq("id", b.id); return json({ ok: true }); }
    if (op === "camposPadrao") {
      exigeGestao(); const { data: ex } = await admin.from("atendimento_campos").select("nome, entidade"); const tem = new Set((ex || []).map((x: any) => x.entidade + ":" + x.nome));
      const base: [string, string][] = [["BAIRRO", "texto"], ["CEP", "texto"], ["CIDADE", "texto"], ["CPF", "texto"], ["ESTADO", "texto"], ["NOME COMPLETO", "texto"], ["NÚMERO DO DEDO", "numero"], ["REDE SOCIAL", "texto"], ["RUA", "texto"], ["TIPO DE CLIENTE (0 A 10)", "numero"], ["VENDEDORA", "texto"]];
      const novos = base.filter(([n]) => !tem.has("contato:" + n)).map(([nome, tipo], i) => ({ entidade: "contato", nome, tipo, ordem: i, nome_integracao: nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") }));
      if (novos.length) await admin.from("atendimento_campos").insert(novos); return json({ ok: true, criados: novos.length });
    }
    if (op === "camposValores") {
      if (b.conversaId) { const c = await conversa(b.conversaId); if (!podeVer(c)) throw new Erro("sem acesso", 403); await admin.from("atendimento_conversas").update({ campos: b.valores || {} }).eq("id", c.id); }
      else if (b.contatoId) { if (!perm("verAgenda")) throw new Erro("sem permissão", 403); await admin.from("atendimento_contatos").update({ campos: b.valores || {}, updated_at: new Date().toISOString() }).eq("id", b.contatoId); }
      return json({ ok: true });
    }

    /* ===== retornos ===== */
    if (op === "retornoSalvar") {
      const c = await conversa(b.conversaId); if (!podeVer(c)) throw new Erro("sem acesso", 403);
      const quando = new Date(b.quando); if (isNaN(quando.getTime())) throw new Erro("data/hora inválida");
      const rec = ["nenhuma", "diaria", "semanal", "mensal"].includes(b.recorrencia) ? b.recorrencia : "nenhuma";
      await admin.from("atendimento_retornos").insert({ conversa_id: c.id, bot_id: c.bot_id, canal: c.canal, instancia: c.instancia, contato_id: c.contato_id, contato_nome: c.contato_nome, quando: quando.toISOString(), recorrencia: rec, observacao: up(b.observacao, 300) || null, atendente_id: c.atendente_id || meuId, atendente_nome: c.atendente_nome || meuNome });
      return json({ ok: true });
    }
    if (op === "retornosLista") {
      let q = admin.from("atendimento_retornos").select("*").order("quando").limit(500);
      if (b.status) q = q.eq("status", b.status); if (b.conversaId) q = q.eq("conversa_id", b.conversaId);
      if (b.de) q = q.gte("quando", b.de); if (b.ate) q = q.lte("quando", b.ate);
      if (!gestao && !supDeps.length) q = q.eq("atendente_id", meuId); q = filtrarBots(q);
      const { data, error } = await q; if (error) throw error; return json({ ok: true, data: data || [] });
    }
    if (op === "retornosResumo") {
      const { data } = await admin.from("atendimento_retornos").select("id, quando, conversa_id, contato_nome, contato_id, observacao, atendente_id").eq("status", "pendente").lte("quando", new Date().toISOString()).order("quando").limit(100);
      const meus = (data || []).filter((r: any) => gestao ? true : r.atendente_id === meuId);
      return json({ ok: true, devidos: meus.length, itens: meus.slice(0, 10) });
    }
    if (op === "retornoConcluir" || op === "retornoCancelar") {
      const { data: r } = await admin.from("atendimento_retornos").select("*").eq("id", b.id).maybeSingle(); if (!r) throw new Erro("retorno não encontrado", 404);
      if (!gestao && r.atendente_id !== meuId && !supDeps.length) throw new Erro("sem acesso", 403);
      if (op === "retornoCancelar") await admin.from("atendimento_retornos").update({ status: "cancelado" }).eq("id", r.id);
      else { const prox = proxData(new Date(r.quando), r.recorrencia); let n = prox; while (n && n.getTime() < Date.now()) n = proxData(n, r.recorrencia);
        if (n) await admin.from("atendimento_retornos").update({ quando: n.toISOString(), ultimo_em: new Date().toISOString() }).eq("id", r.id); else await admin.from("atendimento_retornos").update({ status: "feito", ultimo_em: new Date().toISOString() }).eq("id", r.id); }
      return json({ ok: true });
    }

    /* ===== programadas / campanhas ===== */
    if (op === "programadaSalvar") {
      const quando = new Date(b.quando); if (isNaN(quando.getTime()) || quando.getTime() < Date.now() - 60000) throw new Erro("escolha uma data/hora futura");
      if (!b.texto && !b.template) throw new Erro("escreva a mensagem");
      let reg: any = { quando: quando.toISOString(), texto: b.texto ? txt(b.texto) : null, template: b.template || null, responsavel_id: meuId, responsavel_nome: meuNome };
      if (b.conversaId) { const c = await conversa(b.conversaId); if (!podeVer(c)) throw new Erro("sem acesso", 403); reg = { ...reg, conversa_id: c.id, bot_id: c.bot_id, canal: c.canal, instancia: c.instancia, contato_id: c.contato_id, contato_nome: c.contato_nome }; }
      else { if (!adm && !perm("criarAtivo")) throw new Erro("sem permissão para criar atendimento ativo", 403); if (!okBot(b.botId)) throw new Erro("você não atende esta instância", 403);
        const { data: bot } = await admin.from("atendimento_bots").select("id, canais").eq("id", b.botId).maybeSingle(); const wa = bot && (bot.canais || []).find((x: any) => x.tipo === "whatsapp" && (!b.instancia || x.instancia === b.instancia)); if (!wa) throw new Erro("escolha o bot/número");
        reg = { ...reg, bot_id: bot!.id, canal: "whatsapp", instancia: wa.instancia, contato_id: normTel(b.numero), contato_nome: up(b.nome, 120) || null }; }
      if (await estaNaBlacklist(reg.canal, reg.contato_id)) throw new Erro("este contato está na blacklist");
      await admin.from("atendimento_programadas").insert(reg); return json({ ok: true });
    }
    if (op === "programadasLista") {
      let q = admin.from("atendimento_programadas").select("*").order("quando", { ascending: false }).limit(500);
      if (b.status) q = q.eq("status", b.status); if (b.de) q = q.gte("quando", b.de); if (b.ate) q = q.lte("quando", b.ate); if (b.campanha) q = q.eq("campanha", b.campanha);
      if (!gestao) q = q.eq("responsavel_id", meuId); else q = filtrarBots(q);
      const { data, error } = await q; if (error) throw error; return json({ ok: true, data: data || [] });
    }
    if (op === "programadaCancelar") {
      const { data: p } = await admin.from("atendimento_programadas").select("*").eq("id", b.id).maybeSingle(); if (!p) throw new Erro("não encontrada", 404);
      if (!gestao && p.responsavel_id !== meuId) throw new Erro("sem acesso", 403);
      await admin.from("atendimento_programadas").update({ status: "cancelado" }).eq("id", p.id).in("status", ["pendente", "erro"]); return json({ ok: true });
    }
    if (op === "campanhaCriar") {
      if (!gestao) throw new Erro("só diretoria/gerente", 403); if (!okBot(b.botId)) throw new Erro("você não atende esta instância", 403); const nome = up(b.nome, 80); if (!nome) throw new Erro("dê um nome à campanha"); if (!b.texto && !b.template) throw new Erro("escreva a mensagem");
      const inicio = new Date(b.inicio || Date.now()); const inter = Math.min(3600, Math.max(5, Number(b.intervaloSeg) || 30));
      const { data: bot } = await admin.from("atendimento_bots").select("id, canais").eq("id", b.botId).maybeSingle(); const wa = bot && (bot.canais || []).find((x: any) => x.tipo === "whatsapp" && (!b.instancia || x.instancia === b.instancia)); if (!wa) throw new Erro("escolha o bot/número");
      if (!ehCloud({ canal: "whatsapp", instancia: wa.instancia }) && !b.texto) throw new Erro("no WhatsApp não oficial a campanha precisa de texto");
      let alvos: { id: string; nome: string | null }[] = [];
      if (b.origem === "agenda") { let q = admin.from("atendimento_contatos").select("telefone, nome").eq("canal", "whatsapp").limit(3000); if (b.departamentoId) q = q.eq("departamento_id", b.departamentoId); const { data } = await q; alvos = (data || []).map((x: any) => ({ id: x.telefone, nome: x.nome })); }
      else { let q = admin.from("atendimento_conversas").select("contato_id, contato_nome, tags").eq("canal", "whatsapp").eq("bot_id", bot!.id).limit(3000); if (b.tag) q = q.contains("tags", JSON.stringify([b.tag])); const { data } = await q; alvos = (data || []).map((x: any) => ({ id: x.contato_id, nome: x.contato_nome })); }
      const { data: bl } = await admin.from("atendimento_blacklist").select("contato").eq("canal", "whatsapp"); const fora = new Set((bl || []).map((x: any) => x.contato));
      const vistos = new Set<string>(); const lote: any[] = []; let i = 0;
      for (const a of alvos) { if (!a.id || fora.has(a.id) || vistos.has(a.id)) continue; vistos.add(a.id);
        lote.push({ campanha: nome, bot_id: bot!.id, canal: "whatsapp", instancia: wa.instancia, contato_id: a.id, contato_nome: a.nome, texto: b.texto ? txt(b.texto) : null, template: b.template || null, quando: new Date(inicio.getTime() + i * inter * 1000).toISOString(), responsavel_id: meuId, responsavel_nome: meuNome }); i++; if (i >= 2000) break; }
      for (let k = 0; k < lote.length; k += 200) await admin.from("atendimento_programadas").insert(lote.slice(k, k + 200));
      return json({ ok: true, total: lote.length, ignorados: alvos.length - lote.length });
    }

    /* ===== relatórios / potenciais / recados / notas ===== */
    if (op === "relAtendimentos") {
      const lim = Math.min(Number(b.limite) || 300, 5000); const mapDep = new Map(((await admin.from("atendimento_departamentos").select("id, nome")).data || []).map((d: any) => [d.id, d.nome]));
      const mapBot = new Map(((await admin.from("atendimento_bots").select("id, nome")).data || []).map((d: any) => [d.id, d.nome]));
      const filtrar = (q: any, campos: { ini: string; fim: string; atend: string; dep: string; motivo: string }) => {
        if (b.canal) q = q.eq("canal", b.canal); if (b.botId) q = q.eq("bot_id", b.botId); if (b.protocolo) q = q.eq("protocolo", Number(b.protocolo) || -1);
        if (b.numero) q = q.ilike("contato_id", `%${digits(b.numero)}%`); if (b.nome) q = q.ilike("contato_nome", `%${String(b.nome).replace(/[%,]/g, " ")}%`);
        if (b.atendenteId) q = q.eq(campos.atend, b.atendenteId); if (b.departamentoId) q = q.eq(campos.dep, b.departamentoId); if (b.motivo) q = q.eq(campos.motivo, up(b.motivo));
        if (b.tag) q = q.contains("tags", JSON.stringify([b.tag])); q = filtrarBots(q);
        if (b.campoId && b.campoValor) q = q.contains("campos", JSON.stringify({ [b.campoId]: b.campoValor }));
        const col = b.dataCampo === "finalizacao" ? campos.fim : campos.ini;
        if (b.de) q = q.gte(col, b.de); if (b.ate) q = q.lte(col, b.ate);
        if (!gestao) { if (supDeps.length) q = q.or(`${campos.atend}.eq.${meuId},${campos.dep}.in.(${supDeps.join(",")})`); else q = q.eq(campos.atend, meuId); }
        return q;
      };
      const out: any[] = [];
      if (b.status !== "aberto") {
        const { data } = await filtrar(admin.from("atendimento_historico").select("*").order("finalizado_em", { ascending: false }).limit(lim), { ini: "aberto_em", fim: "finalizado_em", atend: "atendente_id", dep: "departamento_id", motivo: "motivo" });
        for (const h of data || []) out.push({ conversa_id: h.conversa_id, protocolo: h.protocolo, canal: h.canal, bot: mapBot.get(h.bot_id) || "", contato_id: h.contato_id, contato_nome: h.contato_nome, atendente: h.atendente_nome, departamento: mapDep.get(h.departamento_id) || h.setor || "", motivo: h.motivo, nota: h.avaliacao, tags: h.tags, campos: h.campos, aberto_em: h.aberto_em, finalizado_em: h.finalizado_em, status: "finalizado", msgs_in: h.msgs_in, msgs_out: h.msgs_out });
      }
      if (b.status !== "finalizado") {
        const { data } = await filtrar(admin.from("atendimento_conversas").select("*").neq("status", "finalizado").order("ultima_mensagem_em", { ascending: false }).limit(lim), { ini: "aberto_em", fim: "ultima_mensagem_em", atend: "atendente_id", dep: "departamento_id", motivo: "motivo_finalizacao" });
        for (const c of data || []) out.push({ conversa_id: c.id, protocolo: c.protocolo, canal: c.canal, bot: mapBot.get(c.bot_id) || "", contato_id: c.contato_id, contato_nome: c.contato_nome, atendente: c.atendente_nome, departamento: mapDep.get(c.departamento_id) || c.setor || "", motivo: c.motivo_finalizacao, nota: c.avaliacao, tags: c.tags, campos: c.campos, aberto_em: c.aberto_em, finalizado_em: null, status: c.status === "aguardando" ? "pendente" : "em atendimento", msgs_in: null, msgs_out: null });
      }
      out.sort((x, y) => String(y.finalizado_em || y.aberto_em).localeCompare(String(x.finalizado_em || x.aberto_em)));
      return json({ ok: true, data: out.slice(0, lim) });
    }
    if (op === "relContatos") {
      if (!gestao && !sup && !perm("verAgenda")) throw new Erro("sem permissão", 403);
      const { data: cv } = await filtrarBots(admin.from("atendimento_conversas").select("contato_id, contato_nome, canal, campos, tags, protocolo, atendente_nome, ultima_mensagem_em").order("ultima_mensagem_em", { ascending: false }).limit(5000));
      const { data: ag } = await admin.from("atendimento_contatos").select("*").limit(5000); const mapAg = new Map((ag || []).map((a: any) => [a.canal + ":" + a.telefone, a]));
      const { data: hs } = await admin.from("atendimento_historico").select("contato_id").limit(20000); const qtd: Record<string, number> = {}; for (const h of hs || []) qtd[h.contato_id] = (qtd[h.contato_id] || 0) + 1;
      const vistos = new Set<string>(); const out: any[] = [];
      for (const c of cv || []) { const k = c.canal + ":" + c.contato_id; vistos.add(k); const a: any = mapAg.get(k); out.push({ canal: c.canal, contato_id: c.contato_id, nome: (a && a.nome) || c.contato_nome, atendente: (a && a.atendente_nome) || c.atendente_nome, carteira: !!(a && a.carteira), observacao: a ? a.observacao : null, campos: { ...(c.campos || {}), ...((a && a.campos) || {}) }, atendimentos: (qtd[c.contato_id] || 0), ultima: c.ultima_mensagem_em }); }
      for (const a of ag || []) if (!vistos.has(a.canal + ":" + a.telefone)) out.push({ canal: a.canal, contato_id: a.telefone, nome: a.nome, atendente: a.atendente_nome, carteira: a.carteira, observacao: a.observacao, campos: a.campos || {}, atendimentos: 0, ultima: null });
      return json({ ok: true, data: out });
    }
    if (op === "notasMedias") {
      const ini = new Date(Date.now() - (Number(b.dias) || 90) * 86400000).toISOString();
      const { data } = await admin.from("atendimento_historico").select("atendente_nome, departamento_id, avaliacao").not("avaliacao", "is", null).gte("finalizado_em", ini).limit(20000);
      const at: Record<string, { s: number; n: number }> = {}, dp: Record<string, { s: number; n: number }> = {};
      for (const h of data || []) { if (h.atendente_nome) { const o = at[h.atendente_nome] || (at[h.atendente_nome] = { s: 0, n: 0 }); o.s += h.avaliacao; o.n++; } if (h.departamento_id) { const o = dp[h.departamento_id] || (dp[h.departamento_id] = { s: 0, n: 0 }); o.s += h.avaliacao; o.n++; } }
      const f = (m: any) => Object.fromEntries(Object.entries(m).map(([k, v]: any) => [k, { media: Math.round(v.s / v.n * 10) / 10, n: v.n }]));
      return json({ ok: true, atendentes: f(at), departamentos: f(dp) });
    }
    if (op === "potenciais") {
      const { data: bots } = await filtrarBots(admin.from("atendimento_bots").select("id, nome, config").eq("ativo", true), "id");
      const out: any[] = [];
      for (const bt of bots || []) {
        const pt = bt.config && bt.config.fluxo && bt.config.fluxo.potenciais; const modo = (pt && pt.modo) || "nunca"; if (modo === "nunca") continue;
        const lim = new Date(Date.now() - (Number(pt.minutos) || 10) * 60000).toISOString();
        const { data } = await admin.from("atendimento_conversas").select("*").eq("bot_id", bt.id).eq("status", "aguardando").is("atendente_id", null).eq("potencial_removido", false).lte("ultima_mensagem_em", lim).order("ultima_mensagem_em", { ascending: false }).limit(300);
        const cand = (data || []).filter((c: any) => c.bot_estado && c.bot_estado.etapa === "menu");
        let ids = new Set<string>(); if (modo === "novos" && cand.length) { const { data: h } = await admin.from("atendimento_historico").select("conversa_id").in("conversa_id", cand.map((c: any) => c.id)); ids = new Set((h || []).map((x: any) => x.conversa_id)); }
        for (const c of cand) { if (modo === "novos" && ids.has(c.id)) continue; out.push({ id: c.id, canal: c.canal, bot: bt.nome, contato_nome: c.contato_nome, contato_id: c.contato_id, data: c.ultima_mensagem_em, protocolo: c.protocolo }); }
      }
      return json({ ok: true, data: out });
    }
    if (op === "potencialCriar") {
      const c = await conversa(b.conversaId); const dep = b.departamentoId || null;
      if (!okBot(c.bot_id)) throw new Erro("você não atende esta instância", 403);
      if (adm) throw new Erro("o perfil Administrativo só recebe conversas por transferência", 403);
      if (!gestao && !(meuReg && (!dep || (meuReg.departamentos || []).includes(dep)))) throw new Erro("sem acesso", 403);
      await admin.from("atendimento_conversas").update({ status: "em_atendimento", atendente_id: meuId, atendente_nome: meuNome, departamento_id: dep || c.departamento_id, updated_at: new Date().toISOString(), bot_estado: { ...(c.bot_estado || {}), etapa: "atendimento" } }).eq("id", c.id);
      await admin.from("atendimento_mensagens").insert({ conversa_id: c.id, canal: c.canal, direcao: "out", tipo: "sistema", texto: `${meuNome} criou o atendimento a partir de um potencial`, autor_nome: meuNome, status: "enviada" });
      return json({ ok: true, conversaId: c.id });
    }
    if (op === "potencialRemover") { if (!perm("removerPotenciais")) throw new Erro("sem permissão para remover potenciais", 403); await admin.from("atendimento_conversas").update({ potencial_removido: true }).eq("id", b.conversaId); return json({ ok: true }); }
    if (op === "recados") {
      let q = filtrarBots(admin.from("atendimento_conversas").select("id, canal, contato_nome, contato_id, status, atendente_nome, ultima_mensagem_em, ultima_mensagem_texto, ultima_direcao, bot_id, protocolo").eq("origem", "recado")).order("ultima_mensagem_em", { ascending: false }).limit(500);
      if (b.de) q = q.gte("ultima_mensagem_em", b.de); if (b.ate) q = q.lte("ultima_mensagem_em", b.ate); if (b.canal) q = q.eq("canal", b.canal);
      const { data } = await q; let r = (data || []).map((c: any) => ({ ...c, situacao: c.status === "finalizado" ? "finalizado" : (c.atendente_nome ? "em atendimento" : "pendente") }));
      if (b.situacao) r = r.filter((x: any) => x.situacao === b.situacao); return json({ ok: true, data: r });
    }

    /* ===== supervisor ===== */
    if (op === "supLista") {
      if (!sup) throw new Erro("você não é supervisor", 403);
      let q = admin.from("atendimento_conversas").select("*").neq("status", "finalizado").order("ultima_mensagem_em", { ascending: false }).limit(300);
      if (!gestao) q = q.in("departamento_id", supDeps); q = filtrarBots(q); const { data } = await q; return json({ ok: true, data: data || [] });
    }
    if (op === "supMensagens") {
      const c = await conversa(b.conversaId); if (!eSup(c.departamento_id) || !okBot(c.bot_id)) throw new Erro("sem acesso", 403);
      const { data } = await admin.from("atendimento_mensagens").select("*").eq("conversa_id", c.id).order("enviada_em", { ascending: false }).limit(Math.min(Number(b.limite) || 100, 500));
      return json({ ok: true, conversa: c, data: (data || []).reverse() });
    }
    if (op === "supAtribuir") {
      const c = await conversa(b.conversaId); if (!eSup(c.departamento_id) || !okBot(c.bot_id)) throw new Erro("sem acesso", 403);
      const para = b.atendenteId || null;
      if (para && !podeReceber(config, para, c.bot_id)) throw new Erro(`${nomes[para] || "essa pessoa"} não atende esta instância`, 403); const nome = para ? (nomes[para] || "Atendente") : null;
      await admin.from("atendimento_conversas").update({ atendente_id: para, atendente_nome: nome, status: para ? "em_atendimento" : "aguardando", updated_at: new Date().toISOString() }).eq("id", c.id);
      await admin.from("atendimento_mensagens").insert({ conversa_id: c.id, canal: c.canal, direcao: "out", tipo: "sistema", texto: para ? `${meuNome} redistribuiu para ${nome}` : `${meuNome} devolveu para a fila`, autor_nome: meuNome, status: "enviada" });
      return json({ ok: true });
    }
    if (op === "permissoesSalvar") {
      exigeGestao(); const fid = String(b.funcionarioId || ""); const { data: r } = await admin.from("atendimento_atendentes").select("permissoes").eq("funcionario_id", fid).maybeSingle(); if (!r) throw new Erro("atendente não encontrado", 404);
      const novo = { ...(r.permissoes || {}), verHistorico: !!b.verHistorico, supervisor: Array.isArray(b.supervisor) ? b.supervisor.filter((x: any) => typeof x === "string") : [] };
      await admin.from("atendimento_atendentes").update({ permissoes: novo }).eq("funcionario_id", fid); return json({ ok: true });
    }

    /* ===== números oficiais (Cloud API) ===== */
    if (op === "cloudLista") {
      exigeGestao(); const { data } = await admin.from("atendimento_wa_cloud").select("instancia, phone_number_id, waba_id, numero, bot_id, app_secret, updated_at");
      return json({ ok: true, data: (data || []).map((x: any) => ({ instancia: x.instancia, phone_number_id: x.phone_number_id, waba_id: x.waba_id, numero: x.numero, bot_id: x.bot_id, temSegredoApp: !!x.app_secret, atualizado: x.updated_at })), webhookUrl: `${SUPABASE_URL}/functions/v1/atendimento-wa-webhook`, verifyToken: WA_VERIFY });
    }
    if (op === "cloudSalvar") {
      exigeGestao(); const pnid = digits(b.phone_number_id); if (!pnid) throw new Erro("informe o Phone Number ID");
      const instancia = "wa_" + pnid; const { data: ex } = await admin.from("atendimento_wa_cloud").select("token, app_secret").eq("instancia", instancia).maybeSingle();
      const token = txt(b.token, 500).trim() || (ex && ex.token); if (!token) throw new Erro("informe o token de acesso permanente");
      const res = await fetch(`${GRAPH}/${pnid}?fields=display_phone_number,verified_name`, { headers: { Authorization: "Bearer " + token } }); const info = await res.json().catch(() => null);
      if (!res.ok) throw new Erro("a Meta recusou o token/ID: " + JSON.stringify(info && info.error && info.error.message || info));
      const { data: bot } = await admin.from("atendimento_bots").select("id, canais").eq("id", b.botId).maybeSingle(); if (!bot) throw new Erro("escolha o bot");
      const { data: outros } = await admin.from("atendimento_bots").select("id, nome, canais"); for (const o of outros || []) if (o.id !== bot.id && (o.canais || []).some((c: any) => c.instancia === instancia)) throw new Erro(`o número já pertence ao bot ${o.nome}`, 409);
      const reg = { instancia, phone_number_id: pnid, waba_id: digits(b.waba_id) || null, numero: info.display_phone_number || b.numero || null, token, app_secret: txt(b.app_secret, 200).trim() || (ex && ex.app_secret) || null, bot_id: bot.id, updated_at: new Date().toISOString() };
      const { error } = await admin.from("atendimento_wa_cloud").upsert(reg, { onConflict: "instancia" }); if (error) throw error;
      const canais = (bot.canais || []).filter((c: any) => c.instancia !== instancia).concat([{ tipo: "whatsapp", instancia, provider: "cloud" }]);
      await admin.from("atendimento_bots").update({ canais, updated_at: new Date().toISOString() }).eq("id", bot.id);
      await admin.from("atendimento_conversas").update({ bot_id: bot.id }).eq("instancia", instancia).is("bot_id", null);
      return json({ ok: true, instancia, nomeVerificado: info.verified_name || null, numero: info.display_phone_number || null });
    }
    if (op === "cloudExcluir") {
      exigeGestao(); const instancia = String(b.instancia || ""); await admin.from("atendimento_wa_cloud").delete().eq("instancia", instancia);
      const { data: bots } = await admin.from("atendimento_bots").select("id, canais"); for (const bt of bots || []) if ((bt.canais || []).some((c: any) => c.instancia === instancia)) await admin.from("atendimento_bots").update({ canais: bt.canais.filter((c: any) => c.instancia !== instancia) }).eq("id", bt.id);
      return json({ ok: true });
    }
    return json({ error: "operação desconhecida" }, 400);
  } catch (e) {
    if (e instanceof Erro) return json({ error: e.message, ...e.extra }, e.status);
    console.error(e); return json({ error: String((e as any)?.message || e) }, 500);
  }
});
