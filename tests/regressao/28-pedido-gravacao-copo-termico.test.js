/* 16/11 — Pedido: "1 SERVIÇO GRAVAÇÃO COPO TÉRMICO (POR DISPARO)" abre a seção com os dados do item de Gravações,
 * a tabela de valor (1 NOME 10, 1 LOGO 10, 1 NOME + LOGO 18) e a quantidade; o total do pedido respeita a quantidade. */
const vm = require('vm');
function pega(html, nome) { const i = html.indexOf('function ' + nome + '('); let d = 0; for (let j = html.indexOf('{', i); j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}') { d--; if (d === 0) return html.slice(i, j + 1); } } }
module.exports = { casos: [
  { nome: 'Gravação copo térmico: identifica o item, tabela de valores e texto que vai para a via', bug: 'serviço novo sem os dados da gravação', rodar: async ({ t, ler }) => {
    const h = ler('painel-ordens.html');
    const ctx = { produtosEstoque: [{ id: 'p1', nome: 'QUALQUER', gravacaoDisparo: true }, { id: 'p2', nome: '1 SERVIÇO GRAVAÇÃO JOIAS' }] };
    vm.createContext(ctx);
    const opc = h.match(/const GRAV_OPCOES = .*;/)[0].replace('const ', 'var '), ori = h.match(/const GRAV_ORIENT = .*;/)[0].replace('const ', 'var ');
    vm.runInContext(opc + ori + ['itemEhGravacaoDisparo', 'gravTemNome', 'gravTemLogo', 'gravObsTexto'].map((n) => pega(h, n)).join('\n'), ctx);
    t.ok(JSON.stringify(ctx.GRAV_OPCOES.map((o) => [o.rot, o.valor])) === JSON.stringify([['1 NOME', 10], ['1 LOGO', 10], ['1 NOME + LOGO', 18]]), 'tabela 10 / 10 / 18');
    t.ok(ctx.itemEhGravacaoDisparo({ produtoEstoqueId: 'p1', produto: 'X' }), 'pelo cadastro (gravacaoDisparo)');
    t.ok(ctx.itemEhGravacaoDisparo({ produto: '1 SERVIÇO GRAVAÇÃO COPO TÉRMICO (POR DISPARO)' }), 'pelo nome');
    t.ok(!ctx.itemEhGravacaoDisparo({ produtoEstoqueId: 'p2', produto: '1 SERVIÇO GRAVAÇÃO JOIAS' }), 'os demais serviços seguem iguais');
    const txt = ctx.gravObsTexto({ fotos: [{ id: 'f' }], gravacao: { tipo: 'nome_logo', nome: 'Maria', orientacao: 'vertical', observacoes: 'fonte cursiva' } });
    t.ok(txt === '1 NOME + LOGO · GRAVAR: "Maria" · LOGO: ARQUIVO NA FOTO DO ITEM · VERTICAL · fonte cursiva', 'texto da via: ' + txt);
    t.ok(ctx.gravObsTexto({ gravacao: { tipo: 'nome', nome: 'Ana' } }) === '1 NOME · GRAVAR: "Ana"', 'só nome');
  } },
  { nome: 'Pedido: seção da gravação, quantidade, validação e total × quantidade', bug: 'quantidade não entrava no total do pedido', rodar: async ({ t, ler }) => {
    const h = ler('painel-ordens.html');
    t.ok(/itemEhGravacaoDisparo\(it\) \? gravSecaoHtml\(it, i\)/.test(h), 'a seção abre no item');
    t.ok(/data-gravtipo/.test(h) && /data-gravqtd/.test(h) && /data-gravnome/.test(h) && /data-gravorient/.test(h) && /data-gravobs/.test(h), 'valor, quantidade, nome, orientação, observações');
    t.ok(/Escolha o valor da gravação/.test(h) && /Escreva o nome ou a frase para gravar/.test(h) && /Envie o arquivo do logo/.test(h), 'validação ao adicionar');
    t.ok(/acc\+\(Number\(it\.valorUnitario\)\|\|0\)\*Math\.max\(1,Number\(it\.quantidade\)\|\|1\)/.test(h), 'total do pagamento = valor × quantidade');
    t.ok(/gravacao:it\.gravacao\?\{\.\.\.it\.gravacao\}:undefined/.test(h) && /fotos:Array\.isArray\(it\.fotos\)/.test(h), 'editar o pedido mantém gravação e arquivo');
    t.ok(/itemEhGravacaoDisparo\(it\) \? 1 : Math\.max\(1, Number\(it\.quantidade\)\|\|1\)/.test(h), 'ocupa 1 vaga, seja qual for a quantidade');
  } },
] };
module.exports.casos.push({ nome: 'ADM: o cartão GRAVAÇÕES não aparece mais (a gravação é lançada no Pedido)', bug: 'módulo Gravações duplicava o lançamento', rodar: async ({ t, ler }) => {
  const h = ler('index.html');
  t.ok(!/out\.push\('grav'\)/.test(h), 'sub-tela grav fora dos cartões');
} });
module.exports.casos.push({ nome: 'Gravação copo: o botão Adicionar fica no fim da seção (depois do arquivo do logo)', bug: 'botão Adicionar ficava no topo, antes dos dados da gravação', rodar: async ({ t, ler }) => {
  const h = ler('painel-ordens.html');
  t.ok(/class="grav-fim"><button type="button" class="btn-add-item" data-itadd/.test(h), 'botão no fim');
  t.ok(/itemEhGravacaoDisparo\(it\) \? '' : `<button type="button" class="btn-add-item"/.test(h), 'some do topo neste serviço');
  t.ok(h.indexOf('class="grav-fim"') > h.indexOf('data-itfotobtn="${i}:cam"'), 'vem depois do arquivo do logo');
} });
module.exports.casos.push({ nome: 'Gravação copo: valor, desconto, acréscimo, cortesia e garantia ficam abaixo dos dados da gravação', bug: 'valor e desconto ficavam no topo, antes de escolher o tipo da gravação', rodar: async ({ t, ler }) => {
  const h = ler('painel-ordens.html');
  t.ok(/\$\{_grav \? '' : _valDescHtml\}/.test(h), 'saem do topo neste serviço');
  t.ok(/\$\{_grav \? `<div class="item-row-topo grav-valores">\$\{_valDescHtml\}<\/div>` : ''\}/.test(h), 'entram abaixo da seção');
  t.ok(h.indexOf('grav-valores">${_valDescHtml}') > h.indexOf('gravSecaoHtml(it, i) : `<div class="item-row-obs">'), 'depois dos dados da gravação');
  const bloco = h.slice(h.indexOf('const _valDescHtml = `'), h.indexOf('__html+=`<div class="item-row" data-idx'));
  t.ok(/data-itfield="valorUnitario"/.test(bloco) && /data-aidbtn="desconto"/.test(bloco) && /data-semcob="garantia"/.test(bloco) && /data-itfield="ajusteValR"/.test(bloco), 'o bloco leva valor, desc., acrés., cortesia, garantia, % e R$');
} });
