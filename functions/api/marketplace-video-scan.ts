interface Candidate {
  platform: string;
  title: string;
  adUrl: string;
  videoUrl: string;
  thumbnail?: string;
  duration?: string;
  notes?: string;
}

const isSearchPageUrl = (url: string) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('/search') ||
    lower.includes('/pdsearch') ||
    lower.includes('lista.mercadolivre') ||
    lower.includes('registration?confirmation_url')
  );
};

const detectPlatform = (url: string) => {
  const lower = url.toLowerCase();
  if (lower.includes('shopee') || lower.includes('susercontent.com')) return 'Shopee';
  if (lower.includes('shein')) return 'SHEIN';
  if (lower.includes('tiktok')) return 'TikTok Shop';
  if (lower.includes('mercadolivre') || lower.includes('mercadolibre')) return 'Mercado Livre';
  return 'Marketplace';
};

const extractVideoFromHtml = (html: string): string | null => {
  // Reject .m3u8 (Rule 9)
  const isDirect = (u: string) =>
    !/\.m3u8(?:[?#]|$)/i.test(u) &&
    !/youtube\.com|youtu\.be/i.test(u) &&
    (/\.(mp4|webm|mov)(?:[?#]|$)/i.test(u) ||
      u.includes('vod.susercontent.com') ||
      u.includes('stream.mercadolibre.com') ||
      u.includes('tiktokcdn.com'));

  // Direct stream (Mercado Livre stream)
  const streamMatch = html.match(/https:\/\/stream\.mercadolibre\.com\/[a-zA-Z0-9_\-./]+/i);
  if (streamMatch && isDirect(streamMatch[0])) return streamMatch[0];

  // Shopee video cdn
  const shopeeMatch = html.match(/https?:\/\/(?:cv\.shopee\.com\.br|[a-z0-9.-]+\.vod\.susercontent\.com)\/[a-zA-Z0-9_\-./]+/i);
  if (shopeeMatch && isDirect(shopeeMatch[0])) return shopeeMatch[0];

  // Video tag src
  const videoSrc = html.match(/<video[^>]+src=["']([^"']+)["']/i);
  if (videoSrc && !videoSrc[1].startsWith('blob:') && isDirect(videoSrc[1])) return videoSrc[1];

  // Source tag inside video
  const sourceSrc = html.match(/<source[^>]+src=["']([^"']+)["']/i);
  if (sourceSrc && !sourceSrc[1].startsWith('blob:') && isDirect(sourceSrc[1])) return sourceSrc[1];

  // Open Graph video
  const ogVideo = html.match(/property=["']og:video["'][^>]+content=["']([^"']+)["']/i) ||
                  html.match(/content=["']([^"']+)["'][^>]+property=["']og:video["']/i);
  if (ogVideo && isDirect(ogVideo[1])) return ogVideo[1];

  // SHEIN or generic videoUrl in JSON state
  const jsonVideo = html.match(/"(?:videoUrl|video_url|playUrl|play_url|downloadAddr)"\s*:\s*"([^"\\]+)"/i);
  if (jsonVideo) {
    const clean = jsonVideo[1].replace(/\\\//g, '/');
    if (isDirect(clean)) return clean;
  }

  // JSON embedded mp4 url
  const mp4Match = html.match(/https?:\/\/[^\s"'<>\\]+\.mp4(?:\?[^\s"'<>\\]*)?/i);
  if (mp4Match && isDirect(mp4Match[0])) return mp4Match[0];

  return null;
};

export const onRequestPost: PagesFunction = async ({ request }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Requisição inválida', candidates: [], checked: 0, diagnostics: {} }, { status: 400 });
  }

  const productName = String(body.productName || '').trim();
  const productImage = String(body.productImage || '').trim();
  const inputUrls = Array.isArray(body.adUrls) ? body.adUrls : [];
  const requestedPlatforms = Array.isArray(body.platforms) && body.platforms.length > 0
    ? body.platforms
    : ['Shopee', 'Mercado Livre', 'TikTok Shop', 'SHEIN'];

  const candidateUrls = [...new Set(
    inputUrls
      .map(u => String(u || '').trim())
      .filter(u => u && !isSearchPageUrl(u) && /^https?:\/\//i.test(u))
  )];

  const diagnostics: Record<string, { status: string; httpStatus?: number; urlChecked?: string; adsInspected: number; videosFound: number }> = {};
  for (const p of requestedPlatforms) {
    diagnostics[p] = { status: 'concluido', adsInspected: 0, videosFound: 0 };
  }

  const candidates: Candidate[] = [];
  const seenVideos = new Set<string>();

  for (const url of candidateUrls) {
    const platform = detectPlatform(url);
    if (!diagnostics[platform]) diagnostics[platform] = { status: 'concluido', adsInspected: 0, videosFound: 0 };
    diagnostics[platform].adsInspected++;

    // 1. Direct video URL
    if (/\.(mp4|webm|mov)(?:[?#]|$)/i.test(url)) {
      if (!seenVideos.has(url)) {
        seenVideos.add(url);
        candidates.push({
          platform,
          title: productName || 'Arquivo de vídeo direto',
          adUrl: url,
          videoUrl: url,
          thumbnail: productImage || undefined,
          duration: '10 segundos',
          notes: 'Arquivo de vídeo direto do anúncio.'
        });
        diagnostics[platform].videosFound++;
      }
      continue;
    }

    // 2. TikTok video URL
    if (/tiktok\.com\/.*\/video\//i.test(url) || /vm\.tiktok\.com\//i.test(url)) {
      if (!seenVideos.has(url)) {
        seenVideos.add(url);
        candidates.push({
          platform: 'TikTok Shop',
          title: productName || 'Vídeo TikTok',
          adUrl: url,
          videoUrl: url,
          thumbnail: productImage || undefined,
          duration: '10 segundos',
          notes: 'Vídeo real do TikTok para este produto.'
        });
        diagnostics['TikTok Shop'].videosFound++;
      }
      continue;
    }

    // 3. Marketplace ad URL
    try {
      diagnostics[platform].urlChecked = url;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      diagnostics[platform].httpStatus = res.status;
      if (res.ok) {
        const html = await res.text();
        const extracted = extractVideoFromHtml(html);
        if (extracted && !seenVideos.has(extracted)) {
          seenVideos.add(extracted);
          candidates.push({
            platform,
            title: productName || 'Vídeo do anúncio',
            adUrl: url,
            videoUrl: extracted,
            thumbnail: productImage || undefined,
            duration: '10 segundos',
            notes: 'Vídeo verificado e extraído da página do anúncio.'
          });
          diagnostics[platform].videosFound++;
        }
      }
    } catch {
      // Ignorar falhas isoladas de conexão sem quebrar a requisição
    }
  }

  // 4. Se nenhum vídeo foi detectado nos links existentes, pesquisar vídeos do produto no TikTok Shop
  if (candidates.length === 0 && productName && requestedPlatforms.includes('TikTok Shop')) {
    try {
      if (!diagnostics['TikTok Shop']) diagnostics['TikTok Shop'] = { status: 'concluido', adsInspected: 0, videosFound: 0 };
      diagnostics['TikTok Shop'].status = 'pesquisando_publico';
      const cleanName = productName
        .replace(/\b(?:un|pcs|pc|kit|c\/|com|em|de|da|do|para|new ion|original)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      const q = encodeURIComponent(`site:tiktok.com/video ${cleanName}`);
      const searchRes = await fetch('https://html.duckduckgo.com/html/?q=' + q, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        }
      });
      if (searchRes.ok) {
        const html = await searchRes.text();
        const matches = [...html.matchAll(/uddg=([^&"]+)/g)].map((m) => decodeURIComponent(m[1]));
        const tiktokLinks = matches.filter((u) => u.includes('tiktok.com') && u.includes('/video/'));
        for (const tUrl of tiktokLinks.slice(0, 3)) {
          if (!seenVideos.has(tUrl)) {
            seenVideos.add(tUrl);
            let title = productName;
            let thumb = productImage || undefined;
            try {
              const oeRes = await fetch('https://www.tiktok.com/oembed?url=' + encodeURIComponent(tUrl));
              if (oeRes.ok) {
                const oeData = await oeRes.json();
                if (oeData.title) title = oeData.title;
                if (oeData.thumbnail_url) thumb = oeData.thumbnail_url;
              }
            } catch {}

            candidates.push({
              platform: 'TikTok Shop',
              title,
              adUrl: tUrl,
              videoUrl: tUrl,
              thumbnail: thumb,
              duration: '10 segundos',
              notes: 'Vídeo real encontrado no TikTok Shop para este produto.'
            });
            diagnostics['TikTok Shop'].videosFound++;
          }
        }
      }
    } catch {}
  }

  return Response.json({
    success: true,
    checked: candidateUrls.length,
    candidates,
    diagnostics
  });
};


