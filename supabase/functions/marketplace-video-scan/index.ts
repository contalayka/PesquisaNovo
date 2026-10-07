import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

export type ConfidenceLevel = "ALTA" | "MÉDIA" | "BAIXA";
export type SourceType = "anuncio_direto" | "dados_relacionados" | "busca_externa";

type Candidate = {
  platform: string;
  title: string;
  adUrl: string;
  videoUrl: string;
  thumbnail?: string;
  duration?: string;
  notes?: string;
  confidence?: ConfidenceLevel;
  sourceType?: SourceType;
  isPrimary?: boolean;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: H });

function detectPlatform(url: string) {
  const l = (url || "").toLowerCase();
  if (l.includes("shopee") || l.includes("susercontent.com")) return "Shopee";
  if (l.includes("shein")) return "SHEIN";
  if (l.includes("tiktok")) return "TikTok Shop";
  if (l.includes("mercadolivre") || l.includes("mercadolibre")) return "Mercado Livre";
  return "Marketplace";
}

function isInvalidPageUrl(url: string) {
  if (!url || typeof url !== "string") return true;
  const l = url.toLowerCase();
  return (
    !/^https?:\/\//i.test(url) ||
    /youtube\.com|youtu\.be/i.test(l) ||
    l.includes("registration?confirmation_url") ||
    l.includes("account-verification") ||
    l.includes("/login")
  );
}

