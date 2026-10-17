import { configured, json, ShopeeEnv } from "../../../_lib/shopee";

export const onRequestGet: PagesFunction<ShopeeEnv> = async ({ env }) => {
  const isConfigured = configured(env);
  let connected = false;
  if (isConfigured) {
    connected = Boolean(await env.MARKETPLACE_KV!.get("shopee:active-shop"));
  }
  return json({
    platform: "Shopee",
    configured: isConfigured,
    connected,
    status: !isConfigured ? "needs_setup" : connected ? "connected" : "ready_to_connect",
    message: !isConfigured
      ? "Integração ainda não configurada no Cloudflare Pages."
      : connected
        ? "Uma loja Shopee está conectada."
        : "Credenciais configuradas; falta autorizar a loja.",
  });
};
