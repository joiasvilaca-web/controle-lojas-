/* Reforma Joias — loja online de joias usadas e reformadas (vanilla JS, sem build) */
(() => {
"use strict";
const API = "https://wxiokmqnjtgbejgoepch.supabase.co/functions/v1/site-public";
const CANAL = "reforma";
const URL_SERVICO = "https://vilaca-controle-lojas.vercel.app/reforma.html"; // pedido de reforma (serviço)
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const so = (s) => String(s || "").replace(/\D/g, "");
const main = $("#conteudo");
let SITE = null, CATS = [];

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- API ----------
const memo = new Map();
async function api(op, dados = {}, { cache = true } = {}) {
  const chave = op + JSON.stringify(dados);
  if (cache && memo.has(chave)) return memo.get(chave);
  const p = fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, canal: CANAL, ...dados }) })
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || "Não foi possível carregar. Verifique sua conexão."); return j; });
  if (cache) { memo.set(chave, p); p.catch(() => memo.delete(chave)); }
  return p;
}

// ---------- sacola (peças únicas: nunca mais que o estoque) ----------
const sacola = {
  itens: store.get("rj_sacola", []),
  salvar() { store.set("rj_sacola", this.itens); atualizarContador(); },
  chave(i) { return [i.id, i.aro || ""].join("|"); },
  add(prod, opc = {}) {
    const max = Math.max(1, Math.min(Number(prod.estoque || 1), 10));
    const novo = { id: prod.id, slug: prod.slug, nome: prod.nome, preco: prod.preco, foto: prod.foto, condicao: prod.condicao, aro: opc.aro || null, qtd: 1, max, loja: prod.loja?.nome || "Reforma Joias" };
    const ex = this.itens.find((i) => this.chave(i) === this.chave(novo));
    if (ex) { if (ex.qtd >= ex.max) return false; ex.qtd += 1; } else this.itens.push(novo);
    this.salvar(); return true;
  },
  qtd(idx, d) { const i = this.itens[idx]; if (!i) return; i.qtd = Math.min(i.qtd + d, i.max || 1); if (i.qtd < 1) this.itens.splice(idx, 1); this.salvar(); },
  remover(idx) { this.itens.splice(idx, 1); this.salvar(); },
  limpar() { this.itens = []; this.salvar(); },
  subtotal() { return this.itens.reduce((a, i) => a + i.preco * i.qtd, 0); },
  total() { return this.itens.reduce((a, i) => a + i.qtd, 0); },
};
function atualizarContador() {
  const n = sacola.total(), el = $("#sacolaQtd");
  el.textContent = n; el.hidden = !n;
  $("#btnSacola").setAttribute("aria-label", n ? `Abrir sacola, ${n} ${n > 1 ? "peças" : "peça"}` : "Abrir sacola");
}

// ---------- utilidades ----------
let avisoT;
function aviso(msg) { const a = $("#aviso"); a.textContent = msg; a.hidden = false; clearTimeout(avisoT); avisoT = setTimeout(() => (a.hidden = true), 3400); }
function parcelas(preco) {
  const max = SITE?.parcelasMax || 6, min = SITE?.parcelaMinima || 50;
  const n = Math.max(1, Math.min(max, Math.floor(preco / min)));
  return n > 1 ? `${n}x de ${brl(preco / n)} sem juros` : "";
}
const garantiaDias = () => SITE?.garantiaDias || 90;
function carimbo(c, extra = "") { return c ? `<span class="carimbo ${extra}">${esc(c)}</span>` : ""; }
function cardHtml(p) {
  const tem2 = !!p.foto2;
  const foto = p.foto
    ? `<img class="f1 ${tem2 ? "tem2" : ""}" src="${esc(p.foto)}" alt="${esc(p.nome)}" loading="lazy" decoding="async">${tem2 ? `<img class="f2" src="${esc(p.foto2)}" alt="" loading="lazy" decoding="async">` : ""}`
    : `<span class="card-sem">Foto em breve</span>`;
  const parc = parcelas(p.preco);
  return `<a class="card ${p.disponivel ? "" : "esgotado"}" href="/p/${esc(p.slug)}" data-link>
    <div class="card-foto">${p.condicao ? `<span class="card-carimbo">${carimbo(p.condicao)}</span>` : ""}${foto}</div>
    ${p.codigo ? `<p class="card-cod">Peça nº ${esc(p.codigo)}</p>` : ""}
    <h3 class="card-nome">${esc(p.nome)}</h3>
    ${p.metal ? `<p class="card-metal">${esc(p.metal)}</p>` : ""}
    <p class="card-preco">${p.precoDe ? `<s>${brl(p.precoDe)}</s>` : ""}${brl(p.preco)}</p>
    ${parc ? `<p class="card-parc">ou ${parc}</p>` : ""}
  </a>`;
}
function esqueletoGrade(n = 6) {
  return `<div class="grade" aria-hidden="true">${Array.from({ length: n }, () => `<div class="card"><div class="card-foto esqueleto"></div><div class="esqueleto" style="height:14px;width:70%;margin-top:14px"></div><div class="esqueleto" style="height:14px;width:40%;margin-top:8px"></div></div>`).join("")}</div>`;
}
function erroHtml(e) {
  return `<div class="vazio"><h2>Algo não carregou</h2><p>${esc(e.message || e)}</p><p><button class="botao claro" onclick="location.reload()">Carregar de novo</button></p></div>`;
}
function titulo(t, desc) {
  document.title = t ? `${t} · Reforma Joias` : "Reforma Joias · Joias usadas e reformadas, com história";
  if (desc) $('meta[name="description"]').setAttribute("content", desc);
}

