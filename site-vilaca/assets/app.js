/* Vilaça Joias — loja online (vanilla JS, sem build) */
(() => {
"use strict";
const API = "https://wxiokmqnjtgbejgoepch.supabase.co/functions/v1/site-public";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const so = (s) => String(s || "").replace(/\D/g, "");
const main = $("#conteudo");
let SITE = null, CATS = [];

// ---------- armazenamento seguro ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- API ----------
const memo = new Map();
async function api(op, dados = {}, { cache = true } = {}) {
  const chave = op + JSON.stringify(dados);
  if (cache && memo.has(chave)) return memo.get(chave);
  const p = fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...dados }) })
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || "Não foi possível carregar. Verifique sua conexão."); return j; });
  if (cache) { memo.set(chave, p); p.catch(() => memo.delete(chave)); }
  return p;
}

// ---------- sacola ----------
const sacola = {
  itens: store.get("vj_sacola", []),
  salvar() { store.set("vj_sacola", this.itens); atualizarContador(); },
  chave(i) { return [i.id, i.aro || "", i.personalizacao || ""].join("|"); },
  add(prod, opc = {}) {
    const novo = { id: prod.id, slug: prod.slug, nome: prod.nome, preco: prod.preco, foto: prod.foto, metal: prod.metal, aro: opc.aro || null, personalizacao: opc.personalizacao || null, qtd: 1, loja: prod.loja?.nome || "" };
    const ex = this.itens.find((i) => this.chave(i) === this.chave(novo));
    if (ex) ex.qtd = Math.min(ex.qtd + 1, 10); else this.itens.push(novo);
    this.salvar();
  },
  qtd(idx, d) { const i = this.itens[idx]; if (!i) return; i.qtd += d; if (i.qtd < 1) this.itens.splice(idx, 1); this.salvar(); },
  remover(idx) { this.itens.splice(idx, 1); this.salvar(); },
  limpar() { this.itens = []; this.salvar(); },
  subtotal() { return this.itens.reduce((a, i) => a + i.preco * i.qtd, 0); },
  total() { return this.itens.reduce((a, i) => a + i.qtd, 0); },
};
function atualizarContador() {
  const n = sacola.total(), el = $("#sacolaQtd");
  el.textContent = n; el.hidden = !n;
  $("#btnSacola").setAttribute("aria-label", n ? `Abrir sacola, ${n} ${n > 1 ? "itens" : "item"}` : "Abrir sacola");
}

// ---------- utilidades de UI ----------
let avisoT;
function aviso(msg) { const a = $("#aviso"); a.textContent = msg; a.hidden = false; clearTimeout(avisoT); avisoT = setTimeout(() => (a.hidden = true), 3200); }
function parcelas(preco) {
  const max = SITE?.parcelasMax || 12, min = SITE?.parcelaMinima || 50;
  const n = Math.max(1, Math.min(max, Math.floor(preco / min)));
  return n > 1 ? `${n}x de ${brl(preco / n)} sem juros` : "";
}
function metalHtml(m) {
  if (!m) return "";
  const cls = /prata/i.test(m) ? "prata" : /ouro/i.test(m) ? "ouro" : "";
  return `<span class="metal ${cls}"><i aria-hidden="true"></i>${esc(m)}</span>`;
}
function cardHtml(p) {
  const tem2 = !!p.foto2;
  const foto = p.foto
    ? `<img class="f1 ${tem2 ? "tem2" : ""}" src="${esc(p.foto)}" alt="${esc(p.nome)}" loading="lazy" decoding="async">${tem2 ? `<img class="f2" src="${esc(p.foto2)}" alt="" loading="lazy" decoding="async">` : ""}`
    : `<span class="card-sem">Vilaça</span>`;
  const selo = !p.disponivel ? `<span class="selo">Esgotado</span>` : p.sobEncomenda ? `<span class="selo">Sob encomenda</span>` : p.lancamento ? `<span class="selo">Novo</span>` : "";
  const parc = parcelas(p.preco);
  return `<a class="card ${p.disponivel ? "" : "esgotado"}" href="/p/${esc(p.slug)}" data-link>
    <div class="card-foto">${foto}${selo}</div>
    <h3 class="card-nome">${esc(p.nome)}</h3>
    <p class="card-preco">${p.precoDe ? `<s>${brl(p.precoDe)}</s>` : ""}${brl(p.preco)}</p>
    ${parc ? `<p class="card-parc">ou ${parc}</p>` : ""}
  </a>`;
}
function esqueletoGrade(n = 8) {
  return `<div class="grade" aria-hidden="true">${Array.from({ length: n }, () => `<div class="card"><div class="card-foto esqueleto"></div><div class="esqueleto" style="height:14px;width:70%"></div><div class="esqueleto" style="height:14px;width:40%"></div></div>`).join("")}</div>`;
}
function erroHtml(e, tentar = true) {
  return `<div class="vazio"><h2>Algo não carregou</h2><p>${esc(e.message || e)}</p>${tentar ? `<p><button class="botao claro" onclick="location.reload()">Carregar de novo</button></p>` : ""}</div>`;
}
function titulo(t, desc) {
  document.title = t ? `${t} · Vilaça Joias` : "Vilaça Joias · Joias em ouro 18k e prata 925";
  if (desc) $('meta[name="description"]').setAttribute("content", desc);
}

