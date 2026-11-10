/* Bug de 23/09 e 24/09: edição que quebra o JavaScript de uma tela inteira (colagem errada, função que não fecha). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { RAIZ } = require('../lib/harness');
const htmls = fs.readdirSync(RAIZ).filter(f => f.endsWith('.html'));
const jss = fs.readdirSync(RAIZ).filter(f => f.endsWith('.js'));
module.exports = { casos: [
  { nome: 'JavaScript embutido de todas as telas (.html) tem sintaxe válida', bug: 'edição quebrava a tela inteira', rodar: async ({ t }) => {
    for (const f of htmls) {
      const src = fs.readFileSync(path.join(RAIZ, f), 'utf8');
      const blocos = [...src.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type=["']?(?:application\/ld\+json|text\/template))[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
      blocos.forEach((b, i) => { try { new vm.Script(b, { filename: f + '#' + i }); } catch (e) { t.ok(false, f + ' bloco ' + i + ': ' + e.message); } });
    }
  } },
  { nome: 'Arquivos .js do app têm sintaxe válida', rodar: async ({ t }) => {
    for (const f of jss) { try { new vm.Script(fs.readFileSync(path.join(RAIZ, f), 'utf8'), { filename: f }); } catch (e) { t.ok(false, f + ': ' + e.message); } }
  } },
] };
