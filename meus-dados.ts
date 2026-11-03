// meus-dados v1 — cada usuário vê (ver) e edita (salvar) os PRÓPRIOS dados pessoais da ficha de RH (dp_funcionarios).
// Sessão (sess_…) validada contra gestao_config. A ficha é sempre a do próprio usuário (funcionarioId); nunca aceita id vindo da tela.
// Só campos de contato/endereço/banco são editáveis; CPF, cargo, admissão, salário etc. continuam com o DP.
import { createClient } from "npm:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
const t = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const MAIUSC = ["endereco", "numero", "complemento", "bairro", "cidade", "estado", "contatoEmergenciaNome", "banco"];
const SEM_MAIUSC = ["celularParticular", "telefoneFixo", "celularLoja", "estadoCivil", "cep", "contatoEmergenciaTelefone", "tipoConta", "agencia", "conta", "tipoPix", "chavePix", "temFilhos"];
const SOMENTE_LEITURA = ["nome", "apelido", "email", "foto", "cargo", "loja", "dataAdmissao", "tipoContrato", "cpf", "rg", "dataNascimento", "escolaridade", "pis", "ctpsNumero", "ctpsSerie"];
const EDITAVEIS = [...MAIUSC, ...SEM_MAIUSC, "filhos"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    const { data: cfgRow } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config = (cfgRow && cfgRow.payload) || {};
    const user = (config.users || []).find((u: any) => sessaoValida(u, b.senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    const funcId = user.funcionarioId || user.id;
    const { data: rows } = await admin.from("dp_funcionarios").select("id,payload");
    const row = (rows || []).find((r: any) => r.payload && (r.payload.funcionarioId === funcId || r.payload.funcionarioId === user.id));
    const op = String(b.op || "");
    const view = (p: any) => { const o: any = {}; for (const k of [...SOMENTE_LEITURA, ...EDITAVEIS]) if (p[k] !== undefined) o[k] = p[k]; return o; };
    const f = (config.funcionarios || []).find((x: any) => x.id === funcId) || {};
    const base = { nome: user.nome || f.nome || "", apelido: f.apelido || "", email: user.email || "" };
    if (op === "ver") {
      if (!row) return json({ ok: true, ficha: null, base, editaveis: EDITAVEIS });
      return json({ ok: true, ficha: view(row.payload), base, editaveis: EDITAVEIS });
    }
    if (op === "salvar") {
      if (!row) return json({ error: "Sua ficha ainda não foi criada. Peça à gerência para cadastrar." }, 404);
      const d = b.dados || {};
      const p = { ...row.payload };
      for (const k of MAIUSC) if (d[k] !== undefined) p[k] = t(d[k], 120).toUpperCase();
      for (const k of SEM_MAIUSC) if (d[k] !== undefined) p[k] = t(d[k], 120);
      if (d.temFilhos === "sim" && Array.isArray(d.filhos)) p.filhos = d.filhos.slice(0, 20).map((x: any) => ({ idade: t(x && x.idade, 3) }));
      if (d.temFilhos === "nao") p.filhos = [];
      p.atualizadoPeloProprioEm = Date.now();
      const { error } = await admin.from("dp_funcionarios").update({ payload: p, updated_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw error;
      return json({ ok: true, ficha: view(p) });
    }
    return json({ error: "operação desconhecida" }, 400);
  } catch (e: any) {
    console.error(e);
    return json({ error: String((e && e.message) || e) }, 500);
  }
});
