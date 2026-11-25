interface Env { AUTH_SESSION_SECRET: string; }

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const raw = encoder.encode(secret);
  const rawBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "raw",
    rawBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = encoder.encode(payload);
  const dataBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return encodeBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBuffer)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.AUTH_SESSION_SECRET) return json({ authenticated: false }, 401);

    const cookieHeader = request.headers.get("Cookie") || "";
    const token = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("mp_session="))
      ?.slice("mp_session=".length);

    if (!token) return json({ authenticated: false }, 401);

    const separator = token.lastIndexOf(".");
    if (separator <= 0) return json({ authenticated: false }, 401);

    const payload = token.slice(0, separator);
    const suppliedSignature = token.slice(separator + 1);
    if (!payload || !suppliedSignature) return json({ authenticated: false }, 401);

    const expectedSignature = await sign(payload, env.AUTH_SESSION_SECRET);
    if (!constantTimeEqual(suppliedSignature, expectedSignature)) {
      return json({ authenticated: false }, 401);
    }

    const data = JSON.parse(decoder.decode(decodeBase64Url(payload))) as { exp?: number };
    if (!Number.isSafeInteger(data.exp) || !data.exp || data.exp <= Math.floor(Date.now() / 1000)) {
      return json({ authenticated: false }, 401);
    }

    return json({ authenticated: true });
  } catch (error) {
    console.error("AUTH_SESSION_CHECK_FAILED", error instanceof Error ? error.name : "UnknownError");
    return json({ authenticated: false }, 401);
  }
};
