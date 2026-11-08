/* "Ciente" — comprovante de que o cliente VIU a via (09/11).
 * Aparece em todo link de via (Pedido, Venda, Orçamento, Reserva). O botão volta sempre que o status da via muda
 * (e quando a via é retirada). O clique grava { status, confirmadoEm, ciente:true } em `leituras` da via (função retirada-terceiro, ação `ciente`).
 * Uso: CienteVia.montar(elemento, { tipo:'os'|'venda'|'orc'|'res', id, client: supabaseClient })
 */
(function(){
  function dh(s){ if(!s) return ''; var d=new Date(s); return isNaN(d)?'':d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  var CSS='.cv{margin-top:14px;padding:14px 16px;border-radius:14px;border:1px solid var(--t-line,#dde);background:var(--t-surface-2,#f4f6f8);text-align:left;max-width:440px;width:100%;box-sizing:border-box;}'
   +'.cv p{margin:0 0 10px;font-size:13.5px;color:var(--t-ink-soft,#445);line-height:1.45;}'
   +'.cv-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:46px;border-radius:10px;border:1px solid var(--t-primary-strong,#1f5f7a);background:var(--t-primary-strong,#1f5f7a);color:#fff;font:inherit;font-weight:800;font-size:16px;cursor:pointer;}'
   +'.cv-btn:disabled{opacity:.6;cursor:default;}'
   +'.cv-ok{color:var(--t-ok,#0f6b40);font-weight:700;font-size:13.5px;}';
  function css(){ if(document.getElementById('cvCss')) return; var s=document.createElement('style'); s.id='cvCss'; s.textContent=CSS; document.head.appendChild(s); }
  function montar(el, o){
    css();
    var info=null, chaveMostrada='', pronto=false, enviando=false;
    async function chamar(body){
      try{ var r=await o.client.functions.invoke('retirada-terceiro',{ body: Object.assign({tipo:o.tipo,id:o.id},body) }); return r.data||{}; }catch(e){ return {}; }
    }
    function desenhar(){
      if(!info){ el.innerHTML=''; return; }
      if(info.feito){
        chaveMostrada=info.chave;
        el.innerHTML='<div class="cv"><div class="cv-ok">✓ Ciente registrado em '+dh(info.em)+'</div></div>';
        return;
      }
      if(chaveMostrada===info.chave && el.querySelector('[data-ciente]')) return;   // já está na tela: não reinicia o botão
      chaveMostrada=info.chave;
      el.innerHTML='<div class="cv"><p>Confirme que você viu esta via e a situação dela agora. Fica registrado como comprovante.</p><button class="cv-btn" data-ciente disabled>Ciente</button></div>';
      // espera um instante: robôs de varredura de link não clicam, mas assim o botão não é "gasto" ao abrir
      setTimeout(function(){ var b=el.querySelector('[data-ciente]'); if(b && !enviando) b.disabled=false; },1200);
      el.querySelector('[data-ciente]').onclick=async function(){
        if(enviando) return; enviando=true; this.disabled=true; this.textContent='Registrando…';
        var r=await chamar({acao:'ciente'}); enviando=false;
        if(r.ciente){ info=r.ciente; desenhar(); }
        else { var b=el.querySelector('[data-ciente]'); if(b){ b.disabled=false; b.textContent='Ciente'; } }
      };
    }
    async function atualizar(){
      if(enviando) return;
      var r=await chamar({acao:'estado'});
      if(r.ciente){ info=r.ciente; desenhar(); }
    }
    atualizar();
    setInterval(atualizar, 30000);
  }
  window.CienteVia = { montar: montar };
})();
