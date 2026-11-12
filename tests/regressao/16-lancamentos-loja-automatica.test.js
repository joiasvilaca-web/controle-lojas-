/* 12/11: o fechamento da LOJA em Lançamentos vem sozinho do sistema, com a mesma conta das vendedoras:
   bruto = soma das vendas das vendedoras, devolução = soma das devoluções, categorias somam o líquido. */
const { pegar } = require('../lib/ts-func.js');
module.exports = { casos: [
  { nome: 'Loja automática bate com a soma das vendedoras e as categorias somam o líquido', bug: 'fechamento da loja era digitado à mão e divergia das vendedoras', rodar: async ({ t }) => {
    const f = pegar('lancamentos-api.ts', ['VENDEDORAS_FIXAS','VENDEDORAS','LOJAS','CATEGORIAS','LOJA_ID_PARA_MODULO','NAO_RECEBIDAS','ALIAS_NOME','semAcento','primeiroNome','r2','nb','dataLocal','chaveDoRegistro','catDoItemVenda','catDoPedido','fatias','calcularAutoCompleto'], {});
    const base = {
      idParaChave: {}, nomeParaChave: { ANA: 'ANA', BIA: 'BIA' },
      prods: { p1: { tv: 'joiaRepresentanteOuro', cat: 'c1' }, p2: { tv: 'relogio', cat: 'c2' }, p3: { tv: 'joiaVilacaPrata', cat: 'c1' } },
      cats: { c1: 'ANEL', c2: 'RELOGIO' },
      vendas: [
        { lojaId: 'loja_mc', vendedora: 'ANA', data: '2026-11-03', pagamentos: [{ formaId: 'pix', valor: 300, data: '2026-11-03' }], itens: [{ produtoEstoqueId: 'p1', quantidade: 1, valorUnitario: 100 }, { produtoEstoqueId: 'p2', quantidade: 1, valorUnitario: 200 }] },
        { lojaId: 'loja_mc', vendedora: 'BIA', data: '2026-11-04', status: 'cancelada', canceladoEm: '2026-11-05', pagamentos: [{ formaId: 'pix', valor: 90, data: '2026-11-04' }], itens: [{ produtoEstoqueId: 'p3', quantidade: 1, valorUnitario: 90 }] },
        { lojaId: 'loja_mc', vendedora: 'ZZZ', data: '2026-11-04', pagamentos: [{ formaId: 'pix', valor: 50, data: '2026-11-04' }], itens: [] },
      ],
      ordens: [ { lojaId: 'loja_mc', vendedora: 'ANA', status: 'aguardando', serviceTypeName: 'FABRICACAO SEM CRAVACAO', criadoEm: '2026-11-06', pagamentos: [{ formaId: 'dinheiro', valor: 111.11, data: '2026-11-06' }] } ],
    };
    const r = f.calcularAutoCompleto('2026-11', base);
    const l = r.lojas['MARECHAL'];
    const sv = Object.values(r.vend).reduce((a, v) => ({ venda: a.venda + v.lojas.MARECHAL.venda, dev: a.dev + v.lojas.MARECHAL.devolucao }), { venda: 0, dev: 0 });
    t.igual(l.bruto, +(sv.venda).toFixed(2), 'bruto da loja = vendas das vendedoras');
    t.igual(l.devolucao, +(sv.dev).toFixed(2), 'devolução da loja = devoluções das vendedoras');
    const soma = Object.values(l.categorias).reduce((a, b) => a + b, 0);
    t.igual(+soma.toFixed(2), +(l.bruto - l.devolucao).toFixed(2), 'categorias somam o líquido');
    t.igual(l.categorias.REPRES_OURO, 100, 'item representante ouro');
    t.igual(l.categorias.RELOGIO, 200, 'relógio');
    t.igual(l.categorias.FABRICACAO, 111.11, 'pedido de fabricação 111,11; a venda de joia Vilaça cancelada (+90 −90) zera');
    t.igual(r.semVend.MARECHAL.venda, 50, 'venda sem vendedora identificada fica fora e é avisada');
  } },
] };
