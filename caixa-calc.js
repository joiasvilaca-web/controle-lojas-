/* caixa-calc.js — REGRA ÚNICA do "que entrou e saiu do caixa" (06/11). Usada pelo Resumo do caixa, pelo Fechar caixa e pelo
 * Dashboard (Formas de pagamento, Metas do mês). Se uma tela mostra um valor recebido, ele sai DAQUI.
 *
 * Regras:
 *  - Entrada = cada pagamento lançado (vendas, pedidos, recarga de crédito, fiado recebido), no DIA EM QUE FOI PAGO
 *    (pagamento sem data: venda = data da venda; pedido = dia em que o pedido foi lançado, nunca a data de entrega).
 *    Via "pagar depois": o pagamento entra no dia em que foi lançado.
 *  - Entra TUDO: dinheiro, pix, cartão, link, ouro (troca) etc. Pedido em RASCUNHO com pagamento também entra (marcado).
 *    Via cancelada depois continua com a entrada do dia em que foi paga; a devolução sai no dia do cancelamento.
 *  - "Não é dinheiro" (crédito do cliente usado, fiado lançado, cashback, sem custo) aparece à parte, nunca some.
 *  - Saída = devolução de cancelamento + contas pagas.
 *   CaixaCalc.movimentos({vendas, ordens, gastos, formas, lojas}, de, ate, lojaId) →
 *      { entradas[], saidas[], naoDinheiro[], totEntradas, totSaidas }   (de/ate = 'AAAA-MM-DD', lojaId opcional)
 */
