/* acompanhamento-ui.js — seção "Ações de acompanhamento" IGUAL em Venda, Pedido e Orçamento (10/11).
 * AcompUI.desenhar(el, { sub, botaoHtml, prog:[item], env:[item], onAbrir(id), onEnviar(item), onBotao() })
 * item = { id, em (ms; >=9e14 = ainda sem horário), previsto (bool: só o dia previsto), via, cliente, acao, loja, vendedora }
 * Programados: data/hora que será enviado, via, cliente, ação, loja, vendedora e o ícone do WhatsApp (toque = envia agora).
 * Já enviados: data/hora do envio, via, cliente, ação, loja, vendedora e o ícone do WhatsApp VERDE com visto. */
(function(){
  var TZ = { timeZone:'America/Sao_Paulo' };
  var WA = '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 4.99L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.92 0-2.65-1.03-5.14-2.9-7.01A9.85 9.85 0 0 0 12.04 2m0 1.67a8.24 8.24 0 0 1 8.23 8.24c0 4.54-3.7 8.23-8.24 8.23a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23m-3.5 3.66c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49 2.5 1.08 3 .87 3.54.82.54-.05 1.74-.71 1.98-1.4.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35-.3-.15-1.74-.86-2.01-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.21-.24-.58-.48-.5-.67-.5z"/></svg>';
  var CK = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  function esc(t){ return String(t==null?'':t).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function dm(ms){ var p = new Date(ms).toLocaleDateString('pt-BR', Object.assign({ day:'2-digit', month:'2-digit' }, TZ)); return p; }
  function hm(ms){ return new Date(ms).toLocaleTimeString('pt-BR', Object.assign({ hour:'2-digit', minute:'2-digit' }, TZ)); }
  function quando(x, enviado){
    if(!enviado){
      if(x.previsto) return '<b>' + dm(x.em) + '</b><span>previsto</span>';
      if(x.em >= 9e14) return '<b>em breve</b><span>na fila</span>';
    }
    return '<b>' + dm(x.em) + '</b><span>' + hm(x.em) + '</span>';
  }
  function css(){
    if(document.getElementById('acompUiCss')) return;
    var s = document.createElement('style'); s.id = 'acompUiCss';
    s.textContent = '.secao-acomp{margin-top:32px;padding-top:6px;border-top:2px solid var(--line);} .secao-acomp:empty{display:none;} .secao-acomp > .page-head{margin-top:14px !important;}'
    + '.ac2-colunas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:start;margin:0 0 14px;} @media (max-width:900px){.ac2-colunas{grid-template-columns:minmax(0,1fr);}}'
    + '.ac2-col{margin:0 !important;padding:0;min-width:0;overflow:hidden;} .ac2-col h3{margin:0 !important;padding:12px 16px;font-size:15px;line-height:1.2;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line);}'
    + '.ac2-lista{list-style:none;margin:0 !important;padding:0 !important;max-height:420px;overflow-y:auto;} .ac2-lista>li{margin:0 !important;}'
    + '.ac2-item{display:flex;gap:12px;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line);cursor:pointer;} .ac2-item:last-child{border-bottom:0;} .ac2-item:hover{background:var(--primary-soft,#e8f0f6);}'
    + '.ac2-quando{flex:0 0 76px;display:flex;flex-direction:column;line-height:1.2;font-family:var(--mono,monospace);font-size:12px;color:var(--wait,#a15c00);} .ac2-quando b{font-size:13px;} .ac2-quando span{font-size:11.5px;opacity:.85;} .ac2-quando.ok{color:var(--ok,#1f8a4c);}'
    + '.ac2-corpo{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;} .ac2-l1{display:flex;align-items:baseline;gap:8px;min-width:0;} .ac2-via{font-family:var(--mono,monospace);flex:none;} .ac2-nome{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}'
    + '.ac2-sub{font-size:12px;color:var(--ink-faint,#6b7a88);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.ac2-zap{position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:0 !important;background:transparent !important;box-shadow:none !important;color:var(--ink-faint,#6b7a88);padding:0;cursor:default;font:inherit;border-radius:8px;}'
    + 'button.ac2-zap{cursor:pointer;} button.ac2-zap:hover{color:var(--ok,#1e9d55);background:var(--ok-soft,#e6f4ec) !important;}'
    + '.ac2-zap.ok{color:var(--ok,#1e9d55);} .ac2-zap.ok::after{content:"\\2713";position:absolute;top:50%;left:50%;transform:translate(-18%,-42%);z-index:2;font:900 14px/1 system-ui,sans-serif;color:#1e9d55;text-shadow:0 0 2px #fff,0 0 2px #fff,0 0 3px #fff;pointer-events:none;}'
    + '@media (max-width:640px){.ac2-item{padding:10px 12px;gap:10px;} .ac2-quando{flex-basis:70px;} .ac2-col h3{padding:11px 12px;}}';
    document.head.appendChild(s);
  }
  function linha(x, enviado){
    var zap = enviado
      ? '<span class="ac2-zap ok" title="Enviado por WhatsApp">' + WA + '</span>'
      : '<button type="button" class="ac2-zap" data-acenviar="' + esc(x.id) + '" title="Enviar agora pelo WhatsApp" aria-label="Enviar agora pelo WhatsApp">' + WA + '</button>';
    return '<li class="ac2-item" data-acabrir="' + esc(x.id) + '" title="Abrir"><span class="ac2-quando' + (enviado?' ok':'') + '">' + quando(x, enviado) + '</span>'
      + '<span class="ac2-corpo"><span class="ac2-l1"><b class="ac2-via">' + esc(x.via||'—') + '</b><span class="ac2-nome">' + esc(x.cliente||'—') + '</span></span>'
      + '<span class="ac2-sub">' + [x.acao, x.loja, x.vendedora].filter(Boolean).map(esc).join(' · ') + '</span></span>' + zap + '</li>';
  }
  window.AcompUI = { desenhar: function(el, o){
    css(); if(!el) return;
    var prog = o.prog || [], env = o.env || [];
    el.classList.add('secao-acomp');
    el.innerHTML = '<div class="page-head" style="margin-top:14px;"><div><h2 class="page-title" style="font-size:18px;">Ações de acompanhamento</h2><p class="page-sub">' + (o.sub||'') + '</p></div>' + (o.botaoHtml||'') + '</div>'
      + '<div class="ac2-colunas">'
      + '<section class="card ac2-col"><h3>Programados <span class="badge badge-pendente">' + prog.length + '</span></h3>' + (prog.length ? '<ul class="ac2-lista">' + prog.map(function(x){ return linha(x,false); }).join('') + '</ul>' : '<p class="muted" style="padding:10px 16px;">Nenhum envio programado.</p>') + '</section>'
      + '<section class="card ac2-col"><h3>Já enviados <span class="badge badge-aprovado">' + env.length + '</span></h3>' + (env.length ? '<ul class="ac2-lista">' + env.map(function(x){ return linha(x,true); }).join('') + '</ul>' : '<p class="muted" style="padding:10px 16px;">Nada enviado nos últimos 3 dias.</p>') + '</section></div>';
    var porId = {}; prog.forEach(function(x){ porId[x.id] = x; });
    el.querySelectorAll('[data-acabrir]').forEach(function(li){ li.addEventListener('click', function(){ if(o.onAbrir) o.onAbrir(li.getAttribute('data-acabrir')); }); });
    el.querySelectorAll('[data-acenviar]').forEach(function(b){ b.addEventListener('click', async function(e){
      e.stopPropagation(); var it = porId[b.getAttribute('data-acenviar')]; if(!it || !o.onEnviar) return;
      if(!window.confirm('Enviar agora, antes do horário programado?')) return;
      b.disabled = true; try{ await o.onEnviar(it); }finally{ b.disabled = false; }
    }); });
    var bb = el.querySelector('[data-acbotao]'); if(bb && o.onBotao) bb.addEventListener('click', o.onBotao);
  } };
})();
