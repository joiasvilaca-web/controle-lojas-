/* 13/11 — o campo Vendedora aceita DIRETORES (e gerentes) em Venda e Pedido; Lançamentos já soma pelo nome (login diretoria/gerente/vendedora). */
module.exports = { casos: [
  { nome: 'Venda e Pedido listam diretor/gerente no campo Vendedora', bug: 'diretor não aparecia como vendedora', rodar: async ({ t, ler }) => {
    const v = ler('vendas.html'); const i = v.indexOf('function vendedoraOptionsHtml');
    t.ok(/\['vendedora','gerente','diretor','diretoria'\]/.test(v.slice(i, i + 700)), 'Venda: cargos vendedora, gerente e diretor');
    t.ok(/nivel==='diretoria'/.test(v.slice(i, i + 900)), 'Venda: diretor sem ficha entra pelo login');
    const p = ler('painel-ordens.html'); const j = p.indexOf('function funcionarioOptionsHtml');
    t.ok(/area==='vendedora' && currentUser && currentUser\.nivel==='diretoria'/.test(p.slice(j, j + 600)), 'Pedido: diretor sem ficha entra pelo login');
    t.ok(/cargos\.includes\('diretor'\)/.test(p), 'Pedido: cargo diretor atende vendedora');
  } },
  { nome: 'Lançamentos reconhece diretoria como vendedora pelo nome da via', bug: 'venda de diretor fora do total da loja', rodar: async ({ t, ler }) => {
    const s = ler('lancamentos-api.ts');
    t.ok(/NIVEIS_LISTA = \["vendedora", "gerente", "diretoria"\]/.test(s), 'lista de lançamento inclui diretoria');
    t.ok(/function chaveDoRegistro/.test(s) && /VENDEDORAS\.includes\(p\)/.test(s), 'via sem ficha casa pelo 1º nome');
  } },
] };
