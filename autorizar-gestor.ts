// autorizar-gestor v1 — senha de gerente/diretoria libera uma ação (reabrir caixa, editar via com nota, caixa fechado, outra loja).
// Entrada: { sessao, senhaGestor, acao, modulo, registroId, resumo }. Confere a sessão de quem pede, compara a senha (bcrypt)
// com gerentes/diretoria e grava em auditoria_log quem pediu, quem autorizou e o quê. 5 senhas erradas em 10 min = espera.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function usuarioDaSessao(cfg: any, senha: string) {
  if (!senha || !String(senha).startsWith("sess_")) return null;
  const agora = Date.now();
  return ((cfg && cfg.users) || []).find((u: any) => u && !u.bloqueado && ((u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) || (Array.isArray(u.sessoes) && u.sessoes.some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora))))) || null;
}
const corta = (s: unknown, n: number) => String(s == null ? "" : s).slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    const { data: row } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const cfg = (row && row.payload) || {};
    const u = usuarioDaSessao(cfg, String(b.sessao || ""));
    if (!u) return json({ ok: false, error: "Sessão inválida. Faça login de novo." }, 401);
    const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin.from("auditoria_log").select("id", { count: "exact", head: true }).eq("acao", "autorizacao_negada").eq("usuario_id", String(u.id || u.nome)).gte("em", desde);
    if ((count || 0) >= 5) return json({ ok: false, error: "Muitas senhas erradas. Aguarde 10 minutos." });
    const senha = String(b.senhaGestor || "");
    const g = senha ? (cfg.users || []).find((x: any) => (x.nivel === "diretoria" || x.nivel === "gerente") && x.senhaHash && !x.bloqueado && bcrypt.compareSync(senha, x.senhaHash)) : null;
    const base = { usuario_id: String(u.id || u.nome), usuario_nome: corta(u.nome, 80), nivel: u.nivel || null, modulo: corta(b.modulo || "", 60), registro_id: corta(b.registroId || "", 120), agente: corta(req.headers.get("user-agent"), 200) };
    if (!g) {
      await admin.from("auditoria_log").insert({ ...base, acao: "autorizacao_negada", resumo: corta("Senha da gerência errada para: " + (b.resumo || b.acao || ""), 400), detalhe: { acao: b.acao || null } });
      return json({ ok: false, error: "Senha não autorizada. Use a senha de um gerente ou da diretoria." });
    }
    await admin.from("auditoria_log").insert({ ...base, acao: "autorizacao_gerencial", resumo: corta((b.resumo || b.acao || "Ação liberada") + " — autorizado por " + g.nome, 400), detalhe: { acao: b.acao || null, autorizadoPor: g.nome, nivelAutorizador: g.nivel, pedidoPor: u.nome } });
    return json({ ok: true, nome: g.nome, nivel: g.nivel });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});
