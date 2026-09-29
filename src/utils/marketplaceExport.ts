import * as XLSX from 'xlsx';
import { Product, MarketplacePlatform, getProductSku, getProductWeightDisplay, getProductDimensionsDisplay } from '../types';
import { parseNumber } from './excel';

export interface MarketplaceConfigOptions {
  platform: MarketplacePlatform;
  format: 'xlsx' | 'csv';
  onlyReady?: boolean;
  // Pricing rules
  markupMultiplier?: number; // e.g. 2.2 (220% of cost)
  includePlatformFees?: boolean; // compensation for marketplace commission + fixed fee
  roundingMode?: 'exact' | '90' | '99'; // e.g. R$ 49.90 or 49.99
  // Multi-account / UpSeller configuration
  upsellerAccountName1?: string; // default "Conta 1 (Principal)"
  upsellerAccountName2?: string; // default "Conta 2 (Secundária)"
  skuPrefixAccount1?: string; // default "C1-"
  skuPrefixAccount2?: string; // default "C2-"
  // Stock & shipping defaults
  defaultStock?: number; // default 50
  defaultWeightKg?: number; // default 0.35
  defaultPackageLength?: number; // default 20
  defaultPackageWidth?: number; // default 15
  defaultPackageHeight?: number; // default 10
  defaultBrand?: string; // default "Genérica"
  defaultCategory?: string; // default "Casa e Decoração"
  defaultDaysToShip?: number; // default 2
}

// Calculate selling price based on cost, markup, platform fees, and rounding
export function calculateSellingPrice(
  p: Product,
  platform: MarketplacePlatform,
  options?: Partial<MarketplaceConfigOptions>
): number {
  const rawCost = typeof p.cost === 'number' ? p.cost : Number(parseNumber(p.cost)) || 0;
  const numCost = typeof rawCost === 'number' && !isNaN(rawCost) ? rawCost : 0;

  const bestResearchPrice = p.research_records?.[0]?.price;
  const rawResearch = typeof bestResearchPrice === 'number'
    ? bestResearchPrice
    : typeof bestResearchPrice === 'string' && bestResearchPrice
    ? Number(parseNumber(bestResearchPrice)) || 0
    : 0;
  const numResearchPrice = typeof rawResearch === 'number' && !isNaN(rawResearch) ? rawResearch : 0;

  const multiplier = options?.markupMultiplier !== undefined ? options.markupMultiplier : 2.2;
  const includeFees = options?.includePlatformFees ?? true;
  const rounding = options?.roundingMode ?? '90';

  let basePrice = 0;

  if (numCost > 0) {
    basePrice = numCost * multiplier;
  } else if (numResearchPrice > 0) {
    basePrice = numResearchPrice;
  } else {
    basePrice = 49.9; // fallback standard
  }

  // Adjust for marketplace commissions if requested
  if (includeFees) {
    switch (platform) {
      case 'Shopee':
        // Shopee: ~14% + R$ 4,00 por item
        basePrice = (basePrice + 4.0) / (1 - 0.14);
        break;
      case 'SHEIN':
        // SHEIN: ~14%
        basePrice = basePrice / (1 - 0.14);
        break;
      case 'TikTok Shop':
        // TikTok: ~10%
        basePrice = basePrice / (1 - 0.10);
        break;
      case 'UpSeller ERP':
      case 'UpSeller ERP (Conta 1)':
      case 'UpSeller ERP (Conta 2)':
      default:
        // UpSeller ERP holds the calculated baseline / optimal price
        break;
    }
  }

  // Apply rounding
  if (rounding === '90') {
    const integerPart = Math.floor(basePrice);
    basePrice = integerPart + 0.90;
  } else if (rounding === '99') {
    const integerPart = Math.floor(basePrice);
    basePrice = integerPart + 0.99;
  } else {
    basePrice = Number(basePrice.toFixed(2));
  }

  return Math.max(Number(basePrice.toFixed(2)), 5.0);
}

