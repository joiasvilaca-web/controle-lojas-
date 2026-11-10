/* 10/11: o botão de WhatsApp do Pedido tem que gravar o "já enviado" (visto + Já enviados) UMA vez só.
   Lição: uma correção minha chamou marcarMsgEnviadaOS duas vezes (a chamada já existia no fim da linha do envio) → log e gravação em dobro. */
module.exports = { casos: [
  { nome: 'sendWhatsApp grava msgEnviadas[status] quando o envio dá certo', bug: 'Pedido › Ações de acompanhamento vazio', rodar: async ({ t, abrir }) => {
    const p = await abrir('painel-ordens.html');
    const r = await p.evaluate(async () => {
      const gravados = []; window.gatewayCall = async b => { if (b.op === 'upsert') gravados.push(JSON.parse(JSON.stringify(b.params.row.payload))); return { ok: true }; };
      window.WhatsAuto.enviar = async () => true; window.MarketingOff = { permitir: async () => true };
      const o = { id: 'oX', codigoVia: 'MC9P', cliente: 'Teste', telefone: '32999990000', status: 'aguardando', lojaId: 'loja_mc' };
      const ok = await sendWhatsApp(o);
      return { ok, msg: o.msgEnviadas, ultimo: gravados[gravados.length - 1], logs: (o.acoesLog || []).length, gravacoes: gravados.length };
    });
    t.igual(r.ok, true, 'retorna true'); t.ok(r.msg && r.msg.aguardando, 'msgEnviadas.aguardando no objeto'); t.ok(r.ultimo && r.ultimo.msgEnviadas && r.ultimo.msgEnviadas.aguardando, 'gravado no servidor');
    t.igual(r.logs, 1, 'um único registro no histórico (sem duplicar)'); t.igual(r.gravacoes, 1, 'uma única gravação no servidor');
  } },
  { nome: 'envio que falha NÃO grava visto', rodar: async ({ t, abrir }) => {
    const p = await abrir('painel-ordens.html');
    const r = await p.evaluate(async () => {
      window.gatewayCall = async () => ({ ok: true }); window.WhatsAuto.enviar = async () => false; window.MarketingOff = { permitir: async () => true };
      const o = { id: 'oY', codigoVia: 'MC8P', cliente: 'T', telefone: '32999990000', status: 'aguardando', lojaId: 'loja_mc' };
      await sendWhatsApp(o); return o.msgEnviadas || null;
    });
    t.igual(r, null, 'não deve marcar enviado');
  } },
] };
