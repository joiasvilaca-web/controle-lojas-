/* modal-x.js — todo popup do app ganha:
 *   • um "×" no canto superior direito (sempre visível, mesmo com o popup rolando);
 *   • um botão "Fechar" no rodapé quando o popup ainda não tem nenhum botão de fechar/cancelar.
 * Os dois fecham SEM salvar e fazem a mesma coisa: acionam o botão Cancelar/Fechar/Voltar que o
 * próprio popup já tem (assim cada tela mantém sua limpeza); se não houver, fecham o popup direto.
 * Não fecha por clique fora nem por ESC (regra do app) — só por botão.
 * Funciona sozinho: basta incluir <script src="modal-x.js"></script> na tela.
 */
(function(){
  if(window.__modalX) return; window.__modalX = true;

  /* fundos de popup conhecidos; o "popup" é o primeiro filho elemento deles */
  const OVERLAYS = '.modal-overlay, .modal-bg, .gerente-alert-overlay, .pwd-overlay, #rfOverlay, #modal';
  /* só textos inofensivos: "Fechar venda", "Cancelar pedido"… NÃO entram (são ações de verdade) */
  const PRIORIDADE = [/^cancelar$/, /^fechar$/, /^voltar( |$)/, /^cancel$|^close$/, /^sair$/, /^n(ao|ão)$/, /^entendi$/, /^ok$/, /^continuar$/];

  const css = document.createElement('style');
  css.textContent = `
    .mx-x{position:absolute;z-index:3;width:34px;height:34px;border-radius:50%;border:none;background:var(--t-dark,#1B2733);color:#fff;font-size:22px;line-height:32px;padding:0;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);display:none;font-family:Arial,sans-serif;}
    .mx-x:hover{background:#B42318;} .mx-x:focus-visible{outline:3px solid #7CC4DB;outline-offset:2px;}
    .mx-rodape{display:flex;justify-content:flex-end;gap:10px;margin-top:14px;}
    .mx-fechar{border:1px solid var(--t-line-strong,#D5DCE3);background:var(--t-surface-2,#F0F3F6);color:var(--t-text,#1B2733);border-radius:8px;padding:9px 16px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;}
    .mx-fechar:hover{border-color:var(--t-primary,#1F6F8B);}`;
  document.head.appendChild(css);

  const norm = t => String(t || '').replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visivel = el => { const c = getComputedStyle(el); return c.display !== 'none' && c.visibility !== 'hidden'; };
  const caixa = ov => Array.from(ov.children).find(e => !e.classList.contains('mx-x'));
  const botoesFechar = box => Array.from(box.querySelectorAll('button, a.btn')).filter(b => !b.dataset.mx && !b.disabled);
  /* o botão "de fechar" que o popup já tem (o mais prioritário) */
  function acharFechar(box){
    const lista = botoesFechar(box);
    const marcado = lista.find(b => b.hasAttribute('data-fechar'));
    if(marcado) return marcado;
    for(const re of PRIORIDADE){ const b = lista.find(b => re.test(norm(b.textContent))); if(b) return b; }
    return null;
  }
  const temXProprio = box => Array.from(box.querySelectorAll('button')).some(b => !b.dataset.mx && (/^[✕×✖xX]$/.test(b.textContent.trim()) || b.hasAttribute('data-fechar') || /fechar/i.test(b.getAttribute('aria-label') || '')));

  function fechar(ov){
    const box = caixa(ov); if(!box) return;
    const b = acharFechar(box);
    if(b){ b.click(); return; }
    /* sem botão de fechar: usa a função da tela, ou fecha o popup direto */
    const fn = window.closeModal || window.fecharModal;
    if(typeof fn === 'function' && (ov.id === 'modalOverlay' || ov.id === 'modalBg' || ov.id === 'modal')){ fn(); return; }
    if(ov.classList.contains('show')) ov.classList.remove('show');
    ov.style.display = 'none';
    if(ov.id === 'modalOverlay' || ov.id === 'modalBg'){ const mb = ov.querySelector('#modalBox'); if(mb) mb.innerHTML = ''; if(history.state && history.state.modalAberto) history.back(); }
  }

  function posicionar(ov, x){
    const box = caixa(ov); if(!box) return;
    const r = box.getBoundingClientRect(), o = ov.getBoundingClientRect();
    /* "pendurado" no canto superior direito do popup, para não cobrir título nem campos */
    x.style.top = Math.max(4, r.top - o.top - 14) + 'px';
    x.style.left = Math.min(o.width - 40, Math.max(6, r.right - o.left - 20)) + 'px';
  }

  function sincronizar(ov){
    let x = ov.querySelector(':scope > .mx-x');
    const box = caixa(ov);
    const aberto = box && visivel(ov) && box.children.length > 0;
    if(!aberto){ if(x) x.style.display = 'none'; return; }
    /* × no topo (se o popup já não tiver um) */
    if(!temXProprio(box)){
      if(!x){ x = document.createElement('button'); x.type = 'button'; x.className = 'mx-x'; x.dataset.mx = '1'; x.textContent = '×'; x.title = 'Fechar sem salvar'; x.setAttribute('aria-label', 'Fechar sem salvar'); x.addEventListener('click', () => fechar(ov)); ov.appendChild(x); }
      x.style.display = 'block'; posicionar(ov, x);
    } else if(x) x.style.display = 'none';
    /* botão Fechar no rodapé (só se o popup não tiver botão de fechar/cancelar) */
    if(!box.querySelector('[data-mx="rodape"]') && !acharFechar(box)){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'mx-fechar'; b.dataset.mx = 'rodape'; b.textContent = 'Fechar';
      b.title = 'Fechar sem salvar'; b.addEventListener('click', () => fechar(ov));
      const linhas = box.querySelectorAll('.modal-actions, .modal-foot, .rodape, .pwd-modal-actions');
      const alvo = linhas.length ? linhas[linhas.length - 1] : null;
      if(alvo) alvo.insertBefore(b, alvo.firstChild);
      else { const d = document.createElement('div'); d.className = 'mx-rodape'; d.appendChild(b); box.appendChild(d); }
    }
  }

  const vistos = new WeakSet(); let agendado = false; const fila = new Set();
  function agendar(ov){ fila.add(ov); if(agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; const l = Array.from(fila); fila.clear(); l.forEach(sincronizar); }); }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(es => es.forEach(e => { const ov = e.target.closest(OVERLAYS); if(ov) agendar(ov); })) : null;
  function vigiar(ov){
    if(vistos.has(ov)) return; vistos.add(ov);
    new MutationObserver(ms => { if(ms.every(m => m.target.closest && m.target.closest('.mx-x'))) return; agendar(ov); }).observe(ov, { attributes:true, attributeFilter:['class', 'style'], childList:true, subtree:true });
    const box = caixa(ov); if(box && ro) ro.observe(box);
    agendar(ov);
  }
  function varrer(){ document.querySelectorAll(OVERLAYS).forEach(vigiar); }
  function iniciar(){
    varrer();
    /* popups criados depois (ex.: recorte de foto) entram como filhos diretos do body */
    new MutationObserver(ms => { for(const m of ms) m.addedNodes.forEach(n => { if(n.nodeType === 1 && n.matches && n.matches(OVERLAYS)) vigiar(n); }); }).observe(document.body, { childList:true });
    window.addEventListener('resize', () => document.querySelectorAll(OVERLAYS).forEach(agendar));
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
