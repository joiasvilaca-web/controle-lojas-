/* Retirada na loja — parte do CLIENTE (link da via, 09/11).
 * 1) CÓDIGO DE RETIRADA do próprio cliente: 6 dígitos que mudam sozinhos a cada 60 s.
 * 2) Se outra pessoa for buscar: o cliente informa o NOME dela e gera um código de 6 dígitos (vale 24 h, pode ser cancelado).
 *    O código fica visível enquanto valer (dá para ver de novo ao voltar na via), pode ser copiado ou enviado pelo WhatsApp.
 * 3) Depois que a loja usa o código: a página mostra que a via foi RETIRADA, por quem e quando.
 * Uso: RetiradaPublica.montar(elemento, { tipo:'os'|'venda'|'orc', id, via, client: supabaseClient })
 */
(function(){
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function dh(s){ if(!s) return ''; var d=new Date(s); return isNaN(d)?'':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  var CSS='.rp{margin-top:18px;padding:16px;border-radius:14px;border:1px solid var(--t-line,#dde);background:var(--t-surface-2,#f4f6f8);text-align:left;}'
   +'.rp h2{font-size:15px;margin:0 0 6px;} .rp p{margin:0 0 10px;font-size:13.5px;color:var(--t-ink-soft,#445);line-height:1.45;}'
   +'.rp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:42px;padding:0 16px;border-radius:10px;border:1px solid var(--t-primary-strong,#1f5f7a);background:var(--t-primary-strong,#1f5f7a);color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;}'
   +'.rp-btn.sec{background:transparent;color:var(--t-primary-strong,#1f5f7a);} .rp-btn:disabled{opacity:.6;cursor:default;}'
   +'.rp-btn.perigo{background:transparent;color:var(--t-danger,#b3261e);border-color:var(--t-danger,#b3261e);}'
   +'.rp-cod{font:800 38px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;text-align:center;padding:14px 0 10px;color:var(--t-ink,#111);font-variant-numeric:tabular-nums;}'
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
    var rot=null, expira=0, periodo=60, ret=null, codTerc='', encerrada=false, erro='', aviso2='', buscando=false, tIntervalo=null, tComp=0, assinatura='';
    async function chamar(body){
      try{ var r=await o.client.functions.invoke('retirada-terceiro',{ body: Object.assign({tipo:o.tipo,id:o.id},body) }); return r.data || { error:'Não foi possível falar com a loja agora.' }; }
      catch(e){ return { error:'Não foi possível falar com a loja agora.' }; }
    }
    function aplicar(r){
      if(r.retirada) ret=r.retirada;
      if(typeof r.codigoTerceiro!=='undefined') codTerc=r.codigoTerceiro||'';
      if(r.encerrada){ encerrada=true; parar(); }
    }
    async function buscarRot(){
      if(buscando) return; buscando=true;
      var r=await chamar({acao:'rotativo'}); buscando=false;
      aplicar(r);
      if(r.encerrada){ rot=null; desenhar(); return; }
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
      if(++tComp%10===0) atualizarEstado();   // a cada ~10 s confere se a loja já usou o código
    }
    async function atualizarEstado(){
      var r=await chamar({acao:'estado'}); if(!r.retirada) return;
      var antes=encerrada; aplicar(r);
      if(encerrada && !antes) desenhar(); else desenharTerc();
    }
    function desenhar(){
      if(encerrada){
        var u=ret&&ret.status==='usado';
        boxRot.innerHTML='<h2>Retirada na loja</h2>'+(u
          ? '<p class="rp-ok">✓ Via RETIRADA em '+esc(dh(ret.usadoEm))+(ret.recebidoPor?' — recebida por '+esc(ret.recebidoPor):'')+(ret.loja?' · '+esc(ret.loja):'')+'.</p>'
          : '<p>Esta via não está mais disponível para retirada.</p>');
        boxTerc.style.display='none';
        return;
      }
      boxRot.innerHTML='<h2>Seu código de retirada</h2><p>Para retirar na loja, mostre este código. Ele muda sozinho a cada minuto.</p>'
        +(rot?'<div class="rp-rot" aria-label="Código de retirada" aria-live="off">'+esc(agrupar(rot))+'</div><div class="rp-barra"><i data-barra></i></div><div class="rp-seg" data-seg></div>':'<p>Gerando o código…</p>');
      boxTerc.style.display='';
      desenharTerc(); tick();
    }
    function desenharTerc(){
      if(encerrada) return;
      var st=ret&&ret.status;
      if(st==='ativo' && ret.expiraEm && new Date(ret.expiraEm).getTime()<Date.now()) st='vencido';
      var ate = ret&&ret.expiraEm ? dh(ret.expiraEm) : '';
      var sig=[st,codTerc,ret&&ret.portador,erro,aviso2].join('|');
      if(sig===assinatura) return;      // nada mudou: não redesenha (não apaga o que a pessoa está digitando)
      assinatura=sig;
      var avisos='';
      if(aviso2) avisos+='<p class="rp-ok">'+esc(aviso2)+'</p>';
      if(st==='cancelado') avisos+='<p class="rp-err">O código anterior foi cancelado.</p>';
      if(st==='vencido') avisos+='<p class="rp-err">O código anterior venceu (vale 24 horas). Gere um novo.</p>';
      if(st==='invalidado') avisos+='<p class="rp-err">O código anterior foi invalidado'+(ret.motivo?': '+esc(ret.motivo):'')+'. Gere um novo.</p>';
      if(st==='bloqueado') avisos+='<p class="rp-err">O código anterior foi bloqueado por tentativas erradas. Gere um novo.</p>';
      var corpo;
      if(st==='ativo' && codTerc){
        var msg='Código para retirar a via na Vilaça Joias'+(o.via?' (via '+o.via+')':'')+': '+codTerc+'. Retira: '+(ret.portador||'')+'. Este código vale por 24 horas'+(ate?' (até '+ate+')':'')+'; depois será preciso gerar outro. Apresente o código e um documento na loja.';
        corpo='<p>Retirada autorizada para <b>'+esc(ret.portador||'—')+'</b>. Envie o código para ela; na loja ela informa o código.</p>'
          +'<div class="rp-cod" aria-label="Código de terceiro">'+esc(agrupar(codTerc))+'</div>'
          +'<p class="rp-err" style="margin-top:0;">Este código vale por 24 HORAS'+(ate?' (até '+esc(ate)+')':'')+'. Depois será necessário gerar outro. Você pode cancelá-lo antes de ser usado.</p>'
          +'<p style="font-size:12.5px;">Envie só o código, nunca o link da via.</p>'
          +'<div class="rp-row"><button class="rp-btn" data-copy>Copiar código</button><a class="rp-btn sec" target="_blank" rel="noopener" href="https://wa.me/?text='+encodeURIComponent(msg)+'">Enviar pelo WhatsApp</a></div>'
          +'<div class="rp-row"><button class="rp-btn sec" data-novo>Trocar a pessoa / gerar novo código</button><button class="rp-btn perigo" data-cancelar>Cancelar este código</button></div><div data-form style="display:none"></div>';
      } else {
        corpo='<p>Outra pessoa vai buscar? Informe o nome dela e gere um código para repassar. Sem isso, só você retira, mostrando o código acima.</p><div data-form></div>';
      }
      boxTerc.innerHTML='<h2>Outra pessoa vai retirar?</h2>'+avisos+corpo+(erro?'<div class="rp-err">'+esc(erro)+'</div>':'');
      var f=boxTerc.querySelector('[data-form]');
      function formHtml(){ return '<label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Nome de quem vai buscar</label><input class="rp-in" data-nome maxlength="80" autocomplete="off" placeholder="Nome completo"><div class="rp-row"><button class="rp-btn" data-gerar>Gerar código para esta pessoa</button></div>'; }
      function ligGerar(){ var g=boxTerc.querySelector('[data-gerar]'); if(!g) return; g.onclick=async function(){
        var nome=(boxTerc.querySelector('[data-nome]').value||'').trim();
        if(nome.length<3){ erro='Informe o nome de quem vai buscar.'; desenharTerc(); return; }
        if(st==='ativo' && !confirm('Gerar um novo código? O anterior deixa de valer.')) return;
        this.disabled=true; this.textContent='Gerando…';
        var r=await chamar({acao:'gerar',nome:nome});
        erro=r.error||''; aviso2=''; if(r.retirada) ret=r.retirada; if(r.codigo) codTerc=r.codigo; desenharTerc();
      }; }
      if(f && f.style.display!=='none'){ f.innerHTML=formHtml(); }
      var b;
      if((b=boxTerc.querySelector('[data-novo]'))) b.onclick=function(){ f.style.display=''; f.innerHTML=formHtml(); this.style.display='none'; ligGerar(); };
      ligGerar();
      if((b=boxTerc.querySelector('[data-copy]'))) b.onclick=function(){ try{ navigator.clipboard.writeText(codTerc); this.textContent='Copiado ✓'; }catch(e){ prompt('Copie o código:',codTerc); } };
      if((b=boxTerc.querySelector('[data-cancelar]'))) b.onclick=async function(){
        if(!confirm('Cancelar o código? A pessoa não poderá mais retirar com ele.')) return;
        this.disabled=true;
        var r=await chamar({acao:'cancelar'});
        erro=r.error||''; aviso2=r.error?'':'Código cancelado. Ninguém mais consegue retirar com ele.'; if(r.retirada) ret=r.retirada; codTerc=''; desenharTerc();
      };
    }
    boxRot.innerHTML='<h2>Seu código de retirada</h2><p>Gerando o código…</p>';
    (async function(){ var r=await chamar({acao:'estado'}); if(r.retirada) aplicar(r); buscarRot(); })();
    tIntervalo=setInterval(tick,1000);
  }
  window.RetiradaPublica = { montar: montar };
})();
