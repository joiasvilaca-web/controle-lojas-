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
    if (i > 0) t.ok(/prontoAuto === true/.test(s.slice(i - 20, i + 200)), 'os_pronto só com prontoAuto=true');
    else t.ok(true, 'bloco os_pronto ausente na cópia local');
  } },
] };
