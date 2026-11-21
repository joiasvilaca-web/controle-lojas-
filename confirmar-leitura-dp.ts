// confirmar-leitura-dp v7
// v7 (21/11/2026): a advertência pode ser SUSPENSÃO disciplinar; "buscar" devolve também o período (início, término, dias),
// a regra descumprida, a data e o histórico de medidas anteriores, para a página pública advertencia.html mostrar o texto certo.
// v6: passou a usar a chave de serviço (a auditoria de segurança tirou todo GRANT do
// anon, então o acesso antigo via REST com a chave anon deixou de funcionar — a página
// pública advertencia.html não conseguia mais nem carregar a advertência). Ganhou a
// ação "buscar", que devolve só os campos que a página precisa mostrar, pra
// advertencia.html não precisar mais ler dp_registros direto. verify_jwt ligado
// (a página manda a chave anon no header, igual às outras páginas públicas).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PADROES_BOT = [
  "safelink", "safelinks", "outlook", "microsoftpreview", "bingpreview",
  "googleimageproxy", "proofpoint", "mimecast", "barracuda", "symantec",
  "bot", "crawler", "spider", "scanner", "preview", "headless", "phantom",
  "virustotal", "link-checker", "linkchecker",
];
function pareceBot(userAgent: string): boolean {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return true;
  return PADROES_BOT.some((p) => ua.includes(p));
}

/** Só o que a página pública precisa — nada do resto da ficha do funcionário. */
function camposPublicos(payload: any) {
  return {
    tipo: payload.tipo || null,
    tipoAviso: payload.tipoAviso || null,
    motivo: payload.motivo || null,
    descricao: payload.descricao || null,
    confirmadoEm: payload.confirmadoEm || null,
    nomeFuncionarioSnapshot: payload.nomeFuncionarioSnapshot || "",
    data: payload.data || null,
    regraInfringida: payload.regraInfringida || null,
    suspensaoInicio: payload.suspensaoInicio || null,
    suspensaoFim: payload.suspensaoFim || null,
    suspensaoDias: payload.suspensaoDias || null,
    historicoAnterior: Array.isArray(payload.historicoAnterior) ? payload.historicoAnterior.slice(0, 50).map(String) : [],
  };
}

/**
 * Página pública de advertência (advertencia.html):
 *  - acao "buscar": devolve os campos da advertência pra página mostrar.
 *  - acao "confirmar" (padrão, compatível com a versão antiga): registra que o
 *    funcionário confirmou ter lido — guarda { confirmadoEm } no próprio registro.
 * Ignora confirmações que parecem vir de robôs de varredura de link em e-mail.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { id, acao } = await req.json();
    if (!id) return json({ error: "id é obrigatório" }, 400);

    const { data, error: errBusca } = await admin
      .from("dp_registros")
      .select("id, payload")
      .eq("id", id)
      .maybeSingle();
    if (errBusca) throw errBusca;
    const payload = data ? (data.payload || {}) : null;
    if (!payload || payload.tipo !== "aviso") {
      return json({ error: "Advertência não encontrada" }, 404);
    }

    if (acao === "buscar") {
      return json({ success: true, registro: camposPublicos(payload) });
    }

    // ---- confirmar ----
    const userAgent = req.headers.get("user-agent") || "";
    if (pareceBot(userAgent)) return json({ success: true, ignorado: true });

    if (!payload.confirmadoEm) {
      payload.confirmadoEm = new Date().toISOString();
      const { error: errSalvar } = await admin
        .from("dp_registros")
        .update({ payload, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (errSalvar) throw errSalvar;
    }

    return json({ success: true, confirmadoEm: payload.confirmadoEm, nomeFuncionario: payload.nomeFuncionarioSnapshot || "" });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
