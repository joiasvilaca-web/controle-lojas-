// buscar-clientes v1 (06/11/2026) — busca de CLIENTES do cadastro com a regra única de busca do app:
// por qualquer parte do nome (começando, contendo, ou contendo as palavras em qualquer ordem), sem acento, sem diferenciar
// maiúscula/minúscula, vírgula = ponto, hífen = espaço; telefone/CPF por dígitos. A ordem da lista segue o que foi digitado.
// Substitui a op "searchClients" do db-gateway (que continua existindo como reserva — o app cai nela se esta função falhar).
// Mesma regra de permissão do gateway: sessão válida + módulo os / vendas / orcamentos / marketing.
// Busca no banco pela função SQL buscar_clientes_norm (SECURITY DEFINER, só service_role). verify_jwt: true.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
function moduloAtivo(user: any, id: string): boolean {
  const perm = user.permissoes;
  if (perm && perm[id] && typeof perm[id].ativo === "boolean") return perm[id].ativo;
  if (user.nivel === "diretoria" || user.nivel === "gerente") return true;
  if (user.nivel === "oficina") return ["os", "dashboard", "dp", "ia", "gravacoes"].includes(id);
  return id !== "config" || (perm && perm.config && perm.config.ativo === true);
}
// mesma normalização do app (busca.js): sem acento, minúsculo, ; e . viram vírgula, hífen/barra/parênteses viram espaço
function norm(s: string): string {
  return String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[;.]/g, ",").replace(/[-–—_\/\\()\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const senha = String(body.senha || "");
    const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config: any = (data && data.payload) || {};
    const user: any = (Array.isArray(config.users) ? config.users : []).find((u: any) => sessaoValida(u, senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    if (!["os", "vendas", "orcamentos", "marketing"].some((m) => moduloAtivo(user, m))) return json({ error: "sem permissão" }, 403);

    const bruto = String(body.termo || "").trim().slice(0, 80);
    if (bruto.length < 2) return json({ data: [] });
    const frase = norm(bruto);
    const tokens = frase.split(" ").map((t) => t.replace(/^,+|,+$/g, "") || t).filter(Boolean);
    const digitos = bruto.replace(/\D/g, "");
    const maisDigitos = digitos.length >= Math.ceil(bruto.replace(/[\s()+-]/g, "").length / 2);
    const { data: r, error } = await admin.rpc("buscar_clientes_norm", {
      p_tokens: tokens, p_frase: tokens.join(" "), p_digitos: maisDigitos ? digitos : "", p_lim: Number(body.limite) || 12,
    });
    if (error) throw error;
    return json({ data: (r || []).filter(Boolean) });
  } catch (e) {
    console.error("buscar-clientes", e);
    return json({ error: "falha na busca" }, 500);
  }
});
