/* copiloto.js (22/11/2026) — VILACINHA, o gerente-auxiliar da equipe (masculino). Fica no canto da tela do app (shell index.html) e:
 *  - mostra a meta do dia, os números da pessoa e a comparação com "a melhor da loja" (sem nome);
 *  - lista QUEM CHAMAR HOJE (orçamentos vencendo/parados, aniversariantes, clientes sumidos, pedidos prontos) com a mensagem pronta;
 *  - dá dicas (IA, com o que aprendeu nas conversas do CHAT) e conversa por texto ou voz; lê em voz alta.
 * Dados: Edge Function `copiloto` (op dia / perguntar). Mensagem ao cliente SÓ sai pelo botão "Enviar pelo WhatsApp" (ação humana, enviar-via tipo chamar_cliente).
 * 22/11 (v4): BALÃO POR MÓDULO — ao abrir uma tela (Copiloto.moduloAberto, chamado pelo shell) às vezes aparece uma dica DAQUELA tela, de preferência
 *   uma que a pessoa ainda não viu (máx. 6 balões/dia, 12 min entre eles). BEM-ESTAR — em telas fora de venda/atendimento, em dia com poucas dicas ou
 *   em dia cheio de atendimentos, o Vilacinha pergunta como a pessoa está (resposta clicável, sempre com "prefiro não dizer") e responde com um cuidado
 *   (água, alongar, respirar, sentar um pouco). Só grava com CONSENTIMENTO (perguntado uma vez). A diretoria vê o perfil da equipe no painel.
 * Shell: Copiloto.iniciar({ senha, user, lojaNome }) ao entrar; Copiloto.parar() ao sair. Oficina não tem copiloto. Fora da produção a função não existe → some sozinho. */
