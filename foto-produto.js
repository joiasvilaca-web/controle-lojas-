/* Miniatura da foto do produto (busca de produto na via, lista de itens) + ampliar ao clicar.
 *   FotoProduto.url(produto)          -> URL da 1ª foto do produto (ou '')
 *   FotoProduto.mini(produto, tam)    -> <img> pequena (ou espaço vazio) — clicar amplia
 *   FotoProduto.ampliar(url, titulo)  -> abre a foto grande por cima da tela
 * O clique na miniatura não seleciona o item da lista (é tratado antes, na captura).
 */
(function(){
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function css(){
    if(document.getElementById('fpCss')) return;
    var s = document.createElement('style'); s.id = 'fpCss';
    s.textContent = '.fp-mini{width:40px;height:40px;object-fit:cover;border-radius:8px;border:1px solid var(--line,#ddd);background:#fff;cursor:zoom-in;flex:0 0 auto;display:block;}'
      + '.fp-mini.vazio{cursor:default;background:var(--surface-2,#f3f4f6);}'
      + '.prod-ac-item.fp-com{display:grid !important;grid-template-columns:auto 1fr;column-gap:10px;align-items:center;}'
      + '.prod-ac-item.fp-com > .fp-mini{grid-row:1 / span 2;}'
      + '.prod-ac-item.fp-com > b,.prod-ac-item.fp-com > span{grid-column:2;}'
      + '.fp-fundo{position:fixed;inset:0;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;cursor:zoom-out;flex-direction:column;gap:10px;}'
      + '.fp-fundo img{max-width:min(92vw,900px);max-height:82vh;border-radius:12px;background:#fff;object-fit:contain;}'
      + '.fp-fundo .fp-tit{color:#fff;font:600 14px/1.4 system-ui,sans-serif;text-align:center;max-width:90vw;}'
      + '.fp-fundo .fp-nav{display:flex;gap:8px;} .fp-fundo .fp-nav button{min-width:44px;min-height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.12);color:#fff;font-size:18px;cursor:pointer;}';
    document.head.appendChild(s);
  }
  function fotos(p){ return ((p && p.fotos) || []).filter(function(f){ return f && f.driveUrl && (f.tipo||'foto')==='foto'; }).map(function(f){ return f.driveUrl; }); }
  function url(p){ return fotos(p)[0] || ''; }
  function grande(u){ return String(u||'').replace(/([?&]sz=)w\d+/, '$1w1600'); }
  function mini(p, tam){
    css();
    var u = url(p), t = tam || 40, lista = fotos(p);
    if(!u) return '<span class="fp-mini vazio" style="width:'+t+'px;height:'+t+'px;" aria-hidden="true"></span>';
    return '<img class="fp-mini" loading="lazy" style="width:'+t+'px;height:'+t+'px;" src="'+esc(u)+'" alt="Foto de '+esc(p && p.nome)+'" title="Clique para ampliar" data-fpzoom="'+esc(JSON.stringify(lista))+'" data-fptit="'+esc(p && p.nome)+'">';
  }
  function ampliar(urls, titulo){
    css();
    var lista = Array.isArray(urls) ? urls : [urls]; if(!lista.length) return;
    var i = 0;
    var fundo = document.createElement('div'); fundo.className = 'fp-fundo'; fundo.setAttribute('role','dialog'); fundo.setAttribute('aria-label','Foto do produto');
    function desenhar(){
      fundo.innerHTML = '<img src="'+esc(grande(lista[i]))+'" alt="">' + (titulo ? '<div class="fp-tit">'+esc(titulo)+(lista.length>1?' · '+(i+1)+'/'+lista.length:'')+'</div>' : '')
        + (lista.length>1 ? '<div class="fp-nav"><button type="button" data-fpn="-1" aria-label="Foto anterior">‹</button><button type="button" data-fpn="1" aria-label="Próxima foto">›</button></div>' : '');
    }
    desenhar();
    fundo.addEventListener('click', function(e){
      var b = e.target.closest('[data-fpn]');
      if(b){ e.stopPropagation(); i = (i + Number(b.dataset.fpn) + lista.length) % lista.length; desenhar(); return; }
      fechar();
    });
    function tecla(e){ if(e.key==='Escape') fechar(); else if(lista.length>1 && (e.key==='ArrowRight'||e.key==='ArrowLeft')){ i = (i + (e.key==='ArrowRight'?1:-1) + lista.length) % lista.length; desenhar(); } }
    function fechar(){ document.removeEventListener('keydown', tecla, true); fundo.remove(); }
    document.addEventListener('keydown', tecla, true);
    document.body.appendChild(fundo);
  }
  // Captura: o clique na miniatura amplia e NÃO escolhe o produto da lista (que usa mousedown).
  function interceptar(e){
    var el = e.target && e.target.closest && e.target.closest('[data-fpzoom]');
    if(!el) return;
    e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    if(e.type === 'click'){ var l = []; try{ l = JSON.parse(el.getAttribute('data-fpzoom')); }catch(x){ l = [el.src]; } ampliar(l, el.getAttribute('data-fptit')); }
  }
  ['mousedown','pointerdown','touchstart','click'].forEach(function(t){ document.addEventListener(t, interceptar, true); });
  window.FotoProduto = { url:url, mini:mini, ampliar:ampliar };
})();
