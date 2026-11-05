// enviar-via v1 (05/11/2026) — dispara a via (link) ao cliente pelo WhatsApp da loja, sem abrir o WhatsApp Web.
// Loja Reforma → instância "reformajoias"; demais lojas → instância "vilaca". Se a instância não estiver conectada, devolve fallback:true
// (o app então abre o wa.me como antes). Tudo fica no LOG (auditoria_log) e a mensagem aparece no Atendimento via webhook SEND_MESSAGE.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const INSTANCIA_POR_LOJA: Record<string, string> = { loja_rj: "reformajoias" };
const INSTANCIA_PADRAO = "vilaca";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const senha = String(body.senha || ""), lojaId = String(body.lojaId || ""), texto = String(body.texto || "").trim();
    const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config: any = (data && data.payload) || {};
    const user: any = (Array.isArray(config.users) ? config.users : []).find((u: any) => sessaoValida(u, senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    if (!texto || texto.length > 3000) return json({ error: "mensagem vazia ou longa demais" }, 400);
    const numero = normalizaTelefone(body.telefone);
    if (!numero) return json({ ok: false, erro: "Telefone do cliente inválido (precisa de DDD + número).", fallback: false }, 200);
    const loja = (Array.isArray(config.lojas) ? config.lojas : []).find((l: any) => l && l.id === lojaId);
    if (!loja) return json({ error: "loja inválida" }, 400);
    if (user.nivel !== "diretoria" && !lojasDaSessao(user, senha).includes(lojaId)) return json({ error: "sem acesso a esta loja" }, 403);

    const instancia = INSTANCIA_POR_LOJA[lojaId] || INSTANCIA_PADRAO;
    const seg = await segredos();
    if (!seg.EVOLUTION_URL || !seg.EVOLUTION_API_KEY) return json({ ok: false, fallback: true, erro: "Servidor de WhatsApp não configurado." });
    const H = { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY };
    let estado = "";
    try {
      const rs = await fetch(`${seg.EVOLUTION_URL}/instance/connectionState/${encodeURIComponent(instancia)}`, { headers: H, signal: AbortSignal.timeout(8000) });
      const js = await rs.json().catch(() => ({}));
      estado = String((js && js.instance && js.instance.state) || js.state || "");
    } catch (_) { estado = ""; }
    if (estado !== "open") return json({ ok: false, fallback: true, erro: `WhatsApp da loja (${instancia}) não está conectado.` });

    const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${encodeURIComponent(instancia)}`, { method: "POST", headers: H, body: JSON.stringify({ number: numero, text: texto }), signal: AbortSignal.timeout(20000) });
    const rj = await r.json().catch(() => ({}));
    const ok = r.ok && rj && rj.key;
    try {
      await admin.from("auditoria_log").insert({ usuario_id: user.id || null, usuario_nome: user.nome || null, nivel: user.nivel || null, loja_sessao: lojaId, em_outra_loja: !(Array.isArray(user.lojas) ? user.lojas : []).includes(lojaId) && user.nivel !== "diretoria",
        acao: ok ? "via_whatsapp_enviada" : "via_whatsapp_falhou", modulo: "Envio da via", tabela: String(body.tipo || ""), registro_id: String(body.registroId || ""),
        resumo: `${ok ? "Enviou" : "Falhou ao enviar"} a via ${String(body.via || "")} por WhatsApp (${instancia}) para ${numero.slice(0, 4)}…${numero.slice(-4)}`, detalhe: { instancia, status: r.status }, agente: String(req.headers.get("user-agent") || "").slice(0, 160) });
    } catch (e) { console.error("log enviar-via", e); }
    if (!ok) return json({ ok: false, fallback: true, erro: "O WhatsApp recusou o envio. Abrindo o WhatsApp manual." });
    return json({ ok: true, instancia });
  } catch (e) {
    console.error("enviar-via", e);
    return json({ ok: false, fallback: true, erro: "Falha ao enviar." }, 200);
  }
});
