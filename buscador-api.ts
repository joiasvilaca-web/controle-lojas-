// buscador-api v1 (22/11/2026) — BUSCADOR do PDV: uma caixa de texto + "onde procurar".
// verify_jwt: true. Sessão igual às outras funções (body.senha = token "sess_…").
// Campos (body.campo): tudo | cliente | via | historico | produto | tarefa | vendedora
//   cliente   → cadastro de clientes (nome, celular, CPF/CNPJ, e-mail)
//   via       → vendas, pedidos e orçamentos pelo código, cliente ou telefone
//   historico → TEXTO DENTRO da via (itens, observações, descrição, pagamentos…), de qualquer palavra
//   produto   → catálogo (nome/código)
//   tarefa    → tarefas da Agenda que a pessoa pode ver
//   vendedora → vias da vendedora
// Todas as palavras digitadas precisam aparecer (em qualquer ordem, "contendo"), sem diferenciar maiúscula nem acento.
// Lojas: diretoria vê todas; os demais só as lojas dela (inclui a loja extra da sessão); a Oficina vê os pedidos de todas as lojas.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const CAMPOS = ["tudo", "cliente", "via", "historico", "produto", "tarefa", "vendedora"];
const VIAS: [string, string][] = [["ordens_servico", "pedido"], ["vendas_pdv", "venda"], ["orcamentos", "orcamento"]];

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
/** minúsculas e sem acento, para comparar "contendo" */
function norm(s: unknown): string { return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
/** junta todos os textos de um objeto (valores, não as chaves) */
function textos(v: any, out: string[] = []): string[] {
  if (v == null) return out;
  if (typeof v === "string" || typeof v === "number") { out.push(String(v)); return out; }
  if (Array.isArray(v)) { for (const x of v) textos(x, out); return out; }
  if (typeof v === "object") { for (const k of Object.keys(v)) { if (/^(fotos?|foto[A-Z]|assinatura|imagem|hash|token|senha)/i.test(k)) continue; textos(v[k], out); } }
  return out;
}
function trechoDe(texto: string, termos: string[]): string {
  const n = norm(texto); const i = n.indexOf(termos[0]); if (i < 0) return "";
  const ini = Math.max(0, i - 45), fim = Math.min(texto.length, i + termos[0].length + 70);
  return (ini > 0 ? "…" : "") + texto.slice(ini, fim).replace(/\s+/g, " ").trim() + (fim < texto.length ? "…" : "");
}
const ilikeSeguro = (t: string) => t.replace(/[\\%_,()"]/g, " ").trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b: any; try { b = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  try {
    const { data: cfgRow } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
    const config = (cfgRow && cfgRow.payload) || {};
    const users: any[] = config.users || [];
    const user = users.find((u) => sessaoValida(u, b.senha));
    if (!user) return json({ error: "não autorizado" }, 401);

    const campo = CAMPOS.includes(String(b.campo)) ? String(b.campo) : "tudo";
    const bruto = String(b.termo || "").trim().slice(0, 80);
    const termos = norm(bruto).split(/\s+/).filter((t) => t.length >= 1).slice(0, 6);
    if (norm(bruto).replace(/\s+/g, "").length < 2) return json({ ok: true, itens: [], aviso: "Digite pelo menos 2 letras ou números." });
    const contem = (txt: string) => { const n = norm(txt); return termos.every((t) => n.includes(t)); };

    const nivel: string = user.nivel || "vendedora";
    const ehDiretoria = nivel === "diretoria", ehOficina = nivel === "oficina";
    const minhasLojas = lojasDaSessao(user, b.senha);
    const lojaOk = (tabela: string, lojaId: any) => ehDiretoria || (ehOficina && tabela === "ordens_servico") || (nivel === "gerente" && !minhasLojas.length) || minhasLojas.includes(String(lojaId || ""));
    const lojaNome = (id: any) => { const l = (config.lojas || []).find((x: any) => x.id === id); return l ? (l.abreviacao || l.nome || "") : ""; };
    const itens: any[] = [];
    const quer = (c: string) => campo === "tudo" || campo === c;

    // ---------- CLIENTES ----------
    if (quer("cliente") && !ehOficina) {
      const dig = bruto.replace(/\D/g, "");
      let q = admin.from("clientes_cadastro").select("id, payload").limit(25);
      if (dig.length >= 4 && dig.length === bruto.replace(/[\s().\-/]/g, "").length) {
        // só números: celular ou documento
        const telLike = dig.length >= 8 ? `%${dig.slice(-8, -4)}%${dig.slice(-4)}%` : `%${dig}%`;
        q = q.or(`payload->>telefone.ilike.${telLike},payload->>cpf.ilike.%${dig}%,payload->>cnpj.ilike.%${dig}%`);
      } else {
        for (const t of bruto.split(/\s+/).map(ilikeSeguro).filter(Boolean).slice(0, 6)) q = q.ilike("payload->>nome", `%${t}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      for (const r of data || []) { const p = r.payload || {}; itens.push({ tipo: "cliente", id: r.id, titulo: p.nome || "—", sub: [p.telefone, p.cpf || p.cnpj, p.cidade].filter(Boolean).join(" · "), cliente: { id: r.id, ...p } }); }
    }

    // ---------- VIAS (código/cliente, vendedora ou texto dentro da via) ----------
    if (quer("via") || quer("historico") || quer("vendedora")) {
      for (const [tabela, tipo] of VIAS) {
        if (ehOficina && tabela !== "ordens_servico") continue;
        const { data, error } = await admin.from(tabela).select("id, payload, created_at").order("created_at", { ascending: false }).limit(3000);
        if (error) throw error;
        for (const r of data || []) {
          const p = r.payload || {}; if (p.status === "rascunho" || !lojaOk(tabela, p.lojaId)) continue;
          const cod = p.codigoVia || p.via || "";
          let bate = false, trecho = "";
          if (campo === "vendedora") bate = contem(p.vendedora || "");
          else if (campo === "via") bate = contem([cod, p.cliente, p.telefone].join(" "));
          else if (campo === "historico") { const tx = textos(p).join(" · "); bate = contem(tx); if (bate) trecho = trechoDe(tx, termos); }
          else { bate = contem([cod, p.cliente, p.telefone, p.vendedora].join(" ")); if (!bate) { const tx = textos(p).join(" · "); bate = contem(tx); if (bate) trecho = trechoDe(tx, termos); } }
          if (!bate) continue;
          itens.push({ tipo: "via", viaTipo: tipo, id: r.id, codigoVia: cod, titulo: `${cod || "(sem código)"} — ${p.cliente || "sem cliente"}`,
            sub: [p.data ? String(p.data).slice(0, 10).split("-").reverse().join("/") : "", lojaNome(p.lojaId), p.vendedora, p.status].filter(Boolean).join(" · "), trecho,
            via: { cliente: p.cliente || "", telefone: p.telefone || "", status: p.status || "", loja: lojaNome(p.lojaId), data: p.data || "", vendedora: p.vendedora || "", valorTotal: p.valorTotal ?? null,
              itens: (Array.isArray(p.itens) ? p.itens : []).map((i: any) => `${i.produto || i.nome || i.descricao || ""}${Number(i.quantidade) > 1 ? " ×" + i.quantidade : ""}`).filter((x: string) => x.trim()).slice(0, 15),
              descricao: p.descricao || p.observacao || "", validade: p.validade || "", servico: p.serviceTypeName || "" } });
          if (itens.filter((x) => x.tipo === "via").length >= 60) break;
        }
      }
    }

    // ---------- PRODUTOS ----------
    if (quer("produto") && !ehOficina) {
      const ts = bruto.split(/\s+/).map(ilikeSeguro).filter(Boolean).slice(0, 6);
      let q = admin.from("produtos_estoque").select("id, payload").limit(25);
      if (ts.length === 1) q = q.or(`payload->>nome.ilike.%${ts[0]}%,payload->>codigoInterno.ilike.%${ts[0]}%,payload->>gtin.ilike.%${ts[0]}%`);
      else for (const t of ts) q = q.ilike("payload->>nome", `%${t}%`);
      const { data, error } = await q;
      if (error) throw error;
      for (const r of data || []) {
        const p = r.payload || {}; const epl = (p.estoquePorLoja && typeof p.estoquePorLoja === "object") ? p.estoquePorLoja : {};
        const minhas = ehDiretoria ? Object.keys(epl) : minhasLojas;
        const estoque = minhas.reduce((a: number, l: string) => a + (Number(epl[l]) || 0), 0);
        const preco = p.precoVenda != null && p.precoVenda !== "" ? "R$ " + Number(p.precoVenda).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
        itens.push({ tipo: "produto", id: r.id, titulo: p.nome || "—", sub: [p.codigoInterno ? "cód. " + p.codigoInterno : "", preco, `estoque ${estoque}`].filter(Boolean).join(" · "),
          produto: { nome: p.nome || "", codigo: p.codigoInterno || "", precoVenda: p.precoVenda ?? null, estoque, porLoja: minhas.map((l: string) => ({ loja: lojaNome(l) || l, qtd: Number(epl[l]) || 0 })) } });
      }
    }

    // ---------- TAREFAS DA AGENDA ----------
    if (quer("tarefa")) {
      const meuId: string = user.funcionarioId || user.id;
      const ehGerente = nivel === "gerente";
      const { data, error } = await admin.from("agenda_tarefas").select("id, titulo, descricao, tipo, loja_id, participantes, criador_id, criador_nome, data, hora, coluna").order("data", { ascending: false }).limit(2000);
      if (error) throw error;
      for (const t of data || []) {
        const vejo = t.criador_id === meuId || (t.tipo === "compartilhada" && (t.participantes || []).includes(meuId))
          || (t.tipo === "loja" && (ehDiretoria || (ehGerente && (!minhasLojas.length || minhasLojas.includes(t.loja_id)))));
        if (!vejo || !contem([t.titulo, t.descricao, t.criador_nome].join(" "))) continue;
        itens.push({ tipo: "tarefa", id: t.id, titulo: t.titulo || "—", sub: [t.data ? String(t.data).split("-").reverse().join("/") : "sem data", t.hora, t.criador_nome ? "de " + t.criador_nome : "", t.coluna === "feito" ? "feita" : ""].filter(Boolean).join(" · "),
          tarefa: { titulo: t.titulo, descricao: t.descricao || "", data: t.data, hora: t.hora, de: t.criador_nome || "", tipo: t.tipo, coluna: t.coluna } });
        if (itens.filter((x) => x.tipo === "tarefa").length >= 30) break;
      }
    }

    return json({ ok: true, campo, itens });
  } catch (e) {
    console.error("buscador-api", e);
    return json({ error: "Falha na busca. Tente de novo." }, 500);
  }
});
