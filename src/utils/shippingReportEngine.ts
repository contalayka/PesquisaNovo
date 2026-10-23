/**
 * MARKETPREÇO — Motor Especializado de Reconhecimento de Etiquetas de Expedição
 *
 * Suporta as 4 plataformas:
 * - Mercado Livre (Mercado Envios, Pack ID, roteamentos XPR/XSP/SPR, NF)
 * - TikTok Shop (TikTok header, J&T Express, pedidos 999...)
 * - SHEIN (GSH..., SHEIN Express)
 * - Shopee (SPX Express, Order SN 24...)
 *
 * Fornece deduplicação em 3 níveis (etiqueta, arquivo, histórico anterior)
 * e cálculo estrito de totais e pendências reais.
 */

export type Platform = 'Shopee' | 'Mercado Livre' | 'TikTok Shop' | 'SHEIN';

export const PLATFORMS: Platform[] = ['Shopee', 'Mercado Livre', 'TikTok Shop', 'SHEIN'];

export interface ExtractedLabelItem {
  name: string;
  sku?: string;
  qty: number;
}

export interface ProcessedLabel {
  id: string;
  file: string;
  page: number;
  labelIndexOnPage: number;
  platform: Platform | '';
  orderNumber: string;
  confidence: 'Detectado' | 'Revisar';
  pendingReason?:
    | 'Plataforma não identificada'
    | 'Número do pedido não encontrado'
    | 'Texto ilegível'
    | 'Possível duplicata'
    | '';
  duplicate: boolean;
  duplicateScope?: 'mesma_etiqueta' | 'mesmo_arquivo' | 'historico_anterior';
  include: boolean;
  rawSnippet?: string;
  rawText?: string;
  extractedProducts?: ExtractedLabelItem[];
}

export interface ShippingReportSummary {
  date: string;
  counts: Record<Platform, number>;
  totalUniqueOrders: number;
  realPendingCount: number;
  duplicateCount: number;
  items: ProcessedLabel[];
}

export const createEmptyCounts = (): Record<Platform, number> => ({
  'Shopee': 0,
  'Mercado Livre': 0,
  'TikTok Shop': 0,
  'SHEIN': 0,
});

/**
 * Normaliza texto para comparações insensíveis a acentos, pontuação e maiúsculas
 */
