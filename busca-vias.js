/* BUSCA LIVRE DE VIAS (13/11).
 * Dois usos, a MESMA regra de edição: (1) PDV › "Buscar em tudo" (shell): Vendas + Pedidos + Orçamentos; (2) dentro de cada card (Venda, Pedido, Orçamento):
 * BuscaVias.abrir({ tipos:['venda'], titulo, abrirVia(x, editar) }) acha só o que é daquele card.
 * Sem filtro de data nem de loja além da permissão do login: digite parte do nome (junto ou separado), do código da via,
 * telefone, vendedora, produto, status… e ela mostra Vendas, Pedidos e Orçamentos. Clicar abre a ficha da via, com o botão Editar
 * para todos; via de pedido já ENTREGUE pede a senha de um gerente ou da diretoria (quem é gerente/diretoria já está autorizado).
 * Usa: gatewayCall, currentUser, config, Busca, Autorizacao, abrirRegistroEncontrado (index.html). */
(function(){
  var cache = {}, cacheEm = {}, carregando = {}, cfg = null;
  var TABELA = { venda: 'vendas_pdv', pedido: 'ordens_servico', orcamento: 'orcamentos' };
  var ROT = { venda: 'Venda', pedido: 'Pedido', orcamento: 'Orçamento' };
  var STATUS = { rascunho:'Rascunho', aguardando:'Aprovado', enviado_fabrica:'Enviado p/ fábrica', em_producao:'Em produção', pendencia:'Pendência', oficina_pronto:'Produzido', pronto:'Pronto', entregue:'Entregue', cancelado:'Cancelado', cancelada:'Cancelada' };
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function dataBR(s){ var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function moeda(v){ var n = Number(v); return Number.isFinite(n) ? 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }) : ''; }
  function lojaSigla(id){ var l = ((window.config && config.lojas) || []).find(function(x){ return x.id === id; }); return l ? (l.abreviacao || l.nome || '') : ''; }
  function gestor(){ return window.currentUser && (currentUser.nivel === 'diretoria' || currentUser.nivel === 'gerente'); }

  async function lerTudo(tabela){
    var linhas = [];
    for (var pg = 0; pg < 200; pg++) {
      var r = await gatewayCall({ op: 'selectPage', table: tabela, params: { from: linhas.length, tamanho: 1000 } });
      if (!r || r.error) break;
      var lote = r.data || [];
      linhas.push.apply(linhas, lote);
      if (r.fim || !lote.length) break;
    }
    return linhas.map(function(l){ return l.payload; }).filter(Boolean);
  }
  function itensTxt(p){ return (Array.isArray(p.itens) ? p.itens : []).map(function(i){ return i.produto || i.descricao || i.produtoNome || i.nome || ''; }).filter(Boolean); }
  function montar(tipo, p){
    var itens = itensTxt(p);
    return { tipo: tipo, p: p, id: p.id, cod: p.codigoVia || p.via || '', cliente: p.cliente || '', status: p.status || '',
      alvo: [p.codigoVia, p.via, p.cliente, p.telefone, p.vendedora, lojaSigla(p.lojaId), ROT[tipo], STATUS[p.status] || p.status, dataBR(p.data), p.data].concat(itens) };
  }
  async function carregarTipo(tipo, forcar){
    if (cache[tipo] && !forcar && Date.now() - cacheEm[tipo] < 120000) return cache[tipo];
    if (carregando[tipo]) return carregando[tipo];
    carregando[tipo] = (async function(){
      var regs = await lerTudo(TABELA[tipo]);
      cache[tipo] = regs.map(function(p){ return montar(tipo, p); }); cacheEm[tipo] = Date.now(); carregando[tipo] = null;
      return cache[tipo];
    })();
    return carregando[tipo];
  }
  async function carregar(tipos){
    var partes = await Promise.all(tipos.map(function(t){ return carregarTipo(t); }));
    return [].concat.apply([], partes);
  }
  function css(){
    if (document.getElementById('bvCss')) return;
    var s = document.createElement('style'); s.id = 'bvCss';
    s.textContent = '.bv-fundo{position:fixed;inset:0;background:rgba(10,20,30,.5);z-index:9000;display:flex;align-items:flex-start;justify-content:center;padding:6vh 12px 12px;}'
      + '.bv-caixa{background:var(--surface,#fff);color:var(--ink,#111);border-radius:14px;width:100%;max-width:720px;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 14px 44px rgba(0,0,0,.28);}'
      + '.bv-topo{display:flex;gap:8px;align-items:center;padding:14px 14px 8px;} .bv-topo h3{margin:0;font-size:16px;flex:1;}'
      + '.bv-campo{margin:0 14px;min-height:44px;border:1px solid var(--line-strong,#b8c0c8);border-radius:10px;padding:0 12px;font:inherit;font-size:16px;background:var(--surface,#fff);color:inherit;}'
      + '.bv-dica{margin:6px 14px 0;font-size:12.5px;color:var(--ink-soft,#556);}'
      + '.bv-lista{overflow:auto;padding:10px 14px 14px;display:flex;flex-direction:column;gap:6px;}'
      + '.bv-item{text-align:left;border:1px solid var(--line,#d6dbe0);background:var(--surface,#fff);color:inherit;border-radius:10px;padding:10px 12px;cursor:pointer;font:inherit;display:block;width:100%;}'
      + '.bv-item:hover,.bv-item:focus{border-color:var(--primary,#1f5f7a);outline:none;}'
      + '.bv-l1{font-weight:700;font-size:14px;} .bv-l2{font-size:12.5px;color:var(--ink-soft,#556);margin-top:2px;}'
      + '.bv-tag{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px;margin-left:6px;background:var(--line,#e3e8ec);}'
      + '.bv-vazio{padding:18px 4px;text-align:center;color:var(--ink-soft,#556);font-size:14px;}'
      + '.bv-ficha{padding:0 14px 14px;} .bv-ficha table{width:100%;border-collapse:collapse;font-size:13.5px;} .bv-ficha td{padding:5px 0;border-bottom:1px solid var(--line,#e3e8ec);vertical-align:top;} .bv-ficha td:first-child{color:var(--ink-soft,#556);width:34%;}'
      + '.bv-acoes{display:flex;gap:8px;justify-content:flex-end;padding:0 14px 14px;flex-wrap:wrap;}'
      + '.bv-b{min-height:42px;padding:0 16px;border-radius:10px;border:1px solid var(--line-strong,#b8c0c8);background:var(--surface,#fff);color:inherit;font:inherit;font-weight:600;cursor:pointer;}'
      + '.bv-b.pri{background:var(--t-primary-strong,#1f5f7a);border-color:var(--t-primary-strong,#1f5f7a);color:#fff;}';
    document.head.appendChild(s);
  }
  var fundo = null, seq = 0, timer = null;
  function fechar(){ if (fundo) { fundo.remove(); fundo = null; } }
  function abrir(opts){
    if (!window.currentUser) return;
    cfg = opts || { tipos: ['venda', 'pedido', 'orcamento'], titulo: 'Buscar em tudo' };
    css(); fechar();
    fundo = document.createElement('div'); fundo.className = 'bv-fundo';
    fundo.innerHTML = '<div class="bv-caixa" role="dialog" aria-modal="true" aria-label="' + esc(cfg.titulo) + '">'
      + '<div class="bv-topo"><h3>' + esc(cfg.titulo) + '</h3><button type="button" class="bv-b" id="bvX">Fechar</button></div>'
      + '<input class="bv-campo" id="bvQ" type="search" autocomplete="off" placeholder="Nome, código da via, telefone, vendedora, produto…" aria-label="Buscar vias">'
      + '<div class="bv-dica">Sem filtro de data. Digite partes do nome, juntas ou separadas (ex.: “maria silva” ou “silva maria”).</div>'
      + '<div class="bv-lista" id="bvRes"><div class="bv-vazio">Digite pelo menos 2 letras ou números.</div></div></div>';
    document.body.appendChild(fundo);
    var q = fundo.querySelector('#bvQ');
    fundo.querySelector('#bvX').addEventListener('click', fechar);
    q.addEventListener('input', function(){ clearTimeout(timer); timer = setTimeout(function(){ buscar(q.value); }, 250); });
    q.addEventListener('keydown', function(e){ if (e.key === 'Escape') fechar(); if (e.key === 'Enter') { clearTimeout(timer); buscar(q.value); } });
    setTimeout(function(){ try { q.focus(); } catch (e) {} }, 40);
  }
  async function buscar(texto){
    var box = fundo && fundo.querySelector('#bvRes'); if (!box) return;
    texto = String(texto || '').trim();
    if (texto.length < 2) { box.innerHTML = '<div class="bv-vazio">Digite pelo menos 2 letras ou números.</div>'; return; }
    var meu = ++seq;
    var jaTem = cfg.tipos.every(function(t){ return cache[t]; });
    box.innerHTML = '<div class="bv-vazio">' + (jaTem ? 'Buscando…' : 'Carregando as vias (só na primeira vez)…') + '</div>';
    var lista = await carregar(cfg.tipos);
    if (meu !== seq || !fundo) return;
    var achados = Busca.filtrar(lista, texto, function(x){ return x.alvo; }, { limite: 80, ordenar: true });
    if (!achados.length) { box.innerHTML = '<div class="bv-vazio">Nenhuma via encontrada para “' + esc(texto) + '”.</div>'; return; }
    box.innerHTML = achados.map(function(x, i){
      var p = x.p;
      return '<button type="button" class="bv-item" data-i="' + i + '"><div class="bv-l1">' + esc(ROT[x.tipo]) + ' ' + esc(x.cod || '—') + ' — ' + esc(x.cliente || 'sem cliente')
        + '<span class="bv-tag">' + esc(STATUS[p.status] || p.status || (x.tipo === 'venda' ? 'Venda' : '')) + '</span></div>'
        + '<div class="bv-l2">' + [dataBR(p.data), lojaSigla(p.lojaId), p.vendedora, p.telefone].filter(Boolean).map(esc).join(' · ') + '</div></button>';
    }).join('');
    box.querySelectorAll('.bv-item').forEach(function(b){ b.addEventListener('click', function(){ ficha(achados[+b.dataset.i]); }); });
  }
  function abrirVia(x, editar){
    if (cfg && typeof cfg.abrirVia === 'function') return cfg.abrirVia(x, editar);
    abrirRegistroEncontrado(x.tipo, { id: x.id, codigoVia: x.cod }, { editar: editar });
  }
  function ficha(x){
    var p = x.p, caixa = fundo.querySelector('.bv-caixa'), nivelOficina = currentUser && currentUser.nivel === 'oficina';
    var itens = itensTxt(p);
    var linhas = [['Tipo', ROT[x.tipo]], ['Via', x.cod || '—'], ['Cliente', x.cliente || '—'], ['Telefone', p.telefone || ''], ['Data', dataBR(p.data)],
      ['Loja', lojaSigla(p.lojaId)], ['Vendedora', p.vendedora || ''], ['Situação', STATUS[p.status] || p.status || ''], ['Itens', itens.join(' · ')],
      ['Valor', (!nivelOficina && p.valorTotal != null) ? moeda(p.valorTotal) : '']].filter(function(l){ return l[1]; });
    caixa.innerHTML = '<div class="bv-topo"><h3>' + esc(ROT[x.tipo]) + ' ' + esc(x.cod || '') + '</h3></div>'
      + '<div class="bv-ficha"><table>' + linhas.map(function(l){ return '<tr><td>' + esc(l[0]) + '</td><td>' + esc(l[1]) + '</td></tr>'; }).join('') + '</table></div>'
      + '<div class="bv-acoes"><button type="button" class="bv-b" id="bvVoltar">Voltar à busca</button><button type="button" class="bv-b" id="bvAbrir">Abrir a via</button><button type="button" class="bv-b pri" id="bvEditar">Editar</button></div>';
    caixa.querySelector('#bvVoltar').addEventListener('click', function(){ abrir(cfg); });
    caixa.querySelector('#bvAbrir').addEventListener('click', function(){ fechar(); abrirVia(x, false); });
    caixa.querySelector('#bvEditar').addEventListener('click', async function(){
      var entregue = x.tipo === 'pedido' && String(p.status) === 'entregue';
      if (entregue && !gestor()) {
        if (!window.Autorizacao) { showToast('Recarregue a página (Ctrl+F5) para pedir a autorização.'); return; }
        var a = await Autorizacao.pedir({ sessao: __gatewaySenha, acao: 'editar_via_entregue', modulo: 'Busca de vias', registroId: x.id,
          resumo: 'Editar a via ' + (x.cod || '') + ' de ' + (x.cliente || '') + ' (já entregue)',
          texto: 'Esta via já foi ENTREGUE. Para editar, digite a senha de um gerente ou da diretoria — fica registrado no LOG.' });
        if (!a) return;
      }
      fechar(); abrirVia(x, true);
    });
  }
  window.BuscaVias = { abrir: abrir, fechar: fechar, _teste: { montar: montar } };
})();
