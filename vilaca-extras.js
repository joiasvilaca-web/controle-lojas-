/* Extras compartilhados (Venda, Pedido, Orçamento) — 04/11, pedidos do Felipe.
 *  - Destaque: campo faltando/errado fica em VERMELHO e a tela vai direto nele.
 *  - OuroPag: pagamento em ouro maior que a compra vira CRÉDITO do cliente; nota de entrada do ouro (botão Emitir + nº opcional). */
(function(){
  try{
    var st = document.createElement('style');
    st.textContent = '.v-erro{outline:2px solid #C62828!important;border-color:#C62828!important;background:#FDECEA!important;box-shadow:0 0 0 3px rgba(198,40,40,.18)!important;border-radius:8px}'
      + '.v-erro-lbl{color:#C62828!important;font-weight:700!important}'
      + '.ne-box{margin-top:10px;padding:10px 12px;border:1px solid var(--line,#ddd);border-radius:10px;background:var(--surface-2,#faf6f0)}'
      + '.ne-box .ne-lin{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px}'
      + '.ne-box input{flex:1 1 180px;min-width:140px;padding:8px 10px;border:1px solid var(--line,#ccc);border-radius:8px}';
    document.head.appendChild(st);
  }catch(e){}
  function r2(n){ return Math.round((Number(n)||0)*100)/100; }
  function resolver(a){ if(!a) return null; if(typeof a === 'string') return document.getElementById(a) || document.querySelector(a); return a; }
  var Destaque = {
    limpar: function(){
      document.querySelectorAll('.v-erro').forEach(function(e){ e.classList.remove('v-erro'); });
      document.querySelectorAll('.v-erro-lbl').forEach(function(e){ e.classList.remove('v-erro-lbl'); });
    },
    /* alvos: elemento, id ou seletor (ou lista deles). Mostra a mensagem, pinta de vermelho e foca o primeiro. */
    marcar: function(alvos, msg){
      Destaque.limpar();
      var lista = (Array.isArray(alvos) ? alvos : [alvos]).map(resolver).filter(Boolean);
      lista.forEach(function(el){
        el.classList.add('v-erro');
        var campo = el.closest && el.closest('.field'); if(campo){ var l = campo.querySelector('label'); if(l) l.classList.add('v-erro-lbl'); }
        var tirar = function(){ el.classList.remove('v-erro'); if(campo){ var l2 = campo.querySelector('label'); if(l2) l2.classList.remove('v-erro-lbl'); } };
        ['input','change','click'].forEach(function(ev){ el.addEventListener(ev, tirar, { once:true }); });
      });
      if(lista[0]){
        try{ lista[0].scrollIntoView({ behavior:'smooth', block:'center' }); }catch(e){}
        try{ if(lista[0].focus) lista[0].focus({ preventScroll:true }); }catch(e){}
      }
      if(msg && typeof window.showToast === 'function') window.showToast(msg);
      return false;
    }
  };
  function formaDe(id, config){ return ((config && config.formasPagamento) || []).filter(function(x){ return x.id === id; })[0]; }
  function ehOuro(formaId, config){
    if(!formaId || String(formaId).indexOf('__') === 0) return false;
    var f = formaDe(formaId, config);
    return !!(f && (f.ouro === true || /ouro/i.test(f.nome || '')));
  }
  function confirmados(pags){ return (pags || []).filter(function(p){ return p && p._modo !== 'editar' && p.formaId; }); }
  function temOuro(pags, config){ return confirmados(pags).some(function(p){ return ehOuro(p.formaId, config) && Number(p.valor) > 0; }); }
  /* Quanto passou do total e se o ouro cobre essa sobra (só o ouro pode passar do total — vira crédito do cliente). */
  function excesso(pags, total, config){
    var cs = confirmados(pags);
    var soma = r2(window.CondPag.somaBase(cs, config));
    var ex = r2(soma - (Number(total) || 0));
    if(ex <= 0.009) return { ex: 0, ok: true };
    var ouro = r2(cs.filter(function(p){ return ehOuro(p.formaId, config); }).reduce(function(a, p){ return a + (Number(p.valor) || 0); }, 0));
    var resto = r2(soma - ouro);
    return { ex: ex, ok: ouro > 0 && resto <= (Number(total) || 0) + 0.009 };
  }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' })[c]; }); }
  /* Bloco "Nota de entrada (ouro)": só aparece com ouro no pagamento. Apertar Emitir é obrigatório; o número é opcional. */
  function renderNota(el, holder, config, quem){
    if(!el) return;
    if(!temOuro(holder.pagamentos, config)){ el.innerHTML = ''; return; }
    var ne = holder.notaEntrada || {};
    el.innerHTML = '<div class="ne-box" id="neBox"><b>Nota de entrada (ouro)</b>'
      + '<div class="muted" style="font-size:12px;">Nota de entrada do ouro recebido: o número é opcional agora e pode ser informado depois, mas o fechamento do caixa exige o número.</div>'
      + '<div class="ne-lin"><button type="button" class="btn ' + (ne.emitida ? 'btn-ghost' : 'btn-accent') + ' btn-sm" id="neEmitir">' + (ne.emitida ? '✓ Emitida' : 'Emitir') + '</button>'
      + '<input id="neNumero" autocomplete="off" placeholder="Nº da nota de entrada" value="' + esc(ne.numero || '') + '"></div></div>';
    el.querySelector('#neEmitir').addEventListener('click', function(){
      holder.notaEntrada = Object.assign({}, holder.notaEntrada || {}, { emitida: true, emitidaEm: new Date().toISOString(), emitidaPor: quem || '' });
      renderNota(el, holder, config, quem);
    });
    el.querySelector('#neNumero').addEventListener('input', function(e){ holder.notaEntrada = Object.assign({}, holder.notaEntrada || {}, { numero: e.target.value.trim() }); });
  }
  /* Antes de salvar: ouro no pagamento exige ter apertado Emitir. */
  function erroNota(holder, config){
    if(!temOuro(holder.pagamentos, config)) return null;
    return null;   // 05/11: não trava mais o salvamento (botão Emitir e nº são opcionais na via); o fechamento do caixa cobra o número
  }
  /* Ao gravar: a linha de ouro fica só com o valor da compra (caixa e relatórios batem); o que o cliente trouxe a mais vira crédito e fica em valorEntregue. */
  function liquidar(pags, ex, config){
    if(!(ex > 0.009)) return pags;
    for(var i = (pags || []).length - 1; i >= 0; i--){
      var p = pags[i];
      if(p && ehOuro(p.formaId, config) && (Number(p.valor) || 0) >= ex - 0.009){ p.valorEntregue = r2(p.valor); p.valor = r2(p.valor - ex); break; }
    }
    return pags;
  }
  /* Ao editar: volta ao valor que o cliente entregou, para recalcular a sobra. */
  function restaurar(pags){
    (pags || []).forEach(function(p){ if(p && p.valorEntregue != null){ p.valor = p.valorEntregue; delete p.valorEntregue; } });
    return pags;
  }
  window.Destaque = Destaque;
  window.OuroPag = { ehOuro: ehOuro, temOuro: temOuro, excesso: excesso, renderNota: renderNota, erroNota: erroNota, liquidar: liquidar, restaurar: restaurar };
})();

