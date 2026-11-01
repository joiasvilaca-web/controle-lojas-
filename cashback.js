/* ============================================================
   CASHBACK (regras definidas pelo Felipe em 01/11/2026)
   - Gera 10% do valor PAGO EM DINHEIRO (forma de pagamento "Dinheiro").
   - Só libera no dia seguinte ao pagamento e vale 60 dias corridos a partir da compra.
   - Abate no máximo 50% do total de uma nova venda/pedido.
   - Vale a data do PAGAMENTO: pedido pago depois do vencimento não abate.
   - Vale em qualquer loja. Cancelamento/devolução estorna.
   Fica no cadastro do cliente: payload.cashback = { lotes:[...] }.
   O banco preserva payload.cashback em qualquer gravação do cliente (trigger
   cashback_preserva); só a gravação feita por aqui (marcador __cashbackWrite) altera.
   ============================================================ */
(function(){
  const PERC = 0.10, DIAS = 60, MAX_USO = 0.5;
  const r2 = n => Math.round((Number(n)||0)*100)/100;
  function hoje(){
    try{ return new Intl.DateTimeFormat('en-CA',{ timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()); }
    catch(e){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  }
  function somaDias(iso, n){ const [y,m,d]=String(iso).split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d+n)); return dt.toISOString().slice(0,10); }
  function fmtData(iso){ return iso ? String(iso).split('-').reverse().join('/') : ''; }
  function fmtR(n){ return (Number(n)||0).toLocaleString('pt-BR',{ style:'currency', currency:'BRL' }); }
  const semAc = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
  function ehDinheiro(formaId, formas){
    if(!formaId || String(formaId).startsWith('__')) return false;
    const f = (formas||[]).find(x=>x.id===formaId);
    return !!f && semAc(f.nome||f.label) === 'dinheiro';
  }
  function lotes(cli){ return (cli && cli.cashback && Array.isArray(cli.cashback.lotes)) ? cli.cashback.lotes : []; }
  function ativo(l, data){ return !l.estornado && (Number(l.saldo)||0) > 0.004 && l.ativaEm <= data && data <= l.expiraEm; }
  function disponivel(cli, data){ data = data || hoje(); return r2(lotes(cli).filter(l=>ativo(l,data)).reduce((a,l)=>a+(Number(l.saldo)||0),0)); }
  function aLiberar(cli, data){ data = data || hoje(); return r2(lotes(cli).filter(l=>!l.estornado && (Number(l.saldo)||0)>0.004 && l.ativaEm > data).reduce((a,l)=>a+(Number(l.saldo)||0),0)); }
  /** Resumo para a tela de pagamento. dataLimite = data prevista do pagamento (agendamento do pedido). */
  function info(cli, dataLimite){
    const d = hoje();
    const disp = disponivel(cli, d);
    const ativos = lotes(cli).filter(l=>ativo(l,d)).sort((a,b)=>a.expiraEm.localeCompare(b.expiraEm));
    const proxVenc = ativos.length ? ativos[0].expiraEm : null;
    let venceAntes = 0;
    if(dataLimite && dataLimite > d) venceAntes = r2(ativos.filter(l=>l.expiraEm < dataLimite).reduce((a,l)=>a+(Number(l.saldo)||0),0));
    return { disp, aLiberar: aLiberar(cli, d), proxVenc, venceAntes, dataLimite: dataLimite||null };
  }
  function maxUso(total){ return r2((Number(total)||0) * MAX_USO); }

  /** Monta as mudanças de cashback de UM registro (venda/pedido) no cliente.
   *  o = { registroId, tipo:'Venda'|'Pedido', via, loja, dinheiroTotal, usadoTotal, total, anterior }
   *  Devolve { erro } ou { resumo } (o cliente é alterado em memória). */
  function planejar(cli, o){
    const d = hoje();
    if(!cli.cashback || !Array.isArray(cli.cashback.lotes)) cli.cashback = { lotes: [] };
    const L = cli.cashback.lotes;
    const ant = o.anterior || { base:0, usado:0 };
    const usado = r2(o.usadoTotal), base = r2(o.dinheiroTotal);
    // ---- uso (abater) ----
    const dUso = r2(usado - (Number(ant.usado)||0));
    if(dUso > 0.004){
      if(usado > maxUso(o.total) + 0.009) return { erro: `O cashback abate no máximo 50% do total (${fmtR(maxUso(o.total))}).` };
      const disp = disponivel(cli, d);
      if(dUso > disp + 0.009) return { erro: `Cashback disponível hoje: ${fmtR(disp)}. Diminua o valor em cashback.` };
      let falta = dUso;
      L.filter(l=>ativo(l,d)).sort((a,b)=>a.expiraEm.localeCompare(b.expiraEm)).forEach(l=>{
        if(falta <= 0.004) return;
        const t = r2(Math.min(falta, Number(l.saldo)||0));
        l.saldo = r2((Number(l.saldo)||0) - t); falta = r2(falta - t);
        (l.usos = l.usos || []).push({ origemId:o.registroId, tipo:o.tipo, via:o.via||'', valor:t, data:d });
      });
    } else if(dUso < -0.004){
      devolverUsos(L, o.registroId, -dUso);
    }
    // ---- geração (10% do dinheiro) ----
    const dBase = r2(base - (Number(ant.base)||0));
    if(dBase > 0.004){
      const valor = r2(dBase * PERC);
      if(valor >= 0.01) L.push({ id:'cb_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36), origemId:o.registroId, tipo:o.tipo, via:o.via||'', loja:o.loja||'', valor, saldo:valor, geradoEm:d, ativaEm:somaDias(d,1), expiraEm:somaDias(d,DIAS), usos:[] });
    } else if(dBase < -0.004){
      estornarValor(L, o.registroId, r2(-dBase * PERC));
    }
    return { resumo: resumoRegistro(cli, o.registroId, base, usado) };
  }
  function devolverUsos(L, registroId, valor){
    let resta = r2(valor);
    L.forEach(l=>{ (l.usos||[]).slice().reverse().forEach(u=>{
      if(resta <= 0.004 || u.origemId !== registroId) return;
      const t = r2(Math.min(resta, u.valor)); u.valor = r2(u.valor - t); l.saldo = r2((Number(l.saldo)||0) + t); resta = r2(resta - t);
    }); l.usos = (l.usos||[]).filter(u=>u.valor > 0.004); });
  }
  function estornarValor(L, registroId, valor){
    let resta = r2(valor);
    L.filter(l=>l.origemId===registroId && !l.estornado).forEach(l=>{
      if(resta <= 0.004) return;
      const a = r2(Math.min(resta, Number(l.valor)||0)); l.valor = r2(l.valor - a); l.saldo = r2(Math.max(0, (Number(l.saldo)||0) - a)); resta = r2(resta - a);
      if(l.valor <= 0.004){ l.estornado = true; l.saldo = 0; }
    });
  }
  function resumoRegistro(cli, registroId, base, usado){
    const meus = lotes(cli).filter(l=>l.origemId===registroId && !l.estornado);
    const ult = meus[meus.length-1];
    return { clienteId: cli.id, base: r2(base), usado: r2(usado), gerado: r2(meus.reduce((a,l)=>a+(Number(l.valor)||0),0)), ativaEm: ult?ult.ativaEm:null, expiraEm: ult?ult.expiraEm:null };
  }
  /** Cancelamento: tira o cashback gerado pelo registro e devolve o que ele usou. */
  function estornarRegistro(cli, registroId){
    const L = lotes(cli);
    L.forEach(l=>{ if(l.origemId===registroId){ l.estornado = true; l.saldo = 0; } });
    devolverUsos(L, registroId, 1e9);
  }
  async function buscarCliente(gatewayCall, id){
    if(!id) return null;
    const r = await gatewayCall({ op:'selectOne', table:'clientes_cadastro', params:{ column:'id', value:id } });
    return r && r.data && r.data.payload ? r.data.payload : null;
  }
  async function gravar(gatewayCall, cli){
    const payload = Object.assign({}, cli, { __cashbackWrite: true });
    const r = await gatewayCall({ op:'upsert', table:'clientes_cadastro', params:{ row:{ id: cli.id, payload } } });
    return !!(r && !r.error);
  }
  /** Aplica no banco: lê o cliente fresco, planeja, grava. Devolve { erro } ou { resumo }. */
  async function aplicar(gatewayCall, clienteId, o, so){
    const cli = await buscarCliente(gatewayCall, clienteId);
    if(!cli) return { erro: 'Cliente não encontrado no cadastro para o cashback.' };
    const p = planejar(cli, o);
    if(p.erro) return p;
    if(so === 'validar') return p;
    const ok = await gravar(gatewayCall, cli);
    if(!ok) return { erro: 'Não foi possível gravar o cashback no cadastro do cliente.' };
    p.cliente = cli;
    return p;
  }
  async function estornar(gatewayCall, clienteId, registroId){
    const cli = await buscarCliente(gatewayCall, clienteId);
    if(!cli) return false;
    estornarRegistro(cli, registroId);
    return gravar(gatewayCall, cli);
  }
  /* ---------- telas ---------- */
  function avisoPagamentoHtml(inf, total){
    if(!inf || (!(inf.disp > 0) && !(inf.aLiberar > 0))) return '';
    let h = `<div class="cashback-aviso" style="margin:8px 0;padding:8px 10px;border:1px solid #c62828;border-radius:8px;color:#c62828;background:rgba(198,40,40,.06);font-size:13px;line-height:1.45;">`;
    if(inf.disp > 0) h += `<b>Cashback disponível: ${fmtR(inf.disp)}</b> — abate até ${fmtR(Math.min(inf.disp, maxUso(total)))} (máx. 50% do total). Use a forma CASHBACK.${inf.proxVenc?` Vence em ${fmtData(inf.proxVenc)}.`:''}`;
    if(inf.aLiberar > 0) h += `${inf.disp>0?'<br>':''}Cashback a liberar amanhã: ${fmtR(inf.aLiberar)} (não pode ser usado hoje).`;
    if(inf.venceAntes > 0) h += `<br><b>Atenção:</b> ${fmtR(inf.venceAntes)} do cashback vence antes da data agendada (${fmtData(inf.dataLimite)}). Se o pagamento ficar para depois do vencimento, esse valor não poderá ser abatido.`;
    return h + `</div>`;
  }
  const REGRAS = 'CASHBACK: 10% do valor pago em dinheiro volta como bônus. Libera no dia seguinte à compra e vale 60 dias corridos. Abate até 50% de uma nova compra ou pedido. Vale a data do pagamento: depois do vencimento não pode ser usado. Cancelamento ou devolução estorna o bônus.';
  /** Bloco do cupom (texto simples, vai dentro da via térmica). */
  function cupomHtml(reg, esc){
    const c = reg && reg.cashback; if(!c || (!(c.gerado > 0) && !(c.usado > 0))) return '';
    esc = esc || (s=>String(s));
    let h = '<div class="linha"></div>';
    if(c.usado > 0) h += `<div><b>CASHBACK USADO: ${fmtR(c.usado)}</b></div>`;
    if(c.gerado > 0) h += `<div><b>CASHBACK GERADO: ${fmtR(c.gerado)}</b></div><div>Use de ${fmtData(c.ativaEm)} até ${fmtData(c.expiraEm)}</div>`;
    h += `<div style="font-size:.85em;margin-top:4px;">${esc(REGRAS)}</div>`;
    return h;
  }
  window.Cashback = { PERC, DIAS, MAX_USO, hoje, somaDias, fmtData, ehDinheiro, disponivel, aLiberar, info, maxUso, planejar, aplicar, estornar, estornarRegistro, buscarCliente, gravar, avisoPagamentoHtml, cupomHtml, REGRAS };
})();