// ---------- roteador ----------
const rotas = [
  [/^\/$/, paginaInicio],
  [/^\/c\/([\w-]+)$/, paginaCategoria],
  [/^\/busca$/, paginaBusca],
  [/^\/novidades$/, () => paginaLista({ titulo: "Novidades", filtro: { lancamento: 1 }, sub: "As peças que acabaram de sair da bancada." })],
  [/^\/p\/([\w-]+)$/, paginaProduto],
  [/^\/finalizar$/, paginaCheckout],
  [/^\/pedido\/([\w-]+)$/, paginaPedido],
  [/^\/(garantia|trocas|envio|sobre|privacidade)$/, paginaTexto],
];
async function navegar(url, empurrar = true) {
  if (empurrar) history.pushState({}, "", url);
  fecharMenus();
  const path = location.pathname.replace(/\/+$/, "") || "/";
  for (const [re, fn] of rotas) {
    const m = path.match(re);
    if (m) {
      window.scrollTo(0, 0);
      $$(".nav a").forEach((a) => (a.getAttribute("href") === path ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
      try { await fn(...m.slice(1)); } catch (e) { main.innerHTML = `<div class="caixa">${erroHtml(e)}</div>`; }
      main.focus({ preventScroll: true });
      return;
    }
  }
  titulo("Página não encontrada");
  main.innerHTML = `<div class="caixa vazio"><h2>Página não encontrada</h2><p>O endereço pode ter mudado.</p><p><a class="botao" href="/" data-link>Ver as joias</a></p></div>`;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
  e.preventDefault(); navegar(a.getAttribute("href"));
});
window.addEventListener("popstate", () => navegar(location.pathname + location.search, false));

// ---------- casca: faixa, menu, rodapé ----------
function montarCasca() {
  const faixa = $("#faixa"), msgs = SITE.faixa || [];
  faixa.innerHTML = msgs.map((m, i) => `<span class="${i === 0 ? "ativa" : ""}">${esc(m)}</span>`).join("");
  if (msgs.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let i = 0; setInterval(() => { const s = $$("span", faixa); s[i].classList.remove("ativa"); i = (i + 1) % s.length; s[i].classList.add("ativa"); }, 4500);
  }
  $("#nav").innerHTML = CATS.map((c) => `<a href="/c/${c.slug}" data-link>${esc(plural(c.nome))}</a>`).join("") + `<a href="/novidades" data-link>Novidades</a>`;
  const zap = SITE.whatsapp;
  const ends = (SITE.enderecos || []).map((e) => `<li>${esc(e.nome)}<br><small>${esc(e.endereco)}${e.bairro ? ", " + esc(e.bairro) : ""} · ${esc(e.cidade)}</small></li>`).join("");
  $("#rodape").innerHTML = `<div class="caixa"><div class="rodape-grade">
    <div><span class="marca-nome">VILAÇA</span><p style="max-width:32ch;margin-top:16px">Joalheria e ourivesaria em Juiz de Fora. Peças em ouro 18k e prata 925, ajuste de aro e polimento por nossa própria oficina.</p>
      <p><a href="https://instagram.com/${esc(SITE.instagram)}" target="_blank" rel="noopener">Instagram @${esc(SITE.instagram)}</a></p></div>
    <div><h3>Joias</h3><ul>${CATS.map((c) => `<li><a href="/c/${c.slug}" data-link>${esc(plural(c.nome))}</a></li>`).join("")}</ul></div>
    <div><h3>Ajuda</h3><ul><li><a href="/garantia" data-link>Garantia</a></li><li><a href="/trocas" data-link>Trocas e devoluções</a></li><li><a href="/envio" data-link>Envio e prazos</a></li><li><a href="/sobre" data-link>Sobre a Vilaça</a></li><li><a href="/privacidade" data-link>Privacidade</a></li></ul></div>
    <div><h3>Atendimento</h3><ul><li><a href="https://wa.me/${esc(zap)}" target="_blank" rel="noopener">WhatsApp ${fmtTel(zap)}</a></li><li><a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a></li><li>Segunda a sábado, 9h30 às 18h</li></ul>
      ${ends ? `<h3 style="margin-top:22px">Lojas</h3><ul>${ends}</ul>` : ""}</div>
  </div>
  <div class="rodape-base"><span>Vilaça Joias, Juiz de Fora, MG. Pagamento por cartão, Pix e boleto.</span><span>Preços e condições válidos para compras no site.</span></div></div>`;
  const z = document.createElement("a");
  z.className = "zap-flutuante"; z.href = `https://wa.me/${zap}`; z.target = "_blank"; z.rel = "noopener"; z.setAttribute("aria-label", "Falar no WhatsApp");
  z.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.6 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.4z"/></svg>`;
  document.body.appendChild(z);
}
const plural = (n) => ({ "Anel": "Anéis", "Pingente": "Pingentes", "Pulseira": "Pulseiras", "Relógio": "Relógios", "Cordão": "Cordões", "Brinco": "Brincos" }[n] || n);
const fmtTel = (t) => { const d = so(t).replace(/^55/, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : t; };

function fecharMenus() { $("#nav").classList.remove("aberto"); $("#btnMenu").setAttribute("aria-expanded", "false"); }
$("#btnMenu").addEventListener("click", () => { const n = $("#nav"); const ab = n.classList.toggle("aberto"); $("#btnMenu").setAttribute("aria-expanded", String(ab)); });
$("#btnBusca").addEventListener("click", () => { const f = $("#formBusca"); f.hidden = !f.hidden; if (!f.hidden) $("#campoBusca").focus(); });
$("#formBusca").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#campoBusca").value.trim(); if (q) { $("#formBusca").hidden = true; navegar("/busca?q=" + encodeURIComponent(q)); } });

// ---------- páginas ----------
async function paginaInicio() {
  titulo("");
  main.innerHTML = `<section class="abertura"><div class="abertura-grade"><div class="abertura-texto"><div class="esqueleto" style="height:180px"></div></div><div class="esqueleto"></div></div></section><section class="secao"><div class="caixa">${esqueletoGrade(8)}</div></section>`;
  const [dest, novos] = await Promise.all([api("catalogo", { destaque: 1, limit: 12 }), api("catalogo", { ordem: "novos", limit: 8 })]);
  const todos = [...new Map([...dest.produtos, ...novos.produtos].map((p) => [p.id, p])).values()];
  const comFoto = todos.filter((p) => p.foto && p.disponivel);
  const heroP = comFoto[0], edP = comFoto.find((p) => p !== heroP && p.categoriaSlug !== heroP?.categoriaSlug) || comFoto[1];
  const h = SITE.hero || {};
  const banner = (SITE.banners || []).find((b) => b && b.imagem);
  const icone = { frete: `<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>`, cartao: `<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M3 10h18M7 15h4"/>`, aro: `<circle cx="12" cy="13" r="6.5"/><path d="m9.5 4 2.5 2.5L14.5 4"/>`, oficina: `<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>` };
  const benef = [
    ["frete", SITE.freteGratisAcima ? `Frete grátis acima de ${brl(SITE.freteGratisAcima).replace(",00", "")}` : "Envio segurado"],
    ["cartao", `Até ${SITE.parcelasMax || 12}x sem juros`],
    ["aro", "Ajuste de aro sem custo"],
    ["oficina", "Garantia e ourivesaria própria"],
  ];
  const abertura = banner
    ? `<a class="banner" href="${esc(banner.link || "/novidades")}" data-link><img src="${esc(banner.imagem)}" alt="${esc(banner.titulo || "Vilaça Joias")}"></a>`
    : `<section class="abertura"><div class="abertura-grade">
      <div class="abertura-texto">
        <p class="rotulo">${esc(h.rotulo || "Ouro 18k · Prata 925")}</p>
        <h1>${h.titulo ? esc(h.titulo) : `Joias para<br><em>atravessar gerações</em>`}</h1>
        <p>${esc(h.texto || "Feitas e cuidadas pela nossa ourivesaria em Juiz de Fora: ajuste de aro, polimento e reparos por quem conhece cada peça.")}</p>
        <div class="abertura-acoes"><a class="botao" href="/novidades" data-link>Ver novidades</a><a class="botao claro" href="/c/${CATS[0]?.slug || ""}" data-link>${esc(plural(CATS[0]?.nome || "Joias"))}</a></div>
      </div>
      ${heroP ? `<a class="abertura-foto" href="/p/${esc(heroP.slug)}" data-link><img src="${esc(heroP.foto)}" alt="${esc(heroP.nome)}"><span class="abertura-legenda"><b>${esc(heroP.nome)}</b><span>${brl(heroP.preco)}</span></span></a>` : `<div></div>`}
    </div></section>`;
  const catFoto = {};
  for (const p of comFoto) if (p.categoriaSlug && !catFoto[p.categoriaSlug]) catFoto[p.categoriaSlug] = p.foto;
  main.innerHTML = `${abertura}
  <section class="beneficios" aria-label="Vantagens"><ul>${benef.map(([i, t]) => `<li><svg viewBox="0 0 24 24" aria-hidden="true">${icone[i]}</svg>${esc(t)}</li>`).join("")}</ul></section>
  <section class="secao"><div class="caixa">
    <div class="cabeca-centro"><p class="rotulo">Navegue por categoria</p><h2 class="titulo-secao">Encontre a sua joia</h2></div>
    <div class="cats">${CATS.map((c) => `<a class="cat" href="/c/${c.slug}" data-link><span class="cat-foto" data-cat="${esc(c.slug)}">${catFoto[c.slug] ? `<img src="${esc(catFoto[c.slug])}" alt="" loading="lazy">` : ""}</span><b>${esc(plural(c.nome))}</b></a>`).join("")}</div>
  </div></section>
  <section class="secao" style="padding-top:0"><div class="caixa">
    <div class="cabeca-centro"><p class="rotulo">Mais desejadas</p><h2 class="titulo-secao">Clássicos da Vilaça</h2></div>
    <div class="grade">${dest.produtos.filter((p) => p.foto).slice(0, 8).map(cardHtml).join("")}</div>
  </div></section>
  <section class="editorial">
    <div class="editorial-foto">${edP ? `<img src="${esc(edP.foto)}" alt="${esc(edP.nome)}" loading="lazy">` : ""}</div>
    <div class="editorial-texto">
      <p class="rotulo">Nossa oficina</p>
      <blockquote>Cada joia passa pela nossa bancada <em>antes de chegar até você.</em></blockquote>
      <ul>
        <li><b>Ajuste de aro sem custo</b><span>Aumentamos ou diminuímos até 3 números em até 1 ano após a compra.</span></li>
        <li><b>Polimento para sempre</b><span>Traga sua joia Vilaça quando quiser para devolver o brilho.</span></li>
        <li><b>Garantia de fabricação</b><span>Certificado de garantia e nota fiscal em todas as peças.</span></li>
      </ul>
      <p><a class="link" href="/sobre" data-link>Conheça a Vilaça</a></p>
    </div>
  </section>
  <section class="secao"><div class="caixa">
    <div class="cabeca-centro"><p class="rotulo">Recém-chegadas</p><h2 class="titulo-secao">Novidades</h2></div>
    <div class="grade">${novos.produtos.filter((p) => p.foto).slice(0, 8).map(cardHtml).join("")}</div>
    <div class="mais"><a class="botao claro" href="/novidades" data-link>Ver todas</a></div>
  </div></section>`;
  // categorias sem foto entre os destaques: busca 1 peça de cada
  CATS.filter((c) => !catFoto[c.slug]).forEach(async (c) => {
    try {
      const r = await api("catalogo", { categoria: c.slug, limit: 6 });
      const p = r.produtos.find((x) => x.foto);
      const el = document.querySelector(`.cat-foto[data-cat="${c.slug}"]`);
      if (p && el) el.innerHTML = `<img src="${esc(p.foto)}" alt="" loading="lazy">`;
    } catch {}
  });
}

async function paginaCategoria(slug) {
  const cat = CATS.find((c) => c.slug === slug);
  if (!cat) throw new Error("Categoria não encontrada.");
  return paginaLista({ titulo: plural(cat.nome), filtro: { categoria: slug }, trilha: true });
}
async function paginaBusca() {
  const q = new URLSearchParams(location.search).get("q") || "";
  $("#campoBusca").value = q;
  return paginaLista({ titulo: `Resultados para “${q}”`, filtro: { busca: q } });
}
async function paginaLista({ titulo: t, filtro, sub, trilha }) {
  titulo(t.replace(/[“”]/g, ""));
  const estado = { ...filtro, ordem: "relevancia", metal: "", offset: 0, limit: 24 };
  main.innerHTML = `<div class="caixa">
    ${trilha ? `<p class="trilha"><a href="/" data-link>Início</a> / ${esc(t)}</p>` : ""}
    <div class="lista-cabeca"><h1 class="titulo-secao">${esc(t)}</h1>${sub ? `<p class="sub-secao" style="margin:8px auto 0">${esc(sub)}</p>` : ""}</div>
    <div class="lista-topo"><div class="filtros" id="filtros"></div>
      <label class="sr" for="ordem">Ordenar</label>
      <select id="ordem"><option value="relevancia">Mais relevantes</option><option value="novos">Mais novos</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option></select></div>
    <div id="grade">${esqueletoGrade(8)}</div><div class="mais" id="mais"></div></div>`;
  let lista = [];
  async function carregar(reset) {
    if (reset) { estado.offset = 0; lista = []; $("#grade").innerHTML = esqueletoGrade(8); }
    const r = await api("catalogo", estado);
    lista = lista.concat(r.produtos);
    if (reset && !estado.metal) {
      $("#filtros").innerHTML = r.metais.length > 1 ? [`<button class="chip" aria-pressed="true" data-metal="">Todos</button>`, ...r.metais.map((m) => `<button class="chip" aria-pressed="false" data-metal="${esc(m)}">${metalHtml(m)}</button>`)].join("") : "";
    }
    $("#grade").innerHTML = lista.length ? `<div class="grade">${lista.map(cardHtml).join("")}</div>` : `<div class="vazio"><h2>Nenhuma joia encontrada</h2><p>Tente outra palavra ou fale com a gente no WhatsApp: fazemos peças sob encomenda.</p></div>`;
    const resta = r.total - lista.length;
    $("#mais").innerHTML = resta > 0 ? `<button class="botao claro" id="btnMais">Mostrar mais ${Math.min(resta, estado.limit)} de ${resta}</button>` : "";
    $("#btnMais")?.addEventListener("click", () => { estado.offset += estado.limit; carregar(false); });
  }
  $("#ordem").addEventListener("change", (e) => { estado.ordem = e.target.value; carregar(true); });
  $("#filtros").addEventListener("click", (e) => {
    const b = e.target.closest("[data-metal]"); if (!b) return;
    estado.metal = b.dataset.metal; $$("[data-metal]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); carregar(true);
  });
  await carregar(true);
}

async function paginaProduto(slug) {
  main.innerHTML = `<div class="caixa"><div class="produto"><div class="galeria-principal esqueleto"></div><div><div class="esqueleto" style="height:40px;margin-bottom:12px"></div><div class="esqueleto" style="height:200px"></div></div></div></div>`;
  const { produto: p, relacionados } = await api("produto", { slug });
  titulo(p.nome, p.seoDescricao || `${p.nome}${p.metal ? " em " + p.metal : ""}. ${parcelas(p.preco) || ""}`);
  const fotos = p.fotos.length ? p.fotos : [];
  const parc = parcelas(p.preco);
  const pixDesc = SITE.descontoPix ? ` ou ${brl(p.preco * (1 - SITE.descontoPix / 100))} no Pix` : "";
  const cat = CATS.find((c) => c.slug === p.categoriaSlug);
  main.innerHTML = `<div class="caixa">
    <p class="trilha"><a href="/" data-link>Início</a>${cat ? ` / <a href="/c/${cat.slug}" data-link>${esc(plural(cat.nome))}</a>` : ""} / ${esc(p.nome)}</p>
    <article class="produto">
      <div class="galeria">
        <div class="miniaturas" role="list">${fotos.length > 1 ? fotos.map((f, i) => `<button role="listitem" aria-label="Foto ${i + 1}" aria-current="${i === 0}" data-i="${i}"><img src="${esc(f)}" alt="" loading="lazy"></button>`).join("") : ""}</div>
        <div class="galeria-principal">${fotos[0] ? `<img id="fotoPrincipal" src="${esc(fotos[0])}" alt="${esc(p.nome)}">` : `<span class="card-sem">Foto em breve</span>`}</div>
      </div>
      <div class="info">
        ${metalHtml(p.metal)}
        <h1>${esc(p.nome)}</h1>
        <p class="preco">${p.precoDe ? `<s>${brl(p.precoDe)}</s>` : ""}${brl(p.preco)}</p>
        ${parc ? `<p class="parc">ou ${parc} no cartão</p>` : ""}
        ${pixDesc ? `<p class="pix">${pixDesc}</p>` : `<p class="pix"></p>`}
        ${p.numerosAro?.length ? `<div class="campo"><label id="lblAro">Número do aro</label><div class="aros" role="group" aria-labelledby="lblAro">${p.numerosAro.map((n) => `<button type="button" aria-pressed="false" data-aro="${esc(n)}">${esc(n)}</button>`).join("")}</div><p style="font-size:13.5px;color:var(--tinta-2);margin:8px 0 0">Não sabe seu número? Escolha o mais próximo: ajustamos até 3 números sem custo.</p></div>` : ""}
        ${p.personalizavel ? `<div class="campo"><label for="pers">Personalização (nome, letra ou data)</label><input id="pers" maxlength="40" placeholder="Ex.: Laura"></div>` : ""}
        <div class="compra">
          ${p.disponivel ? `<button class="botao largo" id="btnComprar">Adicionar à sacola</button>` : `<button class="botao largo" disabled>Esgotado</button>`}
          <a class="botao zap largo" target="_blank" rel="noopener" href="https://wa.me/${esc(SITE.whatsapp)}?text=${encodeURIComponent(`Olá! Tenho interesse no ${p.nome} (${location.origin}/p/${p.slug})`)}">Tirar dúvidas no WhatsApp</a>
        </div>
        ${p.sobEncomenda ? `<p class="modo-teste">Peça feita sob encomenda${p.prazoEncomenda ? `: fica pronta em ${esc(p.prazoEncomenda)}` : ""}.</p>` : ""}
        <div class="campo"><label for="cepProd">Calcular frete</label><div class="frete-calc"><input id="cepProd" inputmode="numeric" maxlength="9" placeholder="00000-000" value="${esc(store.get("vj_cep", ""))}"><button class="botao claro" id="btnFrete">Calcular</button></div><div class="frete-res" id="freteRes" aria-live="polite"></div></div>
        ${p.loja ? `<div class="vendido"><span>Vendido e enviado por <b>${esc(p.loja.nome)}</b>, ${esc(p.loja.cidade)}.</span>${p.peso ? `<span>Peso aproximado: ${String(p.peso).replace(".", ",")} g</span>` : ""}</div>` : ""}
        ${p.descricao ? `<div class="desc">${p.descricao}</div>` : ""}
        <ul class="garantias">
          <li><svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg><span>Certificado de garantia e nota fiscal</span></li>
          <li><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/></svg><span>Ajuste de aro até 3 números sem custo por 1 ano</span></li>
          <li><svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg><span>Envio segurado para todo o Brasil${SITE.freteGratisAcima ? `, grátis acima de ${brl(SITE.freteGratisAcima)}` : ""}</span></li>
          <li><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/></svg><span>7 dias para devolver compras feitas pelo site</span></li>
        </ul>
      </div>
    </article>
    ${relacionados.length ? `<section class="secao" style="padding-top:20px"><h2 class="titulo-secao" style="margin-bottom:24px">Combina com</h2><div class="grade">${relacionados.slice(0, 4).map(cardHtml).join("")}</div></section>` : ""}
  </div>`;
  // galeria
  $$(".miniaturas button").forEach((b) => b.addEventListener("click", () => {
    $("#fotoPrincipal").src = fotos[b.dataset.i];
    $$(".miniaturas button").forEach((x) => x.setAttribute("aria-current", String(x === b)));
  }));
  let aro = null;
  $$("[data-aro]").forEach((b) => b.addEventListener("click", () => { aro = b.dataset.aro; $$("[data-aro]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
  $("#btnComprar")?.addEventListener("click", () => {
    if (p.numerosAro?.length && !aro) { aviso("Escolha o número do aro."); $(".aros button")?.focus(); return; }
    sacola.add(p, { aro, personalizacao: $("#pers")?.value.trim() });
    abrirSacola();
  });
  const calcular = async () => {
    const cep = so($("#cepProd").value); const res = $("#freteRes");
    if (cep.length !== 8) { res.innerHTML = `<span style="color:var(--erro)">Digite os 8 números do CEP.</span>`; return; }
    store.set("vj_cep", cep); res.textContent = "Calculando…";
    try { const f = await api("frete", { cep, subtotal: p.preco }, { cache: false }); res.innerHTML = `<b>${f.valor ? brl(f.valor) : "Grátis"}</b> · ${esc(f.nome)} · ${esc(f.prazo)}`; }
    catch (e) { res.innerHTML = `<span style="color:var(--erro)">${esc(e.message)}</span>`; }
  };
  $("#btnFrete").addEventListener("click", calcular);
  $("#cepProd").addEventListener("keydown", (e) => { if (e.key === "Enter") calcular(); });
}

// ---------- sacola (gaveta) ----------
function abrirSacola() { renderSacola(); const g = $("#gaveta"); g.hidden = false; document.body.style.overflow = "hidden"; $(".gaveta-topo button").focus(); }
function fecharSacola() { $("#gaveta").hidden = true; document.body.style.overflow = ""; $("#btnSacola").focus(); }
$("#btnSacola").addEventListener("click", abrirSacola);
$("#gaveta").addEventListener("click", (e) => { if (e.target.closest("[data-fechar]")) fecharSacola(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#gaveta").hidden) fecharSacola(); });
function barraFrete(sub) {
  const lim = SITE.freteGratisAcima; if (!lim) return "";
  if (sub >= lim) return `<div class="barra-frete">Seu frete é grátis.<progress max="1" value="1"></progress></div>`;
  return `<div class="barra-frete">Faltam ${brl(lim - sub)} para frete grátis.<progress max="${lim}" value="${sub}"></progress></div>`;
}
function renderSacola() {
  const c = $("#sacolaCorpo");
  if (!sacola.itens.length) { c.innerHTML = `<div class="vazio"><h2>Sua sacola está vazia</h2><p>Escolha uma joia para começar.</p><p><a class="botao" href="/" data-link data-fechar>Ver as joias</a></p></div>`; return; }
  const sub = sacola.subtotal();
  c.innerHTML = sacola.itens.map((i, idx) => `<div class="item">
      ${i.foto ? `<img src="${esc(i.foto)}" alt="">` : `<span></span>`}
      <div><h3>${esc(i.nome)}</h3>${i.aro ? `<small>Aro ${esc(i.aro)}</small>` : ""}${i.personalizacao ? `<small>Personalização: ${esc(i.personalizacao)}</small>` : ""}
        <div class="qtd"><button aria-label="Diminuir" data-q="${idx}" data-d="-1">−</button><span>${i.qtd}</span><button aria-label="Aumentar" data-q="${idx}" data-d="1">+</button></div></div>
      <div><p class="valor">${brl(i.preco * i.qtd)}</p><button class="link" style="font-size:13px" data-rm="${idx}">Remover</button></div>
    </div>`).join("") + `<div class="resumo">${barraFrete(sub)}<div class="linha total"><span>Subtotal</span><span>${brl(sub)}</span></div>
      ${parcelas(sub) ? `<div class="linha" style="color:var(--tinta-2);font-size:14px"><span></span><span>ou ${parcelas(sub)}</span></div>` : ""}
      <a class="botao largo" href="/finalizar" data-link data-fechar>Finalizar compra</a>
      <button class="botao claro largo" data-fechar>Continuar comprando</button></div>`;
  $$("[data-q]", c).forEach((b) => b.addEventListener("click", () => { sacola.qtd(+b.dataset.q, +b.dataset.d); renderSacola(); }));
  $$("[data-rm]", c).forEach((b) => b.addEventListener("click", () => { sacola.remover(+b.dataset.rm); renderSacola(); }));
}

// ---------- checkout ----------
async function paginaCheckout() {
  titulo("Finalizar compra");
  if (!sacola.itens.length) { main.innerHTML = `<div class="caixa vazio"><h2>Sua sacola está vazia</h2><p><a class="botao" href="/" data-link>Ver as joias</a></p></div>`; return; }
  const dados = store.get("vj_cliente", {});
  main.innerHTML = `<div class="caixa"><h1 class="titulo-secao" style="margin-top:28px">Finalizar compra</h1>
  <form class="checkout" id="formCheckout" novalidate>
    <div>
      ${SITE.checkoutModo !== "producao" ? `<p class="modo-teste">Loja em fase de testes: o pedido é registrado, mas nenhuma cobrança é feita. Nossa equipe confirma pelo WhatsApp.</p>` : ""}
      <section class="etapa"><h2><span>1</span>Seus dados</h2>
        <div class="campo"><label for="nome">Nome completo</label><input id="nome" autocomplete="name" required value="${esc(dados.nome || "")}"></div>
        <div class="duas"><div class="campo"><label for="cpf">CPF</label><input id="cpf" inputmode="numeric" autocomplete="off" required value="${esc(dados.cpf || "")}"></div>
          <div class="campo"><label for="tel">Celular com DDD</label><input id="tel" inputmode="tel" autocomplete="tel" required value="${esc(dados.telefone || "")}"></div></div>
        <div class="campo"><label for="email">E-mail</label><input id="email" type="email" autocomplete="email" required value="${esc(dados.email || "")}"></div>
        <label class="opcao" style="border:0;padding:0"><input type="checkbox" id="novidades" ${dados.aceitaNovidades ? "checked" : ""}> Quero receber novidades e ofertas da Vilaça</label>
      </section>
      <section class="etapa"><h2><span>2</span>Entrega</h2>
        <div class="duas"><div class="campo"><label for="cep">CEP</label><input id="cep" inputmode="numeric" autocomplete="postal-code" required value="${esc(dados.cep || store.get("vj_cep", ""))}"></div><div></div></div>
        <div class="tres"><div class="campo"><label for="rua">Rua</label><input id="rua" autocomplete="address-line1" required value="${esc(dados.rua || "")}"></div>
          <div class="campo"><label for="numero">Número</label><input id="numero" required value="${esc(dados.numero || "")}"></div>
          <div class="campo"><label for="compl">Complemento</label><input id="compl" value="${esc(dados.complemento || "")}"></div></div>
        <div class="tres"><div class="campo"><label for="bairro">Bairro</label><input id="bairro" required value="${esc(dados.bairro || "")}"></div>
          <div class="campo"><label for="cidade">Cidade</label><input id="cidade" autocomplete="address-level2" required value="${esc(dados.cidade || "")}"></div>
          <div class="campo"><label for="uf">UF</label><input id="uf" maxlength="2" autocomplete="address-level1" required value="${esc(dados.uf || "")}"></div></div>
        <div id="freteCk" class="frete-res"></div>
      </section>
      <section class="etapa"><h2><span>3</span>Pagamento</h2>
        <div class="opcoes" role="radiogroup">
          <label class="opcao"><input type="radio" name="pag" value="pix" checked> Pix${SITE.descontoPix ? ` com ${SITE.descontoPix}% de desconto` : ""}</label>
          <label class="opcao"><input type="radio" name="pag" value="cartao"> Cartão de crédito em até <span id="maxParc"></span></label>
          <label class="opcao"><input type="radio" name="pag" value="boleto"> Boleto bancário</label>
        </div>
        <div class="campo" id="campoParc" hidden style="margin-top:12px"><label for="parc">Parcelas</label><select id="parc"></select></div>
      </section>
      <div id="erroCk" aria-live="assertive"></div>
    </div>
    <aside class="caixa-resumo"><h2>Resumo</h2><div id="resumoCk"></div>
      <div class="cupom"><label class="sr" for="cupom">Cupom</label><input id="cupom" placeholder="Cupom de desconto" style="text-transform:uppercase"><button type="button" class="botao claro" id="btnCupom">Aplicar</button></div>
      <div id="cupomMsg" style="font-size:14px;margin-top:6px" aria-live="polite"></div>
      <button class="botao largo" id="btnFinalizar" style="margin-top:16px">Fazer pedido</button>
      <p style="font-size:13px;color:var(--tinta-2);margin:10px 0 0">Ao fazer o pedido você concorda com as condições de <a href="/trocas" data-link>trocas</a> e <a href="/privacidade" data-link>privacidade</a>.</p>
    </aside>
  </form></div>`;
  let frete = null, cupom = null;
  const grupos = () => { const g = {}; sacola.itens.forEach((i) => (g[i.loja || "Vilaça Joias"] ||= []).push(i)); return g; };
  function resumo() {
    const sub = sacola.subtotal(), desc = cupom ? sub * (cupom.percentual / 100) : 0;
    const fr = frete ? frete.valor : null, tot = sub - desc + (fr || 0);
    const g = grupos(), varias = Object.keys(g).length > 1;
    $("#resumoCk").innerHTML = Object.entries(g).map(([loja, its]) => `${varias ? `<p class="grupo-loja">Enviado por ${esc(loja)}</p>` : ""}${its.map((i) => `<div class="linha" style="display:flex;justify-content:space-between;gap:10px;font-size:14.5px;padding:4px 0"><span>${i.qtd}× ${esc(i.nome)}${i.aro ? ` · aro ${esc(i.aro)}` : ""}</span><span>${brl(i.preco * i.qtd)}</span></div>`).join("")}`).join("") +
      `<div class="resumo"><div class="linha"><span>Subtotal</span><span>${brl(sub)}</span></div>
       ${desc ? `<div class="linha" style="color:var(--ok)"><span>Cupom ${esc(cupom.codigo)}</span><span>−${brl(desc)}</span></div>` : ""}
       <div class="linha"><span>Frete</span><span>${fr === null ? "Informe o CEP" : fr ? brl(fr) : "Grátis"}</span></div>
       <div class="linha total"><span>Total</span><span>${brl(tot)}</span></div>
       ${varias ? `<p style="font-size:13px;color:var(--tinta-2);margin:4px 0 0">Suas joias estão em lojas diferentes da Vilaça, por isso chegam em ${Object.keys(g).length} envios, cada um com sua nota fiscal.</p>` : ""}</div>`;
    const max = SITE.parcelasMax || 12, min = SITE.parcelaMinima || 50, n = Math.max(1, Math.min(max, Math.floor(tot / min)));
    $("#maxParc").textContent = `${n}x sem juros`;
    $("#parc").innerHTML = Array.from({ length: n }, (_, k) => `<option value="${k + 1}">${k + 1}x de ${brl(tot / (k + 1))}</option>`).join("");
  }
  resumo();
  async function calcFrete() {
    const cep = so($("#cep").value); if (cep.length !== 8) return;
    $("#freteCk").textContent = "Calculando frete…";
    try {
      frete = await api("frete", { cep, subtotal: sacola.subtotal() * (cupom ? 1 - cupom.percentual / 100 : 1) }, { cache: false });
      $("#freteCk").innerHTML = `<b>${frete.valor ? brl(frete.valor) : "Frete grátis"}</b> · ${esc(frete.nome)} · ${esc(frete.prazo)}`;
    } catch (e) { frete = null; $("#freteCk").innerHTML = `<span style="color:var(--erro)">${esc(e.message)}</span>`; }
    resumo();
  }
  async function buscarCep() {
    const cep = so($("#cep").value); if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json());
      if (!r.erro) { if (!$("#rua").value) $("#rua").value = r.logradouro || ""; if (!$("#bairro").value) $("#bairro").value = r.bairro || ""; $("#cidade").value = r.localidade || ""; $("#uf").value = r.uf || ""; if (!$("#rua").value) $("#rua").focus(); else $("#numero").focus(); }
    } catch {}
    calcFrete();
  }
  $("#cep").addEventListener("blur", buscarCep);
  $("#cep").addEventListener("input", (e) => { if (so(e.target.value).length === 8) buscarCep(); });
  if (so($("#cep").value).length === 8) calcFrete();
  $$('input[name="pag"]').forEach((r) => r.addEventListener("change", () => { $("#campoParc").hidden = $('input[name="pag"]:checked').value !== "cartao"; }));
  $("#btnCupom").addEventListener("click", async () => {
    const cod = $("#cupom").value.trim(); if (!cod) return;
    try { cupom = await api("cupom", { codigo: cod }, { cache: false }); $("#cupomMsg").innerHTML = `<span style="color:var(--ok)">Cupom aplicado: ${cupom.percentual}% de desconto${cupom.primeiraCompra ? " (válido na primeira compra)" : ""}.</span>`; }
    catch (e) { cupom = null; $("#cupomMsg").innerHTML = `<span style="color:var(--erro)">${esc(e.message)}</span>`; }
    calcFrete(); resumo();
  });
  $("#formCheckout").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = (id) => $("#" + id).value.trim();
    const cliente = { nome: v("nome"), cpf: v("cpf"), telefone: v("tel"), email: v("email"), aceitaNovidades: $("#novidades").checked };
    const endereco = { cep: v("cep"), rua: v("rua"), numero: v("numero"), complemento: v("compl"), bairro: v("bairro"), cidade: v("cidade"), uf: v("uf").toUpperCase() };
    const faltam = [];
    if (cliente.nome.split(" ").length < 2) faltam.push("nome completo");
    if (!cpfValido(cliente.cpf)) faltam.push("CPF válido");
    if (so(cliente.telefone).length < 10) faltam.push("celular com DDD");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cliente.email)) faltam.push("e-mail");
    if (so(endereco.cep).length !== 8 || !endereco.rua || !endereco.numero || !endereco.bairro || !endereco.cidade || endereco.uf.length !== 2) faltam.push("endereço completo");
    if (faltam.length) { $("#erroCk").innerHTML = `<p class="erro-msg">Confira: ${faltam.join(", ")}.</p>`; return; }
    store.set("vj_cliente", { ...cliente, ...endereco, complemento: endereco.complemento });
    const btn = $("#btnFinalizar"); btn.disabled = true; btn.textContent = "Enviando pedido…"; $("#erroCk").innerHTML = "";
    try {
      const r = await api("criarPedido", {
        cliente, endereco, cupom: cupom?.codigo || null,
        pagamento: { metodo: $('input[name="pag"]:checked').value, parcelas: Number($("#parc").value || 1) },
        itens: sacola.itens.map((i) => ({ id: i.id, qtd: i.qtd, aro: i.aro, personalizacao: i.personalizacao })),
      }, { cache: false });
      sacola.limpar();
      store.set("vj_ultimo", { grupo: r.grupo, token: r.token });
      navegar(`/pedido/${r.grupo}?t=${r.token}&novo=1`);
    } catch (err) {
      $("#erroCk").innerHTML = `<p class="erro-msg">${esc(err.message)}</p>`;
      btn.disabled = false; btn.textContent = "Fazer pedido";
    }
  });
}
function cpfValido(c) {
  c = so(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += +c[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === +c[9] && dv(10) === +c[10];
}

const STATUS = { aguardando_pagamento: "Aguardando pagamento", pago: "Pagamento aprovado", separando: "Separando sua joia", enviado: "Enviado", entregue: "Entregue", cancelado: "Cancelado", pronto_retirada: "Pronto para retirada" };
async function paginaPedido(grupo) {
  titulo("Seu pedido");
  const q = new URLSearchParams(location.search);
  main.innerHTML = `<div class="caixa confirmacao"><div class="esqueleto" style="height:200px"></div></div>`;
  const r = await api("pedido", { grupo, token: q.get("t") }, { cache: false });
  const total = r.pedidos.reduce((a, p) => a + Number(p.total), 0);
  const nums = r.pedidos.map((p) => "#" + p.numero).join(", ");
  const msg = `Olá! Acabei de fazer o pedido ${nums} no site (total ${brl(total)}).`;
  main.innerHTML = `<div class="caixa confirmacao">
    <h1>${q.get("novo") ? "Pedido recebido. Obrigado!" : "Seu pedido"}</h1>
    <p>${q.get("novo") ? "Guarde este link para acompanhar o pedido. Nossa equipe confirma o pagamento pelo WhatsApp." : "Acompanhe o andamento de cada envio."}</p>
    ${r.pedidos.map((p) => `<div class="pedido-loja"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>Pedido #${p.numero}</b><span class="status">${esc(STATUS[p.status] || p.status)}</span></div>
      <p style="font-size:14px;color:var(--tinta-2);margin:4px 0 10px">Enviado por ${esc(p.loja)}, ${esc(p.envio.servico || "")}${p.envio.prazo ? ", " + esc(p.envio.prazo) : ""}${p.envio.rastreio ? `. Rastreio <b>${esc(p.envio.rastreio)}</b>` : ""}</p>
      ${p.itens.map((i) => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:14.5px;padding:3px 0"><span>${i.qtd}× ${esc(i.nome)}${i.aro ? ` · aro ${esc(i.aro)}` : ""}</span><span>${brl(i.total)}</span></div>`).join("")}
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--linha);margin-top:8px;padding-top:8px;font-weight:600"><span>Total</span><span>${brl(p.total)}</span></div></div>`).join("")}
    <p style="margin-top:22px"><a class="botao zap" target="_blank" rel="noopener" href="https://wa.me/${esc(SITE.whatsapp)}?text=${encodeURIComponent(msg)}">Combinar pagamento no WhatsApp</a></p>
    <p><a class="link" href="/" data-link>Continuar comprando</a></p></div>`;
}

const TEXTOS = {
  garantia: ["Garantia", `<p>Toda joia acompanha certificado de garantia contra defeitos de fabricação, como pedras soltas, quebras, rachaduras e defeitos em fechos. A garantia legal é de 90 dias, conforme o Código de Defesa do Consumidor.</p><h2>Garantias adicionais Vilaça</h2><p>Ajuste de aro para mais ou para menos em até 3 números, uma vez, no prazo de 1 ano após a compra. Polimento sem custo, para sempre. Pequenos reparos de danos causados pelo uso, após análise do ourives. Custos de envio não estão incluídos nas garantias adicionais.</p><h2>O que não é coberto</h2><p>Danos por mau uso, como amassados, arranhões, oxidação, pedras soltas por dano nas garras e quebra de cordão por impacto.</p><h2>Como acionar</h2><p>Fale com a nossa equipe pelo WhatsApp com o motivo, foto da joia e foto da nota fiscal. Enviamos um código de postagem reversa para você deixar a joia nos Correios sem custo. O ourives analisa a peça e, se o defeito for de fabricação, fazemos o reparo ou a troca.</p>`],
  trocas: ["Trocas e devoluções", `<p>Compras feitas pelo site podem ser devolvidas em até 7 dias corridos após o recebimento, sem custo, conforme o Código de Defesa do Consumidor. A joia deve estar sem sinais de uso e com a embalagem original.</p><p>Peças personalizadas (com nome, letra ou gravação) e feitas sob medida não podem ser devolvidas por arrependimento, só em caso de defeito.</p><p>Para solicitar, fale com a gente pelo WhatsApp informando o número do pedido.</p>`],
  envio: ["Envio e prazos", `<p>Enviamos para todo o Brasil com seguro. O prazo começa a contar após a confirmação do pagamento e aparece no carrinho assim que você informa o CEP.</p><p>Peças sob encomenda ou personalizadas têm prazo de produção informado na página da joia.</p><p>Se a sua compra tiver joias de lojas diferentes da Vilaça, elas chegam em envios separados, cada um com sua nota fiscal e seu código de rastreio.</p>`],
  sobre: ["Sobre a Vilaça", `<p>A Vilaça é uma joalheria e ourivesaria de Juiz de Fora. Temos lojas no Centro e no Shopping Jardim Norte e uma oficina própria, onde nossos ourives fazem, ajustam e restauram joias em ouro 18k e prata 925.</p><p>É por ter a bancada perto que conseguimos oferecer ajuste de aro, polimento para sempre e reparos com quem conhece a peça.</p>`],
  privacidade: ["Privacidade", `<p>Usamos seus dados só para processar pedidos, emitir nota fiscal, entregar sua compra e, se você autorizar, enviar novidades. Não vendemos nem compartilhamos seus dados com terceiros além dos necessários para pagamento e entrega.</p><p>Para pedir a exclusão ou correção dos seus dados, fale com a gente pelo e-mail ou WhatsApp.</p>`],
};
function paginaTexto(chave) {
  const [t, html] = TEXTOS[chave]; titulo(t);
  main.innerHTML = `<div class="caixa"><article class="texto"><h1>${esc(t)}</h1>${html}</article></div>`;
}

// ---------- início ----------
(async function iniciar() {
  atualizarContador();
  try {
    const r = await api("init");
    SITE = r.site; CATS = r.categorias;
    montarCasca();
  } catch (e) {
    SITE = { faixa: [], whatsapp: "5532988307617", email: "joiasvilaca@gmail.com", instagram: "vilacajoias" }; CATS = [];
    main.innerHTML = `<div class="caixa">${erroHtml(e)}</div>`; return;
  }
  navegar(location.pathname + location.search, false);
})();
})();
