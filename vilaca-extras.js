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
  function formaDe(id, config){ return ((config && (config.formasPagamento || config.paymentTypes)) || []).filter(function(x){ return x.id === id; })[0]; }
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
  /* ===================== PEÇAS DO OURO (27/11/2026, Felipe) =====================
   * Quando a via tem pagamento em Ouro, a atendente lança peça por peça: teor, tipo,
   * pedra (só descrição) e peso. O valor sai sozinho pelo R$/g do teor (Cadastro › Fator ›
   * Valor Balcão do dia) e pode ser ajustado à mão em até 5%; acima disso precisa de gerente.
   * Um contador mostra a diferença entre as peças e o valor pago em ouro — a via só salva
   * com ele zerado. Cada peça vira (ou reaproveita) um produto "18 K ANEL ... F1,0", e o peso
   * entra no estoque desse produto, na loja da via, quando a via é salva. */
  var OI_TOL = 0.009;
  function oiNum(v){ var n = parseFloat(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; }
  function oiNumLivre(v){ var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; }
  function oiMoeda(v){ return 'R$ ' + (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function oiGramas(v){ return (Math.round((Number(v) || 0) * 1000) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 }); }
  /** Soma do que foi lançado como OURO nas formas de pagamento (é com isso que as peças têm de bater). */
  function ouroPago(pags, config){
    return r2(confirmados(pags).filter(function(p){ return ehOuro(p.formaId, config); })
      .reduce(function(a, p){ return a + (Number(p.valorEntregue != null ? p.valorEntregue : p.valor) || 0); }, 0));
  }
  function itensDe(holder){ if(!Array.isArray(holder.ouroItens)) holder.ouroItens = []; return holder.ouroItens; }
  function somaItens(holder){ return r2(itensDe(holder).reduce(function(a, i){ return a + (Number(i.valor) || 0); }, 0)); }
  function somaGramas(holder){ return Math.round(itensDe(holder).reduce(function(a, i){ return a + (Number(i.gramas) || 0); }, 0) * 1000) / 1000; }
  /** Valor que o sistema calculou para a peça (R$/g do teor × peso), sem o ajuste da vendedora. */
  function valorCalculado(item, config){
    var pg = window.OuroCore ? window.OuroCore.precoGrama(config, item.teor) : null;
    if(pg == null || !(Number(item.gramas) > 0)) return null;
    return r2(pg * Number(item.gramas));
  }
  /** Peças com ajuste manual acima do limite — precisam de autorização de gerente. */
  function foraDoLimite(holder, config){
    var lim = (window.OuroCore && window.OuroCore.LIMITE_AJUSTE_PCT) || 5;
    return itensDe(holder).filter(function(i){
      var calc = valorCalculado(i, config);
      var d = window.OuroCore ? window.OuroCore.desvioPct(i.valor, calc) : null;
      return d != null && Math.abs(d) > lim + 1e-9;
    });
  }
  /** Mensagem de impedimento para salvar a via; null quando está tudo certo. */
  function erroItensOuro(holder, config){
    if(!temOuro(holder.pagamentos, config)) return null;
    var itens = itensDe(holder).filter(function(i){ return Number(i.gramas) > 0 && Number(i.valor) > 0; });
    if(!itens.length) return 'Lance as peças do ouro (teor, tipo e peso) antes de salvar.';
    var dif = r2(ouroPago(holder.pagamentos, config) - somaItens(holder));
    if(Math.abs(dif) > OI_TOL) return dif > 0
      ? 'As peças do ouro somam ' + oiMoeda(somaItens(holder)) + ' e o pagamento em ouro é ' + oiMoeda(ouroPago(holder.pagamentos, config)) + '. Faltam ' + oiMoeda(dif) + ' em peças.'
      : 'As peças do ouro passam ' + oiMoeda(-dif) + ' do valor pago em ouro. Ajuste as peças ou o pagamento.';
    var fora = foraDoLimite(holder, config);
    if(fora.length && !holder.ouroAjusteAutorizado) return 'Há peça com ajuste acima de ' + ((window.OuroCore && window.OuroCore.LIMITE_AJUSTE_PCT) || 5) + '% do valor calculado. Precisa de autorização de gerente.';
    if(window.OuroTermo){ var et = window.OuroTermo.erro(holder, config); if(et) return et; }
    return null;
  }
  function oiSel(valor, lista, idKey, nomeKey){
    return lista.map(function(o){
      var id = o[idKey], nm = o[nomeKey];
      return '<option value="' + esc(id) + '"' + (String(id) === String(valor) ? ' selected' : '') + '>' + esc(nm) + '</option>';
    }).join('');
  }
  /** Desenha o painel das peças. `onChange` avisa a tela para recalcular o resumo do pagamento. */
  function renderItens(el, holder, config, onChange){
    if(!el) return;
    /* Aparece assim que a forma de ouro é escolhida na linha, mesmo antes do valor e do ✓. */
    var _temLinhaOuro = (holder.pagamentos || []).some(function(p){ return p && p.formaId && ehOuro(p.formaId, config); });
    if(!_temLinhaOuro){ el.innerHTML = ''; return; }
    if(!window.OuroCore){ el.innerHTML = '<div class="ne-box"><b>Peças do ouro</b><div class="muted" style="font-size:12px;">Não consegui carregar a tabela de teores. Recarregue a página.</div></div>'; return; }
    var O = window.OuroCore;
    var itens = itensDe(holder);
    if(!itens.length) itens.push({ teor: '18', tipo: 'ANEL', pedra: '', gramas: '', valor: '' });
    var base = O.valorBalcaoDia(config);
    var linhas = itens.map(function(it, i){
      var pg = O.precoGrama(config, it.teor);
      var calc = valorCalculado(it, config);
      var dv = O.desvioPct(it.valor, calc);
      var lim = O.LIMITE_AJUSTE_PCT;
      var aviso = '';
      if(dv != null){
        if(Math.abs(dv) < 0.05) aviso = '<span class="oi-ok">Valor da tabela</span>';
        else if(Math.abs(dv) <= lim + 1e-9) aviso = '<span class="oi-aj">Ajustado ' + (dv > 0 ? '+' : '') + dv.toFixed(1).replace('.', ',') + '% (permitido até ' + lim + '%)</span>';
        else aviso = '<span class="oi-ruim">Ajuste de ' + dv.toFixed(1).replace('.', ',') + '% — passa de ' + lim + '%, precisa de autorização de gerente</span>';
      }
      return '<div class="oi-linha" data-oi="' + i + '">'
        + '<select data-oi-teor="' + i + '" aria-label="Teor">' + oiSel(it.teor, O.TEORES.map(function(t){ var p = O.precoGrama(config, t.k); return { k: t.k, nome: t.label + (p ? ' · ' + oiMoeda(p) + '/g' : ' · sem valor') }; }), 'k', 'nome') + '</select>'
        + '<select data-oi-tipo="' + i + '" aria-label="Tipo da peça">' + oiSel(it.tipo, O.TIPOS, 'id', 'nome') + '</select>'
        + '<button type="button" class="oi-x" data-oi-del="' + i + '" aria-label="Remover peça">&times;</button>'
        + '<select class="oi-pedra" data-oi-pedra="' + i + '" aria-label="Pedra">' + oiSel(it.pedra, O.PEDRAS, 'id', 'nome') + '</select>'
        + '<input data-oi-g="' + i + '" inputmode="decimal" placeholder="Peso (g)" value="' + esc(it.gramas) + '" aria-label="Peso em gramas">'
        + '<input data-oi-v="' + i + '" inputmode="decimal" placeholder="Valor R$" value="' + esc(it.valor) + '" aria-label="Valor da peça">'
        + '<div class="oi-aviso">' + aviso + (pg == null ? '<span class="oi-ruim">Sem Valor Balcão do dia — peça para a diretoria lançar em Cadastro › Fator.</span>' : '') + '</div>'
        + '</div>';
    }).join('');
    var pago = ouroPago(holder.pagamentos, config);
    var soma = somaItens(holder);
    var dif = r2(pago - soma);
    var cls = Math.abs(dif) <= OI_TOL ? 'oi-cont-ok' : (dif > 0 ? 'oi-cont-falta' : 'oi-cont-passa');
    var txt = Math.abs(dif) <= OI_TOL
      ? '✓ Confere: ' + oiMoeda(soma) + (somaGramas(holder) ? ' · ' + oiGramas(somaGramas(holder)) + ' g' : '')
      : (dif > 0 ? 'Faltam ' + oiMoeda(dif) + ' em peças' : 'Peças passam ' + oiMoeda(-dif) + ' do valor em ouro');
    el.innerHTML = '<div class="ne-box oi-box"><b>Peças do ouro</b>'
      + '<div class="muted" style="font-size:12px;">Escolha o teor e digite o peso: o valor sai sozinho. Dá para ajustar à mão em até ' + O.LIMITE_AJUSTE_PCT + '%.'
      + (base == null ? ' <b style="color:#C62828;">Falta o Valor Balcão do dia (18k) em Cadastro › Fator › Compra de metal.</b>' : '') + '</div>'
      + '<div class="oi-linhas">' + linhas + '</div>'
      + '<button type="button" class="btn btn-ghost btn-sm" id="oiAdd">+ Adicionar peça</button>'
      + '<div class="oi-cont ' + cls + '" id="oiCont">' + txt + '</div>'
      + caixaTermo(holder, Math.abs(dif) <= OI_TOL && soma > 0)
      + '</div>';
    function mexeu(){ renderItens(el, holder, config, onChange); if(typeof onChange === 'function') onChange(); }
    el.querySelectorAll('[data-oi-teor]').forEach(function(sel){
      sel.addEventListener('change', function(){ var i = Number(sel.dataset.oiTeor); itens[i].teor = sel.value; recalcLinha(itens[i], config); mexeu(); });
    });
    el.querySelectorAll('[data-oi-tipo]').forEach(function(sel){ sel.addEventListener('change', function(){ itens[Number(sel.dataset.oiTipo)].tipo = sel.value; mexeu(); }); });
    el.querySelectorAll('[data-oi-pedra]').forEach(function(sel){ sel.addEventListener('change', function(){ itens[Number(sel.dataset.oiPedra)].pedra = sel.value; mexeu(); }); });
    el.querySelectorAll('[data-oi-g]').forEach(function(inp){
      inp.addEventListener('change', function(){ var i = Number(inp.dataset.oiG); itens[i].gramas = oiNumLivre(inp.value) || ''; recalcLinha(itens[i], config); mexeu(); });
    });
    el.querySelectorAll('[data-oi-v]').forEach(function(inp){
      inp.addEventListener('change', function(){ var i = Number(inp.dataset.oiV); itens[i].valor = r2(oiNumLivre(inp.value)) || ''; itens[i].manual = true; mexeu(); });
    });
    el.querySelectorAll('[data-oi-del]').forEach(function(b){
      b.addEventListener('click', function(){ itens.splice(Number(b.dataset.oiDel), 1); if(!itens.length) itens.push({ teor: '18', tipo: 'ANEL', pedra: '', gramas: '', valor: '' }); mexeu(); });
    });
    var add = el.querySelector('#oiAdd');
    if(add) add.addEventListener('click', function(){ itens.push({ teor: '18', tipo: 'ANEL', pedra: '', gramas: '', valor: '' }); mexeu(); });
    ligarTermo(el, holder, config, mexeu);
  }

  /* ---- Termo de compra de ouro: disparar, digitar o código e confirmar ---- */
  function caixaTermo(holder, pronto){
    var t = holder.termo || (holder.termo = {});
    var st = t.status || '';
    var linha = '';
    if(st === 'confirmado') linha = '<span class="oi-ok" style="color:#1f6b3d;font-weight:700;">Termo confirmado' + (t.em ? ' às ' + esc(t.em) : '') + '. PDF guardado no Drive.</span>';
    else if(t.dispensado) linha = '<span class="oi-aj">Salvo sem termo, autorizado por ' + esc(t.dispensado.por || 'gerente') + '.</span>';
    else if(st === 'enviado') linha = '<span class="oi-aj">Termo enviado' + (t.em ? ' às ' + esc(t.em) : '') + '. Aguardando o aceite do cliente — peça o código a ele.</span>';
    else linha = pronto ? '<span class="oi-aj">Valores conferem. Dispare o termo para o cliente.</span>' : '<span class="oi-ok">Zere o contador acima para liberar o termo.</span>';
    var trava = (st === 'confirmado' || t.dispensado);
    return '<div class="oi-termo"><b>Termo de compra de ouro</b>'
      + '<div class="oi-aviso" style="margin:4px 0 8px;">' + linha + '</div>'
      + (trava ? '' :
        '<div class="oi-termo-lin">'
        + '<button type="button" class="btn btn-accent btn-sm" id="oiDisparar"' + (pronto ? '' : ' disabled') + '>' + (st === 'enviado' ? 'Disparar de novo' : 'Disparar termo') + '</button>'
        + '<input id="oiCodigo" inputmode="numeric" maxlength="6" placeholder="Código" ' + (st === 'enviado' ? '' : 'disabled') + '>'
        + '<button type="button" class="btn btn-ghost btn-sm" id="oiConfirmar"' + (st === 'enviado' ? '' : ' disabled') + '>Confirmar</button>'
        + '</div>')
      + '<div class="oi-aviso" id="oiTermoMsg" style="margin-top:8px;"></div></div>';
  }
  function ligarTermo(el, holder, config, redesenhar){
    var bD = el.querySelector('#oiDisparar'), bC = el.querySelector('#oiConfirmar'), inp = el.querySelector('#oiCodigo');
    var msg = el.querySelector('#oiTermoMsg');
    var diz = function(txt, ruim){ if(msg) msg.innerHTML = '<span class="' + (ruim ? 'oi-ruim' : 'oi-aj') + '">' + esc(txt) + '</span>'; };
    if(bD) bD.addEventListener('click', async function(){
      if(typeof window.__ouroDispararTermo !== 'function'){ diz('Recarregue a página (Ctrl+F5) para disparar o termo.', true); return; }
      bD.disabled = true; diz('Enviando o termo…');
      try{ await window.__ouroDispararTermo(holder, itensParaSalvar(holder, config), diz); }
      finally { bD.disabled = false; redesenhar(); }
    });
    if(bC) bC.addEventListener('click', async function(){
      var cod = String(inp.value || '').replace(/\D/g, '');
      if(cod.length !== 6){ diz('O código tem 6 números.', true); return; }
      if(typeof window.__ouroConferirTermo !== 'function'){ diz('Recarregue a página (Ctrl+F5) para conferir o código.', true); return; }
      bC.disabled = true; diz('Conferindo…');
      try{ await window.__ouroConferirTermo(holder, cod, diz); }
      finally { bC.disabled = false; redesenhar(); }
    });
  }
  /** Peso ou teor mudou: o valor volta a ser o da tabela (um ajuste manual anterior valia para o peso antigo). */
  function recalcLinha(item, config){
    var calc = valorCalculado(item, config);
    if(calc == null) return;
    item.valor = calc; item.manual = false;
  }
  /** Limpa o que vai gravado na via (sem campos de tela). */
  function itensParaSalvar(holder, config){
    return itensDe(holder).filter(function(i){ return Number(i.gramas) > 0 && Number(i.valor) > 0; }).map(function(i){
      var calc = valorCalculado(i, config);
      var dv = window.OuroCore ? window.OuroCore.desvioPct(i.valor, calc) : null;
      return {
        teor: String(i.teor), tipo: String(i.tipo), pedra: String(i.pedra || ''),
        gramas: Math.round(Number(i.gramas) * 1000) / 1000, valor: r2(i.valor),
        valorCalculado: calc, ajustePct: dv == null ? null : Math.round(dv * 10) / 10,
        nome: window.OuroCore ? window.OuroCore.nomeProduto(i.teor, i.tipo, i.pedra || '', i.gramas) : '',
        produtoId: i.produtoId || null
      };
    });
  }
  var oiCss = '.oi-box .oi-linha{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;padding:0 26px 8px 0;border-bottom:1px dashed var(--line,#ddd);}'
    + '.oi-box .oi-linha select,.oi-box .oi-linha input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line,#ccc);border-radius:8px;min-width:0;font:inherit;background:var(--surface,#fff);color:var(--ink,#111);}'
    + '.oi-box .oi-x{position:absolute;top:2px;right:0;width:24px;border:0;background:none;color:#a33;font-size:20px;line-height:1;cursor:pointer;padding:0;}'
    + '.oi-box .oi-pedra{grid-column:1/3;}'
    + '.oi-box .oi-aviso{grid-column:1/3;font-size:12px;}'
    + '.oi-box .oi-ok{color:var(--ink-soft,#667);} .oi-box .oi-aj{color:#8a5a00;} .oi-box .oi-ruim{color:#C62828;font-weight:600;}'
    + '.oi-box .oi-cont{margin-top:10px;padding:10px 12px;border-radius:10px;text-align:center;font-weight:700;}'
    + '.oi-box .oi-cont-ok{background:#e3f3e8;color:#1f6b3d;} .oi-box .oi-cont-falta{background:#fff1d6;color:#8a5a00;} .oi-box .oi-cont-passa{background:#fde4e4;color:#a33;}'
    + '.oi-box .oi-termo{margin-top:12px;padding-top:10px;border-top:1px solid var(--line,#ddd);}'
    + '.oi-box .oi-termo-lin{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}'
    + '.oi-box .oi-termo-lin input{width:120px;padding:9px 10px;border:1px solid var(--line,#ccc);border-radius:8px;font:inherit;letter-spacing:.18em;background:var(--surface,#fff);color:var(--ink,#111);}';
  try{ var oiSt = document.createElement('style'); oiSt.textContent = oiCss; document.head.appendChild(oiSt); }catch(e){}

  window.Destaque = Destaque;
  window.OuroPag = { ehOuro: ehOuro, temOuro: temOuro, excesso: excesso, renderNota: renderNota, erroNota: erroNota, liquidar: liquidar, restaurar: restaurar };
  window.OuroItens = { render: renderItens, erro: erroItensOuro, paraSalvar: itensParaSalvar, soma: somaItens, somaGramas: somaGramas, ouroPago: ouroPago, foraDoLimite: foraDoLimite };
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
        body: JSON.stringify({ senha:opts.senha, lojaId:opts.lojaId, telefone:opts.telefone, texto:opts.texto, tipo:opts.tipo, registroId:opts.registroId, via:opts.via, padrao:opts.padrao||null, cliente:opts.cliente||'', vendedora:opts.vendedora||'', statusDestino:opts.statusDestino||'', botao:botao, rotulo:m0?m0[1].trim():'' })
      });
      if(tmo) clearTimeout(tmo);
      var j = await r.json().catch(function(){ return {}; });
      if(j && j.ok){
        aviso('Enviado pelo WhatsApp da loja ✓');
        window.WhatsAuto.ultimo = { ok:true, fila:false };
        var m={ em:new Date().toISOString(), por:'', rotulo:m0?m0[1].trim():'' };
        if(opts.registroId) marcas[opts.registroId+'|'+botao]=m;
        marcar(clicado, m); agendar();
        return true;
      }
      window.WhatsAuto.ultimo = { ok:false, fila: !!(j && j.enfileirado) };
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

