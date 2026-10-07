import { getSupabaseClient } from './supabase';

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
export function extractVideoMetadata(file: File | Blob): Promise<{ thumbnail: string; duration: number; durationFormatted: string }> {
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
        // Seek para 1s ou 25% da duração para pegar frame significativo
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

      // Se o arquivo for menor que 8MB, podemos gerar também dataUrl como redundância
      const isSmall = file.size < 8 * 1024 * 1024;
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
        // Criar ObjectURL reutilizável
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
 * Faz o upload de um arquivo de vídeo selecionado do computador.
 * 1. Extrai metadados (thumbnail e duração real)
 * 2. Tenta fazer upload para Supabase Storage se disponível
 * 3. Se não houver storage configurado, salva com segurança no IndexedDB
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
  storageType: 'supabase' | 'indexeddb';
}> {
  // 1. Extrair thumbnail e duração
  const meta = await extractVideoMetadata(file);

  // Formatar tamanho em MB/KB
  const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
  const fileSizeFormatted = file.size > 1024 * 1024 ? `${sizeMb} MB` : `${Math.round(file.size / 1024)} KB`;

  // 2. Tentar upload no Supabase Storage
  const client = getSupabaseClient();
  if (client) {
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `videos/${productId ? productId + '_' : ''}${Date.now()}_${sanitizedName}`;

      // Tenta bucket 'product-videos' ou 'videos'
      for (const bucketName of ['product-videos', 'videos', 'public']) {
        const { data, error } = await client.storage.from(bucketName).upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

        if (!error && data) {
          const { data: pubData } = client.storage.from(bucketName).getPublicUrl(filePath);
          if (pubData?.publicUrl) {
            return {
              videoUrl: pubData.publicUrl,
              thumbnail: meta.thumbnail,
              duration: meta.durationFormatted,
              fileName: file.name,
              fileSizeFormatted,
              storageType: 'supabase'
            };
          }
        }
      }
    } catch (e) {
      console.warn('[VideoStorage] Supabase Storage não acessível ou sem bucket, utilizando IndexedDB local:', e);
    }
  }

  // 3. Fallback: IndexedDB local ultra-rápido com persistência no navegador
  const localId = `video_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const localRef = await saveLocalVideoToIndexedDb(localId, file, file.name, meta.thumbnail, meta.durationFormatted);

  return {
    videoUrl: localRef,
    thumbnail: meta.thumbnail,
    duration: meta.durationFormatted,
    fileName: file.name,
    fileSizeFormatted,
    storageType: 'indexeddb'
  };
}
