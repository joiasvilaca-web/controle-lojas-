/* 18/11 — DP › Avaliações dos clientes: busca por quantidade de estrelas e por vendedora. */
module.exports = { casos: [
  { nome: 'Avaliações: filtros de estrelas (1 a 5) e de vendedora, sem carregar a lista sozinha', bug: 'só dava para filtrar por nota baixa e sem resposta', rodar: async ({ t, ler }) => {
    const s = ler('avaliacoes-ui.js');
    t.ok(/data-estrelas/.test(s) && /<option value="5">5 estrelas<\/option>/.test(s) && /<option value="1">1 estrela<\/option>/.test(s), 'seletor de estrelas 1 a 5');
    t.ok(/data-vend/.test(s) && /avaliacoesMedias/.test(s.slice(s.indexOf('data-vend'))), 'seletor de vendedora com os nomes que têm avaliação');
    t.ok(/Number\(a\.estrelas\)===Number\(filtro\.estrelas\)/.test(s) && /atendente:filtro\.atendente/.test(s), 'filtra pela nota e pela vendedora');
    t.ok(/el\.querySelector\('\[data-buscar\]'\)\.onclick=buscar/.test(s) && !/buscar\(\);\s*\n\s*chamar\(\{acao:'avaliacoesMedias'/.test(s), 'a lista só carrega quando a pessoa busca');
  } },
] };
