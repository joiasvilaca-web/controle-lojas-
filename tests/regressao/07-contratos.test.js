/* Contratos de código: regras que já deram bug e que um teste de tela não pegaria facilmente. */
module.exports = { casos: [
  { nome: 'Envio automático: janela diária 08:30–19:00', bug: 'janela era 9h–18h fixa', rodar: async ({ t, ler }) => {
    const s = ler('acompanhamento-auto.ts');
    t.ok(/MIN_INI = 8 \* 60 \+ 30, MIN_FIM = 19 \* 60/.test(s), 'constantes'); t.ok(/agora\.min >= MIN_INI && agora\.min < MIN_FIM/.test(s), 'checagem do horário');
  } },
  { nome: 'Salvar pós-venda/ações automáticas passa pela função config-chave', bug: 'gateway só aceitava 2 chaves ("chave não permitida")', rodar: async ({ t, ler }) => {
    const chaves = ['posVendaAuto', 'orcamentoAcoes', 'orcamentoAutoMsgConfig', 'statusOrcamento', 'pedidoAcoes'];
    const f = ler('config-chave.ts'); chaves.forEach(k => t.ok(f.includes('"' + k + '"'), 'config-chave.ts sem ' + k));
    for (const arq of ['vendas.html', 'orcamentos.html']) { const s = ler(arq); t.ok(/functions\/v1\/config-chave/.test(s), arq + ' não desvia para config-chave'); chaves.forEach(k => t.ok(s.includes("'" + k + "'"), arq + ' sem ' + k)); }
  } },
  { nome: 'Vendedora/gerente podem escolher a vendedora (campo não é só leitura)', bug: 'campo travado no login', rodar: async ({ t, ler }) => {
    t.ok(/<select id="f_vendedora">/.test(ler('painel-ordens.html')), 'Pedido: select'); t.ok(!/id="f_vendedora" value=[^>]*readonly/.test(ler('painel-ordens.html')), 'Pedido: sem readonly');
    t.ok(/<select id="v_vendedora">/.test(ler('vendas.html')), 'Venda: select'); t.ok(!/id="v_vendedora" value=[^>]*readonly/.test(ler('vendas.html')), 'Venda: sem readonly');
  } },
  { nome: 'Retirada por terceiro: a tela rola até os dados ao abrir/trocar/gerar', rodar: async ({ t, ler }) => {
    const s = ler('retirada-publica.js'); t.ok(/function rolarPara/.test(s), 'função'); t.ok((s.match(/rolarPara\(/g) || []).length >= 4, 'usada em abrir, trocar e gerar');
  } },
  { nome: 'PAINEL: vias com pendência têm "Ver via" e a falha em vermelho', rodar: async ({ t, ler }) => {
    const d = ler('dashboard.html'); t.ok(/data-verviaaviso/.test(d) && /Ver via/.test(d), 'Dashboard › Ver via'); t.ok(/color:var\(--danger/.test(d), 'Dashboard › falha em vermelho');
    const a = ler('avisos.html'); t.ok(/Vias em pendência/.test(a) && /verVia:\s*true/.test(a) && /sub falha/.test(a), 'Avisos › Vias em pendência');
  } },
  { nome: 'Rede de segurança de overflow existe (tema.js + tema.css)', rodar: async ({ t, ler }) => {
    t.ok(/position='relative'/.test(ler('tema.js')), 'tema.js põe position:relative nos contêineres que rolam'); t.ok(/overflow-x:clip/.test(ler('tema.css')), 'tema.css overflow-x:clip');
  } },
] };
