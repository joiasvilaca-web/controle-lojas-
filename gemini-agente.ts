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

async function usuarioValido(senha: string): Promise<{ ok: boolean; user?: any }> {
  if (!senha) return { ok: false };
  const { data, error } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  if (error || !data) return { ok: false };
  const users = (data.payload && data.payload.users) || [];
  const u = users.find((u: any) => u.senha === senha);
  if (!u) return { ok: false };
  return { ok: true, user: u };
}

function permissoesEfetivas(user: any): Record<string, boolean> {
  const nivel = user?.nivel || "";
  let padrao: Record<string, boolean>;
  if (nivel === "diretoria" || nivel === "gerente") {
    padrao = { vendas: true, os: true, orcamentos: true, marketing: true, gastos: true, conciliacao: true, transferencias: true, dp: true, config: true };
  } else if (nivel === "oficina") {
    padrao = { vendas: false, os: true, orcamentos: false, marketing: false, gastos: false, conciliacao: false, transferencias: false, dp: true, config: false };
  } else {
    padrao = { vendas: true, os: true, orcamentos: true, marketing: true, gastos: true, conciliacao: false, transferencias: true, dp: true, config: true };
  }
  const customizado = user?.permissoes || {};
  const efetivo: Record<string, boolean> = { ...padrao };
  for (const modulo of Object.keys(padrao)) {
    if (customizado[modulo] && typeof customizado[modulo].ativo === "boolean") {
      efetivo[modulo] = customizado[modulo].ativo;
    }
  }
  return efetivo;
}
function estoqueTotalDe(produto: any): number {
  if (produto && produto.estoquePorLoja && typeof produto.estoquePorLoja === "object") {
    return Object.values(produto.estoquePorLoja).reduce((acc: number, v: any) => acc + (Number(v) || 0), 0);
  }
  return Number(produto?.estoque) || 0;
}

/**
 * Mesmo princípio de segurança do ia-chat.ts: o resumo de dados é montado AQUI no
 * servidor (com a service_role), já filtrado pela permissão de quem está logado —
 * nunca confiamos num "resumoDados" que o navegador mande pronto (isso permitia
 * inflar números ou fingir ter outro nível de acesso pra enganar a IA).
 * Cobre o modo de PERGUNTA (chat livre). O modo "monitoramento" (que varre um
 * retrato bem mais amplo do sistema pra achar alertas) continua recebendo o resumo
 * do navegador por enquanto — ver aviso no corpo do handler.
 */
async function montarResumoNoServidor(user: any) {
  const nivel = user?.nivel || "";
  const veLucro = nivel === "diretoria" || nivel === "gerente";
  const perm = permissoesEfetivas(user);

  async function ler(table: string): Promise<any[]> {
    try {
      const { data, error } = await admin.from(table).select("payload");
      if (error || !data) return [];
      return data.map((r: any) => r.payload).filter(Boolean);
    } catch { return []; }
  }
  async function lerKv(table: string, chave: string): Promise<any[]> {
    try {
      const { data, error } = await admin.from(table).select("value").eq("key", chave).maybeSingle();
      if (error || !data) return [];
      return Array.isArray(data.value) ? data.value : [];
    } catch { return []; }
  }

  let lojas: string[] = [];
  try {
    const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    lojas = ((data?.payload?.lojas) || []).map((l: any) => l.nome);
  } catch { /* ignora */ }

  const resumo: any = { dataDeHoje: new Date().toISOString().slice(0, 10), lojas };
  const acessosNegados: string[] = [];

  if (perm.vendas) {
    const vendas = await ler("vendas_pdv");
    resumo.totalVendasRegistradas = vendas.length;
    resumo.faturamentoTotalVendas = vendas.reduce((acc: number, v: any) => acc + (Number(v.valorTotal) || 0), 0);
  } else acessosNegados.push("vendas e faturamento");

  if (perm.os) {
    const ordens = await lerKv("painel_ordens_kv", "orders");
    resumo.totalOrdensServico = ordens.length;
  } else acessosNegados.push("ordens de serviço");

  if (perm.orcamentos) {
    const orcamentos = await ler("orcamentos");
    resumo.orcamentosAbertos = orcamentos.filter((o: any) => o.status && !["aprovado", "recusado"].includes(o.status)).length;
    resumo.totalOrcamentos = orcamentos.length;
  } else acessosNegados.push("orçamentos");

  if (perm.marketing) {
    const clientes = await ler("clientes_cadastro");
    const hoje = resumo.dataDeHoje as string;
    const mesDiaHoje = hoje.slice(5, 10);
    const mesHoje = hoje.slice(5, 7);
    resumo.aniversariantesHoje = clientes
      .filter((c: any) => (c.dataNascimento || "").slice(5, 10) === mesDiaHoje)
      .map((c: any) => ({ nome: c.nome, telefone: c.telefone }))
      .slice(0, 50);
    resumo.totalAniversariantesEsteMes = clientes.filter((c: any) => (c.dataNascimento || "").slice(5, 7) === mesHoje).length;
    resumo.totalClientesCadastrados = clientes.length;
  } else acessosNegados.push("clientes e aniversariantes (módulo Marketing)");

  const produtos = await ler("produtos_estoque");
  resumo.totalProdutosCadastrados = produtos.length;
  resumo.produtosEstoqueBaixo = produtos.filter((p: any) => estoqueTotalDe(p) <= 2).map((p: any) => p.nome).slice(0, 15);
  if (veLucro) {
    resumo.custoTotalEstoque = produtos.reduce((acc: number, p: any) => acc + (Number(p.custo) || 0) * estoqueTotalDe(p), 0);
  } else acessosNegados.push("custo, lucro e margem de produtos");

  if (perm.dp) {
    const funcionariosDp = await ler("dp_funcionarios");
    resumo.totalFuncionarios = funcionariosDp.length;
  } else acessosNegados.push("dados de funcionários/RH");

  if (nivel === "diretoria") {
    try {
      const gastos = await ler("gastos");
      resumo.financeiro = { totalLancamentosGastos: gastos.length };
    } catch { /* best-effort */ }
  } else {
    acessosNegados.push("financeiro/gastos (só a diretoria pode ver)");
  }

  resumo.categoriasSemAcessoParaEstePerfil = acessosNegados;
  return resumo;
}

