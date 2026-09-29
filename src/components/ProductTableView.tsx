import React, { useState } from 'react';
import {
  Product,
  ProductStatus,
  getProductSku,
  getProductWeightDisplay,
  getProductDimensionsDisplay,
} from '../types';
import { formatCurrency } from '../utils/excel';
import { ProductImage } from './ProductImage';
import {
  Search,
  Calculator,
  CheckCircle2,
  Clock,
  AlertCircle,
  Ban,
  Copy,
  Check,
  MoreVertical,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit3,
  ChevronDown,
} from 'lucide-react';

interface ProductTableRowProps {
  product: Product;
  isSelected: boolean;
  onToggleSelect: (productId: string) => void;
  onOpenResearch: (product: Product) => void;
  onOpenSimulator: (product: Product) => void;
  onOpenDetails?: (product: Product) => void;
  onDismissNew?: (productId: string) => void;
  onUpdateStatus?: (productId: string, status: ProductStatus) => void;
}

const getStatusBadge = (status: ProductStatus) => {
  switch (status) {
    case 'Encontrado':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 whitespace-nowrap">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>Encontrado</span>
        </span>
      );
    case 'Revisar':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-800/60 whitespace-nowrap">
          <AlertCircle className="w-3 h-3 text-purple-400" />
          <span>Revisar</span>
        </span>
      );
    case 'Descartado':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 whitespace-nowrap">
          <Ban className="w-3 h-3" />
          <span>Descartado</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/60 whitespace-nowrap">
          <Clock className="w-3 h-3 text-amber-400" />
          <span>Pendente</span>
        </span>
      );
  }
};

