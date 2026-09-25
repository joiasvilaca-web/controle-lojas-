import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * reforma-api — v1
 * Backend do módulo REFORMA (cliente → orçamento → custódia → O.S.).
 *
 * Ops PÚBLICAS (página reforma.html, sem sessão):
 *   publicInit, publicCriar, publicConsultar, publicAceitar
 * Ops INTERNAS (módulo reforma-admin.html, exigem `senha` = token de sessão do shell):
 *   init, listar, obter, criarBalcao, orcar, aceitePresencial, sugerirData,
 *   gerarOS, checkin, checkout, entregar, cancelar, salvarConfig, anotar
 *
 * Tabelas próprias: reforma_pedidos (id, numero bigserial, token, status, loja_id,
 * telefone_digits, payload) e reforma_config (id, payload). Bucket privado: reforma-fotos.
 * Escreve também em ordens_servico (só cria/atualiza a O.S. que ela mesma gerou) e
 * clientes_cadastro (só insere cliente novo quando não existe pelo telefone).
 * Nunca toca em gestao_config (só leitura, para validar a sessão).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const BUCKET = "reforma-fotos";
const MAX_FOTOS = 6;
const MAX_FOTO_BYTES = 3 * 1024 * 1024;        // por foto, já em base64
const LIMITE_PEDIDOS_TEL_24H = 5;
const LIMITE_PEDIDOS_IP_24H = 25;
const VALIDADE_ORCAMENTO_DIAS = 10;            // CDC art. 40
const SIGNED_CURTO = 60 * 60;                  // 1h (visualização)
const SIGNED_LONGO = 60 * 60 * 24 * 365 * 10;  // 10 anos (URL guardada dentro da O.S.)

const STATUS = {
  NOVO: "novo", ORCADO: "orcado", APROVADO: "aprovado", RECUSADO: "recusado",
  EM_CUSTODIA: "em_custodia", OS_GERADA: "os_gerada", PRONTO: "pronto",
  ENTREGUE: "entregue", CANCELADO: "cancelado",
};

