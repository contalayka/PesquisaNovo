import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  ArrowRight,
  Download,
  Check,
  Package,
  SlidersHorizontal,
  Image as ImageIcon,
  Undo2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Product } from '../types';
import { ProductImage } from './ProductImage';
import { resolveImageUrl, formatCurrency, normalizeStr, parseNumber } from '../utils/excel';
import {
  normalizeProductName,
  normalizeCode,
  isCostDifferent,
  parseNumericCost,
} from '../utils/productDeduplication';

export interface ColumnMapping {
  name: string;
  cost: string;
  image: string;
  available?: string;
  id?: string;
  status?: string;
}

export interface ExcelParseResult {
  headers: string[];
  rows: any[];
  fileName: string;
  totalRows: number;
}

interface CatalogImportViewProps {
  currentProductCount: number;
  currentProducts: Product[];
  onFileSelect: (file: File) => void;
  parseResult: ExcelParseResult | null;
  detectedMappings: ColumnMapping | null;
  onConfirmImport: (mappings: ColumnMapping, mode: 'merge' | 'replace', options?: { markMissingAsNotInCatalog?: boolean }) => void;
  onCancelImport: () => void;
  onDownloadTemplate: () => void;
  onNavigateToProducts: () => void;
  onUndoLastImport?: () => void;
  canUndoImport?: boolean;
}

