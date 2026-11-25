interface Env {
  AUTH_PASSWORD_HASH: string;
  AUTH_SESSION_SECRET: string;
}

const encoder = new TextEncoder();

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let mismatch = 0;
  for (let i = 0; i < left.byteLength; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;

  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 100000 || iterations > 1000000) return false;

  const salt = decodeBase64Url(parts[2]);
  const expected = decodeBase64Url(parts[3]);
  if (salt.byteLength < 8 || salt.byteLength > 64 || expected.byteLength !== 32) return false;

  const passwordBytes = encoder.encode(password);
  const passwordBuffer = passwordBytes.buffer.slice(
    passwordBytes.byteOffset,
    passwordBytes.byteOffset + passwordBytes.byteLength,
  ) as ArrayBuffer;
  const saltBuffer = salt.buffer.slice(
    salt.byteOffset,
    salt.byteOffset + salt.byteLength,
  ) as ArrayBuffer;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );
  } catch (error) {
    throw new Error("pbkdf2-importKey:" + (error instanceof Error ? error.name : "UnknownError"));
  }

  let derived: ArrayBuffer;
  try {
    derived = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: saltBuffer, iterations, hash: "SHA-256" },
      key,
      256,
    );
  } catch (error) {
    throw new Error("pbkdf2-deriveBits:" + (error instanceof Error ? error.name : "UnknownError"));
  }

  return equalBytes(new Uint8Array(derived), expected);
}

async function sign(payload: string, secret: string): Promise<string> {
  const secretBytes = encoder.encode(secret);
  const secretBuffer = secretBytes.buffer.slice(
    secretBytes.byteOffset,
    secretBytes.byteOffset + secretBytes.byteLength,
  ) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw",
    secretBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = encoder.encode(payload);
  const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBuffer));
  return btoa(String.fromCharCode(...signature))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.AUTH_PASSWORD_HASH || !env.AUTH_SESSION_SECRET) {
      return json({ error: "Autenticação não configurada no servidor." }, 503);
    }

    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) {
      return json({ error: "Origem não permitida." }, 403);
    }

    const body = await request.json().catch(() => null) as { password?: unknown } | null;
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password || password.length > 256) {
      return json({ error: "Informe uma senha válida." }, 400);
    }

    let valid: boolean;
    try {
      valid = await verifyPassword(password, env.AUTH_PASSWORD_HASH);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "UnknownError";
      console.error("AUTH_PASSWORD_VERIFY_FAILED", detail);
      return json({
        error: "Falha ao verificar a senha no servidor.",
        diagnostic: detail,
      }, 500);
    }

    if (!valid) return json({ error: "Senha incorreta. Tente novamente." }, 401);

    const now = Math.floor(Date.now() / 1000);
    const payloadBytes = encoder.encode(JSON.stringify({ iat: now, exp: now + 12 * 60 * 60 }));
    const payload = btoa(String.fromCharCode(...payloadBytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    const signature = await sign(payload, env.AUTH_SESSION_SECRET);

    return json(
      { authenticated: true },
      200,
      {
        "Set-Cookie": `mp_session=${payload}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`,
      },
    );
  } catch (error) {
    const cause = error instanceof Error ? error : new Error("Erro desconhecido");
    console.error("AUTH_LOGIN_FAILURE", cause.name, cause.message);
    return json({ error: "Erro interno ao iniciar a sessão.", diagnostic: cause.name }, 500);
  }
};
