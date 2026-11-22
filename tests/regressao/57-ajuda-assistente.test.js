/* 22/11 — AJUDA: conteúdo num arquivo só (ajuda-conteudo.js) usado pela tela e pelo assistente (ajuda-ia); mapa do app; OUTRA LOJA pede a PRÓPRIA senha. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..', '..');
function conteudo(){ const ctx = vm.createContext({ window:{} }); vm.runInContext(fs.readFileSync(path.join(RAIZ, 'ajuda-conteudo.js'), 'utf8'), ctx); return ctx.window; }
module.exports = { casos: [
  { nome: 'ajuda-conteudo.js: assuntos e mapa completos, categorias na ordem da tela', bug: 'ajuda sem os módulos novos', rodar: async ({ t, ler }) => {
    const w = conteudo(), T = w.AJUDA_TOPICOS, M = w.AJUDA_MODULOS;
    t.ok(T.length >= 40 && T.every(x => x.cat && x.ico && x.tit && x.chave && x.body), 'assuntos com todos os campos');
    t.ok(new Set(T.map(x => x.tit)).size === T.length && T.every(x => !/'/.test(x.tit)), 'títulos únicos e sem aspas simples (o assistente lê tit:\'…\')');
    const h = ler('ajuda.html');
    const ordem = (h.match(/const ORDEM_CAT = \[([^\]]+)\]/) || [])[1] || '';
    t.ok([...new Set(T.map(x => x.cat))].every(c => ordem.includes("'" + c + "'")), 'toda categoria tem lugar na ordem');
    for (const nome of ['Reservar', 'Cancelamento', 'Oficina', 'Controle de horas', 'Inventário', 'Agenda', 'Marketing', 'Reforma', 'Ficha da loja', 'Departamento pessoal']) t.ok(M.some(m => m.nome === nome), 'mapa: ' + nome);
    t.ok(/sua própria senha/.test(T.find(x => /outra/.test(x.tit)).body) && !/peça para um <b>gerente ou diretor<\/b> digitar/.test(ler('ajuda-conteudo.js')), 'OUTRA LOJA pede a própria senha');
  } },
  { nome: 'ajuda.html usa o conteúdo compartilhado, tem o assistente e o mapa', bug: 'conteúdo duplicado na tela', rodar: async ({ t, ler }) => {
    const h = ler('ajuda.html');
    t.ok(/<script src="ajuda-conteudo\.js"><\/script>/.test(h) && /const TOPICOS = window\.AJUDA_TOPICOS/.test(h) && !/cat:'Começando'/.test(h), 'sem cópia dos assuntos na tela');
    t.ok(/functions\/v1\/ajuda-ia/.test(h) && /function formatarIA/.test(h) && /data-vertop/.test(h), 'assistente com links para os assuntos');
    t.ok(/function renderMapa/.test(h) && /AJUDA_MODULOS/.test(h), 'mapa do app');
  } },
  { nome: 'ajuda-ia: só sessão válida, sem dados do negócio, base = ajuda-conteudo.js publicado', bug: 'assistente inventando ou vendo dados', rodar: async ({ t, ler }) => {
    const s = ler('ajuda-ia.ts');
    t.ok(/sessaoValida\(u, String\(b\?\.senha/.test(s) && /não autorizado/.test(s), 'pede sessão');
    t.ok(/\/ajuda-conteudo\.js/.test(s) && !/from\("(vendas|ordens_servico|orcamentos|clientes)/.test(s), 'só lê a Ajuda');
    t.ok(/NUNCA invente/.test(s) && /VEJA:/.test(s), 'regra de não inventar e links');
  } },
] };
