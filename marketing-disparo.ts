// marketing-disparo v2 (06/11/2026) — v2: op processar aceita ignorarHorario (teste manual, só com a chave do agendamento).
// marketing-disparo v1 (06/11/2026) — fila de WhatsApp do módulo MARKETING (número de disparo "vilaca").
// App (com sessão): enfileirar / fila / cancelar.  pg_cron (todo minuto, header x-cron-token): processar.
// Regras de envio (pedido do Felipe, 06/11):
//  - 1 mensagem a cada 30 s; a cada 30 enviadas, pausa de 2 min; cada novo ciclo de 30 deixa os tempos 10% maiores (1,1^ciclo, zera todo dia).
//  - Só das 09h às 18h (horário de Brasília). Aniversário que não saiu no dia é cancelado ("expirado"); o resto fica para o dia seguinte.
//  - Os tipos de mensagem são intercalados e embaralhados (nunca o mesmo tipo duas vezes seguidas, se houver outro na fila).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const INSTANCIA = "vilaca";
const INTERVALO_S = 30, PAUSA_S = 120, POR_CICLO = 30, AUMENTO = 1.1, HORA_INI = 9, HORA_FIM = 18;
const TIPOS = ["aniversario", "posVenda", "campanha", "chamar"];

let cacheSeg: { em: number; v: Record<string, string> } | null = null;
async function segredos() {
  if (cacheSeg && Date.now() - cacheSeg.em < 60000) return cacheSeg.v;
  const { data } = await admin.from("atendimento_segredos").select("chave, valor").in("chave", ["EVOLUTION_URL", "EVOLUTION_API_KEY", "MARKETING_CRON_TOKEN"]);
  const v: Record<string, string> = {}; for (const r of data || []) v[r.chave] = r.valor;
  if (v.EVOLUTION_URL) v.EVOLUTION_URL = v.EVOLUTION_URL.replace(/\/+$/, "");
  cacheSeg = { em: Date.now(), v }; return v;
}
function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
function podeMarketing(u: any) {
  if (!u || u.nivel === "oficina") return false;
  const p = u.permissoes && u.permissoes.marketing;
  return !(p && p.ativo === false);
}
function normalizaTelefone(t: string): string | null {
  let d = String(t || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);
  if (d.length !== 11) return null;
  return "55" + d;
}
/** Data (AAAA-MM-DD) e hora em Brasília. */
function agoraBR(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), min: Number(p.minute) };
}
let IGNORAR_HORARIO = false;
const dentroDoHorario = (b = agoraBR()) => IGNORAR_HORARIO || (b.hora >= HORA_INI && b.hora < HORA_FIM);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function usuarioDaSessao(senha: string) {
  const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  const cfg: any = (data && data.payload) || {};
  return (Array.isArray(cfg.users) ? cfg.users : []).find((u: any) => sessaoValida(u, senha)) || null;
}

