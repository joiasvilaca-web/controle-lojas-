// copiloto v3 (22/11/2026): META = a do módulo LANÇAMENTOS (fator da loja: faixas de venda × percentual, vale do mês em diante). Meta da loja = 1ª faixa;
//   a parte de cada vendedora = participação dela nas vendas da loja no último mês fechado em Lançamentos (sem histórico: divide igual). Mostra a próxima faixa.
// copiloto v2 (22/11/2026): loja = a escolhida no app (diretoria/gerente com várias lojas; vendedora só as dela); sem histórico, meta sugerida vira "sem meta".
// copiloto v1 (22/11/2026): COPILOTO DE VENDAS "Felipe" — o gerente-auxiliar que fica no canto da tela e ajuda as vendedoras.
// Sessão sess_… validada contra gestao_config (igual ao db-gateway). Lê os dados com service_role e entrega SÓ o que a pessoa pode ver:
//   - números dela (vendas do mês, ticket médio, peças por venda, orçamentos) e a posição na loja;
//   - das colegas, só "a melhor da loja" SEM NOME e SEM VALOR (ordem do Felipe, 22/11). Gerente/diretoria recebem o ranking com nomes.
// Ops:
//   dia          → { saudacao, meta, eu, loja, vendaAtiva[], dicas[] } — calculado 1x por dia por pessoa (cache copiloto_dia; `forcar` refaz).
//   perguntar    → { resposta } — conversa com o Felipe sobre vendas, com os números dela e o que já se aprendeu nas conversas do CHAT.
//   analisarChat → estuda as conversas do CHAT (atendimento_mensagens) ainda não vistas e guarda técnicas, objeções e perguntas em copiloto_aprendizados.
//                  Chamado pelo pg_cron (header x-cron-token = MARKETING_CRON_TOKEN) ou pela diretoria. Base para dicas e, no futuro, resposta automática.
// NUNCA envia mensagem a cliente: só sugere o texto; o envio é pelo botão (ação humana), pela função enviar-via (tipo chamar_cliente).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
function lojasDaSessao(u: any, token: string): string[] {
  const base: string[] = Array.isArray(u?.lojas) ? u.lojas.map(String) : [];
  const s = (Array.isArray(u?.sessoes) ? u.sessoes : []).find((x: any) => x && x.token === token);
  const e = s && s.lojaExtra;
  return e && e.id && Number(e.ate) > Date.now() && !base.includes(String(e.id)) ? [...base, String(e.id)] : base;
}
function hojeBR(ms = Date.now()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const horaBR = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const norm = (s: unknown) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
const dig = (t: unknown) => String(t || "").replace(/\D/g, "").slice(-8);
const primeiro = (n: unknown) => { const x = String(n || "").trim().split(/\s+/)[0] || ""; return x ? x.charAt(0).toUpperCase() + x.slice(1).toLowerCase() : ""; };
const brl = (v: number) => "R$ " + (Math.round(v * 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FECHADO_ORC = ["aprovado", "recusado"];

async function gemini(prompt: string, jsonOut = false): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY"); if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  const modelo = Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-flash-latest";
  const cfg: any = { temperature: 0.4, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } };
  if (jsonOut) cfg.responseMimeType = "application/json";
  for (let t = 1; t <= 2; t++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, { method: "POST", headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: cfg }), signal: AbortSignal.timeout(40000) });
    if (r.ok) { const d = await r.json(); const txt = (d?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("").trim(); if (txt) return txt; throw new Error("resposta vazia"); }
    if (!(r.status === 429 || r.status === 503) || t === 2) throw new Error("IA respondeu " + r.status);
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error("IA indisponível");
}
const lerJson = (t: string) => { try { return JSON.parse(t.replace(/^```(json)?/i, "").replace(/```$/, "").trim()); } catch { return null; } };

/** Números de vendas por vendedora num período (vendas não canceladas). */
function porVendedora(vendas: any[]) {
  const m: Record<string, { nome: string; total: number; n: number; pecas: number; comServico: number }> = {};
  for (const v of vendas) {
    const k = norm(v.vendedora); if (!k) continue;
    const x = m[k] = m[k] || { nome: String(v.vendedora), total: 0, n: 0, pecas: 0, comServico: 0 };
    x.total += Number(v.valorTotal) || 0; x.n++;
    const itens = Array.isArray(v.itens) ? v.itens : [];
    x.pecas += itens.reduce((s: number, i: any) => s + (Number(i.quantidade) || 1), 0);
    if (itens.some((i: any) => /servi|limpez|gravac|banho|polim|consert|garantia/i.test(String(i.produto || "")))) x.comServico++;
  }
  return Object.values(m).map((x) => ({ ...x, ticket: x.n ? x.total / x.n : 0, pecasPorVenda: x.n ? x.pecas / x.n : 0, pctServico: x.n ? x.comServico / x.n : 0 })).sort((a, b) => b.total - a.total);
}

