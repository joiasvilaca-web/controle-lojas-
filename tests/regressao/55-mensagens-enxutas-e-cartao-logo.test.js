/* 22/11 — Mensagens enxutas (custo menor): orçamento pela API oficial leva só uma frase curta ({{3}}) e os detalhes ficam no link;
 * textos sugeridos pedem a categoria Utilidade; cartão de aniversário com a logo original e sem "Falar com a Vilaça". */
const { pegar } = require('../lib/ts-func');
const CFG = { statusOrcamento: [{ id: 'pendente', inicial: true }, { id: 'cutucado' }, { id: 'recusado', encerra: true }, { id: 'aprovado', encerra: true }] };
module.exports = { casos: [
  { nome: 'Frase curta do orçamento igual nas duas funções', bug: 'texto de venda longo no modelo (Marketing, mais caro)', rodar: async ({ t }) => {
    for (const arq of ['disparo-cloud.ts', 'acompanhamento-auto.ts']) {
      const { fraseOrc } = pegar(arq, ['fraseOrc']);
      t.ok(fraseOrc(CFG, 'pendente') === 'Seu orçamento está pronto.' && fraseOrc(CFG, 'cutucado') === 'Seu orçamento continua disponível para você.', arq + ': aberto/seguinte');
      t.ok(/o que podemos melhorar/.test(fraseOrc(CFG, 'recusado')) && fraseOrc(CFG, 'x') === 'Seu orçamento foi atualizado.', arq + ': encerrado e desconhecido');
    }
    const f = pegar('disparo-cloud.ts', ['limpa', 'bonito', 'miolo', 'fraseOrc', 'chaveOrc', 'modelo'], { NL: '\n', LOJAS: { loja_jb: 'VILAÇA - UNIDADE HALFELD' }, REVIEW: {}, CFG, MAPA: {} });   // 22/11 (v12): modelo() usa chaveOrc e MAPA
    const o = f.modelo({ tipo: 'via', registro_tabela: 'orc_acao', loja_id: 'loja_jb', marcar: { chave: 'pendente' }, texto: 'Olá, Maria! Aqui é Paty, da X. Valor R$ 890 https://vilaca.app/via.html?t=orc&id=1', cliente_nome: 'MARIA' }, true);
    t.ok(o.params[2] === 'Seu orçamento está pronto.' && o.params[1] === 'VILAÇA - UNIDADE HALFELD' && /via\.html/.test(o.params[3]), 'orçamento: ' + JSON.stringify(o.params));
  } },
  { nome: 'Sugestões pedem Utilidade; modelos-api aceita a categoria', bug: 'categoria herdada Marketing', rodar: async ({ t, ler }) => {
    const w = ler('modelos-whatsapp.html');
    t.ok(/const SUG_CAT = \{ orcamento:'UTILITY', posvenda:'UTILITY', aniversario:'MARKETING' \}/.test(w) && /op:'salvar_rascunho', chave, corpo, categoria/.test(w), 'tela manda a categoria do texto sugerido');
    t.ok(/\["UTILITY", "MARKETING"\]\.includes\(String\(body\.categoria/.test(ler('modelos-api.ts')), 'servidor usa a categoria pedida');
  } },
  { nome: 'Cartão: logo original e sem o botão Falar com a Vilaça', bug: 'pedido do Felipe', rodar: async ({ t, ler }) => {
    const h = ler('cartao-aniversario.html');
    t.ok(/src="logo-vilaca-original\.svg"/.test(h) && !/wa\.me/.test(h) && !/Falar com a Vila/.test(h), 'logo original, sem WhatsApp');
    const svg = ler('logo-vilaca-original.svg');
    t.ok(/<svg[^>]*viewBox=/.test(svg) && (svg.match(/<path/g) || []).length >= 5 && /currentColor/.test(svg), 'logo vetorial (cor ajustável)');
  } },
] };
