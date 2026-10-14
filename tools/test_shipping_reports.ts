import {
  detectPlatform,
  extractOrderNumber,
  processLabelBlock,
  deduplicateAndSummarize,
  segmentPageIntoLabels,
  computeOrderHash,
  formatWhatsAppMessage,
  createEmptyCounts,
  ProcessedLabel,
} from '../src/utils/shippingReportEngine';

console.log('=== INICIANDO SUÍTE DE TESTES OBRIGATÓRIOS (RELATÓRIO DE EXPEDIÇÃO) ===\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, desc: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ [TESTE ${totalTests} PASS]: ${desc}`);
    passedTests++;
  } else {
    console.error(`❌ [TESTE ${totalTests} FAIL]: ${desc}`);
    process.exitCode = 1;
  }
}

// =========================================================================
// TESTE 1: Mercado Livre com Pack ID, NF e códigos de rota
// =========================================================================
const meliLabelText = `
ETIQUETA DE ENVIO
REMETENTE: MEGA FEIRAO DAS LOUCAS LT #1476198771
ROTA: XPR2 > XSP14_3 > SPR8
NF: 141
Pack ID: 2000015425355765
DESTINATARIO: JOAO DA SILVA
RUA DAS FLORES, 123 - CURITIBA PR CEP: 80000-000
||||||||||||||||||||||||||||||||||||||||||||
`;
const meliPlatform = detectPlatform(meliLabelText);
const meliOrder = extractOrderNumber(meliLabelText, meliPlatform);
assert(
  meliPlatform === 'Mercado Livre' && meliOrder === '2000015425355765',
  `1. Mercado Livre identificado corretamente e Pack ID 2000015425355765 extraído (não confundido com NF 141 nem loja #1476198771)`
);

// =========================================================================
// TESTE 2: TikTok Shop com cabeçalho TikTok, J&T Express e Pedido: 999882459194835
// =========================================================================
const tiktokLabelText = `
TIKTOK SHOP
TRANSPORTADORA: J&T EXPRESS
Pedido: 999882459194835
CODIGO DE RASTREIO: JT882459194835
DESTINATARIO: MARIA SOUZA
SAO PAULO SP
Pedido: 999882459194835
`;
const tiktokPlatform = detectPlatform(tiktokLabelText);
const tiktokOrder = extractOrderNumber(tiktokLabelText, tiktokPlatform);
assert(
  tiktokPlatform === 'TikTok Shop' && tiktokOrder === '999882459194835',
  `2. TikTok Shop identificado corretamente e Pedido 999882459194835 extraído via J&T Express`
);

// =========================================================================
// TESTE 3: SHEIN com identificador GSH...
// =========================================================================
const sheinLabelText = `
SHEIN EXPRESS
GSHM88492019483
DESTINATARIO: ANA PAULA
RIO DE JANEIRO RJ
ORDER: GSHM88492019483
`;
const sheinPlatform = detectPlatform(sheinLabelText);
const sheinOrder = extractOrderNumber(sheinLabelText, sheinPlatform);
assert(
  sheinPlatform === 'SHEIN' && sheinOrder === 'GSHM88492019483',
  `3. SHEIN identificada pelo identificador GSH e código GSHM88492019483 extraído`
);

// =========================================================================
// TESTE 3B: SHEIN com número explícito de pedido sem código GSH
// =========================================================================
const sheinOrderWithoutGsh = `
SHEIN EXPRESS
Order ID: SHN20261014001234
CODIGO DE RASTREIO: BR123456789XX
DESTINATARIO: CLIENTE SHEIN
`;
const sheinWithoutGshItem = processLabelBlock(sheinOrderWithoutGsh, 'shein_sem_gsh.pdf', 1, 0);
assert(
  sheinWithoutGshItem.platform === 'SHEIN' &&
    sheinWithoutGshItem.orderNumber === 'SHN20261014001234' &&
    sheinWithoutGshItem.confidence === 'Detectado',
  '3B. SHEIN reconhecida e pedido extraído do campo Order ID mesmo sem identificador GSH'
);

