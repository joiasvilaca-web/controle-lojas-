/* 22/11 — Felipe v4: meta = próxima faixa; dicas por módulo no balão; BEM-ESTAR com consentimento (LGPD) e perfil só para a diretoria. */
module.exports = { casos: [
  { nome: 'copiloto v4 (servidor): próxima faixa, consentimento obrigatório, equipe só diretoria', bug: 'dado sensível sem consentimento / visível a outros', rodar: async ({ t, ler }) => {
    const s = ler('copiloto.ts');
    t.ok(/const metaLoja = \(proximaF \|\| faixas\[faixas\.length - 1\]\)\.valor/.test(s), 'meta = próxima faixa');
    t.ok(/if \(!cs \|\| !cs\.aceito\) return json\(\{ ok: false, error: "sem consentimento" \}\)/.test(s), 'sem consentimento não grava');
    t.ok(/if \(b\.op === "equipe"\) \{\s*if \(nivel !== "diretoria"\) return json\(\{ error: "só a diretoria" \}, 403\)/.test(s), 'equipe só diretoria');
    t.ok(/"geral", "venda", "pedido", "orcamento", "chat", "agenda", "adm", "painel"/.test(s), 'dicas por tela');
  } },
  { nome: 'copiloto.js v4: balão por módulo, pergunta com "prefiro não dizer", pede consentimento antes', bug: 'pressão sobre a funcionária', rodar: async ({ t, ler }) => {
    const j = ler('copiloto.js'), ix = ler('index.html');
    t.ok(/Copiloto\.moduloAberto\(moduloId, subAtualDoGrupo\(moduloId\)\)/.test(ix), 'shell avisa a troca de módulo');
    t.ok(/Prefiro não dizer/.test(j) && /function pedirConsentimento/.test(j) && /consentimento === null/.test(j), 'opção de não dizer e consentimento');
    t.ok(/CVV atende de graça no 188/.test(j), 'indica apoio quando a resposta é difícil');
    t.ok(/S\.user\.nivel === 'diretoria'\) h \+= '<div class="cp-card"><h4>'\+ic\('usuarios',14\)\+'Equipe: bem-estar/.test(j), 'perfil só aparece para a diretoria');
  } },
] };
