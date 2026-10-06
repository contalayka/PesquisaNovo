import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

type Candidate = {
  platform: string;
  title: string;
  adUrl: string;
  videoUrl: string;
  thumbnail?: string;
  duration?: string;
  notes?: string;
};

const MARKETS = [
  { name: "Shopee", domains: ["shopee.com.br", "susercontent.com"] },
  { name: "SHEIN", domains: ["br.shein.com", "shein.com"] },
  { name: "TikTok Shop", domains: ["shop.tiktok.com", "tiktok.com"] },
  { name: "Mercado Livre", domains: ["mercadolivre.com.br", "mercadolibre.com"] },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: H });

const norm = (v: unknown) =>
  String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

function platformOf(url: string) {
  const l = url.toLowerCase();
  if (l.includes("shopee") || l.includes("susercontent")) return "Shopee";
  if (l.includes("shein")) return "SHEIN";
  if (l.includes("tiktok")) return "TikTok Shop";
  if (l.includes("mercadolivre") || l.includes("mercadolibre")) return "Mercado Livre";
  return "Marketplace";
}

function isBadPage(url: string) {
  const l = url.toLowerCase();
  return !/^https?:\/\//i.test(url) ||
    /youtube\.com|youtu\.be/i.test(l) ||
    /\/search(?:[/?#]|$)|\/pdsearch(?:[/?#]|$)|lista\.mercadolivre\.com\.br/i.test(l);
}

function cleanUrl(raw: string, base = "") {
  try {
    let s = String(raw).trim().replace(/\\/g, "").replace(/&amp;/g, "&");
    if (!/^https?:\/\//i.test(s)) s = new URL(s, base).href;
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return "";
    return u.href;
  } catch { return ""; }
}

async function fetchText(url: string, timeout = 6000) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    const r = await fetch(url, {
      signal: c.signal, redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/json,*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
      }
    });
    const text = await r.text().catch(() => "");
    clearTimeout(t);
    return { ok: r.ok, status: r.status, url: r.url || url, text };
  } catch (e) {
    return { ok: false, status: 0, url, text: "", error: String(e) };
  }
}

function titleAndImage(html: string) {
  const tm = html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)/i) ||
             html.match(/<title[^>]*>([^<]+)/i);
  const im = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/i);
  return { title: tm?.[1]?.trim(), thumbnail: im?.[1]?.trim() };
}

