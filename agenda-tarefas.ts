// agenda-tarefas — quadro de tarefas da Agenda do CHAT (estilo Trello) + calendário + "Minhas vias".
// Sessão do usuário (sess_…) validada contra gestao_config, igual ao db-gateway.
// Quem vê cada tarefa:
//   privada       → só quem criou
//   loja          → quem criou + gerente (das lojas dele; sem lojas = todas) + diretoria
//   compartilhada → quem criou + participantes
// Ops: init, listar, salvar, mover, excluir, lembretes, minhasVias
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const TIPOS = ["privada", "loja", "compartilhada"];
const CLASSES = ["urgente", "importante", "normal", "baixa"];
const COLUNAS = ["a_fazer", "fazendo", "feito"];

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const dataOk = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null;
const horaOk = (v: unknown) => /^\d{2}:\d{2}$/.test(String(v || "")) ? String(v) : null;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    const { data: cfgRow } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config = (cfgRow && cfgRow.payload) || {};
    const users: any[] = config.users || [];
    const user = users.find((u) => sessaoValida(u, b.senha));
    if (!user) return json({ error: "não autorizado" }, 401);

    const funcs: any[] = config.funcionarios || [];
    const nomeDe = (id: string) => {
      const f = funcs.find((x) => x.id === id);
      if (f) return (String(f.apelido || "").trim()) || f.nome || "";
      const u = users.find((x) => (x.funcionarioId || x.id) === id);
      return u ? u.nome || "" : "";
    };
    const meuId: string = user.funcionarioId || user.id;
    const meuNome = nomeDe(meuId) || user.nome || "";
    const nivel: string = user.nivel || "vendedora";
    const minhasLojas: string[] = Array.isArray(user.lojas) ? user.lojas : [];
    const ehDiretoria = nivel === "diretoria";
    const ehGerente = nivel === "gerente";
    const vejoLoja = (lojaId: string | null) => ehDiretoria || (ehGerente && (!minhasLojas.length || (!!lojaId && minhasLojas.includes(lojaId))));

    const podeVer = (t: any) =>
      t.criador_id === meuId ||
      (t.tipo === "compartilhada" && (t.participantes || []).includes(meuId)) ||
      (t.tipo === "loja" && vejoLoja(t.loja_id));
    // mexer (mover/editar) = quem vê; excluir = quem criou (ou diretoria, nas de loja)
    const podeExcluir = (t: any) => t.criador_id === meuId || (t.tipo === "loja" && ehDiretoria);

    async function visiveis(de?: string | null, ate?: string | null) {
      const ors = [`criador_id.eq.${meuId}`, `and(tipo.eq.compartilhada,participantes.cs.{${meuId}})`];
      if (ehDiretoria || (ehGerente && !minhasLojas.length)) ors.push("tipo.eq.loja");
      else if (ehGerente) ors.push(`and(tipo.eq.loja,loja_id.in.(${minhasLojas.map((l) => `"${l}"`).join(",")}))`);
      let q = admin.from("agenda_tarefas").select("*").or(ors.join(",")).order("coluna").order("ordem").order("created_at");
      if (de) q = q.gte("data", de);
      if (ate) q = q.lte("data", ate);
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      return (data || []).filter(podeVer);
    }

    if (b.op === "init") {
      const pessoas = users
        .filter((u) => !u.bloqueado && u.status !== "inativo" && (u.funcionarioId || u.id) !== meuId)
        .map((u) => ({ id: u.funcionarioId || u.id, nome: nomeDe(u.funcionarioId || u.id) || u.nome || "" }))
        .filter((p) => p.nome)
        .sort((a, c) => a.nome.localeCompare(c.nome, "pt-BR"));
      const lojas = (config.lojas || []).map((l: any) => ({ id: l.id, nome: l.nome }));
      return json({ ok: true, me: { id: meuId, nome: meuNome, nivel, lojas: minhasLojas }, pessoas, lojas });
    }

    if (b.op === "listar") {
      const lista = await visiveis(dataOk(b.de), dataOk(b.ate));
      return json({ ok: true, data: lista.map((t) => ({ ...t, posso_excluir: podeExcluir(t) })) });
    }

    if (b.op === "salvar") {
      const t = b.tarefa || {};
      const titulo = texto(t.titulo, 200);
      if (!titulo) return json({ error: "Dê um título para a tarefa." }, 400);
      const tipo = TIPOS.includes(t.tipo) ? t.tipo : "privada";
      const lojaId = tipo === "loja" ? texto(t.loja_id, 60) || null : null;
      if (tipo === "loja" && !lojaId) return json({ error: "Escolha a loja da tarefa." }, 400);
      const idsValidos = new Set(users.map((u) => u.funcionarioId || u.id));
      const participantes = tipo === "compartilhada"
        ? [...new Set((Array.isArray(t.participantes) ? t.participantes : []).map(String))].filter((id) => id !== meuId && idsValidos.has(id))
        : [];
      if (tipo === "compartilhada" && !participantes.length) return json({ error: "Escolha com quem compartilhar." }, 400);
      const coluna = COLUNAS.includes(t.coluna) ? t.coluna : "a_fazer";
      const campos: Record<string, unknown> = {
        titulo, descricao: texto(t.descricao, 4000) || null, tipo, loja_id: lojaId, participantes,
        classificacao: CLASSES.includes(t.classificacao) ? t.classificacao : "normal",
        coluna, data: dataOk(t.data), hora: horaOk(t.hora), updated_at: new Date().toISOString(),
        concluida_em: coluna === "feito" ? (t.concluida_em || new Date().toISOString()) : null,
      };
      if (t.id) {
        const { data: atual } = await admin.from("agenda_tarefas").select("*").eq("id", t.id).maybeSingle();
        if (!atual || !podeVer(atual)) return json({ error: "Tarefa não encontrada." }, 404);
        // quem não criou pode mexer no andamento e nos detalhes, mas não muda quem enxerga a tarefa
        if (atual.criador_id !== meuId) { campos.tipo = atual.tipo; campos.loja_id = atual.loja_id; campos.participantes = atual.participantes; }
        const { data, error } = await admin.from("agenda_tarefas").update(campos).eq("id", t.id).select().single();
        if (error) throw error;
        return json({ ok: true, data });
      }
      const { data: ult } = await admin.from("agenda_tarefas").select("ordem").eq("coluna", coluna).order("ordem", { ascending: false }).limit(1);
      campos.ordem = ((ult && ult[0] && Number(ult[0].ordem)) || 0) + 1;
      const { data, error } = await admin.from("agenda_tarefas").insert({ ...campos, criador_id: meuId, criador_nome: meuNome }).select().single();
      if (error) throw error;
      return json({ ok: true, data });
    }

    if (b.op === "mover") {
      const { data: atual } = await admin.from("agenda_tarefas").select("*").eq("id", String(b.id || "")).maybeSingle();
      if (!atual || !podeVer(atual)) return json({ error: "Tarefa não encontrada." }, 404);
      const coluna = COLUNAS.includes(b.coluna) ? b.coluna : atual.coluna;
      const campos: Record<string, unknown> = { coluna, updated_at: new Date().toISOString() };
      if (typeof b.ordem === "number" && isFinite(b.ordem)) campos.ordem = b.ordem;
      if (coluna !== atual.coluna) campos.concluida_em = coluna === "feito" ? new Date().toISOString() : null;
      const { data, error } = await admin.from("agenda_tarefas").update(campos).eq("id", atual.id).select().single();
      if (error) throw error;
      return json({ ok: true, data });
    }

    if (b.op === "excluir") {
      const { data: atual } = await admin.from("agenda_tarefas").select("*").eq("id", String(b.id || "")).maybeSingle();
      if (!atual || !podeVer(atual)) return json({ error: "Tarefa não encontrada." }, 404);
      if (!podeExcluir(atual)) return json({ error: "Só quem criou a tarefa pode excluir." }, 403);
      const { error } = await admin.from("agenda_tarefas").delete().eq("id", atual.id);
      if (error) throw error;
      return json({ ok: true });
    }

    // Lembretes do assistente (atendimento-agenda-chat), pro calendário
    if (b.op === "lembretes") {
      const { data: pess } = await admin.from("atendimento_pessoal_usuarios").select("id").eq("funcionario_id", meuId).maybeSingle();
      if (!pess) return json({ ok: true, data: [] });
      const { data } = await admin.from("atendimento_lembretes").select("id, numero_formatado, descricao, disparar_em, recorrencia, status")
        .eq("usuario_id", pess.id).in("status", ["pendente", "pausado", "enviado"]).order("disparar_em").limit(500);
      return json({ ok: true, data: data || [] });
    }

    // Vias com o meu nome (vendedora) em Orçamentos, Vendas e Pedidos
    if (b.op === "minhasVias") {
      const nomes = [...new Set([meuNome, user.nome, (funcs.find((f) => f.id === meuId) || {}).nome]
        .map((n) => String(n || "").trim().replace(/[,()"\\%_*]/g, "")).filter(Boolean))];
      if (!nomes.length) return json({ ok: true, data: [] });
      const filtro = (campos: string[]) => campos.flatMap((c) => nomes.map((n) => `payload->>${c}.ilike."${n}"`)).join(",");
      const [orc, ven, ped] = await Promise.all([
        admin.from("orcamentos").select("id, payload").or(filtro(["vendedora", "funcionario"])).limit(1000),
        admin.from("vendas_pdv").select("id, payload").or(filtro(["vendedora"])).limit(1000),
        admin.from("ordens_servico").select("id, payload").or(filtro(["vendedora"])).limit(1000),
      ]);
      for (const r of [orc, ven, ped]) if (r.error) throw r.error;
      const lojaNome = (p: any) => {
        const l = (config.lojas || []).find((x: any) => x.id === p.lojaId);
        return l ? l.nome : (p.loja || "");
      };
      const map = (tipo: string, rows: any[]) => (rows || []).map((r) => {
        const p = r.payload || {};
        return {
          tipo, id: r.id, codigoVia: p.codigoVia || p.via || null, cliente: p.cliente || null,
          valorTotal: Number(p.valorTotal) || 0, status: p.status || null, loja: lojaNome(p),
          data: p.data || null, validade: p.validade || null,
        };
      }).filter((x) => x.status !== "rascunho");
      const lista = [...map("orcamento", orc.data!), ...map("venda", ven.data!), ...map("pedido", ped.data!)]
        .sort((a, c) => String(c.data || "").localeCompare(String(a.data || "")));
      return json({ ok: true, data: lista, nomes });
    }

    return json({ error: "operação desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