// ---------- roteador ----------
const rotas = [
  [/^\/$/, paginaInicio],
  [/^\/c\/([\w-]+)$/, paginaCategoria],
  [/^\/busca$/, paginaBusca],
  [/^\/recem-chegadas$/, () => paginaLista({ titulo: "Recém-chegadas", filtro: { lancamento: 1 }, sub: "Peças que acabaram de passar pela nossa bancada." })],
  [/^\/p\/([\w-]+)$/, paginaProduto],
  [/^\/finalizar$/, paginaCheckout],
  [/^\/pedido\/([\w-]+)$/, paginaPedido],
  [/^\/historia$/, paginaHistoria],
  [/^\/(garantia|devolucao|pecas-usadas|envio|privacidade)$/, paginaTexto],
];
// endereço oficial de cada página (buscadores); páginas de pedido e busca não têm
const SITE_URL = "https://controle-lojas-rho.vercel.app";
function definirCanonico(path) {
  let c = document.querySelector('link[rel="canonical"]');
  if (/^\/(finalizar|pedido|busca)/.test(path)) { if (c) c.remove(); return; }
  if (!c) { c = document.createElement("link"); c.rel = "canonical"; document.head.appendChild(c); }
  c.href = SITE_URL + (path === "/" ? "/" : path);
}
async function navegar(url, empurrar = true) {
  if (empurrar) history.pushState({}, "", url);
  fecharMenus();
  const path = location.pathname.replace(/\/+$/, "") || "/";
  definirCanonico(path);
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

// ---------- casca ----------
const plural = (n) => ({ "Anel": "Anéis", "Pingente": "Pingentes", "Pulseira": "Pulseiras", "Relógio": "Relógios", "Cordão": "Cordões", "Brinco": "Brincos" }[n] || n);
const fmtTel = (t) => { const d = so(t).replace(/^55/, ""); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : t; };

function montarCasca() {
  const msgs = SITE.faixa || [];
  $("#faixa").innerHTML = msgs.map((m, i) => `<span class="${i === 0 ? "ativa" : ""}">${esc(m)}</span>`).join("");
  if (msgs.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let i = 0; const faixa = $("#faixa"); setInterval(() => { const s = $$("span", faixa); s[i].classList.remove("ativa"); i = (i + 1) % s.length; s[i].classList.add("ativa"); }, 4800);
  }
  $("#nav").innerHTML = `<a href="/" data-link>Peças</a><a href="/historia" data-link>Nossa história</a><a href="/garantia" data-link>Garantia</a><a href="/devolucao" data-link>Devolução</a><a href="${URL_SERVICO}" target="_blank" rel="noopener">Reformar minha joia</a>`;
  const zap = SITE.whatsapp;
  const ends = (SITE.enderecos || []).map((e) => `<li>${esc(e.endereco)}${e.bairro ? ", " + esc(e.bairro) : ""}<br>${esc(e.cidade)}</li>`).join("");
  const emp = SITE.empresa;
  const empLinha = emp && (emp.razaoSocial || emp.cnpj) ? `<span>${esc(emp.razaoSocial || "")}${emp.cnpj ? " · CNPJ " + esc(emp.cnpj) : ""}</span>` : "";
  $("#rodape").innerHTML = `<div class="caixa"><div class="rodape-grade">
    <div><span class="marca-nome">Reforma <em>Joias</em></span><p style="max-width:34ch;margin-top:12px">Joias usadas, antigas e reformadas, vendidas uma a uma, com o estado de cada peça descrito e fotografado. Juiz de Fora, MG.</p>
      ${SITE.instagram ? `<p><a href="https://instagram.com/${esc(SITE.instagram)}" target="_blank" rel="noopener">Instagram @${esc(SITE.instagram)}</a></p>` : ""}</div>
    <div><h3>Peças</h3><ul>${CATS.map((c) => `<li><a href="/c/${c.slug}" data-link>${esc(plural(c.nome))}</a></li>`).join("")}<li><a href="/recem-chegadas" data-link>Recém-chegadas</a></li></ul></div>
    <div><h3>Informações</h3><ul><li><a href="/historia" data-link>Nossa história</a></li><li><a href="/pecas-usadas" data-link>Sobre peças usadas</a></li><li><a href="/garantia" data-link>Garantia</a></li><li><a href="/devolucao" data-link>Devolução</a></li><li><a href="/envio" data-link>Envio e prazos</a></li><li><a href="/privacidade" data-link>Privacidade</a></li></ul></div>
    <div><h3>Atendimento</h3><ul><li><a href="https://wa.me/${esc(zap)}" target="_blank" rel="noopener">WhatsApp ${fmtTel(zap)}</a></li><li><a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a></li><li>Segunda a sábado, 9h30 às 18h</li></ul>
      ${ends ? `<h3 style="margin-top:22px">Loja</h3><ul>${ends}</ul>` : ""}</div>
  </div>
  <div class="rodape-base"><span>Reforma Joias · Juiz de Fora, MG.</span>${empLinha}<span>Todas as peças são usadas ou reformadas, e assim identificadas.</span></div></div>`;
  const z = document.createElement("a");
  z.className = "zap-flutuante"; z.href = `https://wa.me/${zap}`; z.target = "_blank"; z.rel = "noopener"; z.setAttribute("aria-label", "Falar no WhatsApp");
  z.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.6 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.4z"/></svg>`;
  document.body.appendChild(z);
}
function fecharMenus() { $("#nav").classList.remove("aberto"); $("#btnMenu").setAttribute("aria-expanded", "false"); }
$("#btnMenu").addEventListener("click", () => { const n = $("#nav"); const ab = n.classList.toggle("aberto"); $("#btnMenu").setAttribute("aria-expanded", String(ab)); });
$("#btnBusca").addEventListener("click", () => { const f = $("#formBusca"); f.hidden = !f.hidden; if (!f.hidden) $("#campoBusca").focus(); });
$("#formBusca").addEventListener("submit", (e) => { e.preventDefault(); const q = $("#campoBusca").value.trim(); if (q) { $("#formBusca").hidden = true; navegar("/busca?q=" + encodeURIComponent(q)); } });

// ---------- páginas ----------
async function paginaInicio() {
  titulo("");
  main.innerHTML = `<section class="abertura"><div class="abertura-grade"><div><div class="esqueleto" style="height:200px;opacity:.15"></div></div><div class="pilha"></div></div></section><section class="secao"><div class="caixa">${esqueletoGrade(6)}</div></section>`;
  const [dest, novos] = await Promise.all([api("catalogo", { destaque: 1, limit: 12 }), api("catalogo", { ordem: "novos", limit: 9 })]);
  const comFoto = [...dest.produtos, ...novos.produtos].filter((p) => p.foto && p.disponivel);
  const vit = [...new Map(comFoto.map((p) => [p.id, p])).values()].slice(0, 3);
  const h = SITE.hero || {};
  const lista = (dest.produtos.filter((p) => p.foto).length ? dest.produtos : novos.produtos).filter((p) => p.foto).slice(0, 6);
  main.innerHTML = `
  <section class="abertura">
    <div class="abertura-grade">
      <div>
        <p class="abertura-selo">Joias usadas · antigas · reformadas</p>
        <h1>${h.titulo ? esc(h.titulo) : "Toda joia tem uma história. <em>A próxima pode ser a sua.</em>"}</h1>
        <p class="lide">${esc(h.texto || "Peças que já foram usadas, guardadas e herdadas voltam à vitrine depois de passar pela nossa bancada. Cada uma é única, fotografada como é e vendida com garantia.")}</p>
        <div class="abertura-acoes">
          <a class="botao" href="${CATS[0] ? "/c/" + CATS[0].slug : "/recem-chegadas"}" data-link>Ver as peças</a>
          <a class="botao claro" href="/historia" data-link>Nossa história</a>
        </div>
      </div>
      ${vit.length ? `<div class="pilha">${vit.map((p) => `<a href="/p/${esc(p.slug)}" data-link><img src="${esc(p.foto)}" alt="${esc(p.nome)}"><figcaption>${esc(p.nome)}</figcaption></a>`).join("")}</div>` : `<div class="pilha-vazia">Estamos preparando as próximas peças.<br>Fale com a gente pelo WhatsApp.</div>`}
    </div>
  </section>
  <section class="secao" style="padding-bottom:0"><div class="caixa">
    <div class="cabeca-secao"><div><h2 class="titulo-secao">Do baú para a <em>vitrine</em></h2><p class="sub-secao">Como cada peça chega até você.</p></div></div>
    <div class="passos">
      <div class="passo"><b class="num">1</b><h3>Escolhida a dedo</h3><p>Só entram peças de origem conhecida, com procedência identificada.</p></div>
      <div class="passo"><b class="num">2</b><h3>Revisada na oficina</h3><p>Limpeza, polimento e conferência de fechos, garras e pedras. Reparos, quando necessários.</p></div>
      <div class="passo"><b class="num">3</b><h3>Fotografada como é</h3><p>Fotos reais da peça, com as marcas do tempo descritas. Sem surpresas.</p></div>
      <div class="passo"><b class="num">4</b><h3>Sai com garantia</h3><p>${garantiaDias()} dias de garantia e devolução em até 7 dias nas compras pelo site.</p></div>
    </div>
  </div></section>
  ${CATS.length ? `<section class="secao"><div class="caixa">
    <div class="cabeca-secao"><div><h2 class="titulo-secao">Procure por <em>tipo</em></h2></div></div>
    <ul class="indice">${CATS.map((c) => `<li><a href="/c/${c.slug}" data-link><b>${esc(plural(c.nome))}</b><i></i><small>${c.total} ${c.total > 1 ? "peças" : "peça"}</small></a></li>`).join("")}</ul>
  </div></section>` : ""}
  ${lista.length ? `<section class="secao" style="padding-top:0"><div class="caixa">
    <div class="cabeca-secao"><div><h2 class="titulo-secao">Peças em <em>destaque</em></h2><p class="sub-secao">Cada uma existe uma vez só.</p></div><a class="link" href="/recem-chegadas" data-link>Ver recém-chegadas</a></div>
    <div class="grade">${lista.map(cardHtml).join("")}</div>
  </div></section>` : ""}
  <section class="reformar"><div class="caixa reformar-grade">
    <div><h2 class="titulo-secao" style="font-size:clamp(22px,3vw,30px)">Tem uma joia guardada que merece voltar a brilhar?</h2><p class="sub-secao">Também reformamos a sua. Envie fotos, receba o orçamento pelo WhatsApp e acompanhe tudo pelo link.</p></div>
    <a class="botao cobre" href="${URL_SERVICO}" target="_blank" rel="noopener">Pedir uma reforma</a>
  </div></section>`;
}

async function paginaHistoria() {
  titulo("Nossa história", "A história da Reforma Joias, de Juiz de Fora: joias usadas e reformadas que ganham uma nova vida.");
  main.innerHTML = `
  <section class="historia-capa"><div class="caixa"><p class="abertura-selo" style="color:var(--cobre-claro);font-size:12px;letter-spacing:.2em;text-transform:uppercase;margin:0 0 16px">Nossa história</p>
    <h1>Joias não acabam. <em>Mudam de mãos.</em></h1>
    <p>A Reforma Joias nasceu da bancada de uma oficina em Juiz de Fora e da vontade de dar uma segunda vida a peças que merecem continuar sendo usadas.</p></div></section>
  <article class="historia-corpo">
    <p>Tudo começou na oficina. Durante anos, o Grupo Vilaça Joias recebeu joias para consertar, ajustar, limpar e transformar. Cada peça que passava pela bancada vinha com uma lembrança: a aliança da avó, o anel de formatura, o cordão que ninguém mais usava mas ninguém queria vender.</p>
    <p>Com o tempo, percebemos duas coisas. A primeira: muita gente tem joia boa guardada na gaveta, sem uso, esperando uma reforma. A segunda: muita gente procura uma peça diferente, com personalidade, que não se encontra em toda vitrine, e prefere uma joia com caráter a uma joia igual a todas.</p>
    <blockquote>Uma joia bem cuidada atravessa gerações. Só precisa de alguém que cuide dela de novo.</blockquote>
    <p>Foi assim que a Reforma Joias passou a existir: uma casa dedicada a joias usadas, antigas e reformadas. Aqui, cada peça é única. Ela chega, é avaliada, limpa e revisada pelos nossos ourives, fotografada do jeito que é, com as marcas do tempo à vista, e só então vai para a vitrine.</p>
    <p>Somos transparentes sobre o que vendemos. Toda peça é identificada como usada, antiga ou reformada, e descrevemos o estado de conservação, o metal e, quando conhecemos, a história dela. Você sabe exatamente o que está levando. E, como acreditamos no que fazemos, cada peça sai com garantia.</p>
    <p>Hoje a Reforma Joias é duas coisas ao mesmo tempo: uma vitrine de peças que ganharam uma nova chance e um ateliê onde a sua joia também pode ser reformada. Se você tem uma peça guardada, traga. Se está procurando uma, venha escolher.</p>
    <p style="margin-top:30px"><a class="botao" href="/" data-link>Ver as peças</a> &nbsp; <a class="botao claro" href="${URL_SERVICO}" target="_blank" rel="noopener">Reformar a minha</a></p>
  </article>`;
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
  const estado = { ...filtro, ordem: "relevancia", condicao: "", offset: 0, limit: 24 };
  main.innerHTML = `<div class="caixa">
    ${trilha ? `<p class="trilha"><a href="/" data-link>Início</a> / ${esc(t)}</p>` : ""}
    <div class="cabeca-secao" style="margin-top:22px"><div><h1 class="titulo-secao">${esc(t)}</h1>${sub ? `<p class="sub-secao">${esc(sub)}</p>` : ""}</div></div>
    <div class="lista-topo"><div class="filtros" id="filtros"></div>
      <label class="sr" for="ordem">Ordenar</label>
      <select id="ordem"><option value="relevancia">Em destaque</option><option value="novos">Mais recentes</option><option value="menor">Menor preço</option><option value="maior">Maior preço</option></select></div>
    <div id="grade">${esqueletoGrade(6)}</div><div class="mais" id="mais"></div></div>`;
  let lista = [];
  async function carregar(reset) {
    if (reset) { estado.offset = 0; lista = []; $("#grade").innerHTML = esqueletoGrade(6); }
    const r = await api("catalogo", estado);
    lista = lista.concat(r.produtos);
    if (reset && !estado.condicao) {
      $("#filtros").innerHTML = (r.condicoes || []).length > 1 ? [`<button class="chip" aria-pressed="true" data-cond="">Todas</button>`, ...r.condicoes.map((m) => `<button class="chip" aria-pressed="false" data-cond="${esc(m)}">${esc(m)}</button>`)].join("") : "";
    }
    $("#grade").innerHTML = lista.length ? `<div class="grade">${lista.map(cardHtml).join("")}</div>` : `<div class="vazio"><h2>Nenhuma peça por aqui</h2><p>Chegam peças novas toda semana. Chame a gente no WhatsApp e conte o que procura.</p></div>`;
    const resta = r.total - lista.length;
    $("#mais").innerHTML = resta > 0 ? `<button class="botao claro" id="btnMais">Mostrar mais ${Math.min(resta, estado.limit)} de ${resta}</button>` : "";
    $("#btnMais")?.addEventListener("click", () => { estado.offset += estado.limit; carregar(false); });
  }
  $("#ordem").addEventListener("change", (e) => { estado.ordem = e.target.value; carregar(true); });
  $("#filtros").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cond]"); if (!b) return;
    estado.condicao = b.dataset.cond; $$("[data-cond]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); carregar(true);
  });
  await carregar(true);
}

