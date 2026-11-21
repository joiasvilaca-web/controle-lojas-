/* 22/11 — Envio pela API oficial (disparo-cloud v8 / acompanhamento-auto v22):
 * pedido DISPONÍVEL PARA RETIRADA usa o modelo pedido_pronto; aniversário individual usa o modelo de aniversário (antes falhava);
 * reserva/retirada com vendedora e nome público da loja (antes "nossa equipe"/"VILAÇA JOIAS"); nome com 1ª maiúscula; Reforma sem o wa.me da Vilaça. */
const { pegar } = require('../lib/ts-func');
module.exports = { casos: [
  { nome: 'disparo-cloud: modelo certo para cada caso', bug: 'pronto genérico, aniversário individual falhando, reserva sem vendedora/loja', rodar: async ({ t }) => {
    const f = pegar('disparo-cloud.ts', ['limpa', 'bonito', 'miolo', 'modelo'], { NL: '\n', LOJAS: { loja_jb: 'VILAÇA - UNIDADE HALFELD' } });
    const link = 'https://vilaca.app/acompanhar.html?id=o1';
    const pronto = f.modelo({ tipo: 'via', registro_tabela: 'os', __statusOs: 'pronto', texto: 'Olá, Maria!\n\nAtendimento: Paty Souza · VILAÇA - UNIDADE HALFELD.\n\nTodas as informações da sua via podem ser visualizadas pelo link:\n' + link, cliente_nome: 'MARIA SILVA' }, true);
    t.ok(pronto && pronto.chave === 'pedido_pronto' && pronto.params[3] === link, 'pedido pronto → pedido_pronto');
    const naFab = f.modelo({ tipo: 'via', registro_tabela: 'os', __statusOs: 'em_producao', texto: 'Olá, Maria!\n\nAtendimento: Paty Souza · LOJA.\n\nTodas as informações:\n' + link }, true);
    t.ok(naFab && naFab.chave === 'via', 'outros status → modelo da via');
    const aniv = f.modelo({ tipo: 'via', registro_tabela: 'aniversario', texto: 'Feliz aniversário Maria!', cliente_nome: 'MARIA SILVA' }, true);
    t.ok(aniv && aniv.chave === 'aniversario' && aniv.params[0] === 'Maria', 'aniversário individual → modelo de aniversário');
    const res = f.modelo({ tipo: 'via', registro_tabela: 'reserva', loja_id: 'loja_jb', vendedora: 'PATY SOUZA LIMA', texto: 'Olá, MARIA! Sua reserva… https://vilaca.app/via.html?t=res&id=r1', cliente_nome: 'MARIA' }, true);
    t.ok(res && res.params[0] === 'Maria' && res.params[1] === 'Paty Souza' && res.params[2] === 'VILAÇA - UNIDADE HALFELD', 'reserva: Maria / Paty Souza / loja pública — ' + JSON.stringify(res && res.params));
  } },
  { nome: 'acompanhamento-auto: Reforma sem o wa.me da Vilaça', bug: 'Reforma recebia o link de atendimento da Vilaça no topo', rodar: async ({ t, ler }) => {
    const { limpaTextoReforma } = pegar('acompanhamento-auto.ts', ['limpaTextoReforma']);
    const out = limpaTextoReforma('Olá, Maria! Aqui é Ana, da Reforma Joias.\n\nVeja o orçamento:\nhttps://vilaca.app/via.html?t=orc&id=1\n\nClique no link: https://wa.me/5532988307617\n\nResponda com 👍 para confirmar que recebeu.');
    t.ok(!/wa\.me/.test(out) && !/👍/.test(out) && /via\.html/.test(out), 'tira wa.me e 👍, mantém o link da via');
    const s = ler('acompanhamento-auto.ts');
    t.ok((s.match(/: limpaTextoReforma\(/g) || []).length === 2, 'usado nos dois envios pelo chip da Reforma');
  } },
  { nome: 'Telas mandam cliente e vendedora ao enviar-via', bug: '"Olá, cliente!" e "nossa equipe"', rodar: async ({ t, ler }) => {
    t.ok(/cliente:opts\.cliente\|\|'', vendedora:opts\.vendedora\|\|''/.test(ler('vilaca-extras.js')), 'WhatsAuto repassa');
    t.ok(/tipo:'reserva'/.test(ler('vendas.html')) && /cliente:r\.cliente\|\|'', vendedora:r\.vendedora\|\|''/.test(ler('vendas.html')), 'reserva');
    t.ok(/cliente:o\.cliente\|\|'', vendedora:o\.vendedora\|\|'', senha:o\.senha, tipo:'retirada'/.test(ler('retirada-terceiro.js')), 'retirada');
  } },
] };
