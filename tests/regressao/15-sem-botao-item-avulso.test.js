/* 12/11: o botão "Item avulso" saiu de Venda e Pedido (item novo precisa vir do catálogo). Só aparece em item antigo já avulso. */
module.exports = { casos: [
  { nome: 'Venda e Pedido não oferecem mais "Item avulso" para item novo', rodar: async ({ t, ler }) => {
    for (const tela of ['vendas.html', 'painel-ordens.html']) {
      const s = ler(tela);
      const m = s.match(/\$\{it\.avulso\?`<label class="(chk-avulso|item-avulso-chk)"/);
      t.ok(!!m, tela + ': checkbox só aparece quando o item já é avulso');
      t.ok(!/> Item avulso \((fora do catálogo|sem estoque)/.test(s), tela + ': texto antigo do botão removido');
    }
  } },
] };
