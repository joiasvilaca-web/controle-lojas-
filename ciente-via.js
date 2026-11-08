/* "Ciente" — PORTÃO de entrada da via (08/11).
 * Em TODA abertura do link a via fica coberta por uma tela cheia com o botão Ciente; só abre depois do clique, e cada clique grava
 * um registro de acesso em `leituras` (função retirada-terceiro, ação `ciente`, sem deduplicar: é o log de acesso do cliente).
 * Na 1ª abertura de via nova, depois do Ciente vêm: avaliação do atendente (estrelas) -> Google -> via.
 * Uso: CienteVia.montar(elemento, { tipo:'os'|'venda'|'orc'|'res', id, client: supabaseClient })  (o elemento não é mais usado)
 */
(function(){
  var CSS='.cv-ov{position:fixed;inset:0;z-index:10001;background:rgba(12,24,34,.82);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;}'
   +'.cv-ov .av-box p{margin:0 0 16px;}'
   +'.cv-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:50px;border-radius:10px;border:1px solid #1f5f7a;background:#1f5f7a;color:#fff;font:inherit;font-weight:800;font-size:17px;cursor:pointer;}'
   +'.cv-btn:disabled{opacity:.6;cursor:default;}';
  function css(){
    if(!document.getElementById('cvCss')){ var s=document.createElement('style'); s.id='cvCss'; s.textContent=CSS; document.head.appendChild(s); }
    if(window.AvaliacaoVia) window.AvaliacaoVia.css();
  }
  function montar(el, o){
    css();
    var ov=document.createElement('div'); ov.className='cv-ov av-ov';
    document.body.appendChild(ov); document.body.style.overflow='hidden';
    function fim(){ ov.remove(); document.body.style.overflow=''; }
    async function chamar(body){
      try{ var r=await o.client.functions.invoke('retirada-terceiro',{ body: Object.assign({tipo:o.tipo,id:o.id},body) }); return r.data||{}; }catch(e){ return {}; }
    }
    ov.innerHTML='<div class="av-box"><h2>Antes de abrir sua via</h2><p>Confirme que você vai ver esta via e a situação dela agora. Fica registrado como comprovante do seu acesso.</p><button class="cv-btn" data-ciente disabled>Ciente</button></div>';
    var b=ov.querySelector('[data-ciente]');
    // pequena espera: robôs de varredura de link não clicam e o botão não é "gasto" ao abrir
    setTimeout(function(){ b.disabled=false; },900);
    var enviando=false;
    b.onclick=async function(){
      if(enviando) return; enviando=true; b.disabled=true; b.textContent='Registrando…';
      var r=await chamar({acao:'ciente'}); enviando=false;
      if(!r.ok){ b.disabled=false; b.textContent='Ciente — tentar de novo'; return; }
      var a=r.avaliacao;
      if(a && a.pendente && window.AvaliacaoVia && window.AvaliacaoVia.etapas) window.AvaliacaoVia.etapas(ov, a, chamar, fim);
      else fim();
    };
  }
  window.CienteVia = { montar: montar };
})();
