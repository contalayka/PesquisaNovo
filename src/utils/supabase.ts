import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Product, ResearchRecord, ProductStatus, SupabaseConfig } from '../types';

const CONFIG_STORAGE_KEY = 'pesquisa_produtos_supabase_config_v1';

export const SUPABASE_MIGRATION_FIX_BIGINT_SQL = `-- ============================================================
-- SCRIPT DE CORREÇÃO: Converter IDs de BIGINT para TEXT
-- Execute no SQL Editor do Supabase (https://supabase.com/dashboard)
-- Corrige o erro: invalid input syntax for type bigint / COALESCE
-- ============================================================

-- 1. Desvincular temporariamente a chave estrangeira (se existir)
alter table if exists research_records drop constraint if exists research_records_product_id_fkey;

-- 2. Converter ID da tabela de produtos para TEXT (permite códigos com hífen como "1790007148-169", SKUs, etc.)
alter table if exists products alter column id type text using id::text;

-- 3. Converter product_id da tabela research_records para TEXT
alter table if exists research_records alter column product_id type text using product_id::text;

-- 4. Remover sequence/identity padrão numérica antiga na coluna id (evita erro de COALESCE/bigint no PostgREST)
alter table if exists products alter column id drop default;
alter table if exists products alter column id drop identity if exists;
alter table if exists research_records alter column product_id drop default;
alter table if exists research_records alter column product_id drop identity if exists;

-- 5. Converter coluna id em research_records apenas se ela existir na tabela
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'research_records' and column_name = 'id'
  ) then
    execute 'alter table research_records alter column id type text using id::text';
    execute 'alter table research_records alter column id drop default';
    execute 'alter table research_records alter column id drop identity if exists';
  end if;
end $$;

-- 6. Garantir que a coluna status existe nas tabelas
alter table if exists products add column if not exists status text default 'Pendente';
alter table if exists research_records add column if not exists status text default 'Pendente';

-- 7. Recriar a chave estrangeira com integridade e cascata
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'research_records_product_id_fkey'
  ) then
    alter table research_records
      add constraint research_records_product_id_fkey
      foreign key (product_id) references products(id) on delete cascade;
  end if;
end $$;

-- 8. Recarregar o cache de schema do PostgREST imediatamente
notify pgrst, 'reload schema';
`;

export const SUPABASE_SETUP_SQL = `-- EXECUTE ESTE SCRIPT NO SQL EDITOR DO SEU SUPABASE:

-- 0. Se suas tabelas foram criadas anteriormente com ID numérico (bigint), converte com segurança para TEXT:
alter table if exists research_records drop constraint if exists research_records_product_id_fkey;
alter table if exists products alter column id type text using id::text;
alter table if exists research_records alter column product_id type text using product_id::text;

alter table if exists products alter column id drop default;
alter table if exists products alter column id drop identity if exists;
alter table if exists research_records alter column product_id drop default;
alter table if exists research_records alter column product_id drop identity if exists;

do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'research_records' and column_name = 'id'
  ) then
    execute 'alter table research_records alter column id type text using id::text';
    execute 'alter table research_records alter column id drop default';
    execute 'alter table research_records alter column id drop identity if exists';
  end if;
end $$;

-- 1. Criar tabela de produtos (ou adicionar coluna status se já existir)
create table if not exists products (
  id text primary key,
  name text not null,
  cost numeric,
  available boolean default true,
  image text,
  status text default 'Pendente',
  is_new boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Garantir que a coluna status existe na tabela products
alter table products add column if not exists status text default 'Pendente';

-- 2. Criar tabela de pesquisas / opções encontradas
create table if not exists research_records (
  id text primary key,
  product_id text references products(id) on delete cascade,
  found_name text,
  platform text,
  store text,
  price numeric,
  url text,
  status text default 'Pendente',
  confidence text default 'Média',
  note text,
  researched_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Garantir que a coluna status existe na tabela research_records
alter table research_records add column if not exists status text default 'Pendente';

-- Garantir integridade da chave estrangeira
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'research_records_product_id_fkey'
  ) then
    alter table research_records
      add constraint research_records_product_id_fkey
      foreign key (product_id) references products(id) on delete cascade;
  end if;
end $$;

-- 3. Habilitar Row Level Security e liberar acesso público (anon key)
alter table products enable row level security;
alter table research_records enable row level security;

-- Políticas de acesso público para chave Anon
create policy if not exists "Anon produtos select" on products for select using (true);
create policy if not exists "Anon produtos insert" on products for insert with check (true);
create policy if not exists "Anon produtos update" on products for update using (true);
create policy if not exists "Anon produtos delete" on products for delete using (true);

create policy if not exists "Anon pesquisas select" on research_records for select using (true);
create policy if not exists "Anon pesquisas insert" on research_records for insert with check (true);
create policy if not exists "Anon pesquisas update" on research_records for update using (true);
create policy if not exists "Anon pesquisas delete" on research_records for delete using (true);

-- 4. Habilitar Realtime (postgres_changes) para sincronização instantânea
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table research_records;

-- 5. Criar tabela de vídeos encontrados e persistidos dos marketplaces
create table if not exists video_records (
  id text primary key,
  product_key text not null,
  product_id text,
  product_name text,
  product_sku text,
  product_barcode text,
  product_image text,
  ad_url text,
  video_url text,
  platform text not null default 'Shopee',
  duration text default '10 segundos',
  notes text,
  downloaded boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table video_records enable row level security;
create policy if not exists "Anon video_records select" on video_records for select using (true);
create policy if not exists "Anon video_records insert" on video_records for insert with check (true);
create policy if not exists "Anon video_records update" on video_records for update using (true);
create policy if not exists "Anon video_records delete" on video_records for delete using (true);
alter publication supabase_realtime add table video_records;
`;

