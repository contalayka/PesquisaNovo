import React from 'react';
import { Package, Clock, CheckCircle2, AlertCircle, TrendingUp, Ban } from 'lucide-react';
import { ProductStatus } from '../types';

interface SummaryMetricsProps {
  totalCount?: number;
  statusCounts?: Record<ProductStatus, number>;
  onFilterStatus?: (status: 'all' | ProductStatus) => void;
  activeStatus?: 'all' | ProductStatus;
}

export const SummaryMetrics: React.FC<SummaryMetricsProps> = ({
  totalCount = 0,
  statusCounts,
  onFilterStatus,
  activeStatus = 'all',
}) => {
  const safeCounts: Record<ProductStatus, number> = statusCounts || {
    Pendente: 0,
    Encontrado: 0,
    Revisar: 0,
    Descartado: 0,
  };
  const completedCount = safeCounts.Encontrado || 0;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const cards = [
    {
      id: 'all' as const,
      label: 'Todos os Produtos',
      count: totalCount,
      icon: Package,
      color: 'text-slate-200',
      activeBorder: 'border-blue-500 bg-blue-950/20 text-blue-300',
    },
    {
      id: 'Pendente' as const,
      label: 'Pendentes',
      count: safeCounts.Pendente || 0,
      icon: Clock,
      color: 'text-amber-400',
      activeBorder: 'border-amber-500 bg-amber-950/25 text-amber-300',
    },
    {
      id: 'Encontrado' as const,
      label: 'Encontrados',
      count: safeCounts.Encontrado || 0,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      activeBorder: 'border-emerald-500 bg-emerald-950/25 text-emerald-300',
    },
    {
      id: 'Revisar' as const,
      label: 'Revisar',
      count: safeCounts.Revisar || 0,
      icon: AlertCircle,
      color: 'text-purple-400',
      activeBorder: 'border-purple-500 bg-purple-950/25 text-purple-300',
    },
    {
      id: 'Descartado' as const,
      label: 'Descartados',
      count: safeCounts.Descartado || 0,
      icon: Ban,
      color: 'text-slate-400',
      activeBorder: 'border-slate-500 bg-slate-800/40 text-slate-300',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {cards.map((item) => {
        const Icon = item.icon;
        const isActive = activeStatus === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onFilterStatus && onFilterStatus(item.id)}
            className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
              isActive
                ? `${item.activeBorder} shadow-xs`
                : 'border-slate-800 bg-[#121824] hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[11px] font-medium uppercase tracking-wider truncate">
                {item.label}
              </span>
              <Icon className={`w-3.5 h-3.5 ${item.color} shrink-0`} />
            </div>
            <p className={`text-xl font-bold ${item.color} mt-1.5 font-mono tabular-nums tracking-tight`}>
              {item.count}
            </p>
          </button>
        );
      })}

      {/* Progress Metric */}
      <div className="col-span-2 sm:col-span-1 p-3 rounded-lg border border-slate-800 bg-[#121824] flex flex-col justify-between">
        <div className="flex items-center justify-between text-slate-400">
          <span className="text-[11px] font-medium uppercase tracking-wider">
            Progresso
          </span>
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        </div>
        <div className="mt-1.5">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xl font-bold text-white font-mono tabular-nums tracking-tight">
              {progressPct}%
            </span>
            <span className="text-[10px] text-slate-400 font-mono tabular-nums">
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
