/* 21/11 (22/11: sem abas no topo) — Piloto "abas viram cartões": o DP abre na tela Início com um cartão por aba visível (com contador de advertências sem ciente);
 * as abas continuam no topo (o shell recebe a lista com 'Início' primeiro). */
module.exports = { casos: [
  { nome: 'DP: abre em Início (cartões) e mantém as abas', bug: 'pedido de navegação por cartões', rodar: async ({ t, ler }) => {
    const d = ler('dp.html');
    t.ok(/let currentTab = 'inicio';/.test(d) && /currentTab = 'inicio';/.test(d), 'abre em Início');
    // 22/11 (Felipe): o que virou cartão NÃO aparece como aba no topo do app; cada tela tem o botão "Início do DP"
    t.ok(/parent\.postMessage\(\{ type:'tabs', modulo:'dp', tabs: \[\], active: null \}, '\*'\)/.test(d), 'nenhuma aba no topo');
    t.ok(/if\(currentTab!=='inicio'\)\{[\s\S]{0,200}Início do DP[\s\S]{0,300}main\.prepend\(volta\)/.test(d), 'botão Início do DP em toda tela');
    t.ok(/const TABS = \[\n  \{ id:'inicio', label:'Início'/.test(d) && /ABAS_PROPRIAS = \['inicio',/.test(d), 'Início é a 1ª aba, para todos os níveis');
    t.ok(/currentTab==='inicio'\) renderInicioDP\(main\)/.test(d) && /abasVisiveisDP\(\)\.filter\(t=>t\.id!=='inicio'\)/.test(d), 'cartões = abas visíveis (respeita o nível)');
    t.ok(/r\.tipo==='aviso' && !r\.confirmadoEm/.test(d), 'contador de advertências sem ciente');
  } },
] };
