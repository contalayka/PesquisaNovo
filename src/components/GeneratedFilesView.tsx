import React from 'react';
import {
  FolderArchive,
  Download,
  FileSpreadsheet,
  FileText,
  Clock,
  Layers,
  ArrowRight,
  Package,
  Store,
  Trash2,
} from 'lucide-react';
import { GeneratedFile, Product, MarketplacePlatform } from '../types';
import { exportMarketplaceTemplate } from '../utils/marketplaceExport';

interface GeneratedFilesViewProps {
  files: GeneratedFile[];
  products: Product[];
  onClearFiles: () => void;
  onNavigateToConversion: () => void;
}

export const GeneratedFilesView: React.FC<GeneratedFilesViewProps> = ({
  files,
  products,
  onClearFiles,
  onNavigateToConversion,
}) => {
  const readyCount = products.filter(
    (p) => p.status === 'Encontrado' || (p.research_records && p.research_records.length > 0)
  ).length;

  const handleInstantDownload = (
    platform: MarketplacePlatform,
    format: 'xlsx' | 'csv' = 'xlsx'
  ) => {
    exportMarketplaceTemplate(products, {
      platform,
      format,
      onlyReady: false,
    });
  };

  const defaultTemplates: {
    platform: MarketplacePlatform;
    name: string;
    description: string;
    badgeColor: string;
  }[] = [
    {
      platform: 'UpSeller ERP (Conta 1)',
      name: 'UpSeller ERP — Conta 1 (Prefixo C1-)',
      description: 'Gera planilha padrão UpSeller com prefixo C1- para isolamento da primeira conta ERP.',
      badgeColor: 'text-indigo-400 bg-indigo-950/40 border-indigo-800/60',
    },
    {
      platform: 'UpSeller ERP (Conta 2)',
      name: 'UpSeller ERP — Conta 2 (Prefixo C2-)',
      description: 'Gera planilha padrão UpSeller com prefixo C2- para a segunda conta ERP, evitando duplicidade.',
      badgeColor: 'text-purple-400 bg-purple-950/40 border-purple-800/60',
    },
    {
      platform: 'Shopee',
      name: 'Catálogo Direto Shopee Brasil',
      description: 'Estrutura oficial com SKU, preço, estoque, dimensões em cm, peso em kg e URLs de imagens.',
      badgeColor: 'text-orange-400 bg-orange-950/40 border-orange-800/60',
    },
    {
      platform: 'TikTok Shop',
      name: 'Catálogo Direto TikTok Shop',
      description: 'Padrão com pesos em kg, dimensões da embalagem e fotos de capa para o Seller Center.',
      badgeColor: 'text-cyan-400 bg-cyan-950/40 border-cyan-800/60',
    },
    {
      platform: 'SHEIN',
      name: 'Catálogo Direto SHEIN Marketplace',
      description: 'Formato para vendedores locais com pesos convertidos em gramas (g) e especificações.',
      badgeColor: 'text-rose-400 bg-rose-950/40 border-rose-800/60',
    },
    {
      platform: 'UpSeller ERP',
      name: 'UpSeller ERP — Hub Unificado',
      description: 'Importação para centralização no UpSeller sem prefixos automáticos.',
      badgeColor: 'text-blue-400 bg-blue-950/40 border-blue-800/60',
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="rounded-2xl bg-[#071426] border border-[#0D2038] p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
            <FolderArchive className="w-3.5 h-3.5 text-indigo-400" />
            <span>Central de Arquivos Formatados</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Exportações para Shopee, TikTok, SHEIN e UpSeller
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            Baixe planilhas prontas para importação em massa nas suas 2 contas do UpSeller ou diretamente nos canais.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onNavigateToConversion}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition"
          >
            <Layers className="w-4 h-4" />
            <span>Ajustar Regras & Nova Conversão</span>
          </button>
        </div>
      </div>

      {/* 1. Quick Instant Downloads Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            Download Direto por Canal ({products.length} Produtos no Catálogo)
          </h2>
          <span className="text-xs text-slate-400">
            {readyCount} produtos com pesquisa/preço
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {defaultTemplates.map((item) => (
            <div
              key={item.platform}
              className="rounded-2xl bg-[#071426] border border-[#0D2038] p-5 flex flex-col justify-between hover:border-blue-500/40 transition shadow-md group"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-md border ${item.badgeColor}`}
                  >
                    {item.platform}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-300">
                    {products.length} itens
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white group-hover:text-blue-400 transition">
                  {item.name}
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {item.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#0D2038] flex items-center gap-2">
                <button
                  type="button"
                  id={`btn-download-${item.platform.toLowerCase().replace(/[^a-z0-9]/g, '-')}-xlsx`}
                  onClick={() => handleInstantDownload(item.platform, 'xlsx')}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-xs transition shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar (.xlsx)</span>
                </button>

                <button
                  type="button"
                  id={`btn-download-${item.platform.toLowerCase().replace(/[^a-z0-9]/g, '-')}-csv`}
                  onClick={() => handleInstantDownload(item.platform, 'csv')}
                  title="Baixar em formato CSV"
                  className="px-3 py-2 rounded-xl bg-[#0A1930] hover:bg-[#0D2038] text-slate-300 hover:text-white border border-[#0D2038] text-xs font-bold transition"
                >
                  .csv
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Generation History Section */}
      <div className="rounded-2xl bg-[#071426] border border-[#0D2038] p-6 shadow-md space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Histórico de Arquivos Processados na Sessão
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Lotes gerados durante a navegação
            </p>
          </div>

          {files.length > 0 && (
            <button
              type="button"
              onClick={onClearFiles}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition border border-transparent hover:border-rose-900/40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Histórico</span>
            </button>
          )}
        </div>

        {files.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <FileSpreadsheet className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-300">
              Nenhum lote gerado na sessão ainda.
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Você pode usar os botões acima para baixar imediatamente ou ir para a aba Conversão para gerar com regras personalizadas de margem e markup.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#0D2038] border border-[#0D2038] rounded-xl overflow-hidden">
            {files.map((file) => (
              <div
                key={file.id}
                className="p-3.5 bg-[#050B16]/50 flex items-center justify-between gap-4 hover:bg-[#0A1930]/60 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-[#0A1930] border border-[#0D2038] flex items-center justify-center text-blue-400 shrink-0">
                    {file.format === 'xlsx' ? (
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <FileText className="w-4 h-4 text-blue-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{file.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      <span className="font-semibold text-blue-300">{file.platform}</span>
                      <span>•</span>
                      <span>{file.productCount} produtos</span>
                      <span>•</span>
                      <span>{file.createdAt}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleInstantDownload(file.platform, file.format)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-bold border border-blue-500/40 transition shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
