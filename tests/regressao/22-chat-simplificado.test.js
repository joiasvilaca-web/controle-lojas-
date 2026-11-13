/* 13/11 — CHAT mais simples: faixa "aguardando resposta" + "comentários", ferramentas agrupadas em "Mais ferramentas",
 * ações do cliente/atendimento dentro do menu "Ações" da conversa, comentários abrem já mostrando os pendentes. Nenhuma função sumiu. */
module.exports = { casos: [
  { nome: 'Todos os botões de ferramenta continuam existindo (agora no menu Mais ferramentas)', bug: 'ferramenta sumiu do CHAT', rodar: async ({ t, ler }) => {
    const h = ler('atendimento.html');
    const menu = h.slice(h.indexOf('id="menuFerr"'), h.indexOf('id="filtros"'));
    ['btnAgenda', 'btnInterno', 'btnTarefas', 'btnFunil', 'btnModelos', 'btnFerr', 'btnPainel', 'btnConfig'].forEach((id) => t.ok(menu.includes('id="' + id + '"'), id + ' no menu'));
    t.ok(menu.includes('id="n_ret"'), 'contador n_ret');
    ['tabComentarios', 'tabInterno', 'tabTarefas'].forEach((id) => t.ok(h.includes('id="' + id + '"'), 'aba ' + id));
    ['n_coment', 'n_chat', 'n_tarefasTab', 'n_minhas', 'n_fila'].forEach((id) => t.ok(h.includes('id="' + id + '"'), 'balão ' + id));
    t.ok(!/id="chipAguard"/.test(h), 'card Aguardando saiu (o botão Só não lidas faz o mesmo)');
    t.ok(/id="redesChat"/.test(h) && /function renderRedes/.test(h), 'redes conectadas no topo');
    t.ok(/id="btnSom"/.test(menu) && /id="btnTodas"/.test(menu), 'aviso de mensagem e Todas as conversas no menu Mais');
    t.ok(/function verificarCadastro/.test(h) && /id="bannerCli"/.test(h), 'identifica cadastro de quem chamou');
    t.ok(/id="nBusca"/.test(h), 'Nova conversa busca cliente do cadastro');
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
  { nome: 'Abas Ativos e Potenciais; Todas as conversas com filtros, reabrir e transferir', bug: 'abas confusas (Minhas/Fila/Todas/Finalizadas)', rodar: async ({ t, ler }) => {
    const h = ler('atendimento.html');
    const abas = h.slice(h.indexOf('id="filtros"'), h.indexOf('id="linhaAtivo"'));
    t.ok(/data-f="minhas"[^>]*>Ativos/.test(abas) && /data-f="fila"[^>]*>Potenciais/.test(abas), 'abas Ativos e Potenciais');
    t.ok(!/data-f="todas"|data-f="finalizadas"/.test(abas), 'Todas e Finalizadas saíram das abas');
    t.ok(/id="btnSoNaoLidas"/.test(h) && /estado\.soNaoLidas/.test(h), 'botão Só não lidas');
    t.ok(/id="btnTodas"/.test(h) && /function modalTodas/.test(h), 'botão Todas as conversas');
    ['tdQ', 'tdStatus', 'tdRede', 'tdAtend', 'tdPeriodo'].forEach((id) => t.ok(h.includes('id="' + id + '"'), 'filtro ' + id));
    t.ok(/data-td="reabrir"/.test(h) && /data-td="transferir"/.test(h), 'reabrir e transferir');
    t.ok(/filtro:'finalizadas'/.test(h), 'inclui as finalizadas');
  } },
] };
