// qr-instancia v1 (05/11/2026) — mostra o QR da instância "vilaca" numa página (qr.html) com token de uso único e curto (15 min).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const INSTANCIA = "vilaca";
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const t = new URL(req.url).searchParams.get("t") || "";
    const { data } = await admin.from("atendimento_segredos").select("chave, valor").in("chave", ["QR_TOKEN", "EVOLUTION_URL", "EVOLUTION_API_KEY"]);
    const seg: Record<string, string> = {}; for (const r of data || []) seg[r.chave] = r.valor;
    const [tok, exp] = String(seg.QR_TOKEN || "").split("|");
    if (!t || !tok || t !== tok || Number(exp) < Date.now()) return json({ error: "link vencido" }, 401);
    const base = String(seg.EVOLUTION_URL || "").replace(/\/+$/, "");
    const H = { apikey: seg.EVOLUTION_API_KEY };
    const st = await (await fetch(`${base}/instance/connectionState/${INSTANCIA}`, { headers: H, signal: AbortSignal.timeout(8000) })).json().catch(() => ({}));
    const state = String((st && st.instance && st.instance.state) || "");
    if (state === "open") { await admin.from("atendimento_segredos").delete().eq("chave", "QR_TOKEN"); return json({ state: "open" }); }
    const c = await (await fetch(`${base}/instance/connect/${INSTANCIA}`, { headers: H, signal: AbortSignal.timeout(20000) })).json().catch(() => ({}));
    return json({ state, base64: c.base64 || null });
  } catch (e) { console.error("qr-instancia", e); return json({ error: "falha" }, 500); }
});
