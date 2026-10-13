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

console.log(`\n======================================================`);
console.log(`RESULTADO FINAL: ${passedTests} de ${totalTests} TESTES APROVADOS!`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
