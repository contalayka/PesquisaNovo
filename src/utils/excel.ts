import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Product, ResearchRecord, ProductStatus, ConfidenceLevel } from '../types';

export interface ColumnDetectionResult {
  headers: string[];
  suggestedIdCol: string;
  suggestedNameCol: string;
  suggestedCostCol: string;
  suggestedImageCol: string;
  suggestedAvailableCol: string;
  suggestedStatusCol: string;
  rows: Record<string, unknown>[];
  extractedImagesCount?: number;
}

export function formatCurrency(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === '') return '-';
  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.,-]/g, '').replace(',', '.'));
  if (isNaN(num)) return String(value);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function parseNumber(value: number | string | undefined | null): number | string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number') return value;
  const str = String(value).trim();
  // Handle Brazilian currency formatting e.g. "R$ 1.250,50" or "15,90"
  let cleaned = str.replace(/[^\d.,-]/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Both comma and dot: usually dot is thousand separator, comma is decimal
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? value : parsed;
}

export function normalizeStr(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getImageMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
    case 'jfif':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'svg':
      return 'image/svg+xml';
    case 'avif':
      return 'image/avif';
    default:
      return 'image/jpeg';
  }
}

/**
 * Extract embedded images from .xlsx files using JSZip.
 * Parses Excel drawing anchors (twoCellAnchor/oneCellAnchor), cellimages, and media relationships.
 */
export async function extractEmbeddedImagesFromXlsx(buffer: ArrayBuffer): Promise<{
  byRow: Map<number, string>;
  byCell: Map<string, string>;
  totalCount: number;
  detectedColIdx?: number;
}> {
  const byRow = new Map<number, string>();
  const byCell = new Map<string, string>();
  const colCount = new Map<number, number>();
  let totalCount = 0;

  try {
    const zip = await JSZip.loadAsync(buffer);
    const mediaFiles = Object.keys(zip.files).filter((k) => k.startsWith('xl/media/'));

    if (mediaFiles.length === 0) {
      return { byRow, byCell, totalCount: 0 };
    }

    // 1. Parse drawing relationships: xl/drawings/_rels/drawing*.xml.rels
    const drawingRelsFiles = Object.keys(zip.files).filter(
      (k) => k.startsWith('xl/drawings/_rels/') && k.endsWith('.rels')
    );

    const relsByDrawing = new Map<string, Map<string, string>>();
    for (const relPath of drawingRelsFiles) {
      const drawingName = relPath.replace('xl/drawings/_rels/', '').replace('.rels', '');
      const content = await zip.files[relPath].async('text');
      const relMap = new Map<string, string>();

      const relRegex = /<Relationship[^>]+Id=["']([^"']+)["'][^>]+Target=["']([^"']+)["']/gi;
      let m: RegExpExecArray | null;
      while ((m = relRegex.exec(content)) !== null) {
        let target = m[2];
        if (target.startsWith('../media/')) target = 'xl/media/' + target.replace('../media/', '');
        else if (target.startsWith('media/')) target = 'xl/media/' + target.replace('media/', '');
        else if (!target.startsWith('xl/media/')) target = 'xl/media/' + target;
        relMap.set(m[1], target);
      }

      // Check inverted attribute order
      const relRegexInv = /<Relationship[^>]+Target=["']([^"']+)["'][^>]+Id=["']([^"']+)["']/gi;
      while ((m = relRegexInv.exec(content)) !== null) {
        let target = m[1];
        if (target.startsWith('../media/')) target = 'xl/media/' + target.replace('../media/', '');
        else if (target.startsWith('media/')) target = 'xl/media/' + target.replace('media/', '');
        else if (!target.startsWith('xl/media/')) target = 'xl/media/' + target;
        relMap.set(m[2], target);
      }

      relsByDrawing.set(drawingName, relMap);
    }

    // 2. Parse drawing XML files: xl/drawings/drawing*.xml
    const drawingFiles = Object.keys(zip.files).filter(
      (k) => k.startsWith('xl/drawings/') && !k.includes('_rels') && k.endsWith('.xml')
    );

    for (const dPath of drawingFiles) {
      const drawingName = dPath.replace('xl/drawings/', '');
      const rels = relsByDrawing.get(drawingName) || new Map<string, string>();
      const content = await zip.files[dPath].async('text');

      const anchorRegex = /<xdr:(?:twoCellAnchor|oneCellAnchor)[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/gi;
      const anchors = content.match(anchorRegex) || [];

      for (const anchor of anchors) {
        const colMatch = anchor.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/i);
        const rowMatch = anchor.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/i);
        const blipMatch = anchor.match(/<a:blip[^>]+(?:r:embed|embed)=["']([^"']+)["']/i);

        if (rowMatch && colMatch && blipMatch) {
          const row = parseInt(rowMatch[1], 10);
          const col = parseInt(colMatch[1], 10);
          const rId = blipMatch[1];
          const mediaPath = rels.get(rId);

          if (mediaPath && zip.files[mediaPath]) {
            const base64 = await zip.files[mediaPath].async('base64');
            const mime = getImageMimeType(mediaPath);
            const dataUrl = `data:${mime};base64,${base64}`;

            byRow.set(row, dataUrl);
            byCell.set(`${row}_${col}`, dataUrl);
            colCount.set(col, (colCount.get(col) || 0) + 1);
            totalCount++;
          }
        }
      }
    }

    // 3. Parse in-cell images (Office 365 cellimages.xml)
    if (zip.files['xl/cellimages.xml'] && zip.files['xl/cellimages.xml.rels']) {
      const cellimagesXml = await zip.files['xl/cellimages.xml'].async('text');
      const cellimagesRels = await zip.files['xl/cellimages.xml.rels'].async('text');

      const cellRels = new Map<string, string>();
      const relRegex = /<Relationship[^>]+Id=["']([^"']+)["'][^>]+Target=["']([^"']+)["']/gi;
      let m: RegExpExecArray | null;
      while ((m = relRegex.exec(cellimagesRels)) !== null) {
        let target = m[2];
        if (target.startsWith('../media/')) target = 'xl/media/' + target.replace('../media/', '');
        else if (target.startsWith('media/')) target = 'xl/media/' + target.replace('media/', '');
        else if (!target.startsWith('xl/media/')) target = 'xl/media/' + target;
        cellRels.set(m[1], target);
      }

      // Collect pic blip embeds
      const picRegex = /<a:blip[^>]+(?:r:embed|embed)=["']([^"']+)["']/gi;
      const blipIds: string[] = [];
      while ((m = picRegex.exec(cellimagesXml)) !== null) {
        blipIds.push(m[1]);
      }

      // Match to worksheet cells in sheet1.xml
      const sheetFiles = Object.keys(zip.files).filter(
        (k) => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml')
      );

      for (const sPath of sheetFiles) {
        const sheetContent = await zip.files[sPath].async('text');
        const cellVmRegex = /<c\s+r=["']([A-Z]+)(\d+)["'][^>]*\bvm=["'](\d+)["']/gi;
        while ((m = cellVmRegex.exec(sheetContent)) !== null) {
          const colLetters = m[1];
          const rowNum = parseInt(m[2], 10) - 1; // 0-based
          const vmIdx = parseInt(m[3], 10) - 1;

          let colIdx = 0;
          for (let i = 0; i < colLetters.length; i++) {
            colIdx = colIdx * 26 + (colLetters.charCodeAt(i) - 64);
          }
          colIdx -= 1;

          const rId = blipIds[vmIdx] || blipIds[0];
          if (rId) {
            const mediaPath = cellRels.get(rId);
            if (mediaPath && zip.files[mediaPath]) {
              const base64 = await zip.files[mediaPath].async('base64');
              const mime = getImageMimeType(mediaPath);
              const dataUrl = `data:${mime};base64,${base64}`;

              byRow.set(rowNum, dataUrl);
              byCell.set(`${rowNum}_${colIdx}`, dataUrl);
              colCount.set(colIdx, (colCount.get(colIdx) || 0) + 1);
              totalCount++;
            }
          }
        }
      }
    }

    // 4. Fallback: If drawing anchors didn't map rows but xl/media/ has images, map sequentially
    if (byRow.size === 0 && mediaFiles.length > 0) {
      const sortedMedia = [...mediaFiles].sort((a, b) => {
        const numA = parseInt(a.replace(/[^\d]/g, '') || '0', 10);
        const numB = parseInt(b.replace(/[^\d]/g, '') || '0', 10);
        return numA - numB;
      });

      for (let i = 0; i < sortedMedia.length; i++) {
        const mediaPath = sortedMedia[i];
        const base64 = await zip.files[mediaPath].async('base64');
        const mime = getImageMimeType(mediaPath);
        const dataUrl = `data:${mime};base64,${base64}`;
        // Row 1 is usually the first product row (after header row 0)
        byRow.set(i + 1, dataUrl);
        totalCount++;
      }
    }

    // Determine which column had the most images
    let detectedColIdx: number | undefined;
    let maxColCount = 0;
    colCount.forEach((count, c) => {
      if (count > maxColCount) {
        maxColCount = count;
        detectedColIdx = c;
      }
    });

    return { byRow, byCell, totalCount, detectedColIdx };
  } catch (err) {
    console.warn('Erro na extração de imagens embutidas do XLSX:', err);
    return { byRow, byCell, totalCount: 0 };
  }
}

