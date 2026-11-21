/* 22/11 — Modelos WhatsApp › "Mensagens (ver e editar)": todas as mensagens ao cliente num só lugar, com edição dos textos
 * (status do orçamento, pós-venda, aniversário) gravando só a chave (config-chave). Aniversário com o cartão (cartao-aniversario.html) no botão. */
const { pegar } = require('../lib/ts-func');
module.exports = { casos: [
  { nome: 'Tela: editar e salvar só a chave do texto', bug: 'mensagens espalhadas em várias telas', rodar: async ({ t, ler }) => {
    const w = ler('modelos-whatsapp.html');
    t.ok(/Mensagens \(ver e editar\)/.test(w) && /salvar: salvarTextoMensagem/.test(w), 'aba e gravação');
    t.ok(/const cfg = await lerConfig\(\)/.test(w) && /functions\/v1\/config-chave/.test(w), 'lê a config de novo e grava só a chave');
    t.ok(/key = 'mensagens'; value = Object\.assign\(\{\}, cfg\.mensagens/.test(w) && /key = 'posVendaAuto'/.test(w) && /key = 'statusOrcamento'/.test(w), 'aniversário, pós-venda e status');
    const p = ler('previa-cliente.js');
    t.ok(/data-salvar=/.test(p) && /e\.gerar\(t\.value\)/.test(p), 'prévia muda ao digitar');
    const c = ler('config-chave.ts');
    t.ok(/"pedidoAcoes", "mensagens"\]\)/.test(c), 'config-chave aceita mensagens');
  } },
  { nome: 'Cartão de aniversário: nome do link, sem dados; botão no modelo', bug: 'sem cartão para o aniversariante', rodar: async ({ t, ler }) => {
    const h = ler('cartao-aniversario.html');
    t.ok(/get\("n"\)/.test(h) && /replace\(\/\[\^A-Za-zÀ-ÖØ-öø-ÿ' \\-\]\/g, ""\)/.test(h), 'nome vem do link e é limpo');
    t.ok(!/supabase|functions\/v1/i.test(h), 'página não lê nem grava nada');
    t.ok(/prefers-reduced-motion/.test(h), 'respeita reduzir movimento');
    const f = pegar('disparo-cloud.ts', ['limpa', 'bonito', 'miolo', 'modelo'], { NL: '\n', LOJAS: {}, REVIEW: {} });
    const an = f.modelo({ tipo: 'aniversario', texto: 'Feliz aniversário Maria!\n\nParabéns!', cliente_nome: 'MARIA SILVA' }, true);
    t.ok(an.botao === 'Maria', 'botão do cartão leva o primeiro nome: ' + an.botao);
    t.ok(/cartao-aniversario\.html\?n=\{\{1\}\}/.test(ler('sql/meta-modelos-variaveis.sql')), 'modelo com o botão Abrir meu cartão');
  } },
] };
