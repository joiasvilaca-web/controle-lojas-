// Páginas de produto (/p/...) e de categoria (/c/...) já montadas no servidor.
// O site continua sendo o mesmo app em JS; isto só entrega o HTML inicial com título,
// descrição, foto (prévia no WhatsApp/Instagram), dados estruturados (schema.org) e o
// conteúdo da página, para buscadores e assistentes que não executam JavaScript.
// Qualquer falha devolve o index.html original: a página nunca fica pior do que antes.
const fs = require("fs");
const path = require("path");

const CFG = {
  canal: "reforma",
  base: "https://controle-lojas-rho.vercel.app",
  nome: "Reforma Joias",
  sufixoTitulo: " · Reforma Joias",
  condicaoPadrao: "https://schema.org/UsedCondition",
};
const API = "https://wxiokmqnjtgbejgoepch.supabase.co/functions/v1/site-public";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const semTags = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const corta = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);
// a descrição vem do painel em HTML simples; tira o que não é texto
const limpaHtml = (h) => String(h || "").replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "").replace(/\son\w+="[^"]*"/gi, "").replace(/\son\w+='[^']*'/gi, "").replace(/javascript:/gi, "");
const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const plural = (n) => ({ "Anel": "Anéis", "Pingente": "Pingentes", "Pulseira": "Pulseiras", "Relógio": "Relógios", "Cordão": "Cordões", "Brinco": "Brincos" }[n] || n);

let MODELO = null;
function modelo() {
  if (MODELO) return MODELO;
  for (const p of [path.join(process.cwd(), "index.html"), path.join(__dirname, "..", "index.html")]) {
    try { MODELO = fs.readFileSync(p, "utf8"); return MODELO; } catch (_) {}
  }
  throw new Error("index.html não encontrado");
}

async function api(op, dados) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, canal: CFG.canal, ...dados }), signal: ctl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("site-public " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

function condicaoSchema(c) {
  if (!c) return CFG.condicaoPadrao;
  if (/reformad|restaurad/i.test(c)) return "https://schema.org/RefurbishedCondition";
  if (/usad|antig|seminov/i.test(c)) return "https://schema.org/UsedCondition";
  return CFG.condicaoPadrao;
}

function montar(html, { titulo, descricao, url, imagem, tipoOg, blocos, corpo, status }) {
  let h = html;
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(titulo)}</title>`);
  h = h.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(descricao)}">`);
  h = h.replace(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${tipoOg || "website"}">`);
  h = h.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(titulo)}">`);
  h = h.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(descricao)}">`);
  h = h.replace(/\s*<link rel="canonical"[^>]*>/, "").replace(/\s*<meta property="og:url"[^>]*>/, "").replace(/\s*<meta property="og:image"[^>]*>/, "");
  const extra = [
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    imagem ? `<meta property="og:image" content="${esc(imagem)}">` : "",
    `<meta name="twitter:card" content="${imagem ? "summary_large_image" : "summary"}">`,
    ...(blocos || []).map(jsonLd),
  ].filter(Boolean).join("\n");
  h = h.replace("</head>", `${extra}\n</head>`);
  if (corpo) h = h.replace(/<main id="conteudo" tabindex="-1"><\/main>/, `<main id="conteudo" tabindex="-1">${corpo}</main>`);
  return { html: h, status: status || 200 };
}

