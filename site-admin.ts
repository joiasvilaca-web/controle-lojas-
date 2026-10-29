// site-admin — API interna do módulo Site do Gestão e Controle.
// Autentica pelo token de sessão do Gestão (campo "senha"), igual ao db-gateway.
// Permissão: diretoria/gerente ou usuário com permissoes.site.ativo === true.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function sessoesVivas(u: any) { const a = Date.now(); return (Array.isArray(u.sessoes) ? u.sessoes : []).filter((s: any) => s && s.token && (!s.exp || Number(s.exp) > a)); }
function sessaoValida(u: any, senha: string) {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_")) return false;
  if (u.bloqueado) return false;
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > Date.now())) return true;
  return sessoesVivas(u).some((s: any) => s.token === senha);
}
function podeSite(u: any) {
  const p = u.permissoes;
  if (p && p.site && typeof p.site.ativo === "boolean") return p.site.ativo;
  return u.nivel === "diretoria" || u.nivel === "gerente";
}

const CAMPOS_SITE = ["publicado", "nome", "slug", "descricao", "seoTitulo", "seoDescricao", "destaque", "lancamento", "sobEncomenda", "prazoEncomenda",
  "personalizavel", "lojaId", "precoDe", "preco", "metal", "ordem", "numerosAro", "marca", "fotos", "caracteristicas",
  "condicao", "estado", "historia", "garantiaDias", "lojaIds", "lojasAuto", "marketplaces"];
const CAMPOS_CONFIG = ["nome", "whatsapp", "email", "instagram", "freteGratisAcima", "freteTabela", "prazoEnvio", "parcelasMax", "parcelaMinima", "descontoPix",
  "cupomPrimeiraCompra", "cupons", "lojasAtivas", "faixa", "banners", "hero", "checkoutModo", "fotoPadrao", "empresa", "garantiaDias"];
const CANAIS = ["mercadolivre", "shopee", "tiktok", "amazon"];
const STATUS_PEDIDO = ["aguardando_pagamento", "pago", "separando", "enviado", "entregue", "pronto_retirada", "cancelado"];

