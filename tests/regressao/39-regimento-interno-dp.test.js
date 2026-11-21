/* 21/11 — Regimento interno no DP: aba visível a todos (inclusive vendedora), texto versionado, artigos numerados em sequência,
 * escala 5x2 da EC 141/2026, advertências do app, controle de horas e faltas; imprimir e termo de recebimento. */
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = { casos: [
  { nome: 'Texto: versão, artigos em sequência e temas obrigatórios', bug: 'regimento inexistente', rodar: async ({ t }) => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'regimento-interno.js'), 'utf8');
    const win = {}; vm.runInContext(src, vm.createContext({ window: win }));
    const R = win.REGIMENTO_VILACA; t.ok(R && R.versao && R.data && R.texto, 'objeto com versão, data e texto');
    const nums = (R.texto.match(/^Art\. (\d+)\./gm) || []).map(x => +x.match(/\d+/)[0]);
    t.ok(nums.length >= 50 && nums.every((n, i) => n === i + 1), 'artigos numerados 1..N sem pular (' + nums.length + ')');
    ['Emenda Constitucional nº 141/2026', '5x2', '42 (quarenta e duas) horas', '40 (quarenta) horas', 'CONTROLE DE HORAS', 'art. 58, § 1º', 'VERBAL', 'ESCRITA', 'Estou ciente e confirmo o recebimento', 'art. 482', 'art. 473', '48 (quarenta e oito) horas', 'Lei 13.709/2018', 'CIENTE', 'art. 462, § 1º', 'art. 474']
      .forEach(k => t.ok(R.texto.includes(k), 'menciona: ' + k));
  } },
  { nome: 'DP: aba Regimento interno para todos os níveis, com imprimir e termo', bug: 'regimento fora do DP', rodar: async ({ t, ler }) => {
    const d = ler('dp.html');
    t.ok(/<script src="regimento-interno\.js"><\/script>/.test(d), 'carrega o texto');
    t.ok(/\{ id:'regimento', label:'Regimento interno', icon:'documento' \}/.test(d), 'aba sem restrição de nível');
    t.ok(/ABAS_PROPRIAS = \[[^\]]*'regimento'/.test(d), 'vendedora/oficina também veem');
    t.ok(/currentTab==='regimento'\) renderRegimentoDP\(main\)/.test(d) && /id="rgImprimir"/.test(d) && /id="rgTermo"/.test(d), 'tela, imprimir e termo de recebimento');
  } },
] };
