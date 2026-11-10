/* 10/11: a via só aparece com o código oficial (JN4P). O número antigo (JN-16) é histórico interno. */
module.exports = { casos: [
  { nome: 'viaTxt devolve só o código oficial; rascunho sem código fica vazio', bug: 'via mostrava JN-16 e JN4P', rodar: async ({ t, abrir }) => {
    const p = await abrir('painel-ordens.html');
    const r = await p.evaluate(() => [viaTxt({ via: 'JN-16', codigoVia: 'JN4P' }), viaTxt({ via: 'JN-9' }), viaTxt(null)]);
    t.igual(r[0], 'JN4P', 'com código'); t.igual(r[1], '', 'rascunho sem código'); t.igual(r[2], '', 'null');
  } },
  { nome: 'Pedido não mostra mais `order.via` em nenhuma tela/mensagem', rodar: async ({ t, ler }) => {
    const src = ler('painel-ordens.html');
    const sobras = (src.match(/\b(order|ord|ordem)\.via\s*\|\|/g) || []).length;
    t.igual(sobras, 0, 'sobrou `order.via ||` (usar viaTxt)');
  } },
  { nome: 'Cupom: "VIA <código>" grande sob o código de barras', rodar: async ({ t, ler }) => {
    const c = ler('cupom.js'); t.ok(/VIA '\+esc\(codigoVia\)/.test(c), 'texto VIA <código>'); t.ok(/font-size:\s*22px/.test(c), 'letra grande');
  } },
  { nome: 'Mensagens automáticas do pedido usam o código oficial em {via}', rodar: async ({ t, ler }) => {
    t.ok(/replaceAll\("\{via\}", String\(o\.codigoVia \|\| o\.via/.test(ler('acompanhamento-auto.ts')), '{via} deve preferir codigoVia');
  } },
] };