/* ---------------- processar (pg_cron, todo minuto; roda ~50 s) ---------------- */
async function processar(ignorarHorario = false) {   // ignorarHorario: só para teste manual (exige a chave do agendamento)
  const inicio = Date.now(), LIMITE = 50000;
  IGNORAR_HORARIO = !!ignorarHorario;
  const hoje = agoraBR();
  // Aniversário só vale no dia: os de dias anteriores, ou todos depois das 18h, viram "expirado".
  {
    const { data: aniv } = await admin.from("marketing_fila").select("id, dia_criacao").eq("status", "pendente").eq("tipo", "aniversario");
    const vencidos = (aniv || []).filter((r: any) => r.dia_criacao < hoje.dia || (!IGNORAR_HORARIO && hoje.hora >= HORA_FIM)).map((r: any) => r.id);
    if (vencidos.length) await admin.from("marketing_fila").update({ status: "expirado", erro: "Fora do horário (9h–18h) no dia do aniversário", atualizado_em: new Date().toISOString() }).in("id", vencidos);
  }
  if (!dentroDoHorario(hoje)) return { ok: true, fora: true };
  // trava: só uma execução por vez
  const ate = new Date(Date.now() + 58000).toISOString();
  const { data: trava } = await admin.from("marketing_disparo_estado").update({ rodando_ate: ate }).eq("id", 1).or(`rodando_ate.is.null,rodando_ate.lt.${new Date().toISOString()}`).select().maybeSingle();
  if (!trava) return { ok: true, ocupado: true };
  let est: any = trava;
  if (est.dia !== hoje.dia) est = { ...est, dia: hoje.dia, enviados_dia: 0, proximo_em: new Date().toISOString(), ultimo_tipo: null };
  const seg = await segredos();
  const H = { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY };
  let conectado: boolean | null = null, enviados = 0;
  try {
    while (Date.now() - inicio < LIMITE) {
      if (!dentroDoHorario()) break;
      const prox = new Date(est.proximo_em || 0).getTime();
      if (Date.now() < prox) { const w = prox - Date.now(); if (Date.now() - inicio + w > LIMITE) break; await espera(w); continue; }
      // próximo item: tipos embaralhados, evitando repetir o último tipo
      const { data: pend } = await admin.from("marketing_fila").select("id, tipo").eq("status", "pendente").order("id", { ascending: true }).limit(500);
      if (!pend || !pend.length) { est.proximo_em = new Date().toISOString(); break; }
      const tipos = [...new Set(pend.map((p: any) => p.tipo))];
      const candidatos = tipos.length > 1 ? tipos.filter((t) => t !== est.ultimo_tipo) : tipos;
      const tipo = candidatos[Math.floor(Math.random() * candidatos.length)];
      const alvo = pend.find((p: any) => p.tipo === tipo);
      const { data: item } = await admin.from("marketing_fila").select("*").eq("id", alvo.id).eq("status", "pendente").maybeSingle();
      if (!item) continue;
      if (conectado === null) {
        try {
          const rs = await fetch(`${seg.EVOLUTION_URL}/instance/connectionState/${INSTANCIA}`, { headers: H, signal: AbortSignal.timeout(8000) });
          const js = await rs.json().catch(() => ({}));
          conectado = String((js && js.instance && js.instance.state) || "") === "open";
        } catch (_) { conectado = false; }
        if (!conectado) break;   // WhatsApp de disparo fora do ar: tudo fica pendente
      }
      const numero = normalizaTelefone(item.telefone);
      let ok = false, erro = "";
      if (!numero) erro = "Telefone inválido";
      else {
        try {
          const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${INSTANCIA}`, { method: "POST", headers: H, body: JSON.stringify({ number: numero, text: item.texto }), signal: AbortSignal.timeout(20000) });
          const rj = await r.json().catch(() => ({}));
          ok = r.ok && !!(rj && rj.key);
          if (!ok) erro = `WhatsApp recusou (${r.status})`;
        } catch (e) { erro = "Falha de conexão"; }
      }
      const tent = Number(item.tentativas || 0) + 1;
      await admin.from("marketing_fila").update(ok
        ? { status: "enviado", enviado_em: new Date().toISOString(), tentativas: tent, erro: null, atualizado_em: new Date().toISOString() }
        : { status: (!numero || tent >= 3) ? "falhou" : "pendente", tentativas: tent, erro, atualizado_em: new Date().toISOString() }).eq("id", item.id);
      if (!numero) continue;   // não gastou envio
      // tempo até a próxima: 30 s (2 min a cada 30), +10% por ciclo de 30 no dia
      est.enviados_dia = Number(est.enviados_dia || 0) + 1; est.ultimo_tipo = item.tipo; enviados++;
      const ciclo = Math.floor((est.enviados_dia - 1) / POR_CICLO);
      const fator = Math.pow(AUMENTO, ciclo);
      const seg_ = (est.enviados_dia % POR_CICLO === 0 ? PAUSA_S : INTERVALO_S) * fator;
      est.proximo_em = new Date(Date.now() + seg_ * 1000).toISOString();
      await admin.from("marketing_disparo_estado").update({ dia: est.dia, enviados_dia: est.enviados_dia, proximo_em: est.proximo_em, ultimo_tipo: est.ultimo_tipo }).eq("id", 1);
    }
  } finally {
    await admin.from("marketing_disparo_estado").update({ dia: est.dia, enviados_dia: est.enviados_dia, proximo_em: est.proximo_em, ultimo_tipo: est.ultimo_tipo, rodando_ate: null }).eq("id", 1);
  }
  return { ok: true, enviados, conectado };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || "");
    if (op === "processar") {
      const seg = await segredos();
      if (!seg.MARKETING_CRON_TOKEN || req.headers.get("x-cron-token") !== seg.MARKETING_CRON_TOKEN) return json({ error: "não autorizado" }, 401);
      return json(await processar(body.ignorarHorario === true));
    }
    IGNORAR_HORARIO = false;
    const user: any = await usuarioDaSessao(String(body.senha || ""));
    if (!user) return json({ error: "Sessão expirada. Entre de novo." }, 401);
    if (!podeMarketing(user)) return json({ error: "Sem permissão para o Marketing." }, 403);

    if (op === "enfileirar") {
      const itens = Array.isArray(body.itens) ? body.itens.slice(0, 5000) : [];
      const hoje = agoraBR().dia;
      const linhas = itens.map((x: any) => ({
        tipo: TIPOS.includes(x.tipo) ? x.tipo : "campanha", campanha: String(x.campanha || "").slice(0, 120),
        cliente_nome: String(x.nome || "").slice(0, 160), telefone: String(x.telefone || "").slice(0, 40),
        texto: String(x.texto || "").slice(0, 3000), loja_id: x.lojaId ? String(x.lojaId) : null, cliente_id: x.clienteId ? String(x.clienteId) : null,
        criado_por: user.apelido || user.nome || "", dia_criacao: hoje, status: "pendente",
      })).filter((l: any) => l.texto.trim() && l.telefone);
      if (!linhas.length) return json({ error: "Nada para enviar (sem telefone ou sem texto)." }, 400);
      for (let i = 0; i < linhas.length; i += 500) { const { error } = await admin.from("marketing_fila").insert(linhas.slice(i, i + 500)); if (error) throw error; }
      try { await admin.from("auditoria_log").insert({ usuario_id: user.id || null, usuario_nome: user.nome || null, nivel: user.nivel || null, acao: "marketing_enfileirar", modulo: "Marketing", tabela: "marketing_fila", resumo: `Colocou ${linhas.length} mensagem(ns) na fila de WhatsApp (${[...new Set(linhas.map((l: any) => l.tipo))].join(", ")})`, detalhe: { campanha: linhas[0].campanha } }); } catch (_) {}
      const b = agoraBR();
      return json({ ok: true, qtd: linhas.length, foraDoHorario: !dentroDoHorario(b) });
    }
    if (op === "fila") {
      const desde = new Date(Date.now() - 3 * 86400000).toISOString();
      const { data: pend } = await admin.from("marketing_fila").select("id, tipo, campanha, cliente_nome, telefone, status, criado_em, criado_por, dia_criacao").eq("status", "pendente").order("id").limit(1000);
      const { data: rec } = await admin.from("marketing_fila").select("id, tipo, campanha, cliente_nome, telefone, status, criado_em, enviado_em, erro, criado_por, atualizado_em").neq("status", "pendente").gte("atualizado_em", desde).order("atualizado_em", { ascending: false }).limit(300);
      const { data: est } = await admin.from("marketing_disparo_estado").select("dia, enviados_dia, proximo_em").eq("id", 1).maybeSingle();
      const b = agoraBR();
      return json({ ok: true, pendentes: pend || [], recentes: rec || [], estado: est || null, dentroDoHorario: dentroDoHorario(b), agora: b });
    }
    if (op === "cancelar") {
      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Boolean) : [];
      let q = admin.from("marketing_fila").update({ status: "cancelado", erro: "Cancelado por " + (user.apelido || user.nome || ""), atualizado_em: new Date().toISOString() }).eq("status", "pendente");
      if (ids.length) q = q.in("id", ids); else if (body.campanha) q = q.eq("campanha", String(body.campanha)); else if (body.todos !== true) return json({ error: "Diga o que cancelar." }, 400);
      const { data, error } = await q.select("id"); if (error) throw error;
      return json({ ok: true, qtd: (data || []).length });
    }
    return json({ error: "op inválida" }, 400);
  } catch (e) {
    console.error("marketing-disparo", e);
    return json({ error: "Falha no servidor: " + String((e as any)?.message || e).slice(0, 200) }, 500);
  }
});