// =========================================================================
// TESTE 3C: SHEIN com GSH separado por espaço (OCR)
// =========================================================================
const sheinGshOcr = `
SHEIN EXPRESS
GSH M88492019483
DESTINATARIO: CLIENTE SHEIN
`;
const sheinGshOcrItem = processLabelBlock(sheinGshOcr, 'shein_ocr.pdf', 1, 0);
assert(
  sheinGshOcrItem.platform === 'SHEIN' &&
    sheinGshOcrItem.orderNumber === 'GSHM88492019483',
  '3C. SHEIN recupera código GSH quando o OCR insere espaço após GSH'
);

// =========================================================================
// TESTE 4: Shopee com SPX Express
// =========================================================================
const shopeeLabelText = `
SHOPEE BRASIL
SPX EXPRESS - SPXBR
Pedido: 24101389XQ92LA
DESTINATARIO: LUCAS MENEZES
BELO HORIZONTE MG
Order SN: 24101389XQ92LA
`;
const shopeePlatform = detectPlatform(shopeeLabelText);
const shopeeOrder = extractOrderNumber(shopeeLabelText, shopeePlatform);
assert(
  shopeePlatform === 'Shopee' && shopeeOrder === '24101389XQ92LA',
  `4. Shopee identificada via SPX Express e pedido 24101389XQ92LA extraído`
);

// =========================================================================
// TESTE 5: O mesmo pedido repetido em vários campos da mesma etiqueta
// =========================================================================
const tiktokRepeatedFields = `
TikTok Shop - J&T EXPRESS
Header: 999882459194835
Pedido: 999882459194835
Barcode text: 999882459194835
Footer: 999882459194835
`;
const labelItem5 = processLabelBlock(tiktokRepeatedFields, 'etiqueta_repetida.pdf', 1, 0);
const summary5 = deduplicateAndSummarize([labelItem5]);
assert(
  summary5.totalUniqueOrders === 1 && summary5.counts['TikTok Shop'] === 1,
  `5. Múltiplas ocorrências do mesmo pedido na mesma etiqueta geram exatamente 1 pedido contabilizado`
);

// =========================================================================
// TESTE 6: A mesma etiqueta repetida no mesmo arquivo
// =========================================================================
const labelItem6a = processLabelBlock(meliLabelText, 'lote.pdf', 1, 0);
const labelItem6b = processLabelBlock(meliLabelText, 'lote.pdf', 2, 0);
const summary6 = deduplicateAndSummarize([labelItem6a, labelItem6b]);
assert(
  summary6.totalUniqueOrders === 1 &&
    summary6.counts['Mercado Livre'] === 1 &&
    summary6.duplicateCount === 1,
  `6. Mesma etiqueta repetida na página 1 e página 2 do mesmo arquivo: deduplicada com sucesso (1 pedido, 1 duplicata)`
);

// =========================================================================
// TESTE 7: A mesma etiqueta importada em outro processamento (histórico anterior)
// =========================================================================
const knownHashes = new Set<string>(['Mercado Livre:2000015425355765']);
const labelItem7 = processLabelBlock(meliLabelText, 'novo_arquivo.pdf', 1, 0);
const summary7 = deduplicateAndSummarize([labelItem7], knownHashes);
assert(
  summary7.totalUniqueOrders === 0 &&
    summary7.duplicateCount === 1 &&
    summary7.items[0].duplicateScope === 'historico_anterior',
  `7. Etiqueta já existente no histórico anterior é marcada como duplicata de histórico e não infla contagem (0 novos)`
);

// =========================================================================
// TESTE 8: Duas etiquetas diferentes do mesmo marketplace
// =========================================================================
const meliLabelText2 = meliLabelText.replace('2000015425355765', '2000015499999999');
const item8a = processLabelBlock(meliLabelText, 'dois_pedidos.pdf', 1, 0);
const item8b = processLabelBlock(meliLabelText2, 'dois_pedidos.pdf', 2, 0);
const summary8 = deduplicateAndSummarize([item8a, item8b]);
assert(
  summary8.totalUniqueOrders === 2 && summary8.counts['Mercado Livre'] === 2,
  `8. Dois pedidos diferentes do Mercado Livre contados individualmente (Total = 2)`
);