/* 11/11: grava SÓ a marca de envio ("já enviado": msgEnviadas, posVendaEnviadoEm, acoesLog) na via.
   Relê a via do servidor antes e aplica a marca nela: nunca grava por cima a cópia da tela, que pode estar velha
   (o envio automático, a Oficina ou a conversão em venda/pedido podem ter mudado a via depois que a tela abriu).
   A cópia da tela fica igual ao que foi gravado. Se o servidor não devolver a via (sem erro), usa a cópia da tela. */
window.gravarMarcaEnvio = async function(tabela, id, local, aplicar){
  try{
    if(typeof window.gatewayCall!=='function' || !id || typeof aplicar!=='function') return false;
    var r = await window.gatewayCall({ op:'selectOne', table:tabela, params:{ column:'id', value:id } });
    if(r && r.error){ console.error('gravarMarcaEnvio: não foi possível reler a via', tabela, id, r.error); return false; }
    var atual = (r && r.data && r.data.payload) || local;
    if(!atual) return false;
    aplicar(atual);
    var w = await window.gatewayCall({ op:'upsert', table:tabela, params:{ row:{ id:id, payload:atual, updated_at:new Date().toISOString() } } });
    if(w && w.error){ console.error('gravarMarcaEnvio: erro ao gravar', tabela, id, w.error); return false; }
    if(local && local!==atual){ Object.keys(local).forEach(function(k){ if(!(k in atual)) delete local[k]; }); Object.assign(local, atual); }
    return true;
  }catch(e){ console.error('gravarMarcaEnvio', e); return false; }
};

