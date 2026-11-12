/* 12/11: Pedido novo com pagamento parcial: botão "Pagar o saldo depois" (fica no cadastro do cliente como fiado) e entrega só depois de pagar. */
module.exports = { casos: [
  { nome: 'Pagamento parcial mostra "Pagar o saldo depois" e ele lança o saldo como fiado', rodar: async ({ t, abrir }) => {
    const p = await abrir('painel-ordens.html');
    const r = await p.evaluate(() => {
      const c = document.createElement('div'); document.body.appendChild(c);
      const holder = { valorTotal: 100, pagamentos: [{ formaId: 'din', valor: 40 }], momentoPagamento: 'na_encomenda' };
      mountPagamentos(c, holder);
      const b = c.querySelector('#btnSaldoDepois'); const antes = !!b;
      if (b) b.click();
      const fi = holder.pagamentos.find(x => x.formaId === '__fiado');
      return { antes, fi: fi && fi.valor, texto: c.innerText };
    });
    t.ok(r.antes, 'o botão aparece quando falta pagar'); t.igual(r.fi, 60, 'lança o saldo de 60 como fiado');
    t.ok(/Saldo de .*60,00.* pagar depois/i.test(r.texto), 'mostra que o saldo fica para depois');
  } },
  { nome: 'Valor digitado e ainda NÃO confirmado com OK: o botão "Lançar restante como a pagar depois" já aparece e lança o resto', bug: 'o botão só aparecia depois de apertar OK na forma de pagamento; o Felipe digitava e não via nada', rodar: async ({ t, abrir }) => {
    const p = await abrir('painel-ordens.html');
    const r = await p.evaluate(() => {
      const c = document.createElement('div'); document.body.appendChild(c);
      const holder = { valorTotal: 100, pagamentos: [{ formaId: 'din', valor: 40, _modo: 'editar' }], momentoPagamento: 'na_encomenda' };
      mountPagamentos(c, holder);
      const b = c.querySelector('#btnSaldoDepois'); const antes = !!b; const txt = b ? b.innerText : '';
      if (b) b.click();
      const din = holder.pagamentos.find(x => x.formaId === 'din'), fi = holder.pagamentos.find(x => x.formaId === '__fiado');
      return { antes, txt, din: din && din._modo, fi: fi && fi.valor };
    });
    t.ok(r.antes, 'botão aparece com o valor só digitado'); t.ok(/60,00/.test(r.txt), 'mostra o restante');
    t.ok(!r.din, 'a forma digitada foi confirmada'); t.igual(r.fi, 60, 'lança o restante de 60 como a pagar depois');
  } },
  { nome: 'Edição de pedido não oferece o botão (saldo existente se paga lançando pagamento)', rodar: async ({ t, abrir }) => {
    const p = await abrir('painel-ordens.html');
    const r = await p.evaluate(() => { const c = document.createElement('div'); document.body.appendChild(c); mountPagamentos(c, { valorTotal: 100, pagamentos: [{ formaId: 'din', valor: 40 }], momentoPagamento: 'na_encomenda', permitirPagarDepois: true }); return !!c.querySelector('#btnSaldoDepois'); });
    t.igual(r, false, 'sem botão na edição');
  } },
  { nome: 'Entrega: saldo que ficou para depois bloqueia até o cliente pagar o fiado no cadastro', bug: 'pedido com saldo podia ser entregue sem o cliente pagar', rodar: async ({ t, abrir }) => {
    const p = await abrir('painel-ordens.html');
    const r = await p.evaluate(async () => {
      let valorPago = 0; window.buscarClientePorTelefoneOuCpf = async () => ({ id: 'c1', nome: 'Maria', telefone: '32999990000', fiadoDebitos: [{ id: 'fd1', valor: 60, valorPago }] });
      const ord = { id: 'o1', cliente: 'Maria', telefone: '32999990000', valorTotal: 100, fiadoDebitoId: 'fd1', pagamentos: [{ formaId: 'din', valor: 40 }, { formaId: '__fiado', valor: 60 }] };
      const a = await saldoRealDaOrdem(ord);
      valorPago = 60; window.buscarClientePorTelefoneOuCpf = async () => ({ id: 'c1', telefone: '32999990000', fiadoDebitos: [{ id: 'fd1', valor: 60, valorPago: 60 }] });
      const b = await saldoRealDaOrdem(ord);
      return { a, b, bloq: await (async () => { window.buscarClientePorTelefoneOuCpf = async () => ({ fiadoDebitos: [{ id: 'fd1', valor: 60, valorPago: 0 }] }); return await bloqueioSaldoEntrega(ord); })() };
    });
    t.igual(r.a, 60, 'fiado não pago: saldo 60'); t.igual(r.b, 0, 'fiado pago no cadastro: saldo 0'); t.igual(r.bloq, true, 'entrega bloqueada com fiado em aberto');
  } },
] };
