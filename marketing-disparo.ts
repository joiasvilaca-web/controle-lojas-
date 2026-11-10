// marketing-disparo v5 (10/11/2026) — FILA ÚNICA DO NÚMERO DE DISPARO (vilaca), junto com o acompanhamento-auto:
//   (1) das 9h às 20h (19h–20h de reserva); entre duas mensagens automáticas no mínimo 5 min (5–7 min sorteados; com poucas, espalhadas no dia) — a vez é
//       pega no banco (disparo_vez); Venda/Pedido/Orçamento vencidos passam na frente; (2) tipo "via" = mensagem feita por pessoa quando o WhatsApp estava
//       fora do ar (enviar-via): sai primeiro, assim que o número volta; no envio marca o ✓ da via (auditoria_log) e o visto msgEnviadas; (3) ANIVERSÁRIO
//       AUTOMÁTICO: todo dia, na primeira rodada depois das 9h, os aniversariantes do dia entram sozinhos na fila (config.aniversarioAuto.auto=false desliga);
//       o que não sair até as 20h é cancelado ("expirado"); (4) aquecimento (20/40/80 por dia) passa a contar aniversário + mala direta + pós-venda;
//       (5) texto: sai "Não responda", entra "Para falar com a gente, é só clicar no link" + "Responda com 👍…"; (6) cada envio fica em disparo_envios.
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
const HORA_INI = 9, HORA_FIM = 20, MIN_FIM_PLANO = 19 * 60;
const TIPOS = ["aniversario", "posVenda", "campanha", "chamar"];
const TIPOS_LIMITE = ["aniversario", "posVenda", "campanha"];   // contam no aquecimento do número
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
const WA_ATENDIMENTO = "https://wa.me/5532988307617";
const LINHA_JOINHA = "Responda com 👍 para confirmar que recebeu.";
/** Número de disparo: sem "não responda", com o link de atendimento e o pedido do 👍 (vale para textos antigos guardados nas configurações). */
function ajustaTextoDisparo(t: string): string {
  let x = String(t || "");
  x = x.replace(/N[ãa]o responda (a |esta |essa )?mensagem[.!]?\s*/gi, "");
  x = x.replace(/Caso precise falar conosco,?\s*clique no link:?/gi, "Para falar com a gente, é só clicar no link:");
  x = x.replace(/Para não receber mais mensagens, responda SAIR\.?/gi, "");
  if (!/wa\.me\/5532988307617/.test(x)) x = x.trimEnd() + "\n\nPara falar com a gente, é só clicar no link:\n" + WA_ATENDIMENTO;
  if (!/Responda com 👍/.test(x)) x = x.trimEnd() + "\n\n" + LINHA_JOINHA;
  return x.replace(/\n{3,}/g, "\n\n").trim();
}
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
/** Tempo até a PRÓXIMA mensagem automática (s): 5–7 min sorteados; se sobra tempo no dia, espalha (nunca menos de 5 min). */
function gapSeg(restantes: number, agoraMs = Date.now()) {
  const b = agoraBR(agoraMs);
  const minAgora = b.hora * 60 + b.min;
  const fim = Date.parse(`${b.dia}T${hhmm(minAgora < MIN_FIM_PLANO ? MIN_FIM_PLANO : HORA_FIM * 60)}:00-03:00`);
  const base = 300 + Math.random() * 120;
  if (restantes <= 0) return Math.round(base);
  const espaco = (fim - agoraMs) / 1000 / restantes;
  return Math.round(espaco <= 420 ? base : Math.max(300, espaco * (0.75 + Math.random() * 0.5)));
}
const bonito = (t: string) => String(t || "").trim().toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
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
  const { data: prim } = await admin.from("marketing_fila").select("enviado_em").eq("status", "enviado").in("tipo", TIPOS_LIMITE).order("enviado_em", { ascending: true }).limit(1);
  const dias = prim && prim[0] ? Math.floor((Date.now() - new Date(prim[0].enviado_em).getTime()) / 86400000) : 0;
  let cap = dias < 7 ? 20 : dias < 14 ? 40 : 80;
  const o = Number(s.MARKETING_LIMITE_DIA); if (Number.isFinite(o) && o > 0) cap = Math.floor(o);
  const ini = Date.parse(`${agoraBR().dia}T00:00:00-03:00`);
  const { count } = await admin.from("marketing_fila").select("id", { count: "exact", head: true }).eq("status", "enviado").in("tipo", TIPOS_LIMITE).gte("enviado_em", new Date(ini).toISOString());
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

