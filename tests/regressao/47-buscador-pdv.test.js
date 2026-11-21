/* 22/11 — PDV › BUSCADOR: qualquer palavra + "onde procurar" (tudo, cliente, via, histórico dentro da via, produto, tarefa, vendedora).
 * Servidor buscador-api (sessão; lojas do usuário). Tela: linhas clicáveis; cliente abre o cadastro para editar. */
const { pegar } = require('../lib/ts-func');
module.exports = { casos: [
  { nome: 'Servidor: "contendo", sem acento, texto dentro da via e trecho', bug: 'não havia busca por palavra dentro das vias', rodar: async ({ t, ler }) => {
    const f = pegar('buscador-api.ts', ['norm', 'textos', 'trechoDe']);
    t.ok(f.norm('Alíança ÓURO') === 'alianca ouro', 'ignora acento e maiúscula');
    const p = { cliente: 'MARIA', itens: [{ produto: 'ANEL SOLITÁRIO' }], observacao: 'Cliente pediu gravação com data', fotos: ['http://x/segredo'], senha: 'nao' };
    const tx = f.textos(p).join(' · ');
    t.ok(/ANEL SOLITÁRIO/.test(tx) && /gravação/.test(tx), 'junta itens e observações');
    t.ok(!/segredo/.test(tx) && !/nao/.test(tx), 'ignora fotos e campos sensíveis');
    t.ok(/gravação com data/.test(f.trechoDe(tx, ['gravacao'])), 'mostra o trecho onde achou');
    const s = ler('buscador-api.ts');
    t.ok(/termos\.every\(\(t\) => n\.includes\(t\)\)/.test(s), 'todas as palavras precisam aparecer');
    t.ok(/if \(!user\) return json\(\{ error: "não autorizado" \}, 401\)/.test(s) && /lojaOk\(tabela, p\.lojaId\)/.test(s), 'sessão e lojas do usuário');
  } },
  { nome: 'Tela: caixa BUSCADOR no PDV, resultados clicáveis', bug: 'sem buscador geral no PDV', rodar: async ({ t, ler }) => {
    const b = ler('buscador.js');
    ['tudo', 'cliente', 'via', 'historico', 'produto', 'tarefa', 'vendedora'].forEach(c => t.ok(new RegExp("\\['" + c + "'").test(b), 'opção ' + c));
    t.ok(/openClienteModalCadastro\(it\.cliente, false\)/.test(b), 'cliente abre o cadastro para editar');
    t.ok(/abrirRegistroEncontrado\(it\.viaTipo/.test(b) && /abrirConsultaPreco\(/.test(b) && /selecionarModulo\('agenda'\)/.test(b), 'via, produto e tarefa abrem no lugar certo');
    const s = ler('index.html');
    t.ok(/<script src="buscador\.js"><\/script>/.test(s) && /Buscador\.html\(\)/.test(s) && /Buscador\.ligar\(\)/.test(s), 'na barra do PDV');
  } },
] };
