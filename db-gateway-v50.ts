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
const CAMPOS_PROTEGIDOS_USER = ["senha","senhaHash","sessaoExpiraEm","sessoes","tentativasFalhas","bloqueado","bloqueadoEm"];

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

async function getConfigPayload(): Promise<any> {
  const { data, error } = await admin.from("gestao_config").select("payload").eq("id","config").maybeSingle();
  if (error) throw error;
  return (data&&data.payload)||{};
}
async function salvarConfigPayload(payload: any) {
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
function userPublico(user: any) {
  return { id:user.id, nome:user.nome, nivel:user.nivel, permissoes:user.permissoes||null, funcionarioId:user.funcionarioId||null, lojas:Array.isArray(user.lojas)?user.lojas:[] };
}
function moduloAtivoParaUsuario(user: any, moduloId: string): boolean {
  const perm = user.permissoes;
  if (perm&&perm[moduloId]&&typeof perm[moduloId].ativo==="boolean") return perm[moduloId].ativo;
  if (user.nivel==="diretoria"||user.nivel==="gerente") return true;
  if (user.nivel==="oficina") return ["os","dashboard","dp","ia","gravacoes"].includes(moduloId);
  return moduloId!=="config"||(perm&&perm.config&&perm.config.ativo===true);
}

Deno.serve(async (req: Request) => {
  if (req.method==="OPTIONS") return new Response(null,{headers:CORS_HEADERS});
  if (req.method!=="POST") return json({error:"method not allowed"},405);
  let body: any;
  try { body = await req.json(); } catch { return json({error:"json inválido"},400); }
  const { op, senha, table, params } = body||{};
  if (!op) return json({error:"operação obrigatória"},400);

  try {
    const config = await getConfigPayload();

    if (op==="login") {
      const usuario = body.usuario;
      if (!usuario||!senha) return json({ok:false,motivo:"informe usuário e senha"});
      const candidatos = usuariosPorNome(config,usuario);
      if (candidatos.length===0) return json({ok:false});
      if (candidatos.every((u: any)=>u.bloqueado)) return json({ok:false,bloqueado:true});
      let achado: any = null;
      for (const u of candidatos) { if (u.bloqueado||!u.senhaHash) continue; if (bcrypt.compareSync(String(senha),u.senhaHash)){achado=u;break;} }
      if (!achado) {
        let maiorTentativas = 0;
        for (const u of candidatos) {
          if (u.bloqueado) continue;
          u.tentativasFalhas=(Number(u.tentativasFalhas)||0)+1;
          if (u.tentativasFalhas>=MAX_TENTATIVAS){u.bloqueado=true;u.bloqueadoEm=new Date().toISOString();derrubarTodasSessoes(u);}
          maiorTentativas=Math.max(maiorTentativas,u.tentativasFalhas);
        }
        await salvarConfigPayload(config);
        const bloqueado = candidatos.some((u: any)=>u.bloqueado);
        return json({ok:false,bloqueado,tentativasRestantes:bloqueado?0:Math.max(0,MAX_TENTATIVAS-maiorTentativas)});
      }
      achado.tentativasFalhas=0;
      const s = abrirSessao(achado,req.headers.get("user-agent"));
      await salvarConfigPayload(config);
      return json({ok:true,token:s.token,expiraEm:s.exp,user:userPublico(achado)});
    }
    if (op==="validarSessao") {
      const user = findUserBySenha(config,senha);
      if (!user) return json({ok:false});
      const sess = sessoesVivas(user).find((s: any)=>s.token===senha);
      return json({ok:true,token:senha,expiraEm:sess?sess.exp:(user.sessaoExpiraEm||null),user:userPublico(user)});
    }
    if (op==="logout") {
      const user = findUserBySenha(config,senha);
      if (user) {
        user.sessoes=sessoesVivas(user).filter((s: any)=>s.token!==senha);
        if (user.senha===senha){const ultima=user.sessoes[user.sessoes.length-1];user.senha=ultima?ultima.token:null;user.sessaoExpiraEm=ultima?ultima.exp:null;}
        await salvarConfigPayload(config);
      }
      return json({ok:true});
    }

    const user = findUserBySenha(config,senha);
    if (!user) return json({error:"não autorizado"},401);

    if (op==="getConfig") {
      const out = JSON.parse(JSON.stringify(config));
      if (Array.isArray(out.users)) out.users=out.users.map((u: any)=>{const{senha:_s,senhaHash:_h,sessaoExpiraEm:_e,sessoes:_ss,...resto}=u;return resto;});
      if (Array.isArray(out.funcionarios)) out.funcionarios=out.funcionarios.map((f: any)=>{const{senha:_s,senhaHash:_h,...resto}=f;return resto;});
      return json({data:out});
    }
    if (op==="saveConfig") {
      const permConfig=user.permissoes&&user.permissoes.config;
      const podeSalvar=user.nivel==="diretoria"||(permConfig&&permConfig.ativo===true);
      if (!podeSalvar) return json({error:"sem permissão para alterar configurações"},403);
      const payload=params&&params.payload;
      if (!payload||typeof payload!=="object") return json({error:"payload inválido"},400);
      const atualUsers=Array.isArray(config.users)?config.users:[];
      const novoUsers=Array.isArray(payload.users)?payload.users:[];
      const atualLojas=Array.isArray(config.lojas)?config.lojas:[];
      const novoLojas=Array.isArray(payload.lojas)?payload.lojas:[];
      if (atualUsers.length>0&&novoUsers.length===0) return json({error:"salvamento bloqueado: a configuração enviada apagaria os usuários. Recarregue a página e tente de novo."},409);
      if (atualLojas.length>0&&novoLojas.length===0) return json({error:"salvamento bloqueado: a configuração enviada apagaria as lojas. Recarregue a página e tente de novo."},409);
      if (novoUsers.length>0) payload.users=novoUsers.map((u: any)=>{if(!u)return u;const atual=atualUsers.find((a: any)=>a.id===u.id);const saida: any={...u};for(const campo of CAMPOS_PROTEGIDOS_USER){if(atual&&campo in atual)saida[campo]=atual[campo];else delete saida[campo];}return saida;});
      if (Array.isArray(payload.funcionarios)) payload.funcionarios=payload.funcionarios.map((f: any)=>{if(!f)return f;const{senha:_s,senhaHash:_h,...resto}=f;return resto;});
      for (const k of ["atendimentoInstancias"]) if (config[k]!==undefined&&payload[k]===undefined) payload[k]=config[k];
      await salvarConfigPayload(payload);
      return json({ok:true});
    }
    if (op==="mergeConfigKey") {
      const CHAVES_PERMITIDAS: Record<string,string>={gastosConfig:"gastos",metasMensais:"dashboard"};
      const key=params&&params.key;const value=params&&params.value;
      if (!key||!(key in CHAVES_PERMITIDAS)) return json({error:"chave não permitida"},400);
      if (!moduloAtivoParaUsuario(user,CHAVES_PERMITIDAS[key])) return json({error:"sem permissão"},403);
      await salvarConfigPayload({...config,[key]:value});
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
      return json({ok:true,saldoNovo:data});
    }
    if (op==="searchClients") {
      if (!moduloAtivoParaUsuario(user,"os")&&!moduloAtivoParaUsuario(user,"vendas")&&!moduloAtivoParaUsuario(user,"orcamentos")&&!moduloAtivoParaUsuario(user,"marketing")) return json({error:"sem permissão"},403);
      const termoBruto=String((params&&params.termo)||"")
        .trim();
      if (termoBruto.length<2) return json({data:[]});
      const termo=termoBruto.replace(/,/g," ").slice(0,60);
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

    if (op==="buscarPorCodigoVia") {
      const codigo=String((params&&params.codigo)||"")
        .trim().toUpperCase();
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
        const{data,error}=await admin.from("ordens_servico").select("id,payload").eq("payload->>codigoVia",codigo).limit(1);
        if (!error&&data&&data.length>0) {
          const reg=filtrarPorLojaDoUsuario(data,"ordens_servico",user)[0]?.payload||null;
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
      const{error}=await admin.from(table).upsert({key:chave,value:params&&params.value,updated_at:new Date().toISOString()});
      if (error) throw error;
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
      let data: any[]=[];
      for (let from=0; from<200000; from+=TAM_PAGINA) {
        const{data:pagina,error}=await admin.from(table).select("*")
          .order("created_at",{ascending:true}).order("id",{ascending:true})
          .range(from,from+TAM_PAGINA-1);
        if (error) throw error;
        data=data.concat(pagina||[]);
        if (!pagina||pagina.length<TAM_PAGINA) break;
      }
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
      const{error}=await admin.from(table).upsert(row);
      if (error) throw error;
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
      const{error}=await admin.from(table).delete().eq(column,value);
      if (error) throw error;
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
      const{error}=await admin.from(table).delete().in("id",ids);
      if (error) throw error;
      return json({ok:true,excluidos:ids.length});
    }
    return json({error:"operação desconhecida"},400);
  } catch(e) { console.error(e); return json({error:String(e)},500); }
});