const DEFAULT_SUPABASE_URL = 'https://fgweictufozyzerbdbtt.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_IV3-SGFPpLo8v7EH-ZB9OQ_sSpXUZSn';

export function getStoredSupabaseConfig(): SupabaseConfig {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env || {};
  const envUrl = metaEnv.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const envKey = metaEnv.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;

  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          url: parsed.url || envUrl,
          anonKey: parsed.anonKey || envKey,
        };
      }
    }
  } catch (e) {
    console.error('Erro ao ler config do Supabase do localStorage', e);
  }

  return { url: envUrl, anonKey: envKey };
}

export function isSupabaseConfigured(): boolean {
  const config = getStoredSupabaseConfig();
  return Boolean(config.url && config.anonKey);
}

export function saveStoredSupabaseConfig(config: SupabaseConfig) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    cachedClient = null;
  } catch (e) {
    console.error('Erro ao salvar config do Supabase', e);
  }
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const config = getStoredSupabaseConfig();
  if (config.url && config.anonKey) {
    try {
      cachedClient = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      return cachedClient;
    } catch (e) {
      console.error('Falha ao inicializar Supabase client', e);
      return null;
    }
  }
  return null;
}

export async function testSupabaseConnection(config?: SupabaseConfig): Promise<{ success: boolean; message: string }> {
  try {
    const targetUrl = config?.url || getStoredSupabaseConfig().url;
    const targetKey = config?.anonKey || getStoredSupabaseConfig().anonKey;

    if (!targetUrl || !targetKey) {
      return { success: false, message: 'URL ou Chave Anon do Supabase não configurados.' };
    }

    const testClient = createClient(targetUrl, targetKey);
    const { error } = await testClient.from('products').select('id').limit(1);

    if (error) {
      if (error.code === '42P01') {
        return {
          success: false,
          message: 'Conectado ao Supabase, mas a tabela "products" ainda não existe. Execute o script SQL no Supabase!',
        };
      }
      return { success: false, message: `Erro ao conectar: ${error.message}` };
    }

    return { success: true, message: 'Conexão com Supabase estabelecida com sucesso!' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao testar conexão';
    return { success: false, message: msg };
  }
}

interface SupabaseProductRow {
  id: string | number;
  name: string;
  cost: number | string | null;
  available: string | boolean | null;
  image: string | null;
  status?: string | null;
  is_new: boolean | null;
  created_at?: string;
  updated_at?: string;
}

interface SupabaseResearchRow {
  product_id: string | number;
  found_name: string | null;
  platform: string | null;
  price: number | string | null;
  url: string | null;
  status: string | null;
  confidence: string | null;
  note: string | null;
  options?: Array<{
    foundName?: string;
    platform?: string;
    price?: number | string;
    url?: string;
    note?: string;
  }> | null;
  updated_at?: string;
}

export async function fetchProductsFromSupabase(): Promise<{
  success: boolean;
  data: Product[];
  products: Product[];
  error: string | null;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, data: [], products: [], error: 'Supabase não configurado' };
  }

  try {
    // 1. Fetch all products with pagination (chunks of 1000)
    let prodRows: SupabaseProductRow[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error: prodErr } = await client
        .from('products')
        .select('*')
        .order('id', { ascending: true })
        .range(from, to);

      if (prodErr) {
        return { success: false, data: [], products: [], error: prodErr.message };
      }

      if (!data || data.length === 0) break;
      prodRows = prodRows.concat(data as SupabaseProductRow[]);
      if (data.length < pageSize) break;
      page++;
    }

    // 2. Fetch all research records with pagination
    let researchRows: SupabaseResearchRow[] = [];
    page = 0;
    while (true) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error: resErr } = await client
        .from('research_records')
        .select('*')
        .range(from, to);

      if (resErr) {
        console.warn('Aviso ao carregar research_records:', resErr.message);
        break;
      }

      if (!data || data.length === 0) break;
      researchRows = researchRows.concat(data as SupabaseResearchRow[]);
      if (data.length < pageSize) break;
      page++;
    }

    const researchByProduct = new Map<string, { status?: ProductStatus; records: ResearchRecord[] }>();
    if (researchRows && researchRows.length > 0) {
      for (const r of researchRows) {
        const prodIdStr = String(r.product_id);
        const list: ResearchRecord[] = [];

        if (r.found_name || r.price || r.url) {
          list.push({
            id: `${prodIdStr}_main`,
            product_id: prodIdStr,
            found_name: r.found_name || '',
            platform: r.platform || 'Mercado Livre',
            store: '',
            price: r.price !== null && r.price !== undefined ? r.price : '',
            url: r.url || '',
            confidence: (r.confidence as 'Alta' | 'Média' | 'Baixa') || 'Média',
            note: r.note || '',
            researched_at: r.updated_at || new Date().toISOString(),
            updated_at: r.updated_at,
          });
        }

        if (Array.isArray(r.options)) {
          r.options.forEach((opt, idx) => {
            if (opt && (opt.foundName || opt.price || opt.url)) {
              list.push({
                id: `${prodIdStr}_opt_${idx}`,
                product_id: prodIdStr,
                found_name: opt.foundName || '',
                platform: opt.platform || 'Mercado Livre',
                store: '',
                price: opt.price !== null && opt.price !== undefined ? opt.price : '',
                url: opt.url || '',
                confidence: 'Média',
                note: opt.note || '',
                researched_at: r.updated_at || new Date().toISOString(),
              });
            }
          });
        }

        researchByProduct.set(prodIdStr, {
          status: (r.status as ProductStatus) || (list.length > 0 ? 'Encontrado' : undefined),
          records: list,
        });
      }
    }

    const products: Product[] = prodRows.map((row) => {
      const prodIdStr = String(row.id);
      const resInfo = researchByProduct.get(prodIdStr);

      const isAvail = typeof row.available === 'boolean'
        ? row.available
        : String(row.available || '').toLowerCase() === 'disponível' || String(row.available || '').toLowerCase() === 'disponivel';

      // Status resolution priority:
      // 1. row.status (if products.status column exists and has value)
      // 2. resInfo?.status (from research_records.status)
      // 3. 'Encontrado' if there are research records
      // 4. Default to 'Pendente'
      const resolvedStatus: ProductStatus =
        (row.status as ProductStatus) ||
        resInfo?.status ||
        (resInfo?.records && resInfo.records.length > 0 ? 'Encontrado' : 'Pendente');

      return {
        id: prodIdStr,
        name: row.name,
        cost: row.cost !== null && row.cost !== undefined ? row.cost : '',
        available: isAvail,
        image: row.image || '',
        status: resolvedStatus,
        is_new: Boolean(row.is_new),
        research_records: resInfo?.records || [],
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    return { success: true, data: products, products, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha na requisição ao Supabase';
    return { success: false, data: [], products: [], error: msg };
  }
}

export async function upsertProductsToSupabase(products: Product[]): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client || products.length === 0) return { error: null };

  try {
    const rowsWithStatus = products.map((p) => {
      const cleanId = String(p.id).trim();
      return {
        id: cleanId,
        name: p.name,
        cost: typeof p.cost === 'number' ? p.cost : parseFloat(String(p.cost).replace(',', '.')) || null,
        available: typeof p.available === 'boolean' ? (p.available ? 'Disponível' : 'Indisponível') : String(p.available || 'Disponível'),
        image: p.image || null,
        status: p.status || 'Pendente',
        is_new: Boolean(p.is_new),
        updated_at: new Date().toISOString(),
      };
    });

    // 1. Save products table with automatic fallback
    for (let i = 0; i < rowsWithStatus.length; i += 100) {
      const batch = rowsWithStatus.slice(i, i + 100);

      // Attempt 1: Direct upsert
      let upsertError: any = null;
      try {
        const { error } = await client.from('products').upsert(batch, { onConflict: 'id' });
        upsertError = error;
      } catch (err: any) {
        upsertError = err;
      }

      // If status column is missing, try upsert without status
      if (
        upsertError &&
        (upsertError.code === '42703' || upsertError.message?.includes('column "status"') || upsertError.message?.includes('status'))
      ) {
        const batchNoStatus = batch.map(({ status, ...rest }) => rest);
        const { error: errNoStatus } = await client.from('products').upsert(batchNoStatus, { onConflict: 'id' });
        if (!errNoStatus) {
          upsertError = null;
        } else {
          upsertError = errNoStatus;
        }
      }

      // Fallback: If upsert failed due to PostgreSQL ON CONFLICT type issues (e.g. 22P02 bigint, 42804 COALESCE),
      // perform resilient split: check existing IDs, insert new ones, update existing ones
      if (upsertError) {
        try {
          const batchIds = batch.map((b) => b.id);
          const { data: existingData } = await client
            .from('products')
            .select('id')
            .in('id', batchIds);

          const existingIdSet = new Set((existingData || []).map((r) => String(r.id).trim()));
          const toInsert = batch.filter((b) => !existingIdSet.has(b.id));
          const toUpdate = batch.filter((b) => existingIdSet.has(b.id));

          if (toInsert.length > 0) {
            const { error: insErr } = await client.from('products').insert(toInsert);
            if (insErr && (insErr.code === '42703' || insErr.message?.includes('status'))) {
              const toInsertNoStatus = toInsert.map(({ status, ...rest }) => rest);
              await client.from('products').insert(toInsertNoStatus);
            }
          }

          for (const item of toUpdate) {
            const { id, ...dataToUpdate } = item;
            const { error: updErr } = await client.from('products').update(dataToUpdate).eq('id', id);
            if (updErr && (updErr.code === '42703' || updErr.message?.includes('status'))) {
              const { status, ...updNoStatus } = dataToUpdate;
              await client.from('products').update(updNoStatus).eq('id', id);
            }
          }
        } catch (fallbackErr: any) {
          console.error('Falha no fallback de sincronização de produtos:', fallbackErr);
          return { error: upsertError.message || 'Erro ao sincronizar produtos com Supabase' };
        }
      }
    }

    // 2. Upsert research_records / status (persisting status in research_records table)
    const recsToUpsert = products
      .filter((p) => (p.research_records && p.research_records.length > 0) || (p.status && p.status !== 'Pendente'))
      .map((p) => {
        const cleanId = String(p.id).trim();
        const mainRec = p.research_records?.[0];
        const extraOptions = (p.research_records || []).slice(1).map((r) => ({
          foundName: r.found_name,
          platform: r.platform,
          price: r.price,
          url: r.url,
          note: r.note,
        }));

        return {
          product_id: cleanId,
          status: p.status || 'Pendente',
          found_name: mainRec?.found_name || null,
          platform: mainRec?.platform || null,
          price: mainRec && mainRec.price !== '' ? (typeof mainRec.price === 'number' ? mainRec.price : parseFloat(String(mainRec.price).replace(',', '.')) || null) : null,
          url: mainRec?.url || null,
          confidence: mainRec?.confidence || 'Média',
          note: mainRec?.note || null,
          options: extraOptions,
          updated_at: new Date().toISOString(),
        };
      });

    if (recsToUpsert.length > 0) {
      for (let i = 0; i < recsToUpsert.length; i += 100) {
        const batch = recsToUpsert.slice(i, i + 100);
        let recErr: any = null;
        try {
          const { error } = await client.from('research_records').upsert(batch, { onConflict: 'product_id' });
          recErr = error;
        } catch (err: any) {
          recErr = err;
        }

        if (recErr) {
          // Fallback for research_records
          try {
            const batchIds = batch.map((r) => r.product_id);
            const { data: existingRecs } = await client
              .from('research_records')
              .select('product_id')
              .in('product_id', batchIds);

            const existingRecSet = new Set((existingRecs || []).map((r) => String(r.product_id).trim()));
            const toInsertRecs = batch.filter((r) => !existingRecSet.has(r.product_id));
            const toUpdateRecs = batch.filter((r) => existingRecSet.has(r.product_id));

            if (toInsertRecs.length > 0) {
              await client.from('research_records').insert(toInsertRecs);
            }
            for (const rec of toUpdateRecs) {
              const { product_id, ...recData } = rec;
              await client.from('research_records').update(recData).eq('product_id', product_id);
            }
          } catch (fbRecErr) {
            console.warn('Aviso no fallback de sincronização de research_records:', fbRecErr);
          }
        }
      }
    }

    return { error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao sincronizar com Supabase';
    return { error: msg };
  }
}

export async function upsertSingleProduct(product: Product): Promise<{ error: string | null }> {
  return upsertProductsToSupabase([product]);
}

export async function pushAllLocalProductsToSupabase(
  products: Product[]
): Promise<{ count: number; error: string | null }> {
  if (!products || products.length === 0) return { count: 0, error: null };
  const { error } = await upsertProductsToSupabase(products);
  if (error) return { count: 0, error };
  return { count: products.length, error: null };
}

export async function saveResearchRecord(record: ResearchRecord): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: null };

  try {
    const prodId = String(record.product_id).trim();

    // Fetch existing record to preserve options or existing status
    const { data: existing } = await client
      .from('research_records')
      .select('*')
      .eq('product_id', prodId)
      .maybeSingle();

    const priceNum = typeof record.price === 'number' ? record.price : parseFloat(String(record.price).replace(',', '.')) || null;

    const row = {
      product_id: prodId,
      found_name: record.found_name || null,
      platform: record.platform || null,
      price: priceNum,
      url: record.url || null,
      status: (existing?.status as ProductStatus) || (priceNum ? 'Encontrado' : 'Pesquisando'),
      confidence: record.confidence || 'Média',
      note: record.note || null,
      options: existing?.options || [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await client.from('research_records').upsert(row, { onConflict: 'product_id' });
    if (error) {
      // Resilient fallback: check if row exists, then update or insert
      try {
        const { data: existingRec } = await client
          .from('research_records')
          .select('product_id')
          .eq('product_id', prodId)
          .maybeSingle();

        if (existingRec) {
          const { product_id, ...rowUpdate } = row;
          const { error: updErr } = await client.from('research_records').update(rowUpdate).eq('product_id', prodId);
          if (updErr) return { error: updErr.message };
        } else {
          const { error: insErr } = await client.from('research_records').insert(row);
          if (insErr) return { error: insErr.message };
        }
      } catch (fbErr: any) {
        return { error: error.message };
      }
    }

    return { error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao salvar pesquisa no Supabase';
    console.warn('Exceção ao salvar pesquisa no Supabase:', msg, err);
    return { error: msg };
  }
}

export const saveResearchRecordToSupabase = saveResearchRecord;

export async function deleteResearchRecord(recordId: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: null };

  try {
    // If it's a main record, clear its search fields
    const parts = recordId.split('_');
    const prodId = String(parts[0]).trim();

    if (recordId.includes('_opt_')) {
      const optIdx = parseInt(parts[2], 10);
      const { data: existing } = await client
        .from('research_records')
        .select('options')
        .eq('product_id', prodId)
        .maybeSingle();

      if (existing && Array.isArray(existing.options)) {
        const nextOpts = existing.options.filter((_, idx) => idx !== optIdx);
        await client.from('research_records').update({ options: nextOpts, updated_at: new Date().toISOString() }).eq('product_id', prodId);
      }
    } else {
      await client.from('research_records').update({
        found_name: null,
        platform: null,
        price: null,
        url: null,
        note: null,
        status: 'Pendente',
        updated_at: new Date().toISOString(),
      }).eq('product_id', prodId);
    }

    return { error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao excluir pesquisa no Supabase';
    return { error: msg };
  }
}

export const deleteResearchRecordFromSupabase = deleteResearchRecord;

export async function updateProductStatus(productId: string, status: ProductStatus): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: null };

  try {
    const prodId = String(productId).trim();

    // 1. Attempt to update products table (canonical if column exists)
    try {
      const { error: prodErr } = await client
        .from('products')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', prodId);

      if (prodErr) {
        if (prodErr.code === '22P02' || prodErr.message?.includes('invalid input syntax for type bigint')) {
          return {
            error: `A tabela "products" no Supabase possui ID numérico (bigint) e rejeitou o código alfanumérico "${productId}". Execute o script de migração rápida em Configurações > Supabase para aceitar IDs em TEXT.`,
          };
        }
        if (prodErr.code !== '42703' && !prodErr.message?.includes('column "status"')) {
          console.warn('Aviso ao atualizar status na tabela products:', prodErr.message);
        }
      }
    } catch (e) {
      console.warn('Exceção produtos status:', e);
    }

    // 2. Persist status in research_records table (which reliably has status)
    const { data: existingRec, error: selectErr } = await client
      .from('research_records')
      .select('product_id')
      .eq('product_id', prodId)
      .maybeSingle();

    if (selectErr && (selectErr.code === '22P02' || selectErr.message?.includes('invalid input syntax for type bigint'))) {
      return {
        error: `A tabela "research_records" no Supabase possui ID numérico (bigint) e rejeitou o código alfanumérico "${productId}". Execute o script de migração rápida em Configurações > Supabase para aceitar IDs em TEXT.`,
      };
    }

    if (existingRec) {
      const { error: updateErr } = await client
        .from('research_records')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('product_id', prodId);

      if (updateErr) {
        if (updateErr.code === '22P02' || updateErr.message?.includes('invalid input syntax for type bigint')) {
          return {
            error: `O Supabase rejeitou o código "${productId}" por ser bigint. Execute a migração SQL em Configurações > Supabase para converter para TEXT.`,
          };
        }
        console.error('Erro ao atualizar status em research_records:', updateErr.message);
        return { error: updateErr.message };
      }
    } else {
      const { error: insertErr } = await client
        .from('research_records')
        .insert({
          product_id: prodId,
          status,
          updated_at: new Date().toISOString(),
        });

      if (insertErr) {
        if (insertErr.code === '22P02' || insertErr.message?.includes('invalid input syntax for type bigint')) {
          return {
            error: `O Supabase rejeitou o código "${productId}" por ser bigint. Execute a migração SQL em Configurações > Supabase para converter para TEXT.`,
          };
        }
        // Fallback to update if insert encountered duplicate key
        const { error: fallbackErr } = await client
          .from('research_records')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('product_id', prodId);

        if (fallbackErr) {
          if (fallbackErr.code === '22P02' || fallbackErr.message?.includes('invalid input syntax for type bigint')) {
            return {
              error: `O Supabase rejeitou o código "${productId}" por ser bigint. Execute a migração SQL em Configurações > Supabase para converter para TEXT.`,
            };
          }
          console.error('Erro ao gravar status em research_records:', fallbackErr.message);
          return { error: fallbackErr.message };
        }
      }
    }

    return { error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao atualizar status';
    console.error('Exceção em updateProductStatus:', msg);
    return { error: msg };
  }
}

export const updateProductStatusInSupabase = updateProductStatus;

export async function updateMultipleProductsStatus(
  productIds: (string | number)[],
  status: ProductStatus
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client || productIds.length === 0) return { error: null };

  try {
    const now = new Date().toISOString();
    // Process in chunks of 50 to avoid URL/query payload limits while being orders of magnitude faster
    for (let i = 0; i < productIds.length; i += 50) {
      const batch = productIds.slice(i, i + 50).map((id) => String(id).trim());

      // 1. Bulk update products table
      try {
        const { error: prodErr } = await client
          .from('products')
          .update({ status, updated_at: now })
          .in('id', batch);

        if (prodErr) {
          if (prodErr.code === '22P02' || prodErr.message?.includes('invalid input syntax for type bigint')) {
            return {
              error: `O Supabase rejeitou IDs alfanuméricos em lote porque a coluna "id" está configurada como 'bigint'. Execute a migração SQL em Configurações > Supabase para converter para TEXT.`,
            };
          }
          if (prodErr.code !== '42703' && !prodErr.message?.includes('column "status"')) {
            console.warn('Aviso ao atualizar status em lote na tabela products:', prodErr.message);
          }
        }
      } catch (e) {
        console.warn('Exceção ao atualizar status em lote em products:', e);
      }

      // 2. Bulk update research_records table
      try {
        const { error: resErr } = await client
          .from('research_records')
          .update({ status, updated_at: now })
          .in('product_id', batch);

        if (resErr) {
          if (resErr.code === '22P02' || resErr.message?.includes('invalid input syntax for type bigint')) {
            return {
              error: `O Supabase rejeitou IDs alfanuméricos em lote em research_records. Execute a migração SQL em Configurações > Supabase para converter para TEXT.`,
            };
          }
          console.warn('Aviso ao atualizar status em lote em research_records:', resErr.message);
        }
      } catch (e) {
        console.warn('Exceção ao atualizar status em lote em research_records:', e);
      }
    }
    return { error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao atualizar status em lote';
    return { error: msg };
  }
}

export const updateMultipleProductsStatusInSupabase = updateMultipleProductsStatus;

export interface SupabaseRealtimePayload<T = Record<string, any>> {
  schema: string;
  table: string;
  commit_timestamp: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  new: T;
  old: Partial<T>;
  errors?: any[];
}

export interface SupabaseRealtimeListeners {
  onProductChange?: (payload: SupabaseRealtimePayload) => void;
  onResearchChange?: (payload: SupabaseRealtimePayload) => void;
  onBatchProductChanges?: (batch: SupabaseRealtimePayload[]) => void;
  onBatchResearchChanges?: (batch: SupabaseRealtimePayload[]) => void;
  onAnyChange?: () => void;
  bufferMs?: number;
  maxBatchSize?: number;
}

export function subscribeToSupabaseChanges(
  listeners: (() => void) | SupabaseRealtimeListeners
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const onAny = typeof listeners === 'function' ? listeners : listeners.onAnyChange;
  const onProduct = typeof listeners === 'object' ? listeners.onProductChange : undefined;
  const onResearch = typeof listeners === 'object' ? listeners.onResearchChange : undefined;
  const onBatchProduct = typeof listeners === 'object' ? listeners.onBatchProductChanges : undefined;
  const onBatchResearch = typeof listeners === 'object' ? listeners.onBatchResearchChanges : undefined;
  const bufferMs = typeof listeners === 'object' && listeners.bufferMs !== undefined ? listeners.bufferMs : 35;
  const maxBatchSize = typeof listeners === 'object' && listeners.maxBatchSize !== undefined ? listeners.maxBatchSize : 25;

  let productQueue: SupabaseRealtimePayload[] = [];
  let researchQueue: SupabaseRealtimePayload[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let isFlushing = false;

  const dispatchBatchChunked = (
    items: SupabaseRealtimePayload[],
    batchHandler?: (batch: SupabaseRealtimePayload[]) => void,
    singleHandler?: (item: SupabaseRealtimePayload) => void
  ) => {
    if (!items || items.length === 0) return;

    if (batchHandler) {
      // Chunk into smaller batches (e.g., 25 items max) for smooth atomic state updates
      for (let i = 0; i < items.length; i += maxBatchSize) {
        const chunk = items.slice(i, i + maxBatchSize);
        try {
          batchHandler(chunk);
        } catch (e) {
          console.error('Erro no handler de lote Supabase:', e);
        }
      }
    } else if (singleHandler) {
      for (const payload of items) {
        try {
          singleHandler(payload);
        } catch (e) {
          console.error('Erro no handler individual Supabase:', e);
        }
      }
    }
  };

  const flushQueues = () => {
    flushTimer = null;
    if (isFlushing) return;
    isFlushing = true;

    try {
      const currentProducts = productQueue;
      const currentResearch = researchQueue;
      productQueue = [];
      researchQueue = [];

      let hasAnyChanges = false;

      if (currentProducts.length > 0) {
        hasAnyChanges = true;
        dispatchBatchChunked(currentProducts, onBatchProduct, onProduct);
      }

      if (currentResearch.length > 0) {
        hasAnyChanges = true;
        dispatchBatchChunked(currentResearch, onBatchResearch, onResearch);
      }

      if (hasAnyChanges && onAny) {
        try {
          onAny();
        } catch (e) {
          console.error('Erro no callback onAnyChange:', e);
        }
      }
    } finally {
      isFlushing = false;
      // If new events arrived during flush, schedule next tick
      if (productQueue.length > 0 || researchQueue.length > 0) {
        scheduleFlush();
      }
    }
  };

  const scheduleFlush = () => {
    if (!flushTimer) {
      flushTimer = setTimeout(flushQueues, bufferMs);
    }
  };

  try {
    const channelName = `realtime-sync-${Math.random().toString(36).substring(2, 9)}`;
    const channel = client
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload: any) => {
          productQueue.push(payload as SupabaseRealtimePayload);
          scheduleFlush();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'research_records' },
        (payload: any) => {
          researchQueue.push(payload as SupabaseRealtimePayload);
          scheduleFlush();
        }
      )
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Supabase Realtime] Canal ativo com buffer em lote (products & research_records)');
        }
        if (error) {
          console.warn('[Supabase Realtime] Aviso na subscrição:', error);
        }
      });

    return () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      try {
        client.removeChannel(channel);
      } catch (e) {
        console.warn('Erro ao remover canal do Supabase:', e);
      }
    };
  } catch (err) {
    console.warn('Não foi possível registrar realtime listener do Supabase:', err);
    return () => {};
  }
}

