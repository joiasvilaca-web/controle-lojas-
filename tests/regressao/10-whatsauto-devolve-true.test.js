/* 11/11: Venda, Pedido e Orçamento tinham uma cópia antiga do WhatsAuto DENTRO da tela, carregada depois do vilaca-extras.js.
   Ela substituía a versão completa e devolvia `undefined` quando o envio dava certo → o pós-venda manual da Venda, o pós-venda
   do Pedido e o botão do WhatsApp do Pedido nunca gravavam o "já enviado" (msgEnviadas / posVendaEnviadoEm), e o botão do
   Orçamento (Quadro/detalhe) não gravava o visto. Aqui o WhatsAuto é o DE VERDADE (só o servidor é falso). */
const TELAS = ['vendas.html', 'painel-ordens.html', 'orcamentos.html'];
const BUG = 'cópia embutida do WhatsAuto devolvia undefined e escondia a do vilaca-extras.js';
module.exports = { casos: [
  { nome: 'WhatsAuto das telas é o completo (vilaca-extras.js) e devolve true quando o servidor confirma o envio', bug: BUG, rodar: async ({ t, abrir }) => {
    for (const tela of TELAS) {
      const p = await abrir(tela, { servidor: b => (b.telefone ? { ok: true, instancia: 'vila' } : undefined) });
      const r = await p.evaluate(async () => ({
        padrao: typeof (window.WhatsAuto && window.WhatsAuto.padrao),
        ok: await window.WhatsAuto.enviar({ telefone: '32999990000', texto: 'oi', lojaId: 'loja_mc', senha: 'sess_x', tipo: 'os', registroId: 'o1', via: 'MC1P' }),
      }));
      t.igual(r.padrao, 'function', tela + ': WhatsAuto completo (com padrao)');
      t.igual(r.ok, true, tela + ': devolve true quando envia');
      await p.context().close();
    }
  } },
  { nome: 'WhatsAuto devolve false quando o WhatsApp está fora do ar (nada é marcado como enviado)', rodar: async ({ t, abrir }) => {
    for (const tela of TELAS) {
      const p = await abrir(tela, { servidor: b => (b.telefone ? { ok: false, fallback: true, erro: 'fora do ar' } : undefined) });
      const ok = await p.evaluate(() => window.WhatsAuto.enviar({ telefone: '32999990000', texto: 'oi', tipo: 'os', registroId: 'o1' }));
      t.igual(ok, false, tela + ': devolve false');
      await p.context().close();
    }
  } },
  { nome: 'Cópia de reserva embutida nas telas também devolve true/false (vale se o vilaca-extras.js não carregar)', bug: BUG, rodar: async ({ t, ler }) => {
    for (const tela of TELAS) {
      const s = ler(tela);
      const i = s.indexOf("if(window.WhatsAuto && typeof window.WhatsAuto.padrao==='function') return;");
      t.ok(i > 0, tela + ': a cópia embutida não substitui a completa');
      const bloco = s.slice(i, s.indexOf('window.WhatsAuto = { enviar: enviar };', i));
      t.ok(/aviso\('Enviado pelo WhatsApp da loja ✓'\); return true;/.test(bloco), tela + ': reserva devolve true no sucesso');
    }
  } },
  { nome: 'Pedido: botão do WhatsApp e pós-venda gravam o "já enviado" com o envio de verdade', bug: BUG, rodar: async ({ t, abrir }) => {
    const p = await abrir('painel-ordens.html', { servidor: b => (b.telefone ? { ok: true, instancia: 'vila' } : undefined) });
    const r = await p.evaluate(async () => {
      const gravados = []; window.gatewayCall = async b => { if (b.op === 'upsert') gravados.push(b.params.row.payload); return { ok: true }; };
      window.MarketingOff = { permitir: async () => true };
      const o = { id: 'oZ', codigoVia: 'MC7P', cliente: 'Maria', telefone: '32999990000', status: 'pronto', lojaId: 'loja_mc' };
      const ok1 = await sendWhatsApp(o);
      const e = { id: 'oW', codigoVia: 'MC6P', cliente: 'Joana', telefone: '32999990000', status: 'entregue', lojaId: 'loja_mc' };
      const ok2 = await window.__enviarPosVendaOS(e);
      return { ok1, ok2, pronto: !!(o.msgEnviadas && o.msgEnviadas.pronto), pv: !!e.posVendaEnviadoEm, pvMsg: !!(e.msgEnviadas && e.msgEnviadas.posvenda), gravou: gravados.length };
    });
    t.igual(r.ok1, true, 'sendWhatsApp devolve true'); t.ok(r.pronto, 'msgEnviadas.pronto gravado');
    t.igual(r.ok2, true, 'pós-venda devolve true'); t.ok(r.pv && r.pvMsg, 'pós-venda marcado (posVendaEnviadoEm + msgEnviadas.posvenda)');
    t.ok(r.gravou >= 2, 'gravado no servidor');
  } },
  { nome: 'Venda: pós-venda enviado à mão grava posVendaEnviadoEm', bug: BUG, rodar: async ({ t, abrir }) => {
    const p = await abrir('vendas.html', { servidor: b => (b.telefone ? { ok: true, instancia: 'vila' } : undefined) });
    const r = await p.evaluate(async () => {
      const salvos = []; window.vendaSalvar = async v => { salvos.push(v.id); return true; };
      window.MarketingOff = { permitir: async () => true };
      vendas.push({ id: 'vPV', codigoVia: 'JN9V', cliente: 'Joao', telefone: '32999990000', lojaId: 'loja_jn', data: '2026-11-01' });
      await enviarPosVenda('vPV');
      const v = vendas.find(x => x.id === 'vPV');
      return { em: !!v.posVendaEnviadoEm, salvos };
    });
    t.ok(r.em, 'posVendaEnviadoEm gravado'); t.ok(r.salvos.includes('vPV'), 'venda salva');
  } },
  { nome: 'Orçamento: botão do WhatsApp (Quadro) grava o visto do status atual', bug: 'botão do WhatsApp do Orçamento não marcava msgEnviadas', rodar: async ({ t, abrir }) => {
    const p = await abrir('orcamentos.html', { servidor: b => (b.telefone ? { ok: true, instancia: 'vila' } : undefined) });
    const r = await p.evaluate(async () => {
      const salvos = []; window.orcamentoSalvar = async o => { salvos.push(o.id); return true; };
      window.MarketingOff = { permitir: async () => true };
      orcamentos.push({ id: 'qW', codigoVia: 'MC9O', cliente: 'Carlos', telefone: '32999990000', status: 'pendente', lojaId: 'loja_mc', itens: [] });
      await enviarWhatsAppOrcId('qW');
      const o = orcamentos.find(x => x.id === 'qW');
      return { visto: !!(o.msgEnviadas && o.msgEnviadas.pendente), salvos };
    });
    t.ok(r.visto, 'msgEnviadas[status atual] gravado'); t.ok(r.salvos.includes('qW'), 'orçamento salvo');
  } },
] };