export const CatalogImportView: React.FC<CatalogImportViewProps> = ({
  currentProductCount,
  currentProducts,
  onFileSelect,
  parseResult,
  detectedMappings,
  onConfirmImport,
  onCancelImport,
  onDownloadTemplate,
  onNavigateToProducts,
  onUndoLastImport,
  canUndoImport = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(parseResult ? 3 : 1);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [activeReviewTab, setActiveReviewTab] = useState<'prices' | 'new' | 'missing' | 'unchanged'>('prices');
  const [markMissingAsNotInCatalog, setMarkMissingAsNotInCatalog] = useState(true);
  const userHasPickedTabRef = useRef(false);

  const handleSelectReviewTab = (tab: 'prices' | 'new' | 'missing' | 'unchanged') => {
    userHasPickedTabRef.current = true;
    setActiveReviewTab(tab);
  };

  const [customMappings, setCustomMappings] = useState<ColumnMapping>(
    detectedMappings || {
      name: '',
      cost: '',
      available: '',
      image: '',
      id: '',
      status: '',
    }
  );

  const [finishedSuccess, setFinishedSuccess] = useState(false);

  React.useEffect(() => {
    if (detectedMappings) {
      setCustomMappings(detectedMappings);
      if (parseResult) {
        setStep(3);
      }
    }
  }, [detectedMappings, parseResult]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  const headers = parseResult?.headers || [];
  const rows = parseResult?.rows || [];

  // Analisa as linhas importadas contra os produtos já existentes no projeto:
  // 1. Alterações de Valores: produtos já existentes cujo preço/custo na nova planilha é diferente
  // 2. Novos Produtos: itens da planilha que ainda não existem no projeto
  // 3. Inalterados: produtos já existentes com o mesmo valor
  const {
    newProductCandidates,
    priceChangeCandidates,
    unchangedCandidates,
    missingFromSupplierCandidates,
  } = useMemo(() => {
    if (!parseResult) {
      return {
        newProductCandidates: [] as any[],
        priceChangeCandidates: [] as Array<{
          product: Product;
          oldCost: number | string;
          newCost: number | string;
          diff: number | null;
          percentDiff: number | null;
          row: any;
        }>,
        unchangedCandidates: [] as Array<{ product: Product; row: any }>,
        missingFromSupplierCandidates: [] as Product[],
      };
    }

    const existingById = new Map<string, Product>();
    const existingBySku = new Map<string, Product>();
    const existingByBarcode = new Map<string, Product>();
    const existingByName = new Map<string, Product>();

    for (const p of currentProducts) {
      if (p.id) existingById.set(String(p.id).trim().toLowerCase(), p);
      const sku = normalizeCode(p.sku);
      if (sku) existingBySku.set(sku, p);
      const barcode = normalizeCode(p.barcode);
      if (barcode) existingByBarcode.set(barcode, p);
      const normName = normalizeProductName(p.name);
      if (normName) existingByName.set(normName, p);
    }

    const newCandidates: any[] = [];
    const priceChanges: Array<{
      product: Product;
      oldCost: number | string;
      newCost: number | string;
      diff: number | null;
      percentDiff: number | null;
      row: any;
    }> = [];
    const unchanged: Array<{ product: Product; row: any }> = [];

    const seenNewKeys = new Set<string>();
    const seenUpdatedIds = new Set<string>();

    for (const row of parseResult.rows) {
      const rawId = customMappings.id ? String(row[customMappings.id] ?? '').trim() : '';
      const rawName = customMappings.name ? String(row[customMappings.name] ?? '').trim() : '';
      const rawCost = customMappings.cost ? row[customMappings.cost] : '';
      const parsedCost = parseNumber(rawCost as string | number);

      const idLower = rawId.toLowerCase();
      const normName = normalizeProductName(rawName);

      // 1. Busca por ID
      let existing: Product | undefined;
      if (idLower && !idLower.startsWith('prod_')) {
        existing = existingById.get(idLower);
      }
      // 1b. Busca por SKU / Código
      if (!existing && idLower) {
        existing = existingBySku.get(idLower);
      }
      // 1c. Busca por Barcode
      if (!existing && idLower) {
        existing = existingByBarcode.get(idLower);
      }
      // 2. Busca por Nome
      if (!existing && normName) {
        existing = existingByName.get(normName);
      }

      if (existing) {
        if (seenUpdatedIds.has(existing.id)) continue;
        seenUpdatedIds.add(existing.id);

        const hasPriceDiff = isCostDifferent(existing.cost, parsedCost);
        if (hasPriceDiff) {
          const oldNum = parseNumericCost(existing.cost);
          const newNum = parseNumericCost(parsedCost);
          let diff: number | null = null;
          let percentDiff: number | null = null;
          if (oldNum !== null && newNum !== null) {
            diff = newNum - oldNum;
            if (oldNum > 0) {
              percentDiff = Math.round(((newNum - oldNum) / oldNum) * 100);
            }
          }

          priceChanges.push({
            product: existing,
            oldCost: existing.cost,
            newCost: parsedCost,
            diff,
            percentDiff,
            row,
          });
        } else {
          unchanged.push({ product: existing, row });
        }
      } else {
        const dedupKey = idLower || normName;
        if (dedupKey && seenNewKeys.has(dedupKey)) continue;
        if (dedupKey) seenNewKeys.add(dedupKey);

        newCandidates.push(row);
      }
    }

    const missingFromSupplierCandidates: Product[] = [];
    for (const p of currentProducts) {
      if (!seenUpdatedIds.has(p.id)) {
        missingFromSupplierCandidates.push(p);
      }
    }

    return {
      newProductCandidates: newCandidates,
      priceChangeCandidates: priceChanges,
      unchangedCandidates: unchanged,
      missingFromSupplierCandidates,
    };
  }, [parseResult, currentProducts, customMappings]);

  // Sincroniza a aba ativa de revisão apenas na inicialização (sem trocar de aba sozinho depois que o usuário está vendo)
  useEffect(() => {
    if (userHasPickedTabRef.current) return;
    if (missingFromSupplierCandidates.length > 0 && priceChangeCandidates.length === 0 && newProductCandidates.length === 0) {
      setActiveReviewTab('missing');
    } else if (priceChangeCandidates.length > 0) {
      setActiveReviewTab('prices');
    } else if (newProductCandidates.length > 0) {
      setActiveReviewTab('new');
    } else if (missingFromSupplierCandidates.length > 0) {
      setActiveReviewTab('missing');
    } else {
      setActiveReviewTab('unchanged');
    }
  }, [priceChangeCandidates.length, newProductCandidates.length, missingFromSupplierCandidates.length]);

  const previewNewRows = newProductCandidates.slice(0, 12);
  const previewMissingRows = missingFromSupplierCandidates.slice(0, 12);

  const handleExecuteImport = () => {
    onConfirmImport(customMappings, 'merge', { markMissingAsNotInCatalog });
    setFinishedSuccess(true);
    setStep(4);
  };

  const stepsList = [
    { num: 1, label: '1. Selecionar Arquivo' },
    { num: 2, label: '2. Detecção de Colunas' },
    { num: 3, label: '3. Revisão de Produtos' },
    { num: 4, label: '4. Conclusão' },
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-10">
      {/* 1. Header */}
      <div className="rounded-xl bg-[#121824] border border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <UploadCloud className="w-3.5 h-3.5 text-blue-400" />
            <span>Módulo de Importação</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Importar Catálogo de Produtos
          </h1>
          <p className="text-xs text-slate-400">
            Adicione novos itens ou atualize custos a partir de planilhas Excel (.xlsx) ou CSV.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onUndoLastImport && (
            <button
              type="button"
              onClick={onUndoLastImport}
              disabled={!canUndoImport}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition ${
                canUndoImport
                  ? 'bg-rose-950/30 hover:bg-rose-950/50 text-rose-300 border-rose-500/40'
                  : 'bg-slate-900/40 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
              title={canUndoImport ? 'Desfazer última importação' : 'Nenhuma importação para desfazer'}
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Desfazer última importação</span>
            </button>
          )}
          <button
            type="button"
            onClick={onDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Modelo Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* 2. Stepper */}
      <div className="rounded-lg bg-[#121824] border border-slate-800 p-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {stepsList.map((item) => {
            const isDone = step > item.num;
            const isCurrent = step === item.num;

            return (
              <div
                key={item.num}
                onClick={() => {
                  if (item.num === 1 && !parseResult) setStep(1);
                  if (item.num === 3 && parseResult) setStep(3);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition cursor-default ${
                  isCurrent
                    ? 'bg-blue-600/15 text-blue-300 font-semibold'
                    : isDone
                    ? 'text-emerald-400'
                    : 'text-slate-500'
                }`}
              >
                <div
                  className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-mono tabular-nums shrink-0 ${
                    isDone
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : isCurrent
                      ? 'bg-blue-600 text-white font-bold'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {isDone ? '✓' : item.num}
                </div>
                <span className="truncate">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP 1: UPLOAD */}
      {step === 1 && (
        <div className="rounded-xl bg-[#121824] border border-slate-800 p-8 space-y-5 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition ${
              dragActive
                ? 'border-blue-500 bg-blue-950/20'
                : 'border-slate-700 hover:border-slate-600 bg-slate-900/40'
            }`}
          >
            <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 mb-3">
              <UploadCloud className="w-6 h-6 text-blue-400" />
            </div>

            <h3 className="text-sm font-semibold text-white">
              Arraste a planilha aqui ou clique para selecionar
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Suporta formatos Excel (.xlsx, .xls) e arquivos CSV separados por vírgula ou ponto-e-vírgula.
            </p>

            <button
              type="button"
              className="mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition"
            >
              Procurar no Computador
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <span>· Produtos existentes são preservados</span>
            <span>· Pesquisas anteriores não são sobrescritas</span>
            <span>· Reconhecimento automático de colunas</span>
          </div>
        </div>
      )}

      {/* STEP 3: REVIEW CANDIDATES */}
      {step === 3 && parseResult && (
        <div className="rounded-xl bg-[#121824] border border-slate-800 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-3">
            <div>
              <h3 className="text-base font-bold text-white">
                {newProductCandidates.length > 0 && priceChangeCandidates.length > 0
                  ? `${newProductCandidates.length} novos produtos e ${priceChangeCandidates.length} alterações de valor`
                  : priceChangeCandidates.length > 0
                  ? `${priceChangeCandidates.length} alterações de valor identificadas em produtos existentes`
                  : newProductCandidates.length > 0
                  ? `${newProductCandidates.length} novos produtos identificados`
                  : `Nenhuma alteração detectada (${rows.length} produtos já cadastrados)`}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Arquivo: <span className="text-slate-200 font-mono">{parseResult.fileName}</span> ({rows.length} linhas lidas).
                {priceChangeCandidates.length > 0
                  ? ' Produtos já existentes terão apenas o valor atualizado. Pesquisas e vídeos são 100% preservados.'
                  : ' Produtos duplicados não serão inseridos novamente.'}
              </p>
            </div>

            <button
              type="button"
              id="btn-confirm-execute-import"
              onClick={handleExecuteImport}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shrink-0 shadow-sm"
            >
              <Check className="w-4 h-4" />
              <span>
                {newProductCandidates.length > 0 && priceChangeCandidates.length > 0
                  ? `Importar: ${newProductCandidates.length} Novos + ${priceChangeCandidates.length} Valores`
                  : priceChangeCandidates.length > 0
                  ? `Atualizar Valores (${priceChangeCandidates.length} Produtos)`
                  : newProductCandidates.length > 0
                  ? `Adicionar ${newProductCandidates.length} Novos Itens`
                  : `Re-sincronizar Catálogo (${rows.length} Itens)`}
              </span>
            </button>
          </div>

          {/* Sub-Tabs de Revisão */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
            {priceChangeCandidates.length > 0 && (
              <button
                type="button"
                onClick={() => handleSelectReviewTab('prices')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeReviewTab === 'prices'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Alterações de Valor</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-200 font-mono">
                  {priceChangeCandidates.length}
                </span>
              </button>
            )}

            {newProductCandidates.length > 0 && (
              <button
                type="button"
                onClick={() => handleSelectReviewTab('new')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeReviewTab === 'new'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Novos Produtos</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-200 font-mono">
                  {newProductCandidates.length}
                </span>
              </button>
            )}

            {missingFromSupplierCandidates.length > 0 && (
              <button
                type="button"
                onClick={() => handleSelectReviewTab('missing')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeReviewTab === 'missing'
                    ? 'bg-amber-600 text-slate-950 font-bold shadow-xs'
                    : 'bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 border border-amber-800/60'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Fora do Site</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-200 font-mono">
                  {missingFromSupplierCandidates.length}
                </span>
              </button>
            )}

            {unchangedCandidates.length > 0 && (
              <button
                type="button"
                onClick={() => handleSelectReviewTab('unchanged')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeReviewTab === 'unchanged'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
                }`}
              >
                <Check className="w-3.5 h-3.5 text-slate-500" />
                <span>Inalterados (Mesmo Preço)</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400 font-mono">
                  {unchangedCandidates.length}
                </span>
              </button>
            )}
          </div>

          {/* TAB: ALTERAÇÕES DE VALOR */}
          {activeReviewTab === 'prices' && priceChangeCandidates.length > 0 && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-800/40 text-xs text-blue-200 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-white">Reconhecimento de Valores e Histórico Automático</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Estes produtos já estão no projeto e tiveram alteração de valor na planilha. Ao importar, <strong>apenas o valor será alterado</strong> e um <strong>histórico permanente (registrando se subiu ou diminuiu)</strong> será gravado em cada produto. Todo o histórico de pesquisas de mercado, vídeos, fotos e anotações será estritamente preservado.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {priceChangeCandidates.map((item, idx) => {
                  const prodName = item.product.name;
                  const prodImg = item.product.image || '';
                  const oldCostStr = formatCurrency(item.oldCost);
                  const newCostStr = formatCurrency(item.newCost);
                  const isUp = item.diff !== null && item.diff > 0;
                  const isDown = item.diff !== null && item.diff < 0;

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition"
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative w-12 h-12 rounded overflow-hidden bg-[#0b0f17] border border-slate-800 shrink-0">
                          <ProductImage
                            src={prodImg}
                            alt={prodName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate" title={prodName}>
                            {prodName}
                          </p>
                          {item.product.id && !item.product.id.startsWith('prod_') && (
                            <p className="text-[10px] font-mono text-slate-400 truncate">
                              ID: {item.product.id}
                            </p>
                          )}
                          {item.product.sku && (
                            <p className="text-[10px] font-mono text-slate-400 truncate">
                              SKU: {item.product.sku}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Valor Anterior:</span>
                          <span className="text-xs text-slate-400 line-through font-mono tabular-nums">{oldCostStr}</span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <div className="text-right">
                          <span className="text-[10px] text-emerald-400 font-semibold block">Novo Valor:</span>
                          <span className="text-sm font-bold text-emerald-400 font-mono tabular-nums">{newCostStr}</span>
                        </div>
                      </div>

                      {item.diff !== null && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                          <span className={`text-[10px] font-medium ${isUp ? 'text-amber-400' : isDown ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {isUp ? '▲ Subiu de valor' : isDown ? '▼ Diminuiu de valor' : 'Ajuste de valor'}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                              isDown
                                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                                : isUp
                                ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {isDown ? `-${formatCurrency(Math.abs(item.diff))}` : `+${formatCurrency(item.diff)}`}
                            {item.percentDiff !== null ? ` (${item.percentDiff > 0 ? '+' : ''}${item.percentDiff}%)` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: NOVOS PRODUTOS */}
          {activeReviewTab === 'new' && newProductCandidates.length > 0 && (
            <div className="space-y-3">
              <span className="text-xs font-semibold text-slate-300">
                Amostra dos {newProductCandidates.length} novos produtos a serem adicionados:
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {previewNewRows.map((r, i) => {
                  const prodName = String(r[customMappings.name] || r[headers[0]] || `Produto ${i + 1}`);
                  const prodImg = resolveImageUrl(
                    customMappings.image ? r[customMappings.image] : '',
                    r,
                    prodName
                  );
                  const rawCost = customMappings.cost ? r[customMappings.cost] : '';
                  const displayCost = rawCost ? formatCurrency(rawCost) : 'R$ --';

                  return (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between"
                    >
                      <div className="relative w-full aspect-square rounded overflow-hidden bg-[#0b0f17] border border-slate-800 mb-2">
                        <ProductImage
                          src={prodImg}
                          alt={prodName}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-200 truncate" title={prodName}>
                          {prodName}
                        </p>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Custo:</span>
                          <span className="font-mono tabular-nums font-semibold text-emerald-400">{displayCost}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: FORA DO SITE / AUSENTES NO FORNECEDOR */}
          {activeReviewTab === 'missing' && missingFromSupplierCandidates.length > 0 && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-600/50 text-xs text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-200 text-sm">
                      {missingFromSupplierCandidates.length} produto(s) não constam mais na lista atual do fornecedor
                    </p>
                    <p className="text-[11px] text-amber-300/80 mt-1 leading-relaxed">
                      Estes itens estão no seu projeto, mas não constam na lista atual importada (a nova lista tem {parseResult.rows.length} produtos, como os 443 do site).
                      Eles <strong>permanecerão salvos no seu catálogo</strong> com todas as pesquisas e fotos intactas, marcados em destaque como <strong>&ldquo;Fora do Site&rdquo;</strong>.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/50 border border-amber-500/50 cursor-pointer shrink-0 select-none">
                  <input
                    type="checkbox"
                    checked={markMissingAsNotInCatalog}
                    onChange={(e) => setMarkMissingAsNotInCatalog(e.target.checked)}
                    className="rounded border-amber-600 bg-slate-900 text-amber-500 focus:ring-amber-400"
                  />
                  <span className="text-xs font-semibold text-amber-100">
                    Destacar como &ldquo;Fora do Site&rdquo;
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {previewMissingRows.map((prod) => {
                  const displayCost = prod.cost ? formatCurrency(prod.cost) : 'R$ --';
                  return (
                    <div
                      key={prod.id}
                      className="p-2.5 rounded-lg bg-[#16131d] border border-amber-500/40 flex flex-col justify-between"
                    >
                      <div className="relative w-full aspect-square rounded overflow-hidden bg-[#0b0f17] border border-amber-900/40 mb-2">
                        <ProductImage
                          src={prod.image}
                          alt={prod.name}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-1 left-1 px-1 py-0.2 rounded text-[9px] font-bold bg-amber-950/90 text-amber-300 border border-amber-500/60 shadow-xs">
                          FORA DO SITE
                        </span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-slate-200 truncate" title={prod.name}>
                          {prod.name}
                        </p>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Custo:</span>
                          <span className="font-mono tabular-nums font-semibold text-amber-300">{displayCost}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: INALTERADOS */}
          {activeReviewTab === 'unchanged' && (
            <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-slate-400 space-y-2">
              <div className="flex items-center gap-2 text-slate-300 font-semibold">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{unchangedCandidates.length} produtos já cadastrados com valores idênticos</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Estes itens já constam no projeto e os preços informados na planilha são os mesmos atuais. Eles não sofrerão alterações para garantir a estabilidade das suas pesquisas.
              </p>
            </div>
          )}

          {/* Raw Preview Table */}
          <div className="space-y-1.5 pt-2">
            <span className="text-xs font-semibold text-slate-400">
              Colunas originais da planilha ({parseResult.fileName}):
            </span>
            <div className="overflow-x-auto rounded border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#0e1320] text-slate-400 border-b border-slate-800 font-semibold text-[10px] uppercase">
                    {headers.slice(0, 7).map((h, i) => (
                      <th key={i} className="py-2 px-3 font-semibold truncate max-w-[140px]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 bg-slate-900">
                  {rows.slice(0, 5).map((r, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-slate-800/40">
                      {headers.slice(0, 7).map((h, colIdx) => (
                        <td key={colIdx} className="py-1.5 px-3 text-slate-300 truncate max-w-[140px] font-mono text-[11px]">
                          {String(r[h] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-white transition"
            >
              Escolher outro arquivo
            </button>

            <button
              type="button"
              onClick={handleExecuteImport}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition"
            >
              <Check className="w-4 h-4" />
              <span>
                {newProductCandidates.length > 0 && priceChangeCandidates.length > 0
                  ? `Confirmar: ${newProductCandidates.length} Novos + ${priceChangeCandidates.length} Valores`
                  : priceChangeCandidates.length > 0
                  ? `Confirmar e Atualizar ${priceChangeCandidates.length} Valores`
                  : newProductCandidates.length > 0
                  ? `Confirmar e Adicionar ${newProductCandidates.length} Novos Itens`
                  : missingFromSupplierCandidates.length > 0 && markMissingAsNotInCatalog
                  ? `Confirmar e Destacar ${missingFromSupplierCandidates.length} Fora do Site`
                  : `Re-sincronizar Catálogo`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: SUCCESS */}
      {step === 4 && (
        <div className="rounded-xl bg-[#121824] border border-slate-800 p-8 space-y-4 text-center">
          <div className="w-12 h-12 rounded-lg bg-emerald-950/50 border border-emerald-800/60 flex items-center justify-center text-emerald-400 mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">
              Importação Concluída com Sucesso!
            </h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              {priceChangeCandidates.length > 0 && newProductCandidates.length > 0
                ? `${newProductCandidates.length} novos produtos adicionados e ${priceChangeCandidates.length} valores de produtos atualizados com sucesso.`
                : priceChangeCandidates.length > 0
                ? `${priceChangeCandidates.length} produto(s) tiveram seus valores atualizados. Pesquisas, opções e mídias existentes foram 100% preservadas.`
                : newProductCandidates.length > 0
                ? `${newProductCandidates.length} novos produtos adicionados ao seu catálogo.`
                : 'Catálogo sincronizado com a lista do fornecedor.'}
            </p>
            {missingFromSupplierCandidates.length > 0 && markMissingAsNotInCatalog && (
              <p className="text-[11px] text-amber-300 font-medium">
                ⚠️ {missingFromSupplierCandidates.length} produto(s) ausentes na lista de {parseResult.rows.length} itens foram mantidos no seu catálogo e marcados em destaque como &ldquo;Fora do Site&rdquo;.
              </p>
            )}
            {priceChangeCandidates.length > 0 && (
              <p className="text-[11px] text-emerald-400 font-medium">
                O histórico completo (se subiu ou diminuiu) foi salvo em cada produto e pode ser consultado na aba &ldquo;Histórico de Preços&rdquo; nos detalhes do item.
              </p>
            )}
          </div>

          <div className="max-w-md mx-auto pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
            <button
              type="button"
              onClick={onNavigateToProducts}
              className="p-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition flex items-center justify-between"
            >
              <div>
                <p className="font-semibold text-xs">Ir para Produtos</p>
                <p className="text-[11px] text-blue-100">Acessar catálogo</p>
              </div>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onDownloadTemplate}
              className="p-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center justify-between"
            >
              <div>
                <p className="font-semibold text-xs">Baixar Modelo</p>
                <p className="text-[11px] text-slate-400">Planilha base</p>
              </div>
              <Download className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
