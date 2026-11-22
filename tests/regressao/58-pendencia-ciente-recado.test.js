/* 22/11 — Aviso de PENDÊNCIA (PAINEL › Avisos e AGENDA): botão Ciente na observação da Oficina + recado ao cliente com envio pelo WhatsApp (só por clique). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..', '..');
function rc(){ const ctx = vm.createContext({ window:{}, document:{ getElementById:()=>null } }); vm.runInContext(fs.readFileSync(path.join(RAIZ, 'recado-cliente.js'), 'utf8'), ctx); return ctx.window.RecadoCliente; }
module.exports = { casos: [
  { nome: 'recado-cliente: botão Ciente e selo depois do ciente', bug: 'pendência sem ciente nos avisos', rodar: async ({ t, ler }) => {
    const R = rc(), o = { id:'o1' };
    t.ok(/data-rc="ciente"/.test(R.cienteHtml(o, { id:'b1' })), 'botão');
    t.ok(/Ciente: ANA/.test(R.cienteHtml(o, { id:'b1', ciente:true, cienteNome:'ANA', cienteEm:1 })) && !/data-rc/.test(R.cienteHtml(o, { id:'b1', ciente:true, cienteNome:'ANA' })), 'selo sem botão');
    t.ok(/dataset\.rc==='ciente' && ctx\.ciente/.test(ler('recado-cliente.js')), 'ligar trata o ciente');
  } },
  { nome: 'PAINEL › Avisos e AGENDA: pendência com Ciente + recado (envio só por clique)', bug: 'faltava ciente/recado', rodar: async ({ t, ler }) => {
    const av = ler('avisos.html'), ag = ler('agenda.html'), core = ler('avisos-core.js');
    t.ok(/RecadoCliente\.cienteHtml\(o, ob\)/.test(av) && /ciente: async \(oid, obid\)=>\{/.test(av), 'avisos.html');
    t.ok(/<script src="recado-cliente\.js"><\/script>/.test(ag) && /RecadoCliente\.cienteHtml\(a\.ordem, ob\)/.test(ag) && /RecadoCliente\.linhaHtml\(a\.ordem, ob\)/.test(ag) && /RecadoCliente\.ligar\(c, agRecadoCtx\(\)\)/.test(ag), 'agenda.html');
    t.ok(/ordem:o, obsId: ob \? ob\.id : null/.test(core), 'avisos-core leva a via e a observação');
    t.ok(/selectOne', table:'ordens_servico'/.test(ag), 'relê a via antes de gravar');
  } },
] };
