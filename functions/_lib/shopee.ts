export interface ShopeeEnv {
  SHOPEE_PARTNER_ID?: string;
  SHOPEE_PARTNER_KEY?: string;
  SHOPEE_REDIRECT_URL?: string;
  MARKETPLACE_ADMIN_KEY?: string;
  MARKETPLACE_KV?: KVNamespace;
}

export const SHOPEE_API = "https://partner.shopeemobile.com";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function authorized(request: Request, env: ShopeeEnv): boolean {
  const expected = env.MARKETPLACE_ADMIN_KEY || "";
  const supplied = request.headers.get("X-Marketplace-Admin-Key") || "";
  if (expected.length < 24 || supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return diff === 0;
}

export async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
}

export function configured(env: ShopeeEnv): boolean {
  return Boolean(env.SHOPEE_PARTNER_ID && env.SHOPEE_PARTNER_KEY && env.SHOPEE_REDIRECT_URL && env.MARKETPLACE_ADMIN_KEY && env.MARKETPLACE_KV);
}

export async function signedUrl(env: ShopeeEnv, path: string, extra: Record<string, string | number>): Promise<URL> {
  const partnerId = Number(env.SHOPEE_PARTNER_ID);
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await hmacHex(env.SHOPEE_PARTNER_KEY!, `${partnerId}${path}${timestamp}`);
  const url = new URL(path, SHOPEE_API);
  url.searchParams.set("partner_id", String(partnerId));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, String(value));
  return url;
}

export async function apiSign(env: ShopeeEnv, path: string, timestamp: number, shopId: string, accessToken: string): Promise<string> {
  return hmacHex(env.SHOPEE_PARTNER_KEY!, `${env.SHOPEE_PARTNER_ID}${path}${timestamp}${accessToken}${shopId}`);
}

export async function signedShopUrl(env: ShopeeEnv, path: string, shopId: string, accessToken: string, extra: Record<string, string | number>): Promise<URL> {
  const timestamp = Math.floor(Date.now() / 1000);
  const url = new URL(`/api/v2${path}`, SHOPEE_API);
  url.searchParams.set("partner_id", env.SHOPEE_PARTNER_ID!);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("shop_id", shopId);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("sign", await apiSign(env, `/api/v2${path}`, timestamp, shopId, accessToken));
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, String(value));
  return url;
}

export async function getValidToken(env: ShopeeEnv, shopId: string): Promise<{ access_token: string; refresh_token: string; expire_at: number } | null> {
  const kv = env.MARKETPLACE_KV!;
  const key = `shopee:token:${shopId}`;
  let token = await kv.get(key, "json") as { access_token: string; refresh_token: string; expire_at: number } | null;
  if (!token) return null;
  if (token.expire_at > Date.now() + 60_000) return token;
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await hmacHex(env.SHOPEE_PARTNER_KEY!, `${env.SHOPEE_PARTNER_ID}${path}${timestamp}`);
  const response = await fetch(SHOPEE_API + path, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ partner_id: Number(env.SHOPEE_PARTNER_ID), timestamp, sign, shop_id: Number(shopId), refresh_token: token.refresh_token }),
  });
  const data = await response.json() as any;
  if (!response.ok || data.access_token == null || data.refresh_token == null) {
    throw new Error("A autorização da Shopee expirou ou precisa ser refeita. Reconecte sua loja.");
  }
  token = { access_token: data.access_token, refresh_token: data.refresh_token, expire_at: Date.now() + Number(data.expire_in || 14400) * 1000 };
  await kv.put(key, JSON.stringify(token), { expirationTtl: 60 * 60 * 24 * 30 });
  return token;
}
