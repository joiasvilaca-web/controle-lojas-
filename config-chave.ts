// config-chave v1 (10/11/2026) — grava UMA chave da config (gestao_config) com sessão válida de Diretoria/Gerente.
// Existe porque o mergeConfigKey do db-gateway só aceita gastosConfig e metasMensais. Usa a função SQL atômica cfg_set_chave (só mexe na chave).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const CHAVES = new Set(["posVendaAuto", "orcamentoAcoes", "orcamentoAutoMsgConfig", "statusOrcamento", "pedidoAcoes"]);
function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const key = String(body.key || ""), senha = String(body.senha || "");
    if (!CHAVES.has(key)) return json({ error: "chave não permitida" }, 400);
    const { data: cf } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const cfg: any = (cf && cf.payload) || {};
    const user = (cfg.users || []).find((u: any) => sessaoValida(u, senha));
    if (!user) return json({ error: "sessão inválida" }, 401);
    if (user.nivel !== "diretoria" && user.nivel !== "gerente") return json({ error: "sem permissão" }, 403);
    const { error } = await admin.rpc("cfg_set_chave", { p_chave: key, p_valor: body.value === undefined ? null : body.value });
    if (error) return json({ error: String(error.message || error) }, 500);
    try { await admin.from("auditoria_log").insert({ usuario_nome: user.apelido || user.nome || "", nivel: user.nivel, acao: "config", modulo: "Configurações", tabela: "gestao_config", resumo: `Alterou: ${key}`, detalhe: { chave: key } }); } catch (_) {}
    return json({ ok: true });
  } catch (e) { return json({ error: String(e) }, 500); }
});
