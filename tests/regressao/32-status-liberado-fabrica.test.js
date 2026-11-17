/* 17/11 — O status oficina_pronto passa a se chamar LIBERADO FÁBRICA em todas as telas (era PRODUZIDO). A chave gravada não muda. */
module.exports = { casos: [
  { nome: 'Nenhuma tela mostra mais PRODUZIDO; todas mostram LIBERADO FÁBRICA para oficina_pronto', bug: 'status com nome antigo em alguma tela', rodar: async ({ t, ler }) => {
    for (const a of ['painel-ordens.html', 'insumos.html', 'dashboard.html', 'vendas.html', 'acompanhar.html', 'busca-vias.js', 'index.html', 'agenda.html']) {
      const s = ler(a);
      t.ok(!/\bPRODUZID[OA]S?\b/.test(s) && !/oficina_pronto:\s*['"]Produzido['"]/.test(s), a + ' sem o nome antigo');
    }
    for (const a of ['painel-ordens.html', 'insumos.html', 'dashboard.html', 'vendas.html']) t.ok(/oficina_pronto:\s*['"]LIBERADO FÁBRICA['"]/.test(ler(a)), a + ' com o nome novo');
    t.ok(/oficina_pronto:'Liberado fábrica'/.test(ler('busca-vias.js')) && /oficina_pronto:'Liberado fábrica'/.test(ler('index.html')), 'busca de vias com o nome novo');
    t.ok(/data-acao="produzido"/.test(ler('insumos.html')) && /oficina_pronto/.test(ler('painel-ordens.html')), 'a chave interna do status continua a mesma');
  } },
] };
