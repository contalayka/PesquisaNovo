import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';
import fs from 'fs';
import { scanMarketplaces } from './src/utils/marketplaceScannerCore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function cloudflareVideoPlugin() {
  const videoDir = path.resolve(__dirname, 'tmp/videos');
  if (!fs.existsSync(videoDir)) {
    fs.mkdirSync(videoDir, { recursive: true });
  }

  return {
    name: 'cloudflare-video-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        // GET /api/upload-video?check=1
        if (req.url?.startsWith('/api/upload-video') && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: true,
              provider: 'Cloudflare R2 (Simulado / Pages)',
              message: 'Armazenamento de vídeos Cloudflare R2 pronto e ativo!',
              hasPublicUrl: true
            })
          );
          return;
        }

        // POST /api/upload-video
        if (req.url?.startsWith('/api/upload-video') && req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const buffer = Buffer.concat(chunks);
              const rawFileName = req.headers['x-file-name']
                ? decodeURIComponent(String(req.headers['x-file-name']))
                : 'video.mp4';
              const cleanFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
              const key = `${Date.now()}_${cleanFileName}`;
              const filePath = path.join(videoDir, key);
              fs.writeFileSync(filePath, buffer);

              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: true,
                  provider: 'Cloudflare R2',
                  key: `videos/${key}`,
                  videoUrl: `/api/video?key=videos/${key}`,
                  fileName: rawFileName,
                  sizeBytes: buffer.length
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Erro no upload' }));
            }
          });
          return;
        }

        // GET /api/video?key=...
        if (req.url?.startsWith('/api/video') && req.method === 'GET') {
          const urlObj = new URL(req.url, 'http://localhost:3000');
          const fullKey = urlObj.searchParams.get('key') || '';
          const baseKey = path.basename(fullKey);
          const filePath = path.join(videoDir, baseKey);

          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('Vídeo não encontrado');
            return;
          }

          const stat = fs.statSync(filePath);
          const fileSize = stat.size;
          const range = req.headers.range;

          if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = end - start + 1;
            const file = fs.createReadStream(filePath, { start, end });
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': 'video/mp4'
            });
            file.pipe(res);
          } else {
            res.writeHead(200, {
              'Content-Length': fileSize,
              'Content-Type': 'video/mp4',
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'public, max-age=31536000'
            });
            fs.createReadStream(filePath).pipe(res);
          }
          return;
        }

        next();
      });
    }
  };
}

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
              const result = await scanMarketplaces({
                productName: body.productName,
                productImage: body.productImage,
                adUrls: body.adUrls,
                platforms: body.platforms
              });
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err?.message || 'Invalid request', candidates: [], checkedCount: 0 }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

function imageProxyPlugin() {
  const MAX_BYTES = 15 * 1024 * 1024;
  const TRANSFORM_PARAMS = ['width', 'height', 'resize', 'quality', 'format'];

  const isBlockedHost = (hostname: string): boolean => {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return true;
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.localhost') ||
      host.includes(':')
    ) {
      return true;
    }
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
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
  };

  const validateUrl = (raw: string): URL | null => {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      if (u.username || u.password) return null;
      if (isBlockedHost(u.hostname)) return null;
      return u;
    } catch {
      return null;
    }
  };

  const deriveObjectUrl = (parsed: URL): string | null => {
    if (!parsed.pathname.includes('/storage/v1/render/image/')) return null;
    const copy = new URL(parsed.toString());
    copy.pathname = copy.pathname.replace('/storage/v1/render/image/', '/storage/v1/object/');
    for (const p of TRANSFORM_PARAMS) copy.searchParams.delete(p);
    return copy.toString();
  };

  return {
    name: 'image-proxy-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/image-proxy') || req.method !== 'GET') {
          next();
          return;
        }

        const reqUrl = new URL(req.url, 'http://localhost:3000');
        if (reqUrl.searchParams.get('check') === '1') {
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: true,
              provider: 'Preview / Dev Server',
              message: 'Proxy de imagens ativo no servidor de desenvolvimento.',
            })
          );
          return;
        }

        const target = reqUrl.searchParams.get('url') || '';
        const parsed = validateUrl(target);
        if (!parsed) {
          res.statusCode = 400;
          res.end('URL de imagem inválida ou não permitida.');
          return;
        }

        const attempts: string[] = [];
        const directObj = deriveObjectUrl(parsed);
        if (directObj) attempts.push(directObj);
        attempts.push(parsed.toString());

        for (const candidateUrl of attempts) {
          try {
            const upstream = await fetch(candidateUrl, {
              method: 'GET',
              redirect: 'follow',
              headers: {
                Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                'User-Agent': 'Mozilla/5.0 (compatible; CatalogImageProxy/1.0)',
              },
            });
            if (!upstream.ok) continue;

            const finalUrl = validateUrl(upstream.url || candidateUrl);
            if (!finalUrl) continue;

            const ct = (upstream.headers.get('content-type') || '').toLowerCase();
            const isImg =
              ct.startsWith('image/') ||
              (ct === 'application/octet-stream' &&
                /\.(jpe?g|png|webp|gif|avif|svg|bmp|ico)(\?|$)/i.test(finalUrl.toString()));
            if (!isImg) continue;

            const buf = Buffer.from(await upstream.arrayBuffer());
            if (buf.length > MAX_BYTES) continue;

            res.writeHead(200, {
              'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
              'Content-Length': buf.length,
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*',
              'X-Content-Type-Options': 'nosniff',
            });
            res.end(buf);
            return;
          } catch {
            // Try next candidate
          }
        }

        res.statusCode = 502;
        res.end('Não foi possível carregar a imagem de origem.');
      });
    },
  };
}