// =========================================================================
// TESTE 9: Um PDF com várias páginas (4 páginas, 1 por marketplace)
// =========================================================================
const page1 = processLabelBlock(meliLabelText, '4_paginas.pdf', 1, 0);
const page2 = processLabelBlock(tiktokLabelText, '4_paginas.pdf', 2, 0);
const page3 = processLabelBlock(sheinLabelText, '4_paginas.pdf', 3, 0);
const page4 = processLabelBlock(shopeeLabelText, '4_paginas.pdf', 4, 0);
const summary9 = deduplicateAndSummarize([page1, page2, page3, page4]);
assert(
  summary9.totalUniqueOrders === 4 &&
    summary9.counts['Mercado Livre'] === 1 &&
    summary9.counts['TikTok Shop'] === 1 &&
    summary9.counts['SHEIN'] === 1 &&
    summary9.counts['Shopee'] === 1 &&
    summary9.realPendingCount === 0,
  `9. PDF multipáginas processado com 1 pedido em cada um dos 4 marketplaces sem pendências`
);

// =========================================================================
// TESTE 10: Um PDF com várias etiquetas na mesma página (A4 com 2 etiquetas)
// =========================================================================
const multiLabelPage = `
REMETENTE: LOJA SHEIN
SHEIN EXPRESS
GSHM111122223333
DESTINATARIO: CLIENTE 1
RUA A, 10
--------------------------------------------------
REMETENTE: LOJA SHOPEE
SHOPEE BRASIL SPX EXPRESS
Pedido: 241013778899AA
DESTINATARIO: CLIENTE 2
RUA B, 20
`;
const segments = segmentPageIntoLabels(multiLabelPage);
const label10a = processLabelBlock(segments[0], 'a4_multipla.pdf', 1, 0);
const label10b = processLabelBlock(segments[1], 'a4_multipla.pdf', 1, 1);
const summary10 = deduplicateAndSummarize([label10a, label10b]);
assert(
  segments.length === 2 &&
    summary10.totalUniqueOrders === 2 &&
    summary10.counts['SHEIN'] === 1 &&
    summary10.counts['Shopee'] === 1,
  `10. Página A4 com 2 etiquetas distintas segmentada e contabilizada corretamente (1 SHEIN + 1 Shopee)`
);

// =========================================================================
// TESTE 11: PDF com texto nativo limpo
// =========================================================================
const nativePdfText = `
SHOPEE BRASIL - SPX EXPRESS
Pedido: 241013NATIVE01
DESTINATARIO: PEDRO ALVES
`;
const item11 = processLabelBlock(nativePdfText, 'nativo.pdf', 1, 0);
assert(
  item11.confidence === 'Detectado' &&
    item11.platform === 'Shopee' &&
    item11.orderNumber === '241013NATIVE01',
  `11. Leitura direta de texto nativo com detecção imediata de plataforma e pedido`
);

// =========================================================================
// TESTE 12: Simulação de OCR digitalizado com ruído
// =========================================================================
const ocrScannedText = `
TIKT0K SH0P
TR4NSP0RTAD0RA: J&T EXPRESS
Pedid0: 999882459194835
DESTINAT4RI0: BRUN0 LIMA
`;
const item12 = processLabelBlock(ocrScannedText, 'digitalizado_ocr.pdf', 1, 0);
assert(
  item12.platform === 'TikTok Shop' && item12.orderNumber === '999882459194835',
  `12. Texto digitalizado com pequenas variações de OCR recupera TikTok Shop e número do pedido`
);

// =========================================================================
// TESTE 13: Uma etiqueta ilegível
// =========================================================================
const illegibleText = `??? ~~~ /// ### @@@`;
const item13 = processLabelBlock(illegibleText, 'borrado.pdf', 1, 0);
const summary13 = deduplicateAndSummarize([item13]);
assert(
  item13.confidence === 'Revisar' &&
    item13.pendingReason === 'Texto ilegível' &&
    summary13.totalUniqueOrders === 0 &&
    summary13.realPendingCount === 1,
  `13. Etiqueta ilegível gera exatamente 1 pendência real com motivo claro (Texto ilegível) e 0 pedidos`
);