/**
 * Format and convert image URLs (including Google Drive, Dropbox, protocol-relative, etc.) into direct renderable URLs.
 */
export function formatImageUrl(raw: unknown): string {
  if (!raw) return '';
  let str = String(raw).trim();
  if (!str) return '';

  // Return base64 data URLs as-is
  if (str.startsWith('data:image/')) return str;

  // Strip enclosing quotes, brackets, angle brackets or parentheses
  str = str.replace(/^["'(\[<]+|[)"'>\]]+$/g, '').trim();

  // If Markdown image: ![alt](url)
  const mdMatch = str.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/i);
  if (mdMatch) str = mdMatch[1];

  // If HTML img tag: <img src="url" ...>
  const htmlImgMatch = str.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (htmlImgMatch) str = htmlImgMatch[1];

  // If multiple URLs separated by comma, newline, pipe or semicolon, take the first valid URL
  const urls = str.match(/(?:https?:\/\/|\/\/)[^\s,;"<>'|]+/gi);
  if (urls && urls.length > 0) {
    str = urls[0];
  }

  // Google Drive conversion:
  // Format 1: drive.google.com/file/d/FILE_ID/view...
  const driveFileMatch = str.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveFileMatch && driveFileMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${driveFileMatch[1]}&sz=w1000`;
  }
  // Format 2: drive.google.com/open?id=FILE_ID or ?id=FILE_ID
  const driveIdMatch = str.match(/drive\.google\.com\/.*?[\?&]id=([a-zA-Z0-9_-]+)/i);
  if (driveIdMatch && driveIdMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${driveIdMatch[1]}&sz=w1000`;
  }
  // Format 3: docs.google.com/uc?id=FILE_ID
  const docsMatch = str.match(/docs\.google\.com\/.*?[\?&]id=([a-zA-Z0-9_-]+)/i);
  if (docsMatch && docsMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${docsMatch[1]}&sz=w1000`;
  }

  // Dropbox conversion: replace dl=0 with raw=1
  if (str.includes('dropbox.com')) {
    if (str.includes('dl=0')) return str.replace('dl=0', 'raw=1');
    if (!str.includes('raw=1')) return str + (str.includes('?') ? '&raw=1' : '?raw=1');
  }

  // Protocol-relative URL //domain.com/...
  if (str.startsWith('//')) {
    return `https:${str}`;
  }

  // Domain without protocol www.domain.com/...
  if (str.startsWith('www.')) {
    return `https://${str}`;
  }

  // Upgrade http to https to prevent Mixed Content security blocks
  if (str.startsWith('http://')) {
    return str.replace('http://', 'https://');
  }

  return str;
}

/**
 * Curated high-resolution commercial product photos for home decor categories.
 * Used when a row has no image URL so that NO product is ever left without an image.
 */
export function getFallbackProductPhoto(productName?: string): string {
  const norm = (productName || '').toLowerCase();
  if (norm.includes('vaso') || norm.includes('cachepot') || norm.includes('floreira') || norm.includes('jarro')) {
    return 'https://images.unsplash.com/photo-1581783342308-f792dbdd27c5?auto=format&fit=crop&w=600&q=80';
  }
  if (norm.includes('almofada') || norm.includes('manta') || norm.includes('capa')) {
    return 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=600&q=80';
  }
  if (norm.includes('bandeja') || norm.includes('potiche') || norm.includes('centro de mesa')) {
    return 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=600&q=80';
  }
  if (norm.includes('quadro') || norm.includes('tela') || norm.includes('poster') || norm.includes('arte') || norm.includes('painel')) {
    return 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80';
  }
  if (norm.includes('espelho')) {
    return 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=600&q=80';
  }
  if (
    norm.includes('luminaria') ||
    norm.includes('abajur') ||
    norm.includes('pendente') ||
    norm.includes('lustre') ||
    norm.includes('lampada')
  ) {
    return 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=600&q=80';
  }
  if (
    norm.includes('escultura') ||
    norm.includes('estatueta') ||
    norm.includes('estatua') ||
    norm.includes('objeto') ||
    norm.includes('enfeite')
  ) {
    return 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80';
  }
  if (
    norm.includes('prato') ||
    norm.includes('taca') ||
    norm.includes('copo') ||
    norm.includes('xicara') ||
    norm.includes('caneca') ||
    norm.includes('louca') ||
    norm.includes('travessa')
  ) {
    return 'https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?auto=format&fit=crop&w=600&q=80';
  }
  if (norm.includes('vela') || norm.includes('difusor') || norm.includes('aromatizador') || norm.includes('castical')) {
    return 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=600&q=80';
  }
  if (norm.includes('relogio')) {
    return 'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?auto=format&fit=crop&w=600&q=80';
  }
  if (norm.includes('organizador') || norm.includes('caixa') || norm.includes('cesto') || norm.includes('gaveteiro')) {
    return 'https://images.unsplash.com/photo-1591129841119-c48ec4e698e5?auto=format&fit=crop&w=600&q=80';
  }
  return 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=600&q=80';
}

/**
 * Check if a string looks like a genuine image URL or asset (NOT a general webpage, start URL or scraper metadata)
 */
export function isActualImageSource(val: unknown): boolean {
  if (!val) return false;
  const s = String(val).trim();
  if (!s) return false;

  // 1. Data URLs
  if (s.startsWith('data:image/')) return true;

  const lower = s.toLowerCase();

  // EXPLICIT BLACKLIST: Web scraper metadata, category URLs, sitemaps, HTML pages
  if (
    lower.includes('web_scraper') ||
    lower.includes('web-scraper') ||
    lower.includes('start_url') ||
    lower.includes('start-url')
  ) {
    return false;
  }

  // Reject plain HTML / script pages unless there's an image extension in query
  if (
    lower.endsWith('.html') ||
    lower.endsWith('.htm') ||
    lower.endsWith('.php') ||
    lower.endsWith('.asp') ||
    lower.endsWith('.aspx')
  ) {
    return false;
  }

  // 2. Direct image file extensions (with or without query parameters)
  const hasImageExt = /\.(jpe?g|png|webp|gif|svg|avif|jfif|bmp|ico|tiff?)(\?.*)?$/i.test(s) ||
    /\.(jpe?g|png|webp|gif|svg|avif|jfif|bmp|ico|tiff?)[#&?]/i.test(s);
  if (hasImageExt) return true;

  // 3. Known e-commerce CDNs and image storage paths (VTEX, Cloudinary, AWS S3, Shopify, Mercado Livre)
  if (
    lower.includes('/arquivos/ids/') || // Standard VTEX product image path!
    lower.includes('vteximg.') ||       // VTEX CDN
    lower.includes('vtexassets.') ||    // VTEX CDN
    lower.includes('/cdn-cgi/image/') ||// Cloudflare Image Resizing
    lower.includes('mlstatic.com') ||
    lower.includes('googleusercontent.com') ||
    lower.includes('drive.google.com') ||
    lower.includes('dropbox.com') ||
    lower.includes('cloudinary.com') ||
    lower.includes('wsrv.nl') ||
    lower.includes('cdn.shopify.com') ||
    lower.includes('images.unsplash.com') ||
    lower.includes('/images/') ||
    lower.includes('/image/') ||
    lower.includes('/fotos/') ||
    lower.includes('/foto/') ||
    lower.includes('/img/') ||
    lower.includes('/media/') ||
    lower.includes('/products/') ||
    lower.includes('/produtos/') ||
    lower.includes('/uploads/')
  ) {
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('//') || s.startsWith('/')) {
      return true;
    }
  }

  // 4. Relative paths starting with / or ./ that have image extensions
  if ((s.startsWith('/') || s.startsWith('./') || s.startsWith('//')) && hasImageExt) {
    return true;
  }

  return false;
}

/**
 * Backward-compatible check for image URLs or links
 */
export function isImageUrlOrLink(val: unknown): boolean {
  return isActualImageSource(val);
}

/**
 * Extract website origin/domain (e.g. "https://casavitadecor.com.br") from row data or strings
 */
export function extractBaseOrigin(row?: Record<string, unknown>): string {
  if (!row) return '';
  for (const [key, val] of Object.entries(row)) {
    const s = String(val || '').trim();
    if (s.startsWith('http://') || s.startsWith('https://')) {
      try {
        const u = new URL(s);
        return `${u.protocol}//${u.host}`;
      } catch {
        // ignore
      }
    }
  }
  return '';
}

/**
 * Resolves an image URL with full fallback scanning across all columns in the row,
 * relative path expansion, and contextual decor photo fallback.
 */
export function resolveImageUrl(
  rawImage: unknown,
  rowContext?: Record<string, unknown>,
  fallbackName?: string
): string {
  let imgStr = rawImage !== undefined && rawImage !== null ? String(rawImage).trim() : '';

  // 1. Check embedded image from XLSX binary
  if (rowContext && rowContext['__embedded_image__'] && typeof rowContext['__embedded_image__'] === 'string') {
    return rowContext['__embedded_image__'];
  }

  // 2. If rawImage is already a genuine image source
  if (imgStr && isActualImageSource(imgStr)) {
    const formatted = formatImageUrl(imgStr);
    if (formatted) return formatted;
  }

  // 3. If rawImage is missing, an invalid webpage URL (like web_scraper_start_url), or empty:
  // Scan EVERY column in rowContext to locate the real image!
  if (rowContext) {
    const baseOrigin = extractBaseOrigin(rowContext);

    // Pass 1: Columns with image-related names
    for (const [colName, val] of Object.entries(rowContext)) {
      if (!val) continue;
      const colNorm = normalizeStr(colName).toLowerCase();
      if (
        colNorm.includes('start_url') ||
        colNorm.includes('web_scraper') ||
        colNorm.includes('scraper')
      ) {
        continue;
      }

      const s = String(val).trim();
      if (isActualImageSource(s)) {
        if (s.startsWith('/') && baseOrigin) {
          return `${baseOrigin}${s}`;
        }
        return formatImageUrl(s);
      }
    }

    // Pass 2: Check any column that has a relative image path (e.g., /arquivos/ids/... or ends with .jpg)
    for (const [colName, val] of Object.entries(rowContext)) {
      if (!val) continue;
      const colNorm = normalizeStr(colName).toLowerCase();
      if (colNorm.includes('start_url') || colNorm.includes('web_scraper')) continue;

      const s = String(val).trim();
      if ((s.startsWith('/') || s.startsWith('./') || s.startsWith('//')) && isActualImageSource(s)) {
        if (s.startsWith('//')) return `https:${s}`;
        if (baseOrigin) return `${baseOrigin}${s.startsWith('./') ? s.slice(1) : s}`;
      }
    }

    // Pass 3: Check any column that has an image extension or CDN link
    for (const [colName, val] of Object.entries(rowContext)) {
      if (!val) continue;
      const colNorm = normalizeStr(colName).toLowerCase();
      if (colNorm.includes('start_url') || colNorm.includes('web_scraper')) continue;

      const s = String(val).trim();
      if (isActualImageSource(s)) {
        return formatImageUrl(s);
      }
    }
  }

  // 4. If rawImage starts with a relative slash, resolve with base origin if available
  if (imgStr.startsWith('/') && rowContext) {
    const baseOrigin = extractBaseOrigin(rowContext);
    if (baseOrigin) {
      return `${baseOrigin}${imgStr}`;
    }
  }

  // 5. Final fallback: Contextual high-quality product photo so images ALWAYS appear!
  return getFallbackProductPhoto(fallbackName);
}

/**
 * Creates a unique signature for duplicate detection during catalog merges.
 * Uses SKU/ID if present, or normalized name.
 */
export function getProductSignature(p: { id?: string | number; name: string; cost?: number | string; image?: string }): string {
  const strId = p.id !== undefined && p.id !== null ? String(p.id).trim() : '';
  if (strId && !strId.startsWith('prod_')) {
    return `id_${normalizeStr(strId)}`;
  }
  const normName = normalizeStr(p.name);
  return `name_${normName}`;
}

/**
 * High-accuracy column detector that analyzes both header names and cell contents across all rows.
 */
export function detectColumns(sheetData: Record<string, unknown>[]): ColumnDetectionResult {
  if (!sheetData || sheetData.length === 0) {
    return {
      headers: [],
      suggestedIdCol: '',
      suggestedNameCol: '',
      suggestedCostCol: '',
      suggestedImageCol: '',
      suggestedAvailableCol: '',
      suggestedStatusCol: '',
      rows: [],
    };
  }

  const headers = Object.keys(sheetData[0]);

  // Estrutura conhecida do CSV do PDVMaster/Web Scraper.
  // Não usa heurística neste formato: cada coluna tem uma função fixa.
  const normalizedHeaders = new Map(
    headers.map((h) => [
      normalizeStr(h.replace(/^\\ufeff/, '')).replace(/[^a-z0-9]+/g, ' ').trim(),
      h,
    ])
  );
  const pdvName = normalizedHeaders.get('data');
  const pdvCost = normalizedHeaders.get('data2');
  const pdvImage = normalizedHeaders.get('image');
  const pdvAvailable = normalizedHeaders.get('data4');
  const pdvId = normalizedHeaders.get('web scraper order');

  if (pdvName && pdvCost && pdvImage && pdvAvailable) {
    return {
      headers,
      suggestedIdCol: pdvId || '',
      suggestedNameCol: pdvName,
      suggestedCostCol: pdvCost,
      suggestedImageCol: pdvImage,
      suggestedAvailableCol: pdvAvailable,
      // data3 = "Adicionar": metadado/ação, não status.
      suggestedStatusCol: '',
      rows: sheetData,
    };
  }

  // Scores for each header
  const idScores = new Map<string, number>();
  const nameScores = new Map<string, number>();
  const costScores = new Map<string, number>();
  const imageScores = new Map<string, number>();
  const availableScores = new Map<string, number>();
  const statusScores = new Map<string, number>();

  headers.forEach((h) => {
    idScores.set(h, 0);
    nameScores.set(h, 0);
    costScores.set(h, 0);
    imageScores.set(h, 0);
    availableScores.set(h, 0);
    statusScores.set(h, 0);
  });

  // Keywords definitions
  const codeIdKeywords = ['codigo', 'cod', 'sku', 'ref', 'referencia', 'identificador', 'barcode', 'ean'];
  const nameKeywords = ['nome', 'descricao', 'desc', 'titulo', 'mercadoria', 'especificacao'];
  const costKeywords = ['custo', 'preco de custo', 'precocusto', 'valor de custo', 'valorcusto', 'custo unitario'];
  const generalPriceKeywords = ['preco', 'valor', 'price', 'cost', 'unitario'];
  const imageKeywords = [
    'imagem',
    'foto',
    'fotos',
    'imagens',
    'img',
    'imgs',
    'link',
    'url',
    'anexo',
    'anexos',
    'picture',
    'photo',
    'photos',
    'image',
    'images',
    'thumb',
    'thumbnail',
    'miniatura',
    'midia',
    'midias',
    'mídia',
    'mídias',
    'capa',
    'drive',
    'catalogo',
  ];
  const availableKeywords = ['disponibilidade', 'disponivel', 'estoque', 'ativo', 'stock', 'available'];
  const statusKeywords = ['status', 'situacao', 'estado'];
  const competitorKeywords = ['anuncio', 'concorrente', 'loja', 'upseller', 'mercadolivre', 'shopee', 'concorrencia'];

    // Image column matching
    const imageKeywordsExtended = [
      'imagem',
      'foto',
      'fotos',
      'imagens',
      'img',
      'imgs',
      'image',
      'images',
      'photo',
      'photos',
      'picture',
      'thumb',
      'thumbnail',
      'miniatura',
      'midia',
      'midias',
      'capa',
      'drive',
      'catalogo',
      'image-src',
      'img-src',
      'foto-src',
      'imagem-src',
      'data-src',
      'picture-src',
      'imagesrc',
      'imgsrc',
      'fotosrc',
      'imagemsrc',
      'datasrc',
      'src',
    ];

  // 1. Analyze Header Names
  headers.forEach((h) => {
    const norm = normalizeStr(h).replace(/[^a-z0-9]/g, ' ');
    const tokens = norm.split(/\s+/).filter(Boolean);
    const compact = norm.replace(/\s+/g, '');

    // CRITICAL: Immediately blacklist Web Scraper metadata from ever being selected as Image, Name, or Cost!
    const isScraperMeta =
      norm.includes('web scraper') ||
      norm.includes('webscraper') ||
      norm.includes('start url') ||
      norm.includes('starturl') ||
      compact.includes('scraper') ||
      compact.includes('starturl');

    if (isScraperMeta) {
      imageScores.set(h, -1000);
      costScores.set(h, -1000);
      nameScores.set(h, -1000);
      availableScores.set(h, -1000);
      statusScores.set(h, -1000);
      if (compact.includes('order')) {
        idScores.set(h, 5); // can serve as order identifier
      } else {
        idScores.set(h, -1000);
      }
      return;
    }

    // Is it explicitly a Code/ID column?
    const hasCodeWord = codeIdKeywords.some((k) => tokens.includes(k) || compact.includes(k) || compact.startsWith('id'));
    const isIdExact = norm === 'id' || norm === 'codigo' || norm === 'cod' || norm === 'sku' || norm === 'ref';

    if (isIdExact) {
      idScores.set(h, (idScores.get(h) || 0) + 10);
    } else if (hasCodeWord) {
      idScores.set(h, (idScores.get(h) || 0) + 7);
    }

    // Name column matching
    // CRITICAL: If header has 'codigo' or 'cod' or 'id', it MUST NOT be matched as Name!
    if (!hasCodeWord && !compact.startsWith('id')) {
      if (nameKeywords.some((k) => tokens.includes(k) || compact.includes(k))) {
        nameScores.set(h, (nameScores.get(h) || 0) + 8);
      } else if (tokens.includes('produto') || compact === 'produto') {
        nameScores.set(h, (nameScores.get(h) || 0) + 7);
      } else if (tokens.includes('item') || compact === 'item') {
        nameScores.set(h, (nameScores.get(h) || 0) + 5);
      }
    } else {
      // Penalize name score if it has 'codigo' or 'id'
      nameScores.set(h, (nameScores.get(h) || 0) - 10);
    }

    // Cost column matching
    if (costKeywords.some((k) => norm.includes(k) || compact.includes(k.replace(/\s+/g, '')))) {
      costScores.set(h, (costScores.get(h) || 0) + 9);
    } else if (generalPriceKeywords.some((k) => tokens.includes(k) || compact.includes(k))) {
      costScores.set(h, (costScores.get(h) || 0) + 5);
    }

    // Image column matching
    const isCompetitorCol = competitorKeywords.some((k) => norm.includes(k) || compact.includes(k));
    if (!isCompetitorCol) {
      if (imageKeywordsExtended.some((k) => tokens.includes(k) || compact.includes(k) || compact.endsWith('-src') || compact.endsWith('_src'))) {
        imageScores.set(h, (imageScores.get(h) || 0) + 20);
      }
    } else {
      // Penalize competitor link columns so they are not mistaken for product images
      imageScores.set(h, (imageScores.get(h) || 0) - 50);
    }

    // Available matching
    if (availableKeywords.some((k) => tokens.includes(k) || compact.includes(k))) {
      availableScores.set(h, (availableScores.get(h) || 0) + 8);
    }

    // Status matching
    if (statusKeywords.some((k) => tokens.includes(k) || compact.includes(k))) {
      statusScores.set(h, (statusScores.get(h) || 0) + 8);
    }
  });

  // 2. Analyze Cell Contents across rows to reinforce or correct column types!
  const sampleRows = sheetData.slice(0, 50);
  headers.forEach((h) => {
    // If blacklisted, skip
    if ((imageScores.get(h) || 0) < -100) return;

    let realImageCount = 0;
    let base64Count = 0;
    let longTextCount = 0;
    let numericCount = 0;
    let shortCodeCount = 0;
    let totalNonEmpty = 0;

    sampleRows.forEach((row) => {
      const val = row[h];
      if (val === undefined || val === null || val === '') return;
      totalNonEmpty++;
      const strVal = String(val).trim();

      // Check if URL or embedded image
      if (strVal.startsWith('data:image/')) {
        base64Count++;
        realImageCount++;
      } else if (isActualImageSource(strVal)) {
        realImageCount++;
      }

      // Check if numeric or currency
      const isNum = !isNaN(Number(strVal.replace(',', '.'))) || strVal.startsWith('R$');
      if (isNum) {
        numericCount++;
      }

      // Check if short code (e.g. "1001", "PRD-01", "789123456789")
      if (strVal.length <= 15 && (/^\d+$/.test(strVal) || /^[A-Z0-9_-]+$/i.test(strVal))) {
        shortCodeCount++;
      }

      // Check if descriptive text with spaces (e.g. "SACOLA DE PRESENTE DE PAPEL")
      if (strVal.length > 5 && strVal.includes(' ') && /[a-zA-ZÀ-ÿ]/.test(strVal)) {
        longTextCount++;
      }
    });

    if (totalNonEmpty > 0) {
      // If column contains genuine images (base64 or actual image URLs), it is DEFINITIVELY the Image column!
      if (base64Count > 0) {
        imageScores.set(h, (imageScores.get(h) || 0) + 150);
      }
      const imageRatio = realImageCount / totalNonEmpty;
      if (imageRatio > 0.05) {
        imageScores.set(h, (imageScores.get(h) || 0) + 120);
      }

      // If column has long descriptive text with Portuguese letters, it is definitively a Name column!
      const textRatio = longTextCount / totalNonEmpty;
      if (textRatio > 0.3) {
        nameScores.set(h, (nameScores.get(h) || 0) + 12);
        // Strongly reduce ID score for descriptive text columns
        idScores.set(h, (idScores.get(h) || 0) - 8);
      }

      // If column has mostly short codes or digits, it's an ID column and NOT a Name column!
      const codeRatio = shortCodeCount / totalNonEmpty;
      if (codeRatio > 0.6) {
        idScores.set(h, (idScores.get(h) || 0) + 8);
        nameScores.set(h, (nameScores.get(h) || 0) - 10);
      }

      // If column is numeric or currency, it's a Cost candidate
      const numRatio = numericCount / totalNonEmpty;
      if (numRatio > 0.5) {
        costScores.set(h, (costScores.get(h) || 0) + 5);
      }
    }
  });

  // Helper to pick highest scoring column above threshold
  const pickBest = (scores: Map<string, number>, minScore = 1, exclude: Set<string> = new Set()): string => {
    let bestCol = '';
    let max = minScore - 0.01;
    scores.forEach((score, col) => {
      if (!exclude.has(col) && score > max) {
        max = score;
        bestCol = col;
      }
    });
    return bestCol;
  };

  const chosen = new Set<string>();

  // 1. Pick Image Column
  const suggestedImageCol = pickBest(imageScores, 1, chosen);
  if (suggestedImageCol) chosen.add(suggestedImageCol);

  // 2. Pick Name Column
  let suggestedNameCol = pickBest(nameScores, 1, chosen);
  if (suggestedNameCol) chosen.add(suggestedNameCol);

  // 3. Pick Cost Column
  let suggestedCostCol = pickBest(costScores, 1, chosen);
  if (suggestedCostCol) chosen.add(suggestedCostCol);

  // 4. Pick ID Column
  const suggestedIdCol = pickBest(idScores, 1, chosen);
  if (suggestedIdCol) chosen.add(suggestedIdCol);

  // 5. Pick Available Column
  const suggestedAvailableCol = pickBest(availableScores, 1, chosen);
  if (suggestedAvailableCol) chosen.add(suggestedAvailableCol);

  // 6. Pick Status Column
  const suggestedStatusCol = pickBest(statusScores, 1, chosen);
  if (suggestedStatusCol) chosen.add(suggestedStatusCol);

  // Fallbacks if not picked:
  // If Name wasn't picked, find any column with strings, NOT matching ID
  if (!suggestedNameCol) {
    const candidate = headers.find((h) => h !== suggestedIdCol && h !== suggestedImageCol && h !== suggestedCostCol);
    suggestedNameCol = candidate || headers[0] || '';
  }

  // If Cost wasn't picked, find remaining numeric column
  if (!suggestedCostCol) {
    const candidate = headers.find((h) => h !== suggestedNameCol && h !== suggestedIdCol && h !== suggestedImageCol);
    if (candidate) suggestedCostCol = candidate;
  }

  return {
    headers,
    suggestedIdCol,
    suggestedNameCol,
    suggestedCostCol,
    suggestedImageCol,
    suggestedAvailableCol,
    suggestedStatusCol,
    rows: sheetData,
  };
}

/**
 * Convert spreadsheet rows into typed Product entities with auto-recovery for missing or misaligned image/name columns.
 */
export function convertRowsToProducts(
  rows: Record<string, unknown>[],
  nameCol: string,
  costCol: string,
  imageCol: string,
  availableCol?: string,
  idCol?: string,
  statusCol?: string
): Product[] {
  return rows
    .map((row, index) => {
      let rawName = nameCol ? row[nameCol] : '';
      let rawCost = costCol ? row[costCol] : '';
      let rawImage = imageCol ? row[imageCol] : '';
      let rawAvailable = availableCol ? row[availableCol] : true;
      let rawId = idCol ? row[idCol] : '';
      let rawStatus = statusCol ? row[statusCol] : '';

      // --- AUTO-RECOVERY FOR NAME ---
      // If rawName is empty OR looks like a pure numeric code, check if another column has the actual text description!
      let strName = rawName !== undefined && rawName !== null ? String(rawName).trim() : '';
      const isPureNumeric = /^\d+$/.test(strName);
      if (!strName || (isPureNumeric && !rawId)) {
        // If the mapped name was actually a code, move it to rawId!
        if (isPureNumeric && !rawId) {
          rawId = strName;
        }
        // Look for another column that has descriptive text
        for (const [colName, val] of Object.entries(row)) {
          if (colName !== nameCol && colName !== costCol && colName !== imageCol) {
            const valStr = String(val || '').trim();
            if (valStr.length > 3 && /[a-zA-ZÀ-ÿ]/.test(valStr) && !isImageUrlOrLink(valStr)) {
              strName = valStr;
              break;
            }
          }
        }
      }

      // If still no name, skip blank row
      if (!strName) return null;

      // --- ROBUST IMAGE RESOLUTION ---
      // Automatically extracts embedded image, resolves URL, falls back across all columns,
      // expands relative store URLs with domain, or provides a curated decor product photo.
      const cleanImage = resolveImageUrl(rawImage, row, strName);

      const cost = parseNumber(rawCost as string | number);

      // Parse availability
      let available = true;
      if (rawAvailable !== undefined && rawAvailable !== null && rawAvailable !== '') {
        const strAvail = String(rawAvailable).toLowerCase().trim();
        if (
          strAvail === 'não' ||
          strAvail === 'nao' ||
          strAvail === 'false' ||
          strAvail === '0' ||
          strAvail === 'indisponivel' ||
          strAvail === 'indisponível'
        ) {
          available = false;
        }
      }

      // Parse status
      let status: ProductStatus = 'Pendente';
      if (rawStatus) {
        const normStatus = normalizeStr(String(rawStatus));
        if (normStatus.includes('encontrado')) status = 'Encontrado';
        else if (normStatus.includes('revisar')) status = 'Revisar';
        else if (normStatus.includes('descartado')) status = 'Descartado';
        else if (normStatus.includes('pendente') || normStatus.includes('pesquisando')) status = 'Pendente';
      }

      const id = rawId && String(rawId).trim() ? String(rawId).trim() : `prod_${index + 1}_${Date.now().toString(36)}`;

      const product: Product = {
        id,
        name: strName,
        cost,
        available,
        image: cleanImage,
        status,
        is_new: false,
        research_records: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        rawColumns: row,
      };

      return product;
    })
    .filter((p): p is Product => p !== null);
}

/**
 * Merge newly imported products into existing catalog without deleting existing items
 * and strictly preserving all previous research records and status.
 */
export function mergeCatalogs(
  existingProducts: Product[],
  importedProducts: Product[]
): {
  merged: Product[];
  newCount: number;
  preservedCount: number;
  newProducts: Product[];
} {
  const existingById = new Map<string, Product>();
  const existingByName = new Map<string, Product>();

  for (const p of existingProducts) {
    if (p.id) {
      existingById.set(String(p.id).trim(), p);
    }
    const normName = normalizeStr(p.name);
    if (normName) {
      existingByName.set(normName, p);
    }
  }

  let newCount = 0;
  let preservedCount = 0;
  const newProducts: Product[] = [];
  const mergedList: Product[] = [...existingProducts];

  for (const imported of importedProducts) {
    const importedIdStr = imported.id ? String(imported.id).trim() : '';
    const importedNormName = normalizeStr(imported.name);

    // 1. Try matching by ID first (if not an auto-generated id)
    let existing: Product | undefined;
    if (importedIdStr && !importedIdStr.startsWith('prod_')) {
      existing = existingById.get(importedIdStr);
    }

    // 2. If not matched by ID, try matching by normalized name
    if (!existing && importedNormName) {
      existing = existingByName.get(importedNormName);
    }

    // 3. If matched, NEVER alter the existing record.
    // Importação de catálogo é somente aditiva: pesquisa, status, imagem, custo,
    // disponibilidade e demais dados já salvos permanecem exatamente como estão.
    if (existing) {
      preservedCount++;
      continue;
    } else {
      // 4. If truly new product, append with is_new flag
      newCount++;
      const newProd: Product = {
        ...imported,
        is_new: true,
        status: 'Pendente',
        research_records: [],
      };
      mergedList.push(newProd);
      newProducts.push(newProd);
      if (newProd.id) {
        existingById.set(String(newProd.id).trim(), newProd);
      }
      if (importedNormName) {
        existingByName.set(importedNormName, newProd);
      }
    }
  }

  return {
    merged: mergedList,
    newCount,
    preservedCount,
    newProducts,
  };
}

/**
 * Read spreadsheet with pre-processing for cell hyperlinks, formulas, embedded image extraction, and automatic header row detection.
 */
export async function readSpreadsheetFile(file: File): Promise<ColumnDetectionResult> {
  const buffer = await file.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('Não foi possível ler o arquivo selecionado.');
  }

  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv');

  // 1. Extract embedded images (Office drawings, cellimages, media files) via JSZip for XLSX
  const embeddedImages: {
    byRow: Map<number, string>;
    byCell: Map<string, string>;
    totalCount: number;
    detectedColIdx?: number;
  } = !isCsv
    ? await extractEmbeddedImagesFromXlsx(buffer)
    : { byRow: new Map(), byCell: new Map(), totalCount: 0, detectedColIdx: undefined };

  let workbook: XLSX.WorkBook;

  if (isCsv) {
    // Decode CSV text handling UTF-8 and ISO-8859-1 (Latin1)
    let text = new TextDecoder('utf-8').decode(buffer);
    if ((text.match(/\ufffd/g) || []).length > 2) {
      try {
        text = new TextDecoder('iso-8859-1').decode(buffer);
      } catch {
        // keep utf-8
      }
    }

    // Auto-detect delimiter (comma, semicolon, tab, pipe)
    const sampleLines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
    let delimiter = ',';
    let maxSplits = 0;
    for (const d of [',', ';', '\t', '|']) {
      let count = 0;
      for (const line of sampleLines) {
        count += line.split(d).length;
      }
      if (count > maxSplits) {
        maxSplits = count;
        delimiter = d;
      }
    }

    workbook = XLSX.read(text, {
      type: 'string',
      FS: delimiter,
      raw: false,
    });
  } else {
    workbook = XLSX.read(buffer, {
      type: 'array',
      cellFormula: true,
      cellHTML: true,
      cellStyles: true,
      raw: false,
    });
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('A planilha está vazia ou não possui abas.');
  }

  const worksheet = workbook.Sheets[firstSheetName];

  // Pre-process cells: extract hyperlinks and formulas, but only if they are real links
  for (const cellAddress in worksheet) {
    if (cellAddress.startsWith('!')) continue;
    const cell = worksheet[cellAddress];
    if (!cell) continue;

    // Check if cell has a hyperlink target in Excel
    if (cell.l && cell.l.Target) {
      const target = String(cell.l.Target).trim();
      if (isImageUrlOrLink(target) || target.startsWith('http')) {
        cell.v = target;
        cell.w = target;
        cell.t = 's';
      }
    }

    // Check if cell has a formula containing a URL (only if cell.v is not already valid text/url)
    if (cell.f && (!cell.v || cell.v === '#VALUE!' || !isImageUrlOrLink(cell.v))) {
      const urlMatch = String(cell.f).match(/https?:\/\/[^"',)\s]+/i);
      if (urlMatch) {
        cell.v = urlMatch[0];
        cell.w = urlMatch[0];
        cell.t = 's';
      }
    }
  }

  // 2. DETECT THE TRUE HEADER ROW (ignoring title rows, empty rows, store names on row 1, etc.)
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: false });
  if (!aoa || aoa.length === 0) {
    throw new Error('A planilha não contém dados legíveis.');
  }

  const headerKeywords = [
    'codigo',
    'cod',
    'id',
    'sku',
    'ref',
    'nome',
    'produto',
    'descricao',
    'desc',
    'titulo',
    'custo',
    'preco',
    'valor',
    'foto',
    'imagem',
    'link',
    'url',
    'disponibilidade',
    'estoque',
    'status',
  ];

  let bestHeaderRowIdx = 0;
  let maxHeaderScore = -1;

  const maxScanRows = Math.min(15, aoa.length);
  for (let rIdx = 0; rIdx < maxScanRows; rIdx++) {
    const row = aoa[rIdx];
    if (!Array.isArray(row) || row.length === 0) continue;
    let score = 0;
    for (const cell of row) {
      const str = normalizeStr(String(cell || '')).replace(/[^a-z0-9]/g, ' ');
      const tokens = str.split(/\s+/).filter(Boolean);
      if (tokens.some((t) => headerKeywords.includes(t))) {
        score += 2;
      }
    }
    if (score > maxHeaderScore) {
      maxHeaderScore = score;
      bestHeaderRowIdx = rIdx;
    }
  }

  // If no row matched header keywords with high score, default to row 0
  if (maxHeaderScore < 2) {
    bestHeaderRowIdx = 0;
  }

  // Extract header names
  const rawHeaders = (aoa[bestHeaderRowIdx] as unknown[]).map((h, i) => {
    const s = String(h || '').trim();
    return s || `Coluna_${i + 1}`;
  });

  // Ensure unique header names
  const headerCounts = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const count = headerCounts.get(h) || 0;
    headerCounts.set(h, count + 1);
    return count === 0 ? h : `${h}_${count + 1}`;
  });

  // If embedded images were found, identify the best column or add a dedicated 'Foto (Planilha)' column
  let embeddedImageColName = '';
  if (embeddedImages.totalCount > 0) {
    // Check if any existing header is already an image column
    const existingImgHeader = headers.find((h) => {
      const norm = normalizeStr(h);
      return norm.includes('foto') || norm.includes('imagem') || norm.includes('img') || norm.includes('midia');
    });

    if (existingImgHeader) {
      embeddedImageColName = existingImgHeader;
    } else if (
      embeddedImages.detectedColIdx !== undefined &&
      embeddedImages.detectedColIdx < headers.length &&
      headers[embeddedImages.detectedColIdx]
    ) {
      embeddedImageColName = headers[embeddedImages.detectedColIdx];
    } else {
      embeddedImageColName = 'Foto (Planilha)';
      headers.push(embeddedImageColName);
    }
  }

  // 3. Build data rows starting from the row after bestHeaderRowIdx
  const jsonRows: Record<string, unknown>[] = [];
  for (let rIdx = bestHeaderRowIdx + 1; rIdx < aoa.length; rIdx++) {
    const rowArr = aoa[rIdx] as unknown[];
    if (!Array.isArray(rowArr) || rowArr.length === 0) continue;

    const rowObj: Record<string, unknown> = {};
    let hasAnyData = false;

    headers.forEach((headerName, colIdx) => {
      const val = rowArr[colIdx] !== undefined ? rowArr[colIdx] : '';
      rowObj[headerName] = val;
      if (val !== '' && val !== null && val !== undefined) {
        hasAnyData = true;
      }
    });

    // Check if there is an embedded image for this row
    // (Check both absolute row index and relative row index after headers)
    const embeddedImg =
      embeddedImages.byRow.get(rIdx) ||
      embeddedImages.byRow.get(rIdx - bestHeaderRowIdx) ||
      (embeddedImages.detectedColIdx !== undefined
        ? embeddedImages.byCell.get(`${rIdx}_${embeddedImages.detectedColIdx}`)
        : undefined);

    if (embeddedImg) {
      rowObj['__embedded_image__'] = embeddedImg;
      if (embeddedImageColName) {
        // If the cell in the designated column is empty or not a valid URL, populate with the embedded image data URL
        if (!rowObj[embeddedImageColName] || !isImageUrlOrLink(rowObj[embeddedImageColName])) {
          rowObj[embeddedImageColName] = embeddedImg;
          hasAnyData = true;
        }
      }
    }

    if (hasAnyData) {
      jsonRows.push(rowObj);
    }
  }

  if (jsonRows.length === 0) {
    throw new Error('Nenhuma linha de produto encontrada após a linha de cabeçalho.');
  }

  const detection = detectColumns(jsonRows);
  if (embeddedImages.totalCount > 0 && embeddedImageColName) {
    detection.suggestedImageCol = embeddedImageColName;
  }
  detection.extractedImagesCount = embeddedImages.totalCount;

  return detection;
}

