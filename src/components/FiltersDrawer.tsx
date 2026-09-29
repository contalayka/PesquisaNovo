import React from 'react';
import { ProductStatus } from '../types';
import { X, Filter, RotateCcw, Check, PlusCircle, DollarSign, Tag, CheckCircle2 } from 'lucide-react';

export interface AdvancedFiltersState {
  status: 'all' | ProductStatus;
  platform: string;
  minCost: string;
  maxCost: string;
  onlyNew: boolean;
  onlyWithRecords: boolean;
  onlyAvailable: boolean;
}

interface FiltersDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: AdvancedFiltersState;
  onChangeFilters: (filters: AdvancedFiltersState) => void;
  onResetFilters: () => void;
  totalFilteredCount: number;
  totalCount: number;
  availablePlatforms: string[];
}

export const FiltersDrawer: React.FC<FiltersDrawerProps> = ({
  isOpen,
  onClose,
  filters,
  onChangeFilters,
  onResetFilters,
  totalFilteredCount,
  totalCount,
  availablePlatforms,
}) => {
  if (!isOpen) return null;

  const platforms = ['all', ...availablePlatforms.filter((p) => p && p !== 'all')];

  const handleStatusChange = (status: 'all' | ProductStatus) => {
    onChangeFilters({ ...filters, status });
  };

  const handlePlatformChange = (platform: string) => {
    onChangeFilters({ ...filters, platform });
  };

  const handleCostChange = (key: 'minCost' | 'maxCost', value: string) => {
    onChangeFilters({ ...filters, [key]: value });
  };

  const handleToggle = (key: 'onlyNew' | 'onlyWithRecords' | 'onlyAvailable') => {
    onChangeFilters({ ...filters, [key]: !filters[key] });
  };

  const activeCount = [
    filters.status !== 'all',
    filters.platform !== 'all',
    filters.minCost !== '',
    filters.maxCost !== '',
    filters.onlyNew,
    filters.onlyWithRecords,
    filters.onlyAvailable,
  ].filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-md bg-[#0F172A] border-l border-slate-800 text-slate-100 h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 px-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-[#0B0F19]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Filtros Avançados</h2>
              <p className="text-[11px] text-slate-400">
                Refine a lista por múltiplos critérios
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Fechar filtros"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Status Section */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Status do Produto</span>
              {filters.status !== 'all' && (
                <button
                  type="button"
                  onClick={() => handleStatusChange('all')}
                  className="text-[11px] text-indigo-400 hover:underline capitalize"
                >
                  Limpar
                </button>
              )}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'all', label: 'Todos os Status' },
                { id: 'Pendente', label: 'Pendentes' },
                { id: 'Encontrado', label: 'Encontrados' },
                { id: 'Revisar', label: 'Para Revisar' },
                { id: 'Descartado', label: 'Descartados' },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => handleStatusChange(st.id as any)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold text-left border transition ${
                    filters.status === st.id
                      ? 'bg-indigo-600 border-indigo-500 text-white font-bold'
                      : 'bg-[#121824] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Platform Filter */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Plataforma do Anúncio</span>
              {filters.platform !== 'all' && (
                <button
                  type="button"
                  onClick={() => handlePlatformChange('all')}
                  className="text-[11px] text-indigo-400 hover:underline capitalize"
                >
                  Limpar
                </button>
              )}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {platforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePlatformChange(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    filters.platform === p
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-[#121824] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {p === 'all' ? 'Todas' : p}
                </button>
              ))}
            </div>
          </div>

          {/* Cost Range Filter */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-slate-500" />
              <span>Faixa de Custo de Tabela (R$)</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Mínimo</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">R$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={filters.minCost}
                    onChange={(e) => handleCostChange('minCost', e.target.value)}
                    placeholder="0,00"
                    className="w-full bg-[#121824] border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 mb-1 block">Máximo</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">R$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={filters.maxCost}
                    onChange={(e) => handleCostChange('maxCost', e.target.value)}
                    placeholder="Sem limite"
                    className="w-full bg-[#121824] border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 tabular-nums"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Checkbox Toggles */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Outros Critérios
            </label>

            {/* Only New */}
            <label className="flex items-center gap-3 p-3 rounded-lg bg-[#121824] border border-slate-800 cursor-pointer hover:border-slate-700 transition select-none">
              <input
                type="checkbox"
                checked={filters.onlyNew}
                onChange={() => handleToggle('onlyNew')}
                className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <PlusCircle className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Apenas Produtos Novos</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Itens adicionados na última importação ou cadastro
                </p>
              </div>
            </label>

            {/* Only with Records */}
            <label className="flex items-center gap-3 p-3 rounded-lg bg-[#121824] border border-slate-800 cursor-pointer hover:border-slate-700 transition select-none">
              <input
                type="checkbox"
                checked={filters.onlyWithRecords}
                onChange={() => handleToggle('onlyWithRecords')}
                className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <Tag className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Apenas com Anúncios Salvos</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Produtos que já possuem links concorrentes vinculados
                </p>
              </div>
            </label>

            {/* Only Available */}
            <label className="flex items-center gap-3 p-3 rounded-lg bg-[#121824] border border-slate-800 cursor-pointer hover:border-slate-700 transition select-none">
              <input
                type="checkbox"
                checked={filters.onlyAvailable}
                onChange={() => handleToggle('onlyAvailable')}
                className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Apenas Disponíveis em Estoque</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Oculta produtos marcados como indisponíveis
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 px-5 border-t border-slate-800 bg-[#0B0F19] flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onResetFilters}
            disabled={activeCount === 0}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpar Tudo</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>
              Ver {totalFilteredCount} {totalFilteredCount === 1 ? 'Produto' : 'Produtos'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
