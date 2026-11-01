// caixa-resumo v1 — manda o resumo do fechamento de caixa para a diretoria pelo WhatsApp (Evolution API).
// Números e instância: config.resumoCaixa { ativo, numeros: ["5532999999999"], instancia: "reformajoias" } (Configurações › Resumo do caixa).
// ops: enviar (qualquer usuário logado, ao fechar o caixa) · teste (só diretoria).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function segredos() {
  const out: Record<string, string> = {};
  const { data } = await admin.from("atendimento_segredos").select("chave, valor");
  for (const r of data || []) out[r.chave] = r.valor;
  if (Deno.env.get("EVOLUTION_URL")) out.EVOLUTION_URL = Deno.env.get("EVOLUTION_URL")!;
  if (out.EVOLUTION_URL) out.EVOLUTION_URL = out.EVOLUTION_URL.replace(/\/+$/, "");
  return out;
}
function usuarioDaSessao(cfg: any, senha: string) {
  if (!senha || !String(senha).startsWith("sess_")) return null;
  const agora = Date.now();
  return ((cfg && cfg.users) || []).find((u: any) => u && !u.bloqueado && ((u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) || (Array.isArray(u.sessoes) && u.sessoes.some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora))))) || null;
}
function numeroWa(n: string) {
  let d = String(n || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d.length >= 12 ? d : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const { data: row } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const cfg = (row && row.payload) || {};
    const u = usuarioDaSessao(cfg, String(b.senha || ""));
    if (!u) return json({ error: "Sessão inválida. Faça login de novo." }, 401);
    const rc = cfg.resumoCaixa || {};
    const teste = b.op === "teste";
    if (teste && u.nivel !== "diretoria") return json({ error: "Só a Diretoria pode enviar o teste." }, 403);
    if (!teste && rc.ativo === false) return json({ ok: true, enviados: 0, desligado: true });
    const numeros = (Array.isArray(rc.numeros) ? rc.numeros : []).map(numeroWa).filter(Boolean);
    if (!numeros.length) return json({ error: "Nenhum número da diretoria cadastrado em Configurações › Resumo do caixa." });
    const instancia = String(rc.instancia || Object.keys(cfg.atendimentoInstancias || {})[0] || "").trim();
    if (!instancia) return json({ error: "Nenhuma conexão de WhatsApp configurada no Atendimento." });
    const texto = teste ? `✅ Teste do resumo de caixa — Vilaça Joias\nEnviado por ${u.nome} em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.` : String(b.texto || "").slice(0, 3500);
    if (!texto.trim()) return json({ error: "Resumo vazio." });
    const s = await segredos();
    if (!s.EVOLUTION_URL || !s.EVOLUTION_API_KEY) return json({ error: "WhatsApp (Evolution) não configurado." });
    const res: any[] = [];
    for (const n of numeros) {
      try {
        const r = await fetch(`${s.EVOLUTION_URL}/message/sendText/${encodeURIComponent(instancia)}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: s.EVOLUTION_API_KEY }, body: JSON.stringify({ number: n, text: texto }) });
        res.push({ n, ok: r.ok, status: r.status, erro: r.ok ? undefined : (await r.text()).slice(0, 150) });
      } catch (e) { res.push({ n, ok: false, erro: String(e).slice(0, 150) }); }
    }
    const ok = res.filter((r) => r.ok).length;
    return json({ ok: ok > 0, enviados: ok, total: numeros.length, detalhes: res, ...(ok ? {} : { error: "O WhatsApp não aceitou o envio: " + (res[0] && res[0].erro || "") }) });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
