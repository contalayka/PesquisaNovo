interface Env {
  MERCADOLIVRE_ACCESS_TOKEN?: string;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!isSameOrigin(request)) return json({ error: "Origem não permitida." }, 403);
  if (!env.MERCADOLIVRE_ACCESS_TOKEN) {
    return json({
      error: "Integração ainda não configurada no Cloudflare.",
      code: "MERCADOLIVRE_NOT_CONFIGURED",
      setup: "Configure MERCADOLIVRE_ACCESS_TOKEN como Secret nas variáveis de ambiente do Cloudflare Pages.",
    }, 503);
  }

  let body: { itemIds?: unknown; dateFrom?: unknown; dateTo?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Corpo JSON inválido." }, 400);
  }

  const ids = Array.isArray(body.itemIds)
    ? [...new Set(body.itemIds.filter((id): id is string => typeof id === "string").map(id => id.trim()))]
    : [];
  if (!ids.length || ids.length > 20 || ids.some(id => !/^MLB\d{5,15}$/.test(id))) {
    return json({ error: "Informe de 1 a 20 IDs de anúncios do Mercado Livre no formato MLB123456789." }, 400);
  }
  if (!validDate(body.dateFrom) || !validDate(body.dateTo) || body.dateFrom > body.dateTo) {
    return json({ error: "Informe data inicial e final válidas no formato AAAA-MM-DD." }, 400);
  }
  const days = (Date.parse(body.dateTo + "T00:00:00Z") - Date.parse(body.dateFrom + "T00:00:00Z")) / 86400000;
  if (days > 150) return json({ error: "O Mercado Livre permite consultar no máximo 150 dias por intervalo." }, 400);
  if (body.dateTo > new Date().toISOString().slice(0, 10)) {
    return json({ error: "A data final não pode estar no futuro." }, 400);
  }

  try {
    const query = new URLSearchParams({
      ids: ids.join(","),
      date_from: body.dateFrom,
      date_to: body.dateTo,
    });
    const upstream = await fetch("https://api.mercadolibre.com/items/visits?" + query.toString(), {
      headers: {
        Authorization: "Bearer " + env.MERCADOLIVRE_ACCESS_TOKEN,
        Accept: "application/json",
      },
    });
    const raw = await upstream.json().catch(() => null);
    if (upstream.status === 401 || upstream.status === 403) {
      return json({ error: "O Mercado Livre recusou a autorização. O token pode ter expirado; é necessário renovar a autorização." }, 502);
    }
    if (!upstream.ok) {
      return json({ error: "A API do Mercado Livre retornou um erro.", upstreamStatus: upstream.status }, 502);
    }

    const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
    const results = rows.map((row: any) => ({
      itemId: String(row.item_id ?? row.id ?? ""),
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      visits: Number(row.total_visits ?? row.visits ?? row.total ?? 0) || 0,
    })).filter(row => ids.includes(row.itemId));

    return json({ success: true, platform: "Mercado Livre", dateFrom: body.dateFrom, dateTo: body.dateTo, results });
  } catch {
    return json({ error: "Não foi possível consultar o Mercado Livre agora." }, 502);
  }
};
