// db-gateway v30
// v20: PROTEÇÃO ANTI-SOBRESCRITA no saveConfig (bloqueia config vazia por cima da real,
// preserva senhas) + op mergeConfigKey (salva só uma chave, ex.: gastosConfig).
// v21: op selectPage (lê a tabela em páginas — o PostgREST corta a resposta em 1000
// linhas, então tabelas grandes como clientes_cadastro chegavam truncadas no app) +
// op deleteMany (exclui vários ids de uma vez, usado na mesclagem de clientes).
// v22: novo módulo "caixa" (Caixa, agora item próprio da sidebar, fora do Vendas) —
// liberado como LEITURA em gastos, vendas_pdv e painel_ordens_kv, pra montar o
// relatório de movimentação (não grava nada nessas tabelas, só lê).
// v24: módulo Loja (multi-loja por funcionário) — a resposta do login agora inclui
// "lojas" (lista de ids de loja liberados pro usuário), usada pelo shell pra mostrar
// o seletor de loja. O nível de acesso já não é mais derivado do cargo — vem do que a
// diretoria salvou na aba Acesso (ver função funcionario-acesso v2).
// v25: nova tabela envio_diretoria_controle (aba "Envio Diretoria" do módulo de
// Transferências — loja manda peça pro escritório, mesmo padrão de preenchimento da
// Reposição, mas invertido). Liberada sob o mesmo módulo "transferencias".
// v30: módulo Gravações — a tabela gravacoes_kv (chave/valor) não estava conseguindo
// gravar direto pelo anon key (RLS bloqueava a escrita mesmo com policy nenhuma
// aparente). Passa a gravar/ler por aqui, com a service role key, que nunca esbarra
// em RLS. Novos ops genéricos kvGet/kvSet pra tabelas no formato chave/valor
// (colunas key/value/updated_at, diferente do id/payload usado no resto do banco).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const TABELAS_PERMITIDAS: Record<string, string | string[]> = {
  painel_ordens_kv: ["os", "ia", "dp", "config", "caixa"],
  transferencias_controle: ["transferencias", "ia"],
  reposicao_controle: ["transferencias", "ia"],
  envio_diretoria_controle: ["transferencias", "ia"],
  vendas_pdv: ["vendas", "os", "config", "conciliacao", "ia", "dp", "caixa"],
  produtos_estoque: ["vendas", "ia"],
  orcamentos: ["orcamentos", "os", "vendas", "ia", "marketing"],
  venda_pg: ["vendapg", "ia"],
  dp_funcionarios: ["dp", "config", "ia", "dashboard"],
  dp_registros: ["dp", "ia"],
  clientes_cadastro: ["os", "vendas", "orcamentos", "ia", "marketing", "config"],
  marketing_mensagens: ["marketing"],
  gastos: ["gastos", "dashboard", "caixa"],
  gastos_fixos: ["gastos"],
  ia_memoria: ["ia"],
  gravacoes_kv: ["gravacoes"],
};

async function getConfigPayload(): Promise<any> {
  const { data, error } = await admin
    .from("gestao_config")
    .select("payload")
    .eq("id", "config")
    .maybeSingle();
  if (error) throw error;
  return (data && data.payload) || {};
}

function nivelDoFuncionario(cargos: string[]): string {
  const lista = cargos || [];
  if (lista.includes("diretor")) return "diretoria";
  if (lista.includes("gerente")) return "gerente";
  if (lista.includes("vendedora")) return "vendedora";
  if (lista.includes("oficina")) return "oficina";
  return "vendedora";
}

function findUserBySenha(config: any, senha: string): any {
  if (!senha) return null;
  const usersAntigos = Array.isArray(config.users) ? config.users : [];
  const legado = usersAntigos.find((u: any) => u.senha === senha);
  if (legado) return legado;
  const funcionarios = Array.isArray(config.funcionarios) ? config.funcionarios : [];
  const func = funcionarios.find((f: any) => f.senhaDefinida && f.senha === senha);
  if (func) {
    return {
      id: func.id,
      nome: func.nome,
      nivel: nivelDoFuncionario(func.cargos),
      permissoes: null,
      funcionarioId: func.id,
    };
  }
  return null;
}

