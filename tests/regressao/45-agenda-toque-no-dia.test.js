/* 22/11 — Agenda › Calendário: tocar no dia abre a lista de tudo do dia (tarefas, lembretes, vias); cada item abre a tarefa/via; "Nova tarefa neste dia". */
module.exports = { casos: [
  { nome: 'Toque no dia abre a lista completa', bug: 'no celular só cabiam 3 itens e o toque criava tarefa nova', rodar: async ({ t, ler }) => {
    const a = ler('agenda.html');
    t.ok(/function agAbrirDia\(iso\)\{/.test(a), 'função do dia');
    t.ok(/return agAbrirDia\(iso\); \}\n    agAbrirDia\(iso\);/.test(a), 'toque no dia (e no "+N mais") abre a lista');
    t.ok(/if\(e\.tarefa\) agEditar\(/.test(a) && /else if\(e\.via\) agAbrirVia\(e\.via\)/.test(a), 'item abre a tarefa ou a via');
    t.ok(/id="agDiaNova"/.test(a) && /agEditar\(null, iso\)/.test(a), 'Nova tarefa neste dia');
  } },
] };
