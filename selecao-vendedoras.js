/* selecao-vendedoras.js (23/11/2026) — DP › SELEÇÃO DE VENDEDORAS: o Vilacinha no papel de RH. SÓ DIRETORIA.
 * SelecaoUI.render(el, { senha })  →  3 telas: Perfil ideal · Roteiro de entrevista · Candidatas (ficha, notas, parecer da IA, salvar).
 * Dados: função `copiloto-saber` (rhListar / rhSalvar / rhExcluir / rhPerguntas / rhAvaliar) · tabela rh_candidatas (só service_role).
 * Regras: nada de pergunta discriminatória (Lei 9.029/95); a IA só opina sobre o que o entrevistador anotou; a decisão é sempre do diretor. */
(function(){
  'use strict';
  if(window.SelecaoUI) return;
  var URL_FN = (window.SUPABASE_URL || '') + '/functions/v1/copiloto-saber';
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  async function chamar(senha, body){
    try{ var r = await fetch(URL_FN, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:window.SUPABASE_ANON_KEY, Authorization:'Bearer '+window.SUPABASE_ANON_KEY }, body: JSON.stringify(Object.assign({ senha:senha }, body)) }); return await r.json(); }
    catch(e){ return { error:'Sem conexão com o servidor.' }; }
  }

  /* ---- conteúdo fixo ---- */
  var PERFIL = {
    quem: 'A vendedora Vilaça atende com carinho e conhecimento, vende por relacionamento (balcão e WhatsApp) e cuida da peça do cliente como se fosse dela. Trabalha em equipe pela meta da loja e usa o sistema com capricho.',
    busca: [
      ['Atendimento consultivo', 'Pergunta a ocasião, escuta, indica a peça certa e não empurra produto.'],
      ['Honestidade e cuidado', 'Lida com dinheiro e peças de valor com total transparência; registra tudo na via.'],
      ['Vontade de aprender', 'Gosta de entender de ouro, pedras e ourivesaria; aceita feedback e faz o quiz.'],
      ['Venda ativa e pós-venda', 'Chama clientes pelo WhatsApp, responde orçamento rápido, lembra de garantia e limpeza.'],
      ['Organização e sistema', 'Preenche via completa (nome, telefone, descrição, prazo, fotos) e usa PDV, pedido e orçamento.'],
      ['Trabalho em equipe', 'Divide cliente com respeito, ajuda a loja a bater a faixa e comemora o resultado de todas.'],
      ['Postura e pontualidade', 'Comunicação clara, educada, apresentação cuidada e compromisso com horário.'],
      ['Energia e bom humor', 'Mantém o astral com cliente difícil e em dia cheio, sem perder a gentileza.']
    ],
    alerta: [
      'Fala mal de empresas ou chefes anteriores, sem assumir nenhuma responsabilidade.',
      'Promete desconto ou prazo sem consultar; improvisa informação sobre ouro e pedra.',
      'Respostas vagas sobre dinheiro, troco, caixa e peças deixadas por clientes.',
      'Sem interesse em aprender o produto ou em usar o sistema.',
      'Foco só em salário, sem curiosidade pela loja ou pelo cliente.',
      'Pontualidade e disponibilidade incompatíveis com a escala do comércio e do shopping.'
    ]
  };
  var BLOCOS = [
    { t:'Abertura', q:[
      'Conte um pouco da sua trajetória profissional até aqui.',
      'Por que você quer trabalhar com joias e na Vilaça?',
      'O que você já conhece da nossa empresa e das nossas lojas?',
      'Onde você quer estar profissionalmente daqui a 2 anos?'] },
    { t:'Vendas', q:[
      'Descreva a melhor venda que você já fez. O que você fez de diferente?',
      'Como você faz a primeira abordagem a uma cliente que acabou de entrar na loja?',
      'A cliente diz "vou pensar". O que você faz?',
      'A cliente diz que está caro. Como você responde?',
      'Como você lida com meta e pressão por resultado?',
      'Já fez venda ou atendimento por WhatsApp? Como você conduz uma conversa até o fechamento?'] },
    { t:'Atendimento e cliente difícil', q:[
      'Uma cliente chega nervosa porque o conserto atrasou. Como você age?',
      'Duas clientes chegam ao mesmo tempo. O que você faz?',
      'A cliente está indecisa entre duas peças. Como ajuda a decidir sem pressionar?'] },
    { t:'Equipe e postura', q:[
      'Conte uma situação de conflito com um colega e como você resolveu.',
      'Como você reage quando recebe uma correção ou feedback?',
      'Descreva um dia em que tudo deu errado no trabalho. O que fez?'] },
    { t:'Responsabilidade e honestidade', q:[
      'Você percebe que o troco foi dado a mais para você. O que faz?',
      'Uma cliente deixa uma joia valiosa para conserto. Que cuidados você toma?',
      'Você vê uma colega retirar uma peça sem registrar. Qual é a sua atitude?'] },
    { t:'Organização e sistema', q:[
      'Quais sistemas ou aplicativos de venda você já usou (PDV, WhatsApp, planilhas)?',
      'Como você organiza o seu dia de trabalho?',
      'Por que é importante preencher a via do pedido de forma completa?'] },
    { t:'Motivação e disponibilidade', q:[
      'O que mais motiva você no trabalho?',
      'Você tem disponibilidade para a escala do comércio (incluindo sábados e datas de pico, como Dia das Mães e Natal)?',
      'Quais são as suas expectativas de remuneração e o que valoriza além do salário?'] }
  ];
  var ROLE = [
    'Simulação 1: venda de uma aliança de casamento para um casal indeciso.',
    'Simulação 2: oferecer limpeza e gravação no fechamento de uma venda.',
    'Simulação 3: mensagem de WhatsApp para um orçamento parado há 3 dias.'
  ];
  var CRITERIOS = ['Comunicação', 'Atendimento consultivo', 'Venda e fechamento', 'Honestidade', 'Organização e sistema', 'Trabalho em equipe', 'Vontade de aprender', 'Aderência ao perfil Vilaça'];
  var PROIBIDO = 'Não pergunte nem use para decidir: gravidez ou planos de ter filhos, estado civil, idade, religião, saúde ou deficiência, orientação sexual, política, cor ou raça, aparência física. A Lei 9.029/1995 proíbe práticas discriminatórias na admissão. Anote só o que se refere ao trabalho.';

  var STATUS = [['triagem','Triagem','#7a7f87'],['entrevista','Entrevista marcada','#1c6fd1'],['segunda','2ª entrevista','#8a4fd1'],['aprovada','Aprovada','#1f9a55'],['contratada','Contratada','#0f7a3d'],['banco','Banco de talentos','#a8803a'],['reprovada','Não seguiu','#b3261e']];
  function stRot(id){ var x = STATUS.filter(function(s){ return s[0]===id; })[0]; return x ? x[1] : 'Triagem'; }
  function stCor(id){ var x = STATUS.filter(function(s){ return s[0]===id; })[0]; return x ? x[2] : '#7a7f87'; }

  var CSS = '.sv-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px;} .sv-tabs button{min-height:38px;padding:0 14px;border-radius:999px;border:1px solid var(--line,#dde);background:var(--surface,#fff);color:inherit;font:600 13.5px Inter,sans-serif;cursor:pointer;} .sv-tabs button.on{background:var(--primary,#1f6f8b);border-color:var(--primary,#1f6f8b);color:#fff;}'
   +'.sv-card{background:var(--surface,#fff);border:1px solid var(--line,#dde);border-radius:12px;padding:14px 16px;margin:0 0 12px;} .sv-card h3{margin:0 0 8px;font-size:15px;} .sv-card ul{margin:0;padding-left:18px;} .sv-card li{margin:4px 0;line-height:1.45;}'
   +'.sv-aviso{border-color:#c62828;background:rgba(198,40,40,.06);} .sv-ok{border-color:#1f9a55;background:rgba(31,154,85,.06);}'
   +'.sv-q{border-top:1px dashed var(--line,#dde);padding:10px 0;} .sv-q:first-child{border-top:0;} .sv-q b{display:block;margin-bottom:4px;font-weight:600;}'
   +'.sv-q textarea,.sv-in{width:100%;box-sizing:border-box;border:1px solid var(--line,#cdd);border-radius:8px;padding:8px 10px;font:inherit;background:var(--surface,#fff);color:inherit;} .sv-q textarea{min-height:52px;}'
   +'.sv-nota{display:inline-flex;gap:4px;margin-top:4px;} .sv-nota label{cursor:pointer;} .sv-nota input{position:absolute;opacity:0;} .sv-nota span{display:inline-block;min-width:34px;text-align:center;padding:5px 0;border:1px solid var(--line,#cdd);border-radius:8px;font-weight:700;} .sv-nota input:checked+span{background:var(--primary,#1f6f8b);color:#fff;border-color:var(--primary,#1f6f8b);} .sv-nota input:focus-visible+span{outline:2px solid var(--primary,#1f6f8b);outline-offset:2px;}'
   +'.sv-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;} .sv-badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:700;background:#e9eef3;} .sv-b{min-height:38px;padding:0 14px;border-radius:9px;border:1px solid var(--line,#bcc);background:var(--surface,#fff);color:inherit;font:600 13.5px Inter,sans-serif;cursor:pointer;} .sv-b.pri{background:var(--primary,#1f6f8b);border-color:var(--primary,#1f6f8b);color:#fff;} .sv-b:disabled{opacity:.6;}'
   +'.sv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;}';

  function render(el, opts){
    if(!document.getElementById('svCss')){ var st = document.createElement('style'); st.id = 'svCss'; st.textContent = CSS; document.head.appendChild(st); }
    var senha = opts && opts.senha, aba = 'perfil', cand = null, extras = [], lista = null, metr = null, funil = null, filtro = '';
    el.innerHTML = '<div class="sv-wrap"></div>'; var raiz = el.firstChild;

    function cab(){
      return '<h2 style="margin:0 0 4px;">Seleção de vendedoras</h2><p style="margin:0 0 12px;color:var(--muted,#667);font-size:13.5px;">O Vilacinha no papel de RH: perfil ideal da Vilaça, roteiro de entrevista e ficha de cada candidata. Só a diretoria vê.</p>'
        + '<div class="sv-tabs" role="tablist">' + [['perfil','Perfil ideal'],['roteiro','Roteiro de entrevista'],['cands','Candidatas']].map(function(t){ return '<button type="button" role="tab" data-aba="'+t[0]+'" class="'+(aba===t[0]?'on':'')+'" aria-selected="'+(aba===t[0])+'">'+t[1]+'</button>'; }).join('') + '</div>';
    }
    function pintar(){
      var h = cab();
      if(aba==='perfil') h += telaPerfil(); else if(aba==='roteiro') h += telaRoteiro(); else h += cand ? telaFicha() : telaLista();
      raiz.innerHTML = h;
      raiz.querySelectorAll('[data-aba]').forEach(function(b){ b.onclick = function(){ aba = b.dataset.aba; if(aba!=='cands') cand = null; pintar(); if(aba==='cands' && !lista) carregarLista(); }; });
      if(aba==='roteiro') ligarRoteiro(); else if(aba==='cands') cand ? ligarFicha() : ligarLista();
    }
    function telaPerfil(){
      return '<div class="sv-card"><h3>Quem é a vendedora Vilaça</h3><p style="margin:0;line-height:1.5;">'+esc(PERFIL.quem)+'</p></div>'
        + '<div class="sv-card sv-ok"><h3>O que buscar</h3><div class="sv-grid">'+PERFIL.busca.map(function(x){ return '<div><b>'+esc(x[0])+'</b><div style="font-size:13.5px;line-height:1.45;">'+esc(x[1])+'</div></div>'; }).join('')+'</div></div>'
        + '<div class="sv-card sv-aviso"><h3>Sinais de alerta</h3><ul>'+PERFIL.alerta.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul></div>'
        + '<div class="sv-card"><h3>Como conduzir o processo</h3><ul><li><b>1. Triagem rápida (10 min):</b> conversa por telefone ou WhatsApp para confirmar disponibilidade e interesse.</li><li><b>2. Entrevista (30 a 40 min):</b> use o Roteiro, anote as respostas e dê nota de 1 a 5 em cada.</li><li><b>3. Simulação prática (10 min):</b> peça para vender uma aliança e para escrever uma mensagem de orçamento.</li><li><b>4. Quiz do Vilacinha:</b> se ela passar, ela faz o quiz de vendedoras no período de experiência.</li><li><b>5. Decisão:</b> compare a pontuação com o seu feeling; confirme referências quando possível.</li></ul></div>'
        + '<div class="sv-card sv-aviso"><h3>Cuidado com a lei</h3><p style="margin:0;line-height:1.5;">'+esc(PROIBIDO)+'</p></div>';
    }
    function telaRoteiro(){
      return '<div class="sv-card sv-aviso"><h3>Antes de começar</h3><p style="margin:0;line-height:1.5;">'+esc(PROIBIDO)+'</p></div>'
        + BLOCOS.map(function(b){ return '<div class="sv-card"><h3>'+esc(b.t)+'</h3>'+b.q.map(function(q,i){ return '<div class="sv-q">'+(i+1)+'. '+esc(q)+'</div>'; }).join('')+'</div>'; }).join('')
        + '<div class="sv-card"><h3>Simulações práticas</h3><ul>'+ROLE.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul></div>'
        + '<div class="sv-card"><h3>Mais perguntas com o Vilacinha (IA)</h3><p style="margin:0 0 8px;font-size:13.5px;color:var(--muted,#667);">Opcional: diga o foco (por exemplo "venda por WhatsApp" ou "vaga para o shopping") e ele cria perguntas sob medida para o perfil da Vilaça.</p>'
        + '<div class="sv-row"><input class="sv-in" id="svFoco" maxlength="250" placeholder="Foco (opcional)" style="flex:1 1 240px;"><button type="button" class="sv-b pri" id="svGerar">Gerar perguntas</button></div><div id="svExtras" style="margin-top:10px;"></div></div>';
    }
    function ligarRoteiro(){
      var box = raiz.querySelector('#svExtras'); if(extras.length) pintaExtras(box);
      raiz.querySelector('#svGerar').onclick = async function(){
        var b = this; b.disabled = true; box.innerHTML = '<div style="color:var(--muted,#667);">Pensando…</div>';
        var r = await chamar(senha, { op:'rhPerguntas', foco: raiz.querySelector('#svFoco').value });
        b.disabled = false;
        if(!r || !r.ok || !(r.perguntas||[]).length){ box.innerHTML = '<div style="color:#c62828;">'+esc((r&&r.error)||'Não consegui gerar agora.')+'</div>'; return; }
        extras = r.perguntas; pintaExtras(box);
      };
    }
    function pintaExtras(box){
      box.innerHTML = extras.map(function(x,i){ return '<div class="sv-q"><b>'+(i+1)+'. '+esc(x.pergunta)+'</b><div style="font-size:13px;color:#1f7a47;">Boa resposta: '+esc(x.observar||'')+'</div><div style="font-size:13px;color:#b3261e;">Atenção: '+esc(x.alerta||'')+'</div></div>'; }).join('');
    }

    /* ---- candidatas ---- */
    async function carregarLista(){
      raiz.querySelector('#svLista') && (raiz.querySelector('#svLista').innerHTML = '<div style="color:var(--muted,#667);">Carregando…</div>');
      var r = await chamar(senha, { op:'rhListar' });
      lista = r && r.ok ? r.candidatas : [];
      metr = r && r.ok ? r.metricas : null; funil = r && r.ok ? r.funil : null;
      if(aba==='cands' && !cand) pintar();
    }
    function telaLista(){
      var L = lista, vis = (L||[]).filter(function(c){ return !filtro || (c.status||'triagem') === filtro; });
      var h = '<div class="sv-row" style="margin-bottom:10px;"><span style="color:var(--muted,#667);font-size:13.5px;">'+(L ? L.length+' candidata'+(L.length===1?'':'s')+' no total' : 'Carregando…')+'</span><button type="button" class="sv-b pri" id="svNova">+ Nova candidata</button></div>';
      if(metr) h += '<div class="sv-card"><h3>Como está o processo</h3><div class="sv-grid">'
        + [['Em andamento', metr.emAndamento], ['Aprovadas', metr.aprovadas], ['Contratadas', metr.contratadas],
           ['Nota média', metr.notaMedia != null ? metr.notaMedia + ' pts' : '—'],
           ['Aproveitamento', metr.taxaAprovacao + '%'],
           ['Dias até decidir', metr.diasAteDecidir != null ? metr.diasAteDecidir + ' d' : '—']]
          .map(function(x){ return '<div><div style="font-size:20px;font-weight:800;">'+esc(String(x[1]))+'</div><div style="font-size:12px;color:var(--muted,#667);">'+esc(x[0])+'</div></div>'; }).join('')
        + '</div></div>';
      if(funil) h += '<div class="sv-row" style="gap:6px;margin-bottom:10px;">'
        + '<button type="button" class="sv-b'+(filtro===''?' pri':'')+'" data-f="">Todas</button>'
        + STATUS.filter(function(st){ return funil[st[0]]; }).map(function(st){ return '<button type="button" class="sv-b'+(filtro===st[0]?' pri':'')+'" data-f="'+st[0]+'">'+esc(st[1])+' ('+funil[st[0]]+')</button>'; }).join('')
        + '</div>';
      h += '<div id="svLista">'+(vis.map(function(c){ var st = c.status || 'triagem';
          return '<div class="sv-card"><div class="sv-row"><div><b>'+esc(c.nome)+'</b> <span class="sv-badge" style="background:'+stCor(st)+';color:#fff;">'+esc(stRot(st))+'</span> <span class="sv-badge">'+(c.pontos!=null?c.pontos+' pts':'sem nota')+'</span>'
            + '<div style="font-size:12.5px;color:var(--muted,#667);">'+esc(c.vaga||'Vendedora')+(c.contato?' · '+esc(c.contato):'')+' · '+new Date(c.atualizado_em).toLocaleDateString('pt-BR')+'</div></div><button type="button" class="sv-b" data-abrir="'+esc(c.id)+'">Abrir</button></div>'
            + (c.parecer?'<div style="margin-top:8px;font-size:13.5px;line-height:1.45;">'+esc(c.parecer).slice(0,240)+'</div>':'')+'</div>'; }).join('')
        || (L?'<div class="sv-card">'+(filtro?'Nenhuma candidata nesta etapa.':'Nenhuma candidata ainda. Toque em "Nova candidata" para registrar a primeira entrevista.')+'</div>':''))+'</div>';
      return h;
    }
    function ligarLista(){
      raiz.querySelectorAll('[data-f]').forEach(function(b){ b.onclick = function(){ filtro = b.dataset.f; pintar(); }; });
      var n = raiz.querySelector('#svNova'); if(n) n.onclick = function(){ cand = { nome:'', contato:'', vaga:'Vendedora', dados:{ respostas:{}, criterios:{}, experiencia:'', observacoes:'' } }; pintar(); };
      raiz.querySelectorAll('[data-abrir]').forEach(function(b){ b.onclick = function(){ var c = (lista||[]).filter(function(x){ return x.id===b.dataset.abrir; })[0]; if(c){ cand = JSON.parse(JSON.stringify(c)); cand.dados = cand.dados || {}; cand.dados.respostas = cand.dados.respostas || {}; cand.dados.criterios = cand.dados.criterios || {}; pintar(); } }; });
    }
    function todasPerguntas(){ var out = []; BLOCOS.forEach(function(b){ b.q.forEach(function(q){ out.push(q); }); }); ROLE.forEach(function(q){ out.push(q); }); return out; }
    function notaHtml(nome, valor){ return '<span class="sv-nota">'+[1,2,3,4,5].map(function(n){ return '<label><input type="radio" name="'+esc(nome)+'" value="'+n+'"'+(Number(valor)===n?' checked':'')+'><span>'+n+'</span></label>'; }).join('')+'</span>'; }
    function telaFicha(){
      var d = cand.dados, Q = todasPerguntas();
      return '<div class="sv-row" style="margin-bottom:8px;"><button type="button" class="sv-b" id="svVoltar">← Candidatas</button><span style="font-size:12.5px;color:var(--muted,#667);">'+esc(PROIBIDO.split('.')[0])+'.</span></div>'
        + '<div class="sv-card"><h3>Dados</h3><div class="sv-grid"><div><label style="font-size:12.5px;">Nome *</label><input class="sv-in" id="svNome" maxlength="120" value="'+esc(cand.nome)+'"></div><div><label style="font-size:12.5px;">Contato</label><input class="sv-in" id="svContato" maxlength="80" value="'+esc(cand.contato||'')+'"></div><div><label style="font-size:12.5px;">Vaga</label><input class="sv-in" id="svVaga" maxlength="80" value="'+esc(cand.vaga||'Vendedora')+'"></div></div>'
        + '<div style="margin-top:8px;"><label style="font-size:12.5px;display:block;">Etapa do processo</label><select class="sv-in" id="svStatus" style="max-width:260px;">'
        + STATUS.map(function(st){ return '<option value="'+st[0]+'"'+((cand.status||'triagem')===st[0]?' selected':'')+'>'+esc(st[1])+'</option>'; }).join('') + '</select></div>'
        + '<label style="font-size:12.5px;display:block;margin-top:8px;">Experiência (resumo)</label><textarea class="sv-in" id="svExp" maxlength="300" style="min-height:52px;">'+esc(d.experiencia||'')+'</textarea></div>'
        + '<div class="sv-card"><h3>Entrevista: anote e dê nota de 1 a 5</h3>'+Q.map(function(q,i){ var r = d.respostas[i] || {}; return '<div class="sv-q"><b>'+(i+1)+'. '+esc(q)+'</b><textarea data-r="'+i+'" maxlength="600" placeholder="O que ela respondeu">'+esc(r.resposta||'')+'</textarea>'+notaHtml('n'+i, r.nota)+'</div>'; }).join('')+'</div>'
        + '<div class="sv-card"><h3>Avaliação geral (1 a 5)</h3><div class="sv-grid">'+CRITERIOS.map(function(c,i){ return '<div><div style="font-size:13px;font-weight:600;">'+esc(c)+'</div>'+notaHtml('c'+i, d.criterios[c])+'</div>'; }).join('')+'</div>'
        + '<label style="font-size:12.5px;display:block;margin-top:10px;">Observações do entrevistador</label><textarea class="sv-in" id="svObs" maxlength="800" style="min-height:70px;">'+esc(d.observacoes||'')+'</textarea></div>'
        + '<div class="sv-card" id="svResultado"><h3>Resultado</h3><div id="svPontos" style="font-size:14px;">'+resumoPontos()+'</div><div id="svParecer" style="margin-top:8px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;">'+esc(cand.parecer||'')+'</div></div>'
        + '<div class="sv-card" id="svPlanoBox"><h3>Primeiros 30 dias</h3><p style="margin:0 0 8px;font-size:13px;color:var(--muted,#667);">Se ela for aprovada, o Vilacinha monta o plano de integração semana a semana, com meta e forma de medir. O plano fica salvo na ficha.</p>'
        + '<button type="button" class="sv-b" id="svPlano">'+((cand.etapas&&cand.etapas.plano)?'Refazer o plano de 30 dias':'Montar plano de 30 dias')+'</button>'
        + '<div id="svPlano30" style="margin-top:10px;">'+planoHtml((cand.etapas||{}).plano)+'</div></div>'
        + '<div class="sv-row"><button type="button" class="sv-b" id="svAnalisar">Pedir parecer ao Vilacinha (IA)</button><span><button type="button" class="sv-b pri" id="svSalvar">Salvar candidata</button> '+(cand.id?'<button type="button" class="sv-b" id="svExcluir" style="color:#b3261e;">Excluir</button>':'')+'</span></div><div id="svMsg" style="margin-top:8px;font-size:13px;"></div>';
    }
    function planoHtml(p){
      if(!p || !(p.semanas||[]).length) return '';
      return (p.semanas||[]).map(function(sm,i){ return '<div class="sv-q"><b>'+esc(sm.titulo||('Semana '+(i+1)))+'</b>'
          + (sm.objetivo?'<div style="font-size:13px;">'+esc(sm.objetivo)+'</div>':'')
          + ((sm.acoes||[]).length?'<ul style="margin:4px 0 0;padding-left:18px;font-size:13px;">'+sm.acoes.map(function(a){ return '<li>'+esc(a)+'</li>'; }).join('')+'</ul>':'')
          + (sm.meta?'<div style="margin-top:4px;font-size:13px;"><b>Meta:</b> '+esc(sm.meta)+'</div>':'')
          + (sm.comoMedir?'<div style="font-size:12.5px;color:var(--muted,#667);"><b>Como medir:</b> '+esc(sm.comoMedir)+'</div>':'')
          + '</div>'; }).join('')
        + ((p.indicadores||[]).length?'<div class="sv-q"><b>Indicadores para acompanhar</b><ul style="margin:4px 0 0;padding-left:18px;font-size:13px;">'+p.indicadores.map(function(x){ return '<li>'+esc(x.nome||'')+(x.alvo?' — alvo: '+esc(x.alvo):'')+'</li>'; }).join('')+'</ul></div>':'')
        + ((p.conversas||[]).length?'<div class="sv-q"><b>Conversas de acompanhamento</b><ul style="margin:4px 0 0;padding-left:18px;font-size:13px;">'+p.conversas.map(function(x){ return '<li>'+esc(x.quando||'')+': '+esc(x.assunto||'')+'</li>'; }).join('')+'</ul></div>':'')
        + ((p.sinaisDeAlerta||[]).length?'<div class="sv-q"><b>Sinais de alerta</b><ul style="margin:4px 0 0;padding-left:18px;font-size:13px;">'+p.sinaisDeAlerta.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul></div>':'');
    }
    function coletar(){
      var d = cand.dados; cand.nome = raiz.querySelector('#svNome').value.trim(); cand.contato = raiz.querySelector('#svContato').value.trim(); cand.vaga = raiz.querySelector('#svVaga').value.trim();
      var stEl = raiz.querySelector('#svStatus'); cand.status = stEl ? stEl.value : (cand.status||'triagem');
      d.experiencia = raiz.querySelector('#svExp').value; d.observacoes = raiz.querySelector('#svObs').value; d.respostas = {}; d.criterios = {};
      raiz.querySelectorAll('[data-r]').forEach(function(t){ var i = t.dataset.r, n = raiz.querySelector('input[name="n'+i+'"]:checked'); if(t.value.trim() || n) d.respostas[i] = { resposta:t.value.trim(), nota:n?Number(n.value):null }; });
      CRITERIOS.forEach(function(c,i){ var n = raiz.querySelector('input[name="c'+i+'"]:checked'); if(n) d.criterios[c] = Number(n.value); });
    }
    function pontos(){
      var d = cand.dados, notas = [], crit = [];
      Object.keys(d.respostas).forEach(function(k){ if(d.respostas[k].nota) notas.push(d.respostas[k].nota); });
      Object.keys(d.criterios).forEach(function(k){ if(d.criterios[k]) crit.push(d.criterios[k]); });
      var media = function(a){ return a.reduce(function(s,x){ return s+x; },0)/a.length; };
      if(!notas.length && !crit.length) return null;
      var partes = []; if(notas.length) partes.push(media(notas)); if(crit.length) partes.push(media(crit));
      return Math.round(media(partes)/5*100);
    }
    function resumoPontos(){
      var p = pontos(); if(p==null) return '<span style="color:var(--muted,#667);">Dê as notas para ver a pontuação (0 a 100).</span>';
      var cor = p>=80?'#1f9a55':p>=60?'#a8803a':'#c62828', rot = p>=80?'Forte aderência ao perfil':p>=60?'Boa, vale uma segunda conversa':'Aderência baixa agora';
      return '<b style="font-size:22px;color:'+cor+';">'+p+' pontos</b> · '+rot;
    }
    function ligarFicha(){
      var msg = function(t, erro){ var m = raiz.querySelector('#svMsg'); m.style.color = erro?'#c62828':'#1f7a47'; m.textContent = t; };
      raiz.querySelector('#svVoltar').onclick = function(){ cand = null; pintar(); };
      raiz.addEventListener('change', function(){ if(!cand) return; coletar(); var p = raiz.querySelector('#svPontos'); if(p) p.innerHTML = resumoPontos(); });
      raiz.querySelector('#svAnalisar').onclick = async function(){
        coletar(); var b = this; b.disabled = true; msg('O Vilacinha está lendo as anotações…');
        var resp = []; var Q = todasPerguntas(); Object.keys(cand.dados.respostas).forEach(function(k){ resp.push({ pergunta:Q[k], resposta:cand.dados.respostas[k].resposta, nota:cand.dados.respostas[k].nota }); });
        var r = await chamar(senha, { op:'rhAvaliar', candidata:{ nome:cand.nome, experiencia:cand.dados.experiencia, observacoes:cand.dados.observacoes + ' | Avaliação geral: ' + JSON.stringify(cand.dados.criterios) }, respostas:resp });
        b.disabled = false;
        if(!r || !r.ok || !r.avaliacao || !r.avaliacao.parecer){ msg((r&&r.error)||'Não consegui gerar o parecer agora.', true); return; }
        var a = r.avaliacao;
        cand.parecer = (a.recomendacao ? 'Recomendação: '+a.recomendacao+'\n' : '') + a.parecer + ((a.pontosFortes||[]).length ? '\nPontos fortes: '+a.pontosFortes.join('; ') : '') + ((a.atencao||[]).length ? '\nAtenção: '+a.atencao.join('; ') : '') + ((a.proximosPassos||[]).length ? '\nPróximos passos: '+a.proximosPassos.join('; ') : '') + '\n(Parecer de apoio da IA. A decisão é sua.)';
        raiz.querySelector('#svParecer').textContent = cand.parecer; msg('Parecer pronto. Clique em Salvar para guardar.');
      };
      raiz.querySelector('#svSalvar').onclick = async function(){
        coletar(); if(!cand.nome){ msg('Informe o nome da candidata.', true); return; }
        var b = this; b.disabled = true;
        var r = await chamar(senha, { op:'rhSalvar', candidata:{ id:cand.id, nome:cand.nome, contato:cand.contato, vaga:cand.vaga, dados:cand.dados, pontos:pontos(), parecer:cand.parecer||'', status:cand.status||'triagem', etapas:cand.etapas||{} } });
        b.disabled = false;
        if(!r || !r.ok){ msg((r&&r.error)||'Não consegui salvar.', true); return; }
        cand.id = r.id; lista = null; msg('Candidata salva.'); await carregarListaSilenciosa();
      };
      var bp = raiz.querySelector('#svPlano');
      if(bp) bp.onclick = async function(){
        coletar(); var b2 = this; b2.disabled = true;
        var box2 = raiz.querySelector('#svPlano30'); box2.innerHTML = '<div style="color:var(--muted,#667);">O Vilacinha está montando o plano…</div>';
        var cr = cand.dados.criterios || {}, fortes = [], aten = [];
        Object.keys(cr).forEach(function(k){ if(cr[k] >= 4) fortes.push(k); else if(cr[k] <= 2) aten.push(k); });
        var r = await chamar(senha, { op:'rhPlano', candidata:{ nome:cand.nome, experiencia:cand.dados.experiencia, fortes:fortes.join(', '), atencao:aten.join(', ') } });
        b2.disabled = false;
        if(!r || !r.ok || !r.plano || !(r.plano.semanas||[]).length){ box2.innerHTML = '<div style="color:#c62828;">'+esc((r&&r.error)||'Não consegui montar agora.')+'</div>'; return; }
        cand.etapas = cand.etapas || {}; cand.etapas.plano = r.plano;
        box2.innerHTML = planoHtml(r.plano); msg('Plano pronto. Clique em Salvar para guardar na ficha.');
      };
      var ex = raiz.querySelector('#svExcluir');
      if(ex) ex.onclick = async function(){
        if(!confirm('Excluir a ficha de '+cand.nome+' definitivamente? Isso não pode ser desfeito.')) return;
        var r = await chamar(senha, { op:'rhExcluir', id:cand.id });
        if(!r || !r.ok){ msg((r&&r.error)||'Não consegui excluir.', true); return; }
        cand = null; lista = null; pintar(); carregarLista();
      };
    }
    async function carregarListaSilenciosa(){ var r = await chamar(senha, { op:'rhListar' }); if(r && r.ok){ lista = r.candidatas; metr = r.metricas; funil = r.funil; } }
    pintar();
  }
  window.SelecaoUI = { render:render };
})();
