/* "O que podemos melhorar?" — parte do CLIENTE (link do ORÇAMENTO), 18/11.
 * Aparece só quando o orçamento foi encerrado sem fechar (status Recusado ou Vencido). O cliente marca os motivos e/ou escreve;
 * a resposta vai para o card Orçamento da equipe (retirada-terceiro, ação `melhoria`) e a loja pode responder: a resposta aparece aqui ao reabrir o link.
 * Uso: MelhoriaVia.montar(elemento, { tipo, id, client: supabaseClient, melhoria: data.melhoria })  — pode ser chamado de novo a cada atualização da página.
 */
(function(){
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  var MOTIVOS=[['preco','Preço'],['prazo','Prazo de entrega'],['modelo','Modelo ou opções de joia'],['atendimento','Atendimento'],['qualidade','Qualidade ou acabamento'],['outra_loja','Comprei em outra loja'],['desistiu','Desisti da compra'],['outro','Outro motivo']];
  var CSS='.mv-card{box-sizing:border-box;width:100%;max-width:440px;margin-top:14px;background:var(--surface,#fff);color:var(--ink,#14202b);border:1px solid var(--line,#dde);border-radius:16px;padding:22px 20px;box-shadow:var(--t-shadow,none);}'
   +'.mv-card h2{font-size:18px;margin:0 0 6px;letter-spacing:-.01em;text-align:center;}'
   +'.mv-card p{margin:0 0 14px;font-size:14px;line-height:1.5;color:var(--ink-soft,#33424f);text-align:center;}'
   +'.mv-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 0 14px;}'
   +'.mv-chip{min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--line-strong,#8a98a5);background:var(--surface,#fff);color:var(--ink,#14202b);font:inherit;font-size:14px;font-weight:600;cursor:pointer;}'
   +'.mv-chip[aria-pressed="true"]{background:var(--accent-soft,#e3f1f6);border-color:var(--accent,#1f5f7a);color:var(--accent,#1f5f7a);}'
   +'.mv-chip:focus-visible,.mv-txt:focus-visible,.mv-btn:focus-visible{outline:2px solid var(--accent,#1f5f7a);outline-offset:2px;}'
   +'.mv-lab{display:block;text-align:left;font-size:13px;font-weight:600;margin:0 0 6px;color:var(--ink-soft,#33424f);}'
   +'.mv-txt{width:100%;box-sizing:border-box;min-height:96px;padding:10px 12px;border-radius:10px;border:1px solid var(--line-strong,#8a98a5);background:var(--surface,#fff);color:var(--ink,#14202b);font:inherit;font-size:15px;resize:vertical;}'
   +'.mv-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:50px;margin-top:14px;border-radius:10px;border:1px solid var(--t-primary-strong,#1f5f7a);background:var(--t-primary-strong,#1f5f7a);color:#fff;font:inherit;font-weight:700;font-size:16px;cursor:pointer;}'
   +'.mv-btn:disabled{opacity:.6;cursor:default;}'
   +'.mv-erro{margin-top:10px;font-size:13.5px;color:var(--danger,#b3261e);text-align:center;min-height:1em;}'
   +'.mv-resp{margin-top:14px;padding:14px 16px;border-radius:12px;background:var(--surface-2,#f4f6f8);text-align:left;}'
   +'.mv-resp b{display:block;margin-bottom:4px;font-size:14px;} .mv-resp span{display:block;white-space:pre-wrap;font-size:14px;line-height:1.5;}';
  function css(){ if(document.getElementById('mvCss')) return; var s=document.createElement('style'); s.id='mvCss'; s.textContent=CSS; document.head.appendChild(s); }
  function respostaHtml(m){ return m && m.resposta && m.resposta.texto ? '<div class="mv-resp"><b>Resposta da Vilaça</b><span>'+esc(m.resposta.texto)+'</span></div>' : ''; }

  function montar(el, o){
    var m=o.melhoria||{};
    if(!el) return;
    if(!m.disponivel && !m.feita){ el.innerHTML=''; el.__mvSig=''; return; }
    var sig=(m.disponivel?'D':'F')+'|'+(m.resposta?m.resposta.em:'');
    if(el.__mvSig===sig && el.firstChild) return;          // nada mudou: não apaga o que a pessoa está digitando
    el.__mvSig=sig; css();
    if(m.feita){
      el.innerHTML='<div class="mv-card"><h2>Obrigado por nos contar!</h2><p>Sua opinião chegou à nossa equipe e vai nos ajudar a atender você ainda melhor.</p>'+respostaHtml(m)+'</div>';
      return;
    }
    el.innerHTML='<div class="mv-card"><h2>O que podemos melhorar?</h2>'
      +'<p>Você não fechou este orçamento e a sua opinião é muito importante para a gente atender você melhor no futuro. Leva menos de um minuto.</p>'
      +'<div class="mv-chips" role="group" aria-label="Motivos">'+MOTIVOS.map(function(x){ return '<button type="button" class="mv-chip" data-m="'+x[0]+'" aria-pressed="false">'+esc(x[1])+'</button>'; }).join('')+'</div>'
      +'<label class="mv-lab" for="mvTxt">Quer contar mais? (opcional)</label><textarea class="mv-txt" id="mvTxt" maxlength="1500" placeholder="Ex.: achei o preço acima do que esperava, queria outro modelo…"></textarea>'
      +'<div class="mv-erro" role="alert" data-erro></div><button type="button" class="mv-btn" data-enviar>Enviar</button></div>';
    var btn=el.querySelector('[data-enviar]'), er=el.querySelector('[data-erro]');
    var sel={}; el.querySelectorAll('.mv-chip').forEach(function(b){ b.onclick=function(){ var k=b.dataset.m; sel[k]=!sel[k]; b.setAttribute('aria-pressed',sel[k]?'true':'false'); er.textContent=''; }; });
    el.querySelector('#mvTxt').oninput=function(){ er.textContent=''; };
    btn.onclick=async function(){
      var motivos=Object.keys(sel).filter(function(k){ return sel[k]; }), texto=el.querySelector('#mvTxt').value.trim();
      if(!motivos.length && texto.length<3){ er.textContent='Escolha um motivo ou escreva um pouquinho.'; return; }
      er.textContent=''; btn.disabled=true; btn.textContent='Enviando…';
      var r={}; try{ var x=await o.client.functions.invoke('retirada-terceiro',{ body:{ acao:'melhoria', tipo:o.tipo, id:o.id, motivos:motivos, texto:texto } }); r=x.data||{}; }catch(e){}
      if(!r.ok){ er.textContent=(r&&r.error)||'Não foi possível enviar agora. Confira a internet e tente de novo.'; btn.disabled=false; btn.textContent='Enviar'; return; }
      el.__mvSig=''; montar(el,{ tipo:o.tipo, id:o.id, client:o.client, melhoria:r.melhoria||{ feita:true } });
    };
  }
  window.MelhoriaVia = { montar: montar };
})();