function isRealProductVideo(videoUrl: string): boolean {
  if (!videoUrl || typeof videoUrl !== "string") return false;
  const l = videoUrl.toLowerCase();
  if (/\.(webp|jpg|jpeg|png|gif|svg|ico|bmp|avif)(?:\?[^#]*)?$/i.test(l)) return false;
  if (/\.m3u8(?:[?#]|$)/i.test(l)) return false;
  if (
    l.includes("tutorial") ||
    l.includes("como-comprar") ||
    l.includes("institucional") ||
    l.includes("help_center") ||
    l.includes("ajuda") ||
    l.includes("guia_de_tamanhos")
  ) {
    return false;
  }
  return /\.(mp4|webm|mov|m4v)(?:\?[^#]*)?$/i.test(l) ||
    l.includes("video-static-clips") ||
    l.includes("stream.mercadolibre.com") ||
    l.includes("vod.susercontent.com") ||
    l.includes("cv.shopee.com") ||
    l.includes("tiktokcdn.com") ||
    l.includes("ttlivecdn.com") ||
    l.includes("shein.com") ||
    l.includes("mlstatic.com");
}

function cleanHtmlString(raw: string) {
  if (!raw) return "";
  return raw
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

function unwrapProxyUrl(rawUrl: string) {
  if (!rawUrl) return "";
  let u = rawUrl.replace(/\\u002F/gi, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&");
  if (u.includes("translate.google.com/website") || u.includes(".translate.goog")) {
    const m = u.match(/[?&]u=(https?:\/\/[^&"'\s]+)/);
    if (m) {
      try {
        return decodeURIComponent(m[1]).split("#")[0];
      } catch {
        return m[1].split("#")[0];
      }
    }
    u = u.replace(".translate.goog", "");
  }
  return u.split("#")[0];
}

function canonicalVideoKey(url: string): string {
  if (!url) return "";
  try {
    return url.split("#")[0].split("?")[0].trim().toLowerCase();
  } catch {
    return url;
  }
}

async function fetchLayeredHtml(targetUrl: string, timeoutMs = 8000): Promise<{ html: string; source: string } | null> {
  // Layer 1: Direct fetch
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), Math.min(timeoutMs, 3500));
    const res = await fetch(targetUrl, {
      signal: c.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8"
      }
    });
    clearTimeout(t);
    if (res.ok) {
      const text = await res.text();
      const isBlocked = text.includes("negative_traffic") || text.includes("account-verification") || text.includes("challenge") || text.includes("robot_check");
      if (!isBlocked && text.length > 20000) {
        return { html: text, source: "direct" };
      }
    }
  } catch {}

  // Layer 2: Google Proxy Gateway
  try {
    const gUrl = "https://translate.google.com/translate?sl=auto&tl=en&u=" + encodeURIComponent(targetUrl);
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), Math.min(timeoutMs, 5000));
    const res = await fetch(gUrl, {
      signal: c.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      }
    });
    clearTimeout(t);
    if (res.ok) {
      const text = await res.text();
      if (text.length > 25000) {
        return { html: text, source: "proxy" };
      }
    }
  } catch {}

  return null;
}

async function scanMercadoLivreAd(
  adUrl: string,
  fallbackProductName = "",
  fallbackImage = "",
  sourceType: SourceType = "anuncio_direto"
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();

  const page = await fetchLayeredHtml(adUrl, 8000);
  if (!page) return [];

  const rawHtml = cleanHtmlString(page.html);

  const titleM = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = (titleM ? titleM[1].replace(/\s*\|\s*Mercado\s*Livre.*$/i, "").trim() : "") || fallbackProductName;
  const ogImgM = rawHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const thumbnail = ogImgM ? ogImgM[1].trim() : fallbackImage;

  // 1. Clips / Shorts
  const clipMatches = rawHtml.match(/https?:\/\/[^\s"'<>]+\/shorts\/clips\/([a-zA-Z0-9]+)\/[^"'\s<>#]+/gi) || [];
  for (let clipIdx = 0; clipIdx < Math.min(clipMatches.length, 2); clipIdx++) {
    const cUrl = clipMatches[clipIdx];
    const cleanClipUrl = unwrapProxyUrl(cUrl);
    const clipPage = await fetchLayeredHtml(cleanClipUrl, 6000);
    if (clipPage) {
      const clipHtml = cleanHtmlString(clipPage.html);
      const mp4Matches = clipHtml.match(/https?:\/\/video-static-clips\.mms\.mlstatic\.com\/[^"'<>\s\\]+\.mp4/gi) || [];
      for (const mp4 of mp4Matches) {
        if (!isRealProductVideo(mp4)) continue;
        const key = canonicalVideoKey(mp4);
        if (seenUrls.has(mp4) || seenKeys.has(key)) continue;

        seenUrls.add(mp4);
        seenKeys.add(key);

        const isMediaOriginal = mp4.includes("/media/video_") || mp4.includes("/media/");
        const isPrimary = clipIdx === 0 && isMediaOriginal;

        candidates.push({
          platform: "Mercado Livre",
          title: title || "Anúncio com Vídeo (Mercado Livre Clips)",
          adUrl,
          videoUrl: mp4,
          thumbnail: thumbnail || undefined,
          duration: "10–60 segundos",
          notes: isPrimary
            ? "Vídeo principal verificado do anúncio (Mercado Livre Clips)"
            : "Vídeo alternativo do anúncio (Mercado Livre Clips)",
          confidence: isPrimary ? "ALTA" : (sourceType === "anuncio_direto" ? "MÉDIA" : "BAIXA"),
          sourceType,
          isPrimary
        });
      }
    }
  }

  // 2. Direct static video CDN
  const cdnVideos = rawHtml.match(/https?:\/\/[^"'<>\s\\]*(?:mlstatic\.com\/[^"'<>\s\\]+\.(?:mp4|webm|mov)|stream\.mercadolibre\.com\/[a-zA-Z0-9_\-./]+)/gi) || [];
  for (const v of cdnVideos) {
    if (!isRealProductVideo(v)) continue;
    const key = canonicalVideoKey(v);
    if (seenUrls.has(v) || seenKeys.has(key)) continue;

    seenUrls.add(v);
    seenKeys.add(key);

    candidates.push({
      platform: "Mercado Livre",
      title: title || "Anúncio com Vídeo (Mercado Livre)",
      adUrl,
      videoUrl: v,
      thumbnail: thumbnail || undefined,
      duration: "10–60 segundos",
      notes: "Vídeo CDN detectado no Mercado Livre",
      confidence: sourceType === "anuncio_direto" ? "ALTA" : "MÉDIA",
      sourceType,
      isPrimary: candidates.length === 0
    });
  }

  // 3. JSON Video
  const jsonVideoMatches = [...rawHtml.matchAll(/"(?:videoUrl|video_url|playUrl|play_url|downloadAddr|mediaUrl|media_url|videoSrc)"\s*:\s*"((?:\\.|[^"\\])+)"/gi)];
  for (const m of jsonVideoMatches) {
    const u = m[1].replace(/\\\//g, "/");
    if (/^https?:/i.test(u) && isRealProductVideo(u)) {
      const key = canonicalVideoKey(u);
      if (seenUrls.has(u) || seenKeys.has(key)) continue;

      seenUrls.add(u);
      seenKeys.add(key);

      candidates.push({
        platform: "Mercado Livre",
        title: title || "Anúncio com Vídeo (Mercado Livre)",
        adUrl,
        videoUrl: u,
        thumbnail: thumbnail || undefined,
        duration: "10–60 segundos",
        notes: "Vídeo detectado nos dados do anúncio",
        confidence: sourceType === "anuncio_direto" ? "ALTA" : "MÉDIA",
        sourceType,
        isPrimary: candidates.length === 0
      });
    }
  }

  candidates.sort((a, b) => {
    const confScore = (c?: ConfidenceLevel) => (c === "ALTA" ? 3 : c === "MÉDIA" ? 2 : 1);
    const diff = confScore(b.confidence) - confScore(a.confidence);
    if (diff !== 0) return diff;
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return 0;
  });

  return candidates;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  if (req.method !== "POST") return json({ success: false, candidates: [], error: "Método não permitido." }, 405);

  try {
    const b = await req.json().catch(() => ({}));
    const productName = String(b?.productName || "").trim();
    const productImage = String(b?.productImage || "").trim();
    const inputAds = Array.isArray(b?.adUrls) ? b.adUrls.map(String) : [];
    const wanted = Array.isArray(b?.platforms) && b.platforms.length ? b.platforms.map(String) : ["Mercado Livre", "Shopee", "TikTok Shop", "SHEIN"];

    const candidateUrls = [...new Set(
      inputAds
        .map((u: string) => String(u || "").trim())
        .filter((u: string) => u && !isInvalidPageUrl(u) && /^https?:\/\//i.test(u))
    )];

    const diagnostics: Record<string, any> = {};
    for (const p of wanted) diagnostics[p] = { status: "concluido", adsInspected: 0, videosFound: 0 };

    const candidates: Candidate[] = [];
    const seenUrls = new Set<string>();
    const seenKeys = new Set<string>();

    for (const url of candidateUrls) {
      const platform = detectPlatform(url);
      if (!diagnostics[platform]) diagnostics[platform] = { status: "concluido", adsInspected: 0, videosFound: 0 };
      diagnostics[platform].adsInspected++;
      diagnostics[platform].urlChecked = url;

      // 1. Direct video URL
      if (/\.(mp4|webm|mov)(?:[?#]|$)/i.test(url) && isRealProductVideo(url)) {
        const key = canonicalVideoKey(url);
        if (!seenUrls.has(url) && !seenKeys.has(key)) {
          seenUrls.add(url);
          seenKeys.add(key);
          candidates.push({
            platform,
            title: productName || "Arquivo de vídeo direto",
            adUrl: url,
            videoUrl: url,
            thumbnail: productImage || undefined,
            duration: "10 segundos",
            notes: "Arquivo de vídeo direto do anúncio.",
            confidence: "ALTA",
            sourceType: "anuncio_direto",
            isPrimary: true
          });
          diagnostics[platform].videosFound++;
        }
        continue;
      }

      // 2. TikTok URL
      if (/tiktok\.com\/.*\/video\//i.test(url) || /vm\.tiktok\.com\//i.test(url)) {
        const key = canonicalVideoKey(url);
        if (!seenUrls.has(url) && !seenKeys.has(key)) {
          seenUrls.add(url);
          seenKeys.add(key);
          candidates.push({
            platform: "TikTok Shop",
            title: productName || "Vídeo TikTok",
            adUrl: url,
            videoUrl: url,
            thumbnail: productImage || undefined,
            duration: "10 segundos",
            notes: "Vídeo real do TikTok para este produto.",
            confidence: "ALTA",
            sourceType: "anuncio_direto",
            isPrimary: true
          });
          diagnostics["TikTok Shop"].videosFound++;
        }
        continue;
      }

      // 3. Mercado Livre Ad
      if (platform === "Mercado Livre") {
        try {
          const mlCandidates = await scanMercadoLivreAd(url, productName, productImage, "anuncio_direto");
          for (const c of mlCandidates) {
            const key = canonicalVideoKey(c.videoUrl);
            if (!seenUrls.has(c.videoUrl) && !seenKeys.has(key)) {
              seenUrls.add(c.videoUrl);
              seenKeys.add(key);
              candidates.push(c);
              diagnostics["Mercado Livre"].videosFound++;
            }
          }
        } catch (err: any) {
          diagnostics["Mercado Livre"].error = String(err);
        }
        continue;
      }

      // 4. Other Marketplaces (Shopee, SHEIN)
      try {
        const page = await fetchLayeredHtml(url, 7000);
        if (page) {
          const html = cleanHtmlString(page.html);
          const directVideos = html.match(/https?:\/\/[^"'<>\s\\]+\.(?:mp4|webm|mov)(?:\?[^"'<>\s\\]*)?/gi) || [];
          for (const v of directVideos) {
            if (isRealProductVideo(v)) {
              const key = canonicalVideoKey(v);
              if (!seenUrls.has(v) && !seenKeys.has(key)) {
                seenUrls.add(v);
                seenKeys.add(key);
                candidates.push({
                  platform,
                  title: productName || "Vídeo do anúncio",
                  adUrl: url,
                  videoUrl: v,
                  thumbnail: productImage || undefined,
                  duration: "10–60 segundos",
                  notes: `Vídeo verificado da página do anúncio (${platform})`,
                  confidence: "ALTA",
                  sourceType: "anuncio_direto",
                  isPrimary: true
                });
                diagnostics[platform].videosFound++;
                break;
              }
            }
          }
          if (platform === "Shopee") {
            const shopeeMatches = html.match(/https?:\/\/(?:cv\.shopee\.com\.br|[a-z0-9.-]+\.vod\.susercontent\.com)\/[a-zA-Z0-9_\-./]+/gi) || [];
            for (const v of shopeeMatches) {
              if (isRealProductVideo(v)) {
                const key = canonicalVideoKey(v);
                if (!seenUrls.has(v) && !seenKeys.has(key)) {
                  seenUrls.add(v);
                  seenKeys.add(key);
                  candidates.push({
                    platform: "Shopee",
                    title: productName || "Vídeo Shopee",
                    adUrl: url,
                    videoUrl: v,
                    thumbnail: productImage || undefined,
                    duration: "10–60 segundos",
                    notes: "Vídeo detectado no Shopee VOD",
                    confidence: "ALTA",
                    sourceType: "anuncio_direto",
                    isPrimary: true
                  });
                  diagnostics["Shopee"].videosFound++;
                  break;
                }
              }
            }
          }
        }
      } catch {}
    }

    // 5. If no candidates found, search Mercado Livre lista
    if (candidates.length === 0 && productName && wanted.includes("Mercado Livre")) {
      try {
        const cleanQ = productName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        if (cleanQ) {
          const searchUrl = "https://lista.mercadolivre.com.br/" + cleanQ;
          const page = await fetchLayeredHtml(searchUrl, 8000);
          if (page) {
            const matches = page.html.match(/https?:\/\/(?:[^\s"'<>]+\.)?mercadolivre\.com\.br\/[^\s"'<>]+\/p\/MLB\d+(?:\?[^\s"'<>]*)?/gi) || [];
            const cleanLinks = [...new Set(matches.map(m => unwrapProxyUrl(m)))].slice(0, 3);
            for (const link of cleanLinks) {
              const mlCandidates = await scanMercadoLivreAd(link, productName, productImage, "busca_externa");
              for (const c of mlCandidates) {
                const key = canonicalVideoKey(c.videoUrl);
                if (!seenUrls.has(c.videoUrl) && !seenKeys.has(key)) {
                  seenUrls.add(c.videoUrl);
                  seenKeys.add(key);
                  c.confidence = "BAIXA";
                  c.sourceType = "busca_externa";
                  candidates.push(c);
                  diagnostics["Mercado Livre"].videosFound++;
                }
              }
              if (candidates.length > 0) break;
            }
          }
        }
      } catch {}
    }

    candidates.sort((a, b) => {
      const confScore = (c?: ConfidenceLevel) => (c === "ALTA" ? 3 : c === "MÉDIA" ? 2 : 1);
      const diff = confScore(b.confidence) - confScore(a.confidence);
      if (diff !== 0) return diff;
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return 0;
    });

    return json({
      success: true,
      productName,
      candidates,
      matchedImage: false,
      diagnostics,
      checkedCount: candidateUrls.length,
      note: "Busca em camadas concluída com sucesso e ranqueamento de qualidade."
    });
  } catch (err: any) {
    return json({
      success: false,
      candidates: [],
      error: String(err?.message || err),
      diagnostics: {}
    }, 500);
  }
});
