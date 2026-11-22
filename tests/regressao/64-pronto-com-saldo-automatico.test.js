/* 22/11 (pedido do Felipe): pedido que fica PRONTO com pagamento em aberto recebe o aviso de pronto sozinho (robô acompanhamento-auto v27).
 * Pedido quitado continua só pelo botão. Pedidos que já estavam prontos antes da mudança não disparam. */
const { pegar } = require('../lib/ts-func.js');
module.exports = { casos: [
  { nome: 'Saldo do pedido pela mesma regra da tela', bug: 'aviso de pronto só saía pelo botão, mesmo faltando pagar', rodar: async ({ t }) => {
    const { saldoAbertoOS } = pegar('acompanhamento-auto.ts', ['saldoAbertoOS']);
    const cfg = { formasPagamento: [{ id:'pix', nome:'PIX' }, { id:'cc', nome:'CARTÃO DE CRÉDITO' }] };
    t.ok(saldoAbertoOS({ valorTotal: 500, pagamentos: [{ formaId:'pix', valor: 200 }] }, cfg) === 300, 'sinal de 200 → falta 300');
    t.ok(saldoAbertoOS({ valorTotal: 500, pagamentos: [{ formaId:'cc', valor: 600 }] }, cfg) === 0, 'cartão quita pela base (600/1,2 = 500)');
    t.ok(saldoAbertoOS({ valorTotal: 500, pagamentos: [{ formaId:'__fiado', valor: 500 }] }, cfg) === 500, 'fiado = falta pagar');
    t.ok(saldoAbertoOS({ valorTotal: 0, pagamentos: [] }, cfg) === 0, 'sem valor → nada');
  } },
  { nome: 'Robô: pronto com saldo sai sozinho; quitado não; antigos não', bug: 'aviso automático indevido', rodar: async ({ t, ler }) => {
    const s = ler('acompanhamento-auto.ts');
    t.ok(/const PRONTO_SALDO_DESDE = Date\.parse\("2026-11-22T13:30:00Z"\)/.test(s), 'corte: só os que ficaram prontos a partir de 22/11');
    t.ok(/Number\(o\.statusEm \|\| 0\) >= PRONTO_SALDO_DESDE/.test(s) && /prontoSaldo = pend > 0\.009/.test(s), 'precisa ter saldo e ter ficado pronto depois do corte');
    t.ok(/\(po\.prontoAuto === true \|\| prontoSaldo\)/.test(s), 'só com saldo (ou prontoAuto ligado)');
  } },
] };
