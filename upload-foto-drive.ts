// upload-foto-drive v26 — v26: grava no Drive de joiasvilaca@gmail.com (APP GESTAO › FOTOS …), conectado em google_contas; se falhar, usa a conta antiga.
// upload-foto-drive v25 — v25: devolve avisoPhotoroom quando cai no plano B.
// upload-foto-drive v24 — v24: tratamento leve (sem laço pixel a pixel, que estourava o limite de CPU da função)
//   e base64 em blocos (String.fromCharCode(...bytes) quebrava com imagens grandes). A Photoroom já entrega
//   fundo branco, quadrado 1600x1600 com margem e luz ajustada; o Gemini segue como plano B.
// v23: aceita várias sessões por usuário (users[].sessoes), como o db-gateway v45.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64, decodeBase64 } from "jsr:@std/encoding@1/base64";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function sessaoValida(u: any, senha: string): boolean {
  if (!u || !senha || typeof senha !== "string" || !senha.startsWith("sess_")) return false;
  if (u.bloqueado) return false;
  const agora = Date.now();
  if (u.senha === senha && (!u.sessaoExpiraEm || Number(u.sessaoExpiraEm) > agora)) return true;
  const lista = Array.isArray(u.sessoes) ? u.sessoes : [];
  return lista.some((s: any) => s && s.token === senha && (!s.exp || Number(s.exp) > agora));
}
async function chamadaAutorizada(senha: string | undefined, tokenCadastro: string | undefined): Promise<boolean> {
  if (!senha && !tokenCadastro) return false;
  const { data, error } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  if (error || !data) return false;
  const users = (data.payload && data.payload.users) || [];
  if (senha && users.some((u: any) => sessaoValida(u, senha))) return true;
  if (tokenCadastro) {
    const usuario = users.find((u: any) => u.tokenCadastro === tokenCadastro);
    if (usuario && usuario.tokenCadastroExpiraEm && usuario.tokenCadastroExpiraEm > Date.now()) return true;
  }
  return false;
}

const FOLDER_ID_OS = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID") || "1LwIwtFMfwmt4FSmwMR40nLUe7OvpVDRz";
const NOME_PASTA_PRODUTOS = "PRODUTOS - Fotos";
const NOME_PASTA_FUNCIONARIOS = "FUNCIONÁRIOS - Fotos";
const NOME_PASTA_TRANSFERENCIAS = "TRANSFERÊNCIAS - Fotos";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PASTA_APP_GESTAO = "1YhHrzfrkPHPbfpk_t1Vqj2W38weC3Ykd";   // Drive joiasvilaca › APP GESTAO
const NOVAS_PASTAS: Record<string, string> = { produtos: "FOTOS PRODUTOS", funcionarios: "FOTOS FUNCIONARIOS", transferencias: "FOTOS TRANSFERENCIAS", os: "FOTOS PEDIDOS" };
/** Conta principal (joiasvilaca, google_contas id='drive'); se não der, a conta antiga (variáveis de ambiente). */
async function tokenPrincipal(): Promise<string | null> {
  try {
    const { data } = await admin.from("google_contas").select("refresh_token").eq("id", "drive").maybeSingle();
    if (!data || !data.refresh_token) return null;
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!, refresh_token: data.refresh_token, grant_type: "refresh_token" }) });
    const j = await r.json();
    if (!j.access_token) { console.error("Drive joiasvilaca indisponível:", JSON.stringify(j)); return null; }
    return j.access_token as string;
  } catch (e) { console.error("Drive joiasvilaca indisponível:", e); return null; }
}
async function pastaFilha(accessToken: string, nome: string, pai: string): Promise<string> {
  const q = encodeURIComponent(`name='${nome}' and '${pai}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const l = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, { headers: { Authorization: `Bearer ${accessToken}` } })).json();
  if (l.files && l.files[0]) return l.files[0].id;
  const c = await (await fetch("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: nome, parents: [pai], mimeType: "application/vnd.google-apps.folder" }) })).json();
  if (!c.id) throw new Error(`Falha ao criar a pasta "${nome}": ` + JSON.stringify(c));
  return c.id;
}
async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID"), clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET"), refreshToken = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Credenciais OAuth do Google nao configuradas");
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Falha ao renovar access token do Google: " + JSON.stringify(tokenData));
  return tokenData.access_token as string;
}
async function getOrCreatePastaPorNome(accessToken: string, nomePasta: string): Promise<string> {
  const query = encodeURIComponent(`name='${nomePasta}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const listData = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, { headers: { Authorization: `Bearer ${accessToken}` } })).json();
  if (listData.files && listData.files.length > 0) return listData.files[0].id;
  const createData = await (await fetch("https://www.googleapis.com/drive/v3/files?fields=id", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: nomePasta, mimeType: "application/vnd.google-apps.folder" }) })).json();
  if (!createData.id) throw new Error(`Falha ao criar a pasta "${nomePasta}": ` + JSON.stringify(createData));
  return createData.id;
}

const PROMPT_TRATAMENTO_JOIA = `You are retouching a jewelry product photo for an e-commerce/catalog listing.
Edit this photo following these exact rules, keeping the jewelry piece's real shape, design and proportions 100% unchanged:
1. Remove the background completely and replace it with a solid, clean, pure white background (no shadows on the backdrop itself, just the product).
2. Recompose the image as a square (1:1 aspect ratio) product shot, with the jewelry centered and a comfortable margin of white space around it (like a professional catalog photo).
3. Improve lighting and sharpness so the piece looks polished and well lit, with a subtle, elegant highlight/shine appropriate for jewelry photography.
4. If the piece (or part of it) is gold or gold-toned, make the gold read as a warm, rich, healthy yellow-gold tone.
5. If the piece (or part of it) is silver or silver-toned, make it read as a bright, clean, neutral white/silver tone (no dull gray or yellow color cast).
6. If a hand, wrist, ear, neck or model is holding/wearing the piece, keep that person's skin tone natural and realistic — do not stylize or alter it.
Return only the edited image.`;

