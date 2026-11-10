/* 10/11: Pedido e Orçamento abrem em Quadro por status para todos; só vira Lista se a pessoa escolher Lista no aparelho. */
module.exports = { casos: [
  { nome: 'Pedido: padrão = quadro; escolha "lista" é respeitada', rodar: async ({ t, abrir }) => {
    const a = await abrir('painel-ordens.html'); t.igual(await a.evaluate(() => modoListaOS()), 'quadro', 'padrão');
    const b = await abrir('painel-ordens.html', { ls: { vilaca_modo_os: 'lista' } }); t.igual(await b.evaluate(() => modoListaOS()), 'lista', 'escolhida');
  } },
  { nome: 'Orçamento: padrão = quadro; escolha "lista" é respeitada', rodar: async ({ t, abrir }) => {
    const a = await abrir('orcamentos.html'); t.igual(await a.evaluate(() => modoOrc()), 'quadro', 'padrão');
    const b = await abrir('orcamentos.html', { ls: { vilaca_modo_orc: 'lista' } }); t.igual(await b.evaluate(() => modoOrc()), 'lista', 'escolhida');
  } },
] };
