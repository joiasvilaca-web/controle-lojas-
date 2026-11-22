/* avisos-core.js (22/11/2026) — os AVISOS dos módulos num formato único, para a AGENDA (quadro "Avisos do sistema" e calendário).
 * Mesmas regras da tela PAINEL › Avisos (avisos.html → calcularAvisos). Ao mudar uma regra lá, mude aqui também.
 * Uso: const lista = await AvisosCore.calcular({ gatewayCall, config, user });
 * Cada aviso: { id, modulo, area, icone, grupo, nivel:'danger'|'wait'|'info', titulo, sub, tag,
 *               data:'AAAA-MM-DD'|null (dia no calendário), rotuloData, abrir:{ alvo, registroId?, tab? }, classe:'urgente'|'importante'|'normal' }
 * QUEM VÊ (22/11, ordem do Felipe): só quem PARTICIPA da via (vendedora, funcionário, quem criou ou recebeu) ou a GESTÃO da loja
 * (gerente: todas as vias das lojas dela — o db-gateway já entrega só as lojas dela; diretoria: todas). Oficina: só os pedidos em poder dela.
 * DP: gestão vê tudo; os demais só a própria ficha.
 * Não grava nada: só lê (pelo db-gateway, com as permissões de quem está logado). Tabela sem permissão = seção some. */