(function(){
  'use strict';
  var NAO_DINHEIRO = ['__fiado', '__credito', '__cashback', '__sem_custo'];
  function pad(n){ return String(n).padStart(2, '0'); }
  function diaDeTs(ts){
    if(!ts) return '';
    var n = Number(ts), d = new Date(isNaN(n) ? ts : n);
    if(isNaN(d)) return String(ts).slice(0, 10);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  /** Dia em que a via foi lançada (no Pedido o campo "data" é a ENTREGA; a data do pedido é criadoEm). */
  function diaLancamento(r){ return (r && r.criadoEm) ? (diaDeTs(r.criadoEm) || r.data) : (r && r.data); }
  function semAcento(s){ return String(s || '').toUpperCase().normalize('NFD').replace(/\p{M}/gu, ''); }
  function lojaIdDoGasto(g, lojas){
    if(g.lojaId) return g.lojaId;
    var n = semAcento(g.loja);
    if(!n) return '';
    var l = (lojas || []).find(function(x){ var a = semAcento(x.nome), b = semAcento(x.nomeFantasia); return (a && (a.indexOf(n) >= 0 || n.indexOf(a) >= 0)) || (b && (b.indexOf(n) >= 0 || n.indexOf(b) >= 0)); });
    return l ? l.id : '';
  }
  /** Nome da forma como o relatório mostra (nunca vazio: pagamento sem forma conhecida aparece como "SEM FORMA"). */
  function nomeForma(p, formas){
    if(!p) return '';
    var id = String(p.formaId || '');
    if(id.indexOf('__') === 0) return id === '__credito' ? 'CRÉDITO CLIENTE' : id === '__fiado' ? 'FIADO' : id === '__cashback' ? 'CASHBACK' : id === '__sem_custo' ? 'SEM CUSTO' : (p.tipoNome || p.tipo || 'OUTROS');
    var f = id ? (formas || []).find(function(x){ return x.id === id; }) : null;
    return String((f && f.nome) || p.tipoNome || p.tipo || 'SEM FORMA').toUpperCase();
  }
  function moeda(v){ return 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function ehCanc(r){ return r && (r.status === 'cancelada' || r.status === 'cancelado'); }
  /** Valor de um pagamento como número (aceita "1.234,50", "1234.5", vazio). */
  function valorDe(p){
    var v = p && p.valor;
    if(typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).trim();
    if(!s) return 0;
    if(/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? n : 0;
  }

  /** Valor que ENTROU no caixa por um pagamento. 12/11 (Felipe): ouro entregue a mais que a compra — a SOBRA vira crédito do cliente
   *  e NÃO entra no caixa nem na comissão no dia da entrega; entra só quando o crédito for usado (pagamento __credito com creditoOuro). */
  function valorEntrada(p){ return valorDe(p); }
  function creditoSobra(p){
    var e = p && p.valorEntregue; e = (e === '' || e == null) ? NaN : Number(e);
    return (isFinite(e) && e > valorDe(p) + 0.004) ? e - valorDe(p) : 0;
  }
  /** Parte de um pagamento com CRÉDITO DO CLIENTE que veio de sobra de ouro: entra no caixa/comissão no dia do uso. */
  function creditoOuroUsado(p){
    if(!p || p.formaId !== '__credito') return 0;
    var c = Number(p.creditoOuro); return isFinite(c) && c > 0 ? Math.min(c, valorDe(p)) : 0;
  }

  function movimentos(dados, de, ate, lojaId){
    var formas = dados.formas || [], lojas = dados.lojas || [];
    var dentro = function(d){ return !!d && d >= de && d <= ate; };
    var daLoja = function(id){ return !lojaId || id === lojaId; };
    var entradas = [], saidas = [], naoDinheiro = [];
    function tipoVia(r, ehOS){ return r.tipo === 'recargaCredito' ? 'Recarga de crédito' : r.tipo === 'recebimentoFiado' ? 'Fiado recebido' : ehOS ? 'Pedido' : 'Venda'; }
    function add(r, ehOS){
      if(!daLoja(r.lojaId)) return;
      var base = ehOS ? diaLancamento(r) : r.data;
      var obs = ehCanc(r) ? 'cancelada depois' : (ehOS && r.status === 'rascunho') ? 'rascunho (pedido ainda não lançado)' : '';
      (r.pagamentos || []).forEach(function(p){
        var v = valorEntrada(p); if(!v) return;
        var dia = String((p && p.data) || base || '').slice(0, 10); if(!dentro(dia)) return;
        var sobra = creditoSobra(p), usado = valorDe(p), ouroCred = creditoOuroUsado(p);
        var obsMov = obs;
        if(sobra > 0.004) obsMov = (obs ? obs + ' · ' : '') + 'o cliente entregou ' + moeda(usado + sobra) + ' em ouro; ' + moeda(sobra) + ' ficou de CRÉDITO (via ' + (r.codigoVia || r.via || '') + ') e só entra no caixa e na comissão quando o crédito for usado';
        var mov = { dia: dia, lojaId: r.lojaId || '', tipo: tipoVia(r, ehOS), via: r.codigoVia || r.via || '', cliente: r.cliente || '', forma: nomeForma(p, formas), formaId: p.formaId || '', valor: v, usado: usado, creditoSobra: sobra, reg: r, ehOS: !!ehOS, obs: obsMov };
        if(p.formaId === '__credito'){
          if(ouroCred > 0.004){
            entradas.push(Object.assign({}, mov, { forma: 'OURO (CRÉDITO USADO)', valor: ouroCred, usado: ouroCred, creditoSobra: 0, creditoOuro: ouroCred, obs: (obs ? obs + ' · ' : '') + 'crédito de sobra de ouro usado agora: entra no caixa e na comissão neste dia' }));
            if(v - ouroCred > 0.004) naoDinheiro.push(Object.assign({}, mov, { valor: v - ouroCred, usado: v - ouroCred, obs: (obs ? obs + ' · ' : '') + 'crédito do cliente (cancelamento/recarga) usado como forma de pagamento: não movimenta caixa nem comissão' }));
          } else naoDinheiro.push(Object.assign(mov, { obs: (obs ? obs + ' · ' : '') + 'crédito do cliente usado como forma de pagamento: não movimenta caixa nem comissão' }));
          return;
        }
        if(NAO_DINHEIRO.indexOf(p.formaId) >= 0) naoDinheiro.push(mov); else entradas.push(mov);
      });
      // devolução de cancelamento: sai no dia do cancelamento
      var saida = Number(r.caixaSaidaCancelamento) || 0;
      if(ehCanc(r) && saida > 0){
        var dia2 = diaDeTs(r.canceladoEm);
        if(dentro(dia2)){
          var t = r.cancelamentoDestino && r.cancelamentoDestino.tipo;
          var pg1 = (r.pagamentos || []).find(function(p){ return valorDe(p) > 0 && NAO_DINHEIRO.indexOf(p.formaId) < 0; });
          var forma = t === 'pix' ? 'PIX' : t === 'dinheiro' ? 'DINHEIRO' : (pg1 ? nomeForma(pg1, formas) : 'DEVOLUÇÃO');
          saidas.push({ dia: dia2, lojaId: r.lojaId || '', tipo: 'Devolução (cancelamento)', via: r.codigoVia || r.via || '', cliente: r.cliente || '', forma: forma, valor: saida, reg: r, ehOS: !!ehOS, obs: r.motivoCancelamento || '' });
        }
      }
    }
    (dados.vendas || []).forEach(function(v){ add(v, false); });
    (dados.ordens || []).forEach(function(o){ add(o, true); });   // inclui rascunho com pagamento (o dinheiro entrou)
    (dados.gastos || []).filter(function(g){ return g.pago && dentro(String(g.dataPagamento || '').slice(0, 10)); }).forEach(function(g){
      var lid = lojaIdDoGasto(g, lojas); if(!daLoja(lid)) return;
      saidas.push({ dia: String(g.dataPagamento).slice(0, 10), lojaId: lid, tipo: 'Conta paga', via: '', cliente: g.nome || g.categoria || 'Conta', forma: String(g.formaPagamento || 'CONTA').toUpperCase(), valor: Number(g.valor) || 0, reg: g, obs: g.categoria || '' });
    });
    var nome = function(id){ var l = lojas.find(function(x){ return x.id === id; }); return l ? l.nome : (id || ''); };
    var ord = function(a, b){ return (a.dia || '').localeCompare(b.dia || '') || nome(a.lojaId).localeCompare(nome(b.lojaId)) || String(a.via).localeCompare(String(b.via), 'pt-BR', { numeric: true }); };
    entradas.sort(ord); saidas.sort(ord); naoDinheiro.sort(ord);
    var soma = function(l){ return l.reduce(function(a, m){ return a + m.valor; }, 0); };
    return { entradas: entradas, saidas: saidas, naoDinheiro: naoDinheiro, creditosGerados: entradas.filter(function(m){ return m.creditoSobra > 0.004; }), totEntradas: soma(entradas), totSaidas: soma(saidas) };
  }

  var api = { movimentos: movimentos, nomeForma: nomeForma, diaDeTs: diaDeTs, diaLancamento: diaLancamento, valorDe: valorDe, valorEntrada: valorEntrada, creditoSobra: creditoSobra, creditoOuroUsado: creditoOuroUsado, ehCanc: ehCanc, lojaIdDoGasto: lojaIdDoGasto, NAO_DINHEIRO: NAO_DINHEIRO };
  if(typeof window !== 'undefined') window.CaixaCalc = api;
  if(typeof module !== 'undefined') module.exports = api;
})();
