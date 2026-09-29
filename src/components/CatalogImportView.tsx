import React, { useRef, useState } from 'react';
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
} from 'lucide-react';
import { Product } from '../types';
import { ProductImage } from './ProductImage';
import { resolveImageUrl, formatCurrency, normalizeStr } from '../utils/excel';

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
  onConfirmImport: (mappings: ColumnMapping, mode: 'merge' | 'replace') => void;
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
  const importedProductCandidates = React.useMemo(() => {
    if (!parseResult) return [];
    const imported = parseResult.rows;
    const existingIds = new Set(currentProducts.map(p => String(p.id || '').trim().toLowerCase()).filter(Boolean));
    const existingNames = new Set(currentProducts.map(p => normalizeStr(String(p.name || ''))).filter(Boolean));
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    return imported.filter((row: any) => {
      const rawId = customMappings.id ? String(row[customMappings.id] ?? '').trim() : '';
      const rawName = customMappings.name ? String(row[customMappings.name] ?? '').trim() : '';
      const id = rawId.toLowerCase();
      const name = normalizeStr(rawName);
      if (id && existingIds.has(id)) return false;
      if (name && existingNames.has(name)) return false;
      if (id && seenIds.has(id)) return false;
      if (name && seenNames.has(name)) return false;
      if (id) seenIds.add(id);
      if (name) seenNames.add(name);
      return true;
    });
  }, [parseResult, currentProducts, customMappings]);

  const previewRows = importedProductCandidates.slice(0, 6);

  const handleExecuteImport = () => {
    onConfirmImport(customMappings, 'merge');
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
                {importedProductCandidates.length > 0
                  ? `${importedProductCandidates.length} novos produtos identificados`
                  : 'Nenhum novo produto para adicionar'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Arquivo: <span className="text-slate-200 font-mono">{parseResult.fileName}</span> ({rows.length} linhas lidas). Itens já cadastrados serão ignorados para evitar duplicatas.
              </p>
            </div>

            {importedProductCandidates.length > 0 && (
              <button
                type="button"
                id="btn-confirm-execute-import"
                onClick={handleExecuteImport}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition shrink-0"
              >
                <Check className="w-4 h-4" />
                <span>Adicionar {importedProductCandidates.length} Novos Itens</span>
              </button>
            )}
          </div>

          {/* Cards Preview */}
          {previewRows.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-slate-300">
                Amostra dos produtos a serem importados:
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {previewRows.map((r, i) => {
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

          {/* Raw Preview Table */}
          <div className="space-y-1.5 pt-2">
            <span className="text-xs font-semibold text-slate-400">
              Colunas originais da planilha:
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
                  {previewRows.map((r, rowIdx) => (
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

            {importedProductCandidates.length > 0 && (
              <button
                type="button"
                onClick={handleExecuteImport}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar e Adicionar ao Catálogo</span>
              </button>
            )}
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
              Importação Concluída com Sucesso
            </h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Os produtos foram adicionados ao seu catálogo e estão prontos para pesquisa de mercado e precificação.
            </p>
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
