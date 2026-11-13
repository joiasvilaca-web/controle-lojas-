// atendimento-aviso (13/11/2026) — apoio da lista do CHAT.
//   resumos { ids:[conversaId…] } → { ok, notas:{ id:n }, outros:{ id:[{ id, atendente_id, atendente_nome, bot_id, instancia, canal }] } }
//     notas  = quantas notas internas (CRM) a conversa tem (da conversa ou do cliente vinculado)
//     outros = OUTRAS conversas ABERTAS do mesmo contato (mesmo telefone ou mesmo cliente do cadastro) que estão com OUTRO atendente.
//              Quando a outra conversa é finalizada ela deixa de aparecer (o aviso some sozinho).
// Sessão do usuário (sess_…) validada contra gestao_config, igual às demais funções. Só leitura; nada é gravado aqui.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    const { data: cfgRow } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const users: any[] = (cfgRow && cfgRow.payload && cfgRow.payload.users) || [];
    const user = users.find((u) => sessaoValida(u, b.senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    const meuId: string = user.funcionarioId || user.id;

    if (b.op === "resumos") {
      const ids: string[] = (Array.isArray(b.ids) ? b.ids : []).map(String).filter((x) => /^[0-9a-fA-F-]{8,}$/.test(x)).slice(0, 150);
      if (!ids.length) return json({ ok: true, notas: {}, outros: {} });
      const { data: convs, error } = await admin.from("atendimento_conversas").select("id, contato_id, canal, cliente_id").in("id", ids);
      if (error) throw error;
      const lista = convs || [];
      // notas por conversa (ou por cliente vinculado)
      const clientes = [...new Set(lista.map((c: any) => c.cliente_id).filter(Boolean))];
      const tel10 = (c: any) => { const d = String(c.contato_id || "").replace(/\D/g, ""); return c.canal === "whatsapp" && d.length >= 10 ? d.slice(-10) : ""; };
      const tels = [...new Set(lista.map(tel10).filter(Boolean))];
      const filtroNotas = [`conversa_id.in.(${ids.join(",")})`, clientes.length ? `cliente_id.in.(${clientes.join(",")})` : "", tels.length ? `contato_tel.in.(${tels.join(",")})` : ""].filter(Boolean).join(",");
      const { data: notas } = await admin.from("crm_notas").select("conversa_id, cliente_id, contato_tel").or(filtroNotas).limit(5000);
      const notasPorConv: Record<string, number> = {};
      for (const c of lista) notasPorConv[c.id] = (notas || []).filter((n: any) => n.conversa_id === c.id || (c.cliente_id && n.cliente_id === c.cliente_id) || (tel10(c) && n.contato_tel === tel10(c))).length;
      // outras conversas abertas do mesmo contato, com outro atendente
      const contatos = [...new Set(lista.map((c: any) => c.contato_id).filter(Boolean))];
      const { data: abertas } = await admin.from("atendimento_conversas").select("id, contato_id, canal, cliente_id, atendente_id, atendente_nome, bot_id, instancia, status")
        .neq("status", "finalizado").not("atendente_id", "is", null).or([contatos.length ? `contato_id.in.(${contatos.map((x) => `"${x}"`).join(",")})` : "", clientes.length ? `cliente_id.in.(${clientes.join(",")})` : ""].filter(Boolean).join(",")).limit(800);
      const outros: Record<string, any[]> = {};
      for (const c of lista) {
        const l = (abertas || []).filter((o: any) => o.id !== c.id && o.atendente_id !== meuId && ((o.contato_id === c.contato_id && o.canal === c.canal) || (c.cliente_id && o.cliente_id === c.cliente_id)))
          .map((o: any) => ({ id: o.id, atendente_id: o.atendente_id, atendente_nome: o.atendente_nome, bot_id: o.bot_id, instancia: o.instancia, canal: o.canal }));
        if (l.length) outros[c.id] = l;
      }
      return json({ ok: true, notas: notasPorConv, outros });
    }
    return json({ error: "operação desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
