import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const FROM_EMAIL = Deno.env.get("GMAIL_FROM_EMAIL") || "vilacajoias3@gmail.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Quem pode chamar esta função:
 * 1) Outra Edge Function nossa, usando a SERVICE_ROLE_KEY no header Authorization
 *    (é assim que funcionario-acesso.ts manda os e-mails de convite/cadastro hoje).
 * 2) Um usuário logado no app, mandando a própria "senha" no corpo da requisição
 *    (mesmo padrão de autenticação usado no resto do sistema).
 * Sem um dos dois, a função recusa — antes disso, QUALQUER UM que soubesse a URL
 * conseguia mandar e-mail pela caixa da loja, de graça, sem estar logado (um "relé
 * de e-mail aberto").
 */
async function chamadaAutorizada(req: Request, senhaDoCorpo: string | undefined): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader === `Bearer ${SERVICE_ROLE_KEY}`) return true;
  if (!senhaDoCorpo) return false;
  const { data, error } = await admin.from("gestao_config").select("payload").eq("id", "config").maybeSingle();
  if (error || !data) return false;
  const users = (data.payload && data.payload.users) || [];
  return users.some((u: any) => u.senha === senhaDoCorpo);
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Credenciais do Gmail nao configuradas (GOOGLE_OAUTH_CLIENT_ID/SECRET/GMAIL_REFRESH_TOKEN)");
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
    throw new Error("Falha ao renovar access token do Gmail: " + JSON.stringify(tokenData));
  }
  return tokenData.access_token as string;
}

function base64EncodeUtf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64UrlEncodeUtf8(str: string): string {
  return base64EncodeUtf8(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawMessage(from: string, to: string, subject: string, body: string): string {
  const encodedSubject = `=?UTF-8?B?${base64EncodeUtf8(subject)}?=`;
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    body,
  ].join("\r\n");
  return base64UrlEncodeUtf8(message);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, body, senha } = await req.json();
    if (!(await chamadaAutorizada(req, senha))) {
      return new Response(JSON.stringify({ error: "não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: "to, subject e body sao obrigatorios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken();
    const raw = buildRawMessage(FROM_EMAIL, to, subject, body);

    const sendRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );
    const sendData = await sendRes.json();
    if (!sendRes.ok || !sendData.id) {
      throw new Error("Falha ao enviar e-mail: " + JSON.stringify(sendData));
    }

    return new Response(JSON.stringify({ success: true, messageId: sendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
