/* copiloto.js (22/11/2026) — VILACINHA, o gerente-auxiliar da equipe (masculino). Fica no canto da tela do app (shell index.html) e:
 *  - mostra a meta do dia, os números da pessoa e a comparação com "a melhor da loja" (sem nome);
 *  - lista QUEM CHAMAR HOJE (orçamentos vencendo/parados, aniversariantes, clientes sumidos, pedidos prontos) com a mensagem pronta;
 *  - dá dicas (IA, com o que aprendeu nas conversas do CHAT) e conversa por texto ou voz; lê em voz alta.
 * Dados: Edge Function `copiloto` (op dia / perguntar). Desde a v6 (23/11) o Vilacinha NÃO envia mensagem ao cliente: mostra o telefone, os números e o roteiro para a pessoa LIGAR (ou abrir o WhatsApp dela pelo link).
 * 22/11 (v4): BALÃO POR MÓDULO — ao abrir uma tela (Copiloto.moduloAberto, chamado pelo shell) às vezes aparece uma dica DAQUELA tela, de preferência
 *   uma que a pessoa ainda não viu (máx. 6 balões/dia, 12 min entre eles). BEM-ESTAR — em telas fora de venda/atendimento, em dia com poucas dicas ou
 *   em dia cheio de atendimentos, o Vilacinha pergunta como a pessoa está (resposta clicável, sempre com "prefiro não dizer") e responde com um cuidado
 *   (água, alongar, respirar, sentar um pouco). Só grava com CONSENTIMENTO (perguntado uma vez). A diretoria vê o perfil da equipe no painel.
 * 25/11 (v7, pedido da diretoria): MENOS balão e MAIS variedade — no máximo 3 dicas por dia, 50 min entre elas (cresce se a pessoa ignora), dica só da
 *   tela aberta, sem repetir (21 dias) nem dica parecida (10 dias), banco próprio de dicas por tela com ícone; ao iniciar só aparece se tiver algo bom;
 *   bem-estar: 16 perguntas que rodam entre os dias, nunca a mesma duas vezes seguidas, e param por uns dias se a pessoa não responde.
 * Shell: Copiloto.iniciar({ senha, user, lojaNome }) ao entrar; Copiloto.parar() ao sair. Oficina não tem copiloto. Fora da produção a função não existe → some sozinho. */
