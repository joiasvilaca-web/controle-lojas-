/* 22/11 — a prévia "Mensagens" mostra o orçamento no MESMO modelo que o servidor usa (disparo-cloud v12 / acompanhamento-auto v25):
 * pronto/aprovado/encerrado nos modelos próprios de Utilidade (quando aprovados), lembretes no orc_lembrete; sem modelo próprio, o genérico. */
const fs = require('fs'), path = require('path'), vm = require('vm');
function montar(modelos, config){
  const el = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null, addEventListener(){} };
  const doc = { getElementById: () => null, createElement: () => ({ style:{}, setAttribute(){}, appendChild(){} }), head: { appendChild(){} }, querySelector: () => null };
  const win = vm.createContext({ APP_URL: 'https://vilaca.app', document: doc, console }); win.window = win;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'previa-cliente.js'), 'utf8'), win);
  try { win.PreviaCliente.montar(el, { modelos, config }); } catch (e) { if (!el.innerHTML) throw e; }
  return el.innerHTML;
}
const M = (chave, nome, corpo, status, extra) => Object.assign({ chave, nome_template: nome, corpo, status: status || 'APPROVED', extras: [{ type:'FOOTER', text:'Vilaça Joias' }] }, extra || {});
const cfg = { lojas: [{ id:'loja_jb', nome:'JOÃO BERALDO', nomePublico:'VILAÇA HALFELD' }],
  statusOrcamento: [{ id:'pendente', nome:'Aberto', inicial:true, mensagemWhatsapp:'Olá {cliente} {link}' }, { id:'fix', nome:'Fixação', mensagemWhatsapp:'Lembrete {link}' }, { id:'aprovado', nome:'Aprovado', encerra:true, mensagemWhatsapp:'Ok {link}' }],
  orcamentoAcoes: { passos: [{ id:'a', dias:0, statusId:'pendente' }, { id:'b', dias:3, statusId:'fix' }, { id:'c', dias:0, statusId:'aprovado' }] } };
const generico = M('orcamento', 'orcamento_acompanhamento_v5', 'G {{1}} {{2}} {{3}} {{4}}');
module.exports = { casos: [
  { nome: 'Orçamento usa o modelo da situação, igual ao servidor', bug: 'prévia mostrava sempre o modelo genérico de orçamento', rodar: async ({ t }) => {
    const btn = { type:'BUTTONS', buttons:[{ type:'URL', text:'Ver orçamento', url:'https://vilaca.app/via.html?t=orc&id={{1}}' }] };
    const h = montar([generico, M('via','via_v5','V {{1}}'),
      M('orc_pronto','orcamento_pronto_v2','PRONTO {{1}} nº {{2}} {{3}}', 'APPROVED', { botao_dinamico:true, extras:[{ type:'FOOTER', text:'Vilaça Joias' }, btn] }),
      M('orc_aprovado','orcamento_aprovado_v2','APROVADO {{1}} nº {{2}} {{3}}', 'APPROVED', { botao_dinamico:true }),
      M('orc_lembrete','orcamento_acompanhamento_v4','LEMBRETE {{1}} {{2}} {{3}} {{4}}')], cfg);
    t.ok(/PRONTO Maria nº JB25O VILAÇA HALFELD/.test(h), 'Aberto → orc_pronto (Utilidade)');
    t.ok(/Ver orçamento/.test(h), 'botão Ver orçamento do modelo próprio');
    t.ok(/APROVADO Maria/.test(h), 'Aprovado → orc_aprovado');
    t.ok(/LEMBRETE Maria VILAÇA HALFELD Seu orçamento continua/.test(h), 'lembrete → orc_lembrete (Marketing)');
    t.ok(!/SUGESTÃO — novo modelo de orçamento/.test(h), 'sem a sugestão antiga quando o modelo de Utilidade já está aprovado');
  } },
  { nome: 'Sem modelo próprio aprovado cai no genérico', bug: 'prévia diferente do envio real', rodar: async ({ t }) => {
    const h = montar([generico, M('orc_pronto','orcamento_pronto_v2','PRONTO {{1}}', 'PENDING')], cfg);
    t.ok(!/PRONTO Maria/.test(h) && /G Maria VILAÇA HALFELD Seu orçamento está pronto/.test(h), 'pronto em análise → genérico');
  } },
] };
