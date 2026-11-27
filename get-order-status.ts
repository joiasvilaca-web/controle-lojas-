import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Retorna apenas os campos "seguros para o cliente ver" de uma ordem específica,
 * identificada pelo id (nunca a lista inteira de ordens, para não vazar dados de
 * outros clientes). Observações (uso interno da equipe) NUNCA são incluídas aqui.
 * v2: passou a ler direto a LINHA da ordem em `ordens_servico`.
 * v3: o nome da loja vem de config.lojas pelo lojaId (os pedidos novos não guardam `loja`).
 * v4 (09/11): o nome que o cliente vê é o NOME PÚBLICO da loja (config.lojas[].nomePublico), quando existe.
 * v5 (22/11): `prazoRetirada` — pedido DISPONÍVEL PARA RETIRADA: data limite (30 dias sem pagamento / 60 com pagamento, a partir do pronto;
 *   os que já estavam prontos contam de 22/11), se venceu e o crédito previsto (pago − 20%). Mesma regra do acompanhamento-auto v28.
 *   Via ABANDONADA: o crédito lançado. O aviso fica no cartão; a mensagem do WhatsApp não muda.
 */
const ABANDONO_DESDE = Date.parse("2026-11-22T15:00:00Z");
function diaBR(ms: number) { return new Date(ms - 3 * 3600000).toISOString().slice(0, 10); }
function prazoRetirada(o: any) {
  if (o.status === "abandonada") { const a = o.abandono || {}; return { abandonada: true, credito: Number(a.credito) || 0, pago: Number(a.pago) || 0 }; }
  if (o.status !== "pronto") return null;
  const pago = (Array.isArray(o.pagamentos) ? o.pagamentos : []).filter((p: any) => p && p._modo !== "editar").reduce((a: number, p: any) => {
    if (p.formaId === "__fiado" || p.formaId === "__cashback") return a;
    if (p.formaId === "__credito") return a + Math.max(0, (Number(p.valor) || 0) - (Number(p.creditoOuro) || 0));
    return a + (Number(p.valor) || 0);
  }, 0);
  const comPag = pago > 0.009, limite = comPag ? 60 : 30;
  const base = diaBR(Math.max(Number(o.statusEm || 0), ABANDONO_DESDE));
  const lim = new Date(Date.parse(base + "T12:00:00Z") + limite * 86400000).toISOString().slice(0, 10);
  return { desde: base, limite: lim, dias: limite, comPagamento: comPag, vencido: diaBR(Date.now()) > lim, credito: Math.round(pago * 0.8 * 100) / 100 };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { id } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "id e obrigatorio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await admin.from("ordens_servico").select("payload").eq("id", id).maybeSingle();
    if (error) throw error;
    const order = data ? data.payload : null;

    if (!order || order.status === "rascunho") {
      return new Response(JSON.stringify({ error: "Ordem nao encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let lojaNome = order.loja || null;
    if (order.lojaId) {
      try {
        const { data: cfg } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
        const l = ((cfg && cfg.payload && cfg.payload.lojas) || []).find((x: any) => x && x.id === order.lojaId);
        if (l) lojaNome = l.nomePublico || (!lojaNome ? (l.abreviacao ? `${l.abreviacao} — ${l.nome}` : l.nome) : lojaNome);
      } catch (_e) { /* sem nome da loja: a página só não mostra */ }
    }

    const leituras = Array.isArray(order.leituras) ? order.leituras : [];
    const confirmadoStatusAtual = leituras.some((l: any) => l.status === order.status);

    const publicData = {
      cliente: order.cliente,
      loja: lojaNome,
      servico: order.serviceTypeName,
      data: order.data,
      status: order.status,
      encaixe: !!order.encaixe,
      // 27/11: data pedida aguardando liberação da Oficina (código de liberação). Enquanto pendente vale a data padrão (`data`).
      dataPendente: (order.autorizacao && order.autorizacao.status === "pendente" && order.autorizacao.dataSolicitada && order.autorizacao.dataSolicitada !== order.data) ? order.autorizacao.dataSolicitada : null,
      numeroNota: order.numeroNota || null,
      recebidoPor: order.status === "entregue" ? order.recebidoPor : null,
      descricao: order.descricao || null,
      confirmadoStatusAtual,
      prazoRetirada: prazoRetirada(order),
    };

    return new Response(JSON.stringify(publicData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
