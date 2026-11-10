/* Tira funções/constantes de um arquivo .ts de Edge Function (Deno) e roda no Node, sem Deno nem banco.
 * pegar('arquivo.ts', ['nomeFuncao', 'CONSTANTE', ...], { admin: mock }) → { nomeFuncao, CONSTANTE, ... }
 * Só serve para funções de nível de arquivo ("function x(" / "async function x(" / "const X = ..." numa linha ou até a linha "}" / "};" no começo). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');
const RAIZ = path.join(__dirname, '..', '..');
function trecho(src, nome) {
  const linhas = src.split('\n');
  const re = new RegExp('^(?:export\\s+)?(?:async\\s+)?(?:function\\s+' + nome + '\\s*\\(|(?:const|let)\\s+' + nome + '\\b)');
  const i = linhas.findIndex((l) => re.test(l));
  if (i < 0) throw new Error('não achei ' + nome);
  const l0 = linhas[i];
  // uma linha só (const X = ...;)
  if (/^(?:const|let)\s/.test(l0) && /;\s*(\/\/.*)?$/.test(l0) && !/[{[(]\s*$/.test(l0)) return l0;
  let j = i + 1;
  while (j < linhas.length && !/^[}\]]\)?;?\s*$/.test(linhas[j])) j++;
  return linhas.slice(i, j + 1).join('\n');
}
function pegar(arquivo, nomes, extras) {
  const src = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
  const codigo = nomes.map((n) => trecho(src, n)).join('\n');
  let js = stripTypeScriptTypes(codigo);
  js = js.replace(/^const /gm, 'var ').replace(/^let /gm, 'var ');
  const ctx = vm.createContext(Object.assign({ console, Date, Math, Intl, JSON, String, Number, Object, Array, Set, Map, RegExp, Promise }, extras || {}));
  vm.runInContext(js, ctx, { filename: arquivo });
  const out = {}; nomes.forEach((n) => { out[n] = ctx[n]; });
  return out;
}
module.exports = { pegar };
