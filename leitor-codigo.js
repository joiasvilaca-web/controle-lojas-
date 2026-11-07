/* leitor-codigo.js — LEITOR DE CÓDIGO DE BARRAS sem precisar apertar Enter/confirmar (07/11).
 * Leitor USB/Bluetooth digita o código inteiro em poucos milissegundos. Quando o campo recebe uma "rajada" assim
 * (vários caracteres seguidos, com menos de 45 ms entre eles) e para de receber, o código é lido sozinho — abre a via sem confirmar.
 * Digitação normal (à mão) NÃO dispara: continua precisando de Enter / botão. Se o leitor já manda Enter, o Enter existente funciona como antes
 * (e este atalho não dispara duas vezes).
 *   Leitor.ligar(input, function(codigo){ ... }, { min:3, espera:90, maximo:60 })
 */
(function(){
  'use strict';
  function ligar(input, aoLer, opc){
    if(!input || typeof aoLer !== 'function' || input.__leitorLigado) return;
    input.__leitorLigado = true;
    opc = opc || {};
    var MIN = opc.min || 3, ESPERA = opc.espera || 90, RAPIDO_MS = opc.rapidoMs || 45, MAX = opc.maximo || 60;
    var ultimo = 0, rajada = 0, timer = null;
    input.addEventListener('input', function(){
      var agora = Date.now(), dt = agora - ultimo;
      ultimo = agora;
      rajada = (dt <= RAPIDO_MS) ? rajada + 1 : 1;
      clearTimeout(timer);
      var v = String(input.value || '').trim();
      if(rajada >= Math.max(3, MIN) && v.length >= MIN && v.length <= MAX){
        timer = setTimeout(function(){
          var cod = String(input.value || '').trim();
          if(cod.length < MIN) return;      // o Enter do leitor (ou outro tratador) já consumiu o código
          rajada = 0;
          try{ aoLer(cod); }catch(e){ console.error(e); }
        }, ESPERA);
      }
    });
    input.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ clearTimeout(timer); rajada = 0; } });
  }
  window.Leitor = { ligar: ligar };
})();
