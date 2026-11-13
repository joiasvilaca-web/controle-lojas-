/* 13/11 — CHAT mais simples: faixa "aguardando resposta" + "comentários", ferramentas agrupadas em "Mais ferramentas",
 * ações do cliente/atendimento dentro do menu "Ações" da conversa, comentários abrem já mostrando os pendentes. Nenhuma função sumiu. */
module.exports = { casos: [
  { nome: 'Todos os botões de ferramenta continuam existindo (agora no menu Mais ferramentas)', bug: 'ferramenta sumiu do CHAT', rodar: async ({ t, ler }) => {
    const h = ler('atendimento.html');
    const menu = h.slice(h.indexOf('id="menuFerr"'), h.indexOf('id="filtros"'));
    ['btnAgenda', 'btnInterno', 'btnTarefas', 'btnFunil', 'btnModelos', 'btnFerr', 'btnPainel', 'btnConfig'].forEach((id) => t.ok(menu.includes('id="' + id + '"'), id + ' no menu'));
    ['n_tarefas', 'n_ret'].forEach((id) => t.ok(menu.includes('id="' + id + '"'), 'contador ' + id));
    t.ok(/id="btnComentarios"/.test(h) && /id="chipAguard"/.test(h), 'chips de comentários e aguardando');
  } },
  { nome: 'Ações do cliente ficam no menu Ações da conversa, agrupadas, com as mesmas chaves', bug: 'ações soltas e só com ícone', rodar: async ({ t, ler }) => {
    const h = ler('atendimento.html');
    ['transferir', 'crm', 'cliente', 'tags', 'finalizar', 'assumir'].forEach((k) => t.ok(h.includes("'" + k + "'") || h.includes('data-a="' + k + '"'), 'ação ' + k));
    t.ok(/GRUPOS_MENU = \[\['Cliente'/.test(h) && /\['Atendimento'/.test(h), 'menu agrupado');
    t.ok(/aguardando\(c\)/.test(h) && /function aguardando\(c\)/.test(h), 'conversa que espera resposta é marcada');
  } },
  { nome: 'Comentários abrem já com os pendentes e marcam o que está sem resposta', bug: 'precisava clicar em Buscar', rodar: async ({ t, ler }) => {
    const s = ler('atendimento-social.js');
    t.ok(/listar\(\);\s*\/\/ 13\/11/.test(s), 'lista sozinho ao abrir');
    t.ok(/cm-aguarda/.test(s) && /Sem resposta/.test(s), 'selo "Sem resposta"');
  } },
] };
