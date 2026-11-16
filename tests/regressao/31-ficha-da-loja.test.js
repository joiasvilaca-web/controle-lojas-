/* 16/11 — ADM › FICHA DA LOJA (memorial descritivo): cartão só para diretoria/gerência, função própria no servidor,
 * tabela sem acesso direto, e o menu da ficha não é redesenhado no meio de um clique. */
const { pegar } = require('../lib/ts-func');
module.exports = { casos: [
  { nome: 'Servidor: diretoria vê todas as lojas, gerente só as dela, vendedora e oficina nenhuma', bug: 'ficha com senha de Wi-Fi e contratos visível para qualquer perfil', rodar: async ({ t }) => {
    const f = pegar('ficha-loja-api.ts', ['lojasDaSessao', 'lojasPermitidas', 'equipeDaLoja']);
    const config = { lojas: [{ id: 'loja_mc' }, { id: 'loja_jn' }], funcionarios: [{ id: 'f1', nome: 'MARIANA SILVA', apelido: 'MARIANA' }],
      users: [{ id: 'u1', nome: 'MARIANA SILVA', funcionarioId: 'f1', nivel: 'gerente', lojas: ['loja_mc'] }, { id: 'u2', nome: 'EX', nivel: 'vendedora', lojas: ['loja_mc'], status: 'inativo' }, { id: 'u3', nome: 'BLOQ', nivel: 'vendedora', lojas: ['loja_mc'], bloqueado: true }] };
    t.ok(JSON.stringify(f.lojasPermitidas(config, { nivel: 'diretoria', lojas: [] }, 's')) === '["loja_mc","loja_jn"]', 'diretoria: todas');
    t.ok(JSON.stringify(f.lojasPermitidas(config, { nivel: 'gerente', lojas: ['loja_jn'] }, 's')) === '["loja_jn"]', 'gerente: só a dela');
    t.ok(f.lojasPermitidas(config, { nivel: 'vendedora', lojas: ['loja_mc'] }, 's').length === 0 && f.lojasPermitidas(config, { nivel: 'oficina', lojas: ['loja_mc'] }, 's').length === 0, 'vendedora e oficina: nenhuma');
    const eq = f.equipeDaLoja(config, 'loja_mc');
    t.ok(eq.length === 1 && eq[0].nome === 'MARIANA', 'equipe: só usuários ativos da loja, pelo apelido');
  } },
  { nome: 'Banco e shell: tabela sem acesso direto; cartão FICHA DA LOJA só para diretoria e gerência', bug: 'módulo novo exposto', rodar: async ({ t, ler }) => {
    const sql = ler('sql/ficha-loja.sql');
    t.ok(/enable row level security/.test(sql) && /revoke all on public\.loja_fichas from anon, authenticated/.test(sql), 'RLS ligado e sem GRANT');
    const api = ler('ficha-loja-api.ts');
    t.ok(/Number\(body\.versao\) !== versaoAtual/.test(api) && /loja_fichas_historico/.test(api), 'não sobrescreve edição de outra pessoa e guarda histórico');
    const sh = ler('index.html');
    t.ok(/ficha:\s+\{ label:'Ficha da loja'.*src:'ficha-loja\.html', permModulo:'fichaloja'/.test(sh), 'sub-tela no ADM');
    t.ok(/currentUser\.nivel==='diretoria' \|\| currentUser\.nivel==='gerente'\)\) out\.push\('ficha'\)/.test(sh), 'só diretoria e gerência');
    t.ok(/mod==='fichaloja' && iframesCriados\['caixa_ficha'\]/.test(sh), 'handshake do iframe');
  } },
  { nome: 'Tela: menu não é redesenhado ao sair de um campo; senha e Wi-Fi não viram maiúscula; lista para nova loja', bug: 'clique no menu se perdia ao sair de um campo (menu redesenhado no meio do clique)', rodar: async ({ t, ler }) => {
    const h = ler('ficha-loja.html');
    const i = h.indexOf("C.addEventListener('change'"); const tr = h.slice(i, h.indexOf("C.addEventListener('click'", i));
    t.ok(i > 0 && !/pintarNav\(\)|repintarLista\(/.test(tr) && /atualizarContagens\(\)/.test(tr), 'ao sair do campo só atualiza os números');
    t.ok(/type="password" autocomplete="off" data-minusculo/.test(h) && /tipo:'livre'/.test(h), 'campos livres (senha, rede, e-mail) sem caixa alta');
    t.ok(/function linhasCompra\(\)/.test(h) && /compra:true/.test(h) && /lista-nova-loja-/.test(h), 'lista para nova loja com planilha');
    t.ok(/upload-foto-drive/.test(h) && !/supabase\.co/.test(h), 'fotos pelo envio já existente; sem endereço fixo do banco');
    ['Iluminação e elétrica', 'Internet, Wi-Fi e TI', 'Equipamentos e mobiliário', 'Telefones e contatos', 'Equipe e chaves', 'Documentos e vencimentos'].forEach((x) => t.ok(h.includes("titulo:'" + x + "'"), 'seção ' + x));
  } },
] };
