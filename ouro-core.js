/* ouro-core.js — 27/11/2026 (Felipe): regras do ouro usadas pela Venda, pelo Pedido e pelo Cadastro.
 * Um lugar só para: teores, preço por grama a partir do Valor Balcão do dia (18k digitado à mão em
 * Cadastro › Fator › Compra de metal), arredondamento e nome do produto da peça comprada.
 *
 * Preço: 18k é digitado; os outros saem proporcionais ao teor (24k=1000, 16k=666, 14k=585, 10k=417
 * sobre 750), sempre sem centavos e com o último dígito em zero (0 a 5 desce, 6 a 9 sobe).
 * Composição (o que vai para os insumos no Descompor) é outra tabela — fica na ouro-api, no servidor.
 */
(function(){
  var TEORES = [
    { k:'24', mil:1000, label:'24k' },
    { k:'18', mil:750,  label:'18k' },
    { k:'16', mil:666,  label:'16k' },
    { k:'14', mil:585,  label:'14k' },
    { k:'10', mil:417,  label:'10k' }
  ];
  var TIPOS = [
    { id:'ANEL', nome:'ANEL' }, { id:'BRINCO', nome:'BRINCO' }, { id:'PINGENTE', nome:'PINGENTE' },
    { id:'CORDAO', nome:'CORDÃO' }, { id:'PULSEIRA', nome:'PULSEIRA' }, { id:'ALIANCA', nome:'ALIANÇA' },
    { id:'OUTRO', nome:'OUTRO' }
  ];
  var PEDRAS = [
    { id:'', nome:'SEM PEDRA' }, { id:'PEDRA NATURAL', nome:'PEDRA NATURAL' },
    { id:'PEDRA SINTETICA', nome:'PEDRA SINTÉTICA' }, { id:'PEDRA TRATADA', nome:'PEDRA TRATADA' },
    { id:'PEDRA RECONSTITUIDA', nome:'PEDRA RECONSTITUÍDA' }
  ];
  var LIMITE_AJUSTE_PCT = 5;   // quanto a vendedora pode mexer no valor calculado, sem gerente

  /** Regra do Felipe: sem centavos e o último dígito vira zero (0 a 5 desce, 6 a 9 sobe para a dezena de cima). */
  function arredondar(v){
    var n = Math.round(Number(v));
    if(!isFinite(n)) return null;
    var u = ((n % 10) + 10) % 10;
    return u <= 5 ? n - u : n - u + 10;
  }
  /** Valor Balcão do dia (18k/750) digitado em Cadastro › Fator; null enquanto ninguém digitou. */
  function valorBalcaoDia(config){
    var cm = (config && config.fator && config.fator.compraMetal) || {};
    var v = Number(cm.ouroBalcaoDia);
    return v > 0 ? v : null;
  }
  function dataBalcaoDia(config){
    var cm = (config && config.fator && config.fator.compraMetal) || {};
    return cm.ouroBalcaoDiaData || '';
  }
  /** R$/g de um teor. 18k é o valor digitado; os outros, proporcionais e arredondados. */
  function precoGrama(config, k){
    var base = valorBalcaoDia(config);
    if(base == null) return null;
    var t = teor(k);
    if(!t) return null;
    if(t.mil === 750) return Math.round(base * 100) / 100;
    return arredondar(base * t.mil / 750);
  }
  function teor(k){ k = String(k); for(var i=0;i<TEORES.length;i++) if(TEORES[i].k === k) return TEORES[i]; return null; }
  function nomeTipo(id){ for(var i=0;i<TIPOS.length;i++) if(TIPOS[i].id === id) return TIPOS[i].nome; return id; }
  function nomePedra(id){ for(var i=0;i<PEDRAS.length;i++) if(PEDRAS[i].id === id) return PEDRAS[i].nome; return id; }
  /** "1,0" / "3,8" / "2,84" — pelo menos uma casa decimal, no máximo três. (Igual à ouro-api.) */
  function fatorTexto(f){
    var s = Number(f).toFixed(3).replace(/0+$/, '');
    if(s.charAt(s.length-1) === '.') s += '0';
    return s.replace('.', ',');
  }
  /** "18 K ANEL PEDRA NATURAL F1,0" — o mesmo nome que a ouro-api monta no servidor. */
  function nomeProduto(k, tipo, pedra, fator){
    return String(k) + ' K ' + nomeTipo(tipo) + (pedra ? ' ' + nomePedra(pedra) : '') + ' F' + fatorTexto(fator);
  }
  /** Quanto o valor digitado se afastou do calculado, em %. null quando não dá para comparar. */
  function desvioPct(valor, calculado){
    valor = Number(valor); calculado = Number(calculado);
    if(!(calculado > 0) || !(valor > 0)) return null;
    return (valor / calculado - 1) * 100;
  }
  /* ===== OURO NA VIA (Venda e Pedido) =====================================
   * Mesmas três etapas nas duas telas: conferir antes de salvar, dar entrada no estoque
   * depois de salvar e desfazer tudo no cancelamento. Fica aqui para a Venda e o Pedido
   * nunca saírem do mesmo comportamento. Usa o que as duas telas já têm: a sessão
   * (__gatewaySenha), o config, o currentUser, o Destaque, a Autorizacao e o showToast. */
  var dep = { senha: function(){ return null; }, cfg: function(){ return {}; }, toast: function(){} };
  /** Cada tela liga o módulo uma vez, passando como chegar na sessão, no config e no aviso. */
  function ligar(o){ if(o){ if(o.senha) dep.senha = o.senha; if(o.cfg) dep.cfg = o.cfg; if(o.toast) dep.toast = o.toast; } }
  function aviso(msg){ try{ dep.toast(msg); }catch(e){ console.warn(msg); } }
  function marcar(sel, msg){ var D = window.Destaque; if(D && D.marcar) D.marcar(sel, msg); else aviso(msg); }
  async function api(body){
    try{
      var base = window.SUPABASE_URL || '';
      var r = await fetch(base + '/functions/v1/ouro-api', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', apikey: window.SUPABASE_ANON_KEY, Authorization:'Bearer ' + window.SUPABASE_ANON_KEY },
        body: JSON.stringify(Object.assign({ senha: dep.senha() }, body))
      });
      return await r.json();
    }catch(e){ return { error:'Falha de conexão' }; }
  }
  /** Antes de salvar: o contador das peças tem de estar zerado sempre; só o ajuste acima do
   *  limite pode ser liberado, e só com a senha de um gerente ou da diretoria (fica no LOG). */
  async function validar(holder){
    if(!window.OuroItens) return true;
    var cfg = dep.cfg();
    var e = window.OuroItens.erro(holder, cfg);
    if(e && e.indexOf('ajuste acima') >= 0){
      var n = window.OuroItens.foraDoLimite(holder, cfg).length;
      var resumo = n + (n === 1 ? ' peça de ouro com valor ajustado acima de ' : ' peças de ouro com valor ajustado acima de ') + LIMITE_AJUSTE_PCT + '% da tabela';
      if(!window.Autorizacao){ marcar('#pagOuroItens', 'Recarregue a página (Ctrl+F5) para pedir a autorização do ajuste.'); return false; }
      var r = await window.Autorizacao.pedir({ sessao: dep.senha(), acao:'ouro_ajuste_acima_limite', modulo:'Ouro', resumo: resumo,
        titulo:'Ajuste do valor do ouro', texto: resumo + '. Precisa da senha de um gerente ou da diretoria — fica registrado no LOG.' });
      if(!r){ marcar('#pagOuroItens', 'Sem autorização, deixe o ajuste dentro de ' + LIMITE_AJUSTE_PCT + '%.'); return false; }
      holder.ouroAjusteAutorizado = { por: r.nome || '', nivel: r.nivel || '', em: new Date().toISOString() };
      e = window.OuroItens.erro(holder, cfg);
    }
    if(e && e.indexOf("termo de compra de ouro") >= 0){
      // Sem termo confirmado a via não fecha — a não ser que um gerente libere (fica no LOG).
      if(!window.Autorizacao){ marcar('#pagOuroItens', e); return false; }
      var ok = confirm(e + "\n\nQuer salvar assim mesmo, com autorização de um gerente?");
      if(!ok){ marcar('#pagOuroItens', e); return false; }
      var r2 = await window.Autorizacao.pedir({ sessao: dep.senha(), acao:'ouro_sem_termo', modulo:'Ouro',
        resumo:'Salvar via com pagamento em ouro SEM o termo confirmado',
        titulo:'Salvar sem o termo do ouro', texto:'Salvar via com pagamento em ouro sem o termo confirmado. Precisa da senha de um gerente ou da diretoria — fica registrado no LOG.' });
      if(!r2){ marcar('#pagOuroItens', 'Sem autorização, confirme o termo antes de salvar.'); return false; }
      holder.termo = holder.termo || {};
      holder.termo.dispensado = { por: r2.nome || '', nivel: r2.nivel || '', em: new Date().toISOString() };
      e = window.OuroItens.erro(holder, cfg);
    }
    if(e){ marcar('#pagOuroItens', e); return false; }
    return true;
  }
  /** Depois de salvar: cada peça vira (ou reaproveita) um produto e o peso entra no estoque da
   *  loja da via. O gasto "Compra de ouro" é lançado pelo servidor (a vendedora não tem Gastos). */
  async function registrar(via){
    var itens = Array.isArray(via && via.ouroItens) ? via.ouroItens.filter(function(i){ return Number(i.gramas) > 0; }) : [];
    if(!itens.length) return;
    var lojaId = via.lojaId || (window.__lojaAtual && window.__lojaAtual.id) || '';
    if(!lojaId){ aviso('Via salva, mas não achei a loja para dar entrada no ouro.'); return; }
    try{
      var prontos = [];
      for(var k = 0; k < itens.length; k++){
        var it = itens[k];
        var r = await api({ op:'produto', teor: it.teor, tipo: it.tipo, pedra: it.pedra || '', fator: it.gramas });
        if(!r || r.error || !r.id){ aviso('Via salva, mas não consegui criar o produto do ouro: ' + ((r && r.error) || '')); return; }
        it.produtoId = r.id; it.nome = r.nome;
        prontos.push({ produtoId: r.id, nome: r.nome, gramas: it.gramas, valor: it.valor });
      }
      var e = await api({ op:'entrada', lojaId: lojaId, via: via.codigoVia || '', viaId: via.id, itens: prontos,
        venda: { id: via.id, codigoVia: via.codigoVia || '', cliente: via.cliente || '', data: via.data || '' } });
      if(!e || e.error){ aviso('Via salva, mas o ouro não entrou no estoque: ' + ((e && e.error) || '')); return; }
      via.ouroEntradaEm = new Date().toISOString();
      if(e.gastoId) via.ouroGastoId = e.gastoId;
      else aviso('Ouro deu entrada no estoque, mas o gasto da compra não foi lançado.');
    }catch(err){ console.error('ouro da via', err); aviso('Via salva, mas deu erro ao dar entrada no ouro.'); }
  }
  /** Cancelou a via: tira o ouro do estoque e cancela o gasto da compra (os dois no servidor). */
  async function estornar(via){
    if(!via || !Array.isArray(via.ouroItens) || !via.ouroItens.length || !via.ouroEntradaEm) return;
    try{
      var r = await api({ op:'estorno', via: via.id });
      if(r && r.error){ aviso('Atenção: o ouro desta via continua no estoque — ' + r.error); return; }
      via.ouroEstornadoEm = new Date().toISOString();
    }catch(e){ console.error('estorno ouro', e); aviso('Atenção: não consegui tirar o ouro desta via do estoque.'); }
  }
  /** Edição: desfaz a entrada anterior e lança de novo o que está agora. */
  async function refazer(via){
    var tinha = !!via.ouroEntradaEm && !via.ouroEstornadoEm;
    var temAgora = Array.isArray(via.ouroItens) && via.ouroItens.some(function(i){ return Number(i.gramas) > 0; });
    if(!tinha && !temAgora) return;
    if(tinha){ await estornar(via); via.ouroEntradaEm = null; }
    if(temAgora){ via.ouroEstornadoEm = null; via.ouroGastoId = null; await registrar(via); }
  }
  /* ===== TERMO DE COMPRA DE OURO =========================================
   * Disparar manda a mensagem curta com o link individual; o cliente lê, tira a foto e
   * aceita, e só então vê o código de 6 dígitos; a atendente digita o código aqui e o
   * termo fica confirmado (o PDF vai para o Drive). O número do termo é o da via, então
   * o código da via é reservado no disparo e reaproveitado quando a via for salva. */
  var TERMO_URL = function(){ return (window.SUPABASE_URL || "") + "/functions/v1/termo-ouro"; };
  async function apiTermo(body){
    try{
      var r = await fetch(TERMO_URL(), { method:"POST", headers:{ "Content-Type":"application/json", apikey: window.SUPABASE_ANON_KEY, Authorization:"Bearer " + window.SUPABASE_ANON_KEY },
        body: JSON.stringify(Object.assign({ senha: dep.senha() }, body)) });
      return await r.json();
    }catch(e){ return { error:"Falha de conexão" }; }
  }
  /** O que ainda falta no cadastro do cliente para o termo poder sair. */
  function faltaNoCadastro(c){
    var f = (window.CadastroIncompleto && window.CadastroIncompleto.faltando) ? window.CadastroIncompleto.faltando(c).slice() : [];
    if(!String((c && c.email) || "").trim()) f.push("e-mail");
    return f;
  }
  /** Mensagem de impedimento para salvar a via por causa do termo; null quando pode salvar. */
  function erroTermo(holder, cfg){
    if(!window.OuroItens || !window.OuroPag) return null;
    if(!window.OuroPag.temOuro(holder.pagamentos, cfg || dep.cfg())) return null;
    var t = holder.termo || {};
    if(t.status === "confirmado" || t.dispensado) return null;
    return "O termo de compra de ouro ainda não foi confirmado. Dispare o termo e digite o código do cliente.";
  }
  /* A tela (Venda ou Pedido) diz como chegar no cliente, na loja, no atendente e em como
     reservar o código da via — o resto do termo é igual nas duas. */
  var tela = { cliente: async function(/* holder */){ return null; }, lojaId: function(/* holder */){ return ""; }, viaTipo: "venda", atendente: function(){ return ""; }, reservarCodigo: async function(){ return null; } };
  function ligarTela(o){ if(o) Object.keys(o).forEach(function(k){ tela[k] = o[k]; }); }
  function lojaDe(id){ return ((dep.cfg().lojas || []).filter(function(l){ return l.id === id; })[0]) || null; }
  function receptorDaLoja(l){
    if(!l) return {};
    var end = [l.endereco, l.numero, l.complemento, l.bairro, l.cidade ? l.cidade + (l.estado ? "/" + l.estado : "") : ""].filter(Boolean).join(", ");
    return { nome: l.razaoSocial || l.nome || "", cnpj: l.cnpj || "", loja: l.nomeFantasia || l.nomePublico || l.nome || "", endereco: end };
  }
  function declaranteDe(c){
    c = c || {};
    return { nome: c.nome || "", cpf: c.cpf || "", nascimento: c.dataNascimento || "", fone: c.telefone || "",
      email: c.email || "", endereco: c.endereco || "", numero: c.numero || "", complemento: c.complemento || "",
      bairro: c.bairro || "", cidade: c.cidade || "", uf: c.estado || "", cep: c.cep || "" };
  }
  /** Dispara o termo: confere o cadastro, reserva o código da via e manda a mensagem. */
  async function dispararTermo(holder, itens, diz){
    var cli = await tela.cliente(holder);
    if(!cli || !String(cli.nome || "").trim()){ diz("Escolha um cliente com cadastro para poder disparar o termo.", true); return; }
    var falta = faltaNoCadastro(cli);
    if(falta.length){ diz("Complete o cadastro de " + cli.nome + " antes: falta " + falta.join(", ") + ".", true); return; }
    var lojaId = tela.lojaId(holder);
    if(!lojaId){ diz("Escolha a loja da via antes de disparar o termo.", true); return; }
    holder.termo = holder.termo || {};
    if(!holder.termo.viaCodigo){
      var cod = holder.codigoViaReservado || await tela.reservarCodigo();
      if(!cod){ diz("Não consegui reservar o número da via. Tente de novo.", true); return; }
      holder.codigoViaReservado = cod; holder.termo.viaCodigo = cod;
    }
    var r = await apiTermo({ op: "disparar", viaId: holder.termo.viaCodigo, viaCodigo: holder.termo.viaCodigo,
      viaTipo: tela.viaTipo, lojaId: lojaId, fone: cli.telefone, atendente: tela.atendente(),
      cliente: declaranteDe(cli), receptor: receptorDaLoja(lojaDe(lojaId)),
      itens: itens.map(function(i){ return { descricao: descricaoPeca(i), gramas: i.gramas, valor: i.valor }; }),
      total: itens.reduce(function(a, i){ return a + (Number(i.valor) || 0); }, 0) });
    if(!r || r.error){ diz((r && r.error) || "Não consegui enviar o termo.", true); return; }
    holder.termo.status = "enviado"; holder.termo.em = r.em || "";
    diz("Termo enviado para o celular final " + (r.enviadoPara || "") + ". Peça o código ao cliente.");
  }
  /** Confere o código que o cliente ditou; confirmado, o PDF vai para o Drive. */
  async function conferirTermo(holder, codigo, diz){
    var t = holder.termo || {};
    if(!t.viaCodigo){ diz("Dispare o termo primeiro.", true); return; }
    var r = await apiTermo({ op: "conferir", viaId: t.viaCodigo, codigo: codigo });
    if(!r || r.error){ diz((r && r.error) || "Não consegui conferir o código.", true); return; }
    holder.termo.status = "confirmado"; holder.termo.em = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    diz(r.pdf ? "Termo confirmado. PDF guardado no Drive." : "Termo confirmado. O PDF não subiu agora; dá para refazer depois.");
  }
  /** Texto de cada peça no termo: "1 Anel, ouro 18k (750), com pedra natural". */
  function descricaoPeca(i){
    var t = teor(i.teor);
    var p = i.pedra ? ", com " + String(nomePedra(i.pedra)).toLowerCase() : "";
    return "1 " + capitaliza(nomeTipo(i.tipo)) + ", ouro " + (t ? t.label + " (" + t.mil + ")" : i.teor + "k") + p + ", usado";
  }
  function capitaliza(s){ s = String(s || "").toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }
  /** Depois que a via for salva, grava o nº da NF-e de entrada no termo e refaz o PDF. */
  async function notaNoTermo(viaCodigo, numero){
    if(!viaCodigo || !numero) return null;
    return await apiTermo({ op: "nota", viaId: viaCodigo, numero: numero });
  }
  window.__ouroDispararTermo = dispararTermo;
  window.__ouroConferirTermo = conferirTermo;
  window.OuroTermo = { api: apiTermo, faltaNoCadastro: faltaNoCadastro, erro: erroTermo, ligarTela: ligarTela, nota: notaNoTermo, descricaoPeca: descricaoPeca };

  window.OuroVia = { ligar: ligar, api: api, validar: validar, registrar: registrar, estornar: estornar, refazer: refazer };

  window.OuroCore = {
    TEORES: TEORES, TIPOS: TIPOS, PEDRAS: PEDRAS, LIMITE_AJUSTE_PCT: LIMITE_AJUSTE_PCT,
    arredondar: arredondar, valorBalcaoDia: valorBalcaoDia, dataBalcaoDia: dataBalcaoDia,
    precoGrama: precoGrama, teor: teor, nomeTipo: nomeTipo, nomePedra: nomePedra,
    fatorTexto: fatorTexto, nomeProduto: nomeProduto, desvioPct: desvioPct
  };
})();
