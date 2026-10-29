/* Vilaça Joias — complementos visuais: lupa (foto inteira) na página do produto e lazy-load.
   Não altera dados, rotas nem checkout: só observa o DOM gerado por app.js. */
(() => {
"use strict";
const main = document.getElementById("conteudo");
if (!main) return;

// lazy-load em imagens fora da dobra que vieram sem o atributo
function ajustarImgs(raiz) {
  raiz.querySelectorAll("img:not([loading])").forEach((img) => {
    if (img.closest(".abertura-foto,.banner,.galeria-principal")) return;
    img.loading = "lazy"; img.decoding = "async";
  });
  const g = raiz.querySelector(".galeria-principal");
  if (g && g.querySelector("img") && !g.querySelector(".lupa")) {
    g.insertAdjacentHTML("beforeend", '<span class="lupa" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4M11 8.5v5M8.5 11h5"/></svg></span>');
    g.setAttribute("title", "Clique para ver a foto inteira");
  }
}
new MutationObserver(() => ajustarImgs(main)).observe(main, { childList: true, subtree: true });
ajustarImgs(main);

// lupa
let aberta = null;
function fotosDaGaleria() {
  const minis = [...document.querySelectorAll(".miniaturas img")].map((i) => i.getAttribute("src"));
  const atual = document.getElementById("fotoPrincipal")?.getAttribute("src");
  return minis.length ? minis : atual ? [atual] : [];
}
function abrir() {
  const fotos = fotosDaGaleria(); if (!fotos.length) return;
  const atual = document.getElementById("fotoPrincipal")?.getAttribute("src");
  let i = Math.max(0, fotos.indexOf(atual));
  const alt = document.getElementById("fotoPrincipal")?.alt || "";
  const ov = document.createElement("div");
  ov.className = "lupa-overlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Foto ampliada");
  ov.innerHTML = `<img alt=""><button class="lupa-fechar" aria-label="Fechar">×</button>${fotos.length > 1 ? '<button class="lupa-ant" aria-label="Foto anterior">‹</button><button class="lupa-prox" aria-label="Próxima foto">›</button><span class="lupa-cont"></span>' : ""}`;
  const img = ov.querySelector("img"); img.alt = alt;
  const mostrar = () => { img.src = fotos[i]; const c = ov.querySelector(".lupa-cont"); if (c) c.textContent = `${i + 1} / ${fotos.length}`; };
  const fechar = () => { ov.remove(); document.removeEventListener("keydown", tecla, true); document.body.style.overflow = ""; aberta = null; };
  const passo = (d) => { i = (i + d + fotos.length) % fotos.length; mostrar(); };
  function tecla(e) {
    if (e.key === "Escape") { e.stopPropagation(); fechar(); }
    else if (e.key === "ArrowLeft" && fotos.length > 1) passo(-1);
    else if (e.key === "ArrowRight" && fotos.length > 1) passo(1);
  }
  ov.addEventListener("click", (e) => {
    if (e.target.closest(".lupa-ant")) return passo(-1);
    if (e.target.closest(".lupa-prox")) return passo(1);
    if (e.target === img) return;
    fechar();
  });
  let x0 = null;
  ov.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  ov.addEventListener("touchend", (e) => { if (x0 === null || fotos.length < 2) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) passo(dx < 0 ? 1 : -1); x0 = null; });
  document.addEventListener("keydown", tecla, true);
  document.body.appendChild(ov); document.body.style.overflow = "hidden";
  mostrar(); ov.querySelector(".lupa-fechar").focus();
  aberta = ov;
}
main.addEventListener("click", (e) => {
  if (aberta) return;
  if (e.target.closest(".galeria-principal") && document.getElementById("fotoPrincipal")) abrir();
});
})();