function cloudflareImagePlugin() {
  const imageDir = path.resolve(__dirname, 'tmp/images');
  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
  }

  return {
    name: 'cloudflare-image-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url?.startsWith('/api/upload-image') && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: true,
              provider: 'Cloudflare R2 (Simulado / Pages)',
              message: 'Armazenamento de imagens Cloudflare R2 pronto e ativo!',
              hasPublicUrl: true,
            })
          );
          return;
        }

        if (req.url?.startsWith('/api/upload-image') && req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            try {
              const rawBuf = Buffer.concat(chunks);
              const contentType = String(req.headers['content-type'] || '');
              const rawFileName = req.headers['x-file-name']
                ? decodeURIComponent(String(req.headers['x-file-name']))
                : 'produto.jpg';
              const cleanFileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, '_');

              let fileData = rawBuf;
              if (contentType.includes('multipart/form-data')) {
                const boundaryMatch = contentType.match(/boundary=([^\s;]+)/i);
                if (boundaryMatch) {
                  const boundary = `--${boundaryMatch[1]}`;
                  const headerEnd = rawBuf.indexOf(Buffer.from('\r\n\r\n'));
                  const nextBoundary = rawBuf.lastIndexOf(Buffer.from(`\r\n${boundary}`));
                  if (headerEnd !== -1 && nextBoundary > headerEnd + 4) {
                    fileData = rawBuf.subarray(headerEnd + 4, nextBoundary);
                  }
                }
              }

              const key = `${Date.now()}_${cleanFileName}`;
              fs.writeFileSync(path.join(imageDir, key), fileData);

              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  success: true,
                  provider: 'Cloudflare R2',
                  key: `images/${key}`,
                  imageUrl: `/api/image?key=images/${key}`,
                  fileName: rawFileName,
                  sizeBytes: fileData.length,
                })
              );
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Erro no upload de imagem' }));
            }
          });
          return;
        }

        if (req.url?.startsWith('/api/image?') && req.method === 'GET') {
          const urlObj = new URL(req.url, 'http://localhost:3000');
          const fullKey = urlObj.searchParams.get('key') || '';
          const baseKey = path.basename(fullKey);
          const filePath = path.join(imageDir, baseKey);

          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('Imagem não encontrada');
            return;
          }

          const ext = path.extname(baseKey).toLowerCase();
          const mimeMap: Record<string, string> = {
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.avif': 'image/avif',
          };
          res.writeHead(200, {
            'Content-Type': mimeMap[ext] || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000',
          });
          fs.createReadStream(filePath).pipe(res);
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      cloudflareVideoPlugin(),
      cloudflareImagePlugin(),
      marketplaceScanPlugin(),
      imageProxyPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
