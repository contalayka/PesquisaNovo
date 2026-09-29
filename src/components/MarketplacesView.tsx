import React from 'react';
import {
  Store,
  ExternalLink,
  Layers,
  Percent,
  Download,
} from 'lucide-react';
import { Product, MarketplacePlatform } from '../types';
import { exportMarketplaceTemplate } from '../utils/marketplaceExport';

interface MarketplacesViewProps {
  products: Product[];
  onNavigateToConversion: () => void;
}

export const MarketplacesView: React.FC<MarketplacesViewProps> = ({
  products,
  onNavigateToConversion,
}) => {
  const totalCount = products.length;

  const marketplaces: {
    id: MarketplacePlatform;
    name: string;
    type: string;
    badgeColor: string;
    commission: string;
    imageSpecs: string;
    shippingRules: string;
    tips: string;
    url: string;
  }[] = [
    {
      id: 'UpSeller ERP',
      name: 'UpSeller ERP (Multi-Lojas & 2 Contas)',
      type: 'Hub ERP Multi-Contas',
      badgeColor: 'text-indigo-300 bg-indigo-950/40 border-indigo-800/60',
      commission: 'Sem comissões sobre vendas no ERP; plano freemium com sincronização de anúncios e controle de estoque centralizado.',
      imageSpecs: 'URLs de imagens públicas importadas e transferidas automaticamente para todas as lojas conectadas.',
      shippingRules: 'Integração direta com etiquetas de envio da Shopee, TikTok Shop e SHEIN em painel consolidado.',
      tips: 'Crie duas contas no UpSeller ou use identificadores de prefixo (ex: C1- e C2-) para separar catálogos e evitar duplicação ou suspensão por lojas espelho.',
      url: 'https://www.upseller.com/',
    },
    {
      id: 'Shopee',
      name: 'Shopee Brasil',
      type: 'Marketplace Geral',
      badgeColor: 'text-orange-300 bg-orange-950/40 border-orange-800/60',
      commission: '14% + R$ 4,00 fixo por item vendido (ou 20% no Programa Frete Grátis Extra).',
      imageSpecs: 'Mínimo 500×500px, proporção 1:1, boa iluminação, capa nítida e fotos adicionais de detalhes.',
      shippingRules: 'Peso em kg e dimensões da embalagem obrigatórias no momento da publicação.',
      tips: 'Títulos de até 120 caracteres com palavras-chave diretas; utilize o UpSeller para replicar anúncios com 1 clique.',
      url: 'https://seller.shopee.com.br/',
    },
    {
      id: 'TikTok Shop',
      name: 'TikTok Shop Brasil',
      type: 'Social Commerce',
      badgeColor: 'text-cyan-300 bg-cyan-950/40 border-cyan-800/60',
      commission: 'Taxa competitiva de marketplace + taxa de processamento financeiro.',
      imageSpecs: 'Fotos quadradas 800×800px, visual atrativo para catálogo e formato para vitrine de vídeos/lives.',
      shippingRules: 'Envio pelo operador logístico integrado da plataforma (Seller Center).',
      tips: 'Excelente para utilidades inovadoras, decoração, utilidades domésticas e produtos com apelo visual.',
      url: 'https://seller-br.tiktok.com/',
    },
    {
      id: 'SHEIN',
      name: 'SHEIN Marketplace Brasil',
      type: 'Marketplace Varejo',
      badgeColor: 'text-rose-300 bg-rose-950/40 border-rose-800/60',
      commission: 'Aproximadamente 10% a 14% com suporte a tráfego orgânico nacional.',
      imageSpecs: 'Mínimo 800×800px, fundo limpo e composição estética refinada.',
      shippingRules: 'Obrigatoriamente informar peso em gramas (g) na planilha de carga.',
      tips: 'Decoração e itens para a casa têm alta taxa de conversão na SHEIN Brasil.',
      url: 'https://seller.shein.com/',
    },
  ];

  const handleInstantExport = (platform: MarketplacePlatform) => {
    exportMarketplaceTemplate(products, {
      platform,
      format: 'xlsx',
      onlyReady: false,
    });
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-10">
      {/* 1. Header */}
      <div className="rounded-xl bg-[#121824] border border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <Store className="w-3.5 h-3.5 text-blue-400" />
            <span>Guia de Integração & Canais</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Canais de Venda & Integração ERP
          </h1>
          <p className="text-xs text-slate-400">
            Regras de comissão, especificações de fotos e instruções de importação para suas 2 contas e 3 canais de e-commerce.
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateToConversion}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shrink-0 shadow-xs"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Exportar Planilhas de Carga</span>
        </button>
      </div>

      {/* 2. Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {marketplaces.map((m) => (
          <div
            key={m.id}
            className="rounded-xl bg-[#121824] border border-slate-800 p-5 flex flex-col justify-between space-y-4 hover:border-slate-700 transition"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{m.name}</h3>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${m.badgeColor}`}>
                    {m.type}
                  </span>
                </div>

                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  title="Abrir portal oficial"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Commission Rule */}
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Percent className="w-3.5 h-3.5 text-blue-400" />
                  <span>Comissão e Tarifas:</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed pl-5">
                  {m.commission}
                </p>
              </div>

              {/* Requirements */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-300">Requisitos de Imagens:</span>
                  <p className="text-slate-400 mt-0.5">{m.imageSpecs}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-300">Regras de Embalagem & Envio:</span>
                  <p className="text-slate-400 mt-0.5">{m.shippingRules}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-300">Dica de Performance:</span>
                  <p className="text-slate-400 mt-0.5">{m.tips}</p>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Catálogo preparado: <strong className="text-white font-mono tabular-nums">{totalCount}</strong> produtos
              </span>
              <button
                type="button"
                onClick={() => handleInstantExport(m.id)}
                className="inline-flex items-center gap-1.5 font-medium text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Baixar Modelo ({m.id})</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