function videoUrls(html: string, base: string) {
  const out: string[] = [], seen = new Set<string>();
  const add = (raw: string) => {
    const u = cleanUrl(raw, base);
    if (!u || isBadPage(u) || /\.m3u8(?:[?#]|$)/i.test(u)) return;
    const l = u.toLowerCase();
    const direct = /\.(mp4|webm|mov)(?:[?#]|$)/i.test(l);
    const cdn = /susercontent\.com|tiktokcdn|ttlivecdn|cv\.shopee|mercadolibre.*video|shein.*video/i.test(l);
    if ((direct || cdn) && !seen.has(u)) { seen.add(u); out.push(u); }
  };
  let m: RegExpExecArray | null;
  const patterns = [
    /<(?:video|source)[^>]+(?:src|data-src|data-video-src|data-url)=["']([^"']+)["']/gi,
    /"(?:videoUrl|videoURL|video_url|playUrl|play_url|playAddr|play_addr|downloadAddr|download_addr|mediaUrl|media_url|video_src|videoSrc)"\s*:\s*"([^"\\]+)"/gi,
    /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /https?:\/\/[^"'<>\s]+\.(?:mp4|webm|mov)(?:\?[^"'<>\s]*)?/gi,
  ];
  for (const re of patterns) while ((m = re.exec(html))) add(m[1]);
  return out.slice(0, 10);
}

function marketplaceLinks(html: string, base: string) {
  const out: string[] = [], seen = new Set<string>();
  const add = (raw: string) => {
    const u = cleanUrl(raw, base);
    if (!u || isBadPage(u) || seen.has(u)) return;
    if (MARKETS.some(m => m.domains.some(d => u.toLowerCase().includes(d)))) {
      seen.add(u); out.push(u);
    }
  };
  let m: RegExpExecArray | null;
  const re = /https?:[^"'<>\s]+/gi;
  while ((m = re.exec(html))) add(m[0]);
  return out.slice(0, 30);
}

function relevant(title: string, product: string) {
  if (!title) return true;
  const words = norm(product).split(" ").filter(w => w.length > 2 && !["com","para","kit","the","new","original"].includes(w));
  if (!words.length) return true;
  const hits = words.filter(w => norm(title).includes(w)).length;
  return hits >= Math.min(2, words.length);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  if (req.method !== "POST") return json({ success: false, candidates: [], error: "Método não permitido." }, 405);

  try {
    const b = await req.json().catch(() => ({}));
    const productName = String(b?.productName || "").trim();
    const productImage = String(b?.productImage || "").trim();
    const inputAds = Array.isArray(b?.adUrls) ? b.adUrls.map(String) : [];
    const wanted = Array.isArray(b?.platforms) && b.platforms.length ? b.platforms.map(String) : MARKETS.map(x => x.name);
    const diagnostics: Record<string, any> = {};
    for (const p of wanted) diagnostics[p] = { status: "nao_iniciado", adsInspected: 0, videosFound: 0 };

    if (!productName && !inputAds.length && !productImage)
      return json({ success: false, candidates: [], error: "Informe produto, imagem ou anúncio.", diagnostics }, 400);

    const candidates: Candidate[] = [];
    const seen = new Set<string>();
    const add = (c: Candidate) => {
      if (!c.videoUrl || isBadPage(c.videoUrl) || isBadPage(c.adUrl) || /\.m3u8/i.test(c.videoUrl)) return;
      if (!wanted.includes(c.platform)) return;
      if (!relevant(c.title, productName)) return;
      const k = c.platform + "|" + c.videoUrl;
      if (seen.has(k)) return;
      seen.add(k); candidates.push(c);
      diagnostics[c.platform] ||= { status: "processando", adsInspected: 0, videosFound: 0 };
      diagnostics[c.platform].videosFound++;
    };

    // 1) Primeiro: anúncios reais que o catálogo já conhece.
    for (const raw of [...new Set(inputAds)]) {
      const ad = cleanUrl(raw);
      if (!ad || isBadPage(ad)) continue;
      const p = platformOf(ad);
      if (!wanted.includes(p)) continue;
      diagnostics[p] ||= { status: "processando", adsInspected: 0, videosFound: 0 };
      diagnostics[p].adsInspected++;
      if (/\.(mp4|webm|mov)(?:[?#]|$)/i.test(ad)) {
        add({ platform:p, title:productName, adUrl:ad, videoUrl:ad, thumbnail:productImage, duration:"10 segundos", notes:"Vídeo direto encontrado no link do catálogo." });
        continue;
      }
      const r = await fetchText(ad);
      if (!r.ok) { diagnostics[p].status = "http_" + r.status; continue; }
      const meta = titleAndImage(r.text);
      for (const v of videoUrls(r.text, r.url))
        add({ platform:p, title:meta.title || productName, adUrl:ad, videoUrl:v, thumbnail:meta.thumbnail || productImage, duration:"10 segundos", notes:"Vídeo detectado no anúncio." });
      diagnostics[p].status = candidates.some(x=>x.platform===p) ? "video_encontrado" : "anuncio_inspecionado_sem_video";
    }

    // 2) Busca visual: Google Lens por URL da imagem, depois abrir os anúncios de marketplace encontrados.
    if (productImage && candidates.length < 20) {
      const lens = await fetchText("https://lens.google.com/uploadbyurl?url=" + encodeURIComponent(productImage), 9000);
      diagnostics["Imagem"] = { status: lens.ok ? "lens_consultado" : "lens_indisponivel", httpStatus:lens.status, adsInspected:0, videosFound:0 };
      if (lens.ok) {
        const links = marketplaceLinks(lens.text, lens.url);
        for (const ad of links.slice(0, 24)) {
          const p = platformOf(ad);
          if (!wanted.includes(p) || candidates.length >= 20) continue;
          diagnostics[p] ||= { status:"processando", adsInspected:0, videosFound:0 };
          diagnostics[p].adsInspected++;
          const r = await fetchText(ad);
          if (!r.ok) continue;
          const meta = titleAndImage(r.text);
          for (const v of videoUrls(r.text, r.url))
            add({ platform:p, title:meta.title || productName, adUrl:ad, videoUrl:v, thumbnail:meta.thumbnail || productImage, duration:"10 segundos", notes:"Anúncio encontrado a partir da busca visual por imagem." });
        }
      }
    }

    // 3) Busca textual complementar nos mecanismos de busca.
    if (candidates.length < 20 && productName) {
      const queries = [
        `site:shopee.com.br "${productName}"`,
        `site:br.shein.com "${productName}"`,
        `site:shop.tiktok.com "${productName}"`,
        `site:tiktok.com "${productName}"`,
        `site:mercadolivre.com.br "${productName}"`,
      ];
      for (const q of queries) {
        const p = platformOf(q);
        const engine = await fetchText("https://www.google.com/search?q=" + encodeURIComponent(q), 5000);
        const links = engine.ok ? marketplaceLinks(engine.text, engine.url) : [];
        for (const ad of links.slice(0, 10)) {
          const mp = platformOf(ad);
          if (!wanted.includes(mp) || candidates.length >= 20) continue;
          diagnostics[mp] ||= {status:"processando",adsInspected:0,videosFound:0};
          diagnostics[mp].adsInspected++;
          const r = await fetchText(ad);
          if (!r.ok) continue;
          const meta = titleAndImage(r.text);
          for (const v of videoUrls(r.text, r.url))
            add({platform:mp,title:meta.title || productName,adUrl:ad,videoUrl:v,thumbnail:meta.thumbnail || productImage,duration:"10 segundos",notes:"Anúncio encontrado por busca complementar."});
        }
      }
    }

    return json({
      success: true,
      productName,
      candidates: candidates.slice(0, Number(b?.maxCandidates) || 20),
      matchedImage: Boolean(productImage),
      diagnostics,
      checkedCount: Object.values(diagnostics).reduce((n:any,d:any)=>n+(d.adsInspected||0),0),
      note: "Busca prioriza anúncios já conhecidos, tenta correspondência visual pela imagem e usa busca textual como complemento. Só retorna URLs de vídeo detectadas."
    });
  } catch (e) {
    return json({ success:false, candidates:[], error:e instanceof Error?e.message:"Falha na busca.", diagnostics:{} }, 200);
  }
});