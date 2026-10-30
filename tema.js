/* tema.js — tema claro / escuro do app (carregar no <head>, antes do CSS da página, para não piscar).
 * Preferência em localStorage 'vilaca_tema': 'claro' (padrão) | 'escuro' | 'auto' (segue o aparelho).
 * Todas as telas abertas (shell e módulos nos iframes) mudam juntas: o evento 'storage' avisa os outros documentos.
 *   VilacaTema.get()  → preferência salva     VilacaTema.set('escuro')  → grava e aplica
 *   VilacaTema.efetivo() → 'light' | 'dark'
 */
(function(){
  var CHAVE = 'vilaca_tema';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function get(){ try{ return localStorage.getItem(CHAVE) || 'claro'; }catch(e){ return 'claro'; } }
  function efetivo(){ var p = get(); return (p === 'escuro' || (p === 'auto' && mq && mq.matches)) ? 'dark' : 'light'; }
  function aplicar(){
    var t = efetivo(), h = document.documentElement;
    h.setAttribute('data-theme', t);
    h.style.colorScheme = t;
    try{ document.dispatchEvent(new CustomEvent('vilaca-tema', { detail:{ tema:t, preferencia:get() } })); }catch(e){}
  }
  function set(v){
    try{ localStorage.setItem(CHAVE, v); }catch(e){}
    aplicar();
    // iframes do mesmo site também (o 'storage' não dispara no próprio documento)
    try{ for(var i = 0; i < window.frames.length; i++){ var f = window.frames[i]; if(f.VilacaTema) f.VilacaTema.aplicar(); } }catch(e){}
  }
  aplicar();
  window.addEventListener('storage', function(e){ if(e.key === CHAVE) aplicar(); });
  if(mq){ try{ mq.addEventListener('change', aplicar); }catch(e){ try{ mq.addListener(aplicar); }catch(e2){} } }
  window.VilacaTema = { get:get, set:set, efetivo:efetivo, aplicar:aplicar };
})();

/* Teclado do celular: só abre quando a pessoa toca num campo de digitar.
 * Em aparelho de toque, focus() feito pelo código (leitor de código de barras do computador, "foco no primeiro campo" ao abrir
 * módulo/aba/popup, autofocus) é ignorado em campos de texto. O toque direto no campo continua funcionando, e o código ainda pode
 * devolver o foco logo depois de a pessoa digitar (listas que se redesenham a cada letra, Enter que pula de campo).
 * No computador (mouse/teclado, leitor USB) nada muda. */
(function(){
  var mm = window.matchMedia;
  // Celular/tablet pequeno: toque como entrada principal, ou tela pequena com toque (alguns aparelhos dizem ter "mouse" por causa de caneta/Samsung DeX).
  // Notebook com tela de toque (ponteiro principal = mouse e tela grande) fica de fora: lá o leitor de código continua valendo.
  function modoToque(){
    var toque = (navigator.maxTouchPoints || 0) > 0 || ('ontouchstart' in window);
    if(!toque) return false;
    if(mm && mm('(pointer: coarse)').matches) return true;
    var menor = Math.min(screen.width || 9999, screen.height || 9999);
    return menor <= 600;
  }
  if(!modoToque()) return;
  var TIPOS = /^(text|search|email|tel|url|password|number|)$/i;
  var ultToque = { el:null, t:0 }, ultDigitou = 0;
  function digitavel(el){
    if(!el || el.nodeType !== 1) return false;
    if(el.tagName === 'TEXTAREA') return true;
    if(el.tagName === 'INPUT') return TIPOS.test(el.getAttribute('type') || 'text');
    return !!el.isContentEditable;
  }
  function permitido(el){
    var agora = Date.now();
    if(agora - ultDigitou < 1500) return true;                       // acabou de digitar: o código pode devolver o foco
    if(agora - ultToque.t < 800 && ultToque.el){                     // o toque foi no próprio campo (ou no rótulo dele)
      if(ultToque.el === el || el.contains(ultToque.el)) return true;
      var lb = ultToque.el.closest && ultToque.el.closest('label');
      if(lb && el.labels && Array.prototype.indexOf.call(el.labels, lb) >= 0) return true;
    }
    return false;
  }
  document.addEventListener('pointerdown', function(e){ ultToque = { el:e.target, t:Date.now() }; }, true);
  document.addEventListener('touchstart', function(e){ ultToque = { el:e.target, t:Date.now() }; }, true);
  document.addEventListener('keydown', function(){ ultDigitou = Date.now(); }, true);
  document.addEventListener('input', function(){ ultDigitou = Date.now(); }, true);
  var original = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function(){
    if(digitavel(this) && !permitido(this)) return;
    return original.apply(this, arguments);
  };
  ['select','setSelectionRange'].forEach(function(nome){
    [HTMLInputElement, HTMLTextAreaElement].forEach(function(C){
      var o = C.prototype[nome]; if(!o) return;
      C.prototype[nome] = function(){
        if(document.activeElement !== this && !permitido(this)){
          // sem foco e sem toque: não deixa o navegador focar por trás
          return;
        }
        return o.apply(this, arguments);
      };
    });
  });
  // autofocus do HTML e qualquer outro caminho: se o campo ganhou foco sem toque, solta.
  document.addEventListener('focusin', function(e){
    var el = e.target;
    if(digitavel(el) && !permitido(el)){ try{ el.blur(); }catch(x){} }
  }, true);
})();
