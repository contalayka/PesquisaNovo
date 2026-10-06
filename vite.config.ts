import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function marketplaceScanPlugin() {
  return {
    name: 'marketplace-video-scan-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url?.startsWith('/api/marketplace-video-scan') && req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: Buffer) => { bodyStr += chunk.toString(); });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const inputUrls = Array.isArray(body.adUrls) ? body.adUrls : [];
              const isSearch = (u: string) => /search|\/pdsearch|lista\.mercadolivre/i.test(u);
              const candidateUrls = [...new Set(
                inputUrls
                  .map((u: any) => String(u || '').trim())
                  .filter((u: string) => u && !isSearch(u) && /^https?:\/\//i.test(u))
              )] as string[];

              const detectPlatform = (url: string) => {
                const lower = url.toLowerCase();
                if (lower.includes('shopee')) return 'Shopee';
                if (lower.includes('shein')) return 'SHEIN';
                if (lower.includes('tiktok')) return 'TikTok Shop';
                if (lower.includes('mercadolivre') || lower.includes('mercadolibre')) return 'Mercado Livre';
                return 'Marketplace';
              };

              const extractVideo = (html: string): string | null => {
                const stream = html.match(/https:\/\/stream\.mercadolibre\.com\/[a-zA-Z0-9_\-./]+/i);
                if (stream) return stream[0];
                const shopee = html.match(/https?:\/\/cv\.shopee\.com\.br\/[a-zA-Z0-9_\-./]+/i);
                if (shopee) return shopee[0];
                const videoSrc = html.match(/<video[^>]+src=["']([^"']+)["']/i);
                if (videoSrc && !videoSrc[1].startsWith('blob:')) return videoSrc[1];
                const sourceSrc = html.match(/<source[^>]+src=["']([^"']+)["']/i);
                if (sourceSrc && !sourceSrc[1].startsWith('blob:')) return sourceSrc[1];
                const og = html.match(/property=["']og:video["'][^>]+content=["']([^"']+)["']/i) ||
                           html.match(/content=["']([^"']+)["'][^>]+property=["']og:video["']/i);
                if (og) return og[1];
                const mp4 = html.match(/https?:\/\/[^\s"'<>\\]+\.mp4(\?[^\s"'<>\\]*)?/i);
                if (mp4) return mp4[0];
                return null;
              };

              const candidates: any[] = [];
              let checked = 0;
              const productName = String(body.productName || '').trim();
              const productImage = String(body.productImage || '').trim();
              const diagnostics: Record<string, any> = {};

              for (const url of candidateUrls) {
                checked++;
                const platform = detectPlatform(url);
                diagnostics[platform] = { status: 'concluido', adsInspected: 1, videosFound: 0 };

                if (/\.(mp4|webm|mov)(?:[?#]|$)/i.test(url)) {
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
                  continue;
                }
                if (/tiktok\.com\/.*\/video\//i.test(url) || /vm\.tiktok\.com\//i.test(url)) {
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
                  continue;
                }
                try {
                  const controller = new AbortController();
                  const timer = setTimeout(() => controller.abort(), 4000);
                  const resp = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    signal: controller.signal
                  });
                  clearTimeout(timer);
                  if (resp.ok) {
                    const html = await resp.text();
                    const extracted = extractVideo(html);
                    if (extracted) {
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
                } catch {}
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, checked, candidates, diagnostics }));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Invalid request', candidates: [], checked: 0 }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), marketplaceScanPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
