// Cloudflare Pages Function: /api/image-proxy
// Proxy seguro de imagens externas no mesmo domínio para contornar falhas de CORS, hotlink
// e endpoints /storage/v1/render/image/public/ do Supabase que atingiram limite de transformação.

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
const SUPABASE_TRANSFORM_PARAMS = ['width', 'height', 'resize', 'quality', 'format'];

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return true;
  }

  // Block IPv6 literals
  if (host.includes(':')) return true;

  // Block private/loopback/link-local IPv4 ranges
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return true;
    }
  }

  return false;
}

function validateExternalImageUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password) return null;
    if (isBlockedHostname(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function deriveSupabaseObjectUrl(parsed: URL): string | null {
  if (!parsed.pathname.includes('/storage/v1/render/image/')) return null;
  const copy = new URL(parsed.toString());
  copy.pathname = copy.pathname.replace('/storage/v1/render/image/', '/storage/v1/object/');
  for (const param of SUPABASE_TRANSFORM_PARAMS) {
    copy.searchParams.delete(param);
  }
  return copy.toString();
}

function looksLikeImageContentType(contentType: string | null, targetUrl: string): boolean {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return true;
  if (
    ct === 'application/octet-stream' &&
    /\.(jpe?g|png|webp|gif|avif|svg|bmp|ico)(\?|$)/i.test(targetUrl)
  ) {
    return true;
  }
  return false;
}

async function fetchUpstreamImage(url: string): Promise<Response | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; CatalogImageProxy/1.0)',
      },
    });

    if (!response.ok) return null;

    const finalUrl = validateExternalImageUrl(response.url || url);
    if (!finalUrl) return null;

    const contentType = response.headers.get('content-type');
    if (!looksLikeImageContentType(contentType, finalUrl.toString())) {
      return null;
    }

    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > MAX_IMAGE_BYTES) {
      return null;
    }

    return response;
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const reqUrl = new URL(request.url);

  if (reqUrl.searchParams.get('check') === '1') {
    return Response.json({
      ok: true,
      provider: 'Cloudflare Pages Function',
      message: 'Proxy de imagens ativo no Cloudflare Pages.',
    });
  }

  const targetParam = reqUrl.searchParams.get('url') || '';

  if (!targetParam) {
    return new Response('Parâmetro url é obrigatório.', { status: 400 });
  }

  const parsedTarget = validateExternalImageUrl(targetParam);
  if (!parsedTarget) {
    return new Response('URL de imagem inválida ou não permitida.', { status: 400 });
  }

  // Build attempt list: prioritize direct Supabase /object/ URL before /render/image/
  const attemptUrls: string[] = [];
  const directObjectUrl = deriveSupabaseObjectUrl(parsedTarget);
  if (directObjectUrl) {
    attemptUrls.push(directObjectUrl);
  }
  attemptUrls.push(parsedTarget.toString());

  for (const candidateUrl of attemptUrls) {
    const upstream = await fetchUpstreamImage(candidateUrl);
    if (upstream && upstream.body) {
      const headers = new Headers();
      headers.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('X-Content-Type-Options', 'nosniff');

      return new Response(upstream.body, {
        status: 200,
        headers,
      });
    }
  }

  return new Response('Não foi possível carregar a imagem de origem.', { status: 502 });
};
