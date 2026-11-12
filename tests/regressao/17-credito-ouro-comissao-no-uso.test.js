/* 12/11 (Felipe): ouro entregue a mais — a SOBRA vira crédito do cliente e NÃO entra no caixa nem na comissão no dia da entrega;
   entra quando o crédito de ouro for usado (pagamento __credito com creditoOuro). Crédito de cancelamento/recarga usado continua fora. */
const CaixaCalc = require('../../caixa-calc.js');
const { pegar } = require('../lib/ts-func.js');
const BUG = 'sobra do ouro contava na comissão e no caixa no dia da entrega';
module.exports = { casos: [
  { nome: 'Caixa: ouro a mais entra só pelo valor usado; o uso do crédito de ouro entra no dia do uso', bug: BUG, rodar: async ({ t }) => {
    const vendas = [
      { id: 'v1', lojaId: 'l', data: '2026-11-04', codigoVia: 'JN38V', pagamentos: [{ formaId: 'ouro', valor: 100, valorEntregue: 150, data: '2026-11-04' }] },
      { id: 'v2', lojaId: 'l', data: '2026-11-10', codigoVia: 'JN50V', pagamentos: [{ formaId: '__credito', valor: 80, creditoOuro: 50, data: '2026-11-10' }] },
      { id: 'v3', lojaId: 'l', data: '2026-11-10', codigoVia: 'JN51V', pagamentos: [{ formaId: '__credito', valor: 40, data: '2026-11-10' }] },
    ];
    const m4 = CaixaCalc.movimentos({ vendas, ordens: [], gastos: [] }, '2026-11-04', '2026-11-04');
    t.igual(m4.totEntradas, 100, 'na entrega entra só o usado (100), não os 150 entregues');
    t.igual(m4.creditosGerados.length, 1, 'quadro do crédito gerado continua'); t.igual(m4.creditosGerados[0].creditoSobra, 50, 'sobra 50');
    const m10 = CaixaCalc.movimentos({ vendas, ordens: [], gastos: [] }, '2026-11-10', '2026-11-10');
    t.igual(m10.totEntradas, 50, 'no uso entram os 50 de crédito de ouro');
    t.igual(m10.naoDinheiro.reduce((a, m) => a + m.valor, 0), 70, 'resto do crédito (30) e crédito comum (40) ficam em "não é dinheiro"');
  } },
  { nome: 'Comissão (Lançamentos): sobra do ouro fora na entrega, entra no uso do crédito', bug: BUG, rodar: async ({ t }) => {
    const f = pegar('lancamentos-api.ts', ['VENDEDORAS_FIXAS','VENDEDORAS','LOJAS','CATEGORIAS','LOJA_ID_PARA_MODULO','NAO_RECEBIDAS','ALIAS_NOME','semAcento','primeiroNome','r2','nb','dataLocal','chaveDoRegistro','catDoItemVenda','catDoPedido','fatias','calcularAutoCompleto'], {});
    const base = { idParaChave: {}, nomeParaChave: { ANA: 'ANA' }, prods: {}, cats: {}, ordens: [], vendas: [
      { lojaId: 'loja_mc', vendedora: 'ANA', data: '2026-11-04', pagamentos: [{ formaId: 'ouro', valor: 100, valorEntregue: 150, data: '2026-11-04' }], itens: [] },
      { lojaId: 'loja_mc', vendedora: 'ANA', data: '2026-11-10', pagamentos: [{ formaId: '__credito', valor: 80, creditoOuro: 50, data: '2026-11-10' }], itens: [] },
    ] };
    const r = f.calcularAutoCompleto('2026-11', base);
    t.igual(r.vend.ANA.lojas.MARECHAL.venda, 150, '100 na entrega + 50 do crédito de ouro usado');
  } },
  { nome: 'DP (comissão) e telas: regra única no código', bug: BUG, rodar: async ({ t, ler }) => {
    const dp = ler('dp.html');
    t.ok(/function comValorEntrada\(p\)\{ return p && p\.formaId==='__credito' \? comCreditoOuro\(p\) : comNumBR\(p && p\.valor\); \}/.test(dp), 'DP conta só o valor usado e o crédito de ouro no uso');
    t.ok(/CreditoOuro\.distribuir\(venda\.pagamentos/.test(ler('vendas.html')) && /CreditoOuro\.distribuir\(v\.pagamentos/.test(ler('vendas.html')), 'Venda nova e edição marcam o crédito de ouro');
    t.ok(/CreditoOuro\.distribuir\(novaOrdem\.pagamentos/.test(ler('painel-ordens.html')), 'Pedido novo marca o crédito de ouro');
  } },
  { nome: 'CreditoOuro.disponivel: saldo de ouro pelos movimentos do cliente', rodar: async ({ t, abrir }) => {
    const p = await abrir('vendas.html');
    const r = await p.evaluate(() => {
      const cli = { credito: 200, creditoMovimentos: [
        { tipo: 'cancelamento', valor: 100 }, { tipo: 'ouro', valor: 100 }, { tipo: 'uso', valor: -60, ouro: 60 },
        { tipo: 'estorno', valor: 60, ouro: 60 }, { tipo: 'uso', valor: -40, ouro: 40 } ] };
      const pags = [{ formaId: '__credito', valor: 90 }];
      const parte = CreditoOuro.parteOuro(cli, 90);
      return { disp: CreditoOuro.disponivel(cli), parte, marc: CreditoOuro.distribuir(pags, parte), pg: pags[0].creditoOuro };
    });
    t.igual(r.disp, 60, '100 de ouro − 40 já usado'); t.igual(r.parte, 60, 'uso de 90 consome 60 de ouro primeiro'); t.igual(r.pg, 60, 'marcado no pagamento');
  } },
] };
