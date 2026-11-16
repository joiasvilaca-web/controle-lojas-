// v18 (16/11/2026): instância da Reforma (reformajoias) — a mensagem sai SEM o bloco "Para falar com a gente, é só clicar no link: wa.me/…" e SEM "Responda com 👍 para confirmar que recebeu." (limpaTextoReforma). O cliente da Reforma responde no próprio número, que é o do CHAT. Nada muda no número de disparo nem no oficial.
// v17 (11/11/2026): TUDO pelo número OFICIAL (API da Meta, +55 32 98830-7617), exceto a loja Reforma (número próprio). A mensagem entra na marketing_fila com status 'cloud_fila' e a função disparo-cloud envia na hora (modelos aprovados). Sem restrição de horário. Desliga com atendimento_segredos.OFICIAL_TUDO = 'off' (volta ao chip). Chamar cliente só sai pela API com atendimento_segredos.CHAMAR_API = 'on' (modelo aprovado pela Meta).
// v13–v16: texto livre oficial (desligado), marca posVenda, fila única por via e tipo. v1–v12: ver AGENTS.md.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const INSTANCIA_POR_LOJA: Record<string, string> = { loja_rj: "reformajoias" };
let cacheInst: { em: number; v: string } | null = null;
async function instanciaDisparo(): Promise<string> {
  if (cacheInst && Date.now() - cacheInst.em < 60000) return cacheInst.v;
  let v = "vilaca";
  try { const { data } = await admin.from("atendimento_segredos").select("valor").eq("chave", "DISPARO_INSTANCIA").maybeSingle(); if (data && data.valor && String(data.valor).trim()) v = String(data.valor).trim(); } catch (_) {}
  cacheInst = { em: Date.now(), v };
  return v;
}
async function chave(k: string): Promise<string> {
  try { const { data } = await admin.from("atendimento_segredos").select("valor").eq("chave", k).maybeSingle(); return String((data && data.valor) || "").trim(); } catch (_) { return ""; }
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
function ajustaTextoDisparo(t: string): string {
  let s = String(t || "");
  s = s.replace(/N[ãa]o responda (a |esta |essa )?mensagem[.!]?\s*/gi, "");
  s = s.replace(/Caso precise falar conosco,?\s*clique no link:?/gi, "Para falar com a gente, é só clicar no link:");
  s = s.replace(/Para não receber mais mensagens, responda SAIR\.?/gi, "");
  if (!/wa\.me\/5532988307617/.test(s)) s = s.trimEnd() + "\n\nPara falar com a gente, é só clicar no link:\n" + WA_ATENDIMENTO;
  if (!/Responda com 👍/.test(s)) s = s.trimEnd() + "\n\n" + LINHA_JOINHA;
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
/** v18: texto da instância da Reforma — sem o link "falar com a gente" (wa.me) e sem o pedido do 👍. */
function limpaTextoReforma(t: string): string {
  let s = String(t || "");
  s = s.replace(/(Para falar com a gente, é só clicar no link|Caso precise falar conosco,?\s*clique no link):?[ \t]*\n?[ \t]*https?:\/\/wa\.me\/\S+/gi, "");
  s = s.replace(/Responda com 👍 para confirmar que recebeu\.?/g, "");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
const fone8 = (t: string) => String(t || "").replace(/\D/g, "").slice(-8);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
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
    const disparo = instancia === INSTANCIA_PADRAO;
    const oficial = disparo && lojaId !== "loja_rj" && (await chave("OFICIAL_TUDO")).toLowerCase() !== "off";
    const tipo = String(body.tipo || ""), regId = String(body.registroId || ""), botao = String(body.botao || "").slice(0, 40);
    const chamarBloq = oficial && tipo === "chamar_cliente" && (await chave("CHAMAR_API")).toLowerCase() !== "on";
    const seg = oficial ? {} as Record<string, string> : await segredos();
    if (!oficial && (!seg.EVOLUTION_URL || !seg.EVOLUTION_API_KEY)) return json({ ok: false, fallback: true, erro: "Servidor de WhatsApp não configurado." });
    const H = { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY };
    let estado = oficial ? "oficial" : "";
    if (!oficial) {
      try {
        const rs = await fetch(`${seg.EVOLUTION_URL}/instance/connectionState/${encodeURIComponent(instancia)}`, { headers: H, signal: AbortSignal.timeout(8000) });
        const js = await rs.json().catch(() => ({}));
        estado = String((js && js.instance && js.instance.state) || js.state || "");
      } catch (_) { estado = ""; }
    }
    if (disparo && !oficial) texto = ajustaTextoDisparo(texto);
    else if (oficial) texto = ajustaTextoDisparo(texto);
    else if (instancia === INSTANCIA_POR_LOJA.loja_rj) texto = limpaTextoReforma(texto);   // v18: Reforma sem o link de atendimento e sem o 👍
    if (!texto) return json({ error: "mensagem vazia ou longa demais" }, 400);
    const vendedora = String((body.padrao && body.padrao.atendente) || body.vendedora || (tipo === "chamar_cliente" ? (user.apelido || user.nome || "") : "") || "").trim();
    const lojaReg = lojaPad || lojaId || "";
    if (estado !== "open") {
      if (!disparo) return json({ ok: false, fallback: true, erro: `WhatsApp da loja (${instancia}) não está conectado.` });
      let marcar: any = null;
      const TB: Record<string, string> = { os: "ordens_servico", orcamento: "orcamentos", orc_acao: "orcamentos" };
      if (TB[tipo] && regId) { const { data: rw } = await admin.from(TB[tipo]).select("payload").eq("id", regId).maybeSingle(); const st = String(body.statusDestino || "").trim() || (rw && rw.payload && rw.payload.status); if (st) marcar = { tabela: TB[tipo], chave: String(st) }; }
      if (tipo === "posvenda" && regId) {
        for (const tb of ["vendas_pdv", "ordens_servico"]) { const { data: rw } = await admin.from(tb).select("id").eq("id", regId).maybeSingle(); if (rw) { marcar = { tabela: tb, chave: "posvenda", posVenda: true }; break; } }
      }
      const viaCloud = oficial && !chamarBloq;
      const linha: any = { tipo: "via", campanha: oficial ? "VIA (API oficial)" : "VIA (WhatsApp fora do ar)", cliente_nome: String((body.padrao && body.padrao.cliente) || body.cliente || "").slice(0, 160), telefone: numero, texto: waMePrimeiro(texto),
        loja_id: lojaReg || null, criado_por: user.apelido || user.nome || "", dia_criacao: new Date().toISOString().slice(0, 10), status: viaCloud ? "cloud_fila" : "pendente",
        registro_tabela: tipo || null, registro_id: regId || null, botao, rotulo: String(body.rotulo || "").slice(0, 60), vendedora: vendedora || null, marcar, atualizado_em: new Date().toISOString() };
      let ja: any = null;
      if (regId) { let qj = admin.from("marketing_fila").select("id").in("status", ["pendente", "cloud_fila"]).eq("tipo", "via").eq("registro_id", regId); if (tipo) qj = qj.eq("registro_tabela", tipo); const { data: jx } = await qj.limit(1); ja = jx && jx[0]; }
      let filaId: any = ja ? ja.id : null;
      let eFila: any = null;
      if (ja) { const r1 = await admin.from("marketing_fila").update(linha).eq("id", ja.id); eFila = r1.error; }
      else { const r2 = await admin.from("marketing_fila").insert(linha).select("id"); eFila = r2.error; filaId = r2.data && r2.data[0] && r2.data[0].id; }
      if (eFila) { console.error("enviar-via fila", eFila); return json({ ok: false, fallback: true, erro: "Não foi possível guardar a mensagem na fila." }); }
      try { await admin.from("auditoria_log").insert({ usuario_id: user.id || null, usuario_nome: user.nome || null, nivel: user.nivel || null, loja_sessao: lojaId || null, acao: "via_whatsapp_na_fila", modulo: "Envio da via", tabela: tipo, registro_id: regId, resumo: `A via ${String(body.via || "")} entrou na fila (${oficial ? "API oficial" : "chip fora do ar"}) para …${numero.slice(-4)}`, detalhe: { instancia, botao, oficial } }); } catch (_) {}
      if (chamarBloq) return json({ ok: false, enfileirado: true, erro: "O Chamar cliente pelo número oficial aguarda a aprovação do modelo pela Meta. A mensagem ficou na FILA." });
      if (viaCloud && filaId) {
        try {
          const tk = await chave("MARKETING_CRON_TOKEN");
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/disparo-cloud`, { method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": tk }, body: "{}", signal: AbortSignal.timeout(20000) });
        } catch (_) {}
        const { data: fin } = await admin.from("marketing_fila").select("status,erro").eq("id", filaId).maybeSingle();
        if (fin && fin.status === "enviado") return json({ ok: true, instancia: "oficial" });
        if (fin && (fin.status === "falhou" || fin.status === "cancelado")) return json({ ok: false, fallback: true, erro: "O envio pelo número oficial falhou: " + String(fin.erro || "erro desconhecido") });
        return json({ ok: false, enfileirado: true, erro: "Enviando pelo número oficial… a mensagem sai em instantes." });
      }
      return json({ ok: false, enfileirado: true, erro: "O WhatsApp de envio está fora do ar agora. A mensagem ficou na FILA e sai sozinha quando o número voltar." });
    }

    const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${encodeURIComponent(instancia)}`, { method: "POST", headers: H, body: JSON.stringify({ number: numero, text: waMePrimeiro(texto) }), signal: AbortSignal.timeout(20000) });
    const rj = await r.json().catch(() => ({}));
    const ok = r.ok && rj && rj.key;
    try {
      await admin.from("auditoria_log").insert({ usuario_id: user.id || null, usuario_nome: user.nome || null, nivel: user.nivel || null, loja_sessao: lojaId || null, em_outra_loja: !!lojaId && !(Array.isArray(user.lojas) ? user.lojas : []).includes(lojaId) && user.nivel !== "diretoria",
        acao: ok ? "via_whatsapp_enviada" : "via_whatsapp_falhou", modulo: "Envio da via", tabela: tipo, registro_id: regId,
        resumo: `${ok ? "Enviou" : "Falhou ao enviar"} a via ${String(body.via || "")} por WhatsApp (${instancia}) para ${numero.slice(0, 4)}…${numero.slice(-4)}`, detalhe: { instancia, status: r.status, botao, rotulo: String(body.rotulo || "").slice(0, 60) }, agente: String(req.headers.get("user-agent") || "").slice(0, 160) });
    } catch (e) { console.error("log enviar-via", e); }
    if (ok && disparo) {
      try { await admin.rpc("disparo_manual"); } catch (_) {}
      try { await admin.from("disparo_envios").insert({ fone8: fone8(numero), telefone: numero, loja_id: lojaReg || null, vendedora: vendedora || null, tipo, registro_id: regId || null, origem: "manual" }); } catch (_) {}
    }
    if (!ok) return json({ ok: false, fallback: true, erro: "O WhatsApp recusou o envio." });
    return json({ ok: true, instancia });
  } catch (e) {
    console.error("enviar-via", e);
    return json({ ok: false, fallback: true, erro: "Falha ao enviar." }, 200);
  }
});
