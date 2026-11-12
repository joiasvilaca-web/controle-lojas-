// db-gateway v69 (11/11/2026 — auditoria). Quatro ajustes, nenhum muda regra de negócio:
//  (1) CORS deixa de ser "*": só os endereços do app (vilaca.app, teste, treino, previews da Vercel).
//      Feito num invólucro no fim do arquivo, para não mexer nas ~60 respostas json() existentes.
//  (2) LOGIN com freio por IP: 6 erros bloqueiam o USUÁRIO, mas sem limite por IP alguém de fora
//      conseguia bloquear a equipe inteira. 20 erros do mesmo IP em 15 min param antes do bcrypt
//      (reusa rl_gerencial_atual / rl_gerencial_falha, que já existiam).
//  (3) kvSet: a chave passa a ser validada como identificador e a gravação deixa rastro no
//      auditoria_log (antes gravava qualquer chave, sem registro nenhum). Autosave de rotina
//      (orders/clientes/config/codes/registros/autorizacoes/foto:) segue fora do log, de propósito.
//  (4) searchClients: limpa o texto como a buscaGeral já limpava (antes só tirava vírgula, e o
//      ")" e o "%" passavam direto para o filtro do PostgREST).
// db-gateway v64
// v64: (1) SEM SENHA PADRÃO: acabou o primeiro acesso com 123456 (login e op primeiroAcesso recusam). Usuário novo criado no
//      saveConfig entra com params.payload.users[].senhaInicial (≥6, vira hash na hora) ou fica sem acesso até a diretoria
//      definir a senha no DP. (2) LOGIN ATÔMICO: login, falha, logout e loja extra gravam só a parte do usuário no banco
//      (funções SQL cfg_*), sem reescrever a configuração inteira; saveConfig grava com cfg_salvar, que repõe senha/sessões
//      do que está no banco NA HORA de gravar (quem acabou de entrar não é derrubado). mergeConfigKey grava só a chave.
//      (3) Sessão nova não encontrada no cache de 4 s: relê a config antes de responder 401. (4) Oficina acha via de qualquer
//      loja pelo código. (5) op buscaGeral: vias, clientes e produtos numa busca só.
// db-gateway v63
// v63: PRIMEIRO ACESSO. users[].primeiroAcesso (+hashPadrao) => entra com a senha padrão 123456 e é obrigado a criar a nova (op primeiroAcesso). A senha padrão NÃO fica gravada como hash: só vale enquanto senhaHash===hashPadrao (hash aleatório), então outras funções que conferem hash nunca aceitam 123456.
// db-gateway v62
// v62: VELOCIDADE. (1) a config (46 kB) é lida do cache de 4s nas operações só de leitura (antes, TODA chamada ia ao banco buscá-la);
//      login/logout/saveConfig/loja extra seguem lendo fresco. (2) selectAll busca as páginas EM PARALELO (antes: uma depois da outra).
//      (3) selectAll aceita params.leve=true (produtos_estoque sem o bloco `site`, só para telas de leitura).
// db-gateway v54
// v54: AUDITORIA. Toda gravação/exclusão/movimento de estoque/alteração de config, login, logout e entrada/saída de OUTRA LOJA
//      grava uma linha em auditoria_log (quem, quando, loja da sessão, se estava em outra loja, antes/depois). A op
//      `auditoriaLista` (só Diretoria) consulta o log para o cartão LOG em Configurações. Falha ao gravar o log nunca derruba a operação.
// db-gateway v53
// v53: entrarOutraLoja pede a PRÓPRIA senha do usuário (não mais a de gerente/diretor); as permissões continuam as mesmas, só a loja extra é somada.
// db-gateway v52
// v52: saveConfig de quem NÃO é Diretoria (ex.: gerente com módulo Configurações) não altera nivel/lojas/permissoes/funcaoId/ajustes de ninguém nem config.funcoesAcesso (a trava de Funções/Personalizar agora vale no servidor).
// db-gateway v51
// v51: "trabalhar em outra loja". Cada usuário entra na(s) loja(s) configurada(s) no DP (users[].lojas). Para operar
//      noutra loja, op `entrarOutraLoja` { lojaId, senhaGerencial }: um diretor/gerente autoriza com a senha e a SESSÃO
//      (users[].sessoes[].lojaExtra) ganha acesso àquela loja por até LOJA_EXTRA_HORAS. `voltarMinhaLoja` desfaz.
//      5 senhas erradas bloqueiam o usuário (igual ao login). Tudo fica em loja_acessos_log. validarSessao/login devolvem
//      user.lojaExtra. Nada muda para quem não usa o recurso.
// db-gateway v50
// v50: selectAll busca em páginas de 1000 até trazer tudo. Antes, o Supabase cortava a
//      resposta em 1000 linhas sem avisar e, como a ordem é do mais antigo pro mais
//      novo, os registros MAIS RECENTES sumiam de Caixa/Conciliação/Dashboard/Avisos.
// v49: CORREÇÃO — a permissão de escrita exigia que o usuário tivesse TODAS as lojas
//      do registro (every). Em transferência entre duas lojas isso travava quem
//      participava. Agora basta participar de uma delas (some).
// v48: op "aniversariantes" busca no servidor por mês/dia — o Marketing não baixa
//      mais o cadastro inteiro de clientes só pra montar a aba de aniversários.
// v47: upsert/delete/deleteMany passam a respeitar a loja do usuário (antes só a leitura
//      era filtrada — quem chamasse a API direto conseguia gravar/apagar registro de
//      outra loja). Diretoria e gerente seguem sem restrição.
// v46: buscarPorCodigoVia expandido para cobrir orcamentos + transferencias/reposicao/envio_diretoria.
// v45: várias sessões por usuário.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const MAX_TENTATIVAS = 6;
const SESSAO_HORAS = 12;
const SESSOES_MAX = 5;
const PAGINA_MAX = 5000;
const LOJA_EXTRA_HORAS = 4;
const MAX_TENTATIVAS_OUTRA_LOJA = 5;
// v52: quem salva a config sem ser Diretoria não altera função/permissões/lojas de ninguém
// tabelas que entram na auditoria de gravação/exclusão (kv de autosave e memória da IA ficam de fora: só geram ruído)
const AUDITAR_TABELAS = ["vendas_pdv","ordens_servico","orcamentos","produtos_estoque","clientes_cadastro","gastos","gastos_fixos","dp_funcionarios","dp_registros","transferencias_controle","reposicao_controle","envio_diretoria_controle","gravacoes_pedidos","marketing_mensagens"];
const CAMPOS_ACESSO_USER = ["nivel","lojas","permissoes","funcaoId","ajustes"];
const CAMPOS_PROTEGIDOS_USER = ["primeiroAcesso","hashPadrao","senha","senhaHash","sessaoExpiraEm","sessoes","tentativasFalhas","bloqueado","bloqueadoEm","tentativasOutraLoja","termos"];
const SENHA_MIN = 6;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

const TABELAS_PERMITIDAS: Record<string, string | string[]> = {
  painel_ordens_kv:["os","ia","dp","config","caixa"],
  ordens_servico:["os","ia","dp","config","caixa"],
  gravacoes_pedidos:["gravacoes"],
  transferencias_controle:["transferencias","ia","dashboard"],
  reposicao_controle:["transferencias","ia","dashboard"],
  envio_diretoria_controle:["transferencias","ia"],
  vendas_pdv:["vendas","os","config","conciliacao","ia","dp","caixa","dashboard"],
  produtos_estoque:["vendas","ia","config","transferencias"],
  estoque_movimentos:["vendas","ia","config","transferencias"],
  orcamentos:["orcamentos","os","vendas","ia","marketing","dashboard"],
  dp_funcionarios:["dp","config","ia","dashboard"],
  dp_registros:["dp","ia"],
  clientes_cadastro:["os","vendas","orcamentos","ia","marketing","config"],
  marketing_mensagens:["marketing"],
  gastos:["gastos","dashboard","caixa"],
  gastos_fixos:["gastos"],
  ia_memoria:["ia"],
  gravacoes_kv:["gravacoes"],
};

