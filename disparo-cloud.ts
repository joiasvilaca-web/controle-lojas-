// disparo-cloud v7 (22/11/2026): miolo() do orçamento — links saem mas o texto do parágrafo fica (convite "o que podemos melhorar" do Recusado); "Aqui é <vendedora>, da <loja>." vira "Atendimento: <vendedora>." (loja não repete); sem emoji solto no início. supabase-js fixado em 2.119.0.
// disparo-cloud v6 (11/11/2026): envia pela API OFICIAL da Meta (numero +55 32 98830-7617) as linhas da marketing_fila com status 'cloud_fila'. v6: o NOME do modelo vem da tabela meta_modelos (tela 'Modelos de mensagem' do app; o padrao continua o do codigo) e cada envio grava modelo + categoria em disparo_envios (base do painel de custos). SEM restricao de horario. Cada linha e reservada (status 'cloud_envio') antes de enviar (sem duplicar).
// Chamada so com o header x-cron-token (= MARKETING_CRON_TOKEN) pela rotina ponte-disparo-cloud (pg_cron, todo minuto), pelo acompanhamento-auto e pelo enviar-via. Segredos da funcao: WHATSAPP_CLOUD_TOKEN, WHATSAPP_PHONE_NUMBER_ID.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.119.0";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v21.0";
const NL = String.fromCharCode(10);
const limpa = (t: string) => String(t || "").split(NL).join(" ").split("\t").join(" ").split("    ").join(" ").split("   ").join(" ").split("  ").join(" ").split("  ").join(" ").trim();
const bonito = (t: string) => String(t || "").trim().toLowerCase().replace(/(^|[ ])[^ ]/g, (m) => m.toUpperCase());
const fone8 = (t: string) => String(t || "").replace(/[^0-9]/g, "").slice(-8);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
let MAPA: Record<string, { nome: string; categoria: string }> = {};
async function carregaMapa() {
  MAPA = {};
  try { const { data } = await admin.from("meta_modelos").select("chave,nome_template,categoria"); for (const m of data || []) MAPA[m.chave] = { nome: m.nome_template, categoria: m.categoria }; } catch (_) {}
}
function normalizaTelefone(t: string): string | null {
  let d = String(t || "").replace(/[^0-9]/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11) return null;
  if (Number(d.slice(0, 2)) < 11 || d[2] !== "9") return null;
  return "55" + d;
}
/** Miolo da mensagem para os modelos de texto livre (orcamento, campanha): tira saudacao, links, convite para falar e pedido de joinha; junta tudo numa linha. */
function miolo(texto: string): string {
  // 22/11: links saem do parágrafo mas o TEXTO fica (o convite "o que podemos melhorar" do Recusado voltava cortado);
  // "Aqui é <vendedora>, da <loja>." vira "Atendimento: <vendedora>." (o modelo já diz "Aqui é da <loja>": a loja saía duas vezes); emoji solto no começo sai.
  const paras = String(texto || "").split(NL + NL)
    .map((p) => p.replace(/https?:[/][/]\S+/g, "").replace(/[ \t]+$/gm, "").trim())
    .filter((p) => p && !/Para falar com a gente/i.test(p) && !/Responda com/i.test(p) && !/responda SAIR/i.test(p) && !/Veja o seu or/i.test(p) && !/^(Clique no link|Caso precise falar conosco)/i.test(p));
  let s = paras.join(" ").split(NL).join(" ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(Ol[aá]|Oi),? [^!]+! ?/i, "").replace(/^[^\p{L}\p{N}*]+/u, "").replace(/Aqui [eé] da [^.]+[.] ?/i, "")
    .replace(/Aqui [eé] ([^,.!]{1,60}), da [^.!]+[.!] ?/i, "Atendimento: $1. ");
  return s.replace(/\s+/g, " ").trim().slice(0, 900);
}
function modelo(item: any, orcOn: boolean): { chave: string; name: string; params: string[] } | null {
  const flat = String(item.texto || "").split(NL).join(" ");
  const primeiro = bonito(String(item.cliente_nome || "").split(" ")[0]);
  if (item.tipo === "aniversario") {
    const m = flat.match(/anivers[aá]rio, ([^!]+)!/i);
    const nome = limpa(m ? m[1] : primeiro) || "cliente";
    return { chave: "aniversario", name: "aniversario_vilaca", params: [nome] };
  }
  const n = flat.match(/Ol[aá], ([^!]+)!/);
  const nome = limpa(n ? n[1] : primeiro) || "cliente";
  if (item.tipo === "campanha") {
    const corpo = miolo(item.texto);
    return corpo ? { chave: "campanha", name: "campanha_vilaca", params: [nome, corpo] } : null;
  }
  if (item.tipo === "posVenda" || (item.tipo === "via" && item.registro_tabela === "posvenda")) return { chave: "posvenda", name: "pos_venda_garantia", params: [nome] };
  if (item.tipo === "via" && item.registro_tabela === "chamar_cliente") {
    const partes = String(item.texto || "").split(NL + NL + "—" + NL);
    const corpo = limpa(partes[0]).slice(0, 900);
    const rod = partes[1] ? partes[1].split(NL)[0] : "";
    const q = rod.split(" · ");
    const atend = q.length > 1 ? q[0] : (item.vendedora ? bonito(item.vendedora) : "nossa equipe");
    const loja = q.length > 1 ? q.slice(1).join(" · ") : (limpa(rod) || "Vilaça Joias");
    if (!corpo) return null;
    return { chave: "chamar_cliente", name: "chamar_cliente_vilaca", params: [primeiro || "cliente", limpa(atend) || "nossa equipe", limpa(loja) || "Vilaça Joias", corpo] };
  }
  if (item.tipo === "via" && item.registro_tabela === "orc_acao" && orcOn) {
    const l = flat.match(/https:[/][/]vilaca[.]app[/][^ ]+/);
    const lj = flat.match(/da ([^.]+)[.]/);
    const corpo = miolo(item.texto);
    if (!l || !corpo) return null;
    return { chave: "orcamento", name: "orcamento_acompanhamento", params: [nome, limpa(lj ? lj[1] : "Vilaça Joias"), corpo, l[0]] };
  }
  if (item.tipo === "via") {
    const l = flat.match(/https:[/][/]vilaca[.]app[/][^ ]+/);
    if (!l) return null;
    const a = flat.match(/Atendimento: (.+?) · (.+?)[.] +Todas/);
    const vend = a ? a[1] : (item.vendedora ? bonito(item.vendedora) : "nossa equipe");
    const loja = a ? a[2] : "VILAÇA JOIAS";
    return { chave: "via", name: "via_acompanhamento", params: [nome, vend, loja, l[0]] };
  }
  return null;
}
async function enviaCloud(item: any, numero: string, orcOn: boolean) {
  const tk = Deno.env.get("WHATSAPP_CLOUD_TOKEN"), pid = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!tk || !pid) return { ok: false, erro: "API oficial sem token/ID configurado", status: 0, parar: true };
  const p = modelo(item, orcOn);
  if (!p) return { ok: false, erro: "Sem modelo da API oficial para esta mensagem", status: 0, definitivo: true };
  const ativo = MAPA[p.chave];
  const nomeModelo = ativo ? ativo.nome : p.name;
  try {
    const r = await fetch(`${GRAPH}/${pid}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: numero, type: "template", template: { name: nomeModelo, language: { code: "pt_BR" }, components: [{ type: "body", parameters: p.params.map((x) => ({ type: "text", text: limpa(x).slice(0, 900) })) }] } }),
      signal: AbortSignal.timeout(15000),
    });
    const j: any = await r.json().catch(() => ({}));
    const ok = r.ok && !!(j && j.messages && j.messages[0]);
    const e = j && j.error;
    return { ok, erro: ok ? "" : `Meta: ${e ? (String(e.code || "") + " " + String(e.message || "").slice(0, 140)) : r.status}`, status: r.status, parar: r.status === 401 || (e && e.code === 190), id: ok ? j.messages[0].id : null, modelo: nomeModelo, categoria: ativo ? ativo.categoria : null };
  } catch (_) { return { ok: false, erro: "Falha de conexão com a Meta", status: 0, transitorio: true }; }
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const { data: sg } = await admin.from("atendimento_segredos").select("valor").eq("chave", "MARKETING_CRON_TOKEN").maybeSingle();
  if (!sg || !sg.valor || req.headers.get("x-cron-token") !== sg.valor) return json({ error: "não autorizado" }, 401);
  if (!Deno.env.get("WHATSAPP_CLOUD_TOKEN") || !Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")) return json({ ok: false, erro: "faltam WHATSAPP_CLOUD_TOKEN / WHATSAPP_PHONE_NUMBER_ID nos segredos" });
  const { data: fl } = await admin.from("atendimento_segredos").select("valor").eq("chave", "ORC_API").maybeSingle();
  const orcOn = !!(fl && String(fl.valor || "").trim().toLowerCase() === "on");
  await carregaMapa();
  await admin.from("marketing_fila").update({ status: "cloud_fila" }).eq("status", "cloud_envio").lt("atualizado_em", new Date(Date.now() - 5 * 60000).toISOString());
  const { data: pend } = await admin.from("marketing_fila").select("id").eq("status", "cloud_fila").order("id", { ascending: true }).limit(80);
  const ini = Date.now();
  let enviados = 0, falhas = 0, parou = "";
  for (const alvo of pend || []) {
    if (Date.now() - ini > 42000) break;
    const agoraIso = () => new Date().toISOString();
    const { data: cl } = await admin.from("marketing_fila").update({ status: "cloud_envio", atualizado_em: agoraIso() }).eq("id", alvo.id).eq("status", "cloud_fila").select("*");
    const item = cl && cl[0];
    if (!item) continue;
    const numero = normalizaTelefone(item.telefone);
    if (!numero) { await admin.from("marketing_fila").update({ status: "cancelado", erro: "Telefone fora do padrão", atualizado_em: agoraIso() }).eq("id", item.id); continue; }
    const r: any = await enviaCloud(item, numero, orcOn);
    const tent = Number(item.tentativas || 0) + 1;
    if (r.ok) {
      enviados++;
      await admin.from("marketing_fila").update({ status: "enviado", enviado_em: agoraIso(), tentativas: tent, erro: null, atualizado_em: agoraIso() }).eq("id", item.id);
      try { await admin.from("disparo_envios").insert({ fone8: fone8(numero), telefone: numero, loja_id: item.loja_id || null, vendedora: item.vendedora || null, tipo: item.tipo === "via" ? (item.registro_tabela || "via") : item.tipo, registro_id: item.registro_id || null, origem: "cloud_api", modelo: r.modelo || null, categoria: r.categoria || null }); } catch (_) {}
      if (item.tipo === "via") {
        try { await admin.from("auditoria_log").insert({ usuario_nome: item.criado_por || "SISTEMA", nivel: "sistema", loja_sessao: item.loja_id || null, acao: "via_whatsapp_enviada", modulo: "Envio da via", tabela: item.registro_tabela || "", registro_id: item.registro_id || "", resumo: `Enviou (API oficial da Meta) a via por WhatsApp para …${String(numero).slice(-4)}`, detalhe: { canal: "cloud_api", wamid: r.id, botao: item.botao || "", rotulo: item.rotulo || "", fila: true } }); } catch (_) {}
        const mc = item.marcar;
        if (mc && mc.tabela && mc.chave && item.registro_id) {
          try {
            const { data: rw } = await admin.from(mc.tabela).select("payload").eq("id", item.registro_id).maybeSingle();
            const pl = rw && rw.payload;
            if (pl) { pl.msgEnviadas = pl.msgEnviadas || {}; if (mc.posVenda) { pl.posVendaEnviadoEm = agoraIso(); pl.posVendaPor = item.criado_por || "sistema"; delete pl.autoAgenda; } if (!pl.msgEnviadas[mc.chave]) pl.msgEnviadas[mc.chave] = agoraIso(); await admin.from(mc.tabela).update({ payload: pl, updated_at: agoraIso() }).eq("id", item.registro_id); }
          } catch (_) {}
        }
      }
    } else {
      falhas++;
      const volta = r.transitorio && tent < 3;
      await admin.from("marketing_fila").update({ status: volta || r.parar ? "cloud_fila" : "falhou", tentativas: tent, erro: r.erro, atualizado_em: agoraIso() }).eq("id", item.id);
      if (r.parar) { parou = r.erro + " (status " + r.status + ")"; break; }
      if (falhas >= 5) { parou = "5 falhas na rodada: " + r.erro; break; }
    }
    await espera(1100);
  }
  return json({ ok: true, enviados, falhas, parou, restantes: Math.max(0, (pend || []).length - enviados - falhas) });
});
