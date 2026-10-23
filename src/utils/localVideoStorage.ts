import {
  uploadVideoToCloudflare,
  checkCloudflareStorage,
  isCloudflareVideoUrl,
  CloudflareStorageConfig,
  getCloudflareConfig,
  saveCloudflareConfig
} from './cloudflareStorage';

const DB_NAME = 'marketpreco_video_db_v1';
const STORE_NAME = 'videos';

// Abrir ou inicializar banco IndexedDB
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB não suportado neste ambiente'));
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface LocalVideoEntry {
  id: string;
  name: string;
  size: number;
  type: string;
  blob?: Blob;
  dataUrl?: string;
  thumbnail?: string;
  duration?: string;
  createdAt: string;
}

// In-memory cache de ObjectURLs para evitar múltiplos createObjectURL desnecessários
const objectUrlCache = new Map<string, string>();

/**
 * Extrai metadados do vídeo (duração formatada e thumbnail em alta qualidade)
 */
export function extractVideoMetadata(
  file: File | Blob
): Promise<{ thumbnail: string; duration: number; durationFormatted: string }> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return resolve({ thumbnail: '', duration: 10, durationFormatted: '10 segundos' });
    }

    try {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const url = URL.createObjectURL(file);
      video.src = url;

      let resolved = false;
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }
      };

      video.onloadedmetadata = () => {
        const seekTime = Math.min(1.0, video.duration > 0 ? video.duration / 4 : 0.5);
        video.currentTime = seekTime;
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(video.videoWidth || 640, 640);
          canvas.height = Math.min(video.videoHeight || 360, 360);
          const ctx = canvas.getContext('2d');
          if (ctx && video.videoWidth && video.videoHeight) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumbnail = canvas.toDataURL('image/jpeg', 0.85);
            const dur = Math.round(video.duration || 0);
            const minutes = Math.floor(dur / 60);
            const seconds = dur % 60;
            const durationFormatted = `${minutes > 0 ? minutes + 'm ' : ''}${seconds}s`;
            cleanup();
            resolve({ thumbnail, duration: dur, durationFormatted });
            return;
          }
        } catch (e) {
          console.warn('[VideoStorage] Erro ao extrair thumbnail:', e);
        }
        const dur = Math.round(video.duration || 0);
        cleanup();
        resolve({ thumbnail: '', duration: dur, durationFormatted: `${dur}s` });
      };

      video.onerror = () => {
        cleanup();
        resolve({ thumbnail: '', duration: 10, durationFormatted: '10 segundos' });
      };

      setTimeout(() => {
        if (!resolved) {
          cleanup();
          resolve({ thumbnail: '', duration: 10, durationFormatted: '10 segundos' });
        }
      }, 4000);
    } catch {
      resolve({ thumbnail: '', duration: 10, durationFormatted: '10 segundos' });
    }
  });
}

/**
 * Salva o arquivo de vídeo no IndexedDB do navegador
 */
export async function saveLocalVideoToIndexedDb(
  id: string,
  file: File | Blob,
  fileName: string,
  thumbnail?: string,
  duration?: string
): Promise<string> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const entry: LocalVideoEntry = {
        id,
        name: fileName,
        size: file.size,
        type: file.type || 'video/mp4',
        blob: file,
        thumbnail: thumbnail || '',
        duration: duration || '10 segundos',
        createdAt: new Date().toISOString()
      };

      const putReq = store.put(entry);
      putReq.onsuccess = () => {
        const objUrl = URL.createObjectURL(file);
        objectUrlCache.set(id, objUrl);
        resolve(`local_video:${id}`);
      };
      putReq.onerror = () => reject(putReq.error);
    });
  } catch (err) {
    console.warn('[VideoStorage] Falha ao salvar no IndexedDB, criando objectURL em memória:', err);
    const objUrl = URL.createObjectURL(file);
    objectUrlCache.set(id, objUrl);
    return `local_video:${id}`;
  }
}

/**
 * Recupera URL de reprodução para um vídeo local (via IndexedDB ou cache)
 */
