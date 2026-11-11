/* 10/11 — Número de disparo (vilaca): resposta automática, texto das mensagens, fila única (≥ 5 min) e fila quando o WhatsApp cai.
 * As funções rodam de verdade (tiradas dos .ts das Edge Functions por tests/lib/ts-func.js). */
const { pegar } = require('../lib/ts-func');
const ARQS_TEXTO = ['acompanhamento-auto.ts', 'marketing-disparo.ts', 'enviar-via.ts'];
const NOMES_TEXTO = ['WA_ATENDIMENTO', 'LINHA_JOINHA', 'ajustaTextoDisparo'];
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
  // 11/11: a regra mudou a pedido do dono (o cliente compra nas duas lojas): a resposta depende só do que o CLIENTE mandou, sem menu de lojas
  // e sem vendedora. O caso antigo ("loja do último disparo + vendedora") foi substituído por estes, não enfraquecido.
  { nome: 'Resposta automática: "reforma"/"RJ" no texto ou legenda → Instagram da Reforma; resto → WhatsApp da Vilaça (sem menu)', rodar: async ({ t }) => {
    const f = pegar('disparo-webhook.ts', ['semAcento', 'textoDoCliente', 'falaDeReforma', 'TEXTO_VILACA', 'TEXTO_REFORMA']);
    for (const x of ['Minha reforma ficou pronta?', 'REFORMA JOIAS', 'vi no @reformajoias', 'comprei na RJ', 'RJ', 'rj!', 'Quero reformar meu anel'])
      t.ok(f.falaDeReforma(x), 'Reforma: ' + x);
    for (const x of ['Quero saber da minha aliança', 'Jardim Norte', 'Oi, tudo bem?', 'nrj', 'rjx', ''])
      t.ok(!f.falaDeReforma(x), 'Vilaça: ' + x);
    t.igual(f.textoDoCliente({ imageMessage: { caption: 'peça da RJ' } }), 'peça da RJ', 'legenda da foto');
    t.igual(f.textoDoCliente({ extendedTextMessage: { text: 'oi' } }), 'oi', 'texto longo');
    t.ok(/https:\/\/wa\.me\/5532988307617$/.test(f.TEXTO_VILACA) && /Vamos conversar/.test(f.TEXTO_VILACA), 'Vilaça: link sozinho no fim (botão Iniciar conversa)');
    t.ok(/instagram\.com\/reformajoias/.test(f.TEXTO_REFORMA) && /Vamos conversar por lá\?/.test(f.TEXTO_REFORMA), 'Reforma: Instagram');
    for (const x of [f.TEXTO_VILACA, f.TEXTO_REFORMA]) t.ok(!/SAIR|LOJA MARECHAL|JOÃO BERALDO|JARDIM NORTE/i.test(x), 'sem SAIR e sem menu de lojas');
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'disparo-webhook.ts'), 'utf8');
    t.ok(!/disparo_envios/.test(src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')), 'não decide pelo histórico de disparos');
  } },
  { nome: 'Resposta automática: FOTO com a logo REFORMA JOIAS/RJ (IA) → Reforma; foto sem logo ou erro → Vilaça', rodar: async ({ t }) => {
    let chamadas = 0;
    function mk(respostaIA, falhar) {
      return pegar('disparo-webhook.ts', ['semAcento', 'textoDoCliente', 'falaDeReforma', 'fotoDaReforma', 'assuntoDaMensagem'], {
        Deno: { env: { get: (k) => (k === 'GEMINI_API_KEY' ? 'x' : undefined) } },
        AbortSignal: { timeout: () => undefined }, encodeURIComponent,
        fetch: async (url) => {
          chamadas++;
          if (falhar) throw new Error('rede');
          if (/getBase64FromMediaMessage/.test(url)) return { ok: true, json: async () => ({ base64: 'A'.repeat(500), mimetype: 'image/jpeg' }) };
          return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: respostaIA }] } }] }) };
        },
      });
    }
    const seg = { EVOLUTION_URL: 'https://evo', EVOLUTION_API_KEY: 'k' };
    const foto = { key: { id: '1' }, message: { imageMessage: { mimetype: 'image/jpeg' } } };
    t.igual(await mk('SIM').assuntoDaMensagem(seg, 'vila', foto, foto.message), 'reforma', 'logo na foto');
    t.igual(await mk('NAO').assuntoDaMensagem(seg, 'vila', foto, foto.message), 'vilaca', 'foto sem logo');
    t.igual(await mk('SIM', true).assuntoDaMensagem(seg, 'vila', foto, foto.message), 'vilaca', 'erro na IA = Vilaça');
    chamadas = 0;
    const comLegenda = { key: {}, message: { imageMessage: { caption: 'reforma' } } };
    t.igual(await mk('NAO').assuntoDaMensagem(seg, 'vila', comLegenda, comLegenda.message), 'reforma', 'legenda decide sem IA');
    t.igual(chamadas, 0, 'não chama a IA quando o texto já diz');
    t.igual(await mk('SIM').assuntoDaMensagem(seg, 'vila', { key: {}, message: { conversation: 'oi' } }, { conversation: 'oi' }), 'vilaca', 'texto comum');
  } },
  { nome: 'SAIR: sai da lista em silêncio; nenhuma mensagem fala em SAIR; pós-venda sem pedido de avaliação', bug: 'mandava "responda SAIR", confirmação do SAIR e link de avaliação no pós-venda', rodar: async ({ t }) => {
    const fs = require('fs'), path = require('path'), ler = (a) => fs.readFileSync(path.join(__dirname, '..', '..', a), 'utf8');
    const wh = ler('disparo-webhook.ts');
    const blocoSair = wh.slice(wh.indexOf('PALAVRAS_SAIR.includes(txt)'), wh.indexOf('soReacao(d, m)) continue'));
    t.ok(/sairDaLista\(numero\)/.test(blocoSair), 'SAIR continua tirando da lista');
    t.ok(!/sendText/.test(blocoSair), 'SAIR não recebe mensagem');
    for (const arq of ['acompanhamento-auto.ts', 'marketing-disparo.ts']) {
      const src = ler(arq);
      t.ok(!/RODAPE_SAIR/.test(src), arq + ': sem rodapé SAIR');
    }
    for (const arq of ARQS_TEXTO) {
      const { ajustaTextoDisparo } = pegar(arq, NOMES_TEXTO);
      t.ok(!/SAIR/.test(ajustaTextoDisparo('Oi!\n\nPara não receber mais mensagens, responda SAIR.')), arq + ': tira o aviso SAIR antigo');
    }
    const a = pegar('acompanhamento-auto.ts', ['WA_ATENDIMENTO', 'RODAPE', 'MSG_POSVENDA_PADRAO', 'MSG_OS_POSVENDA']);
    t.ok(!/\{avaliacao\}/.test(a.MSG_POSVENDA_PADRAO) && !/\{avaliacao\}/.test(a.MSG_OS_POSVENDA), 'textos padrão sem avaliação');
    const aa = ler('acompanhamento-auto.ts');
    t.ok(!/googleReviewUrl/.test(aa), 'servidor não põe o link do Google no pós-venda');
    t.ok(!/googleReviewUrl/.test(ler('vendas.html').slice(ler('vendas.html').indexOf('function preencherMsgPv'), ler('vendas.html').indexOf('function preencherMsgPv') + 1500)), 'Venda: sem link de avaliação');
    const po = ler('painel-ordens.html'), i = po.indexOf('function enviarPosVendaOS');
    t.ok(i > 0 && !/googleReviewUrl/.test(po.slice(i, i + 2500)), 'Pedido: sem link de avaliação');
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
