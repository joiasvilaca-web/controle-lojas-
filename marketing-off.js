/* Tag "MARKETING OFF": antes de qualquer envio de mensagem a um cliente (WhatsApp ou e-mail),
   avisa que ele tem restrição de marketing e deixa o atendente escolher entre enviar e cancelar.
   Vale para todos os módulos que enviam mensagem, menos o CHAT.
   - MarketingOff.permitir({telefone, nome, tags}) -> Promise<boolean>  (tags opcional: ids já conhecidos)
   - MarketingOff.lote(listaDeClientes) -> Promise<lista|null>  (mala direta: null = cancelou)
   - Rede de segurança: links wa.me abertos por qualquer tela passam pela mesma checagem. */
(function(){
  var gw = null, cfgPromise = null, cache = {}, liberados = {};
  var abrir = window.open.bind(window);
  function dig(s){ return String(s == null ? '' : s).replace(/\D/g, ''); }
  function norm(s){ return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase(); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function gateway(){ return gw || (typeof window.gatewayCall === 'function' ? window.gatewayCall : null); }
  function idsOff(){
    if(!cfgPromise){
      var g = gateway(); if(!g) return Promise.resolve([]);
      cfgPromise = g({ op:'getConfig' }).then(function(r){
        var tags = (r && r.data && r.data.tagsClientes) || [];
        return tags.filter(function(t){ return norm(t.nome) === 'MARKETING OFF'; }).map(function(t){ return t.id; });
      }).catch(function(){ return []; });
      cfgPromise.then(function(l){ if(!l.length) setTimeout(function(){ cfgPromise = null; }, 60000); }); // tag pode ser criada depois
    }
    return cfgPromise;
  }
  function chave(ctx){ return dig(ctx.telefone).slice(-8) || norm(ctx.nome); }
  async function acharTags(ctx){
    if(Array.isArray(ctx.tags)) return ctx.tags;
    var g = gateway(); if(!g) return [];
    var d = dig(ctx.telefone), termos = [];
    if(d.length >= 8){ var loc = d.slice(-9); if(d.length < 9) loc = d.slice(-8); termos.push(loc.length === 9 ? loc.slice(0,5) + '-' + loc.slice(5) : loc.slice(0,4) + '-' + loc.slice(4)); termos.push(d.slice(-8)); }
    else if(norm(ctx.nome).length >= 2) termos.push(String(ctx.nome).trim());
    for(var i = 0; i < termos.length; i++){
      try{
        var r = await g({ op:'searchClients', params:{ termo: termos[i] } });
        var lista = (r && r.data) || [];
        var c = lista.find(function(x){ return d.length >= 8 ? dig(x.telefone).slice(-8) === d.slice(-8) : norm(x.nome) === norm(ctx.nome); });
        if(c) return c.tags || [];
      }catch(e){}
    }
    return [];
  }
  function escolher(titulo, msg, botoes){
    return new Promise(function(res){
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit;';
      ov.innerHTML = '<div role="alertdialog" aria-modal="true" style="background:#fff;color:#0f172a;border-radius:14px;max-width:440px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.35);">'
        + '<h3 style="margin:0 0 8px;font-size:17px;">⚠️ ' + esc(titulo) + '</h3>'
        + '<p style="margin:0 0 18px;font-size:14px;line-height:1.45;color:#334155;">' + msg + '</p>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;"></div></div>';
      var box = ov.querySelector('div > div');
      botoes.forEach(function(b){
        var el = document.createElement('button'); el.type = 'button'; el.textContent = b.texto;
        el.style.cssText = 'padding:9px 14px;border-radius:9px;font-size:13.5px;font-weight:700;cursor:pointer;border:1.5px solid ' + (b.primario ? '#dc2626' : '#cbd5e1') + ';background:' + (b.primario ? '#dc2626' : '#fff') + ';color:' + (b.primario ? '#fff' : '#0f172a') + ';';
        el.addEventListener('click', function(){ ov.remove(); res(b.valor); });
        box.appendChild(el);
      });
      document.body.appendChild(ov);
      var foco = box.querySelector('button'); if(foco) foco.focus();
    });
  }
  var MO = window.MarketingOff = {
    usarGateway: function(fn){ gw = fn; cfgPromise = null; },
    permitir: async function(ctx){
      ctx = ctx || {};
      try{
        var k = chave(ctx);
        if(k && liberados[k] && Date.now() - liberados[k] < 15000) return true;
        var off = await idsOff(); if(!off.length) return true;
        var tags = await acharTags(ctx);
        if(!tags.some(function(t){ return off.indexOf(t) >= 0; })) return true;
        var r = await escolher('Cliente com restrição de marketing',
          (ctx.nome ? '<b>' + esc(ctx.nome) + '</b> possui' : 'Este cliente possui') + ' uma tag com restrições de marketing (<b>MARKETING OFF</b>). Deseja enviar a mensagem mesmo assim?',
          [{ texto:'Cancelar', valor:false }, { texto:'Enviar mesmo assim', valor:true, primario:true }]);
        if(r && k) liberados[k] = Date.now();
        return !!r;
      }catch(e){ return true; }
    },
    lote: async function(lista){
      try{
        var off = await idsOff(); if(!off.length) return lista;
        var restritos = lista.filter(function(c){ return (c.tags || []).some(function(t){ return off.indexOf(t) >= 0; }); });
        if(!restritos.length) return lista;
        var r = await escolher('Clientes com restrição de marketing',
          '<b>' + restritos.length + '</b> de ' + lista.length + ' cliente(s) desta lista possuem tag com restrições de marketing (<b>MARKETING OFF</b>). O que deseja fazer?',
          [{ texto:'Cancelar envio', valor:'cancelar' }, { texto:'Enviar para todos', valor:'todos' }, { texto:'Pular os restritos', valor:'pular', primario:true }]);
        if(r === 'todos') return lista;
        if(r === 'pular') return lista.filter(function(c){ return restritos.indexOf(c) < 0; });
        return null;
      }catch(e){ return lista; }
    }
  };
  /* Rede de segurança: qualquer link/abertura de wa.me passa pela checagem pelo número. */
  function telDoLink(u){ var m = /wa\.me\/(\d+)/.exec(String(u || '')); return m ? m[1] : null; }
  function interceptar(url, abrirFn){
    var t = telDoLink(url); if(!t) return false;
    var k = dig(t).slice(-8);
    if(liberados[k] && Date.now() - liberados[k] < 15000) return false;
    MO.permitir({ telefone: t }).then(function(ok){ if(ok) abrirFn(); });
    return true;
  }
  window.open = function(url, alvo, feat){
    if(interceptar(url, function(){ abrir(url, alvo || '_blank', feat); })) return null;
    return abrir(url, alvo, feat);
  };
  document.addEventListener('click', function(ev){
    var a = ev.target && ev.target.closest && ev.target.closest('a[href*="wa.me/"]'); if(!a) return;
    if(interceptar(a.href, function(){ abrir(a.href, '_blank'); })){ ev.preventDefault(); ev.stopPropagation(); }
  }, true);
})();
