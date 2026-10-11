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
 * Normaliza SKU ou código de barras
 */
export function normalizeCode(code?: string | null): string {
  if (!code) return '';
  return String(code).trim().toLowerCase();
}

/**
 * Identifica se dois produtos são o mesmo item (duplicados)
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

  const barA = normalizeCode(a.barcode);
  const barB = normalizeCode(b.barcode);
  if (barA && barB && barA === barB) return true;

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
 * Remove produtos duplicados de uma lista, preservando o primeiro item encontrado
 * e garantindo unicidade absoluta por ID, SKU, Código de Barras e Nome.
 */
export function deduplicateProducts(products: Product[]): Product[] {
  if (!Array.isArray(products) || products.length === 0) return [];

  const seenIds = new Set<string>();
  const seenSkus = new Set<string>();
  const seenBarcodes = new Set<string>();
  const seenNames = new Set<string>();

  const unique: Product[] = [];

  for (const p of products) {
    if (!p) continue;

    const id = p.id ? String(p.id).trim() : '';
    const sku = normalizeCode(p.sku);
    const barcode = normalizeCode(p.barcode);
    const normName = normalizeProductName(p.name);

    // Se não tiver nenhum identificador válido nem nome, pula
    if (!id && !sku && !barcode && !normName) continue;

    // Se já vimos qualquer um dos identificadores únicos, é duplicata
    const isDup =
      (id && seenIds.has(id)) ||
      (sku && seenSkus.has(sku)) ||
      (barcode && seenBarcodes.has(barcode)) ||
      (normName && seenNames.has(normName));

    if (isDup) {
      continue;
    }

    if (id) seenIds.add(id);
    if (sku) seenSkus.add(sku);
    if (barcode) seenBarcodes.add(barcode);
    if (normName) seenNames.add(normName);

    unique.push(p);
  }

  return unique;
}
