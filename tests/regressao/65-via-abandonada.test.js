/* 22/11 (Felipe): prazo de retirada do pedido PRONTO, status ABANDONADA, crédito (pago − 20%), histórico da via. */
const { pegar } = require('../lib/ts-func.js');
module.exports = { casos: [
  { nome: 'Robô: prazos 15/30 (sem pagamento) e 30/60 (com pagamento), crédito = pago − 20%', bug: 'pedido pronto ficava meses na loja sem aviso', rodar: async ({ t }) => {
    const f = pegar('acompanhamento-auto.ts', ['agoraBR', 'diaDe', 'diasEntre', 'ABANDONO_DESDE', 'TAXA_PERDA', 'pagoDiretoOS', 'prazoAbandono', 'fmtBRL', 'fraseCreditoAbandono']);
    const pron = Date.parse('2026-12-01T15:00:00Z');
    t.ok(f.pagoDiretoOS({ pagamentos: [{ formaId:'pix', valor:300 }, { formaId:'__credito', valor:200, creditoOuro:150 }, { formaId:'__fiado', valor:500 }, { formaId:'__cashback', valor:10 }] }) === 350, 'pago = pix + crédito comum (sem o ouro); fiado e cashback não');
    const sem = f.prazoAbandono({ statusEm: pron }, '2026-12-16', 0);
    t.ok(sem.lembrete === 15 && sem.limite === 30 && sem.dias === 15 && sem.diaLimite === '2026-12-31', 'sem pagamento: 15 e 30 dias');
    const com = f.prazoAbandono({ statusEm: pron }, '2026-12-31', 500);
    t.ok(com.lembrete === 30 && com.limite === 60 && com.credito === 400 && com.diaDiretoria === '2027-02-14', 'com pagamento: 30 e 60 dias, crédito 80%, diretoria +15');
    const antigo = f.prazoAbandono({ statusEm: Date.parse('2026-08-01T12:00:00Z') }, '2026-11-22', 0);
    t.ok(antigo.dias === 0, 'pedido que já estava pronto conta a partir de 22/11 (não dispara de uma vez)');
    t.ok(/R\$ 400,00 ficará como crédito/.test(f.fraseCreditoAbandono(500, 400)) && /não há valor a devolver/.test(f.fraseCreditoAbandono(0, 0)), 'frase do crédito');
  } },
  { nome: 'Robô: aviso com a MESMA mensagem do pedido pronto (sem modelo novo); tarefas para equipe e diretoria', bug: 'Felipe: os avisos ficam no cartão, a mensagem do WhatsApp não muda', rodar: async ({ t, ler }) => {
    const s = ler('acompanhamento-auto.ts');
    t.ok(/if \(it\.tipo === "os_pronto" \|\| it\.tipo === "os_abandono"\) return \{ nome: "pedido_pronto_acompanhamento"/.test(s) && !/os_retirada_/.test(s), 'usa o modelo aprovado do pedido pronto');
    const g = ler('get-order-status.ts'), a = ler('acompanhar.html');
    t.ok(/prazoRetirada: prazoRetirada\(order\)/.test(g) && /function prazoHtml\(p\)/.test(a) && /Retire até \$\{dataBR\(p\.limite\)\}/.test(a), 'prazo, desmanche e crédito no cartão do link');
    t.ok(/pz\.dias >= pz\.limite && !et\.equipe/.test(s) && /pz\.dias >= pz\.limite \+ 15 && !et\.diretoria/.test(s), 'tarefas no vencimento e +15 dias');
    t.ok(/eq\("payload->>status", "pronto"\)/.test(s), 'olha todos os pedidos prontos (não só os atualizados em 60 dias)');
  } },
  { nome: 'Pedido: status ABANDONADA só gerente/diretoria, só de PRONTO, crédito sem caixa', bug: 'regra de abandono', rodar: async ({ t, ler }) => {
    const s = ler('painel-ordens.html');
    t.ok(/'cancelado','abandonada'\];/.test(s) && /abandonada:'ABANDONADA'/.test(s), 'status novo');
    t.ok(/if\(de==='abandonada'\) return false;/.test(s) && /if\(para==='abandonada' && de!=='pronto'\) return false;/.test(s), 'não volta e só sai de PRONTO');
    t.ok(/gerente:STATUS_LOJA\.concat\('abandonada'\), vendedora:STATUS_LOJA/.test(s), 'vendedora não lança');
    t.ok(/TAXA_PERDA_ABANDONO = 0\.20/.test(s) && /tipo:'abandono'/.test(s) && /order\.caixaSaidaCancelamento = 0;/.test(s), 'crédito 80% no cadastro, sem saída de caixa');
    t.ok(/creditoOuro: r2\(creditoOuroDe\(order\)\)/.test(s) && /Math\.max\(0, \(Number\(p\.valor\)\|\|0\) - \(Number\(p\.creditoOuro\)\|\|0\)\)/.test(s), 'crédito de ouro não volta');
    t.ok(/\/\^cancel\|\^abandon\//.test(ler('dp.html')) && /o\.status === "abandonada" \? recebido\(o\)/.test(ler('lancamentos-api.ts')) && /o\.status==="abandonada" && o\.abandono/.test(ler('dashboard.html')), 'sai da comissão e da meta no mês da baixa');
    t.ok(/devolucao_diretoria/.test(ler('index.html')), 'devolução em dinheiro pela diretoria, fora do caixa');
  } },
  { nome: 'Histórico da via e termo no cartão', bug: 'avisos e ações sem registro na via', rodar: async ({ t, ler }) => {
    const r = ler('retirada-terceiro.ts');
    t.ok(/function eventosDoRegistro\(v: any\)/.test(r) && /from\("marketing_fila"\)/.test(r) && /from\("disparo_envios"\)/.test(r), 'histórico junta registro + fila + envios');
    for (const f of ['painel-ordens.html', 'vendas.html', 'orcamentos.html']) t.ok(/data-hist=/.test(ler(f)) && /RetiradaTerceiro\.comprovante\(\{ tipo:/.test(ler(f)), 'botão Histórico da via em ' + f);
    t.ok(/TERMO_RETIRADA = "<b>Termo de retirada:<\/b>/.test(ler('acompanhar.html')), 'termo no rodapé do cartão do pedido');
  } },
] };
