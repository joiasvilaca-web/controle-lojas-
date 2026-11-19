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
  { nome: 'Tela: o módulo AGENDA (agenda.html) tem seletor de escopo das vias; a agenda do Pedido também', bug: 'seletor foi para a cópia errada da agenda', rodar: async ({ t, ler }) => {
    const a = ler('agenda.html');
    t.ok(/id="agEscopoVias"/.test(a) && /Em meu nome/.test(a) && /Da minha loja/.test(a) && /De todas as lojas/.test(a), 'seletor na Agenda');
    t.ok(/op:'minhasVias', escopo:e/.test(a) && /function agViasCal\(\)/.test(a), 'busca por escopo e cache à parte');
    const p = ler('painel-ordens.html');
    t.ok(/id="agEscopo"/.test(p) && /function ordensDaAgenda\(\)/.test(p) && (p.match(/ordensDaAgenda\(\)\.filter/g) || []).length === 2, 'agenda do Pedido filtra calendário e dia pelo escopo');
  } },
  { nome: 'Aviso de orçamento em aberto: item 8/serviço só no Pedido, item 9 só na Venda; Orçamento novo sempre avisa', bug: 'aviso aparecia nos dois módulos / não aparecia no orçamento', rodar: async ({ t, ler }) => {
    const mk = (src, nome) => { const m = src.match(new RegExp('function ' + nome + '\\(o\\)\\{[\\s\\S]*?\\n\\}\\n|function ' + nome + '\\(o\\)\\{[^\\n]*\\}\\n')); t.ok(!!m, nome + ' existe'); const c = vm.createContext({}); vm.runInContext(m[0], c); return c[nome]; };
    const pe = mk(ler('painel-ordens.html'), 'orcamentoEhDePedido'), ve = mk(ler('vendas.html'), 'orcamentoEhDeVenda');
    const o9 = { itens: [{ produto: '9001 ANEL' }] }, o8 = { itens: [{ produto: '8001 ALIANCA' }] }, om = { itens: [{ produto: '9001 ANEL' }, { produto: '8001 ALIANCA' }] };
    t.ok(pe(o8) && !pe(o9) && pe(om), 'Pedido: 8 sim, 9 não, misto sim');
    t.ok(ve(o9) && !ve(o8) && ve(om), 'Venda: 9 sim, 8 não, misto sim');
    t.ok(!/data-virarvenda/.test(ler('painel-ordens.html')), 'sem botão de venda no Pedido');
    const o = ler('orcamentos.html');
    t.ok(/function avisarOrcamentosAbertosDoCliente\(/.test(o) && /avisarOrcamentosAbertosDoCliente\(c, /.test(o), 'Orçamento novo avisa os em aberto do cliente');
  } },
] };