async function montarDia(user: any, config: any, lojas: string[], meusNomes: string[], gestao: boolean) {
  const hoje = hojeBR(), ini400 = somaDias(hoje, -400), iniMes = hoje.slice(0, 8) + "01";
  const lojaId = lojas[0] || "";
  const loja = (config.lojas || []).find((l: any) => l.id === lojaId) || {};
  const nomeLoja = String(loja.nomePublico || loja.nomeFantasia || loja.nome || "");
  const eu = (v: any) => meusNomes.includes(norm(v.vendedora)) || meusNomes.includes(norm(v.funcionario));
  const [vR, oR, pR] = await Promise.all([
    admin.from("vendas_pdv").select("payload").gte("payload->>data", ini400).limit(5000),
    admin.from("orcamentos").select("id,payload").gte("updated_at", new Date(Date.now() - 90 * 86400000).toISOString()).limit(3000),
    admin.from("ordens_servico").select("id,payload").eq("payload->>status", "pronto").limit(2000),
  ]);
  const vendasTodas = (vR.data || []).map((r: any) => r.payload).filter((v: any) => v && !/cancel/.test(String(v.status || "")) && !v.rascunho);
  const daLoja = (x: any) => !lojaId || x.lojaId === lojaId;
  const vendasMesLoja = vendasTodas.filter((v: any) => daLoja(v) && String(v.data || "") >= iniMes);
  const rank = porVendedora(vendasMesLoja);
  const minha = rank.find((x) => meusNomes.includes(norm(x.nome))) || { nome: "", total: 0, n: 0, pecas: 0, comServico: 0, ticket: 0, pecasPorVenda: 0, pctServico: 0 };
  const pos = rank.findIndex((x) => x === minha) + 1;
  const melhor = rank[0] && rank[0] !== minha ? rank[0] : null;   // ela já é a melhor: sem comparação
  const media = rank.length ? { ticket: rank.reduce((s, x) => s + x.ticket, 0) / rank.length, pecasPorVenda: rank.reduce((s, x) => s + x.pecasPorVenda, 0) / rank.length, pctServico: rank.reduce((s, x) => s + x.pctServico, 0) / rank.length } : null;

  // ---- meta: a da loja (Dashboard › Editar metas) dividida pelas vendedoras ativas; sem meta cadastrada, meta sugerida = média diária dela nos últimos 3 meses + 10% ----
  const diasMes = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0).getDate();
  const diasRestantes = diasMes - Number(hoje.slice(8, 10)) + 1;
  const vendidoLoja = vendasMesLoja.reduce((s: number, v: any) => s + (Number(v.valorTotal) || 0), 0);
  // v3: meta do LANÇAMENTOS — fator da loja (faixas) do mês atual ou o último salvo antes dele
  const CHAVE_LANC: Record<string, string> = { loja_mc: "MARECHAL", loja_jb: "JOAO BERALDO", loja_jn: "JARDIM NORTE", loja_rj: "REFORMA" };
  const chaveLanc = CHAVE_LANC[lojaId] || "", mes = hoje.slice(0, 7);
  let faixas: { valor: number; percentual: number }[] = [], partes: Record<string, number> = {}, totalPartes = 0;
  if (chaveLanc) {
    const [fR, vdR] = await Promise.all([
      admin.from("lancamentos_mensais").select("mes, dados").eq("tipo", "fator").eq("chave", chaveLanc).lte("mes", mes).order("mes", { ascending: false }).limit(1),
      admin.from("lancamentos_mensais").select("mes, chave, dados").eq("tipo", "vendedora").lt("mes", mes).order("mes", { ascending: false }).limit(200),
    ]);
    faixas = (((fR.data || [])[0] || {}).dados?.faixas || []).map((f: any) => ({ valor: Number(f.valor) || 0, percentual: Number(f.percentual) || 0 })).filter((f: any) => f.valor > 0).sort((a: any, b: any) => a.valor - b.valor);
    const ultimoMes = ((vdR.data || [])[0] || {}).mes;
    for (const r of (vdR.data || []).filter((x: any) => x.mes === ultimoMes)) { const v = Number(r.dados?.lojas?.[chaveLanc]?.venda) || 0; if (v > 0) { partes[norm(r.chave)] = v; totalPartes += v; } }
  }
  let meta: any;
  if (faixas.length) {
    const metaLoja = faixas[0].valor;
    const minhaParte = meusNomes.map((n) => partes[n] || 0).find((x) => x > 0) || 0;
    const share = totalPartes && minhaParte ? minhaParte / totalPartes : 1 / Math.max(1, Object.keys(partes).length || rank.length || 1);
    const minhaMetaMes = metaLoja * share;
    const atual = [...faixas].reverse().find((f) => vendidoLoja >= f.valor) || null;
    const proxima = faixas.find((f) => vendidoLoja < f.valor) || null;
    meta = { tipo: "lancamentos", metaMes: minhaMetaMes, vendidoMes: minha.total, hoje: Math.max(0, (minhaMetaMes - minha.total) / diasRestantes), diasRestantes,
      loja: { meta: metaLoja, vendido: vendidoLoja, faixaAtual: atual, proxima, falta: proxima ? Math.max(0, proxima.valor - vendidoLoja) : 0 }, participacao: Math.round(share * 100) };
  } else {
    const ini90 = somaDias(hoje, -90);
    const minhas90 = vendasTodas.filter((v: any) => eu(v) && String(v.data || "") >= ini90 && String(v.data || "") < iniMes);
    const mediaDia = minhas90.reduce((s: number, v: any) => s + (Number(v.valorTotal) || 0), 0) / Math.max(1, diasEntre(ini90, iniMes));
    meta = { tipo: "sugerida", metaMes: mediaDia * 1.1 * diasMes, vendidoMes: minha.total, hoje: Math.max(0, (mediaDia * 1.1 * diasMes - minha.total) / diasRestantes), diasRestantes };
  }

  // ---- VENDA ATIVA: quem chamar hoje (só clientes dela), com a mensagem pronta ----
  const ativa: any[] = [];
  const meuNome = primeiro(user.apelido || user.nome);
  const assinatura = meuNome ? `Aqui é ${meuNome}, da ${nomeLoja || "Vilaça Joias"}.` : `Aqui é da ${nomeLoja || "Vilaça Joias"}.`;
  // 1) orçamentos dela em aberto: vencendo (até 3 dias) ou parados (3+ dias)
  for (const r of (oR.data || [])) {
    const o = r.payload || {};
    if (!eu(o) || o.rascunho || o.convertidoEm || FECHADO_ORC.includes(String(o.status || "")) || !o.telefone) continue;
    const vence = o.validade ? diasEntre(hoje, String(o.validade)) : 99;
    const parado = diasEntre(String(o.data || hoje), hoje);
    if (vence < 0 || (vence > 3 && parado < 3)) continue;
    ativa.push({ tipo: "orcamento", prioridade: vence <= 1 ? 1 : 2, id: r.id, cliente: o.cliente || "", telefone: o.telefone, via: o.codigoVia || "",
      motivo: vence <= 3 ? `Orçamento ${o.codigoVia || ""} vence ${vence === 0 ? "hoje" : vence === 1 ? "amanhã" : "em " + vence + " dias"} (${brl(Number(o.valorTotal) || 0)})` : `Orçamento ${o.codigoVia || ""} parado há ${parado} dias`,
      mensagem: `Olá, ${primeiro(o.cliente) || "tudo bem"}! ${assinatura} Passando para saber se ficou alguma dúvida sobre o seu orçamento. Posso te ajudar a fechar ou ajustar alguma coisa?` });
  }
  // 2) clientes dela: aniversário nos próximos 3 dias e quem comprou há ~1 ano e não voltou
  const minhasVendas = vendasTodas.filter((v: any) => eu(v) && v.telefone);
  const ultimaCompra: Record<string, any> = {};
  for (const v of minhasVendas) { const k = dig(v.telefone); if (k.length < 8) continue; if (!ultimaCompra[k] || String(v.data) > String(ultimaCompra[k].data)) ultimaCompra[k] = v; }
  const mmdd = [0, 1, 2, 3].map((n) => somaDias(hoje, n).slice(5));
  if (Object.keys(ultimaCompra).length) {
    const { data: cli } = await admin.from("clientes_cadastro").select("payload").or(mmdd.map((d) => `payload->>dataNascimento.like.*-${d}`).join(",")).limit(400);
    for (const r of (cli || [])) {
      const c = r.payload || {}; const k = dig(c.telefone); if (!ultimaCompra[k]) continue;
      const d = String(c.dataNascimento || "").slice(5); const em = mmdd.indexOf(d);
      ativa.push({ tipo: "aniversario", prioridade: em === 0 ? 1 : 3, id: c.id, cliente: c.nome || "", telefone: c.telefone,
        motivo: em === 0 ? "Faz aniversário HOJE" : `Faz aniversário ${em === 1 ? "amanhã" : "em " + em + " dias"}`,
        mensagem: `Olá, ${primeiro(c.nome)}! ${assinatura} ${em === 0 ? "Hoje é o seu dia! Feliz aniversário!" : "Seu aniversário está chegando!"} Separei umas peças lindas que combinam com você. Quer que eu te mande umas fotos?` });
    }
  }
  for (const [, v] of Object.entries(ultimaCompra)) {
    const dd = diasEntre(String(v.data), hoje);
    if (dd < 330 || dd > 400) continue;
    const peca = String(((v.itens || [])[0] || {}).produto || "").toLowerCase();
    ativa.push({ tipo: "retorno", prioridade: 3, id: "", cliente: v.cliente || "", telefone: v.telefone,
      motivo: `Comprou com você há ${Math.round(dd / 30)} meses${peca ? " (" + peca.slice(0, 40) + ")" : ""} e não voltou`,
      mensagem: `Olá, ${primeiro(v.cliente)}! ${assinatura} Faz um tempinho que você levou sua joia com a gente. Que tal uma limpeza para ela ficar como nova? Também chegaram novidades que acho que você vai gostar.` });
  }
  // 3) pedidos dela prontos há 3+ dias sem retirada
  for (const r of (pR.data || [])) {
    const o = r.payload || {};
    if (!eu(o) || !o.telefone || diasEntre(String(o.statusEm ? hojeBR(Number(o.statusEm)) : o.data || hoje), hoje) < 3) continue;
    ativa.push({ tipo: "retirada", prioridade: 2, id: r.id, cliente: o.cliente || "", telefone: o.telefone, via: o.codigoVia || "",
      motivo: `Pedido ${o.codigoVia || ""} pronto e ainda não retirado`,
      mensagem: `Olá, ${primeiro(o.cliente)}! ${assinatura} Seu pedido ${o.codigoVia || ""} está pronto e esperando por você. Quando fica bom para passar aqui?` });
  }
  ativa.sort((a, b) => a.prioridade - b.prioridade);

  // ---- dicas da IA (números dela × melhor da loja sem nome × aprendizados do CHAT) ----
  const { data: ap } = await admin.from("copiloto_aprendizados").select("payload").order("criado_em", { ascending: false }).limit(3);
  const aprend = (ap || []).map((x: any) => x.payload);
  const fmt = (x: any) => x ? { vendas: x.n, ticketMedio: Math.round(x.ticket), pecasPorVenda: Number(x.pecasPorVenda.toFixed(2)), vendasComServico: Math.round(x.pctServico * 100) + "%" } : null;
  let dicas: string[] = [];
  try {
    const prompt = `Você é "Felipe", gerente experiente da rede de joalherias Vilaça Joias, treinando a vendedora ${meuNome || ""}. Escreva 3 dicas CURTAS (até 28 palavras cada), práticas para HOJE, em português do Brasil, tom de colega animado e respeitoso.
Baseie-se nos números abaixo. Compare com "a melhor da loja" SEM citar nome nem valores dela. Se faltar dado, dê dica geral de atendimento em joalheria (agregar serviço como limpeza/gravação, oferecer conjunto, pedir indicação, pós-venda).
Responda SOMENTE JSON: {"dicas":["...","...","..."]}
DADOS: ${JSON.stringify({ mesAteHoje: fmt(minha), posicaoNaLoja: pos ? pos + "º de " + rank.length : "sem vendas no mês", melhorDaLoja: fmt(melhor), mediaDaLoja: media ? { ticketMedio: Math.round(media.ticket), pecasPorVenda: Number(media.pecasPorVenda.toFixed(2)), vendasComServico: Math.round(media.pctServico * 100) + "%" } : null, metaHoje: Math.round(meta.hoje), lojaFaixa: meta.loja ? { vendido: Math.round(meta.loja.vendido), proximaFaixa: meta.loja.proxima, faltaParaProxima: Math.round(meta.loja.falta) } : null, vendaAtivaHoje: ativa.length, aprendizadosDasConversas: aprend })}`;
    const j = lerJson(await gemini(prompt, true));
    dicas = (j && Array.isArray(j.dicas) ? j.dicas : []).map((d: unknown) => String(d).slice(0, 240)).slice(0, 3);
  } catch (e) { console.error("dicas", e); }
  if (!dicas.length) dicas = ["Ao fechar uma venda, ofereça a limpeza ou a gravação: agrega valor e o cliente volta.", "Responda os orçamentos no mesmo dia. Quem responde rápido fecha mais.", "Peça indicação para quem comprou: um cliente feliz traz outro."];

  const out: any = {
    dia: hoje, nome: meuNome, loja: nomeLoja,
    saudacao: `${horaBR() < 12 ? "Bom dia" : horaBR() < 18 ? "Boa tarde" : "Boa noite"}, ${meuNome || "tudo bem"}!`,
    meta, eu: { ...fmt(minha), total: minha.total, posicao: pos || null, deQuantas: rank.length },
    melhor: melhor ? { ...fmt(melhor) } : null,   // sem nome e sem valor total (ordem do Felipe)
    vendaAtiva: ativa.slice(0, 10), dicas,
  };
  if (gestao) out.ranking = rank.map((x) => ({ nome: x.nome, total: x.total, vendas: x.n, ticket: Math.round(x.ticket) }));
  return out;
}

