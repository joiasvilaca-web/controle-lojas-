/* 12/11: Gastos › recorrência mensal/anual agora pode ter fim (quantas vezes) ou repetir sempre. */
module.exports = { casos: [
  { nome: 'Recorrente mensal com quantidade gera só N lançamentos; sem quantidade repete sempre', rodar: async ({ t, abrir }) => {
    const p = await abrir('gastos.html');
    const r = await p.evaluate(async () => {
      const salvos = []; window.gw = async b => { if (b.op === 'upsert' && b.table === 'gastos') salvos.push(b.params.row.payload); return { ok: true, data: [] }; };
      const hj = new Date(); const ini = hj.toISOString().slice(0, 10);
      gastos.length = 0; fixos.length = 0;
      fixos.push({ id: 'fA', nome: 'ALUGUEL', valor: 100, lojaId: 'loja_mc', recorrencia: 'mensal', dataInicio: ini, ativo: true, repeticoes: 3 });
      fixos.push({ id: 'fB', nome: 'INTERNET', valor: 50, lojaId: 'loja_mc', recorrencia: 'mensal', dataInicio: ini, ativo: true });
      await gerarInstanciasFixos();
      const a = gastos.filter(g => g.fixoId === 'fA'), b = gastos.filter(g => g.fixoId === 'fB');
      return { a: a.length, b: b.length, rotulo: recLabel(a[0]), ult: a.map(x => x.repeticaoInfo && x.repeticaoInfo.numero + '/' + x.repeticaoInfo.total) };
    });
    t.igual(r.a, 3, 'com quantidade 3: só 3 lançamentos');
    t.ok(r.b > 3, 'sem quantidade: repete sempre (gera os próximos meses)');
    t.igual(r.rotulo, 'Mensal 1/3', 'etiqueta mostra a parcela');
  } },
  { nome: 'Tela de lançar gasto tem a escolha Sempre / quantidade para recorrência mensal', rodar: async ({ t, ler }) => {
    const s = ler('gastos.html');
    t.ok(/id="gRepModo"/.test(s) && /Sempre \(sem fim\)/.test(s) && /fixo\.repeticoes=q/.test(s), 'campo e gravação da quantidade');
  } },
] };
