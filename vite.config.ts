import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';
import { scanMarketplaces } from './src/utils/marketplaceScannerCore';

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
