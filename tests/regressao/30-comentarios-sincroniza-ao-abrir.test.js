/* 16/11 — CHAT › Comentários: a aba sincroniza sozinha ao abrir e olha 50 posts (antes: só no botão e só 15 posts,
 * então comentário em post mais antigo nunca aparecia). */
module.exports = { casos: [
  { nome: 'Comentários: busca automática ao abrir (1x a cada 10 min) e 50 posts por busca', bug: 'comentários do Instagram não apareciam: só os 15 posts mais recentes eram olhados e só ao clicar em Sincronizar', rodar: async ({ t, ler }) => {
    const s = ler('atendimento-social.js');
    t.ok(/if\(!cm\.ultSync \|\| Date\.now\(\) - cm\.ultSync > 10\*60\*1000\) sincronizar\(true\);/.test(s), 'sincroniza ao abrir a aba');
    t.ok(/limitePosts: 50/.test(s), 'pede 50 posts');
    t.ok(/auto = auto === true;/.test(s), 'o clique no botão não vira busca automática');
    const api = ler('atendimento-social.ts');
    t.ok(/Math\.min\(Math\.max\(Number\(body\.limitePosts\) \|\| 15, 1\), 50\)/.test(api), 'o servidor aceita até 50 posts');
  } },
] };
