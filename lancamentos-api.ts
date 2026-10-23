// lancamentos-api — módulo temporário "Lançamentos" (vendas mensais por vendedora × loja
// e fechamento detalhado de cada loja). Independente dos outros módulos.
// Só diretoria/gerente. POST { senha, op, ... }
//   op:'listar'  { mes:'YYYY-MM' } → { data: lançamentos atuais, historico: cada salvamento,
//                fatores: tabelas de fator salvas até esse mês (mais recente primeiro) }
//   op:'salvar'  { mes, tipo:'vendedora'|'loja'|'fator', chave, dados, novo? } → upsert + histórico
//                fator: chave = loja, dados { faixas:[{valor, percentual}] } — vale do mês em diante
//                novo:true recusa (409) se já existe lançamento dessa chave no mês
//   op:'excluir' { mes, tipo, chave } → apaga o lançamento do mês + registro no histórico
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const LOJAS = ["MARECHAL", "JOAO BERALDO", "JARDIM NORTE", "REFORMA"];
const VENDEDORAS = ["PATRICIA", "GISLAINE CRISTINA", "MARIANA", "PAMELA", "GI", "TIRZA", "TANIA", "FLAVIA", "EDILENE", "MEIRIELI", "AMANDA", "CAMILA", "LARYSSA", "PHABRINNE", "FELIPE"];
const FATOR_LOJAS = ["MARECHAL", "JOAO BERALDO", "JARDIM NORTE"];
const CATEGORIAS = ["ALIANCA", "FABRICACAO", "SERVICO", "REPRES_OURO", "REPRES_PRATA", "RELOGIO"];

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
async function usuarioValido(senha: string): Promise<any | null> {
  const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  const users = (data?.payload && data.payload.users) || [];
  return users.find((u: any) => sessaoValida(u, senha)) || null;
}
const num = (v: any) => { const n = Number(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };

function limparDados(tipo: string, d: any) {
  d = d || {};
  if (tipo === "fator") {
    const faixas = (Array.isArray(d.faixas) ? d.faixas : []).slice(0, 30)
      .map((f: any) => ({ valor: num(f && f.valor), percentual: Math.min(100, Math.max(0, num(f && f.percentual))) }))
      .filter((f: any) => f.valor > 0 || f.percentual > 0)
      .sort((a: any, b: any) => a.valor - b.valor);
    return { faixas };
  }
  if (tipo === "vendedora") {
    const lojas: any = {};
    for (const l of LOJAS) { const x = (d.lojas || {})[l] || {}; lojas[l] = { venda: num(x.venda), devolucao: num(x.devolucao) }; }
    return { lojas };
  }
  const categorias: any = {};
  for (const c of CATEGORIAS) categorias[c] = num((d.categorias || {})[c]);
  return { bruto: num(d.bruto), devolucao: num(d.devolucao), categorias };
}
function chaveInvalida(tipo: string, chave: string): string | null {
  if (tipo !== "vendedora" && tipo !== "loja" && tipo !== "fator") return "tipo inválido";
  if (tipo === "fator" && !FATOR_LOJAS.includes(chave)) return "loja sem fator";
  if (tipo === "vendedora" && !VENDEDORAS.includes(chave)) return "vendedora inválida";
  if (tipo === "loja" && !LOJAS.includes(chave)) return "loja inválida";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    const user = await usuarioValido(b.senha);
    if (!user) return json({ error: "não autorizado" }, 401);
    if (user.nivel !== "diretoria" && user.nivel !== "gerente") return json({ error: "sem permissão (só diretoria/gerente)" }, 403);
    const mes = String(b.mes || "");
    if (!/^\d{4}-\d{2}$/.test(mes)) return json({ error: "mês inválido" }, 400);

    if (b.op === "listar") {
      const [atual, hist, fat] = await Promise.all([
        admin.from("lancamentos_mensais").select("tipo, chave, dados, atualizado_por, updated_at").eq("mes", mes),
        admin.from("lancamentos_historico").select("id, tipo, chave, dados, atualizado_por, created_at").eq("mes", mes).order("created_at", { ascending: false }).limit(500),
        admin.from("lancamentos_mensais").select("mes, chave, dados, atualizado_por, updated_at").eq("tipo", "fator").lte("mes", mes).order("mes", { ascending: false }).limit(500),
      ]);
      if (atual.error) throw atual.error;
      if (hist.error) throw hist.error;
      if (fat.error) throw fat.error;
      return json({ ok: true, data: (atual.data || []).filter((x: any) => x.tipo !== "fator"), historico: hist.data || [], fatores: fat.data || [] });
    }
    if (b.op === "salvar") {
      const tipo = String(b.tipo || "");
      const chave = String(b.chave || "");
      const inv = chaveInvalida(tipo, chave);
      if (inv) return json({ error: inv }, 400);
      if (b.novo) {
        const { data: ja, error: ej } = await admin.from("lancamentos_mensais").select("chave").eq("mes", mes).eq("tipo", tipo).eq("chave", chave).maybeSingle();
        if (ej) throw ej;
        if (ja) return json({ error: `${chave} já tem lançamento neste mês — use Editar` }, 409);
      }
      const agora = new Date().toISOString();
      const dados = limparDados(tipo, b.dados);
      const row = { mes, tipo, chave, dados, atualizado_por: user.nome || "", updated_at: agora };
      const { error } = await admin.from("lancamentos_mensais").upsert(row, { onConflict: "mes,tipo,chave" });
      if (error) throw error;
      const { data: h, error: eh } = await admin.from("lancamentos_historico").insert({ mes, tipo, chave, dados, atualizado_por: user.nome || "", created_at: agora }).select("id, tipo, chave, dados, atualizado_por, created_at").single();
      if (eh) throw eh;
      return json({ ok: true, data: row, historico: h });
    }
    if (b.op === "excluir") {
      const tipo = String(b.tipo || "");
      const chave = String(b.chave || "");
      const inv = chaveInvalida(tipo, chave);
      if (inv) return json({ error: inv }, 400);
      const { data: apagados, error } = await admin.from("lancamentos_mensais").delete().eq("mes", mes).eq("tipo", tipo).eq("chave", chave).select("dados");
      if (error) throw error;
      if (!apagados || !apagados.length) return json({ error: "lançamento não encontrado" }, 404);
      // histórico guarda o que foi apagado, para poder recuperar
      const { error: eh } = await admin.from("lancamentos_historico").insert({ mes, tipo, chave, dados: { excluido: true, anterior: apagados[0].dados }, atualizado_por: user.nome || "", created_at: new Date().toISOString() });
      if (eh) throw eh;
      return json({ ok: true });
    }
    return json({ error: "op inválida" }, 400);
  } catch (e) { console.error(e); return json({ error: String(e) }, 500); }
});
