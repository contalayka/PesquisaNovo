export type ProductStatus = 'Pendente' | 'Encontrado' | 'Revisar' | 'Descartado';

export type ConfidenceLevel = 'Alta' | 'Média' | 'Baixa';

export type AppView =
  | 'inicio'
  | 'produtos'
  | 'importar'
  | 'conversao'
  | 'marketplaces'
  | 'arquivos'
  | 'configuracoes'
  | 'estoque_interno'
  | 'videos';

export interface ResearchRecord {
  id: string;
  product_id: string;
  found_name: string;
  platform: string;
  store: string;
  price: number | string;
  url: string;
  confidence: ConfidenceLevel;
  note: string;
  researched_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  name: string;
  cost: number | string;
  available: boolean;
  image: string;
  status: ProductStatus;
  is_new?: boolean;
  sku?: string;
  weight?: number | string;
  package_length?: number | string;
  package_width?: number | string;
  package_height?: number | string;
  barcode?: string;
  category?: string;
  notes?: string;
  research_records: ResearchRecord[];
  created_at?: string;
  updated_at?: string;
  rawColumns?: Record<string, unknown>;
}

export type MarketplacePlatform =
  | 'Shopee'
  | 'TikTok Shop'
  | 'SHEIN'
  | 'UpSeller ERP'
  | 'UpSeller ERP (Conta 1)'
  | 'UpSeller ERP (Conta 2)';

export interface GeneratedFile {
  id: string;
  name: string;
  platform: MarketplacePlatform;
  productCount: number;
  format: 'xlsx' | 'csv';
  createdAt: string;
  downloadData?: unknown;
}

export type FilterStatus = 'Todos' | ProductStatus;
export type AvailabilityFilter = 'all' | 'available' | 'unavailable';
export type SortOption = 'name-asc' | 'name-desc' | 'cost-asc' | 'cost-desc' | 'status' | 'recent';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface GitHubSyncConfig {
  token: string;
  username: string;
  repoName: string;
  repo?: string;
  branch: string;
  filePath: string;
  autoPush: boolean;
  lastSyncedAt?: string;
  lastSyncType?: 'push' | 'pull';
  lastCommitSha?: string;
}

export interface GitHubSyncPayload {
  version: string;
  updatedAt: string;
  source: string;
  totalProducts: number;
  products: Product[];
  pricingSettings?: {
    markup: string;
    tax: string;
    packaging: string;
  };
}

export function getProductSku(product: Product): string {
  if (product.sku && String(product.sku).trim()) return String(product.sku).trim();
  if (product.rawColumns) {
    for (const key of ['sku', 'SKU', 'codigo', 'cod', 'ref', 'referencia', 'código']) {
      const val = product.rawColumns[key];
      if (val !== undefined && val !== null && String(val).trim()) return String(val).trim();
    }
  }
  if (product.id && !product.id.startsWith('prod_')) return product.id;
  return 'Não informado';
}

export function getProductWeightDisplay(product: Product): string {
  if (product.weight !== undefined && product.weight !== null && String(product.weight).trim() !== '') {
    const w = String(product.weight).trim();
    return w.toLowerCase().includes('kg') || w.toLowerCase().includes('g') ? w : `${w} kg`;
  }
  if (product.rawColumns) {
    for (const key of ['peso', 'peso_embalado', 'weight', 'peso_kg', 'peso_g']) {
      const val = product.rawColumns[key];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const strVal = String(val).trim();
        return strVal.toLowerCase().includes('g') ? strVal : `${strVal} kg`;
      }
    }
  }
  return 'Não informado';
}

export function getProductDimensionsDisplay(product: Product): string {
  const l = product.package_length;
  const w = product.package_width;
  const h = product.package_height;
  if (l && w && h) return `${l} × ${w} × ${h} cm`;
  if (product.rawColumns) {
    for (const key of ['dimensoes', 'dimensões', 'medidas', 'dimensions', 'tamanho_embalagem']) {
      const val = product.rawColumns[key];
      if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
    }
  }
  return 'Não informado';
}
