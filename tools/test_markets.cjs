const fs = require('fs');

async function fetchHtmlThroughLayers(targetUrl) {
  // Layer 1: Direct fetch with browser headers (only if not blocked by account-verification/negative_traffic)
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8'
      }
    });
    if (res.ok) {
      const text = await res.text();
      const isBlocked = text.includes('negative_traffic') || text.includes('account-verification') || text.includes('challenge');
      if (!isBlocked && text.length > 20000) {
        return { text, url: res.url || targetUrl, source: 'direct' };
      }
    }
  } catch (e) {}

  // Layer 2: Google Proxy Gateway
  try {
    const gUrl = 'https://translate.google.com/translate?sl=auto&tl=en&u=' + encodeURIComponent(targetUrl);
    const res = await fetch(gUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      }
    });
    if (res.ok) {
      const text = await res.text();
      if (text.length > 50000) {
        return { text, url: targetUrl, source: 'google_proxy' };
      }
    }
  } catch (e) {}

  return null;
}

function cleanHtml(raw) {
  return raw
    .replace(/\\u002F/gi, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}

async function extractVideosFromMarketplace(targetUrl, productName = '') {
  console.log('--- Scanning:', targetUrl, '---');
  const result = await fetchHtmlThroughLayers(targetUrl);
  if (!result) {
    console.log('Failed to fetch layers for', targetUrl);
    return [];
  }
  console.log('Fetched via layer:', result.source, 'length:', result.text.length);

  const html = cleanHtml(result.text);
  const foundVideos = new Set();

  // Pattern 1: Mercado Livre Clip or Short URL
  const clipMatches = html.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?mercadolivre\.com\.br(?:\.translate\.goog)?\/shorts\/clips\/([a-zA-Z0-9]+)\/[^"'\s<>#]+/gi) || [];
  console.log('Found ML Clip matches in HTML:', clipMatches.length);

  for (const cUrl of clipMatches.slice(0, 3)) {
    const cleanClipUrl = cUrl.replace('.translate.goog', '').split('#')[0].split('?')[0];
    console.log('Fetching clip details for:', cleanClipUrl);
    const clipResult = await fetchHtmlThroughLayers(cleanClipUrl);
    if (clipResult) {
      const clipHtml = cleanHtml(clipResult.text);
      const mp4Matches = clipHtml.match(/https?:\/\/video-static-clips\.mms\.mlstatic\.com\/[^"'<>\s\\]+\.mp4/gi) || [];
      mp4Matches.forEach(u => foundVideos.add(u));
    }
  }

  // Pattern 2: Direct static video CDN links (ML, Shopee, TikTok, SHEIN)
  const cdnMatches = html.match(/https?:\/\/[^"'<>\s\\]+\.(?:mp4|webm|mov)(?:\?[^"'<>\s\\]*)?/gi) || [];
  cdnMatches.forEach(u => {
    if (!u.includes('.m3u8')) foundVideos.add(u);
  });

  // Pattern 3: Video JSON attributes
  const jsonVideoMatches = [...html.matchAll(/"(?:videoUrl|video_url|playUrl|play_url|downloadAddr|mediaUrl|media_url|videoSrc)"\s*:\s*"((?:\\.|[^"\\])+)"/gi)];
  jsonVideoMatches.forEach(m => {
    const u = m[1].replace(/\\\//g, '/');
    if (/^https?:/i.test(u) && !u.includes('.m3u8')) foundVideos.add(u);
  });

  // Pattern 4: Shopee VOD cdn
  const shopeeMatches = html.match(/https?:\/\/(?:cv\.shopee\.com\.br|[a-z0-9.-]+\.vod\.susercontent\.com)\/[a-zA-Z0-9_\-./]+/gi) || [];
  shopeeMatches.forEach(u => foundVideos.add(u));

  console.log('Total verified videos found:', foundVideos.size);
  foundVideos.forEach(v => console.log(' -> Video:', v));
  return Array.from(foundVideos);
}

async function run() {
  const testMLUrl = 'https://www.mercadolivre.com.br/sq-cozinha-sf-400-branco-10-kg-balanca/p/MLB15462294?pdp_filters=item_id%3AMLB2901308748';
  const videos = await extractVideosFromMarketplace(testMLUrl, 'Balança Digital SF-400');
  console.log('Result for MLB2901308748:', videos);
}
run();
