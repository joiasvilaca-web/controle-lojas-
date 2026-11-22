// ajuda-ia v1 (22/11/2026): ASSISTENTE DA AJUDA — responde "como faço…" como um especialista do Vilaça App.
// Qualquer pessoa logada usa (sessão sess_… validada contra gestao_config, igual ao db-gateway). NÃO lê nenhum dado do negócio:
// a única base é o conteúdo da Ajuda publicado (APP_URL/ajuda-conteudo.js), lido do site e guardado por 10 min — a tela e o assistente
// usam o mesmo texto, então atualizar a Ajuda já ensina o assistente. Gemini (GEMINI_API_KEY, conta do Felipe, quota gratuita).
// Corpo: { senha, pergunta, historico?: [{ de:'eu'|'ia', texto }] } → { ok, resposta, topicos: [títulos da Ajuda citados] }.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const APP_URL = (Deno.env.get("APP_BASE_URL") || "https://vilaca.app").replace(/\/+$/, "");

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}

let BASE: { em: number; texto: string; titulos: string[] } | null = null;
/** Texto da Ajuda (sem HTML) + lista de títulos dos assuntos. */
async function baseAjuda() {
  if (BASE && Date.now() - BASE.em < 600000) return BASE;
  const r = await fetch(`${APP_URL}/ajuda-conteudo.js`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("não consegui ler a Ajuda (" + r.status + ")");
  const src = await r.text();
  const titulos = [...src.matchAll(/tit:'([^']+)'/g)].map((m) => m[1]);
  const texto = src
    .replace(/\$\{[^}]*\}/g, "")
    .replace(/<li>/g, "\n- ").replace(/<\/(p|div|ol|ul|h\d)>/g, "\n").replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ")
    .replace(/^\s*\/\*[\s\S]*?\*\/\s*$/gm, "")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
  BASE = { em: Date.now(), texto: texto.slice(0, 60000), titulos };
  return BASE;
}

function instrucao(nivel: string, nome: string) {
  return `Você é o ESPECIALISTA do Vilaça App, o sistema das joalherias Vilaça Joias (Juiz de Fora). Explique como usar o app para ${nome || "a pessoa"} (perfil: ${nivel || "funcionário"}), que está no balcão da loja e não é da área de tecnologia.
REGRAS:
- Responda em português do Brasil, simples e direto, como um colega experiente explicando.
- Para "como faço", dê PASSOS NUMERADOS curtos (1., 2., 3.), com o caminho do menu e o nome exato dos botões em **negrito** (ex.: **PDV** → **VENDA**).
- Use SOMENTE a base de conhecimento abaixo. Se ela não cobre a pergunta, diga com honestidade que não tem esse passo a passo na Ajuda e sugira perguntar à gerência ou ao Felipe. NUNCA invente botões, telas ou regras.
- Se a função depende de perfil (gerência, diretoria, oficina), avise.
- No máximo 160 palavras. Sem saudação longa.
- Na ÚLTIMA linha, escreva "VEJA: " seguido de 1 a 3 títulos de assuntos da Ajuda (copiados exatamente da lista) que ajudam, separados por " | ". Se nenhum servir, não escreva essa linha.
TÍTULOS DOS ASSUNTOS: ${"$"}{TITULOS}
--- BASE DE CONHECIMENTO (Ajuda do app) ---
${"$"}{BASE}
--- FIM DA BASE ---`;
}

async function gemini(prompt: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY"); if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  const modelo = Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-flash-latest";
  for (let t = 1; t <= 2; t++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, { method: "POST", headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 700 } }), signal: AbortSignal.timeout(30000) });
    if (r.ok) { const d = await r.json(); const txt = (d?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("").trim(); if (txt) return txt; throw new Error("resposta vazia"); }
    if (!(r.status === 429 || r.status === 503) || t === 2) throw new Error("IA respondeu " + r.status);
    await new Promise((res) => setTimeout(res, 900));
  }
  throw new Error("IA indisponível");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  const pergunta = String(b?.pergunta || "").trim().slice(0, 600);
  if (!pergunta) return json({ error: "escreva a sua dúvida" }, 400);
  const { data: cf } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  const users: any[] = (cf && cf.payload && cf.payload.users) || [];
  const user = users.find((u) => sessaoValida(u, String(b?.senha || "")));
  if (!user) return json({ error: "não autorizado" }, 401);
  try {
    const base = await baseAjuda();
    const hist = (Array.isArray(b?.historico) ? b.historico : []).slice(-6)
      .map((m: any) => `${m && m.de === "ia" ? "Especialista" : "Pessoa"}: ${String((m && m.texto) || "").slice(0, 500)}`).join("\n");
    const prompt = instrucao(String(user.nivel || ""), String(user.apelido || user.nome || "").split(" ")[0])
      .replace("${TITULOS}", () => base.titulos.join(" | ")).replace("${BASE}", () => base.texto)
      + (hist ? `\n\nCONVERSA ATÉ AGORA:\n${hist}` : "") + `\n\nPERGUNTA: ${pergunta}`;
    let resposta = await gemini(prompt);
    let topicos: string[] = [];
    const m = resposta.match(/\n?\s*VEJA:\s*(.+)\s*$/i);
    if (m) { topicos = m[1].split("|").map((x) => x.trim()).filter((x) => base.titulos.includes(x)).slice(0, 3); resposta = resposta.slice(0, m.index).trim(); }
    return json({ ok: true, resposta, topicos });
  } catch (e) {
    console.error("ajuda-ia", e);
    const s = String(e);
    return json({ ok: false, error: /429|quota/i.test(s) ? "O assistente está muito usado agora. Tente de novo em 1 minuto." : "O assistente não respondeu agora. Tente de novo." });
  }
});
