/* 22/11: BUSCADOR do PDV (shell) — caixa de texto + "onde procurar" (Tudo, Cliente, Via, Histórico da via, Produto, Tarefa, Vendedora).
 * Fala só com a Edge Function buscador-api (sessão). Resultado em linhas; tocar abre a janela do item:
 *   cliente → cadastro completo, com edição (openClienteModalCadastro do shell)
 *   via     → resumo (cliente, situação, itens, trecho encontrado) + "Abrir a via"
 *   produto → preço e estoque + "Consultar preço/estoque"
 *   tarefa  → detalhes + "Abrir na Agenda"
 * Depende do shell: openModal, closeModal, escapeHtml, showToast, abrirRegistroEncontrado, openClienteModalCadastro, abrirConsultaPreco, selecionarModulo. */
(function(){
  var CAMPOS = [['tudo','Tudo'],['cliente','Cliente'],['via','Via (código, cliente, telefone)'],['historico','Histórico (texto dentro da via)'],['produto','Produto'],['tarefa','Tarefa da agenda'],['vendedora','Vendedora']];
  var ROT_VIA = { pedido:'Pedido', venda:'Venda', orcamento:'Orçamento' };
  var ROT_TIPO = { cliente:'Cliente', produto:'Produto', tarefa:'Tarefa' };
  var ultimo = { campo:'tudo', itens:[] };
  function esc(s){ return typeof escapeHtml === 'function' ? escapeHtml(s) : String(s == null ? '' : s); }
  function brl(v){ var n = Number(v); return Number.isFinite(n) ? 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }) : ''; }
  function dataBR(s){ var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function marcar(txt, termo){
    var t = esc(txt || ''); var palavras = String(termo || '').trim().split(/\s+/).filter(function(p){ return p.length >= 2; });
    palavras.forEach(function(p){ var re = new RegExp('(' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'); t = t.replace(re, '<mark>$1</mark>'); });
    return t;
  }
  function htmlCaixa(){
    return '<div class="busca-pdv" id="boxBuscador" style="flex:1 1 100%;">'
      + '<span class="gc-icon" style="background:#EEE7F7;color:#5B3B8C;"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span>'
      + '<div class="bp-corpo"><span class="vh-label">BUSCADOR</span>'
      + '<div class="bp-linha" style="flex-wrap:wrap;"><input id="inpBuscador" type="search" autocomplete="off" placeholder="Qualquer palavra: nome, produto, observação, tarefa…" aria-label="Buscador" style="flex:2 1 200px;">'
      + '<select id="selBuscador" aria-label="Onde procurar" style="flex:1 1 150px;min-height:40px;border:1px solid var(--line-strong,#C5D0DA);border-radius:10px;padding:0 8px;font:inherit;background:var(--surface);color:var(--ink);">'
      + CAMPOS.map(function(c){ return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') + '</select>'
      + '<button type="button" class="bp-b pri" id="btnBuscador">Buscar</button></div></div></div>';
  }
  function ligar(){
    var inp = document.getElementById('inpBuscador'), sel = document.getElementById('selBuscador'), btn = document.getElementById('btnBuscador');
    if(!inp) return;
    try{ var salvo = localStorage.getItem('vilaca_buscador_campo'); if(salvo && CAMPOS.some(function(c){ return c[0] === salvo; })) sel.value = salvo; }catch(e){}
    sel.onchange = function(){ try{ localStorage.setItem('vilaca_buscador_campo', sel.value); }catch(e){} };
    var ir = function(){ var t = inp.value.trim(); if(t.replace(/\s+/g, '').length < 2){ showToast('Digite pelo menos 2 letras ou números.'); return; } buscar(t, sel.value); };
    btn.onclick = ir;
    inp.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); ir(); } });
  }
  async function chamar(body){
    var res = await fetch(window.SUPABASE_URL + '/functions/v1/buscador-api', { method:'POST', headers:{ 'Content-Type':'application/json', apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY }, body: JSON.stringify(Object.assign({ senha: typeof __gatewaySenha !== 'undefined' ? __gatewaySenha : '' }, body)) });
    return res.json().catch(function(){ return { error:'Resposta inválida.' }; });
  }
  async function buscar(termo, campo){
    var nomeCampo = (CAMPOS.find(function(c){ return c[0] === campo; }) || CAMPOS[0])[1];
    openModal('<h3 style="margin-bottom:4px;">Buscador</h3><p class="muted" style="margin:0 0 10px;">“' + esc(termo) + '” em <b>' + esc(nomeCampo) + '</b></p><div id="bdRes" class="bd-res"><div class="muted" style="padding:10px 2px;">Buscando…</div></div><div class="modal-actions"><button class="btn btn-ghost" id="bdFechar" type="button">Fechar</button></div>');
    document.getElementById('bdFechar').onclick = closeModal;
    var r = null; try{ r = await chamar({ termo: termo, campo: campo }); }catch(e){ r = { error:'Sem conexão. Confira a internet e tente de novo.' }; }
    var box = document.getElementById('bdRes'); if(!box) return;
    if(!r || r.error){ box.innerHTML = '<div class="muted" style="padding:10px 2px;">' + esc((r && r.error) || 'Não consegui buscar agora.') + '</div>'; return; }
    var itens = r.itens || []; ultimo = { campo: campo, termo: termo, itens: itens };
    if(!itens.length){ box.innerHTML = '<div class="muted" style="padding:10px 2px;">' + esc(r.aviso || 'Nada encontrado. Tente outra palavra ou outro campo.') + '</div>'; return; }
    box.innerHTML = '<div class="muted" style="font-size:12.5px;margin-bottom:6px;">' + itens.length + ' resultado(s). Toque para abrir.</div>' + itens.map(function(it, i){
      var tag = it.tipo === 'via' ? (ROT_VIA[it.viaTipo] || 'Via') : (ROT_TIPO[it.tipo] || it.tipo);
      return '<button type="button" class="bd-item" data-bd="' + i + '"><span class="bd-tag bd-' + esc(it.tipo) + '">' + esc(tag) + '</span><span class="bd-txt"><b>' + marcar(it.titulo, termo) + '</b>'
        + (it.sub ? '<small>' + marcar(it.sub, termo) + '</small>' : '') + (it.trecho ? '<small class="bd-trecho">' + marcar(it.trecho, termo) + '</small>' : '') + '</span></button>';
    }).join('');
    box.querySelectorAll('[data-bd]').forEach(function(b){ b.onclick = function(){ abrirItem(itens[+b.dataset.bd]); }; });
  }
  function voltarLista(){ buscar(ultimo.termo, ultimo.campo); }
  function abrirItem(it){
    if(!it) return;
    if(it.tipo === 'cliente'){ closeModal(); setTimeout(function(){ openClienteModalCadastro(it.cliente, false); }, 60); return; }
    var corpo = '', acao = '';
    if(it.tipo === 'via'){
      var v = it.via || {};
      corpo = '<div class="bd-ficha">'
        + linha('Cliente', v.cliente) + linha('Telefone', v.telefone) + linha('Situação', v.status) + linha('Loja', v.loja) + linha('Data', dataBR(v.data))
        + linha('Vendedora', v.vendedora) + linha('Serviço', v.servico) + linha('Válido até', dataBR(v.validade)) + linha('Valor', v.valorTotal != null ? brl(v.valorTotal) : '')
        + ((v.itens || []).length ? '<div class="bd-l"><span>Itens</span><b>' + v.itens.map(esc).join('<br>') + '</b></div>' : '')
        + (v.descricao ? '<div class="bd-l"><span>Observação</span><b style="white-space:pre-wrap;">' + esc(v.descricao) + '</b></div>' : '')
        + (it.trecho ? '<div class="bd-l"><span>Onde achou</span><b>' + marcar(it.trecho, ultimo.termo) + '</b></div>' : '') + '</div>';
      acao = '<button class="btn btn-accent" id="bdAbrir" type="button">Abrir a via</button>';
    } else if(it.tipo === 'produto'){
      var p = it.produto || {};
      corpo = '<div class="bd-ficha">' + linha('Código', p.codigo) + linha('Preço', p.precoVenda != null ? brl(p.precoVenda) : '') + linha('Estoque (suas lojas)', String(p.estoque))
        + ((p.porLoja || []).length ? '<div class="bd-l"><span>Por loja</span><b>' + p.porLoja.map(function(x){ return esc(x.loja) + ': ' + x.qtd; }).join('<br>') + '</b></div>' : '') + '</div>';
      acao = '<button class="btn btn-accent" id="bdAbrir" type="button">Consultar preço e estoque</button>';
    } else if(it.tipo === 'tarefa'){
      var t = it.tarefa || {};
      corpo = '<div class="bd-ficha">' + linha('Data', (t.data ? dataBR(t.data) : 'sem data') + (t.hora ? ' às ' + t.hora : '')) + linha('Criada por', t.de)
        + linha('Andamento', { a_fazer:'A fazer', fazendo:'Fazendo', feito:'Feita' }[t.coluna] || '') + (t.descricao ? '<div class="bd-l"><span>Detalhes</span><b style="white-space:pre-wrap;">' + esc(t.descricao) + '</b></div>' : '') + '</div>';
      acao = '<button class="btn btn-accent" id="bdAbrir" type="button">Abrir na Agenda</button>';
    }
    var titulo = it.tipo === 'via' ? (ROT_VIA[it.viaTipo] || 'Via') + ' ' + (it.codigoVia || '') : it.titulo;
    openModal('<h3>' + esc(titulo) + '</h3>' + corpo + '<div class="modal-actions"><button class="btn btn-ghost" id="bdVoltar" type="button">← Voltar à lista</button>' + acao + '</div>');
    document.getElementById('bdVoltar').onclick = voltarLista;
    var a = document.getElementById('bdAbrir');
    if(a) a.onclick = function(){
      closeModal();
      if(it.tipo === 'via') abrirRegistroEncontrado(it.viaTipo, { id: it.id, codigoVia: it.codigoVia });
      else if(it.tipo === 'produto') abrirConsultaPreco(it.produto.codigo || it.produto.nome);
      else if(it.tipo === 'tarefa') selecionarModulo('agenda');
    };
  }
  function linha(k, v){ return v ? '<div class="bd-l"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>' : ''; }
  var CSS = '.bd-res{display:flex;flex-direction:column;gap:6px;max-height:62vh;overflow:auto;}'
    + '.bd-item{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer;font:inherit;color:var(--ink);min-height:48px;}'
    + '.bd-item:hover{border-color:var(--primary);}.bd-txt{display:flex;flex-direction:column;gap:2px;min-width:0;}.bd-txt small{color:var(--muted);font-size:12.5px;}.bd-trecho{font-style:italic;}'
    + '.bd-item mark,.bd-ficha mark{background:#FCEFB4;color:inherit;border-radius:3px;padding:0 1px;}'
    + '.bd-tag{flex:0 0 auto;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;border-radius:999px;padding:3px 8px;background:var(--primary-soft,#e3f1f6);color:var(--primary,#1f5f7a);margin-top:1px;}'
    + '.bd-tag.bd-cliente{background:#E3F4EA;color:#1B7A43;}.bd-tag.bd-produto{background:#FBF5E2;color:#8A6D12;}.bd-tag.bd-tarefa{background:#EEE7F7;color:#5B3B8C;}'
    + '.bd-ficha{display:flex;flex-direction:column;gap:2px;}.bd-l{display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--line);}.bd-l span{flex:0 0 120px;color:var(--muted);font-size:13px;}.bd-l b{font-weight:600;min-width:0;word-break:break-word;}';
  function css(){ if(document.getElementById('bdCss')) return; var s = document.createElement('style'); s.id = 'bdCss'; s.textContent = CSS; document.head.appendChild(s); }
  window.Buscador = { html: function(){ css(); return htmlCaixa(); }, ligar: ligar, buscar: buscar };
})();
