import { getSupabaseClient } from './supabase';

export type CloudVideoRecord = {
  id?: string;
  productKey: string;
  productId?: string;
  productName?: string;
  productSku?: string;
  productBarcode?: string;
  productImage?: string;
  url: string;
  videoUrl?: string;
  platform: string;
  duration: string;
  notes?: string;
  downloaded?: boolean;
};

type VideoRow = {
  id: string;
  product_key: string;
  product_id: string | null;
  product_name: string | null;
  product_sku: string | null;
  product_barcode: string | null;
  product_image: string | null;
  ad_url: string | null;
  video_url: string | null;
  platform: string | null;
  duration: string | null;
  notes: string | null;
  downloaded: boolean | null;
  created_at?: string;
  updated_at?: string;
};

export function ensureUuid(id?: string | null): string {
  if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  return crypto.randomUUID();
}

const normalize = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

export async function fetchVideoRecords(): Promise<Record<string, CloudVideoRecord[]>> {
  const client = getSupabaseClient();
  if (!client) return {};
  try {
    const { data, error } = await client
      .from('video_records')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('[Video records] Falha ao carregar registros do Supabase:', error.message);
      return {};
    }

    const map: Record<string, CloudVideoRecord[]> = {};

    for (const row of (data || []) as VideoRow[]) {
      const record: CloudVideoRecord = {
        id: row.id,
        productKey: row.product_key || (row.product_id ? 'product:id:' + row.product_id : ''),
        productId: row.product_id || undefined,
        productName: row.product_name || undefined,
        productSku: row.product_sku || undefined,
        productBarcode: row.product_barcode || undefined,
        productImage: row.product_image || undefined,
        url: row.ad_url || '',
        videoUrl: row.video_url || undefined,
        platform: row.platform || 'Shopee',
        duration: row.duration || '10 segundos',
        notes: row.notes || '',
        downloaded: !!row.downloaded,
      };

      // 1. Index under product_key
      if (row.product_key) {
        (map[row.product_key] ||= []).push(record);
      }

      // 2. Index under product_id (e.g. '10', '108')
      if (row.product_id) {
        (map[row.product_id] ||= []).push(record);
        (map['id:' + row.product_id] ||= []).push(record);
      }

      // 3. Index under normalized name
      if (row.product_name) {
        const norm = normalize(row.product_name);
        (map['name:' + norm] ||= []).push(record);
        (map['product:name:' + norm] ||= []).push(record);
      }

      // 4. Index under SKU if available
      if (row.product_sku) {
        const normSku = normalize(row.product_sku);
        (map['sku:' + normSku] ||= []).push(record);
        (map['product:sku:' + normSku] ||= []).push(record);
      }
    }

    return map;
  } catch (error) {
    console.warn('[Video records] Exceção ao carregar registros:', error);
    return {};
  }
}

export async function saveVideoRecord(record: CloudVideoRecord): Promise<{ error: string | null; record?: CloudVideoRecord }> {
  const client = getSupabaseClient();
  if (!client) return { error: 'Cliente Supabase não configurado.' };
  try {
    const effectiveKey = record.productKey || (record.productId ? 'product:id:' + record.productId : 'product:' + Date.now());
    let targetId = record.id;

    // Verificar se já existe um registro com a mesma chave e URL de vídeo para evitar violação de unique constraint
    if (record.videoUrl) {
      const { data: existing } = await client
        .from('video_records')
        .select('id')
        .eq('product_key', effectiveKey)
        .eq('video_url', record.videoUrl)
        .limit(1);

      if (existing && existing.length > 0 && existing[0].id) {
        targetId = existing[0].id;
      }
    }

    const finalId = ensureUuid(targetId);
    const payload = {
      id: finalId,
      product_key: effectiveKey,
      product_id: record.productId || null,
      product_name: record.productName || null,
      product_sku: record.productSku || null,
      product_barcode: record.productBarcode || null,
      product_image: record.productImage || null,
      ad_url: record.url || null,
      video_url: record.videoUrl || null,
      platform: record.platform || 'Shopee',
      duration: record.duration || '10 segundos',
      notes: record.notes || null,
      downloaded: !!record.downloaded,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from('video_records').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.error('[Video records] Falha ao salvar no Supabase:', error.message);
      return { error: error.message };
    }
    return { error: null, record: { ...record, id: finalId } };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Falha ao salvar registro de vídeo';
    console.error('[Video records] Exceção ao salvar:', error);
    return { error: msg };
  }
}

export async function deleteVideoRecord(id: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client || !id) return { error: null };
  try {
    const { error } = await client.from('video_records').delete().eq('id', id);
    if (error) console.error('[Video records] Falha ao excluir:', error.message);
    return { error: error?.message || null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Falha ao excluir vídeo' };
  }
}

export async function saveVideoRecords(records: CloudVideoRecord[]): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client || records.length === 0) return { error: null };
  try {
    for (const record of records) {
      await saveVideoRecord(record);
    }
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Falha ao sincronizar vídeos' };
  }
}

export async function markVideoDownloaded(id: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client || !id) return { error: null };
  try {
    const { error } = await client
      .from('video_records')
      .update({ downloaded: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    return { error: error?.message || null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Falha ao marcar vídeo como baixado' };
  }
}
