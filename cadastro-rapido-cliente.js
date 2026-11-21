/* 22/11: CADASTRO RÁPIDO no "Chamar cliente" (PDV e Marketing): só NOME + celular com DDD.
 * CadastroRapidoCliente.montar(el, { gatewayCall, aoCriar(cliente), nomeInicial })
 * Se o celular já existir no cadastro, usa o cliente existente (não duplica). */
(function(){
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function dig(s){ return String(s == null ? '' : s).replace(/\D/g, ''); }
  function toast(m, t){ if(typeof showToast === 'function') showToast(m, t); }
  function celularOk(ddd, num){ return ddd.length === 2 && Number(ddd) >= 11 && num.length === 9 && num.charAt(0) === '9'; }
  function montar(el, o){
    if(!el) return; o = o || {};
    el.innerHTML = '<button type="button" class="btn btn-ghost btn-sm" data-crc-abrir style="margin:6px 0;">+ Cadastrar cliente novo (nome e celular)</button>'
      + '<div data-crc-form style="display:none;margin:6px 0 10px;padding:10px 12px;border:1px dashed var(--line-strong,#c5d0da);border-radius:10px;">'
      + '<div class="field" style="margin-bottom:8px;"><label for="crcNome">Nome do cliente</label><input id="crcNome" autocomplete="off" value="' + esc(o.nomeInicial || '') + '"></div>'
      + '<div class="field" style="margin-bottom:8px;"><label for="crcDdd">Celular com DDD</label><div style="display:flex;gap:6px;"><input id="crcDdd" inputmode="numeric" maxlength="2" placeholder="DDD" aria-label="DDD" style="width:64px;flex-shrink:0;"><input id="crcNum" inputmode="numeric" maxlength="10" placeholder="9XXXX-XXXX" aria-label="Número do celular" style="flex:1;min-width:0;"></div></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;"><button type="button" class="btn btn-ghost btn-sm" data-crc-cancelar>Cancelar</button><button type="button" class="btn btn-accent btn-sm" data-crc-salvar>Salvar cliente</button></div></div>';
    var abrir = el.querySelector('[data-crc-abrir]'), form = el.querySelector('[data-crc-form]');
    var ddd = el.querySelector('#crcDdd'), num = el.querySelector('#crcNum');
    abrir.onclick = function(){ form.style.display = ''; abrir.style.display = 'none'; var n = el.querySelector('#crcNome'); if(n && typeof o.nomeAtual === 'function' && !n.value) n.value = o.nomeAtual() || ''; setTimeout(function(){ (n && !n.value ? n : ddd).focus(); }, 30); };
    el.querySelector('[data-crc-cancelar]').onclick = function(){ form.style.display = 'none'; abrir.style.display = ''; };
    ddd.oninput = function(){ ddd.value = dig(ddd.value).slice(0, 2); if(ddd.value.length === 2) num.focus(); };
    num.oninput = function(){ var d = dig(num.value).slice(0, 9); num.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; };
    el.querySelector('[data-crc-salvar]').onclick = async function(){
      var b = this;
      var nome = String(el.querySelector('#crcNome').value || '').trim().toUpperCase().replace(/\s+/g, ' ');
      var d = dig(ddd.value), n = dig(num.value);
      if(nome.length < 2){ toast('Digite o nome do cliente.'); return; }
      if(!celularOk(d, n)){ toast('Celular com DDD: DDD (2 dígitos) + número de 9 dígitos começando com 9.', 6000); return; }
      var telefone = '(' + d + ') ' + n.slice(0, 5) + '-' + n.slice(5);
      b.disabled = true;
      try{
        var achado = null;
        try{ var rs = await o.gatewayCall({ op:'searchClients', params:{ termo: d + n } }); achado = ((rs && rs.data) || []).find(function(c){ var t = dig(c.telefone); if(t.length === 13) t = t.slice(2); return t === d + n; }) || null; }catch(e){}
        if(achado){ toast('Este celular já é de ' + (achado.nome || 'um cliente') + ' no cadastro: usei esse cadastro.', 6000); form.style.display = 'none'; abrir.style.display = ''; if(o.aoCriar) o.aoCriar(achado); return; }
        var cli = { id: 'cli_' + Math.random().toString(36).slice(2) + Date.now().toString(36), nome: nome, telefone: telefone, credito: 0, fiadoDebitos: [], creditoMovimentos: [], criadoEm: Date.now(), origemCadastro: 'chamar_cliente' };
        var r = await o.gatewayCall({ op:'upsert', table:'clientes_cadastro', params:{ row:{ id: cli.id, payload: cli } } });
        if(!r || r.error){ toast('Não foi possível cadastrar agora. Confira a internet e tente de novo.'); return; }
        toast('Cliente cadastrado. Complete o cadastro depois (CPF, endereço, nascimento).', 6000);
        form.style.display = 'none'; abrir.style.display = '';
        if(o.aoCriar) o.aoCriar(cli);
      } finally { b.disabled = false; }
    };
  }
  window.CadastroRapidoCliente = { montar: montar };
})();