/* 12/11 (Felipe): crédito de SOBRA DE OURO só entra no caixa e na comissão quando é USADO.
   O cadastro do cliente guarda um saldo único (credito); a parte que veio de ouro é calculada pelos movimentos:
   'ouro' (+) − estorno "(sobra do ouro)" − usos já marcados (m.ouro) + estornos de uso (m.ouro). No uso, a parte de ouro é
   consumida primeiro e fica marcada no pagamento (__credito.creditoOuro) e no movimento 'uso' (ouro). */
window.CreditoOuro = (function(){
  function r2(v){ return Math.round((Number(v)||0)*100)/100; }
  function disponivel(cli){
    if(!cli) return 0;
    var d = 0;
    (cli.creditoMovimentos||[]).forEach(function(m){
      var v = Number(m && m.valor)||0, o = Number(m && m.ouro)||0;
      if(m.tipo==='ouro') d += v;
      else if(m.tipo==='estorno' && /sobra do ouro/i.test(m.obs||'') && v<0) d += v;
      else if(m.tipo==='uso') d -= o;
      else if(m.tipo==='estorno' && o>0) d += o;
    });
    return r2(Math.max(0, Math.min(Number(cli.credito)||0, d)));
  }
  /** Quanto do crédito usado (total) sai do ouro. */
  function parteOuro(cli, totalCredito){ return r2(Math.min(Math.max(0, Number(totalCredito)||0), disponivel(cli))); }
  /** Distribui a parte de ouro nos pagamentos __credito (marca creditoOuro). */
  function distribuir(pagamentos, ouro){
    var resto = r2(ouro);
    (pagamentos||[]).forEach(function(p){
      if(!p || p.formaId!=='__credito') return;
      var v = Number(p.valor)||0, parte = r2(Math.min(v, resto));
      if(parte>0.004){ p.creditoOuro = parte; resto = r2(resto - parte); } else delete p.creditoOuro;
    });
    return r2(ouro - resto);
  }
  return { disponivel: disponivel, parteOuro: parteOuro, distribuir: distribuir };
})();