// Generate persuasive, high-converting product descriptions
export function generateProductDescription(p: Product, brand: string): string {
  const sku = getProductSku(p);
  const weight = getProductWeightDisplay(p);
  const dim = getProductDimensionsDisplay(p);

  return `${p.name}

Ideal para quem busca elegância, praticidade e alta qualidade em cada detalhe. Produto selecionado para agregar estilo e funcionalidade ao seu dia a dia.

Destaques do Produto:
• Design moderno e acabamento refinado
• Estrutura resistente e durabilidade garantida
• Embalagem reforçada para transporte seguro
• Envio rápido e rastreado em até 24 a 48 horas úteis

Especificações Técnicas:
• Modelo/Código: ${sku}
• Marca: ${brand || 'Genérica'}
• Condição: Novo, na embalagem original
• Peso com embalagem: ${weight !== 'Não informado' ? weight : 'Aprox. 350g'}
• Dimensões da embalagem: ${dim !== 'Não informado' ? dim : 'Aprox. 20 x 15 x 10 cm'}

Garantia e Atendimento:
Garantia do vendedor de 30 dias contra defeitos de fabricação. Suporte dedicado para tirar qualquer dúvida antes e após a sua compra.`;
}

// Generate the exact row records for each marketplace specification
export function generateMarketplaceRows(
  targetProducts: Product[],
  options: MarketplaceConfigOptions
): Record<string, unknown>[] {
  const brand = options.defaultBrand || 'Genérica';
  const category = options.defaultCategory || 'Casa, Móveis e Decoração';
  const defaultStock = options.defaultStock !== undefined ? options.defaultStock : 50;
  const defaultWeightKg = options.defaultWeightKg || 0.35;
  const defaultLength = options.defaultPackageLength || 20;
  const defaultWidth = options.defaultPackageWidth || 15;
  const defaultHeight = options.defaultPackageHeight || 10;
  const defaultDaysToShip = options.defaultDaysToShip || 2;

  const prefix1 = options.skuPrefixAccount1 !== undefined ? options.skuPrefixAccount1 : 'C1-';
  const prefix2 = options.skuPrefixAccount2 !== undefined ? options.skuPrefixAccount2 : 'C2-';
  const account1Name = options.upsellerAccountName1 || 'Conta 1 (Principal)';
  const account2Name = options.upsellerAccountName2 || 'Conta 2 (Secundária)';

  switch (options.platform) {
    // -------------------------------------------------------------
    // 1. SHOPEE BRASIL (Modelo Oficial de Publicação Básica / Carga Massiva)
    // -------------------------------------------------------------
    case 'Shopee':
      return targetProducts.map((p, idx) => {
        const sku = getProductSku(p) !== 'Não informado' ? getProductSku(p) : `SKU-${idx + 1001}`;
        const price = calculateSellingPrice(p, 'Shopee', options);
        const weightKg = Number(p.weight) || defaultWeightKg;
        const lengthCm = Number(p.package_length) || defaultLength;
        const widthCm = Number(p.package_width) || defaultWidth;
        const heightCm = Number(p.package_height) || defaultHeight;
        const description = generateProductDescription(p, brand);
        const stock = p.available ? defaultStock : 0;

        // Clean name (Shopee max 120 chars)
        const cleanName = p.name.slice(0, 120);

        return {
          'Categoria': category,
          'Nome do Produto': cleanName,
          'Descrição do Produto': description,
          'SKU Principal': sku,
          'Código de Integração de Variação': '',
          'Nome da Opção 1': 'Padrão',
          'Opção da Variação 1': 'Único',
          'Imagem da Variação': p.image || '',
          'Preço': price,
          'Estoque': stock,
          'SKU da Variação': `${sku}-VAR1`,
          'Foto de Capa': p.image || '',
          'Foto 2': '',
          'Foto 3': '',
          'Peso (kg)': weightKg,
          'Comprimento (cm)': lengthCm,
          'Largura (cm)': widthCm,
          'Altura (cm)': heightCm,
          'Prazo de Envio (dias)': defaultDaysToShip,
          'Condição': 'Novo',
          'Marca': brand,
        };
      });

    // -------------------------------------------------------------
    // 2. TIKTOK SHOP (Seller Center Brasil - Bulk Product Upload)
    // -------------------------------------------------------------
    case 'TikTok Shop':
      return targetProducts.map((p, idx) => {
        const sku = getProductSku(p) !== 'Não informado' ? getProductSku(p) : `TTS-${idx + 1001}`;
        const price = calculateSellingPrice(p, 'TikTok Shop', options);
        const weightKg = Number(p.weight) || defaultWeightKg;
        const lengthCm = Number(p.package_length) || defaultLength;
        const widthCm = Number(p.package_width) || defaultWidth;
        const heightCm = Number(p.package_height) || defaultHeight;
        const stock = p.available ? defaultStock : 0;

        return {
          'Product Name': p.name.slice(0, 255),
          'Seller SKU': sku,
          'Retail Price (BRL)': price,
          'Quantity': stock,
          'Main Image URL': p.image || '',
          'Image 2': '',
          'Package Weight (kg)': weightKg,
          'Package Length (cm)': lengthCm,
          'Package Width (cm)': widthCm,
          'Package Height (cm)': heightCm,
          'Product Description': generateProductDescription(p, brand),
          'Brand': brand,
          'Category': category,
        };
      });

    // -------------------------------------------------------------
    // 3. SHEIN MARKETPLACE (Vendedor Local Brasil)
    // -------------------------------------------------------------
    case 'SHEIN':
      return targetProducts.map((p, idx) => {
        const sku = getProductSku(p) !== 'Não informado' ? getProductSku(p) : `SH-${idx + 1001}`;
        const price = calculateSellingPrice(p, 'SHEIN', options);
        const weightG = Math.round((Number(p.weight) || defaultWeightKg) * 1000);
        const lengthCm = Number(p.package_length) || defaultLength;
        const widthCm = Number(p.package_width) || defaultWidth;
        const heightCm = Number(p.package_height) || defaultHeight;
        const stock = p.available ? defaultStock : 0;

        return {
          'Goods SKU': sku,
          'Goods Name': p.name,
          'Supply Price (BRL)': Number((price * 0.75).toFixed(2)),
          'Retail Price (BRL)': price,
          'Inventory': stock,
          'Main Picture URL': p.image || '',
          'Weight (g)': weightG,
          'Length (cm)': lengthCm,
          'Width (cm)': widthCm,
          'Height (cm)': heightCm,
          'Product Description': generateProductDescription(p, brand),
          'Color / Specification': 'Padrão',
          'Category': category,
        };
      });

    // -------------------------------------------------------------
    // 4. UPSELLER ERP - CONTA 1 (PRINCIPAL)
    // -------------------------------------------------------------
    case 'UpSeller ERP (Conta 1)':
      return targetProducts.map((p, idx) => {
        const rawSku = getProductSku(p) !== 'Não informado' ? getProductSku(p) : `PROD-${idx + 1001}`;
        const finalSku = prefix1 ? `${prefix1}${rawSku}` : rawSku;
        const costPrice = typeof p.cost === 'number' ? p.cost : Number(parseNumber(p.cost)) || 0;
        const sellPrice = calculateSellingPrice(p, 'UpSeller ERP (Conta 1)', options);
        const weightKg = Number(p.weight) || defaultWeightKg;
        const lengthCm = Number(p.package_length) || defaultLength;
        const widthCm = Number(p.package_width) || defaultWidth;
        const heightCm = Number(p.package_height) || defaultHeight;
        const stock = p.available ? defaultStock : 0;

        return {
          'Conta UpSeller': account1Name,
          'SKU Mestre (Conta 1)': finalSku,
          'SKU Original': rawSku,
          'Nome do Produto': p.name,
          'Preço de Venda (R$)': sellPrice,
          'Preço de Custo (R$)': costPrice || '',
          'Estoque': stock,
          'Estoque Mínimo': 5,
          'Canais Alvo': 'Shopee, TikTok Shop, SHEIN',
          'URL Imagem Principal': p.image || '',
          'Peso (kg)': weightKg,
          'Comprimento (cm)': lengthCm,
          'Largura (cm)': widthCm,
          'Altura (cm)': heightCm,
          'Marca': brand,
          'Categoria': category,
          'Código EAN': p.barcode || '',
          'Descrição': generateProductDescription(p, brand),
        };
      });

    // -------------------------------------------------------------
    // 5. UPSELLER ERP - CONTA 2 (SECUNDÁRIA)
    // -------------------------------------------------------------
    case 'UpSeller ERP (Conta 2)':
      return targetProducts.map((p, idx) => {
        const rawSku = getProductSku(p) !== 'Não informado' ? getProductSku(p) : `PROD-${idx + 1001}`;
        const finalSku = prefix2 ? `${prefix2}${rawSku}` : rawSku;
        const costPrice = typeof p.cost === 'number' ? p.cost : Number(parseNumber(p.cost)) || 0;
        const sellPrice = calculateSellingPrice(p, 'UpSeller ERP (Conta 2)', options);
        const weightKg = Number(p.weight) || defaultWeightKg;
        const lengthCm = Number(p.package_length) || defaultLength;
        const widthCm = Number(p.package_width) || defaultWidth;
        const heightCm = Number(p.package_height) || defaultHeight;
        const stock = p.available ? defaultStock : 0;

        return {
          'Conta UpSeller': account2Name,
          'SKU Mestre (Conta 2)': finalSku,
          'SKU Original': rawSku,
          'Nome do Produto': p.name,
          'Preço de Venda (R$)': sellPrice,
          'Preço de Custo (R$)': costPrice || '',
          'Estoque': stock,
          'Estoque Mínimo': 5,
          'Canais Alvo': 'Shopee, TikTok Shop, SHEIN',
          'URL Imagem Principal': p.image || '',
          'Peso (kg)': weightKg,
          'Comprimento (cm)': lengthCm,
          'Largura (cm)': widthCm,
          'Altura (cm)': heightCm,
          'Marca': brand,
          'Categoria': category,
          'Código EAN': p.barcode || '',
          'Descrição': generateProductDescription(p, brand),
        };
      });

    // -------------------------------------------------------------
    // 6. UPSELLER ERP - MODELO GERAL (MULTI-LOJAS / SINCRONIZAÇÃO)
    // -------------------------------------------------------------
    case 'UpSeller ERP':
    default:
      return targetProducts.map((p, idx) => {
        const rawSku = getProductSku(p) !== 'Não informado' ? getProductSku(p) : `UP-${idx + 1001}`;
        const costPrice = typeof p.cost === 'number' ? p.cost : Number(parseNumber(p.cost)) || 0;
        const sellPrice = calculateSellingPrice(p, 'UpSeller ERP', options);
        const weightKg = Number(p.weight) || defaultWeightKg;
        const lengthCm = Number(p.package_length) || defaultLength;
        const widthCm = Number(p.package_width) || defaultWidth;
        const heightCm = Number(p.package_height) || defaultHeight;
        const stock = p.available ? defaultStock : 0;

        return {
          'SKU Mestre': rawSku,
          'SKU Conta 1': `${prefix1}${rawSku}`,
          'SKU Conta 2': `${prefix2}${rawSku}`,
          'Nome do Produto': p.name,
          'Preço de Venda (R$)': sellPrice,
          'Preço de Custo (R$)': costPrice || '',
          'Estoque Geral': stock,
          'Canais de Publicação': 'Shopee / TikTok Shop / SHEIN',
          'URL Imagem': p.image || '',
          'Peso (kg)': weightKg,
          'Comprimento (cm)': lengthCm,
          'Largura (cm)': widthCm,
          'Altura (cm)': heightCm,
          'Marca': brand,
          'Categoria': category,
          'Código de Barras (EAN)': p.barcode || '',
          'Descrição Completa': generateProductDescription(p, brand),
        };
      });
  }
}

