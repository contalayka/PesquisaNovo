import React, { useState, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  Search,
  CheckCircle2,
  Trash2,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  Archive,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Product, ProductStatus } from '../types';
import { ProductImage } from './ProductImage';
import { formatCurrency, parseNumericCost, exportProductsToExcel } from '../utils/excel';

interface MissingProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onToggleNotInCatalog: (productId: string, notInCatalog: boolean) => void;
  onBatchToggleNotInCatalog: (productIds: string[], notInCatalog: boolean) => void;
  onUpdateStatus?: (productId: string, status: ProductStatus) => void;
  onDeleteProducts?: (productIds: string[]) => void;
  onOpenResearch?: (product: Product) => void;
  onOpenSimulator?: (product: Product) => void;
}

export const MissingProductsModal: React.FC<MissingProductsModalProps> = ({
  isOpen,
  onClose,
  products,
  onToggleNotInCatalog,
  onBatchToggleNotInCatalog,
  onUpdateStatus,
  onDeleteProducts,
  onOpenResearch,
  onOpenSimulator,
}) => {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const missingProducts = useMemo(() => {
    return products.filter((p) => p.not_in_catalog);
  }, [products]);

  const filtered = useMemo(() => {
    if (!search.trim()) return missingProducts;
    const term = search.toLowerCase().trim();
    return missingProducts.filter((p) => {
      const nameMatch = p.name?.toLowerCase().includes(term);
      const skuMatch = p.sku?.toLowerCase().includes(term);
      const idMatch = p.id?.toLowerCase().includes(term);
      return nameMatch || skuMatch || idMatch;
    });
  }, [missingProducts, search]);

  const totalCostMissing = useMemo(() => {
    return missingProducts.reduce((sum, p) => {
      const c = parseNumericCost(p.cost);
      return sum + (c !== null ? c : 0);
    }, 0);
  }, [missingProducts]);

  if (!isOpen) return null;

  const handleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((p) => p.id));
    }
  };

  const handleToggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleReactivateSelected = () => {
    if (selectedIds.length === 0) return;
    onBatchToggleNotInCatalog(selectedIds, false);
    setSelectedIds([]);
  };

  const handleDiscardSelected = () => {
    if (selectedIds.length === 0 || !onUpdateStatus) return;
    for (const id of selectedIds) {
      onUpdateStatus(id, 'Descartado');
    }
    setSelectedIds([]);
  };

  const handleDeleteConfirmed = () => {
    if (selectedIds.length === 0 || !onDeleteProducts) return;
    onDeleteProducts(selectedIds);
    setSelectedIds([]);
    setIsConfirmingDelete(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#101520] border border-amber-500/40 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-amber-500/20">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-amber-950/20 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">
                  Produtos Fora do Site do Fornecedor
                </h3>
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                  {missingProducts.length} itens ausentes
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Estes produtos foram <strong>mantidos no seu catálogo</strong> para não perder anotações, fotos ou histórico, mas <strong>não constam na lista ativa de 443 itens</strong> do fornecedor.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo & Barra de Ações */}
        <div className="p-4 border-b border-slate-800 bg-[#0d121c] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          {/* Busca interna */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, código ou SKU..."
              className="w-full pl-8.5 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Métricas rápidas */}
          <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0">
            <div>
              Total Ausentes: <strong className="text-amber-400 font-mono">{missingProducts.length}</strong>
            </div>
            <span>•</span>
            <div>
              Soma de Custos: <strong className="text-emerald-400 font-mono">{formatCurrency(totalCostMissing)}</strong>
            </div>
          </div>
        </div>

        {/* Ações em lote se houver selecionados */}
        {selectedIds.length > 0 && (
          <div className="px-4 py-2.5 bg-amber-950/30 border-b border-amber-800/40 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-amber-200">
              {selectedIds.length} de {filtered.length} produtos selecionados
            </span>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleReactivateSelected}
                className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Reativar (Marcar No Site)</span>
              </button>

              {onUpdateStatus && (
                <button
                  type="button"
                  onClick={handleDiscardSelected}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium border border-slate-700 flex items-center gap-1 transition"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Marcar Descartado</span>
                </button>
              )}

              {onDeleteProducts && (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="px-2.5 py-1 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 font-medium border border-rose-800/60 flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir do Projeto</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const sel = missingProducts.filter((p) => selectedIds.includes(p.id));
                  exportProductsToExcel(sel);
                }}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium border border-slate-700 flex items-center gap-1 transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Exportar Excel</span>
              </button>
            </div>
          </div>
        )}

        {/* Confirmação de Exclusão */}
        {isConfirmingDelete && (
          <div className="p-3 bg-rose-950/60 border-b border-rose-800/80 flex items-center justify-between gap-3 text-xs text-rose-200">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Tem certeza que deseja excluir <strong>{selectedIds.length}</strong> produtos do projeto? Esta ação removerá definitivamente os itens selecionados.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        )}

        {/* Lista de Produtos Ausentes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              {search ? (
                <>
                  <p className="text-sm font-medium text-slate-300">Nenhum produto ausente corresponde à busca "{search}".</p>
                  <p className="text-xs text-slate-500 mt-1">Tente pesquisar por outro termo.</p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-200">Nenhum produto marcado como "Fora do Site" no momento.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Todos os produtos cadastrados estão alinhados com o fornecedor.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1 px-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
                    onChange={handleSelectAll}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Selecionar todos ({filtered.length})</span>
                </label>
                <span>Mostrando {filtered.length} itens</span>
              </div>

              <div className="divide-y divide-slate-800/80 rounded-lg border border-slate-800 bg-[#0d121c] overflow-hidden">
                {filtered.map((product) => {
                  const isSelected = selectedIds.includes(product.id);
                  return (
                    <div
                      key={product.id}
                      className={`p-3 flex items-center justify-between gap-3 transition ${
                        isSelected
                          ? 'bg-amber-950/30'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Checkbox e Imagem */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleOne(product.id)}
                          className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 shrink-0"
                        />

                        <div className="w-11 h-11 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                          <ProductImage
                            src={product.image}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            fallbackIconSize="w-5 h-5"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs text-white truncate max-w-md block">
                              {product.name}
                            </span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/70">
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                              FORA DO SITE
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                            {product.sku && (
                              <span>SKU: <strong className="text-slate-300 font-mono">{product.sku}</strong></span>
                            )}
                            {product.catalog_missing_since && (
                              <>
                                <span>•</span>
                                <span>Ausente desde: <strong className="text-slate-300">{new Date(product.catalog_missing_since).toLocaleDateString('pt-BR')}</strong></span>
                              </>
                            )}
                            <span>•</span>
                            <span>Status: <strong className="text-slate-300">{product.status || 'Pendente'}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Custo & Ações */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] uppercase font-medium text-slate-400">Custo Salvo</div>
                          <div className="text-xs font-mono font-bold text-emerald-400">
                            {formatCurrency(product.cost)}
                          </div>
                        </div>

                        {/* Ações individuais */}
                        <div className="flex items-center gap-1.5">
                          {onOpenResearch && (
                            <button
                              type="button"
                              onClick={() => onOpenResearch(product)}
                              title="Pesquisar mercado"
                              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            >
                              <Search className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onToggleNotInCatalog(product.id, false)}
                            title="Reativar no fornecedor (Desmarcar Fora do Site)"
                            className="px-2.5 py-1 rounded bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 text-xs font-medium flex items-center gap-1 transition"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Reativar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-5 py-3 border-t border-slate-800 bg-[#0d121c] flex items-center justify-between text-xs text-slate-400">
          <span>
            {missingProducts.length} produtos mantidos fora do site
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
