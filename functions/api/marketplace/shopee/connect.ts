import { authorized, configured, hmacHex, json, SHOPEE_API, ShopeeEnv } from "../../../_lib/shopee";

export const onRequestGet: PagesFunction<ShopeeEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (!configured(env)) return json({
    error: "Integração Shopee ainda não configurada no Cloudflare Pages.",
    required: ["SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY", "SHOPEE_REDIRECT_URL", "MARKETPLACE_ADMIN_KEY", "Binding KV MARKETPLACE_KV"],
  }, 503);

  if (url.searchParams.has("code")) {
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    const shopId = url.searchParams.get("shop_id") || "";
    if (!/^[a-zA-Z0-9_-]{20,100}$/.test(state) || !/^\d{1,20}$/.test(shopId) || !code) {
      return new Response("Retorno de autorização da Shopee inválido. Volte ao MarketPreço e tente conectar novamente.", { status: 400 });
    }
    const stateKey = `shopee:oauth-state:${state}`;
    const pending = await env.MARKETPLACE_KV!.get(stateKey, "json") as { createdAt: number } | null;
    await env.MARKETPLACE_KV!.delete(stateKey);
    if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
      return new Response("A sessão de autorização expirou. Volte ao MarketPreço e conecte novamente.", { status: 400 });
    }
    const path = "/api/v2/auth/token/get";
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = await hmacHex(env.SHOPEE_PARTNER_KEY!, `${env.SHOPEE_PARTNER_ID}${path}${timestamp}`);
    const response = await fetch(SHOPEE_API + path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(env.SHOPEE_PARTNER_ID), timestamp, sign }),
    });
    const data = await response.json() as any;
    if (!response.ok || !data.access_token || !data.refresh_token) {
      return new Response("A Shopee não concluiu a autorização. Confira as credenciais e a URL de retorno configuradas no Cloudflare.", { status: 502 });
    }
    const token = { access_token: data.access_token, refresh_token: data.refresh_token, expire_at: Date.now() + Number(data.expire_in || 14400) * 1000 };
    await env.MARKETPLACE_KV!.put(`shopee:token:${shopId}`, JSON.stringify(token), { expirationTtl: 60 * 60 * 24 * 30 });
    await env.MARKETPLACE_KV!.put("shopee:active-shop", shopId);
    return Response.redirect(new URL("/?marketplace=shopee-connected", url.origin).toString(), 302);
  }

  if (!authorized(request, env)) return json({ error: "Informe a chave administrativa do MarketPreço para conectar a loja." }, 401);
  const callback = new URL(env.SHOPEE_REDIRECT_URL!);
  if (callback.origin !== url.origin || callback.pathname !== "/api/marketplace/shopee/connect") {
    return json({ error: "SHOPEE_REDIRECT_URL deve apontar para /api/marketplace/shopee/connect no mesmo domínio do site." }, 500);
  }
  const state = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");
  await env.MARKETPLACE_KV!.put(`shopee:oauth-state:${state}`, JSON.stringify({ createdAt: Date.now() }), { expirationTtl: 600 });
  callback.searchParams.set("state", state);
  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await hmacHex(env.SHOPEE_PARTNER_KEY!, `${env.SHOPEE_PARTNER_ID}${path}${timestamp}`);
  const auth = new URL(path, SHOPEE_API);
  auth.searchParams.set("partner_id", env.SHOPEE_PARTNER_ID!);
  auth.searchParams.set("timestamp", String(timestamp));
  auth.searchParams.set("sign", sign);
  auth.searchParams.set("redirect", callback.toString());
  return json({ success: true, authorizationUrl: auth.toString() });
};
