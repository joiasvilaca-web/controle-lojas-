// atendimento-api v12
// v12: PERFIL no Atendimento (users[].permissoes.atendimento.papel/bots: atendente | administrativo | gerente | diretoria
//      + instâncias liberadas), restrição por instância em listas/leitura/envio/transferência, op botsLista (DP),
//      notaInterna (direcao 'interna', nunca enviada ao cliente) e clienteCadastrar (cria em clientes_cadastro e vincula).
// v6: canal FACEBOOK MESSENGER (envio texto/mídia pela Graph API com o token da página do bot — segredos.FB_PAGE_TOKEN),
//     botSalvar aceita canal messenger + fbPageToken e preserva config.ia/config.fluxo gravados no banco.
// v5: MÚLTIPLOS BOTS (cada bot = conjunto de canais: WhatsApp/Instagram/site), DEPARTAMENTOS,
//     ATENDENTES (online/offline, departamentos, permissões), HORÁRIOS (atendente > departamento > bot),
//     criação de instância WhatsApp (QR) por bot. Segredos por bot ficam em atendimento_bots.segredos.
// v4: Instagram. v3: várias sessões. v2: segredos via tabela.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "atendimento-midia";
const IG_API = "https://graph.instagram.com/v21.0";
const WEBHOOK_TOKEN = "vjw_7f3a9c2e51b84d6e";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

let __seg: Record<string, string> | null = null;
async function segredos(): Promise<Record<string, string>> {
  if (__seg) return __seg;
  const out: Record<string, string> = {};
  for (const k of ["EVOLUTION_URL", "EVOLUTION_API_KEY", "INSTAGRAM_TOKEN", "INSTAGRAM_IG_ID", "FB_PAGE_TOKEN"]) { const v = Deno.env.get(k); if (v) out[k] = v; }
  const { data } = await admin.from("atendimento_segredos").select("chave, valor");
  for (const r of data || []) if (!out[r.chave]) out[r.chave] = r.valor;
  if (out.EVOLUTION_URL) out.EVOLUTION_URL = out.EVOLUTION_URL.replace(/\/+$/, "");
  __seg = out; return out;
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } }); }
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
/* ---------- PERFIL NO ATENDIMENTO (v12) ----------
   Gravado pelo DP › Perfis de Acesso em users[].permissoes.atendimento.{papel,bots}.
   papel: atendente | administrativo | gerente | diretoria (vazio = pelo nível: diretoria→diretoria, gerente→gerente, demais→atendente).
   bots: ids das instâncias (atendimento_bots) que pode trabalhar; ausente = todas. Diretoria sempre vê todas.
   Compatibilidade: gerente SEM papel gravado continua com as configurações do Atendimento como antes. */
const PAPEIS = ["atendente", "administrativo", "gerente", "diretoria"];
// Loja → instância do Atendimento (as lojas do funcionário definem as instâncias quando não há escolha manual).
// Vilaça: Marechal, JV (João Beraldo), Jardim Norte, Ecommerce · Reforma: Reforma Joias · Oficina e Up Case: nenhuma.
const BOT_VILACA = "1ad6780b-07c9-468f-ae72-ec65b5e3b4fd", BOT_REFORMA = "2b59b2d8-afd0-40a3-8827-2cc74b9f55fd";
const LOJA_BOT: Record<string, string> = { loja_mc: BOT_VILACA, loja_jb: BOT_VILACA, loja_jn: BOT_VILACA, loja_ec: BOT_VILACA, loja_rj: BOT_REFORMA };
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
  const supervisao = papel === "gerente" || papel === "diretoria";
  const admin = papel === "diretoria" || (!explicito && user.nivel === "gerente");
  return { papel, bots, supervisao, admin, explicito };
}
const botOk = (pf: any, botId: string | null) => !pf.bots || (!!botId && pf.bots.includes(botId));
function usuarioDoFuncionario(config: any, fid: string) { return (config.users || []).find((u: any) => (u.funcionarioId || u.id) === fid) || null; }
// pode receber a conversa deste bot por transferência (qualquer papel, desde que liberado na instância)
function podeReceber(config: any, fid: string, botId: string | null): boolean {
  const u = usuarioDoFuncionario(config, fid); if (!u) return true; // funcionário sem login: mantém o comportamento antigo
  if (!podeAtender(u)) return false;
  return botOk(perfilAtd(u), botId);
}
function nomeExibicao(config: any, user: any): string { const f = (config.funcionarios || []).find((x: any) => x.id === user.funcionarioId); return (f && (f.apelido || "").trim()) || (f && f.nome) || user.nome || ""; }

/* ---------- horários ---------- */
// horario: null = sem restrição | { dias: { "0".."6": { ativo: bool, faixas: [["08:00","18:00"], ...] } } }  (0 = domingo)
function agoraSP() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  const hh = Number(g("hour")) % 24;
  return { dia, min: hh * 60 + Number(g("minute")) };
}
function hm(s: string): number { const [h, m] = String(s).split(":"); return Number(h) * 60 + Number(m || 0); }
function dentroDoHorario(h: any): boolean {
  if (!h || !h.dias) return true;
  const { dia, min } = agoraSP();
  const d = h.dias[String(dia)];
  if (!d || !d.ativo) return false;
  const faixas = Array.isArray(d.faixas) && d.faixas.length ? d.faixas : [["00:00", "24:00"]];
  return faixas.some((f: any) => { const a = hm(f[0]), b = hm(f[1]); return a === b ? true : (min >= a && min < b); });
}
// regra: atendente > departamento > bot
function emExpediente(bot: any, dep: any, atendente: any): boolean {
  const h = (atendente && atendente.horario) || (dep && dep.horario) || (bot && bot.horario) || null;
  return dentroDoHorario(h);
}
function horarioLimpo(h: any): any {
  if (!h || !h.dias) return null;
  const out: any = { dias: {} };
  for (let i = 0; i < 7; i++) {
    const d = h.dias[String(i)] || {};
    const faixas = (Array.isArray(d.faixas) ? d.faixas : []).filter((f: any) => Array.isArray(f) && /^\d{1,2}:\d{2}$/.test(f[0]) && /^\d{1,2}:\d{2}$/.test(f[1])).map((f: any) => [f[0], f[1]]);
    out.dias[String(i)] = { ativo: !!d.ativo, faixas };
  }
  return out;
}