const SERVICOS_PADRAO = [
  { id: "ajuste", nome: "Ajuste de tamanho" },
  { id: "solda", nome: "Solda / conserto" },
  { id: "pedra", nome: "Troca ou cravação de pedra" },
  { id: "polimento", nome: "Polimento / banho" },
  { id: "transformar", nome: "Transformar em outra peça" },
  { id: "outro", nome: "Outro" },
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function onlyDigits(s: unknown) { return String(s || "").replace(/\D/g, ""); }
function maiusc(s: unknown) { return s == null ? "" : String(s).trim().toUpperCase(); }
function uid(p: string) { return p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function gerarToken() {
  const alf = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => alf[b % alf.length]).join("");
}
/** Data de hoje no horário de Brasília (AAAA-MM-DD). */
function hojeBR() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }
function addDias(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function fmtTel(d: string) {
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
function codigoDe(numero: number) { return "R" + String(numero).padStart(5, "0"); }

// ---------- sessão (mesma regra do db-gateway) ----------
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
function moduloAtivo(user: any): boolean {
  const perm = user.permissoes;
  if (perm && perm.reforma && typeof perm.reforma.ativo === "boolean") return perm.reforma.ativo;
  if (user.nivel === "diretoria" || user.nivel === "gerente") return true;
  if (user.nivel === "oficina") return false;   // padrão: liberar por usuário no DP
  return true;                                  // vendedora
}
function usuarioPublico(u: any) {
  return { id: u.id, nome: u.nome, nivel: u.nivel, lojas: Array.isArray(u.lojas) ? u.lojas : [] };
}
function gestaoTotal(u: any) { return u.nivel === "diretoria" || u.nivel === "gerente"; }

async function loadConfig() {
  const { data, error } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  if (error) throw error;
  return (data && data.payload) || {};
}
async function loadReformaConfig() {
  const { data, error } = await admin.from("reforma_config").select("payload").eq("id", "config").maybeSingle();
  if (error) throw error;
  return (data && data.payload) || {};
}
function lojaDe(config: any, id: string) { return (config.lojas || []).find((l: any) => l.id === id) || null; }

/** Lojas que aparecem para o cliente: as marcadas na config do módulo (ou padrão MC/JV/JN/RJ). */
function lojasPublicas(config: any, rcfg: any) {
  const padrao = ["loja_mc", "loja_jb", "loja_jn", "loja_rj"];
  const ids: string[] = Array.isArray(rcfg.lojasPublicas) && rcfg.lojasPublicas.length ? rcfg.lojasPublicas : padrao;
  const extras = rcfg.lojasInfo || {};
  return ids.map((id) => {
    const l = lojaDe(config, id); if (!l) return null;
    const ex = extras[id] || {};
    const end = [l.endereco, l.numero].filter(Boolean).join(", ") + (l.bairro ? " — " + l.bairro : "");
    return {
      id, nome: ex.apelido || l.nome, abreviacao: l.abreviacao || "",
      endereco: ex.endereco || end || "", horario: ex.horario || "", telefone: ex.telefone || l.telefone || "",
    };
  }).filter(Boolean);
}

// ---------- storage ----------
async function uploadDataUrl(path: string, dataUrl: string) {
  const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(dataUrl || "");
  if (!m) throw new Error("foto inválida (formato)");
  if (m[2].length > MAX_FOTO_BYTES * 1.4) throw new Error("foto grande demais");
  const bin = atob(m[2]); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: m[1].replace("jpg", "jpeg"), upsert: false });
  if (error) throw error;
  return path;
}
async function subirFotos(pedidoId: string, tipo: string, fotos: any[], por: string) {
  const out: any[] = [];
  const lista = Array.isArray(fotos) ? fotos.slice(0, MAX_FOTOS) : [];
  for (const f of lista) {
    const dataUrl = typeof f === "string" ? f : (f && f.dataUrl);
    if (!dataUrl) continue;
    const id = uid("ft");
    const ext = /^data:image\/png/i.test(dataUrl) ? "png" : "jpg";
    const path = `pedidos/${pedidoId}/${tipo}_${id}.${ext}`;
    await uploadDataUrl(path, dataUrl);
    out.push({ id, path, tipo, nome: (f && f.nome) || `${tipo}_${id}.${ext}`, criadoEm: Date.now(), por });
  }
  return out;
}
async function assinarFotos(fotos: any[], exp = SIGNED_CURTO) {
  const paths = (fotos || []).map((f: any) => f.path).filter(Boolean);
  if (!paths.length) return fotos || [];
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrls(paths, exp);
  if (error) throw error;
  const mapa: Record<string, string> = {};
  (data || []).forEach((d: any) => { if (d && d.path && d.signedUrl) mapa[d.path] = d.signedUrl; });
  return (fotos || []).map((f: any) => ({ ...f, url: mapa[f.path] || null }));
}

