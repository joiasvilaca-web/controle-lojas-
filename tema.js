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