async function paginaProduto(html, slug) {
  const r = await api("produto", { slug });
  if (!r || !r.produto) return { html: html.replace("<head>", '<head>\n<meta name="robots" content="noindex">'), status: 404 };
  const p = r.produto;
  const url = `${CFG.base}/p/${encodeURIComponent(p.slug)}`;
  const texto = semTags(p.descricao);
  const descricao = corta(p.seoDescricao || [p.nome + (p.metal ? " em " + p.metal : "") + ".", p.condicao ? `Peça ${p.condicao.toLowerCase()}.` : "", texto].filter(Boolean).join(" "), 155);
  const titulo = p.seoTitulo ? corta(p.seoTitulo, 70) : corta(p.nome, 55) + CFG.sufixoTitulo; // título escrito no painel vale como está
  const disponibilidade = p.disponivel ? (p.sobEncomenda ? "https://schema.org/PreOrder" : "https://schema.org/InStock") : "https://schema.org/OutOfStock";
  const produto = {
    "@context": "https://schema.org", "@type": "Product", name: p.nome, url,
    image: (p.fotos || []).slice(0, 6), description: corta(texto || descricao, 5000),
    ...(p.codigo ? { sku: p.codigo } : {}), ...(p.marca ? { brand: { "@type": "Brand", name: p.marca } } : {}),
    ...(p.categoria ? { category: p.categoria } : {}), ...(p.metal ? { material: p.metal } : {}),
    offers: { "@type": "Offer", url, priceCurrency: "BRL", price: Number(p.preco).toFixed(2), availability: disponibilidade,
      itemCondition: condicaoSchema(p.condicao), seller: { "@type": "Organization", name: (p.loja && p.loja.nome) || CFG.nome } },
  };
  const trilha = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Início", item: CFG.base + "/" },
    ...(p.categoriaSlug ? [{ "@type": "ListItem", position: 2, name: plural(p.categoria), item: `${CFG.base}/c/${p.categoriaSlug}` }] : []),
    { "@type": "ListItem", position: p.categoriaSlug ? 3 : 2, name: p.nome, item: url },
  ] };
  const rel = (r.relacionados || []).slice(0, 8);
  const corpo = `<div class="caixa"><article class="produto-ssr">
    <p class="trilha"><a href="/">Início</a>${p.categoriaSlug ? ` / <a href="/c/${esc(p.categoriaSlug)}">${esc(plural(p.categoria))}</a>` : ""} / ${esc(p.nome)}</p>
    <h1>${esc(p.nome)}</h1>
    ${p.foto ? `<img src="${esc(p.foto)}" alt="${esc(p.nome)}" width="600" height="600" style="max-width:min(600px,100%);height:auto">` : ""}
    <p>${p.condicao ? `${esc(p.condicao)} · ` : ""}${p.metal ? `${esc(p.metal)} · ` : ""}${brl(p.preco)}${p.disponivel ? "" : " · Indisponível"}</p>
    ${p.estado ? `<p>Estado de conservação: ${esc(p.estado)}</p>` : ""}
    ${p.historia ? `<p>${esc(p.historia)}</p>` : ""}
    ${p.descricao ? `<div>${limpaHtml(p.descricao)}</div>` : ""}
    ${rel.length ? `<h2>Veja também</h2><ul>${rel.map((x) => `<li><a href="/p/${esc(x.slug)}">${esc(x.nome)}</a> · ${brl(x.preco)}</li>`).join("")}</ul>` : ""}
  </article></div>`;
  return montar(html, { titulo, descricao, url, imagem: p.foto, tipoOg: "product", blocos: [produto, trilha], corpo });
}

async function paginaCategoria(html, slug) {
  const ini = await api("init", {});
  const cat = ini && (ini.categorias || []).find((c) => c.slug === slug);
  if (!cat) return { html: html.replace("<head>", '<head>\n<meta name="robots" content="noindex">'), status: 404 };
  const lista = await api("catalogo", { categoria: slug, limit: 48 });
  const prods = (lista && lista.produtos) || [];
  const nome = plural(cat.nome);
  const url = `${CFG.base}/c/${encodeURIComponent(slug)}`;
  const titulo = nome + CFG.sufixoTitulo;
  const descricao = corta(`${nome} da ${CFG.nome}: ${lista ? lista.total : prods.length} ${(lista && lista.total) === 1 ? "peça" : "peças"}${lista && lista.metais && lista.metais.length ? " em " + lista.metais.join(", ") : ""}. Juiz de Fora, MG, com envio para todo o Brasil.`, 155);
  const itens = { "@context": "https://schema.org", "@type": "ItemList", name: nome, numberOfItems: lista ? lista.total : prods.length,
    itemListElement: prods.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: `${CFG.base}/p/${x.slug}`, name: x.nome })) };
  const corpo = `<div class="caixa"><p class="trilha"><a href="/">Início</a> / ${esc(nome)}</p><h1>${esc(nome)}</h1>
    <ul>${prods.map((x) => `<li><a href="/p/${esc(x.slug)}">${esc(x.nome)}</a>${x.metal ? ` · ${esc(x.metal)}` : ""}${x.condicao ? ` · ${esc(x.condicao)}` : ""} · ${brl(x.preco)}</li>`).join("")}</ul></div>`;
  return montar(html, { titulo, descricao, url, imagem: prods.find((x) => x.foto)?.foto, blocos: [itens], corpo });
}

module.exports = async (req, res) => {
  let html;
  try { html = modelo(); } catch (e) { res.statusCode = 500; return res.end("Erro"); }
  const u = new URL(req.url, "http://x");
  const tipo = u.searchParams.get("tipo");
  const slug = String(u.searchParams.get("slug") || "").replace(/[^\w-]/g, "").slice(0, 160);
  let out = { html, status: 200 };
  try {
    if (tipo === "p" && slug) out = await paginaProduto(html, slug);
    else if (tipo === "c" && slug) out = await paginaCategoria(html, slug);
  } catch (e) {
    console.error("pagina", tipo, slug, e && e.message);
    out = { html, status: 200, falhou: true }; // falhou: entrega o app normal, sem guardar em cache
  }
  res.statusCode = out.status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", out.falhou ? "no-store" : out.status === 200 ? "public, max-age=0, s-maxage=600, stale-while-revalidate=86400" : "public, max-age=0, s-maxage=60");
  res.end(out.html);
};
