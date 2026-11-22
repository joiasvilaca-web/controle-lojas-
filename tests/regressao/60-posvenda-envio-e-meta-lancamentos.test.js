/* 22/11 — (1) pós-venda automático de venda da Reforma/Ecommerce (peça enviada depois) espera a peça chegar (25 dias), não 7: cliente recebia "a peça vestiu bem?" sem ter a peça (RJ42V).
 * (2) Felipe usa a meta do LANÇAMENTOS (fator da loja) e a participação da vendedora. */
module.exports = { casos: [
  { nome: 'acompanhamento-auto v26: pós-venda remoto só depois de diasEnvio (25)', bug: 'pós-venda antes da peça chegar', rodar: async ({ t, ler }) => {
    const s = ler('acompanhamento-auto.ts');
    t.ok(/const remota = \["loja_rj", "loja_ec"\]\.includes/.test(s) && /remota \? Math\.max\(dias, Number\(pv\.diasEnvio\) \|\| 25\) : dias/.test(s), 'regra');
  } },
  { nome: 'copiloto v3: meta das faixas do Lançamentos', bug: 'meta R$ 0 com metas lançadas no Lançamentos', rodar: async ({ t, ler }) => {
    const s = ler('copiloto.ts');
    t.ok(/eq\("tipo", "fator"\)\.eq\("chave", chaveLanc\)\.lte\("mes", mes\)/.test(s) && /loja_mc: "MARECHAL"/.test(s) && /tipo: "lancamentos"/.test(s), 'lê o fator da loja e a participação');
  } },
] };