async function analisarChat(limite = 25) {
  const { data: vistos } = await admin.from("copiloto_chat_visto").select("conversa_id, ultima_msg_em");
  const visto: Record<string, string> = {}; for (const v of vistos || []) visto[v.conversa_id] = v.ultima_msg_em;
  const { data: convs } = await admin.from("atendimento_conversas").select("id, ultima_mensagem_em, atendente_nome, motivo_finalizacao").order("ultima_mensagem_em", { ascending: false }).limit(300);
  const novas = (convs || []).filter((c: any) => c.ultima_mensagem_em && (!visto[c.id] || visto[c.id] < c.ultima_mensagem_em)).slice(0, limite);
  if (!novas.length) return { analisadas: 0 };
  const blocos: string[] = [];
  for (const c of novas) {
    const { data: ms } = await admin.from("atendimento_mensagens").select("direcao, texto, created_at").eq("conversa_id", c.id).neq("direcao", "interna").order("created_at", { ascending: true }).limit(60);
    const linhas = (ms || []).filter((m: any) => m.texto).map((m: any) => `${m.direcao === "in" ? "CLIENTE" : "LOJA"}: ${String(m.texto).replace(/\s+/g, " ").slice(0, 300)}`);
    if (linhas.length >= 2) blocos.push(`### Conversa (${c.motivo_finalizacao || "sem desfecho"})\n` + linhas.join("\n"));
  }
  let salvo = false;
  if (blocos.length) {
    const prompt = `Você analisa conversas de WhatsApp de uma joalheria (Vilaça Joias) para TREINAR vendedoras. NÃO copie nomes, telefones, endereços ou valores pessoais de clientes.
Extraia, em português do Brasil, frases curtas e reutilizáveis:
- tecnicas: o que a LOJA fez que ajudou a vender ou avançar (até 6)
- objecoes: dúvidas/resistências dos CLIENTES e a melhor resposta (até 6, formato "objeção → resposta")
- perguntas: perguntas frequentes dos clientes (até 6)
- melhorias: o que a loja poderia ter feito melhor (até 4)
Responda SOMENTE JSON: {"tecnicas":[],"objecoes":[],"perguntas":[],"melhorias":[]}
CONVERSAS:
${blocos.join("\n\n").slice(0, 45000)}`;
    const j = lerJson(await gemini(prompt, true));
    if (j) { await admin.from("copiloto_aprendizados").insert({ origem: "chat", payload: { ...j, conversas: blocos.length } }); salvo = true; }
  }
  if (salvo || !blocos.length) await admin.from("copiloto_chat_visto").upsert(novas.map((c: any) => ({ conversa_id: c.id, ultima_msg_em: c.ultima_mensagem_em, analisado_em: new Date().toISOString() })));
  return { analisadas: blocos.length, salvo };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    // rotina diária (pg_cron): estuda as conversas do CHAT
    if (b?.op === "analisarChat" && req.headers.get("x-cron-token")) {
      const { data: sg } = await admin.from("atendimento_segredos").select("valor").eq("chave", "MARKETING_CRON_TOKEN").maybeSingle();
      if (!sg || sg.valor !== req.headers.get("x-cron-token")) return json({ error: "não autorizado" }, 401);
      return json({ ok: true, ...(await analisarChat()) });
    }
    const { data: cf } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config: any = (cf && cf.payload) || {};
    const user = (config.users || []).find((u: any) => sessaoValida(u, String(b?.senha || "")));
    if (!user) return json({ error: "não autorizado" }, 401);
    const nivel = String(user.nivel || ""); const gestao = nivel === "diretoria" || nivel === "gerente";
    if (nivel === "oficina") return json({ ok: true, desligado: true });
    const fu = (config.funcionarios || []).find((f: any) => f.id === user.funcionarioId) || {};
    const meusNomes = [...new Set([user.nome, user.apelido, fu.nome, fu.apelido].map(norm).filter(Boolean))];
    let lojas = lojasDaSessao(user, String(b.senha));
    const pedida = String(b.lojaId || "");   // loja escolhida no seletor do app
    if (pedida && (nivel === "diretoria" ? (config.lojas || []).some((l: any) => l.id === pedida) : lojas.includes(pedida))) lojas = [pedida, ...lojas.filter((x) => x !== pedida)];
    if (b.op === "analisarChat") { if (nivel !== "diretoria") return json({ error: "só a diretoria" }, 403); return json({ ok: true, ...(await analisarChat()) }); }
    if (b.op === "dia") {
      const id = `${user.id}|${hojeBR()}|${lojas[0] || "todas"}`;
      if (!b.forcar) { const { data: c } = await admin.from("copiloto_dia").select("payload").eq("id", id).maybeSingle(); if (c && c.payload) return json({ ok: true, ...c.payload, cache: true }); }
      const p = await montarDia(user, config, lojas, meusNomes, gestao);
      await admin.from("copiloto_dia").upsert({ id, user_id: String(user.id), dia: hojeBR(), payload: p });
      return json({ ok: true, ...p });
    }
    if (b.op === "perguntar") {
      const pergunta = String(b.pergunta || "").trim().slice(0, 600); if (!pergunta) return json({ error: "escreva a pergunta" }, 400);
      const { data: c } = await admin.from("copiloto_dia").select("payload").like("id", `${user.id}|${hojeBR()}%`).order("criado_em", { ascending: false }).limit(1).maybeSingle();
      const dia = (c && c.payload) || {};
      const { data: ap } = await admin.from("copiloto_aprendizados").select("payload").order("criado_em", { ascending: false }).limit(3);
      const hist = (Array.isArray(b.historico) ? b.historico : []).slice(-6).map((m: any) => `${m && m.de === "ia" ? "Felipe" : "Vendedora"}: ${String((m && m.texto) || "").slice(0, 400)}`).join("\n");
      const ctx = { meta: dia.meta, meusNumeros: dia.eu, melhorDaLojaSemNome: dia.melhor, vendaAtiva: (dia.vendaAtiva || []).map((x: any) => x.motivo), aprendizadosDasConversas: (ap || []).map((x: any) => x.payload), ...(gestao ? { ranking: dia.ranking } : {}) };
      const prompt = `Você é "Felipe", gerente experiente e animado da Vilaça Joias (joalheria em Juiz de Fora), auxiliando ${primeiro(user.apelido || user.nome) || "a vendedora"} (perfil ${nivel}). Ajude com vendas, atendimento, argumentos, metas, preenchimento de vias e venda ativa.
Regras: português do Brasil, frases curtas, prático, no máximo 130 palavras; use os dados abaixo quando ajudarem; ${gestao ? "pode citar nomes do ranking" : "NUNCA cite nomes nem valores de outras vendedoras"}; não invente números; para dúvida de COMO USAR o app, diga para perguntar na tela de Ajuda. Nunca diga que enviou mensagem a cliente.
DADOS: ${JSON.stringify(ctx)}
${hist ? "CONVERSA:\n" + hist + "\n" : ""}PERGUNTA: ${pergunta}`;
      return json({ ok: true, resposta: await gemini(prompt) });
    }
    return json({ error: "operação desconhecida" }, 400);
  } catch (e) {
    console.error("copiloto", e);
    return json({ ok: false, error: /429|quota/i.test(String(e)) ? "Estou com muitas perguntas agora. Tente de novo em 1 minuto." : "Não consegui agora. Tente de novo." });
  }
});