/** Linhas prontas (sem telefone válido já saem canceladas; repetidos cancelados). v5: aniversário não tem mais horário marcado — entra na fila única. */
async function montarLinhas(itens: any[], user: any) {
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
  {
    const vistos = new Set<string>();
    const camp = validos.filter((l: any) => l.tipo === "campanha" || l.tipo === "posVenda");
    let recentes = new Set<string>();
    if (camp.length) {
      const desde = new Date(Date.now() - DIAS_ENTRE_CAMPANHAS * 86400000).toISOString();
      const { data: rec } = await admin.from("marketing_fila").select("telefone").in("tipo", ["campanha", "posVenda"]).in("status", ["enviado", "pendente"]).gte("criado_em", desde).limit(20000);
      recentes = new Set((rec || []).map((r: any) => normalizaTelefone(r.telefone) || ""));
    }
    // aniversário: o mesmo telefone não recebe duas vezes no dia (automático + botão)
    let anivHoje = new Set<string>();
    if (validos.some((l: any) => l.tipo === "aniversario")) {
      const { data: ah } = await admin.from("marketing_fila").select("telefone").eq("tipo", "aniversario").eq("dia_criacao", hoje).in("status", ["enviado", "pendente"]).limit(5000);
      anivHoje = new Set((ah || []).map((r: any) => normalizaTelefone(r.telefone) || ""));
    }
    for (const l of validos) {
      const n = normalizaTelefone(l.telefone) || "";
      if (vistos.has(n + "|" + l.tipo)) { l.status = "cancelado"; l.erro = "Telefone repetido neste envio"; continue; }
      vistos.add(n + "|" + l.tipo);
      if ((l.tipo === "campanha" || l.tipo === "posVenda") && recentes.has(n)) { l.status = "cancelado"; l.erro = `Já recebeu campanha/pós-venda nos últimos ${DIAS_ENTRE_CAMPANHAS} dias`; }
      if (l.tipo === "aniversario" && anivHoje.has(n)) { l.status = "cancelado"; l.erro = "Aniversário já está na fila de hoje"; }
    }
  }
  const aniv = validos.filter((l: any) => l.tipo === "aniversario" && l.status === "pendente");
  const b = agoraBR();
  const plano: any = { aniversario: aniv.length, agendados: aniv.length, naoCouberam: 0, passou: aniv.length > 0 && b.hora >= HORA_FIM };
  if (plano.passou) { for (const l of aniv) { l.status = "cancelado"; l.erro = "Já passou das 20h: aniversário só vale no dia"; } plano.agendados = 0; plano.naoCouberam = aniv.length; }
  return { linhas: base, invalidos: invalidos.length, repetidos: validos.filter((l: any) => l.status === "cancelado" && !/Telefone fora/.test(l.erro || "") && !/20h/.test(l.erro || "")).length, plano };
}

/* ---------------- aniversário automático (1x por dia, na 1ª rodada depois das 9h) ---------------- */
async function aniversarioAutomatico(dia: string) {
  const { data: cf } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  const cfg: any = (cf && cf.payload) || {};
  if (cfg.aniversarioAuto && cfg.aniversarioAuto.auto === false) return { desligado: true, qtd: 0 };
  const mmdd = dia.slice(5);
  const { data } = await admin.from("clientes_cadastro").select("id,payload").like("payload->>dataNascimento", `%-${mmdd}`).limit(2000);
  const modelo = (cfg.mensagens && cfg.mensagens.aniversario) || "Feliz aniversário, {cliente}! A Vilaça Joias deseja a você um dia especial! 🎂💍";
  const itens = (data || []).map((r: any) => r.payload || {}).filter((c: any) => c.telefone).map((c: any) => ({
    tipo: "aniversario", campanha: "ANIVERSÁRIO (automático) · " + dia.split("-").reverse().join("/"), nome: c.nome || "", telefone: c.telefone, clienteId: c.id || null, lojaId: null,
    texto: String(modelo).replaceAll("{cliente}", bonito(String(c.nome || "").split(/\s+/)[0] || "")).replaceAll("{loja}", "Vilaça Joias").replaceAll("{data}", dia.split("-").reverse().join("/")),
  }));
  if (!itens.length) return { qtd: 0 };
  const { linhas } = await montarLinhas(itens, { nome: "SISTEMA (aniversário automático)" });
  for (let i = 0; i < linhas.length; i += 500) { const { error } = await admin.from("marketing_fila").insert(linhas.slice(i, i + 500)); if (error) throw error; }
  const qtd = linhas.filter((l: any) => l.status === "pendente").length;
  try { await admin.from("auditoria_log").insert({ usuario_nome: "SISTEMA (automático)", nivel: "sistema", acao: "marketing_enfileirar", modulo: "Marketing", tabela: "marketing_fila", resumo: `Aniversário automático: ${qtd} mensagem(ns) na fila (${linhas.length - qtd} cancelada(s): telefone fora do padrão ou repetido)` }); } catch (_) {}
  return { qtd };
}

