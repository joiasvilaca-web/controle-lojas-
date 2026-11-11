// v9 (11/11): o texto do número de disparo não leva mais "responda SAIR" (ajustaTextoDisparo retira o aviso antigo).
// v8 (10/11): a instância do número de disparo vem de atendimento_segredos.DISPARO_INSTANCIA (padrão "vilaca").
// v7 (10/11): número de disparo (vilaca) — (1) fora do ar: a mensagem (feita por pessoa) entra na FILA (marketing_fila tipo "via") e sai
//   sozinha quando o número voltar, pelas regras da fila única (9h–20h, 5 min entre automáticas); (2) cada envio fica em disparo_envios (telefone, loja,
//   vendedora) para a resposta automática dizer com quem falar; (3) envio feito na hora empurra o próximo automático 5 min (disparo_manual);
//   (4) texto: sai "Não responda esta mensagem"; entra "Para falar com a gente, é só clicar no link" + "Responda com 👍 para confirmar que recebeu."
// v6 (08/11): o servidor monta a mensagem padrão sozinho para os/venda/orcamento. v5 (08/11): `padrao` {cliente, atendente, link} monta a mensagem sem dados da via. v4 (08/11): op `consultar` (marcas "já enviado") + botao/rotulo no log. v3: wa.me primeiro (botão Iniciar conversa).
// enviar-via v2 (05/11/2026) — v2: loja opcional (sem loja ou loja desconhecida = instância "vilaca"); usado também por Gravações, Reserva, Site e Retirada.
// enviar-via v1 (05/11/2026) — dispara a via (link) ao cliente pelo WhatsApp da loja, sem abrir o WhatsApp Web.
// Loja Reforma → instância "reformajoias"; demais lojas → instância "vilaca". Se a instância não estiver conectada, devolve fallback:true
// (o app então abre o wa.me como antes). Tudo fica no LOG (auditoria_log). O "vilaca" é só disparo (não entra no CHAT; ver disparo-webhook).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const INSTANCIA_POR_LOJA: Record<string, string> = { loja_rj: "reformajoias" };
/** Instância do WhatsApp usada como número de DISPARO: atendimento_segredos.DISPARO_INSTANCIA (padrão "vilaca"). Trocar o valor troca o número sem redeploy (cache de 60 s). */
let cacheInst: { em: number; v: string } | null = null;
async function instanciaDisparo(): Promise<string> {
  if (cacheInst && Date.now() - cacheInst.em < 60000) return cacheInst.v;
  let v = "vilaca";
  try { const { data } = await admin.from("atendimento_segredos").select("valor").eq("chave", "DISPARO_INSTANCIA").maybeSingle(); if (data && data.valor && String(data.valor).trim()) v = String(data.valor).trim(); } catch (_) {}
  cacheInst = { em: Date.now(), v };
  return v;
}

async function segredos(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const k of ["EVOLUTION_URL", "EVOLUTION_API_KEY"]) { const v = Deno.env.get(k); if (v) out[k] = v; }
  if (!out.EVOLUTION_URL || !out.EVOLUTION_API_KEY) {
    const { data } = await admin.from("atendimento_segredos").select("chave, valor").in("chave", ["EVOLUTION_URL", "EVOLUTION_API_KEY"]);
    for (const r of data || []) if (!out[r.chave]) out[r.chave] = r.valor;
  }
  if (out.EVOLUTION_URL) out.EVOLUTION_URL = out.EVOLUTION_URL.replace(/\/+$/, "");
  return out;
}
function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || !senha.startsWith("sess_") || u.bloqueado) return false;
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
function normalizaTelefone(t: string): string | null {
  let d = String(t || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);
  if (d.length !== 11) return null;
  return "55" + d;
}