// Master exporter function
export function exportMarketplaceTemplate(
  products: Product[],
  options: MarketplaceConfigOptions
): { fileName: string; count: number } {
  const targetProducts = options.onlyReady
    ? products.filter((p) => p.status === 'Encontrado' || (p.research_records && p.research_records.length > 0))
    : products;

  const count = targetProducts.length;
  const dateStr = new Date().toISOString().slice(0, 10);
  const sanitizedPlatform = options.platform.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const fileName = `catalogo_${sanitizedPlatform}_${dateStr}.${options.format}`;

  let rows = generateMarketplaceRows(targetProducts, options);

  if (rows.length === 0) {
    rows = [{ 'Aviso': 'Nenhum produto selecionado para exportação.' }];
  }

  if (options.format === 'xlsx') {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const colKeys = Object.keys(rows[0] || {});
    worksheet['!cols'] = colKeys.map((k) => ({ wch: Math.max(k.length + 4, 15) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, options.platform.slice(0, 31));
    XLSX.writeFile(workbook, fileName);
  } else {
    // CSV export with UTF-8 BOM so Excel & Google Sheets display Portuguese accents perfectly
    const headers = Object.keys(rows[0] || {});
    const csvLines: string[] = [];
    csvLines.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(';'));
    rows.forEach((row) => {
      const line = headers.map((h) => {
        const val = row[h];
        if (val === undefined || val === null) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvLines.push(line.join(';'));
    });
    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return { fileName, count };
}
