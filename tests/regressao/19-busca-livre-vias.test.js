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
    t.ok(c.BuscaVias._teste.pareceCodigo('MC108V') && !c.BuscaVias._teste.pareceCodigo('maria silva'), 'reconhece código de via');
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
    t.ok(/data-bv-editar/.test(bv), 'botão Editar na ficha');
    t.ok(/entregue && !gestor\(\)/.test(bv), 'entregue pede senha de gerente/diretor');
    t.ok(/Autorizacao\.pedir/.test(bv), 'usa a autorização da gerência');
    t.ok(/Leitor\.ligar\(campo/.test(bv) && /opts\.abrirVia\(alvo, false\)/.test(bv), 'leitor abre a via sozinho');
    t.ok(/data-bv-buscar/.test(bv), 'campo com botão Buscar');
    const vh = ler('vendas.html'), po = ler('painel-ordens.html'), oc = ler('orcamentos.html'), ix = ler('index.html');
    t.ok(/type === 'abrirRegistro'[\s\S]{0,600}editar/.test(vh) && /btnEditarDetVenda/.test(vh), 'Venda: editar pelo shell e Editar no detalhe');
    t.ok(/ev\.data\.editar/.test(oc), 'Orçamento recebe editar');
    t.ok(/secao\(document\.getElementById\('bvSecaoVendas'\), \{ tipo:'venda'/.test(vh), 'Venda busca só vendas');
    t.ok(/secao\(document\.getElementById\('bvSecaoPedidos'\), \{ tipo:'pedido'/.test(po), 'Pedido busca só pedidos');
    t.ok(/secao\(document\.getElementById\('bvSecaoOrcs'\), \{ tipo:'orcamento'/.test(oc), 'Orçamento busca só orçamentos');
    t.ok(/leitor-codigo\.js/.test(vh) && /leitor-codigo\.js/.test(oc) && /leitor-codigo\.js/.test(po), 'leitor carregado nos três cards');
    t.ok(!/btnBuscaVias|busca-vias\.js/.test(ix), 'sem botão de busca fora dos cards (já existe BUSCAR VIA / PREÇO)');
  } },
] };
