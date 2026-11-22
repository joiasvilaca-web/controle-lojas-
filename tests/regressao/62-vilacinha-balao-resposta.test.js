/* 22/11 — Vilacinha: a pergunta de bem-estar é respondida NO PRÓPRIO balão; depois do "pode perguntar" a pergunta da água vem COM as opções (antes vinha só o texto, sem sim/não). */
module.exports = { casos: [
  { nome: 'após consentir, a água é pergunta com opções clicáveis (não texto solto)', bug: 'pergunta da água sem opção sim/não', rodar: async ({ t, ler }) => {
    const j = ler('copiloto.js');
    t.ok(/S\.dia\.consentimento = true;[^\n]*mostrarPergunta\(PERGUNTAS\[1\]/.test(j), 'consentimento abre a pergunta da água com opções');
    t.ok(!/Combinado![^\n]*já bebeu água hoje\? 💧<\/div>', '', true\)/.test(j), 'sem a versão antiga (só texto)');
    t.ok(/id:'agua'[^\n]*ops:\[\['sim'[^\n]*\['nao'/.test(j), 'água tem sim/não');
  } },
  { nome: 'resposta troca o conteúdo do mesmo balão (não cria outro) e o nome é Vilacinha', bug: 'resposta em outro balão', rodar: async ({ t, ler }) => {
    const j = ler('copiloto.js');
    t.ok(/var d = document\.getElementById\('cpBalao'\), novo = !d;/.test(j), 'reaproveita o balão aberto');
    t.ok(/if\(novo\) document\.body\.appendChild\(d\)/.test(j), 'só cria se não existe');
    t.ok(/Vilacinha/.test(j) && !/Felipe/.test(j), 'nome Vilacinha, sem Felipe');
  } },
] };