// =========================================================================
// TESTE 14: Arquivo sem etiquetas válidas
// =========================================================================
const nonLabelText = `
Relatório Financeiro Trimestral
Empresa XPTO Ltda.
Receitas e Despesas do Mês
`;
const item14 = processLabelBlock(nonLabelText, 'financeiro.pdf', 1, 0);
const summary14 = deduplicateAndSummarize([item14]);
assert(
  summary14.totalUniqueOrders === 0 &&
    item14.confidence === 'Revisar' &&
    summary14.realPendingCount === 1,
  `14. Documento sem etiquetas não contabiliza nenhum pedido falso`
);

// =========================================================================
// TESTE 15: Simulação completa de arquivo com 23 etiquetas reais
// =========================================================================
// Cria uma amostra controlada de 23 etiquetas de expedição distribuídas entre as plataformas:
// 8 Mercado Livre, 7 Shopee, 5 TikTok Shop, 3 SHEIN
const labels23: ProcessedLabel[] = [];

for (let i = 1; i <= 8; i++) {
  const text = `
    MERCADO ENVIOS - Pack ID: 200001542535${1000 + i}
    REMETENTE: MEGA FEIRAO DAS LOUCAS LT #1476198771
    ROTA: XPR2 > XSP14_3 > SPR8
    NF: ${140 + i}
  `;
  labels23.push(processLabelBlock(text, 'lote_23_etiquetas.pdf', i, 0));
}

for (let i = 1; i <= 7; i++) {
  const text = `
    SHOPEE - SPX EXPRESS
    Pedido: 241013SPX${1000 + i}
    DESTINATARIO: CLIENTE SHOPEE ${i}
  `;
  labels23.push(processLabelBlock(text, 'lote_23_etiquetas.pdf', 8 + i, 0));
}

for (let i = 1; i <= 5; i++) {
  const text = `
    TIKTOK SHOP - J&T EXPRESS
    Pedido: 9998824591948${10 + i}
    DESTINATARIO: CLIENTE TIKTOK ${i}
  `;
  labels23.push(processLabelBlock(text, 'lote_23_etiquetas.pdf', 15 + i, 0));
}

for (let i = 1; i <= 3; i++) {
  const text = `
    SHEIN EXPRESS
    GSHM99998888${100 + i}
    DESTINATARIO: CLIENTE SHEIN ${i}
  `;
  labels23.push(processLabelBlock(text, 'lote_23_etiquetas.pdf', 20 + i, 0));
}

const summary23 = deduplicateAndSummarize(labels23);
assert(
  labels23.length === 23 &&
    summary23.totalUniqueOrders === 23 &&
    summary23.counts['Mercado Livre'] === 8 &&
    summary23.counts['Shopee'] === 7 &&
    summary23.counts['TikTok Shop'] === 5 &&
    summary23.counts['SHEIN'] === 3 &&
    summary23.realPendingCount === 0 &&
    summary23.duplicateCount === 0,
  `15. Arquivo de 23 etiquetas processa exatamente 23 pedidos únicos (8 ML + 7 Shopee + 5 TikTok + 3 SHEIN), com ZERO pendências e ZERO falsas duplicatas`
);

