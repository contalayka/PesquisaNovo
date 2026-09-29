import React, { useState, useMemo } from 'react';
import {
  Layers,
  CheckCircle2,
  Download,
  Store,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  Package,
  Check,
  ArrowRight,
  SlidersHorizontal,
  Eye,
  HelpCircle,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Building,
} from 'lucide-react';
import { Product, GeneratedFile, MarketplacePlatform } from '../types';
import {
  exportMarketplaceTemplate,
  generateMarketplaceRows,
  calculateSellingPrice,
  MarketplaceConfigOptions,
} from '../utils/marketplaceExport';
import { formatCurrency } from '../utils/excel';

interface ConversionViewProps {
  products: Product[];
  onAddGeneratedFiles: (files: GeneratedFile[]) => void;
  onNavigateToFiles: () => void;
}

export const ConversionView: React.FC<ConversionViewProps> = ({
  products,
  onAddGeneratedFiles,
  onNavigateToFiles,
}) => {
  // Selected platforms to export
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<MarketplacePlatform, boolean>>({
    'Shopee': true,
    'TikTok Shop': true,
    'SHEIN': true,
    'UpSeller ERP': true,
    'UpSeller ERP (Conta 1)': true,
    'UpSeller ERP (Conta 2)': true,
  });

  // Export settings
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [onlyReadyProducts, setOnlyReadyProducts] = useState(false);
  const [markupMultiplier, setMarkupMultiplier] = useState<number>(2.2);
  const [includePlatformFees, setIncludePlatformFees] = useState<boolean>(true);
  const [roundingMode, setRoundingMode] = useState<'exact' | '90' | '99'>('90');

  // UpSeller Multi-Account settings
  const [upsellerAccountName1, setUpsellerAccountName1] = useState<string>('Conta 1 (Principal)');
  const [upsellerAccountName2, setUpsellerAccountName2] = useState<string>('Conta 2 (Secundária)');
  const [skuPrefixAccount1, setSkuPrefixAccount1] = useState<string>('C1-');
  const [skuPrefixAccount2, setSkuPrefixAccount2] = useState<string>('C2-');

  // Physical & shipping defaults
  const [defaultStock, setDefaultStock] = useState<number>(50);
  const [defaultWeightKg, setDefaultWeightKg] = useState<number>(0.35);
  const [defaultLength, setDefaultLength] = useState<number>(20);
  const [defaultWidth, setDefaultWidth] = useState<number>(15);
  const [defaultHeight, setDefaultHeight] = useState<number>(10);
  const [defaultBrand, setDefaultBrand] = useState<string>('Genérica');
  const [defaultCategory, setDefaultCategory] = useState<string>('Casa, Móveis e Decoração');
  const [defaultDaysToShip, setDefaultDaysToShip] = useState<number>(2);

  // UI state
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState<MarketplacePlatform>('UpSeller ERP');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationDone, setGenerationDone] = useState(false);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [selectedHelpPlatform, setSelectedHelpPlatform] = useState<MarketplacePlatform | null>(null);

  // Filter products
  const readyProducts = useMemo(
    () => products.filter((p) => p.status === 'Encontrado' || (p.research_records && p.research_records.length > 0)),
    [products]
  );

  const eligibleProducts = onlyReadyProducts ? readyProducts : products;
  const activePlatforms = (Object.keys(selectedPlatforms) as MarketplacePlatform[]).filter(
    (p) => selectedPlatforms[p]
  );

  const togglePlatform = (name: MarketplacePlatform) => {
    setSelectedPlatforms((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  const currentConfigOptions: MarketplaceConfigOptions = useMemo(
    () => ({
      platform: previewPlatform,
      format: exportFormat,
      onlyReady: onlyReadyProducts,
      markupMultiplier,
      includePlatformFees,
      roundingMode,
      upsellerAccountName1,
      upsellerAccountName2,
      skuPrefixAccount1,
      skuPrefixAccount2,
      defaultStock,
      defaultWeightKg,
      defaultPackageLength: defaultLength,
      defaultPackageWidth: defaultWidth,
      defaultPackageHeight: defaultHeight,
      defaultBrand,
      defaultCategory,
      defaultDaysToShip,
    }),
    [
      previewPlatform,
      exportFormat,
      onlyReadyProducts,
      markupMultiplier,
      includePlatformFees,
      roundingMode,
      upsellerAccountName1,
      upsellerAccountName2,
      skuPrefixAccount1,
      skuPrefixAccount2,
      defaultStock,
      defaultWeightKg,
      defaultLength,
      defaultWidth,
      defaultHeight,
      defaultBrand,
      defaultCategory,
      defaultDaysToShip,
    ]
  );

  const previewRows = useMemo(() => {
    return generateMarketplaceRows(eligibleProducts.slice(0, 5), currentConfigOptions);
  }, [eligibleProducts, currentConfigOptions]);

  const previewHeaders = useMemo(() => {
    return previewRows.length > 0 ? Object.keys(previewRows[0]) : [];
  }, [previewRows]);

  const handleGenerate = () => {
    if (activePlatforms.length === 0 || eligibleProducts.length === 0) return;

    setIsGenerating(true);
    const newFiles: GeneratedFile[] = [];

    setTimeout(() => {
      activePlatforms.forEach((platform) => {
        const platformOptions: MarketplaceConfigOptions = {
          ...currentConfigOptions,
          platform,
        };

        const { fileName, count } = exportMarketplaceTemplate(eligibleProducts, platformOptions);

        newFiles.push({
          id: `file_${Date.now()}_${platform.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          name: fileName,
          platform,
          productCount: count,
          format: exportFormat,
          createdAt: new Date().toLocaleString('pt-BR'),
        });
      });

      onAddGeneratedFiles(newFiles);
      setGeneratedCount(newFiles.length);
      setIsGenerating(false);
      setGenerationDone(true);
    }, 500);
  };

  const handleSingleExport = (platform: MarketplacePlatform) => {
    const platformOptions: MarketplaceConfigOptions = {
      ...currentConfigOptions,
      platform,
    };
    const { fileName, count } = exportMarketplaceTemplate(eligibleProducts, platformOptions);
    onAddGeneratedFiles([
      {
        id: `file_${Date.now()}_${platform.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        name: fileName,
        platform,
        productCount: count,
        format: exportFormat,
        createdAt: new Date().toLocaleString('pt-BR'),
      },
    ]);
  };

  const platformsConfig: {
    id: MarketplacePlatform;
    name: string;
    category: string;
    badgeColor: string;
    description: string;
    rules: string[];
    howToUpload: string;
  }[] = [
    {
      id: 'UpSeller ERP',
      name: 'UpSeller ERP (Multi-Lojas / Sincronização)',
      category: 'Hub ERP',
      badgeColor: 'text-indigo-400 bg-indigo-950/40 border-indigo-800/60',
      description: 'Planilha consolidada para o UpSeller ERP. Permite importar o catálogo mestre e sincronizar estoques e anúncios entre as lojas da Shopee, TikTok Shop e SHEIN em um só lugar.',
      rules: ['SKU Mestre unificado', 'Mapeamento para Conta 1 e Conta 2', 'Estoque centralizado', 'URLs das fotos'],
      howToUpload: 'No UpSeller ERP > acesse "Produtos" > "Importar Produtos via Excel" > selecione este arquivo > após a importação, use a ferramenta de Cópia entre Lojas para publicar na Shopee, TikTok e SHEIN.',
    },
    {
      id: 'UpSeller ERP (Conta 1)',
      name: 'UpSeller ERP - Conta 1 (Principal)',
      category: 'Conta 1',
      badgeColor: 'text-blue-400 bg-blue-950/40 border-blue-800/60',
      description: `Planilha formatada para a primeira conta no UpSeller ERP com prefixo de SKU (${skuPrefixAccount1 || 'C1-'}) para evitar duplicação ou conflitos entre contas.`,
      rules: [`Prefixo de SKU: ${skuPrefixAccount1 || 'C1-'}`, 'Identificador de Loja 1', 'Preço e custos calculados', 'Fotos em alta resolução'],
      howToUpload: 'No UpSeller ERP > filtre pela Conta 1 > acesse "Produtos" > "Importar Excel" > selecione este arquivo.',
    },
    {
      id: 'UpSeller ERP (Conta 2)',
      name: 'UpSeller ERP - Conta 2 (Secundária)',
      category: 'Conta 2',
      badgeColor: 'text-purple-400 bg-purple-950/40 border-purple-800/60',
      description: `Planilha formatada para a segunda conta no UpSeller ERP com prefixo de SKU (${skuPrefixAccount2 || 'C2-'}) para gestão independente sem risco de banimento por duplicação.`,
      rules: [`Prefixo de SKU: ${skuPrefixAccount2 || 'C2-'}`, 'Identificador de Loja 2', 'Preço e custos calculados', 'Fotos em alta resolução'],
      howToUpload: 'No UpSeller ERP > filtre pela Conta 2 > acesse "Produtos" > "Importar Excel" > selecione este arquivo.',
    },
    {
      id: 'Shopee',
      name: 'Shopee Brasil',
      category: 'Marketplace',
      badgeColor: 'text-orange-400 bg-orange-950/40 border-orange-800/60',
      description: 'Modelo oficial de Envio Massivo / Publicação Básica da Shopee Brasil com dimensões de pacote, estoque, variações, prazo de envio e fotos.',
      rules: ['Dimensões do pacote obrigatórias (cm)', 'Peso em kg', 'Fotos em boa resolução', 'Prazo de envio configurado'],
      howToUpload: 'Na Central do Vendedor Shopee > clique em "Meus Produtos" > clique em "Ações em Massa" > selecione "Publicação Básica" > clique em "Fazer Upload" e envie o arquivo baixado.',
    },
    {
      id: 'TikTok Shop',
      name: 'TikTok Shop',
      category: 'Social Commerce',
      badgeColor: 'text-cyan-400 bg-cyan-950/40 border-cyan-800/60',
      description: 'Padrão do Seller Center TikTok Shop Brasil (Batch Tool) com pesos, caixas de envio e fotos de capa para catálogo social.',
      rules: ['Peso do pacote em kg', 'Dimensões da caixa', 'Preço de varejo em BRL', 'Estoque inicial'],
      howToUpload: 'No TikTok Shop Seller Center > acesse "Products" > "Batch Tool" > "Bulk Publish" > envie a planilha.',
    },
    {
      id: 'SHEIN',
      name: 'SHEIN Marketplace',
      category: 'Marketplace',
      badgeColor: 'text-rose-400 bg-rose-950/40 border-rose-800/60',
      description: 'Planilha formatada para vendedores marketplace locais da SHEIN Brasil com peso convertido em gramas (g) e cálculo de Supply/Retail Price.',
      rules: ['Peso sempre em gramas (g)', 'Preço de fornecimento e varejo', 'Fotos em alta resolução'],
      howToUpload: 'No SHEIN Seller Portal Brasil > acesse "Gerenciamento de Produtos" > "Upload em Massa" > selecione este arquivo.',
    },
  ];

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-10">
      {/* 1. Header */}
      <div className="rounded-xl bg-[#121824] border border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Módulo de Conversão & Exportação</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Exportar para Shopee, TikTok Shop, SHEIN & UpSeller ERP
          </h1>
          <p className="text-xs text-slate-400">
            Gere arquivos com colunas e regras exatas para publicação direta ou sincronização em múltiplas contas.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            id="toggle-config-panel-btn"
            onClick={() => setShowConfigPanel(!showConfigPanel)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition ${
              showConfigPanel
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Configurar Parâmetros</span>
            {showConfigPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            id="navigate-to-files-btn"
            onClick={onNavigateToFiles}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <span>Histórico de Arquivos</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Quick Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg bg-[#121824] border border-slate-800 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Produtos no Catálogo</span>
            <Package className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono tabular-nums">{eligibleProducts.length}</span>
            <span className="text-xs text-slate-400">de {products.length} itens</span>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyReadyProducts}
              onChange={(e) => setOnlyReadyProducts(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
            />
            <span>Apenas produtos pesquisados ({readyProducts.length})</span>
          </label>
        </div>

        <div className="rounded-lg bg-[#121824] border border-slate-800 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Canais / Contas Ativas</span>
            <Store className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">{activePlatforms.length}</span>
            <span className="text-xs text-slate-400">de {platformsConfig.length} formatos</span>
          </div>
          <p className="mt-2 text-xs text-slate-400 truncate">
            {activePlatforms.join(', ') || 'Nenhum canal ativo'}
          </p>
        </div>

        <div className="rounded-lg bg-[#121824] border border-slate-800 p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Formato do Arquivo</span>
            <FileSpreadsheet className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => setExportFormat('xlsx')}
              className={`flex-1 py-1 px-2.5 rounded text-xs font-medium border transition ${
                exportFormat === 'xlsx'
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => setExportFormat('csv')}
              className={`flex-1 py-1 px-2.5 rounded text-xs font-medium border transition ${
                exportFormat === 'csv'
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              CSV (.csv)
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            UTF-8 compatível com ERPs e marketplaces
          </p>
        </div>
      </div>

      {/* 3. Configuration Drawer */}
      {showConfigPanel && (
        <div className="rounded-xl bg-[#121824] border border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Parâmetros de Precificação & 2 Contas UpSeller
            </h3>
            <span className="text-xs text-slate-400">
              Ajuste regras de cálculo de preço, markup e identificadores de conta
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* 1. Multi-Account UpSeller */}
            <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-blue-400" />
                <span>UpSeller ERP: 2 Contas</span>
              </span>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Nome da Conta 1 (Principal):
                </label>
                <input
                  type="text"
                  value={upsellerAccountName1}
                  onChange={(e) => setUpsellerAccountName1(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Prefixo SKU Conta 1:
                </label>
                <input
                  type="text"
                  value={skuPrefixAccount1}
                  onChange={(e) => setSkuPrefixAccount1(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="text-[11px] text-slate-400 block mb-1">
                  Nome da Conta 2 (Secundária):
                </label>
                <input
                  type="text"
                  value={upsellerAccountName2}
                  onChange={(e) => setUpsellerAccountName2(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Prefixo SKU Conta 2:
                </label>
                <input
                  type="text"
                  value={skuPrefixAccount2}
                  onChange={(e) => setSkuPrefixAccount2(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* 2. Pricing & Markup */}
            <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5">
              <span className="font-semibold text-white">
                Precificação & Margem
              </span>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Markup Base sobre o Custo:
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {[1.8, 2.0, 2.2, 2.5].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMarkupMultiplier(val)}
                      className={`py-1 rounded text-xs font-mono tabular-nums font-semibold transition border ${
                        markupMultiplier === val
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-[#121824] text-slate-400 border-slate-700 hover:text-white'
                      }`}
                    >
                      {val}x
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={includePlatformFees}
                  onChange={(e) => setIncludePlatformFees(e.target.checked)}
                  className="rounded border-slate-700 bg-[#121824] text-blue-600 focus:ring-blue-500"
                />
                <span>Compensar taxas dos canais (Shopee 14%+R$4, etc.)</span>
              </label>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Arredondamento:
                </label>
                <select
                  value={roundingMode}
                  onChange={(e) => setRoundingMode(e.target.value as 'exact' | '90' | '99')}
                  className="w-full px-2.5 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="90">Terminar em ,90 (Ex: R$ 49,90)</option>
                  <option value="99">Terminar em ,99 (Ex: R$ 49,99)</option>
                  <option value="exact">Valor Exato Calculado</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Estoque Padrão por Item:
                </label>
                <input
                  type="number"
                  value={defaultStock}
                  onChange={(e) => setDefaultStock(Number(e.target.value) || 0)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* 3. Package & Shipping Defaults */}
            <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5">
              <span className="font-semibold text-white">
                Embalagem & Frete Padrão
              </span>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Peso Padrão (kg):
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={defaultWeightKg}
                  onChange={(e) => setDefaultWeightKg(Number(e.target.value) || 0.35)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Dimensões C x L x A (cm):
                </label>
                <div className="grid grid-cols-3 gap-1">
                  <input
                    type="number"
                    value={defaultLength}
                    onChange={(e) => setDefaultLength(Number(e.target.value) || 20)}
                    placeholder="Comp"
                    className="px-2 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs text-center font-mono focus:outline-none"
                  />
                  <input
                    type="number"
                    value={defaultWidth}
                    onChange={(e) => setDefaultWidth(Number(e.target.value) || 15)}
                    placeholder="Larg"
                    className="px-2 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs text-center font-mono focus:outline-none"
                  />
                  <input
                    type="number"
                    value={defaultHeight}
                    onChange={(e) => setDefaultHeight(Number(e.target.value) || 10)}
                    placeholder="Alt"
                    className="px-2 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs text-center font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Marca Padrão:
                </label>
                <input
                  type="text"
                  value={defaultBrand}
                  onChange={(e) => setDefaultBrand(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Categoria Padrão:
                </label>
                <input
                  type="text"
                  value={defaultCategory}
                  onChange={(e) => setDefaultCategory(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#121824] border border-slate-700 text-white text-xs focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Platform Selection Grid */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
            Formatos & Canais Disponíveis
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                const all: Record<MarketplacePlatform, boolean> = {
                  'Shopee': true,
                  'TikTok Shop': true,
                  'SHEIN': true,
                  'UpSeller ERP': true,
                  'UpSeller ERP (Conta 1)': true,
                  'UpSeller ERP (Conta 2)': true,
                };
                setSelectedPlatforms(all);
              }}
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              Selecionar Todos
            </button>
            <span className="text-slate-600">·</span>
            <button
              type="button"
              onClick={() => {
                const none: Record<MarketplacePlatform, boolean> = {
                  'Shopee': false,
                  'TikTok Shop': false,
                  'SHEIN': false,
                  'UpSeller ERP': false,
                  'UpSeller ERP (Conta 1)': false,
                  'UpSeller ERP (Conta 2)': false,
                };
                setSelectedPlatforms(none);
              }}
              className="text-slate-400 hover:text-slate-300"
            >
              Desmarcar Todos
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {platformsConfig.map((item) => {
            const isSelected = !!selectedPlatforms[item.id];
            const isPreviewing = previewPlatform === item.id;

            return (
              <div
                key={item.id}
                className={`rounded-lg p-4 border transition flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#121824] border-slate-700'
                    : 'bg-[#0e1320] border-slate-800/80 opacity-70'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePlatform(item.id)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs font-bold text-white">{item.name}</span>
                    </label>

                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${item.badgeColor}`}>
                      {item.category}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed mb-3">
                    {item.description}
                  </p>

                  <div className="space-y-1 mb-3">
                    {item.rules.map((r, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="truncate">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPreviewPlatform(item.id)}
                      className={`px-2 py-1 rounded text-xs font-medium border transition flex items-center gap-1 ${
                        isPreviewing
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                      title="Ver prévia"
                    >
                      <Eye className="w-3 h-3" />
                      <span>{isPreviewing ? 'Visualizando' : 'Prévia'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedHelpPlatform(item.id)}
                      className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition"
                      title="Ajuda de upload"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSingleExport(item.id)}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-emerald-600 hover:text-white text-emerald-400 border border-slate-700 transition flex items-center gap-1"
                    title={`Exportar ${item.name}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Bulk Export Action */}
      <div className="rounded-xl bg-[#121824] border border-slate-800 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Exportar Todos os Canais Selecionados ({activePlatforms.length})
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Exporta {eligibleProducts.length} produtos em arquivos formatados para UpSeller ERP, Shopee, TikTok e SHEIN.
          </p>
        </div>

        <button
          type="button"
          id="btn-export-all-marketplaces"
          disabled={isGenerating || activePlatforms.length === 0 || eligibleProducts.length === 0}
          onClick={handleGenerate}
          className="px-5 py-2.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition shrink-0"
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Gerando Planilhas...</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Baixar Todos ({activePlatforms.length} {exportFormat.toUpperCase()})</span>
            </>
          )}
        </button>
      </div>

      {generationDone && (
        <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/60 p-3 text-emerald-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{generatedCount} arquivos gerados e baixados com sucesso.</span>
          </div>
          <button
            type="button"
            onClick={onNavigateToFiles}
            className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium flex items-center gap-1 transition shrink-0"
          >
            <span>Ver Arquivos</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 6. Live Column Preview */}
      <div className="rounded-xl bg-[#121824] border border-slate-800 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Pré-visualização de Colunas: <span className="text-blue-400">{previewPlatform}</span>
            </h3>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {platformsConfig.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreviewPlatform(p.id)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition border ${
                  previewPlatform === p.id
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                {p.id.replace('UpSeller ERP', 'UpSeller')}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#0e1320] text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              <tr>
                {previewHeaders.map((header) => (
                  <th key={header} className="px-3 py-2 whitespace-nowrap border-b border-slate-800">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {previewRows.length > 0 ? (
                previewRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-800/30 transition">
                    {previewHeaders.map((hKey) => {
                      const cellVal = row[hKey];
                      return (
                        <td
                          key={hKey}
                          className="px-3 py-1.5 whitespace-nowrap text-slate-200 font-mono tabular-nums text-[11px] max-w-xs truncate"
                          title={String(cellVal ?? '')}
                        >
                          {cellVal !== undefined && cellVal !== null && cellVal !== ''
                            ? String(cellVal)
                            : <span className="text-slate-600 italic">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={previewHeaders.length || 1} className="px-4 py-6 text-center text-slate-500">
                    Nenhum produto selecionado para exibir prévia.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Help Modal */}
      {selectedHelpPlatform && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl bg-[#141a26] border border-slate-800 p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h4 className="text-sm font-semibold text-white">
                Como importar no {selectedHelpPlatform}
              </h4>
              <button
                type="button"
                onClick={() => setSelectedHelpPlatform(null)}
                className="text-slate-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300">
              <p className="p-3 rounded bg-slate-900 border border-slate-800 text-slate-200">
                {platformsConfig.find((p) => p.id === selectedHelpPlatform)?.howToUpload}
              </p>

              <div className="space-y-1">
                <span className="font-semibold text-white block">Requisitos:</span>
                {platformsConfig
                  .find((p) => p.id === selectedHelpPlatform)
                  ?.rules.map((r, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-slate-400">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{r}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedHelpPlatform(null)}
                className="px-3.5 py-1.5 rounded text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
