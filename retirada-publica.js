/* Retirada na loja — parte do CLIENTE (link da via, 09/11).
 * 1) CÓDIGO DE RETIRADA que muda sozinho (a cada 60 s): o cliente mostra na loja e a loja só entrega com ele.
 * 2) Se outra pessoa for buscar: o cliente informa o NOME dela e gera um código fixo para repassar.
 * Uso: RetiradaPublica.montar(elemento, { tipo:'os'|'venda'|'orc', id, via, client: supabaseClient })
 */
(function(){
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function dh(s){ if(!s) return ''; var d=new Date(s); return isNaN(d)?'':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  var CSS='.rp{margin-top:18px;padding:16px;border-radius:14px;border:1px solid var(--t-line,#dde);background:var(--t-surface-2,#f4f6f8);text-align:left;}'
   +'.rp h2{font-size:15px;margin:0 0 6px;} .rp p{margin:0 0 10px;font-size:13.5px;color:var(--t-ink-soft,#445);line-height:1.45;}'
   +'.rp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;padding:0 16px;border-radius:10px;border:1px solid var(--t-primary-strong,#1f5f7a);background:var(--t-primary-strong,#1f5f7a);color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;}'
   +'.rp-btn.sec{background:transparent;color:var(--t-primary-strong,#1f5f7a);} .rp-btn:disabled{opacity:.6;cursor:default;}'
   +'.rp-cod{font:800 38px/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;text-align:center;padding:14px 0 10px;color:var(--t-ink,#111);}'
   +'.rp-rot{font:800 42px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;text-align:center;padding:12px 0 8px;color:var(--t-ink,#111);font-variant-numeric:tabular-nums;}'
   +'.rp-barra{height:6px;border-radius:99px;background:var(--t-line,#dde);overflow:hidden;margin:0 auto 8px;max-width:260px;}'
   +'.rp-barra i{display:block;height:100%;background:var(--t-primary-strong,#1f5f7a);transition:width 1s linear;}'
   +'.rp-seg{text-align:center;font-size:12.5px;color:var(--t-ink-soft,#445);margin:0 0 4px;}'
   +'.rp-in{width:100%;box-sizing:border-box;min-height:42px;padding:0 12px;border-radius:10px;border:1px solid var(--t-line-strong,#bcc);background:var(--t-field,#fff);color:inherit;font:inherit;text-transform:uppercase;}'
   +'.rp-ok{color:var(--t-ok,#0f6b40);font-weight:700;} .rp-err{color:var(--t-danger,#b3261e);font-weight:700;font-size:13px;margin-top:8px;}'
   +'.rp-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}';
  function css(){ if(document.getElementById('rpCss')) return; var s=document.createElement('style'); s.id='rpCss'; s.textContent=CSS; document.head.appendChild(s); }
  function agrupar(c){ return c.length===6 ? c.slice(0,3)+' '+c.slice(3) : c; }

  function montar(el, o){
    css();
    el.innerHTML='<div class="rp" data-rot></div><div class="rp" data-terc style="display:none"></div>';
    var boxRot=el.querySelector('[data-rot]'), boxTerc=el.querySelector('[data-terc]');
    var rot=null, expira=0, periodo=60, ret=null, encerrada=false, codigoNovo='', erro='', buscando=false, tIntervalo=null, tComp=0;
    async function chamar(body){
      try{ var r=await o.client.functions.invoke('retirada-terceiro',{ body: Object.assign({tipo:o.tipo,id:o.id},body) }); return r.data || { error:'Não foi possível falar com a loja agora.' }; }
      catch(e){ return { error:'Não foi possível falar com a loja agora.' }; }
    }
    async function buscarRot(){
      if(buscando) return; buscando=true;
      var r=await chamar({acao:'rotativo'}); buscando=false;
      if(r.retirada) ret=r.retirada;
      if(r.encerrada){ encerrada=true; rot=null; parar(); desenhar(); return; }
      if(r.codigo){ rot=r.codigo; periodo=r.periodo||60; expira=Date.now()+(r.restante||periodo)*1000; }
      desenhar();
    }
    function parar(){ if(tIntervalo){ clearInterval(tIntervalo); tIntervalo=null; } }
    function tick(){
      if(encerrada) return;
      var rest=Math.max(0,Math.ceil((expira-Date.now())/1000));
      var s=boxRot.querySelector('[data-seg]'), b=boxRot.querySelector('[data-barra]');
      if(s) s.textContent='Muda em '+rest+' s';
      if(b) b.style.width=Math.max(0,Math.min(100,rest/periodo*100))+'%';
      if(rest<=0 && !buscando) buscarRot();
      if(++tComp%20===0 && !codigoNovo) atualizarEstado();
    }
    async function atualizarEstado(){ var r=await chamar({acao:'estado'}); if(r.retirada){ ret=r.retirada; if(r.encerrada && !encerrada){ encerrada=true; parar(); } desenharTerc(); if(encerrada) desenhar(); } }
    function desenhar(){
      if(encerrada){
        var u=ret&&ret.status==='usado';
        boxRot.innerHTML='<h2>Retirada na loja</h2>'+(u
          ? '<p class="rp-ok">Retirada concluída em '+esc(dh(ret.usadoEm))+(ret.recebidoPor?' — recebida por '+esc(ret.recebidoPor):'')+(ret.loja?' · '+esc(ret.loja):'')+'.</p>'
          : '<p>Esta via não está mais disponível para retirada.</p>');
        boxTerc.style.display='none';
        return;
      }
      boxRot.innerHTML='<h2>Código de retirada</h2><p>Para retirar na loja, mostre este código. Ele muda sozinho a cada minuto.</p>'
        +(rot?'<div class="rp-rot" aria-label="Código de retirada" aria-live="off">'+esc(agrupar(rot))+'</div><div class="rp-barra"><i data-barra></i></div><div class="rp-seg" data-seg></div>':'<p>Gerando o código…</p>')
        +(erro?'<div class="rp-err">'+esc(erro)+'</div>':'');
      boxTerc.style.display='';
      desenharTerc(); tick();
    }
    function desenharTerc(){
      if(encerrada) return;
      var st=ret&&ret.status;
      if(st==='ativo' && ret.expiraEm && new Date(ret.expiraEm).getTime()<Date.now()) st='vencido';
      var ate = ret&&ret.expiraEm ? new Date(ret.expiraEm).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '';
      var aviso = st==='vencido' ? '<p class="rp-err">O código anterior venceu (vale 1 hora). Gere um novo.</p>' : '';
      aviso += st==='invalidado' ? '<p class="rp-err">O código anterior foi invalidado'+(ret.motivo?': '+esc(ret.motivo):'')+'. Gere um novo.</p>'
                : st==='bloqueado' ? '<p class="rp-err">O código anterior foi bloqueado por tentativas erradas. Gere um novo.</p>' : '';
      var corpo;
      if(codigoNovo){
        var msg='Código para retirar a via na Vilaça Joias'+(o.via?' (via '+o.via+')':'')+': '+codigoNovo+'. Retira: '+(ret&&ret.portador||'')+'. Este código vale por 1 hora'+(ate?' (até '+ate+')':'')+'; depois será preciso pedir outro ao cliente. Apresente o código e um documento na loja.';
        corpo='<p>Envie este código para <b>'+esc(ret&&ret.portador||'')+'</b>. Ela informa o código na loja.</p><div class="rp-cod" aria-label="Código do portador">'+esc(codigoNovo)+'</div>'
          +'<p class="rp-err" style="margin-top:0;">Atenção: este código vale por 1 HORA'+(ate?' (até '+ate+')':'')+'. Depois disso será necessário gerar outro.</p><p style="font-size:12.5px;">Compartilhe apenas o código, nunca o link da via. Ele só aparece agora; se perder, gere outro.</p>'
          +'<div class="rp-row"><a class="rp-btn" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(msg)+'">Enviar pelo WhatsApp</a>'
          +(navigator.share?'<button class="rp-btn sec" data-share>Compartilhar</button>':'')+'<button class="rp-btn sec" data-copy>Copiar código</button></div>';
      } else if(st==='ativo'){
        corpo='<p>Retirada autorizada para <b>'+esc(ret.portador||'—')+'</b> (código gerado em '+esc(dh(ret.geradoEm))+', vale até '+esc(ate)+').</p><div class="rp-row"><button class="rp-btn sec" data-novo>Trocar a pessoa / gerar novo código</button></div><div data-form style="display:none"></div>';
      } else {
        corpo='<p>Outra pessoa vai buscar? Informe o nome dela e gere um código para repassar. Sem isso, só você retira, mostrando o código acima.</p><div data-form></div>';
      }
      boxTerc.innerHTML='<h2>Outra pessoa vai retirar?</h2>'+aviso+corpo+(erro?'<div class="rp-err">'+esc(erro)+'</div>':'');
      var f=boxTerc.querySelector('[data-form]');
      function formHtml(){ return '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Nome de quem vai buscar</label><input class="rp-in" data-nome maxlength="80" autocomplete="off" placeholder="Nome completo"><div class="rp-row"><button class="rp-btn" data-gerar>Gerar código para esta pessoa</button></div>'; }
      if(f && f.style.display!=='none') f.innerHTML=formHtml();
      var b;
      if((b=boxTerc.querySelector('[data-novo]'))) b.onclick=function(){ f.style.display=''; f.innerHTML=formHtml(); this.style.display='none'; lig(); };
      function lig(){ var g=boxTerc.querySelector('[data-gerar]'); if(!g) return; g.onclick=async function(){
        var nome=(boxTerc.querySelector('[data-nome]').value||'').trim();
        if(nome.length<3){ erro='Informe o nome de quem vai buscar.'; desenharTerc(); return; }
        if((st==='ativo'||st==='vencido') && !confirm('Gerar um novo código? O anterior deixa de valer.')) return;
        this.disabled=true; this.textContent='Gerando…';
        var r=await chamar({acao:'gerar',nome:nome});
        erro=r.error||''; codigoNovo=r.codigo||''; if(r.retirada) ret=r.retirada; desenharTerc();
      }; }
      lig();
      if((b=boxTerc.querySelector('[data-copy]'))) b.onclick=function(){ try{ navigator.clipboard.writeText(codigoNovo); this.textContent='Copiado'; }catch(e){} };
      if((b=boxTerc.querySelector('[data-share]'))) b.onclick=function(){ navigator.share({ text:'Código para retirar a via na Vilaça Joias: '+codigoNovo+'. Vale por 1 hora; depois será preciso gerar outro.' }).catch(function(){}); };
    }
    boxRot.innerHTML='<h2>Código de retirada</h2><p>Gerando o código…</p>';
    buscarRot();
    tIntervalo=setInterval(tick,1000);
  }
  window.RetiradaPublica = { montar: montar };
})();
