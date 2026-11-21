/* 22/11 — Chamar cliente: cadastro rápido (nome + celular com DDD). Vias com cliente só com o NOME: o Pedido deixou de exigir telefone;
 * Venda/Pedido/Orçamento avisam depois de salvar que o cadastro está incompleto. */
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = { casos: [
  { nome: 'Aviso de cadastro incompleto: lista o que falta', bug: 'via com cliente só com nome não avisava', rodar: async ({ t, ler }) => {
    const win = {}; vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'cadastro-incompleto.js'), 'utf8'), vm.createContext({ window: win, setTimeout }));
    const C = win.CadastroIncompleto;
    t.ok(C.faltando({ nome: 'ANA' }).join(',') === 'celular com DDD,CPF,data de nascimento,endereço', 'só nome: falta tudo');
    t.ok(C.faltando({ nome: 'ANA', telefone: '(32) 98888-7777', cpf: '123.456.789-09', dataNascimento: '1990-01-01', endereco: 'RUA A', numero: '1', bairro: 'B', cidade: 'JF' }).length === 0, 'completo: nada falta');
    t.ok(C.faltando({ nome: 'X', tipoPessoa: 'PJ', cnpj: '12.345.678/0001-90', telefone: '32988887777', endereco: 'R', numero: '1', bairro: 'B', cidade: 'C' }).length === 0, 'PJ com CNPJ não pede CPF nem nascimento');
    ['vendas.html', 'painel-ordens.html', 'orcamentos.html'].forEach(f => { const s = ler(f); t.ok(/<script src="cadastro-incompleto\.js"><\/script>/.test(s) && /CadastroIncompleto\.avisar\(/.test(s), f + ' avisa ao salvar'); });
  } },
  { nome: 'Pedido salva só com o nome do cliente', bug: 'Pedido exigia telefone', rodar: async ({ t, ler }) => {
    const s = ler('painel-ordens.html');
    t.ok(!/\{ vazio: !telefone,/.test(s) && !/if\(!cliente \|\| !telefone\)\{/.test(s), 'novo pedido não exige telefone');
    t.ok(!/!cliente \|\| !telefone \|\| !vendedora/.test(s) && /Preencha cliente, vendedora, loja, tipo de serviço e data\./.test(s), 'edição não exige telefone');
  } },
  { nome: 'Chamar cliente: cadastro rápido com nome e celular', bug: 'cliente fora do cadastro não podia ser chamado', rodar: async ({ t, ler }) => {
    const r = ler('cadastro-rapido-cliente.js');
    t.ok(/op:'searchClients'/.test(r) && /já é de/.test(r), 'não duplica celular existente');
    t.ok(/Number\(ddd\) >= 11 && num\.length === 9 && num\.charAt\(0\) === '9'/.test(r), 'valida celular com DDD');
    t.ok(/op:'upsert', table:'clientes_cadastro'/.test(r), 'grava no cadastro');
    ['index.html', 'marketing.html'].forEach(f => { const s = ler(f); t.ok(/cadastro-rapido-cliente\.js/.test(s) && /CadastroRapidoCliente\.montar\(document\.getElementById\('ccNovoBox'\)/.test(s), f + ' oferece o cadastro rápido'); });
  } },
] };
