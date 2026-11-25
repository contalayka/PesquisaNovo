import React from 'react';
import {
  Package, CheckCircle2, Clock, AlertCircle, ArrowRight, UploadCloud,
  Calculator, Search, TrendingUp, CircleDashed
} from 'lucide-react';
import { Product, ProductStatus, getProductSku } from '../types';
import { formatCurrency, parseNumericCost, resolveImageUrl, isMissingOrInvalidProductImage } from '../utils/excel';
import { ProductImage } from './ProductImage';

interface DashboardViewProps {
  products: Product[];
  statusCounts?: { Pendente: number; Encontrado: number; Revisar: number; Descartado: number };
  totalCount?: number;
  onNavigateToImport: () => void;
  onNavigateToProducts: (filterStatus?: ProductStatus | 'all') => void;
  onNavigateToReports?: () => void;
  onOpenResearch: (product: Product) => void;
  onOpenSimulator: (product: Product) => void;
  onStartNextPending?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  products = [], statusCounts, totalCount, onNavigateToImport,
  onNavigateToProducts, onOpenResearch, onOpenSimulator, onStartNextPending,
}) => {
  const counts = statusCounts || {
    Pendente: products.filter(p => p.status === 'Pendente').length,
    Encontrado: products.filter(p => p.status === 'Encontrado').length,
    Revisar: products.filter(p => p.status === 'Revisar').length,
    Descartado: products.filter(p => p.status === 'Descartado').length,
  };
  const total = totalCount ?? products.length;
  const ready = counts.Encontrado || 0;
  const pending = counts.Pendente || 0;
  const review = counts.Revisar || 0;
  const discarded = counts.Descartado || 0;
  const percent = total > 0 ? Math.round((ready / total) * 100) : 0;
  const visibleProducts = products.filter(p => {
    const src = resolveImageUrl(p.image, p.rawColumns as Record<string, unknown> | undefined, p.name);
    return !isMissingOrInvalidProductImage(src);
  });
  const recent = visibleProducts.slice(0, 6);
  const metrics = [
    { label: 'Produtos cadastrados', value: total, detail: 'Registros no catálogo', icon: Package, tone: 'slate', action: () => onNavigateToProducts('all') },
    { label: 'Prontos para venda', value: ready, detail: total ? `${percent}% do catálogo` : 'Sem produtos', icon: CheckCircle2, tone: 'green', action: () => onNavigateToProducts('Encontrado') },
    { label: 'Pesquisas pendentes', value: pending, detail: 'Aguardando validação', icon: Clock, tone: 'amber', action: () => onNavigateToProducts('Pendente') },
    { label: 'Precisam de revisão', value: review, detail: 'Preço ou link para conferir', icon: AlertCircle, tone: 'rose', action: () => onNavigateToProducts('Revisar') },
  ];
  const tone: Record<string, string> = {
    slate: 'text-slate-600 bg-slate-100',
    green: 'text-emerald-700 bg-emerald-50',
    amber: 'text-amber-700 bg-amber-50',
    rose: 'text-rose-700 bg-rose-50',
  };

  return (
    <div className="mp-dashboard w-full max-w-[1600px] mx-auto space-y-6 pb-8">
      <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 lg:p-7">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold tracking-[.14em] uppercase text-blue-700 mb-2">Central de operações</div>
            <h1 className="text-2xl lg:text-[30px] leading-tight font-bold tracking-tight text-slate-950">Visão geral do catálogo</h1>
            <p className="mt-2 text-sm text-slate-500">Acompanhe a qualidade dos dados, avance nas pesquisas e prepare seus produtos para precificação e exportação.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pending > 0 && onStartNextPending && <button onClick={onStartNextPending} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"><Clock className="w-4 h-4"/> Continuar pesquisas</button>}
            <button onClick={onNavigateToImport} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"><UploadCloud className="w-4 h-4"/> Importar catálogo</button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
        {metrics.map(({label,value,detail,icon:Icon,tone:color,action}) => (
          <button key={label} onClick={action} className="group text-left rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-slate-500">{label}</span>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone[color]}`}><Icon className="w-5 h-5"/></span>
            </div>
            <div className="mt-4 text-[32px] leading-none font-bold tracking-tight tabular-nums text-slate-950">{value.toLocaleString('pt-BR')}</div>
            <div className="mt-2 text-xs text-slate-500">{detail}</div>
            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity">Abrir lista <ArrowRight className="w-3.5 h-3.5"/></div>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.85fr)] gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="text-base font-bold text-slate-900">Progresso de preparação</h2><p className="mt-1 text-xs text-slate-500">Distribuição dos produtos por etapa de pesquisa</p></div>
            <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-800 tabular-nums">{percent}% concluído</span>
          </div>
          <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100 flex">
            <div className="h-full bg-emerald-500 transition-all" style={{width:`${total ? ready/total*100 : 0}%`}}/>
            <div className="h-full bg-amber-400" style={{width:`${total ? pending/total*100 : 0}%`}}/>
            <div className="h-full bg-rose-400" style={{width:`${total ? review/total*100 : 0}%`}}/>
            <div className="h-full bg-slate-400" style={{width:`${total ? discarded/total*100 : 0}%`}}/>
          </div>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {name:'Encontrados',count:ready,color:'bg-emerald-500',filter:'Encontrado' as ProductStatus},
              {name:'Pendentes',count:pending,color:'bg-amber-400',filter:'Pendente' as ProductStatus},
              {name:'Revisar',count:review,color:'bg-rose-400',filter:'Revisar' as ProductStatus},
              {name:'Descartados',count:discarded,color:'bg-slate-400',filter:'Descartado' as ProductStatus},
            ].map(item=><button key={item.name} onClick={()=>onNavigateToProducts(item.filter)} className="text-left group"><div className="flex items-center gap-2 text-xs text-slate-500"><span className={`h-2.5 w-2.5 rounded-full ${item.color}`}/>{item.name}</div><div className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{item.count}</div></button>)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-950 p-5 lg:p-6 text-white shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold uppercase tracking-wider"><TrendingUp className="w-4 h-4"/> Próxima ação</div>
            <h2 className="mt-4 text-xl font-bold">Avance no catálogo</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">Conclua as pesquisas pendentes para liberar mais produtos para precificação e exportação.</p>
          </div>
          <button onClick={onStartNextPending || (()=>onNavigateToProducts('Pendente'))} className="mt-6 inline-flex w-fit items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-blue-50">Abrir pendências <ArrowRight className="w-4 h-4"/></button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div><h2 className="text-base font-bold text-slate-900">Produtos recentes</h2><p className="mt-1 text-xs text-slate-500">Últimos itens com imagem disponível no catálogo</p></div>
          <button onClick={()=>onNavigateToProducts('all')} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900">Ver catálogo completo <ArrowRight className="w-4 h-4"/></button>
        </div>
        {recent.length === 0 ? <div className="p-10 text-center"><CircleDashed className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-sm text-slate-500">Nenhum produto com imagem disponível para exibir.</p></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Produto</th><th className="px-4 py-3 font-semibold">SKU</th><th className="px-4 py-3 font-semibold">Custo</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Ação</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {recent.map(product=><tr key={product.id} className="hover:bg-slate-50/80">
                <td className="px-5 py-3"><div className="flex items-center gap-3 min-w-0"><div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><ProductImage src={resolveImageUrl(product.image,product.rawColumns as Record<string,unknown>|undefined,product.name)} alt={product.name} className="h-full w-full object-contain"/></div><span className="max-w-[360px] truncate font-semibold text-slate-800">{product.name}</span></div></td>
                <td className="px-4 py-3 text-xs text-slate-500">{getProductSku(product)}</td>
                <td className="px-4 py-3 font-semibold tabular-nums text-slate-800">{formatCurrency(product.cost)}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${product.status==='Encontrado'?'bg-emerald-50 text-emerald-700':product.status==='Revisar'?'bg-rose-50 text-rose-700':product.status==='Descartado'?'bg-slate-100 text-slate-600':'bg-amber-50 text-amber-700'}`}>{product.status || 'Pendente'}</span></td>
                <td className="px-5 py-3 text-right"><div className="inline-flex items-center gap-2"><button onClick={()=>onOpenResearch(product)} className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"><Search className="mr-1 inline h-3 w-3"/>Pesquisar</button><button onClick={()=>onOpenSimulator(product)} title="Simular preço" className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"><Calculator className="h-4 w-4"/></button></div></td>
              </tr>)}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
};