async function tratarComGemini(base64Data: string, mimeType: string): Promise<{ b64: string; mimeType: string }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  const modelo = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST", headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT_TRATAMENTO_JOIA }, { inline_data: { mime_type: mimeType, data: base64Data } }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini respondeu ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const data = await res.json();
  const partes = data?.candidates?.[0]?.content?.parts || [];
  const parte = partes.find((p: any) => p.inline_data || p.inlineData);
  const inline = parte?.inline_data || parte?.inlineData;
  if (!inline || !inline.data) throw new Error("Gemini não devolveu imagem: " + JSON.stringify(data).slice(0, 300));
  return { b64: inline.data, mimeType: inline.mime_type || inline.mimeType || "image/png" };
}

/** Photoroom faz tudo: fundo branco, quadrado 1600x1600 com margem e luz ajustada. Se algum parâmetro extra for recusado, tenta o básico. */
async function tratarComPhotoroom(base64Data: string, mimeType: string): Promise<{ b64: string; mimeType: string }> {
  const apiKey = Deno.env.get("PHOTOROOM_API_KEY");
  if (!apiKey) throw new Error("PHOTOROOM_API_KEY não configurada");
  const bytes = decodeBase64(base64Data);
  const tentar = async (completo: boolean) => {
    const form = new FormData();
    form.append("imageFile", new Blob([bytes], { type: mimeType }), "foto.jpg");
    form.append("background.color", "FFFFFF");
    form.append("outputSize", "1600x1600");
    form.append("padding", "0.12");
    form.append("export.format", "jpeg");
    if (completo) form.append("lighting.mode", "ai.auto");
    return await fetch("https://image-api.photoroom.com/v2/edit", { method: "POST", headers: { "x-api-key": apiKey }, body: form });
  };
  let res = await tentar(true);
  if (res.status === 400) res = await tentar(false);
  if (!res.ok) throw new Error(`Photoroom respondeu ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  const ct = res.headers.get("content-type") || "image/jpeg";
  return { b64: encodeBase64(new Uint8Array(await res.arrayBuffer())), mimeType: ct.startsWith("image/") ? ct.split(";")[0] : "image/jpeg" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { dataUrl, filename, pasta, tratar, senha, tokenCadastro } = await req.json();
    if (!(await chamadaAutorizada(senha, tokenCadastro))) return json({ error: "não autorizado" }, 401);
    if (!dataUrl || !filename) return json({ error: "dataUrl e filename sao obrigatorios" }, 400);
    const match = String(dataUrl).match(/^data:(.+);base64,(.*)$/);
    if (!match) return json({ error: "dataUrl invalido" }, 400);
    let mimeType = match[1]; let base64Data = match[2];
    let tratamentoAplicado = false; let motorTratamento: string | null = null; let motivoSemTratamento: string | null = null; let avisoPhotoroom: string | null = null;
    if (tratar && mimeType.startsWith("image/")) {
      try {
        const r = await tratarComPhotoroom(base64Data, mimeType);
        base64Data = r.b64; mimeType = r.mimeType; tratamentoAplicado = true; motorTratamento = "photoroom";
      } catch (erroPhotoroom) {
        console.error("Photoroom falhou, tentando Gemini:", erroPhotoroom); avisoPhotoroom = String(erroPhotoroom).slice(0, 300);
        try {
          const r = await tratarComGemini(base64Data, mimeType);
          base64Data = r.b64; mimeType = r.mimeType; tratamentoAplicado = true; motorTratamento = "gemini";
        } catch (erroGemini) {
          console.error("Gemini também falhou:", erroGemini);
          motivoSemTratamento = `Photoroom: ${String(erroPhotoroom).slice(0, 200)} | Gemini: ${String(erroGemini).slice(0, 200)}`;
        }
      }
    }
    const principal = await tokenPrincipal();
    const accessToken = principal || await getAccessToken();
    const folderId = principal ? await pastaFilha(principal, NOVAS_PASTAS[pasta] || NOVAS_PASTAS.os, PASTA_APP_GESTAO) : pasta === "produtos" ? await getOrCreatePastaPorNome(accessToken, NOME_PASTA_PRODUTOS)
      : pasta === "funcionarios" ? await getOrCreatePastaPorNome(accessToken, NOME_PASTA_FUNCIONARIOS)
      : pasta === "transferencias" ? await getOrCreatePastaPorNome(accessToken, NOME_PASTA_TRANSFERENCIAS)
      : FOLDER_ID_OS;
    const nome = tratamentoAplicado ? String(filename).replace(/\.[a-z0-9]+$/i, "") + (mimeType === "image/png" ? ".png" : ".jpg") : filename;
    const boundary = "-------314159265358979323846";
    const body = `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` + JSON.stringify({ name: nome, parents: [folderId] })
      + `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n` + base64Data + `\r\n--${boundary}--`;
    const uploadData = await (await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body })).json();
    if (!uploadData.id) throw new Error("Falha no upload para o Drive: " + JSON.stringify(uploadData));
    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ role: "reader", type: "anyone" }) });
    return json({ fileId: uploadData.id, url: `https://drive.google.com/thumbnail?id=${uploadData.id}&sz=w1000`, tratamentoAplicado, motorTratamento, motivoSemTratamento, avisoPhotoroom });
  } catch (e) {
    console.error("upload-foto-drive: erro final:", e);
    return json({ error: String(e) }, 500);
  }
});
