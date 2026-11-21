// modelos-api v3 (22/11/2026): salvar_rascunho aceita `categoria` (UTILITY | MARKETING) — os textos sugeridos pedem Utilidade (mais barato) quando a mensagem é só atualização do atendimento.
// modelos-api v2 (22/11/2026): botão de URL com variável (ex.: https://g.page/r/{{1}}) vai com o exemplo que a Meta exige; o rascunho guarda se tem botão variável (rascunho_botao_dinamico) e, quando a Meta aprova, sincronizar liga meta_modelos.botao_dinamico — só então o envio passa a mandar o final do link da loja. supabase-js fixado em 2.119.0.
// modelos-api v1 (11/11/2026): tela 'Modelos WhatsApp' do app (so Diretoria). Ops: listar | salvar_rascunho {chave, corpo} | cancelar_rascunho {chave} | tarifa {categoria, valor} | custos {de, ate} | sincronizar (tambem pelo cron com x-cron-token).
// Fluxo de edicao: o texto editado vira um NOVO modelo na Meta (nome_vN). Quando a Meta aprova, sincronizar troca o modelo ativo (meta_modelos.nome_template) e o envio passa a usar o novo. Enquanto isso o modelo antigo continua valendo.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const G = "https://graph.facebook.com/v21.0";
function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_") || u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  return (Array.isArray(u.sessoes) ? u.sessoes : []).some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
async function metaLista(): Promise<any[] | null> {
  const tk = Deno.env.get("WHATSAPP_CLOUD_TOKEN"), waba = Deno.env.get("WHATSAPP_WABA_ID");
  if (!tk || !waba) return null;
  try {
    const r = await fetch(`${G}/${waba}/message_templates?limit=200&fields=name,status,category,rejected_reason`, { headers: { Authorization: `Bearer ${tk}` }, signal: AbortSignal.timeout(20000) });
    const j: any = await r.json().catch(() => ({}));
    return r.ok && Array.isArray(j.data) ? j.data : null;
  } catch (_) { return null; }
}
async function sincronizar() {
  const lista = await metaLista();
  if (!lista) return { ok: false, erro: "Não consegui falar com a Meta agora." };
  const por: Record<string, any> = {}; for (const t of lista) por[t.name] = t;
  const { data: ms } = await admin.from("meta_modelos").select("*");
  let promovidos = 0;
  for (const m of ms || []) {
    const upd: any = {};
    const ativo = por[m.nome_template];
    if (ativo) { if (ativo.status !== m.status) upd.status = ativo.status; if (ativo.category && ativo.category !== m.categoria) upd.categoria = ativo.category; }
    if (m.rascunho_nome) {
      const r = por[m.rascunho_nome];
      if (r) {
        if (r.status === "APPROVED") {
          upd.nome_template = m.rascunho_nome; upd.corpo = m.rascunho_corpo; upd.categoria = r.category || m.categoria; upd.status = "APPROVED"; upd.botao_dinamico = !!m.rascunho_botao_dinamico; upd.rascunho_botao_dinamico = false;
          upd.rascunho_nome = null; upd.rascunho_corpo = null; upd.rascunho_status = null; upd.rascunho_motivo = null; promovidos++;
        } else if (r.status !== m.rascunho_status) { upd.rascunho_status = r.status; upd.rascunho_motivo = r.status === "REJECTED" ? String(r.rejected_reason || "") : null; }
      }
    }
    if (Object.keys(upd).length) { upd.atualizado_em = new Date().toISOString(); await admin.from("meta_modelos").update(upd).eq("chave", m.chave); }
  }
  return { ok: true, promovidos };
}
function validaCorpo(corpo: string, n: number): string {
  const t = String(corpo || "").trim();
  if (!t) return "Escreva o texto da mensagem.";
  if (t.length > 1024) return "O texto passa de 1024 caracteres (limite da Meta).";
  const vars = (t.match(/\{\{\s*\d+\s*\}\}/g) || []).map((x) => Number(x.replace(/\D/g, "")));
  for (let i = 1; i <= n; i++) if (!vars.includes(i)) return `Falta a variável {{${i}}} no texto — ela é preenchida pelo sistema.`;
  if (vars.some((v) => v < 1 || v > n)) return `Só existem as variáveis {{1}} a {{${n}}} neste modelo.`;
  if (/^\{\{\s*\d+\s*\}\}/.test(t) || /\{\{\s*\d+\s*\}\}$/.test(t)) return "A Meta não aceita variável no começo ou no fim do texto. Escreva uma palavra antes e depois.";
  if (/\n{3,}/.test(t) || /\t/.test(t) || /\s{5,}/.test(t)) return "Tire linhas em branco duplas e espaços repetidos do texto.";
  if (/\{\{\s*\d+\s*\}\}\s*\{\{\s*\d+\s*\}\}/.test(t)) return "Não deixe duas variáveis coladas.";
  return "";
}
async function custos(de: string, ate: string) {
  const linhas: any[] = [];
  for (let from = 0; from < 100000; from += 1000) {
    const { data } = await admin.from("disparo_envios").select("em,tipo,modelo,categoria,loja_id").eq("origem", "cloud_api").gte("em", de + "T00:00:00-03:00").lte("em", ate + "T23:59:59-03:00").order("id", { ascending: true }).range(from, from + 999);
    linhas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const { data: ms } = await admin.from("meta_modelos").select("chave,nome_template,categoria,local_nome");
  const porNome: Record<string, any> = {}; const porChave: Record<string, any> = {};
  for (const m of ms || []) { porNome[m.nome_template] = m; porChave[m.chave] = m; }
  const chaveDoTipo = (t: string) => ({ aniversario: "aniversario", posvenda: "posvenda", os_posvenda: "posvenda", orcamento: "orcamento", orc_acao: "orcamento", chamar_cliente: "chamar_cliente", campanha: "campanha", os_pronto: "pedido_pronto" } as Record<string, string>)[t] || "via";
  const agg: Record<string, any> = {};
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  for (const l of linhas) {
    const m = (l.modelo && (porNome[l.modelo] || null)) || porChave[chaveDoTipo(String(l.tipo || ""))] || null;
    const chave = m ? m.chave : "outros";
    const dia = fmt.format(new Date(l.em));
    const categoria = l.categoria || (m ? m.categoria : "MARKETING");
    const k = dia + "|" + chave + "|" + categoria;
    if (!agg[k]) agg[k] = { dia, chave, local: m ? m.local_nome : "Outros", modelo: l.modelo || (m ? m.nome_template : ""), categoria, n: 0 };
    agg[k].n++;
  }
  return Object.values(agg);
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || "");
    const tkh = req.headers.get("x-cron-token");
    if (tkh) {
      const { data: sg } = await admin.from("atendimento_segredos").select("valor").eq("chave", "MARKETING_CRON_TOKEN").maybeSingle();
      if (!sg || !sg.valor || tkh !== sg.valor) return json({ error: "não autorizado" }, 401);
      if (op === "sincronizar") return json(await sincronizar());
      return json({ error: "operação não permitida" }, 403);
    }
    const { data: cf } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const user = ((cf && cf.payload && cf.payload.users) || []).find((u: any) => sessaoValida(u, String(body.senha || "")));
    if (!user || user.nivel !== "diretoria") return json({ error: "Só a Diretoria acessa esta tela." }, 403);
    if (op === "listar") {
      const sync = await sincronizar();
      const { data: modelos } = await admin.from("meta_modelos").select("*").order("ordem");
      const { data: tarifas } = await admin.from("meta_tarifas").select("*");
      return json({ ok: true, modelos: modelos || [], tarifas: tarifas || [], sync });
    }
    if (op === "sincronizar") return json(await sincronizar());
    if (op === "tarifa") {
      const cat = String(body.categoria || ""), v = Number(body.valor);
      if (!["MARKETING", "UTILITY", "AUTHENTICATION"].includes(cat) || !(v >= 0) || v > 50) return json({ error: "valor inválido" }, 400);
      await admin.from("meta_tarifas").update({ valor_brl: v, atualizado_em: new Date().toISOString() }).eq("categoria", cat);
      return json({ ok: true });
    }
    if (op === "custos") {
      const de = String(body.de || ""), ate = String(body.ate || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return json({ error: "período inválido" }, 400);
      const { data: tarifas } = await admin.from("meta_tarifas").select("*");
      return json({ ok: true, linhas: await custos(de, ate), tarifas: tarifas || [] });
    }
    if (op === "cancelar_rascunho") {
      await admin.from("meta_modelos").update({ rascunho_nome: null, rascunho_corpo: null, rascunho_status: null, rascunho_motivo: null, rascunho_botao_dinamico: false, atualizado_em: new Date().toISOString() }).eq("chave", String(body.chave || ""));
      return json({ ok: true });
    }
    if (op === "salvar_rascunho") {
      const { data: m } = await admin.from("meta_modelos").select("*").eq("chave", String(body.chave || "")).maybeSingle();
      if (!m) return json({ error: "modelo não encontrado" }, 404);
      if (m.rascunho_nome && m.rascunho_status === "PENDING") return json({ ok: false, erro: "Já existe uma versão em análise na Meta. Espere o resultado antes de enviar outra." });
      const corpo = String(body.corpo || "").replace(/\r/g, "").trim();
      const n = Array.isArray(m.variaveis) ? m.variaveis.length : 0;
      const erro = validaCorpo(corpo, n);
      if (erro) return json({ ok: false, erro });
      if (corpo === String(m.corpo || "").trim()) return json({ ok: false, erro: "O texto é igual ao que já está ativo." });
      const lista = (await metaLista()) || [];
      const base = String(m.nome_template).replace(/_v\d+$/, "");
      let maior = 1;
      for (const t of lista) { const mm = String(t.name).match(new RegExp("^" + base.replace(/[^a-z0-9_]/g, "") + "_v(\\d+)$")); if (mm) maior = Math.max(maior, Number(mm[1])); }
      const nome = `${base}_v${maior + 1}`;
      const components: any[] = [{ type: "BODY", text: corpo, example: { body_text: [Array.isArray(m.exemplos) && m.exemplos.length ? m.exemplos : m.variaveis.map((_: any, i: number) => "Exemplo " + (i + 1))] } }];
      let botaoDinamico = false;
      for (const c of Array.isArray(m.extras) ? m.extras : []) components.push(c.type === "BUTTONS" ? { type: "BUTTONS", buttons: (c.buttons || []).map((b: any) => {
        const var1 = /\{\{\s*1\s*\}\}/.test(String(b.url || ""));
        if (var1) botaoDinamico = true;
        return var1 ? { type: b.type, text: b.text, url: b.url, example: [String(b.example || b.url).replace(/\{\{\s*1\s*\}\}/, "exemplo")] } : { type: b.type, text: b.text, url: b.url };
      }) } : { type: c.type, text: c.text });
      const tk = Deno.env.get("WHATSAPP_CLOUD_TOKEN"), waba = Deno.env.get("WHATSAPP_WABA_ID");
      if (!tk || !waba) return json({ ok: false, erro: "Faltam as chaves da Meta no servidor." });
      const categoria = ["UTILITY", "MARKETING"].includes(String(body.categoria || "")) ? String(body.categoria) : m.categoria;   // v3
      const r = await fetch(`${G}/${waba}/message_templates`, { method: "POST", headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: nome, language: "pt_BR", category: categoria, components }), signal: AbortSignal.timeout(25000) });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) { const e = j && j.error; return json({ ok: false, erro: "A Meta recusou: " + String((e && (e.error_user_msg || e.error_user_title || e.message)) || r.status).slice(0, 300) }); }
      await admin.from("meta_modelos").update({ rascunho_nome: nome, rascunho_corpo: corpo, rascunho_status: String(j.status || "PENDING"), rascunho_motivo: null, rascunho_botao_dinamico: botaoDinamico, atualizado_em: new Date().toISOString() }).eq("chave", m.chave);
      try { await admin.from("auditoria_log").insert({ usuario_id: user.id || null, usuario_nome: user.nome || null, nivel: user.nivel || null, acao: "editar", modulo: "Modelos WhatsApp", tabela: "meta_modelos", registro_id: m.chave, resumo: `Enviou à Meta nova versão do modelo ${m.local_nome} (${nome})`, detalhe: { de: m.corpo, para: corpo } }); } catch (_) {}
      return json({ ok: true, nome, status: j.status || "PENDING", categoria: j.category || m.categoria });
    }
    return json({ error: "operação desconhecida" }, 400);
  } catch (e) { console.error("modelos-api", e); return json({ ok: false, erro: String(e) }, 200); }
});
