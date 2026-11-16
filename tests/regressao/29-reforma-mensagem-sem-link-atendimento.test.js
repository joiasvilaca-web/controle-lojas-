/* 16/11 — Instância da Reforma (reformajoias): a mensagem da via sai sem "Para falar com a gente… wa.me" e sem "Responda com 👍".
 * O número de disparo / oficial continua com os dois. */
const { pegar } = require('../lib/ts-func');
module.exports = { casos: [
  { nome: 'Reforma: mensagem da via só com saudação, atendimento e link da via', bug: 'mensagem da Reforma levava o link do atendimento da Vilaça e o pedido do 👍', rodar: async ({ t, ler }) => {
    const f = pegar('enviar-via.ts', ['LINHA_JOINHA', 'WA_ATENDIMENTO', 'mensagemPadrao', 'ajustaTextoDisparo', 'limpaTextoReforma', 'waMePrimeiro']);
    const base = f.mensagemPadrao({ cliente: 'MARIANA SILVA', atendente: 'LARYSSA', link: 'https://vilaca.app/via.html?t=venda&id=venda_x' }, 'Reforma Joias');
    const reforma = f.waMePrimeiro(f.limpaTextoReforma(base));
    t.ok(reforma === 'Olá, Mariana!\n\nAtendimento: Laryssa · Reforma Joias.\n\nTodas as informações da sua via podem ser visualizadas pelo link:\nhttps://vilaca.app/via.html?t=venda&id=venda_x', 'texto exato: ' + JSON.stringify(reforma));
    t.ok(f.limpaTextoReforma('Oi!\n\nCaso precise falar conosco, clique no link:\nhttps://wa.me/5532988307617\n\nResponda com 👍 para confirmar que recebeu.') === 'Oi!', 'texto antigo das configurações também fica limpo');
    const disparo = f.ajustaTextoDisparo(base);
    t.ok(/wa\.me\/5532988307617/.test(disparo) && /Responda com 👍/.test(disparo), 'número de disparo/oficial continua com o link e o 👍');
    const s = ler('enviar-via.ts');
    t.ok(/else if \(instancia === INSTANCIA_POR_LOJA\.loja_rj\) texto = limpaTextoReforma\(texto\);/.test(s), 'aplicado só na instância da Reforma');
  } },
] };
