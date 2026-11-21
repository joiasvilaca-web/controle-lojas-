/* 21/11: "Siga no Instagram" nas páginas que o cliente abre pelo link (via, pedido, gravação, Reforma).
 * Vilaça → @vilacajoias; Reforma Joias → @reformajoias. Só um link para o perfil (não envia nada, não coleta dado).
 * Uso: InstagramLink.html({ reforma: true|false })  ou  InstagramLink.html({ loja: 'NOME DA LOJA' }) (detecta "Reforma" no nome). */
(function(){
  var PERFIS = { vilaca: 'vilacajoias', reforma: 'reformajoias' };
  var CSS = '.ig-siga{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;max-width:440px;box-sizing:border-box;margin:14px auto 0;padding:12px 16px;border-radius:14px;text-decoration:none;'
    + 'background:#fff;border:1px solid #E7DCE6;color:#1d1d1f;font:inherit;font-size:14.5px;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.04);min-height:48px;}'
    + '.ig-siga:hover{border-color:#C13584;}.ig-siga:focus-visible{outline:2px solid #C13584;outline-offset:2px;}'
    + '.ig-siga .ig-logo{width:30px;height:30px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 30% 107%,#fdf497 0%,#fdf497 5%,#fd5949 45%,#d6249f 60%,#285AEB 90%);}'
    + '.ig-siga .ig-logo svg{width:18px;height:18px;display:block;}.ig-siga small{display:block;font-weight:400;font-size:12.5px;color:#6b6b70;}';
  function css(){ if(document.getElementById('igSigaCss')) return; var s = document.createElement('style'); s.id = 'igSigaCss'; s.textContent = CSS; document.head.appendChild(s); }
  function ehReforma(o){ o = o || {}; if(typeof o.reforma === 'boolean') return o.reforma; return /reforma/i.test(String(o.loja || '')); }
  function html(o){
    css();
    var u = ehReforma(o) ? PERFIS.reforma : PERFIS.vilaca;
    return '<a class="ig-siga" href="https://www.instagram.com/' + u + '/" target="_blank" rel="noopener" aria-label="Abrir o Instagram @' + u + '">'
      + '<span class="ig-logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none"/></svg></span>'
      + '<span>Siga a gente no Instagram<small>@' + u + '</small></span></a>';
  }
  window.InstagramLink = { html: html, perfil: function(o){ return ehReforma(o) ? PERFIS.reforma : PERFIS.vilaca; } };
})();
