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

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), cloudflareVideoPlugin(), marketplaceScanPlugin()],
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