// ---------- pedidos ----------
async function getPedido(id: string) {
  const { data, error } = await admin.from("reforma_pedidos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}
async function getPedidoPorToken(token: string) {
  const { data, error } = await admin.from("reforma_pedidos").select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return data;
}
async function salvarPedido(row: any, payload: any) {
  const { error } = await admin.from("reforma_pedidos").update({
    payload, status: payload.status, loja_id: payload.lojaId || null, updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (error) throw error;
}
function evento(p: any, tipo: string, por: string, detalhe?: string) {
  p.historico = Array.isArray(p.historico) ? p.historico : [];
  p.historico.push({ em: Date.now(), tipo, por, detalhe: detalhe || "" });
}
function orcamentoExpirado(p: any) {
  return p.status === STATUS.ORCADO && p.orcamento && p.orcamento.validadeAte && p.orcamento.validadeAte < hojeBR();
}
/** Formato que a página do cliente pode ver (nunca informação interna). */
async function visaoCliente(row: any, config: any, rcfg: any) {
  const p = row.payload || {};
  const loja = lojasPublicas(config, rcfg).find((l: any) => l.id === p.lojaId) || (() => {
    const l = lojaDe(config, p.lojaId); return l ? { id: l.id, nome: l.nome, endereco: "", horario: "", telefone: "" } : null;
  })();
  const fotos = await assinarFotos(p.fotos || []);
  const cust = p.custodia || {};
  const status = orcamentoExpirado(p) ? "expirado" : p.status;
  return {
    codigo: codigoDe(row.numero), status, criadoEm: p.criadoEm,
    cliente: { nome: p.cliente?.nome || "", telefone: p.cliente?.telefone || "" },
    servico: p.servicoNome || p.servico, descricao: p.descricao || "", pesoInformado: p.pesoInformado || null,
    loja,
    fotos: fotos.map((f: any) => ({ id: f.id, url: f.url, tipo: f.tipo })),
    orcamento: p.orcamento ? {
      valor: p.orcamento.valor, prazoDias: p.orcamento.prazoDias, validadeAte: p.orcamento.validadeAte,
      observacoes: p.orcamento.observacoesCliente || "", cotacaoOuroG: p.orcamento.cotacaoOuroG || null, em: p.orcamento.em,
    } : null,
    aceite: p.aceite ? { em: p.aceite.em, modo: p.aceite.modo } : null,
    custodia: cust.entrada ? {
      entrada: { peso: cust.entrada.peso, teor: cust.entrada.teor, lacre: cust.entrada.lacre, em: cust.entrada.em,
        fotos: (await assinarFotos(cust.entrada.fotos || [])).map((f: any) => ({ id: f.id, url: f.url })) },
      saida: cust.saida ? { peso: cust.saida.peso, lacre: cust.saida.lacre || "", em: cust.saida.em,
        fotos: (await assinarFotos(cust.saida.fotos || [])).map((f: any) => ({ id: f.id, url: f.url })) } : null,
      entrega: cust.entrega ? { em: cust.entrega.em, recebidoPor: cust.entrega.recebidoPor || "" } : null,
    } : null,
    os: p.os ? { codigoVia: p.os.codigoVia, dataPrevista: p.os.data } : null,
    historico: (p.historico || []).filter((h: any) => !["anotacao"].includes(h.tipo)).map((h: any) => ({ em: h.em, tipo: h.tipo })),
  };
}

function validarNovo(params: any) {
  const nome = maiusc(params.nome);
  const tel = onlyDigits(params.telefone);
  if (nome.length < 3) throw new Error("Informe o nome.");
  if (tel.length !== 10 && tel.length !== 11) throw new Error("Telefone inválido (use DDD + número).");
  if (!params.lojaId) throw new Error("Escolha a loja.");
  const servico = String(params.servico || "outro");
  const descricao = String(params.descricao || "").trim().slice(0, 1500);
  if (descricao.length < 5) throw new Error("Descreva o que precisa ser feito.");
  const peso = params.peso != null && params.peso !== "" ? Number(String(params.peso).replace(",", ".")) : null;
  return { nome, tel, servico, descricao, peso: (peso != null && !isNaN(peso) && peso > 0) ? peso : null };
}

async function criarPedido(params: any, config: any, rcfg: any, origem: "cliente" | "balcao", por: string, ip: string) {
  const v = validarNovo(params);
  if (!lojaDe(config, params.lojaId)) throw new Error("Loja inválida.");
  const servicos = Array.isArray(rcfg.servicos) && rcfg.servicos.length ? rcfg.servicos : SERVICOS_PADRAO;
  const sv = servicos.find((s: any) => s.id === v.servico) || { id: "outro", nome: "Outro" };
  const id = uid("ref_");
  const token = gerarToken();
  const payload: any = {
    id, token, origem, status: STATUS.NOVO, criadoEm: Date.now(),
    cliente: { nome: v.nome, telefone: fmtTel(v.tel), email: String(params.email || "").trim().slice(0, 120) },
    lojaId: params.lojaId, servico: sv.id, servicoNome: sv.nome, descricao: v.descricao, pesoInformado: v.peso,
    aceiteTermos: origem === "cliente" ? { em: Date.now(), ip, ua: String(params.ua || "").slice(0, 200) } : null,
    fotos: [], historico: [],
  };
  evento(payload, "criado", por, origem === "cliente" ? "Pedido enviado pelo cliente" : "Pedido lançado no balcão");
  const { data, error } = await admin.from("reforma_pedidos").insert({
    id, token, status: STATUS.NOVO, loja_id: params.lojaId, telefone_digits: v.tel, payload,
  }).select("numero").single();
  if (error) throw error;
  // fotos só depois de ter o id (path usa o id do pedido)
  try {
    payload.fotos = await subirFotos(id, "cliente", params.fotos, por);
  } catch (e) {
    console.error("upload fotos", e);
    payload.fotosErro = String(e);
  }
  payload.numero = data.numero; payload.codigo = codigoDe(data.numero);
  await salvarPedido({ id }, payload);
  return { id, token, numero: data.numero, codigo: payload.codigo };
}

/** Primeira data que respeita prazo e (se existir) limite diário do Tipo de Ordem. */
async function sugerirData(config: any, serviceTypeId: string, prazoDias: number) {
  const st = (config.serviceTypes || []).find((s: any) => s.id === serviceTypeId);
  const prazoMin = st && Number(st.prazoMinimoDias) > 0 ? Number(st.prazoMinimoDias) : 0;
  const maxDia = st && Number(st.maxPorDia) > 0 ? Number(st.maxPorDia) : 0;
  let d = addDias(hojeBR(), Math.max(prazoDias || 0, prazoMin));
  if (!maxDia) return { data: d, motivo: "prazo" };
  for (let i = 0; i < 90; i++) {
    const { count, error } = await admin.from("ordens_servico").select("id", { count: "exact", head: true })
      .eq("payload->>serviceTypeId", serviceTypeId).eq("payload->>data", d).eq("payload->>status", "aguardando");
    if (error) throw error;
    if ((count || 0) < maxDia) return { data: d, motivo: "vaga", ocupadas: count || 0, vagas: maxDia };
    d = addDias(d, 1);
  }
  return { data: d, motivo: "sem vaga em 90 dias" };
}

async function garantirCliente(p: any) {
  const digits = onlyDigits(p.cliente?.telefone);
  if (digits.length < 10) return null;
  const { data } = await admin.from("clientes_cadastro").select("id,payload").ilike("payload->>telefone", `%${digits.slice(-8)}%`).limit(10);
  const achado = (data || []).find((c: any) => onlyDigits(c.payload?.telefone) === digits);
  if (achado) return achado.id;
  const id = uid("cli_");
  const cli = { id, nome: p.cliente.nome, telefone: p.cliente.telefone, email: p.cliente.email || "", cpf: "", criadoEm: Date.now(), origem: "reforma" };
  const { error } = await admin.from("clientes_cadastro").insert({ id, payload: cli });
  if (error) { console.error("cliente", error); return null; }
  return id;
}

function textoCustodia(p: any) {
  const e = p.custodia && p.custodia.entrada; if (!e) return "";
  return `CUSTÓDIA: PESO ENTRADA ${e.peso} g · TEOR ${e.teor}${e.teorObs ? " (" + e.teorObs + ")" : ""} · LACRE ${e.lacre}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const op = String(body.op || "");
    const params = body.params || {};
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "0.0.0.0";
    const config = await loadConfig();
    const rcfg = await loadReformaConfig();

    // ==================== PÚBLICO ====================
    if (op === "publicInit") {
      const servicos = Array.isArray(rcfg.servicos) && rcfg.servicos.length ? rcfg.servicos : SERVICOS_PADRAO;
      return json({ ok: true, lojas: lojasPublicas(config, rcfg), servicos, textos: {
        titulo: rcfg.tituloPublico || "Reforma de joias", subtitulo: rcfg.subtituloPublico || "Mande as fotos, receba o orçamento no WhatsApp e leve a peça na loja já com o valor fechado.",
        termo: rcfg.termoCliente || "Ao enviar, você autoriza o uso das fotos e do seu telefone apenas para este orçamento (LGPD). O orçamento tem validade de 10 dias.",
      } });
    }
    if (op === "publicCriar") {
      const tel = onlyDigits(params.telefone);
      const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count: cTel } = await admin.from("reforma_pedidos").select("id", { count: "exact", head: true }).eq("telefone_digits", tel).gte("created_at", desde);
      if ((cTel || 0) >= LIMITE_PEDIDOS_TEL_24H) return json({ error: "Limite de pedidos por dia atingido para este telefone." }, 429);
      const { count: cIp } = await admin.from("reforma_pedidos").select("id", { count: "exact", head: true }).eq("payload->aceiteTermos->>ip", ip).gte("created_at", desde);
      if ((cIp || 0) >= LIMITE_PEDIDOS_IP_24H) return json({ error: "Muitos pedidos deste dispositivo. Tente mais tarde." }, 429);
      if (!params.aceiteTermos) return json({ error: "É preciso aceitar os termos." }, 400);
      const r = await criarPedido(params, config, rcfg, "cliente", "CLIENTE", ip);
      return json({ ok: true, token: r.token, codigo: r.codigo });
    }
    if (op === "publicConsultar") {
      const row = await getPedidoPorToken(String(params.token || ""));
      if (!row) return json({ error: "Pedido não encontrado." }, 404);
      return json({ ok: true, pedido: await visaoCliente(row, config, rcfg) });
    }
    if (op === "publicAceitar") {
      const row = await getPedidoPorToken(String(params.token || ""));
      if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (p.status !== STATUS.ORCADO) return json({ error: "Este orçamento não está aguardando resposta." }, 400);
      if (orcamentoExpirado(p)) return json({ error: "Orçamento vencido. Peça um novo pela loja." }, 400);
      if (params.aceite === true) {
        p.status = STATUS.APROVADO;
        p.aceite = { em: Date.now(), modo: "online", ip, ua: String(params.ua || "").slice(0, 200), valor: p.orcamento.valor, prazoDias: p.orcamento.prazoDias, texto: String(params.texto || "").slice(0, 500) };
        evento(p, "aprovado", "CLIENTE", "Aceite online");
      } else {
        p.status = STATUS.RECUSADO;
        p.recusa = { em: Date.now(), motivo: String(params.motivo || "").slice(0, 300) };
        evento(p, "recusado", "CLIENTE", p.recusa.motivo);
      }
      await salvarPedido(row, p);
      return json({ ok: true, pedido: await visaoCliente({ ...row, payload: p }, config, rcfg) });
    }

    // ==================== INTERNO (sessão) ====================
    const senha = body.senha;
    const user = (Array.isArray(config.users) ? config.users : []).find((u: any) => sessaoValida(u, senha)) || null;
    if (!user) return json({ error: "Sessão inválida ou expirada." }, 401);
    if (!moduloAtivo(user)) return json({ error: "Sem permissão para o módulo Reforma." }, 403);
    const por = user.nome;
    const lojasUser: string[] = Array.isArray(user.lojas) ? user.lojas : [];
    const podeVerLoja = (lojaId: string) => gestaoTotal(user) || !lojasUser.length || lojasUser.includes(lojaId);

    if (op === "init") {
      return json({ ok: true, user: usuarioPublico(user), lojas: (config.lojas || []).map((l: any) => ({ id: l.id, nome: l.nome, abreviacao: l.abreviacao, cor: l.cor })),
        serviceTypes: config.serviceTypes || [], servicos: Array.isArray(rcfg.servicos) && rcfg.servicos.length ? rcfg.servicos : SERVICOS_PADRAO,
        config: rcfg, lojasPublicas: lojasPublicas(config, rcfg), gestao: gestaoTotal(user) });
    }
    if (op === "listar") {
      let q = admin.from("reforma_pedidos").select("id,numero,status,loja_id,created_at,updated_at,payload").order("created_at", { ascending: false }).limit(500);
      if (Array.isArray(params.status) && params.status.length) q = q.in("status", params.status);
      if (params.lojaId) q = q.eq("loja_id", params.lojaId);
      if (params.de) q = q.gte("created_at", params.de + "T00:00:00-03:00");
      if (params.ate) q = q.lte("created_at", params.ate + "T23:59:59-03:00");
      const { data, error } = await q; if (error) throw error;
      const busca = String(params.busca || "").trim().toUpperCase();
      const bd = onlyDigits(busca);
      const lista = (data || []).filter((r: any) => podeVerLoja(r.loja_id)).filter((r: any) => {
        if (!busca) return true;
        const p = r.payload || {};
        return codigoDe(r.numero).includes(busca) || String(p.cliente?.nome || "").includes(busca) ||
          (bd.length >= 4 && onlyDigits(p.cliente?.telefone).includes(bd)) || String(p.os?.codigoVia || "").toUpperCase().includes(busca) ||
          String(p.custodia?.entrada?.lacre || "").toUpperCase().includes(busca);
      }).map((r: any) => {
        const p = r.payload || {};
        return { id: r.id, codigo: codigoDe(r.numero), status: orcamentoExpirado(p) ? "expirado" : r.status, lojaId: r.loja_id, criadoEm: p.criadoEm,
          cliente: p.cliente, servicoNome: p.servicoNome, descricao: p.descricao, valor: p.orcamento?.valor ?? null, validadeAte: p.orcamento?.validadeAte || null,
          os: p.os ? { codigoVia: p.os.codigoVia, data: p.os.data } : null, lacre: p.custodia?.entrada?.lacre || null, origem: p.origem, nFotos: (p.fotos || []).length };
      });
      return json({ ok: true, pedidos: lista });
    }
    if (op === "obter") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      if (!podeVerLoja(row.loja_id)) return json({ error: "Pedido de outra loja." }, 403);
      const p = row.payload;
      const out = { ...p, codigo: codigoDe(row.numero), numero: row.numero, statusCalc: orcamentoExpirado(p) ? "expirado" : p.status };
      out.fotos = await assinarFotos(p.fotos || []);
      if (out.custodia?.entrada) out.custodia = { ...out.custodia, entrada: { ...out.custodia.entrada, fotos: await assinarFotos(out.custodia.entrada.fotos || []) } };
      if (out.custodia?.saida) out.custodia = { ...out.custodia, saida: { ...out.custodia.saida, fotos: await assinarFotos(out.custodia.saida.fotos || []) } };
      return json({ ok: true, pedido: out });
    }
    if (op === "criarBalcao") {
      const r = await criarPedido(params, config, rcfg, "balcao", por, ip);
      return json({ ok: true, ...r });
    }
    if (op === "orcar") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (![STATUS.NOVO, STATUS.ORCADO, STATUS.RECUSADO].includes(p.status)) return json({ error: "Este pedido já passou da fase de orçamento." }, 400);
      const valor = Number(String(params.valor ?? "").replace(",", "."));
      const prazoDias = parseInt(params.prazoDias, 10);
      if (!(valor > 0)) return json({ error: "Valor inválido." }, 400);
      if (!(prazoDias >= 0)) return json({ error: "Prazo inválido." }, 400);
      const validadeDias = parseInt(params.validadeDias, 10) > 0 ? parseInt(params.validadeDias, 10) : VALIDADE_ORCAMENTO_DIAS;
      p.orcamento = {
        valor: Math.round(valor * 100) / 100, prazoDias, cotacaoOuroG: params.cotacaoOuroG ? Number(String(params.cotacaoOuroG).replace(",", ".")) : null,
        observacoesCliente: String(params.observacoesCliente || "").trim().slice(0, 800),
        observacoesInternas: String(params.observacoesInternas || "").trim().slice(0, 800),
        validadeAte: addDias(hojeBR(), validadeDias), em: Date.now(), por,
      };
      p.status = STATUS.ORCADO; p.aceite = null;
      evento(p, "orcado", por, `R$ ${p.orcamento.valor.toFixed(2)} · ${prazoDias} dia(s)`);
      await salvarPedido(row, p);
      return json({ ok: true });
    }
    if (op === "aceitePresencial") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (p.status !== STATUS.ORCADO && p.status !== STATUS.RECUSADO) return json({ error: "Só é possível registrar aceite de orçamento enviado." }, 400);
      p.status = STATUS.APROVADO;
      p.aceite = { em: Date.now(), modo: "presencial", por, valor: p.orcamento?.valor, prazoDias: p.orcamento?.prazoDias };
      evento(p, "aprovado", por, "Aceite presencial");
      await salvarPedido(row, p);
      return json({ ok: true });
    }
    if (op === "anotar") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      const texto = String(params.texto || "").trim().slice(0, 600);
      if (!texto) return json({ error: "Anotação vazia." }, 400);
      evento(p, "anotacao", por, texto);
      await salvarPedido(row, p);
      return json({ ok: true });
    }
    if (op === "sugerirData") {
      return json({ ok: true, ...(await sugerirData(config, String(params.serviceTypeId || ""), parseInt(params.prazoDias, 10) || 0)) });
    }
    if (op === "checkin") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (![STATUS.APROVADO, STATUS.OS_GERADA, STATUS.NOVO, STATUS.ORCADO].includes(p.status)) return json({ error: "Status não permite check-in." }, 400);
      if (p.custodia?.entrada) return json({ error: "Check-in já registrado." }, 400);
      const peso = Number(String(params.peso ?? "").replace(",", "."));
      if (!(peso > 0)) return json({ error: "Peso de entrada obrigatório." }, 400);
      const lacre = String(params.lacre || "").trim().toUpperCase();
      if (!lacre) return json({ error: "Número do lacre obrigatório." }, 400);
      const fotos = await subirFotos(row.id, "entrada", params.fotos, por);
      p.custodia = { ...(p.custodia || {}), entrada: {
        peso: Math.round(peso * 1000) / 1000, teor: String(params.teor || "").trim().toUpperCase() || "NÃO TESTADO", teorObs: String(params.teorObs || "").trim().slice(0, 200),
        lacre, fotos, assinatura: typeof params.assinatura === "string" && params.assinatura.startsWith("data:image/png") && params.assinatura.length < 400000 ? params.assinatura : null,
        observacoes: String(params.observacoes || "").trim().slice(0, 600), em: Date.now(), por, lojaId: params.lojaId || p.lojaId,
      } };
      if (p.status !== STATUS.OS_GERADA) p.status = STATUS.EM_CUSTODIA;
      evento(p, "checkin", por, `Peso ${p.custodia.entrada.peso} g · lacre ${lacre}`);
      // se a O.S. já existe, registra a custódia nela (só na O.S. que este módulo criou)
      if (p.os?.id) {
        const { data: os } = await admin.from("ordens_servico").select("payload").eq("id", p.os.id).maybeSingle();
        if (os && os.payload && os.payload.reformaId === row.id) {
          const pl = os.payload;
          pl.infoInterna = [pl.infoInterna || "", textoCustodia(p)].filter(Boolean).join("\n");
          await admin.from("ordens_servico").update({ payload: pl, updated_at: new Date().toISOString() }).eq("id", p.os.id);
        }
      }
      await salvarPedido(row, p);
      return json({ ok: true, entrada: { ...p.custodia.entrada, fotos: await assinarFotos(fotos) } });
    }
    if (op === "gerarOS") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (p.os?.id) return json({ error: "Este pedido já tem O.S. " + (p.os.codigoVia || "") }, 400);
      if (![STATUS.APROVADO, STATUS.EM_CUSTODIA].includes(p.status)) return json({ error: "Gere a O.S. só depois do aceite do cliente." }, 400);
      if (!p.orcamento) return json({ error: "Pedido sem orçamento." }, 400);
      const lojaId = String(params.lojaId || p.lojaId);
      const loja = lojaDe(config, lojaId); if (!loja) return json({ error: "Loja inválida." }, 400);
      const st = (config.serviceTypes || []).find((s: any) => s.id === params.serviceTypeId);
      if (!st) return json({ error: "Escolha o Tipo de Ordem." }, 400);
      const data = /^\d{4}-\d{2}-\d{2}$/.test(String(params.data || "")) ? String(params.data) : (await sugerirData(config, st.id, p.orcamento.prazoDias)).data;
      const abrev = String(loja.abreviacao || "XX").toUpperCase().trim();
      const { data: seq, error: eSeq } = await admin.rpc("incrementar_via_sequence", { p_chave: `codigo_${abrev}_pedido` });
      if (eSeq) throw eSeq;
      const codigoVia = `${abrev}${seq}P`;
      const codigo = codigoDe(row.numero);
      const fotosOS = (await assinarFotos([...(p.fotos || []), ...((p.custodia?.entrada?.fotos) || [])], SIGNED_LONGO))
        .filter((f: any) => f.url).map((f: any) => ({ id: f.id, nome: f.nome || f.id, criadoEm: f.criadoEm || Date.now(), driveUrl: f.url }));
      const descricao = maiusc([`REFORMA ${codigo} · ${p.servicoNome || p.servico}: ${p.descricao}`, textoCustodia(p), params.descricaoExtra].filter(Boolean).join(" | ")).slice(0, 2000);
      const vendedora = maiusc(params.vendedora || por);
      const osId = uid("ord");
      const order: any = {
        id: osId,
        cliente: maiusc(p.cliente.nome), telefone: p.cliente.telefone || "", email: p.cliente.email || "", cpf: "", dataNascimento: "",
        cep: "", endereco: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
        via: "", numeroNota: "", vendedora, descricao, lojaId,
        serviceTypeId: st.id, serviceTypeName: st.nome || "",
        data, status: "aguardando", encaixe: false, autorizadoPor: null,
        valorTotal: p.orcamento.valor, pagamentos: [], momentoPagamento: "na_volta", emissaoNota: "",
        lojaSaidaId: "", lojaPagamentoId: "", lojaNotaId: "",
        localAtual: "loja", historicoLocal: [{ local: "loja", em: Date.now(), por }],
        observacoes: [], fotos: fotosOS,
        infoInterna: [`GERADA PELO MÓDULO REFORMA (${codigo}) POR ${por}`, p.orcamento.observacoesInternas ? "OBS ORÇAMENTO: " + maiusc(p.orcamento.observacoesInternas) : ""].filter(Boolean).join("\n"),
        creditoUsado: 0, fiadoDebitoId: null, criadoEm: Date.now(), codigoVia,
        itens: [{ id: uid("it"), produto: maiusc(`REFORMA - ${p.servicoNome || p.servico}`), metal: "", quantidade: 1, valorUnitario: p.orcamento.valor,
          produtoEstoqueId: "", precoOriginal: "", ajusteTipo: "nenhum", ajusteModo: "percentual", ajusteQtd: "", ajustePerc: "", ajusteValR: "", observacaoItem: maiusc(p.descricao).slice(0, 300) }],
        origem: "reforma", reformaId: row.id, reformaCodigo: codigo,
      };
      const { error: eIns } = await admin.from("ordens_servico").insert({ id: osId, payload: order, updated_at: new Date().toISOString() });
      if (eIns) throw eIns;
      const clienteId = await garantirCliente(p);
      p.os = { id: osId, codigoVia, lojaId, serviceTypeId: st.id, serviceTypeName: st.nome || "", data, em: Date.now(), por, clienteId };
      p.status = STATUS.OS_GERADA;
      evento(p, "os_gerada", por, `O.S. ${codigoVia} · previsão ${data}`);
      await salvarPedido(row, p);
      return json({ ok: true, os: p.os });
    }
    if (op === "checkout") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (!p.custodia?.entrada) return json({ error: "Faça o check-in de entrada antes." }, 400);
      if (p.custodia?.saida) return json({ error: "Check-out já registrado." }, 400);
      const peso = Number(String(params.peso ?? "").replace(",", "."));
      if (!(peso > 0)) return json({ error: "Peso de saída obrigatório." }, 400);
      const fotos = await subirFotos(row.id, "saida", params.fotos, por);
      p.custodia.saida = { peso: Math.round(peso * 1000) / 1000, lacre: String(params.lacre || "").trim().toUpperCase(), fotos, observacoes: String(params.observacoes || "").trim().slice(0, 600), em: Date.now(), por };
      p.status = STATUS.PRONTO;
      evento(p, "checkout", por, `Peso saída ${p.custodia.saida.peso} g`);
      await salvarPedido(row, p);
      return json({ ok: true });
    }
    if (op === "entregar") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if (p.status !== STATUS.PRONTO) return json({ error: "Registre o check-out (peso de saída) antes da entrega." }, 400);
      p.custodia = p.custodia || {};
      p.custodia.entrega = { em: Date.now(), por, recebidoPor: maiusc(params.recebidoPor || p.cliente.nome),
        assinatura: typeof params.assinatura === "string" && params.assinatura.startsWith("data:image/png") && params.assinatura.length < 400000 ? params.assinatura : null };
      p.status = STATUS.ENTREGUE;
      evento(p, "entregue", por, `Recebido por ${p.custodia.entrega.recebidoPor}`);
      await salvarPedido(row, p);
      return json({ ok: true });
    }
    if (op === "cancelar") {
      const row = await getPedido(String(params.id || "")); if (!row) return json({ error: "Pedido não encontrado." }, 404);
      const p = row.payload;
      if ([STATUS.ENTREGUE, STATUS.CANCELADO].includes(p.status)) return json({ error: "Pedido já encerrado." }, 400);
      const motivo = String(params.motivo || "").trim().slice(0, 300);
      if (!motivo) return json({ error: "Informe o motivo." }, 400);
      p.cancelamento = { motivo, em: Date.now(), por };
      p.status = STATUS.CANCELADO;
      evento(p, "cancelado", por, motivo);
      await salvarPedido(row, p);
      return json({ ok: true });
    }
    if (op === "salvarConfig") {
      if (!gestaoTotal(user)) return json({ error: "Só Diretoria/Gerente altera a configuração." }, 403);
      const novo = params.config && typeof params.config === "object" ? params.config : null;
      if (!novo) return json({ error: "Config inválida." }, 400);
      const { error } = await admin.from("reforma_config").upsert({ id: "config", payload: novo, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: "op desconhecida: " + op }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as any)?.message || e) }, 500);
  }
});
