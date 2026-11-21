/* 22/11 — Mensagem de orçamento pela API oficial: a loja não repete ("Aqui é da LOJA… Aqui é Paty, da LOJA") e o Recusado
 * mantém o convite "o que podemos melhorar" (antes o parágrafo inteiro sumia por ter link). Mesma regra no disparo-cloud e no acompanhamento-auto. */
const { pegar } = require('../lib/ts-func');
const LOJA = 'VILAÇA - UNIDADE HALFELD';
const ABERTO = 'Olá, Maria! 😊\n\nAqui é Paty Souza, da ' + LOJA + '. Seu orçamento está pronto!\n\nValor: *R$ 890,00*\n\nVeja o seu orçamento completo, com fotos:\nhttps://vilaca.app/via.html?t=orc&id=1\n\nClique no link: https://wa.me/5532988307617';
const RECUSADO = 'Olá, Maria! Aqui é Paty Souza, da ' + LOJA + '.\n\nComo não tivemos retorno, estamos encerrando o seu orçamento.\n\nSe puder, nos conte o que podemos melhorar. É só abrir o link abaixo:\nhttps://vilaca.app/via.html?t=orc&id=1\n\nCaso precise falar conosco, clique no link: https://wa.me/5532988307617';
module.exports = { casos: ['disparo-cloud.ts', 'acompanhamento-auto.ts'].map(arq => ({
  nome: arq + ': miolo sem loja repetida e com o convite do Recusado', bug: 'loja saía 2 vezes e o convite "o que melhorar" sumia', rodar: async ({ t }) => {
    const { miolo } = pegar(arq, ['miolo'], { NL: '\n' });
    const a = miolo(ABERTO), r = miolo(RECUSADO);
    t.ok(a === 'Aqui é Paty Souza. Seu orçamento está pronto! Valor: *R$ 890,00*', 'aberto: ' + a);
    t.ok(!a.includes(LOJA) && !/https?:/.test(a) && !/😊/.test(a), 'sem loja, sem link, sem emoji solto');
    t.ok(/o que podemos melhorar/.test(r) && !/https?:/.test(r) && !/Caso precise/.test(r), 'recusado mantém o convite: ' + r);
  } })) };
