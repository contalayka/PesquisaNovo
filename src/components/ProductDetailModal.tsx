import React, { useState } from 'react';
import {
  X,
  Package,
  Truck,
  Store,
  Save,
  Check,
  ExternalLink,
  AlertCircle,
  Copy,
  Calculator,
  Search,
} from 'lucide-react';
import { Product, ProductStatus, getProductSku, getProductWeightDisplay, getProductDimensionsDisplay } from '../types';
import { formatCurrency, parseNumber, formatImageUrl } from '../utils/excel';
import { ProductImage } from './ProductImage';

interface ProductDetailModalProps {
  product: Product;
  onClose: () => void;
  onSaveProduct: (updated: Product) => void;
  onOpenResearch: (product: Product) => void;
  onOpenSimulator: (product: Product) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onSaveProduct,
  onOpenResearch,
  onOpenSimulator,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'envio' | 'marketplaces'>('info');

  // Form states
  const [name, setName] = useState(product.name);
  const [cost, setCost] = useState(String(product.cost ?? ''));
  const [sku, setSku] = useState(getProductSku(product) === 'Não informado' ? '' : getProductSku(product));
  const [barcode, setBarcode] = useState(product.barcode || '');
  const [status, setStatus] = useState<ProductStatus>(product.status);
  const [available, setAvailable] = useState(product.available);
  const [image, setImage] = useState(product.image || '');
  const [notes, setNotes] = useState(product.notes || '');

