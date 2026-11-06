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
        var v = valorDe(p); if(!v) return;
        var dia = String((p && p.data) || base || '').slice(0, 10); if(!dentro(dia)) return;
        var mov = { dia: dia, lojaId: r.lojaId || '', tipo: tipoVia(r, ehOS), via: r.codigoVia || r.via || '', cliente: r.cliente || '', forma: nomeForma(p, formas), formaId: p.formaId || '', valor: v, reg: r, ehOS: !!ehOS, obs: obs };
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
    return { entradas: entradas, saidas: saidas, naoDinheiro: naoDinheiro, totEntradas: soma(entradas), totSaidas: soma(saidas) };
  }

  var api = { movimentos: movimentos, nomeForma: nomeForma, diaDeTs: diaDeTs, diaLancamento: diaLancamento, valorDe: valorDe, ehCanc: ehCanc, lojaIdDoGasto: lojaIdDoGasto, NAO_DINHEIRO: NAO_DINHEIRO };
  if(typeof window !== 'undefined') window.CaixaCalc = api;
  if(typeof module !== 'undefined') module.exports = api;
})();