(function(){
  'use strict';
  if(window.Copiloto) return;
  var S = { senha:null, user:null, lojaNome:'', dia:null, hist:[], aberto:false, balaoTimer:null, rodizio:0, falando:false };
  var URL_FN = function(n){ return (window.SUPABASE_URL||'') + '/functions/v1/' + n; };
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function ic(n,t){ try{ return window.Icone ? window.Icone(n,{tam:t||16}) : ''; }catch(e){ return ''; } }
  function brl(v){ return 'R$ ' + (Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function brl0(v){ return 'R$ ' + Math.round(Number(v)||0).toLocaleString('pt-BR'); }
  function hojeISO(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function ls(k,v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v); }catch(e){ return null; } }
  function toast(m){ try{ if(typeof window.showToast==='function') return window.showToast(m); }catch(e){} }
  async function api(body){
    try{ var r = await fetch(URL_FN('copiloto'), { method:'POST', headers:{ 'Content-Type':'application/json', apikey:window.SUPABASE_ANON_KEY, Authorization:'Bearer '+window.SUPABASE_ANON_KEY }, body: JSON.stringify(Object.assign({ senha:S.senha }, body)) });
      if(r.status===404) return { ok:false, sem:true }; return await r.json(); }
    catch(e){ return { ok:false, error:'Sem conexão.' }; }
  }

  async function apiS(body){
    try{ var r = await fetch(URL_FN('copiloto-saber'), { method:'POST', headers:{ 'Content-Type':'application/json', apikey:window.SUPABASE_ANON_KEY, Authorization:'Bearer '+window.SUPABASE_ANON_KEY }, body: JSON.stringify(Object.assign({ senha:S.senha }, body)) });
      if(r.status===404) return { ok:false, sem:true }; return await r.json(); }
    catch(e){ return { ok:false, error:'Sem conexão.' }; }
  }

  /* ícone de ouvir: alto-falante com ondas (anima enquanto fala) */
  function icOuvir(t){
    return '<svg class="cp-som" width="'+t+'" height="'+t+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      +'<path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none"/>'
      +'<path class="o1" d="M15.2 9.2a4 4 0 0 1 0 5.6"/><path class="o2" d="M18 6.6a8 8 0 0 1 0 10.8"/></svg>';
  }
  function icMic(t){ return '<svg width="'+t+'" height="'+t+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>'; }
  function icParar(t){ return '<svg width="'+t+'" height="'+t+'" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>'; }

  /* ---------- rosto da Vilacinha (SVG próprio: vinho e dourado) ---------- */
  function rosto(tam, falando){
    return '<svg class="cp-rosto'+(falando?' falando':'')+'" width="'+tam+'" height="'+tam+'" viewBox="0 0 64 64" aria-hidden="true">'
      +'<defs><linearGradient id="cpG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a3560"/><stop offset="1" stop-color="#4d1a33"/></linearGradient>'
      +'<clipPath id="cc"><circle cx="32" cy="32" r="30"/></clipPath></defs>'
      +'<circle cx="32" cy="32" r="31" fill="url(#cpG)" stroke="#d9b26a" stroke-width="2"/>'
      +'<g clip-path="url(#cc)">'
      +'<path d="M6 64c1-10 10-15 26-15s25 5 26 15z" fill="#1c1c22"/>'
      +'<path d="M25 49l7 8 7-8" fill="#2c2c34"/>'
      +'<path d="M25 49l7 8 7-8" fill="none" stroke="#d9b26a" stroke-width="1.1" stroke-linejoin="round"/>'
      +'<path d="M27.5 43h9v7c-2 2.4-7 2.4-9 0z" fill="#e5b490"/>'
      +'</g>'
      +'<ellipse cx="18.6" cy="34.5" rx="2.2" ry="3.6" fill="#e8b994"/><ellipse cx="45.4" cy="34.5" rx="2.2" ry="3.6" fill="#e8b994"/>'
      +'<path d="M19.2 28.5c0-9.5 5-15 12.8-15s12.8 5.5 12.8 15v8.5c0 7.6-5.3 12.2-12.8 12.2S19.2 44.6 19.2 37z" fill="#f2c9a5"/>'
      +'<path d="M20.5 40c1 6.6 5.4 9.8 11.5 9.8S42.5 46.6 43.5 40c-2.6 4.6-6.4 6.5-11.5 6.5S23.1 44.6 20.5 40z" fill="#3a2a24" opacity=".16"/>'
      +'<path d="M18.4 31c-.9-9.4 3.6-17.6 13.8-17.6 9.6 0 14.8 6 13.4 17.6-.8-4.8-2.6-7.6-5.2-9.4-5 1.8-12 1.6-17.5-1.6-2.4 2.4-3.9 5.6-4.5 11z" fill="#2a1b17"/>'
      +'<path d="M22.4 19.4c3-4.2 8.4-6.4 14.6-5.6 4.4.6 7.6 2.6 9 5.6-5-2.4-10.6-2.2-15.6-.4-3.2 1.2-5.8 2.4-8 .4z" fill="#3a2722"/>'
      +'<path d="M22.6 29.2c2.2-1.7 5.6-2 8.2-.6" stroke="#2a1b17" stroke-width="2" fill="none" stroke-linecap="round"/>'
      +'<path d="M33.2 28.6c2.6-1.4 6-1.1 8.2.6" stroke="#2a1b17" stroke-width="2" fill="none" stroke-linecap="round"/>'
      +'<ellipse cx="27.2" cy="33.4" rx="2.9" ry="2.2" fill="#fff"/><ellipse cx="36.8" cy="33.4" rx="2.9" ry="2.2" fill="#fff"/>'
      +'<circle cx="27.4" cy="33.5" r="1.7" fill="#6b3f22"/><circle cx="36.6" cy="33.5" r="1.7" fill="#6b3f22"/>'
      +'<circle cx="27.4" cy="33.5" r=".8" fill="#1d120d"/><circle cx="36.6" cy="33.5" r=".8" fill="#1d120d"/>'
      +'<circle cx="27.9" cy="32.9" r=".5" fill="#fff"/><circle cx="37.1" cy="32.9" r=".5" fill="#fff"/>'
      +'<path d="M24.6 35.6q2.6 1.1 5.2 0M34.2 35.6q2.6 1.1 5.2 0" stroke="#c08a68" stroke-width=".7" fill="none" stroke-linecap="round" opacity=".7"/>'
      +'<path d="M32 34.5c-.9 2.4-1.8 3.6-2.5 4.2.9.8 4.1.8 5 0-.7-.6-1.6-1.8-2.5-4.2z" fill="#e0a883"/>'
      +'<g class="cp-boca"><path d="M24.2 40.2c2.2 6.4 13.4 6.4 15.6 0-2.4 1.5-13.2 1.5-15.6 0z" fill="#fff" stroke="#8a3a3a" stroke-width="1" stroke-linejoin="round"/>'
      +'<path d="M25.5 41.1c2.4 1 10.6 1 13 0" stroke="#d6c9c4" stroke-width=".5" fill="none"/></g>'
      +'<path d="M23.2 39.4q-1.2-.4-1.8-1.6M40.8 39.4q1.2-.4 1.8-1.6" stroke="#b9805e" stroke-width=".8" fill="none" stroke-linecap="round"/>'
      +'</svg>';
  }

  var CSS = ''
  +'.cp-fab{position:fixed;right:18px;bottom:18px;z-index:9000;width:62px;height:62px;border-radius:50%;border:0;padding:0;background:none;cursor:pointer;filter:drop-shadow(0 8px 18px rgba(77,26,51,.35));transition:transform .2s;}'
  +'.cp-fab:hover{transform:scale(1.06);} .cp-fab:focus-visible{outline:3px solid #d9b26a;outline-offset:3px;border-radius:50%;}'
  +'.cp-fab .cp-n{position:absolute;top:-2px;right:-2px;min-width:22px;height:22px;border-radius:11px;background:#c62828;color:#fff;font:700 12px/22px Inter,sans-serif;text-align:center;padding:0 5px;border:2px solid #fff;}'
  +'.cp-rosto .cp-boca{transform-origin:32px 41px;} .cp-rosto.falando .cp-boca{animation:cpFala .35s infinite alternate;}'
  +'@keyframes cpFala{from{transform:scaleY(1)}to{transform:scaleY(.4)}}'
  +'.cp-balao{position:fixed;right:90px;bottom:28px;z-index:9001;max-width:min(330px,calc(100vw - 110px));background:var(--t-surface,#fff);color:var(--t-text,#14202b);border:1px solid #d9b26a;border-radius:16px 16px 4px 16px;padding:12px 14px 10px;box-shadow:0 14px 34px -10px rgba(0,0,0,.35);font:14px/1.5 Inter,system-ui,sans-serif;animation:cpEntra .3s ease-out;}'
  +'.cp-balao b.cp-quem{display:block;color:#8a3560;font-size:12px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:2px;}'
  +'.cp-balao .cp-x{position:absolute;top:6px;right:6px;width:28px;height:28px;border:0;border-radius:50%;background:transparent;color:var(--t-text-soft,#667);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;} .cp-balao .cp-x:hover{background:var(--t-surface-2,#eef0f3);} .cp-balao b.cp-quem{padding-right:26px;}'
  +'@media(max-width:760px){.cp-balao .cp-x{top:4px;right:4px;width:40px;height:40px;}}'
  +'.cp-balao .cp-acoes{display:flex;gap:6px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap;}'
  +'@keyframes cpEntra{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}'
  +'.cp-b{border:1px solid var(--t-line,#dde);background:var(--t-surface,#fff);color:var(--t-text,#14202b);border-radius:9px;padding:6px 11px;font:600 12.5px Inter,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:5px;}'
  +'.cp-b.pri{background:#662344;border-color:#662344;color:#fff;} .cp-b.wa{border-color:#1f9a55;color:#1f9a55;} .cp-b:disabled{opacity:.55;cursor:default;}'
  +'.cp-painel{position:fixed;top:0;right:0;bottom:0;z-index:9002;width:min(420px,100vw);background:var(--t-bg,#f4f6f8);color:var(--t-text,#14202b);box-shadow:-18px 0 40px -12px rgba(0,0,0,.35);display:flex;flex-direction:column;font:14px/1.5 Inter,system-ui,sans-serif;animation:cpPainel .25s ease-out;}'
  +'@keyframes cpPainel{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}'
  +'.cp-topo{display:flex;align-items:center;gap:10px;padding:14px 14px 12px;color:#fff;background:linear-gradient(135deg,#7a2d52,#4d1a33);}'
  +'.cp-topo .cp-nm{flex:1;min-width:0;} .cp-topo .cp-nm b{display:block;font-size:16px;} .cp-topo .cp-nm small{color:#f3dfae;font-size:12px;}'
  +'.cp-topo button{background:rgba(255,255,255,.14);border:0;color:#fff;border-radius:9px;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;}'
  +'.cp-corpo{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:12px;}'
  +'.cp-card{background:var(--t-surface,#fff);border:1px solid var(--t-line,#dde);border-radius:14px;padding:12px 13px;}'
  +'.cp-card h4{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#8a3560;display:flex;align-items:center;gap:6px;}'
  +'.cp-meta-v{font-size:24px;font-weight:800;color:#4d1a33;} .cp-meta-s{font-size:12.5px;color:var(--t-text-soft,#556);}'
  +'.cp-barra{height:10px;border-radius:6px;background:var(--t-surface-2,#eef0f3);overflow:hidden;margin:8px 0 4px;} .cp-barra i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#d9b26a,#a8803a);}'
  +'.cp-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;} .cp-num{background:var(--t-surface-2,#f4f6f8);border-radius:10px;padding:7px 8px;text-align:center;}'
  +'.cp-num b{display:block;font-size:15px;} .cp-num small{font-size:10.5px;color:var(--t-text-soft,#556);display:block;line-height:1.3;} .cp-num em{display:block;font-style:normal;font-size:10.5px;color:#a8803a;font-weight:700;}'
  +'.cp-dica{display:flex;gap:8px;padding:8px 0;border-top:1px dashed var(--t-line,#dde);} .cp-dica:first-of-type{border-top:0;padding-top:0;} .cp-dica span.n{flex-shrink:0;width:22px;height:22px;border-radius:50%;background:#f3dfae;color:#4d1a33;font-weight:800;font-size:12px;display:inline-flex;align-items:center;justify-content:center;}'
  +'.cp-cli{border:1px solid var(--t-line,#dde);border-left:4px solid var(--cc,#8a3560);border-radius:10px;padding:8px 10px;margin-top:8px;} .cp-cli b{font-size:13.5px;} .cp-cli .m{font-size:12.5px;color:var(--t-text-soft,#556);} .cp-cli .cp-acoes{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;}'
  +'.cp-cli.orcamento{--cc:#8a4fd1;} .cp-cli.aniversario{--cc:#d9b26a;} .cp-cli.retorno{--cc:#1c6fd1;} .cp-cli.retirada{--cc:#1f9a55;}'
  +'.cp-chat{display:flex;flex-direction:column;gap:8px;} .cp-msg{max-width:90%;padding:8px 11px;border-radius:12px;font-size:13.5px;white-space:pre-wrap;} .cp-msg.eu{align-self:flex-end;background:#662344;color:#fff;} .cp-msg.ia{align-self:flex-start;background:var(--t-surface-2,#f4f6f8);border:1px solid var(--t-line,#dde);}'
  +'.cp-form{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--t-line,#dde);background:var(--t-surface,#fff);} .cp-form textarea{flex:1;resize:none;height:42px;border:1px solid var(--t-line-strong,#99a);border-radius:10px;padding:10px 11px;font:inherit;background:var(--t-surface,#fff);color:inherit;}'
  +'.cp-form button{width:42px;height:42px;border-radius:10px;border:0;background:#662344;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;} .cp-form button.mic{background:var(--t-surface-2,#eef0f3);color:#662344;} .cp-form button.mic.on{background:#c62828;color:#fff;}'
  +'.cp-rank{width:100%;border-collapse:collapse;font-size:12.5px;} .cp-rank td{padding:4px 2px;border-top:1px solid var(--t-line,#dde);} .cp-rank td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}'
  +'.cp-ov{position:fixed;inset:0;z-index:9100;background:rgba(10,20,30,.45);display:flex;align-items:center;justify-content:center;padding:14px;} .cp-modal{background:var(--t-surface,#fff);color:var(--t-text,#14202b);border-radius:14px;max-width:460px;width:100%;padding:16px;font:14px/1.5 Inter,sans-serif;} .cp-modal textarea{width:100%;box-sizing:border-box;min-height:130px;border:1px solid var(--t-line-strong,#99a);border-radius:10px;padding:10px;font:inherit;background:var(--t-surface,#fff);color:inherit;}'
  +'.cp-ops{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;} .cp-ops button{border:1px solid #d9b26a;background:#fffaf0;color:#4d1a33;border-radius:999px;padding:6px 11px;font:600 12.5px Inter,sans-serif;cursor:pointer;} .cp-ops button:hover{background:#f3dfae;} .cp-ops button.neutro{border-color:var(--t-line,#dde);background:var(--t-surface,#fff);color:var(--t-text-soft,#556);}'
  +'.cp-be{border:1px solid var(--t-line,#dde);border-radius:10px;padding:8px 10px;margin-top:8px;} .cp-be b{font-size:13.5px;} .cp-be .m{font-size:12px;color:var(--t-text-soft,#556);} .cp-be .r{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;} .cp-be .r span{font-size:11.5px;background:var(--t-surface-2,#f4f6f8);border-radius:6px;padding:1px 6px;}'
  +'.cp-be .r span.ruim{background:#fde2e2;color:#8a1c1c;} .cp-be .r span.bom{background:#e3f4e9;color:#1f6b3a;} .cp-be details{margin-top:4px;font-size:12px;}'
  +'.cp-ouvir{background:#fffaf0;border-color:#d9b26a;color:#4d1a33;padding:7px 12px 7px 9px;} .cp-ouvir.tocando{background:#662344;border-color:#662344;color:#fff;}'
  +'.cp-som .o1,.cp-som .o2{opacity:1;} .tocando .cp-som .o1{animation:cpOnda 1s infinite;} .tocando .cp-som .o2{animation:cpOnda 1s .25s infinite;}'
  +'@keyframes cpOnda{0%,100%{opacity:.25}50%{opacity:1}}'
  +'.cp-topo .cp-ler.tocando{background:#d9b26a;color:#4d1a33;}'
  +'.cp-fab{bottom:calc(18px + env(safe-area-inset-bottom));right:calc(18px + env(safe-area-inset-right));}'
  +'@media(max-width:760px){'
  +'.cp-fab{right:calc(12px + env(safe-area-inset-right));bottom:calc(14px + env(safe-area-inset-bottom));width:56px;height:56px;-webkit-tap-highlight-color:transparent;}'
  /* balão vira cartão ancorado embaixo, acima da carinha, largura total */
  +'.cp-balao{left:12px;right:12px;bottom:calc(80px + env(safe-area-inset-bottom));max-width:none;border-radius:18px;padding:14px 14px 12px;font-size:15px;box-shadow:0 18px 40px -12px rgba(0,0,0,.45);}'
  +'.cp-balao .cp-acoes{justify-content:stretch;} .cp-balao .cp-acoes .cp-b{flex:1 1 auto;justify-content:center;min-height:44px;font-size:14px;}'
  +'.cp-b{min-height:40px;}'
  /* painel vira tela cheia (folha) com área segura */
  +'.cp-painel{width:100vw;height:100vh;height:100dvh;top:0;box-shadow:none;animation:cpSobe .25s ease-out;}'
  +'@keyframes cpSobe{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}'
  +'.cp-topo{padding:calc(12px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) 12px calc(12px + env(safe-area-inset-left));}'
  +'.cp-topo button{width:44px;height:44px;border-radius:12px;}'
  +'.cp-corpo{padding:12px calc(12px + env(safe-area-inset-right)) 16px calc(12px + env(safe-area-inset-left));-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}'
  +'.cp-card{padding:13px;} .cp-meta-v{font-size:26px;}'
  +'.cp-nums{gap:5px;} .cp-num{padding:7px 4px;} .cp-num b{font-size:14px;}'
  +'.cp-cli{padding:10px 11px;} .cp-cli .cp-acoes .cp-b{flex:1 1 130px;justify-content:center;min-height:44px;}'
  +'.cp-msg{max-width:94%;font-size:14.5px;}'
  /* barra de digitar: 16px evita o zoom do iPhone; alvos de 46px */
  +'.cp-form{padding:10px calc(12px + env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) calc(12px + env(safe-area-inset-left));gap:8px;}'
  +'.cp-form textarea{font-size:16px;height:46px;padding:11px 12px;} .cp-form button{width:46px;height:46px;border-radius:12px;flex-shrink:0;}'
  +'.cp-ops button{min-height:42px;padding:8px 13px;font-size:14px;}'
  +'.cp-ov{align-items:flex-end;padding:0;} .cp-modal{max-width:none;border-radius:20px 20px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));max-height:92dvh;overflow:auto;} .cp-modal textarea{font-size:16px;}'
  +'.cp-rank{font-size:13px;} .cp-be .r span{font-size:12px;}'
  +'}'
  +'@media(max-width:760px) and (max-height:480px){.cp-balao{bottom:12px;right:84px;left:12px;}}'
  +'@media print{.cp-fab,.cp-balao,.cp-painel{display:none!important;}}'
  +'@media (prefers-reduced-motion:reduce){.cp-balao,.cp-painel{animation:none;} .cp-rosto.falando .cp-boca{animation:none;}}';
  function css(){ if(document.getElementById('cpCss')) return; var s=document.createElement('style'); s.id='cpCss'; s.textContent=CSS; document.head.appendChild(s); }

  /* ---------- voz ---------- */
  function falar(txt){
    try{
      if(!window.speechSynthesis) return toast('Este aparelho não lê em voz alta.');
      var jaFalando = S.falando; speechSynthesis.cancel();
      if(jaFalando){ S.falando = false; pintarFab(); return; }   // 2º toque = parar
      var u = new SpeechSynthesisUtterance(String(txt||'').replace(/[*_#]/g,''));
      u.lang = 'pt-BR'; u.rate = 1.03;
      var v = speechSynthesis.getVoices().find(function(x){ return /pt(-|_)BR/i.test(x.lang); }); if(v) u.voice = v;
      S.falando = true; pintarFab();
      u.onend = u.onerror = function(){ S.falando = false; pintarFab(); };
      speechSynthesis.speak(u);
    }catch(e){}
  }
  function ouvir(botao, aoTexto){
    var R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!R) return toast('Este navegador não ouve. Use o Chrome ou digite.');
    var r = new R(); r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 1;
    botao.classList.add('on');
    r.onresult = function(e){ var t = e.results[0][0].transcript; aoTexto(t); };
    r.onend = function(){ botao.classList.remove('on'); };
    r.onerror = function(){ botao.classList.remove('on'); };
    r.start();
  }

  /* ---------- botão flutuante e balão ---------- */
  function pintarFab(){
    document.querySelectorAll('.cp-ouvir,.cp-ler').forEach(function(x){ x.classList.toggle('tocando', !!S.falando); var sp=x.querySelector('span'); if(sp) sp.textContent = S.falando ? 'Parar' : 'Ouvir'; });
    var b = document.getElementById('cpFab'); if(!b) return;
    var n = S.dia && S.dia.vendaAtiva ? S.dia.vendaAtiva.length : 0;
    b.innerHTML = rosto(b.offsetWidth || 62, S.falando) + (n ? '<span class="cp-n" aria-hidden="true">'+n+'</span>' : '');
    b.title = 'Vilacinha, seu gerente-auxiliar' + (n ? ' — ' + n + ' clientes para chamar hoje' : '');
    b.setAttribute('aria-label', b.title);
  }
  function fecharBalao(){ var x = document.getElementById('cpBalao'); if(x) x.remove(); }
  function balao(html, acoes, semPadrao, fechaEm){
    if(S.aberto){ fecharBalao(); return null; }
    /* se o balão já está na tela (pergunta → resposta), troca o conteúdo NO PRÓPRIO balão */
    var d = document.getElementById('cpBalao'), novo = !d;
    if(novo){ d = document.createElement('div'); d.id = 'cpBalao'; d.className = 'cp-balao'; d.setAttribute('role','status'); }
    try{ speechSynthesis.cancel(); S.falando = false; }catch(e){}
    d.innerHTML = '<button type="button" class="cp-x" data-cp="x" title="Fechar" aria-label="Fechar">'+ic('x',14)+'</button><b class="cp-quem">Vilacinha</b>' + html + '<div class="cp-acoes">' + (acoes||'') + '<button type="button" class="cp-b cp-ouvir" data-cp="ouvir" title="Ouvir esta dica" aria-label="Ouvir esta dica">'+icOuvir(18)+'<span>Ouvir</span></button>' + (semPadrao ? '<button type="button" class="cp-b" data-cp="depois">Fechar</button>' : '<button type="button" class="cp-b" data-cp="depois">Agora não</button><button type="button" class="cp-b pri" data-cp="abrir">Ver meu dia</button>') + '</div>';
    if(novo) document.body.appendChild(d);
    d.querySelector('[data-cp="x"]').onclick = fecharBalao;
    d.querySelector('[data-cp="depois"]').onclick = function(){ fecharBalao(); if(!semPadrao) ls(chave('pausa'), String(Date.now())); };
    var ab = d.querySelector('[data-cp="abrir"]'); if(ab) ab.onclick = function(){ fecharBalao(); abrirPainel(); };
    d.querySelector('[data-cp="ouvir"]').onclick = function(){ falar((d.querySelector('.cp-txt')||d).textContent.replace(/^Vilacinha/,'')); };
    clearTimeout(S.balaoTimer); S.balaoTimer = setTimeout(fecharBalao, fechaEm || (semPadrao ? 60000 : 25000));
    return d;
  }
  /** Loja escolhida no seletor do app (shell). */
  function lojaShell(){ try{ return (typeof lojaAtual !== 'undefined' && lojaAtual) || ''; }catch(e){ return ''; } }
  function chave(k){ return 'copiloto_' + k + '_' + (S.user && S.user.id) + '_' + hojeISO(); }

  /** Saudação do dia (1x por dia, ao entrar). As outras dicas vêm por módulo (moduloAberto). */
  function talvezDica(){
    if(!S.dia || S.aberto || document.hidden) return;
    var n = Number(ls(chave('n'))||0), ult = Number(ls(chave('ult'))||0), pausa = Number(ls(chave('pausa'))||0);
    if(n >= 1 || Date.now() - ult < 75*60000 || Date.now() - pausa < 120*60000) return;
    var itens = [];
    if(n === 0){ itens.push(esc(S.dia.saudacao) + ' ' + (S.dia.meta && S.dia.meta.metaMes > 0 && S.dia.meta.hoje > 0 ? 'Sua meta de hoje é <b>' + brl0(S.dia.meta.hoje) + '</b>. ' : '') + ((S.dia.vendaAtiva||[]).length ? 'Separei <b>' + S.dia.vendaAtiva.length + ' clientes</b> para você chamar hoje.' : esc((S.dia.dicas||[])[0]||''))); }
    else {
      var va = (S.dia.vendaAtiva||[])[n-1], di = (S.dia.dicas||[])[n % Math.max(1,(S.dia.dicas||[]).length)];
      if(va && n % 2 === 1) itens.push('Que tal chamar <b>' + esc(va.cliente.split(' ')[0]) + '</b> agora? ' + esc(va.motivo) + '.');
      else if(di) itens.push(esc(di));
    }
    if(!itens.length) return;
    ls(chave('n'), String(n+1)); ls(chave('ult'), String(Date.now()));
    balao('<div class="cp-txt">' + itens[0] + '</div>');
  }

  /* ---------- v4: balão por MÓDULO ---------- */
  var VENDA_MODS = ['venda','pedido','orcamento','chat'];
  function chaveModulo(mod, sub){
    if(mod==='pdvg') return ({ pdv:'venda', reserva:'venda', os:'pedido', orc:'orcamento', resumo:'adm' })[sub] || 'venda';
    if(mod==='atendimento') return 'chat';
    if(mod==='agenda') return 'agenda';
    if(mod==='dashboard') return 'painel';
    if(mod==='caixa' || mod==='lancamentos' || mod==='config' || mod==='site') return 'adm';
    return 'outros';
  }
  function hashTxt(t){ var h=0; t=String(t); for(var i=0;i<t.length;i++){ h=(h*31 + t.charCodeAt(i))|0; } return String(h); }
  function vistas(){ try{ return JSON.parse(ls('copiloto_vistas_'+(S.user&&S.user.id))||'[]'); }catch(e){ return []; } }
  function marcarVista(t){ var v = vistas(); v.push(hashTxt(t)); ls('copiloto_vistas_'+(S.user&&S.user.id), JSON.stringify(v.slice(-200))); }
  function moduloAberto(mod, sub){
    if(!S.dia || S.aberto || document.hidden) return;
    var k = chaveModulo(mod, sub);
    var n = Number(ls(chave('nm'))||0), ult = Number(ls(chave('ult'))||0), pausa = Number(ls(chave('pausa'))||0);
    if(n >= 6 || Date.now() - ult < 12*60000 || Date.now() - pausa < 120*60000) return;
    if(Math.random() > 0.45) return;   // "algumas vezes", não sempre
    var dm = S.dia.dicasModulo || {}, lista = (dm[k] && dm[k].length ? dm[k] : (dm.geral || S.dia.dicas || []));
    var poucas = !(dm[k] && dm[k].length >= 2), cheio = Number(S.dia.hojeAtendimentos||0) >= 8;
    var podeBE = S.dia.consentimento !== false && Number(ls(chave('be'))||0) < 2 && Date.now() - Number(ls(chave('beUlt'))||0) > 150*60000;
    ls(chave('ult'), String(Date.now())); ls(chave('nm'), String(n+1));
    if(podeBE && (VENDA_MODS.indexOf(k) < 0 || poucas || cheio)) return perguntarBemEstar(cheio);
    var v = vistas(), nova = lista.filter(function(t){ return v.indexOf(hashTxt(t)) < 0; }), dica = (nova.length ? nova : lista)[Math.floor(Math.random() * (nova.length || lista.length))];
    if(!dica) return;
    marcarVista(dica);
    balao('<div class="cp-txt">' + esc(dica) + '</div>');
  }

  /* ---------- v4: BEM-ESTAR (consentimento, perguntas clicáveis, cuidado) ---------- */
  var PERGUNTAS = [
    { id:'humor', txt:'Como você está se sentindo hoje?', ops:[['otima','😄 Ótima'],['bem','🙂 Bem'],['cansada','😮‍💨 Cansada'],['preocupada','😟 Preocupada'],['triste','😔 Pra baixo']] },
    { id:'agua', txt:'Pausa rápida: já bebeu água nas últimas horas?', ops:[['sim','💧 Já bebi'],['nao','🙈 Ainda não']] },
    { id:'corpo', txt:'Como está o corpo hoje? Costas, pernas, cabeça…', ops:[['bem','💪 Tudo certo'],['dor','🤕 Com alguma dor'],['cansaco','🥱 Muito cansaço']] },
    { id:'sono', txt:'Conseguiu dormir bem esta noite?', ops:[['bem','😴 Dormi bem'],['mais_ou_menos','😐 Mais ou menos'],['mal','😵 Dormi mal']] },
    { id:'vida', txt:'E a vida fora da loja, como anda?', ops:[['tranquila','🌿 Tranquila'],['corrida','🏃 Corrida'],['dificil','🌧️ Difícil']], texto:true },
    { id:'dia', txt:'O que deixaria o seu dia melhor hoje?', ops:[['musica','🎵 Uma música boa'],['cafe','☕ Um café'],['elogio','💛 Um elogio'],['descanso','🪑 Sentar um pouco']] },
  ];
  var CUIDADO = {
    humor:{ otima:'Que bom! Essa energia contagia o cliente. Aproveita! ✨', bem:'Que bom! Bora fazer um dia leve e produtivo.', cansada:'Entendo. Que tal 2 minutos sentada, respirando fundo, e um copo d’água? Você rende mais descansada.', preocupada:'Obrigado por contar. Respira: inspira em 4 tempos, segura 4, solta em 6. Se quiser falar com alguém de confiança, faz bem.', triste:'Sinto muito que o dia esteja pesado. Seja gentil com você hoje. Se precisar conversar, procure alguém de confiança. Você não está sozinha. 💛' },
    agua:{ sim:'Isso aí! Hidratada a gente atende melhor. 💧', nao:'Que tal agora? Um copo d’água já ajuda a cabeça e a voz. Eu espero. 😉' },
    corpo:{ bem:'Ótimo! Lembre de alongar os ombros de vez em quando.', dor:'Tenta alongar o pescoço e os ombros devagar e, quando der, sentar um pouco. Se a dor continuar, vale procurar um médico.', cansaco:'Cansaço acumula. Se puder, faça uma pausa curta longe do balcão e beba água.' },
    sono:{ bem:'Que bom! Dia de energia.', mais_ou_menos:'Vai com calma hoje. Água e uma pausa curta à tarde ajudam.', mal:'Puxado, né? Hoje, evite muito café de uma vez e tente dormir mais cedo. Cuida de você.' },
    vida:{ tranquila:'Que bom! Isso aparece no sorriso. 🌿', corrida:'A vida corrida cansa. Tenta reservar um tempinho só seu hoje, nem que sejam 10 minutos.', dificil:'Obrigado por confiar. Momentos difíceis passam. Converse com quem você confia e, se for pesado demais, o CVV atende de graça no 188, 24 horas.' },
    dia:{ musica:'Boa! Coloca aquela música no intervalo. 🎵', cafe:'Um café no intervalo cai bem! ☕', elogio:'Então lá vai: você faz diferença no atendimento da Vilaça. 💛', descanso:'Merecido! Na próxima pausa, senta e desliga 5 minutinhos.' },
  };
  async function enviarBE(pergunta, resposta, detalhe){ if(S.dia && S.dia.consentimento) await api({ op:'bemestar', pergunta:pergunta, resposta:resposta, detalhe:detalhe||'' }); }
  function perguntarBemEstar(cheio){
    if(S.dia.consentimento === null || S.dia.consentimento === undefined) return pedirConsentimento();
    var feitas = (ls(chave('beFeitas'))||'').split(',');
    var pool = PERGUNTAS.filter(function(q){ return feitas.indexOf(q.id) < 0; });
    if(cheio) pool = PERGUNTAS.filter(function(q){ return ['agua','humor','corpo'].indexOf(q.id) >= 0 && feitas.indexOf(q.id) < 0; }).concat(pool);
    var q = pool[0] ? pool[Math.floor(Math.random()*Math.min(pool.length, cheio ? 2 : pool.length))] : null; if(!q) return;
    ls(chave('be'), String(Number(ls(chave('be'))||0)+1)); ls(chave('beUlt'), String(Date.now())); ls(chave('beFeitas'), feitas.concat(q.id).join(','));
    mostrarPergunta(q, cheio ? 'Dia cheio hoje, hein? ' : '');
  }
  /** Mostra UMA pergunta de bem-estar no balão, com as respostas clicáveis; a resposta aparece no mesmo balão. */
  function mostrarPergunta(q, intro){
    var d = balao('<div class="cp-txt">' + esc(intro||'') + esc(q.txt) + '</div><div class="cp-ops">' + q.ops.map(function(o){ return '<button type="button" data-be="'+o[0]+'">'+esc(o[1])+'</button>'; }).join('') + '<button type="button" class="neutro" data-be="nao_dizer">Prefiro não dizer</button></div>', '', true);
    if(!d) return;
    d.querySelectorAll('[data-be]').forEach(function(b){ b.onclick = function(){
      var r = b.dataset.be;
      if(r === 'nao_dizer'){ enviarBE(q.id, r); balao('<div class="cp-txt">Tudo bem! Se precisar, estou aqui. 😊</div>', '', true, 8000); return; }
      var resp = (CUIDADO[q.id]||{})[r] || 'Obrigado por contar!';
      if(q.texto && r === 'dificil' || q.texto && r === 'corrida'){
        var d2 = balao('<div class="cp-txt">' + esc(resp) + '</div><p style="margin:6px 0 4px;font-size:12.5px;">Se quiser, conte um pouco mais (opcional):</p><textarea id="cpBeTxt" maxlength="600" style="width:100%;box-sizing:border-box;min-height:60px;border:1px solid #d9b26a;border-radius:8px;padding:6px;font:inherit;"></textarea>', '<button type="button" class="cp-b pri" data-cp="beok">Enviar</button>', true);
        if(d2){ d2.querySelector('[data-cp="beok"]').onclick = function(){ enviarBE(q.id, r, (d2.querySelector('#cpBeTxt')||{}).value||''); balao('<div class="cp-txt">Obrigado pela confiança. 💛</div>', '', true, 12000); }; }
        return;
      }
      enviarBE(q.id, r);
      balao('<div class="cp-txt">' + esc(resp) + '</div>', '', true, 15000);
    }; });
  }
  function pedirConsentimento(){
    ls(chave('be'), String(Number(ls(chave('be'))||0)+1)); ls(chave('beUlt'), String(Date.now()));
    var d = balao('<div class="cp-txt">Posso, de vez em quando, perguntar como você está? É rapidinho, com resposta de um toque. Suas respostas ajudam a <b>diretoria</b> a cuidar melhor da equipe e só ela vê. Você pode sempre escolher "prefiro não dizer".</div>', '<button type="button" class="cp-b" data-cp="nao">Não, obrigado</button><button type="button" class="cp-b pri" data-cp="sim">Pode perguntar</button>', true);
    if(!d) return;
    d.querySelector('[data-cp="sim"]').onclick = async function(){ await api({ op:'consentir', aceito:true }); S.dia.consentimento = true; ls(chave('beFeitas'), 'agua'); mostrarPergunta(PERGUNTAS[1], 'Combinado! 😊 '); };
    d.querySelector('[data-cp="nao"]').onclick = async function(){ await api({ op:'consentir', aceito:false }); S.dia.consentimento = false; balao('<div class="cp-txt">Sem problema! Vou continuar só com as dicas de vendas. 👍</div>', '', true, 8000); };
  }

  /* ---------- painel ---------- */
  function abrirPainel(){
    if(document.getElementById('cpPainel')) return;
    S.aberto = true; fecharBalao();
    var p = document.createElement('aside'); p.id = 'cpPainel'; p.className = 'cp-painel'; p.setAttribute('aria-label','Vilacinha, gerente-auxiliar');
    p.innerHTML = '<div class="cp-topo">' + rosto(44) + '<div class="cp-nm"><b>Vilacinha</b><small>seu gerente-auxiliar de vendas e aulas</small></div>'
      + '<button type="button" class="cp-ler" data-cp="ler" title="Ouvir o resumo do dia" aria-label="Ouvir o resumo do dia">'+icOuvir(22)+'</button>'
      + '<button type="button" data-cp="atualizar" title="Atualizar os números" aria-label="Atualizar">'+ic('atualizar',18)+'</button>'
      + '<button type="button" data-cp="fechar" title="Fechar" aria-label="Fechar">'+ic('x',18)+'</button></div>'
      + '<div class="cp-corpo" id="cpCorpo"></div>'
      + '<form class="cp-form" id="cpForm"><button type="button" class="mic" id="cpMic" title="Falar" aria-label="Falar a pergunta">'+icMic(22)+'</button><textarea id="cpTexto" maxlength="600" placeholder="Pergunte ao Vilacinha: como vender mais aliança?" aria-label="Pergunta"></textarea><button type="submit" title="Enviar" aria-label="Enviar">'+ic('enviar',18)+'</button></form>';
    document.body.appendChild(p);
    p.querySelector('[data-cp="fechar"]').onclick = fecharPainel;
    p.querySelector('[data-cp="atualizar"]').onclick = async function(){ var c = document.getElementById('cpCorpo'); c.innerHTML = '<p>Refazendo as contas…</p>'; var r = await api({ op:'dia', forcar:true, lojaId: lojaShell() }); if(r && r.ok){ S.dia = r; pintarFab(); } desenhar(); };
    p.querySelector('[data-cp="ler"]').onclick = function(){ falar(resumoFalado()); };
    var ta = p.querySelector('#cpTexto');
    p.querySelector('#cpForm').onsubmit = function(e){ e.preventDefault(); perguntar(ta.value); };
    ta.addEventListener('keydown', function(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); perguntar(ta.value); } });
    p.querySelector('#cpMic').onclick = function(){ ouvir(this, function(t){ ta.value = t; perguntar(t); }); };
    document.addEventListener('keydown', escFecha);
    desenhar();
  }
  function escFecha(e){ if(e.key==='Escape' && !document.querySelector('.cp-ov')) fecharPainel(); }
  function fecharPainel(){ var p = document.getElementById('cpPainel'); if(p) p.remove(); S.aberto = false; document.removeEventListener('keydown', escFecha); try{ speechSynthesis.cancel(); }catch(e){} }
  function resumoFalado(){
    var d = S.dia||{}, t = (d.saudacao||'') + ' ';
    if(d.meta && d.meta.metaMes > 0) t += 'Sua meta de hoje é ' + Math.round(d.meta.hoje) + ' reais. ';
    if((d.vendaAtiva||[]).length) t += 'Você tem ' + d.vendaAtiva.length + ' clientes para chamar hoje. ';
    (d.dicas||[]).forEach(function(x,i){ t += 'Dica ' + (i+1) + ': ' + x + ' '; });
    return t;
  }
  function desenhar(){
    var c = document.getElementById('cpCorpo'); if(!c) return;
    var d = S.dia;
    if(!d){ c.innerHTML = '<div class="cp-card">Preparando o seu dia…</div>'; return; }
    var m = d.meta || {}, pct = m.metaMes ? Math.min(100, Math.round((m.vendidoMes||0) / m.metaMes * 100)) : 0, eu = d.eu || {}, mel = d.melhor;
    var num = function(rot, v, ref){ return '<div class="cp-num"><b>'+v+'</b><small>'+rot+'</small>'+(ref!=null?'<em>melhor da loja: '+ref+'</em>':'')+'</div>'; };
    var semMeta = !(m.metaMes > 0);
    var h = '<div class="cp-card"><h4>'+ic('estrela',14)+'Meta de hoje</h4>'
      + (semMeta ? '<div class="cp-meta-v" style="font-size:18px;">Sem meta ainda</div><div class="cp-meta-s">Ainda não há meta desta loja no Lançamentos (fator da loja) nem histórico seu para sugerir uma.</div><div class="cp-meta-s" style="margin-top:6px;">No mês: <b>'+brl0(m.vendidoMes)+'</b>'+(eu.posicao?' · você está em <b>'+eu.posicao+'º de '+eu.deQuantas+'</b> na loja':'')+'</div></div>' : '')
      + (semMeta ? '' : '<div class="cp-meta-v">'+brl0(m.hoje)+'</div><div class="cp-meta-s">'+(m.tipo==='lancamentos' ? 'Sua parte ('+m.participacao+'%) da meta da loja no Lançamentos, faltando '+m.diasRestantes+' dias no mês.' : 'Meta sugerida (sua média dos últimos 3 meses + 10%).')+'</div>'
      + '<div class="cp-barra" aria-hidden="true"><i style="width:'+pct+'%"></i></div><div class="cp-meta-s">No mês: <b>'+brl0(m.vendidoMes)+'</b> de '+brl0(m.metaMes)+' ('+pct+'%)'+(eu.posicao?' · você está em <b>'+eu.posicao+'º de '+eu.deQuantas+'</b> na loja':'')+'</div>'
      + (m.loja ? '<div class="cp-meta-s" style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--t-line,#dde);">'+ic('loja',13)+' <b>Loja no mês:</b> '+brl0(m.loja.vendido)+' de '+brl0(m.loja.meta)+(m.loja.faixaAtual?' · faixa de <b>'+String(m.loja.faixaAtual.percentual).replace('.',',')+'%</b>':'')+(m.loja.proxima?' · faltam <b>'+brl0(m.loja.falta)+'</b> para '+String(m.loja.proxima.percentual).replace('.',',')+'%':'')+'</div>' : '')
      + '</div>');
    h += '<div class="cp-card"><h4>'+ic('grafico',14)+'Seus números no mês</h4><div class="cp-nums">'
      + num('vendas', eu.vendas||0, mel?mel.vendas:null) + num('ticket médio', brl0(eu.ticketMedio), mel?brl0(mel.ticketMedio):null) + num('peças por venda', String(eu.pecasPorVenda||0).replace('.',','), mel?String(mel.pecasPorVenda).replace('.',','):null)
      + '</div>' + (mel && (parseInt(mel.vendasComServico)||parseInt(eu.vendasComServico)) ? '<div class="cp-meta-s" style="margin-top:6px;">A melhor da loja junta serviço em <b>'+esc(mel.vendasComServico)+'</b> das vendas. Você: <b>'+esc(eu.vendasComServico||'0%')+'</b>.</div>' : (eu.posicao===1?'<div class="cp-meta-s" style="margin-top:6px;">Você é a melhor da loja este mês. Continue assim!</div>':'')) + '</div>';
    var ROT = { venda:'No balcão', pedido:'No pedido', orcamento:'No orçamento', chat:'No chat' };
    var dmP = d.dicasModulo || {};
    h += '<div class="cp-card"><h4>'+ic('info',14)+'Dicas de hoje</h4>' + (d.dicas||[]).map(function(x,i){ return '<div class="cp-dica"><span class="n">'+(i+1)+'</span><span>'+esc(x)+'</span></div>'; }).join('')
      + Object.keys(ROT).filter(function(k){ return (dmP[k]||[]).length; }).map(function(k){ return '<details style="margin-top:6px;"><summary style="cursor:pointer;font-weight:700;font-size:12.5px;color:#8a3560;">'+ROT[k]+' ('+dmP[k].length+')</summary>' + dmP[k].map(function(x){ return '<div class="cp-dica"><span class="n">•</span><span>'+esc(x)+'</span></div>'; }).join('') + '</details>'; }).join('') + '</div>';
    h += cartaoAprender();
    var va = d.vendaAtiva||[];
    h += '<div class="cp-card"><h4>'+ic('telefone',14)+'Quem chamar hoje ('+va.length+')</h4>' + (va.length ? va.map(function(x,i){
      return '<div class="cp-cli '+esc(x.tipo)+'"><b>'+esc(x.cliente||'Cliente')+'</b><div class="m">'+esc(x.motivo)+'</div><div class="cp-acoes"><button type="button" class="cp-b wa" data-cpmsg="'+i+'">'+ic('whatsapp',13)+'Mensagem pronta</button></div></div>'; }).join('')
      : '<div class="cp-meta-s">Ninguém pendente hoje. Que tal pedir indicação aos clientes da semana?</div>') + '</div>';
    if(S.user && S.user.nivel === 'diretoria') h += '<div class="cp-card"><h4>'+ic('estrela',14)+'Avisos e quiz da equipe (só diretoria)</h4><div id="cpAvisos"><button type="button" class="cp-b" data-cp="avisos">Ver avisos e resultados</button></div></div>';
    if(S.user && S.user.nivel === 'diretoria') h += '<div class="cp-card"><h4>'+ic('usuarios',14)+'Equipe: bem-estar (só diretoria)</h4><div id="cpEquipe"><button type="button" class="cp-b" data-cp="equipe">Ver como a equipe está</button></div></div>';
    if(d.ranking && d.ranking.length) h += '<div class="cp-card"><h4>'+ic('usuarios',14)+'Ranking da loja (gerência)</h4><table class="cp-rank">' + d.ranking.map(function(r,i){ return '<tr><td>'+(i+1)+'º '+esc(r.nome)+'</td><td class="r">'+r.vendas+' vendas</td><td class="r">'+brl0(r.total)+'</td></tr>'; }).join('') + '</table></div>';
    h += '<div class="cp-card"><h4>'+ic('mensagem',14)+'Converse com o Vilacinha</h4><div class="cp-chat" id="cpChat">' + (S.hist.length ? S.hist.map(function(m){ return '<div class="cp-msg '+(m.de==='ia'?'ia':'eu')+'">'+(m.de==='ia' ? esc(m.texto).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|\n)\s*[*-]\s+/g,'$1• ') : esc(m.texto))+'</div>'; }).join('') : '<div class="cp-meta-s">Pergunte por texto ou pelo microfone: argumentos de venda, como bater a meta, o que oferecer junto…</div>') + '</div></div>';
    c.innerHTML = h;
    c.querySelectorAll('[data-cpmsg]').forEach(function(b){ b.onclick = function(){ abrirMensagem(va[+b.dataset.cpmsg]); }; });
    var be = c.querySelector('[data-cp="equipe"]'); if(be) be.onclick = verEquipe;
    var bav = c.querySelector('[data-cp="avisos"]'); if(bav) bav.onclick = verAvisos;
    c.querySelectorAll('[data-cp-lic]').forEach(function(b){ b.onclick = function(){ lerLicao(b.dataset.cpLic); }; });
    c.querySelectorAll('[data-cp-tema]').forEach(function(b){ b.onclick = function(){ abrirTema(b.dataset.cpTema); }; });
    var bq = c.querySelector('[data-cp="quiz"]'); if(bq) bq.onclick = iniciarQuiz;
    var bb = c.querySelector('[data-cp="biblioteca"]'); if(bb) bb.onclick = abrirBiblioteca;
  }

  /* ---------- v6: AULAS (pedras, ouro, ourivesaria), QUIZ e AVISOS ---------- */
  function cartaoAprender(){
    var L = (S.licoes && S.licoes.pendentes) || [];
    var h = '<div class="cp-card"><h4>'+ic('joia',14)+'Aprenda com o Vilacinha'+(L.length?' ('+L.length+' nova'+(L.length>1?'s':'')+')':'')+'</h4>';
    if(L.length){
      h += L.slice(0,3).map(function(l){ return '<div class="cp-dica"><span class="n">'+ic('info',12)+'</span><span><b>'+esc(l.titulo)+'</b>'+(l.via_codigo?' <small style="color:#8a3560;">· apareceu na via '+esc(l.via_codigo)+'</small>':'')+'<br><button type="button" class="cp-b" style="margin-top:4px;" data-cp-lic="'+esc(l.id)+'">Ler a aula</button></span></div>'; }).join('');
    } else h += '<div class="cp-meta-s">Sem aula nova agora. Quando uma via trouxer uma pedra ou assunto novo, a aula aparece aqui para todas.</div>';
    h += '<div class="cp-acoes" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"><button type="button" class="cp-b" data-cp="biblioteca">'+ic('documento',13)+'Biblioteca de pedras e ouro</button><button type="button" class="cp-b" data-cp="quiz">'+ic('estrela',13)+'Fazer o quiz</button></div></div>';
    return h;
  }
  async function carregarLicoes(){
    var r = await apiS({ op:'licoes' });
    if(r && r.ok){ S.licoes = r; pintarFab(); }
    return r;
  }
  function modal(html, aoMontar){
    var ov = document.createElement('div'); ov.className = 'cp-ov';
    ov.innerHTML = '<div class="cp-modal" role="dialog" aria-modal="true">'+html+'</div>';
    document.body.appendChild(ov);
    var fecha = function(){ ov.remove(); };
    ov.addEventListener('click', function(e){ if(e.target===ov) fecha(); });
    ov.querySelectorAll('[data-x="fechar"]').forEach(function(b){ b.onclick = fecha; });
    if(aoMontar) aoMontar(ov, fecha);
    return ov;
  }
  function paragrafos(t){ return String(t||'').split(/\n+/).map(function(p){ return '<p style="margin:0 0 8px;line-height:1.5;">'+esc(p)+'</p>'; }).join(''); }
  async function lerLicao(id){
    var l = ((S.licoes && S.licoes.pendentes)||[]).concat((S.licoes && S.licoes.recentes)||[]).filter(function(x){ return x.id===id; })[0]; if(!l) return;
    modal('<h3 style="margin:0 0 8px;font-size:16px;">'+esc(l.titulo)+'</h3>'+paragrafos(l.texto)
      +'<div class="cp-acoes" style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px;"><button type="button" class="cp-b" data-x="ouvir">'+icOuvir(14)+' Ouvir</button><button type="button" class="cp-b" data-x="fechar">Entendi</button></div>',
      function(ov, fecha){
        ov.querySelector('[data-x="ouvir"]').onclick = function(){ falar(l.titulo+'. '+l.texto); };
        ov.querySelector('[data-x="fechar"]').addEventListener('click', async function(){ try{ speechSynthesis.cancel(); }catch(e){} await apiS({ op:'licaoVista', ids:[id] }); await carregarLicoes(); desenhar(); });
      });
  }
  async function abrirBiblioteca(){
    var r = await apiS({ op:'biblioteca' });
    if(!r || !r.ok){ toast((r && r.error) || 'Não consegui abrir a biblioteca.'); return; }
    var G = { pedra:'Pedras', ouro:'Ouro', prata:'Prata', oficina:'Ourivesaria', extra:'Aprendidos nas perguntas' };
    var h = '<h3 style="margin:0 0 8px;font-size:16px;">Biblioteca do Vilacinha</h3><p style="margin:0 0 8px;font-size:13px;color:var(--t-text-soft,#556);">Toque para ler. Perguntou algo novo ao Vilacinha? O assunto entra aqui.</p>';
    Object.keys(G).forEach(function(k){ var it = r.temas.filter(function(t){ return t.cat===k; }); if(!it.length) return;
      h += '<div style="margin:8px 0 4px;font-weight:700;font-size:12px;color:#8a3560;text-transform:uppercase;">'+G[k]+'</div><div style="display:flex;flex-wrap:wrap;gap:6px;">'+it.map(function(t){ return '<button type="button" class="cp-b" data-cp-tema="'+esc(t.id)+'">'+esc(t.nome)+'</button>'; }).join('')+'</div>'; });
    h += '<div class="cp-acoes" style="display:flex;justify-content:flex-end;margin-top:12px;"><button type="button" class="cp-b" data-x="fechar">Fechar</button></div>';
    modal(h, function(ov){ ov.querySelectorAll('[data-cp-tema]').forEach(function(b){ b.onclick = function(){ abrirTema(b.dataset.cpTema); }; }); });
  }
  async function abrirTema(id){
    var r = await apiS({ op:'tema', id:id });
    if(!r || !r.ok){ toast('Tema não encontrado.'); return; }
    modal('<h3 style="margin:0 0 8px;font-size:16px;">'+esc(r.nome)+'</h3>'+paragrafos(r.texto)+'<div class="cp-acoes" style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px;"><button type="button" class="cp-b" data-x="ouvir">'+icOuvir(14)+' Ouvir</button><button type="button" class="cp-b" data-x="fechar">Fechar</button></div>',
      function(ov){ ov.querySelector('[data-x="ouvir"]').onclick = function(){ falar(r.nome+'. '+r.texto); }; });
  }
  /* quiz: 8 perguntas por função; a correção é feita no servidor */
  async function iniciarQuiz(){
    var r = await apiS({ op:'quizIniciar' });
    if(!r || !r.ok){ toast((r && r.error) || 'Não consegui abrir o quiz agora.'); return; }
    var P = r.perguntas, i = 0, resp = [];
    var ov = modal('<div id="cpQz"></div>');
    function passo(){
      var q = P[i], box = ov.querySelector('#cpQz');
      box.innerHTML = '<div style="font-size:12px;color:#8a3560;font-weight:700;">Pergunta '+(i+1)+' de '+P.length+'</div><div style="height:5px;background:#eee;border-radius:3px;margin:6px 0 10px;"><i style="display:block;height:5px;border-radius:3px;background:#8a3560;width:'+Math.round(i/P.length*100)+'%"></i></div>'
        + '<h3 style="margin:0 0 10px;font-size:16px;line-height:1.35;">'+esc(q.q)+'</h3>'
        + q.opcoes.map(function(o){ return '<button type="button" class="cp-b" style="display:block;width:100%;text-align:left;margin-bottom:7px;white-space:normal;line-height:1.35;" data-op="'+o.i+'">'+esc(o.t)+'</button>'; }).join('')
        + '<div class="cp-acoes" style="display:flex;justify-content:flex-end;margin-top:6px;"><button type="button" class="cp-b" data-x="fechar">Sair</button></div>';
      box.querySelector('[data-x="fechar"]').onclick = function(){ ov.remove(); };
      box.querySelectorAll('[data-op]').forEach(function(b){ b.onclick = function(){ resp.push({ id:q.id, escolha:+b.dataset.op }); i++; if(i<P.length) passo(); else fim(); }; });
    }
    async function fim(){
      var box = ov.querySelector('#cpQz'); box.innerHTML = '<p>Corrigindo…</p>';
      var f = await apiS({ op:'quizResponder', respostas:resp });
      if(!f || !f.ok){ box.innerHTML = '<p>'+esc((f&&f.error)||'Não consegui corrigir agora.')+'</p><div class="cp-acoes"><button type="button" class="cp-b" data-x="fechar">Fechar</button></div>'; box.querySelector('[data-x="fechar"]').onclick = function(){ ov.remove(); }; return; }
      var cor = f.pct>=90?'#1f9a55':f.pct>=70?'#2f7bd0':f.pct>=40?'#a8803a':'#c62828';
      box.innerHTML = '<div style="text-align:center;"><div style="font-size:34px;font-weight:800;color:'+cor+';">'+f.pct+'%</div><div style="font-weight:700;">'+esc(f.nivel)+' · '+f.acertos+' de '+f.total+' certas</div></div>'
        + '<div style="margin-top:10px;max-height:46vh;overflow:auto;">' + f.detalhes.map(function(d){ return '<div style="padding:8px 0;border-top:1px dashed var(--t-line,#dde);"><b style="color:'+(d.ok?'#1f9a55':'#c62828')+';">'+(d.ok?'Acertou':'Errou')+'</b> · '+esc(d.q)+(d.ok?'':'<br><small>Sua resposta: '+esc(d.sua||'—')+'<br>Correta: <b>'+esc(d.certa)+'</b></small>')+'<br><small style="color:var(--t-text-soft,#556);">'+esc(d.e)+'</small></div>'; }).join('') + '</div>'
        + '<div class="cp-acoes" style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px;"><button type="button" class="cp-b" data-x="fechar">Fechar</button></div>';
      box.querySelector('[data-x="fechar"]').onclick = function(){ ov.remove(); };
    }
    passo();
  }
  /* diretoria: avisos de destaque / nota baixa e resultados do quiz */
  async function verAvisos(){
    var box = document.getElementById('cpAvisos'); if(!box) return;
    box.innerHTML = '<div class="cp-meta-s">Carregando…</div>';
    var rs = await Promise.all([ apiS({ op:'avisos' }), apiS({ op:'quizEquipe' }) ]), av = rs[0], qz = rs[1];
    var h = '';
    if(av && av.ok && av.avisos.length){
      h += av.avisos.map(function(a){ var bom = a.tipo==='destaque'; return '<div class="cp-be"><b style="color:'+(bom?'#1f9a55':'#c62828')+';">'+(bom?'Destaque':'Atenção')+' · '+esc(a.titulo)+'</b><div class="m">'+esc(a.texto)+' <span class="m">'+new Date(a.criado_em).toLocaleDateString('pt-BR')+'</span></div></div>'; }).join('')
        + '<div style="margin:6px 0;"><button type="button" class="cp-b" data-cp="lidos">Marcar avisos como lidos</button></div>';
    } else h += '<div class="cp-meta-s">Nenhum aviso novo.</div>';
    if(qz && qz.ok && qz.pessoas.length){
      h += '<div class="cp-meta-s" style="margin-top:8px;"><b>Quiz — média por pessoa (90 dias)</b></div><table class="cp-rank">' + qz.pessoas.map(function(p){ return '<tr><td>'+esc(p.nome||'—')+'</td><td class="r">'+p.feitos+'x</td><td class="r"><b>'+p.media+'%</b></td><td class="r" style="font-size:11px;">'+esc((p.pontosFracos||[]).join(', ')||'')+'</td></tr>'; }).join('') + '</table>';
    } else h += '<div class="cp-meta-s" style="margin-top:6px;">Ninguém fez o quiz ainda.</div>';
    box.innerHTML = h;
    var bl = box.querySelector('[data-cp="lidos"]');
    if(bl) bl.onclick = async function(){ await apiS({ op:'avisoLido', ids:av.avisos.map(function(a){ return a.id; }) }); S.avisosN = 0; pintarFab(); verAvisos(); };
  }
  /* ao entrar: aula nova aparece no balão (1x por aula) e a diretoria recebe aviso de destaque/baixa */
  async function avisosIniciais(){
    var r = await carregarLicoes();
    var L = r && r.ok ? r.pendentes : [];
    if(S.user && S.user.nivel==='diretoria'){
      var av = await apiS({ op:'avisos' });
      if(av && av.ok && av.avisos.length && !S.aberto){
        S.avisosN = av.avisos.length;
        var a0 = av.avisos[0];
        balao('<div class="cp-txt"><b>'+(a0.tipo==='destaque'?'Destaque no quiz':'Atenção no quiz')+':</b> '+esc(a0.texto)+(av.avisos.length>1?' (e mais '+(av.avisos.length-1)+')':'')+'</div>', '<button type="button" class="cp-b" data-cp="abrir">Ver no painel</button>', true, 20000);
        return;
      }
    }
    if(L.length && !S.aberto && ls(chave('licBalao')) !== L[0].id){
      ls(chave('licBalao'), L[0].id);
      balao('<div class="cp-txt"><b>Aula nova:</b> '+esc(L[0].titulo)+(L[0].via_codigo?' (apareceu na via '+esc(L[0].via_codigo)+')':'')+'. Toque em "Abrir" e leia em 1 minuto.</div>', '<button type="button" class="cp-b" data-cp="abrir">Abrir</button>', true, 20000);
    }
  }

  /* ---------- v4: perfil de bem-estar da equipe (só diretoria) ---------- */
  var PESO = { otima:2, bem:1, tranquila:1, sim:1, musica:1, cafe:1, elogio:1, descanso:0, cansada:-1, corrida:-1, mais_ou_menos:-1, nao:-1, dor:-1, cansaco:-1, preocupada:-2, triste:-2, dificil:-2, mal:-2 };
  var NOME_P = { humor:'Humor', agua:'Água', corpo:'Corpo', sono:'Sono', vida:'Vida fora da loja', dia:'O que alegra' };
  async function verEquipe(){
    var box = document.getElementById('cpEquipe'); if(!box) return;
    box.innerHTML = '<div class="cp-meta-s">Carregando…</div>';
    var r = await api({ op:'equipe' });
    if(!r || !r.ok){ box.innerHTML = '<div class="cp-meta-s">'+esc((r&&r.error)||'Não consegui carregar.')+'</div>'; return; }
    if(!r.pessoas.length){ box.innerHTML = '<div class="cp-meta-s">Ninguém respondeu ainda. As perguntas aparecem aos poucos, só para quem aceitar.</div>'; return; }
    box.innerHTML = '<div class="cp-meta-s">Últimos 45 dias. Só aparece quem aceitou responder. Use para cuidar da equipe, nunca para cobrar ou punir.</div>' + r.pessoas.map(function(p){
      var rs = p.respostas||[], soma = rs.reduce(function(s,x){ return s + (PESO[x.resposta]||0); }, 0), media = rs.length ? soma/rs.length : 0;
      var sinal = !rs.length ? '' : media <= -0.8 ? ' <span style="color:#c62828;font-weight:700;">· atenção</span>' : media >= 0.8 ? ' <span style="color:#1f9a55;font-weight:700;">· bem</span>' : ' <span style="color:#a8803a;font-weight:700;">· oscilando</span>';
      var ult = {}; rs.forEach(function(x){ if(!ult[x.pergunta]) ult[x.pergunta] = x; });
      var textos = rs.filter(function(x){ return x.detalhe; }).slice(0,5);
      return '<div class="cp-be"><b>'+esc(p.nome||'—')+'</b>'+sinal+'<div class="m">'+(p.aceito===false?'Preferiu não participar.':rs.length+' respostas')+'</div>'
        + (Object.keys(ult).length ? '<div class="r">' + Object.keys(ult).map(function(k){ var x = ult[k], pz = PESO[x.resposta]||0; return '<span class="'+(pz<0?'ruim':pz>0?'bom':'')+'">'+esc(NOME_P[k]||k)+': '+esc(String(x.resposta).replace(/_/g,' '))+'</span>'; }).join('') + '</div>' : '')
        + (textos.length ? '<details><summary>O que contou ('+textos.length+')</summary>' + textos.map(function(x){ return '<div style="margin-top:4px;">“'+esc(x.detalhe)+'” <span class="m">'+new Date(x.criado_em).toLocaleDateString('pt-BR')+'</span></div>'; }).join('') + '</details>' : '')
        + '</div>';
    }).join('');
  }

  /* ---------- mensagem pronta: a vendedora revisa e envia (clique) ---------- */
  function abrirMensagem(x){
    if(!x) return;
    var ov = document.createElement('div'); ov.className = 'cp-ov';
    ov.innerHTML = '<div class="cp-modal" role="dialog" aria-modal="true" aria-label="Mensagem para '+esc(x.cliente)+'"><h3 style="margin:0 0 4px;font-size:16px;">Mensagem para '+esc(x.cliente)+'</h3><p style="margin:0 0 8px;color:var(--t-text-soft,#556);font-size:13px;">'+esc(x.motivo)+'. Revise e ajuste do seu jeito antes de enviar.</p>'
      + '<textarea id="cpMsgTxt">'+esc(x.mensagem)+'</textarea><div class="cp-acoes" style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px;"><button type="button" class="cp-b" data-x="fechar">Cancelar</button><button type="button" class="cp-b" data-x="copiar">'+ic('copiar',13)+'Copiar</button><button type="button" class="cp-b pri" data-x="enviar">'+ic('whatsapp',13)+'Enviar pelo WhatsApp</button></div></div>';
    document.body.appendChild(ov);
    var fecha = function(){ ov.remove(); };
    ov.addEventListener('click', function(e){ if(e.target===ov) fecha(); });
    ov.querySelector('[data-x="fechar"]').onclick = fecha;
    ov.querySelector('[data-x="copiar"]').onclick = function(){ try{ navigator.clipboard.writeText(ov.querySelector('#cpMsgTxt').value); toast('Mensagem copiada.'); }catch(e){} };
    ov.querySelector('[data-x="enviar"]').onclick = async function(){
      var b = this, txt = ov.querySelector('#cpMsgTxt').value.trim(); if(!txt) return;
      if(window.MarketingOff && MarketingOff.permitir && !(await MarketingOff.permitir({ telefone:x.telefone, nome:x.cliente, tags:[] }))) return;
      b.disabled = true;
      var vend = (S.user && (S.user.apelido || S.user.nome)) || '';
      var rod = '\n\n—\n' + (vend ? vend + ' · ' : '') + (S.dia && S.dia.loja || S.lojaNome || 'Vilaça Joias') + '\nPara continuar a conversa, é só responder esta mensagem.';
      var r = null;
      try{ var res = await fetch(URL_FN('enviar-via'), { method:'POST', headers:{ 'Content-Type':'application/json', apikey:window.SUPABASE_ANON_KEY, Authorization:'Bearer '+window.SUPABASE_ANON_KEY },
        body: JSON.stringify({ senha:S.senha, telefone:x.telefone, cliente:x.cliente||'', texto: txt + rod, tipo:'chamar_cliente', registroId:x.id||'', via:'CHAMAR CLIENTE' }) }); r = await res.json().catch(function(){ return {}; }); }
      catch(e){ r = { erro:'Sem conexão.' }; }
      b.disabled = false;
      if(r && r.ok){ toast('Mensagem enviada para ' + (x.cliente||'o cliente') + '.'); fecha(); S.dia.vendaAtiva = (S.dia.vendaAtiva||[]).filter(function(y){ return y !== x; }); pintarFab(); desenhar(); }
      else toast((r && (r.erro || r.error)) || 'Não foi possível enviar. Tente de novo.');
    };
  }

  async function perguntar(texto){
    texto = String(texto||'').trim(); if(!texto) return;
    var ta = document.getElementById('cpTexto'); if(ta) ta.value = '';
    S.hist.push({ de:'eu', texto:texto }); desenhar();
    var chat = document.getElementById('cpChat'); if(chat){ chat.insertAdjacentHTML('beforeend','<div class="cp-msg ia" id="cpPensa">Pensando…</div>'); chat.scrollIntoView({ block:'end' }); }
    var r = await apiS({ op:'perguntar', pergunta:texto, historico:S.hist.slice(-7,-1) });
    if(r && r.sem) r = await api({ op:'perguntar', pergunta:texto, historico:S.hist.slice(-7,-1) });
    var resp = r && r.ok ? r.resposta : ((r && r.error) || 'Não consegui responder agora.');
    S.hist.push({ de:'ia', texto:resp }); desenhar();
    var c2 = document.getElementById('cpChat'); if(c2) c2.scrollIntoView({ block:'end' });
  }

  var vigia = null;
  async function iniciar(o){
    parar();
    if(!o || !o.senha || !o.user || o.user.nivel === 'oficina') return;
    S.senha = o.senha; S.user = o.user; S.lojaNome = o.lojaNome || ''; S.hist = [];
    css();
    var r = await api({ op:'dia', lojaId: lojaShell() });
    if(!r || !r.ok || r.desligado || r.sem) return;   // fora da produção (sem a função) ou sem permissão: não aparece
    if(S.senha !== o.senha) return;
    S.dia = r;
    var b = document.createElement('button'); b.type = 'button'; b.id = 'cpFab'; b.className = 'cp-fab';
    b.onclick = function(){ if(S.aberto) fecharPainel(); else abrirPainel(); };
    document.body.appendChild(b); pintarFab();
    setTimeout(talvezDica, 5000);   // saudação do dia; as outras dicas vêm ao abrir os módulos
    setTimeout(function(){ avisosIniciais().catch(function(){}); }, 12000);   // v6: aula nova / avisos da diretoria
    clearInterval(vigia); vigia = setInterval(function(){ if(!document.hidden && !S.aberto) carregarLicoes().catch(function(){}); }, 20*60000);
  }
  function parar(){
    clearInterval(vigia); vigia = null; fecharBalao(); fecharPainel();
    var b = document.getElementById('cpFab'); if(b) b.remove();
    S.senha = null; S.user = null; S.dia = null; S.hist = [];
  }
  /** O app trocou de loja: refaz o dia para a loja nova (fica guardado por loja). */
  async function trocouLoja(){
    if(!S.senha || !document.getElementById('cpFab')) return;
    var r = await api({ op:'dia', lojaId: lojaShell() });
    if(r && r.ok){ S.dia = r; pintarFab(); desenhar(); }
  }
  window.Copiloto = { iniciar:iniciar, parar:parar, abrir:abrirPainel, trocouLoja:trocouLoja, moduloAberto:moduloAberto };
})();
