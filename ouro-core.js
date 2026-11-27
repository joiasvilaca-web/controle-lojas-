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
  window.OuroCore = {
    TEORES: TEORES, TIPOS: TIPOS, PEDRAS: PEDRAS, LIMITE_AJUSTE_PCT: LIMITE_AJUSTE_PCT,
    arredondar: arredondar, valorBalcaoDia: valorBalcaoDia, dataBalcaoDia: dataBalcaoDia,
    precoGrama: precoGrama, teor: teor, nomeTipo: nomeTipo, nomePedra: nomePedra,
    fatorTexto: fatorTexto, nomeProduto: nomeProduto, desvioPct: desvioPct
  };
})();
