/* 18/11 — Orçamento recusado/vencido: o cliente conta o que podemos melhorar (link do orçamento); fica em orcamentos.payload.melhoria;
 * a equipe vê no card Orçamento e responde; a resposta aparece para o cliente ao reabrir o link. */
const { pegar } = require('../lib/ts-func');
module.exports = { casos: [
  { nome: 'Servidor: só orçamento recusado/vencido pergunta; uma resposta por orçamento; resposta da loja volta ao cliente', bug: 'cliente que não fechou não tinha como contar o motivo', rodar: async ({ t }) => {
    const f = pegar('retirada-terceiro.ts', ['melhoriaAberta', 'melhoriaInfo']);
    t.ok(f.melhoriaAberta('orc', { status: 'recusado' }) && f.melhoriaAberta('orc', { status: 'vencido' }), 'recusado e vencido perguntam');
    t.ok(!f.melhoriaAberta('orc', { status: 'pendente' }) && !f.melhoriaAberta('orc', { status: 'aprovado' }) && !f.melhoriaAberta('venda', { status: 'recusado' }), 'aberto, aprovado e outras vias não perguntam');
    t.ok(f.melhoriaInfo('orc', { status: 'recusado' }).disponivel === true, 'recusado sem resposta: disponível');
    const feita = f.melhoriaInfo('orc', { status: 'recusado', melhoria: { texto: 'caro', em: 'x', resposta: { texto: 'obrigado', em: 'y', por: 'ANA' } } });
    t.ok(feita.disponivel === false && feita.feita === true && feita.resposta.texto === 'obrigado' && feita.resposta.por === undefined, 'já respondeu: some o formulário, aparece a resposta da loja (sem expor quem escreveu)');
  } },
  { nome: 'Telas: link do orçamento mostra o formulário; equipe vê, responde e é avisada; mensagem do Recusado leva o convite', bug: 'retorno do cliente sem lugar para ver nem responder', rodar: async ({ t, ler }) => {
    const v = ler('via.html'); t.ok(/melhoria-via\.js/.test(v) && /id="melhoriaBox"/.test(v) && /MelhoriaVia\.montar/.test(v), 'via.html monta o formulário');
    const m = ler('melhoria-via.js'); t.ok(/acao:'melhoria'/.test(m) && /Escolha um motivo ou escreva um pouquinho/.test(m) && /Resposta da Vilaça/.test(m), 'formulário, validação e resposta da loja');
    const o = ler('orcamentos.html');
    t.ok(/function melhoriaBlocoHtml\(o\)/.test(o) && /\$\{melhoriaBlocoHtml\(o\)\}/.test(o) && /btnResponderMelhoria/.test(o), 'bloco no detalhe do orçamento, com Responder');
    t.ok((o.match(/melhoriaBadgeHtml\(o\)/g) || []).length >= 4, 'selo na Lista e no Quadro');
    t.ok(/id="btnRetornosClientes"/.test(o) && /function abrirRetornosClientes\(\)/.test(o), 'aviso no topo e lista dos retornos');
    t.ok(/acao: ?'melhoriaResponder'|'melhoriaResponder'/.test(o) && /'melhoriaLida'/.test(o), 'resposta e leitura vão para o servidor');
    const api = ler('retirada-terceiro.ts'); t.ok(/orc_melhoria_gravar/.test(api) && /\["melhoriaResponder", "melhoriaLida"\]/.test(api), 'gravação atômica pela função SQL');
    const sql = ler('sql/orcamento-melhoria.sql'); t.ok(/revoke all on function public\.orc_melhoria_gravar/.test(sql) && /grant execute on function public\.orc_melhoria_gravar\(text, jsonb, boolean\) to service_role/.test(sql), 'só service_role executa');
  } },
] };