const TIPOS_MOVIMENTO_VALIDOS = ["VENDA","CANCELAMENTO_VENDA","TRANSF_SAIDA","TRANSF_ENTRADA","REPOSICAO_ENTRADA","AJUSTE_INVENTARIO","ENTRADA_OURO_TROCA","CRIACAO_INICIAL"];

const CAMPO_LOJA_POR_TABELA: Record<string, string[]> = {
  vendas_pdv:["lojaId"],
  ordens_servico:["lojaId"],
  orcamentos:["lojaId"],
  gastos:["lojaId"],
  transferencias_controle:["lojaOrigemId","lojaDestinoId"],
  reposicao_controle:["lojaId"],
  envio_diretoria_controle:["lojaId"],
};

function ehGestao(user: any): boolean {
  return user && (user.nivel==="diretoria" || user.nivel==="gerente");
}

function filtrarPorLojaDoUsuario(linhas: any[], table: string, user: any): any[] {
  if (ehGestao(user)) return linhas;
  const campos = CAMPO_LOJA_POR_TABELA[table];
  if (!campos) return linhas;
  const lojasDoUsuario: string[] = Array.isArray(user.lojas) ? user.lojas : [];
  return linhas.filter((row: any) => {
    const payload = row.payload||{};
    const valores = campos.map((c)=>payload[c]).filter(Boolean);
    if (valores.length===0) return true;
    return valores.some((v: any)=>lojasDoUsuario.includes(v));
  });
}

/* ── v47: mesma regra de loja, agora também na ESCRITA ────────────────────────
   Sem isto, a trava de loja existia só no navegador: bastava chamar a API direto
   para gravar ou apagar um registro de outra loja (inclusive mudar o lojaId de
   uma venda, o que teria efeito fiscal). Diretoria e gerente seguem livres.
   ──────────────────────────────────────────────────────────────────────────── */
function lojaDoRegistro(payload: any, table: string): string[] {
  const campos = CAMPO_LOJA_POR_TABELA[table];
  if (!campos || !payload) return [];
  return campos.map((c)=>payload[c]).filter(Boolean);
}

function podeEscreverRegistro(payload: any, table: string, user: any): boolean {
  if (ehGestao(user)) return true;
  if (!CAMPO_LOJA_POR_TABELA[table]) return true;
  const lojasDoUsuario: string[] = Array.isArray(user.lojas) ? user.lojas : [];
  const valores = lojaDoRegistro(payload, table);
  // registro sem loja definida: permite (compatível com dados antigos)
  if (valores.length === 0) return true;
  // BASTA PARTICIPAR de uma das lojas do registro. Numa transferência JN->MC, tanto
  // quem pediu quanto quem envia precisam ver e editar; exigir as duas lojas (como
  // na v47) travava justamente quem estava participando da transferência.
  return valores.some((v: any)=>lojasDoUsuario.includes(v));
}

/** Antes de sobrescrever/apagar, confere a loja do registro que JÁ está no banco —
 *  senão daria pra "sequestrar" um registro de outra loja mandando um payload novo. */
async function registroExistentePermitido(table: string, id: any, user: any): Promise<boolean> {
  if (ehGestao(user)) return true;
  if (!CAMPO_LOJA_POR_TABELA[table]) return true;
  if (id === undefined || id === null) return true;
  const { data, error } = await admin.from(table).select("payload").eq("id", id).maybeSingle();
  if (error || !data) return true; // registro novo
  return podeEscreverRegistro(data.payload, table, user);
}

let __cfgCache: { t: number; v: any } | null = null;
const CFG_TTL_MS = 4000;
async function getConfigPayload(fresco = false): Promise<any> {
  if (!fresco && __cfgCache && Date.now()-__cfgCache.t < CFG_TTL_MS) return __cfgCache.v;
  const { data, error } = await admin.from("gestao_config").select("payload").eq("id","config").maybeSingle();
  if (error) throw error;
  const v = (data&&data.payload)||{};
  if (!fresco) __cfgCache = { t: Date.now(), v };
  return v;
}
/** v64: gravação atômica no banco (funções SQL cfg_*): mexe só no que precisa, com a linha travada. */
async function rpcConfig(fn: string, args: Record<string, unknown>): Promise<any> {
  __cfgCache = null;
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw error;
  return data;
}
async function salvarConfigPayload(payload: any) {
  __cfgCache = null;
  const { error } = await admin.from("gestao_config").upsert({ id:"config", payload, updated_at: new Date().toISOString() });
  if (error) throw error;
}

