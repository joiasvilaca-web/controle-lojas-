/* 18/11 — (1) Agenda › Calendário mostra vias em meu nome / da minha loja / de todas as lojas;
 * (2) Pedido: orçamento em aberto só com produtos de código 9 pergunta "transformar em venda" (8/serviço segue "É este" = pedido). */
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = { casos: [
  { nome: 'Servidor: minhasVias com escopo loja/todas filtra por loja; diretoria vê todas, os demais só as suas', bug: 'calendário só mostrava vias em nome do usuário', rodar: async ({ t, ler }) => {
    const s = ler('agenda-tarefas.ts');
    t.ok(/\["loja", "todas"\]\.includes\(String\(b\.escopo\)\)/.test(s), 'escopo validado');
    t.ok(/escopo === "todas" && ehDiretoria \? todasIds : \(ehDiretoria && !minhasLojas\.length \? todasIds : minhasLojas\)/.test(s), 'só diretoria amplia para todas as lojas');
    t.ok((s.match(/\.in\("payload->>lojaId", lojasEsc\)/g) || []).length === 3, 'orçamentos, vendas e pedidos filtrados pela loja');
  } },
  { nome: 'Tela: calendário tem seletor de escopo e cache separado da aba Minhas vias', bug: 'sem opção no calendário', rodar: async ({ t, ler }) => {
    const a = ler('atendimento.html');
    t.ok(/id="agEscopoVias"/.test(a) && /Em meu nome/.test(a) && /Da minha loja/.test(a) && /De todas as lojas/.test(a), 'seletor');
    t.ok(/op:'minhasVias', escopo:e/.test(a) && /function agViasCal\(\)/.test(a), 'busca por escopo e cache à parte');
  } },
  { nome: 'Pedido: orçamento só com produtos 9 pergunta se vira venda; com 8/serviço segue "É este"', bug: 'pedido oferecia transformar em pedido orçamento de produto de venda', rodar: async ({ t, ler }) => {
    const src = ler('painel-ordens.html'); const m = src.match(/function orcamentoEhDeVenda\(o\)\{[\s\S]*?\n\}\n/);
    t.ok(!!m, 'função existe'); const ctx = vm.createContext({}); vm.runInContext(m[0], ctx); const f = ctx.orcamentoEhDeVenda;
    t.ok(f({ itens: [{ produto: '9001 ANEL' }] }) === true, 'só 9 → venda');
    t.ok(f({ itens: [{ produto: '8001 ALIANCA' }] }) === false, 'só 8 → pedido');
    t.ok(f({ itens: [{ produto: '9001 ANEL' }, { produto: '8001 ALIANCA' }] }) === false, 'misto → pedido');
    t.ok(f({ itens: [{ produto: '9001 ANEL' }, { produto: 'SOLDA', tipoItem: 'servico' }] }) === false, 'com serviço → pedido');
    t.ok(f({ itens: [] }) === false, 'sem itens → pedido');
    t.ok(/data-virarvenda/.test(src) && /converterOrcamento:o\.id/.test(src) && /confirm\('Este orçamento tem produtos de venda/.test(src), 'botão pergunta e abre a Venda com o orçamento');
  } },
] };
