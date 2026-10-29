/* formato.js — formatos brasileiros iguais em todo o app.
 *   Fmt.brl(1234.5)        → 'R$ 1.234,50'      Fmt.brl(-10) → '−R$ 10,00'
 *   Fmt.num(1234.5, 2)     → '1.234,50'         Fmt.pct(12.5) → '12,5%'
 *   Fmt.data('2026-10-29') → '29/10/2026'       Fmt.dataHora(iso) → '29/10/2026 14:05'
 *   Fmt.dataCurta(iso)     → '29/10'            Fmt.relativo(iso) → 'há 5 min' / 'ontem' / '29/10'
 *   Fmt.tel('32999998888') → '(32) 99999-8888'
 * Datas só-dia ('AAAA-MM-DD') são tratadas como data local (sem pular um dia por fuso).
 */
(function(){
  if(window.Fmt) return;
  var nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
  function n(v){ var x = Number(v); return isFinite(x) ? x : 0; }
  function brl(v){ var x = n(v); return (x < 0 ? '−' : '') + 'R$ ' + nf2.format(Math.abs(x)); }
  function num(v, casas){ var c = casas == null ? 0 : casas; return new Intl.NumberFormat('pt-BR', { minimumFractionDigits:c, maximumFractionDigits:c }).format(n(v)); }
  function pct(v, casas){ return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas == null ? 1 : casas }).format(n(v)) + '%'; }
  function paraData(v){
    if(!v) return null; if(v instanceof Date) return v;
    var s = String(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if(m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(typeof v === 'number' ? v : s); return isNaN(d) ? null : d;
  }
  var p2 = function(x){ return String(x).padStart(2, '0'); };
  function data(v){ var d = paraData(v); return d ? p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }
  function dataCurta(v){ var d = paraData(v); return d ? p2(d.getDate()) + '/' + p2(d.getMonth() + 1) : ''; }
  function hora(v){ var d = paraData(v); return d ? p2(d.getHours()) + ':' + p2(d.getMinutes()) : ''; }
  function dataHora(v){ var d = paraData(v); return d ? data(d) + ' ' + hora(d) : ''; }
  function relativo(v){
    var d = paraData(v); if(!d) return '';
    var s = (Date.now() - d.getTime()) / 1000;
    if(s < 60) return 'agora'; if(s < 3600) return 'há ' + Math.floor(s / 60) + ' min';
    var hoje = new Date(); hoje.setHours(0,0,0,0);
    if(d >= hoje) return 'hoje ' + hora(d);
    if(d >= new Date(hoje.getTime() - 864e5)) return 'ontem ' + hora(d);
    return d.getFullYear() === hoje.getFullYear() ? dataCurta(d) : data(d);
  }
  function tel(v){
    var t = String(v || '').replace(/\D/g, ''); if(t.length > 11 && t.indexOf('55') === 0) t = t.slice(2);
    if(t.length === 11) return '(' + t.slice(0,2) + ') ' + t.slice(2,7) + '-' + t.slice(7);
    if(t.length === 10) return '(' + t.slice(0,2) + ') ' + t.slice(2,6) + '-' + t.slice(6);
    return v ? String(v) : '';
  }
  window.Fmt = { brl:brl, num:num, pct:pct, data:data, dataCurta:dataCurta, hora:hora, dataHora:dataHora, relativo:relativo, tel:tel, paraData:paraData };
})();
