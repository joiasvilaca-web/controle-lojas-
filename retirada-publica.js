/* Retirada por terceiros — parte do CLIENTE (link da via). O cliente gera o código de 4 caracteres
 * e repassa a quem vai buscar. O código aparece só na hora: depois, por segurança, não é mostrado de novo.
 * Uso: RetiradaPublica.montar(elemento, { tipo:'os'|'venda'|'orc', id, via, client: supabaseClient })
 */
(function(){
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function dh(s){ if(!s) return ''; var d=new Date(s); return isNaN(d)?'':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  var CSS='.rp{margin-top:18px;padding:16px;border-radius:14px;border:1px solid var(--t-line,#dde);background:var(--t-surface-2,#f4f6f8);text-align:left;}'
   +'.rp h2{font-size:15px;margin:0 0 6px;} .rp p{margin:0 0 10px;font-size:13.5px;color:var(--t-ink-soft,#445);line-height:1.45;}'
   +'.rp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;padding:0 16px;border-radius:10px;border:1px solid var(--t-primary-strong,#1f5f7a);background:var(--t-primary-strong,#1f5f7a);color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;}'
   +'.rp-btn.sec{background:transparent;color:var(--t-primary-strong,#1f5f7a);}'
   +'.rp-cod{font:800 38px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;text-align:center;padding:14px 0 10px;color:var(--t-ink,#111);}'
   +'.rp-ok{color:var(--t-ok,#0f6b40);font-weight:700;} .rp-err{color:var(--t-danger,#b3261e);font-weight:700;font-size:13px;margin-top:8px;}'
   +'.rp-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}';
  function css(){ if(document.getElementById('rpCss')) return; var s=document.createElement('style'); s.id='rpCss'; s.textContent=CSS; document.head.appendChild(s); }

  function montar(el, o){
    css();
    var codigoNovo='', erro='', timer=null;
    async function chamar(body){
      try{ var r=await o.client.functions.invoke('retirada-terceiro',{ body: Object.assign({tipo:o.tipo,id:o.id},body) }); return r.data || { error:'Não foi possível falar com a loja agora.' }; }
      catch(e){ return { error:'Não foi possível falar com a loja agora.' }; }
    }
    async function atualizar(){
      var r=await chamar({acao:'estado'});
      if(!r || !r.retirada){ el.innerHTML=''; return; }
      desenhar(r.retirada);
    }
    function desenhar(ret){
      var st=ret.status||'sem_codigo';
      if(st==='usado'){
        el.innerHTML='<div class="rp"><h2>Retirada por terceiros</h2><p class="rp-ok">Mercadoria retirada pelo seu portador em '+esc(dh(ret.usadoEm))+(ret.loja?' — '+esc(ret.loja):'')+'.</p></div>';
        if(timer){ clearInterval(timer); timer=null; }
        return;
      }
      if(!ret.habilitada){ el.innerHTML=''; return; }
      var aviso = st==='invalidado' ? '<p class="rp-err">O código anterior foi invalidado'+(ret.motivo?': '+esc(ret.motivo):'')+'. Gere um novo código.</p>'
                : st==='bloqueado' ? '<p class="rp-err">O código anterior foi bloqueado por tentativas erradas na loja. Gere um novo código.</p>' : '';
      var corpo;
      if(codigoNovo){
        var msg='Código para retirar minha via na Vilaça Joias'+(o.via?' (via '+o.via+')':'')+': '+codigoNovo+'. Apresente este código na loja.';
        corpo='<p>Envie este código para quem vai buscar. A pessoa informa o código na loja.</p>'
          +'<div class="rp-cod" aria-label="Código de retirada">'+esc(codigoNovo)+'</div>'
          +'<p style="font-size:12.5px;">Por segurança, o código só aparece agora. Se perder, gere outro (o anterior deixa de valer).</p>'
          +'<div class="rp-row"><a class="rp-btn" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(msg)+'">Enviar pelo WhatsApp</a>'
          +(navigator.share?'<button class="rp-btn sec" data-share>Compartilhar</button>':'')
          +'<button class="rp-btn sec" data-copy>Copiar código</button></div>';
      } else if(st==='ativo'){
        corpo='<p>Você já gerou um código em '+esc(dh(ret.geradoEm))+'. Ele vale até ser usado na loja.</p><div class="rp-row"><button class="rp-btn sec" data-gerar>Gerar novo código</button></div>';
      } else {
        corpo='<p>Vai mandar outra pessoa buscar? Gere um código e envie para ela. A loja só entrega com o código.</p><div class="rp-row"><button class="rp-btn" data-gerar>Gerar código de retirada</button></div>';
      }
      el.innerHTML='<div class="rp"><h2>Retirada por terceiros</h2>'+aviso+corpo+(erro?'<div class="rp-err">'+esc(erro)+'</div>':'')+'</div>';
      var b;
      if((b=el.querySelector('[data-gerar]'))) b.onclick=async function(){
        if(st==='ativo' && !confirm('Gerar um novo código? O código anterior deixa de valer.')) return;
        b.disabled=true; b.textContent='Gerando…';
        var r=await chamar({acao:'gerar'});
        erro = r.error || ''; codigoNovo = r.codigo || '';
        desenhar(r.retirada || ret);
      };
      if((b=el.querySelector('[data-copy]'))) b.onclick=function(){ try{ navigator.clipboard.writeText(codigoNovo); b.textContent='Copiado'; }catch(e){} };
      if((b=el.querySelector('[data-share]'))) b.onclick=function(){ navigator.share({ text:'Código para retirar minha via na Vilaça Joias: '+codigoNovo }).catch(function(){}); };
    }
    atualizar();
    timer=setInterval(function(){ if(!codigoNovo) atualizar(); }, 20000);
  }
  window.RetiradaPublica = { montar: montar };
})();