export function buildExportRows(products: Product[]) {
  const rows: Record<string, unknown>[] = [];

  products.forEach((p, idx) => {
    const baseInfo = {
      'Nº': idx + 1,
      'Código / ID': p.id,
      'Nome do Produto': p.name,
      'Custo (R$)': typeof p.cost === 'number' ? p.cost : p.cost || '',
      'Disponibilidade': p.available ? 'Disponível' : 'Indisponível',
      'Status': p.status,
      'Novo?': p.is_new ? 'Sim' : 'Não',
      'Link da Imagem': p.image || '',
    };

    if (p.research_records && p.research_records.length > 0) {
      p.research_records.forEach((r, optIdx) => {
        rows.push({
          ...baseInfo,
          'Opção': `Opção ${optIdx + 1}`,
          'Nome Encontrado': r.found_name || '',
          'Plataforma': r.platform || '',
          'Loja': r.store || '',
          'Link do Anúncio (UpSeller)': r.url || '',
          'Preço Encontrado (R$)': r.price !== undefined && r.price !== '' ? r.price : '',
          'Confiança': r.confidence || '',
          'Observação': r.note || '',
          'Data da Pesquisa': r.researched_at ? new Date(r.researched_at).toLocaleDateString('pt-BR') : '',
        });
      });
    } else {
      rows.push({
        ...baseInfo,
        'Opção': '-',
        'Nome Encontrado': '',
        'Plataforma': '',
        'Loja': '',
        'Link do Anúncio (UpSeller)': '',
        'Preço Encontrado (R$)': '',
        'Confiança': '',
        'Observação': '',
        'Data da Pesquisa': '',
      });
    }
  });

  return rows;
}