// O WhatsApp monta o cartão/botão a partir do PRIMEIRO link. Quando a mensagem tem outros links e um parágrafo só com o wa.me,
// esse parágrafo vai para o topo: aparece o botão "Iniciar conversa" (o link da via continua clicável no texto).
function waMePrimeiro(t: string): string {
  const links = t.match(/https?:\/\/\S+/g) || [];
  if (links.length < 2 || /wa\.me\//.test(links[0])) return t;
  const paras = t.split(/\n\s*\n/);
  let i = -1;
  for (let k = paras.length - 1; k >= 0; k--) {
    const ls = paras[k].match(/https?:\/\/\S+/g) || [];
    if (ls.length && ls.every((l) => /wa\.me\//.test(l))) { i = k; break; }
  }
  if (i <= 0) return t;
  const p = paras.splice(i, 1)[0];
  return [p, ...paras].join("\n\n");
}

// Mensagem padrão (08/11): sem dados da via; só quem atendeu, a loja e o link onde tudo pode ser visto.
function mensagemPadrao(pd: any, lojaNome: string | null): string {
  const bonito = (t: string) => String(t || "").trim().toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
  const primeiro = bonito(String(pd.cliente || "").trim().split(/\s+/)[0] || "");
  const atend = bonito(String(pd.atendente || "").trim().split(/\s+/).slice(0, 2).join(" "));
  const loja = lojaNome ? String(lojaNome).trim() : "";
  const link = String(pd.link || "").trim();
  let l1 = "Olá" + (primeiro ? ", " + primeiro : "") + "!";
  const quem = (atend ? atend : "") + (atend && loja ? " · " : "") + (loja ? loja : "");
  return l1 + "\n\n" + (quem ? "Atendimento: " + quem + ".\n\n" : "")
    + "Todas as informações da sua via podem ser visualizadas pelo link:\n" + link
    + "\n\nPara falar com a gente, é só clicar no link:\nhttps://wa.me/5532988307617"
    + "\n\n" + LINHA_JOINHA;
}
const WA_ATENDIMENTO = "https://wa.me/5532988307617";
const LINHA_JOINHA = "Responda com 👍 para confirmar que recebeu.";
/** Texto do número de disparo: sem "não responda", com o link de atendimento e o pedido do 👍 (vale também para textos antigos guardados nas configurações). */
function ajustaTextoDisparo(t: string): string {
  let s = String(t || "");
  s = s.replace(/N[ãa]o responda (a |esta |essa )?mensagem[.!]?\s*/gi, "");
  s = s.replace(/Caso precise falar conosco,?\s*clique no link:?/gi, "Para falar com a gente, é só clicar no link:");
  s = s.replace(/Para não receber mais mensagens, responda SAIR\.?/gi, "");
  if (!/wa\.me\/5532988307617/.test(s)) s = s.trimEnd() + "\n\nPara falar com a gente, é só clicar no link:\n" + WA_ATENDIMENTO;
  if (!/Responda com 👍/.test(s)) s = s.trimEnd() + "\n\n" + LINHA_JOINHA;
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
const fone8 = (t: string) => String(t || "").replace(/\D/g, "").slice(-8);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    // 08/11: consulta das marcas "já enviado" (botão com ✓✓). Só lê o log de envios.
    if (body.op === "consultar") {
      const sen = String(body.senha || "");
      const { data: cf } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
      const us = (Array.isArray(cf?.payload?.users) ? cf.payload.users : []).find((u: any) => sessaoValida(u, sen));
      if (!us) return json({ error: "não autorizado" }, 401);
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean).slice(0, 200);
      const marcas: Record<string, any> = {};
      if (ids.length) {
        const { data: logs } = await admin.from("auditoria_log").select("registro_id,em,usuario_nome,detalhe").eq("acao", "via_whatsapp_enviada").in("registro_id", ids).order("em", { ascending: false }).limit(2000);
        for (const l of logs || []) {
          const k = l.registro_id + "|" + String((l.detalhe && l.detalhe.botao) || "");
          if (!marcas[k]) marcas[k] = { em: l.em, por: l.usuario_nome || "", rotulo: (l.detalhe && l.detalhe.rotulo) || "" };
        }
      }
      return json({ ok: true, marcas });
    }
    const senha = String(body.senha || ""), lojaId = String(body.lojaId || "");
    let texto = String(body.texto || "").trim();
    const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config: any = (data && data.payload) || {};
    const user: any = (Array.isArray(config.users) ? config.users : []).find((u: any) => sessaoValida(u, senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    // Mensagem padrão (sem dados da via): vale para Pedido, Venda e Orçamento mesmo que a tela mande o texto antigo (cache) — o servidor monta a partir da própria via.
    const PAD: Record<string, [string, string]> = { os: ["ordens_servico", "/acompanhar.html?id="], venda: ["vendas_pdv", "/via.html?t=venda&id="], orcamento: ["orcamentos", "/via.html?t=orc&id="] };
    let lojaPad = lojaId;
    if ((!body.padrao || !/^https?:\/\//.test(String(body.padrao.link || ""))) && PAD[String(body.tipo || "")] && body.registroId) {
      const [tb, path] = PAD[String(body.tipo)];
      const { data: row } = await admin.from(tb).select("payload").eq("id", String(body.registroId)).maybeSingle();
      const pl: any = row && row.payload;
      if (pl) {
        body.padrao = { cliente: pl.cliente || "", atendente: pl.vendedora || pl.criadoPor || "", link: "https://vilaca.app" + path + encodeURIComponent(String(body.registroId)) };
        if (!lojaPad) lojaPad = String(pl.lojaId || "");
      }
    }
    if (body.padrao && /^https?:\/\//.test(String(body.padrao.link || ""))) {
      const lj = lojaPad ? (Array.isArray(config.lojas) ? config.lojas : []).find((l: any) => l && l.id === lojaPad) : null;
      texto = mensagemPadrao(body.padrao, lj ? (lj.nomePublico || lj.nomeFantasia || lj.nome || null) : null);
    }
    if (!texto || texto.length > 3000) return json({ error: "mensagem vazia ou longa demais" }, 400);
    const numero = normalizaTelefone(body.telefone);
    if (!numero) return json({ ok: false, erro: "Telefone do cliente inválido (precisa de DDD + número).", fallback: false }, 200);
    const loja = lojaId ? (Array.isArray(config.lojas) ? config.lojas : []).find((l: any) => l && l.id === lojaId) : null;
    if (loja && lojaId === "loja_rj" && user.nivel !== "diretoria" && !lojasDaSessao(user, senha).includes(lojaId)) return json({ error: "sem acesso a esta loja" }, 403);

    const INSTANCIA_PADRAO = await instanciaDisparo();
    const instancia = (loja && INSTANCIA_POR_LOJA[lojaId]) || INSTANCIA_PADRAO;
    const seg = await segredos();
    if (!seg.EVOLUTION_URL || !seg.EVOLUTION_API_KEY) return json({ ok: false, fallback: true, erro: "Servidor de WhatsApp não configurado." });
    const H = { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY };
    let estado = "";
    try {
      const rs = await fetch(`${seg.EVOLUTION_URL}/instance/connectionState/${encodeURIComponent(instancia)}`, { headers: H, signal: AbortSignal.timeout(8000) });
      const js = await rs.json().catch(() => ({}));
      estado = String((js && js.instance && js.instance.state) || js.state || "");
    } catch (_) { estado = ""; }
    const disparo = instancia === INSTANCIA_PADRAO;
    if (disparo) texto = ajustaTextoDisparo(texto);
    const vendedora = String((body.padrao && body.padrao.atendente) || body.vendedora || (String(body.tipo || "") === "chamar_cliente" ? (user.apelido || user.nome || "") : "") || "").trim();
    const lojaReg = lojaPad || lojaId || "";
    if (estado !== "open") {
      if (!disparo) return json({ ok: false, fallback: true, erro: `WhatsApp da loja (${instancia}) não está conectado.` });
      // número de disparo fora do ar: a mensagem entra na fila e sai quando ele voltar (regras da fila única)
      const tipo = String(body.tipo || ""), regId = String(body.registroId || ""), botao = String(body.botao || "").slice(0, 40);
      let marcar: any = null;
      const TB: Record<string, string> = { os: "ordens_servico", orcamento: "orcamentos", orc_acao: "orcamentos" };
      if (TB[tipo] && regId) { const { data: rw } = await admin.from(TB[tipo]).select("payload").eq("id", regId).maybeSingle(); const st = rw && rw.payload && rw.payload.status; if (st) marcar = { tabela: TB[tipo], chave: String(st) }; }
      const linha: any = { tipo: "via", campanha: "VIA (WhatsApp fora do ar)", cliente_nome: String((body.padrao && body.padrao.cliente) || body.cliente || "").slice(0, 160), telefone: numero, texto: waMePrimeiro(texto),
        loja_id: lojaReg || null, criado_por: user.apelido || user.nome || "", dia_criacao: new Date().toISOString().slice(0, 10), status: "pendente",
        registro_tabela: tipo || null, registro_id: regId || null, botao, rotulo: String(body.rotulo || "").slice(0, 60), vendedora: vendedora || null, marcar, atualizado_em: new Date().toISOString() };
      let ja: any = null;
      if (regId) { const { data: jx } = await admin.from("marketing_fila").select("id").eq("status", "pendente").eq("tipo", "via").eq("registro_id", regId).eq("botao", botao).limit(1); ja = jx && jx[0]; }
      const { error: eFila } = ja ? await admin.from("marketing_fila").update(linha).eq("id", ja.id) : await admin.from("marketing_fila").insert(linha);
      if (eFila) { console.error("enviar-via fila", eFila); return json({ ok: false, fallback: true, erro: "O WhatsApp de envio está fora do ar e não foi possível guardar a mensagem na fila." }); }
      try { await admin.from("auditoria_log").insert({ usuario_id: user.id || null, usuario_nome: user.nome || null, nivel: user.nivel || null, loja_sessao: lojaId || null, acao: "via_whatsapp_na_fila", modulo: "Envio da via", tabela: tipo, registro_id: regId, resumo: `WhatsApp fora do ar: a via ${String(body.via || "")} entrou na fila para …${numero.slice(-4)}`, detalhe: { instancia, botao } }); } catch (_) {}
      return json({ ok: false, enfileirado: true, erro: "O WhatsApp de envio está fora do ar agora. A mensagem ficou na FILA e sai sozinha quando o número voltar (das 9h às 20h)." });
    }

    const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${encodeURIComponent(instancia)}`, { method: "POST", headers: H, body: JSON.stringify({ number: numero, text: waMePrimeiro(texto) }), signal: AbortSignal.timeout(20000) });
    const rj = await r.json().catch(() => ({}));
    const ok = r.ok && rj && rj.key;
    try {
      await admin.from("auditoria_log").insert({ usuario_id: user.id || null, usuario_nome: user.nome || null, nivel: user.nivel || null, loja_sessao: lojaId || null, em_outra_loja: !!lojaId && !(Array.isArray(user.lojas) ? user.lojas : []).includes(lojaId) && user.nivel !== "diretoria",
        acao: ok ? "via_whatsapp_enviada" : "via_whatsapp_falhou", modulo: "Envio da via", tabela: String(body.tipo || ""), registro_id: String(body.registroId || ""),
        resumo: `${ok ? "Enviou" : "Falhou ao enviar"} a via ${String(body.via || "")} por WhatsApp (${instancia}) para ${numero.slice(0, 4)}…${numero.slice(-4)}`, detalhe: { instancia, status: r.status, botao: String(body.botao || "").slice(0, 40), rotulo: String(body.rotulo || "").slice(0, 60) }, agente: String(req.headers.get("user-agent") || "").slice(0, 160) });
    } catch (e) { console.error("log enviar-via", e); }
    if (ok && disparo) {
      try { await admin.rpc("disparo_manual"); } catch (_) {}
      try { await admin.from("disparo_envios").insert({ fone8: fone8(numero), telefone: numero, loja_id: lojaReg || null, vendedora: vendedora || null, tipo: String(body.tipo || ""), registro_id: String(body.registroId || "") || null, origem: "manual" }); } catch (_) {}
    }
    if (!ok) return json({ ok: false, fallback: true, erro: "O WhatsApp recusou o envio." });
    return json({ ok: true, instancia });
  } catch (e) {
    console.error("enviar-via", e);
    return json({ ok: false, fallback: true, erro: "Falha ao enviar." }, 200);
  }
});
