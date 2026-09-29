import React, { useState } from 'react';
import { Product, ProductStatus, getProductSku } from '../types';
import { formatCurrency } from '../utils/excel';
import { ProductImage } from './ProductImage';
import {
  ExternalLink,
  Search,
  CheckCircle2,
  Clock,
  Calculator,
  AlertCircle,
  Ban,
  Check,
  Copy,
  MoreVertical,
  Edit3,
  ChevronDown,
} from 'lucide-react';

interface ProductCardProps {
  product: Product;
  isSelected?: boolean;
  onToggleSelect?: (productId: string) => void;
  onOpenResearch: (product: Product) => void;
  onOpenSimulator: (product: Product) => void;
  onOpenDetails?: (product: Product) => void;
  onDismissNew?: (productId: string) => void;
  onUpdateStatus?: (productId: string, status: ProductStatus) => void;
}

export const ProductCard = React.memo<ProductCardProps>(
  ({
    product,
    isSelected = false,
    onToggleSelect,
    onOpenResearch,
    onOpenSimulator,
    onOpenDetails,
    onDismissNew,
    onUpdateStatus,
  }) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedName, setCopiedName] = useState(false);
  const [copiedCost, setCopiedCost] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const hasRecords = product.research_records && product.research_records.length > 0;
  const bestRecord = hasRecords
    ? [...product.research_records].sort((a, b) => {
        const pA = typeof a.price === 'number' ? a.price : parseFloat(String(a.price)) || Infinity;
        const pB = typeof b.price === 'number' ? b.price : parseFloat(String(b.price)) || Infinity;
        return pA - pB;
      })[0]
    : null;

  const sku = getProductSku(product);

  const getStatusBadge = (status: ProductStatus) => {
    switch (status) {
      case 'Encontrado':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            <span>Encontrado</span>
          </span>
        );
      case 'Revisar':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-800/60">
            <AlertCircle className="w-3 h-3 text-purple-400" />
            <span>Revisar</span>
          </span>
        );
      case 'Descartado':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <Ban className="w-3 h-3 text-slate-400" />
            <span>Descartado</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/60">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>Pendente</span>
          </span>
        );
    }
  };

  const renderStatusSelector = () => {
    if (!onUpdateStatus) return getStatusBadge(product.status);

    return (
      <div className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
        <select
          value={product.status}
          onChange={(e) => {
            e.stopPropagation();
            onUpdateStatus(product.id, e.target.value as ProductStatus);
          }}
          title="Alterar status deste produto"
          className={`appearance-none text-[10px] font-semibold pl-2 pr-5 py-0.5 rounded border cursor-pointer transition focus:outline-none focus:ring-1 focus:ring-blue-500 ${
            product.status === 'Encontrado'
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80 hover:bg-emerald-900/80'
              : product.status === 'Revisar'
              ? 'bg-purple-950/80 text-purple-300 border-purple-800/80 hover:bg-purple-900/80'
              : product.status === 'Descartado'
              ? 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
              : 'bg-amber-950/80 text-amber-300 border-amber-800/80 hover:bg-amber-900/80'
          }`}
        >
          <option value="Pendente" className="bg-[#121824] text-amber-300">Pendente</option>
          <option value="Encontrado" className="bg-[#121824] text-emerald-300">Encontrado</option>
          <option value="Revisar" className="bg-[#121824] text-purple-300">Revisar</option>
          <option value="Descartado" className="bg-[#121824] text-slate-400">Descartado</option>
        </select>
        <ChevronDown className="w-2.5 h-2.5 text-slate-400 absolute right-1.5 pointer-events-none" />
      </div>
    );
  };

  const handleCopyLink = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyName = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(product.name);
    setCopiedName(true);
    setTimeout(() => setCopiedName(false), 2000);
  };

  const handleCopyCost = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(String(product.cost ?? ''));
    setCopiedCost(true);
    setTimeout(() => setCopiedCost(false), 2000);
  };

  return (
    <div
      id={`product-card-${product.id}`}
      className={`group relative h-full flex flex-col justify-between rounded-lg border transition-colors duration-150 overflow-hidden min-w-0 w-full ${
        isSelected
          ? 'border-blue-500 bg-[#151d2d] ring-1 ring-blue-500'
          : product.is_new
          ? 'border-blue-500/60 bg-[#121824]'
          : 'border-slate-800 bg-[#121824] hover:border-slate-700'
      }`}
    >
      <div className="flex flex-col flex-1">
        {/* Card Media Header */}
        <div className="relative aspect-4/3 w-full bg-[#0b0f17] border-b border-slate-800 overflow-hidden flex items-center justify-center">
          <ProductImage
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
            fallbackIconSize="w-6 h-6 sm:w-8 sm:h-8"
            showEmptyText
          />

          {/* Selection Checkbox & Badges Overlay - Left */}
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-10">
            {onToggleSelect && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(product.id);
                }}
                className={`w-5 h-5 rounded flex items-center justify-center transition border ${
                  isSelected
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-transparent hover:text-slate-400'
                }`}
                title={isSelected ? 'Desmarcar produto' : 'Selecionar produto'}
                aria-label="Selecionar produto"
              >
                <Check className="w-3 h-3" />
              </button>
            )}

            {product.is_new && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-xs">
                <span>NOVO</span>
                {onDismissNew && (
                  <button
                    type="button"
                    title="Remover marcação"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismissNew(product.id);
                    }}
                    className="ml-0.5 px-0.5 rounded hover:bg-blue-700 text-blue-100 hover:text-white transition"
                    aria-label="Desmarcar como novo"
                  >
                    <span className="text-[10px] leading-none">×</span>
                  </button>
                )}
              </span>
            )}

            {!product.available && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950/80 text-rose-300 border border-rose-800/80">
                Indisponível
              </span>
            )}
          </div>

          {/* Status Badge - Right */}
          <div className="absolute top-2 right-2 z-10">
            {renderStatusSelector()}
          </div>

          {/* Quick Edit Overlay */}
          {onOpenDetails && (
            <button
              type="button"
              onClick={() => onOpenDetails(product)}
              className="absolute bottom-2 right-2 px-2 py-1 rounded bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-[10px] font-medium border border-slate-700 opacity-0 group-hover:opacity-100 transition z-10 flex items-center gap-1"
            >
              <Edit3 className="w-3 h-3 text-blue-400" />
              <span>Editar</span>
            </button>
          )}
        </div>

        {/* Card Body */}
        <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
          <div>
            {/* SKU and Research count */}
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[10px] font-mono font-medium text-slate-400 truncate">
                SKU: {sku}
              </span>

              {product.research_records && product.research_records.length > 0 && (
                <span className="text-[10px] text-blue-400 font-medium truncate">
                  {product.research_records.length} {product.research_records.length === 1 ? 'pesquisa' : 'pesquisas'}
                </span>
              )}
            </div>

            {/* Product Title */}
            <h3
              className="text-xs sm:text-sm font-semibold text-slate-100 line-clamp-2 hover:text-blue-400 transition cursor-pointer leading-snug"
              title={product.name}
              onClick={() => (onOpenDetails ? onOpenDetails(product) : onOpenResearch(product))}
            >
              {product.name}
            </h3>

            {/* Highlighted Values Box */}
            <div className="mt-2.5 p-2.5 rounded-lg bg-[#0b0f17] border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                  Custo
                </span>
                <span className="text-xs sm:text-sm font-mono font-bold text-emerald-400 tabular-nums">
                  {formatCurrency(product.cost)}
                </span>
              </div>

              {/* Best Record / Estimated */}
              {bestRecord ? (
                <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                      {bestRecord.platform}
                    </span>
                    <span className="text-[10px] text-slate-400 truncate">
                      Venda:
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs sm:text-sm font-mono font-bold text-sky-400 tabular-nums">
                      {formatCurrency(bestRecord.price)}
                    </span>
                    {bestRecord.url && (
                      <a
                        href={bestRecord.url.startsWith('http') ? bestRecord.url : `https://${bestRecord.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-0.5 rounded text-slate-400 hover:text-white transition"
                        title="Abrir anúncio concorrente"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <span className="text-slate-500">Venda:</span>
                  <span className="text-slate-500 italic">Pendente</span>
                </div>
              )}
            </div>

            {/* Target Channels */}
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/60">
              <span className="text-slate-500">Canais:</span>
              <span>Shopee</span>
              <span className="text-slate-600">·</span>
              <span>TikTok</span>
              <span className="text-slate-600">·</span>
              <span>SHEIN</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card Actions Footer */}
      <div className="p-2 bg-[#0b0f17] border-t border-slate-800 flex items-center justify-between gap-1.5">
        {/* Primary Action Button: Pesquisar */}
        <button
          type="button"
          id={`btn-research-${product.id}`}
          onClick={() => onOpenResearch(product)}
          className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition truncate"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Pesquisar</span>
        </button>

        {/* Simulator Button */}
        <button
          type="button"
          id={`btn-simulator-${product.id}`}
          onClick={() => onOpenSimulator(product)}
          title="Simular Preço de Venda e Margem"
          className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition shrink-0"
        >
          <Calculator className="w-3.5 h-3.5 text-slate-300" />
        </button>

        {/* Context Menu */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Mais opções"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 bottom-full mb-1.5 w-48 rounded-lg bg-[#141a26] border border-slate-800 shadow-xl py-1 z-40 text-xs text-left">
                {onOpenDetails && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenDetails(product);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Editar Produto / Envio</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    handleCopyName(e);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                >
                  {copiedName ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>Copiar Nome</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    handleCopyCost(e);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                >
                  {copiedCost ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>Copiar Custo</span>
                </button>

                {bestRecord?.url && (
                  <button
                    type="button"
                    onClick={(e) => {
                      handleCopyLink(e, bestRecord.url);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                  >
                    {copiedLink ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>Copiar Link Anúncio</span>
                  </button>
                )}

                {product.is_new && onDismissNew && (
                  <button
                    type="button"
                    onClick={() => {
                      onDismissNew(product.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 hover:bg-slate-800 text-blue-300 flex items-center gap-2 border-t border-slate-800"
                  >
                    <span>Remover marcação Novo</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
},
(prevProps, nextProps) => {
  return (
    prevProps.product === nextProps.product &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onToggleSelect === nextProps.onToggleSelect &&
    prevProps.onOpenResearch === nextProps.onOpenResearch &&
    prevProps.onOpenSimulator === nextProps.onOpenSimulator &&
    prevProps.onOpenDetails === nextProps.onOpenDetails &&
    prevProps.onDismissNew === nextProps.onDismissNew &&
    prevProps.onUpdateStatus === nextProps.onUpdateStatus
  );
}
);

ProductCard.displayName = 'ProductCard';