// =========================================================================
// TESTE 16: Arquivo contendo Mercado Livre e TikTok Shop do mesmo vendedor
// =========================================================================
const mixedMeliPage = `
ETIQUETA DE ENVIO
REMETENTE: MEGA FEIRAO DAS LOUCAS LT #1476198771
ROTA: XPR2 > XSP14_3 > SPR8
NF: 141
Pack ID: 2000015425355765
DESTINATARIO: JOAO DA SILVA
`;
const mixedTikTokPage = `
ETIQUETA DE ENVIO
REMETENTE: MEGA FEIRAO DAS LOUCAS LT #1476198771
TRANSPORTADORA: J&T EXPRESS
NF: 142
Pedido: 999882459194835
DESTINATARIO: MARIA SOUZA
`;
const labelItem16a = processLabelBlock(mixedMeliPage, 'etiquetas_mistas.pdf', 1, 0);
const labelItem16b = processLabelBlock(mixedTikTokPage, 'etiquetas_mistas.pdf', 2, 0);
const summary16 = deduplicateAndSummarize([labelItem16a, labelItem16b]);
assert(
  summary16.totalUniqueOrders === 2 &&
    summary16.counts['Mercado Livre'] === 1 &&
    summary16.counts['TikTok Shop'] === 1 &&
    labelItem16a.platform === 'Mercado Livre' &&
    labelItem16a.orderNumber === '2000015425355765' &&
    labelItem16b.platform === 'TikTok Shop' &&
    labelItem16b.orderNumber === '999882459194835' &&
    summary16.realPendingCount === 0,
  `16. Arquivo contendo Mercado Livre e TikTok Shop do mesmo vendedor com NF reconhece ambos com exatidão (1 ML + 1 TikTok Shop)`
);

// =========================================================================
// TESTE 17: TikTok Shop com variação JNT EXPRESS e sem palavra TikTok explícita
// =========================================================================
const tiktokJntText = `
REMETENTE: MEGA FEIRAO DAS LOUCAS LT #1476198771
JNT EXPRESS
NF: 143
Pedido: 999882459194835
`;
const labelItem17 = processLabelBlock(tiktokJntText, 'etiquetas_mercado_livre.pdf', 1, 0);
assert(
  labelItem17.platform === 'TikTok Shop' &&
    labelItem17.orderNumber === '999882459194835' &&
    labelItem17.confidence === 'Detectado',
  `17. TikTok Shop reconhecido via JNT Express mesmo com nome de arquivo tendencioso e sem palavra TikTok`
);

// =========================================================================
// TESTE 18: TikTok Shop com logotipos em imagem no PDF (apenas Pedido: 999... e NF)
// =========================================================================
const tiktokPureImageLogo = `
REMETENTE: MEGA FEIRAO DAS LOUCAS LT #1476198771
NF: 144
Pedido: 999882459194835
DESTINATARIO: CARLOS PEREIRA
`;
const labelItem18 = processLabelBlock(tiktokPureImageLogo, 'arquivo_geral.pdf', 1, 0);
assert(
  labelItem18.platform === 'TikTok Shop' &&
    labelItem18.orderNumber === '999882459194835' &&
    labelItem18.confidence === 'Detectado',
  `18. TikTok Shop reconhecido pelo padrão exclusivo de pedido 999... mesmo com logotipo em imagem sem texto de cabeçalho`
);

// =========================================================================
// TESTE 19: SHEIN com parceiro Pegaki e código de referência GC...
// =========================================================================
const sheinPegakiText = `
PONTO DE COLETA: REDE PEGAKI
CARRIER: PEGAKI BRASIL
REF. NO: GC2610134951478277
DESTINATARIO: JULIANA SILVA
DF-W-H01
`;
const labelItem19 = processLabelBlock(sheinPegakiText, 'lote_shein.pdf', 1, 0);
assert(
  labelItem19.platform === 'SHEIN' &&
    labelItem19.orderNumber === 'GC2610134951478277' &&
    labelItem19.confidence === 'Detectado',
  `19. SHEIN reconhecida com parceiro logístico Pegaki e código GC extraído com sucesso`
);

// =========================================================================
// TESTE 20: SHEIN com OCR espaçado (S H E I N) e código GSH
// =========================================================================
const sheinSpacedText = `
ETIQUETA DE ENVIO
S H E I N   B R A S I L
Pedido: GSHNA4190008821
DESTINATARIO: MARIANA COSTA
`;
const labelItem20 = processLabelBlock(sheinSpacedText, 'shein_espacado.pdf', 1, 0);
assert(
  labelItem20.platform === 'SHEIN' &&
    labelItem20.orderNumber === 'GSHNA4190008821' &&
    labelItem20.confidence === 'Detectado',
  `20. SHEIN com OCR espaçado "S H E I N" e código GSHNA... detectada com sucesso`
);

