/* Avaliação do atendimento — parte do CLIENTE (link da via), 09/11.
 * Na PRIMEIRA abertura de cada via nova: 5 estrelas já marcadas, comentário opcional e botão Pular.
 * Depois (se a loja tem ficha no Google): botão "Avaliar no Google" abre em pop-up/aba; ao voltar a via abre sozinha.
 * Se a loja respondeu a avaliação, mostra o quadro "Resposta da Vilaça" na via.
 * Uso: AvaliacaoVia.montar({ tipo:'os'|'venda'|'orc'|'res', id, client: supabaseClient })
 */
(function(){
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  var CSS='.av-ov{position:fixed;inset:0;z-index:10000;background:var(--t-bg,#f4f6f8);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;}'
   +'.av-box{width:100%;max-width:420px;background:var(--t-surface,#fff);color:var(--t-ink,#111);border:1px solid var(--t-line,#dde);border-radius:16px;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.15);text-align:center;}'
   +'.av-box h2{font-size:19px;margin:0 0 6px;} .av-box p{margin:0 0 14px;font-size:14px;color:var(--t-ink-soft,#445);line-height:1.45;}'
   +'.av-stars{display:flex;justify-content:center;gap:6px;margin:6px 0 14px;}'
   +'.av-star{font-size:44px;line-height:1;background:none;border:0;cursor:pointer;padding:2px;color:var(--t-line-strong,#c9cfd6);}'
   +'.av-star.on{color:#f5b301;}'
   +'.av-txt{width:100%;box-sizing:border-box;min-height:90px;padding:10px 12px;border-radius:10px;border:1px solid var(--t-line-strong,#bcc);background:var(--t-field,#fff);color:inherit;font:inherit;resize:vertical;}'
   +'.av-row{display:flex;gap:8px;margin-top:14px;} .av-row>*{flex:1;}'
   +'.av-btn{min-height:46px;border-radius:10px;border:1px solid var(--t-primary-strong,#1f5f7a);background:var(--t-primary-strong,#1f5f7a);color:#fff;font:inherit;font-weight:800;cursor:pointer;}'
   +'.av-btn.sec{background:transparent;color:var(--t-primary-strong,#1f5f7a);} .av-btn:disabled{opacity:.6;}'
   +'.av-resp{margin-top:14px;padding:14px 16px;border-radius:14px;border:1px solid var(--t-line,#dde);background:var(--t-surface-2,#f4f6f8);text-align:left;max-width:440px;width:100%;box-sizing:border-box;}'
   +'.av-resp b{display:block;margin-bottom:4px;} .av-resp p{margin:0;white-space:pre-wrap;font-size:14px;line-height:1.45;}';
  function css(){ if(document.getElementById('avCss')) return; var s=document.createElement('style'); s.id='avCss'; s.textContent=CSS; document.head.appendChild(s); }

  function montar(o){
    css();
    var boxResp=document.getElementById('avaliacaoResposta');
    if(!boxResp){ boxResp=document.createElement('div'); boxResp.id='avaliacaoResposta'; var ref=document.getElementById('cienteBox')||document.getElementById('retiradaBox'); if(ref&&ref.parentNode) ref.parentNode.insertBefore(boxResp,ref); else document.body.appendChild(boxResp); }
    var ov=null, shown=false;
    async function chamar(body){
      try{ var r=await o.client.functions.invoke('retirada-terceiro',{ body:Object.assign({tipo:o.tipo,id:o.id},body) }); return r.data||{}; }catch(e){ return {}; }
    }
    function fechar(){ if(ov){ ov.remove(); ov=null; } document.body.style.overflow=''; }
    function respostaBox(a){
      if(a && a.resposta && a.resposta.texto) boxResp.innerHTML='<div class="av-resp"><b>Resposta da '+esc(a.loja||'Vilaça')+'</b><p>'+esc(a.resposta.texto)+'</p></div>';
      else boxResp.innerHTML='';
    }
    function etapaGoogle(a){
      if(!a.google){ fechar(); return; }
      var abriu=false;
      ov.innerHTML='<div class="av-box"><h2>Avalie também no Google</h2><p>Sua opinião no Google ajuda outras pessoas a conhecerem a <b>'+esc(a.loja||'nossa loja')+'</b>. Leva menos de um minuto.</p>'
        +'<div class="av-row" style="flex-direction:column;"><button class="av-btn" data-g>Avaliar no Google</button><button class="av-btn sec" data-ok>Concluir</button></div></div>';
      ov.querySelector('[data-ok]').onclick=fechar;
      ov.querySelector('[data-g]').onclick=function(){
        abriu=true;
        var w=null; try{ w=window.open(a.google,'avalGoogle','popup=yes,width=520,height=720,noopener'); }catch(e){}
        if(!w) window.open(a.google,'_blank','noopener');
        this.textContent='Abrir de novo';
      };
      // ao voltar da janela/aba do Google, a via abre sozinha
      function volta(){ if(abriu && document.visibilityState==='visible'){ document.removeEventListener('visibilitychange',volta); window.removeEventListener('focus',volta); setTimeout(fechar,600); } }
      document.addEventListener('visibilitychange',volta); window.addEventListener('focus',volta);
    }
    function etapaEstrelas(a){
      shown=true; var est=5;
      ov=document.createElement('div'); ov.className='av-ov'; document.body.appendChild(ov); document.body.style.overflow='hidden';
      function estrelas(){ return [1,2,3,4,5].map(function(n){ return '<button type="button" class="av-star'+(n<=est?' on':'')+'" data-n="'+n+'" aria-label="'+n+' estrela'+(n>1?'s':'')+'">★</button>'; }).join(''); }
      ov.innerHTML='<div class="av-box"><h2>Como foi seu atendimento'+(a.atendente?' com '+esc(String(a.atendente).split(' ')[0]):'')+'?</h2><p>Toque nas estrelas. Se quiser, conte como foi — a nossa equipe lê cada mensagem.</p>'
        +'<div class="av-stars" data-st>'+estrelas()+'</div>'
        +'<textarea class="av-txt" data-txt maxlength="1500" placeholder="Conte como foi sua experiência (opcional)"></textarea>'
        +'<div class="av-row"><button class="av-btn sec" data-pular>Pular</button><button class="av-btn" data-env>Enviar</button></div></div>';
      var st=ov.querySelector('[data-st]');
      st.addEventListener('click',function(e){ var b=e.target.closest('[data-n]'); if(!b) return; est=Number(b.dataset.n); st.innerHTML=estrelas(); });
      async function enviar(pulou){
        var bs=ov.querySelectorAll('button'); bs.forEach(function(b){ b.disabled=true; });
        var r=await chamar(pulou?{acao:'avaliar',pulou:true}:{acao:'avaliar',estrelas:est,comentario:ov.querySelector('[data-txt]').value});
        if(!r.ok){ bs.forEach(function(b){ b.disabled=false; }); return; }
        if(pulou) etapaGoogle(a); else etapaGoogle(a);
      }
      ov.querySelector('[data-pular]').onclick=function(){ enviar(true); };
      ov.querySelector('[data-env]').onclick=function(){ enviar(false); };
    }
    async function checar(){
      var r=await chamar({acao:'estado'}); var a=r.avaliacao; if(!a) return;
      respostaBox(a);
      if(a.pendente && !shown) etapaEstrelas(a);
    }
    checar();
    setInterval(function(){ if(!ov) checar(); }, 45000);
  }
  window.AvaliacaoVia = { montar: montar };
})();
