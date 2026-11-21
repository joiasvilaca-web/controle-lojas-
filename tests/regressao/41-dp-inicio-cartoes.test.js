/* 21/11 — Piloto "abas viram cartões": o DP abre na tela Início com um cartão por aba visível (com contador de advertências sem ciente);
 * as abas continuam no topo (o shell recebe a lista com 'Início' primeiro). */
module.exports = { casos: [
  { nome: 'DP: abre em Início (cartões) e mantém as abas', bug: 'pedido de navegação por cartões', rodar: async ({ t, ler }) => {
    const d = ler('dp.html');
    t.ok(/let currentTab = 'inicio';/.test(d) && /currentTab = 'inicio';\n  if\(EMBEDDED\) parent\.postMessage\(\{ type:'tabs'/.test(d), 'abre em Início');
    t.ok(/const TABS = \[\n  \{ id:'inicio', label:'Início'/.test(d) && /ABAS_PROPRIAS = \['inicio',/.test(d), 'Início é a 1ª aba, para todos os níveis');
    t.ok(/currentTab==='inicio'\) renderInicioDP\(main\)/.test(d) && /abasVisiveisDP\(\)\.filter\(t=>t\.id!=='inicio'\)/.test(d), 'cartões = abas visíveis (respeita o nível)');
    t.ok(/r\.tipo==='aviso' && !r\.confirmadoEm/.test(d), 'contador de advertências sem ciente');
  } },
] };
