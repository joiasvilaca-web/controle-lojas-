/* Avaliações dos clientes — parte da EQUIPE (09/11). Só gerente e diretoria veem as avaliações individuais;
 * o próprio atendente vê apenas a sua MÉDIA. Fala com a função retirada-terceiro (ações avaliacoes*).
 * AvaliacoesUI.render(el, {senha, lojaNome})      área completa (médias por atendente + lista com Responder)  → DP › Avaliações dos clientes
 * AvaliacoesUI.contarBaixas(senha)                 nº de avaliações com 3 estrelas ou menos ainda não lidas    → aviso no PAINEL
 * AvaliacoesUI.abrirBaixas(opts)                   popup com as notas baixas                                    → aviso no PAINEL
 * AvaliacoesUI.preencherMedias(el, senha)          preenche "★ 4,8 (12)" nos elementos [data-avnome]            → ficha do funcionário
 */
(function(){
  var URL_FN = (window.SUPABASE_URL || '') + '/functions/v1/retirada-terceiro';
  function anon(){ try{ return window.SUPABASE_ANON_KEY; }catch(e){ return ''; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function dh(s){ if(!s) return ''; var d=new Date(s); return isNaN(d)?'':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  function estrelas(n){ n=Number(n)||0; return '<span style="color:#f5b301;letter-spacing:1px;" aria-label="'+n+' estrelas">'+'★'.repeat(n)+'<span style="color:var(--t-line-strong,#c9cfd6);">'+'★'.repeat(5-n)+'</span></span>'; }
  async function chamar(body){
    try{ var r=await fetch(URL_FN,{ method:'POST', headers:{'Content-Type':'application/json',apikey:anon(),Authorization:'Bearer '+anon()}, body:JSON.stringify(body) }); return await r.json(); }
    catch(e){ return { error:'Sem conexão com o servidor.' }; }
  }
  var CSS='.av-card{border:1px solid var(--t-line,#dde);border-radius:12px;padding:12px 14px;margin:10px 0;background:var(--t-surface,#fff);}'
   +'.av-card.baixa{border-color:var(--t-danger,#b3261e);}'
   +'.av-top{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--t-ink-soft,#445);}'
   +'.av-com{margin:8px 0;white-space:pre-wrap;font-size:14px;}'
   +'.av-resp{margin-top:8px;padding:8px 10px;border-radius:8px;background:var(--t-surface-2,#f4f6f8);font-size:13px;white-space:pre-wrap;}'
   +'.av-b{min-height:36px;padding:0 12px;border-radius:8px;border:1px solid var(--t-line-strong,#bcc);background:var(--t-surface,#fff);color:inherit;font:inherit;font-weight:600;cursor:pointer;}'
   +'.av-b.pri{background:var(--t-primary-strong,#1f5f7a);border-color:var(--t-primary-strong,#1f5f7a);color:#fff;}'
   +'.av-b:disabled{opacity:.6;}'
   +'.av-ov{position:fixed;inset:0;z-index:9500;background:rgba(10,20,30,.45);display:flex;align-items:flex-start;justify-content:center;padding:5vh 12px;overflow:auto;}'
   +'.av-modal{background:var(--t-surface,#fff);color:var(--t-ink,#111);border-radius:14px;max-width:640px;width:100%;padding:18px;box-shadow:0 18px 50px rgba(0,0,0,.25);}';
  function css(){ if(document.getElementById('avuiCss')) return; var s=document.createElement('style'); s.id='avuiCss'; s.textContent=CSS; document.head.appendChild(s); }

  function cardHtml(a, lojaNome){
    var baixa=a.estrelas<=3;
    return '<div class="av-card'+(baixa?' baixa':'')+'" data-id="'+esc(a.id)+'">'
      +'<div class="av-top"><span>'+estrelas(a.estrelas)+' &nbsp;<b>'+esc(a.cliente||'Cliente')+'</b> avaliou o atendimento de <b>'+esc(a.atendente||'—')+'</b></span><span>'+dh(a.criado_em)+'</span></div>'
      +'<div class="av-top" style="margin-top:2px;">'+(a.via_codigo?'Via '+esc(a.via_codigo)+' · ':'')+esc((lojaNome&&lojaNome(a.loja_id))||a.loja_id||'')+'</div>'
      +(a.comentario?'<div class="av-com">“'+esc(a.comentario)+'”</div>':'<div class="av-com" style="color:var(--t-ink-faint,#667);">Sem comentário.</div>')
      +(a.resposta?'<div class="av-resp"><b>Resposta enviada ao cliente</b> ('+esc(a.resposta.por||'')+', '+dh(a.resposta.em)+')<br>'+esc(a.resposta.texto)+'</div>':'')
      +'<div style="margin-top:8px;"><button class="av-b" data-resp>'+(a.resposta?'Editar resposta':'Responder')+'</button></div></div>';
  }
  function abrirResponder(a, senha, aoSalvar){
    css();
    var ov=document.createElement('div'); ov.className='av-ov';
    ov.innerHTML='<div class="av-modal"><h3 style="margin:0 0 6px;">Responder a '+esc(a.cliente||'cliente')+'</h3>'
      +'<div style="font-size:13px;margin-bottom:8px;">'+estrelas(a.estrelas)+(a.comentario?' — “'+esc(a.comentario)+'”':'')+'</div>'
      +'<textarea data-t maxlength="1500" style="width:100%;box-sizing:border-box;min-height:140px;padding:10px;border-radius:10px;border:1px solid var(--t-line-strong,#bcc);background:var(--t-field,#fff);color:inherit;font:inherit;" placeholder="Escreva a resposta que o cliente vai ver ao abrir a via">'+esc(a.resposta?a.resposta.texto:'')+'</textarea>'
      +'<div data-m style="font-size:13px;margin-top:6px;"></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between;margin-top:10px;"><span style="display:inline-flex;gap:8px;"><button class="av-b" data-ia>Corrigir com IA</button><button class="av-b" data-desf style="display:none;">Desfazer correção</button></span><span style="display:inline-flex;gap:8px;"><button class="av-b" data-x>Cancelar</button><button class="av-b pri" data-env>Enviar resposta</button></span></div></div>';
    document.body.appendChild(ov);
    var t=ov.querySelector('[data-t]'), m=ov.querySelector('[data-m]'), antes='';
    function msg(x,erro){ m.style.color=erro?'var(--t-danger,#b3261e)':'var(--t-ok,#0f6b40)'; m.textContent=x; }
    ov.querySelector('[data-x]').onclick=function(){ ov.remove(); };
    ov.querySelector('[data-ia]').onclick=async function(){
      var b=this; b.disabled=true; msg('Corrigindo…'); antes=t.value;
      var r=await chamar({acao:'avaliacaoCorrigir',senha:senha,texto:t.value}); b.disabled=false;
      if(r.error){ msg(r.error,true); return; }
      t.value=r.texto; msg('Texto corrigido pela IA. Leia antes de enviar.'); ov.querySelector('[data-desf]').style.display='';
    };
    ov.querySelector('[data-desf]').onclick=function(){ t.value=antes; this.style.display='none'; msg('Texto original restaurado.'); };
    ov.querySelector('[data-env]').onclick=async function(){
      if(t.value.trim().length<3){ msg('Escreva a resposta.',true); return; }
      this.disabled=true;
      var r=await chamar({acao:'avaliacaoResponder',senha:senha,avId:a.id,texto:t.value,original:antes});
      if(r.error){ msg(r.error,true); this.disabled=false; return; }
      ov.remove(); if(aoSalvar) aoSalvar();
    };
  }
  async function listar(opts, filtro){
    return await chamar({acao:'avaliacoesLista',senha:opts.senha,baixas:!!filtro.baixas,semResposta:!!filtro.semResposta,atendente:filtro.atendente||''});
  }
  function pintarLista(box, r, opts){
    if(r.error){ box.innerHTML='<div style="color:var(--t-danger,#b3261e);">'+esc(r.error)+'</div>'; return; }
    var l=r.lista||[];
    box.innerHTML=l.length?l.map(function(a){ return cardHtml(a,opts.lojaNome); }).join(''):'<div class="muted" style="padding:10px;">Nenhuma avaliação encontrada.</div>';
    box.querySelectorAll('.av-card').forEach(function(c){
      var a=l.find(function(x){ return x.id===c.dataset.id; });
      c.querySelector('[data-resp]').onclick=function(){ abrirResponder(a,opts.senha,function(){ carregar(box,opts,box.__filtro); }); };
      if(a && !a.lida) chamar({acao:'avaliacaoLida',senha:opts.senha,avId:a.id});
    });
  }
  async function carregar(box, opts, filtro){ box.__filtro=filtro; box.innerHTML='Carregando…'; pintarLista(box, await listar(opts,filtro), opts); }

  async function render(el, opts){
    css();
    el.innerHTML='<div class="cad-head"><div><h2 style="margin:0;">Avaliações dos clientes</h2><p class="muted" style="margin:4px 0 0;">Só gerente e diretoria veem. Nota 3 ou menos aparece como aviso no Painel. Toque em Responder para escrever o retorno que o cliente vê ao reabrir a via.</p></div></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;"><button class="av-b" data-f="todas">Todas</button><button class="av-b" data-f="baixas">Notas 3 ou menos</button><button class="av-b" data-f="semresp">Sem resposta</button><button class="av-b" data-f="medias">Média por atendente</button></div>'
      +'<div data-lista></div>';
    var box=el.querySelector('[data-lista]');
    el.querySelectorAll('[data-f]').forEach(function(b){ b.onclick=async function(){
      var f=b.dataset.f;
      if(f==='medias'){
        box.innerHTML='Carregando…'; var r=await chamar({acao:'avaliacoesMedias',senha:opts.senha});
        if(r.error){ box.innerHTML=esc(r.error); return; }
        var ms=(r.medias||[]).sort(function(a,b){ return b.media-a.media; });
        box.innerHTML=ms.length?'<table class="cad-tabela" style="width:100%;"><thead><tr><th>Atendente</th><th>Média</th><th>Avaliações</th></tr></thead><tbody>'+ms.map(function(m){ return '<tr><td>'+esc(m.nome)+'</td><td>'+estrelas(Math.round(m.media))+' <b>'+String(m.media).replace('.',',')+'</b></td><td>'+m.total+'</td></tr>'; }).join('')+'</tbody></table>':'<div class="muted">Ainda não há avaliações.</div>';
        return;
      }
      carregar(box,opts,{baixas:f==='baixas',semResposta:f==='semresp'});
    }; });
  }
  async function contarBaixas(senha){
    var r=await chamar({acao:'avaliacoesLista',senha:senha,baixas:true});
    if(r.error) return null;
    return (r.lista||[]).filter(function(a){ return !a.lida; }).length;
  }
  function abrirBaixas(opts){
    css();
    var ov=document.createElement('div'); ov.className='av-ov';
    ov.innerHTML='<div class="av-modal"><h3 style="margin:0 0 6px;">Avaliações com 3 estrelas ou menos</h3><div data-l>Carregando…</div><div style="text-align:right;margin-top:10px;"><button class="av-b" data-x>Fechar</button></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('[data-x]').onclick=function(){ ov.remove(); if(opts.aoFechar) opts.aoFechar(); };
    carregar(ov.querySelector('[data-l]'),opts,{baixas:true});
  }
  var cacheMedias=null;
  async function preencherMedias(el, senha){
    if(!cacheMedias){ var r=await chamar({acao:'avaliacoesMedias',senha:senha}); if(r.error) return; cacheMedias=r.medias||[]; }
    function sa(t){ return String(t||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z ]/g,' ').split(/\s+/).filter(Boolean).join(' '); }
    el.querySelectorAll('[data-avnome]').forEach(function(s){
      var chaves=[sa(s.dataset.avnome),sa(s.dataset.avapelido)].filter(Boolean);
      var m=cacheMedias.find(function(x){ return chaves.indexOf(x.chave)>=0; });
      s.innerHTML=m?'<span title="Média das avaliações dos clientes">'+estrelas(Math.round(m.media))+' <b>'+String(m.media).replace('.',',')+'</b> ('+m.total+')</span>':'';
    });
  }
  window.AvaliacoesUI = { render:render, contarBaixas:contarBaixas, abrirBaixas:abrirBaixas, preencherMedias:preencherMedias, estrelas:estrelas };
})();
