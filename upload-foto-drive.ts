import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/**
 * Quem pode chamar esta função:
 * 1) Um usuário logado, mandando a própria "senha" no corpo.
 * 2) Alguém no meio do autocadastro (cadastro-funcionario.html), que AINDA NÃO tem
 *    senha — nesse caso aceita o "tokenCadastro" (o mesmo token do link de 24h),
 *    validado contra o registro correspondente em config.users.
 * Sem um dos dois, recusa — antes disso, qualquer um que soubesse a URL conseguia
 * consumir a cota de upload/tratamento de imagem sem estar logado.
 */
async function chamadaAutorizada(senha: string | undefined, tokenCadastro: string | undefined): Promise<boolean> {
  if (!senha && !tokenCadastro) return false;
  const { data, error } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  if (error || !data) return false;
  const users = (data.payload && data.payload.users) || [];
  if (senha && users.some((u: any) => u.senha === senha)) return true;
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Credenciais OAuth do Google nao configuradas (GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN)");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error("Falha ao renovar access token do Google: " + JSON.stringify(tokenData));
  }
  return tokenData.access_token as string;
}

async function getOrCreatePastaPorNome(accessToken: string, nomePasta: string): Promise<string> {
  const query = encodeURIComponent(`name='${nomePasta}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listData = await listRes.json();
  if (listData.files && listData.files.length > 0) return listData.files[0].id;

  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: nomePasta, mimeType: "application/vnd.google-apps.folder" }),
  });
  const createData = await createRes.json();
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

async function tratarComGemini(base64Data: string, mimeType: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  const modelo = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT_TRATAMENTO_JOIA },
            { inline_data: { mime_type: mimeType, data: base64Data } },
          ],
        }],
      }),
    },
  );
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(`Gemini respondeu ${res.status}: ${texto.slice(0, 300)}`);
  }
  const data = await res.json();
  const partes = data?.candidates?.[0]?.content?.parts || [];
  const parteImagem = partes.find((p: any) => p.inline_data || p.inlineData);
  const inline = parteImagem?.inline_data || parteImagem?.inlineData;
  if (!inline || !inline.data) {
    throw new Error("Gemini não devolveu nenhuma imagem editada: " + JSON.stringify(data).slice(0, 300));
  }
  const bytesResultado = Uint8Array.from(atob(inline.data), (c) => c.charCodeAt(0));
  return { bytes: bytesResultado, mimeType: inline.mime_type || inline.mimeType || "image/png" };
}

async function removerFundo(base64Data: string, mimeType: string): Promise<Uint8Array> {
  const apiKey = Deno.env.get("PHOTOROOM_API_KEY");
  if (!apiKey) throw new Error("PHOTOROOM_API_KEY não configurada");

  const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("imageFile", new Blob([bytes], { type: mimeType }), "foto.jpg");
  form.append("background.color", "FFFFFF");
  form.append("format", "png");

  const res = await fetch("https://image-api.photoroom.com/v2/edit", {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(`Photoroom respondeu ${res.status}: ${texto.slice(0, 300)}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

async function tratarImagemProduto(bytes: Uint8Array): Promise<Uint8Array> {
  const img = await Image.decode(bytes);

  const ladoOriginal = Math.max(img.width, img.height);
  const lado = Math.round(ladoOriginal * 1.15);
  const quadro = new Image(lado, lado);
  quadro.fill(0xffffffff);
  const offsetX = Math.round((lado - img.width) / 2);
  const offsetY = Math.round((lado - img.height) / 2);
  quadro.composite(img, offsetX, offsetY);

  const TAMANHO_FINAL = 1600;
  quadro.resize(TAMANHO_FINAL, TAMANHO_FINAL);

  for (let y = 0; y < quadro.height; y++) {
    for (let x = 0; x < quadro.width; x++) {
      const cor = quadro.getPixelAt(x + 1, y + 1);
      const r = (cor >> 24) & 0xff;
      const g = (cor >> 16) & 0xff;
      const b = (cor >> 8) & 0xff;
      const a = cor & 0xff;
      if (a < 10) continue;
      const [r2, g2, b2] = ajustarTomMetal(r, g, b);
      quadro.setPixelAt(x + 1, y + 1, Image.rgbaToColor(r2, g2, b2, a));
    }
  }

  return await quadro.encode();
}

function rgbParaHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}
function hslParaRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { [r1, g1, b1] = [c, x, 0]; }
  else if (h < 120) { [r1, g1, b1] = [x, c, 0]; }
  else if (h < 180) { [r1, g1, b1] = [0, c, x]; }
  else if (h < 240) { [r1, g1, b1] = [0, x, c]; }
  else if (h < 300) { [r1, g1, b1] = [x, 0, c]; }
  else { [r1, g1, b1] = [c, 0, x]; }
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}
function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

