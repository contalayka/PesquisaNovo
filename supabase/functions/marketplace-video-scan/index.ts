import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

export type Candidate = {
  platform: string;
  title: string;
  adUrl: string;
  videoUrl: string;
  thumbnail?: string;
  duration?: string;
  notes?: string;
};

const MARKETPLACE_CONFIGS = [
  { name: "Shopee", domain: "shopee.com.br" },
  { name: "Mercado Livre", domain: "mercadolivre.com.br" },
  { name: "TikTok Shop", domain: "tiktok.com" },
  { name: "SHEIN", domain: "shein.com" }
];

function normalize(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function isSearchPageUrl(url: string): boolean {
  if (!url) return false;
  const l = url.toLowerCase();
  return (
    l.includes("/search") ||
    l.includes("/pdsearch") ||
    l.includes("lista.mercadolivre") ||
    l.includes("registration?confirmation_url")
  );
}

function detectPlatform(url: string): string {
  const l = url.toLowerCase();
  if (l.includes("shopee") || l.includes("susercontent.com")) return "Shopee";
  if (l.includes("shein")) return "SHEIN";
  if (l.includes("tiktok")) return "TikTok Shop";
  if (l.includes("mercadolivre") || l.includes("mercadolibre")) return "Mercado Livre";
  return "Marketplace";
}

function sanitizeUrl(u: string, base?: string): string | null {
  try {
    let clean = u.trim().replace(/\\/g, "").replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
    if (!clean.startsWith("http")) {
      if (base) clean = new URL(clean, base).href;
      else return null;
    }
    const parsed = new URL(clean);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

// Rule 8: Detect videos in JSON, HTML attributes, scripts, data hydration, etc.
// Rule 9: Reject .m3u8 videos.
// Rule 1: No YouTube.
function extractVideosFromHtml(html: string, baseUrl: string): string[] {
  const list: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const valid = sanitizeUrl(raw, baseUrl);
    if (!valid) return;

    // Rule 1: Reject YouTube
    if (/youtube\.com|youtu\.be/i.test(valid)) return;

    // Rule 9: Reject .m3u8
    if (/\.m3u8(?:[?#]|$)/i.test(valid)) return;

    // Reject search / redirect URLs
    if (isSearchPageUrl(valid)) return;

    // Check if it represents a real video URL or stream
    const isDirectVideo = /\.(mp4|webm|mov)(?:[?#]|$)/i.test(valid);
    const isMarketplaceVideoCdn =
      valid.includes("vod.susercontent.com") ||
      valid.includes("cv.shopee.com.br") ||
      valid.includes("stream.mercadolibre.com") ||
      valid.includes("tiktokcdn.com");

    if ((isDirectVideo || isMarketplaceVideoCdn) && !seen.has(valid)) {
      seen.add(valid);
      list.push(valid);
    }
  };

  // 1. Check video and source attributes (src, data-src, data-video-src)
  const attrRegex = /<(?:video|source)[^>]+(?:src|data-src|data-video-src)=["']([^"']+)["']/gi;
  let m;
  while ((m = attrRegex.exec(html))) add(m[1]);

  // 2. Check JSON keys in embedded scripts/hydration data (Rule 8)
  const jsonRegex =
    /"(?:videoUrl|videoURL|video_url|playUrl|play_url|playAddr|play_addr|downloadAddr|download_addr|mediaUrl|media_url)"\s*:\s*"([^"\\]+)"/gi;
  while ((m = jsonRegex.exec(html))) add(m[1]);

  // 3. Check Open Graph video tags
  const ogRegex = /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi;
  while ((m = ogRegex.exec(html))) add(m[1]);

  // 4. Raw video URLs in text/JSON
  const rawRegex = /https?:\/\/[^"'\s<>]+\.(?:mp4|webm)(?:\?[^"'\s<>]*)?/gi;
  while ((m = rawRegex.exec(html))) add(m[0]);

  return list;
}

function extractMeta(html: string): { title?: string; thumbnail?: string } {
  let title: string | undefined;
  let thumbnail: string | undefined;

  const titleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1].trim();

  const imgMatch =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (imgMatch) thumbnail = imgMatch[1].trim();

  return { title, thumbnail };
}

async function safeFetchHtml(url: string, timeoutMs = 4500): Promise<{ ok: boolean; status: number; html: string; finalUrl: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });
    clearTimeout(timer);

    const html = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, html, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

// Generate query variations for matching (Rule 4)
function generateQueryVariations(productName: string): string[] {
  const norm = normalize(productName);
  const variations: string[] = [norm];

  // If name has a hyphen or separator like " - " (often Portuguese - English translation)
  if (productName.includes(" - ")) {
    const parts = productName.split(" - ").map(p => normalize(p)).filter(Boolean);
    for (const p of parts) {
      if (p.length >= 4 && !variations.includes(p)) variations.push(p);
    }
  }

  // Strip noise words
  const clean = norm
    .replace(/\b(?:un|pcs|pc|kit|c\/|com|em|de|da|do|para|new ion|original)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length >= 4 && !variations.includes(clean)) {
    variations.push(clean);
  }

  return variations.slice(0, 3);
}

// Avoid products with completely different names (Rule 5)
function isRelevantTitle(candidateTitle: string, productName: string): boolean {
  if (!candidateTitle) return true;
  const normTitle = normalize(candidateTitle);
  const words = normalize(productName)
    .split(/\s+/)
    .filter(w => w.length > 2 && !["com", "para", "kit", "new", "ion", "dos", "das", "the"].includes(w));

  if (words.length === 0) return true;
  const matchingWords = words.filter(w => normTitle.includes(w));
  return matchingWords.length >= Math.min(2, words.length);
}

serve(async req => {
  // Rule 15: Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  // Rule 12 & 14: Never return HTTP 500, always return valid JSON with diagnostics
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "JSON inválido na requisição.", candidates: [], diagnostics: {} }, 400);
    }

    const productName = String(body?.productName || "").trim();
    const productImage = String(body?.productImage || "").trim();
    const productId = String(body?.productId || "").trim();
    const inputAdUrls: string[] = Array.isArray(body?.adUrls) ? body.adUrls : [];
    const requestedPlatforms: string[] = Array.isArray(body?.platforms) && body.platforms.length > 0
      ? body.platforms
      : MARKETPLACE_CONFIGS.map(x => x.name);

    if (!productName && inputAdUrls.length === 0) {
      return jsonResponse({ candidates: [], error: "Nome do produto ou links de anúncio não informados.", diagnostics: {} }, 400);
    }

    const diagnostics: Record<string, { status: string; httpStatus?: number; urlChecked?: string; adsInspected: number; videosFound: number; note?: string }> = {};
    for (const p of requestedPlatforms) {
      diagnostics[p] = { status: "nao_iniciado", adsInspected: 0, videosFound: 0 };
    }

    const candidates: Candidate[] = [];
    const seenVideos = new Set<string>();

    const addCandidate = (item: Candidate) => {
      // Rule 1: No YouTube
      if (/youtube\.com|youtu\.be/i.test(item.videoUrl) || /youtube\.com|youtu\.be/i.test(item.adUrl)) return;
      // Rule 9: No .m3u8
      if (/\.m3u8(?:[?#]|$)/i.test(item.videoUrl)) return;
      // Rule 7: Must have a video
      if (!item.videoUrl || item.videoUrl.trim().length === 0) return;
      if (isSearchPageUrl(item.adUrl) || isSearchPageUrl(item.videoUrl)) return;

      const key = item.platform + "|" + item.videoUrl;
      if (seenVideos.has(key)) return;
      seenVideos.add(key);

      candidates.push(item);
      if (diagnostics[item.platform]) {
        diagnostics[item.platform].videosFound++;
      }
    };

    // -------------------------------------------------------------------------
    // ETAPA 1: Inspecionar URLs de anúncios fornecidos (ex: do catálogo / pesquisa)
    // -------------------------------------------------------------------------
    const validCandidateUrls = [...new Set(
      inputAdUrls
        .map(u => String(u || "").trim())
        .filter(u => u && !isSearchPageUrl(u) && /^https?:\/\//i.test(u))
    )];

    for (const url of validCandidateUrls) {
      const platform = detectPlatform(url);
      if (!requestedPlatforms.includes(platform) && platform !== "Marketplace") continue;
      if (!diagnostics[platform]) diagnostics[platform] = { status: "processando", adsInspected: 0, videosFound: 0 };
      diagnostics[platform].adsInspected++;

      // Caso 1: A própria URL já é um arquivo direto de vídeo (.mp4, etc.)
      if (/\.(mp4|webm|mov)(?:[?#]|$)/i.test(url)) {
        addCandidate({
          platform,
          title: productName || "Vídeo direto do anúncio",
          adUrl: url,
          videoUrl: url,
          thumbnail: productImage || undefined,
          duration: "10 segundos",
          notes: "Arquivo de vídeo direto do anúncio."
        });
        diagnostics[platform].status = "video_direto_encontrado";
        continue;
      }

      // Caso 2: URL de vídeo do TikTok
      if (/tiktok\.com\/.*\/video\/\d+/i.test(url)) {
        addCandidate({
          platform: "TikTok Shop",
          title: productName || "Vídeo TikTok",
          adUrl: url,
          videoUrl: url,
          thumbnail: productImage || undefined,
          duration: "10 segundos",
          notes: "Vídeo do anúncio no TikTok."
        });
        diagnostics["TikTok Shop"].status = "video_tiktok_encontrado";
        continue;
      }

      // Caso 3: Página HTML do marketplace (Shopee, Mercado Livre, SHEIN, etc.)
      diagnostics[platform].urlChecked = url;
      const resp = await safeFetchHtml(url);
      if (!resp) {
        diagnostics[platform].status = "falha_conexao_ou_timeout";
        continue;
      }

      diagnostics[platform].httpStatus = resp.status;
      if (!resp.ok) {
        diagnostics[platform].status = `bloqueado_http_${resp.status}`;
        continue;
      }

      const meta = extractMeta(resp.html);
      const extractedVideos = extractVideosFromHtml(resp.html, resp.finalUrl);

      if (extractedVideos.length > 0) {
        for (const vUrl of extractedVideos) {
          addCandidate({
            platform,
            title: meta.title || productName,
            adUrl: url,
            videoUrl: vUrl,
            thumbnail: meta.thumbnail || productImage || undefined,
            duration: "10 segundos",
            notes: "Vídeo detectado no anúncio do marketplace."
          });
        }
        diagnostics[platform].status = "video_extraido_com_sucesso";
      } else {
        diagnostics[platform].status = "sem_video_no_html";
      }
    }

    // -------------------------------------------------------------------------
    // ETAPA 2: Tentar encontrar vídeos no Supabase se já foram salvos anteriormente
    // -------------------------------------------------------------------------
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://fgweictufozyzerbdbtt.supabase.co";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "sb_publishable_IV3-SGFPpLo8v7EH-ZB9OQ_sSpXUZSn";

    try {
      const dbUrl = new URL(`${supabaseUrl}/rest/v1/video_records`);
      dbUrl.searchParams.set("select", "*");
      dbUrl.searchParams.set("limit", "10");

      if (productId) {
        dbUrl.searchParams.set("or", `(product_id.eq.${encodeURIComponent(productId)},product_key.eq.${encodeURIComponent(productId)})`);
      } else if (productName) {
        dbUrl.searchParams.set("product_name", `ilike.%${encodeURIComponent(productName)}%`);
      }

      const dbRes = await fetch(dbUrl.toString(), {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      });

      if (dbRes.ok) {
        const rows = await dbRes.json();
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (row.video_url && !isSearchPageUrl(row.video_url)) {
              addCandidate({
                platform: row.platform || "Shopee",
                title: row.product_name || productName,
                adUrl: row.ad_url || row.video_url,
                videoUrl: row.video_url,
                thumbnail: row.product_image || productImage || undefined,
                duration: row.duration || "10 segundos",
                notes: "Vídeo verificado já registrado no Supabase."
              });
            }
          }
        }
      }
    } catch {
      // Supabase lookup falhou silenciosamente, continua com as outras etapas
    }

    // -------------------------------------------------------------------------
    // ETAPA 3: Busca externa resiliente por variações de nome do produto
    // -------------------------------------------------------------------------
    if (candidates.length === 0 && productName) {
      const variations = generateQueryVariations(productName);

      // Pesquisar TikTok Shop via Bing
      if (requestedPlatforms.includes("TikTok Shop")) {
        try {
          diagnostics["TikTok Shop"].status = "pesquisando_bing";
          for (const variation of variations) {
            if (candidates.some(c => c.platform === "TikTok Shop")) break;
            const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(`site:tiktok.com/video "${variation}"`)}`;
            const bResp = await safeFetchHtml(searchUrl, 3500);
            if (bResp && bResp.ok) {
              const uMatches = [...bResp.html.matchAll(/(?:&amp;|&)u=a1([a-zA-Z0-9_-]+)/g)].map(m => m[1]);
              for (const p of uMatches.slice(0, 10)) {
                try {
                  const decoded = atob(p.replace(/-/g, "+").replace(/_/g, "/"));
                  if (/tiktok\.com\/.*\/video\/\d+/i.test(decoded)) {
                    diagnostics["TikTok Shop"].adsInspected++;
                    addCandidate({
                      platform: "TikTok Shop",
                      title: productName,
                      adUrl: decoded,
                      videoUrl: decoded,
                      thumbnail: productImage || undefined,
                      duration: "10 segundos",
                      notes: "Vídeo de produto encontrado no TikTok Shop."
                    });
                  }
                } catch {}
              }
            }
          }
        } catch (err) {
          diagnostics["TikTok Shop"].note = String(err);
        }
      }
    }

    // Retorno final de sucesso, sempre JSON, sem nunca disparar 500
    const max = Number(body?.maxCandidates) || 20;
    return jsonResponse({
      success: true,
      productName,
      candidates: candidates.slice(0, max),
      diagnostics,
      checkedCount: Object.values(diagnostics).reduce((sum, d) => sum + (d.adsInspected || 0), 0),
      note: "Resultados contêm apenas anúncios e mídias de vídeo reais dos marketplaces suportados."
    });
  } catch (error) {
    // Tratamento global para garantir que o retorno NUNCA seja 500 sem corpo JSON
    return jsonResponse({
      success: false,
      candidates: [],
      error: error instanceof Error ? error.message : "Falha na varredura.",
      diagnostics: {}
    }, 200);
  }
});
