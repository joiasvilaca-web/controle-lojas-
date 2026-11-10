# Testes de regressão

Rodar tudo (antes de publicar): `node tests/run.js` — ou só um grupo: `node tests/run.js 04`.
Precisa só de Node + Playwright instalados **na máquina de quem testa** (`npm i -g playwright && playwright install chromium`). O app continua sem npm/bundler; esta pasta não vai para o ar (`.vercelignore`).

## Regra (ordem do Felipe, 10/11)
1. **Todo bug corrigido ganha um teste** em `tests/regressao/NN-assunto.test.js` — o teste tem que FALHAR com o bug e PASSAR com a correção (prove desfazendo a correção por um instante).
2. **Os testes ficam para sempre**: nunca apagar nem enfraquecer um teste para "ficar verde". Se a regra de negócio mudou de verdade, ajuste o teste e escreva o motivo no comentário.
3. Rode `node tests/run.js` antes de cada publicação; teste vermelho = não publica.

## Como escrever
```js
module.exports = { casos: [
  { nome: 'o que deve acontecer', bug: 'o que acontecia de errado', rodar: async ({ t, abrir, ler }) => {
    const p = await abrir('painel-ordens.html', { w: 360, h: 800, ls: { vilaca_modo_os: 'lista' } }); // tela já dentro do app, com servidor falso
    t.igual(await p.evaluate(() => viaTxt({ codigoVia: 'JN4P' })), 'JN4P');
    t.ok(ler('cupom.js').includes('VIA '), 'teste de contrato (lê o código-fonte)');
  } },
] };
```
- `abrir(arquivo, {w,h,entrar,ls})` abre a tela com login e dados falsos (`tests/lib/harness.js`); `ls` pré-grava localStorage.
- Testes de tela cobrem o que roda no navegador; regras de Edge Function (Deno) entram como **teste de contrato** (`ler(...)`), pois não rodam aqui.

## Cobertura atual
01 sintaxe de todas as telas · 02 via só com código oficial · 03 visto de WhatsApp do Pedido (uma vez só) · 04 responsivo (320–768 px) · 05 Quadro por status como padrão · 06 seção Ações de acompanhamento · 07 contratos (janela 08:30–19:00, config-chave, vendedora, retirada, PAINEL).
