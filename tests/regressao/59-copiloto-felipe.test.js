/* 22/11 — COPILOTO "Felipe": gerente-auxiliar no canto do app. Sem nomes/valores das colegas para vendedora; mensagem ao cliente só por clique; oficina sem copiloto. */
module.exports = { casos: [
  { nome: 'copiloto.ts: privacidade entre vendedoras e nada sai sozinho para o cliente', bug: 'ranking aberto / envio automático', rodar: async ({ t, ler }) => {
    const s = ler('copiloto.ts');
    t.ok(/if \(gestao\) out\.ranking = /.test(s) && /melhor: melhor \? \{ \.\.\.fmt\(melhor\) \} : null/.test(s), 'ranking com nomes só para gestão; melhor da loja sem nome');
    t.ok(!/fmt = \(x: any\) => x \? \{[^}]*nome/.test(s), 'fmt não leva nome');
    t.ok(!/enviar-via|marketing_fila|graph\.facebook/.test(s.replace(/^\s*\/\/.*$/gm, '')), 'função não envia mensagem (fora os comentários)');
    t.ok(/nivel === "oficina"\) return json\(\{ ok: true, desligado: true \}\)/.test(s), 'oficina sem copiloto');
    t.ok(/NÃO copie nomes, telefones/.test(s) && /MARKETING_CRON_TOKEN/.test(s), 'estudo do CHAT sem dados pessoais e só pela rotina/diretoria');
  } },
  { nome: 'copiloto.js no shell: aparece ao entrar, some ao sair; envio pelo botão', bug: 'copiloto ausente', rodar: async ({ t, ler }) => {
    const ix = ler('index.html'), j = ler('copiloto.js');
    t.ok(/<script src="copiloto\.js"><\/script>/.test(ix) && /Copiloto\.iniciar\(/.test(ix) && /Copiloto\.parar\(\)/.test(ix), 'ligado no shell');
    /* 23/11 (v6, ordem do Felipe): o Vilacinha deixou de mandar mensagem — só mostra telefone, números e roteiro para LIGAR. O teste antigo exigia o botão "Enviar" (tipo chamar_cliente); a regra agora é mais dura: nenhum envio sai daqui. */
    const semComentario = j.replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    t.ok(!/WhatsAuto\.enviar|functions\/v1\/enviar-via|chamar_cliente|marketing_fila/.test(semComentario), 'v6: o copiloto não envia mensagem ao cliente (só telefone e roteiro para ligar)');
    /* 25/11 (v7, ordem do Felipe): o limite ficou MAIS apertado — 3 por dia, 50 min entre eles (antes 6 e 12 min), e o intervalo cresce quando a pessoa ignora. */
    t.ok(/var LIM = \{ porDia:3, gapMin:50, pausaMin:180/.test(j) && /n >= porDia \|\| Date\.now\(\) - ult < gap\*60000/.test(j) && /Math\.random\(\) > 0\.5/.test(j), 'balão por módulo: às vezes, no máximo 3 por dia, 50 min entre eles');
    t.ok(/r\.sem\) return/.test(j), 'sem a função (treino): não aparece');
  } },
] };
