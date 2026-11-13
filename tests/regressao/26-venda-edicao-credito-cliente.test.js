/* 13/11 — Editar venda: a forma CRÉDITO CLIENTE aparece (cliente da via, mais o crédito que a própria via já usou). */
module.exports = { casos: [
  { nome: 'Edição completa da venda carrega crédito/cashback do cliente da via', bug: 'na edição a forma CRÉDITO CLIENTE não aparecia (cliente só texto, saldo nunca carregado)', rodar: async ({ t, ler }) => {
    const h = ler('vendas.html'); const ed = h.slice(h.indexOf('function abrirFormularioEdicaoCompleta'));
    t.ok(/_carregarSaldosEd/.test(ed) && /acharClienteDaVenda\(\{ telefone: v\.telefone/.test(ed), 'acha o cliente da via');
    t.ok(/credito: \(Number\(c\.credito\)\|\|0\) \+ \(Number\(v\.creditoUsado\)\|\|0\)/.test(ed), 'soma o crédito já usado pela via');
    t.ok(ed.indexOf('definirCreditoCliente(null, false)') < ed.indexOf('mountPagamentos('), 'limpa saldo antigo antes de montar');
  } },
] };
