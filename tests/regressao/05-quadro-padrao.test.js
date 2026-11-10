/* 10/11: Pedido e Orçamento abrem em Quadro por status para todos; só vira Lista se a pessoa escolher Lista no aparelho. */
module.exports = { casos: [
  { nome: 'Preferência antiga "lista" (chave v1) NÃO vale mais: todos voltam ao Quadro', bug: 'vendedoras/gerentes ficavam em Lista por preferência velha do aparelho', rodar: async ({ t, abrir }) => {
    const a = await abrir('painel-ordens.html', { ls: { vilaca_modo_os: 'lista' } }); t.igual(await a.evaluate(() => modoListaOS()), 'quadro', 'Pedido');
    const b = await abrir('orcamentos.html', { ls: { vilaca_modo_orc: 'lista' } }); t.igual(await b.evaluate(() => modoOrc()), 'quadro', 'Orçamento');
  } },
  { nome: 'Pedido: padrão = quadro; escolha "lista" é respeitada', rodar: async ({ t, abrir }) => {
    const a = await abrir('painel-ordens.html'); t.igual(await a.evaluate(() => modoListaOS()), 'quadro', 'padrão');
    const b = await abrir('painel-ordens.html', { ls: { vilaca_modo_os_v2: 'lista' } }); t.igual(await b.evaluate(() => modoListaOS()), 'lista', 'escolhida');
  } },
  { nome: 'Orçamento: padrão = quadro; escolha "lista" é respeitada', rodar: async ({ t, abrir }) => {
    const a = await abrir('orcamentos.html'); t.igual(await a.evaluate(() => modoOrc()), 'quadro', 'padrão');
    const b = await abrir('orcamentos.html', { ls: { vilaca_modo_orc_v2: 'lista' } }); t.igual(await b.evaluate(() => modoOrc()), 'lista', 'escolhida');
  } },
] };
