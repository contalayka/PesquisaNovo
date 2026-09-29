import React from 'react';
import {
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  UploadCloud,
  ChevronRight,
  Calculator,
  Layers,
  Store,
  FileSpreadsheet,
} from 'lucide-react';
import { Product, ProductStatus, getProductSku } from '../types';
import { formatCurrency } from '../utils/excel';

interface DashboardViewProps {
  products: Product[];
  statusCounts?: { Pendente: number; Encontrado: number; Revisar: number; Descartado: number };
  totalCount?: number;
  onNavigateToImport: () => void;
  onNavigateToProducts: (filterStatus?: ProductStatus | 'all') => void;
  onNavigateToConversion: () => void;
  onOpenResearch: (product: Product) => void;
  onOpenSimulator: (product: Product) => void;
  onStartNextPending?: () => void;
}

const marketplaces = [
  { name: 'Shopee', platform: 'Shopee' },
  { name: 'UpSeller ERP (2 Contas)', platform: 'UpSeller ERP' },
  { name: 'TikTok Shop', platform: 'TikTok Shop' },
  { name: 'SHEIN', platform: 'SHEIN' },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  products = [],
  statusCounts,
  totalCount,
  onNavigateToImport,
  onNavigateToProducts,
  onNavigateToConversion,
  onOpenResearch,
  onOpenSimulator,
  onStartNextPending,
}) => {
  const counts = statusCounts || {
    Pendente: products.filter((p) => p.status === 'Pendente').length,
    Encontrado: products.filter((p) => p.status === 'Encontrado').length,
    Revisar: products.filter((p) => p.status === 'Revisar').length,
    Descartado: products.filter((p) => p.status === 'Descartado').length,
  };
  const total = totalCount ?? products.length;
  const ready = counts.Encontrado || 0;
  const pending = counts.Pendente || 0;
  const review = counts.Revisar || 0;
  const discarded = counts.Descartado || 0;
  const percent = total > 0 ? Math.round((ready / total) * 100) : 0;
  const recent = products.slice(0, 6);

  return (
    <div className="w-full space-y-4 pb-6">
      {/* 1. Header / Action Bar */}
      <section className="bg-[#121824] border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Painel Geral do Catálogo
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {total} produtos cadastrados · {ready} prontos para exportação e precificação.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pending > 0 && onStartNextPending && (
            <button
              type="button"
              onClick={onStartNextPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition"
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Pesquisar Pendentes ({pending})</span>
            </button>
          )}
          <button
            type="button"
            onClick={onNavigateToImport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-semibold text-white transition shadow-xs"
          >
            <UploadCloud className="h-4 w-4" />
            <span>Importar Planilha</span>
          </button>
        </div>
      </section>

      {/* 2. Key Metrics Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total */}
        <button
          type="button"
          onClick={() => onNavigateToProducts('all')}
          className="text-left rounded-xl border border-slate-800 bg-[#121824] p-4 hover:border-slate-700 transition"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Total de Produtos</span>
            <Package className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono tabular-nums">
            {total}
          </div>
          <span className="mt-1 block text-[11px] text-slate-500">
            Base ativa no sistema
          </span>
        </button>

        {/* Prontos */}
        <button
          type="button"
          onClick={() => onNavigateToProducts('Encontrado')}
          className="text-left rounded-xl border border-slate-800 bg-[#121824] p-4 hover:border-emerald-800/60 transition"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Prontos / Encontrados</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400 font-mono tabular-nums">
            {ready}
          </div>
          <span className="mt-1 block text-[11px] text-emerald-500/90 font-mono tabular-nums">
            {percent}% do catálogo
          </span>
        </button>

        {/* Pendentes */}
        <button
          type="button"
          onClick={() => onNavigateToProducts('Pendente')}
          className="text-left rounded-xl border border-slate-800 bg-[#121824] p-4 hover:border-amber-800/60 transition"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Pesquisas Pendentes</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-400 font-mono tabular-nums">
            {pending}
          </div>
          <span className="mt-1 block text-[11px] text-slate-500">
            Aguardando validação
          </span>
        </button>

        {/* Revisar */}
        <button
          type="button"
          onClick={() => onNavigateToProducts('Revisar')}
          className="text-left rounded-xl border border-slate-800 bg-[#121824] p-4 hover:border-rose-800/60 transition"
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Para Revisar</span>
            <AlertCircle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-400 font-mono tabular-nums">
            {review}
          </div>
          <span className="mt-1 block text-[11px] text-slate-500">
            Preço ou link duvidoso
          </span>
        </button>
      </section>

      {/* 3. Main Workspace Grid: Progress + Recent Products + Quick Conversion */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Progress & Table */}
        <div className="lg:col-span-2 space-y-4">
          {/* Progress Strip (Compact & Clean) */}
          <div className="rounded-xl border border-slate-800 bg-[#121824] p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Status de Conclusão do Catálogo
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {ready} de {total} itens prontos para precificação
                </p>
              </div>
              <span className="text-sm font-bold text-slate-200 font-mono tabular-nums">
                {percent}%
              </span>
            </div>

            {/* Compact Linear Progress */}
            <div className="mt-2.5 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs font-mono tabular-nums border-t border-slate-800/80 pt-2.5">
              <div>
                <span className="block text-[10px] text-slate-500 uppercase">Encontrados</span>
                <span className="font-semibold text-emerald-400">{ready}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase">Pendentes</span>
                <span className="font-semibold text-amber-400">{pending}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase">Revisar</span>
                <span className="font-semibold text-purple-400">{review}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase">Descartados</span>
                <span className="font-semibold text-slate-400">{discarded}</span>
              </div>
            </div>
          </div>

          {/* Recent Products Data Table */}
          <div className="rounded-xl border border-slate-800 bg-[#121824] overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Produtos Recentes
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Amostra dos últimos produtos adicionados
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToProducts('all')}
                className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <span>Ver todos</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {recent.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Nenhum produto cadastrado no momento.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0e1320] text-[10px] uppercase font-semibold text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Produto</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Custo</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {recent.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5 min-w-0 max-w-xs">
                            <div className="w-8 h-8 rounded bg-slate-900 border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center">
                              {p.image ? (
                                <img
                                  src={p.image}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <Package className="w-4 h-4 text-slate-600" />
                              )}
                            </div>
                            <span
                              onClick={() => onOpenResearch(p)}
                              className="font-medium text-slate-200 hover:text-blue-400 cursor-pointer truncate"
                              title={p.name}
                            >
                              {p.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                          {getProductSku(p)}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-300 font-semibold whitespace-nowrap">
                          {formatCurrency(p.cost)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${
                              p.status === 'Encontrado'
                                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                                : p.status === 'Revisar'
                                ? 'bg-purple-950/40 text-purple-300 border-purple-800/60'
                                : p.status === 'Descartado'
                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                : 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onOpenResearch(p)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300"
                          >
                            <span>Pesquisar</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Quick Actions & Channels */}
        <div className="space-y-4">
          {/* Quick Conversion Card */}
          <div className="rounded-xl border border-slate-800 bg-[#121824] p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Canais de Venda Suportados
                </span>
                <Layers className="h-4 w-4 text-slate-400" />
              </div>

              <div className="mt-3 space-y-2">
                {marketplaces.map((m) => (
                  <div
                    key={m.name}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Store className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-medium text-slate-200">{m.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Exportação XLSX/CSV
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onNavigateToConversion}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 py-2.5 text-xs font-semibold text-white transition"
            >
              <span>Gerar Arquivos de Carga</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Catalog Summary Card */}
          <div className="rounded-xl border border-slate-800 bg-[#121824] p-4 text-xs space-y-3">
            <h3 className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
              Resumo Operacional
            </h3>
            <div className="space-y-2 text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Total cadastrado</span>
                <span className="font-mono tabular-nums font-semibold">{total}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Com pesquisa de preço</span>
                <span className="font-mono tabular-nums font-semibold text-emerald-400">
                  {ready}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Pendentes de pesquisa</span>
                <span className="font-mono tabular-nums font-semibold text-amber-400">
                  {pending}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