// =========================================================================
// TESTE 21: SHEIN com erro de OCR no 'G' (6SH ou CSH)
// =========================================================================
const sheinOcrGlitch = `
SHEIN MARKETPLACE
6SH19C572000RL9
DESTINATARIO: PAULA SANTOS
`;
const labelItem21 = processLabelBlock(sheinOcrGlitch, 'shein_glitch.pdf', 1, 0);
assert(
  labelItem21.platform === 'SHEIN' &&
    labelItem21.orderNumber === 'GSH19C572000RL9' &&
    labelItem21.confidence === 'Detectado',
  `21. SHEIN recupera e normaliza código GSH mesmo com OCR lendo 6SH em vez de GSH`
);

// =========================================================================
// TESTE 22: SHEIN Nacional com razão social e transportadora Anjun
// =========================================================================
const sheinRazaoSocial = `
REMETENTE: SHEIN BRASIL TECNOLOGIA DA INFORMACAO LTDA
CNPJ: 44.498.492/0001-53
ANJUN EXPRESS
Rastreio: AJ9876543210
Pedido: SHN202410149912
`;
const labelItem22 = processLabelBlock(sheinRazaoSocial, 'shein_nacional.pdf', 1, 0);
assert(
  labelItem22.platform === 'SHEIN' &&
    labelItem22.orderNumber === 'SHN202410149912' &&
    labelItem22.confidence === 'Detectado',
  `22. SHEIN Nacional identificada via Razão Social / CNPJ Shein e código SHN extraído`
);

// =========================================================================
// TESTE 23: Lote com 4 etiquetas distintas (1 de cada plataforma), incluindo SHEIN
// =========================================================================
const summaryFourMarkets = deduplicateAndSummarize([
  processLabelBlock(meliLabelText, 'ml.pdf', 1, 0), // ML
  processLabelBlock(tiktokLabelText, 'tiktok.pdf', 1, 0), // TikTok
  labelItem19, // SHEIN Pegaki
  processLabelBlock(shopeeLabelText, 'shopee.pdf', 1, 0), // Shopee
]);
assert(
  summaryFourMarkets.totalUniqueOrders === 4 &&
    summaryFourMarkets.counts['Mercado Livre'] === 1 &&
    summaryFourMarkets.counts['TikTok Shop'] === 1 &&
    summaryFourMarkets.counts['SHEIN'] === 1 &&
    summaryFourMarkets.counts['Shopee'] === 1 &&
    summaryFourMarkets.realPendingCount === 0,
  `23. Relatório consolidado com 1 pedido único em cada um dos 4 marketplaces incluindo SHEIN`
);

// =========================================================================
// TESTE 24: Página com 1 etiqueta SHEIN térmica não é cortada ao meio pelo segmentador
// =========================================================================
const singleSheinPage = `
ETIQUETA DE ENVIO SHEIN
REMETENTE: LOJA MODA FASHION LTDA
DESTINATARIO: JULIANA SILVA
RUA DAS FLORES, 123 - CURITIBA PR

PEDIDO: GSH19C572000RL9
RASTREIO: AJ123456789BR
`;
const singleSegments = segmentPageIntoLabels(singleSheinPage);
assert(
  singleSegments.length === 1,
  `24. Página com 1 única etiqueta SHEIN não é dividida em fragmentos (1 segmento preservado)`
);

// =========================================================================
// TESTE 25: SHEIN com rastreio oficial Correios NL...BR e pedido numérico
// =========================================================================
const sheinCorreiosText = `
CORREIOS - SEDEX
PLP: 123456789
RASTREIO: NL987654321BR
DESTINATARIO: PAULA SOUZA
PEDIDO: 884920194835
`;
const labelItem25 = processLabelBlock(sheinCorreiosText, 'etiquetas_geral.pdf', 1, 0);
assert(
  labelItem25.platform === 'SHEIN' &&
    labelItem25.orderNumber === '884920194835' &&
    labelItem25.confidence === 'Detectado',
  `25. SHEIN identificada via rastreio oficial Correios NL...BR com pedido numérico 884920194835`
);