const ICONES = {
  escudo: `<svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>`,
  volta: `<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/></svg>`,
  caixa: `<svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>`,
  lupa: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>`,
};

async function paginaProduto(slug) {
  main.innerHTML = `<div class="caixa"><div class="produto"><div class="galeria-principal esqueleto"></div><div><div class="esqueleto" style="height:40px;margin-bottom:12px"></div><div class="esqueleto" style="height:200px"></div></div></div></div>`;
  const { produto: p, relacionados } = await api("produto", { slug });
  titulo(p.nome, p.seoDescricao || `${p.nome}${p.condicao ? ", " + p.condicao.toLowerCase() : ""}${p.metal ? " em " + p.metal : ""}. Peça única, com garantia.`);
  const fotos = p.fotos || [];
  const parc = parcelas(p.preco);
  const pixDesc = SITE.descontoPix ? `ou ${brl(p.preco * (1 - SITE.descontoPix / 100))} no Pix` : "";
  const cat = CATS.find((c) => c.slug === p.categoriaSlug);
  const gar = p.garantiaDias || garantiaDias();
  const linhas = [["Condição", p.condicao], ["Metal", p.metal], ["Peso aproximado", p.peso ? String(p.peso).replace(".", ",") + " g" : ""], ["Marca", p.marca], ["Código da peça", p.codigo]].filter((x) => x[1]);
  (p.caracteristicas || []).forEach((c) => { if (c && c.nome && c.valor) linhas.push([c.nome, c.valor]); });
  main.innerHTML = `<div class="caixa">
    <p class="trilha"><a href="/" data-link>Início</a>${cat ? ` / <a href="/c/${cat.slug}" data-link>${esc(plural(cat.nome))}</a>` : ""} / ${esc(p.nome)}</p>
    <article class="produto">
      <div class="galeria">
        <div class="galeria-principal">${fotos[0] ? `<img id="fotoPrincipal" src="${esc(fotos[0])}" alt="${esc(p.nome)}">` : `<span class="card-sem">Foto em breve</span>`}</div>
        ${fotos.length > 1 ? `<div class="miniaturas" role="list">${fotos.map((f, i) => `<button role="listitem" aria-label="Foto ${i + 1}" aria-current="${i === 0}" data-i="${i}"><img src="${esc(f)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
      </div>
      <div class="ficha">
        ${carimbo(p.condicao)}
        <h1>${esc(p.nome)}</h1>
        ${p.codigo ? `<span class="cod">Peça nº ${esc(p.codigo)}</span>` : ""}
        <p class="preco">${p.precoDe ? `<s>${brl(p.precoDe)}</s>` : ""}${brl(p.preco)}</p>
        ${parc ? `<p class="parc">ou ${parc} no cartão</p>` : ""}
        ${pixDesc ? `<p class="pix">${pixDesc}</p>` : ""}
        ${linhas.length ? `<dl class="dados">${linhas.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        ${p.numerosAro?.length ? `<div class="campo"><label id="lblAro">Número do aro</label><div class="aros" role="group" aria-labelledby="lblAro">${p.numerosAro.map((n) => `<button type="button" aria-pressed="false" data-aro="${esc(n)}">${esc(n)}</button>`).join("")}</div></div>` : ""}
        <p class="unica">${p.estoque > 1 ? `Restam ${p.estoque} unidades desta peça.` : "Peça única: existe só esta."}</p>
        <div class="compra">
          ${p.disponivel ? `<button class="botao largo" id="btnComprar">Adicionar à sacola</button>` : `<button class="botao largo" disabled>Peça vendida</button>`}
          <a class="botao zap largo" target="_blank" rel="noopener" href="https://wa.me/${esc(SITE.whatsapp)}?text=${encodeURIComponent(`Olá! Tenho interesse na peça ${p.nome}${p.codigo ? " (nº " + p.codigo + ")" : ""} (${location.origin}/p/${p.slug})`)}">Perguntar pelo WhatsApp</a>
        </div>
        <div class="campo"><label for="cepProd">Calcular frete</label><div class="frete-calc"><input id="cepProd" inputmode="numeric" maxlength="9" placeholder="00000-000" value="${esc(store.get("rj_cep", ""))}"><button class="botao claro" id="btnFrete">Calcular</button></div><div class="frete-res" id="freteRes" aria-live="polite"></div></div>
        <ul class="regras">
          <li>${ICONES.lupa}<span>Peça ${p.condicao ? esc(p.condicao.toLowerCase()) : "usada ou reformada"}: confira as fotos e a descrição do estado.</span></li>
          <li>${ICONES.escudo}<span>Garantia legal de ${gar} dias, conforme o Código de Defesa do Consumidor. <a href="/garantia" data-link class="link">Como funciona</a></span></li>
          <li>${ICONES.volta}<span>Devolução do valor em até 7 dias após o recebimento. Não fazemos troca. <a href="/devolucao" data-link class="link">Detalhes</a></span></li>
          <li>${ICONES.caixa}<span>Envio segurado para todo o Brasil.</span></li>
        </ul>
      </div>
    </article>
    <section class="historia-peca">
      <div class="bloco desc"><h2>A história desta peça</h2>${p.historia ? `<p>${esc(p.historia)}</p>` : ""}${p.descricao ? p.descricao : (p.historia ? "" : `<p>Peça selecionada e revisada pela nossa oficina. Pergunte pelo WhatsApp se quiser saber mais sobre ela.</p>`)}</div>
      <div class="bloco"><h2>Estado de conservação</h2><div class="estado-box">${p.estado ? esc(p.estado) : "Por ser uma peça usada, pode apresentar pequenas marcas do tempo e do uso. As fotos mostram a peça real."}</div></div>
    </section>
    ${relacionados.length ? `<section class="secao" style="padding-bottom:0"><h2 class="titulo-secao" style="margin-bottom:24px">Outras peças <em>do mesmo tipo</em></h2><div class="grade">${relacionados.slice(0, 3).map(cardHtml).join("")}</div></section>` : ""}
  </div>`;
  $$(".miniaturas button").forEach((b) => b.addEventListener("click", () => {
    $("#fotoPrincipal").src = fotos[b.dataset.i];
    $$(".miniaturas button").forEach((x) => x.setAttribute("aria-current", String(x === b)));
  }));
  let aro = null;
  $$("[data-aro]").forEach((b) => b.addEventListener("click", () => { aro = b.dataset.aro; $$("[data-aro]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
  $("#btnComprar")?.addEventListener("click", () => {
    if (p.numerosAro?.length && !aro) { aviso("Escolha o número do aro."); $(".aros button")?.focus(); return; }
    if (!sacola.add(p, { aro })) { aviso("Esta peça é única e já está na sua sacola."); return; }
    abrirSacola();
  });
  const calcular = async () => {
    const cep = so($("#cepProd").value); const res = $("#freteRes");
    if (cep.length !== 8) { res.innerHTML = `<span style="color:var(--erro)">Digite os 8 números do CEP.</span>`; return; }
    store.set("rj_cep", cep); res.textContent = "Calculando…";
    try { const f = await api("frete", { cep, subtotal: p.preco }, { cache: false }); res.innerHTML = `<b>${f.valor ? brl(f.valor) : "Grátis"}</b> · ${esc(f.nome)} · ${esc(f.prazo)}`; }
    catch (e) { res.innerHTML = `<span style="color:var(--erro)">${esc(e.message)}</span>`; }
  };
  $("#btnFrete").addEventListener("click", calcular);
  $("#cepProd").addEventListener("keydown", (e) => { if (e.key === "Enter") calcular(); });
}

// ---------- sacola (gaveta) ----------
function abrirSacola() { renderSacola(); $("#gaveta").hidden = false; document.body.style.overflow = "hidden"; $(".gaveta-topo button").focus(); }
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
  if (!sacola.itens.length) { c.innerHTML = `<div class="vazio"><h2>Sua sacola está vazia</h2><p>Escolha uma peça para começar.</p><p><a class="botao" href="/" data-link data-fechar>Ver as peças</a></p></div>`; return; }
  const sub = sacola.subtotal();
  c.innerHTML = sacola.itens.map((i, idx) => `<div class="item">
      ${i.foto ? `<img src="${esc(i.foto)}" alt="">` : `<span></span>`}
      <div><h3>${esc(i.nome)}</h3>${i.condicao ? `<small>${esc(i.condicao)}</small>` : ""}${i.aro ? `<small>Aro ${esc(i.aro)}</small>` : ""}
        ${(i.max || 1) > 1 ? `<div style="margin-top:6px"><button aria-label="Diminuir" data-q="${idx}" data-d="-1">−</button> ${i.qtd} <button aria-label="Aumentar" data-q="${idx}" data-d="1">+</button></div>` : ""}</div>
      <div><p class="valor">${brl(i.preco * i.qtd)}</p><button class="link" style="font-size:13px" data-rm="${idx}">Remover</button></div>
    </div>`).join("") + `<div class="resumo">${barraFrete(sub)}<div class="linha total"><span>Subtotal</span><span>${brl(sub)}</span></div>
      ${parcelas(sub) ? `<div class="linha" style="color:var(--tinta-2);font-size:14px"><span></span><span>ou ${parcelas(sub)}</span></div>` : ""}
      <a class="botao largo" style="margin-top:12px" href="/finalizar" data-link data-fechar>Finalizar compra</a>
      <button class="botao claro largo" style="margin-top:8px" data-fechar>Continuar vendo peças</button></div>`;
  $$("[data-q]", c).forEach((b) => b.addEventListener("click", () => { sacola.qtd(+b.dataset.q, +b.dataset.d); renderSacola(); }));
  $$("[data-rm]", c).forEach((b) => b.addEventListener("click", () => { sacola.remover(+b.dataset.rm); renderSacola(); }));
}

// ---------- checkout ----------
async function paginaCheckout() {
  titulo("Finalizar compra");
  if (!sacola.itens.length) { main.innerHTML = `<div class="caixa vazio"><h2>Sua sacola está vazia</h2><p><a class="botao" href="/" data-link>Ver as peças</a></p></div>`; return; }
  const dados = store.get("rj_cliente", {});
  main.innerHTML = `<div class="caixa"><h1 class="titulo-secao" style="margin-top:28px">Finalizar compra</h1>
  <form class="checkout" id="formCheckout" novalidate>
    <div>
      ${SITE.checkoutModo !== "producao" ? `<p class="modo-teste">Loja em fase de testes: o pedido é registrado, mas nenhuma cobrança é feita. Nossa equipe confirma pelo WhatsApp.</p>` : ""}
      <section class="etapa"><h2><span>1</span>Seus dados</h2>
        <div class="campo"><label for="nome">Nome completo</label><input id="nome" autocomplete="name" required value="${esc(dados.nome || "")}"></div>
        <div class="duas"><div class="campo"><label for="cpf">CPF</label><input id="cpf" inputmode="numeric" autocomplete="off" required value="${esc(dados.cpf || "")}"></div>
          <div class="campo"><label for="tel">Celular com DDD</label><input id="tel" inputmode="tel" autocomplete="tel" required value="${esc(dados.telefone || "")}"></div></div>
        <div class="campo"><label for="email">E-mail</label><input id="email" type="email" autocomplete="email" required value="${esc(dados.email || "")}"></div>
        <label class="opcao" style="border:0;padding:12px 0 0;background:none"><input type="checkbox" id="novidades" ${dados.aceitaNovidades ? "checked" : ""}> Quero saber quando chegarem peças novas</label>
      </section>
      <section class="etapa"><h2><span>2</span>Entrega</h2>
        <div class="duas"><div class="campo"><label for="cep">CEP</label><input id="cep" inputmode="numeric" autocomplete="postal-code" required value="${esc(dados.cep || store.get("rj_cep", ""))}"></div><div></div></div>
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
      <label class="ciencia"><input type="checkbox" id="ciente"><span>Estou ciente de que as peças são <b>usadas ou reformadas</b> e conferi o estado de conservação descrito e as fotos. Li a política de <a href="/devolucao" data-link target="_blank">devolução</a> (não há troca) e a de <a href="/garantia" data-link target="_blank">garantia</a>.</span></label>
      <div id="erroCk" aria-live="assertive" style="margin-top:10px"></div>
    </div>
    <aside class="caixa-resumo"><h2>Resumo</h2><div id="resumoCk"></div>
      <div class="cupom"><label class="sr" for="cupom">Cupom</label><input id="cupom" placeholder="Cupom de desconto" style="text-transform:uppercase"><button type="button" class="botao claro" id="btnCupom">Aplicar</button></div>
      <div id="cupomMsg" style="font-size:14px;margin-top:6px" aria-live="polite"></div>
      <button class="botao largo" id="btnFinalizar" style="margin-top:16px">Fazer pedido</button>
    </aside>
  </form></div>`;
  let frete = null, cupom = null;
  function resumo() {
    const sub = sacola.subtotal(), desc = cupom ? sub * (cupom.percentual / 100) : 0;
    const fr = frete ? frete.valor : null, tot = sub - desc + (fr || 0);
    $("#resumoCk").innerHTML = sacola.itens.map((i) => `<div class="linha" style="gap:10px;font-size:14.5px"><span>${i.qtd}× ${esc(i.nome)}${i.aro ? ` · aro ${esc(i.aro)}` : ""}</span><span>${brl(i.preco * i.qtd)}</span></div>`).join("") +
      `<div class="resumo"><div class="linha"><span>Subtotal</span><span>${brl(sub)}</span></div>
       ${desc ? `<div class="linha" style="color:var(--ok)"><span>Cupom ${esc(cupom.codigo)}</span><span>−${brl(desc)}</span></div>` : ""}
       <div class="linha"><span>Frete</span><span>${fr === null ? "Informe o CEP" : fr ? brl(fr) : "Grátis"}</span></div>
       <div class="linha total"><span>Total</span><span>${brl(tot)}</span></div></div>`;
    const max = SITE.parcelasMax || 6, min = SITE.parcelaMinima || 50, n = Math.max(1, Math.min(max, Math.floor(tot / min)));
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
    try { cupom = await api("cupom", { codigo: cod }, { cache: false }); $("#cupomMsg").innerHTML = `<span style="color:var(--ok)">Cupom aplicado: ${cupom.percentual}% de desconto.</span>`; }
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
    if (!$("#ciente").checked) faltam.push("a ciência sobre peças usadas e a política de devolução");
    if (faltam.length) { $("#erroCk").innerHTML = `<p class="erro-msg">Confira: ${faltam.join(", ")}.</p>`; return; }
    store.set("rj_cliente", { ...cliente, ...endereco });
    const btn = $("#btnFinalizar"); btn.disabled = true; btn.textContent = "Enviando pedido…"; $("#erroCk").innerHTML = "";
    try {
      const r = await api("criarPedido", {
        cliente, endereco, cupom: cupom?.codigo || null,
        pagamento: { metodo: $('input[name="pag"]:checked').value, parcelas: Number($("#parc").value || 1) },
        itens: sacola.itens.map((i) => ({ id: i.id, qtd: i.qtd, aro: i.aro })),
      }, { cache: false });
      sacola.limpar();
      store.set("rj_ultimo", { grupo: r.grupo, token: r.token });
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

const STATUS = { aguardando_pagamento: "Aguardando pagamento", pago: "Pagamento aprovado", separando: "Preparando sua peça", enviado: "Enviado", entregue: "Entregue", cancelado: "Cancelado", pronto_retirada: "Pronto para retirada" };
async function paginaPedido(grupo) {
  titulo("Seu pedido");
  const q = new URLSearchParams(location.search);
  main.innerHTML = `<div class="caixa confirmacao"><div class="esqueleto" style="height:200px"></div></div>`;
  const r = await api("pedido", { grupo, token: q.get("t") }, { cache: false });
  const total = r.pedidos.reduce((a, p) => a + Number(p.total), 0);
  const nums = r.pedidos.map((p) => "#" + p.numero).join(", ");
  const msg = `Olá! Acabei de fazer o pedido ${nums} no site da Reforma Joias (total ${brl(total)}).`;
  main.innerHTML = `<div class="caixa confirmacao">
    <h1>${q.get("novo") ? "Pedido recebido. Obrigado!" : "Seu pedido"}</h1>
    <p>${q.get("novo") ? "Guarde este link para acompanhar o pedido. Nossa equipe confirma o pagamento pelo WhatsApp." : "Acompanhe o andamento do seu pedido."}</p>
    ${r.pedidos.map((p) => `<div class="pedido-loja"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>Pedido #${p.numero}</b><span class="status">${esc(STATUS[p.status] || p.status)}</span></div>
      <p style="font-size:14px;color:var(--tinta-2);margin:4px 0 10px">${esc(p.envio.servico || "")}${p.envio.prazo ? ", " + esc(p.envio.prazo) : ""}${p.envio.rastreio ? `. Rastreio <b>${esc(p.envio.rastreio)}</b>` : ""}</p>
      ${p.itens.map((i) => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:14.5px;padding:3px 0"><span>${i.qtd}× ${esc(i.nome)}${i.aro ? ` · aro ${esc(i.aro)}` : ""}</span><span>${brl(i.total)}</span></div>`).join("")}
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--linha);margin-top:8px;padding-top:8px;font-weight:600"><span>Total</span><span>${brl(p.total)}</span></div></div>`).join("")}
    <p style="margin-top:22px"><a class="botao zap" target="_blank" rel="noopener" href="https://wa.me/${esc(SITE.whatsapp)}?text=${encodeURIComponent(msg)}">Combinar pagamento no WhatsApp</a></p>
    <p>Mudou de ideia? Você tem 7 dias após o recebimento para devolver. <a class="link" href="/devolucao" data-link>Como devolver</a></p>
    <p><a class="link" href="/" data-link>Continuar vendo peças</a></p></div>`;
}

// ---------- textos legais ----------
// Base: Código de Defesa do Consumidor (Lei 8.078/1990, arts. 18, 24 a 26 e 49) e Decreto 7.962/2013.
const TEXTOS = {
  garantia: () => ["Garantia", `<p>Todas as peças da Reforma Joias são <b>usadas, antigas ou reformadas</b> e assim identificadas no site. Isso não tira o seu direito à garantia.</p>
    <h2>Garantia legal de ${garantiaDias()} dias</h2>
    <p>Joias são bens duráveis. Por isso, toda peça tem garantia legal de ${garantiaDias()} dias, contados da entrega, contra defeitos que não foram informados na descrição, como fecho que não funciona, solda que se abre, pedra que se solta sem sinal de dano ou peça que não é do metal anunciado. Se o defeito for oculto, o prazo conta a partir do momento em que ele aparece.</p>
    <h2>O que são defeitos e o que é desgaste</h2>
    <p>Como a peça é usada, ela pode ter marcas do tempo: riscos, leves amassados, desgaste de polimento, patina. Quando isso está descrito no “Estado de conservação” ou visível nas fotos, <b>não é defeito</b>. Defeito é o que impede ou prejudica o uso normal da peça e que não foi informado a você.</p>
    <h2>Como acionar</h2>
    <p>Fale com a gente pelo WhatsApp, informe o número do pedido e envie fotos. Se o defeito estiver dentro da garantia, enviamos uma etiqueta de postagem reversa sem custo para você. Nossa oficina tem até 30 dias para resolver. Se não for resolvido nesse prazo, você escolhe entre outra peça equivalente, a devolução do valor pago ou o abatimento proporcional do preço.</p>
    <h2>O que a garantia não cobre</h2>
    <p>Danos causados por uso inadequado depois da entrega, como quedas, impactos, contato com produtos químicos, reparos feitos por terceiros e desgaste natural pelo uso.</p>
    <p class="legal">Base legal: Código de Defesa do Consumidor, arts. 18 e 26.</p>`],
  devolucao: () => ["Devolução", `<div class="destaque"><b>Não fazemos troca.</b> Como cada peça é única, não há outra igual para entregar no lugar. O que oferecemos é a <b>devolução do valor pago</b>.</div>
    <h2>Compras pelo site: 7 dias para devolver</h2>
    <p>Quem compra pela internet pode desistir da compra em até <b>7 dias corridos</b>, contados do recebimento da peça, sem precisar dar motivo (Código de Defesa do Consumidor, art. 49). Basta avisar pelo WhatsApp ou pelo e-mail ${esc(SITE.email || "")} informando o número do pedido..</p>
    <ul><li>Devolvemos <b>todo o valor pago</b>, inclusive o frete que você pagou na compra.</li>
    <li>O envio da devolução é por nossa conta: mandamos um código de postagem sem custo.</li>
    <li>A peça deve voltar no mesmo estado em que foi recebida, com o certificado e a embalagem, se possível. Se a embalagem se perder, a devolução continua valendo.</li>
    <li>O reembolso é feito pela mesma forma de pagamento da compra, em até 10 dias úteis após o recebimento da peça. No cartão, pode aparecer em uma ou duas faturas, conforme a operadora.</li></ul>
    <h2>Peça com defeito</h2>
    <p>A regra de “sem troca” vale para quem desistiu da compra ou não gostou da peça. Se a peça chegar com defeito que não estava descrito, vale a <a href="/garantia" data-link class="link">garantia</a>: consertamos, e se não for possível você pode escolher outra peça equivalente, o dinheiro de volta ou o abatimento do preço, como manda o Código de Defesa do Consumidor.</p>
    <h2>Compras na loja</h2>
    <p>Na loja física, a peça é conferida no balcão antes do pagamento e a lei não prevê prazo de arrependimento. Por isso não fazemos troca nem devolução por gosto ou tamanho. Se aparecer um defeito que não foi informado, vale a garantia.</p>
    <h2>Peças feitas sob medida</h2>
    <p>Reformas e ajustes feitos sob encomenda na sua joia seguem as condições combinadas no orçamento.</p>
    <p class="legal">Base legal: Código de Defesa do Consumidor, arts. 18 e 49, e Decreto nº 7.962/2013.</p>`],
  "pecas-usadas": () => ["Sobre peças usadas", `<p>Tudo o que vendemos é de segunda mão: <b>usado, antigo ou reformado</b>. Preferimos dizer isso com todas as letras, porque é isso que torna cada peça especial e porque você tem o direito de saber exatamente o que está comprando.</p>
    <h2>Como identificamos as peças</h2>
    <ul><li><b>Usada:</b> já teve dono, passou por limpeza e revisão e está em bom estado.</li>
    <li><b>Seminova:</b> pouquíssimo uso, sem marcas aparentes.</li>
    <li><b>Reformada:</b> passou por conserto, troca de peças, nova solda ou polimento profundo pela nossa oficina.</li>
    <li><b>Antiga:</b> peça de época, com as marcas e o desenho do seu tempo.</li></ul>
    <h2>O que você encontra em cada peça</h2>
    <p>Fotos reais da própria peça, descrição do estado de conservação, o metal e o peso aproximado. Quando conhecemos a história da peça, contamos.</p>
    <h2>Origem das peças</h2>
    <p>Só colocamos à venda peças de origem identificada, com a operação registrada, como exige a legislação do comércio de joias. Não compramos nem vendemos peças de procedência duvidosa.</p>
    <h2>Peças únicas</h2>
    <p>Cada peça existe em uma única unidade. Vendida, ela sai do site. Se quiser algo parecido, fale com a gente: podemos avisar quando chegar outra.</p>`],
  envio: () => ["Envio e prazos", `<p>Enviamos para todo o Brasil com seguro. O prazo começa a contar após a confirmação do pagamento e aparece no carrinho assim que você informa o CEP.</p><p>Cada peça é conferida novamente antes de sair e vai embalada com cuidado. Você recebe o código de rastreio por e-mail e WhatsApp.</p><p>Se a embalagem chegar violada, não receba e fale com a gente.</p>`],
  privacidade: () => ["Privacidade", `<p>Usamos seus dados só para processar pedidos, entregar sua compra, cumprir obrigações legais e, se você autorizar, avisar sobre peças novas. Não vendemos nem compartilhamos seus dados com terceiros além dos necessários para pagamento e entrega.</p><p>Por exigência da legislação que regula o comércio de joias, podemos registrar dados de identificação de clientes em operações de valor elevado.</p><p>Para pedir a exclusão ou correção dos seus dados, fale com a gente pelo e-mail ou WhatsApp.</p>`],
};
function paginaTexto(chave) {
  const [t, html] = TEXTOS[chave](); titulo(t);
  main.innerHTML = `<div class="caixa"><article class="texto"><h1>${esc(t)}</h1>${html}</article></div>`;
}

// ---------- início ----------
(async function iniciar() {
  atualizarContador();
  try {
    const r = await api("init");
    SITE = r.site; CATS = r.categorias;
    SITE.whatsapp = SITE.whatsapp || "5532988307617"; SITE.email = SITE.email || "joiasvilaca@gmail.com";
    montarCasca();
  } catch (e) {
    SITE = { faixa: [], whatsapp: "5532988307617", email: "joiasvilaca@gmail.com", instagram: "" }; CATS = [];
    main.innerHTML = `<div class="caixa">${erroHtml(e)}</div>`; return;
  }
  navegar(location.pathname + location.search, false);
})();
})();
