// acompanhamento-auto (09/11/2026) — envio AUTOMÁTICO por WhatsApp, sem ação humana:
//  1) AÇÕES DE ORÇAMENTO (fixação): cada orçamento aberto recebe as mensagens nos prazos configurados (config.orcamentoAcoes);
//  2) PÓS-VENDA: X dias depois da venda (config.posVendaAuto).
// Só envia se o interruptor "auto" da respectiva configuração estiver ligado (padrão: DESLIGADO) e só para registros criados
// depois de `desde` (o dia em que foi ligado). Chamado pelo pg_cron (a cada 5 min) com o header x-cron-token
// (= atendimento_segredos.ACOMPANHAMENTO_CRON_TOKEN). Janela 9h–18h (Brasília), vários segundos entre mensagens, "digitando…",
// confere WhatsApp do número e a tag MARKETING OFF. O parágrafo do wa.me vai para o topo (botão "Iniciar conversa").
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const HORA_INI = 9, HORA_FIM = 18, MAX_POR_RODADA = 8, LIMITE_MS = 110000;
const WA_ATENDIMENTO = "https://wa.me/5532988307617";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const semAcento = (s: string) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const fone8 = (t: string) => String(t || "").replace(/\D/g, "").slice(-8);
const bonito = (t: string) => String(t || "").trim().toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
function celular(t: string): string | null {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11 || Number(d.slice(0, 2)) < 11 || d[2] !== "9") return null;
  return "55" + d;
}
function agoraBR(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
}
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
function diaDe(ms: number) { return agoraBR(ms).dia; }
const fmtBRL = (v: unknown) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (s: unknown) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };

/** O WhatsApp monta cartão/botão pelo PRIMEIRO link: o parágrafo só com o wa.me sobe para o topo (botão "Iniciar conversa"). */
function waMePrimeiro(t: string): string {
  const links = t.match(/https?:\/\/\S+/g) || [];
  if (links.length < 2 || /wa\.me\//.test(links[0])) return t;
  const paras = t.split(/\n\s*\n/);
  let i = -1;
  for (let k = paras.length - 1; k >= 0; k--) { const ls = paras[k].match(/https?:\/\/\S+/g) || []; if (ls.length && ls.every((l) => /wa\.me\//.test(l))) { i = k; break; } }
  if (i <= 0) return t;
  const p = paras.splice(i, 1)[0];
  return [p, ...paras].join("\n\n");
}
const varia = (t: string) => String(t || "").replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, (_m, g) => { const o = String(g).split("|"); return o[Math.floor(Math.random() * o.length)].trim(); });

// ---------- mensagens padrão (mesmo texto da tela) ----------
const RODAPE = `Caso precise falar conosco, clique no link:\n${WA_ATENDIMENTO}`;
const MSG_ACAO_PADRAO = [
  `Olá, {cliente}! 😊\n\nAqui é da {loja}. Passando para saber se ficou alguma dúvida sobre o seu orçamento de {valor}. Se quiser, ajustamos o que for preciso para você fechar do jeito ideal.\n\nO orçamento vale até {validade}.\n\n${RODAPE}`,
  `Oi, {cliente}! Tudo bem? 💛\n\nSeu orçamento de {valor} na {loja} continua reservado para você. Podemos seguir com o serviço? Se precisar de mais prazo ou de alguma condição, é só nos dizer.\n\n${RODAPE}`,
  `Olá, {cliente}! Esta é a nossa última lembrança do seu orçamento de {valor} na {loja}. Se ainda tiver interesse, será um prazer atender você — é só responder pelo link abaixo.\n\n${RODAPE}`,
];
const MSG_POSVENDA_PADRAO = `Olá, {cliente}! 💛\n\nAqui é da {loja}. Já faz alguns dias que você levou a sua joia e queremos saber: está tudo certo? Se precisar de qualquer ajuste, limpeza ou tiver alguma dúvida, estamos à disposição.\n\n{avaliacao}\n\nObrigado por escolher a Vilaça Joias!\n\n${RODAPE}`;

type Passo = { id: string; nome: string; dias: number; statusId: string; mensagem: string };
function passosEfetivos(cfg: any): Passo[] {
  const a = cfg.orcamentoAcoes || {};
  if (Array.isArray(a.passos) && a.passos.length) return a.passos;
  const abertos = (cfg.statusOrcamento || []).filter((s: any) => !s.encerra);
  const t = cfg.orcamentoAutoMsgConfig || { t1: 3, t2: 6, t3: 9, tFinal: 15 };
  return [
    { id: "p1", nome: (abertos[1] || {}).nome || "Ação de fixação", dias: Number(t.t1) || 3, statusId: (abertos[1] || {}).id || "", mensagem: "" },
    { id: "p2", nome: (abertos[2] || {}).nome || "Prorrogado à ação", dias: Number(t.t2) || 6, statusId: (abertos[2] || {}).id || "", mensagem: "" },
    { id: "p3", nome: "Última ação", dias: Number(t.t3) || 9, statusId: "", mensagem: "" },
  ];
}
const finalEfetivo = (cfg: any) => { const a = cfg.orcamentoAcoes || {}; const t = cfg.orcamentoAutoMsgConfig || {}; return a.final || { ativo: true, dias: Number(t.tFinal) || 15, statusId: "recusado" }; };
function textoPasso(cfg: any, passo: Passo, idx: number): string {
  if (passo.mensagem && passo.mensagem.trim()) return passo.mensagem;
  const st = (cfg.statusOrcamento || []).find((s: any) => s.id === passo.statusId);
  if (st && st.mensagemWhatsapp && st.mensagemWhatsapp.trim()) return st.mensagemWhatsapp;
  return MSG_ACAO_PADRAO[Math.min(idx, MSG_ACAO_PADRAO.length - 1)];
}
function lojaDe(cfg: any, id: string) { return (cfg.lojas || []).find((l: any) => l && l.id === id) || null; }
function preencher(txt: string, cfg: any, reg: any) {
  const lj = lojaDe(cfg, reg.lojaId);
  const nomeLoja = (lj && (lj.nomePublico || lj.nomeFantasia || lj.nome)) || reg.loja || "Vilaça Joias";
  const av = lj && lj.googleReviewUrl ? `Se puder, conte como foi a sua experiência — a sua opinião ajuda muito:\n${lj.googleReviewUrl}` : "";
  let t = String(txt || "")
    .replaceAll("{cliente}", bonito(String(reg.cliente || "").split(/\s+/)[0] || "cliente"))
    .replaceAll("{loja}", nomeLoja).replaceAll("{vendedora}", bonito(reg.vendedora || ""))
    .replaceAll("{valor}", fmtBRL(reg.valorTotal)).replaceAll("{validade}", fmtData(reg.validade)).replaceAll("{avaliacao}", av);
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

let cacheSeg: Record<string, string> | null = null;
async function segredos() {
  if (cacheSeg) return cacheSeg;
  const { data } = await admin.from("atendimento_segredos").select("chave, valor").in("chave", ["EVOLUTION_URL", "EVOLUTION_API_KEY", "ACOMPANHAMENTO_CRON_TOKEN"]);
  const v: Record<string, string> = {}; for (const r of data || []) v[r.chave] = r.valor;
  if (v.EVOLUTION_URL) v.EVOLUTION_URL = v.EVOLUTION_URL.replace(/\/+$/, "");
  return (cacheSeg = v);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const inicio = Date.now();
  try {
    const seg = await segredos();
    if (!seg.ACOMPANHAMENTO_CRON_TOKEN || req.headers.get("x-cron-token") !== seg.ACOMPANHAMENTO_CRON_TOKEN) return json({ error: "não autorizado" }, 401);
    const body = await req.json().catch(() => ({}));
    const agora = agoraBR();
    if (!body.ignorarHorario && !(agora.hora >= HORA_INI && agora.hora < HORA_FIM)) return json({ ok: true, fora_do_horario: true });
    const { data: cf } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const cfg: any = (cf && cf.payload) || {};
    const dryRun = !!body.simular;
    // simulação: `assumirAuto` finge que o envio automático está ligado desde 2000 (só para conferir o que sairia; nada é enviado)
    const acoes = dryRun && body.assumirAuto ? { ...(cfg.orcamentoAcoes || {}), auto: true, desde: "2000-01-01" } : (cfg.orcamentoAcoes || {});
    const pv = dryRun && body.assumirAuto ? { ...(cfg.posVendaAuto || {}), auto: true, desde: "2000-01-01" } : (cfg.posVendaAuto || {});
    const fila: { tipo: string; tabela: string; id: string; reg: any; texto: string; passo?: number; tel: string }[] = [];
    const fechar: { id: string; statusId: string }[] = [];

    // ---------- 1) ações de orçamento ----------
    if (acoes.auto && acoes.desde) {
      const desdeMs = Date.parse(acoes.desde + "T00:00:00-03:00");
      const passos = passosEfetivos(cfg), fin = finalEfetivo(cfg);
      const encerra = new Set((cfg.statusOrcamento || []).filter((s: any) => s.encerra).map((s: any) => s.id));
      for (let from = 0; from < 20000; from += 1000) {
        const { data } = await admin.from("orcamentos").select("id,payload").gte("updated_at", new Date(Date.now() - 120 * 86400000).toISOString()).range(from, from + 999);
        for (const r of (data || [])) {
          const o = r.payload || {};
          if (o.rascunho || o.convertidoEm || encerra.has(o.status) || Number(o.criadoEm || 0) < desdeMs) continue;
          const base = o.autoBaseData || o.data || (o.criadoEm ? diaDe(Number(o.criadoEm)) : "");
          if (!base) continue;
          const dias = diasEntre(base, agora.dia);
          const N = Number(o.autoMensagensEnviadas || 0);
          if (fin.ativo && !o.editadoManualmente && dias >= Number(fin.dias)) { fechar.push({ id: r.id, statusId: fin.statusId || "recusado" }); continue; }
          if (N >= passos.length || dias < Number(passos[N].dias)) continue;
          const tel = celular(o.telefone);
          if (!tel) continue;
          fila.push({ tipo: "orcamento", tabela: "orcamentos", id: r.id, reg: o, passo: N, tel, texto: preencher(textoPasso(cfg, passos[N], N), cfg, o) });
        }
        if (!data || data.length < 1000) break;
      }
    }
    // ---------- 2) pós-venda ----------
    if (pv.auto && pv.desde) {
      const dias = Number(pv.dias) || 7;
      const desdeMs = Date.parse(pv.desde + "T00:00:00-03:00");
      for (let from = 0; from < 20000; from += 1000) {
        const { data } = await admin.from("vendas_pdv").select("id,payload").gte("updated_at", new Date(Date.now() - 60 * 86400000).toISOString()).range(from, from + 999);
        for (const r of (data || [])) {
          const v = r.payload || {};
          if (v.posVendaEnviadoEm || v.status === "cancelada" || v.status === "cancelado" || v.rascunho || !v.data) continue;
          if (Number(v.criadoEm || 0) < desdeMs) continue;
          if (diasEntre(String(v.data).slice(0, 10), agora.dia) < dias) continue;
          const tel = celular(v.telefone);
          if (!tel) continue;
          fila.push({ tipo: "posvenda", tabela: "vendas_pdv", id: r.id, reg: v, tel, texto: preencher((pv.mensagem && pv.mensagem.trim()) || MSG_POSVENDA_PADRAO, cfg, v) });
        }
        if (!data || data.length < 1000) break;
      }
    }
    if (dryRun) return json({ ok: true, simulacao: true, enviaria: fila.map((f) => ({ tipo: f.tipo, id: f.id, passo: f.passo, tel: "…" + f.tel.slice(-4), texto: f.texto })), fecharia: fechar });

    // encerramento automático dos orçamentos que passaram do prazo final (sem mensagem)
    for (const f of fechar) {
      const { data: row } = await admin.from("orcamentos").select("payload").eq("id", f.id).maybeSingle();
      const o = row && row.payload; if (!o || o.convertidoEm) continue;
      o.status = f.statusId; o.statusAtualizadoEm = new Date().toISOString();
      (o.acoesLog = o.acoesLog || []).push({ em: new Date().toISOString(), acao: "encerrado automaticamente (prazo final)", por: "sistema" });
      await admin.from("orcamentos").update({ payload: o, updated_at: new Date().toISOString() }).eq("id", f.id);
    }
    if (!fila.length) return json({ ok: true, enviados: 0, encerrados: fechar.length });

    // ---------- envio ----------
    const H = { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY };
    const instanciaDe = (lojaId: string) => (lojaId === "loja_rj" ? "reformajoias" : "vilaca");
    const estados: Record<string, boolean> = {};
    const aberta = async (inst: string) => {
      if (inst in estados) return estados[inst];
      try { const rs = await fetch(`${seg.EVOLUTION_URL}/instance/connectionState/${inst}`, { headers: H, signal: AbortSignal.timeout(8000) }); const js = await rs.json().catch(() => ({})); estados[inst] = String((js && js.instance && js.instance.state) || js.state || "") === "open"; } catch (_) { estados[inst] = false; }
      return estados[inst];
    };
    const tags: any[] = cfg.tagsClientes || [];
    const tagOff = (tags.find((x: any) => semAcento(x.nome) === "marketing off") || {}).id || "";
    let enviados = 0, ignorados = 0;
    for (const f of fila) {
      if (enviados >= MAX_POR_RODADA || Date.now() - inicio > LIMITE_MS) break;
      const inst = instanciaDe(String(f.reg.lojaId || ""));
      if (!(await aberta(inst))) continue;
      // relê o registro (evita sobrescrever edição recente) e confere que ainda precisa enviar
      const { data: row } = await admin.from(f.tabela).select("payload").eq("id", f.id).maybeSingle();
      const reg = row && row.payload; if (!reg) continue;
      if (f.tipo === "orcamento" && ((Number(reg.autoMensagensEnviadas || 0) !== f.passo) || reg.convertidoEm || reg.rascunho)) continue;
      if (f.tipo === "posvenda" && reg.posVendaEnviadoEm) continue;
      if (tagOff) { try { const { data: off } = await admin.rpc("cliente_marketing_off", { p_id: "", p_fone8: fone8(f.tel), p_tag: tagOff }); if (off === true) { ignorados++; continue; } } catch (_) {} }
      try { const rw = await fetch(`${seg.EVOLUTION_URL}/chat/whatsappNumbers/${inst}`, { method: "POST", headers: H, body: JSON.stringify({ numbers: [f.tel] }), signal: AbortSignal.timeout(10000) }); const jw = await rw.json().catch(() => null); if (rw.ok && Array.isArray(jw) && jw[0] && jw[0].exists === false) { ignorados++; continue; } } catch (_) {}
      let ok = false, status = 0;
      try {
        const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${inst}`, { method: "POST", headers: H, body: JSON.stringify({ number: f.tel, text: waMePrimeiro(varia(f.texto)), delay: 2500 + Math.floor(Math.random() * 5500) }), signal: AbortSignal.timeout(25000) });
        status = r.status; const rj = await r.json().catch(() => ({})); ok = r.ok && !!(rj && rj.key);
      } catch (_) {}
      const nomeAcao = f.tipo === "orcamento" ? `ação ${f.passo! + 1}` : "pós-venda";
      try {
        await admin.from("auditoria_log").insert({ usuario_nome: "SISTEMA (automático)", nivel: "sistema", loja_sessao: reg.lojaId || null, acao: ok ? "via_whatsapp_enviada" : "via_whatsapp_falhou", modulo: "Acompanhamento automático", tabela: f.tipo === "orcamento" ? "orc_acao" : "posvenda", registro_id: f.id,
          resumo: `${ok ? "Enviou" : "Falhou ao enviar"} ${nomeAcao} (${f.tipo}) por WhatsApp (${inst}) para …${f.tel.slice(-4)}`, detalhe: { instancia: inst, status, botao: "auto", rotulo: nomeAcao } });
      } catch (_) {}
      if (!ok) { if (status === 401 || status === 403) break; continue; }
      const agoraIso = new Date().toISOString();
      if (f.tipo === "orcamento") {
        const passos = passosEfetivos(cfg);
        reg.autoMensagensEnviadas = f.passo! + 1;
        const sid = passos[f.passo!].statusId; if (sid) { reg.status = sid; reg.statusAtualizadoEm = agoraIso; }
        (reg.acoesLog = reg.acoesLog || []).push({ em: agoraIso, passo: passos[f.passo!].id, nome: passos[f.passo!].nome, por: "sistema", via: "whatsapp", auto: true });
      } else { reg.posVendaEnviadoEm = agoraIso; reg.posVendaPor = "sistema"; }
      await admin.from(f.tabela).update({ payload: reg, updated_at: agoraIso }).eq("id", f.id);
      enviados++;
      await espera(20000 + Math.floor(Math.random() * 25000));   // intervalo entre mensagens
    }
    return json({ ok: true, enviados, ignorados, encerrados: fechar.length });
  } catch (e) {
    console.error("acompanhamento-auto", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
