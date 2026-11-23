/* ajuda-conteudo.js (22/11/2026) — TODO o conteúdo da AJUDA num lugar só.
 * Usado pela tela ajuda.html e pelo assistente (Edge Function ajuda-ia, que lê este arquivo publicado em vilaca.app).
 * Ao criar ou mudar uma tela, atualize aqui: o assistente aprende junto.
 * AJUDA_MODULOS = mapa do app (onde fica cada coisa). AJUDA_TOPICOS = passo a passo (cat, ico, tit, chave, body em HTML). */
/* Ícone pequeno dentro do texto (icones.js precisa vir antes). */
function AJ_I(nome){ try{ return window.Icone ? Icone(nome,{tam:13}) : ''; }catch(e){ return ''; } }
window.AJUDA_MODULOS = [
  { grupo:'PDV', ico:'carrinho', nome:'Venda', oque:'Registrar e consultar vendas.', onde:'PDV → VENDA', quem:'Vendedoras, gerência e diretoria' },
  { grupo:'PDV', ico:'recibo', nome:'Pedido (O.S.)', oque:'Abrir e acompanhar consertos, gravações e encomendas.', onde:'PDV → PEDIDO', quem:'Vendedoras, gerência e diretoria' },
  { grupo:'PDV', ico:'documento', nome:'Orçamento', oque:'Montar orçamento e acompanhar até o cliente decidir.', onde:'PDV → ORÇAMENTO', quem:'Vendedoras, gerência e diretoria' },
  { grupo:'PDV', ico:'carteira', nome:'Resumo do caixa', oque:'Entradas, saídas e fechamento do caixa.', onde:'PDV → RESUMO DO CAIXA', quem:'Quem tem acesso ao caixa' },
  { grupo:'PDV', ico:'etiqueta', nome:'Reservar', oque:'Separar uma joia por um prazo, sem caixa.', onde:'PDV → RESERVAR', quem:'Vendedoras' },
  { grupo:'PDV', ico:'busca', nome:'Buscar via / preço', oque:'Achar qualquer via ou o preço e estoque de uma peça.', onde:'Barra no alto do PDV', quem:'Todos que vendem' },
  { grupo:'ADM', ico:'devolver', nome:'Cancelamento', oque:'Cancelar venda ou pedido e decidir o destino do valor.', onde:'ADM → CANCELAMENTO', quem:'Vendedoras e gerência' },
  { grupo:'ADM', ico:'trocar', nome:'Transferências', oque:'Pedir peça de outra loja e reposição do escritório.', onde:'ADM → TRANSFERÊNCIAS', quem:'Lojas e escritório' },
  { grupo:'ADM', ico:'dinheiro', nome:'Gastos', oque:'Contas a pagar e despesas.', onde:'ADM → GASTOS', quem:'Gerência e diretoria' },
  { grupo:'ADM', ico:'check', nome:'Conciliação', oque:'Conferir cartão e PIX com o que foi vendido.', onde:'ADM → CONCILIAÇÃO', quem:'Gerência e diretoria' },
  { grupo:'ADM', ico:'joia', nome:'Reforma', oque:'Pedidos da Reforma Joias: orçamento, custódia e O.S.', onde:'ADM → REFORMA', quem:'Equipe da Reforma' },
  { grupo:'ADM', ico:'ferramenta', nome:'Oficina', oque:'Vias de todas as lojas, pendência e material usado.', onde:'ADM → OFICINA', quem:'Oficina' },
  { grupo:'ADM', ico:'relogio', nome:'Controle de horas', oque:'Registrar entrada, almoço e saída pelo celular da loja.', onde:'ADM → CONTROLE DE HORAS', quem:'Todos' },
  { grupo:'ADM', ico:'leitor', nome:'Inventário', oque:'Estoque por loja e contagem das peças com leitor.', onde:'ADM → INVENTÁRIO', quem:'Lojas, gerência e diretoria' },
  { grupo:'ADM', ico:'loja', nome:'Ficha da loja', oque:'Tudo sobre cada loja: fotos, equipamentos, contatos.', onde:'ADM → FICHA DA LOJA', quem:'Gerência e diretoria' },
  { grupo:'ADM', ico:'cadeado', nome:'Código', oque:'Gerar código de autorização para pedido fora do prazo.', onde:'ADM → CÓDIGO', quem:'Oficina e diretoria' },
  { grupo:'ADM', ico:'presente', nome:'Marketing', oque:'Aniversariantes, mala direta e fila do WhatsApp.', onde:'ADM → MARKETING', quem:'Gerência e diretoria' },
  { grupo:'ADM', ico:'loja', nome:'Outra loja', oque:'Trabalhar por um tempo em outra loja.', onde:'ADM → OUTRA LOJA', quem:'Todos (com a própria senha)' },
  { grupo:'CHAT', ico:'mensagem', nome:'Chat', oque:'WhatsApp dos clientes e conversas da equipe.', onde:'CHAT', quem:'Quem atende' },
  { grupo:'AGENDA', ico:'estrela', nome:'Vilacinha (gerente-auxiliar)', oque:'Meta do dia, quem chamar hoje, dicas, aulas de pedras e ouro, quiz e conversa sobre vendas.', onde:'Carinha no canto da tela', quem:'Vendedoras, gerência e diretoria' },
  { grupo:'AGENDA', ico:'calendario', nome:'Agenda', oque:'Tarefas, calendário, suas vias e os avisos do sistema.', onde:'AGENDA', quem:'Todos' },
  { grupo:'PAINEL', ico:'sino', nome:'Avisos', oque:'O que precisa da sua atenção hoje.', onde:'PAINEL → AVISOS', quem:'Todos' },
  { grupo:'PAINEL', ico:'grafico', nome:'Dashboard', oque:'Vendas, metas e desempenho.', onde:'PAINEL → DASHBOARD', quem:'Gerência e diretoria' },
  { grupo:'PAINEL', ico:'estrela', nome:'IA', oque:'Perguntas sobre o negócio.', onde:'PAINEL → IA', quem:'Gerência e diretoria' },
  { grupo:'CONFIGURAÇÕES', ico:'lista', nome:'Cadastro', oque:'Clientes, produtos, lojas e tabelas.', onde:'CONFIGURAÇÕES → CADASTRO', quem:'Gerência e diretoria' },
  { grupo:'CONFIGURAÇÕES', ico:'usuarios', nome:'Departamento pessoal', oque:'Funcionários, acessos e RH.', onde:'CONFIGURAÇÕES → DEPARTAMENTO PESSOAL', quem:'Gerência e diretoria' },
  { grupo:'CONFIGURAÇÕES', ico:'usuario', nome:'Meus dados', oque:'Seus dados pessoais e bancários.', onde:'CONFIGURAÇÕES → MEUS DADOS', quem:'Todos' },
  { grupo:'CONFIGURAÇÕES', ico:'olho', nome:'Log', oque:'Quem mexeu em quê.', onde:'CONFIGURAÇÕES → LOG', quem:'Diretoria' },
];
window.AJUDA_TOPICOS = [

/* ─────────────── PRIMEIROS PASSOS ─────────────── */
{
  cat:'Começando', ico:'sair', tit:'Entrar no sistema',
  chave:'login entrar senha usuario acesso bloqueado',
  body:`
    <ol class="passos">
      <li>Digite seu <b>nome ou apelido</b> no campo de cima. Não precisa acento nem letra maiúscula.</li>
      <li>Digite sua <b>senha</b>.</li>
      <li>Clique em <span class="btn-ref">Entrar</span>.</li>
    </ol>
    <div class="aviso"><b>Errou a senha 6 vezes?</b> O acesso trava por segurança. Só a diretoria destrava — fale com o Felipe.</div>
    <div class="dica"><b>Pode entrar no computador e no celular ao mesmo tempo.</b> Um não derruba o outro.</div>
    <p><b>Esqueceu a senha?</b> Peça pra diretoria ou gerência cadastrar uma nova pelo módulo CONFIGURAÇÕES.</p>
  `
},
{
  cat:'Começando', ico:'loja', tit:'Em qual loja eu estou (e como operar em outra)',
  chave:'loja trocar mudar empresa filial contexto outra loja senha gerente barra vermelha',
  body:`
    <p>Você entra sempre na <b>loja de trabalho</b> que a diretoria definiu no DP. A sigla dela aparece no balão colorido no alto da tela (ex.: <b>MC</b>). <b>Tudo que você lança vale para essa loja.</b></p>
    <p>Precisa lançar algo em outra loja?</p>
    <ol class="passos">
      <li>Menu <span class="btn-ref">ADM</span> → cartão <span class="btn-ref">OUTRA LOJA</span>.</li>
      <li>Escolha a loja e digite a <b>sua própria senha</b>. Você terá lá as mesmas funções que já tem na sua loja.</li>
      <li>Aparece uma <b>barra vermelha</b> no topo dizendo em qual loja você está operando. Ela vale por até 4 horas.</li>
      <li>Terminou? Clique em <span class="btn-ref">Voltar para minha loja</span> na barra vermelha.</li>
    </ol>
    <div class="perigo"><b>Confira a loja antes de lançar.</b> Se a barra vermelha estiver aparecendo, a venda vai para a outra loja.</div>
    <div class="aviso">Em outra loja, o sistema desconecta depois de <b>10 minutos</b> sem uso. Cinco senhas erradas bloqueiam o usuário (a diretoria desbloqueia no DP).</div>
  `
},
{
  cat:'Começando', ico:'relogio', tit:'Sistema me desconectou sozinho',
  chave:'desconectou saiu sozinho inatividade tempo sessao expirou',
  body:`
    <p>Depois de um tempo parado (sem clicar em nada), o sistema desconecta sozinho: <b>20 minutos</b> na sua loja e <b>10 minutos</b> quando você está operando em outra loja. É proteção: se alguém sentar no seu lugar, não consegue usar o seu acesso.</p>
    <div class="dica">Um minuto antes aparece uma <b>faixa laranja no topo</b> avisando. Clique em <span class="btn-ref">Continuar conectado</span> e nada acontece.</div>
    <p>Se desconectou, é só entrar de novo. Nada do que você já salvou se perde.</p>
  `
},
{
  cat:'Começando', ico:'sino', tit:'A tela de Avisos',
  chave:'avisos pendencia inicial notificacao badge painel dashboard',
  body:`
    <p>É a primeira tela quando você entra, dentro do módulo <b>PAINEL</b>. Ela mostra <b>o que está te esperando</b>: pedido pronto pra entregar, orçamento vencendo, conta pra pagar…</p>
    <p>A bolinha vermelha no item PAINEL do menu mostra quantas coisas estão pendentes. Clicou no aviso, ele te leva direto pro lugar certo.</p>
    <p>Quem tem acesso vê também as abas <b>Dashboard</b> (indicadores, gráficos e relatórios) e <b>IA</b> no topo do PAINEL.</p>
  `
},

/* ─────────────── VENDAS ─────────────── */
{
  cat:'Vender', ico:'carrinho', tit:'Lançar uma venda',
  chave:'venda vender pdv cupom lancar item produto pagamento',
  body:`
    <ol class="passos">
      <li>Confira a <b>sigla da loja</b> no alto da tela.</li>
      <li>Menu <span class="btn-ref">PDV</span> → cartão <span class="btn-ref">VENDA</span>.</li>
      <li>Clique em <span class="btn-ref">+ Nova venda</span>.</li>
      <li>Escolha a <b>vendedora</b> e confira a data.</li>
      <li><b>Cliente</b> é opcional — se quiser vincular, clique em buscar e procure pelo nome ou telefone.</li>
      <li>Em <b>Itens</b>: escolha o produto, o metal, a quantidade e o valor. Precisa de mais linhas? Clique em <span class="btn-ref">+ Adicionar item</span>.</li>
      <li>Em <b>Pagamento</b>: escolha a forma (dinheiro, cartão, pix…). Dá pra dividir em várias formas.</li>
      <li>Responda se <b>emitiu nota fiscal</b> (sim ou não).</li>
      <li>Clique em <span class="btn-ref">Salvar venda</span>.</li>
    </ol>
    <div class="dica">Embaixo de cada produto aparece <b>quanto tem em estoque nesta loja</b> e se tem em outra.</div>
  `
},
{
  cat:'Vender', ico:'alerta', tit:'O produto não tem na minha loja',
  chave:'estoque zerado outra loja peca falta cnpj entre lojas',
  body:`
    <p>Se aparecer o aviso laranja <b>"Sem estoque nesta loja, mas tem em JN"</b>, quer dizer que a peça existe, só que é de <b>outra empresa</b> (outro CNPJ).</p>
    <p>Você <b>pode vender</b>, mas precisa avisar o sistema direitinho:</p>
    <ol class="passos">
      <li>Na parte de <b>Pagamento</b>, no campo <b>Empresa joia</b>, escolha a loja <b>de onde a peça saiu de verdade</b>.</li>
      <li>O sistema vai pedir pra confirmar <b>em qual empresa a baixa de estoque será feita</b> — tem que ser a mesma de onde a peça saiu.</li>
      <li>Se emitiu nota, informe também a empresa do <b>pagamento</b> e a da <b>nota</b>.</li>
    </ol>
    <div class="aviso">Essa venda vai entrar num relatório separado (<b>Entre lojas</b>) pra diretoria acertar a parte fiscal entre as empresas depois. Você não precisa fazer mais nada além de preencher certo.</div>
  `
},
{
  cat:'Vender', ico:'impressora', tit:'Imprimir a via e o código de barras',
  chave:'imprimir via cupom codigo barras bobina impressora',
  body:`
    <p>Toda via impressa sai com o <b>código de barras no topo</b>, com o número embaixo dele.</p>
    <ol class="passos">
      <li>Abra a venda (ou pedido/orçamento) clicando nela na lista.</li>
      <li>Clique em <span class="btn-ref">${AJ_I('impressora')}Imprimir</span>.</li>
      <li>Abre uma janelinha — mande imprimir normalmente.</li>
    </ol>
    <div class="aviso">Se não abrir nada, provavelmente o navegador bloqueou a janela. Procure um aviso na barra de endereço e libere os pop-ups desse site.</div>
    <p><b>O que significa o código?</b> Ex.: <b>MC3V</b> = loja Marechal (MC), terceiro (3), Venda (V). As letras do final: <b>V</b>=venda, <b>P</b>=pedido, <b>O</b>=orçamento.</p>
  `
},
{
  cat:'Vender', ico:'leitor', tit:'Ler o código de barras da via',
  chave:'ler codigo barras scanner leitor camera celular buscar via',
  body:`
    <p>Achou uma via em papel e quer abrir ela no sistema? Tem três jeitos:</p>
    <ol class="passos">
      <li><b>Leitor de mesa:</b> é só apontar e ler, de qualquer tela. O sistema abre a via sozinho.</li>
      <li><b>Celular:</b> clique no botão <span class="btn-ref">${AJ_I('busca')}Buscar</span> → <span class="btn-ref">${AJ_I('camera')}Câmera</span> → aponte pro código.</li>
      <li><b>Digitando:</b> clique no <span class="btn-ref">${AJ_I('busca')}Buscar</span> e digite o código (ex.: MC3V).</li>
    </ol>
    <div class="dica">Se você estava no meio de um lançamento, o sistema <b>salva como rascunho</b> antes de pular pra via lida. Você não perde nada.</div>
  `
},

/* ─────────────── PEDIDOS ─────────────── */
{
  cat:'Pedidos e O.S.', ico:'recibo', tit:'Abrir um pedido (O.S.)',
  chave:'pedido os ordem servico conserto abrir cliente prazo',
  body:`
    <ol class="passos">
      <li>Confira a <b>sigla da loja</b> no alto da tela.</li>
      <li>Menu <span class="btn-ref">PDV</span> → cartão <span class="btn-ref">PEDIDO</span>.</li>
      <li>Clique em <span class="btn-ref">+ Nova ordem</span>.</li>
      <li>Busque o <b>cliente</b> (ou cadastre na hora se for novo).</li>
      <li>O <b>número da via</b> já vem preenchido sozinho — não precisa mexer.</li>
      <li>Escolha a <b>vendedora</b>, o <b>tipo de serviço</b> e a <b>data de entrega</b>.</li>
      <li>Descreva a peça e o que precisa ser feito.</li>
      <li>Salve.</li>
    </ol>
    <div class="aviso">Se a data escolhida estourar o limite de pedidos daquele dia, o sistema avisa e pede um <b>código de autorização</b> — é com a gerência.</div>
  `
},
{
  cat:'Pedidos e O.S.', ico:'check', tit:'Marcar pedido como pronto ou entregue',
  chave:'pronto entregue status pedido finalizar avisar cliente',
  body:`
    <ol class="passos">
      <li>Ache o pedido na lista (dá pra buscar pelo nome do cliente).</li>
      <li>Clique nele pra abrir.</li>
      <li>Mude o <b>Status</b> para <b>Pronto</b> (peça terminada) ou <b>Entregue</b> (cliente já levou).</li>
      <li>Salve.</li>
    </ol>
    <div class="dica">Quando marca como <b>Pronto</b>, o pedido aparece nos Avisos pra alguém ligar avisando o cliente.</div>
  `
},

/* ─────────────── ORÇAMENTO ─────────────── */
{
  cat:'Orçamento', ico:'documento', tit:'Fazer um orçamento',
  chave:'orcamento orcar proposta validade cliente aprovar',
  body:`
    <ol class="passos">
      <li>Menu <span class="btn-ref">PDV</span> → <span class="btn-ref">ORÇAMENTO</span> → <span class="btn-ref">+ Novo</span>.</li>
      <li>Preencha cliente, vendedora e a <b>validade</b> (quantos dias o preço vale).</li>
      <li>Adicione os itens com descrição e valor.</li>
      <li>Salve — e imprima ou mande pro cliente.</li>
    </ol>
    <p><b>Cliente aprovou?</b> Abra o orçamento e mude o status para <b>Aprovado</b>. Aí é só lançar a venda normalmente.</p>
    <div class="dica">Na hora de lançar uma venda pra um cliente que tem orçamento aberto, o sistema te avisa e pergunta se é aquele orçamento.</div>
  `
},

/* ─────────────── TRANSFERÊNCIAS ─────────────── */
{
  cat:'Transferências', ico:'trocar', tit:'Pedir peça de outra loja (transferência)',
  chave:'transferencia troca pedir peca outra loja fator igual diferente',
  body:`
    <ol class="passos">
      <li>Menu <span class="btn-ref">ADM</span> → <span class="btn-ref">TRANSFERÊNCIAS</span>.</li>
      <li>Clique em <span class="btn-ref">+ Nova transferência</span>.</li>
      <li>A <b>Loja que solicitou</b> já vem preenchida com a sua loja de trabalho.</li>
      <li>Em <b>Onde tem o produto</b>, escolha a loja que tem a peça.</li>
      <li>Escolha o <b>tipo</b>: Troca, Troca diferente ou Saída.</li>
      <li>Adicione a peça e tire foto.</li>
      <li>Salve.</li>
    </ol>
    <p>Depois disso, cada loja vai dando o <b>visto</b> nas etapas: saída, entrada, baixa de estoque e visto da gerente.</p>
    <div class="dica"><b>O que é fator igual e diferente?</b> Fator igual (<b>TFI</b>) é quando as peças trocadas têm mais ou menos o mesmo valor. Fator diferente (<b>TFD</b>) é quando tem diferença de valor e alguém precisa pagar a diferença.</div>
  `
},
{
  cat:'Transferências', ico:'pacote', tit:'Pedir reposição pro escritório',
  chave:'reposicao repor escritorio pedir mercadoria estoque',
  body:`
    <ol class="passos">
      <li>Menu <span class="btn-ref">ADM</span> → <span class="btn-ref">TRANSFERÊNCIAS</span> → aba <b>Reposição</b>.</li>
      <li>Clique em <span class="btn-ref">+ Nova reposição</span>.</li>
      <li>A loja solicitante já vem preenchida.</li>
      <li>Liste as peças que está pedindo.</li>
      <li>Salve. O escritório recebe e envia.</li>
    </ol>
  `
},

/* ─────────────── ATENDIMENTO ─────────────── */
{
  cat:'Agenda', ico:'calendario', tit:'Agenda: tarefas, calendário e minhas vias',
  chave:'agenda tarefa trello quadro calendario privada loja compartilhada minhas vias lembrete',
  body:`
    <ol>
      <li>Menu <span class="btn-ref">CHAT</span> → botão <span class="btn-ref">Agenda</span>.</li>
      <li><b>Tarefas</b>: quadro com as colunas A fazer, Fazendo e Feito. Arraste o cartão (ou use os botões do cartão) para mudar o andamento.</li>
      <li><span class="btn-ref">+ Nova tarefa</span>: escolha quem vê — <b>Privada</b> (só você), <b>Loja</b> (gerente e diretoria também) ou <b>Compartilhada</b> (você e as pessoas marcadas). Cada tipo tem uma cor.</li>
      <li><b>Calendário</b>: mostra tarefas com data, lembretes e, se marcado, as suas vias (entrega de pedido, validade de orçamento, vendas).</li>
      <li><b>Minhas vias</b>: tudo o que está com o seu nome, com filtro de Orçamentos, Vendas e Pedidos. Clique para abrir.</li>
      <li><b>Assistente</b>: peça lembretes por texto, como antes.</li>
    </ol>
  `
},
{
  cat:'Chat', ico:'usuarios', tit:'Conversa interna com a equipe',
  chave:'interno chat equipe departamento mensagem interna',
  body:`
    <ol>
      <li>No <span class="btn-ref">CHAT</span>, clique em <span class="btn-ref">Interno</span> e escolha a pessoa ou o departamento.</li>
      <li>A conversa aparece na lista de conversas de quem participa, com a etiqueta azul <b>Interno</b>, junto das conversas de clientes.</li>
    </ol>
  `
},
{
  cat:'Chat', ico:'whatsapp', tit:'Responder cliente no WhatsApp',
  chave:'whatsapp atendimento mensagem cliente responder conversa fila assumir',
  body:`
    <p>As mensagens do WhatsApp da loja chegam direto aqui — não precisa abrir o WhatsApp.</p>
    <ol class="passos">
      <li>Menu <span class="btn-ref">CHAT</span>.</li>
      <li>Na aba <b>Fila</b> ficam as conversas que ninguém pegou ainda.</li>
      <li>Clique na conversa → botão <span class="btn-ref">Assumir</span>.</li>
      <li>Agora é sua. Digite embaixo e aperte Enter pra enviar.</li>
      <li>Pra mandar foto ou áudio, clique no <span class="btn-ref">${AJ_I('clipe')}Anexar</span>.</li>
      <li>Terminou? Clique em <span class="btn-ref">Finalizar</span>.</li>
    </ol>
    <div class="perigo"><b>Sempre clique em Assumir antes de responder.</b> Assim ninguém responde o mesmo cliente duas vezes.</div>
    <div class="dica">Precisa passar pra outra pessoa? <span class="btn-ref">Transferir</span>. Pra devolver pra fila, transfira sem escolher ninguém.</div>
  `
},

/* ─────────────── CAIXA ─────────────── */
{
  cat:'Caixa e contas', ico:'carteira', tit:'Ver o movimento do caixa',
  chave:'caixa fechamento movimento dinheiro entrada saida resumo',
  body:`
    <ol class="passos">
      <li>Menu <span class="btn-ref">PDV</span> → cartão <span class="btn-ref">RESUMO DO CAIXA</span>.</li>
      <li>Escolha o <b>período</b> que quer ver.</li>
      <li>Aparece tudo que entrou e saiu, separado por forma de pagamento.</li>
    </ol>
    <div class="dica">Confira sempre se o dinheiro na gaveta bate com o que o sistema mostra.</div>
  `
},
{
  cat:'Caixa e contas', ico:'dinheiro', tit:'Lançar uma conta pra pagar',
  chave:'gasto conta pagar despesa fornecedor vencimento boleto',
  body:`
    <ol class="passos">
      <li>Menu <span class="btn-ref">ADM</span> → cartão <span class="btn-ref">GASTOS</span>.</li>
      <li>Clique em <span class="btn-ref">+ Novo gasto</span>.</li>
      <li>Preencha o que é, o valor e o <b>vencimento</b>.</li>
      <li>Escolha a <b>categoria</b> (aluguel, luz, fornecedor…).</li>
      <li>Salve.</li>
    </ol>
    <div class="dica">Contas vencendo hoje aparecem sozinhas nos Avisos quando alguém entra no sistema.</div>
  `
},

/* ─────────────── PROBLEMAS ─────────────── */
{
  cat:'Deu problema', ico:'impressora', tit:'A impressão não abre',
  chave:'imprimir nao abre popup bloqueado impressora problema',
  body:`
    <p>Quase sempre é o navegador bloqueando a janelinha.</p>
    <ol class="passos">
      <li>Olhe na <b>barra de endereço</b>, do lado direito — costuma ter um ícone avisando que bloqueou um pop-up.</li>
      <li>Clique nele e escolha <b>sempre permitir</b> pra esse site.</li>
      <li>Tente imprimir de novo.</li>
    </ol>
  `
},
{
  cat:'Deu problema', ico:'cadeado', tit:'Não consigo editar um lançamento',
  chave:'nao consigo editar bloqueado cadeado permissao outra loja',
  body:`
    <p>Se aparecer um <b>cadeado</b> dizendo que o registro é de outra loja, é assim mesmo.</p>
    <p>Cada loja é uma empresa separada. Você <b>vê e imprime</b> o que é das outras lojas, mas só <b>edita</b> o que é da loja onde você está.</p>
    <div class="dica">Precisa mesmo mudar? Use o cartão <b>OUTRA LOJA</b> no ADM (com a sua senha) ou peça para a gerência.</div>
  `
},
{
  cat:'Deu problema', ico:'atualizar', tit:'A tela travou ou está estranha',
  chave:'travou lento bug erro nao carrega atualizar',
  body:`
    <ol class="passos">
      <li>Primeiro tente <b>atualizar a página</b> (F5 no computador, ou puxar a tela pra baixo no celular).</li>
      <li>Não resolveu? Saia e entre de novo.</li>
      <li>Continua? Avise o Felipe dizendo <b>exatamente o que você estava fazendo</b> quando travou.</li>
    </ol>
    <div class="dica">Falar "não funciona" ajuda pouco. Falar "travou quando cliquei em imprimir na venda MC12V" resolve rápido.</div>
  `
},
{
  cat:'Vender', ico:'estrela', tit:'Vilacinha, o gerente-auxiliar (carinha no canto da tela)',
  chave:'vilacinha felipe copiloto assistente gerente auxiliar dicas meta do dia quem chamar venda ativa voz ouvir microfone',
  body:`
    <p>A carinha no <b>canto de baixo da tela</b> é o <b>Vilacinha</b>, seu gerente-auxiliar. Ele olha os seus números e te ajuda a vender mais.</p>
    <ol class="passos">
      <li>Toque na carinha para abrir <b>o seu dia</b>: meta de hoje, seus números no mês e dicas.</li>
      <li><b>Quem ligar hoje</b>: orçamentos vencendo ou parados, aniversariantes, quem comprou nesta mesma época em anos anteriores e <b>quem comprava sempre e sumiu</b>. O telefone aparece na tela: toque no número para <b>ligar</b>. Aviso de pedido pronto não entra aqui, porque já sai sozinho.</li>
      <li>Em cada cliente, abra <span class="btn-ref">O que dizer na ligação</span>: são 4 passos (como abrir, o motivo, o que perguntar e como marcar o dia). Fale com as suas palavras.</li>
      <li>Pergunte o que quiser sobre vendas, digitando ou pelo <b>microfone</b>. O botão <b>Ouvir</b> (alto-falante) <b>lê em voz alta</b>; toque de novo para parar.</li>
    </ol>
    <div class="dica">De vez em quando ele aparece num balão com uma dica. Toque em <span class="btn-ref">Agora não</span> para ele esperar 2 horas.</div>
    <div class="aviso">Você vê a comparação com <b>a melhor da loja</b>, sem nome. A gerência vê o ranking completo. Nenhuma mensagem sai para o cliente sem você tocar em enviar.</div>
    <div class="dica"><b>Dicas por tela:</b> ao abrir Venda, Pedido, Orçamento, Chat e outras telas, às vezes ele mostra uma dica daquela tela, de preferência uma que você ainda não viu. A meta é sempre a <b>próxima faixa</b> da loja: bateu, ela passa para a seguinte.</div>
    <div class="dica"><b>Aulas:</b> quando uma via (venda, pedido ou orçamento) trouxer uma pedra ou assunto de ourivesaria, o Vilacinha manda uma <b>aula curta para todas</b>, com como argumentar com a cliente. Toque em <span class="btn-ref">Abrir</span> no balão ou veja em <b>Aprenda com o Vilacinha</b>. Há também a <b>Biblioteca</b> (pedras, teor do ouro, liga, prata, cravação) e, se você perguntar algo novo, ele explica e guarda o assunto lá.</div>
    <div class="dica"><b>Meta em escada:</b> o cartão de meta mostra quanto falta até cada faixa da loja, <b>quanto por dia</b> e <b>quantas vendas por dia</b> no seu ticket médio. Mostra também quanto você já fez hoje e em quanto fecha o mês no seu ritmo.</div>
    <div class="dica"><b>Seu nível:</b> você ganha pontos respondendo a pergunta do dia (3), acertando no quiz (2 por acerto) e lendo as aulas (1). Os pontos viram níveis: Aprendiz, Bronze, Prata, Ouro e Diamante. O cartão mostra o seu domínio por assunto e o que estudar.</div>
    <div class="dica"><b>Pergunta do dia:</b> todo dia o Vilacinha traz 1 pergunta nova (sobre pedras, ouro, ourivesaria, vendas e gestão, sempre renovada). Toque em <span class="btn-ref">Responder agora</span> no cartão "Aprenda com o Vilacinha". Você vê a resposta certa e o porquê, e acompanha a sua sequência de dias.</div>
    <div class="dica"><b>Treinar o que eu erro:</b> esse botão monta um quiz só com os assuntos em que você mais errou. É o caminho mais rápido para subir de nível.</div>
    <div class="dica"><b>Quiz:</b> toque em <span class="btn-ref">Fazer o quiz</span> para responder 8 perguntas do seu nível (vendedora ou gerência). Ao final você vê o que acertou e por quê. A diretoria acompanha os resultados.</div>
    <div class="dica"><b>Recados:</b> o Vilacinha também é o portador de avisos. Recado da diretoria e aviso automático do sistema aparecem <b>no topo do painel dele</b>, em destaque, até você tocar em <span class="btn-ref">Entendi</span>. O aviso automático (como uma via esperando liberação da Oficina) some sozinho quando o problema é resolvido.</div>
    <div class="dica"><b>Via esperando liberação:</b> se você lançou uma via fora do prazo ou acima das vagas do dia, o Vilacinha avisa você todo dia até a Oficina liberar. Enquanto não liberarem, essa via <b>não vai para a fábrica</b>.</div>
    <div class="dica"><b>Oficina:</b> quem é da Oficina também tem Vilacinha, com a produção do dia (o que vence hoje, o que está atrasado, o que tem cravação), dicas de bancada e quiz técnico de ourivesaria. Ele não mostra valor de venda, comissão nem meta em dinheiro para a Oficina.</div>
    <div class="dica"><b>Como você está?</b> De vez em quando ele pergunta do seu dia (água, cansaço, sono, vida fora da loja), com resposta de um toque e sempre com "prefiro não dizer". Só pergunta se você aceitar, e as respostas ficam visíveis apenas para a diretoria.</div>
  `
},
/* ─────────────── 22/11: ASSUNTOS NOVOS (módulos que não tinham ajuda) ─────────────── */
{
  cat:'Começando', ico:'busca', tit:'Achar uma via ou o preço de uma peça (barra BUSCAR VIA)',
  chave:'buscar via preco consulta codigo leitor camera achar pedido venda orcamento etiqueta estoque',
  body:`
    <p>No alto do <b>PDV</b> tem a barra <span class="btn-ref">BUSCAR VIA / PREÇO</span>. Um campo só serve para tudo.</p>
    <ol class="passos">
      <li>Digite, passe o leitor ou use a câmera no código.</li>
      <li>Se for <b>código de via</b> (ex.: <b>MC12P</b>, <b>JN5V</b>), abre a venda, o pedido ou o orçamento.</li>
      <li>Se for <b>código de peça</b>, mostra o <b>preço e o estoque</b> em cada loja.</li>
      <li>Se for o <b>código de 6 números</b> do cliente (retirada), acha a via dele.</li>
    </ol>
    <div class="dica">A última letra da via diz o tipo: <b>V</b> = venda, <b>P</b> = pedido, <b>O</b> = orçamento.</div>
  `
},
{
  cat:'Começando', ico:'usuario', tit:'Meus dados, trocar de usuário e sair',
  chave:'meus dados endereco banco pix telefone trocar usuario sair celular compartilhado',
  body:`
    <p><b>Meus dados:</b> <span class="btn-ref">CONFIGURAÇÕES</span> → <span class="btn-ref">MEUS DADOS</span>. Ali você confere e corrige seu telefone, endereço e dados bancários.</p>
    <p><b>Trocar de usuário</b> (computador ou celular da loja usado por várias pessoas): botão <span class="btn-ref">Trocar usuário</span> no alto da tela. A outra pessoa entra com a senha dela.</p>
    <div class="perigo"><b>Nunca lance nada no login de outra pessoa.</b> Tudo fica registrado no nome de quem está logado.</div>
  `
},
{
  cat:'Vender', ico:'etiqueta', tit:'Reservar uma joia para o cliente',
  chave:'reservar reserva separar guardar joia codigo 9 prazo sinal',
  body:`
    <p>A reserva <b>separa a peça</b> por um prazo, sem mexer no caixa. Depois ela vira venda.</p>
    <ol class="passos">
      <li><span class="btn-ref">PDV</span> → cartão <span class="btn-ref">RESERVAR</span>.</li>
      <li>Escolha o cliente e as peças, como numa venda.</li>
      <li>Defina o <b>prazo</b> da reserva e salve.</li>
      <li>Quando o cliente voltar para levar, abra a reserva e transforme em <b>venda</b>.</li>
    </ol>
    <div class="aviso"><b>Reserva não é venda.</b> Não entra no caixa até virar venda.</div>
  `
},
{
  cat:'Vender', ico:'devolver', tit:'Cancelar uma venda ou um pedido',
  chave:'cancelar cancelamento estorno devolver devolucao desfazer credito cliente troca',
  body:`
    <ol class="passos">
      <li><span class="btn-ref">ADM</span> → cartão <span class="btn-ref">CANCELAMENTO</span>.</li>
      <li>Busque a via pelo <b>cliente, código ou data</b>.</li>
      <li>Escolha <b>o que fazer com o valor</b> que o cliente já pagou: devolver ou deixar como <b>crédito do cliente</b>.</li>
      <li>Escreva o motivo e confirme.</li>
    </ol>
    <div class="aviso"><b>O valor devolvido sai do caixa no dia do cancelamento</b>, não no dia da venda.</div>
    <div class="dica">Cliente quer trocar a peça? Cancele deixando o valor como <b>crédito</b> e use o crédito na venda nova.</div>
  `
},
{
  cat:'Vender', ico:'cadeado', tit:'Código de retirada do cliente (6 números)',
  chave:'codigo retirada 6 digitos terceiro buscar outra pessoa retirar seguranca link cliente',
  body:`
    <p>No link que o cliente recebe aparece um <b>código de 6 números</b> que muda a cada minuto. Ele mostra esse código na hora de retirar.</p>
    <ol class="passos">
      <li>Abra a via e clique em <span class="btn-ref">Retirada na loja</span>.</li>
      <li>Digite o código que o cliente mostrou.</li>
      <li>Código certo: pode entregar.</li>
    </ol>
    <div class="dica"><b>Outra pessoa vai buscar?</b> O cliente gera no link um <b>código de terceiro</b>, que vale 24 horas. A loja confere no mesmo campo.</div>
    <div class="aviso">Muitos códigos errados travam a conferência por alguns minutos. É proteção contra chute.</div>
  `
},
{
  cat:'Vender', ico:'carteira', tit:'Crédito e cashback do cliente',
  chave:'credito cashback saldo cliente abater usar ouro excedente',
  body:`
    <p>O cliente pode ter <b>crédito</b> (de um cancelamento ou de ouro que sobrou) e <b>cashback</b>.</p>
    <ol class="passos">
      <li>Na venda, ao escolher a forma de pagamento, o sistema pergunta se quer <b>abater o crédito ou o cashback</b>.</li>
      <li>Confirme o valor a usar. O resto se paga normalmente.</li>
    </ol>
    <div class="dica">Ouro que o cliente trouxe e passou do valor vira <b>crédito</b> dele automaticamente.</div>
  `
},
{
  cat:'Pedidos e O.S.', ico:'ferramenta', tit:'Oficina: receber vias, pendência e material usado',
  chave:'oficina pendencia material ouro insumos liberado fabrica producao leitor vias todas lojas',
  body:`
    <p>A Oficina trabalha pelo cartão <span class="btn-ref">ADM</span> → <span class="btn-ref">OFICINA</span>. Lá aparecem as vias de <b>todas as lojas</b>.</p>
    <ol class="passos">
      <li>Passe o leitor na via (ou busque) para abri-la.</li>
      <li>Serviço terminado: marque <b>liberado pela fábrica</b> e lance o <b>material usado</b> (ouro, prata, pedras).</li>
      <li>Parou por um problema: marque <b>Pendência</b> e escreva o motivo.</li>
    </ol>
    <div class="aviso"><b>Pendência sempre com motivo.</b> A loja vê o motivo em vermelho nos Avisos e na Agenda e resolve com o cliente.</div>
  `
},
{
  cat:'Pedidos e O.S.', ico:'cadeado', tit:'Pedido fora do prazo: código de autorização',
  chave:'codigo autorizacao prazo data entrega vagas limite oficina liberar',
  body:`
    <p>Se você muda a <b>data de entrega</b> sugerida ou a agenda da Oficina está cheia, o pedido pede um <b>código de autorização</b>.</p>
    <ol class="passos">
      <li>Peça o código para a <b>Oficina ou a diretoria</b>.</li>
      <li>Eles geram em <span class="btn-ref">ADM</span> → <span class="btn-ref">CÓDIGO</span>.</li>
      <li>Digite o código no pedido e salve.</li>
    </ol>
    <p>Se você <b>não tem o código</b>, toque em <span class="btn-ref">Solicitar permissão</span>: a venda fecha normalmente, mas a via fica com <b>pendência de autorização</b>.</p>
    <div class="aviso"><b>Via com pendência não anda:</b> enquanto a Oficina não liberar, ela <b>não pode ser enviada para a fábrica</b> nem mudar para os status seguintes. O Vilacinha fica lembrando você e a Oficina todo dia, até resolver. Se a Oficina recusar, a via volta sozinha para a data mais próxima com vaga.</div>
    <div class="dica">Qualquer pessoa da <b>Oficina</b> pode liberar, não só a diretoria. O número de vias esperando aparece na própria aba <b>Código</b>.</div>
  `
},
{
  cat:'Pedidos e O.S.', ico:'impressora', tit:'Imprimir: via do cliente e via da fábrica',
  chave:'imprimir via cliente fabrica oficina data entrega um dia antes cravacao impressao',
  body:`
    <p>Ao tocar em <span class="btn-ref">Imprimir via</span>, o sistema pergunta <b>qual via</b> você vai imprimir.</p>
    <ol class="passos">
      <li><b>VIA DO CLIENTE</b>: a de sempre — com os valores, o pagamento, a assinatura e a <b>data combinada com o cliente</b>.</li>
      <li><b>VIA FÁBRICA</b>: a que vai junto com a peça para a Oficina. Sai <b>sem valores</b>, com a entrega em destaque e um aviso grande quando o serviço <b>envolve cravação</b>.</li>
    </ol>
    <div class="dica">Na via da fábrica a data de entrega sai sempre <b>um dia antes</b> da combinada com o cliente. É uma folga proposital, para a peça ficar pronta com sobra. Quem entra no sistema com o perfil <b>Oficina</b> também vê essa data (um dia antes) na lista, na agenda e na ficha da via.</div>
  `
},
{
  cat:'Agenda', ico:'sino', tit:'Avisos do sistema na Agenda',
  chave:'avisos agenda pendencia vencido pronto sem retirada experiencia ficha virar tarefa calendario',
  body:`
    <p>Em <span class="btn-ref">AGENDA</span> → <span class="btn-ref">Tarefas</span>, o painel <b>Avisos do sistema</b> junta o que os módulos estão pedindo: vias em pendência, pedidos atrasados, prontos sem retirada, orçamentos vencidos ou parados e fichas do DP.</p>
    <ol class="passos">
      <li>As cores mostram a pressa: <b>vermelho</b> é urgente, <b>amarelo</b> é atenção e <b>azul</b> é informativo.</li>
      <li>Vários avisos do mesmo tipo ficam num <b>grupo</b>. Toque no grupo para abrir.</li>
      <li><span class="btn-ref">Abrir</span> leva direto para a via ou a ficha.</li>
      <li><span class="btn-ref">Virar tarefa</span> cria uma tarefa já preenchida para você acompanhar no quadro.</li>
    </ol>
    <div class="dica">Os avisos com data também aparecem no <b>Calendário</b>, no dia certo. Eles somem sozinhos quando o problema é resolvido.</div>
    <div class="aviso"><b>Via em pendência:</b> leia o motivo da Oficina e toque em <span class="btn-ref">Ciente</span>. Para avisar o cliente, use <span class="btn-ref">Escrever recado para o cliente</span> e depois <span class="btn-ref">Enviar pelo WhatsApp</span>. O cliente recebe só a situação da via e o seu recado, nunca a observação interna da Oficina. O mesmo vale em <b>PAINEL → AVISOS</b>.</div>
    <p>Você só vê os avisos das vias em que participa. Gerente vê os da loja toda.</p>
  `
},
{
  cat:'Caixa e contas', ico:'check', tit:'Conciliação: conferir cartão e PIX',
  chave:'conciliacao conferir cartao pix maquininha recebido extrato bater',
  body:`
    <p><span class="btn-ref">ADM</span> → <span class="btn-ref">CONCILIAÇÃO</span> compara o que a maquininha e o banco receberam com o que foi lançado nas vendas e pedidos.</p>
    <ol class="passos">
      <li>Escolha a loja e o período.</li>
      <li>Confira as linhas que <b>não bateram</b>.</li>
      <li>Corrija a forma de pagamento na via, se foi lançada errada.</li>
    </ol>
  `
},
{
  cat:'Estoque e loja', ico:'leitor', tit:'Inventário: contar as peças da loja',
  chave:'inventario contagem estoque contar pecas leitor relatorio excel pdf ajuste',
  body:`
    <p><span class="btn-ref">ADM</span> → <span class="btn-ref">INVENTÁRIO</span> mostra o <b>estoque de cada loja</b> (dá para baixar em Excel ou PDF) e faz a <b>contagem</b> das peças.</p>
    <ol class="passos">
      <li>Toque em <span class="btn-ref">Iniciar contagem</span> e escolha a loja e as categorias.</li>
      <li>Passe o leitor (ou a câmera) em cada peça.</li>
      <li>No fim, veja o que <b>faltou</b> e o que <b>sobrou</b>.</li>
      <li>Só gerente ou diretoria <b>ajusta o estoque</b> depois da contagem.</li>
    </ol>
    <div class="dica">Leu a mesma peça duas vezes sem querer? Use <b>desfazer</b> na última leitura.</div>
  `
},
{
  cat:'Estoque e loja', ico:'loja', tit:'Ficha da loja',
  chave:'ficha loja memorial fotos equipamentos lampadas internet contatos documentos loja nova',
  body:`
    <p><span class="btn-ref">ADM</span> → <span class="btn-ref">FICHA DA LOJA</span> guarda tudo sobre cada loja: fotos, equipamentos, lâmpadas, internet, contatos, equipe e documentos. Tem também a lista do que é preciso para abrir uma loja nova.</p>
    <p>Gerência e diretoria editam. Cada mudança fica no histórico.</p>
  `
},
{
  cat:'Equipe', ico:'relogio', tit:'Controle de horas: registrar entrada e saída',
  chave:'controle horas ponto entrada almoco saida gps localizacao biometria correcao horario espelho',
  body:`
    <ol class="passos">
      <li>No celular da loja, entre com <b>a sua senha</b>.</li>
      <li><span class="btn-ref">ADM</span> → <span class="btn-ref">CONTROLE DE HORAS</span>.</li>
      <li>Toque no botão do momento: <b>entrada</b>, <b>saída para o almoço</b>, <b>volta do almoço</b> ou <b>saída</b>.</li>
      <li>Confirme com a <b>digital ou o rosto</b> do celular.</li>
      <li>Depois da saída, toque em <span class="btn-ref">Sair do sistema</span> para a próxima pessoa usar o celular.</li>
    </ol>
    <div class="aviso"><b>Só registra dentro da loja.</b> O celular confere a localização. Fora da loja ou com GPS fraco, o registro é recusado.</div>
    <div class="dica">Esqueceu de registrar ou registrou errado? Use <b>Editar dados</b> ou <b>Registro fora do horário</b>. Quem aprova é a diretoria.</div>
  `
},
{
  cat:'Equipe', ico:'usuarios', tit:'Departamento pessoal (DP) e acessos',
  chave:'dp departamento pessoal funcionario ficha rh acesso perfil permissao senha desbloquear experiencia advertencia',
  body:`
    <p><span class="btn-ref">CONFIGURAÇÕES</span> → <span class="btn-ref">DEPARTAMENTO PESSOAL</span> é usado pela gerência e diretoria.</p>
    <ul>
      <li><b>Funcionários:</b> ficha de RH com documentos, endereço e dados bancários.</li>
      <li><b>Acessos e perfis:</b> o que cada pessoa pode ver no app.</li>
      <li><b>Senha:</b> criar a senha inicial e desbloquear quem errou 6 vezes (só diretoria).</li>
    </ul>
    <div class="aviso">Ficha incompleta e fim do período de experiência aparecem nos <b>Avisos</b> e na <b>Agenda</b>.</div>
  `
},
{
  cat:'Mensagens ao cliente', ico:'whatsapp', tit:'O que o WhatsApp manda sozinho para o cliente',
  chave:'whatsapp automatico mensagem cliente disparo aniversario pos venda orcamento pedido aprovado venda link',
  body:`
    <p>O app manda mensagem <b>sozinho</b> só nestes casos:</p>
    <ol class="passos">
      <li><b>Venda</b> salva: vai o link da via.</li>
      <li><b>Pedido</b> salvo como <b>APROVADO</b>.</li>
      <li><b>Orçamento</b>: avisos de cada etapa (pronto, lembretes, aprovado, encerrado).</li>
      <li><b>Aniversário</b> do cliente, com o cartão.</li>
      <li><b>Pós-venda</b>, alguns dias depois da compra ou da entrega.</li>
    </ol>
    <div class="aviso"><b>Todo o resto só sai se alguém clicar no ícone do WhatsApp.</b> Mudar o status do pedido (pronto, entregue…) não avisa o cliente sozinho.</div>
    <div class="dica">Cliente pediu para não receber? Marque a tag <b>MARKETING OFF</b> no cadastro dele.</div>
  `
},
{
  cat:'Mensagens ao cliente', ico:'presente', tit:'Marketing: aniversariantes, mala direta e fila',
  chave:'marketing aniversario aniversariantes mala direta campanha fila envio chamar cliente pos venda',
  body:`
    <p><span class="btn-ref">ADM</span> → <span class="btn-ref">MARKETING</span> tem os <b>aniversariantes do dia</b>, a <b>mala direta</b> (campanhas para um grupo de clientes), o pós-venda e a <b>fila de envios</b> do WhatsApp.</p>
    <ol class="passos">
      <li>Escolha o grupo de clientes e escreva a mensagem.</li>
      <li>Confira a prévia.</li>
      <li>Coloque na fila. O app manda aos poucos, com intervalo, para não bloquear o número.</li>
    </ol>
  `
},
{
  cat:'Mensagens ao cliente', ico:'joia', tit:'Reforma Joias: pedidos pelo link',
  chave:'reforma joias link cliente fotos orcamento custodia gerar os',
  body:`
    <p>O cliente da Reforma manda as <b>fotos da peça</b> por um link. A equipe trabalha em <span class="btn-ref">ADM</span> → <span class="btn-ref">REFORMA</span>:</p>
    <ol class="passos">
      <li>Veja o pedido novo e as fotos.</li>
      <li>Mande o <b>orçamento</b>. O cliente aceita pelo link.</li>
      <li>Ao receber a peça, registre a <b>custódia</b> (fotos de como a peça chegou).</li>
      <li>Toque em <span class="btn-ref">Gerar O.S.</span> para virar pedido.</li>
    </ol>
  `
},
{
  cat:'Gestão', ico:'grafico', tit:'Dashboard e IA',
  chave:'dashboard painel metas vendas desempenho graficos ia inteligencia artificial perguntar',
  body:`
    <p><span class="btn-ref">PAINEL</span> → <span class="btn-ref">DASHBOARD</span>: vendas, metas e desempenho das lojas e vendedoras, com gráficos.</p>
    <p><span class="btn-ref">PAINEL</span> → <span class="btn-ref">IA</span>: pergunte sobre o negócio em português ("quanto a loja MC vendeu esta semana?"). Cada perfil só recebe os dados que pode ver.</p>
    <div class="dica">Dúvida sobre <b>como usar o app</b>? Pergunte ao assistente aqui da <b>Ajuda</b>.</div>
  `
},
{
  cat:'Gestão', ico:'lista', tit:'Cadastro e Log (diretoria e gerência)',
  chave:'cadastro clientes produtos lojas formas pagamento tabelas log auditoria quem alterou',
  body:`
    <p><span class="btn-ref">CONFIGURAÇÕES</span> → <span class="btn-ref">CADASTRO</span>: clientes, produtos, lojas, formas de pagamento e outras tabelas.</p>
    <p><span class="btn-ref">CONFIGURAÇÕES</span> → <span class="btn-ref">LOG</span>: mostra <b>quem editou, cancelou ou mexeu no estoque</b>, e quem operou em outra loja.</p>
  `
},

];
