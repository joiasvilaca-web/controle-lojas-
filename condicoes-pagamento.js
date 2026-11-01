/* Condições de pagamento — à vista x parcelado no cartão (Venda, Pedido, Reserva, Orçamento).
 * Regra (Felipe, 01/nov):
 *  - À vista (Dinheiro, PIX, Ouro, Fiado, Crédito, Cashback): 1x, valor após o desconto.
 *  - Cartão: sempre 20% acima do à vista (mesmo em 1x), em até 12x sem acréscimo.
 *  - No pagamento com cartão, `valor` é o que passa na maquininha (com os 20%);
 *    `valorBase` é a parte do à vista que ele quita (valor / 1,2). O valorTotal da via
 *    continua sendo o à vista — saldo/"a receber" é conferido pela base.
 *  - Na via impressa: valor total sem desconto, desconto à vista e desconto parcelado
 *    (em reais, sem porcentagem).
 */
(function(){
  var FATOR = 1.2, MAX_PARC = 12;
  function r2(n){ return Math.round((Number(n)||0)*100)/100; }
  function formas(config){ return ((config && config.formasPagamento) || []).concat((config && config.paymentTypes) || []); }
  function ehCartao(formaId, config){
    if(!formaId || String(formaId).indexOf('__')===0) return false;
    var f = formas(config).filter(function(x){ return x.id===formaId; })[0];
    return !!(f && /cart[aã]o|cr[eé]dito|d[eé]bito/i.test(f.nome||''));
  }
  /* Quanto do valor à vista este pagamento quita. */
  function base(p, config){
    var v = Number(p && p.valor) || 0;
    return ehCartao(p && p.formaId, config) ? r2(v / FATOR) : v;
  }
  function somaBase(pags, config, filtro){
    return (pags||[]).filter(filtro || function(){ return true; }).reduce(function(a,p){ return a + base(p, config); }, 0);
  }
  function parcelado(vista){ return r2((Number(vista)||0) * FATOR); }
  /* Cartão sugerido pelo sistema (_auto) acompanha o à vista final: se o total mudar (desconto,
     acréscimo, item), o valor da maquininha é refeito = (à vista que falta) × 1,2. Valor digitado à mão não muda. */
  function ajustarAuto(pags, totalVista, config){
    (pags||[]).forEach(function(p){
      if(!p || !p._auto || !ehCartao(p.formaId, config)) return;
      var outros = somaBase((pags||[]).filter(function(q){ return q!==p && q._modo!=='editar'; }), config);
      var falta = Math.max(0, r2((Number(totalVista)||0) - outros));
      p.valor = falta > 0.009 ? parcelado(falta) : p.valor;
    });
  }
  /* Ajusta os campos de cartão antes de gravar (parcelas e valorBase). */
  function carimbar(pags, config){
    (pags||[]).forEach(function(p){
      delete p._auto;
      if(ehCartao(p.formaId, config)){
        p.parcelas = Math.min(MAX_PARC, Math.max(1, parseInt(p.parcelas,10) || 1));
        p.valorBase = base(p, config);
      } else { delete p.parcelas; delete p.valorBase; }
    });
    return pags;
  }
  function rotuloPag(p, nomeForma, config, fmt){
    if(ehCartao(p.formaId, config)){
      var n = Math.max(1, parseInt(p.parcelas,10) || 1);
      return nomeForma + ' ' + n + 'x de ' + fmt(r2((Number(p.valor)||0)/n));
    }
    return nomeForma;
  }
  /* <select> de parcelas para a linha de pagamento em edição. */
  function selectParcelasHtml(p, i, fmt){
    var n = Math.max(1, parseInt(p.parcelas,10) || 1), v = Number(p.valor)||0, o = '';
    for(var k=1;k<=MAX_PARC;k++) o += '<option value="'+k+'"'+(k===n?' selected':'')+'>'+k+'x'+(v>0?' de '+fmt(r2(v/k)):'')+'</option>';
    return '<select data-pagparc="'+i+'" aria-label="Parcelas no cartão" title="Parcelas (até 12x sem acréscimo)">'+o+'</select>';
  }
  /* Valor bruto dos itens (preço de tabela, antes de qualquer desconto). */
  function brutoItens(itens){
    return r2((itens||[]).reduce(function(a,it){
      var b = (it.ajusteTipo && it.ajusteTipo!=='nenhum' && it.precoOriginal!=='' && it.precoOriginal!=null) ? it.precoOriginal : it.valorUnitario;
      return a + (Number(b)||0) * (Number(it.quantidade)||1);
    }, 0));
  }
  /* Fim da via: só o à vista e o parcelado no cartão (pedido do Felipe, 01/nov). */
  function cupomHtml(itens, valorAVista, fmt){
    var vista = r2(valorAVista);
    if(!(vista > 0)) return '';
    return '<div class="linha"></div>'
      + '<div class="destaque">À vista: '+fmt(vista)+'</div>'
      + '<div class="destaque">Ou '+MAX_PARC+'x de '+fmt(r2(parcelado(vista)/MAX_PARC))+' no cartão</div>';
  }
  /* Linha da observação do item na via. */
  function obsItemHtml(it, esc){
    var t = String((it && it.observacaoItem) || '').trim();
    return t ? '<div style="font-size:11px;">Obs.: '+esc(t)+'</div>' : '';
  }
  window.CondPag = { FATOR:FATOR, MAX_PARC:MAX_PARC, r2:r2, ehCartao:ehCartao, base:base, somaBase:somaBase, parcelado:parcelado, ajustarAuto:ajustarAuto,
    carimbar:carimbar, rotuloPag:rotuloPag, selectParcelasHtml:selectParcelasHtml, brutoItens:brutoItens, cupomHtml:cupomHtml, obsItemHtml:obsItemHtml };
})();
