// ATENÇÃO (auditoria 11/11/2026): este arquivo é a v5. O que está PUBLICADO no Supabase é a v8.
// NÃO publique este arquivo como está — a v8 publicada tem, além do que está aqui:
//   1) PASTA_RAIZ "1J2AHWmhJX_D62HvCTIi1KFVSTBiB0BXL" (BLINDADO › I.A. APP › BACKUP VILACA APP)
//      e as funções moverParaRaiz()/e.raizMovida, que levaram PROGRAMACAO e DADOS para lá;
//   2) o nome novo no resumo.json ("VILAÇA APP — Vilaça Joias");
//   3) tolerância a cota ilimitada do Drive (limit = 0 não conta como "quase cheio").
// Para republicar, copie a versão v8 do painel do Supabase (Edge Functions › backup-drive), não este arquivo.
// backup-drive v5 — v5: grava pela conta joiasvilaca@gmail.com (google_contas), com a antiga como reserva.
// backup-drive v4 — backup automático do Gestão e Controle no Google Drive.
// Pastas (Drive de joiasvilaca@gmail.com › APP GESTAO › BACKUP, compartilhada com vilacajoias3 como editor):
//   PROGRAMACAO › programacao_<data>.zip (código do GitHub, só quando muda)
//               › estrutura-banco_<data>.sql (tabelas, índices, funções, gatilhos, buckets, agendamentos; só quando muda)
//   DADOS       › <AAAA-MM-DD HHhMM>/ uma tabela por arquivo (.json) + resumo.json
//               › FOTOS/<bucket>/… espelho das fotos (só copia o que é novo ou mudou)
// Roda sozinho (pg_cron a cada 15 min: snapshot a cada 6 h, fotos continuam aos poucos) e pelo botão em Configurações › Backup.
// Não guarda segredos (tabelas *_segredos e a linha 'segredos' de reforma_config) nem as tabelas de backup/limpeza.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const PASTA_PROG = "1TJK8Xvi3VFtTRppWAW6tniQUwGzmzUNd";
const PASTA_DADOS = "1jb3kG7OP5bzSXD7svJ34AMVEm7k1ou22";
const REPO_ZIP = "https://codeload.github.com/joiasvilaca-web/controle-lojas-/zip/refs/heads/main";
const INTERVALO_MS = 6 * 3600 * 1000;
const ORCAMENTO_MS = 25 * 1000;   // cada chamada faz um pedaço e chama a próxima (limite de CPU por chamada)
const MAX_TABELAS = 6, MAX_FOTOS = 20;
const EXCLUIR = /(_backup|backup_pre|^limpeza_|^backup_estado$|segredos$|^customers$|^inventory$)/;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- Google Drive ----------
let tk: { v: string; exp: number } | null = null;
async function token() {
  if (tk && tk.exp > Date.now()) return tk.v;
  // Conta principal: joiasvilaca@gmail.com (google_contas); se não estiver conectada, a conta antiga.
  const { data: gc } = await admin.from("google_contas").select("refresh_token").eq("id", "drive").maybeSingle();
  const pedir = (rt: string) => fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!, refresh_token: rt, grant_type: "refresh_token" }) }).then((x) => x.json());
  let j = gc && gc.refresh_token ? await pedir(gc.refresh_token) : {};
  if (!j.access_token) j = await pedir(Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN")!);
  const r = { status: j.access_token ? 200 : 400 };
  if (!j.access_token) throw new Error("Google Drive recusou o acesso: " + (j.error_description || j.error || r.status));
  tk = { v: j.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return tk.v;
}
async function drive(path: string, init: RequestInit = {}) {
  const r = await fetch("https://www.googleapis.com/drive/v3/" + path, { ...init, headers: { Authorization: "Bearer " + await token(), "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error("Drive " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.status === 204 ? {} : r.json();
}
async function criarPasta(nome: string, pai: string) {
  const j: any = await drive("files?fields=id&supportsAllDrives=true", { method: "POST", body: JSON.stringify({ name: nome, parents: [pai], mimeType: "application/vnd.google-apps.folder" }) });
  return j.id as string;
}
async function acharOuCriarPasta(nome: string, pai: string) {
  const q = encodeURIComponent(`name='${nome.replace(/'/g, "\\'")}' and '${pai}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const j: any = await drive(`files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  return j.files && j.files[0] ? j.files[0].id as string : await criarPasta(nome, pai);
}
async function listar(pai: string) {
  const out: any[] = []; let pt = "";
  do {
    const q = encodeURIComponent(`'${pai}' in parents and trashed=false`);
    const j: any = await drive(`files?q=${q}&fields=nextPageToken,files(id,name,mimeType,createdTime)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pt ? "&pageToken=" + pt : ""}`);
    out.push(...(j.files || [])); pt = j.nextPageToken || "";
  } while (pt);
  return out;
}
async function enviar(nome: string, pai: string, dados: Uint8Array, mime: string) {
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id", { method: "POST", headers: { Authorization: "Bearer " + await token(), "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime }, body: JSON.stringify({ name: nome, parents: [pai] }) });
  if (!r.ok) throw new Error("Drive upload " + r.status + ": " + (await r.text()).slice(0, 200));
  const p = await fetch(r.headers.get("Location")!, { method: "PUT", headers: { "Content-Type": mime }, body: dados });
  if (!p.ok) throw new Error("Drive upload " + p.status + ": " + (await p.text()).slice(0, 200));
  return (await p.json()).id as string;
}
const lixeira = (id: string) => drive(`files/${id}?supportsAllDrives=true`, { method: "PATCH", body: JSON.stringify({ trashed: true }) }).catch(() => {});

// ---------- utilidades ----------
const enc = new TextEncoder();
async function hash(b: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b))).map((x) => x.toString(16).padStart(2, "0")).join(""); }
function agoraBR() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}h${p.minute}`;
}
async function lerEstado() { const { data } = await admin.from("backup_estado").select("payload").eq("id", "drive").maybeSingle(); return (data && data.payload) || {}; }
async function salvarEstado(e: any) { await admin.from("backup_estado").upsert({ id: "drive", payload: e, updated_at: new Date().toISOString() }); }
function log(e: any, msg: string) { e.log = [{ em: new Date().toISOString(), msg }, ...(e.log || [])].slice(0, 40); }
async function selectAll(t: string) {
  let linhas: any[] = [];
  for (let from = 0; from < 500000; from += 1000) {
    let q = await admin.from(t).select("*").order("id", { ascending: true }).range(from, from + 999);
    if (q.error) q = await admin.from(t).select("*").range(from, from + 999);
    if (q.error) throw q.error;
    linhas = linhas.concat(q.data || []);
    if (!q.data || q.data.length < 1000) break;
  }
  return linhas;
}
async function sessaoDiretoria(senha: string) {
  if (!senha || !String(senha).startsWith("sess_")) return null;
  const { data } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  const agora = Date.now();
  const u = ((data && data.payload && data.payload.users) || []).find((u: any) => u && !u.bloqueado && ((u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) || (Array.isArray(u.sessoes) && u.sessoes.some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora)))));
  return u && u.nivel === "diretoria" ? u : null;
}

// ---------- trabalho ----------
async function executar(forcar: boolean, por: string) {
  const ini = Date.now();
  const tempo = () => Date.now() - ini < ORCAMENTO_MS;
  let feitos = 0, continuar = false;
  let e: any = await lerEstado();
  if (e.rodando && Date.now() - Number(e.rodandoDesde || 0) < 90 * 1000) return;
  e.rodando = true; e.rodandoDesde = Date.now(); await salvarEstado(e);
  try {
    // espaço no Drive (conta que grava os arquivos)
    try { const a: any = await drive("about?fields=storageQuota,user(emailAddress)"); e.drive = { conta: a.user?.emailAddress, livre: Number(a.storageQuota.limit) - Number(a.storageQuota.usage), limite: Number(a.storageQuota.limit) }; } catch (_x) { /* segue */ }
    const semEspaco = e.drive && e.drive.livre < 60 * 1024 * 1024;
    if (semEspaco) log(e, "Drive quase cheio: menos de 60 MB livres. Esvazie a lixeira ou libere espaço.");

    // 1) foto dos dados (snapshot)
    if (!e.snap && !semEspaco && (forcar || !e.ultimoInicio || Date.now() - Number(e.ultimoInicio) >= INTERVALO_MS)) {
      const nome = agoraBR();
      const { data: tabs } = await admin.rpc("backup_tabelas");
      const pendentes = (tabs || []).map((t: any) => t.tabela).filter((t: string) => !EXCLUIR.test(t));
      e.snap = { nome, pasta: await criarPasta(nome, PASTA_DADOS), pendentes, total: pendentes.length, resumo: {}, bytes: 0, inicio: Date.now(), por, falhas: {} };
      e.ultimoInicio = Date.now();
      log(e, `Backup ${nome} iniciado (${por}).`);
      await salvarEstado(e);
    }
    while (e.snap && e.snap.pendentes.length && tempo() && feitos < MAX_TABELAS) {
      feitos++;
      const t = e.snap.pendentes[0];
      try {
        let linhas = await selectAll(t);
        if (t === "reforma_config") linhas = linhas.filter((r: any) => r.id !== "segredos");
        const gz = enc.encode(JSON.stringify({ tabela: t, geradoEm: new Date().toISOString(), linhas }));
        await enviar(t + ".json", e.snap.pasta, gz, "application/json");
        e.snap.resumo[t] = linhas.length; e.snap.bytes += gz.length; e.snap.pendentes.shift();
      } catch (x) {
        e.snap.falhas[t] = (e.snap.falhas[t] || 0) + 1;
        if (e.snap.falhas[t] >= 3) { e.snap.resumo[t] = -1; e.snap.pendentes.shift(); log(e, `Tabela ${t} não entrou no backup: ${String((x as any)?.message || x).slice(0, 120)}`); }
        else break;
      }
      await salvarEstado(e);
    }
    if (e.snap) continuar = true;
    if (e.snap && !e.snap.pendentes.length && tempo()) {
      const s = e.snap;
      await enviar("resumo.json", s.pasta, enc.encode(JSON.stringify({ app: "Gestão e Controle — Vilaça Joias", backup: s.nome, geradoPor: s.por, inicio: new Date(s.inicio).toISOString(), fim: new Date().toISOString(), linhasPorTabela: s.resumo, comoRestaurar: "1) Rode o estrutura-banco_*.sql mais recente da pasta PROGRAMACAO no SQL Editor do Supabase. 2) Importe cada <tabela>.json (campo 'linhas'). 3) Publique o programacao_*.zip no GitHub/Vercel. 4) Recoloque as senhas de sistemas externos (não ficam no backup).", aviso: "Não contém senhas de sistemas externos (WhatsApp/Evolution, Correios, chaves de API)." }, null, 2)), "application/json");
      // estrutura do banco (só quando muda)
      try {
        const { data: ddl } = await admin.rpc("backup_estrutura");
        const b = enc.encode(String(ddl || "")); const h = await hash(b);
        if (h !== e.hashEstrutura) { await enviar(`estrutura-banco_${s.nome}.sql`, PASTA_PROG, b, "text/plain"); e.hashEstrutura = h; }
      } catch (x) { log(e, "Estrutura do banco não salva: " + String((x as any)?.message || x).slice(0, 120)); }
      // código (só quando muda)
      try {
        const r = await fetch(REPO_ZIP);
        if (!r.ok) throw new Error("GitHub " + r.status);
        const z = new Uint8Array(await r.arrayBuffer()); const h = await hash(z);
        if (h !== e.hashCodigo) { await enviar(`programacao_${s.nome}.zip`, PASTA_PROG, z, "application/zip"); e.hashCodigo = h; e.ultimoCodigo = s.nome; }
      } catch (x) { log(e, "Programação não salva: " + String((x as any)?.message || x).slice(0, 120)); }
      const linhas = Object.values(s.resumo).filter((n: any) => n > 0).reduce((a: number, n: any) => a + n, 0);
      e.ultimo = { nome: s.nome, fim: Date.now(), tabelas: Object.keys(s.resumo).length, linhas, bytes: s.bytes, por: s.por, falhas: Object.keys(s.resumo).filter((t) => s.resumo[t] < 0) };
      e.snap = null;
      log(e, `Backup ${s.nome} concluído: ${e.ultimo.tabelas} tabelas, ${linhas} linhas.`);
      await salvarEstado(e);
      await limpar(e);
    }

    // 2) fotos: espelho incremental
    if (!semEspaco && !continuar && tempo()) {
      const { data: arqs } = await admin.rpc("backup_arquivos_json");
      e.fotos = e.fotos || {}; e.pastasFotos = e.pastasFotos || {};
      const novos = (arqs || []).filter((a: any) => { const k = a.bucket + "/" + a.nome; const f = e.fotos[k]; return !f || f.u !== a.atualizado; });
      e.fotosPendentes = novos.length; e.fotosTotal = (arqs || []).length;
      let n = 0;
      if (novos.length && !e.pastasFotos._raiz) e.pastasFotos._raiz = await acharOuCriarPasta("FOTOS", PASTA_DADOS);
      for (const a of novos) {
        if (!tempo() || n >= MAX_FOTOS) break;
        const k = a.bucket + "/" + a.nome;
        try {
          if (!e.pastasFotos[a.bucket]) e.pastasFotos[a.bucket] = await acharOuCriarPasta(a.bucket, e.pastasFotos._raiz);
          const { data: blob, error } = await admin.storage.from(a.bucket).download(a.nome);
          if (error || !blob) throw error || new Error("download vazio");
          const id = await enviar(String(a.nome).replace(/\//g, "__"), e.pastasFotos[a.bucket], new Uint8Array(await blob.arrayBuffer()), blob.type || "application/octet-stream");
          if (e.fotos[k] && e.fotos[k].id) await lixeira(e.fotos[k].id);
          e.fotos[k] = { u: a.atualizado, id }; n++;
        } catch (x) { e.fotos[k] = { u: a.atualizado, erro: String((x as any)?.message || x).slice(0, 80) }; }
        if (n % 10 === 0) await salvarEstado(e);
      }
      e.fotosPendentes = Math.max(0, novos.length - n);
      if (e.fotosPendentes && n) continuar = true;
      if (n && !e.fotosPendentes) log(e, `Fotos em dia: ${e.fotosTotal} arquivo(s) no Drive.`);
    }
  } catch (x) {
    log(e, "Erro: " + String((x as any)?.message || x).slice(0, 200));
  } finally {
    e.rodando = false; e.ultimaExecucao = Date.now();
    await salvarEstado(e);
  }
  if (continuar) await fetch(SUPABASE_URL + "/functions/v1/backup-drive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "continuar", token: e.cronToken }) }).catch(() => {});
}

// Guarda: todos das últimas 48 h + o último de cada dia por 30 dias. Programação/estrutura: as 60 versões mais novas de cada.
async function limpar(e: any) {
  try {
    const pastas = (await listar(PASTA_DADOS)).filter((f) => /^\d{4}-\d{2}-\d{2} \d{2}h\d{2}$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
    const dias = new Set<string>(); const agora = Date.now();
    for (const f of pastas) {
      const idade = agora - new Date(f.createdTime).getTime(); const dia = f.name.slice(0, 10);
      if (idade < 48 * 3600 * 1000) { dias.add(dia); continue; }
      if (idade < 30 * 86400 * 1000 && !dias.has(dia)) { dias.add(dia); continue; }
      await lixeira(f.id);
    }
    const prog = (await listar(PASTA_PROG)).sort((a, b) => b.name.localeCompare(a.name));
    for (const pref of ["programacao_", "estrutura-banco_"]) for (const f of prog.filter((f) => f.name.startsWith(pref)).slice(60)) await lixeira(f.id);
  } catch (x) { log(e, "Limpeza de backups antigos falhou: " + String((x as any)?.message || x).slice(0, 120)); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let b: any = {}; try { b = await req.json(); } catch (_x) { /* vazio */ }
  const e: any = await lerEstado();
  let por = "";
  if (b.token && b.token === e.cronToken) por = "automático";
  else { const u = await sessaoDiretoria(String(b.senha || "")); if (!u) return json({ error: "Só a Diretoria pode usar o backup." }, 403); por = u.nome || "Diretoria"; }
  if (b.op === "status") {
    const { fotos: _f, cronToken: _t, pastasFotos: _p, ...pub } = e;
    return json({ ok: true, estado: pub, pastas: { backup: "https://drive.google.com/drive/folders/1SFhhXgTLyvDiT-gCHzroADCd1qnUKUAU", programacao: "https://drive.google.com/drive/folders/" + PASTA_PROG, dados: "https://drive.google.com/drive/folders/" + PASTA_DADOS }, agora: Date.now() });
  }
  const forcar = b.op === "agora";
  // @ts-ignore EdgeRuntime existe no Supabase
  EdgeRuntime.waitUntil(executar(forcar, por));
  return json({ ok: true, iniciado: true });
});
