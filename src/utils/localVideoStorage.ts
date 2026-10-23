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
 * Upload resiliente de vídeos:
 * 1. Tenta upload no Supabase Storage compartilhado na nuvem (se configurado).
 * 2. Se o Supabase falhar (bucket não criado, sem permissão, offline ou erro de rede),
 *    ativa automaticamente fallback seguro para o IndexedDB local do navegador.
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
  storageType: 'supabase' | 'local';
  isLocalFallback?: boolean;
}> {
  const meta = await extractVideoMetadata(file);
  const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
  const fileSizeFormatted = file.size > 1024 * 1024
    ? `${sizeMb} MB`
    : `${Math.round(file.size / 1024)} KB`;

  const localId = crypto.randomUUID();
  const client = getSupabaseClient();

  // 1. Tentar upload na nuvem (Supabase Storage) se o cliente estiver disponível
  if (client) {
    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeProductId = String(productId || 'sem-produto').replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${safeProductId}/${Date.now()}_${localId}_${sanitizedName}`;
      const bucketName = 'product-videos';

      // Tenta criar o bucket se não existir e as permissões permitirem
      try {
        const { data: buckets } = await client.storage.listBuckets();
        const exists = buckets?.some((b) => b.name === bucketName || b.id === bucketName);
        if (!exists) {
          await client.storage.createBucket(bucketName, {
            public: true,
            fileSizeLimit: 52428800 // 50MB
          });
        }
      } catch {
        // Ignora erro de verificação prévia e tenta o upload direto
      }

      const { data, error } = await client.storage.from(bucketName).upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'video/mp4'
      });

      if (!error && data?.path) {
        const { data: pubData } = client.storage.from(bucketName).getPublicUrl(data.path);
        if (pubData?.publicUrl) {
          return {
            videoUrl: pubData.publicUrl,
            thumbnail: meta.thumbnail,
            duration: meta.durationFormatted,
            fileName: file.name,
            fileSizeFormatted,
            storageType: 'supabase',
            isLocalFallback: false
          };
        }
      } else {
        console.warn(
          '[VideoStorage] Supabase Storage não disponível (' +
            (error?.message || 'sem resposta') +
            '). Salvando no IndexedDB local seguro do navegador.'
        );
      }
    } catch (supaErr) {
      console.warn('[VideoStorage] Falha ao enviar para Supabase, ativando fallback local:', supaErr);
    }
  }

  // 2. FALLBACK SEGURO: Armazenamento em IndexedDB local do navegador
  // Salva o arquivo binário completo e gera um identificador permanente local_video:<id>
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

export const SUPABASE_VIDEO_BUCKET_SQL = `-- Script para criar e liberar o bucket de vídeos no Supabase
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-videos',
  'product-videos',
  true,
  52428800,
  array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read product videos" on storage.objects;
create policy "Public read product videos"
  on storage.objects for select
  using (bucket_id = 'product-videos');

drop policy if exists "Anon upload product videos" on storage.objects;
create policy "Anon upload product videos"
  on storage.objects for insert
  with check (bucket_id = 'product-videos');

drop policy if exists "Anon update product videos" on storage.objects;
create policy "Anon update product videos"
  on storage.objects for update
  using (bucket_id = 'product-videos')
  with check (bucket_id = 'product-videos');

drop policy if exists "Anon delete product videos" on storage.objects;
create policy "Anon delete product videos"
  on storage.objects for delete
  using (bucket_id = 'product-videos');
`;

export async function checkSupabaseVideoBucket(): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, message: 'Supabase não está configurado.' };
  }
  try {
    const probePath = `_probe_${Date.now()}.txt`;
    const probeBlob = new Blob(['probe'], { type: 'text/plain' });
    const { data, error } = await client.storage
      .from('product-videos')
      .upload(probePath, probeBlob, { upsert: true });

    if (error) {
      const msg = error.message || '';
      if (
        msg.toLowerCase().includes('bucket') ||
        msg.toLowerCase().includes('not found') ||
        (error as any).code === 'NoSuchBucket'
      ) {
        return {
          ok: false,
          message:
            'O bucket "product-videos" não existe no Supabase. Crie o bucket como público ou execute o SQL no editor.'
        };
      }
      return { ok: false, message: `Aviso no bucket: ${msg}` };
    }

    if (data?.path) {
      void client.storage.from('product-videos').remove([data.path]);
    }

    return { ok: true, message: 'Bucket "product-videos" ativo e pronto para salvar na nuvem!' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Falha ao testar bucket' };
  }
}

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

export async function uploadLocalVideoBlobToSupabase(
  blob: Blob,
  fileName: string,
  productId?: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Supabase não configurado' };

  try {
    const sanitizedName = (fileName || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeProductId = String(productId || 'sem-produto').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${safeProductId}/${Date.now()}_${crypto.randomUUID()}_${sanitizedName}`;
    const bucketName = 'product-videos';

    const { data, error } = await client.storage.from(bucketName).upload(filePath, blob, {
      cacheControl: '3600',
      upsert: true,
      contentType: blob.type || 'video/mp4'
    });

    if (error || !data?.path) {
      return { success: false, error: error?.message || 'Falha no upload' };
    }

    const { data: pubData } = client.storage.from(bucketName).getPublicUrl(data.path);
    if (!pubData?.publicUrl) {
      return { success: false, error: 'Supabase não retornou URL pública' };
    }

    return { success: true, publicUrl: pubData.publicUrl };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
