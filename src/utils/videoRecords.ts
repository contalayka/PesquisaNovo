import { getSupabaseClient } from './supabase';

export type CloudVideoRecord = {
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
};

type VideoRow = {
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
};

export async function fetchVideoRecords(): Promise<Record<string, CloudVideoRecord>> {
  const client = getSupabaseClient();
  if (!client) return {};

  try {
    const { data, error } = await client
      .from('video_records')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('[Video records] Falha ao carregar registros:', error.message);
      return {};
    }

    const map: Record<string, CloudVideoRecord> = {};
    for (const row of (data || []) as VideoRow[]) {
      if (!row.product_key) continue;
      map[row.product_key] = {
        productKey: row.product_key,
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
      };
    }
    return map;
  } catch (error) {
    console.warn('[Video records] Exceção ao carregar registros:', error);
    return {};
  }
}

export async function saveVideoRecord(record: CloudVideoRecord): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client || !record.productKey) return { error: null };

  try {
    const { error } = await client.from('video_records').upsert({
      product_key: record.productKey,
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
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_key' });

    if (error) {
      console.warn('[Video records] Falha ao salvar:', error.message);
      return { error: error.message };
    }
    return { error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao salvar registro de vídeo';
    console.warn('[Video records] Exceção ao salvar:', message);
    return { error: message };
  }
}

export async function saveVideoRecords(records: Record<string, CloudVideoRecord>): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const values = Object.values(records);
  if (!client || values.length === 0) return { error: null };

  try {
    const rows = values.map(record => ({
      product_key: record.productKey,
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
      updated_at: new Date().toISOString(),
    }));

    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await client.from('video_records').upsert(rows.slice(i, i + 100), { onConflict: 'product_key' });
      if (error) return { error: error.message };
    }
    return { error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao sincronizar vídeos';
    return { error: message };
  }
}
