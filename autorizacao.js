/* Autorização da gerência — pede a senha de um gerente ou da diretoria para liberar uma ação
 * (reabrir caixa, mexer com o caixa fechado, editar via com nota emitida, editar via de outra loja…).
 * A conferência e o registro no LOG ficam no servidor (Edge Function autorizar-gestor).
 *   Autorizacao.pedir({ sessao, titulo, texto, acao, modulo, registroId, resumo }) -> Promise<{nome,nivel}|null>
 */
(function(){
  var URL_FN = (window.SUPABASE_URL || 'https://wxiokmqnjtgbejgoepch.supabase.co') + '/functions/v1/autorizar-gestor';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4aW9rbXFuanRnYmVqZ29lcGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTE2NDgsImV4cCI6MjA4Nzc4NzY0OH0.F38uxHayhbNHGQC9-W0R1IonfJ-VtbK2ZJfS8vZshTc';
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function css(){
    if(document.getElementById('autzCss')) return;
    var s = document.createElement('style'); s.id = 'autzCss';
    s.textContent = '.autz-fundo{position:fixed;inset:0;background:rgba(10,20,30,.45);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;}'
      + '.autz-caixa{background:var(--surface,#fff);color:var(--ink,#111);border-radius:14px;max-width:400px;width:100%;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:inherit;}'
      + '.autz-caixa h3{margin:0 0 6px;font-size:17px;} .autz-caixa p{margin:0 0 12px;font-size:13.5px;color:var(--ink-soft,#445);line-height:1.45;}'
      + '.autz-caixa input{width:100%;box-sizing:border-box;min-height:42px;border:1px solid var(--line-strong,#bbb);border-radius:10px;padding:0 12px;font:inherit;background:var(--surface,#fff);color:inherit;}'
      + '.autz-erro{color:var(--danger,#b3261e);font-size:13px;font-weight:600;min-height:18px;margin-top:6px;}'
      + '.autz-acoes{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;} .autz-acoes button{min-height:40px;padding:0 16px;border-radius:10px;font:inherit;font-weight:600;cursor:pointer;border:1px solid var(--line-strong,#bbb);background:transparent;color:inherit;}'
      + '.autz-acoes .autz-ok{background:var(--t-primary-strong,#1f5f7a);border-color:var(--t-primary-strong,#1f5f7a);color:#fff;} .autz-acoes button:disabled{opacity:.6;cursor:default;}';
    document.head.appendChild(s);
  }
  function pedir(o){
    o = o || {};
    css();
    return new Promise(function(resolve){
      var fundo = document.createElement('div'); fundo.className = 'autz-fundo';
      fundo.innerHTML = '<div class="autz-caixa" role="dialog" aria-modal="true" aria-label="Autorização da gerência">'
        + '<h3>' + esc(o.titulo || 'Autorização da gerência') + '</h3>'
        + '<p>' + esc(o.texto || 'Esta ação precisa da senha de um gerente ou da diretoria. Fica registrada no LOG.') + '</p>'
        + '<input type="password" autocomplete="off" placeholder="Senha de gerente ou diretoria" aria-label="Senha de gerente ou diretoria">'
        + '<div class="autz-erro" role="alert"></div>'
        + '<div class="autz-acoes"><button type="button" class="autz-sair">Voltar</button><button type="button" class="autz-ok">Autorizar</button></div></div>';
      document.body.appendChild(fundo);
      var inp = fundo.querySelector('input'), erro = fundo.querySelector('.autz-erro'), ok = fundo.querySelector('.autz-ok');
      setTimeout(function(){ try{ inp.focus(); }catch(e){} }, 30);
      function fim(v){ fundo.remove(); resolve(v); }
      fundo.querySelector('.autz-sair').onclick = function(){ fim(null); };
      fundo.addEventListener('keydown', function(e){ if(e.key==='Escape') fim(null); if(e.key==='Enter') ok.click(); });
      ok.onclick = async function(){
        if(!inp.value){ erro.textContent = 'Digite a senha.'; return; }
        ok.disabled = true; ok.textContent = 'Conferindo…'; erro.textContent = '';
        try{
          var r = await fetch(URL_FN, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:ANON, Authorization:'Bearer '+ANON },
            body: JSON.stringify({ sessao:o.sessao, senhaGestor:inp.value, acao:o.acao, modulo:o.modulo, registroId:o.registroId, resumo:o.resumo }) });
          var j = await r.json();
          if(j && j.ok){ fim({ nome:j.nome, nivel:j.nivel }); return; }
          erro.textContent = (j && j.error) || 'Senha não autorizada.';
        }catch(e){ erro.textContent = 'Sem conexão. Tente de novo.'; }
        ok.disabled = false; ok.textContent = 'Autorizar'; inp.value = ''; try{ inp.focus(); }catch(e){}
      };
    });
  }
  window.Autorizacao = { pedir: pedir };
})();
