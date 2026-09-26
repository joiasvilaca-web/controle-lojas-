// backup-export v1
// Exporta um snapshot completo (JSON) das tabelas de dados reais do app, para o
// usuário baixar no próprio computador. Só leitura, só Diretoria.
//
// Deliberadamente NÃO inclui: atendimento_segredos (chave Evolution API), a linha
// id='segredos' de reforma_config (credenciais dos Correios), e as tabelas de
// backup/lixo histórico (clientes_cadastro_backup_*, *_backup_pre_*, customers,
// inventory) — para não inflar o arquivo nem expor segredos num arquivo solto.

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
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

// Tabelas incluídas no backup — todas as tabelas de dados reais do app (não segredos, não lixo histórico).
const TABELAS_BACKUP = [
  "gestao_config", "clientes_cadastro", "ordens_servico", "vendas_pdv", "orcamentos",
  "reforma_pedidos", "reforma_config", "dp_funcionarios", "dp_registros", "gastos", "gastos_fixos",
  "produtos_estoque", "transferencias_controle", "reposicao_controle", "via_sequences",
  "estoque_movimentos", "atendimento_conversas", "atendimento_mensagens", "marketing_mensagens",
  "controle_config", "gravacoes_kv", "gravacoes_pedidos", "painel_ordens_kv",
  "envio_diretoria_controle", "ia_memoria",
];

async function getConfigPayload(): Promise<any> {
  const { data, error } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  if (error) throw error;
  return (data && data.payload) || {};
}
function sessoesVivas(u: any): any[] {
  const agora = Date.now();
  return (Array.isArray(u.sessoes) ? u.sessoes : []).filter((s: any) => s && s.token && (!s.exp || Number(s.exp) > agora));
}
function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_")) return false;
  if (u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return sessoesVivas(u).some((s: any) => s.token === senha);
}

/** Busca todas as linhas de uma tabela, paginado (mesmo padrão do db-gateway selectAll). */
async function selectAll(table: string): Promise<any[]> {
  const TAM_PAGINA = 1000;
  let data: any[] = [];
  for (let from = 0; from < 200000; from += TAM_PAGINA) {
    const { data: pagina, error } = await admin.from(table).select("*").range(from, from + TAM_PAGINA - 1);
    if (error) throw error;
    data = data.concat(pagina || []);
    if (!pagina || pagina.length < TAM_PAGINA) break;
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  const senha = body?.senha;

  try {
    const config = await getConfigPayload();
    const user = (Array.isArray(config.users) ? config.users : []).find((u: any) => sessaoValida(u, senha)) || null;
    if (!user) return json({ error: "Sessão inválida ou expirada. Faça login de novo." }, 401);
    if (user.nivel !== "diretoria") return json({ error: "Só a Diretoria pode gerar o backup completo." }, 403);

    const tabelas: Record<string, any[]> = {};
    const resumo: Record<string, number> = {};
    for (const t of TABELAS_BACKUP) {
      try {
        let linhas = await selectAll(t);
        // reforma_config guarda credenciais dos Correios na linha id='segredos' — nunca sai no backup.
        if (t === "reforma_config") linhas = linhas.filter((r: any) => r.id !== "segredos");
        tabelas[t] = linhas;
        resumo[t] = linhas.length;
      } catch (e) {
        // tabela pode não existir mais / ter sido renomeada — não derruba o backup inteiro por isso
        tabelas[t] = [];
        resumo[t] = -1;
        console.error(`backup: falha ao ler ${t}`, e);
      }
    }

    const saida = {
      app: "Gestão e Controle — Vilaça Joias",
      geradoEm: new Date().toISOString(),
      geradoPor: user.nome,
      aviso: "Este arquivo NÃO contém senhas de sistemas externos (Evolution API, Correios) — reconfigure-as manualmente após uma restauração. Contém hashes de senha dos usuários (bcrypt, seguro, mas mantenha este arquivo em local privado).",
      resumo,
      tabelas,
    };

    const nomeArquivo = `backup_gestao_controle_${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/(\d{8})(\d{4})/, "$1_$2")}.json`;
    return new Response(JSON.stringify(saida), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${nomeArquivo}"` },
    });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
