/* 11/11: (1) o popup "Avisar o cliente?" do Pedido só pode aparecer quando a mensagem automática NÃO saiu (falha) — se saiu ou ficou na fila do WhatsApp, não pergunta de novo;
   (2) pós-venda feito à mão que ficou na fila (WhatsApp fora do ar) é marcado como enviado quando sai, e não sai duas vezes (robô + fila). */
module.exports = { casos: [
  { nome: 'Pedido: popup "Avisar o cliente?" só aparece se a mensagem automática falhou', bug: 'popup perguntava se queria avisar o cliente mesmo com a mensagem já enviada na hora', rodar: async ({ t, ler }) => {
    const s = ler('painel-ordens.html');
    const i = s.indexOf('let avisoEnviado = false;');
    t.ok(i > 0, 'guarda se o aviso saiu');
    const bloco = s.slice(i, s.indexOf('openNotifyModal(novaOrdem', i) + 80);
    t.ok(/avisoEnviado = \(await sendWhatsApp\(novaOrdem\)\) === true/.test(bloco), 'usa o resultado do envio');
    t.ok(/if\(!avisoEnviado && !avisoNaFila\) openNotifyModal\(novaOrdem/.test(bloco), 'só abre o popup sem envio e sem fila');
    t.ok(!/\n\s*openNotifyModal\(novaOrdem\);/.test(s), 'não abre o popup sempre');
  } },
  { nome: 'Popup de aviso mostra que a mensagem automática falhou', rodar: async ({ t, abrir }) => {
    const p = await abrir('painel-ordens.html');
    const r = await p.evaluate(() => { openNotifyModal({ cliente: 'Maria', id: 'x' }, true); const a = document.body.innerText; closeModal(); openNotifyModal({ cliente: 'Maria', id: 'x' }, false); const b = document.body.innerText; closeModal(); return { a, b }; });
    t.ok(/não foi enviada/i.test(r.a), 'falha: avisa que a mensagem automática não foi enviada');
    t.ok(!/não foi enviada/i.test(r.b), 'sem falha: texto normal');
  } },
  { nome: 'WhatsAuto lembra se a mensagem ficou na fila (WhatsApp fora do ar)', rodar: async ({ t, abrir }) => {
    const p = await abrir('painel-ordens.html', { servidor: b => (b.telefone ? { ok: false, enfileirado: true, erro: 'fila' } : undefined) });
    const r = await p.evaluate(async () => { const ok = await window.WhatsAuto.enviar({ telefone: '32999990000', texto: 'oi', tipo: 'os', registroId: 'o1' }); return { ok, ultimo: window.WhatsAuto.ultimo }; });
    t.igual(r.ok, false, 'devolve false'); t.ok(r.ultimo && r.ultimo.fila === true, 'ultimo.fila = true');
  } },
  { nome: 'Pós-venda na fila (WhatsApp fora do ar) leva a marca posVenda e não sai se já foi enviado', bug: 'pós-venda enviado à mão com o número fora do ar saía depois sem marcar, e o robô mandava outro', rodar: async ({ t, ler }) => {
    const ev = ler('enviar-via.ts');
    t.ok(/tipo === "posvenda" && regId/.test(ev) && /posVenda: true/.test(ev), 'enviar-via marca o pós-venda na fila');
    t.ok(/\["vendas_pdv", "ordens_servico"\]/.test(ev), 'acha a tabela (Venda ou Pedido)');
    const md = ler('marketing-disparo.ts');
    t.ok(/mc\.posVenda/.test(md) && /pl\.posVendaEnviadoEm = agoraIso/.test(md), 'marketing-disparo grava posVendaEnviadoEm ao enviar');
    t.ok(/Pós-venda já enviado/.test(md), 'cancela se já foi enviado');
  } },
] };
