/**
 * Utilitário de Armazenamento e Sincronização de Vídeos na Nuvem CLOUDFLARE (Cloudflare R2 / Stream)
 */

export interface CloudflareStorageConfig {
  mode: 'pages_binding' | 'custom_r2' | 'stream';
  r2PublicUrl?: string; // Ex: https://pub-xxxxxxxx.r2.dev ou https://videos.meudominio.com.br
  accountId?: string;
  bucketName?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

const CLOUDFLARE_STORAGE_KEY = 'marketpreco_cloudflare_config_v1';

export function getCloudflareConfig(): CloudflareStorageConfig {
  if (typeof window === 'undefined') {
    return { mode: 'pages_binding' };
  }
  try {
    const raw = localStorage.getItem(CLOUDFLARE_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return {
    mode: 'pages_binding',
    bucketName: 'product-videos'
  };
}

export function saveCloudflareConfig(cfg: CloudflareStorageConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CLOUDFLARE_STORAGE_KEY, JSON.stringify(cfg));
  } catch (err) {
    console.warn('[CloudflareStorage] Erro ao salvar config local:', err);
  }
}

/**
 * Verifica se a URL do vídeo está hospedada na nuvem Cloudflare (R2, Stream ou Worker)
 */
export function isCloudflareVideoUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return (
    lower.startsWith('/api/video') ||
    lower.startsWith('/api/video-result') ||
    lower.includes('.r2.dev') ||
    lower.includes('cloudflare') ||
    lower.includes('cloudflarestream.com') ||
    lower.includes('/cdn-cgi/')
  );
}

/**
 * Testa a conexão com o endpoint de upload e Cloudflare R2
 */
export async function checkCloudflareStorage(): Promise<{
  ok: boolean;
  provider: string;
  message: string;
  details?: string;
}> {
  try {
    const res = await fetch('/api/upload-video?check=1', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: true,
        provider: data.provider || 'Cloudflare R2',
        message: data.message || 'Armazenamento Cloudflare R2 conectado com sucesso!',
        details: data.hasPublicUrl ? 'URL pública configurada.' : 'Streaming via endpoint /api/video ativo.'
      };
    }

    if (res.status === 404 || res.status === 503) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: false,
        provider: 'Cloudflare R2',
        message: data.message || 'Binding VIDEOS_BUCKET não detectado.',
        details: data.instructions || 'No painel Cloudflare Pages > Configurações > Functions > R2 bucket bindings > Adicione a variável VIDEOS_BUCKET.'
      };
    }

    return {
      ok: false,
      provider: 'Cloudflare',
      message: `Endpoint retornou código HTTP ${res.status}.`
    };
  } catch (err) {
    return {
      ok: false,
      provider: 'Cloudflare',
      message: 'Não foi possível conectar ao endpoint Cloudflare: ' + (err instanceof Error ? err.message : String(err))
    };
  }
}

/**
 * Faz upload do arquivo de vídeo para a Nuvem Cloudflare (R2)
 */
export async function uploadVideoToCloudflare(
  fileOrBlob: File | Blob,
  fileName: string,
  productId?: string
): Promise<{
  success: boolean;
  videoUrl?: string;
  key?: string;
  error?: string;
}> {
  try {
    const formData = new FormData();
    const cleanFile = fileOrBlob instanceof File
      ? fileOrBlob
      : new File([fileOrBlob], fileName, { type: fileOrBlob.type || 'video/mp4' });

    formData.append('file', cleanFile, fileName);
    if (productId) {
      formData.append('productId', productId);
    }

    const res = await fetch('/api/upload-video', {
      method: 'POST',
      body: formData,
      headers: {
        'x-file-name': encodeURIComponent(fileName),
        'x-product-id': encodeURIComponent(productId || 'geral')
      }
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || errData.details || `Erro HTTP ${res.status} no upload para Cloudflare`);
    }

    const data = await res.json();
    if (!data.videoUrl) {
      throw new Error('Servidor Cloudflare não retornou a URL do vídeo.');
    }

    // Se o usuário tiver um domínio R2 público customizado salvo nas configurações
    const cfg = getCloudflareConfig();
    let finalUrl = data.videoUrl;
    if (cfg.r2PublicUrl && data.key) {
      const base = cfg.r2PublicUrl.replace(/\/$/, '');
      finalUrl = `${base}/${data.key}`;
    }

    return {
      success: true,
      videoUrl: finalUrl,
      key: data.key
    };
  } catch (err) {
    console.error('[CloudflareStorage] Erro no upload:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
