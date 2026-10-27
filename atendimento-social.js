/* atendimento-social.js — módulo Atendimento:
   (1) cartão de CONTEXTO nas mensagens (anúncio / story / post / encaminhada / citação / link) + faixa "veio do anúncio" no topo da conversa;
   (2) painel "💬 Comentários" (Instagram, Facebook e avaliações do Google) com sincronizar, responder, ✨ sugerir, ocultar e responder no privado.
   Usa os globais do atendimento.html: estado, escapeHtml, showToast, abrirModal, fecharModal, api, SUPABASE_URL, SUPABASE_ANON_KEY, __gatewaySenha.
   Backend: Edge Function atendimento-social. */
(function(){
  const SOCIAL_URL = SUPABASE_URL + '/functions/v1/atendimento-social';
  async function social(body){
    try{
      const res = await fetch(SOCIAL_URL, { method:'POST', headers:{ 'Content-Type':'application/json', 'apikey':SUPABASE_ANON_KEY, 'Authorization':'Bearer '+SUPABASE_ANON_KEY }, body: JSON.stringify({ senha: __gatewaySenha, ...body }) });
      return await res.json();
    }catch(e){ return { error:String(e) }; }
  }
  window.socialApi = social;

  /* ---------- estilos ---------- */
  const css = `
.ctx-card{display:block;border-left:3px solid var(--accent,#8b5cf6);background:rgba(0,0,0,.045);border-radius:8px;padding:6px 8px;margin:2px 0 6px;font-size:12.5px;line-height:1.35;white-space:normal;}
.ctx-card .ctx-lbl{font-size:11.5px;font-weight:700;color:var(--accent,#7c3aed);margin-bottom:3px;}
.ctx-card .ctx-row{display:flex;gap:8px;align-items:flex-start;}
.ctx-card img.ctx-img{width:64px;height:64px;object-fit:cover;border-radius:6px;flex-shrink:0;margin:0;cursor:zoom-in;background:rgba(0,0,0,.06);}
.ctx-card .ctx-tt{font-weight:700;}
.ctx-card .ctx-tx{color:var(--ink-soft,#555);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.ctx-card a.ctx-a{display:inline-block;margin-top:4px;font-weight:700;font-size:12px;color:#1D4ED8;text-decoration:none;}
.ctx-card.ctx-encaminhada{border-left-color:#94a3b8;padding:2px 8px;background:none;}
.ctx-card.ctx-encaminhada .ctx-lbl{color:#64748b;font-weight:600;font-style:italic;margin:0;}
.ctx-card.ctx-citacao{border-left-color:#10b981;}
.ctx-card.ctx-citacao .ctx-lbl{color:#059669;}
.ctx-origem{align-self:center;max-width:92%;display:flex;gap:10px;align-items:center;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:12px;padding:6px 12px;font-size:12.5px;margin:4px 0 8px;}
.ctx-origem img{width:36px;height:36px;object-fit:cover;border-radius:6px;}
.ctx-origem a{color:#c2410c;font-weight:700;text-decoration:none;white-space:nowrap;}
.cm-filtros{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0 10px;}
.cm-seg{display:inline-flex;border:1px solid var(--line,#ddd);border-radius:999px;overflow:hidden;}
.cm-seg button{border:0;background:transparent;padding:6px 11px;font-size:12.5px;cursor:pointer;color:var(--ink,#222);}
.cm-seg button.on{background:var(--accent,#7c3aed);color:#fff;}
.cm-cfg{border:1px solid var(--line,#ddd);border-radius:10px;padding:8px 10px;margin-bottom:10px;font-size:12.5px;}
.cm-cfg summary{cursor:pointer;font-weight:700;}
.cm-cfg .l{display:flex;gap:6px;align-items:flex-start;margin-top:6px;}
.cm-post{border:1px solid var(--line,#ddd);border-radius:12px;margin-bottom:12px;overflow:hidden;}
.cm-post-h{display:flex;gap:10px;align-items:center;padding:8px 10px;background:var(--surface-2,#f6f6f6);}
.cm-post-h img{width:48px;height:48px;object-fit:cover;border-radius:8px;flex-shrink:0;}
.cm-post-h .lg{flex:1;min-width:0;font-size:12.5px;color:var(--ink-soft,#555);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cm-post-h a{font-size:12px;font-weight:700;white-space:nowrap;color:#1D4ED8;text-decoration:none;}
.cm-badge{font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;color:#fff;white-space:nowrap;}
.cm-badge.instagram{background:linear-gradient(45deg,#f58529,#dd2a7b,#8134af);} .cm-badge.facebook{background:#1877f2;} .cm-badge.google{background:#34a853;}
.cm-item{padding:10px 12px;border-top:1px solid var(--line,#eee);}
.cm-item .cm-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;}
.cm-item .cm-tx{margin:4px 0 6px;font-size:13.5px;white-space:pre-wrap;word-wrap:break-word;}
.cm-item .cm-resp{font-size:12.5px;background:#ecfdf5;border-radius:8px;padding:5px 8px;margin-bottom:6px;color:#065f46;}
.cm-item textarea{width:100%;box-sizing:border-box;min-height:52px;border:1px solid var(--line,#ddd);border-radius:8px;padding:6px 8px;font:inherit;font-size:13px;resize:vertical;}
.cm-item .cm-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
.cm-pill{font-size:11px;background:var(--surface-2,#f1f1f1);border-radius:999px;padding:1px 7px;color:var(--ink-soft,#555);}
.cm-stars{color:#f59e0b;letter-spacing:1px;}
.cm-res{font-size:12.5px;margin:0 0 10px;}
.cm-res div{padding:2px 0;}
@media(max-width:760px){.cm-seg button{padding:6px 8px;}}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* =================== (1) CONTEXTO DAS MENSAGENS =================== */
  const ctxCache = {};               // mensagemId -> contexto
  const ctxConv = { id:null, ate:null, vistos:new Set(), origem:null, carregando:false };
  const urlCtx = {};                 // storage path -> signed url
  const linkSeguro = u => (typeof u==='string' && /^https?:\/\//i.test(u)) ? u : '';
  const ROT = { anuncio:'📣 Veio do anúncio', story:'📖 Respondeu ao story', post:'↪️ Compartilhou um post', link:'🔗 Link de referência', citacao:'💬 Citando:', encaminhada:'↪️ Encaminhada' };

  function ctxDe(m){ return (m && m.contexto) || (m && ctxCache[m.id]) || null; }
  function ctxCardHtml(m){
    const c = ctxDe(m); if(!c || !c.tipo) return '';
    const e = escapeHtml;
    if(c.tipo==='encaminhada') return `<div class="ctx-card ctx-encaminhada"><div class="ctx-lbl">${c.muito_encaminhada?'↪️↪️ Encaminhada com frequência':'↪️ Encaminhada'}</div></div>`;
    if(c.tipo==='citacao') return `<div class="ctx-card ctx-citacao"><div class="ctx-lbl">💬 Citando:${c.encaminhada?' <span style="font-weight:400;color:#64748b">· ↪️ encaminhada</span>':''}</div><div class="ctx-tx">${e(c.texto||'mensagem anterior')}</div></div>`;
    let lbl = ROT[c.tipo] || '🔗 Contexto';
    if(c.tipo==='story' && c.mencao) lbl = '📖 Mencionou você no story';
    if(c.tipo==='post' && /reel/i.test(c.titulo||'')) lbl = '🎬 Compartilhou um reel';
    const img = c.imagem_path ? `<img class="ctx-img" data-ctxpath="${e(c.imagem_path)}" alt="">` : (linkSeguro(c.imagem) ? `<img class="ctx-img" src="${e(c.imagem)}" alt="" onerror="this.remove()">` : '');
    const url = linkSeguro(c.url);
    const tt = (c.titulo && !(c.tipo==='post' && /compartilhado$/i.test(c.titulo))) ? `<div class="ctx-tt">${e(c.titulo)}</div>` : '';
    const tx = c.texto ? `<div class="ctx-tx">${e(c.texto)}</div>` : '';
    const orig = (c.tipo==='anuncio' && c.origem) ? ` <span style="font-weight:400;color:var(--ink-faint,#888)">· ${e(String(c.origem).toLowerCase())}</span>` : '';
    return `<div class="ctx-card ctx-${e(c.tipo)}"><div class="ctx-lbl">${lbl}${orig}${c.encaminhada?' · ↪️':''}</div>${(img||tt||tx)?`<div class="ctx-row">${img}<div style="min-width:0">${tt}${tx}</div></div>`:''}${url?`<a class="ctx-a" href="${e(url)}" target="_blank" rel="noopener noreferrer">Abrir link ↗</a>`:''}</div>`;
  }
  window.ctxCardHtml = ctxCardHtml;

  async function carregarImgsCtx(raiz){
    (raiz||document).querySelectorAll('img[data-ctxpath]:not([data-ok])').forEach(async el=>{
      el.dataset.ok = '1';
      const p = el.dataset.ctxpath; let u = urlCtx[p];
      if(!u){ const r = await api({ op:'midiaUrl', path:p }); if(r && r.url){ u = r.url; urlCtx[p] = u; } }
      if(!u){ el.remove(); return; }
      el.src = u;
      el.addEventListener('click', ()=>{ const z = document.getElementById('zoomImg'), zz = document.getElementById('zoom'); if(z && zz){ z.src = u; zz.style.display='flex'; } });
    });
  }
  function aplicarCtxDom(){
    const wrap = document.getElementById('msgs'); if(!wrap) return;
    wrap.querySelectorAll('.bubble[data-mid]').forEach(b=>{
      if(b.querySelector('.ctx-card')) return;
      const c = ctxCache[b.dataset.mid]; if(!c) return;
      const h = ctxCardHtml({ id:b.dataset.mid }); if(!h) return;
      const autor = b.querySelector(':scope > .autor');
      if(autor) autor.insertAdjacentHTML('afterend', h); else b.insertAdjacentHTML('afterbegin', h);
    });
    carregarImgsCtx(wrap);
  }
  function renderOrigem(){
    const wrap = document.getElementById('msgs'); const c = estado.atual; if(!wrap || !c) return;
    const o = c.contexto_origem || ctxConv.origem; const velho = document.getElementById('ctxOrigem');
    if(!o){ if(velho) velho.remove(); return; }
    if(velho) return;
    const e = escapeHtml, url = linkSeguro(o.url);
    const img = o.imagem_path ? `<img data-ctxpath="${e(o.imagem_path)}" alt="">` : (linkSeguro(o.imagem) ? `<img src="${e(o.imagem)}" alt="" onerror="this.remove()">` : '');
    const html = `<div class="ctx-origem" id="ctxOrigem">${img}<div>${o.tipo==='anuncio'?'📣 Conversa veio de um <b>anúncio</b>':'🔗 Conversa veio de um <b>link de referência</b>'}${o.titulo?': '+e(o.titulo):''}${o.em?` <span style="opacity:.75">(${new Date(o.em).toLocaleDateString('pt-BR')})</span>`:''}</div>${url?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a>`:''}</div>`;
    const ant = document.getElementById('btnAntigas');
    if(ant) ant.insertAdjacentHTML('afterend', html); else wrap.insertAdjacentHTML('afterbegin', html);
    carregarImgsCtx(wrap);
  }
  async function socialCtxRender(){
    const c = estado.atual; if(!c) return;
    if(ctxConv.id!==c.id){ ctxConv.id = c.id; ctxConv.ate = null; ctxConv.vistos = new Set(); ctxConv.origem = null; }
    aplicarCtxDom(); renderOrigem();
    const msgs = estado.mensagens || [];
    if(msgs.length && msgs.every(m=>Object.prototype.hasOwnProperty.call(m,'contexto'))) return; // a API já devolve o contexto
    const novos = msgs.filter(m=>m.id && !ctxConv.vistos.has(m.id));
    if(!novos.length || ctxConv.carregando) return;
    ctxConv.carregando = true; const convId = c.id;
    const ate = msgs.reduce((mx,m)=> (m.enviada_em && (!mx || m.enviada_em>mx)) ? m.enviada_em : mx, null);
    try{
      const r = await social({ op:'contextos', conversaId: convId, depoisDe: ctxConv.ate || undefined });
      if(ctxConv.id!==convId) return;
      novos.forEach(m=>ctxConv.vistos.add(m.id));
      if(r && r.ok){ Object.assign(ctxCache, r.data||{}); if(r.origem) ctxConv.origem = r.origem; ctxConv.ate = ate; }
    }finally{ ctxConv.carregando = false; }
    if(estado.atual && estado.atual.id===convId){ aplicarCtxDom(); renderOrigem(); }
  }
  window.socialCtxRender = socialCtxRender;

  /* =================== (2) COMENTÁRIOS =================== */
  const cm = { bot:'', plat:'', status:'pendentes', lista:null, cfg:null, buscou:false };
  const PLAT = { instagram:'📸 Instagram', facebook:'📘 Facebook', google:'⭐ Google' };
  const nomeBot = id => { const b = (estado.bots||[]).find(x=>x.id===id) || ((cm.cfg&&cm.cfg.bots)||[]).find(x=>x.botId===id); return b ? (b.nome) : ''; };
  function quando(iso){
    if(!iso) return ''; const d = new Date(iso); const s = (Date.now()-d.getTime())/1000;
    if(s<60) return 'agora'; if(s<3600) return `há ${Math.floor(s/60)} min`; if(s<86400) return `há ${Math.floor(s/3600)} h`; if(s<7*86400) return `há ${Math.floor(s/86400)} d`;
    return d.toLocaleDateString('pt-BR');
  }
  const estrelas = n => n ? `<span class="cm-stars" title="${n} estrela(s)">${'★'.repeat(n)}${'☆'.repeat(5-n)}</span>` : '';

  async function atualizarBadge(){
    if(!__gatewaySenha || document.hidden) return;
    const r = await social({ op:'pendentes' });
    const el = document.getElementById('n_coment'); if(!el || !r || !r.ok) return;
    el.textContent = r.total ? (r.total>99?'99+':String(r.total)) : '';
  }

  function abrirComentarios(){
    abrirModal(`<h2 style="margin-top:0">💬 Comentários e avaliações</h2>
      <div class="cm-filtros">
        <select class="busca" id="cmBot" style="max-width:200px;margin:0"><option value="">Todos os bots</option>${(estado.bots||[]).map(b=>`<option value="${b.id}" ${cm.bot===b.id?'selected':''}>${escapeHtml(b.nome)}</option>`).join('')}</select>
        <div class="cm-seg" id="cmPlat">${[['','Todas'],['instagram','📸 Instagram'],['facebook','📘 Facebook'],['google','⭐ Google']].map(([v,t])=>`<button data-v="${v}" class="${cm.plat===v?'on':''}">${t}</button>`).join('')}</div>
        <div class="cm-seg" id="cmSt">${[['pendentes','Pendentes'],['respondidos','Respondidos'],['todos','Todos']].map(([v,t])=>`<button data-v="${v}" class="${cm.status===v?'on':''}">${t}</button>`).join('')}</div>
        <button class="btn btn-sm btn-accent" id="cmBuscar">🔎 Buscar</button>
        <button class="btn btn-sm" id="cmSync" title="Puxa os comentários recentes direto do Instagram, Facebook e Google">🔄 Sincronizar</button>
        <button class="btn btn-sm" id="cmFechar" style="margin-left:auto">Fechar</button>
      </div>
      <div id="cmCfg"></div><div id="cmRes"></div>
      <div id="cmLista"><p class="muted">Escolha os filtros e clique em <b>🔎 Buscar</b> (ou <b>🔄 Sincronizar</b> para puxar os mais novos das redes).</p></div>`);
    document.getElementById('modalBox').classList.add('largo');
    document.getElementById('cmFechar').onclick = fecharModal;
    document.getElementById('cmBot').onchange = e=>{ cm.bot = e.target.value; if(cm.buscou) listar(); renderCfg(); };
    document.querySelectorAll('#cmPlat button').forEach(b=> b.onclick = ()=>{ cm.plat = b.dataset.v; document.querySelectorAll('#cmPlat button').forEach(x=>x.classList.toggle('on', x===b)); if(cm.buscou) listar(); });
    document.querySelectorAll('#cmSt button').forEach(b=> b.onclick = ()=>{ cm.status = b.dataset.v; document.querySelectorAll('#cmSt button').forEach(x=>x.classList.toggle('on', x===b)); if(cm.buscou) listar(); });
    document.getElementById('cmBuscar').onclick = listar;
    document.getElementById('cmSync').onclick = sincronizar;
    carregarCfg();
  }
  window.abrirComentarios = abrirComentarios;

  async function carregarCfg(){
    const r = await social({ op:'status' });
    if(!r || !r.ok){ const el = document.getElementById('cmCfg'); if(el) el.innerHTML = `<div class="cm-cfg">⚠️ ${escapeHtml((r&&r.error)||'Não foi possível ler a configuração (a função atendimento-social foi publicada?)')}</div>`; return; }
    cm.cfg = r; renderCfg();
  }
  function renderCfg(){
    const el = document.getElementById('cmCfg'); if(!el || !cm.cfg) return;
    const bs = cm.cfg.bots.filter(b=>!cm.bot || b.botId===cm.bot);
    const faltando = bs.reduce((n,b)=> n + ['instagram','facebook','google'].filter(p=>!b[p].configurado).length, 0);
    el.innerHTML = `<details class="cm-cfg"><summary>⚙️ Canais conectados ${faltando?`<span class="cm-pill">${faltando} pendente(s) de configuração</span>`:'<span class="cm-pill">tudo certo</span>'}</summary>
      ${bs.map(b=>`<div style="margin-top:8px"><b>🤖 ${escapeHtml(b.nome)}</b>${cm.cfg.gestao?` <button class="btn btn-sm" data-g="${b.botId}" style="margin-left:6px">⭐ Configurar Google</button>`:''}
        ${['instagram','facebook','google'].map(p=>`<div class="l"><span>${b[p].configurado?'✅':'⚠️'}</span><span><b>${PLAT[p]}</b>${b[p].conta?' · '+escapeHtml(b[p].conta):''}${b[p].configurado?'':' — '+escapeHtml(b[p].motivo||'não configurado')}</span></div>`).join('')}</div>`).join('')}
      <div class="muted" style="margin-top:8px">Tempo real: no app da Meta assine <b>comments</b> (Instagram) e <b>feed</b> (Página) no webhook <b>${escapeHtml(SUPABASE_URL)}/functions/v1/atendimento-webhook</b>. Sem isso, use 🔄 Sincronizar.</div></details>`;
    el.querySelectorAll('[data-g]').forEach(b=> b.onclick = ()=> configurarGoogle(b.dataset.g));
  }

  async function sincronizar(){
    const bt = document.getElementById('cmSync'); bt.disabled = true; bt.textContent = '⏳ Sincronizando…';
    const r = await social({ op:'sincronizar', botId: cm.bot || undefined, plataforma: cm.plat || undefined });
    bt.disabled = false; bt.textContent = '🔄 Sincronizar';
    const res = document.getElementById('cmRes'); if(!res) return;
    if(!r || !r.ok){ res.innerHTML = `<div class="cm-res">⚠️ ${escapeHtml((r&&r.error)||'Erro ao sincronizar')}</div>`; return; }
    res.innerHTML = `<div class="cm-res">${r.resultado.map(x=>`<div>${x.status==='ok'?'✅':x.status==='nao_configurado'?'⚪':'⚠️'} <b>${escapeHtml(x.bot)}</b> · ${PLAT[x.plataforma]||x.plataforma}: ${x.status==='ok'?`${x.comentarios} comentário(s) lidos${x.conta?' ('+escapeHtml(x.conta)+')':''}`:escapeHtml(x.motivo||'')}</div>`).join('')}</div>`;
    await listar(); atualizarBadge();
  }

  async function listar(){
    cm.buscou = true;
    const box = document.getElementById('cmLista'); if(!box) return;
    box.innerHTML = '<p class="muted">Carregando…</p>';
    const r = await social({ op:'listar', botId: cm.bot || undefined, plataforma: cm.plat || undefined, status: cm.status });
    if(!r || !r.ok){ box.innerHTML = `<p>⚠️ ${escapeHtml((r&&r.error)||'Erro')}</p>`; return; }
    cm.lista = r.data || [];
    renderLista(r.aviso);
  }
  function renderLista(aviso){
    const box = document.getElementById('cmLista'); if(!box) return;
    const l = cm.lista || [];
    if(!l.length){ box.innerHTML = `<p class="muted">${aviso?escapeHtml(aviso):cm.status==='pendentes'?'Nenhum comentário pendente. 🎉':'Nada encontrado com esses filtros.'}</p>`; return; }
    const grupos = []; const idx = {};
    l.forEach(c=>{ const k = c.plataforma+'|'+(c.post_id||'')+'|'+(c.bot_id||''); if(!(k in idx)){ idx[k] = grupos.length; grupos.push({ k, itens:[], c }); } grupos[idx[k]].itens.push(c); });
    const gestao = !!(cm.cfg && cm.cfg.gestao) || !!estado.gestao;
    box.innerHTML = grupos.map(g=>{
      const c = g.c, e = escapeHtml, url = linkSeguro(c.post_url);
      const thumb = linkSeguro(c.post_thumb) ? `<img src="${e(c.post_thumb)}" alt="" onerror="this.style.visibility='hidden'">` : '';
      const tit = c.plataforma==='google' ? `Avaliações do Google${nomeBot(c.bot_id)?' — '+e(nomeBot(c.bot_id)):''}` : (c.post_legenda ? e(c.post_legenda) : '<i>(post sem legenda)</i>');
      return `<div class="cm-post"><div class="cm-post-h">${thumb}<span class="cm-badge ${e(c.plataforma)}">${PLAT[c.plataforma]||e(c.plataforma)}</span><div class="lg" title="${e(c.post_legenda||'')}">${tit}</div>${url?`<a href="${e(url)}" target="_blank" rel="noopener noreferrer">Abrir post ↗</a>`:''}</div>
        ${g.itens.map(x=>itemHtml(x, gestao)).join('')}</div>`;
    }).join('');
    box.querySelectorAll('.cm-item').forEach(el=>{
      const id = el.dataset.id; const ta = el.querySelector('textarea');
      const on = (sel, fn)=>{ const b = el.querySelector(sel); if(b) b.onclick = ()=> fn(b); };
      on('[data-a=resp]', b=> responder(id, ta, b, false));
      on('[data-a=priv]', b=> responder(id, ta, b, true));
      on('[data-a=sug]', b=> sugerir(id, ta, b));
      on('[data-a=ocu]', b=> ocultar(id, b));
      on('[data-a=marc]', b=> marcar(id, b));
    });
  }
  function itemHtml(x, gestao){
    const e = escapeHtml; const google = x.plataforma==='google';
    return `<div class="cm-item" data-id="${e(x.id)}">
      <div class="cm-top"><b>${e(x.autor_nome||'Sem nome')}</b>${estrelas(x.nota)}<span class="muted">${quando(x.criado_em)}</span>${x.pai_externo_id?'<span class="cm-pill">↳ resposta a outro comentário</span>':''}${x.oculto?'<span class="cm-pill">🙈 oculto</span>':''}${x.privado_em?'<span class="cm-pill">🔒 respondido no privado</span>':''}${!cm.bot&&nomeBot(x.bot_id)?`<span class="cm-pill">🤖 ${e(nomeBot(x.bot_id))}</span>`:''}</div>
      <div class="cm-tx">${x.texto?e(x.texto):'<span class="muted">(sem texto)</span>'}</div>
      ${x.respondido?`<div class="cm-resp">✅ Respondido${x.respondido_por?' por <b>'+e(x.respondido_por)+'</b>':''}${x.respondido_em?' '+quando(x.respondido_em):''}${x.resposta?': “'+e(x.resposta)+'”':''}</div>`:''}
      <textarea placeholder="${google?'Resposta pública à avaliação…':'Resposta pública ao comentário…'}"></textarea>
      <div class="cm-acts">
        <button class="btn btn-sm btn-accent" data-a="resp">${x.respondido?'Responder de novo':'Responder'}</button>
        <button class="btn btn-sm" data-a="sug" title="A IA escreve uma sugestão (você revisa antes de enviar)">✨ Sugerir</button>
        ${!google && !x.privado_em?`<button class="btn btn-sm" data-a="priv" title="Manda o texto como mensagem privada (direct/Messenger) para quem comentou — só 1 vez por comentário, até 7 dias">🔒 Responder no privado</button>`:''}
        ${!google && gestao?`<button class="btn btn-sm" data-a="ocu">${x.oculto?'👁️ Mostrar':'🙈 Ocultar'}</button>`:''}
        <button class="btn btn-sm" data-a="marc" title="Só muda o status aqui no sistema, não publica nada">${x.respondido?'↩ Voltar p/ pendente':'✔ Marcar como respondido'}</button>
      </div></div>`;
  }
  async function responder(id, ta, b, privado){
    const texto = (ta.value||'').trim(); if(!texto){ showToast('Escreva a resposta.'); ta.focus(); return; }
    if(privado && !confirm('Enviar este texto como mensagem PRIVADA para quem comentou? (a Meta permite só uma por comentário)')) return;
    b.disabled = true; const t0 = b.textContent; b.textContent = '⏳';
    const r = await social({ op: privado?'responderPrivado':'responder', id, texto });
    b.disabled = false; b.textContent = t0;
    if(!r || !r.ok){ showToast((r&&r.error)||'Erro ao responder'); return; }
    showToast(r.aviso || (privado?'Mensagem privada enviada.':'Resposta publicada.'));
    const it = (cm.lista||[]).find(x=>x.id===id);
    if(it){ if(privado) it.privado_em = new Date().toISOString(); else { it.respondido = true; it.resposta = texto; it.respondido_por = estado.meuNome||'você'; it.respondido_em = new Date().toISOString(); } }
    if(!privado && cm.status==='pendentes') cm.lista = (cm.lista||[]).filter(x=>x.id!==id);
    renderLista(); atualizarBadge();
  }
  async function sugerir(id, ta, b){
    b.disabled = true; const t0 = b.textContent; b.textContent = '⏳ pensando…';
    const r = await social({ op:'sugerirComentario', id });
    b.disabled = false; b.textContent = t0;
    if(!r || !r.ok){ showToast((r&&r.error)||'IA indisponível'); return; }
    ta.value = r.texto || ''; ta.focus();
  }
  async function ocultar(id, b){
    const it = (cm.lista||[]).find(x=>x.id===id); const ocultarJa = !(it && it.oculto);
    if(ocultarJa && !confirm('Ocultar este comentário na rede social? (só quem comentou e os amigos dele continuam vendo)')) return;
    b.disabled = true;
    const r = await social({ op:'ocultar', id, ocultar: ocultarJa });
    b.disabled = false;
    if(!r || !r.ok){ showToast((r&&r.error)||'Erro'); return; }
    if(it) it.oculto = ocultarJa;
    if(ocultarJa && cm.status==='pendentes') cm.lista = (cm.lista||[]).filter(x=>x.id!==id);
    showToast(ocultarJa?'Comentário ocultado.':'Comentário visível de novo.'); renderLista(); atualizarBadge();
  }
  async function marcar(id, b){
    const it = (cm.lista||[]).find(x=>x.id===id); const novo = !(it && it.respondido);
    b.disabled = true; const r = await social({ op:'marcar', id, respondido: novo }); b.disabled = false;
    if(!r || !r.ok){ showToast((r&&r.error)||'Erro'); return; }
    if(it){ it.respondido = novo; if(novo){ it.respondido_por = (estado.meuNome||'você')+' (marcado)'; it.respondido_em = new Date().toISOString(); } }
    if((novo && cm.status==='pendentes') || (!novo && cm.status==='respondidos')) cm.lista = (cm.lista||[]).filter(x=>x.id!==id);
    renderLista(); atualizarBadge();
  }

  /* ---------- configuração do Google (gestão) ---------- */
  function configurarGoogle(botId){
    const b = cm.cfg && cm.cfg.bots.find(x=>x.botId===botId); const g = (b && b.google) || {};
    abrirModal(`<h2 style="margin-top:0">⭐ Google (Perfil da Empresa) — ${escapeHtml((b&&b.nome)||'')}</h2>
      <p class="muted" style="margin-top:0">1) No Google Cloud (mesma conta dona do Perfil da Empresa) ative a <b>Google My Business API</b>, a <b>My Business Account Management API</b> e a <b>My Business Business Information API</b> (o Google precisa aprovar o acesso à API do Perfil da Empresa).<br>
      2) Crie uma credencial <b>OAuth (Aplicativo da Web)</b> com o redirecionamento <code>https://developers.google.com/oauthplayground</code>.<br>
      3) No <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener">OAuth Playground</a> (⚙️ › “Use your own OAuth credentials”), autorize o escopo <code>https://www.googleapis.com/auth/business.manage</code> e troque o código pelo <b>refresh token</b>.<br>
      4) Cole abaixo, salve e clique em <b>Buscar locais</b> para escolher a loja.</p>
      <div class="field"><label>Client ID ${g.temCredenciais?'<span class="muted">(já salvo — deixe em branco para manter)</span>':''}</label><input id="gCid" autocomplete="off"></div>
      <div class="field"><label>Client secret</label><input id="gSec" type="password" autocomplete="new-password"></div>
      <div class="field"><label>Refresh token</label><input id="gRef" type="password" autocomplete="new-password"></div>
      <div id="gLocs" style="margin:8px 0"></div>
      <div class="rodape" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn btn-danger btn-sm" id="gRem">Remover Google deste bot</button>
        <button class="btn" id="gVoltar">Voltar</button><button class="btn" id="gLoc">Buscar locais</button><button class="btn btn-accent" id="gSalvar">Salvar</button></div>`);
    document.getElementById('modalBox').classList.add('largo');
    const val = id => (document.getElementById(id).value||'').trim() || undefined;
    const salvar = async extra => {
      const r = await social({ op:'configurarGoogle', botId, clientId: val('gCid'), clientSecret: val('gSec'), refreshToken: val('gRef'), ...(extra||{}) });
      if(!r || !r.ok){ showToast((r&&r.error)||'Erro ao salvar'); return false; } return true;
    };
    document.getElementById('gVoltar').onclick = ()=>{ abrirComentarios(); };
    document.getElementById('gSalvar').onclick = async ()=>{ if(await salvar()){ showToast('Google salvo.'); abrirComentarios(); } };
    document.getElementById('gRem').onclick = async ()=>{ if(!confirm('Remover as credenciais do Google deste bot?')) return; if(await salvar({ remover:true })){ showToast('Removido.'); abrirComentarios(); } };
    document.getElementById('gLoc').onclick = async ()=>{
      if(!(await salvar())) return;
      const box = document.getElementById('gLocs'); box.innerHTML = '<p class="muted">Buscando…</p>';
      const r = await social({ op:'googleLocais', botId });
      if(!r || !r.ok){ box.innerHTML = `<p>⚠️ ${escapeHtml((r&&r.error)||'Erro')}</p>`; return; }
      if(!r.locais.length){ box.innerHTML = '<p class="muted">Nenhum local encontrado nessa conta Google.</p>'; return; }
      box.innerHTML = r.locais.map((l,i)=> l.erro ? `<div class="cm-pill">⚠️ ${escapeHtml(l.conta)}: ${escapeHtml(l.erro)}</div>` : `<div class="cartao" style="display:flex;justify-content:space-between;gap:8px;align-items:center"><div><div class="t">${escapeHtml(l.titulo)}</div><div class="x">${escapeHtml(l.endereco||'')} · conta ${escapeHtml(l.conta)}</div></div><button class="btn btn-sm btn-accent" data-i="${i}">Usar este</button></div>`).join('');
      box.querySelectorAll('[data-i]').forEach(bt=> bt.onclick = async ()=>{ const l = r.locais[bt.dataset.i]; const ok = await social({ op:'configurarGoogle', botId, accountId:l.accountId, locationId:l.locationId, locationNome:l.titulo }); if(ok && ok.ok){ showToast('Local escolhido: '+l.titulo); abrirComentarios(); } else showToast((ok&&ok.error)||'Erro'); });
    };
  }

  /* ---------- botão + badge ---------- */
  const btn = document.getElementById('btnComentarios'); if(btn) btn.addEventListener('click', abrirComentarios);
  (function primeiro(){ if(typeof __gatewaySenha!=='undefined' && __gatewaySenha) atualizarBadge(); else setTimeout(primeiro, 5000); })();
  setInterval(atualizarBadge, 120000);
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) atualizarBadge(); });
})();
