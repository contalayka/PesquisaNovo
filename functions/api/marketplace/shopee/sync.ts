import { authorized, configured, getValidToken, json, signedShopUrl, ShopeeEnv } from "../../../_lib/shopee";

export const onRequestPost: PagesFunction<ShopeeEnv> = async ({ request, env }) => {
  if (!configured(env)) return json({ error: "Integração Shopee não configurada no Cloudflare Pages." }, 503);
  if (!authorized(request, env)) return json({ error: "Chave administrativa inválida." }, 401);
  let body: { dateFrom?: unknown; dateTo?: unknown };
  try { body = await request.json(); } catch { return json({ error: "Corpo JSON inválido." }, 400); }
  const validDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  if (!validDate(body.dateFrom) || !validDate(body.dateTo) || body.dateFrom > body.dateTo) {
    return json({ error: "Informe datas válidas." }, 400);
  }
  const from = Math.floor(Date.parse(body.dateFrom + "T00:00:00Z") / 1000);
  const to = Math.floor(Date.parse(body.dateTo + "T23:59:59Z") / 1000);
  if (to > Math.floor(Date.now() / 1000) || to - from > 15 * 86400) return json({ error: "O período deve terminar hoje ou antes e ter no máximo 15 dias por consulta." }, 400);
  const shopId = await env.MARKETPLACE_KV!.get("shopee:active-shop");
  if (!shopId) return json({ error: "Nenhuma loja Shopee conectada. Use Conectar minha loja primeiro." }, 409);
  try {
    const token = await getValidToken(env, shopId);
    if (!token) return json({ error: "Token da Shopee não encontrado. Reconecte a loja." }, 409);
    let cursor = "";
    let hasMore = true;
    const orderSn: string[] = [];
    while (hasMore && orderSn.length < 500) {
      const url = await signedShopUrl(env, "/order/get_order_list", shopId, token.access_token, {
        time_range_field: "create_time", time_from: from, time_to: to, page_size: 100, cursor,
      });
      const response = await fetch(url.toString());
      const data = await response.json() as any;
      if (!response.ok || data.error) throw new Error(data.message || data.error || "Falha ao consultar pedidos na Shopee.");
      const rows = data.response?.order_list || [];
      orderSn.push(...rows.map((x: any) => String(x.order_sn)).filter(Boolean));
      hasMore = Boolean(data.response?.more);
      cursor = String(data.response?.next_cursor || "");
      if (!rows.length || !cursor) hasMore = false;
    }
    const byProduct = new Map<string, { itemId: string; title: string; orders: number; units: number; revenue: number; lastOrder: number }>();
    for (let i = 0; i < orderSn.length; i += 50) {
      const batch = orderSn.slice(i, i + 50);
      const url = await signedShopUrl(env, "/order/get_order_detail", shopId, token.access_token, {
        order_sn_list: batch.join(","), response_optional_fields: "item_list,total_amount,create_time,order_status",
      });
      const response = await fetch(url.toString());
      const data = await response.json() as any;
      if (!response.ok || data.error) throw new Error(data.message || data.error || "Falha ao consultar detalhes dos pedidos.");
      for (const order of data.response?.order_list || []) {
        if (["CANCELLED", "IN_CANCELLED", "UNPAID"].includes(String(order.order_status))) continue;
        const items = Array.isArray(order.item_list) ? order.item_list : [];
        for (const item of items) {
          const id = String(item.item_id ?? item.item_sku ?? item.item_name ?? "produto-sem-id");
          const title = String(item.item_name || id);
          const quantity = Number(item.model_quantity_purchased || item.amount || 1) || 1;
          const price = Number(item.model_discounted_price ?? item.model_original_price ?? 0) || 0;
          const entry = byProduct.get(id) || { itemId: id, title, orders: 0, units: 0, revenue: 0, lastOrder: 0 };
          entry.orders += 1; entry.units += quantity; entry.revenue += price * quantity;
          entry.lastOrder = Math.max(entry.lastOrder, Number(order.create_time || 0));
          byProduct.set(id, entry);
        }
      }
    }
    return json({
      success: true, platform: "Shopee", shopId, dateFrom: body.dateFrom, dateTo: body.dateTo,
      orderCount: orderSn.length,
      listings: Array.from(byProduct.values()).map(x => ({
        listingId: x.itemId, title: x.title, views: 0, orders: x.orders, units: x.units,
        revenue: Math.round(x.revenue * 100) / 100, url: "", period: `${body.dateFrom} a ${body.dateTo}`,
      })),
      note: "A API de pedidos não fornece visitas nesta consulta. Os valores são estimativas somadas dos itens dos pedidos; confira descontos, moedas e cancelamentos no Seller Center.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro ao sincronizar pedidos da Shopee." }, 502);
  }
};