function ajustarTomMetal(r: number, g: number, b: number): [number, number, number] {
  const [h, s, l] = rgbParaHsl(r, g, b);
  const ehDourado = h >= 25 && h <= 58 && s > 0.15 && l > 0.15 && l < 0.92;
  const ehPrateado = s < 0.14 && l > 0.35 && l < 0.97;

  if (ehDourado) {
    const hNovo = h + (42 - h) * 0.35;
    const sNovo = clamp01(s * 1.22 + 0.05);
    const lNovo = clamp01(l * 1.05);
    return hslParaRgb(hNovo, sNovo, lNovo);
  }
  if (ehPrateado) {
    const sNovo = clamp01(s * 0.5);
    const lNovo = clamp01(l * 1.08 + 0.03);
    return hslParaRgb(h, sNovo, lNovo);
  }
  const lNovo = clamp01(l > 0.5 ? l * 1.01 : l * 0.99);
  return hslParaRgb(h, s, lNovo);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { dataUrl, filename, pasta, tratar, senha, tokenCadastro } = await req.json();
    if (!(await chamadaAutorizada(senha, tokenCadastro))) {
      return new Response(JSON.stringify({ error: "não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!dataUrl || !filename) {
      return new Response(JSON.stringify({ error: "dataUrl e filename sao obrigatorios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const match = String(dataUrl).match(/^data:(.+);base64,(.*)$/);
    if (!match) {
      return new Response(JSON.stringify({ error: "dataUrl invalido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let mimeType = match[1];
    let base64Data = match[2];
    let tratamentoAplicado = false;
    let motorTratamento: string | null = null;
    let motivoSemTratamento: string | null = null;

    if (tratar && mimeType.startsWith("image/")) {
      try {
        const semFundo = await removerFundo(base64Data, mimeType);
        const tratada = await tratarImagemProduto(semFundo);
        base64Data = btoa(String.fromCharCode(...tratada));
        mimeType = "image/png";
        tratamentoAplicado = true;
        motorTratamento = "photoroom";
      } catch (erroPhotoroom) {
        console.error("Photoroom não tratou a imagem, tentando o Gemini como plano B:", erroPhotoroom);
        try {
          const resultado = await tratarComGemini(base64Data, mimeType);
          base64Data = btoa(String.fromCharCode(...resultado.bytes));
          mimeType = resultado.mimeType;
          tratamentoAplicado = true;
          motorTratamento = "gemini";
        } catch (erroGemini) {
          console.error("Gemini também não tratou a imagem, enviando a foto original:", erroGemini);
          motivoSemTratamento = `Photoroom: ${String(erroPhotoroom)} | Gemini: ${String(erroGemini)}`;
        }
      }
    }

    const accessToken = await getAccessToken();
    const folderId = pasta === "produtos" ? await getOrCreatePastaPorNome(accessToken, NOME_PASTA_PRODUTOS)
      : pasta === "funcionarios" ? await getOrCreatePastaPorNome(accessToken, NOME_PASTA_FUNCIONARIOS)
      : pasta === "transferencias" ? await getOrCreatePastaPorNome(accessToken, NOME_PASTA_TRANSFERENCIAS)
      : FOLDER_ID_OS;

    const metadata = { name: filename, parents: [folderId] };
    const boundary = "-------314159265358979323846";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;

    const metaPart = delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata);
    const mediaPartHeader = delimiter + `Content-Type: ${mimeType}\r\n` + "Content-Transfer-Encoding: base64\r\n\r\n";
    const bodyString = metaPart + mediaPartHeader + base64Data + closeDelim;

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: bodyString,
      },
    );
    const uploadData = await uploadRes.json();
    if (!uploadData.id) {
      throw new Error("Falha no upload para o Drive: " + JSON.stringify(uploadData));
    }

    await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });

    const viewUrl = `https://drive.google.com/thumbnail?id=${uploadData.id}&sz=w1000`;

    return new Response(JSON.stringify({
      fileId: uploadData.id,
      url: viewUrl,
      tratamentoAplicado,
      motorTratamento,
      motivoSemTratamento,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("upload-foto-drive: erro final antes de responder 500:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
