#!/usr/bin/env node
/* Roda TODOS os testes de regressão:  node tests/run.js [filtro]
 * Pré-requisito (só para testar, não para o app): Playwright instalado (npm i -g playwright && playwright install chromium). */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { abrir, ler } = require('./lib/harness');
(async () => {
  const filtro = process.argv[2] || '';
  const dir = path.join(__dirname, 'regressao');
  const arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.test.js') && f.includes(filtro)).sort();
  const browser = await chromium.launch();
  let falhas = 0, total = 0;
  for (const f of arquivos) {
    const mod = require(path.join(dir, f));
    for (const caso of mod.casos) {
      total++;
      const erros = [];
      const t = { ok: (c, m) => { if (!c) erros.push(m || 'condição falsa'); }, igual: (a, b, m) => { if (a !== b) erros.push((m || 'valores diferentes') + ` (obtido: ${JSON.stringify(a)} · esperado: ${JSON.stringify(b)})`); } };
      try { await caso.rodar({ browser, t, abrir: (...a) => abrir(browser, ...a), ler }); }
      catch (e) { erros.push('exceção: ' + (e && e.message || e)); }
      if (erros.length) { falhas++; console.log(`✗ ${f} › ${caso.nome}\n   ${caso.bug ? '(bug: ' + caso.bug + ')\n   ' : ''}${erros.join('\n   ')}`); }
      else console.log(`✓ ${f} › ${caso.nome}`);
    }
  }
  await browser.close();
  console.log(`\n${total - falhas}/${total} passaram${falhas ? ' — ' + falhas + ' FALHARAM' : ''}`);
  process.exit(falhas ? 1 : 0);
})();
