/* 22/11 — ADM/Pedido › Código: cada pessoa vê só os códigos que ela gerou; os códigos não expiram (valem até serem usados). */
const vm = require('vm');
module.exports = { casos: [
  { nome: 'Lista mostra só os códigos de quem gerou; sem validade', bug: 'todos viam os códigos de todos', rodar: async ({ t, ler }) => {
    const s = ler('painel-ordens.html');
    const m = s.match(/const meuCodigo = c=> [^\n]*;/); t.ok(!!m, 'filtro existe');
    const ctx = vm.createContext({ currentUser: { id: 'u1', nome: 'ANA' } }); vm.runInContext(m[0].replace('const ', 'var '), ctx);
    t.ok(ctx.meuCodigo({ geradoPorId: 'u1', geradoPor: 'X' }) && !ctx.meuCodigo({ geradoPorId: 'u2', geradoPor: 'ANA' }), 'pelo id quando existe');
    t.ok(ctx.meuCodigo({ geradoPor: ' ana ' }) && !ctx.meuCodigo({ geradoPor: 'BIA' }), 'códigos antigos: pelo nome');
    t.ok(/const meus = codes\.filter\(meuCodigo\);/.test(s) && /geradoPorId: currentUser\.id \|\| null/.test(s), 'lista filtrada e código novo guarda o id');
    t.ok(/codes\.find\(c=>c\.codigo === codigoDigitado && !c\.usado\)/.test(s) && !/criadoEm\s*[<>]/.test(s), 'validação só olha se foi usado (sem prazo)');
  } },
] };
