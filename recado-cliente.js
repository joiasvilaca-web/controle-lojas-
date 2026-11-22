/* RECADO PARA O CLIENTE em observação de pendência (18/11).
 * A Oficina para uma via (PENDÊNCIA) e deixa uma observação INTERNA para a loja. A vendedora pode escrever um RECADO para o cliente em cima dessa
 * observação: o recado fica guardado na própria observação (obs.recado = {texto, por, em, enviadoEm, enviadoPor, filaEm}) e sai pelo WhatsApp SÓ quando
 * alguém clica no botão (ação humana). O que vai ao cliente é apenas o STATUS da via e o texto do recado — a observação da Oficina nunca vai.
 * Usado por: painel-ordens.html (barra "aguardam a sua ciência") e avisos.html (lista "Vias em pendência").
 *
 * RecadoCliente.linhaHtml(order, ob)                    → HTML do recado (símbolo + texto + visto de enviado + botões) ou só o botão "Recado ao cliente"
 * RecadoCliente.ligar(container, ctx)                   → liga os botões dentro do container. ctx:
 *      achar(orderId, obsId) → { order, ob } | null           (registro em memória da tela)
 *      gravar(orderId, obsId, recadoOuNull) → Promise<bool>   (grava o recado na observação, no servidor)
 *      senha, nomeUsuario, lojaNome(lojaId), statusNome(order), aoMudar()  (aoMudar: a tela se redesenha)
 * RecadoCliente.textoCliente(order, recado, statusNome) → texto que vai ao cliente (para teste)
 * RecadoCliente.cienteHtml(order, ob)                   → 22/11: botão "Ciente" da observação (ou o selo "Ciente: NOME · data"). Precisa de ctx.ciente(orderId, obsId) → Promise<bool>.
 */
