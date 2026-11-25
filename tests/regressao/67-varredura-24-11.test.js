/* 24/11 — VARREDURA GERAL (pedido do Felipe). Um teste por falha achada e corrigida nessa noite. */
const vm = require('vm');
module.exports = { casos: [
  { nome: 'Pedido ENTREGUE baixa o estoque: trava do banco aceita VENDA_PEDIDO/CANCELAMENTO_PEDIDO e a devolução vai pela estoque-api', bug: 'nenhum pedido entregue baixava o estoque (a trava do banco recusava o tipo do movimento) e a devolução caía no db-gateway, que também recusava', rodar: async ({ t, ler }) => {
    const sql = ler('sql/estoque-mov-tipos-pedido.sql'), api = ler('estoque-api.ts'), p = ler('painel-ordens.html');
    t.ok(/'VENDA_PEDIDO','CANCELAMENTO_PEDIDO'/.test(sql), 'migration amplia a trava');
    t.ok(/if \(b\.op === "devolver"\)/.test(api) && /p_tipo_movimento: "CANCELAMENTO_PEDIDO"/.test(api) && /\.eq\("status", "baixada"\)/.test(api), 'estoque-api: op devolver só para o que foi baixado');
    t.ok(/estoqueApi\('devolver', \{ origemTipo:'os', origemId: order\.id, produtoId: row\.produto_id/.test(p), 'cancelamento devolve pela estoque-api');
    t.ok(!/registrarMovimentoEstoque[^\n]*CANCELAMENTO_PEDIDO/.test(p), 'nada de CANCELAMENTO_PEDIDO pelo db-gateway (ele recusa)');
  } },
  { nome: 'Pedido: local da via acompanha o status em qualquer caminho', bug: 'ENVIADO P/ FÁBRICA marcado como "loja"; via PRONTA marcada "na fábrica" e ENTREGUE "na loja"', rodar: async ({ t, ler }) => {
    const p = ler('painel-ordens.html');
    t.ok(/const LOCAL_POR_STATUS = \{[^}]*enviado_fabrica:'fabrica'/.test(p), 'enviado_fabrica = fábrica');
    const i = p.indexOf('async function saveOrders(){'); const fn = p.slice(i, p.indexOf('\n}\n', i));
    t.ok(i > 0 && /mudadas\.forEach\(o=>\{ try\{ if\(o\.status && LOCAL_POR_STATUS\[o\.status\]\) sincronizarLocalPorStatus\(o\)/.test(fn), 'saveOrders confere o local de toda via que vai gravar');
  } },
  { nome: 'Pedido › editar/entregar: Pix pessoa física libera sem nota; Pix loja exige a resposta da nota', bug: 'a edição validava a nota pelo valor antigo da via', rodar: async ({ t, ler }) => {
    const p = ler('painel-ordens.html');
    t.ok(/if\(soPixPF\(editPagHolder\.pagamentos\)\) editPagHolder\.emissaoNota = 'nao';/.test(p) && /notaEmpresasErro\(editPagHolder \|\| order, loja\)/.test(p), 'regra do Pix na edição, com o pagamento de agora');
  } },
  { nome: 'Venda › editar: confere tudo ANTES de desfazer o estoque e o crédito', bug: 'parar no aviso de estoque/crédito deixava a devolução gravada; cada novo Salvar devolvia de novo (JN38V, 04/11)', rodar: async ({ t, ler }) => {
    const v = ler('vendas.html');
    const i0 = v.indexOf('0) CONFERE ANTES DE DESFAZER'), i1 = v.indexOf('// ===== 1) Desfaz o que a venda original lançou');
    t.ok(i0 > 0 && i1 > i0, 'passo 0 vem antes do passo 1');
    const passo0 = v.slice(i0, i1);
    t.ok(/Estoque insuficiente pra/.test(passo0) && /cliente precisa estar cadastrado/.test(passo0) && /Crédito insuficiente/.test(passo0), 'as três paradas ficam no passo 0');
    t.ok(!/gatewayCall|salvarUmCliente/.test(passo0), 'o passo 0 não grava nada');
    const depois = v.slice(i1, v.indexOf('// ===== 4) Aplica tudo e regrava a venda', i1));
    t.ok(!/confirm\(/.test(depois), 'depois de desfazer não há mais pergunta que possa interromper');
  } },
  { nome: 'Venda › troca: cadastro e crédito do cliente conferidos antes de mexer no estoque', bug: 'troca parava em "crédito insuficiente" com a peça antiga já devolvida e a nova já baixada', rodar: async ({ t, ler }) => {
    const v = ler('vendas.html');
    const i0 = v.indexOf('o cadastro e o crédito do cliente são conferidos AQUI'), i1 = v.indexOf('// Devolve estoque do item antigo (mesma loja)');
    t.ok(i0 > 0 && i1 > i0 && /Crédito insuficiente/.test(v.slice(i0, i1)) && !/registrarMovimentoEstoque/.test(v.slice(i0, i1)), 'conferência antes do primeiro movimento de estoque');
  } },
  { nome: 'Venda: desfazer troca, cancelar depois de desfeita e aviso de MARKETING OFF', bug: 'venda com troca não cancelava; marketing-off.js nunca era carregado na Venda', rodar: async ({ t, ler }) => {
    const v = ler('vendas.html');
    t.ok(/async function desfazerTroca\(venda, trocaId\)/.test(v) && /data-desfazertroca=/.test(v), 'Desfazer troca na via');
    t.ok(/venda\.trocas\.some\(t=>!t\.desfeita && t\.tipoMov!=='estornoTroca'\)/.test(v), 'cancelar só trava com troca ainda ativa');
    t.ok(/<script src="marketing-off\.js"><\/script>/.test(v), 'marketing-off.js carregado');
  } },
  { nome: 'Marketing: uma só diasDesde, que aceita número, data e vazio', bug: 'duas funções com o mesmo nome; a que valia quebrava a aba Orçamentos ("slice is not a function")', rodar: async ({ t, ler }) => {
    const m = ler('marketing.html');
    t.igual((m.match(/function diasDesde\(/g) || []).length, 1, 'uma só definição');
    const diaLocal = /function diaLocal\(ts\)\{[^\n]*\}/.exec(m), fn = /function diasDesde\(v\)\{[\s\S]*?\n(?=function chaveTel)/.exec(m);
    t.ok(diaLocal && fn, 'achou as funções');
    const ctx = {}; vm.createContext(ctx); vm.runInContext(diaLocal[0] + '\n' + fn[0], ctx);
    t.igual(vm.runInContext('diasDesde(Date.now() - 3*86400000)', ctx), 3, 'número (ms)');
    t.igual(vm.runInContext('diasDesde(null)', ctx), 999, 'vazio');
    t.igual(vm.runInContext('diasDesde(diaLocal(Date.now()))', ctx), 0, 'dia de hoje');
    t.igual(vm.runInContext('diasDesde(new Date(Date.now() - 2*86400000).toISOString())', ctx) >= 1, true, 'data/hora ISO');
  } },
  { nome: 'Dashboard › Custo e margem: resultado líquido desconta os Gastos, menos a compra de mercadoria', bug: 'a margem nunca olhava os Gastos; recompra lançada em Gastos não podia descontar duas vezes', rodar: async ({ t, ler }) => {
    const d = ler('dashboard.html');
    t.ok(/function renderResultadoLiquido\(lucroBruto, vendidoSemCusto\)/.test(d) && /renderResultadoLiquido\(margem, receita - receitaComCusto\)/.test(d), 'bloco ligado ao cálculo da margem');
    t.ok(/return \["Fornecedores"\];/.test(d) && /cats\.filter\(\(\[c\]\)=> !fora\.has\(c\)\)/.test(d), 'Fornecedores fora por padrão; só as outras categorias descontam');
  } },
  { nome: 'ficha-loja-api do repositório = a publicada (v2, com a ficha GERAL)', bug: 'arquivo antigo (v1) tinha voltado ao repositório', rodar: async ({ t, ler }) => {
    const a = ler('ficha-loja-api.ts');
    t.ok(/^\/\/ ficha-loja-api v2/.test(a) && /const acessiveis = telaNova \? \[\.\.\.permitidas, GERAL\] : permitidas/.test(a) && /fornecedores \}\);/.test(a), 'v2 no repositório');
  } },
] };
