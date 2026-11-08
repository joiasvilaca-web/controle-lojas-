// horas-api v2 (08/11/2026) — v2: sem café (só entrada, almoço e saída) e BIOMETRIA do celular (WebAuthn/passkey: o app guarda só a chave pública).
// horas-api v1 (07/11/2026) — módulo CONTROLE DE HORAS (registro de entrada, almoço e saída por celular da loja).
// Regras: o funcionário entra no app com a própria senha; o celular da loja precisa estar DENTRO do raio da loja (GPS) para aceitar o registro;
// a hora é sempre a do SERVIDOR (fuso de Brasília). Toda batida é imutável (trigger no banco) e encadeada por hash.
// Correção de horário ou registro fora do horário = SOLICITAÇÃO: só vale depois que a Diretoria aprova (a batida original continua guardada).
// Diretoria vê e audita tudo (auditoria_log, módulo "Controle de horas"). Gerente só consulta as lojas dele. Aprovar/recusar: só Diretoria.
// Sessão (sess_…) validada contra gestao_config, igual ao db-gateway. Tabelas: horas_batidas, horas_solicitacoes, horas_config (RLS, sem GRANT).
// Ops: init, bater, solicitar, minhas, espelho, equipe, pendencias, decidir, historico, relatorio, logs, salvarLocal, salvarConfig, bioDesafio, bioRegistrar, bioLista, bioRemover
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const erro = (msg: string, status = 400) => Object.assign(new Error(msg), { status });

