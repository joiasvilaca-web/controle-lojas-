// disparo-webhook v3 (10/11/2026): (1) curtida/reação, figurinha, aviso do sistema, 👍 sozinho, "ok", "obrigado"… → NÃO responde nada;
//   (2) qualquer outra mensagem → manda o link do atendimento e o menu das lojas. Se o último disparo para aquele telefone (disparo_envios, 30 dias) foi de
//   Marechal Center, João Beraldo ou Jardim Norte, mostra só a opção dessa loja e o nome de quem atendeu; senão (aniversário, mala direta, Ecommerce,
//   Reforma ou sem registro), mostra as 3 lojas. Continua no máximo 1 resposta a cada 12 h por número. SAIR continua igual.
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

// ---------- v3: o que é "só curtir / notificação" ----------
const TIPOS_SILENCIO = ["reactionMessage", "stickerMessage", "protocolMessage", "pollUpdateMessage", "senderKeyDistributionMessage", "messageContextInfo", "editedMessage", "keepInChatMessage", "pinInChatMessage", "encReactionMessage"];
const PALAVRAS_OK = ["ok", "okay", "okk", "blz", "beleza", "certo", "recebi", "recebido", "obrigado", "obrigada", "obg", "brigado", "brigada", "valeu", "vlw", "show", "top", "perfeito", "otimo", "sim", "ta", "ta bom", "ta certo", "entendi", "obrigado recebi", "recebi obrigada", "recebi obrigado", "ok obrigado", "ok obrigada"];
function soReacao(d: any, m: any): boolean {
  const tipo = String((d && d.messageType) || "");
  if (TIPOS_SILENCIO.includes(tipo)) return true;
  const chaves = Object.keys(m || {}).filter((k) => k !== "messageContextInfo");
  if (!chaves.length) return true;   // sem conteúdo (aviso do sistema)
  if (chaves.every((k) => TIPOS_SILENCIO.includes(k))) return true;
  const bruto = String(m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || "");
  if (!bruto && (m.conversation !== undefined || m.extendedTextMessage)) return true;
  if (bruto) {
    if (!/[\p{L}\p{N}]/u.test(bruto)) return true;   // só emoji/pontuação (👍, ❤️, 🙏…)
    const limpo = semAcento(bruto);
    if (PALAVRAS_OK.includes(limpo)) return true;
  }
  return false;
}
// ---------- v3: resposta com a loja e quem atendeu ----------
const LOJAS_MENU: Record<string, string> = { loja_mc: "1 - LOJA MARECHAL CENTER", loja_jb: "2 - LOJA JOÃO BERALDO", loja_jn: "3 - LOJA JARDIM NORTE" };
const bonito = (t: string) => String(t || "").trim().toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());
async function textoResposta(numero: string): Promise<string> {
  const f8 = numero.replace(/\D/g, "").slice(-8);
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data } = await admin.from("disparo_envios").select("loja_id, vendedora, tipo").eq("fone8", f8).gte("em", desde).order("em", { ascending: false }).limit(1);
  const ult = data && data[0];
  const linhaLoja = ult && ult.loja_id ? LOJAS_MENU[String(ult.loja_id)] : "";
  const vend = ult && ult.vendedora ? bonito(String(ult.vendedora).split(/\s+/).slice(0, 2).join(" ")) : "";
  let t = "Olá! 😊 Este número da Vilaça Joias só envia avisos e não recebe mensagens.\n\nPara falar com a gente, é só clicar no link:\nhttps://wa.me/5532988307617\n\n";
  if (linhaLoja) {
    t += "Quando o atendimento pedir a loja, digite:\n" + linhaLoja;
    if (vend) t += "\n\nE peça para falar com *" + vend + "*.";
  } else {
    t += "Quando o atendimento pedir a loja, digite o número dela:\n" + Object.values(LOJAS_MENU).join("\n");
  }
  return t;
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
      if (soReacao(d, m)) continue;   // curtiu, figurinha, aviso do sistema, 👍, "ok"…: não responde
      const { data: ult } = await admin.from("disparo_respostas").select("respondido_em").eq("numero", numero).maybeSingle();
      if (ult && Date.now() - new Date(ult.respondido_em).getTime() < INTERVALO_MS) continue;
      await admin.from("disparo_respostas").upsert({ numero, respondido_em: new Date().toISOString(), instancia });
      let texto = TEXTO_PADRAO;
      try { texto = await textoResposta(numero); } catch (e) { console.error("disparo-webhook resposta", e); }
      const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText/${encodeURIComponent(instancia)}`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: seg.EVOLUTION_API_KEY },
        body: JSON.stringify({ number: numero, text: texto }), signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) console.error("disparo-webhook envio", r.status, await r.text().catch(() => ""));
    }
    return ok();
  } catch (e) { console.error("disparo-webhook", e); return ok(); }
});
