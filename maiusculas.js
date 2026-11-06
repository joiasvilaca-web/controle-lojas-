/* maiusculas.js — CAIXA ALTA automática em todos os campos de cadastro (06/11).
 * Digitou em minúscula? Vira MAIÚSCULA na hora (e no que for preenchido pelo sistema: busca de CEP, edição de registro antigo etc.),
 * então o que é gravado já vai em caixa alta. Vale para <input type="text"> e para <textarea> de observação/motivo/descrição.
 *
 * NÃO converte (de propósito):
 *   - e-mail, senha, endereço de site/link, usuário/login, tokens e chaves;
 *   - mensagens de WhatsApp/e-mail, textos de modelo, rodapé do cupom e perguntas à IA (precisam de maiúscula/minúscula normais);
 *   - caixas de busca e leitores de código;
 *   - telas inteiras marcadas com <html data-sem-maiuscula> (CHAT, IA, SITE, páginas públicas).
 * Para liberar UM campo: data-minusculo. Para forçar UM textarea: data-maiuscula.
 */
(function(){
  'use strict';
  var raiz = document.documentElement;
  if(raiz.hasAttribute('data-sem-maiuscula')) return;

  // id / name / placeholder / classe que indicam campo que NÃO deve virar maiúscula
  var NAO = /(e-?mail|mail|senha|passw|token|chave|api|url|link|slug|insta|\bsite|_site|seo|cfcor|fundo|hero|login|usuario|user\b|scanner|leitor|bipe|busca|buscar|search|pesquis|filtr|procur|termo|msg|mensag|texto|txt|rodape|prompt|sugest|persona|template|tpl|cupom|zap|whats|pix|instancia|cliac|pacinp|prodac|ac-input|http|www|@)/i;
  var TEXTAREA_OK = /(obs|observ|motivo|descri|detalhe|nota|info|hist|justific|complement|endereco)/i;

  function ident(el){ return (el.id || '') + ' ' + (el.name || '') + ' ' + (el.getAttribute('placeholder') || '') + ' ' + (el.className && el.className.baseVal === undefined ? el.className : ''); }

  function elegivel(el){
    if(!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if(tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    if(el.hasAttribute('data-minusculo') || (el.closest && el.closest('[data-minusculo]'))) return false;
    var id = ident(el);
    if(tag === 'INPUT'){
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      if(t !== 'text') return false;
      if(el.getAttribute('inputmode') === 'email' || el.getAttribute('autocomplete') === 'username') return false;
      return !NAO.test(id);
    }
    // textarea: só observação / motivo / descrição (o resto é mensagem livre)
    if(el.hasAttribute('data-maiuscula')) return true;
    return TEXTAREA_OK.test(id) && !NAO.test(id);
  }

  function maiusc(s){ return String(s).toUpperCase(); }

  /* 1) Tudo que o SISTEMA preenche (el.value = ...) também entra em maiúscula. */
  function gancho(proto){
    var d = Object.getOwnPropertyDescriptor(proto, 'value');
    if(!d || !d.set || !d.get) return;
    Object.defineProperty(proto, 'value', {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set: function(v){
        if(typeof v === 'string' && v && elegivel(this)) v = maiusc(v);
        d.set.call(this, v);
      }
    });
  }
  try{ gancho(HTMLInputElement.prototype); gancho(HTMLTextAreaElement.prototype); }catch(e){}

  /* 2) Quando a pessoa digita: converte mantendo o cursor no lugar. */
  function aoDigitar(e){
    var el = e.target;
    if(e.isComposing || !elegivel(el)) return;
    var v = el.value, u = maiusc(v);
    if(v === u) return;
    var a = null, b = null;
    try{ a = el.selectionStart; b = el.selectionEnd; }catch(_){}
    el.value = u;
    try{ if(a !== null) el.setSelectionRange(a, b); }catch(_){}
  }
  document.addEventListener('input', aoDigitar, true);
  document.addEventListener('change', aoDigitar, true);
  document.addEventListener('focusout', aoDigitar, true);

  /* 3) Campos que já chegam preenchidos no HTML (value="..."): converte quando entram na tela. */
  function converterEm(no){
    if(!no || no.nodeType !== 1) return;
    var lista = [];
    if(no.tagName === 'INPUT' || no.tagName === 'TEXTAREA') lista.push(no);
    if(no.querySelectorAll) lista.push.apply(lista, no.querySelectorAll('input,textarea'));
    for(var i = 0; i < lista.length; i++){
      var el = lista[i], v;
      try{ v = el.value; }catch(_){ continue; }
      if(v && elegivel(el)){ var u = maiusc(v); if(u !== v) el.value = u; }
    }
  }
  function iniciar(){
    converterEm(document.body);
    try{
      new MutationObserver(function(muts){
        for(var i = 0; i < muts.length; i++){
          var add = muts[i].addedNodes;
          for(var j = 0; j < add.length; j++) converterEm(add[j]);
        }
      }).observe(document.body, { childList: true, subtree: true });
    }catch(e){}
  }
  if(document.body) iniciar(); else document.addEventListener('DOMContentLoaded', iniciar);

  window.Maiusculas = { elegivel: elegivel, converter: converterEm };
})();
