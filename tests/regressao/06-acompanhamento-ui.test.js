/* 10/11: a seção "Ações de acompanhamento" é igual em Venda, Pedido e Orçamento (acompanhamento-ui.js). */
module.exports = { casos: [
  { nome: 'Programados: ícone do WhatsApp sem moldura, clicável, envia só após confirmar', rodar: async ({ t, abrir }) => {
    const p = await abrir('vendas.html');
    const r = await p.evaluate(async () => {
      document.body.insertAdjacentHTML('beforeend', '<div id="zz"></div>');
      const enviados = []; let pergunta = 0;
      window.confirm = () => { pergunta++; return pergunta > 1; };   // 1º clique: cancela; 2º: confirma
      const now = Date.now();
      AcompUI.desenhar(document.getElementById('zz'), { sub: 'x', prog: [{ id: 'a', em: now + 3600e3, via: 'JN1V', cliente: 'Ana', acao: 'Pós-venda', loja: 'JN', vendedora: 'Bia' }], env: [{ id: 'b', em: now - 3600e3, via: 'JN2V', cliente: 'Cris', acao: 'Pós-venda', loja: 'JN', vendedora: 'Bia' }], onEnviar: async it => { enviados.push(it.id); } });
      const btn = document.querySelector('#zz button[data-acenviar]'); const borda = getComputedStyle(btn).borderTopWidth;
      btn.click(); await new Promise(r => setTimeout(r, 50)); const aposCancelar = enviados.length;
      btn.click(); await new Promise(r => setTimeout(r, 50));
      const ok = document.querySelector('#zz .ac2-zap.ok'); const visto = ok ? getComputedStyle(ok, '::after').content : '';
      const texto = document.querySelector('#zz').innerText;
      return { borda, aposCancelar, enviados, temOk: !!ok, visto, texto };
    });
    t.igual(r.borda, '0px', 'sem moldura'); t.igual(r.aposCancelar, 0, 'cancelar não envia'); t.igual(r.enviados.join(), 'a', 'confirmar envia');
    t.ok(r.temOk, 'enviados com ícone .ok (verde)'); t.ok(/2713|✓/.test(r.visto), 'visto por cima do ícone');
    t.ok(/JN1V/.test(r.texto) && /Pós-venda/.test(r.texto) && /JN/.test(r.texto) && /Bia/.test(r.texto) && /Ana/.test(r.texto), 'via, cliente, ação, loja e vendedora aparecem');
  } },
  { nome: 'Programados sem horário mostra "em breve"; só com dia previsto mostra a data', rodar: async ({ t, abrir }) => {
    const p = await abrir('vendas.html');
    const txt = await p.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div id="zz"></div>'); AcompUI.desenhar(document.getElementById('zz'), { prog: [{ id: 'a', em: 9e15, via: 'V1', cliente: 'A', acao: 'x' }, { id: 'b', em: Date.now() + 5 * 864e5, previsto: true, via: 'V2', cliente: 'B', acao: 'x' }], env: [] }); return document.getElementById('zz').innerText; });
    t.ok(/em breve/.test(txt), 'em breve'); t.ok(/previsto/.test(txt), 'previsto');
  } },
] };
