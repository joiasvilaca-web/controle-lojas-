/* 13/11 — Venda: crédito do cliente e cashback viram botões ANTES da forma de pagamento (o que sobra do abatimento é o que se paga). */
module.exports = { casos: [
  { nome: 'Venda: botões "Usar crédito do cliente" e "Usar cashback" ficam antes das formas e somem quando não há saldo', bug: 'só dava para abater depois de escolher a forma, num pop-up', rodar: async ({ t, ler }) => {
    const h = ler('vendas.html');
    t.ok(h.indexOf('id="pagSaldosCli"') > 0 && h.indexOf('id="pagSaldosCli"') < h.indexOf('id="pagRows"'), 'bloco de saldos vem antes das formas');
    t.ok(/Crédito do cliente'/.test(h) && /Cashback do cliente'/.test(h) && /data-saldoval/.test(h) && /Pode usar no máximo/.test(h), 'dois blocos separados, cada um com o valor a usar');
    t.ok(/if\(s\.cred>0\.009\) partes\.push/.test(h) && /if\(s\.cb>0\.009\) partes\.push/.test(h), 'só aparecem com saldo');
    t.ok(/Cashback\.maxUso\(totalPag\(\)\)/.test(h.slice(h.indexOf('function saldosCliente'))), 'cashback respeita o limite de 50%');
    t.ok(!/drawRows\(\); oferecerAbatimento\(pg\)/.test(h), 'não pergunta mais depois da forma');
    t.ok(/renderSaldosCli\(\);\n/.test(h), 'atualiza a cada redesenho');
  } },
] };
