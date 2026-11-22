/* 22/11 (Felipe): avaliação do ATENDIMENTO na 1ª mensagem (venda e pedido); Google só no pós-venda (venda) e no PEDIDO ENTREGUE,
 * que passa a receber o pós-venda sozinho no dia da entrega (modelo de Utilidade). */
const { pegar } = require('../lib/ts-func.js');
module.exports = { casos: [
  { nome: 'Link: Google só no pedido entregue', bug: 'Google aparecia já na 1ª abertura da via', rodar: async ({ t, ler }) => {
    const r = ler('retirada-terceiro.ts');
    t.ok(/google: tipo === "os" && via\.status === "entregue" \? li\.google : null/.test(r), 'servidor só devolve o Google do pedido entregue');
    t.ok(/via\.status !== "abandonada",/.test(r), 'via abandonada não pede avaliação');
    const c = ler('ciente-via.js'), a = ler('avaliacao-via.js');
    t.ok(/else if\(a && a\.google && AV && AV\.soGoogle\) AV\.soGoogle\(ov, a, fim\);/.test(c) && /function soGoogle\(ov, a, fim\)/.test(a), 'pedido entregue já avaliado: mostra só o Google (uma vez por aparelho)');
  } },
  { nome: 'Robô: pós-venda do pedido no dia da entrega (só entregas a partir de 22/11)', bug: 'Google do pedido só 7 dias depois', rodar: async ({ t, ler }) => {
    const s = ler('acompanhamento-auto.ts');
    t.ok(/Number\(o\.recebidoEm\) >= POSVENDA_NA_ENTREGA_DESDE \|\| diasEntre\(diaDe\(Number\(o\.recebidoEm\)\), agora\.dia\) >= diasPV/.test(s), 'entrega nova sai no mesmo dia; antigas seguem os N dias');
    t.ok(/if \(it\.tipo === "posvenda" \|\| it\.tipo === "os_posvenda"\) return \{ nome: "pos_venda_garantia"/.test(s), 'modelo de garantia (Utilidade) com botão do Google');
  } },
] };
