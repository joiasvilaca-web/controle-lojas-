/* Retirada na loja — painel da EQUIPE (Pedido, Venda e Orçamento), 09/11.
 * A entrega só sai com o CÓDIGO que o cliente mostra no link da via (6 dígitos, muda a cada minuto)
 * ou com o código de TERCEIRO (o cliente informa o nome de quem busca e gera o código no link).
 * A loja nunca vê o código gerado: só confere o que a pessoa mostrar, e registra QUEM RECEBEU.
 * Uso: const r = await RetiradaTerceiro.abrir({ tipo:'os'|'venda'|'orc', id, via, cliente, telefone, senha, usuario, nivel, lojaId, aoConcluir })
 *      r = { retirada:{recebidoPor, metodo, portador, usadoEm, usadoPor…} } ao concluir, ou null se fechar sem concluir.
 */
(function(){
  var URL_FN = (window.SUPABASE_URL || 'https://wxiokmqnjtgbejgoepch.supabase.co') + '/functions/v1/retirada-terceiro';
  var BASE = (window.APP_URL || 'https://vilaca.app') + '/';
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
  var METODO = { rotativo:'código do cliente (rotativo)', terceiro:'código de terceiro', sem_codigo:'SEM código (liberado pela gerência)' };
  function norm(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z ]/g,' ').split(/\s+/).filter(Boolean).sort().join(' '); }

  function abrir(o){
    return new Promise(function(resolve){
      css();
      var ov=document.createElement('div'); ov.className='rt-ov'; ov.innerHTML='<div class="rt-box" role="dialog" aria-modal="true" aria-label="Retirada na loja"><div class="rt-sub">Carregando…</div></div>';
      document.body.appendChild(ov);
      var box=ov.firstChild, resultado=null;
      function fechar(){ ov.remove(); document.removeEventListener('keydown',esc_); resolve(resultado); }
      function esc_(e){ if(e.key==='Escape') fechar(); }
      document.addEventListener('keydown',esc_);
      var base={ tipo:o.tipo, id:o.id, senha:o.senha, por:o.usuario, saldoConferido:!!o.saldoConferido };
      var link=linkCliente(o.tipo,o.id);
      var podeSem = /^(diretoria|gerente)$/i.test(String(o.nivel||''));

      async function desenhar(msg, cls){
        var r=await chamar(Object.assign({acao:'historico'},base));
        if(r.error && !r.retirada){ box.innerHTML='<h3>'+ic('usuario',18)+' Retirada na loja</h3><div class="rt-msg err">'+esc(r.error)+'</div><div class="rt-row"><button class="rt-btn" data-x>Fechar</button></div>'; box.querySelector('[data-x]').onclick=fechar; return; }
        var ret=r.retirada||{}, usado=ret.status==='usado';
        if(usado && !resultado && o.retomar) resultado={ retirada:ret };   // código já conferido antes: o pedido ainda pode ser finalizado
        var tel=String(o.telefone||'').replace(/\D/g,''); if(tel && tel.length<=11) tel='55'+tel;
        var txt='Olá'+(o.cliente?', '+String(o.cliente).split(' ')[0]:'')+'! Acompanhe sua via na Vilaça Joias e veja o código para retirar na loja: '+link;
        box.innerHTML =
          '<h3>'+ic('usuario',18)+' Retirada na loja</h3>'
         +'<div class="rt-sub">'+esc(o.via?('Via '+o.via+' · '):'')+esc(o.cliente||r.cliente||'')+'</div>'
         +(usado
            ? '<div class="rt-estado"><b>Retirada concluída</b><span>Recebida por <b style="display:inline">'+esc(ret.recebidoPor||'—')+'</b> em '+dh(ret.usadoEm)+' · '+esc(METODO[ret.metodo]||ret.metodo||'')+(ret.usadoPor?' · liberada por '+esc(ret.usadoPor):'')+'</span></div>'
            : '<p style="margin:0 0 8px;">Peça ao cliente o <b>código que aparece agora no link da via</b> (6 dígitos, muda a cada minuto) — ou o código de terceiro, se outra pessoa estiver retirando.</p>'
             +(ret.status==='ativo' && ret.portador?'<div class="rt-estado"><b>Cliente autorizou: '+esc(ret.portador)+'</b><span>Código de terceiro gerado em '+dh(ret.geradoEm)+'</span></div>':'')
             +'<div class="rt-row" style="align-items:center;"><input class="rt-cod" maxlength="6" autocomplete="off" inputmode="text" spellcheck="false" placeholder="______" aria-label="Código de retirada" style="width:190px;"><button class="rt-btn pri" data-conf>Conferir código</button></div>'
             +'<div data-fluxo></div>'
             +'<div class="rt-row">'+(tel?'<button class="rt-btn" type="button" data-wa>Reenviar link ao cliente</button>':'')+'<button class="rt-btn" data-copy>Copiar link</button></div>')
         +(msg?'<div class="rt-msg '+(cls||'')+'">'+esc(msg)+'</div>':'')
         +'<div class="rt-row" style="justify-content:space-between;margin-top:14px;">'+(!usado&&podeSem?'<button class="rt-btn perigo" data-sem>Entregar sem código…</button>':'<span></span>')+'<button class="rt-btn" data-x>Fechar</button></div>'
         +((r.historico||[]).length?'<div class="rt-hist"><b>Registro</b>'+r.historico.slice().reverse().map(function(h){ return '<div>'+dh(h.em)+' — '+esc(h.acao)+(h.por?' · '+esc(h.por):'')+'</div>'; }).join('')+'</div>':'');
        box.querySelector('[data-x]').onclick=fechar;
        var b;
        if((b=box.querySelector('[data-wa]'))) b.onclick=async function(){
          if(window.MarketingOff && !(await MarketingOff.permitir({ telefone:o.telefone, nome:o.cliente }))) return;
          if(window.WhatsAuto){ WhatsAuto.enviar({ telefone:tel, texto:txt, lojaId:o.lojaId||'', senha:o.senha, tipo:'retirada', registroId:o.id||'', via:o.via||'' }); return; }
          var a=document.createElement('a'); a.href='https://wa.me/'+tel+'?text='+encodeURIComponent(txt); a.target='_blank'; a.rel='noopener'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        };
        if((b=box.querySelector('[data-copy]'))) b.onclick=function(){ try{ navigator.clipboard.writeText(link); this.textContent='Link copiado'; }catch(e){ prompt('Copie o link:',link); } };
        if(usado) return;
        var inp=box.querySelector('.rt-cod');
        inp.addEventListener('input',function(){ inp.value=inp.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6); });
        inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ var c=box.querySelector('[data-conf]'); if(c && !c.disabled) c.click(); } });
        setTimeout(function(){ inp.focus(); },50);

        function pedirNome(fl, v, codigo){
          var terc = v.metodo==='terceiro';
          var sugestao = terc ? '' : (v.cliente||o.cliente||'');
          var saldoHtml = v.saldo>0.009 ? '<div class="rt-saldo"><b>Há saldo de '+brl(v.saldo)+'.</b><br>Lance o pagamento na via e depois confirme a entrega. Se a pessoa não pagar, não entregue.</div>' : '';
          fl.innerHTML = '<div class="rt-msg ok">Código correto ('+esc(METODO[v.metodo]||'')+').'+(terc&&v.portador?' O cliente autorizou: <b>'+esc(v.portador)+'</b>.':'')+'</div>'+saldoHtml
            +'<div style="margin-top:10px;font-weight:700;">Quem está recebendo?</div>'
            +'<div class="rt-row"><input class="rt-nome" maxlength="80" value="'+esc(sugestao)+'" placeholder="Nome de quem recebeu" aria-label="Nome de quem recebeu" style="flex:1;min-height:38px;padding:0 10px;border-radius:8px;border:1px solid var(--t-line-strong,#bcc);background:var(--t-field,#fff);color:inherit;font:inherit;text-transform:uppercase;"></div>'
            +(terc?'':'<div class="rt-sub" style="margin:0;">O código é do cliente: o nome dele já vem preenchido. Corrija se outra pessoa estiver recebendo.</div>')
            +'<div class="rt-row"><button class="rt-btn pri" data-lib>'+ic('check',15)+' Confirmar entrega</button>'+(terc&&v.saldo>0.009?'<button class="rt-btn perigo" data-inv>Não pagou — invalidar código</button>':'')+'</div>';
          var nm=fl.querySelector('.rt-nome'); if(!sugestao) setTimeout(function(){ nm.focus(); },30);
          fl.querySelector('[data-lib]').onclick=async function(){
            var nome=nm.value.trim();
            if(nome.length<3){ nm.focus(); return; }
            if(terc && v.portador && norm(v.portador)!==norm(nome) && !confirm('O cliente autorizou "'+v.portador+'", mas você digitou "'+nome+'". Confirmar mesmo assim?')) return;
            this.disabled=true;
            var y=await chamar(Object.assign({acao:'concluir',codigo:codigo,lojaId:o.lojaId,recebidoPor:nome},base));
            if(y.error){ fl.insertAdjacentHTML('beforeend','<div class="rt-msg err">'+esc(y.error)+'</div>'); this.disabled=false; return; }
            resultado={ retirada:y.retirada };
            try{ if(typeof o.aoConcluir==='function') await o.aoConcluir(y.retirada); }catch(e){ console.error(e); }
            desenhar('Retirada registrada.','ok');
          };
          var inv=fl.querySelector('[data-inv]');
          if(inv) inv.onclick=async function(){ if(!confirm('Invalidar o código? O cliente será avisado e precisará gerar outro.')) return; var y=await chamar(Object.assign({acao:'invalidar',codigo:codigo,motivo:'Saldo não foi pago na retirada'},base)); desenhar(y.error||'Código invalidado.', y.error?'err':'ok'); };
        }
        box.querySelector('[data-conf]').onclick=async function(){
          var cod=inp.value.trim(); if(cod.length<4){ inp.focus(); return; }
          this.disabled=true;
          var v=await chamar(Object.assign({acao:'validar',codigo:cod},base));
          this.disabled=false;
          var fl=box.querySelector('[data-fluxo]');
          if(v.error){ fl.innerHTML='<div class="rt-msg err">'+esc(v.error)+'</div>'; inp.select(); return; }
          inp.disabled=true; this.style.display='none';
          pedirNome(fl, v, cod);
        };
        if((b=box.querySelector('[data-sem]'))) b.onclick=async function(){
          var motivo=(prompt('Entregar SEM o código — explique o motivo (fica registrado no pedido):')||'').trim();
          if(motivo.length<5){ return; }
          var nome=(prompt('Nome de quem está recebendo:')||'').trim();
          if(nome.length<3) return;
          var y=await chamar(Object.assign({acao:'semcodigo',motivo:motivo,recebidoPor:nome,lojaId:o.lojaId},base));
          if(y.error){ desenhar(y.error,'err'); return; }
          resultado={ retirada:y.retirada };
          try{ if(typeof o.aoConcluir==='function') await o.aoConcluir(y.retirada); }catch(e){ console.error(e); }
          desenhar('Entrega registrada sem código.','ok');
        };
      }
      desenhar();
    });
  }
  /* Antes havia uma caixa na via para liberar a retirada por terceiros. Agora o código rotativo vale sempre
   * e o cliente gera o código de terceiro direto no link: as duas funções ficam só por compatibilidade. */
  function checkboxHtml(){ return ''; }
  async function habilitarSeMarcado(){ return null; }
  window.RetiradaTerceiro = { abrir: abrir, linkCliente: linkCliente, checkboxHtml: checkboxHtml, habilitarSeMarcado: habilitarSeMarcado };
})();