function normalizarUsuario(s: any): string {
  return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/\s+/g," ");
}
function usuariosPorNome(config: any, usuario: any): any[] {
  const alvo = normalizarUsuario(usuario);
  if (!alvo) return [];
  const funcionarios = Array.isArray(config.funcionarios)?config.funcionarios:[];
  const users = Array.isArray(config.users)?config.users:[];
  return users.filter((u: any)=>{
    const f = u.funcionarioId?funcionarios.find((x: any)=>x.id===u.funcionarioId):null;
    const nomes = [u.apelido,u.nome,f&&f.apelido,f&&f.nome].filter(Boolean).map(normalizarUsuario);
    return nomes.includes(alvo);
  });
}
const SENHA_PADRAO = "123456";
function emPrimeiroAcesso(u: any): boolean { return !!(u && u.primeiroAcesso===true && u.hashPadrao && u.senhaHash===u.hashPadrao && !u.bloqueado); }
function gerarTokenSessao(): string {
  const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
  return "sess_"+Array.from(bytes).map((b)=>b.toString(16).padStart(2,"0")).join("");
}
function sessoesVivas(u: any): any[] {
  const agora = Date.now();
  return (Array.isArray(u.sessoes)?u.sessoes:[]).filter((s: any)=>s&&s.token&&(!s.exp||Number(s.exp)>agora));
}
function sessaoValida(u: any, senha: string): boolean {
  if (!u||!senha||typeof senha!=="string"||!senha.startsWith("sess_")) return false;
  if (u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha===senha&&(!u.sessaoExpiraEm||Number(u.sessaoExpiraEm)>agora)) return true;
  return sessoesVivas(u).some((s: any)=>s.token===senha);
}
function findUserBySenha(config: any, senha: string): any {
  return (Array.isArray(config.users)?config.users:[]).find((u: any)=>sessaoValida(u,senha))||null;
}
function abrirSessao(u: any, agente: string|null): { token: string; exp: number } {
  const token = gerarTokenSessao();
  const exp = Date.now()+SESSAO_HORAS*60*60*1000;
  const lista = sessoesVivas(u);
  lista.push({ token, exp, criadoEm: new Date().toISOString(), agente: agente?String(agente).slice(0,120):null });
  while (lista.length>SESSOES_MAX) lista.shift();
  u.sessoes=lista; u.senha=token; u.sessaoExpiraEm=exp;
  return { token, exp };
}
function derrubarTodasSessoes(u: any) { u.sessoes=[]; u.senha=null; u.sessaoExpiraEm=null; }
/** Loja extra autorizada para ESTA sessão (ainda dentro do prazo), ou null. */
function lojaExtraDaSessao(u: any, senha?: string): string|null {
  if (!senha) return null;
  const s = sessoesVivas(u).find((x: any)=>x.token===senha);
  const e = s&&s.lojaExtra;
  return e&&e.id&&Number(e.ate)>Date.now() ? String(e.id) : null;
}
/** Cópia do usuário com a loja extra da sessão somada às lojas próprias (nunca é gravada no banco). */
function comLojaExtra(u: any, senha: string): any {
  const extra = lojaExtraDaSessao(u,senha);
  if (!extra) return u;
  const base: string[] = Array.isArray(u.lojas)?u.lojas:[];
  return { ...u, lojas: base.includes(extra)?base:[...base,extra] };
}
async function logLoja(reg: any) {
  try { const { error } = await admin.from("loja_acessos_log").insert(reg); if (error) console.error("loja_acessos_log",error); } catch (e) { console.error("loja_acessos_log",e); }
}
/* ── v54: AUDITORIA ─────────────────────────────────────────────────────────── */
const ROTULO_TABELA: Record<string,string> = {
  vendas_pdv:"Vendas", ordens_servico:"Pedido/O.S.", orcamentos:"Orçamento", produtos_estoque:"Produtos", estoque_movimentos:"Estoque",
  clientes_cadastro:"Clientes", gastos:"Gastos", gastos_fixos:"Gastos", dp_funcionarios:"DP", dp_registros:"DP",
  transferencias_controle:"Transferências", reposicao_controle:"Transferências", envio_diretoria_controle:"Transferências",
  gravacoes_pedidos:"Gravações", gravacoes_kv:"Gravações", marketing_mensagens:"Marketing", painel_ordens_kv:"Pedido/O.S.", ia_memoria:"IA",
};
const CHAVES_SENSIVEIS = ["senha","senhaHash","sessaoExpiraEm","sessoes","tentativasFalhas","tentativasOutraLoja"];
/** v69: chaves de autosave que gravam o tempo todo — ficam fora do auditoria_log de propósito. */
const KV_AUTOSAVE = ["orders","clientes","codes","config","registros","autorizacoes"];
function cortarValor(v: any, max = 300): any {
  if (v === undefined) return null;
  let t: string; try { t = JSON.stringify(v); } catch { return String(v).slice(0,max); }
  if (t && t.length > max) return t.slice(0,max)+"…";
  return v;
}
function difObj(a: any, b: any, max = 40): Record<string,any> {
  const out: Record<string,any> = {}; let n = 0;
  const ks = new Set([...Object.keys(a||{}), ...Object.keys(b||{})]);
  for (const k of ks) {
    if (CHAVES_SENSIVEIS.includes(k)) continue;
    if (JSON.stringify((a||{})[k]) !== JSON.stringify((b||{})[k])) { out[k] = { de: cortarValor((a||{})[k]), para: cortarValor((b||{})[k]) }; if (++n >= max) break; }
  }
  return out;
}
function nomeDoRegistro(p: any, id: any): string {
  const x = p || {};
  return String(x.codigoVia || x.numero || x.nome || x.descricao || x.titulo || id || "").slice(0,80);
}
/** Diferença entre duas configs: para cada chave, o que entrou/saiu/mudou (listas com id comparadas item a item). */
function difConfig(antes: any, depois: any): Record<string,any> {
  const out: Record<string,any> = {};
  const ks = new Set([...Object.keys(antes||{}), ...Object.keys(depois||{})]);
  for (const k of ks) {
    const a = (antes||{})[k], b = (depois||{})[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    const listaId = (x: any) => Array.isArray(x) && x.every((i: any)=>i&&typeof i==="object"&&i.id!==undefined);
    if (listaId(a||[]) && listaId(b||[]) && (Array.isArray(a)||Array.isArray(b))) {
      const A = new Map((a||[]).map((i: any)=>[String(i.id),i])), B = new Map((b||[]).map((i: any)=>[String(i.id),i]));
      const entrou = [...B.keys()].filter(i=>!A.has(i)), saiu = [...A.keys()].filter(i=>!B.has(i));
      const mudou: any[] = [];
      for (const [id,item] of B) { if (A.has(id) && JSON.stringify(A.get(id)) !== JSON.stringify(item)) mudou.push({ id, nome: nomeDoRegistro(item,id), campos: difObj(A.get(id), item, 15) }); if (mudou.length>=30) break; }
      out[k] = { entrou: entrou.map(i=>({ id:i, nome:nomeDoRegistro(B.get(i),i) })).slice(0,30), saiu: saiu.map(i=>({ id:i, nome:nomeDoRegistro(A.get(i),i) })).slice(0,30), mudou };
    } else {
      out[k] = { de: cortarValor(a), para: cortarValor(b) };
    }
  }
  return out;
}
async function auditar(userBase: any, senha: string|null, reg: any, req?: Request) {
  try {
    const extra = userBase && senha ? lojaExtraDaSessao(userBase, senha) : null;
    const proprias: string[] = Array.isArray(userBase && userBase.lojas) ? userBase.lojas : [];
    let detalhe = reg.detalhe ?? null;
    if (detalhe) { const t = JSON.stringify(detalhe); if (t.length > 60000) detalhe = { truncado: true, inicio: t.slice(0,60000) }; }
    const { error } = await admin.from("auditoria_log").insert({
      usuario_id: userBase ? (userBase.id||null) : null,
      usuario_nome: userBase ? (userBase.nome||null) : (reg.usuario_nome||null),
      nivel: userBase ? (userBase.nivel||null) : null,
      loja_sessao: extra || proprias[0] || null,
      loja_extra: extra,
      em_outra_loja: !!extra,
      acao: reg.acao, modulo: reg.modulo||null, tabela: reg.tabela||null, registro_id: reg.registro_id!=null ? String(reg.registro_id) : null,
      resumo: reg.resumo ? String(reg.resumo).slice(0,500) : null, detalhe,
      agente: req ? String(req.headers.get("user-agent")||"").slice(0,160) : null,
    });
    if (error) console.error("auditoria_log", error);
  } catch (e) { console.error("auditoria_log", e); }
}
function userPublico(user: any, senha?: string) {
  return { id:user.id, nome:user.nome, nivel:user.nivel, permissoes:user.permissoes||null, funcionarioId:user.funcionarioId||null, lojas:Array.isArray(user.lojas)?user.lojas:[], lojaExtra:lojaExtraDaSessao(user,senha) };
}
function moduloAtivoParaUsuario(user: any, moduloId: string): boolean {
  const perm = user.permissoes;
  if (perm&&perm[moduloId]&&typeof perm[moduloId].ativo==="boolean") return perm[moduloId].ativo;
  if (user.nivel==="diretoria"||user.nivel==="gerente") return true;
  if (user.nivel==="oficina") return ["os","dashboard","dp","ia","gravacoes"].includes(moduloId);
  return moduloId!=="config"||(perm&&perm.config&&perm.config.ativo===true);
}

async function atender(req: Request): Promise<Response> {
  if (req.method==="OPTIONS") return new Response(null,{headers:CORS_HEADERS});
  if (req.method!=="POST") return json({error:"method not allowed"},405);
  let body: any;
  try { body = await req.json(); } catch { return json({error:"json inválido"},400); }
  const { op, senha, table, params } = body||{};
  if (!op) return json({error:"operação obrigatória"},400);

  try {
    const OPS_ESCRITA_CONFIG = ["primeiroAcesso","login","logout","entrarOutraLoja","voltarMinhaLoja","saveConfig","mergeConfigKey"];
    let config = await getConfigPayload(OPS_ESCRITA_CONFIG.includes(op));

    if (op==="login") {
      const usuario = body.usuario;
      if (!usuario||!senha) return json({ok:false,motivo:"informe usuário e senha"});
      // v69: freio por IP, ANTES do bcrypt. Sem isto, 6 erros por usuário bloqueiam a pessoa e
      // alguém de fora conseguia bloquear a equipe inteira numa manhã. Janela de 15 min.
      const ipLogin = (String(req.headers.get("x-forwarded-for")||"").split(",")[0].trim()) || "sem-ip";
      const CHAVE_IP = "login_ip:"+ipLogin, JANELA_IP = 900, MAX_IP = 20;
      try {
        const { data: jaTentou } = await admin.rpc("rl_gerencial_atual",{ p_chave: CHAVE_IP, p_janela_seg: JANELA_IP });
        if (Number(jaTentou||0) >= MAX_IP) {
          await auditar(null,null,{acao:"login_freio_ip",modulo:"Acesso",usuario_nome:String(usuario).slice(0,80),resumo:"Muitas tentativas do mesmo aparelho/rede — login barrado por 15 min"},req);
          return json({ok:false,motivo:"Muitas tentativas deste aparelho. Espere 15 minutos e tente de novo."});
        }
      } catch (_) { /* se o freio falhar, o login segue (não travar a loja por causa disto) */ }
      const candidatos = usuariosPorNome(config,usuario);
      if (candidatos.length===0) return json({ok:false});
      if (candidatos.every((u: any)=>u.bloqueado)) return json({ok:false,bloqueado:true});
      let achado: any = null;
      // v64: hash de "primeiro acesso" (aleatório) nunca confere com senha nenhuma — sem senha padrão
      for (const u of candidatos) { if (u.bloqueado||!u.senhaHash||emPrimeiroAcesso(u)) continue; if (bcrypt.compareSync(String(senha),u.senhaHash)){achado=u;break;} }
      if (!achado) {
        const semSenha = candidatos.filter((u: any)=>!u.bloqueado).every((u: any)=>!u.senhaHash||emPrimeiroAcesso(u));
        if (semSenha) return json({ok:false,semSenha:true,motivo:"Este usuário ainda não tem senha. Peça à diretoria para criar a sua senha inicial no DP."});
        try { await admin.rpc("rl_gerencial_falha",{ p_chave: CHAVE_IP, p_janela_seg: JANELA_IP }); } catch (_) {}   // v69: conta a falha no freio por IP
        const res: any[] = (await rpcConfig("cfg_login_falhou",{ p_user_ids: candidatos.filter((u: any)=>!u.bloqueado&&u.senhaHash&&!emPrimeiroAcesso(u)).map((u: any)=>String(u.id)), p_max: MAX_TENTATIVAS })) || [];
        const maiorTentativas = res.reduce((m: number, x: any)=>Math.max(m, Number(x&&x.tentativasFalhas)||0), 0);
        const bloqueado = res.some((x: any)=>x&&x.bloqueado);
        await auditar(null,null,{acao:bloqueado?"login_bloqueado":"login_falha",modulo:"Acesso",usuario_nome:String(usuario).slice(0,80),resumo:bloqueado?"Usuário bloqueado após senhas erradas":"Senha incorreta no login"},req);
        return json({ok:false,bloqueado,tentativasRestantes:bloqueado?0:Math.max(0,MAX_TENTATIVAS-maiorTentativas)});
      }
      const agente = req.headers.get("user-agent");
      const s = { token: gerarTokenSessao(), exp: Date.now()+SESSAO_HORAS*60*60*1000, criadoEm: new Date().toISOString(), agente: agente?String(agente).slice(0,120):null };
      const gravado = await rpcConfig("cfg_sessao_abrir",{ p_user_id: String(achado.id), p_sessao: s, p_max: SESSOES_MAX });
      const final = gravado && typeof gravado==="object" ? gravado : achado;
      await auditar(final,s.token,{acao:"login",modulo:"Acesso",resumo:"Entrou no sistema"},req);
      return json({ok:true,token:s.token,expiraEm:s.exp,user:userPublico(final,s.token)});
    }
    if (op==="validarSessao") {
      let user = findUserBySenha(config,senha);
      if (!user) { config = await getConfigPayload(true); user = findUserBySenha(config,senha); }
      if (!user) return json({ok:false});
      const sess = sessoesVivas(user).find((s: any)=>s.token===senha);
      return json({ok:true,token:senha,expiraEm:sess?sess.exp:(user.sessaoExpiraEm||null),user:userPublico(user,senha)});
    }
    if (op==="logout") {
      const user = findUserBySenha(config,senha);
      if (user) {
        await auditar(user,senha,{acao:"logout",modulo:"Acesso",resumo:"Saiu do sistema"},req);
        await rpcConfig("cfg_sessao_fechar",{ p_user_id: String(user.id), p_token: String(senha) });
      }
      return json({ok:true});
    }
    if (op==="primeiroAcesso") {
      // v64: não existe mais senha padrão — a diretoria cria a senha inicial no DP
      return json({ok:false,erro:"O primeiro acesso com senha padrão foi desligado. Peça à diretoria a sua senha inicial."});
    }

    let userBase = findUserBySenha(config,senha);
    if (!userBase && !OPS_ESCRITA_CONFIG.includes(op)) { config = await getConfigPayload(true); userBase = findUserBySenha(config,senha); }   // v64: sessão recém-aberta noutra instância
    if (!userBase) return json({error:"não autorizado"},401);
    const user = comLojaExtra(userBase,senha);   // v51: lojas próprias + a loja extra autorizada nesta sessão

    if (op==="entrarOutraLoja") {
      const lojaId = String((params&&params.lojaId)||body.lojaId||"");
      const senhaG = String(body.senhaGerencial||"");
      const loja = (Array.isArray(config.lojas)?config.lojas:[]).find((l: any)=>l&&l.id===lojaId);
      if (!loja||loja.interna) return json({error:"loja inválida"},400);
      const proprias: string[] = Array.isArray(userBase.lojas)?userBase.lojas:[];
      if (proprias.includes(lojaId)) return json({error:"esta já é uma das suas lojas"},400);
      if (!senhaG) return json({error:"informe a sua senha"},400);
      const base = { usuario_id:userBase.id, usuario_nome:userBase.nome, loja_origem:proprias[0]||null, loja_destino:lojaId };
      // v53: a senha pedida é a PRÓPRIA senha da pessoa (ela abre exatamente as funções que já tem na loja dela)
      const aprovador = userBase.senhaHash&&bcrypt.compareSync(senhaG,userBase.senhaHash) ? userBase : null;
      if (!aprovador) {
        userBase.tentativasOutraLoja = (Number(userBase.tentativasOutraLoja)||0)+1;
        const restantes = Math.max(0,MAX_TENTATIVAS_OUTRA_LOJA-userBase.tentativasOutraLoja);
        const bloqueou = restantes===0;
        if (bloqueou) { userBase.bloqueado=true; userBase.bloqueadoEm=new Date().toISOString(); derrubarTodasSessoes(userBase); userBase.tentativasOutraLoja=0; }
        await rpcConfig("cfg_usuario_patch",{ p_user_id: String(userBase.id), p_patch: bloqueou
          ? { bloqueado:true, bloqueadoEm:userBase.bloqueadoEm, sessoes:[], senha:null, sessaoExpiraEm:null, tentativasOutraLoja:0 }
          : { tentativasOutraLoja: userBase.tentativasOutraLoja } });
        await logLoja({ ...base, tipo:bloqueou?"bloqueado":"senha_errada" });
        await auditar(userBase,senha,{acao:bloqueou?"outra_loja_bloqueado":"outra_loja_senha_errada",modulo:"Outra loja",resumo:`Senha errada ao tentar entrar na loja ${lojaId}`,detalhe:{lojaDestino:lojaId}},req);
        return json({ok:false,erro:bloqueou?"Usuário bloqueado por senhas erradas. Peça à diretoria para desbloquear no DP.":"Senha incorreta.",bloqueado:bloqueou,tentativasRestantes:restantes});
      }
      userBase.tentativasOutraLoja = 0;
      const lista: any[] = Array.isArray(userBase.sessoes)?userBase.sessoes:[];
      const sessAtual = lista.find((s: any)=>s&&s.token===senha);
      const expSess = sessAtual ? Number(sessAtual.exp) : (Number(userBase.sessaoExpiraEm)||Date.now()+SESSAO_HORAS*3600000);
      const ate = Math.min(Date.now()+LOJA_EXTRA_HORAS*3600000, expSess||Infinity);
      const lojaExtra = { id:lojaId, ate, aprovadoPor:aprovador.nome||"", em:new Date().toISOString() };
      await rpcConfig("cfg_sessao_loja_extra",{ p_user_id: String(userBase.id), p_token: String(senha), p_loja: lojaExtra, p_exp_padrao: Number(userBase.sessaoExpiraEm)||Date.now()+SESSAO_HORAS*3600000 });
      await auditar(userBase,senha,{acao:"outra_loja_entrou",modulo:"Outra loja",resumo:`Entrou na loja ${lojaId} (a dele é ${proprias[0]||"—"})`,detalhe:{lojaDestino:lojaId,lojaOrigem:proprias[0]||null,ate:new Date(ate).toISOString()}},req);
      await logLoja({ ...base, tipo:"entrou", aprovado_por:aprovador.nome||"", detalhe:{ ate:new Date(ate).toISOString() } });
      return json({ok:true,lojaId,expiraEm:ate});
    }
    if (op==="voltarMinhaLoja") {
      const sess = (Array.isArray(userBase.sessoes)?userBase.sessoes:[]).find((s: any)=>s&&s.token===senha);
      const antes = sess&&sess.lojaExtra;
      if (antes) {
        await rpcConfig("cfg_sessao_loja_extra",{ p_user_id: String(userBase.id), p_token: String(senha), p_loja: null, p_exp_padrao: 0 });
        await auditar(userBase,senha,{acao:"outra_loja_saiu",modulo:"Outra loja",resumo:`Voltou da loja ${antes.id}`,detalhe:{lojaDestino:antes.id}},req);
        await logLoja({ usuario_id:userBase.id, usuario_nome:userBase.nome, loja_origem:(Array.isArray(userBase.lojas)?userBase.lojas[0]:null)||null, loja_destino:antes.id, tipo:"voltou", aprovado_por:antes.aprovadoPor||"" });
      }
      return json({ok:true});
    }

    if (op==="getConfig") {
      const out = JSON.parse(JSON.stringify(config));
      if (Array.isArray(out.users)) out.users=out.users.map((u: any)=>{const{senha:_s,senhaHash:_h,sessaoExpiraEm:_e,sessoes:_ss,hashPadrao:_hp,...resto}=u;return resto;});
      if (Array.isArray(out.funcionarios)) out.funcionarios=out.funcionarios.map((f: any)=>{const{senha:_s,senhaHash:_h,...resto}=f;return resto;});
      return json({data:out});
    }
    if (op==="auditoriaLista") {
      if (userBase.nivel!=="diretoria") return json({error:"só a Diretoria consulta o log"},403);
      const p = params||{};
      const lim = Math.min(Math.max(Number(p.limite)||200,1),500);
      let q = admin.from("auditoria_log").select("*").order("id",{ascending:false}).limit(lim);
      if (p.de) q = q.gte("em", String(p.de));
      if (p.ate) q = q.lte("em", String(p.ate));
      if (p.usuario) q = q.ilike("usuario_nome", `%${String(p.usuario).replace(/[%,]/g," ").slice(0,60)}%`);
      if (p.acao) q = q.eq("acao", String(p.acao));
      if (p.modulo) q = q.eq("modulo", String(p.modulo));
      if (p.loja) q = q.eq("loja_sessao", String(p.loja));
      if (p.soOutraLoja) q = q.eq("em_outra_loja", true);
      if (p.busca) { const b = String(p.busca).replace(/[%,()]/g," ").slice(0,60); q = q.or(`resumo.ilike.%${b}%,registro_id.ilike.%${b}%,usuario_nome.ilike.%${b}%`); }
      if (p.antesDe) q = q.lt("id", Number(p.antesDe));
      const { data, error } = await q;
      if (error) throw error;
      return json({ok:true,data:data||[],fim:(data||[]).length<lim});
    }
    if (op==="saveConfig") {
      const permConfig=user.permissoes&&user.permissoes.config;
      const ehDiretoria=user.nivel==="diretoria";
      const podeSalvar=ehDiretoria||(permConfig&&permConfig.ativo===true);
      if (!podeSalvar) return json({error:"sem permissão para alterar configurações"},403);
      const payload=params&&params.payload;
      if (!payload||typeof payload!=="object") return json({error:"payload inválido"},400);
      const atualUsers=Array.isArray(config.users)?config.users:[];
      const novoUsers=Array.isArray(payload.users)?payload.users:[];
      const atualLojas=Array.isArray(config.lojas)?config.lojas:[];
      const novoLojas=Array.isArray(payload.lojas)?payload.lojas:[];
      if (atualUsers.length>0&&novoUsers.length===0) return json({error:"salvamento bloqueado: a configuração enviada apagaria os usuários. Recarregue a página e tente de novo."},409);
      if (atualLojas.length>0&&novoLojas.length===0) return json({error:"salvamento bloqueado: a configuração enviada apagaria as lojas. Recarregue a página e tente de novo."},409);
      if (novoUsers.length>0) payload.users=novoUsers.map((u: any)=>{if(!u)return u;const atual=atualUsers.find((a: any)=>a.id===u.id);const saida: any={...u};for(const campo of CAMPOS_PROTEGIDOS_USER){if(atual&&campo in atual)saida[campo]=atual[campo];else delete saida[campo];}if(!ehDiretoria){for(const campo of CAMPOS_ACESSO_USER){if(atual&&campo in atual)saida[campo]=atual[campo];else delete saida[campo];}if(!atual)saida.nivel="vendedora";}if(!atual){const ini=String(u.senhaInicial||"");if(ini.length>=SENHA_MIN){saida.senhaHash=bcrypt.hashSync(ini,10);saida.status="ativo";}else{saida.senhaHash=null;}}delete saida.senhaInicial;return saida;});
      if (!ehDiretoria) payload.funcoesAcesso=config.funcoesAcesso;
      if (Array.isArray(payload.funcionarios)) payload.funcionarios=payload.funcionarios.map((f: any)=>{if(!f)return f;const{senha:_s,senhaHash:_h,...resto}=f;return resto;});
      for (const k of ["atendimentoInstancias"]) if (config[k]!==undefined&&payload[k]===undefined) payload[k]=config[k];
      // v64: grava repondo senha/sessões do que está no banco na hora (linha travada) — login feito agora não se perde
      await rpcConfig("cfg_salvar",{ p_payload: payload, p_protegidos: CAMPOS_PROTEGIDOS_USER });
      { const d = difConfig(config, payload); const chaves = Object.keys(d);
        if (chaves.length) await auditar(userBase,senha,{acao:"config",modulo:"Configurações",resumo:`Alterou: ${chaves.slice(0,12).join(", ")}${chaves.length>12?"…":""}`,detalhe:d},req); }
      return json({ok:true});
    }
    if (op==="mergeConfigKey") {
      const CHAVES_PERMITIDAS: Record<string,string>={gastosConfig:"gastos",metasMensais:"dashboard"};
      const key=params&&params.key;const value=params&&params.value;
      if (!key||!(key in CHAVES_PERMITIDAS)) return json({error:"chave não permitida"},400);
      if (!moduloAtivoParaUsuario(user,CHAVES_PERMITIDAS[key])) return json({error:"sem permissão"},403);
      await rpcConfig("cfg_set_chave",{ p_chave: String(key), p_valor: value===undefined?null:value });   // v64: só a chave
      await auditar(userBase,senha,{acao:"config",modulo:"Configurações",resumo:`Alterou: ${key}`,detalhe:{[key]:{de:cortarValor(config[key],2000),para:cortarValor(value,2000)}}},req);
      return json({ok:true});
    }
    if (op==="bumpCodigoViaSequence") {
      const tipo=params&&params.tipo;
      const lojaAbrev=String((params&&params.lojaAbrev)||"")
        .trim().toUpperCase();
      const LETRA: Record<string,string>={venda:"V",pedido:"P",orcamento:"O"};
      if (!tipo||!(tipo in LETRA)) return json({error:"tipo inválido"},400);
      if (!lojaAbrev) return json({error:"loja obrigatória"},400);
      const moduloNecessario=tipo==="venda"?"vendas":tipo==="pedido"?"os":"orcamentos";
      if (!moduloAtivoParaUsuario(user,moduloNecessario)) return json({error:"sem permissão"},403);
      const{data,error}=await admin.rpc("incrementar_via_sequence",{p_chave:`codigo_${lojaAbrev}_${tipo}`});
      if (error) throw error;
      return json({ok:true,proximo:data,codigo:`${lojaAbrev}${data}${LETRA[tipo]}`});
    }
    if (op==="liberarCodigoViaSequence") {
      const tipo=params&&params.tipo;
      const lojaAbrev=String((params&&params.lojaAbrev)||"")
        .trim().toUpperCase();
      const numero=Number(params&&params.numero);
      if (!tipo||!["venda","pedido","orcamento"].includes(tipo)) return json({error:"tipo inválido"},400);
      if (!lojaAbrev) return json({error:"loja obrigatória"},400);
      if (!Number.isFinite(numero)||numero<=0) return json({error:"número inválido"},400);
      const moduloNecessario=tipo==="venda"?"vendas":tipo==="pedido"?"os":"orcamentos";
      if (!moduloAtivoParaUsuario(user,moduloNecessario)) return json({error:"sem permissão"},403);
      const{data,error}=await admin.rpc("liberar_via_sequence",{p_chave:`codigo_${lojaAbrev}_${tipo}`,p_valor:numero});
      if (error) throw error;
      return json({ok:true,liberado:!!data});
    }
    if (op==="bumpViaSequence") {
      if (!moduloAtivoParaUsuario(user,"os")&&!moduloAtivoParaUsuario(user,"gravacoes")) return json({error:"sem permissão"},403);
      const loja=params&&params.loja;
      if (!loja) return json({error:"loja obrigatória"},400);
      const{data,error}=await admin.rpc("incrementar_via_sequence",{p_chave:loja});
      if (error) throw error;
      return json({ok:true,proximo:data});
    }
    if (op==="registrarMovimentoEstoque") {
      if (!moduloAtivoParaUsuario(user,"vendas")&&!moduloAtivoParaUsuario(user,"transferencias")&&!moduloAtivoParaUsuario(user,"config")) return json({error:"sem permissão"},403);
      const{produtoId,lojaId,tipoMovimento,quantidade,referenciaId,observacao}=params||{};
      if (!produtoId||!lojaId) return json({error:"produtoId e lojaId são obrigatórios"},400);
      if (!TIPOS_MOVIMENTO_VALIDOS.includes(tipoMovimento)) return json({error:"tipoMovimento inválido"},400);
      const qtd=Number(quantidade);
      if (!Number.isFinite(qtd)||qtd===0) return json({error:"quantidade precisa ser um número diferente de zero"},400);
      const{data,error}=await admin.rpc("registrar_movimento_estoque",{p_produto_id:produtoId,p_loja_id:lojaId,p_tipo_movimento:tipoMovimento,p_quantidade:qtd,p_usuario:user.nome||"",p_referencia_id:referenciaId||null,p_observacao:observacao||null});
      if (error) throw error;
      let nomeProd = ""; try { const { data: pr } = await admin.from("produtos_estoque").select("payload").eq("id",produtoId).maybeSingle(); nomeProd = nomeDoRegistro(pr&&pr.payload,produtoId); } catch {}
      await auditar(userBase,senha,{acao:"estoque",modulo:"Estoque",tabela:"estoque_movimentos",registro_id:produtoId,resumo:`${tipoMovimento} ${qtd>0?"+":""}${qtd} · ${nomeProd||produtoId} · loja ${lojaId} · saldo ${data}`,detalhe:{produtoId,produto:nomeProd,lojaId,tipoMovimento,quantidade:qtd,saldoNovo:data,referenciaId:referenciaId||null,observacao:observacao||null}},req);
      return json({ok:true,saldoNovo:data});
    }
    if (op==="searchClients") {
      if (!moduloAtivoParaUsuario(user,"os")&&!moduloAtivoParaUsuario(user,"vendas")&&!moduloAtivoParaUsuario(user,"orcamentos")&&!moduloAtivoParaUsuario(user,"marketing")) return json({error:"sem permissão"},403);
      const termoBruto=String((params&&params.termo)||"")
        .trim();
      if (termoBruto.length<2) return json({data:[]});
      const termo=termoBruto.replace(/[,()%*\\"]/g," ").replace(/\s+/g," ").trim().slice(0,60);   // v69: mesma limpeza da buscaGeral
      const{data,error}=await admin.from("clientes_cadastro").select("id, payload").or(`payload->>nome.ilike.%${termo}%,payload->>telefone.ilike.%${termo}%,payload->>cpf.ilike.%${termo}%`).limit(10);
      if (error) throw error;
      return json({data:(data||[]).map((r: any)=>r.payload)});
    }

    if (op==="aniversariantes") {
      if (!moduloAtivoParaUsuario(user,"marketing")) return json({error:"sem permissão"},403);
      const mes=Number(params&&params.mes);
      const dia=params&&params.dia!==undefined&&params.dia!==null&&params.dia!=="" ? Number(params.dia) : null;
      if (!Number.isFinite(mes)||mes<1||mes>12) return json({error:"mês inválido"},400);
      if (dia!==null&&(!Number.isFinite(dia)||dia<1||dia>31)) return json({error:"dia inválido"},400);
      const mm=String(mes).padStart(2,"0");
      // Busca no servidor pelo trecho MM-DD da data de nascimento — evita baixar
      // o cadastro inteiro de clientes só para achar os aniversariantes do dia.
      const alvo = dia!==null ? `${mm}-${String(dia).padStart(2,"0")}` : mm;
      const{data,error}=await admin.from("clientes_cadastro").select("id,payload")
        .like("payload->>dataNascimento", dia!==null?`%-${alvo}`:`%-${alvo}-%`).limit(500);
      if (error) throw error;
      const lista=(data||[]).map((r: any)=>r.payload).filter(Boolean);
      return json({data:lista});
    }

    if (op==="buscaGeral") {
      // v64: uma busca só — vias (venda, pedido, orçamento), clientes e produtos — respeitando módulos e lojas do usuário
      const termo=String((params&&params.termo)||"").replace(/[,()%*\\"]/g," ").replace(/\s+/g," ").trim().slice(0,60);
      const out: any={ok:true,vias:[],clientes:[],produtos:[]};
      if (termo.length<2) return json(out);
      const like=`%${termo}%`;
      const dig=termo.replace(/\D/g,"");
      const telLike=dig.length>=8 ? `%${dig.slice(-8,-4)}%${dig.slice(-4)}%` : null;
      const tarefas: Promise<void>[]=[];
      const vias=(tabela: string, tipo: string, modulo: string)=>{
        if (!moduloAtivoParaUsuario(user,modulo)) return;
        tarefas.push((async()=>{
          const conds=[`payload->>codigoVia.ilike.${like}`,`payload->>cliente.ilike.${like}`];
          if (tabela==="ordens_servico") conds.push(`payload->>via.ilike.${like}`);
          if (telLike) conds.push(`payload->>telefone.ilike.${telLike}`);
          const{data,error}=await admin.from(tabela).select("id,payload").or(conds.join(",")).order("created_at",{ascending:false}).limit(25);
          if (error) { console.error("buscaGeral",tabela,error); return; }
          const regs=(tabela==="ordens_servico"&&user.nivel==="oficina")?(data||[]):filtrarPorLojaDoUsuario(data||[],tabela,user);
          for (const r of regs.slice(0,8)) { const p=r.payload||{}; out.vias.push({tipo,id:r.id,codigoVia:p.codigoVia||p.via||"",cliente:p.cliente||"",telefone:p.telefone||"",data:p.data||"",status:p.status||"",lojaId:p.lojaId||"",valorTotal:p.valorTotal??null,registro:p}); }
        })());
      };
      vias("ordens_servico","pedido","os");
      vias("vendas_pdv","venda","vendas");
      vias("orcamentos","orcamento","orcamentos");
      if (["os","vendas","orcamentos","marketing"].some((m)=>moduloAtivoParaUsuario(user,m))) {
        tarefas.push((async()=>{
          const conds=[`payload->>nome.ilike.${like}`,`payload->>cpf.ilike.${like}`,`payload->>telefone.ilike.${like}`];
          if (telLike) conds.push(`payload->>telefone.ilike.${telLike}`);
          const{data,error}=await admin.from("clientes_cadastro").select("id,payload").or(conds.join(",")).limit(8);
          if (error) { console.error("buscaGeral clientes",error); return; }
          for (const r of data||[]) { const p=r.payload||{}; out.clientes.push({id:r.id,nome:p.nome||"",telefone:p.telefone||"",cpf:p.cpf||""}); }
        })());
      }
      if (["vendas","config","transferencias"].some((m)=>moduloAtivoParaUsuario(user,m))) {
        tarefas.push((async()=>{
          const{data,error}=await admin.from("produtos_estoque").select("id,payload").ilike("payload->>nome",like).limit(8);
          if (error) { console.error("buscaGeral produtos",error); return; }
          for (const r of data||[]) { const p=r.payload||{}; out.produtos.push({id:r.id,nome:p.nome||"",precoVenda:p.precoVenda??null}); }
        })());
      }
      await Promise.all(tarefas);
      const ordem: Record<string,number>={pedido:0,venda:1,orcamento:2};
      out.vias.sort((a: any,b: any)=>(String(b.data||"").localeCompare(String(a.data||"")))||(ordem[a.tipo]-ordem[b.tipo]));
      return json(out);
    }

    if (op==="buscarPorCodigoVia") {
      const codigo=String((params&&params.codigo)||"")
        .trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"");
      if (!codigo) return json({error:"código obrigatório"},400);
      // Vendas
      if (moduloAtivoParaUsuario(user,"vendas")) {
        const{data,error}=await admin.from("vendas_pdv").select("id,payload").eq("payload->>codigoVia",codigo).limit(1);
        if (!error&&data&&data.length>0) {
          const reg=filtrarPorLojaDoUsuario(data,"vendas_pdv",user)[0]?.payload||null;
          if (reg) return json({data:{tipo:"venda",registro:reg}});
        }
      }
      // O.S.
      if (moduloAtivoParaUsuario(user,"os")) {
        const{data,error}=await admin.from("ordens_servico").select("id,payload").or(`payload->>codigoVia.eq.${codigo},payload->>via.eq.${codigo}`).limit(1);
        if (!error&&data&&data.length>0) {
          // v64: a Oficina trabalha as vias de TODAS as lojas (antes só achava as da loja dela — JV/MC "não liam")
          const reg=(user.nivel==="oficina"?data:filtrarPorLojaDoUsuario(data,"ordens_servico",user))[0]?.payload||null;
          if (reg) return json({data:{tipo:"pedido",registro:reg}});
        }
      }
      // Orçamentos
      if (moduloAtivoParaUsuario(user,"orcamentos")) {
        const{data,error}=await admin.from("orcamentos").select("id,payload").eq("payload->>codigoVia",codigo).limit(1);
        if (!error&&data&&data.length>0&&data[0].payload) return json({data:{tipo:"orcamento",registro:data[0].payload}});
      }
      // Transferências / Reposição / Diretoria
      if (moduloAtivoParaUsuario(user,"transferencias")) {
        for (const tbl of ["transferencias_controle","reposicao_controle","envio_diretoria_controle"]) {
          const{data,error}=await admin.from(tbl).select("id,payload").eq("payload->>numero",codigo).limit(1);
          if (!error&&data&&data.length>0&&data[0].payload) return json({data:{tipo:"transferencia",registro:data[0].payload}});
        }
      }
      return json({data:null});
    }

    if (!table||!(table in TABELAS_PERMITIDAS)) return json({error:"tabela inválida"},400);
    const modulosPermitidos=TABELAS_PERMITIDAS[table];
    const listaModulos=Array.isArray(modulosPermitidos)?modulosPermitidos:[modulosPermitidos];
    if (!listaModulos.some((m)=>moduloAtivoParaUsuario(user,m))) return json({error:"sem permissão para este módulo"},403);

    if (op==="kvGet") {
      const chave=params&&params.key;
      if (!chave) return json({error:"chave obrigatória"},400);
      const{data,error}=await admin.from(table).select("value").eq("key",chave).maybeSingle();
      if (error) throw error;
      return json({value:data?data.value:null});
    }
    if (op==="kvSet") {
      const chave=params&&params.key;
      if (!chave) return json({error:"chave obrigatória"},400);
      // v69: a chave é um identificador, não texto livre
      const chaveTxt=String(chave);
      if (chaveTxt.length>200||!/^[A-Za-z0-9_:.-]+$/.test(chaveTxt)) return json({error:"chave inválida"},400);
      const{error}=await admin.from(table).upsert({key:chaveTxt,value:params&&params.value,updated_at:new Date().toISOString()});
      if (error) throw error;
      // v69: kvSet deixa rastro. O autosave de rotina fica de fora para não afogar o log.
      if (!KV_AUTOSAVE.includes(chaveTxt) && !chaveTxt.startsWith("foto:")) {
        await auditar(userBase,senha,{acao:"kv",modulo:ROTULO_TABELA[table]||table,tabela:table,registro_id:chaveTxt,resumo:`Gravou a chave ${chaveTxt}`},req);
      }
      return json({ok:true});
    }
    if (op==="selectOne") {
      const{column,value}=params||{};
      if (!column) return json({error:"coluna obrigatória"},400);
      const{data,error}=await admin.from(table).select("*").eq(column,value).maybeSingle();
      if (error) throw error;
      if (data&&CAMPO_LOJA_POR_TABELA[table]&&!ehGestao(user)) {
        if (filtrarPorLojaDoUsuario([data],table,user).length===0) return json({data:null});
      }
      return json({data});
    }
    if (op==="selectAll") {
      const TAM_PAGINA=1000;
      const pagina1=async(from:number)=>{
        const{data:pg,error}=await admin.from(table).select("*")
          .order("created_at",{ascending:true}).order("id",{ascending:true})
          .range(from,from+TAM_PAGINA-1);
        if (error) throw error;
        return pg||[];
      };
      // v62: pega a 1ª página e, se veio cheia, descobre o total e busca o resto em paralelo (lotes de 8)
      let data: any[]=await pagina1(0);
      if (data.length>=TAM_PAGINA) {
        const{count,error:errC}=await admin.from(table).select("id",{count:"exact",head:true});
        if (errC||count==null) {
          for (let from=TAM_PAGINA; from<200000; from+=TAM_PAGINA) { const pg=await pagina1(from); data=data.concat(pg); if (pg.length<TAM_PAGINA) break; }
        } else {
          const inicios: number[]=[]; for (let f=TAM_PAGINA; f<count+TAM_PAGINA && f<200000; f+=TAM_PAGINA) inicios.push(f);
          for (let i=0;i<inicios.length;i+=8) {
            const lote=await Promise.all(inicios.slice(i,i+8).map(pagina1));
            for (const pg of lote) data=data.concat(pg);
          }
          // linhas gravadas durante a leitura: confere se ainda há uma página depois do total contado
          let ultima=data.length;
          while (ultima>0 && ultima%TAM_PAGINA===0 && ultima<200000) { const pg=await pagina1(ultima); if (!pg.length) break; data=data.concat(pg); ultima=data.length; if (pg.length<TAM_PAGINA) break; }
        }
      }
      if (params&&params.leve===true&&table==="produtos_estoque") data=data.map((r:any)=>{ if(r&&r.payload&&r.payload.site){ const{site:_s,...resto}=r.payload; return {...r,payload:resto}; } return r; });
      if ((table==="dp_funcionarios"||table==="dp_registros")&&!ehGestao(user)) {
        const meu=user.funcionarioId||null;
        if (!meu) return json({data:[]});
        return json({data:(data||[]).filter((row: any)=>row.payload&&row.payload.funcionarioId===meu)});
      }
      return json({data:filtrarPorLojaDoUsuario(data||[],table,user)});
    }
    if (op==="selectPage") {
      const from=Number((params&&params.from)||0);
      const tamanho=Math.min(Math.max(Number((params&&params.tamanho)||1000),1),PAGINA_MAX);
      if (!Number.isFinite(from)||from<0) return json({error:"posição inválida"},400);
      const query=admin.from(table).select("*");
      if (table==="estoque_movimentos"&&params&&params.produtoId) query.eq("produto_id",params.produtoId);
      const{data,error}=await query.order("created_at",{ascending:true}).order("id",{ascending:true}).range(from,from+tamanho-1);
      if (error) throw error;
      const brutas=data||[];
      let linhas: any[]=brutas;
      if ((table==="dp_funcionarios"||table==="dp_registros")&&!ehGestao(user)) {
        const meu=user.funcionarioId||null;
        linhas=meu?brutas.filter((row: any)=>row.payload&&row.payload.funcionarioId===meu):[];
      } else linhas=filtrarPorLojaDoUsuario(brutas,table,user);
      return json({data:linhas,fim:brutas.length<tamanho});
    }
    if (op==="upsert") {
      const row=params&&params.row;
      if (!row||typeof row!=="object") return json({error:"registro inválido"},400);
      // v47: o registro enviado precisa ser de uma loja do usuário...
      if (!podeEscreverRegistro(row.payload, table, user)) {
        return json({error:"sem permissão: este registro é de outra loja"},403);
      }
      // ...e, se já existir no banco, o que está lá também precisa ser
      if (!(await registroExistentePermitido(table, row.id, user))) {
        return json({error:"sem permissão: este registro é de outra loja"},403);
      }
      let antesRow: any = null;
      if (AUDITAR_TABELAS.includes(table) && row.id !== undefined && row.id !== null) { try { const { data: a } = await admin.from(table).select("payload").eq("id",row.id).maybeSingle(); antesRow = a; } catch {} }
      const{error}=await admin.from(table).upsert(row);
      if (error) throw error;
      if (AUDITAR_TABELAS.includes(table)) {
        const pa = antesRow ? antesRow.payload : null, pd = row.payload || null;
        const dif = pa && pd ? difObj(pa, pd) : null;
        if (!pa || (dif && Object.keys(dif).length)) {
          let acao = pa ? "editar" : "criar"; let extra = "";
          const sA = pa && pa.status, sD = pd && pd.status;
          if (pa && sA !== sD && sD !== undefined) { acao = /cancel/i.test(String(sD)) ? "cancelar" : "status"; extra = ` · status: ${sA||"—"} → ${sD}`; }
          else if (pa && pd && !pa.cancelada && pd.cancelada) acao = "cancelar";
          const campos = dif ? Object.keys(dif) : [];
          await auditar(userBase,senha,{acao,modulo:ROTULO_TABELA[table]||table,tabela:table,registro_id:row.id,resumo:`${nomeDoRegistro(pd||pa,row.id)}${extra}${campos.length&&!extra?" · campos: "+campos.slice(0,8).join(", "):""}`,detalhe:pa ? {alterados:dif} : {novo:cortarValor(pd,4000)}},req);
        }
      }
      return json({ok:true});
    }
    if (op==="delete") {
      const{column,value}=params||{};
      if (!column) return json({error:"coluna obrigatória"},400);
      // v47: só apaga registro da própria loja
      if (!ehGestao(user) && CAMPO_LOJA_POR_TABELA[table]) {
        if (column !== "id") return json({error:"exclusão permitida apenas por id"},400);
        if (!(await registroExistentePermitido(table, value, user))) {
          return json({error:"sem permissão: este registro é de outra loja"},403);
        }
      }
      let apagados: any[] = [];
      if (AUDITAR_TABELAS.includes(table)) { try { const { data: a } = await admin.from(table).select("id,payload").eq(column,value).limit(20); apagados = a||[]; } catch {} }
      const{error}=await admin.from(table).delete().eq(column,value);
      if (error) throw error;
      for (const a of apagados) await auditar(userBase,senha,{acao:"excluir",modulo:ROTULO_TABELA[table]||table,tabela:table,registro_id:a.id,resumo:`Excluiu ${nomeDoRegistro(a.payload,a.id)}`,detalhe:{registroExcluido:cortarValor(a.payload,6000)}},req);
      return json({ok:true});
    }
    if (op==="deleteMany") {
      const ids=params&&params.ids;
      if (!Array.isArray(ids)||ids.length===0) return json({error:"lista de ids obrigatória"},400);
      if (ids.length>500) return json({error:"no máximo 500 por vez"},400);
      // v47: confere cada id antes de apagar em lote
      if (!ehGestao(user) && CAMPO_LOJA_POR_TABELA[table]) {
        for (const id of ids) {
          if (!(await registroExistentePermitido(table, id, user))) {
            return json({error:"sem permissão: a lista inclui registro de outra loja"},403);
          }
        }
      }
      let apagados: any[] = [];
      if (AUDITAR_TABELAS.includes(table)) { try { const { data: a } = await admin.from(table).select("id,payload").in("id",ids); apagados = a||[]; } catch {} }
      const{error}=await admin.from(table).delete().in("id",ids);
      if (error) throw error;
      for (const a of apagados) await auditar(userBase,senha,{acao:"excluir",modulo:ROTULO_TABELA[table]||table,tabela:table,registro_id:a.id,resumo:`Excluiu ${nomeDoRegistro(a.payload,a.id)}`,detalhe:{registroExcluido:cortarValor(a.payload,6000)}},req);
      return json({ok:true,excluidos:ids.length});
    }
    return json({error:"operação desconhecida"},400);
  } catch(e) { console.error(e); return json({error:String(e)},500); }
}

/* v69: CORS num lugar só. A resposta sai como antes; aqui só se troca o
   Access-Control-Allow-Origin de "*" pelo endereço de quem chamou, se ele for do app. */
const ORIGENS_FIXAS = [
  "https://vilaca.app",
  "https://www.vilaca.app",
  "https://teste.vilaca.app",
  "https://treino.vilaca.app",
  "https://vilaca-controle-lojas.vercel.app",
];
function origemLiberada(req: Request): string {
  const o = String(req.headers.get("origin") || "");
  if (ORIGENS_FIXAS.includes(o)) return o;
  if (/^https:\/\/[a-z0-9-]+\.vilaca\.app$/.test(o)) return o;                                  // subdomínio novo
  if (/^https:\/\/(vilaca-)?controle-lojas-[a-z0-9-]+\.vercel\.app$/.test(o)) return o;          // prévia da Vercel
  return ORIGENS_FIXAS[0];
}
Deno.serve(async (req: Request) => {
  const res = await atender(req);
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", origemLiberada(req));
  h.set("Vary", "Origin");
  return new Response(res.body, { status: res.status, headers: h });
});
