/* busca.js — motor de busca ÚNICO do app (window.Busca). 06/11.
 * Regras (valem para TODO buscador):
 *  - ignora maiúscula/minúscula e acento;
 *  - vírgula, ponto e ponto e vírgula são a mesma coisa (1,5 = 1.5 = 1;5);
 *  - hífen, barra e parênteses contam como espaço (o "-" dos nomes antigos não atrapalha);
 *  - acha por QUALQUER parte: começando, contendo, ou contendo as palavras digitadas em qualquer ordem;
 *  - a ordem da lista segue o que foi digitado: igual > começa com > frase seguida > palavras na ordem
 *    digitada > palavras em qualquer ordem (e, dentro de cada grupo, a que acha mais cedo / mais curta primeiro).
 * Uso:
 *   Busca.norm(s)                       texto normalizado
 *   Busca.testa(alvo, q)                true se o alvo contém todas as palavras de q
 *   Busca.pontua(alvo, q)               número (menor = mais próximo) ou -1 se não bate
 *   Busca.filtrar(lista, q, fnAlvo, {limite, ordenar:true})   lista filtrada e ordenada
 *   Busca.ligar(input, fn, {espera})    chama fn() ao digitar (com pequena espera) — opcional
 */
(function(){
  'use strict';
  function norm(s){
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[;.]/g, ',')            // ponto, vírgula e ponto e vírgula valem o mesmo
      .replace(/[-–—_\/\\()\[\]]/g, ' ') // hífen e afins viram espaço
      .replace(/\s+/g, ' ')
      .trim();
  }
  function tokens(q){ return norm(q).split(' ').filter(Boolean); }
  // vírgula solta no começo/fim ("ouro," ou ",5") não deve impedir a busca
  function limpaTok(t){ return t.replace(/^,+|,+$/g, '') || t; }

  function pontuaNorm(a, q, toks){
    if(!toks.length) return -1;
    for(var i = 0; i < toks.length; i++){ if(a.indexOf(toks[i]) < 0) return -1; }
    // 0 igual · 1 começa com a frase · 2 contém a frase seguida · 3 palavras na ordem digitada · 4 qualquer ordem
    var base, pos = 0;
    if(a === q){ base = 0; }
    else if(a.indexOf(q) === 0){ base = 1; }
    else if((pos = a.indexOf(q)) > 0){ base = 2; }
    else {
      var ult = -1, naOrdem = true;
      for(var j = 0; j < toks.length; j++){
        var k = a.indexOf(toks[j], ult + 1);
        if(k < 0){ naOrdem = false; break; }
        ult = k;
      }
      base = naOrdem ? 3 : 4;
      pos = a.indexOf(toks[0]);
    }
    // palavra que COMEÇA com o texto vale mais que o texto no meio de outra palavra
    var ini = 0;
    for(var m = 0; m < toks.length; m++){
      var t = toks[m];
      if(a.indexOf(t) === 0 || a.indexOf(' ' + t) >= 0) ini++;
    }
    var falta = toks.length - ini;
    return base * 1e6 + falta * 1e5 + Math.min(pos, 9999) * 10 + Math.min(a.length / 100, 9);
  }

  function pontua(alvo, q){
    var qn = norm(q);
    var toks = qn.split(' ').filter(Boolean).map(limpaTok);
    return pontuaNorm(norm(alvo), toks.join(' '), toks);
  }
  function testa(alvo, q){ return pontua(alvo, q) >= 0; }

  function filtrar(lista, q, fnAlvo, opc){
    opc = opc || {};
    var qn = norm(q);
    var toks = qn.split(' ').filter(Boolean).map(limpaTok);
    var qq = toks.join(' ');
    if(!toks.length) return (lista || []).slice(0, opc.limite || 1e9);
    var pegar = typeof fnAlvo === 'function' ? fnAlvo : function(x){ return x; };
    var achados = [];
    (lista || []).forEach(function(it){
      var alvo = pegar(it);
      if(Array.isArray(alvo)) alvo = alvo.filter(function(x){ return x != null && x !== ''; }).join(' ');
      var p = pontuaNorm(norm(alvo), qq, toks);
      if(p >= 0) achados.push({ it: it, p: p });
    });
    if(opc.ordenar !== false) achados.sort(function(x, y){ return x.p - y.p; });
    var r = achados.map(function(x){ return x.it; });
    return opc.limite ? r.slice(0, opc.limite) : r;
  }

  /* Chave para comparar nomes de produto mesmo que a ordem das palavras ou o hífen tenham mudado
   * (ex.: "9 - F1,0 ANEL OURO 18K" e "9 ANEL F1,0 OURO 18K" dão a mesma chave). */
  function chaveNome(s){ return norm(s).split(' ').filter(Boolean).sort().join(' '); }


  /* Busca de CLIENTES no servidor (função buscar-clientes: mesma regra de busca, no cadastro inteiro).
   * Devolve {data:[...]} no mesmo formato da op "searchClients" do gateway, ou null se não for essa op / se der erro
   * (aí o chamador usa o gateway como antes). */
  function clientes(gatewayUrl, anonKey, senha, body){
    if(!body || body.op !== 'searchClients') return Promise.resolve(null);
    var url = String(gatewayUrl).replace(/db-gateway$/, 'buscar-clientes');
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: 'Bearer ' + anonKey },
      body: JSON.stringify({ senha: senha, termo: (body.params && body.params.termo) || '' }) })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){ return (j && !j.error && Array.isArray(j.data)) ? j : null; })
      .catch(function(){ return null; });
  }

  function ligar(input, fn, opc){
    if(!input) return;
    var espera = (opc && opc.espera) != null ? opc.espera : 120, t = null;
    input.addEventListener('input', function(){ clearTimeout(t); t = setTimeout(fn, espera); });
  }

  window.Busca = { clientes: clientes, chaveNome: chaveNome, norm: norm, testa: testa, pontua: pontua, filtrar: filtrar, ligar: ligar };
})();
