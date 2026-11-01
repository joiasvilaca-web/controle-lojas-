/* Cupom das vias (impressora de bobina) — um só lugar para Pedido, Venda, Orçamento e Reserva.
 * Cada cupom tem a sua configuração em config.impressao.cupons[tipo] (largura, texto, traço, rodapé,
 * altura total e margens). O que não estiver configurado usa os valores gerais de config.impressao.
 *   Cupom.cfg(config, tipo)                       -> configuração final do cupom
 *   Cupom.html(cfg, titulo, conteudoHtml, codigo) -> documento HTML do cupom
 *   Cupom.imprimir(config, titulo, conteudo, codigo) -> abre a janela e imprime
 *   Cupom.exemplo(tipo, campos)                   -> conteúdo de exemplo (prévia em Configurações)
 */
(function(){
  var ESCALA = { pequena:{ base:12, titulo:14, sub:11 }, media:{ base:14, titulo:17, sub:12.5 }, grande:{ base:16.5, titulo:20, sub:14.5 } };
  var TIPO_POR_TITULO = { 'Venda':'vendas', 'Reserva':'reservas', 'Ordem de Serviço':'os', 'Orçamento':'orcamentos' };
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function num(v, d){ var n = Number(v); return isFinite(n) ? n : d; }
  function cfg(config, tipo){
    var g = (config && config.impressao) || {};
    var c = (g.cupons && g.cupons[tipo]) || {};
    function v(k, d){ return c[k]!==undefined && c[k]!=='' ? c[k] : (g[k]!==undefined ? g[k] : d); }
    return {
      larguraBobina: num(v('larguraBobina', 80), 80),
      escalaTexto: v('escalaTexto', 'media'),
      negrito: v('negrito', true) !== false,
      reforcoTraco: !!v('reforcoTraco', false),
      mensagemRodape: String(v('mensagemRodape', '') || ''),
      alturaMm: Math.max(0, num(c.alturaMm, 0)),
      margemSupMm: Math.max(0, num(c.margemSupMm, 0)),
      margemInfMm: Math.max(0, num(c.margemInfMm, 0)),
    };
  }
  /* Área que a cabeça térmica realmente imprime (bobina 80 mm → 72 mm; 58 mm → 48 mm).
   * Com a largura cheia da bobina o texto era cortado nas bordas (ex.: "liente:" em vez de "Cliente:"). */
  function areaImpressaoMm(larg){ larg = Number(larg)||80; return larg>=80 ? larg-8 : (larg>=58 ? larg-10 : Math.max(30, larg-4)); }
  function html(c, titulo, conteudoHtml, codigoVia){
    var px = ESCALA[c.escalaTexto] || ESCALA.media;
    var peso = c.negrito ? 700 : 400;
    var reforco = c.reforcoTraco ? 'text-shadow:0.3px 0 0 currentColor, -0.3px 0 0 currentColor;' : '';
    var rodape = (c.mensagemRodape||'').trim();
    var alturaCss = c.alturaMm > 0 ? 'height:'+c.alturaMm+'mm; overflow:hidden;' : '';
    var codigoHtml = codigoVia ? '<div class="linha"></div><div class="barcode-wrap"><svg id="barcodeSvg"></svg></div><div class="sub" style="text-align:center; font-weight:800; letter-spacing:.04em; margin-top:2px;">'+esc(codigoVia)+'</div>' : '';
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>'+esc(titulo)+'</title>'
      + (codigoVia ? '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>' : '')
      + '<style>@page{ margin:0; } *{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }'
      + 'body{ font-family:"Courier New", monospace; box-sizing:border-box; width:'+areaImpressaoMm(c.larguraBobina)+'mm; margin:0 auto; padding:'+c.margemSupMm+'mm 0 '+c.margemInfMm+'mm; '+alturaCss+' color:#000; font-weight:'+peso+'; font-size:'+px.base+'px; line-height:1.42; -webkit-font-smoothing:none; '+reforco+' }'
      + '.titulo{ font-size:'+px.titulo+'px; font-weight:800; text-align:center; letter-spacing:.02em; } .sub{ font-size:'+px.sub+'px; color:#000; text-align:center; }'
      + '.linha{ border-top:1px dashed #000; margin:6px 0; } .rodape{ text-align:center; margin-top:10px; font-size:'+px.sub+'px; } b{ font-weight:800; }'
      + '.assinatura{ border-top:1px solid #000; margin-top:26px; } .destaque{ font-weight:800; font-size:'+Math.round(px.base*1.25)+'px; }'
      + '.barcode-wrap{ text-align:center; margin-top:6px; } .barcode-wrap svg{ max-width:100%; }'
      + 'html{ margin:0; padding:0; height:auto; background:#fff; } body > :first-child{ margin-top:0 !important; } body > :last-child{ margin-bottom:0 !important; }'
      + '@media print{ html{ height:auto !important; } }</style></head><body>'
      + codigoHtml + conteudoHtml + (rodape ? '<div class="linha"></div><div class="rodape">'+esc(rodape)+'</div>' : '')
      + '</body></html>';
  }
  function desenharCodigo(win, codigoVia, depois){
    if(!codigoVia){ setTimeout(depois, 300); return; }
    setTimeout(function(){
      try{ if(win.JsBarcode) win.JsBarcode(win.document.getElementById('barcodeSvg'), codigoVia, { format:'CODE128', width:2, height:42, displayValue:false, margin:0 }); }catch(e){}
      setTimeout(depois, 250);
    }, 400);
  }
  function imprimir(config, titulo, conteudoHtml, codigoVia, tipo){
    var c = cfg(config, tipo || TIPO_POR_TITULO[titulo] || 'vendas');
    var w = window.open('', '_blank', 'width=420,height=700');
    if(!w){ alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups do navegador.'); return; }
    w.document.open(); w.document.write(html(c, titulo, conteudoHtml, codigoVia)); w.document.close(); w.focus();
    desenharCodigo(w, codigoVia, function(){
      try{
        var d = w.document;
        var mm = c.alturaMm > 0 ? c.alturaMm : Math.ceil(Math.max(d.body.scrollHeight, d.body.getBoundingClientRect().height) * 25.4 / 96) + 1;
        var st = d.createElement('style'); st.textContent = '@page{ size:'+c.larguraBobina+'mm '+mm+'mm; margin:0; }'; d.head.appendChild(st);
      }catch(e){}
      try{ w.print(); }catch(e){}
    });
  }
  /* Prévia dentro de um iframe (Configurações › Impressão › Ver cupom). */
  function previa(iframe, c, titulo, conteudoHtml, codigoVia){
    iframe.srcdoc = html(c, titulo, conteudoHtml, codigoVia);
    iframe.onload = function(){
      var w = iframe.contentWindow;
      desenharCodigo(w, codigoVia, function(){
        try{ iframe.style.height = (Math.max(w.document.body.scrollHeight, w.document.documentElement.scrollHeight) + 8) + 'px'; }catch(e){}
      });
    };
  }
  function exemplo(tipo, campos){
    campos = campos || {};
    var on = function(k){ return campos[k] !== false; };
    var L = [];
    var T = { os:'ORDEM DE SERVIÇO', vendas:'VENDA', orcamentos:'ORÇAMENTO', reservas:'RESERVA' }[tipo] || 'VIA';
    L.push('<div class="titulo">'+T+'</div><div class="sub">REFORMA JOIAS · Via RJ123'+({os:'P',vendas:'V',orcamentos:'O',reservas:'R'}[tipo]||'')+'</div><div class="sub">01/11/2026</div><div class="linha"></div>');
    if(on('cliente')) L.push('<div><b>Cliente:</b> MARIA APARECIDA SILVA</div>');
    if(on('telefone')) L.push('<div><b>Telefone:</b> (32) 99999-0000</div>');
    if(tipo==='os' && on('servico')) L.push('<div><b>Serviço:</b> SERVIÇO SEM CRAVAÇÃO</div>');
    if(tipo==='os' && on('descricao')) L.push('<div><b>Descrição:</b> AJUSTE DE ARO E POLIMENTO</div>');
    if(on('vendedora')) L.push('<div><b>Vendedora:</b> CAMILA</div>');
    if(tipo!=='os' && on('itens')){ L.push('<div class="linha"></div><div><b>'+(tipo==='reservas'?'JOIAS RESERVADAS':'ITENS')+'</b></div><div>9 ANEL OURO 18K x1 — R$ 1.250,00</div><div>9 BRINCO PEROLA x1 — R$ 480,00</div>'); }
    if(on('valores')){ L.push('<div class="linha"></div><div>Valor total: R$ 1.730,00</div>'); if(tipo==='vendas'||tipo==='os') L.push('<div>Recebido: R$ 1.730,00</div><div>A receber: R$ 0,00</div>'); }
    if(tipo==='vendas' && on('formaPagamento')) L.push('<div>PIX: R$ 1.730,00</div>');
    if(tipo==='orcamentos' && on('validade')) L.push('<div><b>Validade:</b> 15/11/2026</div>');
    if(tipo==='reservas' && on('prazo')) L.push('<div class="linha"></div><div><b>Reservado até 08/11/2026 14:30</b></div><div style="font-size:11px;">Reserva sem pagamento. Após o prazo, a peça volta para a venda.</div>');
    if(tipo==='os' && on('assinatura')) L.push('<div class="assinatura"></div><div class="sub">Assinatura do cliente</div>');
    return L.join('');
  }
  window.Cupom = { cfg: cfg, html: html, imprimir: imprimir, previa: previa, exemplo: exemplo, TIPO_POR_TITULO: TIPO_POR_TITULO };
})();
