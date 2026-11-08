/* Avaliação do atendimento — parte do CLIENTE (link da via), 09/11.
 * Chamado pelo Ciente (ciente-via.js) na PRIMEIRA abertura de cada via nova: 5 estrelas já marcadas, comentário opcional e botão Pular.
 * Depois (se a loja tem ficha no Google): botão "Avaliar no Google" abre em pop-up/aba; ao voltar a via abre sozinha.
 * Se a loja respondeu a avaliação, mostra o quadro "Resposta da Vilaça" na via.
 * Uso: AvaliacaoVia.montar({ tipo:'os'|'venda'|'orc'|'res', id, client: supabaseClient })
 */
(function(){
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  var CSS='.av-ov{position:fixed;inset:0;z-index:10000;background:rgba(12,24,34,.82);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;}'
   +'.av-box{width:100%;max-width:420px;background:#fff;color:#14202b;border:2px solid #1f5f7a;border-radius:16px;padding:22px;box-shadow:0 18px 60px rgba(0,0,0,.5);text-align:center;}'
   +'.av-box h2{font-size:19px;margin:0 0 6px;} .av-box p{margin:0 0 14px;font-size:14px;color:#33424f;line-height:1.45;}'
   +'.av-stars{display:flex;justify-content:center;gap:6px;margin:6px 0 14px;}'
   +'.av-star{font-size:44px;line-height:1;background:none;border:0;cursor:pointer;padding:2px;color:#c3cbd3;}'
   +'.av-star.on{color:#f5b301;}'
   +'.av-txt{width:100%;box-sizing:border-box;min-height:90px;padding:10px 12px;border-radius:10px;border:1px solid #8a98a5;background:#fff;color:#14202b;font:inherit;resize:vertical;}'
   +'.av-row{display:flex;gap:8px;margin-top:14px;} .av-row>*{flex:1;}'
   +'.av-btn{min-height:46px;border-radius:10px;border:1px solid #1f5f7a;background:#1f5f7a;color:#fff;font:inherit;font-weight:800;cursor:pointer;}'
   +'.av-btn.sec{background:#fff;color:#1f5f7a;} .av-btn:disabled{opacity:.6;}'
   +'.av-resp{margin-top:14px;padding:14px 16px;border-radius:14px;border:1px solid var(--t-line,#dde);background:var(--t-surface-2,#f4f6f8);text-align:left;max-width:440px;width:100%;box-sizing:border-box;}'
   +'.av-resp b{display:block;margin-bottom:4px;} .av-resp p{margin:0;white-space:pre-wrap;font-size:14px;line-height:1.45;}';
  function css(){ if(document.getElementById('avCss')) return; var s=document.createElement('style'); s.id='avCss'; s.textContent=CSS; document.head.appendChild(s); }

  function esc2(s){ return esc(s); }
  /* Etapas (estrelas -> Google) dentro de um overlay já criado pelo "Ciente". fim() é chamado quando terminar. */
  function etapas(ov, a, chamar, fim){
    function etapaGoogle(){
      if(!a.google){ fim(); return; }
      var abriu=false;
      ov.innerHTML='<div class="av-box"><h2>Avalie também no Google</h2><p>Sua opinião no Google ajuda outras pessoas a conhecerem a <b>'+esc(a.loja||'nossa loja')+'</b>. Leva menos de um minuto.</p>'
        +'<div class="av-row" style="flex-direction:column;"><button class="av-btn" data-g>Avaliar no Google</button><button class="av-btn sec" data-ok>Concluir</button></div></div>';
      ov.querySelector('[data-ok]').onclick=function(){ limpa(); fim(); };
      ov.querySelector('[data-g]').onclick=function(){
        abriu=true;
        var w=null; try{ w=window.open(a.google,'avalGoogle','popup=yes,width=520,height=720,noopener'); }catch(e){}
        if(!w) window.open(a.google,'_blank','noopener');
        this.textContent='Abrir de novo';
      };
      function volta(){ if(abriu && document.visibilityState==='visible'){ limpa(); setTimeout(fim,600); } }
      function limpa(){ document.removeEventListener('visibilitychange',volta); window.removeEventListener('focus',volta); }
      document.addEventListener('visibilitychange',volta); window.addEventListener('focus',volta);
    }
    var est=5;
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
      etapaGoogle();
    }
    ov.querySelector('[data-pular]').onclick=function(){ enviar(true); };
    ov.querySelector('[data-env]').onclick=function(){ enviar(false); };
  }

  /* "Resposta da loja": aparece UMA vez, em destaque, depois do Ciente (guarda no aparelho que já foi vista). */
  function montar(o){
    css();
    var mostrando=false;
    function chave(a){ return 'avResp:'+o.tipo+':'+o.id+':'+((a.resposta&&a.resposta.em)||''); }
    function jaVista(a){ try{ return localStorage.getItem(chave(a))==='1'; }catch(e){ return false; } }
    function marcar(a){ try{ localStorage.setItem(chave(a),'1'); }catch(e){} }
    function mostrar(a){
      if(mostrando) return;
      if(document.querySelector('.cv-ov')){ setTimeout(function(){ mostrar(a); },500); return; }   // espera o Ciente/avaliação terminarem
      mostrando=true;
      var ov=document.createElement('div'); ov.className='av-ov';
      ov.innerHTML='<div class="av-box" style="border-color:#c9922b;"><h2>Resposta da '+esc2(a.loja||'Vilaça')+'</h2><p style="white-space:pre-wrap;color:#14202b;font-size:15px;text-align:left;background:#fff8e6;border:1px solid #e6c36a;border-radius:10px;padding:12px;">'+esc2(a.resposta.texto)+'</p><button class="av-btn" data-ok style="width:100%;">Entendi</button></div>';
      document.body.appendChild(ov); document.body.style.overflow='hidden';
      ov.querySelector('[data-ok]').onclick=function(){ marcar(a); ov.remove(); document.body.style.overflow=''; };
    }
    async function checar(){
      try{
        var r=await o.client.functions.invoke('retirada-terceiro',{ body:{tipo:o.tipo,id:o.id,acao:'estado'} });
        var a=r.data&&r.data.avaliacao;
        if(a && a.resposta && a.resposta.texto && !jaVista(a)) mostrar(a);
      }catch(e){}
    }
    setTimeout(checar,1500);
  }
  window.AvaliacaoVia = { montar: montar, etapas: etapas, css: css };
})();
