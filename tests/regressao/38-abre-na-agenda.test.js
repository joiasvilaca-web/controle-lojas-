/* 21/11 — Ao abrir o app (login / aba nova), todos caem na AGENDA quando o acesso tem o módulo; F5 continua restaurando onde estava. */
module.exports = { casos: [
  { nome: 'Shell: tela inicial é a Agenda para quem tem o módulo', bug: 'app abria no Painel/Venda', rodar: async ({ t, ler }) => {
    const s = ler('index.html');
    const i = s.indexOf('function enterShell('); t.ok(i > 0, 'enterShell existe');
    const corpo = s.slice(i, s.indexOf('\nfunction ', i + 10));
    t.ok(/if\(permitidos\.some\(m=>m\.id==='agenda'\)\) moduloInicial = 'agenda';/.test(corpo), 'agenda como módulo inicial');
    t.ok(corpo.indexOf("moduloInicial = 'agenda'") < corpo.indexOf("moduloInicial = 'pdvg'"), 'agenda tem prioridade sobre PDV/Painel');
    t.ok(/if\(!recarga \|\| !moduloInicial\)/.test(corpo), 'F5 na mesma aba continua restaurando');
  } },
] };
