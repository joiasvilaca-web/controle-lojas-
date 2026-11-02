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
      logo: v('logo', true) !== false,
      alturaMm: Math.max(0, num(c.alturaMm, 0)),
      margemSupMm: Math.max(0, num(c.margemSupMm, 0)),
      margemInfMm: Math.max(0, num(c.margemInfMm, 0)),
    };
  }
  /* Área que a cabeça térmica realmente imprime (bobina 80 mm → 72 mm; 58 mm → 48 mm).
   * Com a largura cheia da bobina o texto era cortado nas bordas (ex.: "liente:" em vez de "Cliente:"). */
  function areaImpressaoMm(larg){ larg = Number(larg)||80; return larg>=80 ? larg-8 : (larg>=58 ? larg-10 : Math.max(30, larg-4)); }
  var LOGO_IMP = 'data:image/png;base64,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';
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
      + (c.logo ? '<div style="text-align:center; margin:0 0 4px;"><img src="'+LOGO_IMP+'" alt="Vilaça App" style="width:'+Math.round(areaImpressaoMm(c.larguraBobina)*0.55)+'mm; height:auto;"></div>' : '')
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
