// reservas-api v1 — card RESERVAR (joias com nome iniciado em "9").
// Reserva = lançada como venda, SEM caixa e SEM pagamento: só segura a peça no estoque
// (estoque_reservas, origem_tipo='reserva') até payload.venceEm (prazo em config.reservaPrazoDias, padrão 7).
// Vencida: aparece como vencida, não edita mais; o cron liberar_reservas_vencidas() solta o estoque.
// Mesmo cliente não reserva a mesma peça de novo por 90 dias (a contar da reserva anterior).
// POST { senha, op, ... }   op: listar | salvar | cancelar | converter | obter | publico (sem senha)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const DIA = 86400000;
const BLOQUEIO_DIAS = 90;

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
const ehGestao = (u: any) => u && (u.nivel === "diretoria" || u.nivel === "gerente");
const dig = (s: unknown) => String(s || "").replace(/\D/g, "");
const normNome = (s: unknown) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
function chaveCliente(r: any) {
  const cpf = dig(r.cpf); if (cpf.length === 11) return "cpf:" + cpf;
  const tel = dig(r.telefone); if (tel.length >= 8) return "tel:" + tel.slice(-8);
  const n = normNome(r.cliente); return n ? "nome:" + n : "";
}
function situacao(r: any) {
  if (!r) return "";
  if (r.status === "reservada" && r.venceEm && new Date(r.venceEm).getTime() < Date.now()) return "vencida";
  return r.status || "reservada";
}
async function lerConfig() {
  const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  return (data && data.payload) || {};
}
async function lerReserva(id: string) {
  const { data } = await admin.from("reservas").select("payload").eq("id", id).maybeSingle();
  return data ? data.payload : null;
}
async function gravar(r: any) {
  const { error } = await admin.from("reservas").upsert({ id: r.id, payload: r, updated_at: new Date().toISOString() });
  if (error) throw error;
}
async function liberarEstoque(id: string, usuario: string, motivo: string) {
  const { error } = await admin.from("estoque_reservas").update({ status: "liberada", updated_at: new Date().toISOString(), observacao: motivo, usuario })
    .eq("origem_tipo", "reserva").eq("origem_id", id).eq("status", "ativa");
  if (error) throw error;
}
function itensDeEstoque(itens: any[]) {
  const agg: Record<string, number> = {};
  for (const it of itens || []) {
    if (!it || !it.produtoEstoqueId) continue;
    agg[it.produtoEstoqueId] = (agg[it.produtoEstoqueId] || 0) + (Number(it.quantidade) || 1);
  }
  return agg;
}
function publico(r: any, lojaNome: string | null) {
  const sit = situacao(r);
  const itens = (r.itens || []).map((it: any) => ({ nome: it.produto || "Item", qtd: Number(it.quantidade) || 1, valor: Number(it.valorUnitario) || 0, original: Number(it.precoOriginal) || null }));
  return { tipo: "res", cliente: r.cliente || "", loja: lojaNome, data: r.data || null, via: r.codigoVia || null, status: sit, venceEm: r.venceEm || null,
    prazoDias: r.prazoDias || null, itens, total: Number(r.valorTotal) || itens.reduce((a: number, i: any) => a + i.valor * i.qtd, 0), pago: 0, saldo: 0,
    observacao: r.observacaoGeral || null, vendaCodigo: r.vendaCodigoVia || null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }); }
  try {
    const config = await lerConfig();
    const lojas = Array.isArray(config.lojas) ? config.lojas : [];
    const nomeLoja = (id: string) => { const l = lojas.find((x: any) => x && x.id === id); return l ? (l.nomeFantasia || l.nome) : null; };

    if (b.op === "publico") {
      const r = await lerReserva(String(b.id || ""));
      if (!r) return json({ error: "Reserva não encontrada." });
      return json({ ok: true, via: publico(r, nomeLoja(r.lojaId)) });
    }

    const user = (Array.isArray(config.users) ? config.users : []).find((u: any) => sessaoValida(u, b.senha)) || null;
    if (!user) return json({ error: "não autorizado" });
    const nome = String(user.nome || "");
    const lojasUser: string[] = Array.isArray(user.lojas) ? user.lojas : [];
    const podeLoja = (lojaId: string) => ehGestao(user) || !lojaId || lojasUser.includes(lojaId);

    if (b.op === "listar") {
      try { await admin.rpc("liberar_reservas_vencidas"); } catch (_e) { /* segue */ }
      const { data, error } = await admin.from("reservas").select("payload").order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      const lista = (data || []).map((x: any) => x.payload).filter((r: any) => r && podeLoja(r.lojaId));
      return json({ ok: true, data: lista, prazoDias: Number(config.reservaPrazoDias) || 7 });
    }
    if (b.op === "obter") {
      const r = await lerReserva(String(b.id || ""));
      if (!r || !podeLoja(r.lojaId)) return json({ error: "Reserva não encontrada." });
      return json({ ok: true, data: r });
    }

    if (b.op === "salvar") {
      const r = b.reserva || {};
      const lojaId = String(r.lojaId || "");
      if (!lojaId || !podeLoja(lojaId)) return json({ error: "Escolha a loja no topo antes de reservar." });
      if (!String(r.cliente || "").trim()) return json({ error: "Escolha o cliente da reserva." });
      const itens = (Array.isArray(r.itens) ? r.itens : []).filter((it: any) => it && it.produtoEstoqueId);
      if (!itens.length) return json({ error: "Adicione pelo menos uma joia do estoque (código 9)." });
      const fora = itens.filter((it: any) => !String(it.produto || "").trim().startsWith("9"));
      if (fora.length) return json({ error: "Só joias com código iniciado em 9 podem ser reservadas: " + fora.map((x: any) => x.produto).join(", ") });
      let atual: any = null;
      if (r.id) {
        atual = await lerReserva(String(r.id));
        if (atual) {
          const sit = situacao(atual);
          if (sit !== "reservada") return json({ error: sit === "vencida" ? "Reserva vencida: não pode mais ser editada." : "Esta reserva não pode mais ser editada (" + sit + ")." });
          if (!podeLoja(atual.lojaId)) return json({ error: "sem permissão" });
        }
      }
      const id = atual ? atual.id : ("res_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));
      // 90 dias: mesmo cliente não reserva a mesma peça de novo
      const chave = chaveCliente(r);
      const agg = itensDeEstoque(itens);
      if (chave) {
        const limite = new Date(Date.now() - BLOQUEIO_DIAS * DIA).toISOString();
        const { data: ant } = await admin.from("reservas").select("payload").gte("created_at", limite).limit(5000);
        const conflito: string[] = [];
        for (const x of ant || []) {
          const p = x.payload; if (!p || p.id === id || p.status === "convertida" || p.status === "cancelada") continue;
          if (chaveCliente(p) !== chave) continue;
          for (const it of p.itens || []) if (it && agg[it.produtoEstoqueId]) conflito.push(`${it.produto} (reserva ${p.codigoVia || ""} de ${String(p.data || "").split("-").reverse().join("/")})`);
        }
        if (conflito.length) return json({ error: "Este cliente já reservou esta peça nos últimos 90 dias: " + [...new Set(conflito)].join("; ") + ". Não é permitido reservar de novo." });
      }
      // disponível = estoque da loja − reservas ativas de outras origens
      const ids = Object.keys(agg);
      const { data: prods } = await admin.from("produtos_estoque").select("id,payload").in("id", ids);
      const { data: resv } = await admin.from("estoque_reservas").select("produto_id,quantidade,origem_tipo,origem_id").eq("status", "ativa").eq("loja_id", lojaId).in("produto_id", ids);
      const faltam: string[] = [];
      for (const pid of ids) {
        const p = (prods || []).find((x: any) => x.id === pid);
        const est = p ? Number(((p.payload || {}).estoquePorLoja || {})[lojaId]) || 0 : 0;
        const res = (resv || []).filter((x: any) => x.produto_id === pid && !(x.origem_tipo === "reserva" && x.origem_id === id)).reduce((a: number, x: any) => a + (Number(x.quantidade) || 0), 0);
        if (est - res < agg[pid] - 1e-9) faltam.push(`${p ? p.payload.nome : pid} (disponível ${Math.max(0, est - res)})`);
      }
      if (faltam.length) return json({ error: "Sem estoque disponível nesta loja para: " + faltam.join(", ") });
      const prazo = Number(config.reservaPrazoDias) || 7;
      let codigoVia = atual ? atual.codigoVia : null;
      if (!codigoVia) {
        const l = lojas.find((x: any) => x && x.id === lojaId);
        const abrev = String((l && l.abreviacao) || "XX").toUpperCase().trim();
        const { data: n, error: en } = await admin.rpc("incrementar_via_sequence", { p_chave: `codigo_${abrev}_reserva` });
        if (!en) codigoVia = `${abrev}${n}R`;
      }
      const agora = new Date();
      const reg = {
        ...(atual || {}), ...r, id, lojaId, itens, codigoVia, tipoRegistro: "reserva", status: "reservada",
        data: atual ? atual.data : agora.toISOString().slice(0, 10),
        criadoEm: atual ? atual.criadoEm : agora.getTime(), criadoPor: atual ? atual.criadoPor : nome,
        prazoDias: atual ? atual.prazoDias : prazo,
        venceEm: atual ? atual.venceEm : new Date(agora.getTime() + prazo * DIA).toISOString(),
        historico: [...((atual && atual.historico) || []), { em: agora.toISOString(), por: nome, acao: atual ? "editada" : "reservada" }],
        pagamentos: [], valorTotal: Number(r.valorTotal) || 0,
      };
      await gravar(reg);
      await liberarEstoque(id, nome, "substituída");
      const rows = ids.map((pid) => ({ produto_id: pid, loja_id: lojaId, quantidade: agg[pid], origem_tipo: "reserva", origem_id: id, usuario: nome }));
      if (rows.length) { const { error } = await admin.from("estoque_reservas").insert(rows); if (error) throw error; }
      return json({ ok: true, data: reg });
    }

    const id = String(b.id || "");
    const r = await lerReserva(id);
    if (!r || !podeLoja(r.lojaId)) return json({ error: "Reserva não encontrada." });

    if (b.op === "cancelar") {
      if (r.status === "convertida") return json({ error: "Reserva já virou venda." });
      r.status = "cancelada"; r.canceladaEm = new Date().toISOString(); r.canceladaPor = nome; r.motivoCancelamento = String(b.motivo || "").slice(0, 300);
      r.historico = [...(r.historico || []), { em: r.canceladaEm, por: nome, acao: "cancelada" + (r.motivoCancelamento ? ": " + r.motivoCancelamento : "") }];
      await gravar(r); await liberarEstoque(id, nome, "reserva cancelada");
      return json({ ok: true, data: r });
    }
    if (b.op === "converter") {
      if (situacao(r) !== "reservada") return json({ error: "Só reserva dentro do prazo vira venda (" + situacao(r) + ")." });
      if (!b.vendaId) return json({ error: "venda obrigatória" });
      r.status = "convertida"; r.vendaId = String(b.vendaId); r.vendaCodigoVia = String(b.vendaCodigoVia || ""); r.convertidaEm = new Date().toISOString();
      r.historico = [...(r.historico || []), { em: r.convertidaEm, por: nome, acao: "transformada em venda " + r.vendaCodigoVia }];
      await gravar(r); await liberarEstoque(id, nome, "virou venda " + r.vendaCodigoVia);
      return json({ ok: true, data: r });
    }
    if (b.op === "podeConverter") {
      return json({ ok: situacao(r) === "reservada", situacao: situacao(r) });
    }
    return json({ error: "op inválida" });
  } catch (e) { console.error(e); return json({ error: String((e as any)?.message || e) }, 500); }
});
