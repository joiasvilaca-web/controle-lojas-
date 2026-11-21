/* 22/11 — OFICINA › Movimentos: editar lançamento em qualquer status da via, com MOTIVO obrigatório; nada é apagado (estorna + lança o corrigido). */
const { pegar } = require('../lib/ts-func');
module.exports = { casos: [
  { nome: 'Servidor: op editar com motivo, sem apagar, e a Oficina pode', bug: 'Oficina não conseguia corrigir lançamento de via em outro status', rodar: async ({ t, ler }) => {
    const s = ler('insumos-api.ts');
    t.ok(/if \(op === "editar"\)/.test(s), 'op editar');
    t.ok(/motivo\.replace\(\/\\s\+\/g, ""\)\.length < 5/.test(s), 'motivo obrigatório (5 letras)');
    t.ok(/tipo: "ESTORNO"[\s\S]{0,200}obs: "Edição: " \+ motivo/.test(s) && /editadoDe: x\.id, motivoEdicao: motivo/.test(s), 'estorna o original e lança o corrigido com o motivo');
    t.ok(/m\.tipo === "PECA_ENTRADA" \|\| m\.tipo === "PECA_SAIDA"\) return json\(\{ error: "Peso de peça se corrige no item/.test(s), 'peso de peça não se edita aqui');
    t.ok(!/op === "editar"[\s\S]{0,3000}status/.test(s.slice(s.indexOf('if (op === "editar")'), s.indexOf('/* ---------- VIAS (O.S.)'))) , 'não olha o status da via');
    const f = pegar('insumos-api.ts', ['permissoes'], { ABAS: ['vias', 'saldos', 'movimentos', 'cadastro', 'baixaVia'] });
    const of = f.permissoes({ nivel: 'oficina' }); t.ok(of.editarMov === true && of.oficina === true && of.movimentos === false, 'Oficina edita mesmo sem a aba Movimentos');
    t.ok(/npm:@supabase\/supabase-js@2\.119\.0/.test(s), 'supabase-js fixado');
  } },
  { nome: 'Tela: botão Editar e janela com motivo obrigatório', bug: 'sem edição na aba Movimentos', rodar: async ({ t, ler }) => {
    const h = ler('insumos.html');
    t.ok(/data-edmov=/.test(h) && /function editarMovimento\(m\)/.test(h), 'botão e janela');
    t.ok(/Motivo da alteração <span[^>]*>\(obrigatório\)/.test(h) && /api\('editar', \{ id:Number\(m\.id\), quantidade, obs, motivo \}\)/.test(h), 'manda o motivo para o servidor');
  } },
] };
