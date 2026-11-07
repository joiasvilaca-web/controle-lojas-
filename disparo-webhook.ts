// disparo-webhook v2 (07/11/2026): quem responde SAIR (ou PARAR, CANCELAR…) ganha a tag MARKETING OFF no cadastro, tem as mensagens pendentes da fila canceladas e recebe uma confirmação.
// disparo-webhook v1 (05/11/2026) — webhook da instância "vilaca" (número só de disparo: vias, aniversário, campanhas).
// Não registra nada no CHAT e não aciona o bot. Se um cliente responder, manda UMA resposta automática
// (no máximo 1 a cada 12 h por número) dizendo que este número não atende e passando o número de atendimento.
// Token do webhook em atendimento_segredos.DISPARO_WEBHOOK_TOKEN (URL: ...?t=TOKEN). Controle de repetição: tabela disparo_respostas.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const INTERVALO_MS = 12 * 60 * 60 * 1000;
const TEXTO_PADRAO = "Olá! 😊 Este número da Vilaça Joias é usado apenas para envio automático de avisos e campanhas, e as mensagens enviadas para cá não são lidas.\n\nPara falar com a nossa equipe, chame no WhatsApp (32) 98830-7617:\nhttps://wa.me/5532988307617";

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
const semAcento = (s: string) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const PALAVRAS_SAIR = ["sair", "parar", "pare", "cancelar", "descadastrar", "remover", "nao quero", "nao quero receber"];
const TEXTO_SAIR = "Tudo certo! 👍 Você não receberá mais mensagens de campanhas da Vilaça Joias.\n\nSe precisar de algo, é só chamar no WhatsApp (32) 98830-7617.";
async function sairDaLista(numero: string): Promise<void> {
  const f8 = numero.replace(/\D/g, "").slice(-8);
  const { data: cfg } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  const tags: any[] = (cfg && (cfg.payload as any) && (cfg.payload as any).tagsClientes) || [];
  const tag = tags.find((t: any) => semAcento(t.nome) === "marketing off");
  if (tag) await admin.rpc("marcar_marketing_off", { p_fone8: f8, p_tag: String(tag.id) });
  const { data: pend } = await admin.from("marketing_fila").select("id, telefone").eq("status", "pendente");
  const ids = (pend || []).filter((r: any) => String(r.telefone || "").replace(/\D/g, "").slice(-8) === f8).map((r: any) => r.id);
  if (ids.length) await admin.from("marketing_fila").update({ status: "cancelado", erro: "Cliente pediu para sair (respondeu SAIR)", atualizado_em: new Date().toISOString() }).in("id", ids);
}

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
      const m = (d && d.message) || {};
      const txt = semAcento(String(m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || ""));
      if (txt && PALAVRAS_SAIR.includes(txt)) {
        try { await sairDaLista(numero); } catch (e) { console.error("disparo-webhook sair", e); }
        await fetch(`${seg.EVOLUTION_URL}/message/sendText/${encodeURIComponent(instancia)}`, {
          method: "POST", headers: { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY },
          body: JSON.stringify({ number: numero, text: TEXTO_SAIR }), signal: AbortSignal.timeout(20000),
        }).catch(() => {});
        await admin.from("disparo_respostas").upsert({ numero, respondido_em: new Date().toISOString(), instancia });
        continue;
      }
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
