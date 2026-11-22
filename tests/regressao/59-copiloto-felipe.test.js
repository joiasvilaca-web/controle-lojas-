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
    t.ok(/tipo:'chamar_cliente'/.test(j) && /data-x="enviar"/.test(j) && /MarketingOff\.permitir/.test(j), 'envio só pelo botão, respeitando MARKETING OFF');
    t.ok(/n >= 4 \|\| Date\.now\(\) - ult < 75\*60000/.test(j), 'balão no máximo 4x por dia');
    t.ok(/r\.sem\) return/.test(j), 'sem a função (treino): não aparece');
  } },
] };