export async function updateProductIsNew(productId: string, is_new: boolean): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: null };

  try {
    const prodId = String(productId).trim();

    const { error } = await client
      .from('products')
      .update({ is_new, updated_at: new Date().toISOString() })
      .eq('id', prodId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao atualizar flag is_new';
    return { error: msg };
  }
}

export async function updateMultipleProductsIsNew(
  productIds: (string | number)[],
  is_new: boolean
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client || productIds.length === 0) return { error: null };

  try {
    const formattedIds = productIds.map((id) => String(id).trim());

    for (let i = 0; i < formattedIds.length; i += 100) {
      const batch = formattedIds.slice(i, i + 100);
      const { error } = await client
        .from('products')
        .update({ is_new, updated_at: new Date().toISOString() })
        .in('id', batch);

      if (error) return { error: error.message };
    }
    return { error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao atualizar flag is_new em lote';
    return { error: msg };
  }
}

export async function deleteProductsFromSupabase(productIds: (string | number)[]): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client || productIds.length === 0) return { error: null };

  try {
    const formattedIds = productIds.map((id) => String(id).trim());

    for (let i = 0; i < formattedIds.length; i += 100) {
      const batch = formattedIds.slice(i, i + 100);
      const { error: resErr } = await client.from('research_records').delete().in('product_id', batch);
      if (resErr) console.warn('Erro ao deletar pesquisas em lote:', resErr);
      const { error: prodErr } = await client.from('products').delete().in('id', batch);
      if (prodErr) return { error: prodErr.message };
    }
    return { error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao deletar produtos do Supabase';
    return { error: msg };
  }
}

export async function clearAllSupabaseData(): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: null };

  try {
    await client.from('research_records').delete().neq('product_id', -999);
    await client.from('products').delete().neq('id', -999);
    return { error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao limpar dados do Supabase';
    return { error: msg };
  }
}
