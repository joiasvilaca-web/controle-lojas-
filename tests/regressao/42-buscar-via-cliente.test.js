/* 21/11 — Barra BUSCAR VIA também acha o CLIENTE: código de via abre direto; nome/telefone (ou código que não é via) abre a busca geral com as vias e o cadastro do cliente. */
const vm = require('vm');
module.exports = { casos: [
  { nome: 'Código × cliente na barra BUSCAR VIA', bug: 'só aceitava código de via', rodar: async ({ t, ler }) => {
    const s = ler('index.html');
    const m = s.match(/function ehCodigoDeVia\(t\)\{[^\n]*\}/); t.ok(!!m, 'ehCodigoDeVia existe');
    const c = vm.createContext({}); vm.runInContext(m[0], c); const f = c.ehCodigoDeVia;
    ['MC1V', 'jv3p', 'MC 123P', '123456'].forEach(x => t.ok(f(x), 'código: ' + x));
    ['MARIA', 'MARIA SILVA', '32988887777', '(32) 98888-7777'].forEach(x => t.ok(!f(x), 'cliente: ' + x));
    t.ok(/if\(ehCodigoDeVia\(c\)\) navegarParaCodigoVia\(c, \{ senaoBuscar: bruto \}\); else buscarClienteNaBarra\(bruto\);/.test(s), 'barra decide código × cliente');
    t.ok(/if\(opts && opts\.senaoBuscar\)\{ buscarClienteNaBarra\(opts\.senaoBuscar\); return; \}/.test(s), 'código que não é via cai na busca de cliente');
    t.ok(/nome ou telefone do cliente" aria-label="Buscar via ou cliente"/.test(s), 'placeholder avisa');
  } },
] };
