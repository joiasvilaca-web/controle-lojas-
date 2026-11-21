/* 22/11: "O que o cliente recebe" (Modelos WhatsApp › aba Prévia do cliente, só Diretoria).
 * Monta, com dados de EXEMPLO, a mensagem exatamente como sai pela API oficial: corpo do modelo ATIVO (meta_modelos, via modelos-api)
 * + as variáveis preenchidas pela mesma regra do servidor (disparo-cloud / acompanhamento-auto: miolo, primeiro nome, loja pública).
 * Para cada envio mostra também o CARD do link (título, imagem e endereço da página) e abre a página de exemplo (?demo=…).
 * PreviaCliente.montar(el, { modelos, config }) */
(function(){
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function bonito(t){ return String(t || '').trim().toLowerCase().replace(/(^|\s)\S/g, function(m){ return m.toUpperCase(); }); }
  function primeiro(n){ return bonito(String(n || '').trim().split(/\s+/)[0] || ''); }
  function limpa(t){ return String(t || '').replace(/[\t\n\r]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 900); }
  /* igual ao miolo() do servidor: tira saudação, parágrafos com link e as frases fixas, e junta numa linha */
  function miolo(t){
    var ps = String(t || '').split(/\n\s*\n/).filter(function(p){ return !/https?:\/\//i.test(p) && !/Para falar com a gente|Responda com|responda SAIR|Veja o seu or/i.test(p); });
    var s = ps.join(' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(Ol[aá]|Oi),?\s*[^!]*!\s*/i, '').replace(/Aqui é da [^.]*\.\s*/, '');
    return limpa(s);
  }
  function brl(v){ return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }); }
  function hojeMais(d){ var x = new Date(); x.setDate(x.getDate() + d); return x.toLocaleDateString('pt-BR'); }
  function wa(t){ return esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/(https?:\/\/[^\s<]+)/g, '<span class="pc-link">$1</span>').replace(/\n/g, '<br>'); }
  function corpoDe(modelos, chave){ var m = (modelos || []).find(function(x){ return x.chave === chave; }); return m ? { corpo: m.corpo || '', nome: m.nome_template || chave, rodape: chave === 'posvenda' ? 'Equipe Vilaça Joias' : 'Vilaça Joias', botao: chave === 'posvenda' ? 'Avaliar no Google' : '' } : null; }
  function preencherModelo(corpo, vars){ return String(corpo || '').replace(/\{\{\s*(\d+)\s*\}\}/g, function(_m, n){ var v = vars[Number(n) - 1]; return v == null || v === '' ? '…' : v; }); }
  var PAGINAS = {
    venda:   { url:'via.html?t=venda&id=EXEMPLO', demo:'via.html?demo=venda', titulo:'Sua via — Vilaça Joias', img:'logo-vilaca.webp?v=6' },
    orc:     { url:'via.html?t=orc&id=EXEMPLO', demo:'via.html?demo=orc', titulo:'Sua via — Vilaça Joias', img:'logo-vilaca.webp?v=6' },
    orcRec:  { url:'via.html?t=orc&id=EXEMPLO', demo:'via.html?demo=orc-recusado', titulo:'Sua via — Vilaça Joias', img:'logo-vilaca.webp?v=6' },
    res:     { url:'via.html?t=res&id=EXEMPLO', demo:'via.html?demo=res', titulo:'Sua via — Vilaça Joias', img:'logo-vilaca.webp?v=6' },
    os:      { url:'acompanhar.html?id=EXEMPLO', demo:'acompanhar.html?demo=1', titulo:'Acompanhe sua ordem de serviço — Vilaça Joias', img:'logo-vilaca.webp?v=6' },
    reforma: { url:'reforma.html?t=EXEMPLO', demo:'reforma.html', titulo:'Reforma de Joias — Reforma Joias', img:'logo-reforma.svg' }
  };
  function montar(el, o){
    o = o || {}; var cfg = o.config || {}, modelos = o.modelos || [];
    var lojas = (cfg.lojas || []).filter(function(l){ return l && l.id && l.id !== 'loja_of' && l.id !== 'loja_uc' && l.id !== 'loja_tr'; });
    var estado = { loja: (lojas.find(function(l){ return l.id === 'loja_jb'; }) || lojas[0] || {}).id || '', cliente:'MARIA APARECIDA SILVA', vendedora:'PATY SOUZA', valor:890 };
    function nomeLoja(id){ var l = lojas.find(function(x){ return x.id === id; }) || {}; return l.nomePublico || l.nomeFantasia || l.nome || 'VILAÇA JOIAS'; }
    function fantasiaLoja(id){ var l = lojas.find(function(x){ return x.id === id; }) || {}; return l.nomeFantasia || l.nome || 'Vilaça Joias'; }
    function base(){ return (window.APP_URL || 'https://vilaca.app').replace(/\/$/, '') + '/'; }
    function envios(){
      var cl = estado.cliente, nome1 = primeiro(cl), vend = bonito(String(estado.vendedora).split(/\s+/).slice(0, 2).join(' ')), loja = nomeLoja(estado.loja);
      var vendCompleta = bonito(estado.vendedora), valor = brl(estado.valor), validade = hojeMais(7);
      var lista = [];
      function viaModelo(grupo, titulo, quando, pagina, vars2, vars3){
        var md = corpoDe(modelos, 'via'); if(!md) return;
        var link = base() + PAGINAS[pagina].url;
        lista.push({ grupo:grupo, titulo:titulo, quando:quando, modelo:md, texto: preencherModelo(md.corpo, [vars2 && vars2.nomeCru ? String(cl).split(/\s+/)[0] : nome1, vars2 ? vars2.v2 : vend, vars3 || loja, link]), pagina:pagina });
      }
      // VENDA
      viaModelo('Venda', 'Venda — ao salvar', 'Automático ao salvar a venda (com celular). O botão do WhatsApp na lista manda a mesma mensagem.', 'venda');
      // PEDIDO
      viaModelo('Pedido', 'Pedido — ao salvar (Aprovado)', 'Automático ao lançar o pedido (com celular).', 'os');
      viaModelo('Pedido', 'Pedido — botão do WhatsApp (qualquer status: na fábrica, pendência, disponível para retirada, entregue…)', 'Só quando alguém toca no botão. O status NÃO aparece no texto: vai a mesma mensagem com o link, e o cliente vê o status ao abrir.', 'os');
      // ORÇAMENTO
      var STs = Array.isArray(cfg.statusOrcamento) ? cfg.statusOrcamento : [];
      var passos = (cfg.orcamentoAcoes && Array.isArray(cfg.orcamentoAcoes.passos)) ? cfg.orcamentoAcoes.passos : [];
      var mdOrc = corpoDe(modelos, 'orcamento');
      function textoStatus(st){
        if(!st) return '';
        var de = st.descontoEspecial && st.descontoEspecial.ativo ? st.descontoEspecial : null;
        var t = (de && de.mensagemWhatsapp) || st.mensagemWhatsapp || '';
        var pct = de ? Number(de.percentual) || 0 : 0;
        return t.replace(/\{cliente\}/g, nome1).replace(/\{vendedora\}/g, vendCompleta).replace(/\{loja\}/g, loja).replace(/\{valor\}/g, valor).replace(/\{validade\}/g, validade)
          .replace(/\{desconto\}/g, pct + '%').replace(/\{valorDesconto\}/g, brl(estado.valor * (1 - pct / 100))).replace(/\{link\}/g, base() + PAGINAS.orc.url);
      }
      if(mdOrc){
        var vistos = {};
        passos.forEach(function(p){
          var st = STs.find(function(s){ return s.id === p.statusId; }); var tx = p.mensagem || textoStatus(st); vistos[p.statusId] = 1;
          if(!tx) return;
          lista.push({ grupo:'Orçamento', titulo:'Orçamento — ' + (p.nome || (st && st.nome) || p.statusId) + (Number(p.dias) ? ' (dia ' + p.dias + ')' : ' (ao salvar, na hora)'),
            quando: Number(p.dias) ? 'Automático, ' + p.dias + ' dias depois (9h–20h), se o orçamento continuar aberto. Também sai se alguém mudar para este status na mão.' : 'Automático logo depois de salvar o orçamento.',
            modelo: mdOrc, texto: preencherModelo(mdOrc.corpo, [nome1, loja, miolo(tx), base() + PAGINAS.orc.url]), pagina: p.statusId === 'recusado' ? 'orcRec' : 'orc', original: tx });
        });
        STs.forEach(function(st){
          if(vistos[st.id] || st.encerra) return; var tx = textoStatus(st); if(!tx) return;
          lista.push({ grupo:'Orçamento', titulo:'Orçamento — mudar para "' + (st.nome || st.id) + '"', quando:'Só quando alguém muda o status na mão.', modelo: mdOrc, texto: preencherModelo(mdOrc.corpo, [nome1, loja, miolo(tx), base() + PAGINAS.orc.url]), pagina:'orc', original: tx });
        });
      }
      viaModelo('Orçamento', 'Orçamento — botão do WhatsApp', 'Só quando alguém toca no botão do orçamento. Vai a mensagem padrão da via (o texto do status não entra).', 'orc');
      // RESERVA / RETIRADA
      viaModelo('Venda', 'Reserva — "Enviar ao cliente"', 'Só pelo botão depois de salvar a reserva. O texto do popup não chega ao cliente: sai o modelo da via.', 'res', { v2:'nossa equipe', nomeCru:true }, 'VILAÇA JOIAS');
      viaModelo('Pedido', 'Retirada — "Reenviar link ao cliente"', 'Só pelo botão na tela de retirada.', 'os', { v2:'nossa equipe', nomeCru:true }, 'VILAÇA JOIAS');
      // PÓS-VENDA / ANIVERSÁRIO
      var mdPv = corpoDe(modelos, 'posvenda');
      if(mdPv) lista.push({ grupo:'Pós-venda e aniversário', titulo:'Pós-venda (venda e pedido)', quando:'Automático ' + ((cfg.posVendaAuto && cfg.posVendaAuto.dias) || 7) + ' dias depois da venda / da entrega do pedido (9h–20h). Também pelo botão Enviar pós-venda.', modelo: mdPv, texto: preencherModelo(mdPv.corpo, [nome1]), pagina:'' });
      var mdAn = corpoDe(modelos, 'aniversario');
      if(mdAn) lista.push({ grupo:'Pós-venda e aniversário', titulo:'Aniversário', quando:'Automático no dia do aniversário (depois das 9h). Também pela Mala direta › Aniversariantes de hoje.', modelo: mdAn, texto: preencherModelo(mdAn.corpo, [nome1]), pagina:'' });
      // CHAMAR CLIENTE / RECADO
      var mdCh = corpoDe(modelos, 'chamar_cliente');
      if(mdCh){
        var eu = 'ANA', lojaF = fantasiaLoja(estado.loja);
        lista.push({ grupo:'Mensagem escrita pela equipe', titulo:'Chamar cliente', quando:'Só quando alguém escreve e envia (PDV ou Marketing).', modelo: mdCh, texto: preencherModelo(mdCh.corpo, [nome1, eu, lojaF, 'Sua aliança chegou, pode vir buscar quando quiser.']), pagina:'' });
        lista.push({ grupo:'Mensagem escrita pela equipe', titulo:'Recado de pendência do pedido', quando:'Só quando a vendedora envia o recado (Avisos ou Pedido). O texto da Oficina nunca vai.', modelo: mdCh, texto: preencherModelo(mdCh.corpo, [nome1, eu, lojaF, 'Atualização do seu pedido JB12P — situação: *PENDÊNCIA*. A pedra escolhida está em falta; me chame para escolhermos outra.']), pagina:'' });
      }
      var mdCa = corpoDe(modelos, 'campanha');
      if(mdCa) lista.push({ grupo:'Mensagem escrita pela equipe', titulo:'Mala direta (campanha)', quando:'Só quando alguém envia pela Mala direta. Links e saudação do texto digitado são retirados.', modelo: mdCa, texto: preencherModelo(mdCa.corpo, [nome1, 'Semana das alianças: 10% de desconto à vista em todas as lojas até sábado.']), pagina:'' });
      // REFORMA
      lista.push({ grupo:'Reforma Joias', titulo:'Reforma Joias — via (venda, pedido, orçamento)', quando:'A loja Reforma manda pelo número próprio, em texto livre (não é modelo da Meta).', modelo: { nome:'texto livre (chip reformajoias)', rodape:'' },
        texto: 'Olá, ' + nome1 + '!\n\nAtendimento: ' + vend + ' · Reforma Joias.\n\nTodas as informações da sua via podem ser visualizadas pelo link:\n' + base() + PAGINAS.venda.url, pagina:'venda' });
      return lista;
    }
    function cardHtml(pg){
      var p = PAGINAS[pg]; if(!p) return '';
      return '<div class="pc-card"><img src="' + esc(p.img) + '" alt="" loading="lazy"><div><b>' + esc(p.titulo) + '</b><small>' + esc((window.APP_URL || 'https://vilaca.app').replace(/^https?:\/\//, '')) + '</small></div></div>';
    }
    function desenhar(){
      var lista = envios(), grupos = [];
      lista.forEach(function(e){ if(grupos.indexOf(e.grupo) < 0) grupos.push(e.grupo); });
      el.innerHTML = '<div class="card"><p class="small muted" style="margin:0 0 10px;">Exatamente o que chega no WhatsApp do cliente hoje, montado com o modelo ATIVO da Meta e os textos configurados, com dados de exemplo. Toque em “Ver a página do link” para abrir a página que o cliente vê (exemplo, sem dados reais).</p>'
        + '<div class="pc-filtros"><label>Loja <select id="pcLoja">' + lojas.map(function(l){ return '<option value="' + esc(l.id) + '"' + (l.id === estado.loja ? ' selected' : '') + '>' + esc(l.nome || l.id) + '</option>'; }).join('') + '</select></label>'
        + '<label>Cliente <input id="pcCli" value="' + esc(estado.cliente) + '"></label><label>Vendedora <input id="pcVend" value="' + esc(estado.vendedora) + '"></label><label>Valor <input id="pcValor" inputmode="decimal" value="' + esc(String(estado.valor).replace('.', ',')) + '"></label></div></div>'
        + grupos.map(function(g){ return '<h3 class="pc-grupo">' + esc(g) + '</h3>' + lista.filter(function(e){ return e.grupo === g; }).map(function(e, i){
          return '<div class="card pc-item"><div class="pc-cab"><b>' + esc(e.titulo) + '</b><span class="selo cinza" title="Modelo usado">' + esc(e.modelo.nome) + '</span></div><p class="small muted" style="margin:4px 0 10px;">' + esc(e.quando) + '</p>'
            + '<div class="pc-fundo"><div class="pc-balao">' + (e.pagina ? cardHtml(e.pagina) : '') + '<div>' + wa(e.texto) + '</div>' + (e.modelo.rodape ? '<div class="pc-rodape">' + esc(e.modelo.rodape) + '</div>' : '') + '<div class="pc-hora">' + new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) + '</div>'
            + (e.modelo.botao ? '<div class="pc-botao">↗ ' + esc(e.modelo.botao) + '</div>' : '') + '</div></div>'
            + (e.original ? '<details class="small" style="margin-top:8px;"><summary>Texto configurado no status (o que entra é só a parte sem saudação e sem links)</summary><div class="prev">' + esc(e.original) + '</div></details>' : '')
            + (e.pagina ? '<div class="acoes" style="margin-top:8px;"><a class="btn btn-sm" href="' + esc(PAGINAS[e.pagina].demo) + '" target="_blank" rel="noopener">Ver a página do link (exemplo)</a></div>' : '') + '</div>';
        }).join(''); }).join('');
      var on = function(id, f){ var x = document.getElementById(id); if(x) x.addEventListener('change', f); };
      on('pcLoja', function(e){ estado.loja = e.target.value; desenhar(); });
      on('pcCli', function(e){ estado.cliente = e.target.value || estado.cliente; desenhar(); });
      on('pcVend', function(e){ estado.vendedora = e.target.value || estado.vendedora; desenhar(); });
      on('pcValor', function(e){ var n = Number(String(e.target.value).replace(/\./g, '').replace(',', '.')); if(n > 0) estado.valor = n; desenhar(); });
    }
    if(!document.getElementById('pcCss')){ var s = document.createElement('style'); s.id = 'pcCss'; s.textContent =
      '.pc-filtros{display:flex;flex-wrap:wrap;gap:10px;}.pc-filtros label{display:flex;flex-direction:column;font-size:12px;color:var(--ink-faint);gap:4px;}.pc-filtros input,.pc-filtros select{min-height:36px;border:1px solid var(--line);border-radius:8px;padding:0 8px;font:inherit;background:var(--surface);color:var(--ink);}'
      + '.pc-grupo{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-faint);margin:18px 0 8px;}.pc-cab{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;}'
      + '.pc-fundo{background:#E9E2D8;border-radius:12px;padding:14px;}.pc-balao{max-width:420px;background:#fff;color:#111;border-radius:0 10px 10px 10px;padding:8px 10px 6px;font-size:14px;line-height:1.42;box-shadow:0 1px 1px rgba(0,0,0,.12);position:relative;}'
      + '.pc-link{color:#027EB5;word-break:break-all;}.pc-rodape{color:#8a8a8a;font-size:12.5px;margin-top:6px;}.pc-hora{text-align:right;color:#999;font-size:11px;}.pc-botao{border-top:1px solid #eee;margin:6px -10px -6px;padding:9px;text-align:center;color:#027EB5;font-weight:600;}'
      + '.pc-card{display:flex;gap:8px;align-items:center;background:#F3F3F3;border-radius:8px;padding:6px;margin-bottom:6px;}.pc-card img{width:48px;height:48px;object-fit:cover;border-radius:6px;background:#fff;}.pc-card b{display:block;font-size:13px;}.pc-card small{color:#777;font-size:12px;}';
      document.head.appendChild(s); }
    desenhar();
  }
  window.PreviaCliente = { montar: montar, _miolo: miolo, _preencherModelo: preencherModelo };
})();
