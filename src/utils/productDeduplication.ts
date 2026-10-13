import { Product } from '../types';

/**
 * Normaliza o nome do produto para comparação uniforme (sem acentos, minúsculo, espaços unificados)
 */
export function normalizeProductName(name?: string | null): string {
  if (!name) return '';
  return String(name)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normaliza SKU ou código de barras, descartando marcadores vazios ou placeholders genéricos.
 */
export function normalizeCode(code?: string | null): string {
  if (!code) return '';
  const s = String(code).trim().toLowerCase();
  // Ignora marcadores comuns que não representam um código único real
  const placeholders = new Set([
    '-',
    '--',
    '---',
    '.',
    '..',
    '0',
    '00',
    '000',
    'n/a',
    'na',
    'none',
    'null',
    'undefined',
    'sem sku',
    'sem codigo',
    'sem código',
    'sem cod',
    's/n',
    'sn',
    'padrao',
    'padrão',
    'vazio'
  ]);
  if (placeholders.has(s)) return '';
  return s;
}

/**
 * Identifica se dois produtos são o mesmo item (duplicados).
 * - Se os dois tiverem o mesmo ID não-vazio, é duplicado.
 * - Se os dois tiverem o mesmo SKU real, é duplicado.
 * - Se os dois tiverem SKUs reais diferentes, NÃO é duplicado (variações distintas).
 * - Se os dois tiverem o mesmo código de barras real, é duplicado.
 * - Se os dois tiverem códigos de barras reais diferentes, NÃO é duplicado.
 * - Se o nome normalizado for exatamente o mesmo (e não houver SKUs/barcodes conflitantes), é duplicado.
 */
export function areProductsDuplicate(
  a: Partial<Product> | null | undefined,
  b: Partial<Product> | null | undefined
): boolean {
  if (!a || !b) return false;

  const idA = a.id ? String(a.id).trim() : '';
  const idB = b.id ? String(b.id).trim() : '';
  if (idA && idB && idA === idB) return true;

  const skuA = normalizeCode(a.sku);
  const skuB = normalizeCode(b.sku);
  if (skuA && skuB && skuA === skuB) return true;
  if (skuA && skuB && skuA !== skuB) return false;

  const barA = normalizeCode(a.barcode);
  const barB = normalizeCode(b.barcode);
  if (barA && barB && barA === barB) return true;
  if (barA && barB && barA !== barB) return false;

  const nameA = normalizeProductName(a.name);
  const nameB = normalizeProductName(b.name);
  if (nameA && nameB && nameA === nameB) return true;

  return false;
}

/**
 * Verifica se um produto candidato já existe em uma lista de produtos
 */
export function findDuplicateProduct(
  candidate: Partial<Product>,
  existingProducts: Product[]
): Product | undefined {
  return existingProducts.find((p) => areProductsDuplicate(candidate, p));
}

/**
 * Remove produtos duplicados de uma lista de forma estrita e segura,
 * preservando o primeiro item encontrado e garantindo que produtos com
 * SKUs ou IDs distintos não sejam descartados acidentalmente.
 */
export function deduplicateProducts(products: Product[]): Product[] {
  if (!Array.isArray(products) || products.length === 0) return [];

  const unique: Product[] = [];

  for (const p of products) {
    if (!p) continue;
    // Se o produto já possui um duplicado na lista filtrada, não o inclui novamente
    if (findDuplicateProduct(p, unique)) {
      continue;
    }
    unique.push(p);
  }

  return unique;
}

/**
 * Converte qualquer representação de valor/custo (string formatada com R$, ponto, vírgula ou número)
 * em um número de ponto flutuante válido ou null se for vazio/inválido.
 */
export function parseNumericCost(val: number | string | undefined | null): number | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const str = String(val).trim();
  if (!str) return null;
  let cleaned = str.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Detecta se houve alteração significativa de valor/preço entre dois custos.
 * Retorna true apenas se o novo custo for válido e numericamente diferente (diferença >= R$ 0,01).
 */
export function isCostDifferent(
  oldCost: number | string | undefined | null,
  newCost: number | string | undefined | null
): boolean {
  const parsedNew = parseNumericCost(newCost);
  // Se o novo valor não for um número válido (ex: vazio ou coluna em branco), não consideramos alteração
  if (parsedNew === null) return false;

  const parsedOld = parseNumericCost(oldCost);
  // Se o valor antigo não existia ou não era numérico, mas o novo existe e é numérico
  if (parsedOld === null) return true;

  // Comparação com tolerância para evitar ruído de arredondamento
  return Math.abs(parsedOld - parsedNew) >= 0.009;
}
