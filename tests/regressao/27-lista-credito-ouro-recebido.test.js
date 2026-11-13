/* 13/11 — Lista de Vendas/Pedidos: crédito vindo de sobra de ouro (creditoOuro) conta como RECEBIDO, não "a receber" (o caixa já contava). */
const vm = require('vm');
function carregar(html) {
  const pega = (nome) => { const i = html.indexOf('function ' + nome + '('); let d = 0, k = html.indexOf('{', i); const ini = i; for (let j = k; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}') { d--; if (d === 0) return html.slice(ini, j + 1); } } };
  const ctx = { CondPag: { somaBase: (pags, cfg, f) => pags.filter(f || (() => true)).reduce((a, p) => a + (Number(p.valor) || 0), 0) }, config: {} };
  vm.createContext(ctx);
  vm.runInContext(['creditoOuroDe', 'valorRecebidoDe', 'valorRecebidoExibir', 'valorAReceberDe'].map(pega).join('\n'), ctx);
  return ctx;
}
module.exports = { casos: [
  { nome: 'Venda paga com crédito de ouro: recebido = parte do ouro; a receber = 0 (crédito comum continua não recebido)', bug: 'JV101V (R$ 16.510 em crédito de ouro) aparecia como "A receber"', rodar: async ({ t, ler }) => {
    for (const arq of ['vendas.html', 'painel-ordens.html']) {
      const c = carregar(ler(arq)); const campo = arq === 'vendas.html' ? 'v' : 'o';
      const ouro = { valorTotal: 16510, pagamentos: [{ formaId: '__credito', valor: 16510, creditoOuro: 16510 }] };
      t.ok(c.valorRecebidoExibir(ouro) === 16510, arq + ' recebido (ouro)'); t.ok(c.valorAReceberDe(ouro) === 0, arq + ' a receber (ouro)');
      const comum = { valorTotal: 1000, pagamentos: [{ formaId: '__credito', valor: 1000 }] };
      t.ok(c.valorRecebidoExibir(comum) === 0, arq + ' crédito comum não é recebido'); t.ok(c.valorAReceberDe(comum) === 1000, arq + ' crédito comum segue a receber');
      t.ok(c.valorRecebidoDe(ouro) === 0, arq + ' cancelar/devolver segue sem contar o crédito');
      const misto = { valorTotal: 1000, pagamentos: [{ formaId: '__credito', valor: 1000, creditoOuro: 400 }] };
      t.ok(c.valorRecebidoExibir(misto) === 400, arq + ' misto'); t.ok(c.valorAReceberDe(misto) === 600, arq + ' misto a receber');
    }
  } },
] };
