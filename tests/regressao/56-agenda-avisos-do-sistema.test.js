/* 22/11 — AGENDA mostra os AVISOS dos módulos (painel "Avisos do sistema" em Tarefas + dia certo no Calendário), calculados por avisos-core.js.
 * Também trava a escolha do modelo de orçamento por situação (disparo-cloud v12): lembrete nunca sai por modelo de Utilidade. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { pegar } = require('../lib/ts-func');
const RAIZ = path.join(__dirname, '..', '..');
function core(){ const ctx = vm.createContext({ window:{}, Promise, Date, String, Number, Object, Array, Math, JSON }); vm.runInContext(fs.readFileSync(path.join(RAIZ, 'avisos-core.js'), 'utf8'), ctx); return ctx.window.AvisosCore; }
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
module.exports = { casos: [
  { nome: 'avisos-core: pendência, atraso, pronto sem retirada, orçamento vencido/parado, ficha e experiência — com data só quando tem dia certo', bug: 'avisos dos módulos não chegavam à Agenda', rodar: async ({ t }) => {
    const dados = {
      ordens_servico: [ { id:'a', status:'pendencia', data:iso(2), codigoVia:'MC1P', cliente:'ANA', observacoes:[{ origem:'oficina', descricao:'[OFICINA] falta pedra', criadoEm:1 }] },
        { id:'b', status:'aguardando', data:iso(-3), cliente:'BIA' }, { id:'c', status:'pronto', data:iso(-9), cliente:'CAU' }, { id:'d', status:'entregue', data:iso(-30) } ],
      orcamentos: [ { id:'o1', status:'pendente', validade:iso(-1), data:iso(-10) }, { id:'o2', status:'cutucado', validade:iso(10), data:iso(-6) }, { id:'o3', status:'aprovado', validade:iso(-5) } ],
      dp_funcionarios: [ { id:'f1', nome:'CARLA', dataAdmissao:iso(-85) } ],
    };
    const gw = async b => ({ data: (dados[b.table] || []).map(p => ({ payload:p })) });
    const l = await core().calcular({ gatewayCall: gw, config:{}, user:{ nivel:'gerente' } });
    const por = id => l.find(a => a.id === id) || {};
    t.ok(por('os-pend-a').nivel === 'danger' && /falta pedra/.test(por('os-pend-a').sub) && por('os-pend-a').data === iso(2), 'pendência com motivo da Oficina');
    t.ok(por('os-venc-b').nivel === 'danger' && por('os-pronto-c').nivel === 'wait' && !l.some(a => /-d$/.test(a.id)), 'atraso, pronto parado, entregue fora');
    t.ok(por('orc-venc-o1').data === iso(-1) && por('orc-parado-o2').data === null && !l.some(a => /o3$/.test(a.id)), 'orçamento vencido no dia; parado sem data; aprovado fora');
    t.ok(por('dp-exp-f1').nivel === 'danger' && por('dp-exp-f1').data === iso(5) && por('dp-ficha-f1').data === null, 'fim da experiência no dia; ficha sem data');
    t.ok(l[0].nivel === 'danger' && l[l.length - 1].nivel !== 'danger', 'urgentes primeiro');
    const v = await core().calcular({ gatewayCall: gw, config:{}, user:{ nivel:'vendedora' } });
    t.ok(!v.some(a => /^dp-exp|^dp-semficha/.test(a.id)), 'experiência e sem ficha só para gestão');
    const semPerm = await core().calcular({ gatewayCall: async () => ({ error:'sem permissão' }), config:{}, user:{} });
    t.ok(Array.isArray(semPerm) && semPerm.length === 0, 'sem permissão: nada, sem erro');
  } },
  { nome: 'agenda.html: painel Avisos do sistema em Tarefas, avisos no Calendário, Virar tarefa e Abrir', bug: 'avisos só na tela PAINEL › Avisos', rodar: async ({ t, ler }) => {
    const h = ler('agenda.html');
    t.ok(/<script src="avisos-core\.js"><\/script>/.test(h) && /AvisosCore\.calcular/.test(h), 'carrega o núcleo');
    t.ok(/c\.innerHTML = agPainelAvisos\(\) \+/.test(h) && /Avisos do sistema/.test(h), 'painel acima do quadro');
    t.ok(/estado\.ag\.mostrarAvisos\) \(estado\.ag\.avisos\|\|\[\]\)\.forEach\(a=>\{ if\(a\.data===iso\)/.test(h) && /id="agMostrarAvisos"/.test(h), 'calendário no dia do aviso, com opção de esconder');
    t.ok(/function agAvisoParaTarefa/.test(h) && /function agEditar\(t, dataPadrao, modelo\)/.test(h) && /modulo:'agenda', \.\.\.a\.abrir/.test(h), 'virar tarefa e abrir no módulo');
  } },
  { nome: 'disparo-cloud v12: lembrete sempre no modelo de lembrete; pronto/aprovado/encerrado só no próprio depois de APPROVED', bug: 'lembrete por modelo de Utilidade puniria a conta', rodar: async ({ t }) => {
    const CFG = { statusOrcamento: [ { id:'pendente', inicial:true }, { id:'cutucado' }, { id:'aprovado', encerra:true }, { id:'recusado', encerra:true } ] };
    const mk = MAPA => pegar('disparo-cloud.ts', ['limpa', 'bonito', 'miolo', 'fraseOrc', 'chaveOrc', 'modelo'], { NL:'\n', LOJAS:{ loja_jb:'LOJA JB' }, REVIEW:{}, CFG, MAPA });
    const item = st => ({ tipo:'via', registro_tabela:'orc_acao', loja_id:'loja_jb', marcar:{ chave:st }, __codOrc:'JB9O', texto:'Olá, Maria! https://vilaca.app/via.html?t=orc&id=abc', cliente_nome:'MARIA' });
    const pend = { orc_lembrete:{ nome:'lemb', status:'APPROVED' }, orc_pronto:{ nome:'pronto', status:'PENDING' } };
    const ok = { orc_lembrete:{ nome:'lemb', status:'APPROVED' }, orc_pronto:{ nome:'pronto', status:'APPROVED' }, orc_encerrado:{ nome:'enc', status:'APPROVED' } };
    t.ok(mk(pend).modelo(item('cutucado'), true).chave === 'orc_lembrete', 'lembrete no modelo de lembrete');
    t.ok(mk(pend).modelo(item('pendente'), true).chave === 'orcamento', 'pronto em análise: genérico');
    const p = mk(ok).modelo(item('pendente'), true);
    t.ok(p.chave === 'orc_pronto' && p.params[1] === 'JB9O' && p.botao === 'abc', 'pronto aprovado: nº + botão');
    t.ok(mk(ok).modelo(item('recusado'), true).chave === 'orc_encerrado' && mk(ok).modelo(item('cutucado'), true).chave === 'orc_lembrete', 'encerrado e lembrete');
  } },
] };
