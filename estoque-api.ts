// estoque-api v1 — reservas de estoque do CUPOM (Pedido/O.S. e Transferências).
// Reserva = a peça continua no saldo da loja, mas não aparece como disponível.
// POST { senha, op, ... }  (senha = token de sessão sess_…)
//   op:'reservadas'  { lojaId?, produtoIds?, excluirOrigem?:{tipo,id} }
//                    → { data:[{produto_id, loja_id, quantidade}] } soma das reservas ativas
//   op:'daOrigem'    { origemTipo, origemId } → { data:[reservas da origem, todas as situações] }
//   op:'reservar'    { origemTipo:'os'|'transf', origemId, lojaId, itens:[{produtoId, quantidade}] }
//                    → substitui as reservas ativas daquela origem pelas novas (idempotente)
//   op:'liberar'     { origemTipo, origemId, motivo? } → solta as reservas ativas (cancelou, excluiu)
//   op:'baixar'      { origemTipo, origemId, tipoMovimento? } → dá baixa no Kardex de cada reserva
//                    ativa (registrar_movimento_estoque, quantidade negativa) e marca como baixada
//                    → { ok, saldos:{ produtoId:{ lojaId:saldoNovo } } }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const TIPOS = ["os", "transf"];

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
const agoraIso = () => new Date().toISOString();

async function liberar(tipo: string, id: string, usuario: string, motivo: string) {
  const { data, error } = await admin.from("estoque_reservas")
    .update({ status: "liberada", updated_at: agoraIso(), observacao: motivo || null, usuario })
    .eq("origem_tipo", tipo).eq("origem_id", id).eq("status", "ativa").select("id");
  if (error) throw error;
  return (data || []).length;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    const user = await usuarioValido(b.senha);
    if (!user) return json({ error: "não autorizado" }, 401);
    const nome = String(user.nome || "");

    if (b.op === "reservadas") {
      let q = admin.from("estoque_reservas").select("produto_id, loja_id, quantidade, origem_tipo, origem_id").eq("status", "ativa").limit(20000);
      if (b.lojaId) q = q.eq("loja_id", String(b.lojaId));
      if (Array.isArray(b.produtoIds) && b.produtoIds.length) q = q.in("produto_id", b.produtoIds.map(String).slice(0, 1000));
      const { data, error } = await q;
      if (error) throw error;
      const ex = b.excluirOrigem || null;
      const soma: Record<string, any> = {};
      for (const r of data || []) {
        if (ex && r.origem_tipo === ex.tipo && r.origem_id === String(ex.id)) continue;
        const k = r.produto_id + "|" + r.loja_id;
        if (!soma[k]) soma[k] = { produto_id: r.produto_id, loja_id: r.loja_id, quantidade: 0 };
        soma[k].quantidade += Number(r.quantidade) || 0;
      }
      return json({ ok: true, data: Object.values(soma) });
    }

    const tipo = String(b.origemTipo || "");
    const origemId = String(b.origemId || "");
    if (!TIPOS.includes(tipo) || !origemId) return json({ error: "origem inválida" }, 400);

    if (b.op === "daOrigem") {
      const { data, error } = await admin.from("estoque_reservas").select("*").eq("origem_tipo", tipo).eq("origem_id", origemId).order("id");
      if (error) throw error;
      return json({ ok: true, data: data || [] });
    }

    if (b.op === "reservar") {
      const lojaId = String(b.lojaId || "");
      if (!lojaId) return json({ error: "loja obrigatória" }, 400);
      const agg: Record<string, number> = {};
      for (const it of (Array.isArray(b.itens) ? b.itens : []).slice(0, 300)) {
        const pid = String((it && it.produtoId) || "");
        const q = Number(it && it.quantidade);
        if (!pid || !isFinite(q) || q <= 0) continue;
        agg[pid] = (agg[pid] || 0) + q;
      }
      const ids = Object.keys(agg);
      if (ids.length) {
        const { data: prods, error: ep } = await admin.from("produtos_estoque").select("id").in("id", ids);
        if (ep) throw ep;
        const existe = new Set((prods || []).map((p: any) => p.id));
        for (const id of ids) if (!existe.has(id)) delete agg[id];
      }
      await liberar(tipo, origemId, nome, "substituída");
      const rows = Object.entries(agg).map(([produto_id, quantidade]) => ({ produto_id, loja_id: lojaId, quantidade, origem_tipo: tipo, origem_id: origemId, usuario: nome }));
      if (rows.length) {
        const { error } = await admin.from("estoque_reservas").insert(rows);
        if (error) throw error;
      }
      return json({ ok: true, reservados: rows.length });
    }

    if (b.op === "liberar") {
      const n = await liberar(tipo, origemId, nome, String(b.motivo || "").slice(0, 200));
      return json({ ok: true, liberadas: n });
    }

    if (b.op === "baixar") {
      const tipoMov = String(b.tipoMovimento || (tipo === "os" ? "VENDA_PEDIDO" : "TRANSF_SAIDA")).slice(0, 40);
      const { data, error } = await admin.from("estoque_reservas").select("*").eq("origem_tipo", tipo).eq("origem_id", origemId).eq("status", "ativa");
      if (error) throw error;
      const saldos: Record<string, Record<string, number>> = {};
      const falhas: string[] = [];
      for (const r of data || []) {
        // marca primeiro (só se ainda ativa) para duas baixas simultâneas não descontarem em dobro
        const { data: trava, error: et } = await admin.from("estoque_reservas").update({ status: "baixada", updated_at: agoraIso(), usuario: nome })
          .eq("id", r.id).eq("status", "ativa").select("id");
        if (et) throw et;
        if (!trava || !trava.length) continue;
        const { data: saldo, error: em } = await admin.rpc("registrar_movimento_estoque", {
          p_produto_id: r.produto_id, p_loja_id: r.loja_id, p_tipo_movimento: tipoMov,
          p_quantidade: -Number(r.quantidade), p_usuario: nome, p_referencia_id: origemId, p_observacao: "baixa de reserva " + tipo,
        });
        if (em) {
          await admin.from("estoque_reservas").update({ status: "ativa", updated_at: agoraIso() }).eq("id", r.id);
          falhas.push(r.produto_id + ": " + em.message);
          continue;
        }
        (saldos[r.produto_id] ||= {})[r.loja_id] = Number(saldo);
      }
      return json({ ok: falhas.length === 0, saldos, falhas });
    }

    return json({ error: "op inválida" }, 400);
  } catch (e) { console.error(e); return json({ error: String((e as any)?.message || e) }, 500); }
});
