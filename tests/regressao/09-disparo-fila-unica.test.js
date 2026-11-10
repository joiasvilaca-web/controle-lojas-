/* 10/11 — Número de disparo (vilaca): resposta automática, texto das mensagens, fila única (≥ 5 min) e fila quando o WhatsApp cai.
 * As funções rodam de verdade (tiradas dos .ts das Edge Functions por tests/lib/ts-func.js). */
const { pegar } = require('../lib/ts-func');
const ARQS_TEXTO = ['acompanhamento-auto.ts', 'marketing-disparo.ts', 'enviar-via.ts'];
const NOMES_TEXTO = ['WA_ATENDIMENTO', 'LINHA_JOINHA', 'ajustaTextoDisparo'];
function mockAdmin(linha) {   // admin.from().select().eq().gte().order().limit() → { data:[linha] }
  const q = { select: () => q, eq: () => q, gte: () => q, order: () => q, limit: async () => ({ data: linha ? [linha] : [] }) };
  return { from: () => q };
}
module.exports = { casos: [
  { nome: 'Resposta automática NÃO responde curtida, figurinha, aviso do sistema, 👍 e "ok/obrigada"', bug: 'respondia até reação (curtida) com o texto de atendimento', rodar: async ({ t }) => {
    const { soReacao } = pegar('disparo-webhook.ts', ['semAcento', 'TIPOS_SILENCIO', 'PALAVRAS_OK', 'soReacao']);
    t.ok(soReacao({ messageType: 'reactionMessage' }, { reactionMessage: { text: '👍' } }), 'reação');
    t.ok(soReacao({ messageType: 'stickerMessage' }, { stickerMessage: {} }), 'figurinha');
    t.ok(soReacao({ messageType: 'protocolMessage' }, { protocolMessage: {} }), 'aviso do sistema');
    t.ok(soReacao({}, {}), 'mensagem vazia');
    t.ok(soReacao({}, { conversation: '👍' }), '👍 escrito');
    t.ok(soReacao({}, { conversation: '🙏❤️' }), 'só emoji');
    t.ok(soReacao({}, { conversation: 'Ok' }), 'ok');
    t.ok(soReacao({}, { extendedTextMessage: { text: 'Obrigada!' } }), 'obrigada');
    t.ok(!soReacao({}, { conversation: 'Quero saber se minha aliança ficou pronta' }), 'texto de verdade responde');
    t.ok(!soReacao({ messageType: 'audioMessage' }, { audioMessage: {} }), 'áudio responde');
    t.ok(!soReacao({ messageType: 'imageMessage' }, { imageMessage: {} }), 'foto responde');
  } },
  { nome: 'Resposta automática: loja do último disparo + vendedora; sem loja (aniversário/marketing) mostra as 3', rodar: async ({ t }) => {
    const nomes = ['LOJAS_MENU', 'bonito', 'textoResposta'];
    const comLoja = pegar('disparo-webhook.ts', nomes, { admin: mockAdmin({ loja_id: 'loja_jb', vendedora: 'ANA PAULA SILVA', tipo: 'os' }) });
    const a = await comLoja.textoResposta('5532999998888');
    t.ok(/wa\.me\/5532988307617/.test(a), 'link do atendimento');
    t.ok(a.includes('2 - LOJA JOÃO BERALDO') && !a.includes('1 - LOJA MARECHAL') && !a.includes('3 - LOJA JARDIM'), 'só a loja do disparo');
    t.ok(a.includes('Ana Paula'), 'vendedora do disparo');
    const semLoja = pegar('disparo-webhook.ts', nomes, { admin: mockAdmin({ loja_id: null, vendedora: null, tipo: 'aniversario' }) });
    const b = await semLoja.textoResposta('5532999998888');
    t.ok(b.includes('1 - LOJA MARECHAL CENTER') && b.includes('2 - LOJA JOÃO BERALDO') && b.includes('3 - LOJA JARDIM NORTE'), 'as 3 lojas');
    const rj = pegar('disparo-webhook.ts', nomes, { admin: mockAdmin({ loja_id: 'loja_rj', vendedora: 'X', tipo: 'os' }) });
    const c = await rj.textoResposta('5532999998888');
    t.ok(c.includes('1 - LOJA MARECHAL CENTER') && c.includes('3 - LOJA JARDIM NORTE') && !/Reforma|Ecommerce/i.test(c), 'Reforma/Ecommerce fora: mostra as 3');
    const nada = pegar('disparo-webhook.ts', nomes, { admin: mockAdmin(null) });
    t.ok((await nada.textoResposta('5532999998888')).includes('3 - LOJA JARDIM NORTE'), 'sem registro: as 3');
  } },
  { nome: 'Texto do número de disparo: sem "Não responda", com o link e o pedido do 👍 (nas 3 funções)', rodar: async ({ t }) => {
    for (const arq of ARQS_TEXTO) {
      const { ajustaTextoDisparo } = pegar(arq, NOMES_TEXTO);
      const antigo = 'Olá!\n\nNão responda esta mensagem. Caso precise falar conosco, clique no link:\nhttps://wa.me/5532988307617';
      const x = ajustaTextoDisparo(antigo);
      t.ok(!/n[ãa]o responda/i.test(x), arq + ': tirou "Não responda"');
      t.ok(/Para falar com a gente, é só clicar no link:\nhttps:\/\/wa\.me\/5532988307617/.test(x), arq + ': link');
      t.igual((x.match(/Responda com 👍/g) || []).length, 1, arq + ': 👍 uma vez');
      t.igual(ajustaTextoDisparo(x), x, arq + ': não repete ao passar de novo');
      const semLink = ajustaTextoDisparo('Feliz aniversário!');
      t.ok(/wa\.me\/5532988307617/.test(semLink) && /👍/.test(semLink), arq + ': texto sem link ganha link e 👍');
    }
    const ev = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'enviar-via.ts'), 'utf8');
    const corpo = ev.slice(ev.indexOf('function mensagemPadrao'), ev.indexOf('const WA_ATENDIMENTO'));
    t.ok(!/Não responda/.test(corpo) && /LINHA_JOINHA/.test(corpo), 'mensagem padrão da via');
  } },
  { nome: 'Fila única: nunca menos de 5 min entre mensagens; poucas = espalhadas; muitas = 5–7 min', rodar: async ({ t }) => {
    const a = pegar('acompanhamento-auto.ts', ['agoraBR', 'hhmm', 'MIN_INI', 'distribuir', 'gapSeg']);
    const jan = { de: 0, ate: 10 * 3600e3 };
    for (let k = 0; k < 30; k++) {
      const p = a.distribuir(6, jan);
      t.igual(p.cabem, 6, 'poucas cabem todas');
      for (let i = 1; i < p.horas.length; i++) t.ok(p.horas[i] - p.horas[i - 1] >= 5 * 60000, 'poucas: ≥ 5 min');
      t.ok(p.horas[p.horas.length - 1] > 7 * 3600e3, 'poucas: espalhadas até o fim do dia');
      const m = a.distribuir(300, jan);
      t.ok(m.cabem <= 120 && m.cabem >= 85, 'muitas: o que não cabe fica para o dia seguinte (' + m.cabem + ')');
      for (let i = 1; i < m.horas.length; i++) { const g = m.horas[i] - m.horas[i - 1]; t.ok(g >= 5 * 60000 && g <= 7 * 60000 + 1, 'muitas: 5–7 min'); }
    }
    for (const arq of ['acompanhamento-auto.ts', 'marketing-disparo.ts']) {
      const nomes = arq === 'marketing-disparo.ts' ? ['agoraBR', 'HORA_INI', 'hhmm', 'gapSeg'] : ['agoraBR', 'hhmm', 'MIN_INI', 'gapSeg'];
      const g = pegar(arq, nomes);
      for (const r of [0, 1, 5, 50, 500]) for (let k = 0; k < 20; k++) t.ok(g.gapSeg(r) >= 300, arq + ': gap ≥ 300 s');
    }
  } },
  { nome: 'Janelas: Venda/Pedido/Orçamento e Marketing das 9h às 20h (19h–20h de reserva)', bug: 'janela era 08:30–19:00 (cards) e 9h–18h (Marketing)', rodar: async ({ t, ler }) => {
    const a = ler('acompanhamento-auto.ts');
    t.ok(/MIN_INI = 9 \* 60, MIN_FIM = 19 \* 60, MIN_FIM_ENVIO = 20 \* 60/.test(a), 'constantes cards');
    t.ok(/agora\.min >= MIN_INI && agora\.min < MIN_FIM_ENVIO/.test(a), 'checagem do horário cards');
    t.ok(/HORA_INI = 9, HORA_FIM = 20, MIN_FIM_PLANO = 19 \* 60/.test(ler('marketing-disparo.ts')), 'constantes Marketing');
  } },
  { nome: 'Vez única no banco: 5 min; cards na frente; envio feito por pessoa empurra o automático', rodar: async ({ t, ler }) => {
    const sql = ler('sql/disparo-fila-unica.sql');
    t.ok(/function disparo_vez/.test(sql) && /interval '5 minutes'/.test(sql) && /greatest\(p_gap_seg, 300\)/.test(sql), 'disparo_vez');
    t.ok(/p_cards or cards_devidos = 0/.test(sql), 'Marketing espera cards vencidos');
    t.ok(/function disparo_manual/.test(sql), 'disparo_manual');
    t.ok(/rpc\("disparo_vez"/.test(ler('acompanhamento-auto.ts')) && /rpc\("disparo_vez"/.test(ler('marketing-disparo.ts')), 'as duas filas pegam a vez');
    t.ok(/rpc\("disparo_manual"\)/.test(ler('enviar-via.ts')), 'botão da via empurra o automático');
  } },
  { nome: 'WhatsApp de disparo fora do ar: envio feito por pessoa entra na fila (não se perde)', bug: 'a via só dava erro e não era enviada depois', rodar: async ({ t, ler }) => {
    const s = ler('enviar-via.ts');
    const bloco = s.slice(s.indexOf('if (estado !== "open") {'), s.indexOf('const r = await fetch(`${seg.EVOLUTION_URL}/message/sendText'));
    t.ok(/tipo: "via"/.test(bloco) && /from\("marketing_fila"\)/.test(bloco) && /enfileirado: true/.test(bloco), 'enfileira tipo via');
    const m = ler('marketing-disparo.ts');
    t.ok(/p\.tipo === "via"/.test(m) && /const ordem: any\[\] = \[\.\.\.vias\]/.test(m), 'Marketing manda as vias primeiro');
    t.ok(/acao: "via_whatsapp_enviada"/.test(m), 'marca o ✓ da via ao enviar pela fila');
  } },
  { nome: 'Aniversário automático todo dia e com aquecimento', rodar: async ({ t, ler }) => {
    const m = ler('marketing-disparo.ts');
    t.ok(/async function aniversarioAutomatico/.test(m) && /est\.aniv_dia !== hoje\.dia/.test(m), 'entra sozinho 1x por dia');
    t.ok(/TIPOS_LIMITE = \["aniversario", "posVenda", "campanha"\]/.test(m), 'aniversário conta no aquecimento');
    t.ok(/Aniversário já está na fila de hoje/.test(m), 'não duplica no mesmo dia');
    const h = ler('marketing.html'); t.ok(/desenharAcompAniversario/.test(h) && /acompanhamento-ui\.js/.test(h), 'seção Ações de acompanhamento no Marketing');
  } },
  { nome: 'Número de disparo trocável: instância vem de DISPARO_INSTANCIA (padrão "vilaca"), sem texto fixo nas funções', bug: 'o nome da instância estava fixo no código; trocar de número exigia redeploy', rodar: async ({ t, ler }) => {
    const mock = (valor) => ({ from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: valor == null ? null : { valor } }) }; return q; } });
    for (const arq of ['acompanhamento-auto.ts', 'enviar-via.ts']) {
      t.igual(await pegar(arq, ['cacheInst', 'instanciaDisparo'], { admin: mock('vila') }).instanciaDisparo(), 'vila', arq + ': usa o segredo');
      t.igual(await pegar(arq, ['cacheInst', 'instanciaDisparo'], { admin: mock(null) }).instanciaDisparo(), 'vilaca', arq + ': sem segredo = vilaca');
      t.igual(await pegar(arq, ['cacheInst', 'instanciaDisparo'], { admin: mock('  ') }).instanciaDisparo(), 'vilaca', arq + ': segredo vazio = vilaca');
    }
    const a = ler('acompanhamento-auto.ts'); t.ok(!/inst === "vilaca"|=== "vilaca"/.test(a), 'acompanhamento-auto sem comparação fixa com "vilaca"');
    t.ok(/INSTANCIA = String\(seg\.DISPARO_INSTANCIA/.test(ler('marketing-disparo.ts')), 'marketing-disparo usa o segredo');
    t.ok(/INSTANCIA_PADRAO = await instanciaDisparo\(\)/.test(ler('enviar-via.ts')), 'enviar-via usa o segredo');
    t.ok(/seg\.DISPARO_INSTANCIA/.test(ler('qr-instancia.ts')), 'qr-instancia usa o segredo');
  } },
] };
