/* 12/11: só dispara sozinho: Venda ao salvar, Pedido ao salvar (APROVADO), pós-venda e Orçamento (todos os status).
   Os demais status do Pedido (PRONTO etc.) só saem pelo botão. A Venda nova com telefone manda a via ao salvar. */
module.exports = { casos: [
  { nome: 'Venda nova com telefone manda a via sozinha ao salvar (e a edição não)', bug: 'Venda não disparava ao salvar', rodar: async ({ t, ler }) => {
    const s = ler('vendas.html');
    t.ok(/async function enviarViaWhatsApp\(v, auto\)/.test(s), 'envio aceita modo automático');
    const i = s.indexOf("showToast('Venda lançada com sucesso.');");
    t.ok(i > 0, 'ponto de salvar venda nova existe');
    const trecho = s.slice(i, i + 400);
    t.ok(/enviarViaWhatsApp\(venda, true\)/.test(trecho), 'chama o envio automático logo após lançar');
    t.ok(/MarketingOff\.permitir/.test(s.slice(s.indexOf('async function enviarViaWhatsApp'), s.indexOf('async function enviarViaWhatsApp') + 600)), 'respeita MARKETING OFF');
  } },
  { nome: 'Pedido: aviso de PRONTO não sai sozinho (robô só com pedidoAcoes.prontoAuto=true)', bug: 'robô mandava PRONTO automático', rodar: async ({ t, ler }) => {
    const s = ler('acompanhamento-auto.ts');
    // a cópia do repositório pode estar atrás da produção; se tiver o bloco, ele precisa estar travado
    const i = s.indexOf('o.status === "pronto"');
    if (i > 0) t.ok(/o\.status === "pronto" && \(?po\.prontoAuto === true/.test(s) && /\(po\.prontoAuto === true \|\| prontoSaldo\)/.test(s), 'os_pronto só com prontoAuto=true ou (22/11, pedido do Felipe) pagamento em aberto');
    else t.ok(true, 'bloco os_pronto ausente na cópia local');
  } },
  { nome: 'REGRA FIXA 16/11: mudar o status do Pedido nunca envia mensagem (só ação humana no botão)', bug: 'status do pedido disparando WhatsApp sem ninguém clicar', rodar: async ({ t, ler }) => {
    const s = ler('painel-ordens.html');
    const corpo = (nome) => { const i = s.indexOf(nome); let d = 0; for (let j = s.indexOf('{', i); j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (d === 0) return s.slice(i, j + 1); } } return ''; };
    for (const f of ['async function trocarStatusOrdem(', 'function sincronizarLocalPorStatus(']) {
      const c = corpo(f); t.ok(c.length > 50, 'achou ' + f);
      t.ok(!/sendWhatsApp\(|WhatsAuto\.|enviar-via|sendEmail\(/.test(c), f + ' não envia nada');
    }
    // sendWhatsApp só é chamado: ao salvar o pedido (APROVADO) e em cliques (botões/ícones)
    const usos = s.split('\n').filter((l) => /sendWhatsApp\(/.test(l) && !/async function sendWhatsApp/.test(l));
    const humano = (l) => /addEventListener\('click'/.test(l) || /onEnviar:/.test(l);
    const salvar = (l) => /sendWhatsApp\(novaOrdem\)/.test(l);
    t.ok(usos.length > 0 && usos.every((l) => humano(l) || salvar(l)), 'todo envio do Pedido é clique de pessoa ou o salvar do pedido: ' + usos.filter((l) => !(humano(l) || salvar(l))).map((l) => l.trim().slice(0, 80)).join(' | '));
    t.ok(usos.filter(salvar).length === 1, 'um único envio automático no Pedido: ao salvar (APROVADO)');
    // Oficina (insumos-api) muda status e não fala com cliente
    const api = ler('insumos-api.ts');
    t.ok(!/enviar-via|sendText|evolution/i.test(api), 'a Oficina muda status sem enviar mensagem');
    // regra escrita no AGENTS.md
    const ag = ler('AGENTS.md');
    t.ok(/REGRA FIXA DO DISPARO/.test(ag) && /Todo o resto só sai com AÇÃO HUMANA/.test(ag), 'regra registrada no AGENTS.md');
  } },
] };
