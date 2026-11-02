/* Retirada por terceiros — painel da EQUIPE (Pedido, Venda e Orçamento).
 * A loja libera a retirada por terceiros na via; o CLIENTE gera o código (4 caracteres) no link
 * e repassa ao portador. A loja nunca vê o código: só confere o que o portador falar.
 * Uso: RetiradaTerceiro.abrir({ tipo:'os'|'venda'|'orc', id, via, cliente, telefone, senha, usuario, lojaId, aoConcluir })
 */
(function(){
  var URL_FN = 'https://wxiokmqnjtgbejgoepch.supabase.co/functions/v1/retirada-terceiro';
  var BASE = 'https://vilaca.app/';
  function anon(){ try{ return SUPABASE_ANON_KEY; }catch(e){ return ''; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function ic(n,t){ return window.Icone ? Icone(n,{tam:t||16}) : ''; }
  function brl(v){ return 'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function dh(s){ if(!s) return '—'; var d=new Date(s); return isNaN(d)?'—':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  function linkCliente(tipo,id){ return tipo==='os' ? BASE+'acompanhar.html?id='+encodeURIComponent(id) : BASE+'via.html?t='+tipo+'&id='+encodeURIComponent(id); }
  async function chamar(body){
    try{
      var r = await fetch(URL_FN,{ method:'POST', headers:{'Content-Type':'application/json', apikey:anon(), Authorization:'Bearer '+anon()}, body:JSON.stringify(body) });
      return await r.json();
    }catch(e){ return { error:'Sem conexão com o servidor. Tente de novo.' }; }
  }
  var CSS = '.rt-ov{position:fixed;inset:0;z-index:9000;background:rgba(10,20,30,.45);display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto;}'
   +'.rt-box{background:var(--t-surface,#fff);color:var(--t-ink,#111);border-radius:14px;max-width:520px;width:100%;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.25);font-size:14px;}'
   +'.rt-box h3{margin:0 0 4px;font-size:18px;display:flex;align-items:center;gap:8px;}'
   +'.rt-sub{color:var(--t-ink-faint,#667);font-size:13px;margin-bottom:14px;}'
   +'.rt-estado{padding:10px 12px;border-radius:10px;background:var(--t-surface-2,#f3f5f7);border:1px solid var(--t-line,#dde);margin-bottom:12px;}'
   +'.rt-estado b{display:block;margin-bottom:2px;}'
   +'.rt-row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;}'
   +'.rt-btn{border:1px solid var(--t-line-strong,#bcc);background:var(--t-surface,#fff);color:inherit;border-radius:8px;padding:0 14px;min-height:38px;font:inherit;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;}'
   +'.rt-btn.pri{background:var(--t-primary-strong,#1f5f7a);border-color:var(--t-primary-strong,#1f5f7a);color:#fff;}'
   +'.rt-btn.perigo{color:var(--t-danger,#b3261e);border-color:var(--t-danger,#b3261e);}'
   +'.rt-btn:disabled{opacity:.55;cursor:default;}'
   +'.rt-cod{font:700 26px/1 ui-monospace,Menlo,monospace;letter-spacing:.35em;text-transform:uppercase;width:150px;text-align:center;padding:8px 6px;border-radius:10px;border:1.5px solid var(--t-line-strong,#bcc);background:var(--t-field,#eef4f8);color:inherit;}'
   +'.rt-msg{margin-top:8px;font-size:13px;font-weight:600;}'
   +'.rt-msg.err{color:var(--t-danger,#b3261e);} .rt-msg.ok{color:var(--t-ok,#0f6b40);}'
   +'.rt-saldo{margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--t-warning,#b7791f);background:var(--t-warning-soft,#fff7e6);}'
   +'.rt-hist{margin-top:14px;border-top:1px solid var(--t-line,#dde);padding-top:10px;font-size:12.5px;color:var(--t-ink-soft,#445);max-height:180px;overflow:auto;}'
   +'.rt-hist div{padding:3px 0;}';
  function css(){ if(document.getElementById('rtCss')) return; var s=document.createElement('style'); s.id='rtCss'; s.textContent=CSS; document.head.appendChild(s); }
  var ROT = { sem_codigo:'Liberada — o cliente ainda não gerou o código', ativo:'Código gerado pelo cliente', usado:'Retirada concluída pelo portador', invalidado:'Código invalidado', bloqueado:'Código bloqueado por tentativas erradas' };

  async function abrir(o){
    css();
    var ov=document.createElement('div'); ov.className='rt-ov'; ov.innerHTML='<div class="rt-box" role="dialog" aria-modal="true" aria-label="Retirada por terceiros"><div class="rt-sub">Carregando…</div></div>';
    document.body.appendChild(ov);
    var box=ov.firstChild;
    function fechar(){ ov.remove(); document.removeEventListener('keydown',esc_); }
    function esc_(e){ if(e.key==='Escape') fechar(); }
    document.addEventListener('keydown',esc_);
    ov.addEventListener('click',function(e){ if(e.target===ov) fechar(); });
    var base={ tipo:o.tipo, id:o.id, senha:o.senha, por:o.usuario };
    var link=linkCliente(o.tipo,o.id);
    var codigoOk='';

    async function desenhar(msg, cls){
      var r=await chamar(Object.assign({acao:'historico'},base));
      if(r.error && !r.retirada){ box.innerHTML='<h3>'+ic('usuario',18)+' Retirada por terceiros</h3><div class="rt-msg err">'+esc(r.error)+'</div><div class="rt-row"><button class="rt-btn" data-x>Fechar</button></div>'; box.querySelector('[data-x]').onclick=fechar; return; }
      var ret=r.retirada||{}, hab=!!ret.habilitada, st=ret.status||'sem_codigo';
      var tel=String(o.telefone||'').replace(/\D/g,''); if(tel && tel.length<=11) tel='55'+tel;
      var txt='Olá'+(o.cliente?', '+String(o.cliente).split(' ')[0]:'')+'! Acompanhe sua via na Vilaça Joias'+(hab?' e, se outra pessoa for retirar, gere o código de retirada por terceiros':'')+': '+link;
      var estadoTxt = !hab ? (st==='usado' ? ROT.usado : 'Desligada — só o próprio cliente retira.') : (ROT[st]||st);
      var det = st==='ativo' ? 'Gerado em '+dh(ret.geradoEm)+(r.tentativas?' · '+r.tentativas+' tentativa(s) errada(s)':'')
             : st==='usado' ? 'Em '+dh(ret.usadoEm)+(ret.usadoPor?' · liberado por '+esc(ret.usadoPor):'')+(ret.loja?' · '+esc(ret.loja):'')
             : (st==='invalidado'||st==='bloqueado') ? esc(ret.motivo||'')+' — o cliente pode gerar um novo código no link.' : '';
      var podeConferir = hab && st==='ativo';
      box.innerHTML =
        '<h3>'+ic('usuario',18)+' Retirada por terceiros</h3>'
       +'<div class="rt-sub">'+esc(o.via?('Via '+o.via+' · '):'')+esc(o.cliente||'')+'</div>'
       +'<div class="rt-estado"><b>'+esc(estadoTxt)+'</b>'+(det?'<span>'+det+'</span>':'')+'</div>'
       +(st==='usado' ? '' : (!hab
          ? '<p style="margin:0 0 6px;">Libere quando o cliente pedir para outra pessoa retirar. Ele gera o código no link da via e repassa ao portador.</p><div class="rt-row"><button class="rt-btn pri" data-hab>'+ic('check',15)+' Liberar retirada por terceiros</button></div>'
          : '<div class="rt-row">'+(tel?'<a class="rt-btn" target="_blank" rel="noopener" href="https://wa.me/'+tel+'?text='+encodeURIComponent(txt)+'">Enviar link ao cliente (WhatsApp)</a>':'')+'<button class="rt-btn" data-copy>Copiar link</button></div>'
           +'<div style="margin-top:12px;font-weight:700;">Recebido com código</div>'
           +'<div class="rt-row" style="align-items:center;"><input class="rt-cod" maxlength="4" autocomplete="off" spellcheck="false" placeholder="____" '+(podeConferir?'':'disabled')+' aria-label="Código do portador"><button class="rt-btn pri" data-conf '+(podeConferir?'':'disabled')+'>Conferir código</button></div>'
           +(podeConferir?'':'<div class="rt-sub" style="margin:0;">'+(st==='sem_codigo'?'Aguardando o cliente gerar o código no link.':'Peça ao cliente para gerar um novo código no link.')+'</div>')
           +'<div data-fluxo></div>'
         ))
       +(msg?'<div class="rt-msg '+(cls||'')+'">'+esc(msg)+'</div>':'')
       +'<div class="rt-row" style="justify-content:space-between;margin-top:14px;">'+(hab&&st!=='usado'?'<button class="rt-btn perigo" data-deslig>Desligar retirada por terceiros</button>':'<span></span>')+'<button class="rt-btn" data-x>Fechar</button></div>'
       +((r.historico||[]).length?'<div class="rt-hist"><b>Registro</b>'+r.historico.slice().reverse().map(function(h){ return '<div>'+dh(h.em)+' — '+esc(h.acao)+(h.por?' · '+esc(h.por):'')+'</div>'; }).join('')+'</div>':'');
      box.querySelector('[data-x]').onclick=fechar;
      var b;
      if((b=box.querySelector('[data-hab]'))) b.onclick=async function(){ this.disabled=true; var x=await chamar(Object.assign({acao:'habilitar',on:true},base)); desenhar(x.error||'Retirada por terceiros liberada. Envie o link ao cliente.', x.error?'err':'ok'); };
      if((b=box.querySelector('[data-deslig]'))) b.onclick=async function(){ if(!confirm('Desligar a retirada por terceiros? O código atual deixa de valer.')) return; var x=await chamar(Object.assign({acao:'habilitar',on:false},base)); desenhar(x.error||'Retirada por terceiros desligada.', x.error?'err':'ok'); };
      if((b=box.querySelector('[data-copy]'))) b.onclick=function(){ try{ navigator.clipboard.writeText(link); this.textContent='Link copiado'; }catch(e){ prompt('Copie o link:',link); } };
      var inp=box.querySelector('.rt-cod');
      if(inp){ inp.addEventListener('input',function(){ inp.value=inp.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4); }); inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ var c=box.querySelector('[data-conf]'); if(c && !c.disabled) c.click(); } }); if(podeConferir) setTimeout(function(){ inp.focus(); },50); }
      if((b=box.querySelector('[data-conf]'))) b.onclick=async function(){
        var cod=inp.value.trim(); if(cod.length!==4){ inp.focus(); return; }
        this.disabled=true;
        var x=await chamar(Object.assign({acao:'validar',codigo:cod},base));
        if(x.error){ desenhar(x.error,'err'); return; }
        codigoOk=cod;
        var fl=box.querySelector('[data-fluxo]');
        if(x.saldo>0.009){
          fl.innerHTML='<div class="rt-saldo"><b>Código correto, mas há saldo de '+brl(x.saldo)+'.</b><br>O portador precisa pagar o saldo. Lance o pagamento na via e depois clique em liberar. Se não pagar, invalide o código (o cliente é avisado no link).</div>'
            +'<div class="rt-row"><button class="rt-btn pri" data-lib>Saldo pago — liberar retirada</button><button class="rt-btn perigo" data-inv>Não pagou — invalidar código</button></div>';
        } else {
          fl.innerHTML='<div class="rt-msg ok">Código correto. Confira a mercadoria e confirme a entrega ao portador.</div><div class="rt-row"><button class="rt-btn pri" data-lib>'+ic('check',15)+' Confirmar retirada pelo portador</button></div>';
        }
        fl.querySelector('[data-lib]').onclick=async function(){
          this.disabled=true;
          var y=await chamar(Object.assign({acao:'concluir',codigo:codigoOk,lojaId:o.lojaId},base));
          if(y.error){ fl.insertAdjacentHTML('beforeend','<div class="rt-msg err">'+esc(y.error)+'</div>'); this.disabled=false; return; }
          try{ if(typeof o.aoConcluir==='function') await o.aoConcluir(y.retirada); }catch(e){ console.error(e); }
          desenhar('Retirada registrada. O cliente vê no link que o portador retirou.','ok');
        };
        var inv=fl.querySelector('[data-inv]');
        if(inv) inv.onclick=async function(){ if(!confirm('Invalidar o código? O cliente será avisado e precisará gerar outro.')) return; var y=await chamar(Object.assign({acao:'invalidar',codigo:codigoOk,motivo:'Saldo não foi pago na retirada'},base)); desenhar(y.error||'Código invalidado. O cliente vê o aviso no link.', y.error?'err':'ok'); };
      };
    }
    desenhar();
  }
  /* Caixa "Retirada por terceiros" no formulário da via: marcada, libera o gerador de código no link do cliente ao salvar. */
  function checkboxHtml(marcado){
    return '<label style="display:inline-flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;cursor:pointer;margin-top:12px;padding:8px 12px;border:1px solid var(--t-line-strong,#bcc);border-radius:8px;">'
      + '<input type="checkbox" id="chkRetiradaTerceiro" style="width:auto;margin:0;"'+(marcado?' checked':'')+'> Retirada por terceiros <span style="font-weight:400;color:var(--t-ink-faint,#667);">— o cliente gera o código no link</span></label>';
  }
  async function habilitarSeMarcado(o){
    var c = document.getElementById('chkRetiradaTerceiro');
    if(!c || !c.checked) return null;
    var r = await chamar({ acao:'habilitar', on:true, tipo:o.tipo, id:o.id, senha:o.senha, por:o.usuario });
    if(r && r.error) console.error('retirada por terceiros', r.error);
    return r;
  }
  window.RetiradaTerceiro = { abrir: abrir, linkCliente: linkCliente, checkboxHtml: checkboxHtml, habilitarSeMarcado: habilitarSeMarcado };
})();