const TZ = "America/Sao_Paulo";
const TIPOS = ["entrada", "almoco_saida", "almoco_volta", "saida"];
const ROTULO: Record<string, string> = { entrada: "Entrada", almoco_saida: "Saída para o almoço", almoco_volta: "Volta do almoço", saida: "Saída" };

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
function lojasDaSessao(u: any, token: string): string[] {
  const base: string[] = Array.isArray(u?.lojas) ? u.lojas.map(String) : [];
  const s = (Array.isArray(u?.sessoes) ? u.sessoes : []).find((x: any) => x && x.token === token);
  const e = s && s.lojaExtra;
  return e && e.id && Number(e.ate) > Date.now() && !base.includes(String(e.id)) ? [...base, String(e.id)] : base;
}
const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const diaDe = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);   // AAAA-MM-DD em Brasília
const hhmmDe = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
const isoDia = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const diasEntre = (de: string, ate: string) => { const out: string[] = []; for (let d = new Date(de + "T12:00:00Z"); d <= new Date(ate + "T12:00:00Z") && out.length < 400; d = new Date(d.getTime() + 86400000)) out.push(d.toISOString().slice(0, 10)); return out; };
const metros = (a: number, b: number, c: number, d: number) => {
  const R = 6371000, rad = (x: number) => x * Math.PI / 180;
  const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const configPadrao = { biometria: true, almocoMinimoMin: 60, raioPadraoM: 100, precisaoMaxM: 150, toleranciaMin: 10,
  vigencias: [{ de: "2000-01-01", horasSemana: 44, dias: 6, confirmado: true }] };
async function lerConfig() {
  const { data } = await admin.from("horas_config").select("id,payload").in("id", ["config", "locais"]);
  const c = (data || []).find((x: any) => x.id === "config")?.payload || {};
  const l = (data || []).find((x: any) => x.id === "locais")?.payload || {};
  const cfg: any = { ...configPadrao, ...c };
  if (!Array.isArray(cfg.vigencias) || !cfg.vigencias.length) cfg.vigencias = configPadrao.vigencias;
  cfg.vigencias = [...cfg.vigencias].sort((a: any, b: any) => String(a.de).localeCompare(String(b.de)));
  return { cfg, locais: l as Record<string, any> };
}
const vigenciaEm = (cfg: any, dia: string) => { let v = cfg.vigencias[0]; for (const x of cfg.vigencias) if (String(x.de) <= dia) v = x; return v; };

/** batidas efetivas: as originais trocadas por uma solicitação aprovada saem; o ajuste aprovado entra no lugar */
async function efetivas(funcIds: string[] | null, de: string, ate: string, lojaId?: string) {
  let q = admin.from("horas_batidas").select("*").gte("dia", de).lte("dia", ate).order("em", { ascending: true }).limit(5000);
  if (funcIds) q = q.in("funcionario_id", funcIds);
  if (lojaId) q = q.eq("loja_id", lojaId);
  const { data, error } = await q;
  if (error) throw error;
  const linhas = data || [];
  const ids = linhas.map((b: any) => b.id);
  const trocadas: Record<number, any> = {};
  if (ids.length) {
    const { data: sols } = await admin.from("horas_solicitacoes").select("id,batida_id,batida_nova_id,hora_original,hora_nova,motivo,decidido_por,decidido_em").eq("status", "aprovada").in("batida_id", ids);
    for (const s of sols || []) trocadas[s.batida_id] = s;
  }
  const porNova: Record<number, any> = {};
  for (const s of Object.values(trocadas)) if ((s as any).batida_nova_id) porNova[(s as any).batida_nova_id] = s;
  const out: any[] = [];
  for (const b of linhas) {
    if (trocadas[b.id]) continue;   // trocada: aparece pelo ajuste
    const aj = porNova[b.id];
    out.push({ id: b.id, funcionarioId: b.funcionario_id, funcionarioNome: b.funcionario_nome, lojaId: b.loja_id, tipo: b.tipo, em: b.em, dia: b.dia, origem: b.origem,
      distanciaM: b.distancia_m, precisao: b.precisao, bio: !!b.bio, editada: !!aj, original: aj ? aj.hora_original : null, aprovadoPor: aj ? aj.decidido_por : (b.origem === "ajuste" ? "?" : null), motivo: aj ? aj.motivo : null });
  }
  return out;
}

/** minutos trabalhados no dia a partir das batidas efetivas (ordenadas) */
function calcularDia(bats: any[], cfg: any, dia: string) {
  const v = vigenciaEm(cfg, dia);
  const jornadaMin = Math.round((Number(v.horasSemana) * 60) / Math.max(1, Number(v.dias) || 5));
  const s = [...bats].sort((a, b) => String(a.em).localeCompare(String(b.em)));
  let trab = 0, ini: number | null = null, aberto = false, almocoMin = 0, almocoIni: number | null = null;
  for (const b of s) {
    const t = new Date(b.em).getTime();
    if (b.tipo === "entrada" || b.tipo === "almoco_volta") { if (b.tipo === "almoco_volta" && almocoIni != null) { almocoMin += Math.round((t - almocoIni) / 60000); almocoIni = null; } ini = t; }
    else if (b.tipo === "almoco_saida" || b.tipo === "saida") { if (ini != null) { trab += (t - ini) / 60000; ini = null; } if (b.tipo === "almoco_saida") almocoIni = t; }
  }
  if (ini != null) aberto = true;
  trab = Math.round(trab);
  const temSaida = s.some((b) => b.tipo === "saida");
  const alertas: string[] = [];
  const tol = Number(cfg.toleranciaMin) || 0;
  let extra = 0, falta = 0;
  if (temSaida) {
    const dif = trab - jornadaMin;
    if (Math.abs(dif) > tol) { if (dif > 0) extra = dif; else falta = -dif; }
    if (trab > 360 && almocoMin && almocoMin < Number(cfg.almocoMinimoMin)) alertas.push(`Almoço de ${almocoMin} min (mínimo ${cfg.almocoMinimoMin})`);
    if (trab > 360 && !almocoMin) alertas.push("Jornada acima de 6 h sem registro de almoço");
  } else if (s.length) alertas.push("Jornada sem saída registrada");
  const extra50 = Math.min(120, extra), extra70 = Math.max(0, extra - 120);
  return { dia, jornadaMin, trabalhadoMin: trab, extra50Min: extra50, extra70Min: extra70, faltaMin: falta, almocoMin, aberto, alertas };
}

/** o que a pessoa pode registrar agora, pelo que já registrou no dia */
function permitidos(bats: any[]): string[] {
  const s = [...bats].sort((a, b) => String(a.em).localeCompare(String(b.em)));
  if (!s.length) return ["entrada"];
  const ult = s[s.length - 1].tipo;
  if (ult === "saida") return [];
  if (ult === "almoco_saida") return ["almoco_volta"];
  const jaAlmoco = s.some((b) => b.tipo === "almoco_saida");
  return jaAlmoco ? ["saida"] : ["almoco_saida", "saida"];
}

// ------------------------------------------------------------------ biometria (WebAuthn, ES256) — só chave pública fica guardada
const enc = new TextEncoder();
const b64u = (buf: ArrayBuffer | Uint8Array) => { const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const fromB64u = (s: string) => { const p = String(s || "").replace(/-/g, "+").replace(/_/g, "/"); const b = atob(p + "=".repeat((4 - (p.length % 4)) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const sha256 = async (d: Uint8Array | string) => new Uint8Array(await crypto.subtle.digest("SHA-256", typeof d === "string" ? enc.encode(d) : d));
const iguais = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const hmacHex = async (txt: string) => {
  const k = await crypto.subtle.importKey("raw", enc.encode("horas:" + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(txt)))).map((x) => x.toString(16).padStart(2, "0")).join("");
};
/** desafio sem estado: ts.aleatório.assinatura (amarrado a pessoa e ao uso; vale 2 min) */
const novoDesafio = async (uid: string, modo: string) => { const ts = Date.now(), rnd = b64u(crypto.getRandomValues(new Uint8Array(16))); return `${ts}.${rnd}.${await hmacHex(`${uid}|${modo}|${ts}|${rnd}`)}`; };
const desafioValido = async (ch: string, uid: string, modo: string) => { const [ts, rnd, mac] = String(ch || "").split("."); if (!ts || !rnd || !mac || Math.abs(Date.now() - Number(ts)) > 120000) return false; return (await hmacHex(`${uid}|${modo}|${ts}|${rnd}`)) === mac; };
const HOSTS_OK = ["vilaca.app", "www.vilaca.app", "teste.vilaca.app", "treino.vilaca.app", "vilaca-controle-lojas.vercel.app"];
const ehProjetoTeste = String(Deno.env.get("SUPABASE_URL") || "").includes("mpgkvstzigeaimuynpxc");
const hostDaOrigem = (o: string): string | null => { try { const u = new URL(o); if (u.protocol === "https:" && HOSTS_OK.includes(u.hostname)) return u.hostname; if (ehProjetoTeste && u.hostname === "localhost") return u.hostname; } catch { /* origem inválida */ } return null; };
function cbor(b: Uint8Array, o = 0): [any, number] {
  const ib = b[o++], mt = ib >> 5, ai = ib & 31; let n = ai;
  if (ai === 24) n = b[o++]; else if (ai === 25) { n = (b[o] << 8) | b[o + 1]; o += 2; } else if (ai === 26) { n = ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; o += 4; } else if (ai > 26) throw new Error("cbor");
  if (mt === 0) return [n, o]; if (mt === 1) return [-1 - n, o];
  if (mt === 2) return [b.slice(o, o + n), o + n];
  if (mt === 3) return [new TextDecoder().decode(b.slice(o, o + n)), o + n];
  if (mt === 4) { const a: any[] = []; for (let i = 0; i < n; i++) { const [v, p] = cbor(b, o); a.push(v); o = p; } return [a, o]; }
  if (mt === 5) { const m = new Map(); for (let i = 0; i < n; i++) { const [k, p] = cbor(b, o); const [v, q] = cbor(b, p); m.set(k, v); o = q; } return [m, o]; }
  if (mt === 7) return [ai === 20 ? false : ai === 21 ? true : null, o];
  throw new Error("cbor");
}
function derParaRaw(der: Uint8Array): Uint8Array {
  let o = 2; if (der[1] & 0x80) o = 2 + (der[1] & 0x7f);
  const ler = (): Uint8Array => { if (der[o++] !== 2) throw new Error("der"); const l = der[o++]; let v = der.slice(o, o + l); o += l; while (v.length > 32 && v[0] === 0) v = v.slice(1); const out = new Uint8Array(32); out.set(v, 32 - v.length); return out; };
  const r = ler(), s = ler(); const raw = new Uint8Array(64); raw.set(r, 0); raw.set(s, 32); return raw;
}
const lerAuth = (ad: Uint8Array) => ({ rpIdHash: ad.slice(0, 32), flags: ad[32], counter: ((ad[33] << 24) | (ad[34] << 16) | (ad[35] << 8) | ad[36]) >>> 0 });
/** confere o clientDataJSON (tipo, origem permitida, desafio nosso e desta pessoa) e devolve o host (rpId) */
async function conferirCliente(clientB64: string, tipo: string, uid: string, modo: string): Promise<{ host: string; bytes: Uint8Array }> {
  const bytes = fromB64u(clientB64); let cd: any; try { cd = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw erro("Resposta da biometria inválida."); }
  if (cd.type !== tipo) throw erro("Resposta da biometria inválida.");
  const host = hostDaOrigem(String(cd.origin || "")); if (!host) throw erro("Este endereço do app não está liberado para biometria.");
  const ch = new TextDecoder().decode(fromB64u(String(cd.challenge || "")));
  if (!(await desafioValido(ch, uid, modo))) throw erro("A biometria demorou demais ou já foi usada. Tente de novo.");
  return { host, bytes };
}
async function verificarRegistro(p: any, uid: string) {
  const { host } = await conferirCliente(p.clientDataJSON, "webauthn.create", uid, "create");
  const [att] = cbor(fromB64u(p.attestationObject)); const ad: Uint8Array = att.get("authData");
  const info = lerAuth(ad);
  if (!iguais(info.rpIdHash, await sha256(host))) throw erro("Biometria de outro endereço.");
  if (!(info.flags & 0x01) || !(info.flags & 0x04)) throw erro("O celular não confirmou a biometria (impressão digital ou rosto).");
  if (!(info.flags & 0x40)) throw erro("Cadastro de biometria incompleto.");
  const idLen = (ad[53] << 8) | ad[54]; const credId = ad.slice(55, 55 + idLen);
  if (b64u(credId) !== String(p.credentialId)) throw erro("Cadastro de biometria inconsistente.");
  const [cose] = cbor(ad, 55 + idLen);
  if (cose.get(3) !== -7 || cose.get(-1) !== 1) throw erro("Este celular usou um tipo de chave não suportado.");
  return { host, credId: b64u(credId), jwk: { kty: "EC", crv: "P-256", x: b64u(cose.get(-2)), y: b64u(cose.get(-3)), ext: true } };
}
async function verificarUso(p: any, uid: string, cred: any) {
  const { host, bytes } = await conferirCliente(p.clientDataJSON, "webauthn.get", uid, "get");
  const ad = fromB64u(p.authenticatorData); const info = lerAuth(ad);
  if (!iguais(info.rpIdHash, await sha256(host))) throw erro("Biometria de outro endereço.");
  if (!(info.flags & 0x01) || !(info.flags & 0x04)) throw erro("O celular não confirmou a biometria (impressão digital ou rosto).");
  const dados = new Uint8Array(ad.length + 32); dados.set(ad, 0); dados.set(await sha256(bytes), ad.length);
  const chave = await crypto.subtle.importKey("jwk", cred.public_key, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  let ok = false; try { ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, chave, derParaRaw(fromB64u(p.signature)), dados); } catch { ok = false; }
  if (!ok) throw erro("Biometria não conferiu. Tente de novo.", 401);
  const antes = Number(cred.counter) || 0;
  if ((info.counter !== 0 || antes !== 0) && info.counter <= antes) throw erro("Biometria rejeitada (possível cópia). Fale com a Diretoria.", 401);
  return info.counter;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    const { data: cfgRow } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config = (cfgRow && cfgRow.payload) || {};
    const users: any[] = config.users || [];
    const user = users.find((u: any) => sessaoValida(u, b.senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    const mod = user.permissoes && user.permissoes.horas;
    if (mod && typeof mod.ativo === "boolean" && !mod.ativo) return json({ error: "Seu acesso não tem o módulo Controle de horas." }, 403);
    const nivel = user.nivel || "vendedora";
    const ehDir = nivel === "diretoria", ehGer = nivel === "gerente";
    const funcs: any[] = config.funcionarios || [];
    const meuId = String(user.funcionarioId || user.id);
    const fMeu = funcs.find((x) => x.id === (user.funcionarioId || user.id));
    const meuNome = (fMeu && (String(fMeu.apelido || "").trim() || fMeu.nome)) || user.nome || "";
    const lojasCfg: any[] = (config.lojas || []).map((l: any) => ({ id: l.id, nome: l.nome, abreviacao: l.abreviacao, cor: l.cor, interna: !!l.interna }));
    const lojasUser = lojasDaSessao(user, b.senha);
    const lojasVisiveis = ehDir ? lojasCfg.map((l) => l.id) : lojasUser;   // diretoria vê todas; os demais só as da sessão
    const nomeLoja = (id: string) => (lojasCfg.find((l) => l.id === id) || { nome: id }).nome;
    const pessoaDe = (id: string) => {
      const u = users.find((x: any) => String(x.funcionarioId || x.id) === id);
      const f = funcs.find((x) => x.id === id);
      return { id, nome: (f && (String(f.apelido || "").trim() || f.nome)) || (u && u.nome) || id, nivel: u ? u.nivel : null, lojas: u && Array.isArray(u.lojas) ? u.lojas : [] };
    };
    const todasPessoas = () => users.filter((u: any) => !u.bloqueado && u.nivel).map((u: any) => pessoaDe(String(u.funcionarioId || u.id)));
    /** pessoas que o usuário pode consultar: diretoria todas; gerente as das lojas dele; os demais só ele */
    const pessoasVisiveis = () => {
      if (ehDir) return todasPessoas();
      if (ehGer) return todasPessoas().filter((p: any) => p.id === meuId || p.lojas.some((l: string) => lojasUser.includes(l)));
      return [pessoaDe(meuId)];
    };
    const log = async (acao: string, resumo: string, detalhe: any, registroId?: string, lojaId?: string) => {
      try {
        await admin.from("auditoria_log").insert({ usuario_id: meuId, usuario_nome: meuNome, nivel, loja_sessao: lojaId || lojasUser[0] || null,
          em_outra_loja: !!lojaId && !lojasUser.includes(lojaId) && !ehDir, acao, modulo: "Controle de horas", tabela: "horas_batidas", registro_id: registroId || null, resumo, detalhe: detalhe || {},
          agente: String(req.headers.get("user-agent") || "").slice(0, 160) });
      } catch (e) { console.error("log horas", e); }
    };
    const op = String(b.op || "");
    const p = b.params || {};
    const agora = new Date();
    const hoje = diaDe(agora);
    const precisaDir = () => { if (!ehDir) throw erro("Só a Diretoria pode fazer isso.", 403); };
    const lojaDaBatida = (pedida: unknown) => {
      const id = String(pedida || "");
      if (id && (lojasUser.includes(id) || ehDir)) return id;
      if (lojasUser[0]) return lojasUser[0];
      throw erro("Seu usuário não tem loja de trabalho definida. Peça à Diretoria (DP › Acesso › Loja de trabalho).", 400);
    };
    const avisosDe = async (id: string) => {
      const { data } = await admin.from("horas_solicitacoes").select("*").eq("funcionario_id", id).order("criado_em", { ascending: false }).limit(60);
      const limite = Date.now() - 24 * 3600 * 1000;
      return (data || []).filter((s: any) => s.status === "pendente" || (s.status === "recusada" && s.decidido_em && new Date(s.decidido_em).getTime() > limite))
        .map((s: any) => ({ id: s.id, tipo: s.tipo, tipoBatida: s.tipo_batida, rotulo: ROTULO[s.tipo_batida], dia: s.dia, horaNova: s.hora_nova, horaOriginal: s.hora_original, motivo: s.motivo, status: s.status, motivoDecisao: s.motivo_decisao, decididoPor: s.decidido_por, decididoEm: s.decidido_em, criadoEm: s.criado_em }));
    };

    // ---------------------------------------------------------------- init
    if (op === "init") {
      const { cfg, locais } = await lerConfig();
      const lojaId = lojasUser[0] || (ehDir ? lojasCfg.find((l) => !l.interna)?.id : null) || null;
      const bats = await efetivas([meuId], hoje, hoje);
      const dia = calcularDia(bats, cfg, hoje);
      let pendentes = 0;
      if (ehDir) { const { count } = await admin.from("horas_solicitacoes").select("id", { count: "exact", head: true }).eq("status", "pendente"); pendentes = count || 0; }
      return json({ ok: true, agora: agora.toISOString(), hoje,
        user: { id: meuId, nome: meuNome, nivel, ehDir, ehGer },
        lojas: lojasCfg.filter((l) => lojasVisiveis.includes(l.id)), lojaId,
        local: lojaId ? (locais[lojaId] || null) : null, locaisConfigurados: Object.keys(locais), locaisTodos: ehDir ? locais : undefined,
        config: { biometria: cfg.biometria !== false, almocoMinimoMin: cfg.almocoMinimoMin, raioPadraoM: cfg.raioPadraoM, precisaoMaxM: cfg.precisaoMaxM, toleranciaMin: cfg.toleranciaMin, vigencias: cfg.vigencias },
        hojeBatidas: bats, permitidos: permitidos(bats), resumoHoje: dia, rotulos: ROTULO,
        bio: { obrigatoria: cfg.biometria !== false, credenciais: ((await admin.from("horas_credenciais").select("id,aparelho,criado_em").eq("funcionario_id", meuId).eq("ativo", true)).data || []) },
        avisos: await avisosDe(meuId), pendentesDir: pendentes, pessoas: (ehDir || ehGer) ? pessoasVisiveis() : [] });
    }

    // ---------------------------------------------------------------- bater
    if (op === "bater") {
      const tipo = String(p.tipo || "");
      if (!TIPOS.includes(tipo)) throw erro("Tipo de registro inválido.");
      const lojaId = lojaDaBatida(p.lojaId);
      const lat = Number(p.lat), lng = Number(p.lng), precisao = Number(p.precisao);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(precisao) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
        throw erro("Não foi possível ler a localização do celular. Ligue a localização (GPS), permita o acesso e tente de novo.");
      const posTs = Number(p.posTs);
      if (Number.isFinite(posTs) && Math.abs(Date.now() - posTs) > 90000) throw erro("A localização está desatualizada. Tente de novo.");
      const { cfg, locais } = await lerConfig();
      const loc = locais[lojaId];
      if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lng)))
        throw erro(`A localização da loja ${nomeLoja(lojaId)} ainda não foi cadastrada. Peça à Diretoria (Controle de horas › Configurações).`);
      const raio = Number(loc.raio) > 0 ? Number(loc.raio) : cfg.raioPadraoM;
      const dist = metros(lat, lng, Number(loc.lat), Number(loc.lng));
      const bloquear = async (motivo: string) => {
        await log("horas_recusada_local", `Registro de ${ROTULO[tipo]} recusado (${motivo})`, { tipo, lojaId, distanciaM: Math.round(dist), precisao: Math.round(precisao), raioM: raio, lat, lng }, undefined, lojaId);
        throw erro(motivo);
      };
      if (precisao > cfg.precisaoMaxM) await bloquear(`Sinal de localização fraco (precisão de ${Math.round(precisao)} m). Vá para perto da porta ou janela e tente de novo.`);
      if (dist > raio) await bloquear(`O celular está a ${Math.round(dist)} m da loja ${nomeLoja(lojaId)} (limite ${Math.round(raio)} m). O registro só vale dentro da loja.`);
      const doDia = await efetivas([meuId], hoje, hoje);
      if (!permitidos(doDia).includes(tipo)) throw erro(doDia.length && doDia[doDia.length - 1].tipo === "saida" ? "Sua jornada de hoje já foi encerrada. Para um registro extra, use \"Registro fora do horário\"." : `Agora não dá para registrar "${ROTULO[tipo]}" (sequência do dia).`);
      const { data: ult } = await admin.from("horas_batidas").select("em").eq("funcionario_id", meuId).order("id", { ascending: false }).limit(1);
      if (ult && ult[0] && Date.now() - new Date(ult[0].em).getTime() < 20000) throw erro("Aguarde alguns segundos antes de registrar de novo.");
      // biometria do celular: quem já cadastrou sempre precisa confirmar; se a Diretoria exige, quem não cadastrou é barrado
      const { data: creds } = await admin.from("horas_credenciais").select("*").eq("funcionario_id", meuId).eq("ativo", true);
      let credUsada: any = null;
      if ((creds && creds.length) || cfg.biometria !== false) {
        if (!creds || !creds.length) throw erro("Cadastre a biometria deste celular antes de registrar (toque em \"Cadastrar biometria neste celular\").", 428);
        const bio = p.bio;
        if (!bio || !bio.credentialId) throw erro("Confirme com a biometria do celular (impressão digital ou rosto).", 428);
        credUsada = creds.find((c: any) => c.id === String(bio.credentialId));
        if (!credUsada) throw erro("Esta biometria não está cadastrada para você. Cadastre a biometria neste celular.", 428);
        try { credUsada.novoContador = await verificarUso(bio, meuId, credUsada); }
        catch (e: any) { await log("horas_bio_recusada", `Biometria recusada no registro de ${ROTULO[tipo]}: ${e.message}`, { tipo, lojaId }, undefined, lojaId); throw e; }
      }
      const { data: ins, error } = await admin.from("horas_batidas").insert({ funcionario_id: meuId, funcionario_nome: meuNome, loja_id: lojaId, tipo, dia: hoje,
        lat, lng, precisao, distancia_m: Math.round(dist * 10) / 10, origem: "app", bio: !!credUsada, credencial: credUsada ? String(credUsada.id).slice(0, 16) : null, agente: String(req.headers.get("user-agent") || "").slice(0, 160) }).select("*").single();
      if (error) throw error;
      await log("horas_registro", `${meuNome}: ${ROTULO[tipo]} às ${hhmmDe(new Date(ins.em))} (${nomeLoja(lojaId)}, a ${Math.round(dist)} m)`, { tipo, lojaId, distanciaM: Math.round(dist), precisao: Math.round(precisao), lat, lng, hash: ins.hash, biometria: !!credUsada }, String(ins.id), lojaId);
      if (credUsada) await admin.from("horas_credenciais").update({ counter: credUsada.novoContador, ultimo_uso: new Date().toISOString() }).eq("id", credUsada.id);
      const bats = await efetivas([meuId], hoje, hoje);
      const dia = calcularDia(bats, cfg, hoje);
      return json({ ok: true, batida: { id: ins.id, tipo, em: ins.em, comprovante: String(ins.hash || "").slice(0, 12).toUpperCase() }, hojeBatidas: bats, permitidos: permitidos(bats), resumoHoje: dia });
    }

    // ---------------------------------------------------------------- solicitar (editar horário / registro fora do horário)
    if (op === "solicitar") {
      const modo = String(p.modo || "");
      if (modo !== "editar" && modo !== "fora_horario") throw erro("Tipo de solicitação inválido.");
      const motivo = texto(p.motivo, 500);
      if (motivo.length < 5) throw erro("Explique o motivo (mínimo 5 letras).");
      if (!isoDia(p.dia) || p.dia > hoje) throw erro("Dia inválido (não pode ser futuro).");
      if (p.dia < diaDe(new Date(Date.now() - 62 * 86400000))) throw erro("Só dá para solicitar ajustes dos últimos 60 dias.");
      if (!/^\d{2}:\d{2}$/.test(String(p.hora || ""))) throw erro("Horário inválido.");
      const horaNova = new Date(`${p.dia}T${p.hora}:00-03:00`);
      if (isNaN(horaNova.getTime()) || horaNova.getTime() > Date.now() + 60000) throw erro("O horário não pode estar no futuro.");
      let tipoBatida = String(p.tipoBatida || ""), batidaId: number | null = null, horaOriginal: string | null = null, lojaId = lojaDaBatida(p.lojaId);
      if (modo === "editar") {
        const { data: orig } = await admin.from("horas_batidas").select("*").eq("id", Number(p.batidaId)).maybeSingle();
        if (!orig || orig.funcionario_id !== meuId) throw erro("Registro não encontrado.");
        const efet = await efetivas([meuId], orig.dia, orig.dia);
        if (!efet.some((x) => x.id === orig.id)) throw erro("Este registro já foi corrigido. Edite o registro atual do dia.");
        const { count } = await admin.from("horas_solicitacoes").select("id", { count: "exact", head: true }).eq("batida_id", orig.id).eq("status", "pendente");
        if (count) throw erro("Já existe uma solicitação aguardando a Diretoria para este registro.");
        tipoBatida = orig.tipo; batidaId = orig.id; horaOriginal = orig.em; lojaId = orig.loja_id;
        p.dia = orig.dia;
      } else if (!TIPOS.includes(tipoBatida)) throw erro("Escolha o tipo de registro.");
      const diaFinal = modo === "editar" ? String(p.dia) : String(p.dia);
      const horaFinal = modo === "editar" ? new Date(`${diaFinal}T${p.hora}:00-03:00`) : horaNova;
      if (isNaN(horaFinal.getTime()) || horaFinal.getTime() > Date.now() + 60000) throw erro("O horário não pode estar no futuro.");
      const { data: sol, error } = await admin.from("horas_solicitacoes").insert({ tipo: modo, funcionario_id: meuId, funcionario_nome: meuNome, loja_id: lojaId, batida_id: batidaId,
        tipo_batida: tipoBatida, dia: diaFinal, hora_original: horaOriginal, hora_nova: horaFinal.toISOString(), motivo }).select("*").single();
      if (error) throw error;
      await log("horas_solicitacao", `${meuNome} pediu ${modo === "editar" ? "para corrigir" : "registro fora do horário:"} ${ROTULO[tipoBatida]} de ${diaFinal} para ${p.hora}`, { modo, tipoBatida, dia: diaFinal, horaOriginal, horaNova: horaFinal.toISOString(), motivo }, String(sol.id), lojaId);
      return json({ ok: true, id: sol.id, avisos: await avisosDe(meuId) });
    }

    // ---------------------------------------------------------------- minhas (avisos + histórico recente)
    if (op === "minhas") {
      const { data } = await admin.from("horas_solicitacoes").select("*").eq("funcionario_id", meuId).order("criado_em", { ascending: false }).limit(40);
      return json({ ok: true, avisos: await avisosDe(meuId), historico: data || [] });
    }

    // ---------------------------------------------------------------- espelho mensal
    if (op === "espelho") {
      const alvo = String(p.funcionarioId || meuId);
      if (!pessoasVisiveis().some((x: any) => x.id === alvo)) throw erro("Sem acesso a este funcionário.", 403);
      const mes = /^\d{4}-\d{2}$/.test(String(p.mes || "")) ? String(p.mes) : hoje.slice(0, 7);
      const de = mes + "-01", fim = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);
      const ate = fim > hoje ? hoje : fim;
      const { cfg } = await lerConfig();
      const bats = await efetivas([alvo], de, fim);
      const dias = diasEntre(de, ate).map((d) => { const bs = bats.filter((x) => x.dia === d); return { ...calcularDia(bs, cfg, d), batidas: bs }; }).filter((d) => d.batidas.length);
      const tot = dias.reduce((t, d) => ({ trabalhadoMin: t.trabalhadoMin + d.trabalhadoMin, extra50Min: t.extra50Min + d.extra50Min, extra70Min: t.extra70Min + d.extra70Min, faltaMin: t.faltaMin + d.faltaMin, dias: t.dias + 1 }), { trabalhadoMin: 0, extra50Min: 0, extra70Min: 0, faltaMin: 0, dias: 0 });
      if (alvo !== meuId) await log("horas_consulta", `Consultou o espelho de ${pessoaDe(alvo).nome} (${mes})`, { alvo, mes });
      return json({ ok: true, pessoa: pessoaDe(alvo), mes, dias, totais: tot });
    }

    // ---------------------------------------------------------------- equipe (quem está trabalhando hoje / no dia)
    if (op === "equipe") {
      if (!ehDir && !ehGer) throw erro("Sem acesso.", 403);
      const dia = isoDia(p.dia) ? String(p.dia) : hoje;
      const filtroLoja = p.lojaId ? String(p.lojaId) : "";
      if (filtroLoja && !lojasVisiveis.includes(filtroLoja)) throw erro("Sem acesso a esta loja.", 403);
      const pessoas = pessoasVisiveis().filter((x: any) => !filtroLoja || x.lojas.includes(filtroLoja));
      const { cfg } = await lerConfig();
      const bats = await efetivas(pessoas.map((x: any) => x.id), dia, dia);
      const linhas = pessoas.map((x: any) => { const bs = bats.filter((y) => y.funcionarioId === x.id); const c = calcularDia(bs, cfg, dia);
        return { ...x, batidas: bs, ultimo: bs.length ? bs[bs.length - 1].tipo : null, trabalhadoMin: c.trabalhadoMin, alertas: c.alertas, aberto: c.aberto }; });
      return json({ ok: true, dia, linhas });
    }

    // ---------------------------------------------------------------- pendências / histórico de solicitações (Diretoria)
    if (op === "pendencias" || op === "historico") {
      precisaDir();
      let q = admin.from("horas_solicitacoes").select("*").order("criado_em", { ascending: false }).limit(op === "pendencias" ? 200 : Math.min(Number(p.limite) || 200, 500));
      if (op === "pendencias") q = q.eq("status", "pendente");
      else { if (p.status) q = q.eq("status", String(p.status)); if (p.funcionarioId) q = q.eq("funcionario_id", String(p.funcionarioId)); if (p.lojaId) q = q.eq("loja_id", String(p.lojaId)); }
      const { data, error } = await q;
      if (error) throw error;
      return json({ ok: true, itens: (data || []).map((s: any) => ({ ...s, rotulo: ROTULO[s.tipo_batida], lojaNome: nomeLoja(s.loja_id) })) });
    }

    // ---------------------------------------------------------------- decidir (Diretoria)
    if (op === "decidir") {
      precisaDir();
      const id = Number(p.id), aprovar = p.aprovar === true;
      const motivoDec = texto(p.motivo, 300);
      if (!aprovar && motivoDec.length < 3) throw erro("Para recusar, escreva o motivo.");
      const { data: s0 } = await admin.from("horas_solicitacoes").select("*").eq("id", id).maybeSingle();
      if (!s0) throw erro("Solicitação não encontrada.", 404);
      if (s0.status !== "pendente") throw erro("Esta solicitação já foi decidida.");
      const { data: marc } = await admin.from("horas_solicitacoes").update({ status: aprovar ? "aprovada" : "recusada", decidido_por: meuNome, decidido_em: new Date().toISOString(), motivo_decisao: motivoDec || null }).eq("id", id).eq("status", "pendente").select("*");
      if (!marc || !marc.length) throw erro("Esta solicitação já foi decidida.");
      let novaId: number | null = null;
      if (aprovar) {
        const { data: nb, error } = await admin.from("horas_batidas").insert({ funcionario_id: s0.funcionario_id, funcionario_nome: s0.funcionario_nome, loja_id: s0.loja_id, tipo: s0.tipo_batida,
          em: s0.hora_nova, dia: s0.dia, origem: "ajuste", solicitacao_id: s0.id, agente: `aprovado por ${meuNome}` }).select("id").single();
        if (error) { await admin.from("horas_solicitacoes").update({ status: "pendente", decidido_por: null, decidido_em: null, motivo_decisao: null }).eq("id", id); throw error; }
        novaId = nb.id;
        await admin.from("horas_solicitacoes").update({ batida_nova_id: novaId }).eq("id", id);
      }
      await log(aprovar ? "horas_aprovada" : "horas_recusada", `${aprovar ? "Aprovou" : "Recusou"} ${s0.tipo === "editar" ? "correção" : "registro fora do horário"} de ${s0.funcionario_nome}: ${ROTULO[s0.tipo_batida]} de ${s0.dia} (${hhmmDe(new Date(s0.hora_nova))})`,
        { solicitacao: id, funcionario: s0.funcionario_id, de: s0.hora_original, para: s0.hora_nova, motivoPedido: s0.motivo, motivoDecisao: motivoDec, batidaNova: novaId }, String(id), s0.loja_id);
      const { count } = await admin.from("horas_solicitacoes").select("id", { count: "exact", head: true }).eq("status", "pendente");
      return json({ ok: true, pendentes: count || 0 });
    }

    // ---------------------------------------------------------------- relatório por período (Diretoria; gerente nas lojas dele)
    if (op === "relatorio") {
      if (!ehDir && !ehGer) throw erro("Sem acesso.", 403);
      if (!isoDia(p.de) || !isoDia(p.ate) || p.de > p.ate) throw erro("Período inválido.");
      const ate = p.ate > hoje ? hoje : String(p.ate);
      if (diasEntre(p.de, ate).length > 93) throw erro("Escolha no máximo 3 meses.");
      const filtroLoja = p.lojaId ? String(p.lojaId) : "";
      const pessoas = pessoasVisiveis().filter((x: any) => (!filtroLoja || x.lojas.includes(filtroLoja)) && (!p.funcionarioId || x.id === String(p.funcionarioId)));
      const { cfg } = await lerConfig();
      const bats = await efetivas(pessoas.map((x: any) => x.id), p.de, ate);
      const linhas = pessoas.map((x: any) => {
        const mine = bats.filter((y) => y.funcionarioId === x.id);
        const dias = diasEntre(p.de, ate).map((d) => calcularDia(mine.filter((y) => y.dia === d), cfg, d)).filter((d) => mine.some((y) => y.dia === d.dia));
        const t = dias.reduce((a, d) => ({ trab: a.trab + d.trabalhadoMin, e50: a.e50 + d.extra50Min, e70: a.e70 + d.extra70Min, falta: a.falta + d.faltaMin, alertas: a.alertas + d.alertas.length }), { trab: 0, e50: 0, e70: 0, falta: 0, alertas: 0 });
        return { id: x.id, nome: x.nome, lojas: x.lojas.map(nomeLoja), dias: dias.length, trabalhadoMin: t.trab, extra50Min: t.e50, extra70Min: t.e70, faltaMin: t.falta, alertas: t.alertas };
      }).filter((l: any) => l.dias > 0 || !p.somenteComRegistro);
      await log("horas_consulta", `Relatório de horas ${p.de} a ${ate}`, { lojaId: filtroLoja, funcionarioId: p.funcionarioId || null });
      return json({ ok: true, de: p.de, ate, linhas });
    }

    // ---------------------------------------------------------------- logs (Diretoria): tudo do módulo, batidas incluídas
    if (op === "logs") {
      precisaDir();
      let q = admin.from("auditoria_log").select("*").eq("modulo", "Controle de horas").order("id", { ascending: false }).limit(Math.min(Number(p.limite) || 200, 500));
      if (p.antesDe) q = q.lt("id", Number(p.antesDe));
      if (p.acao) q = q.eq("acao", String(p.acao));
      if (p.usuarioId) q = q.eq("usuario_id", String(p.usuarioId));
      const { data, error } = await q;
      if (error) throw error;
      return json({ ok: true, itens: data || [] });
    }

    // ---------------------------------------------------------------- configurações (Diretoria)
    if (op === "salvarLocal") {
      precisaDir();
      const lojaId = String(p.lojaId || "");
      if (!lojasCfg.some((l) => l.id === lojaId)) throw erro("Loja inválida.");
      const lat = Number(p.lat), lng = Number(p.lng), raio = Number(p.raio);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw erro("Coordenadas inválidas.");
      if (!Number.isFinite(raio) || raio < 20 || raio > 1000) throw erro("Raio entre 20 e 1000 metros.");
      const { locais } = await lerConfig();
      const antes = locais[lojaId] || null;
      locais[lojaId] = { lat, lng, raio: Math.round(raio) };
      const { error } = await admin.from("horas_config").upsert({ id: "locais", payload: locais, atualizado_em: new Date().toISOString() });
      if (error) throw error;
      await log("horas_config_local", `Definiu a localização da loja ${nomeLoja(lojaId)} (raio ${Math.round(raio)} m)`, { lojaId, antes, depois: locais[lojaId] }, lojaId, lojaId);
      return json({ ok: true, locais });
    }
    if (op === "salvarConfig") {
      precisaDir();
      const { cfg } = await lerConfig();
      const novo: any = { ...cfg };
      if (p.biometria !== undefined) novo.biometria = p.biometria === true;
      delete novo.cafeConta; delete novo.cafeMinutos;
      for (const k of ["almocoMinimoMin", "raioPadraoM", "precisaoMaxM", "toleranciaMin"]) if (p[k] !== undefined) { const n = Number(p[k]); if (!Number.isFinite(n) || n < 0 || n > 1000) throw erro(`Valor inválido em ${k}.`); novo[k] = n; }
      if (Array.isArray(p.vigencias)) {
        const v = p.vigencias.map((x: any) => ({ de: String(x.de || ""), horasSemana: Number(x.horasSemana), dias: Number(x.dias), confirmado: x.confirmado === true }));
        if (!v.length || v.some((x: any) => !isoDia(x.de) || !(x.horasSemana > 0 && x.horasSemana <= 60) || !(x.dias >= 1 && x.dias <= 7))) throw erro("Jornada inválida (data, horas por semana e dias por semana).");
        novo.vigencias = v;
      }
      const { error } = await admin.from("horas_config").upsert({ id: "config", payload: novo, atualizado_em: new Date().toISOString() });
      if (error) throw error;
      await log("horas_config", "Alterou as configurações do Controle de horas", { antes: cfg, depois: novo });
      return json({ ok: true });
    }

    // ---------------------------------------------------------------- biometria do celular
    if (op === "bioDesafio") {
      const modo = p.modo === "create" ? "create" : "get";
      const { data: creds } = await admin.from("horas_credenciais").select("id").eq("funcionario_id", meuId).eq("ativo", true);
      return json({ ok: true, challenge: await novoDesafio(meuId, modo), credenciais: (creds || []).map((c: any) => c.id),
        user: { id: b64u(await sha256("horas:" + meuId)), nome: meuNome } });
    }
    if (op === "bioRegistrar") {
      const r = await verificarRegistro(p, meuId);
      const { data: dono } = await admin.from("horas_credenciais").select("funcionario_id").eq("id", r.credId).maybeSingle();
      if (dono && dono.funcionario_id !== meuId) throw erro("Esta biometria já pertence a outra pessoa.", 409);
      const { error } = await admin.from("horas_credenciais").upsert({ id: r.credId, funcionario_id: meuId, funcionario_nome: meuNome, public_key: r.jwk, counter: 0, rp_id: r.host,
        aparelho: texto(p.aparelho, 80) || String(req.headers.get("user-agent") || "").slice(0, 120), ativo: true, criado_em: new Date().toISOString() });
      if (error) throw error;
      await log("horas_bio_cadastrada", `${meuNome} cadastrou a biometria de um celular (${r.host})`, { host: r.host, credencial: r.credId.slice(0, 16) });
      const { data: creds } = await admin.from("horas_credenciais").select("id,aparelho,criado_em").eq("funcionario_id", meuId).eq("ativo", true);
      return json({ ok: true, credenciais: creds || [] });
    }
    if (op === "bioLista") {
      precisaDir();
      const { data } = await admin.from("horas_credenciais").select("id,funcionario_id,funcionario_nome,aparelho,rp_id,criado_em,ultimo_uso").eq("ativo", true).order("criado_em", { ascending: false });
      return json({ ok: true, itens: data || [] });
    }
    if (op === "bioRemover") {
      precisaDir();
      const { data: c } = await admin.from("horas_credenciais").select("id,funcionario_nome").eq("id", String(p.id || "")).maybeSingle();
      if (!c) throw erro("Cadastro de biometria não encontrado.", 404);
      await admin.from("horas_credenciais").update({ ativo: false }).eq("id", c.id);
      await log("horas_bio_removida", `Removeu a biometria cadastrada de ${c.funcionario_nome}`, { credencial: String(c.id).slice(0, 16) });
      return json({ ok: true });
    }

    return json({ error: "operação desconhecida" }, 400);
  } catch (e: any) {
    const status = e && e.status ? e.status : 500;
    if (status >= 500) console.error("horas-api", e);
    return json({ error: (e && e.message) || "Erro interno." }, status);
  }
});
