// disparo-webhook v1 (05/11/2026) — webhook da instância "vilaca" (número só de disparo: vias, aniversário, campanhas).
// Não registra nada no CHAT e não aciona o bot. Se um cliente responder, manda UMA resposta automática
// (no máximo 1 a cada 12 h por número) dizendo que este número não atende e passando o número de atendimento.
// Token do webhook em atendimento_segredos.DISPARO_WEBHOOK_TOKEN (URL: ...?t=TOKEN). Controle de repetição: tabela disparo_respostas.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const INTERVALO_MS = 12 * 60 * 60 * 1000;
const TEXTO_PADRAO = "Olá! 😊 Este número da Vilaça Joias é usado apenas para envio automático de avisos e campanhas, e as mensagens enviadas para cá não são lidas.\n\nPara falar com a nossa equipe, chame no WhatsApp (43) 98830-7617:\nhttps://wa.me/5543988307617";

let cache: { em: number; seg: Record<string, string> } | null = null;
async function segredos(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.em < 60000) return cache.seg;
  const { data } = await admin.from("atendimento_segredos").select("chave, valor").in("chave", ["EVOLUTION_URL", "EVOLUTION_API_KEY", "DISPARO_WEBHOOK_TOKEN", "DISPARO_RESPOSTA_TEXTO"]);
  const seg: Record<string, string> = {}; for (const r of data || []) seg[r.chave] = r.valor;
  if (seg.EVOLUTION_URL) seg.EVOLUTION_URL = seg.EVOLUTION_URL.replace(/\/+$/, "");
  cache = { em: Date.now(), seg };
  return seg;
}
const ok = () => new Response("ok", { status: 200 });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return ok();
  try {
    const seg = await segredos();
    const t = new URL(req.url).searchParams.get("t") || "";
    if (!seg.DISPARO_WEBHOOK_TOKEN || t !== seg.DISPARO_WEBHOOK_TOKEN) return new Response("unauthorized", { status: 401 });
    const body = await req.json().catch(() => ({}));
    const evento = String(body.event || "").toLowerCase().replace(/_/g, ".");
    if (evento !== "messages.upsert") return ok();
    const instancia = String(body.instance || "vilaca");
    const lista = Array.isArray(body.data) ? body.data : [body.data];
    for (const d of lista) {
      const key = (d && d.key) || {};
      const jid = String(key.remoteJid || "");
      if (key.fromMe || !jid.endsWith("@s.whatsapp.net")) continue; // ignora o que a loja mandou, grupos, status e canais
      const numero = jid.split("@")[0];
      const { data: ult } = await admin.from("disparo_respostas").select("respondido_em").eq("numero", numero).maybeSingle();
      if (ult && Date.now() - new Date(ult.respondido_em).getTime() < INTERVALO_MS) continue;
      await admin.from("disparo_respostas").upsert({ numero, respondido_em: new Date().toISOString(), instancia });
      const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${encodeURIComponent(instancia)}`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY },
        body: JSON.stringify({ number: numero, text: seg.DISPARO_RESPOSTA_TEXTO || TEXTO_PADRAO }), signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) console.error("disparo-webhook envio", r.status, await r.text().catch(() => ""));
    }
    return ok();
  } catch (e) { console.error("disparo-webhook", e); return ok(); }
});