(function(){
  'use strict';
  if(window.Copiloto) return;
  var S = { senha:null, user:null, lojaNome:'', dia:null, hist:[], aberto:false, balaoTimer:null, rodizio:0, falando:false, licoes:null, pd:null, prog:null, recados:[] };
  var URL_FN = function(n){ return (window.SUPABASE_URL||'') + '/functions/v1/' + n; };
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function ic(n,t){ try{ return window.Icone ? window.Icone(n,{tam:t||16}) : ''; }catch(e){ return ''; } }
  function brl(v){ return 'R$ ' + (Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function brl0(v){ return 'R$ ' + Math.round(Number(v)||0).toLocaleString('pt-BR'); }
  function hojeISO(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v); }catch(e){ return null; } }
  function toast(m){ try{ if(typeof window.showToast==='function') return window.showToast(m); }catch(e){} }
  async function api(body){
    try{ var r = await fetch(URL_FN('copiloto'), { method:'POST', headers:{ 'Content-Type':'application/json', apikey:window.SUPABASE_ANON_KEY, Authorization:'Bearer '+window.SUPABASE_ANON_KEY }, body: JSON.stringify(Object.assign({ senha:S.senha }, body)) });
      if(r.status===404) return { ok:false, sem:true }; return await r.json(); }
    catch(e){ return { ok:false, error:'Sem conexão.' }; }
  }

  async function apiS(body){
    try{ var r = await fetch(URL_FN('copiloto-saber'), { method:'POST', headers:{ 'Content-Type':'application/json', apikey:window.SUPABASE_ANON_KEY, Authorization:'Bearer '+window.SUPABASE_ANON_KEY }, body: JSON.stringify(Object.assign({ senha:S.senha }, body)) });
      if(r.status===404) return { ok:false, sem:true }; return await r.json(); }
    catch(e){ return { ok:false, error:'Sem conexão.' }; }
  }

  /* 23/11: função irmã `copiloto-extra` — Vilacinha da OFICINA (sem nenhum dado de venda) e os RECADOS. */
  async function apiX(body){
    try{ var r = await fetch(URL_FN('copiloto-extra'), { method:'POST', headers:{ 'Content-Type':'application/json', apikey:window.SUPABASE_ANON_KEY, Authorization:'Bearer '+window.SUPABASE_ANON_KEY }, body: JSON.stringify(Object.assign({ senha:S.senha }, body)) });
      if(r.status===404) return { ok:false, sem:true }; return await r.json(); }
    catch(e){ return { ok:false, error:'Sem conexão.' }; }
  }
  function ehOficina(){ return !!(S.user && S.user.nivel === 'oficina'); }
  /* 23/11: função ADMINISTRATIVO (marca em permissoes._perfil). Para ela o Vilacinha NÃO fala de venda, meta, ranking nem quiz:
   * vira o auxiliar de CONTROLES — fiscal, caixa, vias e DP — com a mesma lista dos Avisos (avisos-core.js). */
  function ehAdm(){ return !!(S.user && S.user.permissoes && S.user.permissoes._perfil === 'administrativo'); }
  async function carregarControles(){
    if(!ehAdm() || !window.AvisosCore || typeof window.gatewayCall !== 'function') return;
    try{ var cfg = {}; try{ cfg = config || {}; }catch(e){}
      S.ctrl = await AvisosCore.calcular({ gatewayCall: window.gatewayCall, config: cfg, user: S.user }); }catch(e){ console.error(e); }
    pintarFab(); if(S.aberto) desenhar();
  }
  function ctrlUrgentes(){ return (S.ctrl||[]).filter(function(a){ return a.nivel==='danger'; }).length; }
  function cartaoControles(){
    var L = S.ctrl;
    if(!L) return '<div class="cp-card"><h4>'+ic('cadeado',14)+'Controles de hoje</h4><div class="cp-meta-s">Conferindo fiscal, caixa, vias e DP…</div></div>';
    if(!L.length) return '<div class="cp-card"><h4>'+ic('cadeado',14)+'Controles de hoje</h4><div class="cp-meta-s">Tudo em dia: nenhum controle pendente agora.</div></div>';
    var grupos = [];
    L.forEach(function(a){ var k = (a.area||a.modulo||'')+' · '+a.grupo; var g = grupos.filter(function(x){ return x.k===k; })[0]; if(!g){ g = { k:k, nivel:a.nivel, itens:[] }; grupos.push(g); } g.itens.push(a); });
    var h = '<div class="cp-card"><h4>'+ic('cadeado',14)+'Controles de hoje ('+L.length+')</h4><div class="cp-meta-s" style="margin-bottom:6px;">'+(ctrlUrgentes() ? '<b>'+ctrlUrgentes()+' urgente(s)</b> — comece por eles.' : 'Nada urgente. Confira com calma.')+'</div>';
    grupos.forEach(function(g, gi){
      h += '<details'+(gi===0?' open':'')+' style="margin-top:6px;"><summary style="cursor:pointer;font-weight:700;font-size:12.5px;color:'+(g.nivel==='danger'?'#b3261e':'#8a3560')+';">'+esc(g.k)+' ('+g.itens.length+')</summary>'
        + g.itens.slice(0,6).map(function(a){ return '<div class="cp-dica"><span class="n">•</span><span><b>'+esc(a.titulo)+'</b><br><small>'+esc(a.sub||'')+'</small> <button type="button" class="cp-b" data-cp-ctrl="'+esc((a.abrir&&a.abrir.alvo)||'avisos')+'" style="margin-left:4px;">Abrir</button></span></div>'; }).join('')
        + (g.itens.length>6 ? '<div class="cp-meta-s">e mais '+(g.itens.length-6)+' — veja todos em Avisos.</div>' : '') + '</details>';
    });
    return h + '<div style="margin-top:8px;"><button type="button" class="cp-b pri" data-cp-ctrl="avisos">Ver todos nos Avisos</button></div></div>';
  }
  function desenharAdm(c){
    var h = cartaoRecados() + cartaoControles();
    h += '<div class="cp-card"><h4>'+ic('mensagem',14)+'Converse com o Vilacinha</h4><div class="cp-chat" id="cpChat">' + (S.hist.length ? S.hist.map(function(m){ return '<div class="cp-msg '+(m.de==='ia'?'ia':'eu')+'">'+(m.de==='ia' ? esc(m.texto).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|\n)\s*[*-]\s+/g,'$1• ') : esc(m.texto))+'</div>'; }).join('') : '<div class="cp-meta-s">Pergunte sobre rotina da administração: nota de devolução, fechamento de caixa, conciliação, vias, DP.</div>') + '</div></div>';
    c.innerHTML = h;
    ligarRecados(c);
    c.querySelectorAll('[data-cp-ctrl]').forEach(function(b){ b.onclick = function(){ try{ if(typeof selecionarModulo === 'function'){ selecionarModulo(b.dataset.cpCtrl); fecharPainel(); } }catch(e){ console.error(e); } }; });
  }
  /** Contexto curto mandado junto da pergunta (o servidor corta em 600 caracteres): responde como auxiliar administrativo, não como coach de vendas. */
  function comContextoAdm(texto){
    var ctx = '\n[Contexto: sou do ADMINISTRATIVO da Vilaça Joias (não vendo, sem meta). Responda sobre rotina administrativa: fiscal, caixa, conciliação, vias, DP. Sem dicas de venda.]';
    return (texto + ctx).slice(0, 600).length > texto.length ? (texto + ctx).slice(0, 600) : texto;
  }
  function dataBR(iso){ var p = String(iso||'').slice(0,10).split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : String(iso||''); }

  async function apiD(body){
    try{ var r = await fetch(URL_FN('copiloto-dia'), { method:'POST', headers:{ 'Content-Type':'application/json', apikey:window.SUPABASE_ANON_KEY, Authorization:'Bearer '+window.SUPABASE_ANON_KEY }, body: JSON.stringify(Object.assign({ senha:S.senha }, body)) });
      if(r.status===404) return { ok:false, sem:true }; return await r.json(); }
    catch(e){ return { ok:false, error:'Sem conexão.' }; }
  }

  /* telefone: mostra bonito e monta o link de ligação (nunca envia nada sozinho) */
  function soDig(t){ return String(t==null?'':t).replace(/\D/g,''); }
  function telNacional(t){ var d = soDig(t); if(d.length > 11 && d.slice(0,2) === '55') d = d.slice(2); return d; }
  function telBonito(t){ var d = telNacional(t); if(d.length < 10) return d || '—';
    return '(' + d.slice(0,2) + ') ' + (d.length === 11 ? d.slice(2,7) + '-' + d.slice(7) : d.slice(2,6) + '-' + d.slice(6)); }
  function telLink(t){ var d = telNacional(t); return d.length >= 10 ? 'tel:+55' + d : ''; }
  function telWa(t){ var d = telNacional(t); return d.length >= 10 ? 'https://wa.me/55' + d : ''; }

  /* elogio DE VERDADE: usa os números dela, não elogio vazio */
  function elogio(){
    var d = S.dia || {}, eu = d.eu || {}, m = d.meta || {}, q = S.pd || {}, L = [];
    if(d.oficina){
      var pr = d.producao || {};
      if(!pr.atrasadas) L.push('E olha: nenhuma via atrasada na bancada. Isso é controle de verdade.');
      if((pr.prontasNaOficina||0) >= 1) L.push('Você já deixou ' + pr.prontasNaOficina + ' via(s) prontas para a loja. Bom ritmo!');
      if((q.sequencia||0) >= 3) L.push('E são ' + q.sequencia + ' dias seguidos respondendo a pergunta do dia. Isso é disciplina.');
      if((pr.comCravacao||0) >= 1) L.push('Serviço com cravação na mesa pede mão firme — e a sua é.');
      L.push('Peça bem acabada é o que faz o cliente voltar. Isso você entrega.');
      return L[0];
    }
    if(eu.posicao === 1 && (eu.vendas||0) > 0) L.push('E olha só: você está em 1º na loja este mês. Isso não é sorte, é atendimento.');
    if(m.minha && m.minha.atingida) L.push('Sua meta do mês já está batida. Daqui para frente é lucro e confiança.');
    if((d.hojeAtendimentos||0) >= 3) L.push('Você já atendeu ' + d.hojeAtendimentos + ' pessoas hoje. Que ritmo bom!');
    if((q.sequencia||0) >= 3) L.push('E ainda são ' + q.sequencia + ' dias seguidos respondendo a pergunta do dia. Isso é disciplina.');
    if((eu.vendas||0) >= 1) L.push('No mês já são ' + eu.vendas + ' vendas suas, com ticket médio de ' + brl0(eu.ticketMedio||0) + '. Isso é resultado de verdade.');
    if(eu.posicao && eu.deQuantas > 1 && eu.posicao <= Math.ceil(eu.deQuantas/2) && eu.posicao !== 1) L.push('Você está em ' + eu.posicao + 'º de ' + eu.deQuantas + ' na loja. Está no caminho certo.');
    L.push('Atendimento bom é o que faz a cliente voltar, e isso você tem feito.');
    return L[0];
  }

  /* ícone de ouvir: alto-falante com ondas (anima enquanto fala) */
  function icOuvir(t){
    return '<svg class="cp-som" width="'+t+'" height="'+t+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      +'<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none"/>'
      +'<path class="o1" d="M15.2 9.2a4 4 0 0 1 0 5.6"/><path class="o2" d="M18 6.6a8 8 0 0 1 0 10.8"/></svg>';
  }
  function icMic(t){ return '<svg width="'+t+'" height="'+t+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>'; }

  /* ---------- rosto da Vilacinha (SVG próprio: vinho e dourado) ---------- */
  function rosto(tam, falando){
    return '<svg class="cp-rosto'+(falando?' falando':'')+'" width="'+tam+'" height="'+tam+'" viewBox="0 0 64 64" aria-hidden="true">'
      +'<defs><linearGradient id="cpG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a3560"/><stop offset="1" stop-color="#4d1a33"/></linearGradient>'
      +'<clipPath id="cc"><circle cx="32" cy="32" r="30"/></clipPath></defs>'
      +'<circle cx="32" cy="32" r="31" fill="url(#cpG)" stroke="#d9b26a" stroke-width="2"/>'
      +'<g clip-path="url(#cc)">'
      +'<path d="M6 64c1-10 10-15 26-15s25 5 26 15z" fill="#1c1c22"/>'
      +'<path d="M25 49l7 8 7-8" fill="#2c2c34"/>'
      +'<path d="M25 49l7 8 7-8" fill="none" stroke="#d9b26a" stroke-width="1.1" stroke-linejoin="round"/>'
      +'<path d="M27.5 43h9v7c-2 2.4-7 2.4-9 0z" fill="#e5b490"/>'
      +'</g>'
      +'<ellipse cx="18.6" cy="34.5" rx="2.2" ry="3.6" fill="#e8b994"/><ellipse cx="45.4" cy="34.5" rx="2.2" ry="3.6" fill="#e8b994"/>'
      +'<path d="M19.2 28.5c0-9.5 5-15 12.8-15s12.8 5.5 12.8 15v8.5c0 7.6-5.3 12.2-12.8 12.2S19.2 44.6 19.2 37z" fill="#f2c9a5"/>'
      +'<path d="M20.5 40c1 6.6 5.4 9.8 11.5 9.8S42.5 46.6 43.5 40c-2.6 4.6-6.4 6.5-11.5 6.5S23.1 44.6 20.5 40z" fill="#3a2a24" opacity=".16"/>'
      +'<path d="M18.4 31c-.9-9.4 3.6-17.6 13.8-17.6 9.6 0 14.8 6 13.4 17.6-.8-4.8-2.6-7.6-5.2-9.4-5 1.8-12 1.6-17.5-1.6-2.4 2.4-3.9 5.6-4.5 11z" fill="#2a1b17"/>'
      +'<path d="M22.4 19.4c3-4.2 8.4-6.4 14.6-5.6 4.4.6 7.6 2.6 9 5.6-5-2.4-10.6-2.2-15.6-.4-3.2 1.2-5.8 2.4-8 .4z" fill="#3a2722"/>'
      +'<path d="M22.6 29.2c2.2-1.7 5.6-2 8.2-.6" stroke="#2a1b17" stroke-width="2" fill="none" stroke-linecap="round"/>'
      +'<path d="M33.2 28.6c2.6-1.4 6-1.1 8.2.6" stroke="#2a1b17" stroke-width="2" fill="none" stroke-linecap="round"/>'
      +'<ellipse cx="27.2" cy="33.4" rx="2.9" ry="2.2" fill="#fff"/><ellipse cx="36.8" cy="33.4" rx="2.9" ry="2.2" fill="#fff"/>'
      +'<circle cx="27.4" cy="33.5" r="1.7" fill="#6b3f22"/><circle cx="36.6" cy="33.5" r="1.7" fill="#6b3f22"/>'
      +'<circle cx="27.4" cy="33.5" r=".8" fill="#1d120d"/><circle cx="36.6" cy="33.5" r=".8" fill="#1d120d"/>'
      +'<circle cx="27.9" cy="32.9" r=".5" fill="#fff"/><circle cx="37.1" cy="32.9" r=".5" fill="#fff"/>'
      +'<path d="M24.6 35.6q2.6 1.1 5.2 0M34.2 35.6q2.6 1.1 5.2 0" stroke="#c08a68" stroke-width=".7" fill="none" stroke-linecap="round" opacity=".7"/>'
      +'<path d="M32 34.5c-.9 2.4-1.8 3.6-2.5 4.2.9.8 4.1.8 5 0-.7-.6-1.6-1.8-2.5-4.2z" fill="#e0a883"/>'
      +'<g class="cp-boca"><path d="M24.2 40.2c2.2 6.4 13.4 6.4 15.6 0-2.4 1.5-13.2 1.5-15.6 0z" fill="#fff" stroke="#8a3a3a" stroke-width="1" stroke-linejoin="round"/>'
      +'<path d="M25.5 41.1c2.4 1 10.6 1 13 0" stroke="#d6c9c4" stroke-width=".5" fill="none"/></g>'
      +'<path d="M23.2 39.4q-1.2-.4-1.8-1.6M40.8 39.4q1.2-.4 1.8-1.6" stroke="#b9805e" stroke-width=".8" fill="none" stroke-linecap="round"/>'
      +'</svg>';
  }

  var CSS = ''
  +'.cp-fab{position:fixed;right:18px;bottom:18px;z-index:9000;width:62px;height:62px;border-radius:50%;border:0;padding:0;background:none;cursor:pointer;filter:drop-shadow(0 8px 18px rgba(77,26,51,.35));transition:transform .2s;}'
  +'.cp-fab:hover{transform:scale(1.06);} .cp-fab:focus-visible{outline:3px solid #d9b26a;outline-offset:3px;border-radius:50%;}'
  +'.cp-fab .cp-n{position:absolute;top:-2px;right:-2px;min-width:22px;height:22px;border-radius:11px;background:#c62828;color:#fff;font:700 12px/22px Inter,sans-serif;text-align:center;padding:0 5px;border:2px solid #fff;}'
  +'.cp-rosto .cp-boca{transform-origin:32px 41px;} .cp-rosto.falando .cp-boca{animation:cpFala .35s infinite alternate;}'
  +'@keyframes cpFala{from{transform:scaleY(1)}to{transform:scaleY(.4)}}'
  +'.cp-balao{position:fixed;right:90px;bottom:28px;z-index:9001;max-width:min(330px,calc(100vw - 110px));background:var(--t-surface,#fff);color:var(--t-text,#14202b);border:1px solid #d9b26a;border-radius:16px 16px 4px 16px;padding:12px 14px 10px;box-shadow:0 14px 34px -10px rgba(0,0,0,.35);font:14px/1.5 Inter,system-ui,sans-serif;animation:cpEntra .3s ease-out;}'
  +'.cp-balao b.cp-quem{display:block;color:#8a3560;font-size:12px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:2px;}'
  +'.cp-balao .cp-x{position:absolute;top:6px;right:6px;width:28px;height:28px;border:0;border-radius:50%;background:transparent;color:var(--t-text-soft,#667);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;} .cp-balao .cp-x:hover{background:var(--t-surface-2,#eef0f3);} .cp-balao b.cp-quem{padding-right:26px;}'
  +'@media(max-width:760px){.cp-balao .cp-x{top:4px;right:4px;width:40px;height:40px;}}'
  +'.cp-balao .cp-acoes{display:flex;gap:6px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap;}'
  +'.cp-balao .cp-tag{display:inline-flex;gap:5px;align-items:center;font-size:11.5px;font-weight:700;color:#8a3560;background:rgba(138,53,96,.09);border-radius:999px;padding:2px 9px;margin:2px 0 6px;}'
  +'@keyframes cpEntra{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}'
  +'.cp-b{border:1px solid var(--t-line,#dde);background:var(--t-surface,#fff);color:var(--t-text,#14202b);border-radius:9px;padding:6px 11px;font:600 12.5px Inter,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:5px;}'
  +'.cp-b.pri{background:#662344;border-color:#662344;color:#fff;} .cp-b.wa{border-color:#1f9a55;color:#1f9a55;} .cp-b:disabled{opacity:.55;cursor:default;}'
  +'.cp-painel{position:fixed;top:0;right:0;bottom:0;z-index:9002;width:min(420px,100vw);background:var(--t-bg,#f4f6f8);color:var(--t-text,#14202b);box-shadow:-18px 0 40px -12px rgba(0,0,0,.35);display:flex;flex-direction:column;font:14px/1.5 Inter,system-ui,sans-serif;animation:cpPainel .25s ease-out;}'
  +'@keyframes cpPainel{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}'
  +'.cp-topo{display:flex;align-items:center;gap:10px;padding:14px 14px 12px;color:#fff;background:linear-gradient(135deg,#7a2d52,#4d1a33);}'
  +'.cp-topo .cp-nm{flex:1;min-width:0;} .cp-topo .cp-nm b{display:block;font-size:16px;} .cp-topo .cp-nm small{color:#f3dfae;font-size:12px;}'
  +'.cp-topo button{background:rgba(255,255,255,.14);border:0;color:#fff;border-radius:9px;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;}'
  +'.cp-corpo{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:12px;}'
  +'.cp-card{background:var(--t-surface,#fff);border:1px solid var(--t-line,#dde);border-radius:14px;padding:12px 13px;}'
  +'.cp-card h4{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#8a3560;display:flex;align-items:center;gap:6px;}'
  +'.cp-meta-v{font-size:24px;font-weight:800;color:#4d1a33;} .cp-meta-s{font-size:12.5px;color:var(--t-text-soft,#556);}'
  +'.cp-barra{height:10px;border-radius:6px;background:var(--t-surface-2,#eef0f3);overflow:hidden;margin:8px 0 4px;} .cp-barra i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#d9b26a,#a8803a);}'
  +'.cp-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;} .cp-num{background:var(--t-surface-2,#f4f6f8);border-radius:10px;padding:7px 8px;text-align:center;}'
  +'.cp-num b{display:block;font-size:15px;} .cp-num small{font-size:10.5px;color:var(--t-text-soft,#556);display:block;line-height:1.3;} .cp-num em{display:block;font-style:normal;font-size:10.5px;color:#a8803a;font-weight:700;}'
  +'.cp-dica{display:flex;gap:8px;padding:8px 0;border-top:1px dashed var(--t-line,#dde);} .cp-dica:first-of-type{border-top:0;padding-top:0;} .cp-dica span.n{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#f3dfae;color:#4d1a33;font-weight:800;font-size:12px;display:inline-flex;align-items:center;justify-content:center;}'
  +'.cp-cli{border:1px solid var(--t-line,#dde);border-left:4px solid var(--cc,#8a3560);border-radius:10px;padding:8px 10px;margin-top:8px;} .cp-cli b{font-size:13.5px;} .cp-cli .m{font-size:12.5px;color:var(--t-text-soft,#556);} .cp-cli .cp-acoes{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;}'
  +'.cp-cli.orcamento{--cc:#8a4fd1;} .cp-cli.aniversario{--cc:#d9b26a;} .cp-cli.retorno{--cc:#1c6fd1;} .cp-cli.retirada{--cc:#1f9a55;}'
  +'.cp-chat{display:flex;flex-direction:column;gap:8px;} .cp-msg{max-width:90%;padding:8px 11px;border-radius:12px;font-size:13.5px;white-space:pre-wrap;} .cp-msg.eu{align-self:flex-end;background:#662344;color:#fff;} .cp-msg.ia{align-self:flex-start;background:var(--t-surface-2,#f4f6f8);border:1px solid var(--t-line,#dde);}'
  +'.cp-form{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--t-line,#dde);background:var(--t-surface,#fff);} .cp-form textarea{flex:1;resize:none;height:42px;border:1px solid var(--t-line-strong,#99a);border-radius:10px;padding:10px 11px;font:inherit;background:var(--t-surface,#fff);color:inherit;}'
  +'.cp-form button{width:42px;height:42px;border-radius:10px;border:0;background:#662344;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;} .cp-form button.mic{background:var(--t-surface-2,#eef0f3);color:#662344;} .cp-form button.mic.on{background:#c62828;color:#fff;}'
  +'.cp-rank{width:100%;border-collapse:collapse;font-size:12.5px;} .cp-rank td{padding:4px 2px;border-top:1px solid var(--t-line,#dde);} .cp-rank td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}'
  +'.cp-ov{position:fixed;inset:0;z-index:9100;background:rgba(10,20,30,.45);display:flex;align-items:center;justify-content:center;padding:14px;} .cp-modal{background:var(--t-surface,#fff);color:var(--t-text,#14202b);border-radius:14px;max-width:460px;width:100%;padding:16px;font:14px/1.5 Inter,sans-serif;} .cp-modal textarea{width:100%;box-sizing:border-box;min-height:130px;border:1px solid var(--t-line-strong,#99a);border-radius:10px;padding:10px;font:inherit;background:var(--t-surface,#fff);color:inherit;}'
  +'.cp-ops{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;} .cp-ops button{border:1px solid #d9b26a;background:#fffaf0;color:#4d1a33;border-radius:999px;padding:6px 11px;font:600 12.5px Inter,sans-serif;cursor:pointer;} .cp-ops button:hover{background:#f3dfae;} .cp-ops button.neutro{border-color:var(--t-line,#dde);background:var(--t-surface,#fff);color:var(--t-text-soft,#556);}'
  +'.cp-be{border:1px solid var(--t-line,#dde);border-radius:10px;padding:8px 10px;margin-top:8px;} .cp-be b{font-size:13.5px;} .cp-be .m{font-size:12px;color:var(--t-text-soft,#556);} .cp-be .r{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;} .cp-be .r span{font-size:11.5px;background:var(--t-surface-2,#f4f6f8);border-radius:6px;padding:1px 6px;}'
  +'.cp-be .r span.ruim{background:#fde2e2;color:#8a1c1c;} .cp-be .r span.bom{background:#e3f4e9;color:#1f6b3a;} .cp-be details{margin-top:4px;font-size:12px;}'
  +'.cp-ouvir{background:#fffaf0;border-color:#d9b26a;color:#4d1a33;padding:7px 12px 7px 9px;} .cp-ouvir.tocando{background:#662344;border-color:#662344;color:#fff;}'
  +'.cp-som .o1,.cp-som .o2{opacity:1;} .tocando .cp-som .o1{animation:cpOnda 1s infinite;} .tocando .cp-som .o2{animation:cpOnda 1s .25s infinite;}'
  +'@keyframes cpOnda{0%,100%{opacity:.25}50%{opacity:1}}'
  +'.cp-topo .cp-ler.tocando{background:#d9b26a;color:#4d1a33;}'
  +'.cp-fab{bottom:calc(18px + env(safe-area-inset-bottom));right:calc(18px + env(safe-area-inset-right));}'
  +'@media(max-width:760px){'
  +'.cp-fab{right:calc(12px + env(safe-area-inset-right));bottom:calc(14px + env(safe-area-inset-bottom));width:56px;height:56px;-webkit-tap-highlight-color:transparent;}'
  /* balão vira cartão ancorado embaixo, acima da carinha, largura total */
  +'.cp-balao{left:12px;right:12px;bottom:calc(80px + env(safe-area-inset-bottom));max-width:none;border-radius:18px;padding:14px 14px 12px;font-size:15px;box-shadow:0 18px 40px -12px rgba(0,0,0,.45);}'
  +'.cp-balao .cp-acoes{justify-content:stretch;} .cp-balao .cp-acoes .cp-b{flex:1 1 auto;justify-content:center;min-height:44px;font-size:14px;}'
  +'.cp-b{min-height:40px;}'
  /* painel vira tela cheia (folha) com área segura */
  +'.cp-painel{width:100vw;height:100vh;height:100dvh;top:0;box-shadow:none;animation:cpSobe .25s ease-out;}'
  +'@keyframes cpSobe{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}'
  +'.cp-topo{padding:calc(12px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) 12px calc(12px + env(safe-area-inset-left));}'
  +'.cp-topo button{width:44px;height:44px;border-radius:12px;}'
  +'.cp-corpo{padding:12px calc(12px + env(safe-area-inset-right)) 16px calc(12px + env(safe-area-inset-left));-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}'
  +'.cp-card{padding:13px;} .cp-meta-v{font-size:26px;}'
  +'.cp-nums{gap:5px;} .cp-num{padding:7px 4px;} .cp-num b{font-size:14px;}'
  +'.cp-cli{padding:10px 11px;} .cp-cli .cp-acoes .cp-b{flex:1 1 130px;justify-content:center;min-height:44px;}'
  +'.cp-msg{max-width:94%;font-size:14.5px;}'
  /* barra de digitar: 16px evita o zoom do iPhone; alvos de 46px */
  +'.cp-form{padding:10px calc(12px + env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));gap:8px;}'
  +'.cp-form textarea{font-size:16px;height:46px;padding:11px 12px;} .cp-form button{width:46px;height:46px;border-radius:12px;flex-shrink:0;}'
  +'.cp-ops button{min-height:42px;padding:8px 13px;font-size:14px;}'
  +'.cp-ov{align-items:flex-end;padding:0;} .cp-modal{max-width:none;border-radius:20px 20px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));max-height:92dvh;overflow:auto;} .cp-modal textarea{font-size:16px;}'
  +'.cp-rank{font-size:13px;} .cp-be .r span{font-size:12px;}'
  +'}'
  +'@media(max-width:760px) and (max-height:480px){.cp-balao{bottom:12px;right:84px;left:12px;}}'
  +'.cp-chips{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0 2px;} .cp-chips span{font-size:11.5px;background:var(--t-surface-2,#f4f6f8);border-radius:6px;padding:2px 7px;}'
  +'.cp-tag{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 7px;border-radius:999px;background:var(--cc,#8a3560);color:#fff;margin-left:6px;vertical-align:1px;}'
  +'a.cp-b{text-decoration:none;} .cp-b.fone{font-variant-numeric:tabular-nums;}'
  +'.cp-cli details{margin-top:6px;} .cp-cli summary{cursor:pointer;font-weight:700;font-size:12.5px;color:#8a3560;} .cp-cli ol{margin:6px 0 0;padding-left:18px;} .cp-cli ol li{margin:4px 0;font-size:12.5px;line-height:1.45;}'
  +'.cp-deg{display:flex;gap:8px;align-items:flex-start;padding:7px 2px;border-top:1px dashed var(--t-line,#dde);font-size:12.5px;line-height:1.4;} .cp-deg:first-of-type{border-top:0;}'
  +'.cp-deg .mk{width:20px;flex-shrink:0;text-align:center;font-weight:800;color:#a8803a;} .cp-deg.ok{opacity:.6;} .cp-deg.ok .mk{color:#1f9a55;}'
  +'.cp-deg.alvo{background:#fffaf0;border:1px solid #d9b26a;border-radius:9px;padding:8px;margin-top:4px;}'
  +'.cp-placar{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px dashed var(--t-line,#dde);}'
  +'@media print{.cp-fab,.cp-balao,.cp-painel{display:none!important;}}'
  +'@media (prefers-reduced-motion:reduce){.cp-balao,.cp-painel{animation:none;} .cp-rosto.falando .cp-boca{animation:none;}}';
  function css(){ if(document.getElementById('cpCss')) return; var s=document.createElement('style'); s.id='cpCss'; s.textContent=CSS; document.head.appendChild(s); }

  /* ---------- voz ---------- */
  function falar(txt){
    try{
      if(!window.speechSynthesis) return toast('Este aparelho não lê em voz alta.');
      var jaFalando = S.falando; speechSynthesis.cancel();
      if(jaFalando){ S.falando = false; pintarFab(); return; }   // 2º toque = parar
      var u = new SpeechSynthesisUtterance(String(txt||'').replace(/[*_#]/g,''));
      u.lang = 'pt-BR'; u.rate = 1.03;
      var v = speechSynthesis.getVoices().find(function(x){ return /pt(-|_)BR/i.test(x.lang); }); if(v) u.voice = v;
      S.falando = true; pintarFab();
      u.onend = u.onerror = function(){ S.falando = false; pintarFab(); };
      speechSynthesis.speak(u);
    }catch(e){}
  }
  function ouvir(botao, aoTexto){
    var R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!R) return toast('Este navegador não ouve. Use o Chrome ou digite.');
    var r = new R(); r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 1;
    botao.classList.add('on');
    r.onresult = function(e){ var t = e.results[0][0].transcript; aoTexto(t); };
    r.onend = function(){ botao.classList.remove('on'); };
    r.onerror = function(){ botao.classList.remove('on'); };
    r.start();
  }

  /* ---------- botão flutuante e balão ---------- */
  function pintarFab(){
    document.querySelectorAll('.cp-ouvir,.cp-ler').forEach(function(x){ x.classList.toggle('tocando', !!S.falando); var sp=x.querySelector('span'); if(sp) sp.textContent = S.falando ? 'Parar' : 'Ouvir'; });
    var b = document.getElementById('cpFab'); if(!b) return;
    var nRec = (S.recados || []).length;
    var n = nRec || (ehAdm() ? (S.ctrl||[]).length : (S.dia && S.dia.vendaAtiva ? S.dia.vendaAtiva.length : 0));
    b.innerHTML = rosto(b.offsetWidth || 62, S.falando) + (n ? '<span class="cp-n" aria-hidden="true">'+n+'</span>' : '');
    b.title = 'Vilacinha, seu gerente-auxiliar' + (nRec ? ' — ' + nRec + ' recado(s) para você' : n ? (ehAdm() ? ' — ' + n + ' controle(s) para conferir' : ' — ' + n + ' clientes para chamar hoje') : '');
    b.setAttribute('aria-label', b.title);
  }
  function fecharBalao(){ var x = document.getElementById('cpBalao'); if(x) x.remove(); }
  /* 24/11: o aviso do SISTEMA (toast "#toast" lá do shell) tem prioridade sobre o balão do Vilacinha — não pode ficar
   * um encavalado no outro. Se o toast está na tela, o balão espera a vez; se o toast aparecer com o balão já aberto,
   * o balão fecha na hora pro aviso do sistema aparecer sozinho. */
  var _toastExternoAteMs = 0;   // 24/11: toast de dentro de um módulo (iframe) avisou pelo postMessage (ver tema.js)
  try{ window.addEventListener('message', function(e){ if(e.data && e.data.type==='vilacaToastSistema'){ _toastExternoAteMs = Date.now() + 3600; fecharBalao(); } }); }catch(e){}
  function toastSistemaAtivo(){ try{ var t = document.getElementById('toast'); return !!(t && t.classList.contains('show')) || Date.now() < _toastExternoAteMs; }catch(e){ return false; } }
  var _obsToastSistema = null;
  function vigiarToastSistema(){
    if(_obsToastSistema || typeof MutationObserver === 'undefined') return;
    var t = document.getElementById('toast'); if(!t) return;
    _obsToastSistema = new MutationObserver(function(){ if(toastSistemaAtivo()) fecharBalao(); });
    _obsToastSistema.observe(t, { attributes:true, attributeFilter:['class'] });
  }
  function balao(html, acoes, semPadrao, fechaEm){
    if(S.aberto){ fecharBalao(); return null; }
    // 24/11: aviso do sistema tem prioridade — se um toast está na tela agora, o balão espera ele sumir pra aparecer.
    if(toastSistemaAtivo()){
      clearTimeout(S._balaoAdiado);
      S._balaoAdiado = setTimeout(function(){ balao(html, acoes, semPadrao, fechaEm); }, 350);
      return null;
    }
    /* se o balão já está na tela (pergunta → resposta), troca o conteúdo NO PRÓPRIO balão */
    var d = document.getElementById('cpBalao'), novo = !d;
    if(novo){ d = document.createElement('div'); d.id = 'cpBalao'; d.className = 'cp-balao'; d.setAttribute('role','status'); }
    try{ speechSynthesis.cancel(); S.falando = false; }catch(e){}
    d.innerHTML = '<button type="button" class="cp-x" data-cp="x" title="Fechar" aria-label="Fechar">'+ic('x',14)+'</button><b class="cp-quem">Vilacinha</b>' + html + '<div class="cp-acoes">' + (acoes||'') + '<button type="button" class="cp-b cp-ouvir" data-cp="ouvir" title="Ouvir esta dica" aria-label="Ouvir esta dica">'+icOuvir(18)+'<span>Ouvir</span></button>' + (semPadrao ? '<button type="button" class="cp-b" data-cp="depois">Fechar</button>' : '<button type="button" class="cp-b" data-cp="depois">Agora não</button><button type="button" class="cp-b pri" data-cp="abrir">Ver meu dia</button>') + '</div>';
    if(novo) document.body.appendChild(d);
    d.querySelector('[data-cp="x"]').onclick = fecharBalao;
    d.querySelector('[data-cp="depois"]').onclick = function(){ fecharBalao(); if(!semPadrao) ls(chave('pausa'), String(Date.now())); };
    var ab = d.querySelector('[data-cp="abrir"]'); if(ab) ab.onclick = function(){ fecharBalao(); abrirPainel(); };
    d.querySelector('[data-cp="ouvir"]').onclick = function(){ falar((d.querySelector('.cp-txt')||d).textContent.replace(/^Vilacinha/,'')); };
    clearTimeout(S.balaoTimer); S.balaoTimer = setTimeout(fecharBalao, fechaEm || (semPadrao ? 60000 : 25000));
    return d;
  }
  /** Loja escolhida no seletor do app (shell). */
  function lojaShell(){ try{ return (typeof lojaAtual !== 'undefined' && lojaAtual) || ''; }catch(e){ return ''; } }
  function chave(k){ return 'copiloto_' + k + '_' + (S.user && S.user.id) + '_' + hojeISO(); }

  /** Saudação do dia (1x por dia, ao entrar). As outras dicas vêm por módulo (moduloAberto). */
  function talvezDica(){
    if(!S.dia || S.aberto || document.hidden) return;
    if(ehAdm()){   // 23/11: saudação do administrativo = controles do dia (1x por dia)
      if(!S.ctrl || ls(chave('n'))) return; ls(chave('n'), '1');
      balao('<div class="cp-txt">' + esc(S.dia.saudacao||'Bom dia!') + ' ' + (S.ctrl.length ? 'Hoje há <b>' + S.ctrl.length + ' controle(s)</b> para conferir' + (ctrlUrgentes() ? ', <b>' + ctrlUrgentes() + ' urgente(s)</b>.' : '.') : 'Controles em dia: nada pendente agora.') + '</div>', '<button type="button" class="cp-b" data-cp="abrir">Ver</button>', true, 25000);
      return;
    }
    /* v7 (25/11, pedido da diretoria): ao iniciar o app o Vilacinha só aparece se tiver algo que VALE a pena
       (clientes para ligar, a meta do dia ou uma dica que a pessoa ainda não viu), e o assunto muda de um dia
       para o outro. Sem nada bom, não aparece. */
    if(ls(chave('n'))) return;
    var d = S.dia, va = d.vendaAtiva || [], m = d.meta || {}, dia = Math.floor(Date.now() / 86400000), op = [];
    if(va.length){
      var nome1 = esc(String((va[0] && va[0].cliente) || '').split(' ')[0]);
      op.push({ tag:['📞','Clientes para hoje'], html: variar([
        'Separei <b>' + va.length + ' cliente(s)</b> para você ligar hoje.' + (nome1 ? ' Que tal começar por <b>' + nome1 + '</b>?' : ''),
        'Tem <b>' + va.length + ' cliente(s)</b> esperando um contato seu hoje. Uma ligação curta já reabre a conversa.',
        (nome1 ? '<b>' + nome1 + '</b> e mais ' + Math.max(0, va.length - 1) + ' cliente(s) estão na sua lista de hoje.' : 'Sua lista de hoje tem <b>' + va.length + ' cliente(s)</b>.') + ' O melhor horário para ligar costuma ser antes do almoço.' ], dia) });
    }
    if(m.metaMes > 0 && m.hoje > 0){
      op.push({ tag:['🎯','Sua meta'], html: variar([
        'Sua meta de hoje é <b>' + brl0(m.hoje) + '</b>. Uma venda de cada vez. 💪',
        'Para o mês fechar no alvo, hoje o número é <b>' + brl0(m.hoje) + '</b>. Bora?',
        'Hoje, <b>' + brl0(m.hoje) + '</b> deixa você no ritmo da meta do mês. ✨' ], dia) });
    }
    var boas = dicasNovas('geral');
    if(boas.length){ var dg = boas[Math.floor(Math.random() * boas.length)]; op.push({ tag: ICONE.geral, dica: dg, html: esc(dg) }); }
    if(!op.length) return;
    var e = op[dia % op.length];
    ls(chave('n'), '1'); ls(chave('ult'), String(Date.now()));
    if(e.dica) marcarVista(e.dica);
    balaoDica(tagHtml(e.tag) + '<div class="cp-txt">' + esc(d.saudacao || 'Olá!') + ' ' + e.html + '</div>');
  }

  /* ---------- v4: balão por MÓDULO ---------- */
  var VENDA_MODS = ['venda','pedido','orcamento','chat'];
  function chaveModulo(mod, sub){
    if(mod==='pdvg') return ({ pdv:'venda', reserva:'venda', os:'pedido', orc:'orcamento', resumo:'adm' })[sub] || 'venda';
    if(mod==='atendimento') return 'chat';
    if(mod==='agenda') return 'agenda';
    if(mod==='dashboard') return 'painel';
    if(mod==='caixa' || mod==='lancamentos' || mod==='config' || mod==='site') return 'adm';
    return 'outros';
  }
  function hashTxt(t){ var h=0; t=String(t); for(var i=0;i<t.length;i++){ h=(h*31 + t.charCodeAt(i))|0; } return String(h); }

  /* ---------- v7 (25/11, pedido da diretoria): MENOS balão e MAIS variedade ----------
     - no máximo 3 dicas por dia, com pelo menos 50 min entre elas ("Depois" = 3 h de pausa);
     - se a pessoa fecha/ignora, o intervalo cresce (50 → 100 → 150 → 200 min) e o limite do dia cai;
     - a dica é SEMPRE da tela que a pessoa abriu (tela sem dica própria não mostra dica genérica);
     - nunca repete: a mesma dica só volta depois de 21 dias, e dica PARECIDA com outra dos últimos 10 dias é pulada;
     - além das dicas do servidor (IA), há um banco próprio de dicas por tela, para não girar sempre as mesmas. */
  var LIM = { porDia:3, gapMin:50, pausaMin:180, repetirDias:21, parecidoDias:10 };
  function uidK(k){ return 'copiloto_' + k + '_' + (S.user && S.user.id); }
  function lerJ(k, padrao){ try{ var v = JSON.parse(ls(k) || 'null'); return v == null ? padrao : v; }catch(e){ return padrao; } }
  function gravarJ(k, v){ ls(k, JSON.stringify(v)); }
  function variar(lista, n){ return lista[Math.abs(n || 0) % lista.length]; }
  function palavras(t){ var o = {}; String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).forEach(function(w){ if(w.length > 3) o[w] = 1; }); return Object.keys(o); }
  function parecido(a, b){ var A = palavras(a), B = palavras(b); if(!A.length || !B.length) return 0; var m = {}, i = 0; B.forEach(function(w){ m[w] = 1; }); A.forEach(function(w){ if(m[w]) i++; }); return i / (A.length + B.length - i); }
  function histDicas(){ return lerJ(uidK('hist'), []); }
  function dicaNova(t){
    var H = histDicas(), ag = Date.now(), h = hashTxt(t);
    for(var i = H.length - 1; i >= 0; i--){
      var x = H[i], dias = (ag - x.t) / 86400000;
      if(x.h === h && dias < LIM.repetirDias) return false;
      if(dias < LIM.parecidoDias && parecido(t, x.s) >= 0.5) return false;
    }
    return true;
  }
  function marcarVista(t){ var H = histDicas(); H.push({ h: hashTxt(t), t: Date.now(), s: String(t).slice(0, 180) }); gravarJ(uidK('hist'), H.slice(-250)); }
  var ICONE = { venda:['💎','Dica de venda'], pedido:['🛠️','Dica de pedido'], orcamento:['📝','Dica de orçamento'], chat:['💬','Dica de atendimento'], agenda:['📅','Dica de agenda'], painel:['📊','Dica do painel'], adm:['🗂️','Dica do dia a dia'], geral:['💡','Dica do dia'] };
  function tagHtml(i){ i = i || ICONE.geral; return '<div class="cp-tag"><span aria-hidden="true">' + i[0] + '</span> ' + esc(i[1]) + '</div>'; }
  /* Banco próprio de dicas por tela (só para quem vende; a Oficina recebe só as dicas dela, vindas do servidor). */
  var BANCO = {
    venda: [
      'Antes de falar de preço, pergunte para quem é a joia e qual é a ocasião. Quem entende o motivo vende a peça certa.',
      'Coloque a peça na mão (ou no dedo) do cliente. Joia se vende no toque, não na vitrine.',
      'Mostre no máximo três opções. Muita escolha cansa e o cliente sai "para pensar".',
      'Depois de dizer o preço, faça silêncio. Quem fala primeiro costuma dar o desconto sem ninguém pedir.',
      'Ofereça o complemento: quem leva o anel pode gostar do brinco do mesmo conjunto.',
      'Confira telefone e data de aniversário no cadastro antes de fechar. É isso que traz o cliente de volta.',
      'Cliente indeciso entre duas peças? Pergunte qual ele usaria amanhã. A resposta costuma decidir.',
      'Conte uma coisa verdadeira sobre a peça: o metal, a pedra, como foi feita. História dá valor.',
      'Na entrega, mostre como guardar e limpar a joia. Cuidado depois da venda vira indicação.',
      'Cliente só olhando? Ofereça uma limpeza de cortesia da joia que ele está usando. A conversa começa sozinha.',
      'Chame o cliente pelo nome pelo menos duas vezes no atendimento. Parece detalhe e muda o clima.',
      'Presente? Pergunte se quer embalagem especial e cartão. O capricho fecha a venda.' ],
    pedido: [
      'Combine a data de entrega com folga. Entregar antes do prazo encanta; atrasar um dia desgasta.',
      'Escreva na via tudo o que foi combinado: medida, gravação, acabamento. O que está escrito a oficina faz igual.',
      'Fotografe a peça do cliente na entrada, na frente dele. Evita dúvida na devolução.',
      'Confirme a medida do aro duas vezes, de preferência no fim do dia, quando o dedo está no tamanho real.',
      'Explique ao cliente o que vai ser feito e o que NÃO vai. Expectativa certa evita retrabalho.',
      'Pedido pronto parado na loja é dinheiro parado. Um contato hoje costuma resolver a retirada.',
      'Antes de enviar para a oficina, releia a descrição como se fosse o ourives. Dá para entender sem perguntar?',
      'Na retirada, peça para o cliente conferir a peça com calma antes de sair. Ajuste na hora custa menos.',
      'Anote na via o telefone que o cliente realmente atende. Aviso que não chega atrasa a entrega.',
      'Serviço entregue é chance de venda: mostre uma peça que combina com a que ficou pronta.' ],
    orcamento: [
      'Orçamento sem retorno em 2 dias esfria. Um contato curto perguntando se ficou alguma dúvida reabre a conversa.',
      'Ao passar o valor, diga primeiro o que está incluído. Preço solto parece caro.',
      'Pergunte a data em que o cliente precisa da peça. Prazo ajuda a decidir.',
      'Se o cliente achou caro, ofereça uma segunda opção em vez de desconto: outro peso, outra pedra, outro acabamento.',
      'Combine com o cliente quando você vai procurá-lo de novo, e procure no dia combinado.',
      'Orçamento recusado também ensina: anote o motivo. Com o tempo você enxerga o padrão.',
      'Mande uma foto de peça parecida já pronta. Ver o resultado ajuda a aprovar.',
      'Antes de enviar, confira nome e telefone. Orçamento que não chega não fecha.',
      'Cliente comparando com outra loja? Mostre o que é diferente aqui: garantia, acabamento, oficina própria.',
      'Releia o orçamento em voz alta antes de enviar. Se você tropeça em alguma parte, o cliente também vai.' ],
    chat: [
      'Responda rápido, mesmo que seja só para dizer que já está vendo. Quem espera sem resposta procura outra loja.',
      'Comece pelo nome do cliente e termine com uma pergunta. Pergunta mantém a conversa viva.',
      'Foto boa vende: fundo limpo, luz natural e a peça em uso, na mão ou no colo.',
      'Áudio longo cansa. Prefira texto curto e, se precisar explicar muito, ofereça uma ligação.',
      'Cliente pediu preço? Mande junto uma segunda opção, um pouco acima ou um pouco abaixo.',
      'Antes de encerrar a conversa, combine o próximo passo: visita, reserva ou data do retorno.',
      'Releia a mensagem antes de enviar. Erro de digitação em valor ou data vira problema depois.',
      'Mensagem que chegou fora do horário merece prioridade na manhã seguinte.',
      'Cliente sumiu no meio da conversa? Retome com uma novidade, não com cobrança.',
      'Convide para a loja: joia convence mais ao vivo do que na foto.' ],
    agenda: [
      'Comece o dia pelas tarefas atrasadas. Tirar a mais antiga da frente alivia o resto.',
      'Tarefa grande trava. Quebre em passos pequenos e marque o primeiro para hoje.',
      'Combinou de retornar para um cliente? Anote na hora, com dia certo. A memória falha, a agenda não.',
      'Antes de sair, olhe o que vence amanhã. Chegar sabendo o que fazer rende mais.',
      'Tarefa feita, tarefa marcada. A lista limpa mostra o que realmente falta.',
      'Reserve o começo da manhã para os contatos com clientes. Depois o movimento da loja ocupa tudo.' ],
    painel: [
      'Olhe primeiro os avisos em vermelho: quase sempre é algo que um cliente está esperando.',
      'Compare o seu número de hoje com o da semana passada, não com o da colega. A sua evolução é a que conta.',
      'Pedido atrasado no painel? Avise o cliente antes que ele pergunte. Atraso avisado desgasta muito menos.',
      'Uma olhada no painel no começo e outra no fim do dia bastam. No meio, o foco é o cliente.' ],
  };
  /** Dicas ainda NÃO vistas para uma tela: as do servidor (IA) primeiro, depois as do banco próprio. */
  function dicasNovas(k){
    var dm = (S.dia && S.dia.dicasModulo) || {};
    var serv = (k === 'geral' ? (dm.geral || (S.dia && S.dia.dicas) || []) : (dm[k] || [])).filter(dicaNova);
    var loc = (ehOficina() || k === 'geral') ? [] : (BANCO[k] || []).filter(dicaNova);
    if(serv.length && (!loc.length || Math.random() < 0.6)) return serv;
    return loc.length ? loc : serv;
  }
  function ignoradas(){ return Number(ls(uidK('ign')) || 0); }
  /** Balão de dica: conta como "ignorado" até a pessoa interagir (Ouvir, Ver, Abrir). Fechar ou deixar sumir mantém a contagem. */
  function balaoDica(html, acoes){
    var d = balao(html, acoes);
    if(!d) return null;
    ls(uidK('ign'), String(Math.min(6, ignoradas() + 1)));
    d.addEventListener('click', function(ev){ var b = ev.target && ev.target.closest ? ev.target.closest('[data-cp]') : null; if(b && b.dataset.cp !== 'x' && b.dataset.cp !== 'depois') ls(uidK('ign'), '0'); });
    return d;
  }
  function moduloAberto(mod, sub){
    if(!S.dia || S.aberto || document.hidden) return;
    if(ehAdm()) return;   // 23/11: administrativo não recebe dica de venda por tela
    var k = chaveModulo(mod, sub);
    var n = Number(ls(chave('nm'))||0), ult = Number(ls(chave('ult'))||0), pausa = Number(ls(chave('pausa'))||0), ign = ignoradas();
    var gap = LIM.gapMin * (1 + Math.min(3, ign)), porDia = ign >= 3 ? 1 : ign >= 2 ? 2 : LIM.porDia;
    if(n >= porDia || Date.now() - ult < gap*60000 || Date.now() - pausa < LIM.pausaMin*60000) return;
    if(Math.random() > 0.5) return;   // "algumas vezes", não sempre
    var cheio = Number(S.dia.hojeAtendimentos||0) >= 8;
    var podeBE = S.dia.consentimento !== false && Number(ls(chave('be'))||0) < 1 && Date.now() - Number(ls(uidK('beUlt'))||0) > 20*3600000 && !beEmPausa();
    if(podeBE && (VENDA_MODS.indexOf(k) < 0 || cheio) && Math.random() < 0.5){ ls(chave('ult'), String(Date.now())); ls(chave('nm'), String(n+1)); return perguntarBemEstar(cheio); }
    var lista = dicasNovas(k);
    if(!lista.length) return;   // nada novo para ESTA tela: não aparece (e não gasta a vez do dia)
    var dica = lista[Math.floor(Math.random() * lista.length)];
    ls(chave('ult'), String(Date.now())); ls(chave('nm'), String(n+1));
    marcarVista(dica);
    balaoDica(tagHtml(ICONE[k]) + '<div class="cp-txt">' + esc(dica) + '</div>');
  }

  /* ---------- v4: BEM-ESTAR (consentimento, perguntas clicáveis, cuidado) ---------- */
  var PERGUNTAS = [
    { id:'humor', txt:'Como você está se sentindo hoje?', ops:[['otima','😄 Ótima'],['bem','🙂 Bem'],['cansada','😮‍💨 Cansada'],['preocupada','😟 Preocupada'],['triste','😔 Pra baixo']] },
    { id:'agua', txt:'Pausa rápida: já bebeu água nas últimas horas?', ops:[['sim','💧 Já bebi'],['nao','🙈 Ainda não']] },
    { id:'corpo', txt:'Como está o corpo hoje? Costas, pernas, cabeça…', ops:[['bem','💪 Tudo certo'],['dor','🤕 Com alguma dor'],['cansaco','🥱 Muito cansaço']] },
    { id:'sono', txt:'Conseguiu dormir bem esta noite?', ops:[['bem','😴 Dormi bem'],['mais_ou_menos','😐 Mais ou menos'],['mal','😵 Dormi mal']] },
    { id:'vida', txt:'E a vida fora da loja, como anda?', ops:[['tranquila','🌿 Tranquila'],['corrida','🏃 Corrida'],['dificil','🌧️ Difícil']], texto:true },
    { id:'dia', txt:'O que deixaria o seu dia melhor hoje?', ops:[['musica','🎵 Uma música boa'],['cafe','☕ Um café'],['elogio','💛 Um elogio'],['descanso','🪑 Sentar um pouco']] },
    /* v7 (25/11): mais perguntas, para não serem sempre as mesmas. `alt` = outros jeitos de perguntar a mesma coisa. */
    { id:'energia', txt:'⚡ De 1 a 3, como está a sua energia agora?', alt:['⚡ Bateria de hoje: cheia, pela metade ou no vermelho?'], ops:[['alta','🔋 Cheia'],['media','🪫 Pela metade'],['baixa','🔴 No vermelho']] },
    { id:'pausa', txt:'⏸️ Já fez uma pausa de verdade hoje, longe do balcão?', alt:['⏸️ Conseguiu parar uns minutinhos hoje?'], ops:[['sim','✅ Já fiz'],['ainda_nao','⏳ Ainda não']] },
    { id:'alongar', txt:'🧘 Topa 30 segundos de alongamento comigo? Ombros para trás, pescoço devagar.', alt:['🧘 Hora de soltar os ombros: vamos alongar rapidinho?'], ops:[['fiz','🙌 Fiz agora'],['depois','🕐 Faço depois']] },
    { id:'respirar', txt:'🌬️ Vamos respirar fundo uma vez? Puxa em 4, segura 4, solta em 6.', alt:['🌬️ Uma respiração funda antes do próximo cliente?'], ops:[['fiz','😌 Respirei'],['depois','🕐 Depois']] },
    { id:'almoco', txt:'🍽️ Conseguiu almoçar com calma hoje?', alt:['🍽️ E o almoço, foi tranquilo ou correndo?'], ops:[['sim','😋 Com calma'],['correndo','🏃 Correndo'],['nao','🙈 Ainda não almocei']] },
    { id:'pes', txt:'👟 Muito tempo em pé hoje? Como estão as pernas?', alt:['👟 E os pés, aguentando bem o dia?'], ops:[['bem','💪 Tranquilas'],['pesadas','🦵 Pesadas']] },
    { id:'olhos', txt:'👀 Muito tempo olhando para a tela? Olhe para longe por 20 segundos. Ajuda mesmo.', ops:[['fiz','✅ Olhei'],['depois','🕐 Depois']] },
    { id:'melhor', txt:'🌟 Qual foi a melhor parte do seu dia até agora?', alt:['🌟 Teve algo bom no dia de hoje?'], ops:[['cliente','🤝 Um cliente legal'],['venda','💎 Uma venda'],['equipe','👯 A equipe'],['nada','🌥️ Ainda nada']] },
    { id:'semana', txt:'📅 Como está sendo a sua semana?', alt:['📅 Semana leve ou puxada?'], ops:[['leve','🌤️ Leve'],['normal','🙂 Normal'],['puxada','🌪️ Puxada']] },
    { id:'ajuda', txt:'🤝 Tem alguma coisa travando o seu trabalho hoje?', alt:['🤝 Precisa de ajuda com alguma coisa hoje?'], ops:[['nao','👍 Está tudo fluindo'],['sim','🧩 Tem, sim']], texto:true },
  ];
  var PERG_DIA_CHEIO = ['agua','humor','corpo','pausa','respirar','alongar','pes'];
  var CUIDADO = {
    humor:{ otima:'Que bom! Essa energia contagia o cliente. Aproveita! ✨', bem:'Que bom! Bora fazer um dia leve e produtivo.', cansada:'Entendo. Que tal 2 minutos sentada, respirando fundo, e um copo d’água? Você rende mais descansada.', preocupada:'Obrigado por contar. Respira: inspira em 4 tempos, segura 4, solta em 6. Se quiser falar com alguém de confiança, faz bem.', triste:'Sinto muito que o dia esteja pesado. Seja gentil com você hoje. Se precisar conversar, procure alguém de confiança. Você não está sozinha. 💛' },
    agua:{ sim:'Isso aí! Hidratada a gente atende melhor. 💧', nao:'Que tal agora? Um copo d’água já ajuda a cabeça e a voz. Eu espero. 😉' },
    corpo:{ bem:'Ótimo! Lembre de alongar os ombros de vez em quando.', dor:'Tenta alongar o pescoço e os ombros devagar e, quando der, sentar um pouco. Se a dor continuar, vale procurar um médico.', cansaco:'Cansaço acumula. Se puder, faça uma pausa curta longe do balcão e beba água.' },
    sono:{ bem:'Que bom! Dia de energia.', mais_ou_menos:'Vai com calma hoje. Água e uma pausa curta à tarde ajudam.', mal:'Puxado, né? Hoje, evite muito café de uma vez e tente dormir mais cedo. Cuida de você.' },
    vida:{ tranquila:'Que bom! Isso aparece no sorriso. 🌿', corrida:'A vida corrida cansa. Tenta reservar um tempinho só seu hoje, nem que sejam 10 minutos.', dificil:'Obrigado por confiar. Momentos difíceis passam. Converse com quem você confia e, se for pesado demais, o CVV atende de graça no 188, 24 horas.' },
    dia:{ musica:'Boa! Coloca aquela música no intervalo. 🎵', cafe:'Um café no intervalo cai bem! ☕', elogio:'Então lá vai, e é verdade:', descanso:'Merecido! Na próxima pausa, senta e desliga 5 minutinhos.' },
    energia:{ alta:'Bateria cheia! Bom dia para aquele cliente que precisa de atenção. 🔋', media:'Metade ainda rende. Um copo d’água e 2 minutos sentada ajudam a segurar o dia.', baixa:'Dia puxado. Se der, faça uma pausa curta agora e coma alguma coisa. Você importa mais que a meta. 💛' },
    pausa:{ sim:'Isso! Pausa não é perder tempo, é recarregar. ✅', ainda_nao:'Que tal na próxima folga do movimento? Cinco minutos longe do balcão já mudam o resto do dia.' },
    alongar:{ fiz:'Boa! O corpo agradece. 🙌', depois:'Combinado. Quando o movimento baixar, solta os ombros por 30 segundos.' },
    respirar:{ fiz:'Pronto. Cabeça mais leve para o próximo atendimento. 😌', depois:'Tudo bem. Fica a dica para antes do próximo cliente.' },
    almoco:{ sim:'Ótimo! Comer com calma segura a energia da tarde. 😋', correndo:'Acontece. Se der, um lanche tranquilo à tarde compensa.', nao:'Não deixa passar: saco vazio não para em pé. Combina com a colega e vai almoçar. 🍽️' },
    pes:{ bem:'Que bom! Trocar o apoio de uma perna para a outra de vez em quando ajuda a manter assim.', pesadas:'Quando sentar, estique as pernas e gire os tornozelos. Em casa, pés para cima por uns minutos aliviam. 🦵' },
    olhos:{ fiz:'Isso! A cada 20 minutos de tela, 20 segundos olhando longe. 👀', depois:'Sem problema. Piscar bastante também descansa a vista.' },
    melhor:{ cliente:'Cliente legal muda o dia. E ele também lembra de quem atendeu bem. 🤝', venda:'Venda feita é mérito seu. Parabéns! 💎', equipe:'Equipe unida vende mais e cansa menos. 👯', nada:'Ainda dá tempo: o dia não acabou. Às vezes a parte boa é o próximo cliente. 🌤️' },
    semana:{ leve:'Que bom! Aproveita o embalo. 🌤️', normal:'Semana normal também é semana boa. 🙂', puxada:'Semana puxada pede cuidado dobrado: água, pausa e dormir cedo quando der. 🌪️' },
    ajuda:{ nao:'Ótimo saber! 👍', sim:'Obrigado por dizer. Conta o que é e eu levo para a diretoria.' },
  };
  async function enviarBE(pergunta, resposta, detalhe){ if(S.dia && S.dia.consentimento) await (ehOficina()?apiX:api)({ op:'bemestar', pergunta:pergunta, resposta:resposta, detalhe:detalhe||'' }); }
  /* v7 (25/11, pedido da diretoria): as perguntas rodam ENTRE os dias (antes recomeçavam todo dia e pareciam sempre as
     mesmas). Sai sempre a que está há mais tempo sem aparecer e nunca a mesma da última vez. Se a pessoa não responde,
     a próxima é outra; duas seguidas sem resposta = 3 dias sem perguntar; três = 7 dias. No máximo 1 por dia. */
  function beHist(){ return lerJ(uidK('behist'), []); }
  function beSemResposta(){ var H = beHist(), n = 0; for(var i = H.length - 1; i >= 0 && H[i].r === 'ign'; i--) n++; return n; }
  function beEmPausa(){ var H = beHist(), n = beSemResposta(); if(n < 2) return false; return (Date.now() - H[H.length-1].t) / 86400000 < (n >= 3 ? 7 : 3); }
  function beRespondeu(id){ var H = beHist(); for(var i = H.length - 1; i >= 0; i--){ if(H[i].id === id){ H[i].r = 'resp'; break; } } gravarJ(uidK('behist'), H); }
  function escolherPergunta(cheio){
    var H = beHist(), ult = {}, ultima = H.length ? H[H.length-1].id : '';
    H.forEach(function(x){ ult[x.id] = x.t; });
    var pool = PERGUNTAS.filter(function(q){ return q.id !== ultima; });
    if(cheio){ var c = pool.filter(function(q){ return PERG_DIA_CHEIO.indexOf(q.id) >= 0; }); if(c.length) pool = c; }
    pool.sort(function(a, b){ return (ult[a.id]||0) - (ult[b.id]||0); });   // a que está há mais tempo sem aparecer vem primeiro
    return pool.length ? pool[Math.floor(Math.random() * Math.min(3, pool.length))] : null;
  }
  function perguntarBemEstar(cheio){
    if(S.dia.consentimento === null || S.dia.consentimento === undefined) return pedirConsentimento();
    var q = escolherPergunta(cheio); if(!q) return;
    ls(chave('be'), String(Number(ls(chave('be'))||0)+1));
    mostrarPergunta(q, cheio ? 'Dia cheio hoje, hein? ' : '');
  }
  /** Mostra UMA pergunta de bem-estar no balão, com as respostas clicáveis; a resposta aparece no mesmo balão. */
  function mostrarPergunta(q, intro){
    var H0 = beHist(), vezes = H0.filter(function(x){ return x.id === q.id; }).length;
    var txt = q.alt ? variar([q.txt].concat(q.alt), vezes) : q.txt;   // muda o jeito de perguntar a cada vez
    H0.push({ id:q.id, t:Date.now(), r:'ign' }); gravarJ(uidK('behist'), H0.slice(-60)); ls(uidK('beUlt'), String(Date.now()));   // vira 'resp' quando a pessoa toca numa resposta
    var d = balao('<div class="cp-tag"><span aria-hidden="true">💛</span> Como você está</div><div class="cp-txt">' + esc(intro||'') + esc(txt) + '</div><div class="cp-ops">' + q.ops.map(function(o){ return '<button type="button" data-be="'+o[0]+'">'+esc(o[1])+'</button>'; }).join('') + '<button type="button" class="neutro" data-be="nao_dizer">Prefiro não dizer</button></div>', '', true);
    if(!d) return;
    d.querySelectorAll('[data-be]').forEach(function(b){ b.onclick = function(){
      var r = b.dataset.be;
      beRespondeu(q.id);
      if(r === 'nao_dizer'){ enviarBE(q.id, r); balao('<div class="cp-txt">Tudo bem! Se precisar, estou aqui. 😊</div>', '', true, 8000); return; }
      var resp = (CUIDADO[q.id]||{})[r] || 'Obrigado por contar!';
      if(['otima','bem','sim','tranquila','alta','leve'].indexOf(r) >= 0 && q.id !== 'ajuda') resp += ' ' + elogio();
      if(q.texto && r === 'dificil' || q.texto && r === 'corrida' || q.id === 'ajuda' && r === 'sim'){
        var d2 = balao('<div class="cp-txt">' + esc(resp) + '</div><p style="margin:6px 0 4px;font-size:12.5px;">Se quiser, conte um pouco mais (opcional):</p><textarea id="cpBeTxt" maxlength="600" style="width:100%;box-sizing:border-box;min-height:60px;border:1px solid #d9b26a;border-radius:8px;padding:6px;font:inherit;"></textarea>', '<button type="button" class="cp-b pri" data-cp="beok">Enviar</button>', true);
        if(d2){ d2.querySelector('[data-cp="beok"]').onclick = function(){ enviarBE(q.id, r, (d2.querySelector('#cpBeTxt')||{}).value||''); balao('<div class="cp-txt">Obrigado pela confiança. 💛</div>', '', true, 12000); }; }
        return;
      }
      enviarBE(q.id, r);
      if(q.id === 'dia' && r === 'elogio') resp += ' ' + elogio();
      balao('<div class="cp-txt">' + esc(resp) + '</div>', '', true, 15000);
    }; });
  }
  function pedirConsentimento(){
    ls(chave('be'), String(Number(ls(chave('be'))||0)+1)); ls(uidK('beUlt'), String(Date.now()));
    var d = balao('<div class="cp-txt">Posso, de vez em quando, perguntar como você está? É rapidinho, com resposta de um toque. Suas respostas ajudam a <b>diretoria</b> a cuidar melhor da equipe e só ela vê. Você pode sempre escolher "prefiro não dizer".</div>', '<button type="button" class="cp-b" data-cp="nao">Não, obrigado</button><button type="button" class="cp-b pri" data-cp="sim">Pode perguntar</button>', true);
    if(!d) return;
    d.querySelector('[data-cp="sim"]').onclick = async function(){ await (ehOficina()?apiX:api)({ op:'consentir', aceito:true }); S.dia.consentimento = true; mostrarPergunta(PERGUNTAS[1], 'Combinado! 😊 '); };
    d.querySelector('[data-cp="nao"]').onclick = async function(){ await (ehOficina()?apiX:api)({ op:'consentir', aceito:false }); S.dia.consentimento = false; balao('<div class="cp-txt">Sem problema! Vou continuar só com as dicas de vendas. 👍</div>', '', true, 8000); };
  }

  /* ---------- painel ---------- */
  function abrirPainel(){
    if(document.getElementById('cpPainel')) return;
    S.aberto = true; fecharBalao();
    var p = document.createElement('aside'); p.id = 'cpPainel'; p.className = 'cp-painel'; p.setAttribute('aria-label','Vilacinha, gerente-auxiliar');
    p.innerHTML = '<div class="cp-topo">' + rosto(44) + '<div class="cp-nm"><b>Vilacinha</b><small>'+(ehAdm()?'seu auxiliar de controles da administração':'seu gerente-auxiliar de vendas e aulas')+'</small></div>'
      + '<button type="button" class="cp-ler" data-cp="ler" title="Ouvir o resumo do dia" aria-label="Ouvir o resumo do dia">'+icOuvir(22)+'</button>'
      + '<button type="button" data-cp="atualizar" title="Atualizar os números" aria-label="Atualizar">'+ic('atualizar',18)+'</button>'
      + '<button type="button" data-cp="fechar" title="Fechar" aria-label="Fechar">'+ic('x',18)+'</button></div>'
      + '<div class="cp-corpo" id="cpCorpo"></div>'
      + '<form class="cp-form" id="cpForm"><button type="button" class="mic" id="cpMic" title="Falar" aria-label="Falar a pergunta">'+icMic(22)+'</button><textarea id="cpTexto" maxlength="600" placeholder="'+(ehAdm()?'Pergunte ao Vilacinha: como lanço a nota de devolução?':'Pergunte ao Vilacinha: como vender mais aliança?')+'" aria-label="Pergunta"></textarea><button type="submit" title="Enviar" aria-label="Enviar">'+ic('enviar',18)+'</button></form>';
    document.body.appendChild(p);
    p.querySelector('[data-cp="fechar"]').onclick = fecharPainel;
    p.querySelector('[data-cp="atualizar"]').onclick = async function(){ var c = document.getElementById('cpCorpo'); c.innerHTML = '<p>Refazendo as contas…</p>'; var r = ehOficina() ? await apiX({ op:'dia', forcar:true }) : await api({ op:'dia', forcar:true, lojaId: lojaShell() }); if(r && r.ok){ S.dia = r; S.recados = r.recados || S.recados; pintarFab(); } if(ehAdm()) await carregarControles(); desenhar(); };
    p.querySelector('[data-cp="ler"]').onclick = function(){ falar(resumoFalado()); };
    var ta = p.querySelector('#cpTexto');
    p.querySelector('#cpForm').onsubmit = function(e){ e.preventDefault(); perguntar(ta.value); };
    ta.addEventListener('keydown', function(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); perguntar(ta.value); } });
    p.querySelector('#cpMic').onclick = function(){ ouvir(this, function(t){ ta.value = t; perguntar(t); }); };
    document.addEventListener('keydown', escFecha);
    desenhar();
  }
  function desenharOficina(c, d){
    var h = cartaoRecados() + cartaoOficina(d);
    h += '<div class="cp-card"><h4>'+ic('mensagem',14)+'Converse com o Vilacinha</h4><div class="cp-chat" id="cpChat">' + (S.hist.length ? S.hist.map(function(m){ return '<div class="cp-msg '+(m.de==='ia'?'ia':'eu')+'">'+(m.de==='ia' ? esc(m.texto).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|\n)\s*[*-]\s+/g,'$1• ') : esc(m.texto))+'</div>'; }).join('') : '<div class="cp-meta-s">Pergunte o que quiser da bancada: solda, cravação, liga, pedra que não pode ir ao ultrassom, ordem da fila…</div>') + '</div></div>';
    c.innerHTML = h;
    ligarRecados(c);
    var bq = c.querySelector('[data-cp="quiz"]'); if(bq) bq.onclick = function(){ iniciarQuiz(); };
    var bd = c.querySelector('[data-cp="dia"]'); if(bd) bd.onclick = perguntaDoDia;
  }
  function escFecha(e){ if(e.key==='Escape' && !document.querySelector('.cp-ov')) fecharPainel(); }
  function fecharPainel(){ var p = document.getElementById('cpPainel'); if(p) p.remove(); S.aberto = false; document.removeEventListener('keydown', escFecha); try{ speechSynthesis.cancel(); }catch(e){} }
  function resumoFalado(){
    var d = S.dia||{}, t = (d.saudacao||'') + ' ';
    if(ehAdm()){
      var L = S.ctrl || [], pg = {}; L.forEach(function(a){ pg[a.grupo] = (pg[a.grupo]||0)+1; });
      return t + (L.length ? 'Hoje há ' + L.length + ' controles para conferir. ' + Object.keys(pg).map(function(k){ return k + ': ' + pg[k] + '.'; }).join(' ') : 'Os controles estão em dia.');
    }
    if(d.oficina){
      var pr = d.producao || {};
      t += 'Hoje vencem ' + (pr.paraHoje||0) + ' vias' + ((pr.atrasadas||0) ? ', e ' + pr.atrasadas + ' estão atrasadas' : '') + '. ';
      if(pr.comCravacao) t += 'Tem ' + pr.comCravacao + ' com cravação. ';
      (d.dicas||[]).forEach(function(x,i){ t += 'Dica ' + (i+1) + ': ' + x + ' '; });
      return t;
    }
    if(d.meta && d.meta.metaMes > 0) t += 'Sua meta de hoje é ' + Math.round(d.meta.hoje) + ' reais. ';
    if((d.vendaAtiva||[]).length) t += 'Você tem ' + d.vendaAtiva.length + ' clientes para chamar hoje. ';
    (d.dicas||[]).forEach(function(x,i){ t += 'Dica ' + (i+1) + ': ' + x + ' '; });
    return t;
  }
  function desenhar(){
    var c = document.getElementById('cpCorpo'); if(!c) return;
    var d = S.dia;
    if(!d){ c.innerHTML = '<div class="cp-card">Preparando o seu dia…</div>'; return; }
    if(d.oficina){ desenharOficina(c, d); return; }
    if(ehAdm()){ desenharAdm(c); return; }   // 23/11
    var m = d.meta || {}, pct = m.metaMes ? Math.min(100, Math.round((m.vendidoMes||0) / m.metaMes * 100)) : 0, eu = d.eu || {}, mel = d.melhor;
    var num = function(rot, v, ref){ return '<div class="cp-num"><b>'+v+'</b><small>'+rot+'</small>'+(ref!=null?'<em>melhor da loja: '+ref+'</em>':'')+'</div>'; };
    var semMeta = !(m.metaMes > 0);
    var h = cartaoRecados() + cartaoMeta(d);
    h += '<div class="cp-card"><h4>'+ic('grafico',14)+'Seus números no mês</h4><div class="cp-nums">'
      + num('vendas', eu.vendas||0, mel?mel.vendas:null) + num('ticket médio', brl0(eu.ticketMedio), mel?brl0(mel.ticketMedio):null) + num('peças por venda', String(eu.pecasPorVenda||0).replace('.',','), mel?String(mel.pecasPorVenda).replace('.',','):null)
      + '</div>' + (mel && (parseInt(mel.vendasComServico)||parseInt(eu.vendasComServico)) ? '<div class="cp-meta-s" style="margin-top:6px;">A melhor da loja junta serviço em <b>'+esc(mel.vendasComServico)+'</b> das vendas. Você: <b>'+esc(eu.vendasComServico||'0%')+'</b>.</div>' : (eu.posicao===1?'<div class="cp-meta-s" style="margin-top:6px;">Você é a melhor da loja este mês. Continue assim!</div>':'')) + '</div>';
    var ROT = { venda:'No balcão', pedido:'No pedido', orcamento:'No orçamento', chat:'No chat' };
    var dmP = d.dicasModulo || {};
    h += '<div class="cp-card"><h4>'+ic('info',14)+'Dicas de hoje</h4>' + (d.dicas||[]).map(function(x,i){ return '<div class="cp-dica"><span class="n">'+(i+1)+'</span><span>'+esc(x)+'</span></div>'; }).join('')
      + Object.keys(ROT).filter(function(k){ return (dmP[k]||[]).length; }).map(function(k){ return '<details style="margin-top:6px;"><summary style="cursor:pointer;font-weight:700;font-size:12.5px;color:#8a3560;">'+ROT[k]+' ('+dmP[k].length+')</summary>' + dmP[k].map(function(x){ return '<div class="cp-dica"><span class="n">•</span><span>'+esc(x)+'</span></div>'; }).join('') + '</details>'; }).join('') + '</div>';
    h += cartaoAprender();
    var va = d.vendaAtiva||[];
    h += cartaoChamar(va, d);
    if(S.user && (S.user.nivel === 'diretoria' || S.user.nivel === 'gerente')) h += '<div class="cp-card"><h4>'+ic('usuarios',14)+'Base de clientes: quem volta e quem sumiu</h4><div id="cpBase"><button type="button" class="cp-b" data-cp="base">Ver a base e a recompra</button></div></div>';
    if(S.user && S.user.nivel === 'diretoria') h += '<div class="cp-card"><h4>'+ic('estrela',14)+'Avisos e quiz da equipe (só diretoria)</h4><div id="cpAvisos"><button type="button" class="cp-b" data-cp="avisos">Ver avisos e resultados</button></div></div>';
    if(S.user && S.user.nivel === 'diretoria') h += '<div class="cp-card"><h4>'+ic('usuarios',14)+'Equipe: bem-estar (só diretoria)</h4><div id="cpEquipe"><button type="button" class="cp-b" data-cp="equipe">Ver como a equipe está</button></div></div>';
    if(d.ranking && d.ranking.length) h += '<div class="cp-card"><h4>'+ic('usuarios',14)+'Ranking da loja (gerência)</h4><table class="cp-rank">' + d.ranking.map(function(r,i){ return '<tr><td>'+(i+1)+'º '+esc(r.nome)+'</td><td class="r">'+r.vendas+' vendas</td><td class="r">'+brl0(r.total)+'</td></tr>'; }).join('') + '</table></div>';
    h += '<div class="cp-card"><h4>'+ic('mensagem',14)+'Converse com o Vilacinha</h4><div class="cp-chat" id="cpChat">' + (S.hist.length ? S.hist.map(function(m){ return '<div class="cp-msg '+(m.de==='ia'?'ia':'eu')+'">'+(m.de==='ia' ? esc(m.texto).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|\n)\s*[*-]\s+/g,'$1• ') : esc(m.texto))+'</div>'; }).join('') : '<div class="cp-meta-s">Pergunte por texto ou pelo microfone: argumentos de venda, como bater a meta, o que oferecer junto…</div>') + '</div></div>';
    c.innerHTML = h;

    ligarRecados(c);
    var be = c.querySelector('[data-cp="equipe"]'); if(be) be.onclick = verEquipe;
    var bav = c.querySelector('[data-cp="avisos"]'); if(bav) bav.onclick = verAvisos;
    var bb2 = c.querySelector('[data-cp="base"]'); if(bb2) bb2.onclick = verBase;
    c.querySelectorAll('[data-cp-lic]').forEach(function(b){ b.onclick = function(){ lerLicao(b.dataset.cpLic); }; });
    c.querySelectorAll('[data-cp-tema]').forEach(function(b){ b.onclick = function(){ abrirTema(b.dataset.cpTema); }; });
    var bq = c.querySelector('[data-cp="quiz"]'); if(bq) bq.onclick = function(){ iniciarQuiz(); };
    var bqf = c.querySelector('[data-cp="quizfoco"]'); if(bqf) bqf.onclick = function(){ iniciarQuiz('fracos'); };
    var bd = c.querySelector('[data-cp="dia"]'); if(bd) bd.onclick = perguntaDoDia;
    var bb = c.querySelector('[data-cp="biblioteca"]'); if(bb) bb.onclick = abrirBiblioteca;
  }

  /* ---------- v6: AULAS (pedras, ouro, ourivesaria), QUIZ e AVISOS ---------- */
  /* ---------- v6: META EM ESCADA, QUEM LIGAR e BASE DE CLIENTES ---------- */
  function pc(x){ return String(x).replace('.',','); }
  function vendasTxt(n){ return pc(n) + ' venda' + (n > 1 ? 's' : ''); }
  /** Meta: o que falta vira caminho (por dia e em vendas por dia). Nunca cobrança. */
  function cartaoMeta(d){
    var m = d.meta || {}, eu = d.eu || {}, mm = m.minha || {}, dias = m.diasRestantes || 1;
    var h = '<div class="cp-card"><h4>' + ic('estrela',14) + 'Meta: o caminho até o fim do mês</h4>';
    if(!(m.metaMes > 0)){
      return h + '<div class="cp-meta-v" style="font-size:18px;">Sem meta ainda</div>'
        + '<div class="cp-meta-s">Ainda não há faixa desta loja no Lançamentos nem histórico seu para sugerir uma. Assim que houver, o caminho aparece aqui.</div>'
        + '<div class="cp-meta-s" style="margin-top:6px;">No mês você já fez <b>' + brl0(m.vendidoMes) + '</b>'
        + (eu.posicao ? ' · você está em <b>' + eu.posicao + 'º de ' + eu.deQuantas + '</b> na loja' : '') + '</div></div>';
    }
    var pct = Math.min(100, Math.round((m.vendidoMes||0) / m.metaMes * 100));
    h += '<div class="cp-meta-v">' + brl0(m.hoje) + '</div>'
      + '<div class="cp-meta-s">é o ritmo de hoje para fechar o mês na meta'
      + (m.tipo === 'lancamentos' ? ' (sua meta pessoal, da faixa do Lançamentos)' : ' (meta sugerida pela sua média)') + '.</div>';
    if(mm.atingida) h += '<div class="cp-meta-s" style="margin-top:5px;color:#1f9a55;font-weight:700;">Meta do mês batida! Tudo o que vier agora é a mais. 🎉</div>';
    else h += '<div class="cp-meta-s" style="margin-top:5px;">Faltam <b>' + brl0(mm.falta) + '</b> em <b>' + dias + ' dia' + (dias > 1 ? 's' : '') + '</b>'
      + (mm.vendasPorDia ? ' — dá cerca de <b>' + vendasTxt(mm.vendasPorDia) + ' por dia</b> no seu ticket médio.' : '.') + '</div>';
    h += '<div class="cp-barra" aria-hidden="true"><i style="width:' + pct + '%"></i></div>'
      + '<div class="cp-meta-s">No mês: <b>' + brl0(m.vendidoMes) + '</b> de ' + brl0(m.metaMes) + ' (' + pct + '% do caminho)'
      + (eu.posicao ? ' · ' + eu.posicao + 'º de ' + eu.deQuantas + ' na loja' : '') + '</div>';
    if(m.hojeVendido > 0 || m.hoje > 0){
      var falta = Math.max(0, (m.hoje||0) - (m.hojeVendido||0));
      h += '<div class="cp-placar"><span class="cp-meta-s">Hoje: <b>' + brl0(m.hojeVendido||0) + '</b></span>'
        + '<span class="cp-meta-s">' + (falta <= 0 ? '· ritmo de hoje já alcançado. Excelente!' : '· faltam ' + brl0(falta) + ' para o ritmo de hoje') + '</span></div>';
    }
    if(m.projecaoMinha > 0){
      var sobra = m.projecaoMinha - m.metaMes;
      h += '<div class="cp-meta-s" style="margin-top:4px;">No seu ritmo deste mês você fecha em <b>' + brl0(m.projecaoMinha) + '</b>'
        + (sobra >= 0 ? ' — acima da meta. Segura esse ritmo!' : ' — com mais ' + (mm.vendasPorDia ? vendasTxt(Math.max(0.1, Math.round((Math.abs(sobra)/Math.max(1,dias)/Math.max(1,m.ticketRef||1))*10)/10)) + ' por dia' : brl0(Math.abs(sobra)) + ' no mês') + ' você chega lá.') + '</div>';
    }
    var esc2 = m.escada || [];
    if(esc2.length){
      var prox = -1;
      for(var i = 0; i < esc2.length; i++){ if(!esc2[i].atingida){ prox = i; break; } }
      h += '<div style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--t-line,#dde);">'
        + '<b style="font-size:12px;color:#8a3560;text-transform:uppercase;letter-spacing:.04em;">Sua escada de metas (Lançamentos)</b>'
        + esc2.map(function(f, i){
            var alvo = i === prox;
            return '<div class="cp-deg ' + (f.atingida ? 'ok' : '') + (alvo ? ' alvo' : '') + '"><span class="mk">' + (f.atingida ? '✔' : (alvo ? '→' : '·')) + '</span><span><b>' + pc(f.percentual) + '%</b> · ' + brl0(f.valor)
              + (f.atingida ? ' — <b>batida</b>' : ' — faltam <b>' + brl0(f.falta) + '</b>' + (f.porDia ? ' (' + brl0(f.porDia) + ' por dia)' : ''))
              + '</span></div>';
          }).join('')
        + '</div>';
    }
    if(m.loja){
      var pctLoja = m.loja.meta > 0 ? Math.min(100, Math.round((m.loja.vendido||0) / m.loja.meta * 100)) : null;
      h += '<div class="cp-meta-s" style="margin-top:10px;padding-top:8px;border-top:1px dashed var(--t-line,#dde);">' + ic('loja',13) + ' Meta da loja no mês: <b>' + brl0(m.loja.vendido) + '</b>'
        + (m.loja.meta > 0 ? ' de ' + brl0(m.loja.meta) + (pctLoja != null ? ' (' + pctLoja + '%)' : '') : '')
        + (m.projecaoLoja ? ' · no ritmo atual fecha em <b>' + brl0(m.projecaoLoja) + '</b>' : '') + '</div>';
    }
    return h + '</div>';
  }

  /** Quem ligar hoje: contato na mão + roteiro da conversa. Nada é enviado por aqui. */
  var ROT_TIPO = { orcamento:'Orçamento', aniversario:'Aniversário', retorno:'Mesma época', reativar:'Reativar' };
  function cartaoChamar(va, d){
    var rel = d.relacionamento || {};
    var h = '<div class="cp-card"><h4>' + ic('telefone',14) + 'Quem ligar hoje (' + va.length + ')</h4>'
      + '<div class="cp-meta-s" style="margin-bottom:8px;">Ligue você mesma: a voz fecha o que a mensagem não fecha. Aviso de pedido pronto já sai sozinho, não entra nesta lista.</div>';
    h += va.length ? va.map(function(x){
      var tel = x.telefone || '', lk = telLink(tel), wa = telWa(tel);
      return '<div class="cp-cli ' + esc(x.tipo) + '"><b>' + esc(x.cliente || 'Cliente') + '</b><span class="cp-tag">' + esc(ROT_TIPO[x.tipo] || 'Chamar') + '</span>'
        + '<div class="m">' + esc(x.motivo) + '</div>'
        + ((x.metricas||[]).length ? '<div class="cp-chips">' + x.metricas.map(function(t){ return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' : '')
        + '<div class="cp-acoes">'
        + (lk ? '<a class="cp-b pri fone" href="' + lk + '">' + ic('telefone',13) + ' ' + esc(telBonito(tel)) + '</a>' : '<span class="cp-meta-s">Sem telefone no cadastro</span>')
        + (wa ? '<a class="cp-b wa" href="' + wa + '" target="_blank" rel="noopener">' + ic('whatsapp',13) + 'Abrir conversa</a>' : '')
        + '</div>'
        + ((x.roteiro||[]).length ? '<details><summary>O que dizer na ligação</summary><ol>' + x.roteiro.map(function(p){ return '<li>' + esc(p) + '</li>'; }).join('') + '</ol></details>' : '')
        + '</div>';
    }).join('') : '<div class="cp-meta-s">Ninguém na fila hoje. Aproveite para pedir indicação a quem comprou esta semana.</div>';
    if(rel.total) h += '<div class="cp-meta-s" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--t-line,#dde);">Sua carteira: <b>' + rel.total + '</b> clientes · '
      + (rel.campea||0) + ' campeãs · ' + (rel.fiel||0) + ' fiéis · ' + ((rel.em_risco||0) + (rel.dormindo||0)) + ' esfriando · ' + (rel.unica||0) + ' de uma compra só.</div>';
    return h + '</div>';
  }

  /** Base de clientes (gerência/diretoria): recompra, intervalo e quem está esfriando. */
  var FAIXA_ROT = { campea:'Campeãs — 3+ compras e em dia', fiel:'Fiéis — 2 compras e em dia', nova:'Novas — 1ª compra recente', em_risco:'Esfriando — passou do intervalo dela', dormindo:'Dormindo — sumiram faz tempo', unica:'Compraram 1 vez e não voltaram' };
  async function verBase(){
    var box = document.getElementById('cpBase'); if(!box) return;
    box.innerHTML = '<div class="cp-meta-s">Calculando a base…</div>';
    var r = await api({ op:'clientes' });
    if(!r || !r.ok){ box.innerHTML = '<div class="cp-meta-s" style="color:#c62828;">' + esc((r && r.error) || 'Não consegui calcular agora.') + '</div>'; return; }
    var h = '<div class="cp-nums"><div class="cp-num"><b>' + r.total + '</b><small>clientes com compra</small></div>'
      + '<div class="cp-num"><b>' + r.taxaRecompra + '%</b><small>voltaram a comprar</small></div>'
      + '<div class="cp-num"><b>' + (r.intervaloMedio ? r.intervaloMedio + ' d' : '—') + '</b><small>entre uma compra e outra</small></div></div>';
    h += Object.keys(FAIXA_ROT).filter(function(k){ return (r.faixas||{})[k]; }).map(function(k){
      return '<div class="cp-dica"><span class="n">' + r.faixas[k] + '</span><span>' + esc(FAIXA_ROT[k]) + '</span></div>'; }).join('');
    if((r.porVendedora||[]).length) h += '<div class="cp-meta-s" style="margin-top:8px;"><b>Por vendedora</b></div><table class="cp-rank">'
      + r.porVendedora.map(function(p){ return '<tr><td>' + esc(p.nome) + '</td><td class="r">' + p.clientes + ' clientes</td><td class="r">' + p.taxaRecompra + '% voltam</td><td class="r">' + p.emRisco + ' p/ reativar</td></tr>'; }).join('') + '</table>';
    h += '<div class="cp-meta-s" style="margin-top:8px;">O app tem <b>' + r.mesesDeHistorico + ' mês(es)</b> de histórico de compras. Quanto mais tempo passa, mais certeira fica a hora de ligar — a conta de frequência já está rodando.</div>';
    if(S.user && S.user.nivel === 'diretoria') h += '<div style="margin-top:8px;"><button type="button" class="cp-b" data-cp="cfgreat">Ajustar quando o Vilacinha sugere reativar</button></div>';
    box.innerHTML = h;
    var bc = box.querySelector('[data-cp="cfgreat"]'); if(bc) bc.onclick = function(){ abrirConfigReativacao(r.cfg); };
  }
  var CFG_ROT = [
    ['diasMinimos', 'Só sugerir depois de quantos dias sem comprar', 'Abaixo disso a cliente ainda é recente.'],
    ['fatorAtraso', 'Quantas vezes o intervalo dela para considerar atraso', 'Ex.: 1,3 = passou 30% do tempo que ela costuma levar.'],
    ['minCompras', 'Mínimo de compras para contar como cliente de frequência', ''],
    ['unicaCompraDias', 'Cliente de 1 compra só: ligar depois de quantos dias', ''],
    ['maxPorVendedora', 'Quantas clientes para reativar por dia, por vendedora', 'Lista curta é lista que a vendedora cumpre.'],
    ['ticketMinimo', 'Ticket médio mínimo para entrar na lista (0 = todas)', '']
  ];
  function abrirConfigReativacao(cfg){
    var c = cfg || {};
    modal('<h3 style="margin:0 0 4px;font-size:16px;">Quando sugerir reativar</h3>'
      + '<p style="margin:0 0 10px;font-size:13px;color:var(--t-text-soft,#556);">O Vilacinha compara o tempo que cada cliente costuma levar entre compras com o tempo que ela está sumida.</p>'
      + CFG_ROT.map(function(f){ return '<div style="margin-bottom:8px;"><label style="font-size:12.5px;font-weight:600;display:block;">' + esc(f[1]) + '</label>'
          + (f[2] ? '<div style="font-size:11.5px;color:var(--t-text-soft,#667);margin-bottom:3px;">' + esc(f[2]) + '</div>' : '')
          + '<input id="cfg_' + f[0] + '" type="number" step="0.1" min="0" value="' + esc(c[f[0]] != null ? c[f[0]] : '') + '" style="width:120px;border:1px solid var(--t-line-strong,#99a);border-radius:8px;padding:7px 9px;font:inherit;background:var(--t-surface,#fff);color:inherit;"></div>'; }).join('')
      + '<div class="cp-acoes" style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px;"><button type="button" class="cp-b" data-x="fechar">Cancelar</button><button type="button" class="cp-b pri" data-x="salvar">Salvar</button></div>',
      function(ov, fecha){
        ov.querySelector('[data-x="salvar"]').onclick = async function(){
          var env = {}; CFG_ROT.forEach(function(f){ var el = ov.querySelector('#cfg_' + f[0]); if(el && el.value !== '') env[f[0]] = Number(String(el.value).replace(',', '.')); });
          var r = await api({ op:'config', salvar: env });
          if(r && r.ok){ toast('Pronto. Vale a partir do próximo dia do Vilacinha.'); fecha(); } else toast((r && r.error) || 'Não consegui salvar.');
        };
      });
  }

  /* ---------- RECADOS: o Vilacinha como portador de avisos ----------
     Vem de duas fontes: o que a diretoria escreveu e o que o sistema calcula na hora
     (hoje: via fora do padrão esperando a Oficina liberar). O do sistema some sozinho quando resolve. */
  function cartaoRecados(){
    var R = S.recados || []; if(!R.length) return '';
    var corDe = function(t){ return t==='urgente' ? '#c62828' : t==='pendencia' ? '#d98324' : '#2f7bd0'; };
    return '<div class="cp-card" style="border-color:' + corDe(R[0].tipo) + ';">'
      + '<h4>'+ic('sino',14)+'Recados para você'+(R.length>1?' ('+R.length+')':'')+'</h4>'
      + R.map(function(a){
          return '<div class="cp-be" style="border-color:'+corDe(a.tipo)+';background:'+(a.tipo==='urgente'?'#fdecec':a.tipo==='pendencia'?'#fff6ec':'#eef4fb')+';">'
            + '<b style="color:'+corDe(a.tipo)+';">'+esc(a.titulo||'Recado')+'</b>'
            + '<div class="m" style="white-space:pre-wrap;">'+esc(a.texto||'')+'</div>'
            + '<div class="m" style="opacity:.75;">'+(a.origem==='sistema'?'Aviso automático do sistema':'De '+esc(a.de||'Diretoria'))+'</div>'
            + (a.podeMarcarLido ? '<button type="button" class="cp-b" style="margin-top:6px;" data-cp-rec="'+esc(a.id)+'">Entendi</button>' : '')
            + '</div>';
        }).join('') + '</div>';
  }
  async function carregarRecados(){
    var r = await apiX({ op:'recados' });
    S.recados = (r && r.ok && Array.isArray(r.recados)) ? r.recados : [];
    pintarFab();
    return S.recados;
  }
  function ligarRecados(c){
    c.querySelectorAll('[data-cp-rec]').forEach(function(b){ b.onclick = async function(){
      b.disabled = true; await apiX({ op:'recadoLido', id:b.dataset.cpRec });
      S.recados = (S.recados||[]).filter(function(x){ return String(x.id) !== String(b.dataset.cpRec); });
      pintarFab(); desenhar();
    }; });
  }

  /* ---------- OFICINA: o dia da produção (nunca com valores) ---------- */
  function cartaoOficina(d){
    var pr = d.producao || {}, h = '';
    var num = function(rot, v, destaque){ return '<div class="cp-num"><b'+(destaque?' style="color:#c62828;"':'')+'>'+v+'</b><small>'+rot+'</small></div>'; };
    h += '<div class="cp-card"><h4>'+ic('engrenagem',14)+'A produção de hoje</h4><div class="cp-nums">'
       + num('para hoje', pr.paraHoje||0) + num('atrasadas', pr.atrasadas||0, (pr.atrasadas||0) > 0) + num('em produção', pr.emProducao||0)
       + '</div><div class="cp-nums" style="margin-top:6px;">'
       + num('na fábrica', pr.naFabrica||0) + num('prontas aqui', pr.prontasNaOficina||0) + num('na semana', pr.naSemana||0)
       + '</div>'
       + '<div class="cp-meta-s" style="margin-top:6px;">'
       + ((pr.comCravacao||0) ? '<b>'+pr.comCravacao+'</b> via(s) com cravação em aberto. ' : '')
       + ((pr.comPendencia||0) ? '<b>'+pr.comPendencia+'</b> com pendência para resolver com a loja. ' : '')
       + 'Os prazos aqui já são os da Oficina.</div></div>';

    var fila = pr.fila || [];
    h += '<div class="cp-card"><h4>'+ic('lista',14)+'O que fazer primeiro</h4>';
    if(!fila.length) h += '<div class="cp-meta-s">Nada atrasado nem vencendo hoje. Aproveite para adiantar o que vence amanhã ('+(pr.amanha||0)+').</div>';
    else h += fila.map(function(v){
      return '<div class="cp-cli"><div class="cp-cli-topo"><b>'+esc(v.via||'—')+'</b> <span class="cp-tag" style="background:'+(v.atrasada?'#c62828':'#d98324')+';">'+(v.atrasada?'ATRASADA':'HOJE')+'</span>'
        + (v.cravacao ? ' <span class="cp-tag" style="background:#6E45A8;">CRAVAÇÃO</span>' : '') + '</div>'
        + '<div class="cp-meta-s">'+esc(v.cliente||'')+' · '+esc(v.servico||'')+' · entrega '+dataBR(v.prazo)+' · '+esc(v.status||'')+'</div></div>';
    }).join('');
    h += '</div>';

    var prox = (pr.proximos||[]).filter(function(x){ return x.qtd; });
    if(prox.length) h += '<div class="cp-card"><h4>'+ic('calendario',14)+'Próximos 7 dias</h4>'
      + prox.map(function(x){ return '<div class="cp-deg"><span>'+dataBR(x.dia)+'</span><span><b>'+x.qtd+'</b> via'+(x.qtd>1?'s':'')+'</span></div>'; }).join('') + '</div>';

    if((pr.porTipo||[]).length) h += '<div class="cp-card"><h4>'+ic('joia',14)+'Por tipo de serviço (em aberto)</h4>'
      + pr.porTipo.map(function(t){ return '<div class="cp-deg"><span>'+esc(t.tipo)+'</span><span><b>'+t.qtd+'</b></span></div>'; }).join('') + '</div>';

    var ROT = { producao:'Na bancada', prazo:'Prazo e fila', qualidade:'Acabamento e cuidado' };
    var dm = d.dicasModulo || {};
    h += '<div class="cp-card"><h4>'+ic('info',14)+'Dicas de hoje</h4>' + (d.dicas||[]).map(function(x,i){ return '<div class="cp-dica"><span class="n">'+(i+1)+'</span><span>'+esc(x)+'</span></div>'; }).join('')
      + Object.keys(ROT).filter(function(k){ return (dm[k]||[]).length; }).map(function(k){ return '<details style="margin-top:6px;"><summary style="cursor:pointer;font-weight:700;font-size:12.5px;color:#8a3560;">'+ROT[k]+' ('+dm[k].length+')</summary>' + dm[k].map(function(x){ return '<div class="cp-dica"><span class="n">•</span><span>'+esc(x)+'</span></div>'; }).join('') + '</details>'; }).join('') + '</div>';

    var pd = S.pd;
    h += '<div class="cp-card"><h4>'+ic('estrela',14)+'Aprender e treinar</h4>';
    if(pd && pd.ok && !pd.indisponivel && !pd.desligado){
      h += '<div class="cp-be" style="margin:0 0 8px;border-color:#d9b26a;background:#fffaf0;"><b>Pergunta do dia'+(pd.respondida?(pd.acertou?' · você acertou':' · respondida'):' · 1 minuto')+'</b>'
        + '<div class="m">'+(pd.respondida ? 'Volte amanhã para a próxima.' : 'Uma pergunta por dia, técnica, de ourivesaria.')+(pd.sequencia>1?' Sequência: <b>'+pd.sequencia+' dias</b>.':'')+'</div>'
        + '<button type="button" class="cp-b '+(pd.respondida?'':'pri')+'" style="margin-top:6px;" data-cp="dia">'+(pd.respondida?'Rever a resposta':'Responder agora')+'</button></div>';
    }
    h += '<div class="cp-meta-s">Quiz técnico: ouro e ligas, pedras, solda, cravação, polimento, banho e cuidado com a peça.</div>'
      + '<div class="cp-acoes" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"><button type="button" class="cp-b pri" data-cp="quiz">'+ic('estrela',13)+'Fazer o quiz da oficina</button></div></div>';
    return h;
  }

  function cartaoAprender(){
    var L = (S.licoes && S.licoes.pendentes) || [];
    var pd = S.pd, h = '<div class="cp-card"><h4>'+ic('joia',14)+'Aprenda com o Vilacinha'+(L.length?' ('+L.length+' nova'+(L.length>1?'s':'')+')':'')+'</h4>';
    if(pd && pd.ok && !pd.indisponivel && !pd.desligado){
      h += '<div class="cp-be" style="margin:0 0 8px;border-color:#d9b26a;background:#fffaf0;"><b>Pergunta do dia'+(pd.respondida?(pd.acertou?' · você acertou':' · respondida'):' · 1 minuto')+'</b>'
        + '<div class="m">'+(pd.respondida ? 'Volte amanhã para a próxima.' : 'Uma pergunta por dia, sobre o que aparece nas vias e na loja.')+(pd.sequencia>1?' Sequência: <b>'+pd.sequencia+' dias</b>.':'')+'</div>'
        + '<button type="button" class="cp-b '+(pd.respondida?'':'pri')+'" style="margin-top:6px;" data-cp="dia">'+(pd.respondida?'Rever a resposta':'Responder agora')+'</button></div>';
    }
    if(L.length){
      h += L.slice(0,3).map(function(l){ return '<div class="cp-dica"><span class="n">'+ic('info',12)+'</span><span><b>'+esc(l.titulo)+'</b>'+(l.via_codigo?' <small style="color:#8a3560;">· apareceu na via '+esc(l.via_codigo)+'</small>':'')+'<br><button type="button" class="cp-b" style="margin-top:4px;" data-cp-lic="'+esc(l.id)+'">Ler a aula</button></span></div>'; }).join('');
    } else h += '<div class="cp-meta-s">Sem aula nova agora. Quando uma via trouxer uma pedra ou assunto novo, a aula aparece aqui para todas.</div>';
    var pg = S.prog;
    if(pg && pg.ok){
      h += '<div class="cp-be" style="margin-top:8px;"><b>' + esc(pg.nivel) + ' · ' + pg.pontos + ' pontos</b>'
        + (pg.proximoNivel ? ' <span class="m">faltam ' + pg.proximoNivel.faltam + ' para ' + esc(pg.proximoNivel.nome) + '</span>' : ' <span class="m">nível máximo!</span>')
        + '<div class="r">' + [pg.diasSeguidos ? pg.diasSeguidos + ' dias seguidos' : '', pg.mediaQuiz != null ? 'média no quiz ' + pg.mediaQuiz + '%' : '', pg.licoesLidas ? pg.licoesLidas + ' aulas lidas' : '']
            .filter(Boolean).map(function(t){ return '<span>' + esc(t) + '</span>'; }).join('') + '</div>'
        + ((pg.dominio||[]).length ? '<details><summary>Meu domínio por assunto</summary><div class="r">'
            + pg.dominio.map(function(dm){ return '<span class="' + (dm.pct >= 70 ? 'bom' : 'ruim') + '">' + esc(dm.tema) + ' ' + dm.pct + '%</span>'; }).join('') + '</div></details>' : '')
        + (pg.fracos && pg.fracos.length ? '<div class="m" style="margin-top:4px;">Para subir rápido, estude: <b>' + esc(pg.fracos.join(', ')) + '</b>.</div>' : '')
        + '</div>';
    }
    h += '<div class="cp-acoes" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"><button type="button" class="cp-b" data-cp="biblioteca">'+ic('documento',13)+'Biblioteca de pedras e ouro</button><button type="button" class="cp-b" data-cp="quiz">'+ic('estrela',13)+'Fazer o quiz</button>'
      + (pg && pg.fracos && pg.fracos.length ? '<button type="button" class="cp-b pri" data-cp="quizfoco">Treinar o que eu erro</button>' : '') + '</div></div>';
    return h;
  }
  async function carregarLicoes(){
    var r = await apiS({ op:'licoes' });
    if(r && r.ok){ S.licoes = r; pintarFab(); }
    return r;
  }
  async function carregarProgresso(){
    var r = await apiS({ op:'meuProgresso' });
    if(r && r.ok) S.prog = r;
    return r;
  }
  function modal(html, aoMontar){
    var ov = document.createElement('div'); ov.className = 'cp-ov';
    ov.innerHTML = '<div class="cp-modal" role="dialog" aria-modal="true">'+html+'</div>';
    document.body.appendChild(ov);
    var fecha = function(){ ov.remove(); };
    ov.addEventListener('click', function(e){ if(e.target===ov) fecha(); });
    ov.querySelectorAll('[data-x="fechar"]').forEach(function(b){ b.onclick = fecha; });
    if(aoMontar) aoMontar(ov, fecha);
    return ov;
  }
  function paragrafos(t){ return String(t||'').split(/\n+/).map(function(p){ return '<p style="margin:0 0 8px;line-height:1.5;">'+esc(p)+'</p>'; }).join(''); }
  async function lerLicao(id){
    var l = ((S.licoes && S.licoes.pendentes)||[]).concat((S.licoes && S.licoes.recentes)||[]).filter(function(x){ return x.id===id; })[0]; if(!l) return;
    modal('<h3 style="margin:0 0 8px;font-size:16px;">'+esc(l.titulo)+'</h3>'+paragrafos(l.texto)
      +'<div class="cp-acoes" style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px;"><button type="button" class="cp-b" data-x="ouvir">'+icOuvir(14)+' Ouvir</button><button type="button" class="cp-b" data-x="fechar">Entendi</button></div>',
      function(ov, fecha){
        ov.querySelector('[data-x="ouvir"]').onclick = function(){ falar(l.titulo+'. '+l.texto); };
        ov.querySelector('[data-x="fechar"]').addEventListener('click', async function(){ try{ speechSynthesis.cancel(); }catch(e){} await apiS({ op:'licaoVista', ids:[id] }); await carregarLicoes(); desenhar(); });
      });
  }
  async function abrirBiblioteca(){
    var r = await apiS({ op:'biblioteca' });
    if(!r || !r.ok){ toast((r && r.error) || 'Não consegui abrir a biblioteca.'); return; }
    var G = { pedra:'Pedras', ouro:'Ouro', prata:'Prata', oficina:'Ourivesaria', extra:'Aprendidos nas perguntas' };
    var h = '<h3 style="margin:0 0 8px;font-size:16px;">Biblioteca do Vilacinha</h3><p style="margin:0 0 8px;font-size:13px;color:var(--t-text-soft,#556);">Toque para ler. Perguntou algo novo ao Vilacinha? O assunto entra aqui.</p>';
    Object.keys(G).forEach(function(k){ var it = r.temas.filter(function(t){ return t.cat===k; }); if(!it.length) return;
      h += '<div style="margin:8px 0 4px;font-weight:700;font-size:12px;color:#8a3560;text-transform:uppercase;">'+G[k]+'</div><div style="display:flex;flex-wrap:wrap;gap:6px;">'+it.map(function(t){ return '<button type="button" class="cp-b" data-cp-tema="'+esc(t.id)+'">'+esc(t.nome)+'</button>'; }).join('')+'</div>'; });
    h += '<div class="cp-acoes" style="display:flex;justify-content:flex-end;margin-top:12px;"><button type="button" class="cp-b" data-x="fechar">Fechar</button></div>';
    modal(h, function(ov){ ov.querySelectorAll('[data-cp-tema]').forEach(function(b){ b.onclick = function(){ abrirTema(b.dataset.cpTema); }; }); });
  }
  async function abrirTema(id){
    var r = await apiS({ op:'tema', id:id });
    if(!r || !r.ok){ toast('Tema não encontrado.'); return; }
    modal('<h3 style="margin:0 0 8px;font-size:16px;">'+esc(r.nome)+'</h3>'+paragrafos(r.texto)+'<div class="cp-acoes" style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px;"><button type="button" class="cp-b" data-x="ouvir">'+icOuvir(14)+' Ouvir</button><button type="button" class="cp-b" data-x="fechar">Fechar</button></div>',
      function(ov){ ov.querySelector('[data-x="ouvir"]').onclick = function(){ falar(r.nome+'. '+r.texto); }; });
  }
  /* pergunta do dia: 1 por dia, renovada pela IA a partir das vias, das aulas e de assuntos importantes */
  async function carregarDia(){
    var r = await apiD({ op:'hoje' });
    if(r && r.ok){ S.pd = r; }
    return r;
  }
  async function perguntaDoDia(){
    var r = S.pd && S.pd.ok && !S.pd.indisponivel ? S.pd : await carregarDia();
    if(!r || !r.ok || r.indisponivel){ toast('A pergunta de hoje ainda não ficou pronta. Tente em instantes.'); return; }
    var ov = modal('<div id="cpPd"></div>');
    function resultado(f){
      var box = ov.querySelector('#cpPd'), cor = f.acertou ? '#1f9a55' : '#c62828';
      box.innerHTML = '<div style="font-size:12px;color:#8a3560;font-weight:700;">Pergunta do dia · '+esc(r.tema||'')+'</div><h3 style="margin:6px 0 10px;font-size:16px;line-height:1.35;">'+esc(r.q)+'</h3>'
        + r.opcoes.map(function(o,i){ var cert = i===f.certa, mine = i===f.escolha; return '<div style="padding:8px 10px;margin-bottom:6px;border-radius:9px;border:1px solid '+(cert?'#1f9a55':mine?'#c62828':'var(--t-line,#dde)')+';background:'+(cert?'#e3f4e9':mine?'#fde2e2':'transparent')+';line-height:1.35;">'+(cert?'<b>Certa: </b>':mine?'<b>Sua resposta: </b>':'')+esc(o)+'</div>'; }).join('')
        + '<div style="margin:8px 0;"><b style="color:'+cor+';">'+(f.acertou?'Acertou!':'Não foi dessa vez.')+'</b> '+esc(f.explicacao||'')+'</div>'
        + '<div class="cp-meta-s">Sequência: <b>'+(f.sequencia||0)+' dia'+((f.sequencia||0)===1?'':'s')+'</b> · últimos 30 dias: <b>'+(f.acertos30||0)+' de '+(f.respondidas30||0)+'</b> certas.</div>'
        + '<div class="cp-acoes" style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px;"><button type="button" class="cp-b" data-x="fechar">Fechar</button></div>';
      box.querySelector('[data-x="fechar"]').onclick = function(){ ov.remove(); };
    }
    if(r.respondida){ resultado(r); return; }
    var box = ov.querySelector('#cpPd');
    box.innerHTML = '<div style="font-size:12px;color:#8a3560;font-weight:700;">Pergunta do dia · '+esc(r.tema||'')+'</div><h3 style="margin:6px 0 10px;font-size:16px;line-height:1.35;">'+esc(r.q)+'</h3>'
      + r.opcoes.map(function(o,i){ return '<button type="button" class="cp-b" style="display:block;width:100%;text-align:left;margin-bottom:7px;white-space:normal;line-height:1.35;" data-op="'+i+'">'+esc(o)+'</button>'; }).join('')
      + '<div class="cp-acoes" style="display:flex;justify-content:flex-end;margin-top:6px;"><button type="button" class="cp-b" data-x="fechar">Depois</button></div>';
    box.querySelector('[data-x="fechar"]').onclick = function(){ ov.remove(); };
    box.querySelectorAll('[data-op]').forEach(function(b){ b.onclick = async function(){
      box.querySelectorAll('button').forEach(function(x){ x.disabled = true; });
      var f = await apiD({ op:'responder', escolha:+b.dataset.op });
      if(!f || !f.ok || !f.respondida){ toast((f && f.error) || 'Não consegui registrar agora.'); ov.remove(); return; }
      S.pd = Object.assign({}, r, f); resultado(S.pd); desenhar();
    }; });
  }
  /* quiz: 8 perguntas por função; a correção é feita no servidor */
  async function iniciarQuiz(foco){
    var qApi = ehOficina() ? apiX : apiS;
    var r = await qApi({ op:'quizIniciar', foco: foco || '' });
    if(!r || !r.ok){ toast((r && r.error) || 'Não consegui abrir o quiz agora.'); return; }
    var P = r.perguntas, i = 0, resp = [];
    var ov = modal('<div id="cpQz"></div>');
    function passo(){
      var q = P[i], box = ov.querySelector('#cpQz');
      box.innerHTML = '<div style="font-size:12px;color:#8a3560;font-weight:700;">Pergunta '+(i+1)+' de '+P.length+'</div><div style="height:5px;background:#eee;border-radius:3px;margin:6px 0 10px;"><i style="display:block;height:5px;border-radius:3px;background:#8a3560;width:'+Math.round(i/P.length*100)+'%"></i></div>'
        + '<h3 style="margin:0 0 10px;font-size:16px;line-height:1.35;">'+esc(q.q)+'</h3>'
        + q.opcoes.map(function(o){ return '<button type="button" class="cp-b" style="display:block;width:100%;text-align:left;margin-bottom:7px;white-space:normal;line-height:1.35;" data-op="'+o.i+'">'+esc(o.t)+'</button>'; }).join('')
        + '<div class="cp-acoes" style="display:flex;justify-content:flex-end;margin-top:6px;"><button type="button" class="cp-b" data-x="fechar">Sair</button></div>';
      box.querySelector('[data-x="fechar"]').onclick = function(){ ov.remove(); };
      box.querySelectorAll('[data-op]').forEach(function(b){ b.onclick = function(){ resp.push({ id:q.id, escolha:+b.dataset.op }); i++; if(i<P.length) passo(); else fim(); }; });
    }
    async function fim(){
      var box = ov.querySelector('#cpQz'); box.innerHTML = '<p>Corrigindo…</p>';
      var f = await qApi({ op:'quizResponder', respostas:resp });
      if(!f || !f.ok){ box.innerHTML = '<p>'+esc((f&&f.error)||'Não consegui corrigir agora.')+'</p><div class="cp-acoes"><button type="button" class="cp-b" data-x="fechar">Fechar</button></div>'; box.querySelector('[data-x="fechar"]').onclick = function(){ ov.remove(); }; return; }
      var cor = f.pct>=90?'#1f9a55':f.pct>=70?'#2f7bd0':f.pct>=40?'#a8803a':'#c62828';
      if(ehOficina()) desenhar(); else carregarProgresso().then(function(){ desenhar(); });
      box.innerHTML = '<div style="text-align:center;"><div style="font-size:34px;font-weight:800;color:'+cor+';">'+f.pct+'%</div><div style="font-weight:700;">'+esc(f.nivel)+' · '+f.acertos+' de '+f.total+' certas</div></div>'
        + '<div style="margin-top:10px;max-height:46vh;overflow:auto;">' + f.detalhes.map(function(d){ return '<div style="padding:8px 0;border-top:1px dashed var(--t-line,#dde);"><b style="color:'+(d.ok?'#1f9a55':'#c62828')+';">'+(d.ok?'Acertou':'Errou')+'</b> · '+esc(d.q)+(d.ok?'':'<br><small>Sua resposta: '+esc(d.sua||'—')+'<br>Correta: <b>'+esc(d.certa)+'</b></small>')+'<br><small style="color:var(--t-text-soft,#556);">'+esc(d.e)+'</small></div>'; }).join('') + '</div>'
        + ((f.estudar||[]).length ? '<div class="cp-meta-s" style="margin-top:8px;">Para a próxima: estude <b>' + esc(f.estudar.join(', ')) + '</b>. O botão "Treinar o que eu erro" traz só esses assuntos.</div>' : '')
        + '<div class="cp-acoes" style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px;"><button type="button" class="cp-b" data-x="fechar">Fechar</button></div>';
      box.querySelector('[data-x="fechar"]').onclick = function(){ ov.remove(); };
    }
    passo();
  }
  /* diretoria: avisos de destaque / nota baixa e resultados do quiz */
  async function verAvisos(){
    var box = document.getElementById('cpAvisos'); if(!box) return;
    box.innerHTML = '<div class="cp-meta-s">Carregando…</div>';
    var rs = await Promise.all([ apiS({ op:'avisos' }), apiS({ op:'quizEquipe' }), apiD({ op:'equipe' }) ]), av = rs[0], qz = rs[1], pdq = rs[2];
    var h = '';
    if(av && av.ok && av.avisos.length){
      h += av.avisos.map(function(a){ var bom = a.tipo==='destaque'; return '<div class="cp-be"><b style="color:'+(bom?'#1f9a55':'#c62828')+';">'+(bom?'Destaque':'Atenção')+' · '+esc(a.titulo)+'</b><div class="m">'+esc(a.texto)+' <span class="m">'+new Date(a.criado_em).toLocaleDateString('pt-BR')+'</span></div></div>'; }).join('')
        + '<div style="margin:6px 0;"><button type="button" class="cp-b" data-cp="lidos">Marcar avisos como lidos</button></div>';
    } else h += '<div class="cp-meta-s">Nenhum aviso novo.</div>';
    if(qz && qz.ok && qz.pessoas.length){
      h += '<div class="cp-meta-s" style="margin-top:8px;"><b>Quiz — média por pessoa (90 dias)</b></div><table class="cp-rank">' + qz.pessoas.map(function(p){ return '<tr><td>'+esc(p.nome||'—')+'</td><td class="r">'+p.feitos+'x</td><td class="r"><b>'+p.media+'%</b></td><td class="r" style="font-size:11px;">'+esc((p.pontosFracos||[]).join(', ')||'')+'</td></tr>'; }).join('') + '</table>';
    } else h += '<div class="cp-meta-s" style="margin-top:6px;">Ninguém fez o quiz ainda.</div>';
    if(pdq && pdq.ok && pdq.pessoas.length){
      h += '<div class="cp-meta-s" style="margin-top:8px;"><b>Pergunta do dia — últimos 30 dias</b></div><table class="cp-rank">' + pdq.pessoas.map(function(p){ return '<tr><td>'+esc(p.nome||'—')+'</td><td class="r">'+p.respondidas+' resp.</td><td class="r"><b>'+Math.round(p.acertos/p.respondidas*100)+'%</b></td></tr>'; }).join('') + '</table>';
    }
    box.innerHTML = h;
    var bl = box.querySelector('[data-cp="lidos"]');
    if(bl) bl.onclick = async function(){ await apiS({ op:'avisoLido', ids:av.avisos.map(function(a){ return a.id; }) }); S.avisosN = 0; pintarFab(); verAvisos(); };
  }
  /* ao entrar: aula nova aparece no balão (1x por aula) e a diretoria recebe aviso de destaque/baixa */
  async function avisosIniciais(){
    await carregarRecados();
    /* recado novo (da diretoria ou do sistema) fala mais alto que qualquer dica */
    var R = S.recados || [];
    if(R.length && !S.aberto && ls(chave('recBalao')) !== String(R[0].id)){
      ls(chave('recBalao'), String(R[0].id));
      balao('<div class="cp-txt"><b>'+esc(R[0].titulo||'Recado')+':</b> '+esc(String(R[0].texto||'').slice(0,180))+'</div>', '<button type="button" class="cp-b" data-cp="abrir">Ver</button>', true, 25000);
      return;
    }
    if(ehOficina()){ await carregarDia(); return; }
    if(ehAdm()) return;   // 23/11: administrativo não recebe aula nem pergunta de venda
    var r = await carregarLicoes();
    var L = r && r.ok ? r.pendentes : [];
    await carregarDia(); await carregarProgresso();
    if(S.user && S.user.nivel==='diretoria'){
      var av = await apiS({ op:'avisos' });
      if(av && av.ok && av.avisos.length && !S.aberto){
        S.avisosN = av.avisos.length;
        var a0 = av.avisos[0];
        balao('<div class="cp-txt"><b>'+(a0.tipo==='destaque'?'Destaque no quiz':'Atenção no quiz')+':</b> '+esc(a0.texto)+(av.avisos.length>1?' (e mais '+(av.avisos.length-1)+')':'')+'</div>', '<button type="button" class="cp-b" data-cp="abrir">Ver no painel</button>', true, 20000);
        return;
      }
    }
    if(L.length && !S.aberto && ls(chave('licBalao')) !== L[0].id){
      ls(chave('licBalao'), L[0].id);
      var balAula = balao('<div class="cp-txt"><b>Aula nova:</b> '+esc(L[0].titulo)+(L[0].via_codigo?' (apareceu na via '+esc(L[0].via_codigo)+')':'')+'. Leva 1 minuto.</div>', '<button type="button" class="cp-b pri" data-cp-abrelic="'+esc(L[0].id)+'">Ler a aula</button>', true, 20000);
      if(balAula){ var bA = balAula.querySelector('[data-cp-abrelic]'); if(bA) bA.onclick = function(){ var id = bA.dataset.cpAbrelic; fecharBalao(); lerLicao(id); }; }
      return;
    }
    var pd = S.pd, hj = new Date().toISOString().slice(0,10);
    if(pd && pd.ok && !pd.indisponivel && !pd.respondida && !S.aberto && ls(chave('pdBalao')) !== hj){
      ls(chave('pdBalao'), hj);
      var balPd = balao('<div class="cp-txt"><b>Pergunta do dia:</b> tem uma pergunta nova esperando você. Leva 1 minuto.</div>', '<button type="button" class="cp-b pri" data-cp-abrepd="1">Responder agora</button>', true, 20000);
      if(balPd){ var bP = balPd.querySelector('[data-cp-abrepd]'); if(bP) bP.onclick = function(){ fecharBalao(); perguntaDoDia(); }; }
    }
  }

  /* ---------- v4: perfil de bem-estar da equipe (só diretoria) ---------- */
  var PESO = { otima:2, bem:1, tranquila:1, sim:1, musica:1, cafe:1, elogio:1, descanso:0, cansada:-1, corrida:-1, mais_ou_menos:-1, nao:-1, dor:-1, cansaco:-1, preocupada:-2, triste:-2, dificil:-2, mal:-2 };
  var NOME_P = { humor:'Humor', agua:'Água', corpo:'Corpo', sono:'Sono', vida:'Vida fora da loja', dia:'O que alegra' };
  async function verEquipe(){
    var box = document.getElementById('cpEquipe'); if(!box) return;
    box.innerHTML = '<div class="cp-meta-s">Carregando…</div>';
    var r = await api({ op:'equipe' });
    if(!r || !r.ok){ box.innerHTML = '<div class="cp-meta-s">'+esc((r&&r.error)||'Não consegui carregar.')+'</div>'; return; }
    if(!r.pessoas.length){ box.innerHTML = '<div class="cp-meta-s">Ninguém respondeu ainda. As perguntas aparecem aos poucos, só para quem aceitar.</div>'; return; }
    box.innerHTML = '<div class="cp-meta-s">Últimos 45 dias. Só aparece quem aceitou responder. Use para cuidar da equipe, nunca para cobrar ou punir.</div>' + r.pessoas.map(function(p){
      var rs = p.respostas||[], soma = rs.reduce(function(s,x){ return s + (PESO[x.resposta]||0); }, 0), media = rs.length ? soma/rs.length : 0;
      var sinal = !rs.length ? '' : media <= -0.8 ? ' <span style="color:#c62828;font-weight:700;">· atenção</span>' : media >= 0.8 ? ' <span style="color:#1f9a55;font-weight:700;">· bem</span>' : ' <span style="color:#a8803a;font-weight:700;">· oscilando</span>';
      var ult = {}; rs.forEach(function(x){ if(!ult[x.pergunta]) ult[x.pergunta] = x; });
      var textos = rs.filter(function(x){ return x.detalhe; }).slice(0,5);
      return '<div class="cp-be"><b>'+esc(p.nome||'—')+'</b>'+sinal+'<div class="m">'+(p.aceito===false?'Preferiu não participar.':rs.length+' respostas')+'</div>'
        + (Object.keys(ult).length ? '<div class="r">' + Object.keys(ult).map(function(k){ var x = ult[k], pz = PESO[x.resposta]||0; return '<span class="'+(pz<0?'ruim':pz>0?'bom':'')+'">'+esc(NOME_P[k]||k)+': '+esc(String(x.resposta).replace(/_/g,' '))+'</span>'; }).join('') + '</div>' : '')
        + (textos.length ? '<details><summary>O que contou ('+textos.length+')</summary>' + textos.map(function(x){ return '<div style="margin-top:4px;">“'+esc(x.detalhe)+'” <span class="m">'+new Date(x.criado_em).toLocaleDateString('pt-BR')+'</span></div>'; }).join('') + '</details>' : '')
        + '</div>';
    }).join('');
  }

  /* ---------- mensagem pronta: a vendedora revisa e envia (clique) ---------- */
  /* 23/11: a mensagem automática saiu daqui. Quem chama a cliente é a vendedora, pelo telefone, com o roteiro na tela. */
  async function perguntar(texto){
    texto = String(texto||'').trim(); if(!texto) return;
    var ta = document.getElementById('cpTexto'); if(ta) ta.value = '';
    S.hist.push({ de:'eu', texto:texto }); desenhar();
    var chat = document.getElementById('cpChat'); if(chat){ chat.insertAdjacentHTML('beforeend','<div class="cp-msg ia" id="cpPensa">Pensando…</div>'); chat.scrollIntoView({ block:'end' }); }
    var perg = ehAdm() ? comContextoAdm(texto) : texto;   // 23/11
    var r = ehOficina()
      ? await apiX({ op:'perguntar', pergunta:perg, historico:S.hist.slice(-7,-1) })
      : await apiS({ op:'perguntar', pergunta:perg, historico:S.hist.slice(-7,-1) });
    if(r && r.sem && !ehOficina()) r = await api({ op:'perguntar', pergunta:perg, historico:S.hist.slice(-7,-1) });
    var resp = r && r.ok ? r.resposta : ((r && r.error) || 'Não consegui responder agora.');
    S.hist.push({ de:'ia', texto:resp }); desenhar();
    var c2 = document.getElementById('cpChat'); if(c2) c2.scrollIntoView({ block:'end' });
  }

  var vigia = null;
  async function iniciar(o){
    parar();
    if(!o || !o.senha || !o.user) return;
    S.senha = o.senha; S.user = o.user; S.lojaNome = o.lojaNome || ''; S.hist = []; S.recados = [];
    css(); vigiarToastSistema();
    var r = ehOficina() ? await apiX({ op:'dia' }) : await api({ op:'dia', lojaId: lojaShell() });
    if(!r || !r.ok || r.desligado || r.sem) return;   // fora da produção (sem a função) ou sem permissão: não aparece
    if(S.senha !== o.senha) return;
    S.dia = r; S.recados = r.recados || [];
    var b = document.createElement('button'); b.type = 'button'; b.id = 'cpFab'; b.className = 'cp-fab';
    b.onclick = function(){ if(S.aberto) fecharPainel(); else abrirPainel(); };
    document.body.appendChild(b); pintarFab();
    if(!ehOficina()) carregarRecados().catch(function(){});   // recado/pendência já aparece no contador do botão
    if(ehAdm()){ carregarControles().then(function(){ talvezDica(); }).catch(function(){}); }   // 23/11
    else setTimeout(talvezDica, 5000);   // saudação do dia; as outras dicas vêm ao abrir os módulos
    setTimeout(function(){ avisosIniciais().catch(function(){}); }, 12000);   // v6: aula nova / avisos da diretoria
    clearInterval(vigia); vigia = setInterval(function(){ if(!document.hidden && !S.aberto){ carregarRecados().catch(function(){}); if(ehAdm()) carregarControles().catch(function(){}); else if(!ehOficina()) carregarLicoes().catch(function(){}); } }, 10*60000);
  }
  function parar(){
    clearInterval(vigia); vigia = null; clearTimeout(S._balaoAdiado); fecharBalao(); fecharPainel();
    var b = document.getElementById('cpFab'); if(b) b.remove();
    S.senha = null; S.user = null; S.dia = null; S.hist = []; S.recados = []; S.ctrl = null;
  }
  /** O app trocou de loja: refaz o dia para a loja nova (fica guardado por loja). */
  async function trocouLoja(){
    if(!S.senha || !document.getElementById('cpFab') || ehOficina()) return;
    var r = await api({ op:'dia', lojaId: lojaShell() });
    if(r && r.ok){ S.dia = r; pintarFab(); desenhar(); }
  }
  window.Copiloto = { iniciar:iniciar, parar:parar, abrir:abrirPainel, trocouLoja:trocouLoja, moduloAberto:moduloAberto };
})();
