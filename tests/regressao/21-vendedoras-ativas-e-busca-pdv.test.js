/* 13/11 — (1) inativos e oficina não aparecem na lista de vendedoras (Venda, Pedido, Orçamento);
 * (2) PDV: BUSCAR VIA e BUSCAR PREÇO separados, cada um com campo; botões da tela sem pontilhado. */
const vm = require('vm'), fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..', '..');
module.exports = { casos: [
  { nome: 'FuncAtivos: tira inativo (ficha do DP) e oficina, mantém vendedora, gerente e diretor', bug: 'inativo e oficina apareciam como vendedora', rodar: async ({ t }) => {
    const ctx = { console, Date, setTimeout, Promise, window: {}, document: { head: { appendChild() {} }, createElement: () => ({}), addEventListener() {}, querySelectorAll: () => [], getElementById: () => null }, navigator: {}, localStorage: {},
      gatewayCall: async () => ({ data: [{ payload: { funcionarioId: 'f2', nome: 'ANA ANTIGA', status: 'desligado' } }, { payload: { funcionarioId: 'f1', nome: 'BIA', status: 'ativo' } }], fim: true }) };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(RAIZ, 'vilaca-extras.js'), 'utf8'), ctx);
    await ctx.FuncAtivos.carregar();
    t.ok(ctx.FuncAtivos.pode({ id: 'f1', nome: 'BIA', cargos: ['vendedora'] }), 'ativa entra');
    t.ok(!ctx.FuncAtivos.pode({ id: 'f2', nome: 'ANA ANTIGA', cargos: ['vendedora'] }), 'inativa (ficha do DP) sai');
    t.ok(!ctx.FuncAtivos.pode({ id: 'f9', nome: 'ANA ANTIGA', cargos: ['vendedora'] }), 'inativa pelo nome também sai');
    t.ok(!ctx.FuncAtivos.pode({ id: 'f3', nome: 'OTO', cargos: ['oficina'] }), 'oficina sai');
    t.ok(!ctx.FuncAtivos.pode({ id: 'f4', nome: 'X', cargos: ['vendedora'], status: 'desligado' }), 'status desligado no cadastro sai');
    t.ok(ctx.FuncAtivos.pode({ id: 'f5', nome: 'GE', cargos: ['gerente'] }) && ctx.FuncAtivos.pode({ id: 'f6', nome: 'DI', cargos: ['diretor'] }), 'gerente e diretor entram');
  } },
  { nome: 'As listas de vendedora dos três cards usam FuncAtivos', bug: 'filtro não aplicado', rodar: async ({ t, ler }) => {
    t.ok(/FuncAtivos\.pode\(f\)\)\);/.test(ler('vendas.html')), 'Venda');
    t.ok(/area!=='vendedora' \|\| !window\.FuncAtivos \|\| FuncAtivos\.pode\(f\)/.test(ler('painel-ordens.html')), 'Pedido');
    t.ok(/FuncAtivos\.pode\(f\)\)\)\.map\(/.test(ler('orcamentos.html')), 'Orçamento');
    ['vendas', 'painel-ordens', 'orcamentos'].forEach((a) => t.ok(/FuncAtivos\.carregar\(\)/.test(ler(a + '.html')), a + ' carrega os inativos'));
  } },
  { nome: 'PDV: BUSCAR VIA e BUSCAR PREÇO com campo próprio e botões sem pontilhado', bug: 'busca única e moldura pontilhada', rodar: async ({ t, ler }) => {
    const ix = ler('index.html');
    t.ok(/id="inpBuscaVia"/.test(ix) && /id="inpBuscaPreco"/.test(ix), 'um campo para cada');
    t.ok(/navegarParaCodigoVia\(c\)/.test(ix) && /abrirConsultaPreco\(t\)/.test(ix), 'via abre via; preço abre consulta de preço');
    const css = ix.slice(ix.indexOf('.vendas-home-leitor-bar{'), ix.indexOf('.vendas-home-chamar .gc-icon'));
    t.ok(!/dashed/.test(css), 'sem borda pontilhada nos botões do PDV');
  } },
] };
