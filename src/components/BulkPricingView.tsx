import React, { useMemo, useState } from 'react';
import { Product } from '../types';
import { formatCurrency, parseNumericCost } from '../utils/excel';
import { Search, SlidersHorizontal, AlertTriangle, Calculator } from 'lucide-react';

type Channel = 'Shopee' | 'Mercado Livre' | 'TikTok Shop' | 'SHEIN';
type Rule = { rate: number; fixed: number; shipping: number };
const DEFAULTS: Record<Channel, Rule> = {
  'Shopee': { rate: 20, fixed: 4.5, shipping: 0 },
  'Mercado Livre': { rate: 13, fixed: 0, shipping: 0 },
  'TikTok Shop': { rate: 16, fixed: 4, shipping: 0 },
  'SHEIN': { rate: 18, fixed: 0, shipping: 0 },
};
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const BulkPricingView: React.FC<{ products: Product[] }> = ({ products }) => {
  const [channel, setChannel] = useState<'Todas' | Channel>('Todas');
  const [query, setQuery] = useState('');
  const [margin, setMargin] = useState(20);
  const [rules, setRules] = useState(DEFAULTS);
  const [showSettings, setShowSettings] = useState(false);
  const [onlyAvailable, setOnlyAvailable] = useState(true);

  const rows = useMemo(() => products
    .filter(p => p.name && (!onlyAvailable || p.available))
    .filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
    .map(p => {
      const cost = parseNumericCost(p.cost);
      const results = (Object.keys(rules) as Channel[]).map(name => {
        const r = rules[name];
        const valid = cost !== null && cost > 0 && (1 - r.rate / 100 - margin / 100) > 0;
        const price = valid ? (cost! + r.fixed + r.shipping) / (1 - r.rate / 100 - margin / 100) : 0;
        const fee = price * r.rate / 100 + r.fixed;
        const profit = price - fee - r.shipping - (cost || 0);
        const actualMargin = price > 0 ? profit / price * 100 : 0;
        return { name, price: Math.ceil(price * 100) / 100, fee, profit, actualMargin, cost, valid, shipping: r.shipping };
      });
      return { product: p, results };
    }), [products, query, rules, margin, onlyAvailable]);

  const shown = rows.flatMap(row => row.results.filter(r => channel === 'Todas' || r.name === channel).map(r => ({ ...r, product: row.product })));
  const updateRule = (name: Channel, key: keyof Rule, value: number) =>
    setRules(prev => ({ ...prev, [name]: { ...prev[name], [key]: Math.max(0, value) } }));

  return <section className="space-y-5 text-slate-100">
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
      <div><div className="flex items-center gap-2"><Calculator className="w-5 h-5 text-emerald-300"/><h1 className="text-xl font-bold">Precificação em Massa</h1></div>
      <p className="text-sm text-slate-400 mt-1">Preço sugerido por canal usando o custo cadastrado no catálogo.</p></div>
      <button onClick={() => setShowSettings(v => !v)} className="rounded-lg border border-cyan-800 bg-cyan-950/40 px-3 py-2 text-sm flex items-center gap-2"><SlidersHorizontal className="w-4 h-4"/> Ajustar taxas e margem</button>
    </div>
    {showSettings && <div className="rounded-xl border border-cyan-900 bg-[#071827] p-4 space-y-4">
      <div className="max-w-xs"><label className="block text-xs text-slate-400 mb-1">Margem líquida desejada (%)</label><input type="number" min="0" max="80" value={margin} onChange={e => setMargin(Math.min(80, Math.max(0, Number(e.target.value))))} className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2"/></div>
      <p className="text-xs text-amber-200">As taxas abaixo são premissas editáveis, não uma confirmação das tarifas atuais de cada marketplace. Impostos e embalagem não estão incluídos.</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{(Object.keys(rules) as Channel[]).map(name => <div key={name} className="rounded-lg border border-slate-800 p-3 space-y-2">
        <strong className="text-sm">{name}</strong>
        <label className="block text-xs text-slate-400">Comissão (%)<input type="number" value={rules[name].rate} onChange={e => updateRule(name,'rate',Number(e.target.value))} className="mt-1 w-full rounded bg-slate-950 border border-slate-700 p-2"/></label>
        <label className="block text-xs text-slate-400">Taxa fixa (R$)<input type="number" step="0.01" value={rules[name].fixed} onChange={e => updateRule(name,'fixed',Number(e.target.value))} className="mt-1 w-full rounded bg-slate-950 border border-slate-700 p-2"/></label>
        <label className="block text-xs text-slate-400">Frete descontado por venda (R$)<input type="number" step="0.01" value={rules[name].shipping} onChange={e => updateRule(name,'shipping',Number(e.target.value))} className="mt-1 w-full rounded bg-slate-950 border border-slate-700 p-2"/></label>
      </div>)}</div>
    </div>}
    <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-xs text-amber-100 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0"/> Frete, taxas fixas por faixa de preço, programas opcionais e impostos podem mudar o resultado. Configure os valores reais antes de anunciar. No Mercado Livre, o frete descontado pode transformar um preço aparentemente lucrativo em prejuízo.</div>
    <div className="flex flex-col md:flex-row gap-3">
      <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-3 text-slate-500"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar produto pelo nome..." className="w-full rounded-lg border border-slate-700 bg-[#071827] pl-9 p-2.5 text-sm"/></div>
      <select value={channel} onChange={e=>setChannel(e.target.value as 'Todas' | Channel)} className="rounded-lg border border-slate-700 bg-[#071827] p-2.5 text-sm"><option>Todas</option>{(Object.keys(rules) as Channel[]).map(x=><option key={x}>{x}</option>)}</select>
      <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={onlyAvailable} onChange={e=>setOnlyAvailable(e.target.checked)}/> Só disponíveis</label>
    </div>
    <div className="text-xs text-slate-400">{shown.length} combinações produto/canal • meta de margem: {margin}% • impostos excluídos</div>
    <div className="overflow-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[850px] text-sm">
        <thead className="bg-[#0a2030] text-slate-300"><tr>{['Produto','Canal','Custo','Preço sugerido','Taxas estimadas','Lucro estimado','Margem','Frete informado'].map(x=><th key={x} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{x}</th>)}</tr></thead>
        <tbody>{shown.map((r,i)=><tr key={r.product.id+'-'+r.name} className={`border-t border-slate-800 ${i%2?'bg-[#07131e]':'bg-[#061a27]'}`}>
          <td className="px-3 py-3 max-w-[260px]"><div className="truncate font-medium" title={r.product.name}>{r.product.name}</div><div className="text-[11px] text-slate-500">{r.product.sku || r.product.id}</div></td>
          <td className="px-3 py-3 whitespace-nowrap">{r.name}</td><td className="px-3 py-3">{r.cost && r.cost>0?money(r.cost):<span className="text-amber-300">Sem custo</span>}</td>
          <td className="px-3 py-3 font-bold text-emerald-300">{r.valid?money(r.price):'—'}</td><td className="px-3 py-3">{r.valid?money(r.fee):'—'}</td>
          <td className={`px-3 py-3 font-semibold ${r.profit>=0?'text-emerald-300':'text-rose-300'}`}>{r.valid?money(r.profit):'—'}</td><td className="px-3 py-3">{r.valid?r.actualMargin.toFixed(1)+'%':'—'}</td><td className="px-3 py-3">{money(r.shipping)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="text-xs text-slate-500">O preço é arredondado para cima ao centavo para buscar a margem configurada. Esta tela calcula sugestões em tempo real; não altera nem publica anúncios nos marketplaces.</p>
  </section>;
};
