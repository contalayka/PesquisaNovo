import React, { useState, useEffect, useMemo } from 'react';
import {
  Calculator,
  X,
  ShoppingBag,
  Percent,
  TrendingUp,
  AlertTriangle,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { Product } from '../types';
import { formatCurrency, parseNumber } from '../utils/excel';

export interface PriceSimulatorModalProps {
  isOpen?: boolean;
  onClose: () => void;
  product?: Product | null;
  initialCost?: number | string;
  initialPrice?: number | string;
  productName?: string;
}

export type PlatformTab = 'shopee' | 'tiktok' | 'shein';

export const PriceSimulatorModal: React.FC<PriceSimulatorModalProps> = ({
  isOpen = true,
  onClose,
  product,
  initialCost,
  initialPrice,
  productName,
}) => {
  const [platform, setPlatform] = useState<PlatformTab>('shopee');

  // Input states (as strings for smooth typing with commas/decimals)
  const [costInput, setCostInput] = useState<string>('20,00');
  const [priceInput, setPriceInput] = useState<string>('59,90');
  const [taxInput, setTaxInput] = useState<string>('6'); // Simples Nacional %
  const [packInput, setPackInput] = useState<string>('2,50'); // Embalagem / expedição
  const [targetMarginInput, setTargetMarginInput] = useState<string>('20'); // % desejada

  // TikTok specific
  const [tiktokShippingProgram, setTiktokShippingProgram] = useState<boolean>(true);

  // Shopee specific
  const [shopeeFreeShipping, setShopeeFreeShipping] = useState<boolean>(true);
  const [shopeeFixedFee, setShopeeFixedFee] = useState<string>('4,00');
  const [shopeeCommissionCap, setShopeeCommissionCap] = useState<string>('105,00');

  // SHEIN specific
  const [sheinCommissionPct, setSheinCommissionPct] = useState<string>('16');
  const [sheinFixedFee, setSheinFixedFee] = useState<string>('3,00');

  // UI state
  const [copiedPrice, setCopiedPrice] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load initial values from product or direct props
  useEffect(() => {
    const rawCost = product?.cost !== undefined ? product.cost : initialCost;
    if (rawCost !== undefined && rawCost !== null && rawCost !== '') {
      const parsedCost = parseNumber(rawCost);
      if (typeof parsedCost === 'number' && !isNaN(parsedCost) && parsedCost > 0) {
        setCostInput(parsedCost.toFixed(2).replace('.', ','));

        const rawPrice =
          product?.research_records?.[0]?.price !== undefined
            ? product.research_records[0].price
            : initialPrice;

        const parsedPrice =
          rawPrice !== undefined && rawPrice !== null && rawPrice !== ''
            ? parseNumber(rawPrice)
            : null;

        if (typeof parsedPrice === 'number' && !isNaN(parsedPrice) && parsedPrice > 0) {
          setPriceInput(parsedPrice.toFixed(2).replace('.', ','));
        } else {
          setPriceInput((parsedCost * 2.5).toFixed(2).replace('.', ','));
        }
      }
    } else if (initialPrice !== undefined && initialPrice !== null && initialPrice !== '') {
      const parsedPrice = parseNumber(initialPrice);
      if (typeof parsedPrice === 'number' && !isNaN(parsedPrice) && parsedPrice > 0) {
        setPriceInput(parsedPrice.toFixed(2).replace('.', ','));
      }
    }
  }, [product, initialCost, initialPrice]);

  // Helper to parse localized string input
  const parseVal = (val: string): number => {
    if (!val) return 0;
    const clean = String(val).replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : Math.max(0, num);
  };

  // Calculations
  const metrics = useMemo(() => {
    const cost = parseVal(costInput);
    const price = parseVal(priceInput);
    const taxPct = parseVal(taxInput);
    const packCost = parseVal(packInput);
    const targetMarginPct = parseVal(targetMarginInput);

    const taxAmount = (price * taxPct) / 100;

    let marketplacePct = 0;
    let marketplaceFixed = 0;
    let platformShippingDeduction = 0;
    let platformShippingPct = 0;

    if (platform === 'shopee') {
      // Shopee: a taxa variável já inclui o programa de frete quando ativado.
      marketplacePct = shopeeFreeShipping ? 20.0 : 14.0;
      marketplaceFixed = parseVal(shopeeFixedFee);
    } else if (platform === 'tiktok') {
      // TikTok Shop:
      // Abaixo de R$ 50: 10% + R$ 4,00
      // A partir de R$ 50: 6% + R$ 6,00
      if (price < 50) {
        marketplacePct = 10.0;
        marketplaceFixed = 4.0;
      } else {
        marketplacePct = 6.0;
        marketplaceFixed = 6.0;
      }

      if (tiktokShippingProgram) {
        platformShippingPct = 6.0;
        // Limite de R$ 50 por item.
        platformShippingDeduction = Math.min((price * platformShippingPct) / 100, 50);
      }
    } else if (platform === 'shein') {
      marketplacePct = parseVal(sheinCommissionPct);
      marketplaceFixed = parseVal(sheinFixedFee);
    }

    let commissionVal = (price * marketplacePct) / 100;

    // Teto da comissão percentual da Shopee.
    const shopeeCapNum = parseVal(shopeeCommissionCap);
    if (platform === 'shopee' && shopeeCapNum > 0 && commissionVal > shopeeCapNum) {
      commissionVal = shopeeCapNum;
    }

    const totalMarketplaceFees = commissionVal + marketplaceFixed + platformShippingDeduction;

    // REGRA GERAL PARA TODAS AS PLATAFORMAS:
    // "Repasse líquido" é o que a plataforma repassa após as taxas dela.
    // O custo do produto NÃO altera o repasse; ele altera o lucro.
    const netPayout = Math.max(0, price - totalMarketplaceFees);

    // "Lucro líquido real" começa no repasse e desconta tudo que é custo do vendedor.
    // Assim, alterar o custo do produto sempre atualiza o lucro em todas as plataformas.
    const netProfit = netPayout - cost - taxAmount - packCost;

    const netMarginPct = price > 0 ? (netProfit / price) * 100 : 0;
    const markupPct = cost > 0 ? ((price - cost) / cost) * 100 : 0;

    // Preço sugerido: resolve a equação considerando todas as taxas variáveis,
    // a taxa fixa, imposto, embalagem e margem desejada.
    const totalVariablePct =
      (marketplacePct + platformShippingPct + taxPct + targetMarginPct) / 100;

    let suggestedPrice = 0;
    if (totalVariablePct < 0.99) {
      suggestedPrice = (cost + packCost + marketplaceFixed) / (1 - totalVariablePct);

      // A taxa de envio do TikTok possui teto de R$ 50.
      // Acima do ponto em que o teto é atingido, recalculamos sem tratá-la como percentual.
      if (platform === 'tiktok' && tiktokShippingProgram) {
        const shippingAtSuggested = (suggestedPrice * platformShippingPct) / 100;
        if (shippingAtSuggested > 50) {
          const fixedShipping = 50;
          const variableWithoutShipping =
            (marketplacePct + taxPct + targetMarginPct) / 100;
          if (variableWithoutShipping < 0.99) {
            suggestedPrice =
              (cost + packCost + marketplaceFixed + fixedShipping) /
              (1 - variableWithoutShipping);
          }
        }
      }
    }

    return {
      price,
      cost,
      taxAmount,
      taxPct,
      packCost,
      marketplacePct,
      marketplaceFixed,
      platformShippingDeduction,
      platformShippingPct,
      commissionVal,
      totalMarketplaceFees,
      netPayout,
      netProfit,
      netMarginPct,
      markupPct,
      suggestedPrice: parseFloat(suggestedPrice.toFixed(2)),
    };
  }, [
    costInput,
    priceInput,
    taxInput,
    packInput,
    targetMarginInput,
    platform,
    shopeeFreeShipping,
    shopeeFixedFee,
    shopeeCommissionCap,
    tiktokShippingProgram,
    sheinCommissionPct,
    sheinFixedFee,
  ]);
  if (isOpen === false) return null;

  const displayName = product?.name || productName;

  const handleApplySuggested = () => {
    if (metrics.suggestedPrice > 0) {
      setPriceInput(metrics.suggestedPrice.toFixed(2).replace('.', ','));
    }
  };

  const handleCopyPrice = () => {
    navigator.clipboard.writeText(metrics.price.toFixed(2));
    setCopiedPrice(true);
    setTimeout(() => setCopiedPrice(false), 2000);
  };

  return (
    <div
      id="price-simulator-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="price-simulator-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl max-h-[94vh] flex flex-col overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  Simulador de Preço & Margem
                </h2>
                {displayName && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 truncate max-w-[200px] sm:max-w-[280px]">
                    {displayName}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Calcule taxas exatas do Shopee, TikTok Shop e SHEIN
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-close-simulator-modal"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Platform Selection Tabs */}
        <div className="pt-3 flex items-center gap-1.5 sm:gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 overflow-x-auto">
          <button
            type="button"
            id="tab-sim-shopee"
            onClick={() => setPlatform('shopee')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              platform === 'shopee'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Shopee</span>
          </button>

          <button
            type="button"
            id="tab-sim-tiktok"
            onClick={() => setPlatform('tiktok')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              platform === 'tiktok'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span>TikTok Shop</span>
          </button>

          <button
            type="button"
            id="tab-sim-shein"
            onClick={() => setPlatform('shein')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              platform === 'shein'
                ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Percent className="w-3.5 h-3.5" />
            <span>SHEIN</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-3.5 space-y-4 pr-1">
          {/* Main Inputs Form - Unified Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs">
            {/* Custo */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Custo de Aquisição (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 font-medium">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  id="sim-input-cost"
                  value={costInput}
                  onChange={(e) => setCostInput(e.target.value)}
                  placeholder="0,00"
                  className="w-full pl-9 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">Custo unitário pago</span>
            </div>

            {/* Preço de Venda */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Preço de Venda (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 font-medium">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  id="sim-input-price"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder="0,00"
                  className="w-full pl-9 pr-2.5 py-1.5 rounded-lg border border-indigo-400 dark:border-indigo-500 bg-white dark:bg-slate-900 font-mono font-bold text-indigo-700 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">Preço ofertado ao cliente</span>
            </div>

            {/* Imposto */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Imposto Simples / DAS (%)
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  id="sim-input-tax"
                  value={taxInput}
                  onChange={(e) => setTaxInput(e.target.value)}
                  placeholder="6"
                  className="w-full pl-3 pr-7 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="absolute right-3 top-2 text-slate-400 font-medium">%</span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">Geralmente 4% a 8%</span>
            </div>

            {/* Embalagem / Expedição */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Embalagem & Envio (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-slate-400 font-medium">R$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  id="sim-input-pack"
                  value={packInput}
                  onChange={(e) => setPackInput(e.target.value)}
                  placeholder="2,50"
                  className="w-full pl-9 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">Caixa, fita, etiqueta</span>
            </div>
          </div>

          {/* Platform Specific Settings */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-xs space-y-2.5">
            {/* Shopee */}
            {platform === 'shopee' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shopeeFreeShipping}
                      onChange={(e) => setShopeeFreeShipping(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-500 focus:ring-orange-400"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        Programa de Frete Grátis Extra (14% + 6% = 20%)
                      </span>
                      <p className="text-[10px] text-slate-400">
                        Maior relevância e cupons para clientes
                      </p>
                    </div>
                  </label>

                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-slate-500 text-[11px]">Tarifa fixa: R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={shopeeFixedFee}
                      onChange={(e) => setShopeeFixedFee(e.target.value)}
                      className="w-16 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono font-bold text-xs"
                    />
                    <span className="text-slate-400 text-[10px]">por item</span>
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-1">
                    Teto de Comissão Shopee:
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-[11px]">Máximo: R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={shopeeCommissionCap}
                      onChange={(e) => setShopeeCommissionCap(e.target.value)}
                      className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono font-bold text-xs"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    A comissão percentual é limitada a este teto por item.
                  </p>
                </div>
              </div>
            )}

            {/* TikTok Shop */}
            {platform === 'tiktok' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-600 dark:text-slate-300 text-[11px]">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Regra oficial TikTok Shop:</p>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                    • Vendas &lt; R$ 50: <strong>10% + R$ 4,00</strong><br />
                    • Vendas &ge; R$ 50: <strong>6% + R$ 6,00</strong>
                  </p>
                  <p className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold pt-1">
                    Aplicada: {metrics.marketplacePct}% + R$ {metrics.marketplaceFixed.toFixed(2)}
                  </p>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tiktokShippingProgram}
                      onChange={(e) => setTiktokShippingProgram(e.target.checked)}
                      className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500"
                    />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        Programa de Frete TikTok (+6%, máx. R$ 50)
                      </span>
                      <p className="text-[10px] text-slate-400">
                        Taxa de serviço sobre a venda; limite de R$ 50 por item
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* SHEIN */}
            {platform === 'shein' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Comissão Categoria (%)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={sheinCommissionPct}
                    onChange={(e) => setSheinCommissionPct(e.target.value)}
                    className="w-full px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">Padrão nacional: 16%</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Taxa fixa por pedido (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={sheinFixedFee}
                    onChange={(e) => setSheinFixedFee(e.target.value)}
                    className="w-full px-2.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">Padrão: R$ 3,00</span>
                </div>
              </div>
            )}
          </div>

          {/* Demonstrativo Financeiro */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
            <div className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 flex justify-between">
              <span>Demonstrativo Unitário de Venda</span>
              <span>Valores por Unidade</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <div className="px-3.5 py-2 flex justify-between items-center">
                <span className="font-semibold text-slate-800 dark:text-slate-200">Preço de Venda Bruto</span>
                <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                  {formatCurrency(metrics.price)}
                </span>
              </div>

              <div className="px-3.5 py-1.5 flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span>(-) Custo de Aquisição</span>
                <span className="text-rose-600 dark:text-rose-400 font-mono font-medium">
                  -{formatCurrency(metrics.cost)}
                </span>
              </div>

              <div className="px-3.5 py-1.5 flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span>(-) Comissão do Marketplace ({metrics.marketplacePct}%)</span>
                <span className="text-rose-600 dark:text-rose-400 font-mono font-medium">
                  -{formatCurrency(metrics.commissionVal)}
                </span>
              </div>

              {metrics.marketplaceFixed > 0 && (
                <div className="px-3.5 py-1.5 flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span>(-) Tarifa Fixa por Item</span>
                  <span className="text-rose-600 dark:text-rose-400 font-mono font-medium">
                    -{formatCurrency(metrics.marketplaceFixed)}
                  </span>
                </div>
              )}

              {metrics.platformShippingDeduction > 0 && (
                <div className="px-3.5 py-1.5 flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span>(-) Frete do Marketplace</span>
                  <span className="text-rose-600 dark:text-rose-400 font-mono font-medium">
                    -{formatCurrency(metrics.platformShippingDeduction)}
                  </span>
                </div>
              )}

              <div className="px-3.5 py-1.5 flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span>(-) Imposto DAS / Simples ({metrics.taxPct}%)</span>
                <span className="text-rose-600 dark:text-rose-400 font-mono font-medium">
                  -{formatCurrency(metrics.taxAmount)}
                </span>
              </div>

              <div className="px-3.5 py-1.5 flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span>(-) Embalagem & Operação</span>
                <span className="text-rose-600 dark:text-rose-400 font-mono font-medium">
                  -{formatCurrency(metrics.packCost)}
                </span>
              </div>

              <div className="px-3.5 py-2 flex justify-between items-center bg-slate-50 dark:bg-slate-800/40 font-medium">
                <span className="text-slate-700 dark:text-slate-300">(=) Repasse Líquido do Marketplace</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold font-mono">
                  {formatCurrency(metrics.netPayout)}
                </span>
              </div>

              {/* Lucro Final */}
              <div
                className={`px-3.5 py-2.5 flex justify-between items-center text-sm font-extrabold ${
                  metrics.netProfit > 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {metrics.netProfit > 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                  <span>(=) Lucro Líquido Real no Bolso</span>
                </div>
                <span className="text-base font-mono">{formatCurrency(metrics.netProfit)}</span>
              </div>
            </div>
          </div>

          {/* Executive KPI Summary Bar */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-5">
              <div>
                <span className="text-slate-500 dark:text-slate-400 font-medium block text-[11px]">
                  Margem Líquida
                </span>
                <span
                  className={`text-base sm:text-lg font-bold font-mono ${
                    metrics.netMarginPct >= 20
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : metrics.netMarginPct >= 10
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : metrics.netMarginPct > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {metrics.netMarginPct.toFixed(1)}%
                </span>
              </div>

              <div className="h-7 w-px bg-slate-200 dark:bg-slate-700" />

              <div>
                <span className="text-slate-500 dark:text-slate-400 font-medium block text-[11px]">
                  Markup sobre Custo
                </span>
                <span className="text-base sm:text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
                  {metrics.markupPct.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-700">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Preço p/ meta:</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={targetMarginInput}
                    onChange={(e) => setTargetMarginInput(e.target.value)}
                    className="w-10 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono font-bold text-center text-xs"
                  />
                  <span>%</span>
                </div>
                <span className="text-sm sm:text-base font-bold font-mono text-emerald-700 dark:text-emerald-400 block">
                  {formatCurrency(metrics.suggestedPrice)}
                </span>
              </div>

              <button
                type="button"
                id="btn-apply-suggested-price"
                onClick={handleApplySuggested}
                className="py-2 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition whitespace-nowrap"
                title="Substituir Preço de Venda pelo preço sugerido"
              >
                Aplicar Preço
              </button>

              <button
                type="button"
                id="btn-copy-sim-price"
                onClick={handleCopyPrice}
                className="py-2 px-2.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition flex items-center gap-1"
                title="Copiar preço atual para a área de transferência"
              >
                {copiedPrice ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{copiedPrice ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
          <span className="text-slate-400 text-[11px] truncate">
            * Repasse líquido = venda menos taxas da plataforma. Lucro líquido = repasse menos custo, imposto e embalagem.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition whitespace-nowrap shrink-0"
          >
            Concluir Simulação
          </button>
        </div>
      </div>
    </div>
  );
};
