// atendimento-chat v5 — chat interno entre atendentes (pessoa a pessoa, departamento ou o
// GRUPO VILAÇA, conversa coletiva de toda a equipe: chave "g:vilaca", destino_tipo "grupo").
// Sessão do usuário (sess_…) validada contra gestao_config. Ops: lista, mensagens, enviar, lida, poll,
// finalizar, reabrir, anexoUrl. Mensagem pode levar foto/arquivo (bucket privado atendimento-midia, pasta interno/).
// Finalizar vale só pra quem finalizou (atendimento_interno_leituras.finalizada_em);
// mensagem nova depois disso traz a conversa de volta pra lista.
// v6: telas antigas abertas (que mandam o grupo como destino_tipo "pessoa" + destino_id "vilaca") também funcionam.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MAX_ANEXO = 15 * 1024 * 1024;
// pasta de anexos de cada conversa (chave sem caracteres especiais)
const pastaAnexo = (chave: string) => `interno/${chave.replace(/[^\w\-]+/g, "_")}/`;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    const { data: cfgRow } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config = (cfgRow && cfgRow.payload) || {};
    const user = (config.users || []).find((u: any) => sessaoValida(u, b.senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    const meuId: string = user.funcionarioId || user.id;
    const nomes: Record<string, string> = {};
    for (const f of (config.funcionarios || [])) nomes[f.id] = ((f.apelido || "").trim()) || f.nome || "";
    const meuNome = nomes[meuId] || user.nome || "";
    const { data: reg } = await admin.from("atendimento_atendentes").select("departamentos").eq("funcionario_id", meuId).maybeSingle();
    const meusDeps: string[] = (reg && reg.departamentos) || [];
    const { data: depsRows } = await admin.from("atendimento_departamentos").select("id, nome");
    const depNome: Record<string, string> = {}; for (const d of depsRows || []) depNome[d.id] = d.nome;

    const GRUPO = "g:vilaca", GRUPO_NOME = "👥 Grupo Vilaça";
    const clausulas = [`and(destino_tipo.eq.pessoa,destino_id.eq.${meuId})`, `remetente_id.eq.${meuId}`, "destino_tipo.eq.grupo"];
    if (meusDeps.length) clausulas.push(`and(destino_tipo.eq.departamento,destino_id.in.(${meusDeps.join(",")}))`);
    // quem enviou ao departamento também enxerga a conversa dele
    const visiveis = (q: any) => q.or(clausulas.join(","));
    const titulo = (m: any) => m.destino_tipo === "grupo" ? GRUPO_NOME : m.destino_tipo === "departamento" ? "🏷 " + (depNome[m.destino_id] || "Departamento") : (nomes[m.remetente_id === meuId ? m.destino_id : m.remetente_id] || "Atendente");
    const podeVer = async (chave: string) => {
      if (chave === GRUPO) return true;
      if (chave.startsWith("p:")) return chave.slice(2).split("|").includes(meuId);
      if (chave.startsWith("d:")) { if (meusDeps.includes(chave.slice(2))) return true; const { data } = await admin.from("atendimento_interno").select("id").eq("chave", chave).eq("remetente_id", meuId).limit(1); return !!(data && data.length); }
      return false;
    };
    async function threads() {
      const { data: msgs } = await visiveis(admin.from("atendimento_interno").select("*").order("created_at", { ascending: false }).limit(600));
      const { data: leit } = await admin.from("atendimento_interno_leituras").select("chave, lido_em, finalizada_em").eq("funcionario_id", meuId);
      const lido: Record<string, string> = {}; const fin: Record<string, string> = {};
      for (const l of leit || []) { lido[l.chave] = l.lido_em; if (l.finalizada_em) fin[l.chave] = l.finalizada_em; }
      const mapa: Record<string, any> = {};
      for (const m of msgs || []) {
        const t = mapa[m.chave] || (mapa[m.chave] = { chave: m.chave, tipo: m.destino_tipo, outro_id: m.destino_tipo !== "pessoa" ? m.destino_id : (m.remetente_id === meuId ? m.destino_id : m.remetente_id), titulo: titulo(m), ultima: { texto: m.texto, quem: m.remetente_nome, em: m.created_at }, nao_lidas: 0 });
        if (m.remetente_id !== meuId && (!lido[m.chave] || m.created_at > lido[m.chave])) t.nao_lidas++;
      }
      // o grupo aparece sempre, mesmo sem nenhuma mensagem ainda
      if (!mapa[GRUPO]) mapa[GRUPO] = { chave: GRUPO, tipo: "grupo", outro_id: "vilaca", titulo: GRUPO_NOME, ultima: { texto: "", quem: "", em: "" }, nao_lidas: 0 };
      const lista = Object.values(mapa).map((t: any) => ({ ...t, finalizada: !!fin[t.chave] && new Date(fin[t.chave]).getTime() >= new Date(t.ultima.em).getTime() }))
        .sort((a: any, b: any) => String(b.ultima.em).localeCompare(String(a.ultima.em)));
      return { lista, total: lista.filter((t: any) => !t.finalizada).reduce((s: number, t: any) => s + t.nao_lidas, 0), msgs: msgs || [] };
    }
    const marcarLida = (chave: string) => admin.from("atendimento_interno_leituras").upsert({ funcionario_id: meuId, chave, lido_em: new Date().toISOString() });

    if (b.op === "lista") { const t = await threads(); return json({ ok: true, threads: t.lista, total: t.total, meuId }); }
    if (b.op === "poll") {
      const t = await threads(); const desde = b.desde ? String(b.desde) : null;
      const novas = desde ? t.msgs.filter((m: any) => m.remetente_id !== meuId && m.created_at > desde).reverse().slice(-10).map((m: any) => ({ id: m.id, chave: m.chave, de: m.remetente_nome, titulo: titulo(m), texto: m.texto, em: m.created_at })) : [];
      return json({ ok: true, total: t.total, novas, agora: new Date().toISOString() });
    }
    if (b.op === "mensagens") {
      const chave = String(b.chave || ""); if (!(await podeVer(chave))) return json({ error: "sem acesso" }, 403);
      const { data } = await admin.from("atendimento_interno").select("*").eq("chave", chave).order("created_at", { ascending: false }).limit(150);
      await marcarLida(chave);
      return json({ ok: true, data: (data || []).reverse(), meuId });
    }
    if (b.op === "lida") { const chave = String(b.chave || ""); if (await podeVer(chave)) await marcarLida(chave); return json({ ok: true }); }
    if (b.op === "finalizar" || b.op === "reabrir") {
      const chave = String(b.chave || ""); if (!(await podeVer(chave))) return json({ error: "sem acesso" }, 403);
      if (chave === GRUPO) return json({ error: "O Grupo Vilaça fica fixo e não pode ser finalizado." }, 400);
      const agora = new Date().toISOString();
      const { error } = await admin.from("atendimento_interno_leituras").upsert({ funcionario_id: meuId, chave, lido_em: agora, finalizada_em: b.op === "finalizar" ? agora : null });
      if (error) throw error;
      return json({ ok: true });
    }
    // Link temporário (1h) pra abrir/baixar um anexo — só quem enxerga a conversa
    if (b.op === "anexoUrl") {
      const chave = String(b.chave || ""), path = String(b.path || "");
      if (!(await podeVer(chave)) || path.includes("..") || !path.startsWith(pastaAnexo(chave))) return json({ error: "sem acesso" }, 403);
      const { data, error } = await admin.storage.from("atendimento-midia").createSignedUrl(path, 3600, b.baixar ? { download: String(b.nome || true) } : undefined);
      if (error) throw error;
      return json({ ok: true, url: data.signedUrl });
    }
    if (b.op === "enviar") {
      let texto = String(b.texto || "").trim().slice(0, 2000);
      const anexo = b.anexo && b.anexo.base64 ? b.anexo : null;
      if (!texto && !anexo) return json({ error: "texto vazio" }, 400);
      const tipo = (b.destino_tipo === "grupo" || String(b.destino_id || "") === "vilaca") ? "grupo" : b.destino_tipo === "departamento" ? "departamento" : "pessoa"; const dest = tipo === "grupo" ? "vilaca" : String(b.destino_id || "");
      let chave: string;
      if (tipo === "grupo") chave = GRUPO;
      else if (tipo === "pessoa") { if (!dest || dest === meuId || !nomes[dest]) return json({ error: "destinatário inválido" }, 400); chave = "p:" + [meuId, dest].sort().join("|"); }
      else { if (!depNome[dest]) return json({ error: "departamento inválido" }, 400); chave = "d:" + dest; }
      const linha: Record<string, unknown> = { chave, destino_tipo: tipo, destino_id: dest, remetente_id: meuId, remetente_nome: meuNome, texto };
      if (anexo) {
        const bytes = Uint8Array.from(atob(String(anexo.base64)), (c) => c.charCodeAt(0));
        if (bytes.length > MAX_ANEXO) return json({ error: "Arquivo grande demais (máximo 15 MB)." }, 400);
        const nome = String(anexo.nome || "arquivo").replace(/[\/\\]/g, "_").slice(0, 120);
        const tipoMime = String(anexo.mimetype || "application/octet-stream").slice(0, 100);
        const path = `${pastaAnexo(chave)}${crypto.randomUUID()}-${nome.replace(/[^\w.\-]+/g, "_")}`;
        const { error: eUp } = await admin.storage.from("atendimento-midia").upload(path, bytes, { contentType: tipoMime, upsert: false });
        if (eUp) throw eUp;
        Object.assign(linha, { anexo_path: path, anexo_tipo: tipoMime, anexo_nome: nome, anexo_tamanho: bytes.length });
        if (!texto) linha.texto = (tipoMime.startsWith("image/") ? "📷 " : "📎 ") + nome;
      }
      const { error } = await admin.from("atendimento_interno").insert(linha);
      if (error) throw error;
      // quem escreve de novo numa conversa que tinha finalizado a traz de volta
      await admin.from("atendimento_interno_leituras").upsert({ funcionario_id: meuId, chave, lido_em: new Date().toISOString(), finalizada_em: null });
      return json({ ok: true, chave });
    }
    return json({ error: "operação desconhecida" }, 400);
  } catch (e) { console.error(e); return json({ error: String(e) }, 500); }
});