  // Dados de envio (PRODUTO JÁ EMBALADO PARA ENVIO)
  const [weight, setWeight] = useState(product.weight !== undefined && product.weight !== null ? String(product.weight) : '');
  const [length, setLength] = useState(product.package_length !== undefined && product.package_length !== null ? String(product.package_length) : '');
  const [width, setWidth] = useState(product.package_width !== undefined && product.package_width !== null ? String(product.package_width) : '');
  const [height, setHeight] = useState(product.package_height !== undefined && product.package_height !== null ? String(product.package_height) : '');

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedSku, setCopiedSku] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: Product = {
      ...product,
      name: name.trim() || product.name,
      cost: parseNumber(cost),
      sku: sku.trim() || undefined,
      barcode: barcode.trim() || undefined,
      status,
      available,
      image: image.trim() || product.image,
      notes: notes.trim() || undefined,
      weight: weight.trim() ? weight.trim() : undefined,
      package_length: length.trim() ? length.trim() : undefined,
      package_width: width.trim() ? width.trim() : undefined,
      package_height: height.trim() ? height.trim() : undefined,
      updated_at: new Date().toISOString(),
    };
    onSaveProduct(updated);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleCopySku = () => {
    const text = sku || product.id;
    navigator.clipboard.writeText(text);
    setCopiedSku(true);
    setTimeout(() => setCopiedSku(false), 2000);
  };

  // Best research price
  const bestRecord = product.research_records?.[0];
  const parsedRawCost = typeof product.cost === 'number' ? product.cost : parseNumber(product.cost);
  const numCost = typeof parsedRawCost === 'number' && !isNaN(parsedRawCost) ? parsedRawCost : 0;
  const rawBestPrice = bestRecord ? (typeof bestRecord.price === 'number' ? bestRecord.price : parseNumber(bestRecord.price)) : null;
  const suggestedPrice = numCost > 0 ? (numCost * 2.2).toFixed(2) : '0,00';
  const numBestPrice = typeof rawBestPrice === 'number' && !isNaN(rawBestPrice) && rawBestPrice > 0 ? rawBestPrice : (numCost > 0 ? numCost * 2.2 : 0);
  const grossProfit = Math.max(0, numBestPrice - numCost);
  const grossMarginPct = numBestPrice > 0 ? (grossProfit / numBestPrice) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-xl bg-[#0F172A] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-[#0B0F19]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white truncate max-w-lg">
                {product.name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  SKU: {sku || product.id}
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    product.status === 'Encontrado'
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                      : product.status === 'Revisar'
                      ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                      : product.status === 'Descartado'
                      ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                      : 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60'
                  }`}
                >
                  {product.status}
                </span>
              </div>
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

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 border-b border-slate-800 bg-[#0F172A]">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'info'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Informações do Produto</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('envio')}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'envio'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Dados de Envio</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('marketplaces')}
            className={`flex items-center gap-2 px-3 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'marketplaces'
                ? 'border-indigo-500 text-indigo-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Marketplaces</span>
            {product.research_records?.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-600/30 text-indigo-300 font-bold tabular-nums">
                {product.research_records.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* TAB 1: INFORMAÇÕES DO PRODUTO */}
          {activeTab === 'info' && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {/* Image Preview */}
                <div className="w-28 h-28 rounded-lg bg-[#121824] border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative">
                  <ProductImage
                    src={image}
                    alt={name}
                    className="w-full h-full object-cover"
                    fallbackIconSize="w-7 h-7"
                    showEmptyText
                  />
                </div>

                <div className="flex-1 w-full space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nome do Produto
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-lg bg-[#121824] border border-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-emerald-400 mb-1">
                        Custo do Fornecedor (R$)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-slate-400 text-xs">R$</span>
                        <input
                          type="text"
                          value={cost}
                          onChange={(e) => setCost(e.target.value)}
                          className="w-full rounded-lg bg-[#121824] border border-emerald-800/50 pl-8 pr-3 py-2 text-xs text-emerald-300 font-bold placeholder-slate-500 focus:border-emerald-500 focus:outline-none font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        SKU / Código Interno
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={sku}
                          onChange={(e) => setSku(e.target.value)}
                          placeholder={product.id}
                          className="w-full rounded-lg bg-[#121824] border border-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleCopySku}
                          title="Copiar SKU"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          {copiedSku ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Código de Barras (EAN)
                  </label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Não informado"
                    className="w-full rounded-lg bg-[#121824] border border-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Status de Pesquisa
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ProductStatus)}
                    className="w-full rounded-lg bg-[#121824] border border-slate-800 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="Pendente">Pendente</option>
                    <option value="Encontrado">Encontrado</option>
                    <option value="Revisar">Revisar</option>
                    <option value="Descartado">Descartado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Disponibilidade no Fornecedor
                  </label>
                  <select
                    value={available ? 'true' : 'false'}
                    onChange={(e) => setAvailable(e.target.value === 'true')}
                    className="w-full rounded-lg bg-[#121824] border border-slate-800 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="true">Disponível em Estoque</option>
                    <option value="false">Indisponível / Esgotado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  URL da Imagem
                </label>
                <input
                  type="text"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  onBlur={(e) => {
                    const formatted = formatImageUrl(e.target.value);
                    if (formatted && formatted !== e.target.value) {
                      setImage(formatted);
                    }
                  }}
                  placeholder="https://... ou link direto de imagem"
                  className="w-full rounded-lg bg-[#121824] border border-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono text-[11px]"
                />
              </div>

              {/* Margem e Indicadores Financeiros */}
              <div className="p-3.5 rounded-lg bg-[#121824] border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Cálculo de Margem Estimada</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {bestRecord ? `Base: Concorrência (${bestRecord.platform})` : 'Base: Sugerido (2.2x)'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="block text-[10px] text-slate-400">Custo Fornecedor</span>
                    <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                      {formatCurrency(numCost)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="block text-[10px] text-slate-400">Preço Ref.</span>
                    <span className="text-xs font-mono font-bold text-cyan-300 tabular-nums">
                      {formatCurrency(numBestPrice)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="block text-[10px] text-slate-400">Lucro Bruto Estimado</span>
                    <span className="text-xs font-mono font-bold text-white tabular-nums">
                      {formatCurrency(grossProfit)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="block text-[10px] text-slate-400">Margem Bruta %</span>
                    <span className="text-xs font-mono font-bold text-indigo-400 tabular-nums">
                      {numCost > 0 ? `${grossMarginPct.toFixed(1)}%` : '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Área de Notas / Observações */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Notas e Observações Internas
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Adicione anotações sobre o fornecedor, qualidade, detalhes..."
                  className="w-full rounded-lg bg-[#121824] border border-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none resize-none"
                />
              </div>
            </form>
          )}

          {/* TAB 2: DADOS DE ENVIO */}
          {activeTab === 'envio' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-indigo-950/30 border border-indigo-800/40 flex items-start gap-2.5 text-xs text-indigo-200">
                <AlertCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold text-white text-xs">
                    Dimensões e Peso do Produto Embalado
                  </p>
                  <p className="text-slate-300 text-[11px]">
                    Peso e dimensões representam o <strong>PRODUTO JÁ EMBALADO PARA ENVIO</strong>, utilizados pelas transportadoras dos marketplaces.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Peso */}
                <div className="p-3.5 rounded-lg bg-[#121824] border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      Peso Embalado (kg ou g)
                    </label>
                    {!weight && (
                      <span className="text-[10px] text-amber-400 font-semibold bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50">
                        Não informado
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="Ex: 0.35 ou 350g"
                    className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Atual: <strong>{getProductWeightDisplay(product)}</strong>
                  </p>
                </div>

                {/* Dimensões Caixa */}
                <div className="p-3.5 rounded-lg bg-[#121824] border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">
                      Dimensões da Embalagem (cm)
                    </label>
                    {(!length || !width || !height) && (
                      <span className="text-[10px] text-amber-400 font-semibold bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50">
                        Não informado
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="block text-[10px] text-slate-400 mb-0.5">Comprimento</span>
                      <input
                        type="text"
                        value={length}
                        onChange={(e) => setLength(e.target.value)}
                        placeholder="cm"
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 mb-0.5">Largura</span>
                      <input
                        type="text"
                        value={width}
                        onChange={(e) => setWidth(e.target.value)}
                        placeholder="cm"
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] text-slate-400 mb-0.5">Altura</span>
                      <input
                        type="text"
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                        placeholder="cm"
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Atual: <strong>{getProductDimensionsDisplay(product)}</strong>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MARKETPLACES */}
          {activeTab === 'marketplaces' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Shopee */}
                <div className="p-3 rounded-lg bg-[#121824] border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-orange-400">Shopee</span>
                    <span className="text-[10px] text-slate-400">~14% + R$ 4</span>
                  </div>
                  <div className="flex items-baseline justify-between pt-0.5">
                    <span className="text-xs text-slate-400">Sugerido:</span>
                    <span className="text-xs font-mono font-bold text-white tabular-nums">
                      R$ {suggestedPrice}
                    </span>
                  </div>
                  <a
                    href={`https://shopee.com.br/search?keyword=${encodeURIComponent(product.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-orange-400 hover:text-orange-300"
                  >
                    <span>Pesquisar Shopee</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* TikTok Shop */}
                <div className="p-3 rounded-lg bg-[#121824] border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-cyan-400">TikTok Shop</span>
                    <span className="text-[10px] text-slate-400">Taxa Padrão</span>
                  </div>
                  <div className="flex items-baseline justify-between pt-0.5">
                    <span className="text-xs text-slate-400">Sugerido:</span>
                    <span className="text-xs font-mono font-bold text-white tabular-nums">
                      R$ {suggestedPrice}
                    </span>
                  </div>
                  <a
                    href={`https://www.tiktok.com/search?q=${encodeURIComponent(product.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                  >
                    <span>Pesquisar TikTok</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* SHEIN */}
                <div className="p-3 rounded-lg bg-[#121824] border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-400">SHEIN</span>
                    <span className="text-[10px] text-slate-400">Brasil</span>
                  </div>
                  <div className="flex items-baseline justify-between pt-0.5">
                    <span className="text-xs text-slate-400">Sugerido:</span>
                    <span className="text-xs font-mono font-bold text-white tabular-nums">
                      R$ {suggestedPrice}
                    </span>
                  </div>
                  <a
                    href={`https://br.shein.com/pdsearch/${encodeURIComponent(product.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300"
                  >
                    <span>Pesquisar SHEIN</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Research Records list */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-300">
                    Anúncios Concorrentes Salvos ({product.research_records?.length || 0})
                  </h4>
                  <button
                    type="button"
                    onClick={() => onOpenResearch(product)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                  >
                    + Adicionar opções
                  </button>
                </div>

                {(!product.research_records || product.research_records.length === 0) ? (
                  <p className="text-xs text-slate-500 italic py-2">
                    Nenhum anúncio concorrente vinculado ainda.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {product.research_records.map((r, i) => (
                      <div
                        key={r.id || i}
                        className="p-2.5 rounded-lg bg-[#121824] border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-indigo-300">{r.platform}</span>
                            <span className="text-slate-600">•</span>
                            <span className="text-white font-medium">{r.found_name}</span>
                          </div>
                          {r.url && (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-indigo-400 hover:underline mt-0.5 inline-flex items-center gap-1"
                            >
                              <span>Ver anúncio</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                        <span className="font-mono font-bold text-emerald-400 text-xs tabular-nums">
                          {formatCurrency(r.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between bg-[#0B0F19]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenResearch(product)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121824] hover:bg-slate-800 text-indigo-300 text-xs font-semibold border border-slate-800 transition"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Pesquisar</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenSimulator(product)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121824] hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition"
            >
              <Calculator className="w-3.5 h-3.5 text-indigo-400" />
              <span>Simulador</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {savedSuccess && (
              <span className="text-xs text-emerald-400 font-bold flex items-center gap-1 mr-2">
                <Check className="w-3.5 h-3.5" /> Salvo com sucesso!
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