export async function resolveVideoUrl(rawUrl: string): Promise<string> {
  if (!rawUrl) return '';
  if (!rawUrl.startsWith('local_video:')) {
    return rawUrl;
  }

  const id = rawUrl.replace('local_video:', '').trim();
  if (objectUrlCache.has(id)) {
    return objectUrlCache.get(id)!;
  }

  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const res = req.result as LocalVideoEntry | undefined;
        if (res?.blob) {
          const url = URL.createObjectURL(res.blob);
          objectUrlCache.set(id, url);
          resolve(url);
        } else if (res?.dataUrl) {
          resolve(res.dataUrl);
        } else {
          resolve(rawUrl);
        }
      };
      req.onerror = () => resolve(rawUrl);
    });
  } catch {
    return rawUrl;
  }
}

/**
 * Upload resiliente de vídeos:
 * 1. Tenta upload na Nuvem Cloudflare (Cloudflare R2 / Stream / Pages).
 * 2. Se a rede ou o Cloudflare não responderem, ativa automaticamente
 *    o fallback seguro para o IndexedDB local do navegador.
 * O usuário NUNCA fica impedido de salvar e assistir seus vídeos!
 */
export async function uploadLocalVideoFile(
  file: File,
  productId?: string
): Promise<{
  videoUrl: string;
  thumbnail: string;
  duration: string;
  fileName: string;
  fileSizeFormatted: string;
  storageType: 'cloudflare' | 'local';
  isLocalFallback?: boolean;
}> {
  const meta = await extractVideoMetadata(file);
  const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
  const fileSizeFormatted =
    file.size > 1024 * 1024 ? `${sizeMb} MB` : `${Math.round(file.size / 1024)} KB`;

  const localId = crypto.randomUUID();

  // 1. Tentar upload na Nuvem Cloudflare
  try {
    const cfRes = await uploadVideoToCloudflare(file, file.name, productId);
    if (cfRes.success && cfRes.videoUrl) {
      return {
        videoUrl: cfRes.videoUrl,
        thumbnail: meta.thumbnail,
        duration: meta.durationFormatted,
        fileName: file.name,
        fileSizeFormatted,
        storageType: 'cloudflare',
        isLocalFallback: false
      };
    } else {
      console.warn('[VideoStorage] Cloudflare upload não concluiu:', cfRes.error);
    }
  } catch (err) {
    console.warn('[VideoStorage] Falha no upload Cloudflare, ativando fallback local:', err);
  }

  // 2. FALLBACK SEGURO: Armazenamento em IndexedDB local do navegador
  const localUrl = await saveLocalVideoToIndexedDb(
    localId,
    file,
    file.name,
    meta.thumbnail,
    meta.durationFormatted
  );

  return {
    videoUrl: localUrl,
    thumbnail: meta.thumbnail,
    duration: meta.durationFormatted,
    fileName: file.name,
    fileSizeFormatted,
    storageType: 'local',
    isLocalFallback: true
  };
}

/**
 * Recupera o Blob de um vídeo salvo localmente no IndexedDB
 */
export async function getLocalVideoBlob(
  rawUrlOrId: string
): Promise<{ blob: Blob; fileName: string; type: string } | null> {
  const id = rawUrlOrId.replace('local_video:', '').trim();
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const res = req.result as LocalVideoEntry | undefined;
        if (res?.blob) {
          resolve({
            blob: res.blob,
            fileName: res.name || 'video.mp4',
            type: res.type || 'video/mp4'
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Envia um Blob local do IndexedDB diretamente para o Cloudflare R2
 */
export async function uploadLocalVideoBlobToCloudflare(
  blob: Blob,
  fileName: string,
  productId?: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  try {
    const res = await uploadVideoToCloudflare(blob, fileName, productId);
    if (!res.success || !res.videoUrl) {
      return { success: false, error: res.error || 'Falha no envio para Cloudflare' };
    }
    return { success: true, publicUrl: res.videoUrl };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export {
  uploadVideoToCloudflare,
  checkCloudflareStorage,
  isCloudflareVideoUrl,
  getCloudflareConfig,
  saveCloudflareConfig
};
export type { CloudflareStorageConfig };
