/* BUSCA LIVRE DE VIAS POR CARD (13/11) — Venda, Pedido e Orçamento.
 * Seção com campo + botão Buscar, SEM filtro de data/status: acha só o que é daquele card, por partes do nome (juntas ou separadas),
 * código da via, telefone, vendedora, loja, produto, status e data. Leitor de código: ao ler, abre a via sozinho (sem clicar em nada).
 * Clicar num resultado abre a ficha com Abrir a via e Editar (Editar aparece para todos; Pedido já ENTREGUE pede a senha de gerente/diretoria,
 * quem é gerente/diretoria logado já vale). Mesma regra nos três cards.
 *   BuscaVias.secao(elemento, { tipo:'venda'|'pedido'|'orcamento', titulo, abrirVia(x, editar) })
 * Usa: gatewayCall, currentUser, config, Busca, Autorizacao, Leitor, __gatewaySenha (da tela que a carrega). */
(function(){
  var TABELA = { venda: 'vendas_pdv', pedido: 'ordens_servico', orcamento: 'orcamentos' };
  var ROT = { venda: 'Venda', pedido: 'Pedido', orcamento: 'Orçamento' };
  var STATUS = { rascunho:'Rascunho', aguardando:'Aprovado', enviado_fabrica:'Enviado p/ fábrica', em_producao:'Em produção', pendencia:'Pendência', oficina_pronto:'Produzido', pronto:'Pronto', entregue:'Entregue', cancelado:'Cancelado', cancelada:'Cancelada' };
  var cache = {}, cacheEm = {}, carregando = {};
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function dataBR(s){ var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function moeda(v){ var n = Number(v); return Number.isFinite(n) ? 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }) : ''; }
  function usr(){ return typeof currentUser !== 'undefined' ? currentUser : null; }
  function cfgApp(){ return typeof config !== 'undefined' ? config : null; }
  function senhaSessao(){ return typeof __gatewaySenha !== 'undefined' ? __gatewaySenha : ''; }
  function lojaSigla(id){ var l = ((cfgApp() && cfgApp().lojas) || []).find(function(x){ return x.id === id; }); return l ? (l.abreviacao || l.nome || '') : ''; }
  function gestor(){ var u = usr(); return !!(u && (u.nivel === 'diretoria' || u.nivel === 'gerente')); }
  function itensTxt(p){ return (Array.isArray(p.itens) ? p.itens : []).map(function(i){ return i.produto || i.descricao || i.produtoNome || i.nome || ''; }).filter(Boolean); }
  function montar(tipo, p){
    var itens = itensTxt(p);
    return { tipo: tipo, p: p, id: p.id, cod: p.codigoVia || p.via || '', cliente: p.cliente || '', status: p.status || '',
      alvo: [p.codigoVia, p.via, p.cliente, p.telefone, p.vendedora, lojaSigla(p.lojaId), ROT[tipo], STATUS[p.status] || p.status, dataBR(p.data), p.data].concat(itens) };
  }
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
  async function carregar(tipo){
    if (cache[tipo] && Date.now() - cacheEm[tipo] < 120000) return cache[tipo];
    if (carregando[tipo]) return carregando[tipo];
    carregando[tipo] = (async function(){
      var regs = await lerTudo(TABELA[tipo]);
      cache[tipo] = regs.map(function(p){ return montar(tipo, p); }); cacheEm[tipo] = Date.now(); carregando[tipo] = null;
      return cache[tipo];
    })();
    return carregando[tipo];
  }
  function css(){
    if (document.getElementById('bvCss')) return;
    var s = document.createElement('style'); s.id = 'bvCss';
    s.textContent = '.bv-secao{margin:0 0 14px;padding:12px 14px;border:1px solid var(--line,#d6dbe0);border-radius:12px;background:var(--surface,#fff);}'
      + '.bv-linha{display:flex;gap:8px;align-items:center;flex-wrap:wrap;} .bv-rot{font-weight:700;font-size:13.5px;flex:0 0 auto;}'
      + '.bv-campo{flex:1 1 220px;min-height:42px;border:1px solid var(--line-strong,#b8c0c8);border-radius:10px;padding:0 12px;font:inherit;font-size:16px;background:var(--surface,#fff);color:inherit;}'
      + '.bv-dica{margin-top:6px;font-size:12.5px;color:var(--ink-soft,#556);}'
      + '.bv-lista{margin-top:10px;display:flex;flex-direction:column;gap:6px;max-height:340px;overflow:auto;}'
      + '.bv-item{text-align:left;border:1px solid var(--line,#d6dbe0);background:var(--surface,#fff);color:inherit;border-radius:10px;padding:9px 12px;cursor:pointer;font:inherit;display:block;width:100%;}'
      + '.bv-item:hover,.bv-item:focus{border-color:var(--primary,#1f5f7a);outline:none;}'
      + '.bv-l1{font-weight:700;font-size:14px;} .bv-l2{font-size:12.5px;color:var(--ink-soft,#556);margin-top:2px;}'
      + '.bv-tag{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px;margin-left:6px;background:var(--line,#e3e8ec);}'
      + '.bv-vazio{padding:10px 2px;color:var(--ink-soft,#556);font-size:14px;}'
      + '.bv-fundo{position:fixed;inset:0;background:rgba(10,20,30,.5);z-index:9500;display:flex;align-items:flex-start;justify-content:center;padding:8vh 12px 12px;}'
      + '.bv-caixa{background:var(--surface,#fff);color:var(--ink,#111);border-radius:14px;width:100%;max-width:560px;max-height:84vh;overflow:auto;box-shadow:0 14px 44px rgba(0,0,0,.28);}'
      + '.bv-topo{padding:14px 14px 6px;} .bv-topo h3{margin:0;font-size:16px;}'
      + '.bv-ficha{padding:0 14px 14px;} .bv-ficha table{width:100%;border-collapse:collapse;font-size:13.5px;} .bv-ficha td{padding:5px 0;border-bottom:1px solid var(--line,#e3e8ec);vertical-align:top;} .bv-ficha td:first-child{color:var(--ink-soft,#556);width:34%;}'
      + '.bv-acoes{display:flex;gap:8px;justify-content:flex-end;padding:0 14px 14px;flex-wrap:wrap;}'
      + '.bv-b{min-height:42px;padding:0 16px;border-radius:10px;border:1px solid var(--line-strong,#b8c0c8);background:var(--surface,#fff);color:inherit;font:inherit;font-weight:600;cursor:pointer;}'
      + '.bv-b.pri{background:var(--t-primary-strong,#1f5f7a);border-color:var(--t-primary-strong,#1f5f7a);color:#fff;}';
    document.head.appendChild(s);
  }
  function pareceCodigo(t){ return /^[A-Za-z]{1,3}[-\s]?\d+[A-Za-z]?$/.test(String(t || '').trim()); }
  function semEspaco(t){ return String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function secao(el, opts){
    if (!el || !opts || !TABELA[opts.tipo]) return;
    css();
    var tipo = opts.tipo, titulo = opts.titulo || 'Buscar via';
    el.innerHTML = '<div class="bv-secao"><div class="bv-linha"><span class="bv-rot">' + esc(titulo) + '</span>'
      + '<input class="bv-campo" type="search" autocomplete="off" placeholder="Nome, código da via, telefone, vendedora, produto…" aria-label="' + esc(titulo) + '">'
      + '<button type="button" class="bv-b pri" data-bv-buscar>Buscar</button></div>'
      + '<div class="bv-dica">Sem filtro de data. Partes do nome, juntas ou separadas. Com o leitor de código, a via abre sozinha.</div>'
      + '<div class="bv-lista" style="display:none;"></div></div>';
    var campo = el.querySelector('.bv-campo'), lista = el.querySelector('.bv-lista'), seq = 0;
    function mostrar(html){ lista.style.display = html ? '' : 'none'; lista.innerHTML = html || ''; }
    async function buscar(texto, viaLeitor){
      texto = String(texto || '').trim();
      if (texto.length < 2) { mostrar('<div class="bv-vazio">Digite pelo menos 2 letras ou números.</div>'); return; }
      var meu = ++seq;
      mostrar('<div class="bv-vazio">' + (cache[tipo] ? 'Buscando…' : 'Carregando (só na primeira vez)…') + '</div>');
      var todas = await carregar(tipo);
      if (meu !== seq) return;
      var achados = Busca.filtrar(todas, texto, function(x){ return x.alvo; }, { limite: 60, ordenar: true });
      // leitor (ou código digitado) que bate com UMA via: abre direto, sem ação do usuário
      if (viaLeitor || pareceCodigo(texto)) {
        var exatos = achados.filter(function(x){ return semEspaco(x.cod) === semEspaco(texto); });
        if (exatos.length === 1 || (viaLeitor && achados.length === 1)) { var alvo = exatos[0] || achados[0]; mostrar(''); campo.value = ''; opts.abrirVia(alvo, false); return; }
      }
      if (!achados.length) { mostrar('<div class="bv-vazio">Nada encontrado para “' + esc(texto) + '”.</div>'); return; }
      mostrar(achados.map(function(x, i){
        var p = x.p;
        return '<button type="button" class="bv-item" data-i="' + i + '"><div class="bv-l1">' + esc(x.cod || '—') + ' — ' + esc(x.cliente || 'sem cliente')
          + '<span class="bv-tag">' + esc(STATUS[p.status] || p.status || ROT[tipo]) + '</span></div>'
          + '<div class="bv-l2">' + [dataBR(p.data), lojaSigla(p.lojaId), p.vendedora, p.telefone].filter(Boolean).map(esc).join(' · ') + '</div></button>';
      }).join(''));
      lista.querySelectorAll('.bv-item').forEach(function(b){ b.addEventListener('click', function(){ ficha(achados[+b.dataset.i], opts); }); });
    }
    el.querySelector('[data-bv-buscar]').addEventListener('click', function(){ buscar(campo.value, false); });
    campo.addEventListener('keydown', function(e){ if (e.key === 'Enter') { e.preventDefault(); buscar(campo.value, false); } });
    campo.addEventListener('input', function(){ if (!String(campo.value || '').trim()) { seq++; mostrar(''); } });
    if (window.Leitor) Leitor.ligar(campo, function(cod){ buscar(cod, true); }, { espera: 120 });
  }

  function ficha(x, opts){
    var p = x.p, nivelOficina = !!(usr() && usr().nivel === 'oficina');
    var itens = itensTxt(p);
    var linhas = [['Tipo', ROT[x.tipo]], ['Via', x.cod || '—'], ['Cliente', x.cliente || '—'], ['Telefone', p.telefone || ''], ['Data', dataBR(p.data)],
      ['Loja', lojaSigla(p.lojaId)], ['Vendedora', p.vendedora || ''], ['Situação', STATUS[p.status] || p.status || ''], ['Itens', itens.join(' · ')],
      ['Valor', (!nivelOficina && p.valorTotal != null) ? moeda(p.valorTotal) : '']].filter(function(l){ return l[1]; });
    var fundo = document.createElement('div'); fundo.className = 'bv-fundo';
    fundo.innerHTML = '<div class="bv-caixa" role="dialog" aria-modal="true"><div class="bv-topo"><h3>' + esc(ROT[x.tipo]) + ' ' + esc(x.cod || '') + '</h3></div>'
      + '<div class="bv-ficha"><table>' + linhas.map(function(l){ return '<tr><td>' + esc(l[0]) + '</td><td>' + esc(l[1]) + '</td></tr>'; }).join('') + '</table></div>'
      + '<div class="bv-acoes"><button type="button" class="bv-b" data-bv-x>Fechar</button><button type="button" class="bv-b" data-bv-abrir>Abrir a via</button><button type="button" class="bv-b pri" data-bv-editar>Editar</button></div></div>';
    document.body.appendChild(fundo);
    function fechar(){ fundo.remove(); }
    fundo.querySelector('[data-bv-x]').addEventListener('click', fechar);
    fundo.querySelector('[data-bv-abrir]').addEventListener('click', function(){ fechar(); opts.abrirVia(x, false); });
    fundo.querySelector('[data-bv-editar]').addEventListener('click', async function(){
      var entregue = x.tipo === 'pedido' && String(p.status) === 'entregue';
      if (entregue && !gestor()) {
        if (!window.Autorizacao) { alert('Recarregue a página (Ctrl+F5) para pedir a autorização.'); return; }
        var a = await Autorizacao.pedir({ sessao: senhaSessao(), acao: 'editar_via_entregue', modulo: 'Busca de vias', registroId: x.id,
          resumo: 'Editar a via ' + (x.cod || '') + ' de ' + (x.cliente || '') + ' (já entregue)',
          texto: 'Esta via já foi ENTREGUE. Para editar, digite a senha de um gerente ou da diretoria — fica registrado no LOG.' });
        if (!a) return;
      }
      fechar(); opts.abrirVia(x, true);
    });
  }
  window.BuscaVias = { secao: secao, _teste: { montar: montar, pareceCodigo: pareceCodigo } };
})();
