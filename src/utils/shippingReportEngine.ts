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
  // palavras do nome do arquivo (ex: "etiquetas_mercado_livre.pdf" contendo também TikTok)
  const norm = normalizeText(raw ? raw : fileName);

  // 1. SHEIN: Nome explícito ou identificador inequívoco GSH...
  if (
    norm.includes('shein') ||
    norm.includes('sh ein') ||
    norm.includes('shein express') ||
    /\bgsh[0-9a-z]{8,22}\b/i.test(raw)
  ) {
    return 'SHEIN';
  }

  // 2. SHOPEE: Nome Shopee, SPX Express ou SPXBR
  if (
    norm.includes('shopee') ||
    norm.includes('spx express') ||
    norm.includes('spxbr') ||
    norm.includes('spx') ||
    norm.includes('shopee.com') ||
    /\b(?:order\s*sn)\s*[:#\-]?\s*([2-3][0-9][A-Z0-9]{10,16})/i.test(raw)
  ) {
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

  // e) Campo "Pedido:" com 13 a 18 dígitos quando não é Mercado Livre (sem Pack ID nem rotas Meli)
  const hasGenericOrder14to17 =
    /(?:pedido|order\s*(?:id|number|no\.?|#)?|id\s*do\s*pedido|ped[ilc1o][ldo0])\s*[:#\-]?\s*([0-9]{13,18})\b/i.test(
      raw
    );

  // Layout característico Mercado Envios para desambiguação
  const hasPackId =
    /pack\s*id\s*[:#]?\s*\d+/i.test(raw) ||
    /pacote\s*id\s*[:#]?\s*\d+/i.test(raw) ||
    /\b20000\d{10,12}\b/.test(raw);
  const hasMeliRoute = /\b(xpr\d?|xsp\d?|spr\d?|xsc\d?|xmg\d?|xba\d?|xrs\d?|cpt\d?|rpr\d?|vpr\d?|bsb\d?|xgo\d?)\b/i.test(
    raw
  );

  if (hasTikTokMention) {
    return 'TikTok Shop';
  }
  if (hasJTExpress) {
    return 'TikTok Shop';
  }
  if (hasJTTracking) {
    return 'TikTok Shop';
  }
  if (hasTikTokOrderExplicit || hasTikTokOrderStandalone) {
    return 'TikTok Shop';
  }
  if (hasGenericOrder14to17 && !hasPackId && !hasMeliRoute) {
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
  // - Presença de "Pack ID" (ou Pacote ID)
  // - E obrigatoriamente roteamento Mercado Envios (XPR, XSP, SPR, etc.) ou seller hash #1476198771 com Pack ID
  const hasSellerHashId = /#\d{7,12}\b/.test(raw);

  if (hasPackId && (hasMeliRoute || hasSellerHashId)) {
    return 'Mercado Livre';
  }
  if (hasMeliRoute && (hasPackId || hasSellerHashId)) {
    return 'Mercado Livre';
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

  // A) SHEIN: prioriza o código GSH quando existe na etiqueta.
  // Algumas etiquetas exibem o pedido em campo próprio e não imprimem o GSH;
  // nesses casos, usa o valor explicitamente associado a Pedido/Order ID.
  if (platform === 'SHEIN' || /\bgsh[0-9a-z]{8,22}\b/i.test(raw)) {
    const sheinMatch = raw.match(/\b(GSH[0-9A-Z]{8,22})\b/i);
    if (sheinMatch) return sheinMatch[1].toUpperCase();

    const explicitSheinOrder = raw.match(
      /(?:order\s*(?:id|no\.?|number|#)|order\s*number|pedido(?:\s*(?:id|n[uú]mero|n[ºo°.]?))?|n[uú]mero\s*do\s*pedido|id\s*do\s*pedido)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-]{7,29})/i
    );
    if (explicitSheinOrder) {
      const candidate = explicitSheinOrder[1].replace(/[^A-Z0-9]/gi, '').toUpperCase();
      // Não confundir código GSH já tratado acima nem CEP/telefone curtos.
      if (candidate.length >= 8 && !/^0+$/.test(candidate)) return candidate;
    }

    // Sem código GSH ou campo explícito de pedido, não adivinha a partir de
    // números aleatórios: evita contabilizar rastreio, telefone ou CEP como pedido.
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
    const mVenda =
      raw.match(/(?:venda|id\s*(?:da\s*)?venda|pedido)\s*[:#\-]?\s*(\d{10,20})/i) ||
      raw.match(/(?:venda|pedido)\s*#?\s*(\d{10,20})/i);
    if (mVenda) {
      return mVenda[1].trim();
    }

    // 2. Campo Pack ID: 2000015425355765
    // No Mercado Envios, o Pack ID é o identificador único do pacote/pedido da etiqueta.
    const mPack =
      raw.match(/pack\s*id\s*[:#\-]?\s*(\d{10,20})/i) ||
      raw.match(/pacote\s*id\s*[:#\-]?\s*(\d{10,20})/i);
    if (mPack) {
      return mPack[1].trim();
    }

    // 3. Padrão numérico 20000... típico de Pack ID
    const mPackDirect = raw.match(/\b(20000\d{10,12})\b/);
    if (mPackDirect) {
      return mPackDirect[1];
    }
  }

  // D) SHOPEE:
  if (platform === 'Shopee') {
    // 1. Campo explícito "Pedido:" ou "Order SN:"
    const mShopee =
      raw.match(/(?:order\s*sn|n[uú]mero\s*(?:do\s*)?pedido|pedido)\s*[:#\-]?\s*([2-3][0-9][A-Z0-9]{10,16})/i) ||
      raw.match(/(?:order\s*sn|pedido)\s*[:#\-]?\s*([A-Z0-9]{12,20})/i);
    if (mShopee) {
      return mShopee[1].trim();
    }
    // 2. Padrão Shopee Order SN (começando com ano corrente 24..., 25..., 26...)
    const mPattern = raw.match(/\b(2[3-9][0-9]{2}[A-Z0-9]{10,14})\b/);
    if (mPattern) {
      return mPattern[1];
    }
  }

  // E) BUSCA GENÉRICA RESILIENTE:
  // 1. Padrão específico TikTok (999..., 57..., 58...)
  const mTikTokFallback = raw.match(/\b(999\d{10,15}|57\d{11,16}|58\d{11,16})\b/);
  if (mTikTokFallback) {
    return mTikTokFallback[1];
  }

  // 2. Rótulo explícito "Pedido", "Order ID", "Nº do Pedido"
  const mGenericExplicit = raw.match(
    /(?:n[uú]mero\s*(?:do\s*)?pedido|order\s*(?:id|number|no\.?|#)|id\s*do\s*pedido|pedido|ped[ilc1o][ldo0])\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-]{7,25})/i
  );
  if (mGenericExplicit && !/^(?:00+|141)$/.test(mGenericExplicit[1].trim())) {
    return mGenericExplicit[1].trim();
  }

  // 3. Pack ID genérico
  const mGenericPack = raw.match(/pack\s*id\s*[:#\-]?\s*(\d{10,20})/i);
  if (mGenericPack) {
    return mGenericPack[1].trim();
  }

  // 4. Padrão numérico longo (12 a 18 dígitos, típico de pedidos de marketplace)
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

  // 2. Verifica marcadores múltiplos de início de etiqueta em uma mesma página
  const headerRegex =
    /(?:(?:remetente\s*:|destinat[aá]rio\s*:|pack\s*id\s*:|mercado\s*(?:envios|livre)|spx\s*express|shopee|shein\s*(?:express)?|gsh[0-9a-z]{8,}|tiktok(?:\s*shop)?|tik\s*tok|j\s*&?\s*t\s*(?:express)?|jnt\s*(?:express)?|pedido\s*:\s*(?:999|57|58|2[3-9]|gsh))\b)/gi;

  let match: RegExpExecArray | null;
  const indices: number[] = [];
  while ((match = headerRegex.exec(text)) !== null) {
    indices.push(match.index);
  }

  // Se houver 2 ou mais marcadores com distância (> 60 caracteres),
  // a página contém mais de uma etiqueta impressa em grade (A4).
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
    };
  }

  let platform = detectPlatform(textClean, fileName);
  let orderNumber = extractOrderNumber(textClean, platform);

  // Auto-resolução resiliente: se o número do pedido tiver padrão exclusivo de marketplace
  if (!platform && orderNumber) {
    if (/^(?:999\d{10,15}|57\d{11,16}|58\d{11,16})$/.test(orderNumber)) {
      platform = 'TikTok Shop';
    } else if (/^GSH[0-9A-Z]{8,22}$/i.test(orderNumber)) {
      platform = 'SHEIN';
    } else if (/^20000\d{10,12}$/.test(orderNumber)) {
      platform = 'Mercado Livre';
    } else if (/^2[3-9][0-9]{2}[A-Z0-9]{10,14}$/.test(orderNumber)) {
      platform = 'Shopee';
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
        confidence: 'Revisar',
        pendingReason: 'Possível duplicata',
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
        confidence: 'Revisar',
        pendingReason: 'Possível duplicata',
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
