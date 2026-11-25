import React from 'react';
import {
  Package, CheckCircle2, Clock, AlertCircle, ArrowRight, UploadCloud,
  Calculator, Search, TrendingUp, CircleDashed
} from 'lucide-react';
import { Product, ProductStatus, getProductSku } from '../types';
import { formatCurrency, resolveImageUrl, isMissingOrInvalidProductImage } from '../utils/excel';
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
    slate: 'bg-[#252c36] text-slate-200 ring-[#3a4552]',
    green: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20',
    amber: 'bg-amber-400/10 text-amber-300 ring-amber-400/20',
    rose: 'bg-rose-400/10 text-rose-300 ring-rose-400/20',
  };

  return (
    <div className="mp-dashboard w-full max-w-[1680px] mx-auto space-y-5 pb-8 text-slate-100">
      <section className="relative isolate overflow-hidden rounded-2xl border border-[#343d49] bg-gradient-to-br from-[#202832] via-[#191f27] to-[#151a21] p-6 lg:p-8 shadow-[0_18px_50px_rgba(0,0,0,.18)]">
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-[#b7f34a]/[0.08] blur-3xl" />
        <div className="pointer-events-none absolute right-1/4 -bottom-36 h-64 w-64 rounded-full bg-sky-400/[0.045] blur-3xl" />
        <div className="relative flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-[#b7f34a]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#b7f34a] shadow-[0_0_10px_rgba(183,243,74,.7)]" />
              Central de operações
            </div>
            <h1 className="text-3xl lg:text-[36px] leading-tight font-bold tracking-[-.04em] text-[#f4f7fa]">Visão geral do catálogo</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#a3afbd]">Acompanhe a qualidade dos dados, avance nas pesquisas e prepare seus produtos para precificação e exportação.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {pending > 0 && onStartNextPending && (
              <button onClick={onStartNextPending} className="inline-flex items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/15 hover:border-amber-300/40">
                <Clock className="w-4 h-4"/> Continuar pesquisas
              </button>
            )}
            <button onClick={onNavigateToImport} className="inline-flex items-center gap-2 rounded-xl bg-[#b7f34a] px-4 py-3 text-sm font-bold text-[#151b0d] shadow-[0_8px_24px_rgba(183,243,74,.15)] transition hover:-translate-y-0.5 hover:bg-[#c5fa69]">
              <UploadCloud className="w-4 h-4"/> Importar catálogo
            </button>
          </div>
        </div>
        <div className="relative mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[0.07] pt-4 text-xs text-[#8996a5]">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400"/>{ready.toLocaleString('pt-BR')} encontrados</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400"/>{pending.toLocaleString('pt-BR')} aguardando pesquisa</span>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-400"/>{review.toLocaleString('pt-BR')} para revisar</span>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-3">
        {metrics.map(({label,value,detail,icon:Icon,tone:color,action}, index) => (
          <button key={label} onClick={action} className="group relative overflow-hidden text-left rounded-2xl border border-[#303945] bg-[#191f27] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[#596575] hover:bg-[#1d252e] hover:shadow-[0_14px_34px_rgba(0,0,0,.2)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"/>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-[#aab5c2]">{label}</span>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${tone[color]}`}><Icon className="w-[18px] h-[18px]"/></span>
            </div>
            <div className="mt-5 text-[34px] leading-none font-bold tracking-[-.04em] tabular-nums text-[#f3f6f9]">{value.toLocaleString('pt-BR')}</div>
            <div className="mt-2 text-xs text-[#8491a0]">{detail}</div>
            <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-[#b7f34a] opacity-0 group-hover:opacity-100 transition-opacity">Abrir lista <ArrowRight className="w-3.5 h-3.5"/></div>
            <span className={`pointer-events-none absolute -bottom-10 -right-8 h-24 w-24 rounded-full blur-2xl opacity-[.06] ${index===1?'bg-emerald-400':index===2?'bg-amber-400':index===3?'bg-rose-400':'bg-slate-300'}`}/>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.85fr)] gap-3">
        <div className="rounded-2xl border border-[#303945] bg-[#191f27] p-5 lg:p-6 shadow-[0_8px_26px_rgba(0,0,0,.12)]">
          <div className="flex items-start justify-between gap-4">
            <div><div className="text-[11px] font-bold uppercase tracking-[.14em] text-[#8794a3]">Desempenho do catálogo</div><h2 className="mt-1 text-lg font-bold text-[#f0f4f7]">Progresso de preparação</h2><p className="mt-1 text-xs text-[#8794a3]">Distribuição dos produtos por etapa de pesquisa</p></div>
            <span className="shrink-0 rounded-xl border border-[#b7f34a]/20 bg-[#b7f34a]/10 px-3 py-2 text-sm font-bold text-[#c9f58b] tabular-nums">{percent}% <span className="font-medium text-[#a8c77c]">concluído</span></span>
          </div>
          <div className="mt-7 h-3 overflow-hidden rounded-full bg-[#2a323d] flex ring-1 ring-white/[0.04]">
            <div className="h-full bg-emerald-400 transition-all" style={{width:`${total ? ready/total*100 : 0}%`}}/>
            <div className="h-full bg-amber-400" style={{width:`${total ? pending/total*100 : 0}%`}}/>
            <div className="h-full bg-rose-400" style={{width:`${total ? review/total*100 : 0}%`}}/>
            <div className="h-full bg-slate-500" style={{width:`${total ? discarded/total*100 : 0}%`}}/>
          </div>
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {name:'Encontrados',count:ready,color:'bg-emerald-400',filter:'Encontrado' as ProductStatus, value:'text-emerald-300'},
              {name:'Pendentes',count:pending,color:'bg-amber-400',filter:'Pendente' as ProductStatus, value:'text-amber-300'},
              {name:'Revisar',count:review,color:'bg-rose-400',filter:'Revisar' as ProductStatus, value:'text-rose-300'},
              {name:'Descartados',count:discarded,color:'bg-slate-500',filter:'Descartado' as ProductStatus, value:'text-slate-300'},
            ].map(item=><button key={item.name} onClick={()=>onNavigateToProducts(item.filter)} className="text-left group rounded-xl p-2 -ml-2 transition hover:bg-white/[0.035]"><div className="flex items-center gap-2 text-xs text-[#9aa6b4]"><span className={`h-2 w-2 rounded-full ${item.color}`}/>{item.name}</div><div className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${item.value}`}>{item.count.toLocaleString('pt-BR')}</div></button>)}
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-[#39434f] bg-gradient-to-br from-[#202b35] via-[#19222c] to-[#151b23] p-5 lg:p-6 shadow-[0_8px_26px_rgba(0,0,0,.16)] flex flex-col justify-between">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-400/[0.08] blur-3xl"/>
          <div className="relative">
            <div className="flex items-center gap-2 text-[#9fd7ed] text-[11px] font-bold uppercase tracking-[.15em]"><TrendingUp className="w-4 h-4"/> Próxima ação</div>
            <h2 className="mt-5 text-xl font-bold tracking-tight text-[#f2f6f9]">Avance no catálogo</h2>
            <p className="mt-2 text-sm leading-6 text-[#a2afbd]">Conclua as pesquisas pendentes para liberar mais produtos para precificação e exportação.</p>
          </div>
          <button onClick={onStartNextPending || (()=>onNavigateToProducts('Pendente'))} className="relative mt-7 inline-flex w-fit items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.07] px-4 py-3 text-sm font-semibold text-[#edf3f8] transition hover:bg-white/[0.12]">Abrir pendências <ArrowRight className="w-4 h-4 text-[#b7f34a]"/></button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#303945] bg-[#191f27] shadow-[0_8px_26px_rgba(0,0,0,.12)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#303945] px-5 py-5">
          <div><div className="text-[11px] font-bold uppercase tracking-[.14em] text-[#8794a3]">Atualizações do catálogo</div><h2 className="mt-1 text-lg font-bold text-[#f0f4f7]">Produtos recentes</h2><p className="mt-1 text-xs text-[#8794a3]">Últimos itens com imagem disponível no catálogo</p></div>
          <button onClick={()=>onNavigateToProducts('all')} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[#b7f34a] transition hover:bg-[#b7f34a]/[0.08]">Ver catálogo completo <ArrowRight className="w-4 h-4"/></button>
        </div>
        {recent.length === 0 ? <div className="p-12 text-center"><CircleDashed className="mx-auto h-8 w-8 text-slate-500"/><p className="mt-3 text-sm text-[#9aa6b4]">Nenhum produto com imagem disponível para exibir.</p></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[#202731] text-[10px] uppercase tracking-[.12em] text-[#8f9baa]"><tr><th className="px-5 py-3.5 font-semibold">Produto</th><th className="px-4 py-3.5 font-semibold">SKU</th><th className="px-4 py-3.5 font-semibold">Custo</th><th className="px-4 py-3.5 font-semibold">Status</th><th className="px-5 py-3.5 text-right font-semibold">Ação</th></tr></thead>
            <tbody className="divide-y divide-[#303945]">
              {recent.map(product=><tr key={product.id} className="transition-colors hover:bg-white/[0.025]">
                <td className="px-5 py-3"><div className="flex items-center gap-3 min-w-0"><div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[#3a4552] bg-[#252d37] p-1"><ProductImage src={resolveImageUrl(product.image,product.rawColumns as Record<string,unknown>|undefined,product.name)} alt={product.name} className="h-full w-full object-contain"/></div><span className="max-w-[420px] truncate font-semibold text-[#e6ecf2]">{product.name}</span></div></td>
                <td className="px-4 py-3 text-xs font-mono text-[#94a1af]">{getProductSku(product)}</td>
                <td className="px-4 py-3 font-semibold tabular-nums text-[#dce4eb]">{formatCurrency(product.cost)}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${product.status==='Encontrado'?'border-emerald-400/20 bg-emerald-400/10 text-emerald-300':product.status==='Revisar'?'border-rose-400/20 bg-rose-400/10 text-rose-300':product.status==='Descartado'?'border-slate-500/20 bg-slate-500/10 text-slate-300':'border-amber-400/20 bg-amber-400/10 text-amber-300'}`}>{product.status || 'Pendente'}</span></td>
                <td className="px-5 py-3 text-right"><div className="inline-flex items-center gap-2"><button onClick={()=>onOpenResearch(product)} className="rounded-lg bg-[#b7f34a] px-3 py-2 text-xs font-bold text-[#151b0d] transition hover:bg-[#c5fa69]"><Search className="mr-1 inline h-3 w-3"/>Pesquisar</button><button onClick={()=>onOpenSimulator(product)} title="Simular preço" className="rounded-lg border border-[#3a4552] bg-[#252d37] p-2 text-[#aeb9c5] transition hover:border-[#657384] hover:text-white"><Calculator className="h-4 w-4"/></button></div></td>
              </tr>)}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
};
