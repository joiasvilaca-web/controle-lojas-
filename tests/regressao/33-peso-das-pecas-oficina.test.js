/* 18/11 — PESO DAS PEÇAS: peso de entrada soma ao saldo de metal da Oficina, peso de saída abate; o metal vem do produto;
 * pesos são opcionais; o lançamento é sempre a DIFERENÇA entre o que a via pede e o que já foi lançado (não duplica ao salvar de novo). */
const { pegar } = require('../lib/ts-func');
module.exports = { casos: [
  { nome: 'Servidor: metal pelo produto, entrada/saída só com a via na Oficina, e lançamento só da diferença', bug: 'peso lançado em dobro ao salvar de novo, ou contando antes de enviar para a fábrica', rodar: async ({ t }) => {
    const f = pegar('insumos-api.ts', ['num', 'STATUS_PESO', 'PESO_METAL_PADRAO', 'r4', 'pesoNum', 'metalDoItem', 'alvoPesos', 'deltaPesos']);
    t.ok(f.metalDoItem({ produto: '1 SERVIÇO OURO SOLDA ANEL' }) === 'ouro' && f.metalDoItem({ produto: '8 ANEL F2,84 PRATA 925' }) === 'prata', 'metal pelo nome');
    t.ok(f.metalDoItem({ produto: '9 RELOGIO CASIO ANADIGI COURO' }) === '', 'COURO não é ouro');
    t.ok(f.metalDoItem({ produto: 'QUALQUER', pesoMetal: 'prata' }) === 'prata', 'o metal gravado pela tela vale');
    const mapa = f.PESO_METAL_PADRAO;
    const itens = [{ produto: '1 SERVIÇO OURO SOLDA ANEL', pesoEntrada: 5.2, pesoSaida: '5,0' }, { produto: '1 SERVIÇO OURO POLIMENTO', pesoEntrada: 3 }, { produto: '1 SERVIÇO PRATA SOLDA', pesoEntrada: 10, pesoSaida: 9.5 }, { produto: '1 SERVIÇO CRAVAÇÃO', pesoEntrada: 2 }, { produto: 'SEM PESO' }];
    const na = f.alvoPesos({ status: 'enviado_fabrica', itens }, mapa);
    t.ok(na.alvo.ins_ouro750.ent === 8.2 && na.alvo.ins_ouro750.sai === 5 && na.alvo.ins_prata925.ent === 10 && na.alvo.ins_prata925.sai === 9.5, 'soma por metal: ' + JSON.stringify(na.alvo));
    t.ok(na.semMetal.length === 1 && /CRAVA/.test(na.semMetal[0]), 'item sem metal fica de fora e é avisado');
    for (const st of ['rascunho', 'aguardando', 'cancelado']) { const x = f.alvoPesos({ status: st, itens }, mapa); t.ok(x.alvo.ins_ouro750.ent === 0 && x.alvo.ins_ouro750.sai === 0, st + ': nada no saldo'); }
    t.ok(Object.keys(f.alvoPesos({ status: 'pronto', itens: [{ produto: 'ANEL OURO' }] }, mapa).alvo).length === 0, 'peso não é obrigatório');
    // primeira vez: lança entrada +8,2 e saída −5
    const quer = { 'ins_ouro750|loja_mc|PECA_ENTRADA': 8.2, 'ins_ouro750|loja_mc|PECA_SAIDA': -5 };
    const d1 = f.deltaPesos({}, quer);
    t.ok(d1.length === 2 && d1.find((x) => x.tipo === 'PECA_ENTRADA').q === 8.2 && d1.find((x) => x.tipo === 'PECA_SAIDA').q === -5, 'entrada soma, saída abate');
    t.ok(f.deltaPesos(quer, quer).length === 0, 'salvar de novo sem mudar não lança nada');
    const d2 = f.deltaPesos(quer, { 'ins_ouro750|loja_mc|PECA_ENTRADA': 8, 'ins_ouro750|loja_mc|PECA_SAIDA': -5 });
    t.ok(d2.length === 1 && d2[0].tipo === 'PECA_ENTRADA' && d2[0].q === -0.2, 'corrigiu o peso: lança só a diferença');
    const d3 = f.deltaPesos(quer, {});
    t.ok(d3.length === 2 && Math.abs(d3.reduce((a, x) => a + x.q, 0) + 3.2) < 1e-9, 'cancelou/apagou a via: desfaz tudo');
  } },
  { nome: 'Telas: Pedido tem peso de entrada e saída por item (opcionais); a baixa da Oficina abre os itens com o peso de saída', bug: 'sem onde informar o peso', rodar: async ({ t, ler }) => {
    const p = ler('painel-ordens.html');
    t.ok(/data-itfield="pesoEntrada"/.test(p) && /data-itfield="pesoSaida"/.test(p) && /placeholder="opcional"/.test(p), 'campos no item do Pedido');
    t.ok(/pesoEntrada:it\.pesoEntrada, pesoSaida:it\.pesoSaida, pesoMetal:it\.pesoMetal/.test(p), 'editar o pedido mantém os pesos');
    t.ok(/for\(const id of comPeso\) await sincronizarPesoOficina\(id\)/.test(p) && /op:'pesoVia'/.test(p), 'salvar o pedido acerta o saldo da Oficina');
    t.ok(!/Informe o peso|peso.*obrigat/i.test(p), 'peso não é obrigatório');
    const o = ler('insumos.html');
    t.ok(/function pesosItensHtml\(v\)/.test(o) && /\$\{pesosItensHtml\(v\)\}/.test(o) && /status:'oficina_pronto', avisarLoja:false, pesos/.test(o), 'baixa da Oficina manda o peso de saída de cada item');
    t.ok(/pesoParse/.test(o) && /aceita 3,25 e 3\.25/.test(o), 'aceita vírgula e ponto');
    const api = ler('insumos-api.ts');
    t.ok(/if \(op === "pesoVia"\)/.test(api) && /Array\.isArray\(p\.pesos\)/.test(api) && /Peso de peça não se estorna aqui/.test(api), 'ops do servidor');
    t.ok(/'PECA_ENTRADA','PECA_SAIDA'/.test(ler('sql/insumos-peso-pecas.sql')), 'tipos novos no banco');
  } },
] };
