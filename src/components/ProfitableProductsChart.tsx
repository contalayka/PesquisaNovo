import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Percent,
  Sparkles,
  FileText,
  Upload,
  RefreshCw,
  Search,
  PackageCheck,
  ArrowUpRight,
  LoaderCircle,
  Store,
  Calculator,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Product, getProductSku } from '../types';
import { formatCurrency, parseNumericCost } from '../utils/excel';
import { normalizeProductName } from '../utils/productDeduplication';
import {
  ProcessedLabel,
  Platform,
  PLATFORMS,
  segmentPageIntoLabels,
  processLabelBlock,
  extractProductsFromLabel,
} from '../utils/shippingReportEngine';

// Configuração do worker do PDF.js
(pdfjsLib as any).GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const ORDER_STORAGE_KEY = 'marketpreco_shipping_report_orders_v1';
const HISTORY_LABELS_KEY = 'marketpreco_shipping_report_history_labels_v1';

export interface ProfitableProductsChartProps {
  products: Product[];
  labels?: ProcessedLabel[];
  onOpenResearch?: (product: Product) => void;
  onOpenSimulator?: (product: Product) => void;
  onNavigateToProducts?: () => void;
  onNavigateToReports?: () => void;
}

export interface PdfProductProfitItem {
  id: string;
  name: string;
  shortName: string;
  sku: string;
  quantityShipped: number;
  orderCount: number;
  platforms: Platform[];
  cost: number;
  discountedCost: number;
  marketPrice: number;
  unitProfit: number;
  unitProfitWithDiscount: number;
  totalBatchProfit: number;
  marginPercent: number;
  markupPercent: number;
  researchCount: number;
  matchedProduct?: Product;
  hasCatalogMatch: boolean;
  profitCalculated?: boolean;
}

