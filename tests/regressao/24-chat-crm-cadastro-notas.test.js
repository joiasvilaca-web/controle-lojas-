/* 13/11 — CHAT: cadastro (cadastrar e vincular / vincular com confirmação / atualizar dados), etiquetas e campos criados em Administrar,
 * nota privada, Reforma × Vilaça, vias do CRM em popup, Produtos e Notas, "também em atendimento com…", tarefas do CHAT ligadas à Agenda. */
module.exports = { casos: [
  { nome: 'Cadastro: cadastrar e vincular, vincular só depois de confirmar os dados, atualizar dados', bug: 'vínculo sem conferir os dados', rodar: async ({ t, ler }) => {
    const h = ler('atendimento.html');
    t.ok(/Cadastrar e vincular/.test(h) && /data-cad="atualizar"/.test(h) && /data-cad="vincular"/.test(h), 'botões por situação');
    t.ok(/function confirmarVinculo/.test(h) && /Confirmar e vincular/.test(h), 'confirmação mostra os dados antes de vincular');
    t.ok(/function modalAtualizarCadastro/.test(h) && /op:'upsert', table:'clientes_cadastro'/.test(h), 'atualizar dados mescla no cadastro');
    t.ok(/botoesCadastroHtml\(\)\}<\/div><\/div>/.test(h), 'botões também na Ficha do CRM');
  } },
  { nome: 'Etiquetas e campos: criação em Administrar; em Ações só seleção', bug: 'criação espalhada pelo chat', rodar: async ({ t, ler }) => {
    const h = ler('atendimento.html');
    t.ok(/\['etiquetas','Etiquetas'\],\['campos','Campos'\]/.test(h), 'abas novas em Administrar');
    t.ok(!/data-k="tags"/.test(h), 'Mensagens prontas sem aba de etiquetas');
    const tags = h.slice(h.indexOf('function modalTags(){'), h.indexOf('function modalTags(){') + 1200);
    t.ok(/type="checkbox"/.test(tags) && !/id="tTags"/.test(tags), 'Ações › Etiquetas só marca');
    t.ok(!/if\(estado\.admin\) abas\.push\(\['campos','Campos'\]\)/.test(h), 'Ferramentas sem criação de campos');
  } },
  { nome: 'Nota privada, anexar (arquivo, via, produto), Produtos e Notas ao lado do anexo', bug: 'anexo só de arquivo e CRM escondido', rodar: async ({ t, ler }) => {
    const h = ler('atendimento.html');
    t.ok(/function icnPrivado/.test(h) && /icnPrivado\(18\)/.test(h), 'ícone de nota privada');
    t.ok(/function abrirMenuAnexo/.test(h) && /function modalAnexoVia/.test(h) && /function modalAnexoProduto/.test(h), 'menu de anexo');
    t.ok(/id="btnProdutos"/.test(h) && /id="btnNotas"/.test(h) && /function modalProdutos/.test(h) && /function modalNotas/.test(h), 'Produtos e Notas');
    t.ok(/novo:'Olhando'/.test(h) && /Produtos \(\$\{f\.oportunidades\.length\}\)/.test(h), 'Oportunidades viraram Produtos');
    t.ok(/function popupVia/.test(h) && /data-via=/.test(h), 'vias do CRM abrem em popup');
  } },
  { nome: 'Reforma × Vilaça bem distintas; também em atendimento com…; tarefas do CHAT na Agenda', bug: 'conversas das duas lojas parecidas / sem aviso de atendimento duplicado', rodar: async ({ t, ler }) => {
    const h = ler('atendimento.html'), ag = ler('agenda.html'), av = ler('atendimento-aviso.ts'), at = ler('agenda-tarefas.ts');
    t.ok(/function instTag/.test(h) && /\.inst-tag\.inst-reforma/.test(h) && /\.chat-head\.inst-reforma/.test(h), 'etiqueta colorida na lista e no cabeçalho');
    t.ok(/function outroHtml/.test(h) && /data-avisar/.test(h) && /destino_tipo:'pessoa'/.test(h), 'aviso "também em atendimento" + mensagem interna');
    t.ok(/\.neq\("status", "finalizado"\)/.test(av) && /op === "resumos"/.test(av), 'servidor: só conversas abertas (o aviso sai ao finalizar)');
    t.ok(/function badge|notasBadge/.test(h) && /data-notas=/.test(h), 'balão de notas na lista');
    t.ok(/agCriarDoChat/.test(h) && /origem:'chat'/.test(h) && /crmTarefaStatus/.test(h), 'tarefa do CHAT vai para a Agenda e acompanham o status');
    t.ok(/origem === "chat"/.test(at) && /conversa_ativa/.test(at) && /op === "sincCrm"/.test(at), 'agenda-tarefas v10');
    t.ok(/data-agconv/.test(ag) && /ag-chat/.test(ag), 'Agenda: símbolo do CHAT e ir para a conversa');
    t.ok(/d\.type==='abrirRegistro'/.test(h), 'CHAT abre a conversa pedida pela Agenda');
  } },
] };
