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
   Sempre pelo número de atendimento cadastrado; se estiver desconectado, avisa e NÃO abre o WhatsApp comum (regra 09/11). ===== */
(function(){
  var emAndamento = false;
  function aviso(m){ try{ if(typeof showToast==='function') showToast(m); }catch(e){} }
  /* opts: { telefone, texto, lojaId, senha, tipo:'venda'|'os'|'orcamento', registroId, via } */
  async function enviar(opts){
    if(emAndamento) return;
    if(String(window.SUPABASE_URL||'').indexOf('mpgkvstzigeaimuynpxc')>=0){ aviso('TREINAMENTO: o envio de WhatsApp fica desligado aqui — nada sai para clientes. Na versão oficial a via é enviada normalmente.'); return; }
    emAndamento = true;
    aviso('Enviando pelo WhatsApp da loja…');
    try{
      var r = await fetch(window.SUPABASE_URL + '/functions/v1/enviar-via', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'apikey':window.SUPABASE_ANON_KEY, 'Authorization':'Bearer '+window.SUPABASE_ANON_KEY },
        body: JSON.stringify({ senha:opts.senha, lojaId:opts.lojaId, telefone:opts.telefone, texto:opts.texto, tipo:opts.tipo, registroId:opts.registroId, via:opts.via })
      });
      var j = await r.json().catch(function(){ return {}; });
      if(j && j.ok){ aviso('Enviado pelo WhatsApp da loja ✓'); return; }
      if(j && j.fallback){ aviso((j.erro||'O WhatsApp de atendimento está desconectado.')+' A via NÃO foi enviada — avise a diretoria para reconectar o número e tente de novo.'); return; }
      aviso((j && (j.erro||j.error)) || 'Não foi possível enviar.');
    }catch(e){
      console.error('WhatsAuto:', e);
      aviso('Sem conexão com o envio automático. A via NÃO foi enviada — confira a internet e tente de novo.');
    }finally{ emAndamento = false; }
  }
  window.WhatsAuto = { enviar: enviar };
})();