(function(){
  'use strict';
  if(window.AvisosCore) return;
  var DIAS_ORCAMENTO_ABERTO = 5, DIAS_PRONTO_SEM_RETIRADA = 7, STATUS_ORC_FECHADOS = ['aprovado', 'recusado'];
  var CAMPOS_FICHA = [['cpf','CPF'],['rg','RG'],['dataNascimento','Data de nascimento'],['celularParticular','Celular'],['endereco','Endereço'],['numero','Número'],['bairro','Bairro'],['cidade','Cidade'],['estado','Estado'],['cep','CEP'],['dataAdmissao','Data de admissão'],['contatoEmergenciaNome','Contato de emergência'],['contatoEmergenciaTelefone','Telefone de emergência']];
  function hoje(){ var d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function diasDesde(iso){ if(!iso) return null; var a = new Date(String(iso).slice(0,10)+'T00:00:00'), h = new Date(hoje()+'T00:00:00'); return Math.round((h-a)/86400000); }
  function somaDias(iso, n){ var d = new Date(String(iso).slice(0,10)+'T12:00:00'); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function fmt(s){ if(!s) return '—'; var p = String(s).slice(0,10).split('-'); return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : s; }
  function plural(n, s, p){ return n+' '+(n===1?s:p); }
  function nomeFunc(f){ var ap = (f && f.apelido || '').trim(); return ap || (f && f.nome) || ''; }
  function via(o){ return (o.codigoVia ? o.codigoVia+' — ' : '') + (o.cliente || 'Sem cliente'); }
  var CLASSE = { danger:'urgente', wait:'importante', info:'normal' };

  async function calcular(ctx){
    var gw = ctx.gatewayCall, config = ctx.config || {}, user = ctx.user || {};
    var gestao = user.nivel==='diretoria' || user.nivel==='gerente', oficina = user.nivel==='oficina';
    var fu = (config.funcionarios||[]).find(function(x){ return x.id===user.funcionarioId; }) || {};
    var meus = [user.nome, user.apelido, fu.nome, fu.apelido].map(function(n){ return String(n||'').trim().toLowerCase(); }).filter(Boolean);
    function participo(o){ return ['vendedora','funcionario','criadoPor','recebidoPor'].some(function(k){ var v = String(o[k]||'').trim().toLowerCase(); return v && meus.indexOf(v) >= 0; }); }
    var ST_OFICINA = ['enviado_fabrica','em_producao','pendencia','oficina_pronto'];
    function vejoVia(o, pedido){ if(gestao) return true; if(oficina) return pedido && ST_OFICINA.indexOf(String(o.status||'')) >= 0; return participo(o); }
    function minhaFicha(f){ return f.funcionarioId===user.funcionarioId || meus.indexOf(String(f.nome||'').trim().toLowerCase()) >= 0 || meus.indexOf(String(f.apelido||'').trim().toLowerCase()) >= 0; }
    var hj = hoje(), out = [];
    async function ler(table){ try{ var r = await gw({ op:'selectAll', table:table }); if(!r || r.error) return null; return (r.data||[]).map(function(x){ return x.payload; }).filter(Boolean); }catch(e){ return null; } }
    function add(a){ a.classe = CLASSE[a.nivel] || 'normal'; out.push(a); }
    var nomeSt = function(id){ var s = (config.statusOrcamento||[]).find(function(x){ return x.id===id; }); return s ? (s.nome || s.label || id) : (id || '—'); };

    var r = await Promise.all([ ler('ordens_servico'), ler('orcamentos'), ler('dp_funcionarios') ]);
    var ordens = r[0], orcs = r[1], fichas = r[2];

    // ---------- CAIXA › Pedido ----------
    (ordens||[]).filter(function(o){ return vejoVia(o, true); }).forEach(function(o){
      var base = { modulo:'CAIXA', area:'Pedido', icone:'recibo', abrir:{ alvo:'os', registroId:o.id } };
      var sub = (o.serviceTypeName||o.descricao||'Serviço') + (o.loja?' · '+o.loja:'') + (o.vendedora?' · '+o.vendedora:'');
      if(o.status==='pendencia'){
        var ob = (o.observacoes||[]).filter(function(x){ return x && x.origem==='oficina'; }).sort(function(a,b){ return (b.criadoEm||0)-(a.criadoEm||0); })[0];
        var motivo = ob ? String(ob.descricao||'').replace(/^\[OFICINA\]\s*/,'').trim() : '';
        add(Object.assign({}, base, { id:'os-pend-'+o.id, grupo:'Vias em pendência', nivel:'danger', titulo:via(o), sub: motivo ? 'Oficina: '+motivo : sub, tag:'pendência', data:o.data||null, rotuloData:'Pendência', ordem:o, obsId: ob ? ob.id : null }));   // 22/11: ordem/obsId → Ciente e recado ao cliente
      } else if(o.status==='aguardando' && o.data && o.data < hj){
        add(Object.assign({}, base, { id:'os-venc-'+o.id, grupo:'Vencidos ainda na oficina', nivel:'danger', titulo:via(o), sub:sub+' · entrega prevista '+fmt(o.data), tag:plural(diasDesde(o.data),'dia','dias')+' de atraso', data:o.data, rotuloData:'Atrasado' }));
      } else if(o.status==='pronto' && o.data && (diasDesde(o.data)||0) >= DIAS_PRONTO_SEM_RETIRADA){
        add(Object.assign({}, base, { id:'os-pronto-'+o.id, grupo:'Prontos sem retirada', nivel:'wait', titulo:via(o), sub:sub+(o.telefone?' · '+o.telefone:''), tag:plural(diasDesde(o.data),'dia','dias')+' esperando', data:o.data, rotuloData:'Sem retirada' }));
      }
    });

    // ---------- CAIXA › Orçamento ----------
    (orcs||[]).filter(function(o){ return !STATUS_ORC_FECHADOS.includes(o.status) && !o.rascunho && !o.convertidoEm && vejoVia(o, false); }).forEach(function(o){
      var base = { modulo:'CAIXA', area:'Orçamento', icone:'documento', abrir:{ alvo:'orcamentos', registroId:o.id } };
      var sub = 'Status: '+nomeSt(o.status)+(o.vendedora?' · '+o.vendedora:'');
      if(o.validade && o.validade < hj){
        add(Object.assign({}, base, { id:'orc-venc-'+o.id, grupo:'Validade vencida, ainda em aberto', nivel:'danger', titulo:via(o), sub:sub+' · validade '+fmt(o.validade), tag:'expirado', data:o.validade, rotuloData:'Venceu' }));
      } else if((diasDesde(o.data||o.autoBaseData)||0) >= DIAS_ORCAMENTO_ABERTO){
        add(Object.assign({}, base, { id:'orc-parado-'+o.id, grupo:'Abertos sem mudar de status', nivel:'wait', titulo:via(o), sub:sub+' · criado '+fmt(o.data)+(o.validade?' · vale até '+fmt(o.validade):''), tag:plural(diasDesde(o.data||o.autoBaseData)||0,'dia','dias')+' parado', data:null }));
      }
    });

    // ---------- CONFIGURAÇÕES › Departamento pessoal ----------
    if(fichas){
      var base = { modulo:'DP', area:'Departamento pessoal', icone:'usuarios', abrir:{ alvo:'dp', tab:'funcionarios' } };
      fichas.filter(function(f){ return (f.status||'ativo')!=='desligado' && (gestao || minhaFicha(f)); }).forEach(function(f){
        var faltam = CAMPOS_FICHA.filter(function(c){ return !String(f[c[0]]||'').trim(); }).map(function(c){ return c[1]; });
        var pix = !!String(f.chavePix||'').trim(), conta = !!(String(f.banco||'').trim() && String(f.agencia||'').trim() && String(f.conta||'').trim());
        if(!pix && !conta) faltam.push('Dados bancários ou chave Pix');
        if(faltam.length) add(Object.assign({}, base, { id:'dp-ficha-'+(f.id||f.nome), grupo:'Fichas incompletas', nivel:'wait', titulo:nomeFunc(f)||f.nome||'Sem nome', sub:'Faltam: '+faltam.join(', '), tag:plural(faltam.length,'campo','campos'), data:null }));
        if(gestao && f.dataAdmissao){
          var d = diasDesde(f.dataAdmissao);
          if(d !== null && d >= 0 && d < 90){
            var restam = 90 - d;
            add(Object.assign({}, base, { id:'dp-exp-'+(f.id||f.nome), grupo:'Período de experiência', nivel: restam<=10 ? 'danger' : 'info', titulo:f.nome||nomeFunc(f), sub:'Admissão '+fmt(f.dataAdmissao)+' · Loja: '+(f.loja||'—'), tag:plural(restam,'dia restante','dias restantes'), data:somaDias(f.dataAdmissao, 90), rotuloData:'Fim da experiência' }));
          }
        }
      });
      if(gestao) (config.funcionarios||[]).filter(function(fc){ return !fichas.some(function(f){ return f.funcionarioId===fc.id || (f.nome||'').trim().toLowerCase()===(fc.nome||'').trim().toLowerCase(); }); }).forEach(function(fc){
        add(Object.assign({}, base, { id:'dp-semficha-'+fc.id, grupo:'Sem ficha de RH', nivel:'danger', titulo:nomeFunc(fc)||fc.nome, sub:'Cadastrado no sistema, mas sem a ficha de RH preenchida', tag:'sem ficha', data:null }));
      });
    }
    var ordem = { danger:0, wait:1, info:2 };
    out.sort(function(a,b){ return (ordem[a.nivel]-ordem[b.nivel]) || String(a.data||'9').localeCompare(String(b.data||'9')); });
    return out;
  }
  window.AvisosCore = { calcular: calcular };
})();
