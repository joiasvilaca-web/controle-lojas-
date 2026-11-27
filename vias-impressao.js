/* Vias de impressão (27/11/2026, Felipe) — pergunta "qual via imprimir" ao salvar Venda/Pedido e monta a VIA CAIXA.
 *  Venda salva  → pergunta: Via do Cliente · Via Caixa · X.
 *  Pedido salvo → imprime sozinho a Via da Oficina e pergunta: Via do Cliente · Via Caixa (só se há pagamento feito) · X.
 *  Pagamento de via "pagar depois" (venda ou pedido) → pergunta se quer a Via Caixa (com o aviso).
 *  Via Caixa = cupom pequeno de conferência: nº da via, vendedora e formas de pagamento. Nada de cliente/itens/total.
 *  API: ViasPrint.perguntar(titulo, sub, opcoes) · temPagamento(reg) · novosPagamentos(antes, depois) · cupomCaixaHtml(o) */
(function(){
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function pagos(reg){ return ((reg && reg.pagamentos) || []).filter(function(p){ return p && p._modo!=='editar' && p.formaId && p.formaId!=='__fiado' && Number(p.valor)>0; }); }
  function temPagamento(reg){ return pagos(reg).length > 0; }
  function chave(p){ return [p.formaId, Number(p.valor)||0, p.parcelas||'', p.bandeira||'', p.pessoa||''].join('|'); }
  /** Pagamentos que existem em `depois` e não existiam em `antes` (comparação por forma+valor+parcelas). */
  function novosPagamentos(antes, depois){
    var resto = pagos({ pagamentos: antes }).map(chave), out = [];
    pagos({ pagamentos: depois }).forEach(function(p){ var i = resto.indexOf(chave(p)); if(i>=0) resto.splice(i,1); else out.push(p); });
    return out;
  }
  function fechar(){ var e = document.getElementById('viasPrintOv'); if(e) e.remove(); document.removeEventListener('keydown', esc_); }
  function esc_(ev){ if(ev.key==='Escape') fechar(); }
  /** opcoes: [{ rotulo, desc, cor, fn }]. O X (ou Esc/fora) só fecha. */
  function perguntar(titulo, sub, opcoes){
    fechar();
    var ov = document.createElement('div'); ov.id = 'viasPrintOv';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(20,10,14,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
    var card = document.createElement('div');
    card.setAttribute('role','dialog'); card.setAttribute('aria-modal','true');
    card.style.cssText = 'position:relative;background:var(--surface,#fff);color:var(--ink,#222);border-radius:16px;padding:22px 20px 18px;width:100%;max-width:400px;box-shadow:0 20px 50px rgba(0,0,0,.35);';
    card.innerHTML = '<button type="button" id="viasPrintX" aria-label="Fechar" style="position:absolute;top:8px;right:10px;border:0;background:transparent;font-size:26px;line-height:1;cursor:pointer;color:var(--muted,#666);padding:4px 8px;">&times;</button>'
      + '<h3 style="margin:0 28px 4px 0;font-size:18px;">' + esc(titulo) + '</h3>'
      + (sub ? '<p style="margin:0 0 14px;font-size:13px;color:var(--muted,#666);">' + sub + '</p>' : '<div style="height:10px"></div>')
      + '<div id="viasPrintBtns" style="display:grid;gap:10px;"></div>';
    ov.appendChild(card); document.body.appendChild(ov);
    var box = card.querySelector('#viasPrintBtns');
    (opcoes||[]).forEach(function(o){
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-block ' + (o.cor ? '' : 'btn-accent');
      b.style.cssText = 'white-space:normal;min-width:0;height:auto;text-align:left;padding:12px 14px;' + (o.cor ? 'background:'+o.cor+';border-color:'+o.cor+';color:#fff;' : '');
      b.innerHTML = esc(o.rotulo) + (o.desc ? '<span style="display:block;font-weight:500;font-size:12.5px;opacity:.9;margin-top:2px;">' + esc(o.desc) + '</span>' : '');
      b.addEventListener('click', function(){ try{ o.fn(); }catch(e){ console.error('via', e); } });   // 27/11: não fecha — a vendedora imprime quantas vias quiser; só o X fecha
      box.appendChild(b);
    });
    card.querySelector('#viasPrintX').addEventListener('click', fechar);
    ov.addEventListener('click', function(e){ if(e.target===ov) fechar(); });
    document.addEventListener('keydown', esc_);
  }
  /** Conteúdo do cupom da Via Caixa. o: { origem:'VENDA'|'PEDIDO', data(dd/mm/aaaa, opcional), via, vendedora, pagamentos:[{rotulo, valor}], aviso, fmt } */
  function cupomCaixaHtml(o){
    var L = [];
    L.push('<div class="titulo">VIA CAIXA</div>');
    L.push('<div class="sub">' + esc(o.origem||'') + ' · ' + esc(o.data || new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})) + '</div>');
    if(o.aviso) L.push('<div style="text-align:center;margin:5px 0;padding:4px 5px;border:2px solid #000;font-weight:800;font-size:.95em;">' + esc(o.aviso) + '</div>');
    L.push('<div class="linha"></div>');
    L.push('<div class="destaque" style="text-align:center;">VIA ' + esc(o.via || '—') + '</div>');
    L.push('<div style="text-align:center;"><b>Vendedora:</b> ' + esc(o.vendedora || '—') + '</div>');
    L.push('<div class="linha"></div>');
    (o.pagamentos||[]).forEach(function(p){ L.push('<div>' + esc(p.rotulo) + ': <b>' + esc(o.fmt ? o.fmt(p.valor) : p.valor) + '</b></div>'); });
    return L.join('');
  }
  window.ViasPrint = { perguntar: perguntar, fechar: fechar, temPagamento: temPagamento, pagos: pagos, novosPagamentos: novosPagamentos, cupomCaixaHtml: cupomCaixaHtml };
})();
