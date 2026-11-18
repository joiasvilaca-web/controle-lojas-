/* 18/11 — Pendência do Pedido: recado da vendedora ao cliente (só status + recado, nunca a observação da Oficina);
 * Avisos mostra todas as observações; agenda entra nos Avisos (compartilhada 24h com ciente, amanhã, hoje, atrasada). */
const { pegar } = require('../lib/ts-func');
const fs = require('fs'), path = require('path'), vm = require('vm');
function carregarRecado() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'recado-cliente.js'), 'utf8');
  const win = {}; const ctx = vm.createContext({ window: win, document: { getElementById() { return null; } }, console });
  vm.runInContext(src, ctx); return win.RecadoCliente;
}
module.exports = { casos: [
  { nome: 'Texto ao cliente: só situação + recado da vendedora; texto da Oficina nunca vai', bug: 'risco de vazar a observação interna da Oficina ao cliente', rodar: async ({ t, ler }) => {
    const R = carregarRecado();
    const ordem = { id: 'o1', codigoVia: 'MC10P', observacoes: [{ id: 'ob1', origem: 'oficina', texto: 'SEGREDO INTERNO DA OFICINA', recado: { texto: 'Faltou a pedra, ligue para combinar.' } }] };
    const txt = R.textoCliente(ordem, ordem.observacoes[0].recado, () => 'PENDÊNCIA');
    t.ok(/PENDÊNCIA/.test(txt) && /MC10P/.test(txt) && /Faltou a pedra/.test(txt), 'leva status, via e recado');
    t.ok(!/SEGREDO INTERNO/.test(txt), 'não leva o texto da Oficina');
    const rc = ler('recado-cliente.js');
    t.ok(/tipo:\s*'chamar_cliente'/.test(rc) && /enviar-via/.test(rc) && /confirm\(/.test(rc), 'envio manual (confirmação) pelo número oficial');
    t.ok(!/tipo:\s*'(os|venda|orcamento)'/.test(rc), 'não usa os tipos de disparo automático');
  } },
  { nome: 'Pendência: ciente não apaga recado/observações; Avisos lista todas as observações', bug: 'ciente fazia perder o contexto da pendência', rodar: async ({ t, ler }) => {
    const p = ler('painel-ordens.html'); t.ok(/recado-cliente\.js/.test(p) && /RecadoCliente\.linhaHtml/.test(p) && /RecadoCliente\.ligar\(bar, recadoCtx\(\)\)/.test(p), 'Pedido: recado na linha do aviso');
    const a = ler('avisos.html'); t.ok(/function obsBlocoHtml\(/.test(a) && /extraFn: \(\) => obsBlocoHtml\(o\)|extraFn:\s*\(\)\s*=>\s*obsBlocoHtml/.test(a), 'Avisos: pendência com todas as observações');
    t.ok(/interno/.test(a), 'observação da Oficina marcada como interna');
  } },
  { nome: 'Agenda nos Avisos: servidor classifica compartilhada(24h)/amanhã/hoje/atrasada e ciente só do participante', bug: 'agenda não avisava vencimento nem compartilhamento', rodar: async ({ t, ler }) => {
    const s = ler('agenda-tarefas.ts');
    t.ok(/op === "avisos"/.test(s) && /"agendaCiente"/.test(s) && /agenda_ciente/.test(s), 'ops avisos e agendaCiente');
    t.ok(/"compartilhada"/.test(s) && /"amanha"/.test(s) && /"hoje"/.test(s) && /"atrasada"/.test(s), 'tipos de aviso');
    t.ok(/24 \* 3600|24 \* 60 \* 60|86400000|24 \* 3_600/.test(s), 'janela de 24h do compartilhamento');
    const sql = ler('sql/agenda-avisos.sql'); t.ok(/revoke all on function public\.agenda_ciente/i.test(sql) && /to service_role/i.test(sql), 'ciente só pelo service_role');
    const a = ler('avisos.html'); t.ok(/agendaCall\(\{ ?op: ?'avisos'/.test(a) && /agendaCiente/.test(a) && /compartilhamento de agenda/.test(a), 'tela de Avisos usa e mostra');
  } },
] };