function moduloAtivoParaUsuario(user: any, moduloId: string): boolean {
  const perm = user.permissoes;
  if (perm && perm[moduloId] && typeof perm[moduloId].ativo === "boolean") {
    return perm[moduloId].ativo;
  }
  if (user.nivel === "diretoria" || user.nivel === "gerente") return true;
  if (user.nivel === "oficina") return moduloId === "os" || moduloId === "dashboard" || moduloId === "dp" || moduloId === "ia" || moduloId === "gravacoes";
  return moduloId !== "config" || (perm && perm.config && perm.config.ativo === true);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "json inválido" }, 400);
  }

  const { op, senha, table, params } = body || {};
  if (!op) return json({ error: "operação obrigatória" }, 400);

  try {
    const config = await getConfigPayload();

    if (op === "login") {
      const user = findUserBySenha(config, senha);
      if (!user) return json({ ok: false });
      return json({
        ok: true,
        user: {
          id: user.id,
          nome: user.nome,
          nivel: user.nivel,
          permissoes: user.permissoes || null,
          funcionarioId: user.funcionarioId || null,
          lojas: Array.isArray(user.lojas) ? user.lojas : [],
        },
      });
    }

    if (op === "confirmarSenhaFuncionario") {
      const { token, novaSenha } = params || {};
      if (!token || !novaSenha) return json({ error: "token e nova senha são obrigatórios" }, 400);
      if (String(novaSenha).length < 4) return json({ error: "a senha precisa ter pelo menos 4 caracteres" }, 400);
      const funcionarios = Array.isArray(config.funcionarios) ? config.funcionarios : [];
      const idx = funcionarios.findIndex((f: any) => f.tokenConfirmacao === token);
      if (idx === -1) return json({ error: "Link inválido. Peça um novo à diretoria." }, 400);
      if (!funcionarios[idx].tokenExpiraEm || funcionarios[idx].tokenExpiraEm < Date.now()) {
        return json({ error: "Esse link expirou. Peça um novo à diretoria." }, 400);
      }
      funcionarios[idx].senha = novaSenha;
      funcionarios[idx].senhaDefinida = true;
      funcionarios[idx].tokenConfirmacao = null;
      funcionarios[idx].tokenExpiraEm = null;
      const novoPayload = { ...config, funcionarios };
      const { error } = await admin
        .from("gestao_config")
        .upsert({ id: "config", payload: novoPayload, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true, nome: funcionarios[idx].nome });
    }

    const user = findUserBySenha(config, senha);
    if (!user) return json({ error: "não autorizado" }, 401);

    if (op === "enviarConfirmacaoSenha") {
      if (user.nivel !== "diretoria") return json({ error: "sem permissão" }, 403);
      const { funcionarioId } = params || {};
      const funcionarios = Array.isArray(config.funcionarios) ? config.funcionarios : [];
      const idx = funcionarios.findIndex((f: any) => f.id === funcionarioId);
      if (idx === -1) return json({ error: "funcionário não encontrado" }, 404);
      const token = crypto.randomUUID();
      funcionarios[idx].tokenConfirmacao = token;
      funcionarios[idx].tokenExpiraEm = Date.now() + 1000 * 60 * 60 * 48;
      const novoPayload = { ...config, funcionarios };
      const { error } = await admin
        .from("gestao_config")
        .upsert({ id: "config", payload: novoPayload, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true, token });
    }

    if (op === "getConfig") {
      const permConfig = user.permissoes && user.permissoes.config;
      const podeVerAcessos =
        user.nivel === "diretoria" ||
        (permConfig && permConfig.abas && permConfig.abas.acessos === true);
      const out = JSON.parse(JSON.stringify(config));
      if (!podeVerAcessos && Array.isArray(out.users)) {
        out.users = out.users.map((u: any) => {
          const { senha: _senha, ...resto } = u;
          return resto;
        });
      }
      return json({ data: out });
    }

    if (op === "saveConfig") {
      const permConfig = user.permissoes && user.permissoes.config;
      const podeSalvar = user.nivel === "diretoria" || (permConfig && permConfig.ativo === true);
      if (!podeSalvar) return json({ error: "sem permissão para alterar configurações" }, 403);
      const payload = params && params.payload;
      if (!payload || typeof payload !== "object") return json({ error: "payload inválido" }, 400);
      // ===== PROTEÇÃO ANTI-SOBRESCRITA (não deixa uma config vazia apagar a real) =====
      const atualUsers = Array.isArray(config.users) ? config.users : [];
      const novoUsers = Array.isArray(payload.users) ? payload.users : [];
      const atualLojas = Array.isArray(config.lojas) ? config.lojas : [];
      const novoLojas = Array.isArray(payload.lojas) ? payload.lojas : [];
      if (atualUsers.length > 0 && novoUsers.length === 0) {
        console.error("saveConfig BLOQUEADO: config sem users (atual tem " + atualUsers.length + ")");
        return json({ error: "salvamento bloqueado: a configuração enviada apagaria os usuários. Recarregue a página e tente de novo." }, 409);
      }
      if (atualLojas.length > 0 && novoLojas.length === 0) {
        console.error("saveConfig BLOQUEADO: config sem lojas");
        return json({ error: "salvamento bloqueado: a configuração enviada apagaria as lojas. Recarregue a página e tente de novo." }, 409);
      }
      if (novoUsers.length > 0) {
        payload.users = novoUsers.map((u: any) => {
          if (u && !u.senha) {
            const atual = atualUsers.find((a: any) => a.id === u.id);
            if (atual && atual.senha) return { ...u, senha: atual.senha };
          }
          return u;
        });
      }
      const { error } = await admin
        .from("gestao_config")
        .upsert({ id: "config", payload, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }

    if (op === "mergeConfigKey") {
      const CHAVES_PERMITIDAS: Record<string, string> = { gastosConfig: "gastos", metasMensais: "dashboard" };
      const key = params && params.key;
      const value = params && params.value;
      if (!key || !(key in CHAVES_PERMITIDAS)) return json({ error: "chave não permitida" }, 400);
      if (!moduloAtivoParaUsuario(user, CHAVES_PERMITIDAS[key])) return json({ error: "sem permissão" }, 403);
      const novoPayload = { ...config, [key]: value };
      const { error } = await admin
        .from("gestao_config")
        .upsert({ id: "config", payload: novoPayload, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }

    if (op === "bumpViaSequence") {
      if (!moduloAtivoParaUsuario(user, "os") && !moduloAtivoParaUsuario(user, "gravacoes")) return json({ error: "sem permissão" }, 403);
      const loja = params && params.loja;
      if (!loja) return json({ error: "loja obrigatória" }, 400);
      // Incremento ATÔMICO no banco (tabela via_sequences), em vez de ler a config
      // inteira, somar 1 em memória e gravar de volta — isso evitava uma corrida:
      // duas pessoas salvando ao mesmo tempo podiam sair com o MESMO número de via.
      const { data, error } = await admin.rpc("incrementar_via_sequence", { p_chave: loja });
      if (error) throw error;
      return json({ ok: true, proximo: data });
    }

    if (op === "searchClients") {
      if (!moduloAtivoParaUsuario(user, "os") && !moduloAtivoParaUsuario(user, "vendas") && !moduloAtivoParaUsuario(user, "orcamentos") && !moduloAtivoParaUsuario(user, "marketing")) {
        return json({ error: "sem permissão" }, 403);
      }
      const termoBruto = String((params && params.termo) || "").trim();
      if (termoBruto.length < 2) return json({ data: [] });
      // remove vírgula (quebraria a sintaxe do .or() do PostgREST) e limita o tamanho
      const termo = termoBruto.replace(/,/g, " ").slice(0, 60);
      const { data, error } = await admin
        .from("clientes_cadastro")
        .select("id, payload")
        .or(`payload->>nome.ilike.%${termo}%,payload->>telefone.ilike.%${termo}%,payload->>cpf.ilike.%${termo}%`)
        .limit(10);
      if (error) throw error;
      return json({ data: (data || []).map((r: any) => r.payload) });
    }

    if (!table || !(table in TABELAS_PERMITIDAS)) return json({ error: "tabela inválida" }, 400);
    const modulosPermitidos = TABELAS_PERMITIDAS[table];
    const listaModulos = Array.isArray(modulosPermitidos) ? modulosPermitidos : [modulosPermitidos];
    const temAcesso = listaModulos.some((m) => moduloAtivoParaUsuario(user, m));
    if (!temAcesso) {
      return json({ error: "sem permissão para este módulo" }, 403);
    }

    // ---------- OPS GENÉRICOS PRA TABELAS CHAVE/VALOR (colunas key/value/updated_at) ----------
    if (op === "kvGet") {
      const chave = params && params.key;
      if (!chave) return json({ error: "chave obrigatória" }, 400);
      const { data, error } = await admin.from(table).select("value").eq("key", chave).maybeSingle();
      if (error) throw error;
      return json({ value: data ? data.value : null });
    }
    if (op === "kvSet") {
      const chave = params && params.key;
      if (!chave) return json({ error: "chave obrigatória" }, 400);
      const valor = params && params.value;
      const { error } = await admin.from(table).upsert({ key: chave, value: valor, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }

    if (op === "selectOne") {
      const { column, value } = params || {};
      if (!column) return json({ error: "coluna obrigatória" }, 400);
      const { data, error } = await admin.from(table).select("*").eq(column, value).maybeSingle();
      if (error) throw error;
      return json({ data });
    }

    if (op === "selectAll") {
      const { data, error } = await admin.from(table).select("*").order("created_at", { ascending: true });
      if (error) throw error;
      if ((table === "dp_funcionarios" || table === "dp_registros") && user.nivel !== "diretoria" && user.nivel !== "gerente") {
        const meuFuncionarioId = user.funcionarioId || null;
        if (!meuFuncionarioId) return json({ data: [] });
        const filtrado = (data || []).filter((row: any) => row.payload && row.payload.funcionarioId === meuFuncionarioId);
        return json({ data: filtrado });
      }
      return json({ data });
    }

    if (op === "selectPage") {
      const from = Number((params && params.from) || 0);
      const tamanho = Math.min(Math.max(Number((params && params.tamanho) || 1000), 1), 1000);
      if (!Number.isFinite(from) || from < 0) return json({ error: "posição inválida" }, 400);
      const { data, error } = await admin
        .from(table)
        .select("*")
        .order("created_at", { ascending: true })
        .range(from, from + tamanho - 1);
      if (error) throw error;
      const brutas = data || [];
      let linhas: any[] = brutas;
      if ((table === "dp_funcionarios" || table === "dp_registros") && user.nivel !== "diretoria" && user.nivel !== "gerente") {
        const meuFuncionarioId = user.funcionarioId || null;
        linhas = meuFuncionarioId
          ? brutas.filter((row: any) => row.payload && row.payload.funcionarioId === meuFuncionarioId)
          : [];
      }
      return json({ data: linhas, fim: brutas.length < tamanho });
    }

    if (op === "upsert") {
      const row = params && params.row;
      if (!row || typeof row !== "object") return json({ error: "registro inválido" }, 400);
      const { error } = await admin.from(table).upsert(row);
      if (error) throw error;
      return json({ ok: true });
    }

    if (op === "delete") {
      const { column, value } = params || {};
      if (!column) return json({ error: "coluna obrigatória" }, 400);
      const { error } = await admin.from(table).delete().eq(column, value);
      if (error) throw error;
      return json({ ok: true });
    }

    if (op === "deleteMany") {
      const ids = params && params.ids;
      if (!Array.isArray(ids) || ids.length === 0) return json({ error: "lista de ids obrigatória" }, 400);
      if (ids.length > 500) return json({ error: "no máximo 500 por vez" }, 400);
      const { error } = await admin.from(table).delete().in("id", ids);
      if (error) throw error;
      return json({ ok: true, excluidos: ids.length });
    }

    return json({ error: "operação desconhecida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