async function evolution(caminho: string, body: any, metodo = "POST") {
  const s = await segredos();
  if (!s.EVOLUTION_URL || !s.EVOLUTION_API_KEY) throw new Error("EVOLUTION_URL / EVOLUTION_API_KEY não configurados");
  const res = await fetch(`${s.EVOLUTION_URL}${caminho}`, { method: metodo, headers: { "Content-Type": "application/json", "apikey": s.EVOLUTION_API_KEY }, body: metodo === "GET" ? undefined : JSON.stringify(body) });
  const r = await res.json().catch(() => null);
  if (!res.ok) throw new Error("Evolution " + res.status + ": " + JSON.stringify(r));
  return r;
}
async function tokenIg(botId: string | null): Promise<string> {
  if (botId) { const { data } = await admin.from("atendimento_bots").select("segredos").eq("id", botId).maybeSingle(); const t = data && data.segredos && data.segredos.INSTAGRAM_TOKEN; if (t) return t; }
  const s = await segredos(); if (!s.INSTAGRAM_TOKEN) throw new Error("INSTAGRAM_TOKEN não configurado"); return s.INSTAGRAM_TOKEN;
}
async function instagramEnviar(botId: string | null, igsid: string, message: any) {
  const token = await tokenIg(botId);
  const res = await fetch(`${IG_API}/me/messages`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify({ recipient: { id: igsid }, message }) });
  const r = await res.json().catch(() => null);
  if (!res.ok) throw new Error("Instagram " + res.status + ": " + JSON.stringify(r));
  return r;
}
const GRAPH = "https://graph.facebook.com/v21.0";
async function tokenFb(botId: string | null): Promise<string> {
  if (botId) { const { data } = await admin.from("atendimento_bots").select("segredos").eq("id", botId).maybeSingle(); const t = data && data.segredos && data.segredos.FB_PAGE_TOKEN; if (t) return t; }
  const s = await segredos(); if (!s.FB_PAGE_TOKEN) throw new Error("FB_PAGE_TOKEN (token da página do Facebook) não configurado neste bot"); return s.FB_PAGE_TOKEN;
}
// Messenger: dentro de 24h usa RESPONSE; fora da janela tenta a etiqueta HUMAN_AGENT (até 7 dias, exige permissão aprovada no app da Meta)
async function messengerEnviar(botId: string | null, psid: string, message: any) {
  const token = await tokenFb(botId);
  const mandar = async (extra: any) => {
    const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: psid }, message, ...extra }) });
    return { res, r: await res.json().catch(() => null) };
  };
  let { res, r } = await mandar({ messaging_type: "RESPONSE" });
  if (!res.ok && r && r.error && (r.error.error_subcode === 2018278 || r.error.code === 10)) ({ res, r } = await mandar({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }));
  if (!res.ok) throw new Error("Messenger " + res.status + ": " + JSON.stringify(r && r.error || r));
  return r;
}
async function conversaOuErro(id: string) { const { data, error } = await admin.from("atendimento_conversas").select("*").eq("id", id).maybeSingle(); if (error) throw error; if (!data) throw new Error("conversa não encontrada"); return data; }
function podeVerConversa(user: any, c: any): boolean {
  const pf = perfilAtd(user); if (!botOk(pf, c.bot_id)) return false;
  if (pf.supervisao) return true;
  const eu = user.funcionarioId || user.id;
  if (c.atendente_id === eu) return true;
  return !c.atendente_id && pf.papel !== "administrativo"; // administrativo só recebe por transferência
}
async function atualizarConversaAposEnvio(c: any, resumo: string, meuId: string, meuNome: string, agora: string) {
  const upd: any = { ultima_mensagem_em: agora, ultima_mensagem_texto: resumo, ultima_direcao: "out", nao_lidas: 0, updated_at: agora };
  if (!c.atendente_id) { upd.atendente_id = meuId; upd.atendente_nome = meuNome; upd.status = "em_atendimento"; } else if (c.status === "aguardando") upd.status = "em_atendimento";
  await admin.from("atendimento_conversas").update(upd).eq("id", c.id);
}
function limparBot(b: any) { const { segredos: sg, ...resto } = b; return { ...resto, temTokenInstagram: !!(sg && sg.INSTAGRAM_TOKEN), temTokenMessenger: !!(sg && sg.FB_PAGE_TOKEN) }; }

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
    if (op === "botsLista") { // DP › Perfis de Acesso: lista de instâncias para marcar por usuário
      const pc = user.permissoes && user.permissoes.config;
      if (user.nivel !== "diretoria" && !(pc && pc.ativo === true)) return json({ error: "só diretoria" }, 403);
      const { data, error } = await admin.from("atendimento_bots").select("id, nome, ativo").order("created_at"); if (error) throw error;
      return json({ ok: true, bots: data || [] });
    }
    if (!podeAtender(user)) return json({ error: "sem permissão para o Atendimento" }, 403);
    const meuId = user.funcionarioId || user.id;
    const meuNome = nomeExibicao(config, user);
    const pf = perfilAtd(user);
    const gestao = pf.supervisao;      // vê tudo (das instâncias liberadas), painel, relatórios
    const podeAdmin = pf.admin;        // configurações do Atendimento (bots, canais, departamentos, equipe…)
    const filtrarBots = (q: any) => pf.bots ? q.in("bot_id", pf.bots.length ? pf.bots : ["00000000-0000-0000-0000-000000000000"]) : q;

    if (op === "status") {
      const instancias: Record<string, any> = { ...(config.atendimentoInstancias || {}) };
      try {
        const lista = await evolution("/instance/fetchInstances", null, "GET");
        for (const it of Array.isArray(lista) ? lista : []) {
          const nome = it.name || (it.instance && it.instance.instanceName);
          const estado = it.connectionStatus || (it.instance && it.instance.status) || it.state;
          if (nome) instancias[nome] = { canal: "whatsapp", estado: estado || "desconhecido", atualizadoEm: new Date().toISOString(), perfil: it.profileName || null, numero: it.ownerJid ? String(it.ownerJid).split("@")[0] : null };
        }
      } catch (e) { console.error("status evolution", e); }
      const { data: bots } = await admin.from("atendimento_bots").select("*").order("created_at");
      const s = await segredos();
      for (const b of bots || []) for (const c of b.canais || []) {
        if (c.tipo !== "instagram") continue;
        const token = (b.segredos && b.segredos.INSTAGRAM_TOKEN) || (!(bots || []).some((x: any) => x.id !== b.id && x.segredos && x.segredos.INSTAGRAM_TOKEN) ? s.INSTAGRAM_TOKEN : null);
        if (!token) continue;
        let estado = "open"; let perfil: string | null = null;
        try { const r = await fetch(`${IG_API}/me?fields=username&access_token=${encodeURIComponent(token)}`); const d = await r.json().catch(() => null); if (!r.ok) estado = "close"; else perfil = d && d.username ? "@" + d.username : null; } catch { estado = "close"; }
        instancias["ig_" + c.ig_id] = { canal: "instagram", estado, atualizadoEm: new Date().toISOString(), perfil };
      }
      for (const b of bots || []) for (const c of b.canais || []) {
        if (c.tipo !== "messenger" || !c.page_id) continue;
        const token = (b.segredos && b.segredos.FB_PAGE_TOKEN) || s.FB_PAGE_TOKEN; if (!token) continue;
        let estado = "open"; let perfil: string | null = c.nome || null;
        try { const r = await fetch(`${GRAPH}/me?fields=name&access_token=${encodeURIComponent(token)}`); const d = await r.json().catch(() => null); if (!r.ok) estado = "close"; else perfil = d && d.name ? d.name : perfil; } catch { estado = "close"; }
        instancias["fb_" + c.page_id] = { canal: "messenger", estado, atualizadoEm: new Date().toISOString(), perfil };
      }
      const { data: deps } = await admin.from("atendimento_departamentos").select("*").order("ordem").order("nome");
      const { data: ats } = await admin.from("atendimento_atendentes").select("*");
      const meuReg = (ats || []).find((a: any) => a.funcionario_id === meuId) || null;
      const meusDeps = new Set((meuReg && meuReg.departamentos) || []);
      const botsVis = (bots || []).filter((b: any) => botOk(pf, b.id)).map(limparBot);
      const depsVis = (deps || []).filter((d: any) => (!d.bot_id || botOk(pf, d.bot_id)) && (gestao || meusDeps.has(d.id) || !meuReg));
      // quem pode receber transferência e em quais instâncias (sem dados sensíveis)
      const equipeAcesso = (config.funcionarios || []).filter((f: any) => !f.inativo && f.status !== "inativo").map((f: any) => {
        const u = usuarioDoFuncionario(config, f.id); const p = u ? perfilAtd(u) : null;
        return { id: f.id, nome: (f.apelido || "").trim() || f.nome, papel: p ? p.papel : null, bots: p ? p.bots : null, ativo: u ? podeAtender(u) : true };
      });
      const funcionarios = gestao ? (config.funcionarios || []).filter((f: any) => !f.inativo && f.status !== "inativo").map((f: any) => ({ id: f.id, nome: (f.apelido || "").trim() || f.nome })) : [];
      const equipe = (ats || []).map((a: any) => { const f = (config.funcionarios || []).find((x: any) => x.id === a.funcionario_id); return { ...a, nome: f ? ((f.apelido || "").trim() || f.nome) : a.funcionario_id }; });
      return json({ ok: true, instancias, bots: botsVis, departamentos: depsVis, atendentes: gestao ? equipe : equipe.map((a: any) => ({ funcionario_id: a.funcionario_id, nome: a.nome, online: a.online, departamentos: a.departamentos })), funcionarios, meuReg, setores: config.atendimentoSetores || [], respostasRapidas: config.atendimentoRespostas || [], gestao, admin: podeAdmin, papel: pf.papel, botsPermitidos: pf.bots, equipeAcesso, meuId, meuNome });
    }

    /* ---------- BOTS / DEPARTAMENTOS / ATENDENTES (gestão) ---------- */
    if (op === "botSalvar") {
      if (!podeAdmin) return json({ error: "só a diretoria configura o Atendimento" }, 403);
      const nome = String(body.nome || "").trim().toUpperCase(); if (!nome) return json({ error: "nome obrigatório" }, 400);
      const canais = (Array.isArray(body.canais) ? body.canais : []).map((c: any) => {
        if (c.tipo === "whatsapp" && c.instancia) return { tipo: "whatsapp", instancia: String(c.instancia).trim() };
        if (c.tipo === "instagram" && c.ig_id) return { tipo: "instagram", ig_id: String(c.ig_id).trim(), usuario: c.usuario ? String(c.usuario).trim() : undefined };
        if (c.tipo === "site" && c.url) return { tipo: "site", url: String(c.url).trim() };
        if (c.tipo === "messenger" && c.page_id && /^\d{5,25}$/.test(String(c.page_id).trim())) return { tipo: "messenger", page_id: String(c.page_id).trim(), nome: c.nome ? String(c.nome).trim().slice(0, 80) : undefined };
        return null;
      }).filter(Boolean);
      // um canal só pode pertencer a um bot
      const { data: todos } = await admin.from("atendimento_bots").select("id, nome, canais");
      for (const o of todos || []) { if (o.id === body.id) continue; for (const c of canais as any[]) { const dup = (o.canais || []).some((x: any) => x.tipo === c.tipo && (x.instancia || x.ig_id || x.page_id || x.url) === (c.instancia || c.ig_id || c.page_id || c.url)); if (dup) return json({ error: `o canal ${c.instancia || c.ig_id || c.page_id || c.url} já pertence ao bot ${o.nome}` }, 409); } }
      const reg: any = { nome, descricao: body.descricao ? String(body.descricao).trim() : null, ativo: body.ativo !== false, canais, horario: horarioLimpo(body.horario), config: body.config && typeof body.config === "object" ? body.config : {}, updated_at: new Date().toISOString() };
      let id = body.id;
      const novosSeg: Record<string, string> = {};
      if (body.instagramToken) novosSeg.INSTAGRAM_TOKEN = String(body.instagramToken).trim();
      if (body.fbPageToken) novosSeg.FB_PAGE_TOKEN = String(body.fbPageToken).trim();
      if (id) {
        const { data: atual } = await admin.from("atendimento_bots").select("segredos, config").eq("id", id).maybeSingle();
        if (Object.keys(novosSeg).length) reg.segredos = { ...((atual && atual.segredos) || {}), ...novosSeg };
        // fluxo e IA têm ops próprias (fluxoSalvar / atendimento-ia configSalvar): mantém o que está gravado
        const cfgAtual = (atual && atual.config) || {};
        reg.config = { ...reg.config, ...(cfgAtual.fluxo ? { fluxo: cfgAtual.fluxo } : {}), ...(cfgAtual.ia ? { ia: cfgAtual.ia } : {}) };
        const { error } = await admin.from("atendimento_bots").update(reg).eq("id", id); if (error) throw error;
      } else {
        if (Object.keys(novosSeg).length) reg.segredos = novosSeg;
        const { data, error } = await admin.from("atendimento_bots").insert(reg).select("id").single(); if (error) throw error; id = data.id;
      }
      // vincula conversas existentes dos canais deste bot que ainda não têm bot
      for (const c of canais as any[]) { const inst = c.tipo === "whatsapp" ? c.instancia : c.tipo === "instagram" ? "ig_" + c.ig_id : c.tipo === "messenger" ? "fb_" + c.page_id : null; if (inst) await admin.from("atendimento_conversas").update({ bot_id: id }).eq("instancia", inst).is("bot_id", null); }
      return json({ ok: true, id });
    }
    if (op === "botExcluir") {
      if (!podeAdmin) return json({ error: "só a diretoria configura o Atendimento" }, 403);
      const { count } = await admin.from("atendimento_conversas").select("id", { count: "exact", head: true }).eq("bot_id", body.id).neq("status", "finalizado");
      if ((count || 0) > 0 && !body.forcar) return json({ error: `este bot tem ${count} conversa(s) abertas — finalize ou confirme a exclusão`, abertas: count }, 409);
      const { error } = await admin.from("atendimento_bots").delete().eq("id", body.id); if (error) throw error;
      return json({ ok: true });
    }
    if (op === "depSalvar") {
      if (!podeAdmin) return json({ error: "só a diretoria configura o Atendimento" }, 403);
      const nome = String(body.nome || "").trim().toUpperCase(); if (!nome) return json({ error: "nome obrigatório" }, 400);
      const reg: any = { nome, bot_id: body.botId || null, ativo: body.ativo !== false, horario: horarioLimpo(body.horario), ordem: Number(body.ordem) || 0 };
      if (body.id) { const { error } = await admin.from("atendimento_departamentos").update(reg).eq("id", body.id); if (error) throw error; return json({ ok: true, id: body.id }); }
      const { data, error } = await admin.from("atendimento_departamentos").insert(reg).select("id").single(); if (error) throw error; return json({ ok: true, id: data.id });
    }
    if (op === "depExcluir") {
      if (!podeAdmin) return json({ error: "só a diretoria configura o Atendimento" }, 403);
      const { error } = await admin.from("atendimento_departamentos").delete().eq("id", body.id); if (error) throw error;
      return json({ ok: true });
    }
    if (op === "atendenteSalvar") {
      if (!podeAdmin) return json({ error: "só a diretoria configura o Atendimento" }, 403);
      const fid = String(body.funcionarioId || ""); if (!fid || !(config.funcionarios || []).some((f: any) => f.id === fid)) return json({ error: "funcionário não encontrado" }, 404);
      const p = body.permissoes || {};
      const reg = { funcionario_id: fid, departamentos: Array.isArray(body.departamentos) ? body.departamentos : [], permissoes: { removerPotenciais: !!p.removerPotenciais, verAgenda: !!p.verAgenda, criarAtivo: !!p.criarAtivo, reabrir: !!p.reabrir }, horario: horarioLimpo(body.horario), updated_at: new Date().toISOString() };
      const { error } = await admin.from("atendimento_atendentes").upsert(reg, { onConflict: "funcionario_id" }); if (error) throw error;
      return json({ ok: true });
    }
    if (op === "atendenteRemover") {
      if (!podeAdmin) return json({ error: "só a diretoria configura o Atendimento" }, 403);
      const { error } = await admin.from("atendimento_atendentes").delete().eq("funcionario_id", body.funcionarioId); if (error) throw error;
      return json({ ok: true });
    }
    if (op === "meuStatus") { // atendente liga/desliga o próprio online
      const online = !!body.online; const agora = new Date().toISOString();
      const { data: ex } = await admin.from("atendimento_atendentes").select("funcionario_id").eq("funcionario_id", meuId).maybeSingle();
      if (ex) await admin.from("atendimento_atendentes").update({ online, online_em: agora, updated_at: agora }).eq("funcionario_id", meuId);
      else await admin.from("atendimento_atendentes").insert({ funcionario_id: meuId, online, online_em: agora });
      return json({ ok: true, online });
    }
    if (op === "expediente") { // diz se agora está dentro do horário (atendente > departamento > bot)
      const { data: bot } = body.botId ? await admin.from("atendimento_bots").select("*").eq("id", body.botId).maybeSingle() : { data: null };
      const { data: dep } = body.departamentoId ? await admin.from("atendimento_departamentos").select("*").eq("id", body.departamentoId).maybeSingle() : { data: null };
      const { data: at } = body.atendenteId ? await admin.from("atendimento_atendentes").select("*").eq("funcionario_id", body.atendenteId).maybeSingle() : { data: null };
      return json({ ok: true, aberto: emExpediente(bot, dep, at) });
    }
    if (op === "criarInstancia") { // novo número de WhatsApp (Evolution) → devolve QR
      if (!podeAdmin) return json({ error: "só a diretoria configura o Atendimento" }, 403);
      const nome = String(body.nome || "").toLowerCase().replace(/[^a-z0-9]/g, ""); if (nome.length < 3) return json({ error: "nome da instância inválido (use letras/números, mínimo 3)" }, 400);
      const r = await evolution("/instance/create", { instanceName: nome, integration: "WHATSAPP-BAILEYS", qrcode: true, webhook: { enabled: true, url: `${SUPABASE_URL}/functions/v1/atendimento-webhook?t=${WEBHOOK_TOKEN}`, byEvents: false, base64: false, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE"] } });
      return json({ ok: true, instancia: nome, qr: (r && r.qrcode && r.qrcode.base64) || null });
    }
    if (op === "qrInstancia") {
      if (!podeAdmin) return json({ error: "só a diretoria configura o Atendimento" }, 403);
      const r = await evolution(`/instance/connect/${encodeURIComponent(String(body.instancia || ""))}`, null, "GET");
      return json({ ok: true, qr: (r && r.base64) || null, conectado: !!(r && r.instance && r.instance.state === "open") });
    }

    if (op === "listarConversas") {
      const filtro = body.filtro || "minhas";
      let q = admin.from("atendimento_conversas").select("*").order("ultima_mensagem_em", { ascending: false, nullsFirst: false }).limit(300);
      const adm = pf.papel === "administrativo"; // só vê o que é dele (recebe por transferência ou iniciou)
      const minhasOuLivres = (qq: any) => adm ? qq.eq("atendente_id", meuId) : qq.or(`atendente_id.eq.${meuId},atendente_id.is.null`);
      if (filtro === "minhas") q = q.eq("atendente_id", meuId).neq("status", "finalizado");
      else if (filtro === "fila") { if (adm) return json({ ok: true, data: [] }); q = q.eq("status", "aguardando"); }
      else if (filtro === "finalizadas") { q = q.eq("status", "finalizado"); if (!gestao) q = minhasOuLivres(q); }
      else if (filtro === "todas") { if (!gestao) q = minhasOuLivres(q); q = q.neq("status", "finalizado"); }
      q = filtrarBots(q); // restrição por instância (bots liberados no DP)
      if (body.canal) q = q.eq("canal", body.canal);
      if (body.botId) q = q.eq("bot_id", body.botId);
      if (body.departamentoId) q = q.eq("departamento_id", body.departamentoId);
      if (body.busca) { const b = String(body.busca).replace(/[%,]/g, " ").trim(); if (b) q = q.or(`contato_nome.ilike.%${b}%,contato_id.ilike.%${b}%`); }
      const { data, error } = await q; if (error) throw error;
      return json({ ok: true, data: data || [] });
    }
    if (op === "mensagens") {
      const c = await conversaOuErro(body.conversaId);
      if (!podeVerConversa(user, c)) return json({ error: "sem acesso a esta conversa" }, 403);
      let q = admin.from("atendimento_mensagens").select("id, direcao, tipo, texto, midia_path, midia_mime, midia_nome, externo_id, autor_nome, status, enviada_em, contexto").eq("conversa_id", c.id).order("enviada_em", { ascending: false }).limit(Number(body.limite) || 60);
      if (body.depoisDe) q = q.gt("enviada_em", body.depoisDe);
      const { data, error } = await q; if (error) throw error;
      return json({ ok: true, conversa: c, data: (data || []).reverse() });
    }
    if (op === "midiaUrl") {
      const path = String(body.path || ""); if (!path) return json({ error: "path obrigatório" }, 400);
      if (pf.bots || !gestao) { // mídia de conversa: só quem pode ver a conversa
        const { data: mm } = await admin.from("atendimento_mensagens").select("conversa_id").eq("midia_path", path).limit(1).maybeSingle();
        if (mm) { const cv = await conversaOuErro(mm.conversa_id); if (!podeVerConversa(user, cv)) return json({ error: "sem acesso" }, 403); }
      }
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60); if (error) throw error;
      return json({ ok: true, url: data.signedUrl });
    }
    if (op === "assumir") {
      const c = await conversaOuErro(body.conversaId);
      if (!botOk(pf, c.bot_id)) return json({ error: "você não atende esta instância" }, 403);
      if (pf.papel === "administrativo" && c.atendente_id !== meuId) return json({ error: "o perfil Administrativo só recebe conversas por transferência" }, 403);
      if (c.atendente_id && c.atendente_id !== meuId && !gestao) return json({ error: "essa conversa já está com " + (c.atendente_nome || "outro atendente") }, 409);
      await admin.from("atendimento_conversas").update({ atendente_id: meuId, atendente_nome: meuNome, status: "em_atendimento", updated_at: new Date().toISOString() }).eq("id", c.id);
      return json({ ok: true });
    }
    if (op === "transferir") {
      const c = await conversaOuErro(body.conversaId);
      if (!podeVerConversa(user, c)) return json({ error: "sem acesso a esta conversa" }, 403);
      const upd: any = { updated_at: new Date().toISOString() };
      let nomeDep: string | null = null;
      if (body.departamentoId !== undefined) {
        if (body.departamentoId) { const { data: d } = await admin.from("atendimento_departamentos").select("id, nome").eq("id", body.departamentoId).maybeSingle(); if (!d) return json({ error: "departamento não encontrado" }, 404); upd.departamento_id = d.id; upd.setor = d.nome; nomeDep = d.nome; }
        else { upd.departamento_id = null; upd.setor = null; }
      }
      if (body.atendenteId) { const f = (config.funcionarios || []).find((x: any) => x.id === body.atendenteId); if (!f) return json({ error: "atendente não encontrado" }, 404); if (!podeReceber(config, f.id, c.bot_id)) return json({ error: `${(f.apelido || "").trim() || f.nome} não atende esta instância` }, 403); upd.atendente_id = f.id; upd.atendente_nome = (f.apelido || "").trim() || f.nome; upd.status = "em_atendimento"; }
      else { upd.atendente_id = null; upd.atendente_nome = null; upd.status = "aguardando"; }
      if (body.setor !== undefined && body.departamentoId === undefined) upd.setor = body.setor || null;
      await admin.from("atendimento_conversas").update(upd).eq("id", c.id);
      await admin.from("atendimento_mensagens").insert({ conversa_id: c.id, canal: c.canal, direcao: "out", tipo: "sistema", texto: `${meuNome} transferiu a conversa para ${upd.atendente_nome || (nomeDep ? "o departamento " + nomeDep : upd.setor ? "o setor " + upd.setor : "a fila")}`, autor_nome: meuNome, status: "enviada" });
      return json({ ok: true });
    }
    if (op === "finalizar") {
      const c = await conversaOuErro(body.conversaId);
      if (!podeVerConversa(user, c)) return json({ error: "sem acesso a esta conversa" }, 403);
      await admin.from("atendimento_conversas").update({ status: "finalizado", nao_lidas: 0, updated_at: new Date().toISOString() }).eq("id", c.id);
      await admin.from("atendimento_mensagens").insert({ conversa_id: c.id, canal: c.canal, direcao: "out", tipo: "sistema", texto: `${meuNome} finalizou o atendimento`, autor_nome: meuNome, status: "enviada" });
      return json({ ok: true });
    }
    if (op === "marcarLida") { const c = await conversaOuErro(body.conversaId); if (!podeVerConversa(user, c)) return json({ error: "sem acesso" }, 403); await admin.from("atendimento_conversas").update({ nao_lidas: 0 }).eq("id", c.id); return json({ ok: true }); }
    if (op === "vincularCliente") { const c = await conversaOuErro(body.conversaId); if (!podeVerConversa(user, c)) return json({ error: "sem acesso" }, 403); await admin.from("atendimento_conversas").update({ cliente_id: body.clienteId || null, contato_nome: body.nome || c.contato_nome, updated_at: new Date().toISOString() }).eq("id", c.id); return json({ ok: true }); }
    if (op === "tags") { const c = await conversaOuErro(body.conversaId); if (!podeVerConversa(user, c)) return json({ error: "sem acesso" }, 403); const tags = Array.isArray(body.tags) ? body.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 20) : []; await admin.from("atendimento_conversas").update({ tags, updated_at: new Date().toISOString() }).eq("id", c.id); return json({ ok: true }); }

    if (op === "enviarTexto") {
      const c = await conversaOuErro(body.conversaId);
      if (!podeVerConversa(user, c)) return json({ error: "sem acesso a esta conversa" }, 403);
      const texto = String(body.texto || "").trim(); if (!texto) return json({ error: "texto vazio" }, 400);
      let externoId: string | null = null;
      if (c.canal === "whatsapp") { const r = await evolution(`/message/sendText/${encodeURIComponent(c.instancia)}`, { number: c.contato_id, text: texto }); externoId = r && r.key && r.key.id ? r.key.id : null; }
      else if (c.canal === "instagram") { if (texto.length > 1000) return json({ error: "o Instagram limita a 1000 caracteres por mensagem" }, 400); const r = await instagramEnviar(c.bot_id, c.contato_id, { text: texto }); externoId = r && r.message_id ? r.message_id : null; }
      else if (c.canal === "messenger") { if (texto.length > 2000) return json({ error: "o Messenger limita a 2000 caracteres por mensagem" }, 400); const r = await messengerEnviar(c.bot_id, c.contato_id, { text: texto }); externoId = r && r.message_id ? r.message_id : null; }
      else return json({ error: "canal não suportado" }, 400);
      const agora = new Date().toISOString();
      await admin.from("atendimento_mensagens").upsert({ conversa_id: c.id, canal: c.canal, direcao: "out", tipo: "texto", texto, externo_id: externoId, autor_funcionario_id: meuId, autor_nome: meuNome, status: "enviada", enviada_em: agora }, { onConflict: "conversa_id,externo_id", ignoreDuplicates: false });
      await atualizarConversaAposEnvio(c, texto, meuId, meuNome, agora);
      return json({ ok: true, externoId });
    }
    if (op === "enviarMidia") {
      const c = await conversaOuErro(body.conversaId);
      if (!podeVerConversa(user, c)) return json({ error: "sem acesso a esta conversa" }, 403);
      const { base64, mimetype, nome, legenda } = body;
      if (!base64 || !mimetype) return json({ error: "arquivo obrigatório" }, 400);
      const mediatype = mimetype.startsWith("image/") ? "image" : mimetype.startsWith("video/") ? "video" : mimetype.startsWith("audio/") ? "audio" : "document";
      const tipo = mediatype === "image" ? "imagem" : mediatype === "video" ? "video" : mediatype === "audio" ? "audio" : "documento";
      const bin = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
      const ext = (mimetype.split("/")[1] || "bin").split(";")[0];
      const path = `${c.instancia}/${c.contato_id}/out_${Date.now()}.${ext}`;
      await admin.storage.from(BUCKET).upload(path, bin, { contentType: mimetype, upsert: true });
      let externoId: string | null = null;
      if (c.canal === "whatsapp") {
        let r: any;
        if (mediatype === "audio") r = await evolution(`/message/sendWhatsAppAudio/${encodeURIComponent(c.instancia)}`, { number: c.contato_id, audio: base64 });
        else r = await evolution(`/message/sendMedia/${encodeURIComponent(c.instancia)}`, { number: c.contato_id, mediatype, mimetype, caption: legenda || "", media: base64, fileName: nome || ("arquivo." + ext) });
        externoId = r && r.key && r.key.id ? r.key.id : null;
      } else if (c.canal === "instagram") {
        if (mediatype === "document") return json({ error: "o Instagram não aceita documentos por mensagem — envie foto, vídeo ou áudio" }, 400);
        const { data: assinada, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 30); if (error) throw error;
        const r = await instagramEnviar(c.bot_id, c.contato_id, { attachment: { type: mediatype, payload: { url: assinada.signedUrl } } });
        externoId = r && r.message_id ? r.message_id : null;
        if (legenda) { try { const r2 = await instagramEnviar(c.bot_id, c.contato_id, { text: legenda }); await admin.from("atendimento_mensagens").insert({ conversa_id: c.id, canal: c.canal, direcao: "out", tipo: "texto", texto: legenda, externo_id: r2 && r2.message_id ? r2.message_id : null, autor_funcionario_id: meuId, autor_nome: meuNome, status: "enviada" }); } catch (e) { console.error("legenda ig", e); } }
      } else if (c.canal === "messenger") {
        const { data: assinada, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 30); if (error) throw error;
        const r = await messengerEnviar(c.bot_id, c.contato_id, { attachment: { type: mediatype === "document" ? "file" : mediatype, payload: { url: assinada.signedUrl, is_reusable: false } } });
        externoId = r && r.message_id ? r.message_id : null;
        if (legenda) { try { const r2 = await messengerEnviar(c.bot_id, c.contato_id, { text: String(legenda).slice(0, 2000) }); await admin.from("atendimento_mensagens").insert({ conversa_id: c.id, canal: c.canal, direcao: "out", tipo: "texto", texto: legenda, externo_id: r2 && r2.message_id ? r2.message_id : null, autor_funcionario_id: meuId, autor_nome: meuNome, status: "enviada" }); } catch (e) { console.error("legenda fb", e); } }
      } else return json({ error: "canal não suportado" }, 400);
      const agora = new Date().toISOString();
      await admin.from("atendimento_mensagens").upsert({ conversa_id: c.id, canal: c.canal, direcao: "out", tipo, texto: (c.canal === "instagram" || c.canal === "messenger") ? null : (legenda || null), midia_path: path, midia_mime: mimetype, midia_nome: nome || null, externo_id: externoId, autor_funcionario_id: meuId, autor_nome: meuNome, status: "enviada", enviada_em: agora }, { onConflict: "conversa_id,externo_id", ignoreDuplicates: false });
      const resumo = tipo === "imagem" ? "📷 Foto" : tipo === "audio" ? "🎤 Áudio" : tipo === "video" ? "🎥 Vídeo" : "📎 " + (nome || "Documento");
      await atualizarConversaAposEnvio(c, resumo, meuId, meuNome, agora);
      return json({ ok: true, externoId });
    }
    if (op === "novaConversa") {
      const numero = String(body.numero || "").replace(/\D/g, ""); if (numero.length < 10) return json({ error: "número inválido" }, 400);
      let botId: string | null = body.botId || null; let instancia = body.instancia as string | undefined;
      if (botId && !instancia) { const { data: b } = await admin.from("atendimento_bots").select("canais").eq("id", botId).maybeSingle(); const wa = ((b && b.canais) || []).find((x: any) => x.tipo === "whatsapp"); if (wa) instancia = wa.instancia; }
      instancia = instancia || Object.keys(config.atendimentoInstancias || {}).find((k) => !k.startsWith("ig_")) || "reformajoias";
      if (!botId) { const { data: bs } = await admin.from("atendimento_bots").select("id, canais"); const b = (bs || []).find((x: any) => (x.canais || []).some((c: any) => c.tipo === "whatsapp" && c.instancia === instancia)); botId = b ? b.id : null; }
      const num = numero.startsWith("55") ? numero : "55" + numero;
      if (!botOk(pf, botId)) return json({ error: "você não atende esta instância" }, 403);
      const { data: ja } = await admin.from("atendimento_conversas").select("id, atendente_id, atendente_nome, status, bot_id").eq("instancia", instancia).eq("contato_id", num).maybeSingle();
      if (ja && pf.papel === "administrativo" && ja.atendente_id !== meuId) {
        // administrativo iniciando contato: só pega se a conversa estiver livre (sem atendente ou finalizada)
        if (ja.atendente_id && ja.status !== "finalizado") return json({ error: "este contato já está em atendimento com " + (ja.atendente_nome || "outra pessoa") }, 409);
        if (ja.status === "finalizado") await admin.rpc("atendimento_renovar", { p_id: ja.id });
        await admin.from("atendimento_conversas").update({ atendente_id: meuId, atendente_nome: meuNome, status: "em_atendimento", updated_at: new Date().toISOString() }).eq("id", ja.id);
      }
      if (ja) return json({ ok: true, conversaId: ja.id, jaExistia: true });
      const { data: nova, error } = await admin.from("atendimento_conversas").insert({ canal: "whatsapp", instancia, bot_id: botId, contato_id: num, contato_nome: body.nome || null, cliente_id: body.clienteId || null, atendente_id: meuId, atendente_nome: meuNome, status: "em_atendimento" }).select("id").single();
      if (error) throw error;
      return json({ ok: true, conversaId: nova.id, jaExistia: false });
    }
    if (op === "salvarConfig") {
      if (!podeAdmin) return json({ error: "só a diretoria configura o Atendimento" }, 403);
      if (Array.isArray(body.setores)) config.atendimentoSetores = body.setores.map((s: any) => String(s).trim()).filter(Boolean);
      if (Array.isArray(body.respostasRapidas)) config.atendimentoRespostas = body.respostasRapidas.filter((r: any) => r && r.titulo && r.texto).map((r: any) => ({ titulo: String(r.titulo), texto: String(r.texto) }));
      const { error } = await admin.from("gestao_config").update({ payload: config, updated_at: new Date().toISOString() }).eq("id", "config"); if (error) throw error;
      return json({ ok: true });
    }
    if (op === "resumo") {
      if (!gestao) return json({ error: "só diretoria/gerente" }, 403);
      let q = admin.from("atendimento_conversas").select("status, atendente_id, atendente_nome, setor, departamento_id, bot_id, nao_lidas, canal");
      if (body.botId) q = q.eq("bot_id", body.botId);
      q = filtrarBots(q);
      const { data, error } = await q; if (error) throw error;
      const { data: deps } = await admin.from("atendimento_departamentos").select("id, nome");
      const nomeDep: Record<string, string> = {}; for (const d of deps || []) nomeDep[d.id] = d.nome;
      const porStatus: Record<string, number> = {}; const porAtendente: Record<string, number> = {}; const porCanal: Record<string, number> = {}; const porDepartamento: Record<string, { ativos: number; pendentes: number; naoLidas: number }> = {}; let naoLidas = 0;
      for (const c of data || []) {
        porStatus[c.status] = (porStatus[c.status] || 0) + 1;
        if (c.status !== "finalizado") {
          const k = c.atendente_nome || "(fila)"; porAtendente[k] = (porAtendente[k] || 0) + 1; porCanal[c.canal] = (porCanal[c.canal] || 0) + 1;
          const dk = (c.departamento_id && nomeDep[c.departamento_id]) || c.setor || "(sem departamento)";
          const o = porDepartamento[dk] || (porDepartamento[dk] = { ativos: 0, pendentes: 0, naoLidas: 0 });
          if (c.status === "aguardando") o.pendentes++; else o.ativos++; o.naoLidas += c.nao_lidas || 0;
        }
        naoLidas += c.nao_lidas || 0;
      }
      return json({ ok: true, porStatus, porAtendente, porCanal, porDepartamento, naoLidas });
    }

    /* ---------- NOTA INTERNA (v12): fica só no sistema, nunca vai ao cliente ----------
       Gravada com direcao = 'interna' e tipo = 'interna' (não há CHECK na tabela). Webhook, bot e
       arquivamento/KPIs só olham direcao 'in'/'out', então ignoram; a prévia da conversa não muda. */
    if (op === "notaInterna") {
      const c = await conversaOuErro(body.conversaId);
      if (!podeVerConversa(user, c)) return json({ error: "sem acesso a esta conversa" }, 403);
      const texto = String(body.texto || "").trim().slice(0, 4000); if (!texto) return json({ error: "escreva a nota" }, 400);
      const agora = new Date().toISOString();
      const { data, error } = await admin.from("atendimento_mensagens").insert({ conversa_id: c.id, canal: c.canal, direcao: "interna", tipo: "interna", texto, externo_id: "int_" + crypto.randomUUID(), autor_funcionario_id: meuId, autor_nome: meuNome, status: "interna", enviada_em: agora }).select("id, direcao, tipo, texto, autor_nome, status, enviada_em").single();
      if (error) throw error;
      await admin.from("atendimento_conversas").update({ updated_at: agora }).eq("id", c.id);
      return json({ ok: true, mensagem: data });
    }

    /* ---------- CADASTRAR CLIENTE pela conversa (v12) ---------- */
    if (op === "clienteCadastrar") {
      const c = await conversaOuErro(body.conversaId);
      if (!podeVerConversa(user, c)) return json({ error: "sem acesso a esta conversa" }, 403);
      const dig = (s: any) => String(s || "").replace(/\D/g, "");
      const nome = String(body.nome || "").trim().toUpperCase().replace(/\s+/g, " ").slice(0, 100);
      if (nome.length < 3) return json({ error: "informe o nome do cliente" }, 400);
      let tel = dig(body.telefone); if (tel.length >= 12 && tel.startsWith("55")) tel = tel.slice(2);
      if (tel && tel.length !== 10 && tel.length !== 11) return json({ error: "telefone inválido — use (XX) XXXXX-XXXX" }, 400);
      const telFmt = tel.length === 11 ? `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}` : tel.length === 10 ? `(${tel.slice(0, 2)}) ${tel.slice(2, 6)}-${tel.slice(6)}` : "";
      const cpf = dig(body.cpf);
      const cpfOk = (n: string) => { if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false; const dv = (k: number) => { let s = 0; for (let i = 0; i < k; i++) s += Number(n[i]) * (k + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; }; return dv(9) === Number(n[9]) && dv(10) === Number(n[10]); };
      if (cpf && !cpfOk(cpf)) return json({ error: "CPF inválido" }, 400);
      const cpfFmt = cpf ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : "";
      const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "e-mail inválido" }, 400);
      const nasc = String(body.aniversario || "").trim();
      if (nasc && (!/^\d{4}-\d{2}-\d{2}$/.test(nasc) || isNaN(new Date(nasc + "T12:00:00").getTime()))) return json({ error: "data de aniversário inválida" }, 400);
      const cidade = String(body.cidade || "").trim().toUpperCase().slice(0, 80);
      if (!tel && !cpf) return json({ error: "informe o telefone ou o CPF" }, 400);
      // duplicidade: mesmo telefone (DDD + número) ou mesmo CPF
      {
        const achados: any[] = [];
        if (tel) { const { data } = await admin.from("clientes_cadastro").select("id, payload").ilike("payload->>telefone", `%${tel.slice(-8, -4)}%${tel.slice(-4)}%`).limit(30); for (const r of data || []) { let t = dig(r.payload && r.payload.telefone); if (t.length >= 12 && t.startsWith("55")) t = t.slice(2); if (t === tel || (t.length < 10 && t.slice(-8) === tel.slice(-8))) achados.push(r); } }
        if (cpf) { const { data } = await admin.from("clientes_cadastro").select("id, payload").ilike("payload->>cpf", `%${cpf.slice(0, 3)}%${cpf.slice(3, 6)}%${cpf.slice(6, 9)}%${cpf.slice(9)}%`).limit(10); for (const r of data || []) if (dig(r.payload && r.payload.cpf) === cpf && !achados.some((x) => x.id === r.id)) achados.push(r); }
        if (achados.length) return json({ error: "já existe cliente com este telefone/CPF", duplicados: achados.slice(0, 5).map((r: any) => ({ id: r.id, nome: (r.payload && r.payload.nome) || "", telefone: (r.payload && r.payload.telefone) || "", cpf: (r.payload && r.payload.cpf) || "" })) }, 409);
      }
      const id = "cli_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      const cli = { id, nome, telefone: telFmt, cpf: cpfFmt, email, dataNascimento: nasc, cidade, estado: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", credito: 0, fiadoDebitos: [], creditoMovimentos: [], criadoEm: Date.now(), origem: "atendimento", criadoPor: meuNome };
      const { error } = await admin.from("clientes_cadastro").insert({ id, payload: cli }); if (error) throw error;
      await admin.from("atendimento_conversas").update({ cliente_id: id, contato_nome: nome, updated_at: new Date().toISOString() }).eq("id", c.id);
      return json({ ok: true, cliente: { id, nome, telefone: telFmt, cpf: cpfFmt } });
    }
    return json({ error: "operação desconhecida" }, 400);
  } catch (e) { console.error(e); return json({ error: String(e) }, 500); }
});
