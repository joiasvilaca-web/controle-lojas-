/* 13/11 — PDV › "Buscar em todas as vias": busca sem filtro de data, por partes do nome (juntas ou separadas), via, vendedora, produto;
 * a ficha tem Editar para todos; via de pedido ENTREGUE pede a senha de gerente/diretor (gerente/diretoria já valem). */
const vm = require('vm'), fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..', '..');
function carregar() {
  const ctx = { window: {}, document: { getElementById: () => null, head: { appendChild() {} } }, console, setTimeout, clearTimeout, Date };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'busca.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'busca-vias.js'), 'utf8'), ctx);
  return ctx;
}
module.exports = { casos: [
  { nome: 'Acha a via por parte do nome, em qualquer ordem, de qualquer data', bug: 'só achava a via do dia filtrado', rodar: async ({ t }) => {
    const c = carregar();
    const reg = (tipo, p) => c.BuscaVias._teste.montar(tipo, p);
    const lista = [
      reg('venda', { id: 'v1', codigoVia: 'MC108V', cliente: 'MARIA APARECIDA SILVA', data: '2026-09-02', vendedora: 'GISLAINE CRISTINA', lojaId: 'loja_mc', itens: [{ produto: 'ALIANCA OURO 18K' }] }),
      reg('pedido', { id: 'o1', codigoVia: 'JN4P', cliente: 'JOSE LIMA', data: '2026-11-01', status: 'entregue' }),
    ];
    const acha = (q) => c.Busca.filtrar(lista, q, (x) => x.alvo, { limite: 20, ordenar: true }).map((x) => x.cod);
    t.ok(acha('maria silva').includes('MC108V'), 'nome separado');
    t.ok(acha('silva maria').includes('MC108V'), 'ordem trocada');
    t.ok(acha('108').includes('MC108V'), 'parte do código');
    t.ok(acha('gislaine').includes('MC108V'), 'vendedora');
    t.ok(acha('aliança ouro').includes('MC108V'), 'produto, sem acento');
    t.ok(!acha('maria silva').includes('JN4P'), 'não traz via sem relação');
  } },
  { nome: 'Ficha tem Editar; entregue pede autorização; módulos recebem o pedido de editar', bug: 'busca não dava opção de editar', rodar: async ({ t, ler }) => {
    const bv = ler('busca-vias.js');
    t.ok(/id="bvEditar"/.test(bv), 'botão Editar na ficha');
    t.ok(/status\) === 'entregue' && !gestor\(\)/.test(bv.replace(/\s+/g, ' ').replace('String(p.status) === \'entregue\'', "String(p.status) === 'entregue'")) || /entregue && !gestor\(\)/.test(bv), 'entregue pede senha de gerente/diretor');
    t.ok(/Autorizacao\.pedir/.test(bv), 'usa a autorização da gerência');
    t.ok(/busca-vias\.js/.test(ler('index.html')) && /btnBuscaVias/.test(ler('index.html')), 'botão no PDV');
    t.ok(/editar/.test(ler('vendas.html').slice(ler('vendas.html').indexOf("type === 'abrirRegistro'"), ler('vendas.html').indexOf("type === 'abrirRegistro'") + 600)), 'Venda recebe editar');
    t.ok(/btnEditarDetVenda/.test(ler('vendas.html')), 'detalhe da venda tem Editar');
    t.ok(/ev\.data\.editar/.test(ler('orcamentos.html')), 'Orçamento recebe editar');
    // cada card tem a própria busca, só do seu tipo; o botão de fora (shell) busca em tudo
    t.ok(/btnBuscarVendas[\s\S]{0,200}tipos:\['venda'\]/.test(ler('vendas.html')), 'Venda busca só vendas');
    t.ok(/btnBuscarPedidos[\s\S]{0,200}tipos:\['pedido'\]/.test(ler('painel-ordens.html')), 'Pedido busca só pedidos');
    t.ok(/btnBuscarOrcs[\s\S]{0,200}tipos:\['orcamento'\]/.test(ler('orcamentos.html')), 'Orçamento busca só orçamentos');
    t.ok(/Buscar em tudo/.test(ler('index.html')) && /tipos: \['venda', 'pedido', 'orcamento'\]/.test(bv), 'botão de fora busca em tudo');
  } },
] };
