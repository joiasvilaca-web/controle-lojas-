/* Confirmação de usuário ao salvar (venda, pedido, orçamento) — roda dentro do módulo (iframe).
 *   ConfirmaUsuario.perguntar('venda')  -> pede ao shell: "Você está como X. Continuar ou trocar?"
 *                                          resolve { ok, trocou }  (ok=false = cancelou)
 *   ConfirmaUsuario.aplicarNoCampo(id)  -> põe o nome do usuário atual no campo Vendedora/Responsável
 * Quando o shell troca o usuário, ele manda {type:'trocaUsuario', user} e aqui a sessão do módulo é atualizada
 * (currentUser / __gatewaySenha são variáveis globais do módulo).
 */
(function(){
  var pend = {};
  function confiavel(ev){ try{ return !ev.origin || ev.origin === 'null' || ev.origin === location.origin; }catch(e){ return false; } }
  window.addEventListener('message', function(ev){
    var d = ev.data;
    if(!d || !d.type || !confiavel(ev)) return;
    if(d.type === 'confirmarUsuarioResp' && pend[d.reqId]){
      var r = pend[d.reqId]; delete pend[d.reqId]; r(d);
    } else if(d.type === 'trocaUsuario' && d.user){
      try{ currentUser = d.user; }catch(e){}
      try{ __gatewaySenha = d.user.senha; }catch(e){}
      if(typeof window.__aposTrocarUsuario === 'function'){ try{ window.__aposTrocarUsuario(d.user); }catch(e){} }
    }
  });
  function nomeDoUsuarioAtual(){
    try{ if(typeof vendedoraTravadaNoLogin === 'function'){ var t = vendedoraTravadaNoLogin(); if(t) return t; } }catch(e){}
    var u = null; try{ u = currentUser; }catch(e){}
    if(!u) return '';
    try{
      var f = (config.funcionarios || []).find(function(x){ return u.funcionarioId && x.id === u.funcionarioId; });
      if(f) return (typeof nomeExibicaoFuncionario === 'function') ? nomeExibicaoFuncionario(f) : (f.apelido || f.nome);
    }catch(e){}
    return u.nome || '';
  }
  function aplicarNoCampo(id){
    var el = document.getElementById(id); var nome = nomeDoUsuarioAtual();
    if(!el || !nome) return nome;
    if(el.tagName === 'SELECT'){
      var alvo = nome.trim().toLowerCase(), achou = false;
      Array.prototype.forEach.call(el.options, function(o){ if(!achou && String(o.value).trim().toLowerCase() === alvo){ el.value = o.value; achou = true; } });
      if(!achou){ var op = document.createElement('option'); op.value = nome; op.textContent = nome; el.appendChild(op); el.value = nome; }
    } else {
      el.value = nome;
    }
    try{ el.dispatchEvent(new Event('change', { bubbles:true })); el.dispatchEvent(new Event('input', { bubbles:true })); }catch(e){}
    return nome;
  }
  function perguntar(acao){
    if(window.parent === window) return Promise.resolve({ ok:true, trocou:false });
    return new Promise(function(res){
      var id = 'cu' + Date.now() + Math.random().toString(36).slice(2);
      pend[id] = res;
      parent.postMessage({ type:'confirmarUsuario', reqId:id, acao:acao || '' }, '*');
    });
  }
  window.ConfirmaUsuario = { perguntar: perguntar, aplicarNoCampo: aplicarNoCampo };
})();
