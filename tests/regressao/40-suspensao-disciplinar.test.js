/* 21/11 — DP › Advertências: aplicar SUSPENSÃO (só Diretoria, 1 a 30 dias, término calculado, histórico anterior); página de ciência mostra o texto da suspensão. */
module.exports = { casos: [
  { nome: 'DP: tipo Suspensão, botão Aplicar suspensão, validações e histórico', bug: 'app não tinha suspensão', rodar: async ({ t, ler }) => {
    const d = ler('dp.html');
    t.ok(/opcoes:\['Verbal','Escrita','Suspensão'\]/.test(d), 'tipo Suspensão');
    t.ok(/id="btnNovaSuspensao"/.test(d) && /currentUser\.nivel==='diretoria' \? `<button class="btn btn-ghost" id="btnNovaSuspensao"/.test(d), 'botão só para a Diretoria');
    t.ok(/dias<1 \|\| dias>30/.test(d) && /Só a Diretoria aplica suspensão/.test(d) && /Informe o início da suspensão/.test(d), 'valida 1 a 30 dias, início e nível');
    t.ok(/dados\.historicoAnterior = historicoAnteriorDe\(funcionarioId\)/.test(d), 'grava as medidas anteriores');
    t.ok(/uma notificação de suspensão disciplinar/.test(d), 'WhatsApp/e-mail com o texto de suspensão');
  } },
  { nome: 'Ciência: página e função devolvem e mostram o período da suspensão', bug: 'link mostraria "advertência suspensão"', rodar: async ({ t, ler }) => {
    const a = ler('advertencia.html');
    t.ok(/Notificação de suspensão disciplinar/.test(a) && /art\. 474 da CLT/.test(a) && /Medidas disciplinares anteriores/.test(a), 'texto da suspensão');
    const f = ler('confirmar-leitura-dp.ts');
    t.ok(/suspensaoInicio: payload\.suspensaoInicio/.test(f) && /historicoAnterior:/.test(f), 'função v7 devolve os campos');
  } },
] };
