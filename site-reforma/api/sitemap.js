// /sitemap.xml gerado a partir do catálogo publicado (só o que aparece no site).
const CFG = {
  canal: "reforma",
  base: "https://controle-lojas-rho.vercel.app",
  paginas: ["/recem-chegadas", "/historia", "/garantia", "/devolucao", "/pecas-usadas", "/envio", "/privacidade"],
};
const API = "https://wxiokmqnjtgbejgoepch.supabase.co/functions/v1/site-public";

async function api(op, dados) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, canal: CFG.canal, ...dados }) });
  if (!r.ok) throw new Error("site-public " + r.status);
  return r.json();
}
const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

module.exports = async (req, res) => {
  try {
    const ini = await api("init", {});
    const produtos = [];
    for (let off = 0; off < 5000; off += 96) {
      const r = await api("catalogo", { limit: 96, offset: off, ordem: "novos" });
      produtos.push(...(r.produtos || []));
      if (produtos.length >= r.total || !(r.produtos || []).length) break;
    }
    const urls = [
      { loc: CFG.base + "/" },
      ...(ini.categorias || []).map((c) => ({ loc: `${CFG.base}/c/${c.slug}` })),
      ...CFG.paginas.map((p) => ({ loc: CFG.base + p })),
      ...produtos.filter((p) => p.disponivel).map((p) => ({ loc: `${CFG.base}/p/${encodeURIComponent(p.slug)}`, lastmod: String(p.criado || "").slice(0, 10) })),
    ];
    const corpo = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${xml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
    res.end(corpo);
  } catch (e) {
    console.error("sitemap", e && e.message);
    res.statusCode = 503;
    res.setHeader("Retry-After", "600");
    res.end("Sitemap temporariamente indisponível");
  }
};