const ProductTableRow = React.memo<ProductTableRowProps>(
  ({
    product,
    isSelected,
    onToggleSelect,
    onOpenResearch,
    onOpenSimulator,
    onOpenDetails,
    onDismissNew,
    onUpdateStatus,
  }) => {
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showMenu, setShowMenu] = useState(false);

    const sku = getProductSku(product);
    const weightDisplay = getProductWeightDisplay(product);
    const dimensionsDisplay = getProductDimensionsDisplay(product);

    const hasRecords = product.research_records && product.research_records.length > 0;
    const bestRecord = hasRecords ? product.research_records[0] : null;

    const handleCopy = (id: string, text: string) => {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    };

    return (
      <tr
        className={`group transition-colors ${
          isSelected
            ? 'bg-blue-950/30'
            : product.is_new
            ? 'bg-blue-950/15 hover:bg-slate-800/40'
            : 'hover:bg-slate-800/30'
        }`}
      >
        {/* 1. Selecionar */}
        <td className="py-2.5 px-3 text-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(product.id)}
            className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </td>

        {/* 2. Imagem */}
        <td className="py-2 px-3 text-center">
          <div className="relative w-9 h-9 rounded bg-[#0b0f17] border border-slate-800 overflow-hidden flex items-center justify-center mx-auto shrink-0">
            <ProductImage
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover"
              fallbackIconSize="w-4 h-4"
            />
          </div>
        </td>

        {/* 3. Produto */}
        <td className="py-2.5 px-3">
          <div className="min-w-0 max-w-sm">
            <div className="flex items-center gap-2">
              <span
                onClick={() => (onOpenDetails ? onOpenDetails(product) : onOpenResearch(product))}
                title={product.name}
                className="font-medium text-slate-100 hover:text-blue-400 transition cursor-pointer truncate block"
              >
                {product.name}
              </span>
              {product.is_new && (
                <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-600 text-white shrink-0">
                  NOVO
                </span>
              )}
            </div>

            {!product.available && (
              <span className="text-[10px] text-rose-400 font-medium">
                Indisponível no fornecedor
              </span>
            )}
          </div>
        </td>

        {/* 4. SKU */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            {sku}
          </span>
        </td>

        {/* 5. Custo */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          <span className="font-mono tabular-nums font-bold text-xs text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-800/40 inline-block">
            {formatCurrency(product.cost)}
          </span>
        </td>

        {/* 6. Preço */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          {bestRecord && typeof bestRecord.price === 'number' && bestRecord.price > 0 ? (
            <span className="font-mono tabular-nums font-bold text-xs text-sky-400 bg-sky-950/30 px-2 py-0.5 rounded border border-sky-800/40 inline-block">
              {formatCurrency(bestRecord.price)}
            </span>
          ) : product.suggested_price ? (
            <span className="font-mono tabular-nums text-xs text-sky-300">
              {formatCurrency(product.suggested_price)}
            </span>
          ) : (
            <span className="text-[11px] text-slate-500 italic">
              Pendente
            </span>
          )}
        </td>

        {/* 7. Peso */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          <span
            className={`text-[11px] font-mono tabular-nums ${
              weightDisplay === 'Não informado'
                ? 'text-slate-500 italic'
                : 'text-slate-300'
            }`}
          >
            {weightDisplay}
          </span>
        </td>

        {/* 8. Dimensões */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          <span
            className={`text-[11px] font-mono tabular-nums ${
              dimensionsDisplay === 'Não informado'
                ? 'text-slate-500 italic'
                : 'text-slate-300'
            }`}
          >
            {dimensionsDisplay}
          </span>
        </td>

        {/* 9. Status */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          {onUpdateStatus ? (
            <div className="relative inline-flex items-center">
              <select
                value={product.status}
                onChange={(e) => {
                  e.stopPropagation();
                  onUpdateStatus(product.id, e.target.value as ProductStatus);
                }}
                title="Alterar status deste produto"
                className={`appearance-none text-[10px] font-medium pl-2 pr-5 py-0.5 rounded border cursor-pointer transition focus:outline-none ${
                  product.status === 'Encontrado'
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80 hover:bg-emerald-900/80'
                    : product.status === 'Revisar'
                    ? 'bg-purple-950/70 text-purple-300 border-purple-800/80 hover:bg-purple-900/80'
                    : product.status === 'Descartado'
                    ? 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                    : 'bg-amber-950/70 text-amber-300 border-amber-800/80 hover:bg-amber-900/80'
                }`}
              >
                <option value="Pendente" className="bg-[#121824] text-amber-300">Pendente</option>
                <option value="Encontrado" className="bg-[#121824] text-emerald-300">Encontrado</option>
                <option value="Revisar" className="bg-[#121824] text-purple-300">Revisar</option>
                <option value="Descartado" className="bg-[#121824] text-slate-400">Descartado</option>
              </select>
              <ChevronDown className="w-2.5 h-2.5 text-slate-400 absolute right-1.5 pointer-events-none" />
            </div>
          ) : (
            getStatusBadge(product.status)
          )}
        </td>

        {/* 10. Marketplaces */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>Shopee</span>
            <span className="text-slate-600">·</span>
            <span>TikTok</span>
            <span className="text-slate-600">·</span>
            <span>SHEIN</span>
          </div>
        </td>

        {/* 11. Ações */}
        <td className="py-2.5 px-3 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => onOpenResearch(product)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition"
            >
              <Search className="w-3 h-3" />
              <span>Pesquisar</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenSimulator(product)}
              title="Simular preço"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
            >
              <Calculator className="w-3.5 h-3.5 text-slate-300" />
            </button>

            {onOpenDetails && (
              <button
                type="button"
                onClick={() => onOpenDetails(product)}
                title="Editar produto"
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((prev) => !prev)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Mais opções"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-44 rounded-lg bg-[#141a26] border border-slate-800 shadow-xl py-1 z-30 text-left text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        handleCopy(product.id, product.name);
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                    >
                      {copiedId === product.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>Copiar Nome</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleCopy(product.id, String(product.cost));
                        setShowMenu(false);
                      }}
                      className="w-full px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Copiar Custo</span>
                    </button>

                    {bestRecord?.url && (
                      <button
                        type="button"
                        onClick={() => {
                          handleCopy(product.id, bestRecord.url);
                          setShowMenu(false);
                        }}
                        className="w-full px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white flex items-center gap-2"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
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
                        className="w-full px-3 py-1.5 text-slate-300 hover:bg-slate-800 flex items-center gap-2 border-t border-slate-800"
                      >
                        <span>Remover marcação Novo</span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </td>
      </tr>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.product === nextProps.product &&
      prevProps.onToggleSelect === nextProps.onToggleSelect &&
      prevProps.onOpenResearch === nextProps.onOpenResearch &&
      prevProps.onOpenSimulator === nextProps.onOpenSimulator &&
      prevProps.onOpenDetails === nextProps.onOpenDetails &&
      prevProps.onDismissNew === nextProps.onDismissNew &&
      prevProps.onUpdateStatus === nextProps.onUpdateStatus
    );
  }
);

ProductTableRow.displayName = 'ProductTableRow';

interface ProductTableViewProps {
  products: Product[];
  selectedProductIds: string[];
  onToggleSelect: (productId: string) => void;
  onToggleSelectAll: () => void;
  onOpenResearch: (product: Product) => void;
  onOpenSimulator: (product: Product) => void;
  onOpenDetails?: (product: Product) => void;
  onDismissNew?: (productId: string) => void;
  onUpdateStatus?: (productId: string, status: ProductStatus) => void;
  sortBy?: string;
  onSortChange?: (sort: any) => void;
}

export const ProductTableView = React.memo<ProductTableViewProps>(
  ({
    products,
    selectedProductIds,
    onToggleSelect,
    onToggleSelectAll,
    onOpenResearch,
    onOpenSimulator,
    onOpenDetails,
    onDismissNew,
    onUpdateStatus,
    sortBy,
    onSortChange,
  }) => {
    const allSelected = products.length > 0 && products.every((p) => selectedProductIds.includes(p.id));
    const someSelected = products.some((p) => selectedProductIds.includes(p.id)) && !allSelected;

    // Mobile layout state: default 2 products per row
    const [mobileLayout, setMobileLayout] = useState<'2cols' | '1col'>(() => {
      try {
        const saved = localStorage.getItem('pesquisa_produtos_mobile_view_layout');
        return saved === '1col' ? '1col' : '2cols';
      } catch {
        return '2cols';
      }
    });

    const handleToggleMobileLayout = (mode: '2cols' | '1col') => {
      setMobileLayout(mode);
      try {
        localStorage.setItem('pesquisa_produtos_mobile_view_layout', mode);
      } catch {}
    };

    return (
      <div className="space-y-3">
        {/* MOBILE LAYOUT SWITCHER (Celular) */}
        <div className="md:hidden flex items-center justify-between px-3 py-2 rounded-lg bg-[#121824] border border-slate-800">
          <span className="text-xs text-slate-300 font-medium">
            Visualização: <strong className="text-white">{mobileLayout === '2cols' ? '2 colunas' : '1 coluna'}</strong>
          </span>
          <div className="flex items-center gap-1 p-0.5 rounded bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => handleToggleMobileLayout('2cols')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                mobileLayout === '2cols'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              2 Colunas
            </button>
            <button
              type="button"
              onClick={() => handleToggleMobileLayout('1col')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                mobileLayout === '1col'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              1 Coluna
            </button>
          </div>
        </div>

        {/* MOBILE VIEW */}
        {mobileLayout === '2cols' ? (
          <div className="md:hidden grid grid-cols-2 gap-2">
            {products.map((product) => {
              const isSelected = selectedProductIds.includes(product.id);
              const sku = getProductSku(product);
              const bestRecord =
                product.research_records && product.research_records.length > 0
                  ? product.research_records[0]
                  : null;

              return (
                <div
                  key={product.id}
                  className={`p-2.5 rounded-lg border flex flex-col justify-between transition min-w-0 w-full ${
                    isSelected
                      ? 'bg-[#151d2d] border-blue-500 ring-1 ring-blue-500'
                      : product.is_new
                      ? 'bg-[#121824] border-blue-500/50'
                      : 'bg-[#121824] border-slate-800'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    {/* Imagem + Checkbox + Badge */}
                    <div className="relative aspect-4/3 w-full rounded bg-[#0b0f17] border border-slate-800 overflow-hidden flex items-center justify-center">
                      <ProductImage
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        fallbackIconSize="w-5 h-5"
                      />
                      <div className="absolute top-1 left-1 z-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelect(product.id)}
                          className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                          aria-label={`Selecionar ${product.name}`}
                        />
                      </div>
                      {product.is_new && (
                        <span className="absolute top-1 right-1 z-10 px-1 py-0.2 rounded text-[8px] font-bold bg-blue-600 text-white shrink-0">
                          NOVO
                        </span>
                      )}
                    </div>

                    {/* SKU & Nome */}
                    <div className="min-w-0">
                      <span className="text-[9px] font-mono text-slate-400 bg-slate-900 px-1 py-0.5 rounded border border-slate-800 block truncate max-w-full mb-1">
                        SKU: {sku}
                      </span>
                      <h4
                        onClick={() => (onOpenDetails ? onOpenDetails(product) : onOpenResearch(product))}
                        className="text-[11px] font-semibold text-white hover:text-blue-400 cursor-pointer line-clamp-2 leading-snug break-words"
                        title={product.name}
                      >
                        {product.name}
                      </h4>
                    </div>

                    {/* Preços */}
                    <div className="p-1.5 rounded bg-[#0b0f17] border border-slate-800 text-[10px] space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[8px] uppercase font-medium text-slate-400">Custo</span>
                        <span className="font-mono tabular-nums font-bold text-emerald-400 truncate">
                          {formatCurrency(product.cost)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 pt-0.5 border-t border-slate-800/80">
                        <span className="text-[8px] uppercase font-medium text-slate-400">Venda</span>
                        <span className="font-mono tabular-nums font-bold text-sky-400 truncate">
                          {bestRecord ? formatCurrency(bestRecord.price) : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ações inferiores */}
                  <div className="pt-2 mt-2 border-t border-slate-800 space-y-1">
                    {onUpdateStatus && (
                      <div className="relative w-full">
                        <select
                          value={product.status}
                          onChange={(e) => onUpdateStatus(product.id, e.target.value as ProductStatus)}
                          className={`w-full appearance-none text-[9px] font-medium pl-1.5 pr-4 py-1 rounded border cursor-pointer transition focus:outline-none truncate ${
                            product.status === 'Encontrado'
                              ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80'
                              : product.status === 'Revisar'
                              ? 'bg-purple-950/70 text-purple-300 border-purple-800/80'
                              : product.status === 'Descartado'
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-amber-950/70 text-amber-300 border-amber-800/80'
                          }`}
                        >
                          <option value="Pendente">Pendente</option>
                          <option value="Encontrado">Encontrado</option>
                          <option value="Revisar">Revisar</option>
                          <option value="Descartado">Descartado</option>
                        </select>
                        <ChevronDown className="w-2.5 h-2.5 text-slate-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenResearch(product)}
                        className="flex-1 min-w-0 py-1 px-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[10px] flex items-center justify-center gap-1 truncate"
                      >
                        <Search className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">Pesquisar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenSimulator(product)}
                        className="p-1 min-w-[28px] h-7 rounded bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center shrink-0"
                        title="Simulador"
                      >
                        <Calculator className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="md:hidden space-y-2">
            {products.map((product) => {
              const isSelected = selectedProductIds.includes(product.id);
              const sku = getProductSku(product);
              const bestRecord =
                product.research_records && product.research_records.length > 0
                  ? product.research_records[0]
                  : null;

              return (
                <div
                  key={product.id}
                  className={`p-3 rounded-lg border transition ${
                    isSelected
                      ? 'bg-[#151d2d] border-blue-500 ring-1 ring-blue-500'
                      : product.is_new
                      ? 'bg-[#121824] border-blue-500/50'
                      : 'bg-[#121824] border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Select + Image */}
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(product.id)}
                        className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer w-4 h-4"
                        aria-label={`Selecionar ${product.name}`}
                      />
                      <div className="relative w-12 h-12 rounded bg-[#0b0f17] border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                        <ProductImage
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          fallbackIconSize="w-5 h-5"
                        />
                      </div>
                    </div>

                    {/* Body Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 truncate max-w-[120px]">
                          SKU: {sku}
                        </span>
                        {product.is_new && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-600 text-white shrink-0">
                            NOVO
                          </span>
                        )}
                      </div>

                      <h4
                        onClick={() => (onOpenDetails ? onOpenDetails(product) : onOpenResearch(product))}
                        className="text-xs font-semibold text-white hover:text-blue-400 cursor-pointer line-clamp-2 leading-snug mb-2"
                      >
                        {product.name}
                      </h4>

                      {/* Preços */}
                      <div className="flex items-center justify-between gap-2 p-2 rounded bg-[#0b0f17] border border-slate-800 text-xs mb-2">
                        <div>
                          <span className="text-[9px] uppercase font-medium text-slate-400 block">
                            Custo
                          </span>
                          <span className="font-mono tabular-nums font-bold text-emerald-400">
                            {formatCurrency(product.cost)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[9px] uppercase font-medium text-slate-400 block">
                            Concorrência
                          </span>
                          <span className="font-mono tabular-nums font-bold text-sky-400">
                            {bestRecord ? formatCurrency(bestRecord.price) : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center justify-between gap-2">
                        {onUpdateStatus && (
                          <div className="relative inline-flex items-center">
                            <select
                              value={product.status}
                              onChange={(e) => onUpdateStatus(product.id, e.target.value as ProductStatus)}
                              className={`appearance-none text-[10px] font-medium pl-2 pr-5 py-1 rounded border cursor-pointer transition focus:outline-none ${
                                product.status === 'Encontrado'
                                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80'
                                  : product.status === 'Revisar'
                                  ? 'bg-purple-950/70 text-purple-300 border-purple-800/80'
                                  : product.status === 'Descartado'
                                  ? 'bg-slate-800 text-slate-400 border-slate-700'
                                  : 'bg-amber-950/70 text-amber-300 border-amber-800/80'
                              }`}
                            >
                              <option value="Pendente">Pendente</option>
                              <option value="Encontrado">Encontrado</option>
                              <option value="Revisar">Revisar</option>
                              <option value="Descartado">Descartado</option>
                            </select>
                            <ChevronDown className="w-2.5 h-2.5 text-slate-400 absolute right-1.5 pointer-events-none" />
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 ml-auto">
                          <button
                            type="button"
                            onClick={() => onOpenResearch(product)}
                            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1"
                          >
                            <Search className="w-3 h-3" />
                            <span>Pesquisar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenSimulator(product)}
                            className="p-1.5 rounded bg-slate-800 text-slate-300 border border-slate-700 flex items-center justify-center"
                            title="Simulador"
                          >
                            <Calculator className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* DESKTOP FULL TABLE */}
        <div className="hidden md:block bg-[#121824] rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto min-w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-[#0e1320] text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {/* 1. Selecionar */}
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(input) => {
                        if (input) input.indeterminate = someSelected;
                      }}
                      onChange={onToggleSelectAll}
                      aria-label="Selecionar todos os produtos"
                      className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>

                  {/* 2. Imagem */}
                  <th className="py-3 px-3 w-12 text-center">Imagem</th>

                  {/* 3. Produto */}
                  <th className="py-3 px-3 min-w-[220px]">
                    <button
                      type="button"
                      onClick={() =>
                        onSortChange &&
                        onSortChange(sortBy === 'name_asc' ? 'name_desc' : 'name_asc')
                      }
                      className="inline-flex items-center gap-1 hover:text-slate-200 transition"
                      title="Ordenar por Nome"
                    >
                      <span>Produto</span>
                      {sortBy === 'name_asc' ? (
                        <ArrowUp className="w-3 h-3 text-blue-400" />
                      ) : sortBy === 'name_desc' ? (
                        <ArrowDown className="w-3 h-3 text-blue-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      )}
                    </button>
                  </th>

                  {/* 4. SKU */}
                  <th className="py-3 px-3 w-28">SKU</th>

                  {/* 5. Custo */}
                  <th className="py-3 px-3 w-28">
                    <button
                      type="button"
                      onClick={() =>
                        onSortChange &&
                        onSortChange(sortBy === 'lowest_cost' ? 'highest_cost' : 'lowest_cost')
                      }
                      className="inline-flex items-center gap-1 hover:text-slate-200 transition"
                      title="Ordenar por Custo"
                    >
                      <span>Custo</span>
                      {sortBy === 'lowest_cost' ? (
                        <ArrowUp className="w-3 h-3 text-blue-400" />
                      ) : sortBy === 'highest_cost' ? (
                        <ArrowDown className="w-3 h-3 text-blue-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      )}
                    </button>
                  </th>

                  {/* 6. Preço */}
                  <th className="py-3 px-3 w-28">
                    <button
                      type="button"
                      onClick={() =>
                        onSortChange &&
                        onSortChange(sortBy === 'lowest_price' ? 'highest_price' : 'lowest_price')
                      }
                      className="inline-flex items-center gap-1 hover:text-slate-200 transition"
                      title="Ordenar por Preço"
                    >
                      <span>Preço</span>
                      {sortBy === 'lowest_price' ? (
                        <ArrowUp className="w-3 h-3 text-blue-400" />
                      ) : sortBy === 'highest_price' ? (
                        <ArrowDown className="w-3 h-3 text-blue-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      )}
                    </button>
                  </th>

                  {/* 7. Peso */}
                  <th className="py-3 px-3 w-24">Peso</th>

                  {/* 8. Dimensões */}
                  <th className="py-3 px-3 min-w-[120px]">Dimensões</th>

                  {/* 9. Status */}
                  <th className="py-3 px-3 w-32">Status</th>

                  {/* 10. Canais */}
                  <th className="py-3 px-3 min-w-[150px]">Canais</th>

                  {/* 11. Ações */}
                  <th className="py-3 px-3 w-32 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {products.map((product) => {
                  const isSelected = selectedProductIds.includes(product.id);
                  return (
                    <ProductTableRow
                      key={product.id}
                      product={product}
                      isSelected={isSelected}
                      onToggleSelect={onToggleSelect}
                      onOpenResearch={onOpenResearch}
                      onOpenSimulator={onOpenSimulator}
                      onOpenDetails={onOpenDetails}
                      onDismissNew={onDismissNew}
                      onUpdateStatus={onUpdateStatus}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }
);

ProductTableView.displayName = 'ProductTableView';
