/* 21/11 — Cadastro de cliente: tipo de pessoa no topo (CPF × CNPJ), dados fiscais só para PJ; redes sociais com @ fixo que abrem o direct do Instagram. */
const vm = require('vm');
module.exports = { casos: [
  { nome: 'Formulário: CPF/CNPJ pelo tipo e fiscal só PJ', bug: 'CNPJ e dados fiscais apareciam para pessoa física', rodar: async ({ t, ler }) => {
    const s = ler('index.html');
    t.ok(/id="ccCampoCpf"/.test(s) && /id="ccCampoCnpj"/.test(s) && /<div id="ccFiscal"/.test(s), 'campos separados e bloco fiscal');
    t.ok(/document\.getElementById\('ccFiscal'\)\.style\.display = pj \? '' : 'none';/.test(s), 'fiscal some para pessoa física');
    t.ok(!/CNPJ \(se pessoa jurídica\)/.test(s), 'rótulo antigo saiu');
  } },
  { nome: 'Redes sociais: normaliza o perfil e abre o direct', bug: 'sem campo de rede social', rodar: async ({ t, ler }) => {
    const s = ler('index.html');
    const a = s.match(/function normalizarPerfilRede\(t\)\{[\s\S]*?\n\}/)[0], b = s.match(/function linkDirectInstagram\(u\)\{[^\n]*\}/)[0];
    const c = vm.createContext({}); vm.runInContext(a + '\n' + b, c);
    t.ok(c.normalizarPerfilRede('@Maria.Joias') === 'maria.joias' && c.normalizarPerfilRede('https://www.instagram.com/loja_x/') === 'loja_x', 'tira @ e aceita link');
    t.ok(c.normalizarPerfilRede('nome com espaço') === '' && c.normalizarPerfilRede('') === '', 'recusa perfil inválido');
    t.ok(c.linkDirectInstagram('maria.joias') === 'https://ig.me/m/maria.joias', 'abre o direct');
    t.ok(/redesSociais: \(window\.__ccRedes \|\| \[\]\)\.slice\(0, 10\)/.test(s) && /id="ccRedeAdd"/.test(s), 'salva a lista (até 10)');
  } },
] };
