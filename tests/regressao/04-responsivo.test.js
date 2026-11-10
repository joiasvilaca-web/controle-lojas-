/* 10/11: celular e tablet — página sem rolagem lateral e cartões que não vazam. (O teste desliga a rede de segurança overflow-x:clip para enxergar o estouro real.) */
const semEstouro = async (t, p, nome) => { const r = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); t.ok(r[0] <= r[1] + 1, `${nome}: página com ${r[0]}px numa tela de ${r[1]}px`); };
module.exports = { casos: [
  { nome: 'Pedido e Venda no tablet (768px) não alargam a página', bug: '.sr-only absoluto escapava da rolagem da tabela', rodar: async ({ t, abrir }) => {
    for (const f of ['painel-ordens.html', 'vendas.html']) { const p = await abrir(f, { w: 768, h: 1024, ls: { vilaca_modo_os_v2: 'lista' } }); await semEstouro(t, p, f + ' @768'); }
  } },
  { nome: 'Orçamento no celular (320 e 360px) sem estouro nos filtros', bug: 'filtros e barra de abas passavam da tela', rodar: async ({ t, abrir }) => {
    for (const w of [320, 360, 390]) { const p = await abrir('orcamentos.html', { w, h: 800 }); await semEstouro(t, p, 'orcamentos @' + w); }
  } },
  { nome: 'Pedido (lista no celular): número da via não é espremido pelo status', bug: 'via aparecia cortada ("MC")', rodar: async ({ t, abrir }) => {
    const p = await abrir('painel-ordens.html', { w: 360, h: 800, ls: { vilaca_modo_os_v2: 'lista' } });
    const r = await p.evaluate(() => { const td = document.querySelector('.tabela-os td.c-via'); if (!td) return null; const b = td.getBoundingClientRect(); const txt = td.querySelector('.via'); return { w: b.width, txt: txt ? txt.scrollWidth : 0, cortado: txt ? txt.getBoundingClientRect().width < txt.scrollWidth - 1 : false }; });
    t.ok(r, 'linha da lista encontrada'); if (r) t.ok(!r.cortado, 'via cortada');
  } },
  { nome: 'Venda (lista no celular): ícones de Ações ficam dentro do cartão', bug: 'célula Ações encolhia a 20px e os ícones vazavam', rodar: async ({ t, abrir }) => {
    const p = await abrir('vendas.html', { w: 360, h: 800 });
    const r = await p.evaluate(() => { const tb = document.querySelector('.tabela-vendas'); if (!tb) return null; const tr = tb.getBoundingClientRect(); return [...tb.querySelectorAll('.acoes-linha button')].filter(b => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().right > tr.right + 1).length; });
    t.ok(r !== null, 'tabela encontrada'); t.igual(r, 0, 'botões fora do cartão');
  } },
  { nome: 'Chat: botão "Nova conversa" cabe a 320px', rodar: async ({ t, abrir }) => {
    const p = await abrir('atendimento.html', { w: 320, h: 640, entrar: false }); await semEstouro(t, p, 'atendimento @320');
  } },
] };
