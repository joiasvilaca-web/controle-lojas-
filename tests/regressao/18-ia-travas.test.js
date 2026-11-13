/* 13/11 — IA só no PAINEL › IA, com acesso total ao app. Únicas travas: gerente/vendedora sem lucro líquido, despesas e salários;
 * oficina sem nada de vendas; diretoria irrestrita. Roda montarResumoNoServidor de verdade, com banco simulado. */
const { pegar } = require('../lib/ts-func');
const NOMES = ['norm', 'STOP', 'termosDaPergunta', 'ler', 'num', 'somaPag', 'FECHADOS', 'montarResumoNoServidor'];
function mockAdmin() {
  const tabelas = {
    ordens_servico: [{ lojaId: 'loja_mc', codigoVia: 'MC1P', cliente: 'ANA', status: 'aguardando', data: '2026-11-20', valorTotal: 500, pagamentos: [{ formaId: 'pix', valor: 200 }], criadoEm: '2026-11-10' }],
    vendas_pdv: [{ lojaId: 'loja_mc', codigoVia: 'MC2V', cliente: 'BIA', valorTotal: 900, data: '2026-11-11', status: 'ok' }, { lojaId: 'loja_jn', codigoVia: 'JN3V', cliente: 'CLA', valorTotal: 700, data: '2026-11-11', status: 'ok' }],
    orcamentos: [{ lojaId: 'loja_mc', codigoVia: 'MC9', cliente: 'DAY', valorTotal: 300, status: 'aberto' }],
    dp_funcionarios: [{ nome: 'ELA', cargo: 'V', loja: 'MC', salario: 2500, status: 'ativo' }],
    dp_registros: [],
    gastos: [{ valor: 1000, status: 'pago', categoria: 'ALUGUEL', vencimento: '2026-11-05' }],
  };
  return {
    from: (t) => ({ select: () => ({ range: async () => ({ data: (tabelas[t] || []).map((p) => ({ payload: p })) }) }) }),
    rpc: async () => ({ data: null }),
  };
}
const config = { lojas: [{ id: 'loja_mc', nome: 'MC', abreviacao: 'MC' }, { id: 'loja_jn', nome: 'JN', abreviacao: 'JN' }], gastosConfig: { status: [{ id: 'pago', tipoPago: true }] } };
async function resumo(nivel) {
  const { montarResumoNoServidor } = pegar('ia-chat.ts', NOMES, { admin: mockAdmin() });
  return montarResumoNoServidor({ nivel, nome: 'T', lojas: ['loja_mc'] }, config, null, 'quanto vendemos');
}
module.exports = { casos: [
  { nome: 'Diretoria: vê tudo (vendas de todas as lojas, gastos e salários)', bug: 'IA com travas demais', rodar: async ({ t }) => {
    const r = await resumo('diretoria'); const j = JSON.stringify(r);
    t.ok(r.vendas && r.vendas.faturamentoTotalVendas === 1600, 'faturamento total de todas as lojas');
    t.ok(r.financeiro && r.financeiro.totalGastosPagos === 1000, 'despesas');
    t.ok(j.includes('"salario":2500'), 'salário');
  } },
  { nome: 'Vendedora/gerente: veem valores de venda da própria loja, mas NÃO despesas, lucro nem salários', bug: 'IA bloqueava valores de venda / vazava despesas', rodar: async ({ t }) => {
    for (const n of ['vendedora', 'gerente']) {
      const r = await resumo(n); const j = JSON.stringify(r);
      t.ok(r.vendas && r.vendas.faturamentoTotalVendas === 900, n + ': vê o faturamento só da própria loja');
      t.ok(!r.financeiro, n + ': sem financeiro/despesas');
      t.ok(!j.includes('salario') && !j.includes('gastosPagos') && !j.includes('ALUGUEL'), n + ': sem salário nem gastos');
      t.ok(r.naoDisponivelParaEsteLogin.join(' ').includes('lucro líquido'), n + ': avisa o que não vê');
    }
  } },
  { nome: 'Oficina: nada de vendas (valores, totais, faturamento) nem despesas', bug: 'oficina via total de vendas', rodar: async ({ t }) => {
    const r = await resumo('oficina'); const j = JSON.stringify({ ...r, naoDisponivelParaEsteLogin: 0 });
    t.ok(!r.vendas, 'sem seção de vendas');
    t.ok(!j.includes('valorTotal') && !j.includes('faturamento') && !j.includes('aReceber') && !j.includes('recebido'), 'sem valores nas vias');
    t.ok(!r.financeiro && !j.includes('salario'), 'sem financeiro nem salário');
    t.ok(r.viasPedidos && r.viasPedidos.total === 1, 'continua vendo as vias');
  } },
  { nome: 'IA fora do PAINEL › IA: sem botões de IA em Marketing, Dashboard, CHAT e Avaliações', bug: 'IA espalhada pelos campos', rodar: async ({ t, ler }) => {
    t.ok(!/ajudarComIA|Escrever com a IA/.test(ler('marketing.html')), 'Marketing sem "Escrever com a IA"');
    t.ok(!/btnPerguntarIa|verificarMonitoramentoIA|gemini-agente/.test(ler('dashboard.html')), 'Dashboard sem pergunta/monitoramento de IA');
    t.ok(!/id="btnIaSug"|id="btnIaRes"/.test(ler('atendimento.html')), 'CHAT sem Sugerir/Resumo IA');
    t.ok(!/Corrigir com IA/.test(ler('avaliacoes-ui.js')), 'Avaliações sem Corrigir com IA');
    t.ok(!/r\.user\.nivel!==.diretoria. && r\.user\.nivel!==.gerente./.test(ler('ia.html')), 'tela IA liberada a todos os perfis');
  } },
] };
