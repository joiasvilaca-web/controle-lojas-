/* 13/11 — AGENDA virou módulo (agenda.html): tarefas, calendário e MINHAS vias; a Oficina vê as vias em poder dela e a vendedora vê as dela marcadas "Na Oficina". */
const { pegar } = require('../lib/ts-func');
module.exports = { casos: [
  { nome: 'Módulo Agenda registrado no shell e no DP, com permissão padrão para todos os perfis', bug: 'agenda só existia dentro do CHAT', rodar: async ({ t, ler }) => {
    const ix = ler('index.html'), dp = ler('dp.html');
    t.ok(/id:'agenda', label:'AGENDA'[^}]*src:'agenda\.html'/.test(ix), 'menu do shell');
    t.ok((ix.match(/agenda:\{ ativo:true \}/g) || []).length === 3 && (dp.match(/agenda:\{ ativo:true \}/g) || []).length === 3, 'padrão dos 4 perfis (index e dp iguais)');
    t.ok(/agenda: \{ nome:'AGENDA/.test(ix) && /agenda: \{ nome:'AGENDA/.test(dp), 'MODULOS_APP nos dois');
    t.ok(/mods:\['atendimento','agenda'\]/.test(dp), 'grupo CHAT no DP');
  } },
  { nome: 'A tela da Agenda tem Tarefas, Calendário, Minhas vias (Vias na Oficina para a Oficina) e marca "Na Oficina"', bug: 'oficina não via as vias dela na agenda', rodar: async ({ t, ler }) => {
    const h = ler('agenda.html');
    t.ok(/AG_ABAS = \[\['quadro','Tarefas'\],\['calendario','Calendário'\],\['vias','Minhas vias'\]\]/.test(h), 'abas');
    t.ok(/Vias na Oficina/.test(h) && /Na Oficina/.test(h) && /viasOficina/.test(h), 'visão da Oficina e selo Na Oficina');
    t.ok(/modulo:'agenda'/.test(h), 'abrir via pelo shell');
    t.ok(/irParaModulo/.test(ler('atendimento.html')) && /alvo:'agenda'/.test(ler('atendimento.html')), 'CHAT › Agenda abre o módulo');
  } },
  { nome: 'agenda-tarefas v9: minhasVias marca naOficina e a Oficina recebe os pedidos em poder dela (sem valores)', bug: 'sem integração com a Oficina', rodar: async ({ t, ler }) => {
    const s = ler('agenda-tarefas.ts');
    t.ok(/ST_OFICINA = \["enviado_fabrica", "em_producao", "pendencia", "oficina_pronto"\]/.test(s), 'status da Oficina');
    t.ok(/naOficina: tipo === "pedido" && ST_OFICINA\.includes/.test(s), 'vendedora: via marcada');
    t.ok(/nivel === "oficina"[\s\S]{0,400}\.in\("payload->>status", ST_OFICINA\)/.test(s) && /valorTotal: 0/.test(s), 'oficina: todos os pedidos dela, sem valor');
  } },
] };