const slugify = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function todosProdutos() {
  const out: any[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from("produtos_estoque").select("id,payload,updated_at").range(f, f + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
function fotoUrl(f: any) { return typeof f === "string" ? f : f?.siteUrl || f?.driveUrl || f?.url || null; }

// Tratamento de foto no padrão editorial (fundo branco, sombra suave, enquadramento padronizado).
// Não altera a peça: só remove o fundo, centraliza e acrescenta sombra.
async function tratarFoto(url: string, padrao: any) {
  let apiKey = Deno.env.get("PHOTOROOM_API_KEY");
  if (!apiKey) { const { data } = await sb.from("site_segredos").select("valor").eq("chave", "PHOTOROOM_API_KEY").maybeSingle(); apiKey = data?.valor || ""; }
  if (!apiKey) throw new Error("Falta a chave da Photoroom. Cadastre PHOTOROOM_API_KEY nos segredos do Supabase.");
  const img = await fetch(url);
  if (!img.ok) throw new Error("Não consegui baixar a foto original.");
  const bytes = new Uint8Array(await img.arrayBuffer());
  const form = new FormData();
  form.append("imageFile", new Blob([bytes], { type: img.headers.get("content-type") || "image/jpeg" }), "foto.jpg");
  form.append("background.color", padrao?.fundo || "FFFFFF");
  form.append("padding", String(padrao?.margem ?? 0.14));
  form.append("outputSize", padrao?.tamanho || "1600x1600");
  if ((padrao?.sombra ?? "ai.soft") !== "nenhuma") form.append("shadow.mode", padrao?.sombra || "ai.soft");
  form.append("export.format", "webp");
  const r = await fetch("https://image-api.photoroom.com/v2/edit", { method: "POST", headers: { "x-api-key": apiKey }, body: form });
  if (!r.ok) throw new Error(`Photoroom respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return new Uint8Array(await r.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  const { op, senha } = body || {};
  try {
    const { data: cfgRow } = await sb.from("gestao_config").select("payload").eq("id", "config").single();
    const config = cfgRow?.payload || {};
    const user = (Array.isArray(config.users) ? config.users : []).find((u: any) => sessaoValida(u, senha));
    if (!user) return json({ error: "sessão expirada" }, 401);
    if (!podeSite(user)) return json({ error: "sem permissão para o módulo Site" }, 403);
    const quem = user.apelido || user.nome || "usuário";
    const cats = config?.produtosOtica?.categorias || [];
    const subs = config?.produtosOtica?.subcategorias || [];
    const lojas = (config.lojas || []).map((l: any) => ({ id: l.id, nome: l.nome, abreviacao: l.abreviacao, cnpj: l.cnpj || "", cor: l.cor }));

    if (op === "init") {
      const { data: site } = await sb.from("site_config").select("payload").eq("id", "site").single();
      const { data: siteRf } = await sb.from("site_config").select("payload").eq("id", "reforma").maybeSingle();
      return json({ ok: true, siteReforma: siteRf?.payload || {}, user: { nome: quem, nivel: user.nivel }, lojas, categorias: cats, subcategorias: subs, site: site?.payload || {}, canais: CANAIS, siteUrl: "https://vilaca-site.vercel.app" });
    }

    if (op === "resumo") {
      const prods = await todosProdutos();
      const pub = prods.filter((r) => r.payload?.site?.publicado);
      const semFoto = pub.filter((r) => !((r.payload.site?.fotos?.length ? r.payload.site.fotos : r.payload.fotos) || []).length);
      const tratadas = pub.filter((r) => (r.payload.fotos || []).some((f: any) => f.siteUrl));
      const { data: peds } = await sb.from("site_pedidos").select("status,total,loja_id,created_at").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString());
      const ativos = (peds || []).filter((p: any) => p.status !== "cancelado");
      return json({ ok: true,
        produtos: { total: prods.length, publicados: pub.length, semFoto: semFoto.length, comFotoTratada: tratadas.length, foraDoSite: prods.length - pub.length },
        pedidos30d: { total: ativos.length, valor: ativos.reduce((a: number, p: any) => a + Number(p.total), 0),
          aguardando: (peds || []).filter((p: any) => p.status === "aguardando_pagamento").length,
          porLoja: lojas.map((l: any) => ({ loja: l.id, qtd: ativos.filter((p: any) => p.loja_id === l.id).length, valor: ativos.filter((p: any) => p.loja_id === l.id).reduce((a: number, p: any) => a + Number(p.total), 0) })).filter((x: any) => x.qtd) } });
    }

    if (op === "listarProdutos") {
      const prods = await todosProdutos();
      const q = slugify(body.busca || "");
      let l = prods.filter((r) => (r.payload?.tipo || "") !== "Insumo" && r.payload?.categoriaId !== cats.find((c: any) => c.nome === "SERVIÇO")?.id);
      if (q) l = l.filter((r) => slugify(`${r.payload.nome} ${r.payload.codigoInterno} ${r.payload.site?.nome || ""}`).includes(q));
      if (body.filtro === "publicados") l = l.filter((r) => r.payload.site?.publicado);
      if (body.filtro === "ocultos") l = l.filter((r) => !r.payload.site?.publicado);
      if (body.filtro === "semfoto") l = l.filter((r) => !((r.payload.site?.fotos?.length ? r.payload.site.fotos : r.payload.fotos) || []).length);
      if (body.filtro === "fotoNaoTratada") l = l.filter((r) => (r.payload.fotos || []).length && !(r.payload.fotos || []).some((f: any) => f.siteUrl));
      if (body.categoria) l = l.filter((r) => r.payload.categoriaId === body.categoria);
      if (body.loja) l = l.filter((r) => (r.payload.site?.lojaId || "") === body.loja || Number((r.payload.estoquePorLoja || {})[body.loja] || 0) > 0);
      l.sort((a, b) => String(a.payload.nome).localeCompare(String(b.payload.nome), "pt-BR"));
      const total = l.length, off = Number(body.offset || 0), lim = Math.min(Number(body.limit || 50), 200);
      return json({ ok: true, total, produtos: l.slice(off, off + lim).map((r) => {
        const p = r.payload, s = p.site || {};
        const fotos = (p.fotos || []).filter((f: any) => f.tipo !== "video");
        return { id: r.id, codigo: p.codigoInterno, nomeInterno: p.nome, categoriaId: p.categoriaId, subcategoriaId: p.subcategoriaId, precoVenda: p.precoVenda,
          estoquePorLoja: p.estoquePorLoja || {}, numerosAro: p.numerosAro || [], peso: p.peso, site: s,
          fotos: fotos.map((f: any) => ({ id: f.id, original: f.driveUrl || f.url, tratada: f.siteUrl || null, ocultarSite: !!f.ocultarSite })),
          capa: fotoUrl(fotos[0]), marketplaces: p.marketplaces || {} };
      }) });
    }

    if (op === "salvarProduto") {
      const { data: row, error } = await sb.from("produtos_estoque").select("payload").eq("id", body.id).single();
      if (error || !row) return json({ error: "produto não encontrado" }, 404);
      const p = row.payload;
      const atual = p.site || {};
      const novo: any = { ...atual };
      for (const k of CAMPOS_SITE) if (body.site && k in body.site) novo[k] = body.site[k];
      if (novo.slug) novo.slug = slugify(novo.slug);
      if (!novo.slug) novo.slug = slugify(novo.nome || p.nome) + "-" + String(body.id).slice(-4);
      // slug único
      const { data: dup } = await sb.from("produtos_estoque").select("id").eq("payload->site->>slug", novo.slug).neq("id", body.id).limit(1);
      if (dup && dup.length) novo.slug = novo.slug + "-" + String(body.id).slice(-4);
      novo.atualizadoPor = quem; novo.atualizadoEm = new Date().toISOString();
      const payload = { ...p, site: novo };
      if (body.fotosOcultas && Array.isArray(p.fotos)) payload.fotos = p.fotos.map((f: any) => ({ ...f, ocultarSite: body.fotosOcultas.includes(f.id) }));
      if (body.ordemFotos && Array.isArray(p.fotos)) {
        const ord = body.ordemFotos as string[];
        payload.fotos = [...payload.fotos].sort((a: any, b: any) => (ord.indexOf(a.id) + 1 || 999) - (ord.indexOf(b.id) + 1 || 999));
      }
      const { error: e2 } = await sb.from("produtos_estoque").update({ payload, updated_at: new Date().toISOString() }).eq("id", body.id);
      if (e2) throw e2;
      return json({ ok: true, site: novo });
    }

    if (op === "publicarEmMassa") {
      const ids: string[] = (body.ids || []).slice(0, 500);
      let n = 0;
      for (const id of ids) {
        const { data: row } = await sb.from("produtos_estoque").select("payload").eq("id", id).single();
        if (!row) continue;
        const p = row.payload;
        const s = { ...(p.site || {}), publicado: !!body.publicado, atualizadoPor: quem, atualizadoEm: new Date().toISOString() };
        if (!s.slug) s.slug = slugify(p.nome) + "-" + id.slice(-4);
        await sb.from("produtos_estoque").update({ payload: { ...p, site: s }, updated_at: new Date().toISOString() }).eq("id", id);
        n++;
      }
      return json({ ok: true, alterados: n });
    }

    if (op === "tratarFoto") {
      const { data: row } = await sb.from("produtos_estoque").select("payload").eq("id", body.id).single();
      if (!row) return json({ error: "produto não encontrado" }, 404);
      const p = row.payload;
      const fotos = Array.isArray(p.fotos) ? p.fotos : [];
      const alvo = fotos.find((f: any) => f.id === body.fotoId);
      if (!alvo) return json({ error: "foto não encontrada" }, 404);
      const { data: site } = await sb.from("site_config").select("payload").eq("id", "site").single();
      const bytes = await tratarFoto(alvo.driveUrl || alvo.url, site?.payload?.fotoPadrao || {});
      const path = `tratadas/${body.id}/${alvo.id}-${Date.now()}.webp`;
      const { error: eUp } = await sb.storage.from("site-produtos").upload(path, bytes, { contentType: "image/webp", upsert: true });
      if (eUp) throw eUp;
      const url = sb.storage.from("site-produtos").getPublicUrl(path).data.publicUrl;
      const novas = fotos.map((f: any) => (f.id === alvo.id ? { ...f, siteUrl: url, tratadoSiteEm: new Date().toISOString(), tratadoSitePor: quem } : f));
      await sb.from("produtos_estoque").update({ payload: { ...p, fotos: novas }, updated_at: new Date().toISOString() }).eq("id", body.id);
      return json({ ok: true, url });
    }

    if (op === "desfazerTratamento") {
      const { data: row } = await sb.from("produtos_estoque").select("payload").eq("id", body.id).single();
      if (!row) return json({ error: "produto não encontrado" }, 404);
      const p = row.payload;
      const fotos = (p.fotos || []).map((f: any) => (f.id === body.fotoId ? (({ siteUrl, tratadoSiteEm, tratadoSitePor, ...resto }) => resto)(f) : f));
      await sb.from("produtos_estoque").update({ payload: { ...p, fotos }, updated_at: new Date().toISOString() }).eq("id", body.id);
      return json({ ok: true });
    }

    if (op === "listarPedidos") {
      let q = sb.from("site_pedidos").select("*", { count: "exact" }).order("numero", { ascending: false });
      if (body.status) q = q.eq("status", body.status);
      if (body.loja) q = q.eq("loja_id", body.loja);
      if (body.busca) q = q.or(`cliente->>nome.ilike.%${String(body.busca).replace(/[%,()]/g, "")}%,cliente->>cpf.ilike.%${String(body.busca).replace(/\D/g, "") || "x"}%`);
      const off = Number(body.offset || 0);
      const { data, count, error } = await q.range(off, off + Math.min(Number(body.limit || 50), 200) - 1);
      if (error) throw error;
      return json({ ok: true, total: count || 0, pedidos: data });
    }

    if (op === "atualizarPedido") {
      const { data: ped } = await sb.from("site_pedidos").select("*").eq("id", body.id).single();
      if (!ped) return json({ error: "pedido não encontrado" }, 404);
      const upd: any = { updated_at: new Date().toISOString() };
      const hist = Array.isArray(ped.historico) ? ped.historico : [];
      if (body.status && STATUS_PEDIDO.includes(body.status) && body.status !== ped.status) {
        upd.status = body.status;
        hist.push({ em: new Date().toISOString(), status: body.status, por: quem, obs: body.obs || "" });
      } else if (body.obs) hist.push({ em: new Date().toISOString(), status: ped.status, por: quem, obs: body.obs });
      if ("rastreio" in body) upd.envio = { ...(ped.envio || {}), rastreio: String(body.rastreio || "").trim() || null };
      if ("notaFiscal" in body) upd.pagamento = { ...(ped.pagamento || {}), notaFiscal: String(body.notaFiscal || "").trim() || null };
      upd.historico = hist;
      const { error } = await sb.from("site_pedidos").update(upd).eq("id", body.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (op === "salvarConfig") {
      const idCfg = body.canal === "reforma" ? "reforma" : "site";
      const { data: site } = await sb.from("site_config").select("payload").eq("id", idCfg).maybeSingle();
      const atual = site?.payload || {};
      for (const k of CAMPOS_CONFIG) if (body.config && k in body.config) atual[k] = body.config[k];
      atual.atualizadoPor = quem; atual.atualizadoEm = new Date().toISOString();
      const { error } = await sb.from("site_config").upsert({ id: idCfg, payload: atual, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true, site: atual });
    }

    if (op === "listarMarketplaces") {
      const [{ data: contas }, { data: anuncios }] = await Promise.all([
        sb.from("marketplace_contas").select("*"),
        sb.from("marketplace_anuncios").select("produto_id,loja_id,canal,ativo,preco,status,externo_id"),
      ]);
      return json({ ok: true, canais: CANAIS, contas: contas || [], anuncios: anuncios || [] });
    }

    if (op === "salvarContaMarketplace") {
      if (!CANAIS.includes(body.canal) || !lojas.some((l: any) => l.id === body.loja_id)) return json({ error: "canal ou loja inválidos" }, 400);
      const dados = { apelido: String(body.dados?.apelido || "").slice(0, 80), sellerId: String(body.dados?.sellerId || "").slice(0, 80), obs: String(body.dados?.obs || "").slice(0, 300), atualizadoPor: quem };
      const { error } = await sb.from("marketplace_contas").upsert({ loja_id: body.loja_id, canal: body.canal, status: body.status === "ativo" ? "ativo" : "nao_conectado", dados, updated_at: new Date().toISOString() }, { onConflict: "loja_id,canal" });
      if (error) throw error;
      return json({ ok: true });
    }

    if (op === "vincularAnuncios") {
      if (!CANAIS.includes(body.canal) || !lojas.some((l: any) => l.id === body.loja_id)) return json({ error: "canal ou loja inválidos" }, 400);
      const linhas = (body.itens || []).slice(0, 500).map((i: any) => ({
        produto_id: i.produto_id, loja_id: body.loja_id, canal: body.canal, ativo: i.ativo !== false,
        preco: i.preco === "" || i.preco == null ? null : Number(i.preco), status: i.ativo === false ? "pausado" : "pendente",
        payload: { atualizadoPor: quem }, updated_at: new Date().toISOString(),
      }));
      const { error } = await sb.from("marketplace_anuncios").upsert(linhas, { onConflict: "produto_id,loja_id,canal" });
      if (error) throw error;
      return json({ ok: true, vinculados: linhas.length });
    }

    return json({ error: "op desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
