// marketing-disparo v4 (07/11/2026) — PROTEÇÕES ANTI-BLOQUEIO: (1) confere se o número tem WhatsApp antes de enviar (sem WhatsApp = cancelado); (2) mala direta/pós-venda com limite
//   diário de AQUECIMENTO (20/dia na 1ª semana, 40 na 2ª, depois 80; MARKETING_LIMITE_DIA em atendimento_segredos sobrescreve) e intervalo sorteado de 45 a 150 s; (3) "digitando…" antes de
//   enviar; (4) variação de texto: {Olá|Oi|Bom dia} sorteia uma opção; (5) rodapé "responda SAIR" em toda mensagem da fila (o disparo-webhook coloca a tag MARKETING OFF); (6) cliente com a
//   tag MARKETING OFF nunca recebe; (7) campanha/pós-venda: no máximo 1 a cada 30 dias por telefone; (8) FREIO AUTOMÁTICO: 3 falhas seguidas (ou 401/403) pausam a fila até alguém apertar "Retomar".
// marketing-disparo v3 (07/11/2026) — ANIVERSÁRIO AGENDADO: ao apertar enviar, o servidor conta quantas mensagens são, vê o tempo que sobra até as 18h
//   (a partir de agora, ou das 9h) e distribui os envios nesse período, com intervalos variados (coluna agendado_para). Os outros tipos (mala direta, pós-venda)
//   seguem o ritmo antigo (30 s...). TELEFONE: só celular no padrão (DDD + 9 + 8 dígitos); fora disso a mensagem nasce CANCELADA (e nunca é enviada). Op nova: planejar (prévia).
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
const RODAPE_SAIR = "\n\nPara não receber mais mensagens, responda SAIR.";
const FALHAS_PARA_PAUSAR = 3, DIAS_ENTRE_CAMPANHAS = 30;
/** {Olá|Oi|Bom dia} → sorteia uma opção (só chaves que têm "|"; {cliente} e outras ficam como estão). */
const varia = (t: string) => String(t || "").replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, (_m, g) => { const o = String(g).split("|"); return o[Math.floor(Math.random() * o.length)].trim(); });
const fone8 = (t: string) => String(t || "").replace(/\D/g, "").slice(-8);
const semAcento = (s: string) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const PALAVRAS_SAIR = ["sair", "parar", "cancelar", "descadastrar", "remover", "nao quero", "pare"];

