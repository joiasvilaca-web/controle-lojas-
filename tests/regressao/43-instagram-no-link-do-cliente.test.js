/* 21/11 — Páginas que o cliente abre pelo link mostram "Siga a gente no Instagram": Vilaça → @vilacajoias, Reforma → @reformajoias. */
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = { casos: [
  { nome: 'Perfil certo por marca e presença nas páginas públicas', bug: 'sem link para o Instagram', rodar: async ({ t, ler }) => {
    const win = {}; const ctx = vm.createContext({ window: win, document: { getElementById(){ return {}; }, createElement(){ return {}; }, head: { appendChild(){} } } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'instagram-link.js'), 'utf8'), ctx);
    const I = win.InstagramLink;
    t.ok(I.perfil({ loja: 'VILAÇA MARECHAL' }) === 'vilacajoias' && I.perfil({ loja: 'Reforma Joias' }) === 'reformajoias', 'detecta a Reforma pelo nome da loja');
    t.ok(I.perfil({ reforma: true }) === 'reformajoias' && I.perfil({ reforma: false }) === 'vilacajoias', 'marca explícita');
    t.ok(/instagram\.com\/vilacajoias\//.test(I.html({})) && /rel="noopener"/.test(I.html({})), 'link para o perfil, em nova aba');
    ['via.html', 'acompanhar.html', 'reforma.html'].forEach(f => { const s = ler(f); t.ok(/<script src="instagram-link\.js"><\/script>/.test(s) && /InstagramLink\.html\(/.test(s), f + ' mostra o Instagram'); });
  } },
] };