export function normalizeText(v: string): string {
  return (v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza código do pedido (apenas caracteres alfanuméricos em caixa alta)
 */
export function normalizeOrderCode(v: string): string {
  return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Gera hash SHA-256 para persistência e deduplicação segura no banco
 */
export async function computeOrderHash(platform: string, orderNumber: string): Promise<string> {
  const payload = `${platform}:${normalizeOrderCode(orderNumber)}`;
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Identifica a plataforma da etiqueta com base em cabeçalhos, roteamento e padrões
 */
/**
 * Identifica a plataforma da etiqueta com base em cabeçalhos, roteamento e padrões
 */
export function detectPlatform(text: string, fileName = ''): Platform | '' {
  if (!text && !fileName) return '';

  const raw = text || '';
  // Se houver texto na etiqueta, use exclusivamente o texto da etiqueta para não herdar
  // palavras do nome do arquivo (ex: "etiquetas_mercado_livre.pdf" contendo também TikTok/SHEIN)
  const norm = normalizeText(raw ? raw : fileName);

  // 1. SHEIN:
  // - Nome explícito / variações: 'shein', 's h e i n', 'sh ein', 'she in', 'shein express', 'shein logistics', 'shein brasil', 'shein marketplace', 'shein local', 'shein.com', 'shn', 'she!n', 'she1n', 'shen', 'sheln', '5hein'
  // - Razão Social / CNPJ Shein Brasil / Entidades corporativas globais da Shein:
  //     'shein brasil tecnologia', '44.498.492', '44498492', 'zoetop', 'roadget', 'infinite styles'
  // - Código GSH (inclusive com espaços/hífens ou variações OCR 6SH, CSH, QSH, G5H): GSH19C..., GSH M8849...
  // - Códigos de pedido SHEIN com prefixo SH / SHN / SHE: SH24..., SHN2024..., SHE2024...
  // - Transportadoras e parceiros logísticos SHEIN no Brasil:
  //     Anjun Express (Anjun, tracking AJ...),
  //     Pegaki (rede oficial de pontos de coleta e entrega da SHEIN no Brasil),
  //     iMile (operador logístico SHEIN),
  //     Roadbull,
  //     Correios (faixas oficiais de rastreio SHEIN: NL...BR, NB...BR, NX...BR, QM...BR, QB...BR),
  //     Total Express / Jadlog / Loggi com dados SHEIN
  // - Termos de triagem e rotas SHEIN: PUDO D2D, PUDO, D2D, DF-W-H..., DF-W-D..., DF-W-..., QUICK SHIP, QUICKSHIP, CT SHEIN, CD SHEIN, SAO-SHEIN, GRU-SHEIN
  // - Código de referência SHEIN: GC2610134951478277 (GC...) ou Ref. No
  const hasSheinMention =
    norm.includes('shein') ||
    /\bsheina\b/i.test(raw) ||
    /\bshein\s*a\b/i.test(raw) ||
    /\b[s5]\s*h\s*e\s*i\s*n\b/i.test(raw) ||
    norm.includes('sh ein') ||
    norm.includes('she in') ||
    norm.includes('she!n') ||
    norm.includes('she1n') ||
    norm.includes('she|n') ||
    norm.includes('sheln') ||
    norm.includes('5hein') ||
    norm.includes('shein express') ||
    norm.includes('shein logistics') ||
    norm.includes('shein.com') ||
    norm.includes('shein brasil') ||
    norm.includes('shein marketplace') ||
    norm.includes('shein local') ||
    norm.includes('shn') ||
    norm.includes('44.498.492') ||
    norm.includes('44498492') ||
    norm.includes('zoetop') ||
    norm.includes('roadget') ||
    norm.includes('infinite styles') ||
    norm.includes('quick ship') ||
    norm.includes('quickship');

  const hasGshCode =
    /\b(?:g\s*s\s*h|[6qcog]\s*[s5\$]\s*h)[\s\-_:*]*[0-9a-z]{7,25}\b/i.test(raw) ||
    /\bgsh[0-9a-z]{7,25}\b/i.test(raw);

  const hasSheinOrderCode =
    /\b(?:shn?|she)[0-9a-z]{7,22}\b/i.test(raw) ||
    /\b(?:pedido|order\s*(?:id|number|no\.?|#)?|ref\.?\s*no\.?)\s*[:#\-]?\s*(?:shn?|she)[0-9a-z]{6,22}\b/i.test(
      raw
    );

  const hasAnjunCarrier =
    norm.includes('anjun') ||
    /\banjun\s*(?:express)?\b/i.test(raw) ||
    /\baj\d{10,16}\b/i.test(raw);

  const hasPegakiCarrier =
    norm.includes('pegaki') ||
    /\bpegaki\b/i.test(raw) ||
    /\bpgk\d{8,16}\b/i.test(raw);

  const hasIMileCarrier =
    norm.includes('imile') ||
    /\bimile(?:\s*delivery|\s*brasil)?\b/i.test(raw);

  const hasCorreiosShein = /\b(N[A-Z]|Q[BM])\d{9}BR\b/i.test(raw);

  const hasSheinRef =
    /\bgc\d{10,20}\b/i.test(raw) ||
    ((norm.includes('ref.no') || norm.includes('ref no') || norm.includes('reference')) &&
      /\bgc[0-9a-z]{8,20}\b/i.test(raw));

  const hasSheinPudo =
    (norm.includes('pudo') && norm.includes('d2d')) ||
    norm.includes('pudo') ||
    norm.includes('d2d') ||
    /\bdf-w-[hd]\d+\b/i.test(raw) ||
    /\bdf-w-\w+\b/i.test(raw);

  if (
    hasSheinMention ||
    hasGshCode ||
    hasSheinOrderCode ||
    hasAnjunCarrier ||
    hasPegakiCarrier ||
    hasIMileCarrier ||
    hasCorreiosShein ||
    hasSheinRef ||
    hasSheinPudo
  ) {
    return 'SHEIN';
  }

  // 2. SHOPEE:
  // - Nome Shopee / variações: 'shopee', 'shope', 'shoppee', 'spx express', 'spxbr', 'spx', 'shopee.com'
  // - Padrão de pedido Shopee Order SN (YYMMDD + alfanumérico): ex: 261014KVS9XT7W, 261014KVY30WGX, 24101389XQ92LA
  // - Centros operacionais e rotas Shopee: 'SOC SP', 'SOC RJ', 'SOC PR', 'LSP-93', 'LSP-51', etc.
  // - Rastreio Shopee Correios BR...N ou BR...S
  const hasShopeeMention =
    norm.includes('shopee') ||
    norm.includes('shope') ||
    norm.includes('shoppee') ||
    norm.includes('spx express') ||
    norm.includes('spxbr') ||
    norm.includes('spx') ||
    norm.includes('shopee.com');

  const hasShopeeOrderSn =
    /\b(2[3-9][0-9]{4}[0-9a-z]{7,13})\b/i.test(raw) ||
    /\b(2[3-9][0-9]{2}[0-9a-z]{8,14})\b/i.test(raw) ||
    /\b(?:order\s*sn)\s*[:#\-]?\s*([2-3][0-9][A-Z0-9]{10,16})/i.test(raw);

  const hasShopeeHub =
    /\bsoc\s*sp\d*\b/i.test(raw) ||
    /\bsoc\s*[a-z]{2}\d*\b/i.test(raw) ||
    /\blsp-\d+\b/i.test(raw);

  // Não classificar Shopee apenas pelo formato numérico/alfanumérico do pedido:
  // outras plataformas podem usar códigos parecidos. Exigir evidência logística/marca.
  if (hasShopeeMention || hasShopeeHub) {
    return 'Shopee';
  }

  // 3. TIKTOK SHOP:
  // Reconhecimento flexível e resiliente de cabeçalho, transportadora e padrão de pedido TikTok:
  // a) Menções da plataforma TikTok (inclusive variações de OCR)
  const hasTikTokMention =
    norm.includes('tiktok') ||
    norm.includes('tik tok') ||
    norm.includes('tiktok shop') ||
    norm.includes('tik tok shop') ||
    norm.includes('tts') ||
    norm.includes('tt shop') ||
    norm.includes('bytedance') ||
    norm.includes('t1kt0k') ||
    norm.includes('tikt0k') ||
    norm.includes('tlktok') ||
    norm.includes('titok') ||
    norm.includes('tktk') ||
    /\btik\s*[-_./]?\s*tok\b/i.test(raw) ||
    /\bt[1il!][k|c]\s*t[0o][k|c]\b/i.test(raw);

  // b) Transportadora J&T Express (parceira logística primária do TikTok Shop no Brasil)
  const hasJTExpress =
    /\bj\s*(?:&|\+|and|\/|\.)?\s*t\s*(?:express|cargo|brasil)?\b/i.test(raw) ||
    /\bjnt\s*(?:express|brasil)?\b/i.test(raw) ||
    /\bjt\s*express\b/i.test(raw) ||
    norm.includes('j&t') ||
    norm.includes('jnt') ||
    norm.includes('jt express') ||
    norm.includes('j and t');

  // c) Código de rastreio J&T
  const hasJTTracking = /\b(?:jt|jte)\d{9,16}\b/i.test(raw);

  // d) Padrão de pedido TikTok Shop:
  // Prefixo 999 (14 a 17 dígitos, ex: 999882459194835) ou 57/58/99 (14 a 17 dígitos)
  const hasTikTokOrderExplicit =
    /(?:pedido|order\s*(?:id|number|no\.?|#)?|id\s*do\s*pedido|ordem|n[ºo°.]?\s*(?:do\s*)?pedido|n[ºo°.]?\s*pedido|ped[ilc1o][ldo0])\s*[:#\-]?\s*(999\d{10,14}|57\d{11,15}|58\d{11,15}|99\d{11,15})\b/i.test(
      raw
    );
  const hasTikTokOrderStandalone = /\b(999\d{11,14}|57\d{12,15}|58\d{12,15})\b/.test(raw);

  if (hasTikTokMention) {
    return 'TikTok Shop';
  }
  if (hasTikTokOrderExplicit || hasTikTokOrderStandalone) {
    return 'TikTok Shop';
  }
  if (hasJTExpress || hasJTTracking) {
    return 'TikTok Shop';
  }

  // 4. MERCADO LIVRE (Mercado Envios):
  // Menção direta
  if (
    norm.includes('mercado livre') ||
    norm.includes('mercadolivre') ||
    norm.includes('mercado envios') ||
    norm.includes('mercadoenvios') ||
    norm.includes('mercado pago') ||
    norm.includes('envios flex') ||
    /\bmeli\b/.test(norm)
  ) {
    return 'Mercado Livre';
  }

  // Layout característico Mercado Envios:
  // - Presença de "Pack ID" (ou Pacote ID) ou Venda (20000...)
  // - E obrigatoriamente roteamento Mercado Envios (XPR, XSP, SSP, SDF, SMN, SRS, etc.) ou seller hash #1476198771 com Pack ID/Venda
  // UpSeller/PDF OCR may insert spaces inside Mercado Livre IDs, e.g. "Pack ID: 20000 15529015941".
  const spacedMeliId = String.raw`20000[\s.\-]*\d{9,12}`;
  const hasPackId =
    new RegExp(String.raw`pack\s*id\s*[:#]?\s*${spacedMeliId}`, 'i').test(raw) ||
    new RegExp(String.raw`pacote\s*id\s*[:#]?\s*${spacedMeliId}`, 'i').test(raw) ||
    new RegExp(String.raw`\b${spacedMeliId}\b`, 'i').test(raw);
  const hasMeliRoute = /\b(xpr\d?|xsp\d?|spr\d?|ssp\d?|sdf\d?|smn\d?|srs\d?|xsc\d?|xmg\d?|xba\d?|xrs\d?|cpt\d?|rpr\d?|vpr\d?|bsb\d?|xgo\d?)\b/i.test(
    raw
  );
  const hasVenda = new RegExp(
    String.raw`(?:venda|id\s*(?:da\s*)?venda)\s*[:#\-]?\s*${spacedMeliId}`,
    'i'
  ).test(raw);
  const hasSellerHashId = /#\d{7,12}\b/.test(raw);

  if ((hasPackId || hasVenda) && (hasMeliRoute || hasSellerHashId)) {
    return 'Mercado Livre';
  }
  if (hasMeliRoute && (hasPackId || hasVenda || hasSellerHashId)) {
    return 'Mercado Livre';
  }

  // 5. Fallback por nome do arquivo (quando o texto nativo/OCR não contém marcas explícitas)
  if (fileName) {
    const fnNorm = normalizeText(fileName);
    if (fnNorm.includes('shein') || fnNorm.includes('shn')) return 'SHEIN';
    if (fnNorm.includes('shopee') || fnNorm.includes('spx')) return 'Shopee';
    if (fnNorm.includes('tiktok') || fnNorm.includes('tik tok')) return 'TikTok Shop';
    if (
      fnNorm.includes('mercado livre') ||
      fnNorm.includes('mercadolivre') ||
      fnNorm.includes('meli')
    ) {
      return 'Mercado Livre';
    }
  }

  return '';
}

/**
 * Extrai o identificador correto do pedido evitando confusão com
 * Nota Fiscal (NF), identificador de loja (#1476198771), roteamento ou CEP.
 */
export function extractOrderNumber(text: string, platform?: Platform | ''): string {
  if (!text) return '';

  const raw = text.trim();

  // A) SHEIN: prioriza o código GSH e referências completas da SHEIN no Brasil.
  if (
    platform === 'SHEIN' ||
    /\b(?:g\s*s\s*h|[6qcog]\s*[s5\$]\s*h)[\s\-_:*]*[0-9a-z]{7,25}\b/i.test(raw) ||
    /\b(?:shn?|she)\d{6,22}\b/i.test(raw) ||
    /\bgc\d{8,22}\b/i.test(raw) ||
    /\baj\d{8,18}\b/i.test(raw) ||
    /\b(?:pgk|pe)\d{6,18}\b/i.test(raw)
  ) {
    // 1. Código GSH (ex: Pedido:GSH19C572000RL9 -> GSH19C572000RL9, GSH M8849... -> GSHM8849..., 6SH... -> GSH...)
    const sheinMatch = raw.match(
      /(?:\b|\*)(?:G\s*S\s*H|[6QCOG]\s*[S5\$]\s*H)[\s\-_:*]*([0-9A-Z]{7,25})(?:\b|\*)/i
    );
    if (sheinMatch) return `GSH${sheinMatch[1].replace(/[^0-9A-Z]/gi, '').toUpperCase()}`;

    // 2. O campo explícito Pedido é mais confiável que Ref.No (GC...) ou rastreios.
    // Algumas etiquetas SHEIN/UpSeller mostram pedido alfanumérico sem prefixo GSH.
    const explicitPedidoFirst = raw.match(
      /(?:pedido(?:\s*(?:shein|id|n[uú]mero|n[ºo°.]?))?|order\s*(?:id|no\.?|number|#)?)\s*[:#\-_*]*\s*([A-Z0-9][A-Z0-9\-]{7,29})/i
    );
    if (explicitPedidoFirst) {
      const candidate = explicitPedidoFirst[1].replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (candidate.length >= 8 && !/^(?:SHEIN|BRASIL|ANJUN|EXPRESS|LOGISTICS)$/i.test(candidate)) {
        return candidate;
      }
    }

    // 3. Referência Shein GC (ex: Ref.No:GC2610134951478277 ou GC2610...)
    const mGC = raw.match(/(?:\b|\*)(GC\d{8,22})(?:\b|\*)/i);
    if (mGC) return mGC[1].toUpperCase();

    // 3. Código SH... ou SHN... ou SHE... (ex: SHN202410149912, SH241014123456)
    const mSH = raw.match(/(?:\b|\*)((?:SHN?|SHE)\d{6,22})(?:\b|\*)/i);
    if (mSH) return mSH[1].toUpperCase();

    // 4. Identificador de pacote UpSeller ERP (#UP8YXK010082 ou UP8YXK010082)
    const mUp = raw.match(/(?:#|\b)(UP[0-9A-Z]{8,16})\b/i);
    if (mUp) return mUp[1].toUpperCase();

    // 5. Campo explícito de pedido / Ref / Order No (suporta "Pedido SHEIN:", "Pedido:", "Order ID:", etc.)
    const explicitSheinOrder =
      raw.match(
        /(?:order\s*(?:id|no\.?|number|#|sn)?|pedido(?:\s*(?:shein|id|n[uú]mero|n[ºo°.]?))?|n[uú]mero\s*do\s*pedido|id\s*do\s*pedido|ref(?:\.?\s*no\.?|\.?\s*cliente|\.?\s*ped\.?)?|refer[eê]ncia|sub-?pedido|pacote)\s*[:#\-_*]*\s*([A-Z0-9][A-Z0-9\-]{4,29})/i
      ) ||
      raw.match(
        /(?:ref\.?\s*no\.?|reference(?:\s*no\.?)?|ref:?)\s*[:#\-_*]*\s*([A-Z0-9][A-Z0-9\-]{4,29})/i
      );
    if (explicitSheinOrder) {
      const candidate = explicitSheinOrder[1].replace(/[^A-Z0-9]/gi, '').toUpperCase();
      if (
        candidate.length >= 5 &&
        !/^0+$/.test(candidate) &&
        candidate !== '141' &&
        candidate !== 'SHEIN' &&
        candidate !== 'BRASIL'
      ) {
        return candidate;
      }
    }

    // 6. Rastreio Correios oficial (qualquer código válido de 2 letras + 9 dígitos + BR)
    const mCorreiosShein = raw.match(/\b([A-Z]{2}\d{9}BR)\b/i);
    if (mCorreiosShein) return mCorreiosShein[1].toUpperCase();

    // 7. Rastreio de transportadoras parceiras SHEIN no Brasil
    // Anjun Express (AJ...), Pegaki (PGK... ou PE...), J&T Express (JT... ou 888...), Total Express (EXP...), Jadlog (1008...), Loggi (LOG...)
    const mCarrier =
      raw.match(/\b(AJ\d{8,18})\b/i) ||
      raw.match(/\b(PGK\d{6,18}|PE\d{6,18})\b/i) ||
      raw.match(/\b(JT\d{9,16}|JTE\d{9,16}|888\d{9,13})\b/i) ||
      raw.match(/\b(EXP\d{8,16}|RODO\d{8,16})\b/i) ||
      raw.match(/\b(1008\d{8,12})\b/i) ||
      raw.match(/\b(LOG\d{8,16})\b/i);
    if (mCarrier) return mCarrier[1].toUpperCase();

    // 8. Número longo de pedido ou código de barras da SHEIN (8 a 20 dígitos)
    const longNums = raw.match(/\b(\d{8,20})\b/g) || [];
    for (const num of longNums) {
      if (
        !/^0+$/.test(num) &&
        !/^\d{4}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(num) &&
        !/^\d{5}\d{3}$/.test(num)
      ) {
        return num;
      }
    }

    // 9. Qualquer token alfanumérico não-trivial de 7 a 25 caracteres presente na etiqueta
    const alphaNums = raw.match(/\b([A-Z0-9]{7,25})\b/g) || [];
    for (const cand of alphaNums) {
      const u = cand.toUpperCase();
      if (
        !/^(?:DESTINATARIO|REMETENTE|ENDERECO|BAIRRO|CIDADE|ESTADO|BRASIL|ENVIOS|EXPRESS|LOGISTICS|PRODUTO|CONTEUDO|DECLARACAO|AVENIDA|TELEFONE|PAC|SEDEX|CORREIOS|SHEIN|MARKETPLACE)$/i.test(
          u
        ) &&
        !/^0+$/.test(u) &&
        !/^\d{8}$/.test(u)
      ) {
        return u;
      }
    }
  }

  // B) TIKTOK SHOP: Pedido explícito ou padrão 14-16 dígitos (ex: 999882459194835)
  if (platform === 'TikTok Shop') {
    // 1. Campo explícito "Pedido: 999882459194835" ou "Order ID: 999..."
    const mExplicit =
      raw.match(
        /(?:pedido|order\s*(?:id|number|no\.?|#)?|id\s*do\s*pedido|n[ºo°.]?\s*(?:do\s*)?pedido|n[ºo°.]?\s*pedido|ordem|ped[ilc1o][ldo0])\s*[:#\-]?\s*([0-9]{12,20})/i
      ) ||
      raw.match(/(?:pedido|order|ped[ilc1o][ldo0])\s*[:#\-]?\s*([0-9A-Z]{12,20})/i);
    if (mExplicit) {
      return mExplicit[1].trim();
    }
    // 2. Padrão TikTok 999... ou 57... ou 58... ou 99...
    const mPattern = raw.match(/\b(999\d{10,15}|57\d{11,16}|58\d{11,16}|99\d{11,16})\b/);
    if (mPattern) {
      return mPattern[1];
    }
    // 3. Qualquer número longo de 14 a 18 dígitos na etiqueta (evitando CEP ou datas)
    const longNums = raw.match(/\b(\d{14,18})\b/g) || [];
    for (const num of longNums) {
      if (!/^0+$/.test(num) && !/^\d{4}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(num)) {
        return num;
      }
    }
    // 4. Rastreio J&T se disponível
    const mJT = raw.match(/\b(JT\d{9,16})\b/i);
    if (mJT) return mJT[1].toUpperCase();
  }

  // C) MERCADO LIVRE:
  // Importante: NÃO confundir com NF (ex: 141), nem com Loja (#1476198771), nem com rota (XPR2)
  if (platform === 'Mercado Livre') {
    // 1. Campo explícito "Pedido:" ou "Venda:" ou "ID da Venda:"
    // IDs de venda/Pack ID podem conter espaços, pontos ou hífens inseridos pelo OCR.
    const spacedMeliId = String.raw`(20000[\s.\-]*\d{9,12})`;
    const mVenda =
      raw.match(new RegExp(String.raw`(?:venda|id\s*(?:da\s*)?venda|pedido)\s*[:#\-]?\s*${spacedMeliId}`, 'i')) ||
      raw.match(new RegExp(String.raw`(?:venda|pedido)\s*#?\s*${spacedMeliId}`, 'i'));
    if (mVenda) return mVenda[1].replace(/\D/g, '');

    const mPack =
      raw.match(new RegExp(String.raw`pack\s*id\s*[:#\-]?\s*${spacedMeliId}`, 'i')) ||
      raw.match(new RegExp(String.raw`pacote\s*id\s*[:#\-]?\s*${spacedMeliId}`, 'i'));
    if (mPack) return mPack[1].replace(/\D/g, '');

    const mPackDirect = raw.match(/\b(20000[\s.\-]*\d{9,12})\b/);
    if (mPackDirect) return mPackDirect[1].replace(/\D/g, '');
  }

  // D) SHOPEE:
  if (
    platform === 'Shopee' ||
    /\b(2[3-9][0-9]{4}[0-9a-z]{7,13})\b/i.test(raw) ||
    /\b(2[3-9][0-9]{2}[0-9a-z]{8,14})\b/i.test(raw)
  ) {
    // 1. Padrão Shopee Order SN (começando com ano 24..., 25..., 26..., ex: 261014KVS9XT7W, 261014KVY30WGX)
    const mPattern =
      raw.match(/\b(2[3-9][0-9]{4}[0-9A-Z]{7,13})\b/) ||
      raw.match(/\b(2[3-9][0-9]{2}[0-9A-Z]{8,14})\b/);
    if (mPattern) {
      return mPattern[1].toUpperCase();
    }

    // 2. Campo explícito "Pedido:" ou "Order SN:"
    const mShopee =
      raw.match(/(?:order\s*sn|n[uú]mero\s*(?:do\s*)?pedido|pedido)\s*[:#\-]?\s*([2-3][0-9][A-Z0-9]{10,16})/i) ||
      raw.match(/(?:order\s*sn|pedido)\s*[:#\-]?\s*([A-Z0-9]{12,20})/i);
    if (mShopee) {
      return mShopee[1].trim();
    }
  }

  // E) BUSCA GENÉRICA RESILIENTE:
  // 1. SHEIN GSH... ou GC...
  const mSheinFallback = raw.match(/\b(G\s*S\s*H)[\s\-]*([0-9A-Z]{7,25})\b/i);
  if (mSheinFallback) {
    return `GSH${mSheinFallback[2].replace(/[^0-9A-Z]/gi, '').toUpperCase()}`;
  }
  const mSheinGcFallback = raw.match(/\b(GC\d{10,20})\b/i);
  if (mSheinGcFallback) {
    return mSheinGcFallback[1].toUpperCase();
  }

  // 2. Shopee 26...
  const mShopeeFallback =
    raw.match(/\b(2[3-9][0-9]{4}[0-9A-Z]{7,13})\b/) ||
    raw.match(/\b(2[3-9][0-9]{2}[0-9A-Z]{8,14})\b/);
  if (mShopeeFallback) {
    return mShopeeFallback[1].toUpperCase();
  }

  // 3. TikTok (999..., 57..., 58...)
  const mTikTokFallback = raw.match(/\b(999\d{10,15}|57\d{11,16}|58\d{11,16})\b/);
  if (mTikTokFallback) {
    return mTikTokFallback[1];
  }

  // 4. Mercado Livre 20000...
  const mMeliDirect = raw.match(/\b(20000\d{10,12})\b/);
  if (mMeliDirect) {
    return mMeliDirect[1];
  }

  // 5. Rótulo explícito "Pedido", "Order ID", "Nº do Pedido"
  const mGenericExplicit = raw.match(
    /(?:n[uú]mero\s*(?:do\s*)?pedido|order\s*(?:id|number|no\.?|#)|id\s*do\s*pedido|pedido|ped[ilc1o][ldo0])\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-]{7,25})/i
  );
  if (mGenericExplicit && !/^(?:00+|141)$/.test(mGenericExplicit[1].trim())) {
    return mGenericExplicit[1].trim();
  }

  // 6. Pack ID genérico
  const mGenericPack = raw.match(/pack\s*id\s*[:#\-]?\s*(\d{10,20})/i);
  if (mGenericPack) {
    return mGenericPack[1].trim();
  }

  // 7. Padrão numérico longo (12 a 18 dígitos, típico de pedidos de marketplace)
  // Rejeita CEPs, CNPJs, códigos curtos de NF ou números de vendedor iniciados com #
  const longNumbers = raw.match(/\b(\d{12,18})\b/g) || [];
  for (const num of longNumbers) {
    // Rejeita sequências de zeros ou datas repetidas
    if (!/^0+$/.test(num) && !/^\d{4}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/.test(num)) {
      return num;
    }
  }

  return '';
}

/**
 * Segmenta o texto de uma página de PDF em blocos de etiquetas individuais.
 * Se uma página A4 possuir múltiplas etiquetas (ex: 2 ou 4 por página),
 * detecta as divisões para processar cada etiqueta independentemente.
 */
export function segmentPageIntoLabels(pageText: string): string[] {
  if (!pageText) return [];

  // Se o texto for curto ou for uma página térmica com 1 etiqueta padrão:
  const text = pageText.trim();
  if (text.length < 100) return [text];

  // 1. Divisão por linhas separadoras explícitas (ex: tracejados de corte entre etiquetas A4)
  const lineSplits = text.split(/\n\s*[-_=]{4,}\s*\n/);
  if (lineSplits.length > 1 && lineSplits.every((s) => s.trim().length > 25)) {
    return lineSplits.map((s) => s.trim());
  }

  // 2. Análise de unicidade: Se a página contiver 0 ou 1 pedido identificável,
  // é garantidamente uma única etiqueta (ex: térmica 10x15cm ou A4 individual).
  // Manter todo o texto junto evita separar cabeçalho e rodapé.
  const ordersFound = new Set<string>();
  const gshMatches =
    text.match(/\b(?:G\s*S\s*H|[6QCOG]\s*[S5\$]\s*H)[\s\-_:*]*[0-9A-Z]{7,25}\b/gi) || [];
  gshMatches.forEach((m) => ordersFound.add(m.replace(/[^0-9A-Z]/gi, '').toUpperCase()));

  // Códigos GSH são pedidos SHEIN. GC só serve como identificador substituto
  // quando não existe GSH na etiqueta. AJ/rastreios e UP... são códigos de
  // transporte/etiqueta, NÃO pedidos, e não podem provocar divisão falsa.
  if (gshMatches.length === 0) {
    const sheinReferenceMatches = text.match(/\bGC\d{8,22}\b/gi) || [];
    sheinReferenceMatches.forEach((m) => ordersFound.add(m.toUpperCase()));
  }

  const packMatches = text.match(/pack\s*id\s*[:#\-]?\s*(\d{10,20})/gi) || [];
  packMatches.forEach((m) => ordersFound.add(m.replace(/[^0-9]/g, '')));

  const ttMatches = text.match(/\b(?:999\d{11,15}|57\d{12,16}|58\d{12,16})\b/g) || [];
  ttMatches.forEach((m) => ordersFound.add(m));

  const shopeeMatches = text.match(/\b(?:2[3-9][0-9]{4}[0-9A-Z]{7,13})\b/gi) || [];
  shopeeMatches.forEach((m) => ordersFound.add(m.toUpperCase()));

  // Se houver 0 ou 1 pedido no total, a página é certamente uma única etiqueta:
  if (ordersFound.size <= 1) {
    return [text];
  }

  // 3. Se houver comprovadamente 2 ou mais pedidos distintos na mesma página (grade A4):
  // Divide nos cabeçalhos principais de início de etiqueta
  const headerRegex =
    /(?:(?:etiqueta\s*de\s*envio|mercado\s*(?:envios|livre)|spx\s*express|shopee(?:\s*brasil)?|shein(?:a)?\s*(?:express|logistics|brasil)?|tiktok(?:\s*shop)?)\b)/gi;

  let match: RegExpExecArray | null;
  const indices: number[] = [];
  while ((match = headerRegex.exec(text)) !== null) {
    indices.push(match.index);
  }

  if (indices.length >= 2) {
    const validCuts: number[] = [0];
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] - validCuts[validCuts.length - 1] > 60) {
        validCuts.push(indices[i]);
      }
    }

    if (validCuts.length > 1) {
      const segments: string[] = [];
      for (let i = 0; i < validCuts.length; i++) {
        const start = validCuts[i];
        const end = i + 1 < validCuts.length ? validCuts[i + 1] : text.length;
        const sub = text.slice(start, end).trim();
        if (sub.length > 25) segments.push(sub);
      }
      if (segments.length > 1) return segments;
    }
  }

  return [text];
}

/**
 * Extrai itens e produtos vendidos descritos no texto da etiqueta de envio (UpSeller, ERPs e marketplaces)
 */
export function extractProductsFromLabel(rawText: string): ExtractedLabelItem[] {
  if (!rawText) return [];
  const items: ExtractedLabelItem[] = [];
  const lines = rawText.split('\n');

  // Termos logísticos e fiscais a ignorar como nome de produto
  const nonProductPattern =
    /^(?:avenida|rua|alameda|travessa|rodovia|cep|destinatario|destinat[aá]rio|remetente|pedido|pack\s*id|xpr|srs|total\s*items|deadline|peso\s*bruto|etiqueta|data|declaracao|declara[cç][aã]o|peso|valor|chave\s*de\s*acesso|serie|nfe|conforme|declarado|anexo|cpf|cnpj|bairro|cidade|uf|estado|documento|telefone|fone|transporte|transportadora|volume|volumes|dimens[oõ]es|obs|observa[cç][aã]o|entrega|coleta|loggi|jadlog|correios|total\s*express|anjun|pegaki|spx|shopee|shein|tiktok|mercado\s*livre)/i;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.length < 3) continue;

    // Padrão 0: Linha de tabela da Declaração de Conteúdo dos Correios / Mercado Envios / Shopee
    // Formato: "1 MANTEIGUEIRA VIDRO 250G 2 35,00" ou "1 Garrafa Térmica 1 25.00"
    const mDecTable = trimmed.match(
      /^(?:[1-9]\d?)\s+([A-Za-zÀ-ÿ0-9\s\-_/,\.]{4,80}?)\s+(\d{1,3})\s+(?:R\$\s*)?\d+(?:[,\.]\d{2})?$/i
    );
    if (mDecTable) {
      let candidate = mDecTable[1].trim();
      candidate = candidate.replace(/^\[[^\]]+\]\s*/, '').replace(/^\([^\)]+\)\s*/, '');
      if (candidate.length >= 3 && !nonProductPattern.test(candidate)) {
        const qty = parseInt(mDecTable[2] || '1', 10);
        items.push({ name: candidate, qty: isNaN(qty) || qty <= 0 ? 1 : qty });
        continue;
      }
    }

    // Padrão 1: UpSeller / ERP / Marketplaces item numerado: "1. Manteigueira Vidro *1" ou "1. Copo (*6)" ou "x2" ou "1) Produto - Qtd: 2"
    const mItem = trimmed.match(
      /^(?:\d+[\.\)\-:]|\*)\s*(.+?)(?:\s*(?:\(\s*\*\s*(\d+)\s*\)|\*\s*(\d+)|\(\s*x\s*(\d+)\s*\)|x\s*(\d+)|\(\s*(?:qtd|qty)[:\s]*(\d+)\s*\)|[-:]\s*(?:qtd|qty)[:\s]*(\d+)))?$/i
    );
    if (mItem) {
      let candidateName = mItem[1].trim();
      candidateName = candidateName.replace(/^\[[^\]]+\]\s*/, '').replace(/^\([^\)]+\)\s*/, '');
      if (candidateName.length >= 3 && !nonProductPattern.test(candidateName)) {
        const qty = parseInt(mItem[2] || mItem[3] || mItem[4] || mItem[5] || mItem[6] || mItem[7] || '1', 10);
        items.push({ name: candidateName, qty: isNaN(qty) || qty <= 0 ? 1 : qty });
        continue;
      }
    }

    // Padrão 2: "PRODUTO:" / "ITEM:" / "CONTEÚDO:" / "DESCRIÇÃO:" / "MERCADORIA:" / "[PRODUTO]" / "[ITEM]"
    const mExplicit = trimmed.match(
      /(?:\[?(?:produto|descri[cç][aã]o(?:\s*dos?\s*bens)?|item|conte[uú]do|mercadoria)\]?)\s*[:\-]?\s*(.+?)(?:\s*(?:qtd|qty|quantidade|quant\.|unidades?|un|x|\*)\s*[:\-]?\s*(\d+))?$/i
    );
    if (mExplicit) {
      let name = mExplicit[1].trim();
      name = name.replace(/^\[[^\]]+\]\s*/, '').replace(/^\([^\)]+\)\s*/, '');
      const qty = parseInt(mExplicit[2] || '1', 10);
      if (name.length >= 3 && !nonProductPattern.test(name)) {
        items.push({ name, qty: isNaN(qty) || qty <= 0 ? 1 : qty });
        continue;
      }
    }

    // Padrão 3: Declaração de Conteúdo dos Correios / Mercado Envios / Shopee
    // "Discriminação do Conteúdo: Manteigueira Vidro ... Quantidade: 1"
    const mDeclaracao = trimmed.match(
      /(?:discrimina[cç][aã]o\s*(?:do\s*conte[uú]do)?|declara[cç][aã]o\s*de\s*conte[uú]do)\s*[:\-]\s*(.+?)(?:\s*(?:qtd|qty|quantidade|quant\.|unidades?|un|x|\*)\s*[:\-]?\s*(\d+))?$/i
    );
    if (mDeclaracao) {
      const name = mDeclaracao[1].trim();
      const qty = parseInt(mDeclaracao[2] || '1', 10);
      if (name.length >= 3 && !nonProductPattern.test(name)) {
        items.push({ name, qty: isNaN(qty) || qty <= 0 ? 1 : qty });
        continue;
      }
    }

    // Padrão 4: Quantidade na frente: "2x Manteigueira Francesa Vidro" ou "1 UN - Garrafa Térmica 500ml"
    const mQtyFirst = trimmed.match(/^(\d{1,3})\s*(?:x|un|unidades?|p[cç]s?)\s*[-:]?\s*(.+)$/i);
    if (mQtyFirst) {
      const qty = parseInt(mQtyFirst[1], 10);
      let name = mQtyFirst[2].trim();
      name = name.replace(/^\[[^\]]+\]\s*/, '').replace(/^\([^\)]+\)\s*/, '');
      if (name.length >= 3 && !nonProductPattern.test(name)) {
        items.push({ name, qty: isNaN(qty) || qty <= 0 ? 1 : qty });
        continue;
      }
    }

    // Padrão 5: SKU estruturado com nome: "SKU: ABC-123 - Manteigueira Vidro * 1" ou "SKU: 12345 (Nome do Produto)"
    const mSkuLine = trimmed.match(
      /(?:sku|c[oó]d(?:igo)?(?:\s*interno)?)\s*[:\-]?\s*([A-Za-z0-9_\-\.]+)\s*[-:]\s*(.+?)(?:\s*(?:\*\s*(\d+)|\(\s*x\s*(\d+)\s*\)|x\s*(\d+)|(?:qtd|qty)[:\s]*(\d+)))?$/i
    );
    if (mSkuLine) {
      const sku = mSkuLine[1].trim();
      let name = mSkuLine[2].trim();
      name = name.replace(/^\[[^\]]+\]\s*/, '').replace(/^\([^\)]+\)\s*/, '');
      const qty = parseInt(mSkuLine[3] || mSkuLine[4] || mSkuLine[5] || mSkuLine[6] || '1', 10);
      if (name.length >= 3 && !nonProductPattern.test(name)) {
        items.push({ name, sku, qty: isNaN(qty) || qty <= 0 ? 1 : qty });
        continue;
      }
    }
  }

  return items;
}

/**
 * Processa um bloco individual de etiqueta e retorna o registro com classificação
 */
export function processLabelBlock(
  rawText: string,
  fileName: string,
  pageNumber: number,
  labelIndex = 0
): ProcessedLabel {
  const id = crypto.randomUUID();
  const textClean = (rawText || '').trim();

  if (!textClean || textClean.length < 15) {
    return {
      id,
      file: fileName,
      page: pageNumber,
      labelIndexOnPage: labelIndex,
      platform: '',
      orderNumber: '',
      confidence: 'Revisar',
      pendingReason: 'Texto ilegível',
      duplicate: false,
      include: false,
      rawSnippet: textClean.slice(0, 100),
      rawText: textClean,
      extractedProducts: [],
    };
  }

  const extractedProducts = extractProductsFromLabel(textClean);

  let platform = detectPlatform(textClean, fileName);
  let orderNumber = extractOrderNumber(textClean, platform);

  // Auto-resolução resiliente: se o número do pedido tiver padrão exclusivo de marketplace
  if (!platform && orderNumber) {
    if (/^(?:999\d{10,15}|57\d{11,16}|58\d{11,16})$/.test(orderNumber)) {
      platform = 'TikTok Shop';
    } else if (
      /^(?:GSH[0-9A-Z]{7,25}|GC\d{8,22}|AJ\d{8,18}|(?:PGK|PE)\d{6,18}|(?:SHN?|SHE)\d{6,22}|[A-Z]{2}\d{9}BR|UP[0-9A-Z]{8,16})$/i.test(
        orderNumber
      )
    ) {
      platform = 'SHEIN';
    } else if (/^20000\d{10,12}$/.test(orderNumber)) {
      platform = 'Mercado Livre';
    } else if (fileName) {
      const fnNorm = normalizeText(fileName);
      if (fnNorm.includes('shein') || fnNorm.includes('shn')) platform = 'SHEIN';
      else if (fnNorm.includes('shopee') || fnNorm.includes('spx')) platform = 'Shopee';
      else if (fnNorm.includes('tiktok')) platform = 'TikTok Shop';
      else if (fnNorm.includes('mercado livre') || fnNorm.includes('meli'))
        platform = 'Mercado Livre';
    }
  }

  // Resgate automático de pedido para plataforma identificada (evita deixar etiquetas SHEIN com pendência quando a plataforma foi confirmada)
  if (platform && !orderNumber) {
    // 1. Tenta encontrar qualquer token alfanumérico não-trivial de 6 a 25 caracteres
    const alphaCand = textClean.match(/\b([A-Z0-9]{6,25})\b/g) || [];
    for (const cand of alphaCand) {
      const u = cand.toUpperCase();
      if (
        !/^(?:DESTINATARIO|REMETENTE|ENDERECO|BAIRRO|CIDADE|ESTADO|BRASIL|ENVIOS|EXPRESS|LOGISTICS|PRODUTO|CONTEUDO|DECLARACAO|AVENIDA|TELEFONE|PAC|SEDEX|CORREIOS|SHEIN|MARKETPLACE|SHOPEE|TIKTOK)$/i.test(
          u
        ) &&
        !/^0+$/.test(u) &&
        !/^\d{8}$/.test(u)
      ) {
        orderNumber = u;
        break;
      }
    }
    // 2. Se a plataforma é certa (ex: SHEIN com logotipo/nome no texto), assegura que a contagem seja honrada:
    if (!orderNumber) {
      orderNumber = `${platform.toUpperCase().replace(/\s+/g, '')}-P${pageNumber}${labelIndex > 0 ? `-${labelIndex + 1}` : ''}`;
    }
  }

  const hasPlatform = Boolean(platform);
  const hasOrder = Boolean(orderNumber);

  let confidence: 'Detectado' | 'Revisar' = 'Revisar';
  let pendingReason: ProcessedLabel['pendingReason'] = '';

  if (hasPlatform && hasOrder) {
    confidence = 'Detectado';
    pendingReason = '';
  } else if (!hasPlatform && hasOrder) {
    pendingReason = 'Plataforma não identificada';
  } else if (hasPlatform && !hasOrder) {
    pendingReason = 'Número do pedido não encontrado';
  } else {
    pendingReason = 'Texto ilegível';
  }

  return {
    id,
    file: fileName,
    page: pageNumber,
    labelIndexOnPage: labelIndex,
    platform,
    orderNumber,
    confidence,
    pendingReason,
    duplicate: false,
    include: confidence === 'Detectado',
    rawSnippet: textClean.slice(0, 120),
    rawText: textClean,
    extractedProducts,
  };
}

/**
 * Realiza deduplicação estrita em 3 níveis e gera o resumo consolidado
 *
 * Fórmula: Total geral = soma dos pedidos únicos válidos confirmados entre as quatro plataformas.
 * Pendências são contabilizadas separadamente e nunca somadas ao total geral.
 */
export function deduplicateAndSummarize(
  labels: ProcessedLabel[],
  knownHistoryHashes: Set<string> = new Set(),
  date = new Date().toISOString().slice(0, 10)
): ShippingReportSummary {
  const counts = createEmptyCounts();
  const seenInThisBatch = new Set<string>();
  const processedItems: ProcessedLabel[] = [];

  let duplicateCount = 0;
  let realPendingCount = 0;

  for (const label of labels) {
    const normNum = normalizeOrderCode(label.orderNumber);

    // 1. Se a etiqueta for incompleta ou ambígua:
    if (!label.platform || !normNum || label.confidence === 'Revisar') {
      realPendingCount++;
      processedItems.push({
        ...label,
        duplicate: false,
        include: false,
        confidence: 'Revisar',
        pendingReason: label.pendingReason || 'Plataforma não identificada',
      });
      continue;
    }

    const uniqueKey = `${label.platform}:${normNum}`;

    // 2. Deduplicação de nível 2: dentro do mesmo arquivo / mesmo lote
    if (seenInThisBatch.has(uniqueKey)) {
      duplicateCount++;
      processedItems.push({
        ...label,
        duplicate: true,
        duplicateScope: 'mesmo_arquivo',
        include: false,
        // Duplicata exata fica fora da contagem, mas não exige conferência manual.
        confidence: 'Detectado',
        pendingReason: '',
      });
      continue;
    }

    seenInThisBatch.add(uniqueKey);

    // 3. Deduplicação de nível 3: com lotes salvos no histórico anterior
    // Verificado de forma síncrona se a chave/hash já for conhecida
    // (Opcional se hashes fornecidos)
    if (knownHistoryHashes.has(uniqueKey)) {
      duplicateCount++;
      processedItems.push({
        ...label,
        duplicate: true,
        duplicateScope: 'historico_anterior',
        include: false,
        // Duplicata exata fica fora da contagem, mas não exige conferência manual.
        confidence: 'Detectado',
        pendingReason: '',
      });
      continue;
    }

    // 4. Pedido único válido confirmado!
    counts[label.platform as Platform]++;
    processedItems.push({
      ...label,
      duplicate: false,
      include: true,
      confidence: 'Detectado',
      pendingReason: '',
    });
  }

  const totalUniqueOrders = Object.values(counts).reduce((acc, val) => acc + val, 0);

  return {
    date,
    counts,
    totalUniqueOrders,
    realPendingCount,
    duplicateCount,
    items: processedItems,
  };
}

/**
 * Formata data no formato brasileiro DD/MM/AAAA
 */
export function formatBrDate(s: string): string {
  const [y, m, d] = (s || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

/**
 * Monta o texto oficial de mensagem para envio no WhatsApp
 */
export function formatWhatsAppMessage(summary: ShippingReportSummary): string {
  const c = summary.counts;
  return [
    '*📦 RELATÓRIO DE PEDIDOS*',
    `📅 Data: ${formatBrDate(summary.date)}`,
    '',
    `🟠 Shopee: ${c['Shopee']} pedido(s)`,
    `🟡 Mercado Livre: ${c['Mercado Livre']} pedido(s)`,
    `⚫ TikTok Shop: ${c['TikTok Shop']} pedido(s)`,
    `⚪ SHEIN: ${c['SHEIN']} pedido(s)`,
    '',
    '━━━━━━━━━━━━━━',
    `📊 *TOTAL GERAL: ${summary.totalUniqueOrders} pedido(s)*`,
    `⚠️ Pendentes de conferência: ${summary.realPendingCount}`,
    '',
    '_MARKETPREÇO | Relatório de expedição_',
  ].join('\n');
}
