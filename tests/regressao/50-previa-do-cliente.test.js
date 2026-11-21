/* 22/11 — Modelos WhatsApp › "O que o cliente recebe": prévia de TODAS as mensagens ao cliente (modelo ativo + variáveis pela regra do servidor)
 * e do card/página do link (?demo=). Chamar cliente e Recado passam a mandar o nome (antes saía "Olá, cliente!"). */
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = { casos: [
  { nome: 'Montagem igual à do servidor (miolo e variáveis)', bug: 'não dava para ver o que o cliente recebe', rodar: async ({ t }) => {
    const win = {}; vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'previa-cliente.js'), 'utf8'), vm.createContext({ window: win, document: {} }));
    const P = win.PreviaCliente;
    t.ok(P._miolo('Olá, Maria! 😊\n\nAqui é Paty, da LOJA. Seu orçamento está pronto!\n\nVeja:\nhttps://vilaca.app/x\n\nClique no link: https://wa.me/55') === 'Atendimento: Paty. Seu orçamento está pronto! Veja:', 'regra de 22/11: tira saudação, emoji e links; loja não repete');
    t.ok(P._preencherModelo('Olá, {{1}}! {{2}}', ['Maria', '']) === 'Olá, Maria! …', 'preenche variáveis');
  } },
  { nome: 'Tela e páginas de exemplo', bug: 'sem prévia do card do link', rodar: async ({ t, ler }) => {
    const m = ler('modelos-whatsapp.html');
    t.ok(/data-aba="previa"/.test(m) && /PreviaCliente\.montar\(box, \{ modelos, config: cfg \}\)/.test(m), 'aba O que o cliente recebe');
    const v = ler('via.html'), a = ler('acompanhar.html');
    t.ok(/const demo = p\.get\("demo"\);/.test(v) && /Página de EXEMPLO/.test(v), 'via.html tem página de exemplo');
    t.ok(/new URLSearchParams\(location\.search\)\.get\("demo"\)/.test(a) && /Página de EXEMPLO/.test(a), 'acompanhar.html tem página de exemplo');
  } },
  { nome: 'Chamar cliente e Recado mandam o nome do cliente', bug: 'mensagem saía "Olá, cliente!"', rodar: async ({ t, ler }) => {
    t.ok(/cliente:escolhido\.nome\|\|'', texto: txt \+ rodapeChamarShell\(\)/.test(ler('index.html')), 'Chamar cliente (PDV)');
    t.ok(/cliente:escolhido\.nome\|\|'', texto: txt \+ rodapeChamar\(\)/.test(ler('marketing.html')), 'Chamar cliente (Marketing)');
    t.ok(/telefone:order\.telefone, cliente:order\.cliente\|\|''/.test(ler('recado-cliente.js')), 'Recado de pendência');
  } },
] };
