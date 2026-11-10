/* Ajudantes dos testes (Node + Playwright). NÃO faz parte do app: o app continua sem npm/bundler.
 * Cada teste recebe { browser, t, abrir, ler } e usa t.ok(cond, msg) / t.igual(a, b, msg). */
const fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..', '..');
const hoje = new Date().toISOString().slice(0, 10);

const cfg = {
  lojas: [{ id: 'loja_mc', nome: 'Marechal Center', abreviacao: 'MC', cor: '#1f5f7a' }, { id: 'loja_jn', nome: 'Jardim Norte', abreviacao: 'JN', cor: '#8a4b00' }],
  users: [{ id: 'u1', nome: 'TESTE', nivel: 'diretoria' }],
  funcionarios: [{ id: 'f1', nome: 'Ana Souza', apelido: 'Ana', cargos: ['vendedora'] }, { id: 'f2', nome: 'Bia Lima', apelido: 'Bia', cargos: ['vendedora'] }],
  formasPagamento: [{ id: 'pix', nome: 'PIX' }, { id: 'din', nome: 'DINHEIRO' }],
  statusOrcamento: [{ id: 'pendente', nome: 'Aberto', inicial: true }, { id: 'recusado', nome: 'Recusado', encerra: true }],
  serviceTypes: [{ id: 'st1', nome: 'SERVIÇO', prazoMinimoDias: 1, maxPorDia: 10 }], tiposServico: [{ id: 'st1', nome: 'SERVIÇO' }],
  posVendaAuto: { auto: true, desde: '2026-11-01', dias: 7 }, pedidoAcoes: { auto: true, desde: '2026-11-10' },
  orcamentoAcoes: { auto: true, desde: '2026-11-10', passos: [] }, permissoes: {},
};
const ordem = (i, st) => ({ id: 'o' + i, codigoVia: 'MC' + i + 'P', via: 'MC-' + (i + 10), cliente: 'Maria Aparecida da Silva ' + i, telefone: '32999990000', status: st, lojaId: 'loja_mc', data: hoje, serviceTypeName: 'SERVIÇO', valorTotal: 150, vendedora: 'Ana', criadoEm: Date.now(), pagamentos: [], itens: [] });
const venda = (i) => ({ id: 'v' + i, codigoVia: 'JN' + i + 'V', cliente: 'Joao Pedro ' + i, telefone: '32999990000', lojaId: 'loja_jn', data: hoje, valorTotal: 890, vendedora: 'Ana', criadoEm: Date.now(), pagamentos: [{ formaId: 'pix', valor: 890, data: hoje }], itens: [{ nome: 'ANEL OURO', qtd: 1, valor: 890 }] });
const orc = (i) => ({ id: 'q' + i, codigoVia: 'MC' + i + 'O', cliente: 'Carlos Eduardo ' + i, telefone: '32999990000', status: 'pendente', lojaId: 'loja_mc', loja: 'MC', data: hoje, validade: '2026-11-30', valorTotal: 500, vendedora: 'Ana', criadoEm: Date.now(), itens: [] });
const linhas = {
  ordens_servico: ['aguardando', 'enviado_fabrica', 'pronto', 'pendencia', 'entregue'].map((s, i) => ({ id: 'o' + i, payload: ordem(i + 1, s) })),
  vendas_pdv: [1, 2, 3].map(i => ({ id: 'v' + i, payload: venda(i) })),
  orcamentos: [1, 2, 3].map(i => ({ id: 'q' + i, payload: orc(i) })),
};

/** Abre uma tela do app com o servidor falso (login ok, config e algumas linhas). Retorna a página já dentro do app. */
async function abrir(browser, arquivo, { w = 1300, h = 900, entrar = true, semClip = true, ls = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800, isMobile: w < 800 });
  if (ls) await ctx.addInitScript(o => { for (const k in o) try { localStorage.setItem(k, o[k]); } catch (e) { } }, ls);
  const page = await ctx.newPage();
  page.errosJs = []; page.on('pageerror', e => page.errosJs.push(e.message));
  await page.route(/functions\/v1\//, async r => {
    let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) { }
    let res = { ok: true, data: [] };
    if (body.op === 'login' || body.op === 'validarSessao') res = { ok: true, user: { id: 'u1', nome: 'TESTE', apelido: 'TESTE', nivel: 'diretoria', lojas: ['loja_mc', 'loja_jn'], permissoes: null } };
    else if (body.op === 'getConfig') res = { ok: true, data: cfg };
    else if (body.op === 'selectPage' || body.op === 'selectAll') res = { ok: true, data: linhas[body.table] || [], fim: true };
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(res) });
  });
  await page.route(/rest\/v1\//, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('file://' + path.join(RAIZ, arquivo), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  if (entrar) { const pw = page.locator('input[type=password]:visible').first(); if (await pw.count()) { await pw.fill('x'); await pw.press('Enter'); await page.waitForTimeout(1500); } }
  if (semClip) await page.addStyleTag({ content: 'html,body{overflow-x:visible !important}' });   // o teste enxerga estouro de verdade (a rede de segurança do tema.css esconderia)
  return page;
}
const ler = (arq) => fs.readFileSync(path.join(RAIZ, arq), 'utf8');
module.exports = { abrir, ler, RAIZ, cfg, linhas, hoje };