function loadHistoricalLabels(): ProcessedLabel[] {
  try {
    const current = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) || '[]');
    const batches = JSON.parse(localStorage.getItem(HISTORY_LABELS_KEY) || '[]');
    const historical = Array.isArray(batches)
      ? batches.flatMap((batch: any) => Array.isArray(batch?.labels) ? batch.labels : [])
      : [];
    const combined = [...historical, ...(Array.isArray(current) ? current : [])] as ProcessedLabel[];
    const seen = new Set<string>();
    return combined.filter((label) => {
      if (label.duplicate) return false;
      const order = String(label.orderNumber || '').trim().toLowerCase();
      const key = label.platform && order
        ? `${label.platform}:${order}`
        : `${label.file || ''}:${label.page || 0}:${label.labelIndexOnPage || 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    console.warn('Não foi possível ler o histórico de itens:', error);
    return [];
  }
}

export const ProfitableProductsChart: React.FC<ProfitableProductsChartProps> = ({
  products = [],
  labels: initialLabels,
  onOpenResearch,
  onOpenSimulator,
  onNavigateToProducts,
  onNavigateToReports,
}) => {
  const [labels, setLabels] = useState<ProcessedLabel[]>(initialLabels || []);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [metricMode, setMetricMode] = useState<'unitProfit' | 'totalBatchProfit' | 'margin'>('totalBatchProfit');
  const [topCount, setTopCount] = useState<number>(6);
  const [isProcessingPdf, setIsProcessingPdf] = useState<boolean>(false);
  const [pdfFileName, setPdfFileName] = useState<string>('');
  const [uploadNotice, setUploadNotice] = useState<string>('');

  // 1. Carrega etiquetas geradas no Relatório de Expedição do localStorage se não forem passadas via props
  useEffect(() => {
    if (initialLabels && initialLabels.length > 0) {
      setLabels(initialLabels);
      return;
    }
    try {
      const parsed = loadHistoricalLabels();
      if (parsed.length > 0) {
        setLabels(parsed);
        const firstFile = parsed[0]?.file;
        if (firstFile) setPdfFileName(firstFile);
      }
    } catch (e) {
      console.warn('Aviso ao carregar etiquetas salvas do relatório:', e);
    }
  }, [initialLabels]);

  // Escuta atualizações automáticas geradas em tempo real ao ler ou alterar etiquetas no relatório
  useEffect(() => {
    const handleUpdate = () => {
      if (initialLabels && initialLabels.length > 0) return;
      try {
        const parsed = loadHistoricalLabels();
        if (parsed.length > 0) {
          setLabels(parsed);
          const firstFile = parsed[0]?.file;
          if (firstFile) setPdfFileName(firstFile);
        }
      } catch (e) {
        console.warn('Aviso ao atualizar etiquetas em tempo real:', e);
      }
    };

    window.addEventListener('marketpreco_labels_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('marketpreco_labels_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [initialLabels]);

  // Permite recarregar as etiquetas mais recentes salvas do relatório
  const reloadFromReportCache = () => {
    try {
      const parsed = loadHistoricalLabels();
      if (parsed.length > 0) {
        setLabels(parsed);
        const firstFile = parsed[0]?.file;
        if (firstFile) setPdfFileName(firstFile);
        setUploadNotice(`${parsed.length} etiqueta(s) sincronizada(s) do histórico de pedidos.`);
        return;
      }
      setUploadNotice('Nenhum lote de relatório encontrado no momento. Envie o PDF abaixo.');
    } catch (e) {
      console.warn('Erro ao ler cache do relatório:', e);
    }
  };

  // 2. Upload direto de PDF de etiquetas na própria tela do Dashboard
  const handlePdfUpload = async (file: File) => {
    if (!file) return;
    setIsProcessingPdf(true);
    setPdfFileName(file.name);
    setUploadNotice(`Lendo páginas do PDF ${file.name}...`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const extractedLabels: ProcessedLabel[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const tc = await page.getTextContent();
        let pageText = '';
        let lastY: number | null = null;

        for (const item of (tc.items || []) as any[]) {
          if (!item.str) continue;
          const curY = item.transform ? item.transform[5] : null;
          if (lastY !== null && curY !== null && Math.abs(curY - lastY) > 5) {
            pageText += '\n';
          } else if (pageText.length > 0 && !pageText.endsWith('\n') && !pageText.endsWith(' ')) {
            pageText += ' ';
          }
          pageText += item.str;
          if (item.hasEOL) pageText += '\n';
          if (curY !== null) lastY = curY;
        }

        const segments = segmentPageIntoLabels(pageText.trim());
        segments.forEach((seg, idx) => {
          extractedLabels.push(processLabelBlock(seg, file.name, pageNum, idx));
        });
      }

      setLabels(extractedLabels);
      setUploadNotice(`Sucesso! ${extractedLabels.length} etiqueta(s) lida(s) de ${file.name}.`);
      try {
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(extractedLabels));
      } catch (e) {
        console.warn('Aviso ao persistir etiquetas no storage:', e);
      }
    } catch (err: any) {
      console.error('Erro ao ler PDF de etiquetas:', err);
      setUploadNotice(`Falha ao ler o PDF: ${err?.message || String(err)}`);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // 3. Cruzamento inteligente entre os produtos das etiquetas do PDF e o catálogo de produtos pesquisados
  const pdfProducts = useMemo<PdfProductProfitItem[]>(() => {
    // Agrupamento por nome normalizado de produto
    const productMap = new Map<
      string,
      {
        displayName: string;
        quantity: number;
        orderCount: number;
        platforms: Set<Platform>;
      }
    >();

    // Filtra etiquetas válidas (e por plataforma, se selecionada)
    const validLabels = labels.filter((l) => {
      if (l.duplicate) return false;
      if (selectedPlatform !== 'all' && l.platform !== selectedPlatform) return false;
      return true;
    });

    for (const label of validLabels) {
      // 1. Tenta pegar os itens já extraídos da etiqueta
      let items = label.extractedProducts || [];

      // 2. Se a etiqueta ainda não tiver itens extraídos (ex: carregada de cache antigo), tenta extrair do snippet/texto
      if (items.length === 0 && (label.rawText || label.rawSnippet)) {
        items = extractProductsFromLabel(label.rawText || label.rawSnippet || '');
      }

      // 3. Se ainda não achou itens estruturados pelo padrão UpSeller/ERP,
      // busca por correspondência de nomes de produtos do catálogo dentro do texto da etiqueta
      if (items.length === 0 && (label.rawText || label.rawSnippet)) {
        const fullText = (label.rawText || label.rawSnippet || '').toLowerCase();
        for (const p of products) {
          if (!p.name || p.name.length < 5) continue;
          const cleanP = p.name.trim().toLowerCase();
          if (fullText.includes(cleanP)) {
            items.push({ name: p.name, qty: 1, sku: getProductSku(p) });
            break;
          }
        }
      }

      // Adiciona ao mapa consolidado
      for (const it of items) {
        const normKey = normalizeProductName(it.name);
        if (!normKey || normKey.length < 3) continue;

        const existing = productMap.get(normKey);
        const qty = it.qty > 0 ? it.qty : 1;
        const platform = label.platform as Platform;

        if (existing) {
          existing.quantity += qty;
          existing.orderCount += 1;
          if (platform) existing.platforms.add(platform);
        } else {
          const platformsSet = new Set<Platform>();
          if (platform) platformsSet.add(platform);
          productMap.set(normKey, {
            displayName: it.name.trim(),
            quantity: qty,
            orderCount: 1,
            platforms: platformsSet,
          });
        }
      }
    }

    // Agora cruza com o catálogo de produtos para obter Custo Atual e Preço Médio das Pesquisas
    const result: PdfProductProfitItem[] = [];

    productMap.forEach((entry, normKey) => {
      // Busca melhor produto correspondente no catálogo
      let matchedProd: Product | undefined = undefined;
      let highestScore = 0;

      const labelWords = normKey.split(/\s+/).filter((w) => w.length > 2);

      for (const p of products) {
        const normProd = normalizeProductName(p.name);
        if (normKey === normProd) {
          matchedProd = p;
          highestScore = 1.0;
          break;
        }
        if (normKey.includes(normProd) || normProd.includes(normKey)) {
          matchedProd = p;
          highestScore = 0.95;
          break;
        }

        // Pontuação por sobreposição de palavras relevantes
        const prodWords = normProd.split(/\s+/).filter((w) => w.length > 2);
        let common = 0;
        for (const w of prodWords) {
          if (labelWords.includes(w)) common++;
        }
        const score = common / Math.max(prodWords.length, 1);
        if (score > highestScore && common >= 2) {
          highestScore = score;
          matchedProd = p;
        }
      }

      // Se encontrou no catálogo, obtém Custo e Pesquisas
      let cost = 0;
      let marketPrice = 0;
      let validResearchCount = 0;

      if (matchedProd) {
        const parsedCost = parseNumericCost(matchedProd.cost);
        cost = parsedCost !== null && parsedCost > 0 ? parsedCost : 0;

        const recs = matchedProd.research_records || [];
        const validPrices: number[] = [];
        for (const r of recs) {
          const pr = parseNumericCost(r.price);
          if (pr !== null && pr > 0) validPrices.push(pr);
        }

        validResearchCount = validPrices.length;
        if (validPrices.length > 0) {
          marketPrice = validPrices.reduce((sum, v) => sum + v, 0) / validPrices.length;
        }
      }

      // O preço pesquisado de concorrentes não é necessariamente o preço real de venda.
      // Nunca estimar custo ou preço quando os dados não estiverem cadastrados.
      const finalCost = cost > 0 ? cost : 0;
      const salePriceKeys = ['preco_venda', 'preço de venda', 'preco de venda', 'sale_price', 'selling_price', 'valor de venda', 'preço venda', 'preco venda'];
      let savedSalePrice = 0;
      if (matchedProd?.rawColumns) {
        for (const [key, value] of Object.entries(matchedProd.rawColumns)) {
          const normalizedKey = key.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ').trim();
          const isSalePrice = salePriceKeys.some((candidate) =>
            normalizedKey === candidate.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ').trim()
          );
          if (isSalePrice) {
            const parsed = parseNumericCost(value as any);
            if (parsed !== null && parsed > 0) { savedSalePrice = parsed; break; }
          }
        }
      }
      const finalMarketPrice = savedSalePrice;
      const hasProfitData = finalCost > 0 && finalMarketPrice > 0;
      const unitProfit = hasProfitData ? finalMarketPrice - finalCost : 0;
      const totalBatchProfit = unitProfit * entry.quantity;
      const marginPercent = hasProfitData ? (unitProfit / finalMarketPrice) * 100 : 0;
      const markupPercent = hasProfitData ? (unitProfit / finalCost) * 100 : 0;

      const cleanName = matchedProd ? matchedProd.name : entry.displayName;
      const shortName = cleanName.length > 24 ? cleanName.slice(0, 22) + '...' : cleanName;

      const discountedCost = Number((finalCost * 0.9).toFixed(2));
      const unitProfitWithDiscount = hasProfitData
        ? Number((finalMarketPrice - discountedCost).toFixed(2))
        : 0;

      result.push({
        id: matchedProd ? matchedProd.id : `pdf-prod-${normKey.slice(0, 10)}`,
        name: cleanName,
        shortName,
        sku: matchedProd ? getProductSku(matchedProd) : 'PDF-ITEM',
        quantityShipped: entry.quantity,
        orderCount: entry.orderCount,
        platforms: Array.from(entry.platforms),
        cost: Number(finalCost.toFixed(2)),
        discountedCost,
        marketPrice: Number(finalMarketPrice.toFixed(2)),
        unitProfit: Number(unitProfit.toFixed(2)),
        unitProfitWithDiscount,
        totalBatchProfit: Number(totalBatchProfit.toFixed(2)),
        marginPercent: Number(marginPercent.toFixed(1)),
        markupPercent: Number(markupPercent.toFixed(1)),
        researchCount: validResearchCount,
        matchedProduct: matchedProd,
        hasCatalogMatch: Boolean(matchedProd),
        profitCalculated: hasProfitData,
      });
    });

    return result;
  }, [labels, products, selectedPlatform]);

  // Exibir somente produtos reais com lucro calculável, sem dados demonstrativos.
  const hasRealPdfData = pdfProducts.length > 0;
  const activeItems = pdfProducts.filter((item) => item.profitCalculated);

  // Ordenação de acordo com a métrica escolhida
  const sortedItems = useMemo(() => {
    const list = [...activeItems];
    if (metricMode === 'totalBatchProfit') {
      list.sort((a, b) => b.totalBatchProfit - a.totalBatchProfit);
    } else if (metricMode === 'unitProfit') {
      list.sort((a, b) => b.unitProfit - a.unitProfit);
    } else {
      list.sort((a, b) => b.marginPercent - a.marginPercent);
    }
    return list.slice(0, topCount);
  }, [activeItems, metricMode, topCount]);

  // Estatísticas agregadas do lote PDF
  const stats = useMemo(() => {
    if (sortedItems.length === 0) {
      return {
        topItem: null,
        totalBatchProfitSum: 0,
        avgMargin: 0,
        totalUnitsShipped: 0,
        labelsCount: labels.length,
      };
    }
    const topItem = sortedItems[0];
    const totalBatchProfitSum = sortedItems.reduce((acc, it) => acc + it.totalBatchProfit, 0);
    const totalMargin = sortedItems.reduce((acc, it) => acc + it.marginPercent, 0);
    const totalUnitsShipped = activeItems.reduce((acc, it) => acc + it.quantityShipped, 0);

    return {
      topItem,
      totalBatchProfitSum,
      avgMargin: totalMargin / sortedItems.length,
      totalUnitsShipped,
      labelsCount: labels.length,
    };
  }, [sortedItems, activeItems, labels]);

  const handleBarClick = (entry: any) => {
    if (!entry) return;
    const it = sortedItems.find((s) => s.id === entry.id || s.name === entry.name);
    if (it && it.matchedProduct) {
      if (onOpenSimulator) {
        onOpenSimulator(it.matchedProduct);
      } else if (onOpenResearch) {
        onOpenResearch(it.matchedProduct);
      }
    }
  };

  return (
    <section className="mp-panel rounded-2xl p-5 border border-cyan-500/25 bg-[#041825]/95 space-y-4">
      {/* 1. Header do Gráfico com Título e Ações */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-cyan-900/40 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              <TrendingUp className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Produtos Mais Lucrativos — Histórico de Pedidos
            </h2>
            {hasRealPdfData ? (
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-600/40 text-emerald-300">
                Histórico ({labels.length} etiquetas)
              </span>
            ) : (
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-600/40 text-cyan-300">
                Sem dados reais
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Itens dos pedidos salvos, usando valores cadastrados no catálogo. Preços pesquisados de concorrentes não são tratados como venda realizada.
          </p>
        </div>

        {/* Botão de Upload / Sincronização de PDF */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/30 hover:bg-cyan-900/40 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition cursor-pointer">
            {isProcessingPdf ? (
              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span>{isProcessingPdf ? 'Processando PDF...' : 'Carregar PDF de Etiquetas'}</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              disabled={isProcessingPdf}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handlePdfUpload(f);
              }}
            />
          </label>

          <button
            type="button"
            onClick={reloadFromReportCache}
            title="Sincronizar com os arquivos do Relatório de Expedição"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 hover:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Sincronizar Relatório</span>
          </button>
        </div>
      </div>

      {/* Aviso contextual do lote */}
      {uploadNotice && (
        <div className="text-xs px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-800/40 text-cyan-200 flex items-center justify-between">
          <span>{uploadNotice}</span>
          <button
            type="button"
            onClick={() => setUploadNotice('')}
            className="text-cyan-400 hover:text-white text-xs ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* 2. Barra de Filtros e Métrica */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[#061b29] p-2.5 rounded-xl border border-cyan-900/30 text-xs">
        {/* Filtro por Plataforma do PDF */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-[11px] text-slate-400 uppercase font-mono mr-1">Canal:</span>
          <button
            type="button"
            onClick={() => setSelectedPlatform('all')}
            className={`px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
              selectedPlatform === 'all'
                ? 'bg-cyan-600 text-white font-bold shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos os Canais
          </button>
          {PLATFORMS.map((plat) => (
            <button
              key={plat}
              type="button"
              onClick={() => setSelectedPlatform(plat)}
              className={`px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                selectedPlatform === plat
                  ? 'bg-cyan-600 text-white font-bold shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {plat}
            </button>
          ))}
        </div>

        {/* Alternância de Métrica: Lucro Total do Lote vs Lucro Unitário vs Margem */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-[#041420] p-0.5 border border-cyan-900/50 text-xs">
            <button
              type="button"
              onClick={() => setMetricMode('totalBatchProfit')}
              title="Lucro total somando todas as unidades expedidas deste produto no PDF"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                metricMode === 'totalBatchProfit'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <PackageCheck className="w-3.5 h-3.5" />
              <span>Lucro no Lote (R$)</span>
            </button>

            <button
              type="button"
              onClick={() => setMetricMode('unitProfit')}
              title="Lucro estimado por unidade vendida"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                metricMode === 'unitProfit'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Lucro Unitário</span>
            </button>

            <button
              type="button"
              onClick={() => setMetricMode('margin')}
              title="Margem bruta percentual sobre o preço de mercado"
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                metricMode === 'margin'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Percent className="w-3.5 h-3.5" />
              <span>Margem (%)</span>
            </button>
          </div>

          {/* Seletor Top N */}
          <div className="inline-flex rounded-lg bg-[#041420] p-0.5 border border-cyan-900/50 text-xs">
            {[5, 6, 8, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTopCount(n)}
                className={`px-2 py-1 rounded-md transition font-mono cursor-pointer ${
                  topCount === n
                    ? 'bg-cyan-600 text-white font-bold shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Top {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Cards de Destaque com Métricas Financeiras do Lote PDF */}
      {sortedItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: Produto Mais Lucrativo do PDF */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5">
            <div className="text-[11px] font-medium text-emerald-400/90 uppercase tracking-wider flex items-center justify-between">
              <span>Mais Lucrativo no PDF</span>
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="mt-1 text-sm font-bold text-white truncate" title={stats.topItem?.name}>
              {stats.topItem?.name}
            </div>
            <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-xl font-extrabold text-emerald-300">
                +{formatCurrency(stats.topItem?.totalBatchProfit)}
              </span>
              <span className="text-xs text-emerald-400 font-semibold">
                ({stats.topItem?.quantityShipped} un. no lote)
              </span>
            </div>
          </div>

          {/* Card 2: Lucro Total Projetado no Lote */}
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3.5">
            <div className="text-[11px] font-medium text-cyan-400/90 uppercase tracking-wider">
              Lucro calculável (Top {sortedItems.length} Itens)
            </div>
            <div className="mt-1 text-xl font-extrabold text-white font-mono tabular-nums">
              +{formatCurrency(stats.totalBatchProfitSum)}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {stats.totalUnitsShipped} unidades expedidas nos pedidos deste lote
            </div>
          </div>

          {/* Card 3: Margem Média dos Produtos no Lote */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3.5">
            <div className="text-[11px] font-medium text-slate-300 uppercase tracking-wider">
              Margem Bruta Média
            </div>
            <div className="mt-1 text-xl font-extrabold text-cyan-300 font-mono tabular-nums">
              {stats.avgMargin.toFixed(1)}%
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Spread sobre o preço de mercado concorrência
            </div>
          </div>
        </div>
      )}

      {/* 4. Gráfico Recharts Principal */}
      {sortedItems.length > 0 ? (
        <div className="w-full space-y-3">
          <div className="h-80 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sortedItems}
                margin={{ top: 15, right: 20, left: 10, bottom: 40 }}
                onClick={(state: any) => {
                  if (state && state.activePayload && state.activePayload.length) {
                    handleBarClick(state.activePayload[0].payload);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#0e3347" vertical={false} />
                <XAxis
                  dataKey="shortName"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  interval={0}
                  angle={-18}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                  tickFormatter={(val) => `R$ ${val}`}
                />
                <Tooltip
                  content={<CustomTooltip metricMode={metricMode} />}
                  cursor={{ fill: 'rgba(0, 245, 160, 0.05)' }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: 10, fontSize: 12 }}
                  formatter={(value) => {
                    if (value === 'cost') return <span className="text-cyan-300">Custo Atual</span>;
                    if (value === 'marketPrice')
                      return <span className="text-emerald-300">Preço Médio Mercado</span>;
                    return value;
                  }}
                />
                <Bar
                  dataKey="cost"
                  name="cost"
                  fill="#0284c7"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={45}
                />
                <Bar
                  dataKey="marketPrice"
                  name="marketPrice"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={45}
                >
                  {sortedItems.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.unitProfit >= 0 ? '#10b981' : '#f43f5e'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Dica interativa ao usuário */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              Clique em qualquer barra do gráfico para abrir a simulação de preço ou pesquisas do item.
            </span>
            <div className="mt-1 sm:mt-0 flex items-center gap-3">
              <span className="text-slate-400">
                Azul: <strong className="text-cyan-300 font-mono">Custo Atual</strong>
              </span>
              <span className="text-slate-400">
                Verde: <strong className="text-emerald-300 font-mono">Preço de venda cadastrado</strong>
              </span>
            </div>
          </div>

          {/* Tabela Detalhada com Produtos do PDF e Valor de Custo com -10% */}
          <div className="mt-3 rounded-xl border border-slate-800 bg-[#081522] overflow-hidden">
            <div className="p-3 bg-[#0a1b2b] border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <PackageCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Detalhamento dos Produtos Encontrados no PDF
                </span>
                <span className="text-[11px] text-teal-300 bg-teal-950/70 border border-teal-700/60 px-2 py-0.5 rounded font-mono font-semibold">
                  Custo -10% calculado para cada item
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {sortedItems.length} {sortedItems.length === 1 ? 'produto exibido' : 'produtos exibidos'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#061421] text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                    <th className="py-2.5 px-3">Produto / SKU</th>
                    <th className="py-2.5 px-3 text-center">Qtd no PDF</th>
                    <th className="py-2.5 px-3">Custo Atual</th>
                    <th className="py-2.5 px-3 text-teal-300 font-bold">Custo -10%</th>
                    <th className="py-2.5 px-3">Preço Médio Venda</th>
                    <th className="py-2.5 px-3">Lucro Unitário</th>
                    <th className="py-2.5 px-3">Lucro c/ Custo -10%</th>
                    <th className="py-2.5 px-3 text-right">Lucro Total Lote</th>
                    <th className="py-2.5 px-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {sortedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-200 line-clamp-1" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          SKU: {item.sku} {item.platforms.length > 0 && `• ${item.platforms.join(', ')}`}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-white">
                        {item.quantityShipped} un.
                      </td>
                      <td className="py-2.5 px-3 font-mono text-cyan-300 font-semibold tabular-nums">
                        {formatCurrency(item.cost)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        <span className="font-bold text-teal-300 bg-teal-950/70 border border-teal-700/60 px-1.5 py-0.5 rounded inline-block shadow-xs">
                          {formatCurrency(item.discountedCost)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-emerald-300 font-semibold tabular-nums">
                        {formatCurrency(item.marketPrice)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold tabular-nums text-slate-200">
                        +{formatCurrency(item.unitProfit)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-extrabold tabular-nums text-teal-300">
                        +{formatCurrency(item.unitProfitWithDiscount)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold tabular-nums text-right text-emerald-400">
                        +{formatCurrency(item.totalBatchProfit)}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {item.matchedProduct && onOpenSimulator && (
                            <button
                              type="button"
                              onClick={() => onOpenSimulator(item.matchedProduct!)}
                              title="Simular Lucro & Margem"
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-300 border border-slate-700 transition"
                            >
                              <Calculator className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {item.matchedProduct && onOpenResearch && (
                            <button
                              type="button"
                              onClick={() => onOpenResearch(item.matchedProduct!)}
                              title="Pesquisar Preço Concorrentes"
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition"
                            >
                              <Search className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* 5. Estado Vazio Orientado com Ação */
        <div className="py-10 px-4 text-center rounded-xl border border-dashed border-cyan-900/50 bg-[#061824]/50 space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-cyan-950/60 border border-cyan-700/40 flex items-center justify-center text-cyan-400">
            <FileText className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-sm font-bold text-white">
              Nenhum produto de etiqueta PDF carregado ainda
            </h3>
            <p className="text-xs text-slate-400">
              O gráfico calcula a lucratividade exata dos produtos enviados nos seus arquivos de etiquetas em PDF
              (Shopee, Mercado Livre, SHEIN e TikTok Shop) com base no custo atual e pesquisas de mercado.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Carregar PDF de Etiquetas de Envio</span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                disabled={isProcessingPdf}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handlePdfUpload(f);
                }}
              />
            </label>

            {onNavigateToReports && (
              <button
                type="button"
                onClick={onNavigateToReports}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-cyan-700/50 bg-cyan-950/40 hover:bg-cyan-900/40 text-xs font-medium text-cyan-300 transition cursor-pointer"
              >
                <Store className="w-3.5 h-3.5" />
                <span>Ir para Relatório de Expedição</span>
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

/**
 * Tooltip customizado com os dados específicos do produto extraído do PDF
 */
const CustomTooltip = ({ active, payload, metricMode }: any) => {
  if (active && payload && payload.length) {
    const data: PdfProductProfitItem = payload[0].payload;
    return (
      <div className="rounded-xl border border-cyan-500/40 bg-[#061b29] p-3.5 shadow-2xl text-xs space-y-2 min-w-64 font-sans">
        <div className="border-b border-cyan-900/50 pb-2">
          <div className="font-bold text-white text-sm line-clamp-2">{data.name}</div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-0.5">
            <span>SKU: {data.sku}</span>
            <span className="text-emerald-300 font-semibold">{data.quantityShipped} un. no PDF</span>
          </div>
          {data.platforms.length > 0 && (
            <div className="text-[10px] text-cyan-300/80 mt-0.5">
              Canal: {data.platforms.join(', ')}
            </div>
          )}
        </div>

        <div className="space-y-1.5 font-mono tabular-nums text-xs">
          <div className="flex justify-between items-center text-slate-300">
            <span className="flex items-center gap-1 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
              Custo Atual:
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-cyan-200">{formatCurrency(data.cost)}</span>
              {data.discountedCost > 0 && (
                <span
                  className="font-mono tabular-nums font-bold text-[10px] text-teal-300 bg-teal-950/70 border border-teal-700/60 px-1 rounded shadow-xs"
                  title={`Custo com -10%: ${formatCurrency(data.discountedCost)}`}
                >
                  -10%: {formatCurrency(data.discountedCost)}
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center text-slate-300">
            <span className="flex items-center gap-1 text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Preço Médio Pesquisas:
            </span>
            <span className="font-semibold text-emerald-300">{formatCurrency(data.marketPrice)}</span>
          </div>

          <div className="border-t border-cyan-900/40 pt-1.5 flex justify-between items-center">
            <span className="text-slate-200 font-medium font-sans">Lucro Unitário:</span>
            <span className={`font-bold ${data.unitProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              +{formatCurrency(data.unitProfit)}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs bg-emerald-950/30 px-2 py-1 rounded border border-emerald-900/40">
            <span className="text-emerald-300 font-medium font-sans">Lucro Total no Lote PDF:</span>
            <span className="font-extrabold text-emerald-300">
              +{formatCurrency(data.totalBatchProfit)}
            </span>
          </div>

          <div className="flex justify-between items-center text-[11px] pt-1">
            <span className="text-slate-400 font-sans">Margem Bruta:</span>
            <span className="font-bold text-cyan-300">{data.marginPercent}%</span>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-400 font-sans">Markup sobre Custo:</span>
            <span className="text-slate-300">{data.markupPercent}%</span>
          </div>
        </div>

        <div className="border-t border-cyan-900/40 pt-1.5 text-[10px] text-cyan-400 flex items-center justify-between font-sans">
          <span>Clique para abrir simulador de margem</span>
          <ArrowUpRight className="w-3 h-3" />
        </div>
      </div>
    );
  }
  return null;
};
