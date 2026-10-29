// site-public — API pública dos sites (catálogo, frete, pedidos).
// Dois canais: "vilaca" (padrão) e "reforma" (Reforma Joias — joias usadas e reformadas).
// Só devolve campos públicos. Nunca expõe custo, fornecedor, fiscal ou dados internos.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, status = 200, cache = 0) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...(cache ? { "Cache-Control": `public, max-age=${cache}, s-maxage=${cache}` } : {}) },
  });

const LOJA_REFORMA = "loja_rj";

let cache: { t: number; config: any; site: any; siteReforma: any; produtos: any[] } | null = null;
async function carregar(force = false) {
  if (!force && cache && Date.now() - cache.t < 60_000) return cache;
  const [{ data: cfg }, { data: sites }] = await Promise.all([
    sb.from("gestao_config").select("payload").eq("id", "config").single(),
    sb.from("site_config").select("id,payload").in("id", ["site", "reforma"]),
  ]);
  const todos: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("produtos_estoque").select("id,payload,updated_at").range(from, from + 999);
    if (error) throw error;
    todos.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const porId = (id: string) => (sites || []).find((s: any) => s.id === id)?.payload || {};
  cache = { t: Date.now(), config: cfg?.payload || {}, site: porId("site"), siteReforma: porId("reforma"), produtos: todos };
  return cache;
}
// Contexto do canal pedido: "site" aponta para a configuração do site daquele canal.
async function contexto(body: any, force = false) {
  const c = await carregar(force);
  const reforma = body?.canal === "reforma";
  return { ...c, canal: reforma ? "reforma" : "vilaca", site: reforma ? c.siteReforma : c.site };
}

