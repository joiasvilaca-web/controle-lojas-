/* Bolinhas de loja por cliente: uma bolinha (cor + iniciais da loja) para cada loja onde o cliente
   já teve venda, orçamento ou pedido (O.S.). Os registros não guardam o id do cliente, então o
   vínculo é por telefone (só dígitos) e, na falta dele, pelo nome normalizado. */
(function(){
  var idx = null, carregando = null, lojasFn = function(){ return []; };
  var css = '.cli-lojas{display:inline-flex;gap:3px;vertical-align:middle;margin-left:6px;flex-wrap:wrap}'
    + '.cli-loja-dot{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 4px;border-radius:999px;color:#fff;font-size:9.5px;font-weight:800;letter-spacing:.02em;line-height:1;box-sizing:border-box;cursor:help}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  function dig(s){ return String(s == null ? '' : s).replace(/\D/g, ''); }
  function nome(s){ return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase(); }
  function tel(t){ var d = dig(t); return d.length >= 8 ? d.slice(-8) : ''; }
  function add(m, k, loja){ if(!k || !loja) return; (m[k] || (m[k] = {}))[loja] = 1; }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  async function lerTabela(gw, table){
    try{
      var r = await gw({ op:'selectAll', table: table });
      return ((r && r.data) || []).map(function(x){ return x.payload; }).filter(Boolean);
    }catch(e){ return []; }
  }
  window.ClienteLojas = {
    /* gw = função gatewayCall do módulo; lojas = () => config.lojas */
    iniciar: function(gw, lojas, aoPronto){
      if(lojas) lojasFn = lojas;
      if(idx) return Promise.resolve(idx);
      if(!carregando) carregando = Promise.all([lerTabela(gw,'vendas_pdv'), lerTabela(gw,'ordens_servico'), lerTabela(gw,'orcamentos')]).then(function(r){
        var t = {}, n = {};
        r.forEach(function(lista){ lista.forEach(function(p){
          var loja = p.lojaId || p.loja_id; if(!loja) return;
          add(t, tel(p.telefone || p.clienteTelefone), loja);
          add(n, nome(p.cliente || p.clienteNome), loja);
        }); });
        idx = { t: t, n: n };
        if(aoPronto) aoPronto();
        return idx;
      });
      return carregando;
    },
    pronto: function(){ return !!idx; },
    lojasDe: function(c){
      if(!idx || !c) return [];
      var set = {}, k = tel(c.telefone);
      if(k && idx.t[k]) Object.keys(idx.t[k]).forEach(function(l){ set[l] = 1; });
      else { var nm = nome(c.nome); if(nm && idx.n[nm]) Object.keys(idx.n[nm]).forEach(function(l){ set[l] = 1; }); }
      var ordem = lojasFn().map(function(l){ return l.id; });
      return Object.keys(set).sort(function(a, b){ var i = ordem.indexOf(a), j = ordem.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); });
    },
    html: function(c){
      var ls = lojasFn(), ids = this.lojasDe(c);
      if(!ids.length) return '';
      return '<span class="cli-lojas">' + ids.map(function(id){
        var l = ls.find(function(x){ return x.id === id; }) || { nome: id, abreviacao: id.replace(/^loja_/, '').toUpperCase(), cor: '#64748b' };
        return '<span class="cli-loja-dot" style="background:' + esc(l.cor || '#64748b') + ';" title="' + esc(l.nome || '') + '">' + esc((l.abreviacao || l.nome || '?').slice(0, 3).toUpperCase()) + '</span>';
      }).join('') + '</span>';
    }
  };
})();