export function exportProductsToExcel(products: Product[]) {
  if (products.length === 0) return;

  const exportRows = buildExportRows(products);
  const worksheet = XLSX.utils.json_to_sheet(exportRows);

  const colKeys = Object.keys(exportRows[0]);
  worksheet['!cols'] = colKeys.map((key) => {
    const maxLen = Math.max(
      key.length,
      ...exportRows.map((r) => String((r as Record<string, unknown>)[key] || '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 3, 10), 60) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pesquisa de Produtos');

  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `pesquisa_produtos_${dateStr}.xlsx`);
}

export function exportProductsToCsv(products: Product[]) {
  if (products.length === 0) return;

  const exportRows = buildExportRows(products);
  if (exportRows.length === 0) return;

  const headers = Object.keys(exportRows[0]);
  const csvLines: string[] = [];

  csvLines.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(';'));

  exportRows.forEach((row) => {
    const line = headers.map((h) => {
      const val = (row as Record<string, unknown>)[h];
      if (val === undefined || val === null) return '""';
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    csvLines.push(line.join(';'));
  });

  const csvContent = '\uFEFF' + csvLines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `pesquisa_produtos_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSampleTemplate() {
  const sampleHeaders = [
    {
      'Código': '1001',
      'Nome do Produto': 'Sacola de Presente Kraft P',
      'Preço de Custo': 2.9,
      'Disponibilidade': 'Sim',
      'Foto': 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=500',
    },
    {
      'Código': '1002',
      'Nome do Produto': 'Copo Térmico Inox 500ml',
      'Preço de Custo': 24.5,
      'Disponibilidade': 'Sim',
      'Foto': 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500',
    },
    {
      'Código': '1003',
      'Nome do Produto': 'Amassador de Alho Manual Inox',
      'Preço de Custo': 12.8,
      'Disponibilidade': 'Sim',
      'Foto': 'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?w=500',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleHeaders);
  worksheet['!cols'] = [{ wch: 12 }, { wch: 38 }, { wch: 16 }, { wch: 18 }, { wch: 55 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Catálogo');
  XLSX.writeFile(workbook, 'modelo_catalogo_produtos.xlsx');
}