/* ===== WhatsApp automático (05/11): o ícone do WhatsApp dispara a via/mensagem direto pelo número da loja (função enviar-via).
   Sempre pelo número de atendimento cadastrado; se estiver desconectado, avisa e NÃO abre o WhatsApp comum (regra 09/11).
   08/11: botão que já enviou ganha o "risquinho" duplo ✓✓ (como no WhatsApp) e a dica "já enviado em …" — o envio continua liberado.
   A marca vem do servidor (auditoria_log), então vale para qualquer aparelho/usuário. ===== */
(function(){
  var emAndamento = 0;        // hora em que o envio atual começou (0 = livre)
  var ultimo = { el:null, t:0 };
  var marcas = {};            // 'registroId|botao' -> { em, por, rotulo }
  var pedidos = {};           // chaves de registro já consultadas
  function aviso(m){ try{ if(typeof showToast==='function') showToast(m); }catch(e){} }
  function senhaAtual(){ try{ return (typeof __gatewaySenha!=='undefined' && __gatewaySenha) || ''; }catch(e){ return ''; } }
  function css(){
    if(document.getElementById('waEnvCss')) return;
    var st=document.createElement('style'); st.id='waEnvCss';
    st.textContent='.wa-enviado{position:relative !important;}'
      +'.wa-enviado::after{content:"\\2713";position:absolute;top:50%;left:50%;transform:translate(-18%,-42%);z-index:2;font:900 14px/1 system-ui,sans-serif;color:#1e9d55;text-shadow:0 0 2px #fff,0 0 2px #fff,0 0 3px #fff;pointer-events:none;}';
    document.head.appendChild(st);
  }
  document.addEventListener('click', function(e){ var b=e.target&&e.target.closest&&e.target.closest('button,a,[role=button]'); if(b){ ultimo={ el:b, t:Date.now() }; } }, true);
  function botaoId(el){
    if(!el) return '';
    var at=el.attributes||[];
    for(var i=0;i<at.length;i++){ var n=at[i].name; if(n.indexOf('data-')===0 && /wa$/i.test(n) && at[i].value) return n.slice(5); }
    return el.id||'';
  }
  function registroDe(el){
    var at=(el&&el.attributes)||[];
    for(var i=0;i<at.length;i++){ var n=at[i].name; if(n.indexOf('data-')===0 && /wa$/i.test(n) && at[i].value) return at[i].value; }
    return '';
  }
  function dh(s){ var d=new Date(s); return isNaN(d)?'':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }
  function marcar(el, m){
    if(!el) return; css();
    el.classList.add('wa-enviado');
    var base=(el.getAttribute('data-wa-titulo0')); if(base==null){ base=el.getAttribute('title')||''; el.setAttribute('data-wa-titulo0',base); }
    el.setAttribute('title',(base?base+' — ':'')+'JÁ ENVIADO'+(m&&m.em?' em '+dh(m.em):'')+(m&&m.por?' por '+m.por:'')+(m&&m.rotulo?' ('+m.rotulo+')':'')+'. Você pode enviar de novo.');
  }
  function achar(reg, botao){ return marcas[reg+'|'+botao] || marcas[reg+'|'] || null; }
  var agendado=null;
  function varrer(){
    agendado=null;
    var els=document.querySelectorAll('button,a');
    var novos=[];
    els.forEach(function(el){
      var reg=registroDe(el); if(!reg) return;
      var m=achar(reg, botaoId(el));
      if(m){ if(!el.classList.contains('wa-enviado')) marcar(el,m); return; }
      if(!pedidos[reg]){ pedidos[reg]=1; novos.push(reg); }
    });
    if(!novos.length) return;
    var senha=senhaAtual(); if(!senha || !window.SUPABASE_URL) { novos.forEach(function(r){ delete pedidos[r]; }); return; }
    if(String(window.SUPABASE_URL).indexOf('mpgkvstzigeaimuynpxc')>=0) return;   // treino: sem função de envio
    // em lotes de 150
    for(var i=0;i<novos.length;i+=150){
      (function(lote){
        fetch(window.SUPABASE_URL+'/functions/v1/enviar-via',{ method:'POST', headers:{ 'Content-Type':'application/json','apikey':window.SUPABASE_ANON_KEY,'Authorization':'Bearer '+window.SUPABASE_ANON_KEY }, body:JSON.stringify({ op:'consultar', senha:senha, ids:lote }) })
          .then(function(r){ return r.json(); }).then(function(j){
            if(j && j.marcas){ Object.keys(j.marcas).forEach(function(k){ marcas[k]=j.marcas[k]; }); agendar(); }
          }).catch(function(){ lote.forEach(function(r){ delete pedidos[r]; }); });
      })(novos.slice(i,i+150));
    }
  }
  function agendar(){ if(agendado) return; agendado=setTimeout(varrer,350); }
  function iniciar(){
    try{ new MutationObserver(agendar).observe(document.body,{ childList:true, subtree:true }); }catch(e){}
    agendar();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',iniciar); else iniciar();

  /* opts: { telefone, texto, lojaId, senha, tipo:'venda'|'os'|'orcamento', registroId, via } */
  async function enviar(opts){
    if(emAndamento && Date.now()-emAndamento < 35000){ aviso('Já tem um envio em andamento — aguarde alguns segundos.'); return false; }
    if(String(window.SUPABASE_URL||'').indexOf('mpgkvstzigeaimuynpxc')>=0){ aviso('TREINAMENTO: o envio de WhatsApp fica desligado aqui — nada sai para clientes. Na versão oficial a via é enviada normalmente.'); return false; }
    emAndamento = Date.now();
    var clicado = (ultimo.el && Date.now()-ultimo.t < 15000) ? ultimo.el : null;
    var botao = botaoId(clicado);
    var m0 = /Status atual:\s*\**([^\n*]+)/i.exec(opts.texto||'');
    aviso('Enviando pelo WhatsApp da loja…');
    try{
      var ctl = (typeof AbortController!=='undefined') ? new AbortController() : null;
      var tmo = ctl ? setTimeout(function(){ ctl.abort(); }, 30000) : null;
      var r = await fetch(window.SUPABASE_URL + '/functions/v1/enviar-via', {
        method:'POST', signal: ctl ? ctl.signal : undefined,
        headers:{ 'Content-Type':'application/json', 'apikey':window.SUPABASE_ANON_KEY, 'Authorization':'Bearer '+window.SUPABASE_ANON_KEY },
        body: JSON.stringify({ senha:opts.senha, lojaId:opts.lojaId, telefone:opts.telefone, texto:opts.texto, tipo:opts.tipo, registroId:opts.registroId, via:opts.via, padrao:opts.padrao||null, botao:botao, rotulo:m0?m0[1].trim():'' })
      });
      if(tmo) clearTimeout(tmo);
      var j = await r.json().catch(function(){ return {}; });
      if(j && j.ok){
        aviso('Enviado pelo WhatsApp da loja ✓');
        var m={ em:new Date().toISOString(), por:'', rotulo:m0?m0[1].trim():'' };
        if(opts.registroId) marcas[opts.registroId+'|'+botao]=m;
        marcar(clicado, m); agendar();
        return true;
      }
      if(j && j.fallback){ aviso((j.erro||'O WhatsApp de atendimento está desconectado.')+' A via NÃO foi enviada — avise a diretoria para reconectar o número e tente de novo.'); return false; }
      aviso((j && (j.erro||j.error)) || 'Não foi possível enviar.'); return false;
    }catch(e){
      console.error('WhatsAuto:', e);
      aviso('Sem conexão com o envio automático. A via NÃO foi enviada — confira a internet e tente de novo.'); return false;
    }finally{ emAndamento = 0; }
  }
  /* Mensagem padrão ao cliente (08/11): sem dados da via — só quem atendeu, a loja e o link com tudo. O texto é montado no servidor (enviar-via). */
  function padrao(tipo, reg){
    reg = reg || {};
    var base = window.APP_URL || 'https://vilaca.app';
    var link = tipo==='os' ? base+'/acompanhar.html?id='+encodeURIComponent(reg.id||'')
      : base+'/via.html?t='+(tipo==='orcamento'?'orc':tipo==='reserva'?'res':'venda')+'&id='+encodeURIComponent(reg.id||'');
    return { cliente: reg.cliente||'', atendente: reg.vendedora||reg.criadoPor||'', link: link };
  }
  window.WhatsAuto = { enviar: enviar, padrao: padrao };
})();