const slugify = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function nomeBonito(s: string) {
  if (!s) return "";
  if (s !== s.toUpperCase()) return s;
  const minus = new Set(["de", "da", "do", "das", "dos", "e", "em", "com", "para", "a", "o"]);
  return s.toLowerCase().split(" ").map((w, i) => (i > 0 && minus.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ")
    .replace(/\b18k\b/gi, "18k").replace(/\b925\b/, "925");
}

function lojaDoProduto(p: any, ativas: string[]) {
  const est = p.estoquePorLoja || {};
  const s = p.site || {};
  if (s.lojaId && ativas.includes(s.lojaId)) return s.lojaId;
  let melhor = "", qt = -1;
  for (const l of ativas) { const q = Number(est[l] || 0); if (q > qt) { qt = q; melhor = l; } }
  return melhor || ativas[0];
}

function publico(row: any, ctx: any, completo = false) {
  const p = row.payload || {};
  const s = p.site || {};
  const ativas: string[] = ctx.site.lojasAtivas || [];
  const cats = ctx.config?.produtosOtica?.categorias || [];
  const subs = ctx.config?.produtosOtica?.subcategorias || [];
  const cat = cats.find((c: any) => c.id === p.categoriaId);
  const sub = subs.find((c: any) => c.id === p.subcategoriaId);
  const lojaId = lojaDoProduto(p, ativas);
  const lojas = ctx.config?.lojas || [];
  const loja = lojas.find((l: any) => l.id === lojaId);
  const estoque = Number((p.estoquePorLoja || {})[lojaId] || 0);
  const fotos = (s.fotos && s.fotos.length ? s.fotos : p.fotos || [])
    .filter((f: any) => typeof f === "string" || (f.tipo !== "video" && !f.ocultarSite))
    .map((f: any) => (typeof f === "string" ? f : f.siteUrl || f.driveUrl || f.url)).filter(Boolean);
  const preco = Number(s.preco ?? p.precoVenda ?? 0);
  const out: any = {
    id: row.id, slug: s.slug || slugify(p.nome) + "-" + String(row.id).slice(-4),
    nome: s.nome || nomeBonito(p.nome), preco, precoDe: s.precoDe && s.precoDe > preco ? Number(s.precoDe) : null,
    categoria: cat ? nomeBonito(cat.nome) : "", categoriaSlug: cat ? slugify(cat.nome) : "",
    metal: s.metal || (sub ? nomeBonito(sub.nome) : ""), foto: fotos[0] || null, foto2: fotos[1] || null,
    destaque: !!s.destaque, lancamento: !!s.lancamento, disponivel: estoque > 0 || !!s.sobEncomenda,
    sobEncomenda: !!s.sobEncomenda && estoque <= 0, personalizavel: !!s.personalizavel, ordem: Number(s.ordem || 0),
    criado: row.updated_at, condicao: s.condicao || "", codigo: p.codigoInterno || "",
  };
  if (completo) {
    Object.assign(out, {
      fotos, descricao: s.descricao || "", seoTitulo: s.seoTitulo || "", seoDescricao: s.seoDescricao || "",
      peso: p.peso || null, numerosAro: (p.numerosAro || []).length ? p.numerosAro : (s.numerosAro || []),
      prazoEncomenda: s.prazoEncomenda || "", estoque: Math.min(estoque, 10),
      loja: loja ? { id: loja.id, nome: lojaNomePublico(loja), cidade: loja.cidade || "Juiz de Fora" } : null,
      caracteristicas: s.caracteristicas || [], marca: s.marca || "",
      estado: s.estado || "", historia: s.historia || "", garantiaDias: Number(s.garantiaDias || 0) || null,
    });
  }
  return out;
}
function lojaNomePublico(l: any) {
  const m: Record<string, string> = { loja_mc: "Vilaça Joias · Marechal", loja_jb: "Vilaça Joias · Halfeld", loja_jn: "Vilaça Joias · Jardim Norte", loja_ec: "Vilaça Joias · Online", [LOJA_REFORMA]: "Reforma Joias" };
  return m[l.id] || "Vilaça Joias";
}

// Cada site mostra só as peças marcadas para ele: a Reforma vende as peças da loja_rj;
// o site da Vilaça nunca mostra peças da Reforma.
function visivel(row: any, ctx: any) {
  const p = row.payload || {};
  if (!(p.site && p.site.publicado === true && p.vendavel !== false)) return false;
  const daReforma = p.site.lojaId === LOJA_REFORMA;
  return ctx.canal === "reforma" ? daReforma : !daReforma;
}

function fmt(n: number) { return Math.round(n * 100) / 100; }

function calcFrete(ctx: any, subtotal: number, cep: string) {
  const s = ctx.site;
  const lim = Number(s.freteGratisAcima || 0);
  if (lim && subtotal >= lim) return { valor: 0, prazo: s.prazoEnvio || "3 a 8 dias úteis", nome: "Frete grátis" };
  const uf = cepParaUF(cep);
  const tabela = s.freteTabela || { MG: 24.9, SUDESTE: 29.9, OUTROS: 39.9 };
  const sud = ["SP", "RJ", "ES"];
  const valor = uf === "MG" ? tabela.MG : sud.includes(uf) ? tabela.SUDESTE : tabela.OUTROS;
  return { valor: Number(valor), prazo: s.prazoEnvio || "3 a 8 dias úteis", nome: "Envio segurado" };
}
function cepParaUF(cep: string) {
  const n = Number(String(cep || "").replace(/\D/g, "").slice(0, 5));
  const faixas: [number, number, string][] = [[1000, 19999, "SP"], [20000, 28999, "RJ"], [29000, 29999, "ES"], [30000, 39999, "MG"], [40000, 48999, "BA"], [49000, 49999, "SE"], [50000, 56999, "PE"], [57000, 57999, "AL"], [58000, 58999, "PB"], [59000, 59999, "RN"], [60000, 63999, "CE"], [64000, 64999, "PI"], [65000, 65999, "MA"], [66000, 68899, "PA"], [68900, 68999, "AP"], [69000, 69299, "AM"], [69300, 69399, "RR"], [69400, 69899, "AM"], [69900, 69999, "AC"], [70000, 73699, "DF"], [73700, 76799, "GO"], [76800, 76999, "RO"], [77000, 77999, "TO"], [78000, 78899, "MT"], [79000, 79999, "MS"], [80000, 87999, "PR"], [88000, 89999, "SC"], [90000, 99999, "RS"]];
  for (const [a, b, uf] of faixas) if (n >= a && n <= b) return uf;
  return "";
}

const onlyDigits = (s: string) => String(s || "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: any = {};
  try {
    if (req.method === "GET") body = Object.fromEntries(new URL(req.url).searchParams);
    else body = await req.json();
  } catch { return json({ erro: "corpo inválido" }, 400); }
  const op = body.op;
  try {
    if (op === "init") {
      const ctx = await contexto(body);
      const vis = ctx.produtos.filter((r: any) => visivel(r, ctx));
      const cats = (ctx.config?.produtosOtica?.categorias || []).map((c: any) => ({
        nome: nomeBonito(c.nome), slug: slugify(c.nome),
        total: vis.filter((r: any) => r.payload.categoriaId === c.id).length,
      })).filter((c: any) => c.total > 0);
      const s = ctx.site;
      return json({
        site: { nome: s.nome, whatsapp: s.whatsapp, email: s.email, faixa: s.faixa || [], banners: s.banners || [],
          freteGratisAcima: s.freteGratisAcima, parcelasMax: s.parcelasMax || 12, parcelaMinima: s.parcelaMinima || 50,
          hero: s.hero || null, instagram: s.instagram ?? (ctx.canal === "reforma" ? "" : "vilacajoias"), checkoutModo: s.checkoutModo || "teste", descontoPix: s.descontoPix || 0,
          empresa: s.empresa || null, garantiaDias: Number(s.garantiaDias || 0) || null,
          enderecos: (ctx.config?.lojas || []).filter((l: any) => (s.lojasAtivas || []).includes(l.id) && l.endereco)
            .map((l: any) => ({ nome: lojaNomePublico(l), endereco: `${nomeBonito(l.endereco)}, ${l.numero}${l.complemento ? " · " + nomeBonito(l.complemento) : ""}`, bairro: nomeBonito(l.bairro || ""), cidade: l.cidade })) },
        categorias: cats,
      }, 200, 60);
    }

    if (op === "catalogo") {
      const ctx = await contexto(body);
      let lista = ctx.produtos.filter((r: any) => visivel(r, ctx)).map((r: any) => publico(r, ctx));
      if (body.categoria) lista = lista.filter((p: any) => p.categoriaSlug === body.categoria);
      if (body.metal) lista = lista.filter((p: any) => slugify(p.metal) === slugify(body.metal));
      if (body.condicao) lista = lista.filter((p: any) => slugify(p.condicao) === slugify(body.condicao));
      if (body.destaque) lista = lista.filter((p: any) => p.destaque);
      if (body.lancamento) lista = lista.filter((p: any) => p.lancamento);
      if (body.busca) {
        const q = slugify(body.busca).split("-").filter(Boolean);
        lista = lista.filter((p: any) => { const h = slugify(p.nome + " " + p.categoria + " " + p.metal + " " + p.condicao); return q.every((t) => h.includes(t)); });
      }
      if (body.min) lista = lista.filter((p: any) => p.preco >= Number(body.min));
      if (body.max) lista = lista.filter((p: any) => p.preco <= Number(body.max));
      const ord = body.ordem || "relevancia";
      lista.sort((a: any, b: any) =>
        ord === "menor" ? a.preco - b.preco : ord === "maior" ? b.preco - a.preco : ord === "novos" ? String(b.criado).localeCompare(String(a.criado)) :
        (Number(b.disponivel) - Number(a.disponivel)) || (Number(!!b.foto) - Number(!!a.foto)) || (b.ordem - a.ordem) || (Number(b.destaque) - Number(a.destaque)) || (b.preco - a.preco));
      const total = lista.length;
      const off = Number(body.offset || 0), lim = Math.min(Number(body.limit || 24), 96);
      const metais = [...new Set(lista.map((p: any) => p.metal).filter(Boolean))];
      const condicoes = [...new Set(lista.map((p: any) => p.condicao).filter(Boolean))];
      return json({ total, metais, condicoes, produtos: lista.slice(off, off + lim) }, 200, 60);
    }

    if (op === "produto") {
      const ctx = await contexto(body);
      const row = ctx.produtos.find((r: any) => visivel(r, ctx) && (publico(r, ctx).slug === body.slug || r.id === body.id));
      if (!row) return json({ erro: "Produto não encontrado" }, 404);
      const prod = publico(row, ctx, true);
      const rel = ctx.produtos.filter((r: any) => visivel(r, ctx) && r.id !== row.id && r.payload.categoriaId === row.payload.categoriaId)
        .map((r: any) => publico(r, ctx)).filter((p: any) => p.disponivel && p.foto).slice(0, 8);
      return json({ produto: prod, relacionados: rel }, 200, 60);
    }

    if (op === "frete") {
      const ctx = await contexto(body);
      const cep = onlyDigits(body.cep);
      if (cep.length !== 8) return json({ erro: "CEP inválido. Digite os 8 números." }, 400);
      return json({ uf: cepParaUF(cep), ...calcFrete(ctx, Number(body.subtotal || 0), cep) });
    }

    if (op === "cupom") {
      const ctx = await contexto(body, true);
      const c = ctx.site.cupomPrimeiraCompra;
      const cod = String(body.codigo || "").trim().toUpperCase();
      const lista = [...(ctx.site.cupons || []), ...(c ? [c] : [])].filter((x: any) => x.ativo !== false);
      const cup = lista.find((x: any) => String(x.codigo).toUpperCase() === cod);
      if (!cup) return json({ erro: "Cupom não encontrado ou expirado." }, 404);
      return json({ codigo: cup.codigo, percentual: Number(cup.percentual || 0), valor: Number(cup.valor || 0), primeiraCompra: cup === c });
    }

    if (op === "criarPedido") {
      const ctx = await contexto(body, true);
      const cli = body.cliente || {};
      const end = body.endereco || {};
      const erros: string[] = [];
      if (!cli.nome || String(cli.nome).trim().split(" ").length < 2) erros.push("Informe nome e sobrenome.");
      if (onlyDigits(cli.cpf).length !== 11) erros.push("CPF inválido.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cli.email || "")) erros.push("E-mail inválido.");
      if (onlyDigits(cli.telefone).length < 10) erros.push("Telefone com DDD inválido.");
      if (onlyDigits(end.cep).length !== 8 || !end.rua || !end.numero || !end.cidade || !end.uf) erros.push("Endereço de entrega incompleto.");
      const itensIn = Array.isArray(body.itens) ? body.itens.slice(0, 50) : [];
      if (!itensIn.length) erros.push("Carrinho vazio.");
      if (erros.length) return json({ erro: erros.join(" ") }, 400);

      const ativas: string[] = ctx.site.lojasAtivas || [];
      const porLoja: Record<string, any[]> = {};
      for (const it of itensIn) {
        const row = ctx.produtos.find((r: any) => r.id === it.id && visivel(r, ctx));
        if (!row) return json({ erro: "Um produto do carrinho não está mais disponível." }, 409);
        const pub = publico(row, ctx, true);
        const qtd = Math.max(1, Math.min(Number(it.qtd || 1), 10));
        const lojaId = lojaDoProduto(row.payload, ativas);
        const est = Number((row.payload.estoquePorLoja || {})[lojaId] || 0);
        if (!pub.sobEncomenda && est < qtd) return json({ erro: `Estoque insuficiente de ${pub.nome}.` }, 409);
        (porLoja[lojaId] ||= []).push({
          produtoId: row.id, codigo: row.payload.codigoInterno || "", nome: pub.nome, qtd, preco: pub.preco,
          total: fmt(pub.preco * qtd), aro: it.aro || null, personalizacao: String(it.personalizacao || "").slice(0, 120) || null,
          foto: pub.foto, sobEncomenda: pub.sobEncomenda, condicao: pub.condicao || null,
        });
      }
      const subtotal = fmt(Object.values(porLoja).flat().reduce((a, i: any) => a + i.total, 0));
      let pctDesc = 0, cupomAplicado = null;
      if (body.cupom) {
        const c = ctx.site.cupomPrimeiraCompra;
        const cod = String(body.cupom).trim().toUpperCase();
        const lista = [...(ctx.site.cupons || []), ...(c ? [c] : [])].filter((x: any) => x.ativo !== false);
        const cup = lista.find((x: any) => String(x.codigo).toUpperCase() === cod);
        if (cup) {
          let ok = true;
          if (cup === c) {
            const { count } = await sb.from("site_pedidos").select("id", { count: "exact", head: true })
              .eq("cliente->>cpf", onlyDigits(cli.cpf)).not("status", "in", "(cancelado,aguardando_pagamento)");
            ok = !count;
          }
          if (ok) { pctDesc = Number(cup.percentual || 0) / 100; cupomAplicado = cup.codigo; }
        }
      }
      const frete = calcFrete(ctx, subtotal * (1 - pctDesc), end.cep);
      const grupo = crypto.randomUUID();
      const token = crypto.randomUUID().replace(/-/g, "");
      const metodo = ["pix", "cartao", "boleto"].includes(body.pagamento?.metodo) ? body.pagamento.metodo : "pix";
      const parcelas = metodo === "cartao" ? Math.max(1, Math.min(Number(body.pagamento?.parcelas || 1), Number(ctx.site.parcelasMax || 12))) : 1;
      const linhas = Object.entries(porLoja).map(([lojaId, itens]) => {
        const sub = fmt(itens.reduce((a, i: any) => a + i.total, 0));
        const desc = fmt(sub * pctDesc);
        const fr = fmt(subtotal ? frete.valor * (sub / subtotal) : 0);
        return {
          grupo, token, loja_id: lojaId, status: "aguardando_pagamento",
          cliente: { nome: String(cli.nome).trim(), cpf: onlyDigits(cli.cpf), email: String(cli.email).trim().toLowerCase(), telefone: onlyDigits(cli.telefone), nascimento: cli.nascimento || null, aceitaNovidades: !!cli.aceitaNovidades },
          itens, subtotal: sub, desconto: desc, frete: fr, total: fmt(sub - desc + fr),
          pagamento: { metodo, parcelas, modo: ctx.site.checkoutModo || "teste", gateway: "vindi", cupom: cupomAplicado, canal: ctx.canal },
          envio: { ...end, cep: onlyDigits(end.cep), servico: frete.nome, prazo: frete.prazo },
          historico: [{ em: new Date().toISOString(), status: "aguardando_pagamento", obs: ctx.canal === "reforma" ? "Pedido criado no site Reforma Joias" : "Pedido criado no site" }],
        };
      });
      const { data, error } = await sb.from("site_pedidos").insert(linhas).select("id,numero,loja_id,total");
      if (error) throw error;
      return json({
        grupo, token, modo: ctx.site.checkoutModo || "teste",
        pedidos: data!.map((d: any) => ({ numero: d.numero, loja: lojaNomePublico({ id: d.loja_id }), total: d.total })),
        total: fmt(data!.reduce((a: number, d: any) => a + Number(d.total), 0)),
      });
    }

    if (op === "pedido") {
      const { data } = await sb.from("site_pedidos").select("numero,loja_id,status,itens,subtotal,desconto,frete,total,pagamento,envio,created_at,token,historico")
        .eq("grupo", body.grupo).order("numero");
      if (!data?.length || !body.token || data[0].token !== body.token) return json({ erro: "Pedido não encontrado" }, 404);
      return json({ pedidos: data.map((d: any) => ({ ...d, token: undefined, loja: lojaNomePublico({ id: d.loja_id }), envio: { cidade: d.envio.cidade, uf: d.envio.uf, servico: d.envio.servico, prazo: d.envio.prazo, rastreio: d.envio.rastreio || null } })) });
    }

    return json({ erro: "op desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ erro: "Falha temporária. Tente de novo em instantes." }, 500);
  }
});