// =========================================================================
// TESTE 26: SHEIN com código de pedido prefixo SH...
// =========================================================================
const sheinShCode = `
ETIQUETA DE ENVIO
DESTINATARIO: CARLA MENDES
PEDIDO: SH2410149912345
`;
const labelItem26 = processLabelBlock(sheinShCode, 'remessa.pdf', 1, 0);
assert(
  labelItem26.platform === 'SHEIN' &&
    labelItem26.orderNumber === 'SH2410149912345' &&
    labelItem26.confidence === 'Detectado',
  `26. SHEIN identificada via padrão exclusivo de pedido SH2410149912345`
);

// =========================================================================
// TESTE 27: Fallback por nome do arquivo quando logotipo no texto é imagem
// =========================================================================
const sheinImageLogoText = `
REMETENTE: MEU ECOMMERCE
DESTINATARIO: MARCOS LIMA
PEDIDO: 1000492817492
`;
const labelItem27 = processLabelBlock(sheinImageLogoText, 'lote_shein_hoje.pdf', 1, 0);
assert(
  labelItem27.platform === 'SHEIN' &&
    labelItem27.orderNumber === '1000492817492' &&
    labelItem27.confidence === 'Detectado',
  `27. SHEIN resgatada com sucesso pelo nome do arquivo quando texto não tem marca textual explícita`
);

// =========================================================================
// TESTE 28: Etiqueta real SHEIN UpSeller ERP (Screenshot enviado pelo usuário)
// =========================================================================
const realSheinScreenshotText = `
UP8YXK010082 14/10/2026 11:03:33 1/3
SHEIN PUDO D2D Anjun Express
DESTINATÁRIO Pedido:GSH19C572000RL9
Elizete Bousquet Ofugi
SQN 116 Bloco I, 504, Asa Norte, Asa Norte
Brasília / Distrito Federal
CEP:70773-090 Ref.No: GC2610134951478277
AJ261013121661301
DF-W-H001 D2D
DF-W-D013 707
REMETENTE Peso bruto:0.43kg
Juliano Souza Campos
Avenida dez de dezembro, 5800, Iga pó
Londrina / Paraná
CEP:86046-140 Data de envio: 13/10/2026
SKU: 1; Total Items: 1; #UP8YXK010082; Deadline:15/10/2026
1. Manteigueira Em Vidro Redonda Round 10cm Manteiga Mimo *1
`;
const labelItem28 = processLabelBlock(realSheinScreenshotText, '14-10,1.pdf', 1, 0);
assert(
  labelItem28.platform === 'SHEIN' &&
    labelItem28.orderNumber === 'GSH19C572000RL9' &&
    labelItem28.confidence === 'Detectado',
  `28. Etiqueta real SHEIN (UpSeller ERP / Anjun) identificada com Pedido GSH19C572000RL9 sem pendências`
);

// =========================================================================
// TESTE 29: Etiqueta real Shopee UpSeller ERP (Screenshot enviado pelo usuário)
// =========================================================================
const realShopeeScreenshotText = `
UP8YXK010089 14/10/2026 11:03:33 2/3
DESTINATÁRIO Shopee
Andre Costa Pinto
Triocoisas-Ana Jarvis, 164, N/A, Vila Scarpelli, Santo André, São Paulo, 09190110, Santo André, São Paulo
Bairro:
CEP: 09190-110
Pedido: 261014KVS9XT7W
`;
const labelItem29 = processLabelBlock(realShopeeScreenshotText, '14-10,1.pdf', 2, 0);
assert(
  labelItem29.platform === 'Shopee' &&
    labelItem29.orderNumber === '261014KVS9XT7W' &&
    labelItem29.confidence === 'Detectado',
  `29. Etiqueta real Shopee (UpSeller ERP) identificada com Pedido 261014KVS9XT7W sem pendências`
);