/* FuncAtivos (13/11): quem NÃO aparece na lista de vendedoras ao preencher a via — funcionário INATIVO (ficha do DP com status "desligado")
 * e quem é da OFICINA (cargo oficina). Lê as fichas do DP uma vez (cache de 5 min); se a leitura falhar, só vale o cargo.
 *   FuncAtivos.carregar()   FuncAtivos.pode(f) → true se pode ser escolhido como vendedora   FuncAtivos.inativo(f) */
(function(){
  var ids = {}, nomes = {}, quando = 0, indo = null;
  function chave(t){ return String(t || '').trim().toLowerCase(); }
  function carregar(){
    if (indo) return indo;
    if (Date.now() - quando < 300000) return Promise.resolve();
    if (typeof gatewayCall !== 'function') return Promise.resolve();
    indo = (async function(){
      try {
        var novosIds = {}, novosNomes = {}, from = 0;
        for (var pg = 0; pg < 20; pg++) {
          var r = await gatewayCall({ op: 'selectPage', table: 'dp_funcionarios', params: { from: from, tamanho: 1000 } });
          if (!r || r.error) throw new Error('sem leitura');
          var lote = r.data || [];
          lote.forEach(function(l){ var p = l && l.payload; if (!p || p.status !== 'desligado') return;
            if (p.funcionarioId) novosIds[p.funcionarioId] = 1; if (p.nome) novosNomes[chave(p.nome)] = 1; if (p.apelido) novosNomes[chave(p.apelido)] = 1; });
          from += lote.length;
          if (r.fim || !lote.length) break;
        }
        ids = novosIds; nomes = novosNomes; quando = Date.now();
      } catch (e) { /* sem leitura: filtra só por cargo e pelo status do cadastro */ }
      indo = null;
    })();
    return indo;
  }
  function inativo(f){
    if (!f) return false;
    if (f.status === 'desligado' || f.ativo === false) return true;
    return !!(ids[f.id] || ids[f.funcionarioId] || nomes[chave(f.nome)] || (f.apelido && nomes[chave(f.apelido)]));
  }
  function pode(f){
    if (!f || inativo(f)) return false;
    var cargos = Array.isArray(f.cargos) ? f.cargos : [];
    return cargos.indexOf('oficina') < 0;
  }
  window.FuncAtivos = { carregar: carregar, pode: pode, inativo: inativo };
})();
