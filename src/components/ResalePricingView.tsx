import React, { useMemo, useState } from 'react';
import { Product } from '../types';
import { Calculator, Search, Download, Info, Percent } from 'lucide-react';

type PlatformRule = { label: string; feePercent: number; fixedFee: number };
const DEFAULT_RULES: PlatformRule[] = [
  { label: 'Shopee', feePercent: 20, fixedFee: 4 },
  { label: 'TikTok Shop', feePercent: 12, fixedFee: 2 },
  { label: 'Mercado Livre', feePercent: 16, fixedFee: 6 },
  { label: 'SHEIN', feePercent: 16, fixedFee: 0 },
];
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const costNumber = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  const normalized = s.includes(',') && s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

export const ResalePricingView: React.FC<{ products: Product[] }> = ({ products }) => {
  const [query, setQuery] = useState('');
  const [markup, setMarkup] = useState(40);
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [showRules, setShowRules] = useState(false);
  const [onlyReview, setOnlyReview] = useState(false);
  const rows = useMemo(() => products.map(p => {
    const cost = costNumber(p.cost);
    const base = cost * (1 + markup / 100);
    const prices = rules.map(r => ({ ...r, price: r.feePercent >= 100 ? 0 : (base + r.fixedFee) / (1 - r.feePercent / 100) }));
    return { p, cost, base, prices };
  }).filter(r => (!query || (r.p.name + ' ' + (r.p.sku || '')).toLowerCase().includes(query.toLowerCase())) && (!onlyReview || r.cost <= 0 || r.prices.some(x => x.price <= 0))), [products, markup, rules, query, onlyReview]);
  const downloadCsv = () => {
    const header = ['Produto','SKU','Custo atacado','Preço-base + acréscimo','Shopee','TikTok Shop','Mercado Livre','SHEIN'];
    const data = rows.map(r => [r.p.name, r.p.sku || '', r.cost.toFixed(2), r.base.toFixed(2), ...r.prices.map(x => x.price.toFixed(2))]);
    const csv = [header, ...data].map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = 'precos-revenda-marketpreco.csv'; a.click(); URL.revokeObjectURL(url);
  };
  return <div className="mx-auto max-w-7xl space-y-5 pb-10">
    <header className="rounded-2xl border border-cyan-900/50 bg-[#081a27] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-cyan-300"><Calculator size={19}/><span className="text-xs font-bold uppercase tracking-widest">MarketPreço</span></div>
          <h1 className="text-2xl font-bold text-white">Preços para Revenda</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">Veja quanto anunciar cada produto para cobrir o custo do catálogo, aplicar seu acréscimo e descontar as taxas estimadas de cada marketplace.</p>
        </div>
        <button onClick={downloadCsv} className="inline-flex items-center gap-2 rounded-lg border border-cyan-800 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-950"><Download size={16}/> Exportar preços CSV</button>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm text-slate-300">Acréscimo desejado (%)<input type="number" min="0" value={markup} onChange={e=>setMarkup(Math.max(0, Number(e.target.value)||0))} className="mt-1 block w-full rounded-lg border border-slate-700 bg-[#03111b] px-3 py-2 text-white"/></label>
        <label className="text-sm text-slate-300">Buscar produto<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nome ou SKU..." className="mt-1 block w-full rounded-lg border border-slate-700 bg-[#03111b] px-3 py-2 text-white"/></label>
        <label className="flex items-center gap-2 self-end rounded-lg border border-slate-700 p-3 text-sm text-slate-300"><input type="checkbox" checked={onlyReview} onChange={e=>setOnlyReview(e.target.checked)}/> Mostrar somente produtos para revisar</label>
      </div>
    </header>
    <section className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-100"><div className="flex gap-2"><Info size={18} className="shrink-0"/><p><b>Importante:</b> esta tela calcula sobre o catálogo já carregado no MarketPreço. Ela ainda não busca automaticamente todo o catálogo do atacado.pdvmaster.com. As taxas abaixo são estimativas editáveis; confirme as condições vigentes de cada marketplace antes de publicar.</p></div>
      <button className="mt-3 inline-flex items-center gap-2 text-amber-200 underline" onClick={()=>setShowRules(v=>!v)}><Percent size={15}/>{showRules?'Ocultar taxas':'Configurar taxas e valores fixos por plataforma'}</button>
      {showRules && <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{rules.map((r,i)=><div key={r.label} className="rounded-lg border border-slate-700 bg-[#071521] p-3"><b>{r.label}</b><label className="mt-2 block text-xs text-slate-300">Taxa (%)<input type="number" value={r.feePercent} onChange={e=>setRules(prev=>prev.map((x,j)=>j===i?{...x,feePercent:Math.min(99,Math.max(0,Number(e.target.value)||0))}:x))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"/></label><label className="mt-2 block text-xs text-slate-300">Valor fixo por venda (R$)<input type="number" value={r.fixedFee} onChange={e=>setRules(prev=>prev.map((x,j)=>j===i?{...x,fixedFee:Math.max(0,Number(e.target.value)||0)}:x))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"/></label></div>)}</div>}
    </section>
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#071521]">
      <table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-[#102333] text-xs uppercase text-slate-300"><tr><th className="p-3">Produto</th><th className="p-3 text-right">Atacado / custo</th><th className="p-3 text-right">Base +{markup}%</th>{rules.map(r=><th key={r.label} className="p-3 text-right">{r.label}</th>)}</tr></thead>
        <tbody>{rows.map(({p,cost,base,prices})=><tr key={p.id} className="border-t border-slate-800 hover:bg-slate-900/60"><td className="p-3"><div className="flex items-center gap-3">{p.image && <img src={p.image} alt="" className="h-10 w-10 rounded-md object-contain bg-white" onError={e=>{e.currentTarget.style.display='none'}}/>}<div><div className="font-medium text-white">{p.name}</div><div className="text-xs text-slate-500">{p.sku || p.id}</div></div></div></td><td className="p-3 text-right tabular-nums">{cost>0?money(cost):<span className="text-rose-300">Sem custo</span>}</td><td className="p-3 text-right font-semibold text-cyan-200 tabular-nums">{cost>0?money(base):'—'}</td>{prices.map(x=><td key={x.label} className="p-3 text-right font-semibold text-emerald-300 tabular-nums">{cost>0?money(x.price):'—'}</td>)}</tr>)}</tbody>
      </table>
      {!rows.length && <p className="p-8 text-center text-slate-400">Nenhum produto corresponde à busca. Importe o catálogo do atacado na aba Importar Catálogo para calcular os preços.</p>}
    </div>
    <p className="text-xs text-slate-500">Fórmula: preço recomendado = (custo × (1 + acréscimo)) + taxa fixa, dividido por (1 − taxa percentual). O resultado visa deixar o valor-base desejado após taxas; não inclui custos extras não configurados.</p>
  </div>;
};