const INSTRUCAO_SISTEMA = `Você é um assistente de IA integrado ao sistema de gestão da Vilaça Joias, uma rede de joalherias no Brasil, e também pode responder perguntas gerais como qualquer assistente de IA.
Responda SEMPRE em português do Brasil, de forma direta e objetiva (poucos parágrafos, sem enrolação).
Se a pergunta for sobre o negócio, vendas, clientes, funcionários ou qualquer dado do sistema, use APENAS o resumo de dados fornecido abaixo pra responder — não invente números, e diga claramente se a informação não estiver no resumo.
Se a pergunta não tiver nada a ver com o negócio (ex: uma dúvida geral, uma conta, uma explicação sobre qualquer assunto), responda normalmente com seu conhecimento geral, como faria qualquer assistente de IA — não precisa forçar relação com os dados da loja.
Não dê conselhos jurídicos, contábeis ou fiscais definitivos sobre a empresa — para isso, sempre sugira falar com o contador/advogado.`;

const INSTRUCAO_MONITORAMENTO = `Você é um assistente de monitoramento do sistema de gestão da Vilaça Joias (rede de joalherias no Brasil).
Vai receber um resumo bem amplo do estado atual do sistema (vendas, orçamentos, estoque, metas, avisos etc).
Sua tarefa: analisar esse resumo e identificar SE existe algo que realmente mereça a atenção da diretoria agora — um problema real, um risco, ou uma oportunidade clara de melhoria.
Seja bem seletivo: só aponte algo se for genuinamente relevante (não liste itens triviais ou já esperados).
Responda em JSON puro, sem texto antes ou depois, no formato exato:
{"temAlerta": true ou false, "titulo": "título curto (max 8 palavras)", "mensagem": "explicação objetiva em 1-2 frases, em português"}
Se não houver nada relevante pra apontar, responda {"temAlerta": false, "titulo": "", "mensagem": ""}.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "json inválido" }, 400);
  }

  const { senha, pergunta, resumoDados, modo } = body || {};
  if (modo !== "monitoramento" && !pergunta) return json({ error: "pergunta obrigatória" }, 400);

  const auth = await usuarioValido(senha);
  if (!auth.ok) return json({ error: "não autorizado" }, 401);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY não configurada ainda. Peça pra configurar a chave do Gemini." }, 503);
  const modelo = Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-flash-latest";

  try {
    // SEGURANÇA: no modo de pergunta livre, o resumo é montado AQUI no servidor,
    // filtrado pela permissão real de quem está logado — nunca confiamos no
    // resumoDados que o navegador mande. O modo "monitoramento" (varredura ampla
    // do sistema pra achar alertas, sem interação direta do usuário com o texto)
    // ainda usa o resumo vindo do navegador — fica registrado aqui como próximo
    // passo, não coberto nesta correção.
    const resumoSeguro = modo === "monitoramento" ? (resumoDados || {}) : await montarResumoNoServidor(auth.user);
    const promptCompleto = modo === "monitoramento"
      ? `${INSTRUCAO_MONITORAMENTO}\n\n--- RESUMO DO SISTEMA ---\n${JSON.stringify(resumoSeguro, null, 2)}\n--- FIM DO RESUMO ---`
      : `${INSTRUCAO_SISTEMA}\n\n--- RESUMO DOS DADOS DISPONÍVEIS ---\n${JSON.stringify(resumoSeguro, null, 2)}\n--- FIM DO RESUMO ---\n\nPergunta: ${pergunta}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptCompleto }] }],
        }),
      },
    );
    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      throw new Error(`Gemini respondeu ${res.status}: ${texto.slice(0, 300)}`);
    }
    const data = await res.json();
    const resposta = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    if (!resposta) throw new Error("Gemini não devolveu texto: " + JSON.stringify(data).slice(0, 300));

    if (modo === "monitoramento") {
      const limpo = resposta.trim().replace(/^```json\s*/i, "").replace(/^```\s*/,"").replace(/```\s*$/, "");
      try {
        const parsed = JSON.parse(limpo);
        return json(parsed);
      } catch {
        return json({ temAlerta: false, titulo: "", mensagem: "" });
      }
    }
    return json({ resposta });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