/* ---------------- processar (pg_cron, todo minuto) ---------------- */
async function processar(ignorarHorario = false) {   // ignorarHorario: só para teste manual (exige a chave do agendamento)
  IGNORAR_HORARIO = !!ignorarHorario;
  const hoje = agoraBR();
  { const { data: pz } = await admin.from("marketing_disparo_estado").select("pausado_motivo").eq("id", 1).maybeSingle();
    if (pz && pz.pausado_motivo) return { ok: true, pausado: true, motivo: pz.pausado_motivo }; }
  // Aniversário só vale no dia: os de dias anteriores, ou todos depois das 20h, viram "expirado".
  {
    const { data: aniv } = await admin.from("marketing_fila").select("id, dia_criacao").eq("status", "pendente").eq("tipo", "aniversario");
    const vencidos = (aniv || []).filter((r: any) => r.dia_criacao < hoje.dia || (!IGNORAR_HORARIO && hoje.hora >= HORA_FIM)).map((r: any) => r.id);
    if (vencidos.length) await admin.from("marketing_fila").update({ status: "expirado", erro: "Não saiu no dia do aniversário (9h–20h)", atualizado_em: new Date().toISOString() }).in("id", vencidos);
  }
  if (!dentroDoHorario(hoje)) return { ok: true, fora: true };
  // trava: só uma execução por vez
  const ate = new Date(Date.now() + 58000).toISOString();
  const { data: trava } = await admin.from("marketing_disparo_estado").update({ rodando_ate: ate }).eq("id", 1).or(`rodando_ate.is.null,rodando_ate.lt.${new Date().toISOString()}`).select().maybeSingle();
  if (!trava) return { ok: true, ocupado: true };
  const est: any = trava;
  if (est.dia !== hoje.dia) { est.dia = hoje.dia; est.enviados_dia = 0; est.ultimo_tipo = null; }
  const seg = await segredos();
  const H = { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY };
  let enviados = 0, pausar = "", anivNovos = 0, conectado: boolean | null = null;
  try {
    // 1) aniversariantes do dia entram sozinhos na fila (uma vez por dia)
    if (est.aniv_dia !== hoje.dia) {
      try { const r = await aniversarioAutomatico(hoje.dia); anivNovos = r.qtd || 0; } catch (e) { console.error("aniversario automatico", e); }
      est.aniv_dia = hoje.dia;
      await admin.from("marketing_disparo_estado").update({ aniv_dia: hoje.dia }).eq("id", 1);
    }
    // 2) o que tem para sair hoje
    const lim = await limiteGeralHoje(seg);
    const livre = Math.max(0, lim.cap - lim.enviados);
    const { data: pend } = await admin.from("marketing_fila").select("id, tipo").eq("status", "pendente").order("id", { ascending: true }).limit(3000);
    const vias = (pend || []).filter((p: any) => p.tipo === "via" || p.tipo === "chamar");
    const aniv = (pend || []).filter((p: any) => p.tipo === "aniversario");
    const gerais = (pend || []).filter((p: any) => p.tipo === "posVenda" || p.tipo === "campanha");
    const restantes = vias.length + Math.min(livre, aniv.length + gerais.length);
    await admin.from("marketing_disparo_estado").update({ mkt_restantes: restantes }).eq("id", 1);
    // ordem: vias (feitas por pessoa) → aniversário → mala direta/pós-venda (tipos intercalados)
    const ordem: any[] = [...vias];
    if (livre > 0) {
      ordem.push(...aniv);
      const tipos = [...new Set(gerais.map((p: any) => p.tipo))];
      const cands = tipos.length > 1 ? tipos.filter((t) => t !== est.ultimo_tipo) : tipos;
      const tipo = cands[Math.floor(Math.random() * cands.length)];
      ordem.push(...gerais.filter((p: any) => p.tipo === tipo), ...gerais.filter((p: any) => p.tipo !== tipo));
    }
    if (!ordem.length) return { ok: true, nada: true, anivNovos };
    try {
      const rs = await fetch(`${seg.EVOLUTION_URL}/instance/connectionState/${INSTANCIA}`, { headers: H, signal: AbortSignal.timeout(8000) });
      const js = await rs.json().catch(() => ({}));
      conectado = String((js && js.instance && js.instance.state) || "") === "open";
    } catch (_) { conectado = false; }
    if (!conectado) return { ok: true, conectado: false, anivNovos };   // WhatsApp fora do ar: tudo fica pendente
    const est2 = await admin.from("marketing_disparo_estado").select("cards_restantes, cards_em").eq("id", 1).maybeSingle();
    const cardsRest = est2.data && est2.data.cards_em && Date.now() - new Date(est2.data.cards_em).getTime() < 180000 ? Number(est2.data.cards_restantes || 0) : 0;
    const idTagOff = await tagMarketingOff();
    const inicio = Date.now();
    for (const alvo of ordem) {
      if (Date.now() - inicio > 45000) break;
      const { data: item } = await admin.from("marketing_fila").select("*").eq("id", alvo.id).eq("status", "pendente").maybeSingle();
      if (!item) continue;
      const ehVia = item.tipo === "via";
      const numero = normalizaTelefone(item.telefone);
      let cancelarMotivo = "";
      if (!numero) cancelarMotivo = ERRO_FONE;
      if (!cancelarMotivo && !ehVia && idTagOff) { try { const { data: off } = await admin.rpc("cliente_marketing_off", { p_id: String(item.cliente_id || ""), p_fone8: fone8(numero!), p_tag: idTagOff }); if (off === true) cancelarMotivo = "Cliente com a tag MARKETING OFF"; } catch (_) {} }
      if (!cancelarMotivo && !ehVia) {
        try {
          const rw = await fetch(`${seg.EVOLUTION_URL}/chat/whatsappNumbers/${INSTANCIA}`, { method: "POST", headers: H, body: JSON.stringify({ numbers: [numero] }), signal: AbortSignal.timeout(10000) });
          const jw = await rw.json().catch(() => null);
          if (rw.ok && Array.isArray(jw) && jw[0] && jw[0].exists === false) cancelarMotivo = "Número sem WhatsApp";
        } catch (_) { /* conferência indisponível: segue o envio */ }
      }
      if (cancelarMotivo) { await admin.from("marketing_fila").update({ status: "cancelado", tentativas: Number(item.tentativas || 0) + 1, erro: cancelarMotivo, atualizado_em: new Date().toISOString() }).eq("id", item.id); continue; }
      // fila única: pega a vez (≥ 5 min da última; via passa na frente; Marketing espera os cards vencidos)
      const { data: vez } = await admin.rpc("disparo_vez", { p_cards: ehVia, p_gap_seg: gapSeg(Math.max(0, restantes - 1) + cardsRest) });
      if (vez !== true) break;
      let ok = false, erro = "", statusHttp = 0;
      try {
        const texto = ehVia ? String(item.texto) : ajustaTextoDisparo(varia(item.texto)) + RODAPE_SAIR;
        const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${INSTANCIA}`, { method: "POST", headers: H, body: JSON.stringify({ number: numero, text: texto, delay: 2500 + Math.floor(Math.random() * 5500) }), signal: AbortSignal.timeout(25000) });
        statusHttp = r.status;
        const rj = await r.json().catch(() => ({}));
        ok = r.ok && !!(rj && rj.key);
        if (!ok) erro = `WhatsApp recusou (${r.status})`;
      } catch (e) { erro = "Falha de conexão"; }
      const tent = Number(item.tentativas || 0) + 1;
      const agoraIso = new Date().toISOString();
      await admin.from("marketing_fila").update(ok
        ? { status: "enviado", enviado_em: agoraIso, tentativas: tent, erro: null, atualizado_em: agoraIso }
        : { status: tent >= 3 ? "falhou" : "pendente", tentativas: tent, erro, atualizado_em: agoraIso }).eq("id", item.id);
      if (ok) {
        enviados++;
        est.enviados_dia = Number(est.enviados_dia || 0) + 1; if (!ehVia) est.ultimo_tipo = item.tipo;
        try { await admin.from("disparo_envios").insert({ fone8: fone8(numero!), telefone: numero, loja_id: item.loja_id || null, vendedora: item.vendedora || null, tipo: item.tipo === "via" ? (item.registro_tabela || "via") : item.tipo, registro_id: item.registro_id || null, origem: ehVia ? "fila_via" : "marketing" }); } catch (_) {}
        if (ehVia) {
          // ✓ do botão (consulta pelo auditoria_log) e visto da via
          try { await admin.from("auditoria_log").insert({ usuario_nome: item.criado_por || "SISTEMA", nivel: "sistema", loja_sessao: item.loja_id || null, acao: "via_whatsapp_enviada", modulo: "Envio da via", tabela: item.registro_tabela || "", registro_id: item.registro_id || "", resumo: `Enviou (pela fila, o WhatsApp estava fora do ar) a via por WhatsApp (${INSTANCIA}) para …${String(numero).slice(-4)}`, detalhe: { instancia: INSTANCIA, status: statusHttp, botao: item.botao || "", rotulo: item.rotulo || "", fila: true } }); } catch (_) {}
          const mc = item.marcar;
          if (mc && mc.tabela && mc.chave && item.registro_id) {
            try {
              const { data: rw } = await admin.from(mc.tabela).select("payload").eq("id", item.registro_id).maybeSingle();
              const pl = rw && rw.payload;
              if (pl) { pl.msgEnviadas = pl.msgEnviadas || {}; if (!pl.msgEnviadas[mc.chave]) { pl.msgEnviadas[mc.chave] = agoraIso; await admin.from(mc.tabela).update({ payload: pl, updated_at: agoraIso }).eq("id", item.registro_id); } }
            } catch (_) {}
          }
        }
      } else if (statusHttp === 401 || statusHttp === 403) {
        pausar = `O WhatsApp negou o acesso (${statusHttp}) — número possivelmente restrito`;
      } else {
        // falhas seguidas: conta pelas últimas tentativas da fila (cada rodada envia no máximo 1)
        const { data: ult } = await admin.from("marketing_fila").select("status, erro").not("tentativas", "is", null).order("atualizado_em", { ascending: false }).limit(FALHAS_PARA_PAUSAR);
        if ((ult || []).length >= FALHAS_PARA_PAUSAR && (ult || []).every((u: any) => u.erro && /recusou|Falha de conexão/.test(u.erro))) pausar = `${FALHAS_PARA_PAUSAR} falhas seguidas no envio (${erro})`;
      }
      break;   // no máximo 1 envio por rodada (a próxima vez só daqui a ≥ 5 min)
    }
  } finally {
    await admin.from("marketing_disparo_estado").update({ dia: est.dia, enviados_dia: est.enviados_dia, ultimo_tipo: est.ultimo_tipo, rodando_ate: null }).eq("id", 1);
  }
  if (pausar) {
    await admin.from("marketing_disparo_estado").update({ pausado_motivo: pausar, pausado_em: new Date().toISOString() }).eq("id", 1);
    try { await admin.from("auditoria_log").insert({ acao: "marketing_pausado", modulo: "Marketing", tabela: "marketing_fila", resumo: "Fila de WhatsApp pausada automaticamente: " + pausar }); } catch (_) {}
  }
  return { ok: true, enviados, conectado, anivNovos, pausado: !!pausar };
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
      const { data: pend } = await admin.from("marketing_fila").select("id, tipo, campanha, cliente_nome, telefone, texto, status, criado_em, criado_por, dia_criacao, agendado_para, loja_id, vendedora").eq("status", "pendente").order("id").limit(1000);
      const { data: rec } = await admin.from("marketing_fila").select("id, tipo, campanha, cliente_nome, telefone, status, criado_em, enviado_em, erro, criado_por, atualizado_em, loja_id, vendedora").neq("status", "pendente").gte("atualizado_em", desde).order("atualizado_em", { ascending: false }).limit(300);
      const { data: est } = await admin.from("marketing_disparo_estado").select("dia, enviados_dia, proximo_em, pausado_motivo, pausado_em, proximo_auto_em, ultimo_envio_em, cards_restantes, mkt_restantes").eq("id", 1).maybeSingle();
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