// =========================================================================
// TESTE 30: Etiqueta real Mercado Livre UpSeller ERP (Screenshot enviado pelo usuário)
// =========================================================================
const realMeliScreenshotText = `
UP9PXS010783 14/10/2026 12:24:14 7/7
MEGA FEIRAO DAS LOUCAS LT #1476198771
Avenida Tiradentes 7100 Bairro Jardim Rosicler
Londrina BR-PR 86072000
Pack ID: 2000015519771611
XPR2 Despachar: quinta 15/out
48255150941
4 XPR2 XSP14_4 01:00
62 SRS1_A 05:00
XPR2 > XSP14 > ASP1 > ARS1 > SRS1 > 18
DOM 18/10/2026 NF: 153
Luciana Medeiros Botta (BEJ180793)
Endereço: Rua Ely Costa 60, Boa Vista
CEP: 90480110
Cidade de destino: Porto Alegre, Rio Grande do Sul
SKU: 1; Total Items: 6; #UP9PXS010783; Deadline:15/10/2026
1. Manteigueira Em Vidro Redonda Round 10cm Manteiga Mimo (*6)
`;
const labelItem30 = processLabelBlock(realMeliScreenshotText, '14-10,1.pdf', 7, 0);
assert(
  labelItem30.platform === 'Mercado Livre' &&
    labelItem30.orderNumber === '2000015519771611' &&
    labelItem30.confidence === 'Detectado',
  `30. Etiqueta real Mercado Livre (UpSeller ERP) identificada com Pack ID 2000015519771611`
);

// =========================================================================
// TESTE 31: SHEINA (variação OCR) com pedido alfanumérico sem prefixo GSH
// =========================================================================
const sheinaOcrOrder = `
UP8YXK010090 14/10/2026 11:03:33
SHEINA PUDO D2D Anjun Express
DESTINATÁRIO Pedido: 261014KVY30WGX
Ref.No: GC2610134951478299
AJ261013121661309
`;
const labelItem31 = processLabelBlock(sheinaOcrOrder, '14-10,1.pdf', 3, 0);
assert(
  labelItem31.platform === 'SHEIN' &&
    labelItem31.orderNumber === '261014KVY30WGX' &&
    labelItem31.confidence === 'Detectado',
  `31. SHEINA reconhecida como SHEIN e Pedido 261014KVY30WGX priorizado sobre códigos de referência/rastreio`
);

// =========================================================================
// TESTE 32: múltiplos pedidos SHEIN dos PDFs enviados (inclui GSH em Ref.No e deduplica repetição)
// =========================================================================
const sheinOrdersFromUploadedDocs = [
  processLabelBlock(`PUDO D2D\nPedido:GSH19213F001AHX\nRef.No: GC2610134951246850\nAJ261013121660301`, '13-10.pdf', 1, 0),
  processLabelBlock(`PUDO-ANJ-FM\nPedido:GSH19U12A00NLJC\nRef.No: GC2610134951312389\n888002699073795`, '13-10.pdf', 4, 0),
  processLabelBlock(`PUDO-ANJ-FM\nRef.No:GSH19C511001YN6\nGC2610134951412736\nPedido criado em: 10/10/2026`, '13-10.pdf', 7, 0),
  processLabelBlock(`SHEIN PUDO D2D\nPedido:GSH19C572000RL9\nRef.No: GC2610134951478277\nAJ261013121661301`, '14-10,1.pdf', 1, 0),
  processLabelBlock(`SHEIN PUDO D2D\nPedido:GSH19C572000RL9\nRef.No: GC2610134951478277\nAJ261013121661301`, '13-10.pdf', 8, 0),
];
const sheinMultiSummary = deduplicateAndSummarize(sheinOrdersFromUploadedDocs);
assert(
  sheinMultiSummary.counts['SHEIN'] === 4 &&
    sheinMultiSummary.totalUniqueOrders === 4 &&
    sheinMultiSummary.realPendingCount === 0,
  `32. Quatro pedidos SHEIN únicos dos PDFs são contabilizados; GSH repetido entre arquivos é deduplicado sem virar pendência`
);

console.log(`\n======================================================`);
console.log(`RESULTADO FINAL: ${passedTests} de ${totalTests} TESTES APROVADOS!`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