(function(){
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function ic(n,t){ return window.Icone ? window.Icone(n, t?{tam:t}:undefined) : ''; }
  function dh(s){ if(!s) return ''; var d=new Date(s); return isNaN(d)?'':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }
  function aviso(m){ try{ if(typeof window.showToast==='function') window.showToast(m); else alert(m); }catch(e){} }
  var CSS='.rc-ov{position:fixed;inset:0;z-index:9600;background:rgba(10,20,30,.5);display:flex;align-items:flex-start;justify-content:center;padding:6vh 12px;overflow:auto;}'
   +'.rc-modal{background:var(--t-surface,#fff);color:var(--t-text,#14202b);border:1px solid var(--t-line,#dde);border-radius:14px;max-width:520px;width:100%;padding:18px;box-shadow:0 18px 50px rgba(0,0,0,.25);box-sizing:border-box;}'
   +'.rc-modal h3{margin:0 0 6px;font-size:17px;} .rc-modal p{margin:0 0 10px;font-size:13.5px;line-height:1.45;color:var(--t-text-soft,#445);}'
   +'.rc-modal textarea{width:100%;box-sizing:border-box;min-height:120px;padding:10px 12px;border-radius:10px;border:1px solid var(--t-line-strong,#8a98a5);background:var(--t-field,#fff);color:inherit;font:inherit;font-size:15px;resize:vertical;}'
   +'.rc-previa{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:var(--t-surface-2,#f4f6f8);font-size:13px;line-height:1.45;color:var(--t-text-soft,#445);white-space:pre-wrap;}'
   +'.rc-previa b{color:var(--t-text,#14202b);}'
   +'.rc-acoes{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px;}'
   +'.rc-b{min-height:40px;padding:0 14px;border-radius:8px;border:1px solid var(--t-line-strong,#8a98a5);background:var(--t-surface,#fff);color:inherit;font:inherit;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;}'
   +'.rc-b.pri{background:var(--t-primary-strong,#1f5f7a);border-color:var(--t-primary-strong,#1f5f7a);color:#fff;} .rc-b:disabled{opacity:.6;cursor:default;}'
   +'.rc-b.sm{min-height:32px;padding:0 10px;font-size:12.5px;} .rc-b.wa{border-color:var(--t-ok,#0f6b40);color:var(--t-ok,#0f6b40);}'
   +'.rc-linha{margin-top:6px;padding:8px 10px;border-radius:10px;background:var(--t-surface-2,#f4f6f8);border:1px solid var(--t-line,#dde);}'
   +'.rc-top{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;font-weight:700;color:var(--t-primary-strong,#1f5f7a);}'
   +'.rc-txt{margin:4px 0;white-space:pre-wrap;font-size:13.5px;line-height:1.45;color:var(--t-text,#14202b);font-weight:400;}'
   +'.rc-sent{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:var(--t-ok,#0f6b40);} .rc-fila{font-size:12px;font-weight:700;color:var(--t-wait,#8a5a00);}'
   +'.rc-btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;}';
  function css(){ if(document.getElementById('rcCss')) return; var s=document.createElement('style'); s.id='rcCss'; s.textContent=CSS; document.head.appendChild(s); }

  /** O que vai ao cliente: a situação da via + o que a vendedora escreveu. Nada da observação da Oficina. */
  function textoCliente(order, recado, statusNome){
    var via=(order&&(order.codigoVia||order.via))||'';
    var st=statusNome?String(statusNome(order)||''):'';
    var cab='Atualização do seu pedido'+(via?' '+via:'')+(st?' — situação: *'+st+'*':'')+'.';
    return cab+' '+String((recado&&recado.texto)||'').trim();
  }
  function rodape(ctx, order){
    var l=ctx.lojaNome?ctx.lojaNome(order.lojaId):'';
    return '\n\n—\n'+(ctx.nomeUsuario?ctx.nomeUsuario+' · ':'')+(l||'Vilaça Joias')+'\nPara continuar a conversa, é só responder esta mensagem.';
  }
  function celularOk(t){ var d=String(t||'').replace(/\D/g,''); if(d.length===13&&d.indexOf('55')===0) d=d.slice(2); return d.length===11 && Number(d.slice(0,2))>=11 && d.charAt(2)==='9'; }

  function linhaHtml(order, ob){
    var r=ob&&ob.recado;
    var ids='data-oid="'+esc(order.id)+'" data-obid="'+esc(ob.id)+'"';
    if(!r||!r.texto) return '<div class="rc-btns"><button type="button" class="rc-b sm" data-rc="editar" '+ids+'>'+ic('mensagem',14)+' Escrever recado para o cliente</button></div>';
    var estado=r.enviadoEm?'<span class="rc-sent" title="Enviado ao cliente por '+esc(r.enviadoPor||'')+'">'+ic('check',13)+' Enviado '+esc(dh(r.enviadoEm))+(r.enviadoPor?' · '+esc(r.enviadoPor):'')+'</span>'
      :(r.filaEm?'<span class="rc-fila">Na fila de envio…</span>':'');
    return '<div class="rc-linha"><div class="rc-top">'+ic('mensagem',14)+' Recado para o cliente'+(r.por?' <span class="muted" style="font-weight:500;">· '+esc(r.por)+'</span>':'')+' '+estado+'</div>'
      +'<div class="rc-txt">'+esc(r.texto)+'</div>'
      +'<div class="rc-btns"><button type="button" class="rc-b sm wa" data-rc="enviar" '+ids+' title="'+(r.enviadoEm?'Enviar de novo pelo WhatsApp':'Enviar ao cliente pelo WhatsApp')+'">'+ic('whatsapp',14)+' '+(r.enviadoEm?'Enviar de novo':'Enviar pelo WhatsApp')+'</button>'
      +'<button type="button" class="rc-b sm" data-rc="editar" '+ids+'>'+ic('lapis',14)+' Editar</button></div></div>';
  }

  function abrirEditor(order, ob, ctx, aoFechar){
    css();
    var r=ob.recado||{};
    var ov=document.createElement('div'); ov.className='rc-ov';
    ov.innerHTML='<div class="rc-modal" role="dialog" aria-modal="true" aria-label="Recado para o cliente"><h3>Recado para o cliente</h3>'
      +'<p>Cliente: <b>'+esc(order.cliente||'—')+'</b>'+(order.codigoVia?' · via '+esc(order.codigoVia):'')+'. Escreva só o que o cliente precisa saber. A observação da Oficina é interna e <b>não vai</b> junto.</p>'
      +'<textarea data-t maxlength="600" placeholder="Ex.: Precisamos que você passe na loja para escolher a pedra. Podemos combinar um horário?">'+esc(r.texto||'')+'</textarea>'
      +'<div class="rc-previa" data-p></div><div data-e style="color:var(--t-danger,#b3261e);font-size:13px;min-height:1.2em;margin-top:6px;"></div>'
      +'<div class="rc-acoes">'+(r.texto?'<button type="button" class="rc-b" data-rem style="margin-right:auto;">Apagar recado</button>':'')+'<button type="button" class="rc-b" data-x>Cancelar</button><button type="button" class="rc-b pri" data-s>Salvar</button></div></div>';
    document.body.appendChild(ov);
    var t=ov.querySelector('[data-t]'), pv=ov.querySelector('[data-p]'), er=ov.querySelector('[data-e]');
    function previa(){ var tx=t.value.trim(); pv.innerHTML='<b>O cliente vai ler:</b><br>'+esc(tx?textoCliente(order,{texto:tx},ctx.statusNome):'(escreva o recado)'); }
    t.oninput=function(){ er.textContent=''; previa(); }; previa(); setTimeout(function(){ t.focus(); },50);
    function fecha(){ ov.remove(); if(aoFechar) aoFechar(); }
    ov.querySelector('[data-x]').onclick=fecha;
    ov.addEventListener('mousedown',function(e){ if(e.target===ov) fecha(); });
    ov.addEventListener('keydown',function(e){ if(e.key==='Escape') fecha(); });
    var rem=ov.querySelector('[data-rem]');
    if(rem) rem.onclick=async function(){ if(!confirm('Apagar este recado?')) return; rem.disabled=true; var ok=await ctx.gravar(order.id,ob.id,null); if(!ok){ er.textContent='Não foi possível apagar. Tente de novo.'; rem.disabled=false; return; } ov.remove(); if(ctx.aoMudar) ctx.aoMudar(); };
    ov.querySelector('[data-s]').onclick=async function(){
      var tx=t.value.trim(); if(tx.length<3){ er.textContent='Escreva o recado.'; return; }
      this.disabled=true; this.textContent='Salvando…';
      var novo={ texto:tx, por:ctx.nomeUsuario||'', em:new Date().toISOString() };   // editar zera o visto de enviado: é outra mensagem
      var ok=await ctx.gravar(order.id,ob.id,novo);
      if(!ok){ er.textContent='Não foi possível salvar. Tente de novo.'; this.disabled=false; this.textContent='Salvar'; return; }
      ov.remove(); aviso('Recado salvo. Use o botão do WhatsApp para enviar ao cliente.'); if(ctx.aoMudar) ctx.aoMudar();
    };
    t.focus();
  }

  var enviando=false;
  async function enviar(order, ob, ctx, botao){
    var r=ob.recado; if(!r||!r.texto||enviando) return;
    if(String(window.SUPABASE_URL||'').indexOf('mpgkvstzigeaimuynpxc')>=0){ aviso('TREINAMENTO: o envio de WhatsApp fica desligado aqui — nada sai para clientes.'); return; }
    if(!celularOk(order.telefone)){ aviso('O telefone deste pedido está fora do padrão de celular (DDD + 9 + 8 dígitos). Corrija o telefone antes de enviar.'); return; }
    if(window.MarketingOff && typeof window.MarketingOff.permitir==='function' && !(await window.MarketingOff.permitir({ telefone:order.telefone, nome:order.cliente }))) return;
    if(!confirm('Enviar este recado para '+(order.cliente||'o cliente')+' pelo WhatsApp?\n\n'+textoCliente(order,r,ctx.statusNome))) return;
    enviando=true; if(botao){ botao.disabled=true; }
    aviso('Enviando pelo WhatsApp…');
    var j={};
    try{
      var res=await fetch((window.SUPABASE_URL||'')+'/functions/v1/enviar-via',{ method:'POST', headers:{ 'Content-Type':'application/json', apikey:window.SUPABASE_ANON_KEY, Authorization:'Bearer '+window.SUPABASE_ANON_KEY },
        body:JSON.stringify({ senha:ctx.senha, lojaId:order.lojaId||'', telefone:order.telefone, cliente:order.cliente||'', texto:textoCliente(order,r,ctx.statusNome)+rodape(ctx,order), tipo:'chamar_cliente', registroId:order.id, via:'RECADO '+(order.codigoVia||''), rotulo:'RECADO PENDÊNCIA' }) });
      j=await res.json().catch(function(){ return {}; });
    }catch(e){ j={ erro:'Sem conexão com o envio automático. Confira a internet e tente de novo.' }; }
    enviando=false; if(botao) botao.disabled=false;
    if(j && j.ok){
      await ctx.gravar(order.id,ob.id,Object.assign({},r,{ enviadoEm:new Date().toISOString(), enviadoPor:ctx.nomeUsuario||'', filaEm:null }));
      aviso('Recado enviado ao cliente ✓');
    } else if(j && j.enfileirado){
      await ctx.gravar(order.id,ob.id,Object.assign({},r,{ filaEm:new Date().toISOString() }));
      aviso((j.erro||'O envio entrou na fila.')+' O visto de enviado só aparece quando sair.');
    } else {
      aviso((j && (j.erro||j.error)) || 'Não foi possível enviar. Tente de novo.');
    }
    if(ctx.aoMudar) ctx.aoMudar();
  }

  /** 22/11: CIENTE da observação (pendência da Oficina): quem leu dá o ciente com o próprio nome. */
  function cienteHtml(order, ob){
    if(ob && ob.ciente) return '<span class="rc-sent" title="Ciente registrado">'+ic('check',13)+' Ciente: '+esc(ob.cienteNome||'')+(ob.cienteEm?' · '+esc(dh(ob.cienteEm)):'')+'</span>';
    return '<button type="button" class="rc-b sm pri" data-rc="ciente" data-oid="'+esc(order.id)+'" data-obid="'+esc(ob.id)+'" title="Marcar que você leu esta observação">'+ic('check',14)+' Ciente</button>';
  }
  function ligar(container, ctx){
    css();
    container.querySelectorAll('[data-rc]').forEach(function(b){
      b.addEventListener('click',function(e){
        e.stopPropagation(); e.preventDefault();
        var x=ctx.achar(b.dataset.oid,b.dataset.obid); if(!x) return;
        if(b.dataset.rc==='editar') abrirEditor(x.order,x.ob,ctx);
        else if(b.dataset.rc==='enviar') enviar(x.order,x.ob,ctx,b);
        else if(b.dataset.rc==='ciente' && ctx.ciente){ b.disabled=true; Promise.resolve(ctx.ciente(x.order.id,x.ob.id)).then(function(ok){ if(!ok){ b.disabled=false; aviso('Não foi possível dar o ciente. Tente de novo.'); return; } aviso('Ciente registrado.'); if(ctx.aoMudar) ctx.aoMudar(); }); }
      });
    });
  }
  window.RecadoCliente={ linhaHtml:linhaHtml, cienteHtml:cienteHtml, ligar:ligar, textoCliente:textoCliente, abrirEditor:abrirEditor, css:css };
})();
