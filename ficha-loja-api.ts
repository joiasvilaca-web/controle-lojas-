// ficha-loja-api v1 (16/11/2026) — FICHA DA LOJA (memorial descritivo): fotos, equipamentos, iluminação, internet, contatos, documentos etc. de cada loja.
// verify_jwt: true. Sessão igual às outras funções (body.senha = token "sess_…").
// Quem acessa: DIRETORIA (todas as lojas) e GERENTE (só as lojas dela, incluindo a loja extra da sessão). Vendedora e Oficina: 403.
// Ops: init | abrir {lojaId} | salvar {lojaId, payload, versao} | historico {lojaId} | versao {lojaId, id}
// Tabelas: loja_fichas (uma linha por loja) e loja_fichas_historico (versões anteriores; guarda as 40 mais recentes de cada loja).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const TAMANHO_MAX = 600_000;   // ficha em JSON (as fotos ficam no Drive; aqui só o endereço)
const HIST_MAX = 40;

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
function lojasDaSessao(u: any, token: string): string[] {
  const base: string[] = Array.isArray(u?.lojas) ? u.lojas.map(String) : [];
  const s = (Array.isArray(u?.sessoes) ? u.sessoes : []).find((x: any) => x && x.token === token);
  const e = s && s.lojaExtra;
  return e && e.id && Number(e.ate) > Date.now() && !base.includes(String(e.id)) ? [...base, String(e.id)] : base;
}
/** Lojas que a pessoa pode ver/editar na ficha. Diretoria: todas. Gerente: as dela. Demais: nenhuma. */
function lojasPermitidas(config: any, user: any, senha: string): string[] {
  const todas: string[] = (Array.isArray(config.lojas) ? config.lojas : []).map((l: any) => String(l.id));
  if (user.nivel === "diretoria") return todas;
  if (user.nivel === "gerente") { const minhas = lojasDaSessao(user, senha); return todas.filter((id) => minhas.includes(id)); }
  return [];
}
/** Dados do cadastro da loja que aparecem na ficha (somente leitura; edita-se em Configurações › Cadastro › Loja). */
function cadastroDaLoja(l: any) {
  const end = [l.endereco, l.numero, l.complemento].filter((x: any) => String(x || "").trim()).join(", ");
  return { id: String(l.id), nome: l.nomePublico || l.nomeFantasia || l.nome || "", abreviacao: l.abreviacao || "", razaoSocial: l.razaoSocial || l.nome || "", cnpj: l.cnpj || "",
    inscricaoEstadual: l.inscricaoEstadual || "", endereco: end, bairro: l.bairro || "", cidade: [l.cidade, l.estado].filter(Boolean).join(" / "), cep: l.cep || "", telefone: l.telefone || "", email: l.email || "", cor: l.cor || "" };
}
/** Equipe vinculada à loja pelo cadastro de usuários (ativos). */
function equipeDaLoja(config: any, lojaId: string) {
  const funcs: any[] = Array.isArray(config.funcionarios) ? config.funcionarios : [];
  return (Array.isArray(config.users) ? config.users : [])
    .filter((u: any) => u && Array.isArray(u.lojas) && u.lojas.map(String).includes(lojaId) && !u.bloqueado && String(u.status || "ativo").toLowerCase() !== "inativo" && String(u.status || "").toLowerCase() !== "desligado")
    .map((u: any) => { const f = funcs.find((x: any) => x && x.id === u.funcionarioId); return { id: String(u.funcionarioId || u.id || ""), nome: (f && (f.apelido || f.nome)) || u.nome || "", nomeCompleto: (f && f.nome) || u.nome || "", nivel: u.nivel || "" }; })
    .sort((a: any, b: any) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const senha = String(body.senha || ""), op = String(body.op || "");
    const { data: cf, error: eCf } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    if (eCf) throw eCf;
    const config: any = (cf && cf.payload) || {};
    const user: any = (Array.isArray(config.users) ? config.users : []).find((u: any) => sessaoValida(u, senha));
    if (!user) return json({ error: "não autorizado" }, 401);
    const permitidas = lojasPermitidas(config, user, senha);
    if (!permitidas.length) return json({ error: "A ficha da loja é só para a diretoria e a gerência." }, 403);
    const quem = String(user.apelido || user.nome || "").trim();

    if (op === "init") {
      const { data: linhas, error } = await admin.from("loja_fichas").select("loja_id, versao, atualizado_por, updated_at").in("loja_id", permitidas);
      if (error) throw error;
      const resumo: Record<string, any> = {}; for (const r of linhas || []) resumo[r.loja_id] = { versao: r.versao, por: r.atualizado_por, em: r.updated_at };
      const lojas = (Array.isArray(config.lojas) ? config.lojas : []).filter((l: any) => permitidas.includes(String(l.id))).map(cadastroDaLoja);
      const equipe: Record<string, any[]> = {}; for (const id of permitidas) equipe[id] = equipeDaLoja(config, id);
      return json({ ok: true, nivel: user.nivel, lojas, equipe, resumo });
    }

    const lojaId = String(body.lojaId || "");
    if (!lojaId || !permitidas.includes(lojaId)) return json({ error: "sem acesso a esta loja" }, 403);

    if (op === "abrir") {
      const { data: row, error } = await admin.from("loja_fichas").select("payload, versao, atualizado_por, updated_at").eq("loja_id", lojaId).maybeSingle();
      if (error) throw error;
      return json({ ok: true, lojaId, payload: (row && row.payload) || {}, versao: row ? row.versao : 0, por: row ? row.atualizado_por : null, em: row ? row.updated_at : null });
    }

    if (op === "salvar") {
      const payload = body.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "ficha inválida" }, 400);
      const txt = JSON.stringify(payload);
      if (txt.length > TAMANHO_MAX) return json({ error: "A ficha ficou grande demais. Tire textos muito longos (as fotos não contam: ficam guardadas à parte)." }, 413);
      const { data: atual, error: eA } = await admin.from("loja_fichas").select("payload, versao, atualizado_por, updated_at").eq("loja_id", lojaId).maybeSingle();
      if (eA) throw eA;
      const versaoAtual = atual ? Number(atual.versao) || 0 : 0;
      // outra pessoa salvou enquanto esta tela estava aberta: não sobrescreve
      if (Number(body.versao) !== versaoAtual) return json({ ok: false, conflito: true, erro: `A ficha foi alterada por ${(atual && atual.atualizado_por) || "outra pessoa"} enquanto você editava. Recarregue para ver a versão nova; o que você digitou continua na tela até recarregar.`, versao: versaoAtual }, 409);
      const agora = new Date().toISOString();
      if (atual) {
        await admin.from("loja_fichas_historico").insert({ loja_id: lojaId, payload: atual.payload, versao: versaoAtual, por: atual.atualizado_por, em: atual.updated_at });
        const { data: velhos } = await admin.from("loja_fichas_historico").select("id").eq("loja_id", lojaId).order("em", { ascending: false }).range(HIST_MAX, HIST_MAX + 200);
        if (velhos && velhos.length) await admin.from("loja_fichas_historico").delete().in("id", velhos.map((v: any) => v.id));
        const { data: up, error: eU } = await admin.from("loja_fichas").update({ payload, versao: versaoAtual + 1, atualizado_por: quem, updated_at: agora }).eq("loja_id", lojaId).eq("versao", versaoAtual).select("versao");
        if (eU) throw eU;
        if (!up || !up.length) return json({ ok: false, conflito: true, erro: "A ficha foi alterada por outra pessoa agora mesmo. Recarregue e tente de novo.", versao: versaoAtual }, 409);
      } else {
        const { error: eI } = await admin.from("loja_fichas").insert({ loja_id: lojaId, payload, versao: 1, atualizado_por: quem, updated_at: agora });
        if (eI) return json({ ok: false, conflito: true, erro: "Outra pessoa criou esta ficha agora mesmo. Recarregue e tente de novo.", versao: 0 }, 409);
      }
      try { await admin.from("auditoria_log").insert({ usuario_id: user.id || null, usuario_nome: user.nome || null, nivel: user.nivel || null, loja_sessao: lojaId, acao: "ficha_loja_salva", modulo: "Ficha da loja", tabela: "loja_fichas", registro_id: lojaId, resumo: `Salvou a ficha da loja (versão ${versaoAtual + 1})`, detalhe: { resumo: String(body.resumo || "").slice(0, 300) } }); } catch (_) { /* o log não impede o salvar */ }
      return json({ ok: true, versao: versaoAtual + 1, por: quem, em: agora });
    }

    if (op === "historico") {
      const { data: h, error } = await admin.from("loja_fichas_historico").select("id, versao, por, em").eq("loja_id", lojaId).order("em", { ascending: false }).limit(HIST_MAX);
      if (error) throw error;
      return json({ ok: true, historico: h || [] });
    }
    if (op === "versao") {
      const { data: h, error } = await admin.from("loja_fichas_historico").select("id, versao, por, em, payload").eq("loja_id", lojaId).eq("id", Number(body.id) || 0).maybeSingle();
      if (error) throw error;
      if (!h) return json({ error: "versão não encontrada" }, 404);
      return json({ ok: true, ...h });
    }
    return json({ error: "operação desconhecida" }, 400);
  } catch (e) {
    console.error("ficha-loja-api", e);
    return json({ error: "Falha na ficha da loja. Tente de novo." }, 500);
  }
});