let cacheSeg: { em: number; v: Record<string, string> } | null = null;
async function segredos() {
  if (cacheSeg && Date.now() - cacheSeg.em < 60000) return cacheSeg.v;
  const { data } = await admin.from("atendimento_segredos").select("chave, valor").in("chave", ["EVOLUTION_URL", "EVOLUTION_API_KEY", "MARKETING_CRON_TOKEN", "MARKETING_LIMITE_DIA"]);
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
/** 07/11: só celular no padrão — DDD (11 a 99) + 9 + 8 dígitos (11 dígitos; aceita o 55 na frente). Qualquer outra coisa é inválida e NÃO é corrigida aqui. */
function normalizaTelefone(t: string): string | null {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11) return null;
  if (Number(d.slice(0, 2)) < 11 || d[2] !== "9") return null;
  return "55" + d;
}
const ERRO_FONE = "Telefone fora do padrão de celular (DDD + 9 + 8 dígitos): não enviado";
const PISO_SEG_MS = 60000;   // cada mensagem do aniversário ocupa no mínimo 1 min da janela (intervalo real nunca menor que ~18 s)
/** Janela de hoje (Brasília): de agora (ou das 9h) até as 18h. Devolve null se já passou. */
function janelaHoje(agoraMs = Date.now(), aposMs = 0) {
  const b = agoraBR(agoraMs);
  const ini = Date.parse(`${b.dia}T${String(HORA_INI).padStart(2, "0")}:00:00-03:00`);
  const fim = Date.parse(`${b.dia}T${String(HORA_FIM).padStart(2, "0")}:00:00-03:00`);
  const de = Math.max(agoraMs + 30000, ini, aposMs);
  if (de >= fim - 60000) return null;
  return { de, ate: fim };
}
/** Distribui n envios na janela: a janela é cortada em n partes iguais e cada mensagem sai num ponto sorteado dentro da sua parte (intervalos variados). */
function distribuir(n: number, jan: { de: number; ate: number }) {
  const cabem = Math.min(n, Math.floor((jan.ate - jan.de) / PISO_SEG_MS));
  const seg = cabem > 0 ? (jan.ate - jan.de) / cabem : 0;
  const horas: number[] = [];
  for (let i = 0; i < cabem; i++) horas.push(Math.round(jan.de + seg * (i + 0.15 + Math.random() * 0.7)));
  return { cabem, seg, horas };
}
/** Data (AAAA-MM-DD) e hora em Brasília. */
function agoraBR(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), min: Number(p.minute) };
}
let IGNORAR_HORARIO = false;
const dentroDoHorario = (b = agoraBR()) => IGNORAR_HORARIO || (b.hora >= HORA_INI && b.hora < HORA_FIM);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Limite diário da mala direta/pós-venda: aquecimento do número (contado desde o 1º envio da fila). */
async function limiteGeralHoje(seg?: Record<string, string>) {
  const s = seg || await segredos();
  const { data: prim } = await admin.from("marketing_fila").select("enviado_em").eq("status", "enviado").order("enviado_em", { ascending: true }).limit(1);
  const dias = prim && prim[0] ? Math.floor((Date.now() - new Date(prim[0].enviado_em).getTime()) / 86400000) : 0;
  let cap = dias < 7 ? 20 : dias < 14 ? 40 : 80;
  const o = Number(s.MARKETING_LIMITE_DIA); if (Number.isFinite(o) && o > 0) cap = Math.floor(o);
  const ini = Date.parse(`${agoraBR().dia}T00:00:00-03:00`);
  const { count } = await admin.from("marketing_fila").select("id", { count: "exact", head: true }).eq("status", "enviado").neq("tipo", "aniversario").gte("enviado_em", new Date(ini).toISOString());
  return { cap, enviados: count || 0, diasDeUso: dias };
}
async function tagMarketingOff(): Promise<string> {
  const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  const tags: any[] = (data && (data.payload as any) && (data.payload as any).tagsClientes) || [];
  const t = tags.find((x: any) => semAcento(x.nome) === "marketing off");
  return t ? String(t.id) : "";
}

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
  { const { data: pz } = await admin.from("marketing_disparo_estado").select("pausado_motivo").eq("id", 1).maybeSingle();
    if (pz && pz.pausado_motivo) return { ok: true, pausado: true, motivo: pz.pausado_motivo }; }
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
  let conectado: boolean | null = null, enviados = 0, falhasSeguidas = 0, pausar = "";
  const lim = await limiteGeralHoje(seg);
  let geralHoje = lim.enviados;
  const idTagOff = await tagMarketingOff();
  try {
    const garantirConexao = async () => {
      if (conectado !== null) return conectado;
      try {
        const rs = await fetch(`${seg.EVOLUTION_URL}/instance/connectionState/${INSTANCIA}`, { headers: H, signal: AbortSignal.timeout(8000) });
        const js = await rs.json().catch(() => ({}));
        conectado = String((js && js.instance && js.instance.state) || "") === "open";
      } catch (_) { conectado = false; }
      return conectado;
    };
    while (Date.now() - inicio < LIMITE) {
      if (!dentroDoHorario()) break;
      const agoraIso = new Date().toISOString();
      // 1) aniversário AGENDADO que já chegou na hora (não obedece ao ritmo geral: cada um tem o seu horário)
      let item: any = null, agendado = false;
      {
        const { data: due } = await admin.from("marketing_fila").select("*").eq("status", "pendente").eq("tipo", "aniversario").not("agendado_para", "is", null).lte("agendado_para", agoraIso).order("agendado_para", { ascending: true }).limit(1);
        if (due && due[0]) { item = due[0]; agendado = true; }
      }
      // 2) demais tipos (e aniversário antigo, sem horário): ritmo geral
      if (!item) {
        const prox = new Date(est.proximo_em || 0).getTime();
        const { data: pend } = await admin.from("marketing_fila").select("id, tipo").eq("status", "pendente").or("tipo.neq.aniversario,agendado_para.is.null").order("id", { ascending: true }).limit(500);
        const temGeral = !!(pend && pend.length) && geralHoje < lim.cap;   // limite diário de aquecimento (mala direta/pós-venda)
        if (temGeral && Date.now() >= prox) {
          const tipos = [...new Set(pend!.map((p: any) => p.tipo))];
          const candidatos = tipos.length > 1 ? tipos.filter((t) => t !== est.ultimo_tipo) : tipos;
          const tipo = candidatos[Math.floor(Math.random() * candidatos.length)];
          const alvo = pend!.find((p: any) => p.tipo === tipo);
          const { data: it } = await admin.from("marketing_fila").select("*").eq("id", alvo.id).eq("status", "pendente").maybeSingle();
          if (!it) continue;
          item = it;
        } else {
          // nada para agora: espera o próximo horário (se couber nesta execução) ou encerra
          let proximoMs = temGeral ? prox : Infinity;
          const { data: fut } = await admin.from("marketing_fila").select("agendado_para").eq("status", "pendente").eq("tipo", "aniversario").not("agendado_para", "is", null).order("agendado_para", { ascending: true }).limit(1);
          if (fut && fut[0]) proximoMs = Math.min(proximoMs, new Date(fut[0].agendado_para).getTime());
          if (!isFinite(proximoMs)) { est.proximo_em = est.proximo_em || new Date().toISOString(); break; }
          const w = proximoMs - Date.now();
          if (w > 0) { if (Date.now() - inicio + w > LIMITE) break; await espera(w); }
          continue;
        }
      }
      if (!(await garantirConexao())) break;   // WhatsApp de disparo fora do ar: tudo fica pendente
      const numero = normalizaTelefone(item.telefone);
      let ok = false, erro = "", cancelarMotivo = "", statusHttp = 0;
      if (!numero) { erro = ERRO_FONE; cancelarMotivo = ERRO_FONE; }
      else {
        // cliente com a tag MARKETING OFF nunca recebe
        if (idTagOff) { try { const { data: off } = await admin.rpc("cliente_marketing_off", { p_id: String(item.cliente_id || ""), p_fone8: fone8(numero), p_tag: idTagOff }); if (off === true) cancelarMotivo = "Cliente com a tag MARKETING OFF"; } catch (_) {} }
        // o número precisa ter WhatsApp
        if (!cancelarMotivo) {
          try {
            const rw = await fetch(`${seg.EVOLUTION_URL}/chat/whatsappNumbers/${INSTANCIA}`, { method: "POST", headers: H, body: JSON.stringify({ numbers: [numero] }), signal: AbortSignal.timeout(10000) });
            const jw = await rw.json().catch(() => null);
            if (rw.ok && Array.isArray(jw) && jw[0] && jw[0].exists === false) cancelarMotivo = "Número sem WhatsApp";
          } catch (_) { /* conferência indisponível: segue o envio */ }
        }
        if (!cancelarMotivo) {
          try {
            const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${INSTANCIA}`, { method: "POST", headers: H, body: JSON.stringify({ number: numero, text: varia(item.texto), delay: 2500 + Math.floor(Math.random() * 5500) }), signal: AbortSignal.timeout(25000) });
            statusHttp = r.status;
            const rj = await r.json().catch(() => ({}));
            ok = r.ok && !!(rj && rj.key);
            if (!ok) erro = `WhatsApp recusou (${r.status})`;
          } catch (e) { erro = "Falha de conexão"; }
        }
      }
      const tent = Number(item.tentativas || 0) + 1;
      const falhaFinal = !!cancelarMotivo || tent >= 3;
      const upd: any = ok
        ? { status: "enviado", enviado_em: new Date().toISOString(), tentativas: tent, erro: null, atualizado_em: new Date().toISOString() }
        : { status: cancelarMotivo ? "cancelado" : falhaFinal ? "falhou" : "pendente", tentativas: tent, erro: cancelarMotivo || erro, atualizado_em: new Date().toISOString() };
      if (!ok && !falhaFinal && agendado) upd.agendado_para = new Date(Date.now() + 5 * 60000).toISOString();   // tenta de novo daqui a 5 min
      await admin.from("marketing_fila").update(upd).eq("id", item.id);
      if (cancelarMotivo) continue;   // não gastou envio
      // freio automático: falhas seguidas (ou o WhatsApp negando acesso) pausam a fila até alguém retomar
      if (ok) falhasSeguidas = 0; else { falhasSeguidas++; if (statusHttp === 401 || statusHttp === 403 || falhasSeguidas >= FALHAS_PARA_PAUSAR) { pausar = statusHttp === 401 || statusHttp === 403 ? `O WhatsApp negou o acesso (${statusHttp}) — número possivelmente restrito` : `${falhasSeguidas} falhas seguidas no envio (${erro})`; break; } if (!agendado) est.proximo_em = new Date(Date.now() + 60000).toISOString(); continue; }
      est.enviados_dia = Number(est.enviados_dia || 0) + 1; est.ultimo_tipo = agendado ? est.ultimo_tipo : item.tipo; enviados++;
      if (!agendado) {
        geralHoje++;
        // tempo até a próxima (mala direta/pós-venda): sorteado entre 45 e 150 s (2 min a cada 30), +10% por ciclo de 30 no dia
        const ciclo = Math.floor((est.enviados_dia - 1) / POR_CICLO);
        const fator = Math.pow(AUMENTO, ciclo);
        const seg_ = (est.enviados_dia % POR_CICLO === 0 ? PAUSA_S : 45 + Math.random() * 105) * fator;
        est.proximo_em = new Date(Date.now() + seg_ * 1000).toISOString();
      }
      await admin.from("marketing_disparo_estado").update({ dia: est.dia, enviados_dia: est.enviados_dia, proximo_em: est.proximo_em, ultimo_tipo: est.ultimo_tipo }).eq("id", 1);
    }
  } finally {
    await admin.from("marketing_disparo_estado").update({ dia: est.dia, enviados_dia: est.enviados_dia, proximo_em: est.proximo_em, ultimo_tipo: est.ultimo_tipo, rodando_ate: null }).eq("id", 1);
  }
  if (pausar) {
    await admin.from("marketing_disparo_estado").update({ pausado_motivo: pausar, pausado_em: new Date().toISOString() }).eq("id", 1);
    try { await admin.from("auditoria_log").insert({ acao: "marketing_pausado", modulo: "Marketing", tabela: "marketing_fila", resumo: "Fila de WhatsApp pausada automaticamente: " + pausar }); } catch (_) {}
  }
  return { ok: true, enviados, conectado, pausado: !!pausar };
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

    /** Linhas prontas (sem telefone válido já saem canceladas) + plano de horários do aniversário. */
    const montarLinhas = async (itens: any[], user: any) => {
      const hoje = agoraBR().dia;
      const base = itens.map((x: any) => ({
        tipo: TIPOS.includes(x.tipo) ? x.tipo : "campanha", campanha: String(x.campanha || "").slice(0, 120),
        cliente_nome: String(x.nome || "").slice(0, 160), telefone: String(x.telefone || "").slice(0, 40),
        texto: String(x.texto || "").slice(0, 3000), loja_id: x.lojaId ? String(x.lojaId) : null, cliente_id: x.clienteId ? String(x.clienteId) : null,
        criado_por: (user && (user.apelido || user.nome)) || "", dia_criacao: hoje, status: "pendente" as string, erro: null as string | null, agendado_para: null as string | null,
      })).filter((l: any) => l.texto.trim() && l.telefone);
      const invalidos: any[] = [], validos: any[] = [];
      for (const l of base) (normalizaTelefone(l.telefone) ? validos : invalidos).push(l);
      for (const l of invalidos) { l.status = "cancelado"; l.erro = ERRO_FONE; }
      // toda mensagem da fila leva o aviso de como sair (menos denúncia e bloqueio)
      for (const l of validos) if (!/responda SAIR/i.test(l.texto)) l.texto = l.texto.trimEnd() + RODAPE_SAIR;
      // telefone repetido no mesmo lote, e campanha/pós-venda: no máximo 1 a cada 30 dias por telefone
      {
        const vistos = new Set<string>();
        const camp = validos.filter((l: any) => l.tipo === "campanha" || l.tipo === "posVenda");
        let recentes = new Set<string>();
        if (camp.length) {
          const desde = new Date(Date.now() - DIAS_ENTRE_CAMPANHAS * 86400000).toISOString();
          const { data: rec } = await admin.from("marketing_fila").select("telefone").in("tipo", ["campanha", "posVenda"]).in("status", ["enviado", "pendente"]).gte("criado_em", desde).limit(20000);
          recentes = new Set((rec || []).map((r: any) => normalizaTelefone(r.telefone) || ""));
        }
        for (const l of validos) {
          const n = normalizaTelefone(l.telefone) || "";
          if (vistos.has(n + "|" + l.tipo)) { l.status = "cancelado"; l.erro = "Telefone repetido neste envio"; continue; }
          vistos.add(n + "|" + l.tipo);
          if ((l.tipo === "campanha" || l.tipo === "posVenda") && recentes.has(n)) { l.status = "cancelado"; l.erro = `Já recebeu campanha/pós-venda nos últimos ${DIAS_ENTRE_CAMPANHAS} dias`; }
        }
      }
      const aniv = validos.filter((l: any) => l.tipo === "aniversario" && l.status === "pendente");
      let plano: any = { aniversario: aniv.length, agendados: 0, naoCouberam: 0, passou: false };
      if (aniv.length) {
        // novo lote começa depois do último horário já reservado (um segundo clique no mesmo dia não amontoa mensagens)
        const { data: ult } = await admin.from("marketing_fila").select("agendado_para").eq("status", "pendente").eq("tipo", "aniversario").not("agendado_para", "is", null).order("agendado_para", { ascending: false }).limit(1);
        const apos = ult && ult[0] ? new Date(ult[0].agendado_para).getTime() + 30000 : 0;
        const jan = janelaHoje(Date.now(), apos);
        if (!jan) { plano.passou = true; for (const l of aniv) { l.status = "cancelado"; l.erro = "Sem tempo hoje: aniversário só vale no dia, entre 9h e 18h"; } plano.naoCouberam = aniv.length; }
        else {
          const d = distribuir(aniv.length, jan);
          aniv.forEach((l: any, i: number) => { if (i < d.cabem) l.agendado_para = new Date(d.horas[i]).toISOString(); else { l.status = "cancelado"; l.erro = "Não coube no horário de hoje (até 18h)"; } });
          plano = { ...plano, agendados: d.cabem, naoCouberam: aniv.length - d.cabem, de: new Date(jan.de).toISOString(), ate: new Date(jan.ate).toISOString(), intervaloMedioS: d.cabem ? Math.round(d.seg / 1000) : 0 };
        }
      }
      return { linhas: base, invalidos: invalidos.length, repetidos: validos.filter((l: any) => l.status === "cancelado" && !/Telefone fora/.test(l.erro || "") && !/horário|tempo/.test(l.erro || "")).length, plano };
    };

    if (op === "planejar") {
      const itens = Array.isArray(body.itens) ? body.itens.slice(0, 5000) : [];
      const { linhas, invalidos, repetidos, plano } = await montarLinhas(itens, user);
      const ativos = linhas.filter((l: any) => l.status === "pendente").length;
      const lim = await limiteGeralHoje();
      return json({ ok: true, total: linhas.length, validos: linhas.length - invalidos, invalidos, repetidos, ativos, plano, limite: lim, dentroDoHorario: dentroDoHorario(agoraBR()) });
    }
    if (op === "enfileirar") {
      const itens = Array.isArray(body.itens) ? body.itens.slice(0, 5000) : [];
      const { linhas, invalidos, repetidos, plano } = await montarLinhas(itens, user);
      if (!linhas.length) return json({ error: "Nada para enviar (sem telefone ou sem texto)." }, 400);
      for (let i = 0; i < linhas.length; i += 500) { const { error } = await admin.from("marketing_fila").insert(linhas.slice(i, i + 500)); if (error) throw error; }
      try { await admin.from("auditoria_log").insert({ usuario_id: user.id || null, usuario_nome: user.nome || null, nivel: user.nivel || null, acao: "marketing_enfileirar", modulo: "Marketing", tabela: "marketing_fila", resumo: `Colocou ${linhas.length - invalidos} mensagem(ns) na fila de WhatsApp (${[...new Set(linhas.map((l: any) => l.tipo))].join(", ")})${invalidos ? `; ${invalidos} cancelada(s) por telefone fora do padrão` : ""}`, detalhe: { campanha: linhas[0].campanha, plano } }); } catch (_) {}
      const b = agoraBR();
      const ativos = linhas.filter((l: any) => l.status === "pendente").length;
      return json({ ok: true, qtd: ativos, invalidos, repetidos, plano, foraDoHorario: !dentroDoHorario(b) });
    }
    if (op === "fila") {
      const desde = new Date(Date.now() - 3 * 86400000).toISOString();
      const { data: pend } = await admin.from("marketing_fila").select("id, tipo, campanha, cliente_nome, telefone, status, criado_em, criado_por, dia_criacao, agendado_para").eq("status", "pendente").order("id").limit(1000);
      const { data: rec } = await admin.from("marketing_fila").select("id, tipo, campanha, cliente_nome, telefone, status, criado_em, enviado_em, erro, criado_por, atualizado_em").neq("status", "pendente").gte("atualizado_em", desde).order("atualizado_em", { ascending: false }).limit(300);
      const { data: est } = await admin.from("marketing_disparo_estado").select("dia, enviados_dia, proximo_em, pausado_motivo, pausado_em").eq("id", 1).maybeSingle();
      const b = agoraBR();
      return json({ ok: true, pendentes: pend || [], recentes: rec || [], estado: est || null, limite: await limiteGeralHoje(), dentroDoHorario: dentroDoHorario(b), agora: b });
    }
    if (op === "retomar") {
      await admin.from("marketing_disparo_estado").update({ pausado_motivo: null, pausado_em: null }).eq("id", 1);
      try { await admin.from("auditoria_log").insert({ usuario_id: user.id || null, usuario_nome: user.nome || null, nivel: user.nivel || null, acao: "marketing_retomado", modulo: "Marketing", tabela: "marketing_fila", resumo: "Retomou a fila de WhatsApp pausada" }); } catch (_) {}
      return json({ ok: true });
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
