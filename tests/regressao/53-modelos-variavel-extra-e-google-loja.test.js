/* 22/11 — Pós-venda e aniversário levam o texto configurado ({{2}}) e o botão "Avaliar no Google" abre o Google da LOJA,
 * sem quebrar enquanto a Meta analisa: o envio manda só as variáveis do modelo ATIVO e o botão variável só quando o ativo tem (botao_dinamico). */
const { pegar } = require('../lib/ts-func');
const ANIV = 'Feliz aniversário {cliente}!\n\nParabéns!\n\nÉ um prazer ter você como cliente da Vilaça Joias.\n\nAtenciosamente,\n\nEquipe Vilaça Joias\n\nNão responda essa mensagem, caso precise falar conosco basta clicar no link: https://wa.me/5532988307617\n\nwww.instagram.com.br/vilacajoias';
module.exports = { casos: [
  { nome: 'disparo-cloud: {{2}} e botão da loja; aniversário limpo', bug: 'textos configurados e Google por loja não chegavam', rodar: async ({ t, ler }) => {
    const f = pegar('disparo-cloud.ts', ['limpa', 'bonito', 'miolo', 'modelo'], { NL: '\n', LOJAS: {}, REVIEW: { loja_jb: 'CbH2C8XfIePKEBM/review', loja_mc: 'CROryIy-tHyXEBM/review' } });
    const pv = f.modelo({ tipo: 'posVenda', loja_id: 'loja_jb', texto: 'Olá, Maria! 💛\n\nQueremos agradecer pela sua nova joia.\n\nCaso precise falar conosco, clique no link:\nhttps://wa.me/5532988307617', cliente_nome: 'MARIA' }, true);
    t.ok(pv.chave === 'posvenda' && pv.params[1] === 'Queremos agradecer pela sua nova joia.' && pv.botao === 'CbH2C8XfIePKEBM/review', 'pós-venda: ' + JSON.stringify(pv));
    const an = f.modelo({ tipo: 'aniversario', texto: ANIV.replace('{cliente}', 'Maria'), cliente_nome: 'MARIA' }, true);
    t.ok(an.chave === 'aniversario' && an.params[1] === 'Parabéns! É um prazer ter você como cliente da Vilaça Joias.', 'aniversário: ' + an.params[1]);
    const s = ler('disparo-cloud.ts');
    t.ok(/ativo && ativo\.nVars \? p\.params\.slice\(0, ativo\.nVars\)/.test(s), 'só as variáveis do modelo ativo');
    t.ok(/ativo && ativo\.botao && p\.botao \? \[\{ type: "button", sub_type: "url", index: "0"/.test(s), 'botão variável só se o ativo tiver');
  } },
  { nome: 'acompanhamento-auto e modelos-api acompanham', bug: 'robô do pós-venda e envio do modelo à Meta', rodar: async ({ t, ler }) => {
    const a = ler('acompanhamento-auto.ts');
    t.ok(/at\.nVars \? params\.slice\(0, at\.nVars\)/.test(a) && /botao: reviewDe\(String\(reg\.lojaId \|\| ""\)\)/.test(a), 'robô: variáveis do ativo e Google da loja');
    const m = ler('modelos-api.ts');
    t.ok(/example: \[String\(b\.example \|\| b\.url\)/.test(m) && /rascunho_botao_dinamico: botaoDinamico/.test(m) && /upd\.botao_dinamico = !!m\.rascunho_botao_dinamico/.test(m), 'botão variável com exemplo e ativação só na aprovação');
    const w = ler('modelos-whatsapp.html');
    t.ok(/const SUGESTOES = \{"orcamento"/.test(w) && /data-sugestao=/.test(w), 'tela tem os textos sugeridos');
    const sql = ler('sql/meta-modelos-variaveis.sql');
    t.ok(/bkp_20261122_meta_modelos/.test(sql) && /https:\/\/g\.page\/r\/\{\{1\}\}/.test(sql), 'cópia + botão variável');
  } },
] };
