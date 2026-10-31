import React from 'react';
import {
  AlertTriangle,
  Layers,
  CheckCircle2,
  ListFilter,
  FileSpreadsheet,
  ArrowRight,
  Eye,
  Info,
} from 'lucide-react';

interface CatalogReconciliationBannerProps {
  totalCount: number;
  inCatalogCount: number;
  notInCatalogCount: number;
  currentCatalogStatusFilter?: 'all' | 'in_catalog' | 'not_in_catalog';
  onFilterNotInCatalog: () => void;
  onFilterInCatalog: () => void;
  onFilterAll: () => void;
  onOpenAuditModal: () => void;
  onNavigateToImport: () => void;
}

export const CatalogReconciliationBanner: React.FC<CatalogReconciliationBannerProps> = ({
  totalCount,
  inCatalogCount,
  notInCatalogCount,
  currentCatalogStatusFilter = 'all',
  onFilterNotInCatalog,
  onFilterInCatalog,
  onFilterAll,
  onOpenAuditModal,
  onNavigateToImport,
}) => {
  // If there are no missing products, show a subtle sync indicator or don't take too much vertical room
  const hasMissing = notInCatalogCount > 0;

  return (
    <div
      className={`rounded-xl border p-3.5 transition shadow-lg ${
        hasMissing
          ? 'bg-gradient-to-r from-[#17131d] via-[#121824] to-[#121824] border-amber-500/50 shadow-amber-950/20'
          : 'bg-[#121824] border-slate-800'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left: Summary Title & Numbers */}
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`p-2 rounded-lg shrink-0 mt-0.5 sm:mt-0 ${
              hasMissing
                ? 'bg-amber-500/15 border border-amber-500/40 text-amber-400'
                : 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
            }`}
          >
            {hasMissing ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <Layers className="w-5 h-5" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                Auditoria de Catálogo Fornecedor
              </span>
              {hasMissing && (
                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Diferença detectada
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 sm:gap-4 mt-1 text-xs flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Total no Projeto:</span>
                <span className="font-mono font-bold text-white text-sm">
                  {totalCount}
                </span>
              </div>

              <span className="text-slate-600 hidden sm:inline">•</span>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">No Site do Fornecedor:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {inCatalogCount}
                </span>
              </div>

              {hasMissing && (
                <>
                  <span className="text-slate-600 hidden sm:inline">•</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-300 font-medium">Fora do Site:</span>
                    <span className="font-mono font-bold text-amber-400 text-sm bg-amber-500/20 px-1.5 py-0.2 rounded border border-amber-500/40">
                      {notInCatalogCount}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap pt-2 lg:pt-0 border-t border-slate-800 lg:border-t-0">
          {hasMissing && (
            <>
              <button
                type="button"
                onClick={
                  currentCatalogStatusFilter === 'not_in_catalog'
                    ? onFilterAll
                    : onFilterNotInCatalog
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  currentCatalogStatusFilter === 'not_in_catalog'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'bg-amber-950/60 hover:bg-amber-900/80 border border-amber-700/60 text-amber-300'
                }`}
                title="Filtrar apenas os produtos que não aparecem no site do fornecedor"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {currentCatalogStatusFilter === 'not_in_catalog'
                    ? 'Vendo Fora do Site (Limpar)'
                    : `Ver ${notInCatalogCount} Fora do Site`}
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenAuditModal}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
                title="Abrir painel detalhado para auditar, reativar ou descartar itens ausentes"
              >
                <Eye className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>Auditar Itens Ausentes</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={
              currentCatalogStatusFilter === 'in_catalog'
                ? onFilterAll
                : onFilterInCatalog
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              currentCatalogStatusFilter === 'in_catalog'
                ? 'bg-emerald-600 text-white font-bold'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
            }`}
            title="Ver somente os produtos que constam ativos no site do fornecedor"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Ver {inCatalogCount} no Site</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToImport}
            className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-1"
            title="Importar ou reconciliar nova planilha de produtos"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Importar / Atualizar</span>
          </button>
        </div>
      </div>
    </div>
  );
};
