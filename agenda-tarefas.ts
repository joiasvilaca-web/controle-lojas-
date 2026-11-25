// agenda-tarefas — quadro de tarefas da Agenda do CHAT (estilo Trello) + calendário + "Minhas vias".
// Sessão do usuário (sess_…) validada contra gestao_config, igual ao db-gateway.
// Quem vê cada tarefa:
//   privada       → só quem criou
//   loja          → quem criou + gerente (das lojas dele; sem lojas = todas) + diretoria
//   compartilhada → quem criou + participantes
// v14 (25/11): BAIXAR tarefa finalizada. op `baixar` (só tarefa em "feito"): quem criou baixa para TODOS (baixada_em); colaborador baixa só para si (baixada_por[id]).
//   op `reativar` devolve a tarefa ao quadro em outro andamento (criador limpa a baixa de todos; colaborador só a dele). listar devolve baixada_para_mim, baixada_data,
//   baixada_global, posso_reativar. Sair de "feito" (mover/salvar/sincCrm) limpa as baixas.
// v13 (23/11): minhasVias devolve serviceTypeId nos pedidos (os três ramos), para o filtro por tipo de serviço no calendário.
// v12 (18/11): minhasVias aceita `escopo` (minhas | loja | todas) para o calendário.
// Ops: init, listar, salvar, mover, baixar, reativar, excluir, lembretes, minhasVias, avisos, agendaCiente
// v11 (18/11): AVISOS da agenda (PAINEL › Avisos). op `avisos` devolve o que a pessoa (criadora ou participante, tarefa não feita) precisa ver ao abrir o sistema:
//   compartilhada = recebeu um compartilhamento há menos de 24 h e ainda não deu ciente (`cientes`; início em `participantes_em`);
//   amanha = vence amanhã; hoje = vence hoje; atrasada = venceu nos últimos 7 dias. Datas no fuso de São Paulo. op `agendaCiente` dá o ciente (função SQL atômica).
//   Import fixado em 2.119.0 (npm com @supabase/storage-js 2.119.1 quebrado).
// v10 (13/11): tarefa criada no CHAT (CRM) também aparece na Agenda (colunas origem='chat', conversa_id, crm_tarefa_id); listar devolve `conversa_ativa`;
//   mover/sincCrm mantêm a tarefa do CRM e a da Agenda no mesmo andamento (feito ↔ feita).
// v9 (13/11): módulo AGENDA. minhasVias marca `naOficina` nos pedidos em poder da Oficina (enviado p/ fábrica, em produção, pendência, produzido) e,
//   para o login da OFICINA, devolve esses pedidos de TODAS as lojas (a Oficina enxerga na agenda o que está com ela; a vendedora vê o dela marcado "Na Oficina").
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

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
// db-gateway v51: a sessão pode ter uma loja extra autorizada pela gerência (users[].sessoes[].lojaExtra)
function lojasDaSessao(u: any, token: string): string[] {
  const base: string[] = Array.isArray(u?.lojas) ? u.lojas.map(String) : [];
  const s = (Array.isArray(u?.sessoes) ? u.sessoes : []).find((x: any) => x && x.token === token);
  const e = s && s.lojaExtra;
  return e && e.id && Number(e.ate) > Date.now() && !base.includes(String(e.id)) ? [...base, String(e.id)] : base;
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
    const minhasLojas: string[] = lojasDaSessao(user, b.senha);
    const ehDiretoria = nivel === "diretoria";
    const ehGerente = nivel === "gerente";
    const vejoLoja = (lojaId: string | null) => ehDiretoria || (ehGerente && (!minhasLojas.length || (!!lojaId && minhasLojas.includes(lojaId))));

    const podeVer = (t: any) =>
      t.criador_id === meuId ||
      (t.tipo === "compartilhada" && (t.participantes || []).includes(meuId)) ||
      (t.tipo === "loja" && vejoLoja(t.loja_id));
    // mexer (mover/editar) = quem vê; excluir = quem criou (ou diretoria, nas de loja)
    const podeExcluir = (t: any) => t.criador_id === meuId || (t.tipo === "loja" && ehDiretoria);
    // baixa (v14): quem criou baixa para todos; qualquer outra pessoa que enxerga a tarefa baixa só para si
    const baixadaGlobal = (t: any) => !!t.baixada_em;
    const baixadaPraMim = (t: any) => baixadaGlobal(t) || !!(t.baixada_por && t.baixada_por[meuId]);
    const dataBaixa = (t: any): string | null => {
      const a = t.baixada_em ? String(t.baixada_em) : "", c = t.baixada_por && t.baixada_por[meuId] ? String(t.baixada_por[meuId]) : "";
      if (!a && !c) return null;
      return !a ? c : !c ? a : (new Date(a).getTime() >= new Date(c).getTime() ? a : c);
    };
    const podeReativar = (t: any) => t.criador_id === meuId || (!baixadaGlobal(t) && !!(t.baixada_por && t.baixada_por[meuId]));
    const extras = (t: any) => ({ posso_excluir: podeExcluir(t), baixada_para_mim: baixadaPraMim(t), baixada_global: baixadaGlobal(t), baixada_data: dataBaixa(t), posso_reativar: baixadaPraMim(t) && podeReativar(t) });

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
      const convIds = [...new Set(lista.map((t: any) => t.conversa_id).filter(Boolean))];
      const ativas = new Set<string>();
      if (convIds.length) {
        const { data: cs } = await admin.from("atendimento_conversas").select("id, status").in("id", convIds.slice(0, 200));
        for (const c of cs || []) if (c.status !== "finalizado") ativas.add(c.id);
      }
      return json({ ok: true, data: lista.map((t: any) => ({ ...t, ...extras(t), conversa_ativa: !!(t.conversa_id && ativas.has(t.conversa_id)) })) });
    }

    if (b.op === "salvar") {
      const t = b.tarefa || {};
      const titulo = texto(t.titulo, 200);
      if (!titulo) return json({ error: "Dê um título para a tarefa." }, 400);
      const tipo = TIPOS.includes(t.tipo) ? t.tipo : "privada";
      const lojaId = tipo === "loja" ? texto(t.loja_id, 60) || null : null;
      if (tipo === "loja" && !lojaId) return json({ error: "Escolha a loja da tarefa." }, 400);
      const idsValidos = new Set(users.map((u) => u.funcionarioId || u.id));
      const veioDoChat = t.origem === "chat";
      const participantes = tipo === "compartilhada"
        ? [...new Set((Array.isArray(t.participantes) ? t.participantes : []).map(String))].filter((id) => id !== meuId && idsValidos.has(id))
        : [];
      if (tipo === "compartilhada" && !participantes.length) return json({ error: "Escolha com quem compartilhar." }, 400);
      const coluna = COLUNAS.includes(t.coluna) ? t.coluna : "a_fazer";
      const agoraIso = new Date().toISOString();
      const campos: Record<string, unknown> = {
        titulo, descricao: texto(t.descricao, 4000) || null, tipo, loja_id: lojaId, participantes,
        classificacao: CLASSES.includes(t.classificacao) ? t.classificacao : "normal",
        coluna, data: dataOk(t.data), hora: horaOk(t.hora), updated_at: new Date().toISOString(),
        concluida_em: coluna === "feito" ? (t.concluida_em || new Date().toISOString()) : null,
      };
      if (coluna !== "feito") { campos.baixada_em = null; campos.baixada_por = {}; }   // v14: saiu de "feito" → volta ao quadro de todos
      if (t.id) {
        const { data: atual } = await admin.from("agenda_tarefas").select("*").eq("id", t.id).maybeSingle();
        if (!atual || !podeVer(atual)) return json({ error: "Tarefa não encontrada." }, 404);
        if (atual.criador_id !== meuId) { campos.tipo = atual.tipo; campos.loja_id = atual.loja_id; campos.participantes = atual.participantes; }
        { const parts: string[] = (campos.participantes as string[]) || []; const em: Record<string, string> = { ...(atual.participantes_em || {}) }; const ci: Record<string, string> = { ...(atual.cientes || {}) };
          for (const id of parts) if (!em[id] || !(atual.participantes || []).includes(id)) { em[id] = agoraIso; delete ci[id]; }
          for (const id of Object.keys(em)) if (!parts.includes(id)) { delete em[id]; delete ci[id]; }
          campos.participantes_em = em; campos.cientes = ci; }
        const { data, error } = await admin.from("agenda_tarefas").update(campos).eq("id", t.id).select().single();
        if (error) throw error;
        return json({ ok: true, data });
      }
      const { data: ult } = await admin.from("agenda_tarefas").select("ordem").eq("coluna", coluna).order("ordem", { ascending: false }).limit(1);
      campos.ordem = ((ult && ult[0] && Number(ult[0].ordem)) || 0) + 1;
      if (veioDoChat) { campos.origem = "chat"; campos.conversa_id = texto(t.conversa_id, 80) || null; campos.crm_tarefa_id = texto(t.crm_tarefa_id, 80) || null; }
      campos.participantes_em = Object.fromEntries(((campos.participantes as string[]) || []).map((id) => [id, agoraIso]));
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
      if (coluna !== "feito") { campos.baixada_em = null; campos.baixada_por = {}; }   // v14
      const { data, error } = await admin.from("agenda_tarefas").update(campos).eq("id", atual.id).select().single();
      if (error) throw error;
      if (atual.crm_tarefa_id && coluna !== atual.coluna) {
        const feita = coluna === "feito";
        await admin.from("crm_tarefas").update({ status: feita ? "feita" : "aberta", concluida_em: feita ? new Date().toISOString() : null }).eq("id", atual.crm_tarefa_id);
      }
      return json({ ok: true, data });
    }

    // v14 — BAIXAR: tira do quadro uma tarefa já finalizada. Criador baixa para todos; colaborador só para ele.
    if (b.op === "baixar") {
      const { data: atual } = await admin.from("agenda_tarefas").select("*").eq("id", String(b.id || "")).maybeSingle();
      if (!atual || !podeVer(atual)) return json({ error: "Tarefa não encontrada." }, 404);
      if (atual.coluna !== "feito") return json({ error: "Só dá para baixar tarefa que já está em Feito." }, 400);
      const agoraIso = new Date().toISOString();
      const campos: Record<string, unknown> = { updated_at: agoraIso };
      if (atual.criador_id === meuId) campos.baixada_em = agoraIso;
      else campos.baixada_por = { ...(atual.baixada_por || {}), [meuId]: agoraIso };
      const { data, error } = await admin.from("agenda_tarefas").update(campos).eq("id", atual.id).select().single();
      if (error) throw error;
      return json({ ok: true, data: { ...data, ...extras(data) } });
    }

    // v14 — REATIVAR: volta a tarefa baixada para o quadro em outro andamento (a fazer / fazendo) ou só desfaz a baixa (feito)
    if (b.op === "reativar") {
      const { data: atual } = await admin.from("agenda_tarefas").select("*").eq("id", String(b.id || "")).maybeSingle();
      if (!atual || !podeVer(atual)) return json({ error: "Tarefa não encontrada." }, 404);
      if (!baixadaPraMim(atual)) return json({ ok: true, data: { ...atual, ...extras(atual) } });
      if (!podeReativar(atual)) return json({ error: "Esta tarefa foi baixada por quem a criou. Só essa pessoa pode reativar." }, 403);
      const coluna = COLUNAS.includes(b.coluna) ? b.coluna : "feito";
      const agoraIso = new Date().toISOString();
      const campos: Record<string, unknown> = { updated_at: agoraIso };
      if (atual.criador_id === meuId) { campos.baixada_em = null; campos.baixada_por = {}; }
      else { const bp = { ...(atual.baixada_por || {}) }; delete bp[meuId]; campos.baixada_por = bp; }
      if (coluna !== atual.coluna) {
        campos.coluna = coluna;
        campos.concluida_em = coluna === "feito" ? agoraIso : null;
        if (coluna !== "feito") { campos.baixada_em = null; campos.baixada_por = {}; }
        const { data: ult } = await admin.from("agenda_tarefas").select("ordem").eq("coluna", coluna).order("ordem", { ascending: false }).limit(1);
        campos.ordem = ((ult && ult[0] && Number(ult[0].ordem)) || 0) + 1;
      }
      const { data, error } = await admin.from("agenda_tarefas").update(campos).eq("id", atual.id).select().single();
      if (error) throw error;
      if (atual.crm_tarefa_id && coluna !== atual.coluna) {
        const feita = coluna === "feito";
        await admin.from("crm_tarefas").update({ status: feita ? "feita" : "aberta", concluida_em: feita ? agoraIso : null }).eq("id", atual.crm_tarefa_id);
      }
      return json({ ok: true, data: { ...data, ...extras(data) } });
    }

    if (b.op === "sincCrm") {
      const idc = texto(b.crm_tarefa_id, 80); if (!idc) return json({ ok: true });
      const coluna = b.status === "feita" ? "feito" : "a_fazer";
      const up: Record<string, unknown> = { coluna, concluida_em: coluna === "feito" ? new Date().toISOString() : null, updated_at: new Date().toISOString() };
      if (coluna !== "feito") { up.baixada_em = null; up.baixada_por = {}; }   // v14
      await admin.from("agenda_tarefas").update(up).eq("crm_tarefa_id", idc);
      return json({ ok: true });
    }

    if (b.op === "excluir") {
      const { data: atual } = await admin.from("agenda_tarefas").select("*").eq("id", String(b.id || "")).maybeSingle();
      if (!atual || !podeVer(atual)) return json({ error: "Tarefa não encontrada." }, 404);
      if (!podeExcluir(atual)) return json({ error: "Só quem criou a tarefa pode excluir." }, 403);
      const { error } = await admin.from("agenda_tarefas").delete().eq("id", atual.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (b.op === "avisos") {
      const fmtDia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const hojeSP = fmtDia(new Date());
      const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
      const amanhaSP = somaDias(hojeSP, 1), limiteAtraso = somaDias(hojeSP, -7);
      const { data, error } = await admin.from("agenda_tarefas").select("*").or(`criador_id.eq.${meuId},participantes.cs.{${meuId}}`).neq("coluna", "feito").limit(1000);
      if (error) throw error;
      const out: any[] = [];
      const base = (t: any, kind: string, extra: any = {}) => ({ id: t.id, kind, titulo: t.titulo, descricao: t.descricao || "", tipo: t.tipo, data: t.data || null, hora: t.hora || null, de: t.criador_nome || "", classificacao: t.classificacao || "normal", minha: t.criador_id === meuId, ...extra });
      for (const t of data || []) {
        if (t.tipo === "compartilhada" && t.criador_id !== meuId && (t.participantes || []).includes(meuId)) {
          const em = (t.participantes_em && t.participantes_em[meuId]) || t.created_at;
          const ms = Date.now() - new Date(em).getTime();
          if (ms >= 0 && ms < 24 * 3600 * 1000 && !(t.cientes && t.cientes[meuId])) out.push(base(t, "compartilhada", { recebidoEm: em }));
        }
        if (!t.data) continue;
        const d = String(t.data).slice(0, 10);
        if (d === amanhaSP) out.push(base(t, "amanha"));
        else if (d === hojeSP) out.push(base(t, "hoje"));
        else if (d < hojeSP && d >= limiteAtraso) out.push(base(t, "atrasada"));
      }
      out.sort((a, c) => String(a.data || "9999").localeCompare(String(c.data || "9999")) || String(a.hora || "").localeCompare(String(c.hora || "")));
      return json({ ok: true, hoje: hojeSP, avisos: out });
    }
    if (b.op === "agendaCiente") {
      const { data: atual } = await admin.from("agenda_tarefas").select("*").eq("id", String(b.id || "")).maybeSingle();
      if (!atual || !(atual.participantes || []).includes(meuId)) return json({ error: "Aviso não encontrado." }, 404);
      const { data: ok, error } = await admin.rpc("agenda_ciente", { p_id: atual.id, p_user: meuId });
      if (error || ok !== true) return json({ error: "Não foi possível dar o ciente. Tente de novo." }, 500);
      return json({ ok: true });
    }

    if (b.op === "lembretes") {
      const { data: pess } = await admin.from("atendimento_pessoal_usuarios").select("id").eq("funcionario_id", meuId).maybeSingle();
      if (!pess) return json({ ok: true, data: [] });
      const { data } = await admin.from("atendimento_lembretes").select("id, numero_formatado, descricao, disparar_em, recorrencia, status")
        .eq("usuario_id", pess.id).in("status", ["pendente", "pausado", "enviado"]).order("disparar_em").limit(500);
      return json({ ok: true, data: data || [] });
    }

    if (b.op === "minhasVias") {
      const ST_OFICINA = ["enviado_fabrica", "em_producao", "pendencia", "oficina_pronto"];
      const lojaNome = (p: any) => { const l = (config.lojas || []).find((x: any) => x.id === p.lojaId); return l ? l.nome : (p.loja || ""); };
      const lojaNome0 = (p: any) => { const l = (config.lojas || []).find((x: any) => x.id === p.lojaId); return l ? l.nome : (p.loja || ""); };
      if (nivel === "oficina") {
        const { data: ped0, error: e0 } = await admin.from("ordens_servico").select("id, payload").in("payload->>status", ST_OFICINA).limit(1000);
        if (e0) throw e0;
        const lista0 = (ped0 || []).map((r: any) => { const p = r.payload || {}; return { tipo: "pedido", id: r.id, codigoVia: p.codigoVia || p.via || null, cliente: p.cliente || null, valorTotal: 0, status: p.status || null, loja: lojaNome0(p), data: p.data || null, validade: null, vendedora: p.vendedora || null, naOficina: true, serviceTypeId: p.serviceTypeId || null }; })
          .sort((a: any, c: any) => String(a.data || "9999").localeCompare(String(c.data || "9999")));
        return json({ ok: true, data: lista0, oficina: true });
      }
      const escopo = ["loja", "todas"].includes(String(b.escopo)) ? String(b.escopo) : "minhas";
      if (escopo !== "minhas") {
        const todasIds: string[] = (config.lojas || []).map((l: any) => String(l.id));
        const lojasEsc = escopo === "todas" && ehDiretoria ? todasIds : (ehDiretoria && !minhasLojas.length ? todasIds : minhasLojas);
        if (!lojasEsc.length) return json({ ok: true, data: [], escopo });
        const [orcL, venL, pedL] = await Promise.all([
          admin.from("orcamentos").select("id, payload").in("payload->>lojaId", lojasEsc).limit(1500),
          admin.from("vendas_pdv").select("id, payload").in("payload->>lojaId", lojasEsc).limit(1500),
          admin.from("ordens_servico").select("id, payload").in("payload->>lojaId", lojasEsc).limit(1500),
        ]);
        for (const r of [orcL, venL, pedL]) if (r.error) throw r.error;
        const mapL = (tipo: string, rows: any[]) => (rows || []).map((r) => {
          const p = r.payload || {};
          return { tipo, id: r.id, codigoVia: p.codigoVia || p.via || null, cliente: p.cliente || null, valorTotal: Number(p.valorTotal) || 0, status: p.status || null, loja: lojaNome(p), lojaId: p.lojaId || null,
            data: p.data || null, validade: p.validade || null, vendedora: p.vendedora || null, naOficina: tipo === "pedido" && ST_OFICINA.includes(String(p.status || "")), serviceTypeId: p.serviceTypeId || null };
        }).filter((x) => x.status !== "rascunho");
        const listaL = [...mapL("orcamento", orcL.data!), ...mapL("venda", venL.data!), ...mapL("pedido", pedL.data!)].sort((a, c) => String(c.data || "").localeCompare(String(a.data || "")));
        return json({ ok: true, data: listaL, escopo });
      }
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
      const map = (tipo: string, rows: any[]) => (rows || []).map((r) => {
        const p = r.payload || {};
        return {
          tipo, id: r.id, codigoVia: p.codigoVia || p.via || null, cliente: p.cliente || null,
          valorTotal: Number(p.valorTotal) || 0, status: p.status || null, loja: lojaNome(p),
          data: p.data || null, validade: p.validade || null, vendedora: p.vendedora || null,
          naOficina: tipo === "pedido" && ST_OFICINA.includes(String(p.status || "")),
          serviceTypeId: p.serviceTypeId || null,
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
