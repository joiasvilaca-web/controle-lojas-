/* 10/11: bugs do card Transferências/Reposições (ADM › Transferências). Usa o gancho window.__trTeste da tela. */
module.exports = { casos: [
  { nome: 'Data de hoje é a local (23h30 em Brasília ainda é o mesmo dia)', bug: 'toISOString() usava UTC: depois das 21h o registro nascia com a data de amanhã', rodar: async ({ t, abrir }) => {
    const p = await abrir('transferencias-reposicoes.html');
    const r = await p.evaluate(() => { const Real = Date, fake = new Real('2026-11-10T23:30:00-03:00').getTime(); window.Date = class extends Real { constructor(...a) { if (a.length) super(...a); else super(fake); } static now() { return fake; } }; const v = window.__trTeste.todayISO(); window.Date = Real; return v; });
    t.igual(r, '2026-11-10');
  } },
  { nome: 'Falha ao mover o estoque NÃO é tratada como sucesso e a nova tentativa não duplica itens', bug: 'erro do Kardex era engolido e o registro ficava marcado como "estoque movido"', rodar: async ({ t, abrir }) => {
    let chamadas = 0, modo = 'falha';
    const p = await abrir('transferencias-reposicoes.html', { servidor: b => { if (b.op === 'registrarMovimentoEstoque') { chamadas++; return modo === 'falha' ? { error: 'banco fora do ar' } : { ok: true, saldoNovo: 5 }; } } });
    const r = await p.evaluate(async () => { const T = window.__trTeste; T.setProdutos([{ id: 'p1', nome: 'Anel', estoquePorLoja: {} }]); const rec = { id: 'rt1', tipoTransf: 'SAÍDA', lojaOrigemId: 'loja_mc', lojaDestinoId: 'loja_jn', transferItens: [{ produtoEstoqueId: 'p1', quantidade: 2 }] }; window.__rec = rec; return await T.moverEstoqueTransferencia(rec, 'baixa', -1); });
    t.igual(r, false, 'falha deve devolver false'); t.igual(chamadas, 1, '1 tentativa');
    modo = 'ok';
    const r2 = await p.evaluate(async () => { const rec = window.__rec; const ok = await window.__trTeste.moverEstoqueTransferencia(rec, 'baixa', -1); const ok2 = await window.__trTeste.moverEstoqueTransferencia(rec, 'baixa', -1); return { ok, ok2, marca: rec.transferItens[0].movEstoque.baixa }; });
    t.igual(r2.ok, true, 'segunda tentativa funciona'); t.igual(r2.marca, true, 'item marcado como movido'); t.igual(chamadas, 2, 'o item já movido não é movido de novo');
  } },
  { nome: 'Baixa que falhou fica "pendente" e é refeita na próxima gravação', rodar: async ({ t, abrir }) => {
    let modo = 'falha';
    const p = await abrir('transferencias-reposicoes.html', { servidor: b => { if (b.op === 'registrarMovimentoEstoque') return modo === 'falha' ? { error: 'x' } : { ok: true, saldoNovo: 3 }; } });
    const a = await p.evaluate(async () => { const T = window.__trTeste; T.setProdutos([{ id: 'p1', nome: 'Anel', estoquePorLoja: {} }]); const rec = { id: 'rt2', tipoTransf: 'SAÍDA', lojaOrigemId: 'loja_mc', lojaDestinoId: 'loja_jn', mercadoriaBaixadaC1: true, transferItens: [{ produtoEstoqueId: 'p1', quantidade: 1 }] }; window.__rec = rec; const mudou = await T.aplicarMovimentosEstoqueTransf(rec, { mercadoriaBaixadaC1: false }); return { mudou, mov: !!rec.estoqueBaixaMovida, pend: !!rec.estoqueBaixaPendente }; });
    t.igual(a.mov, false, 'não marca como movido'); t.igual(a.pend, true, 'marca pendente');
    modo = 'ok';
    const b = await p.evaluate(async () => { const rec = window.__rec; await window.__trTeste.aplicarMovimentosEstoqueTransf(rec, { mercadoriaBaixadaC1: true }); return { mov: !!rec.estoqueBaixaMovida, pend: !!rec.estoqueBaixaPendente }; });
    t.igual(b.mov, true, 'refez a baixa'); t.igual(b.pend, false, 'pendência limpa');
  } },
  { nome: 'Número da transação considera os números que já estão no servidor', bug: 'dois aparelhos (ou lista que não carregou) geravam o mesmo número', rodar: async ({ t, abrir }) => {
    const p = await abrir('transferencias-reposicoes.html');
    const r = await p.evaluate(() => window.__trTeste.proximoNumeroTransacao('transferencias', { lojaOrigemId: 'loja_mc', tipoTransf: 'SAÍDA' }, ['MC5TFI', 'MC2TFI', 'JN9TFI']));
    t.igual(r, 'MC6TFI', 'próximo = maior da mesma loja e tipo + 1');
  } },
  { nome: 'Se os registros não carregarem, a tela avisa e não deixa criar com lista vazia', bug: 'erro de carga virava lista vazia e os números reiniciavam em 1', rodar: async ({ t, abrir }) => {
    const p = await abrir('transferencias-reposicoes.html', { servidor: b => (b.op === 'selectPage' || b.op === 'selectAll') ? { error: 'sem conexão' } : undefined });
    await p.waitForTimeout(900);
    t.igual(await p.evaluate(() => window.__trTeste.state.erroCarga === true), true, 'flag de erro de carga');
    t.ok(/não consegui carregar/i.test(await p.evaluate(() => document.body.innerText)), 'aviso na tela');
  } },
] };
