import React, { useMemo, useState } from 'react';
import { Product } from '../types';
import { parseNumericCost } from '../utils/productDeduplication';
import { Search, Settings2, ShoppingBasket, AlertTriangle } from 'lucide-react';

type Channel = 'Shopee' | 'Mercado Livre' | 'TikTok Shop' | 'SHEIN';
type Rule = { rate: number; fixed: number };
const INITIAL_RULES: Record<Channel, Rule> = {
  'Shopee': { rate: 20, fixed: 4.5 },
  'Mercado Livre': { rate: 36.56, fixed: 0 },
  'TikTok Shop': { rate: 16, fixed: 4 },
  'SHEIN': { rate: 18, fixed: 0 },
};
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const WholesaleCatalogView: React.FC<{ products: Product[] }> = ({ products }) => {
  const [query, setQuery] = useState('');
  const [markup, setMarkup] = useState(40);
  const [rules, setRules] = useState(INITIAL_RULES);
  const [showSettings, setShowSettings] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<'all' | 'in_catalog' | 'not_in_catalog'>('all');

  const notInCatalogCount = useMemo(() => products.filter(p => p.not_in_catalog).length, [products]);

  const rows = useMemo(() => products
    .filter(product => {
      if (supplierFilter === 'in_catalog' && product.not_in_catalog) return false;
      if (supplierFilter === 'not_in_catalog' && !product.not_in_catalog) return false;
      if (query && !product.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    })
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true }))
    .map(product => {
      const cost = parseNumericCost(product.cost);
      const targetNet = cost !== null && cost > 0 ? cost * (1 + markup / 100) : 0;
      const prices = (Object.keys(rules) as Channel[]).map(channel => {
        const rule = rules[channel];
        const valid = cost !== null && cost > 0 && rule.rate < 100;
        const listingPrice = valid ? (targetNet + rule.fixed) / (1 - rule.rate / 100) : 0;
        return { channel, price: Math.ceil(listingPrice * 100) / 100, valid };
      });
      return { product, cost, targetNet, prices };
    }), [products, query, markup, rules, supplierFilter]);

  const updateRule = (channel: Channel, key: keyof Rule, value: number) =>
    setRules(current => ({ ...current, [channel]: { ...current[channel], [key]: Math.max(0, Math.min(key === 'rate' ? 99 : 100000, value)) } }));

  return <section className="space-y-5 text-slate-100">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-2"><ShoppingBasket className="h-5 w-5 text-cyan-300" /><h1 className="text-xl font-bold">Catálogo Atacado PDVMaster</h1></div>
        <p className="mt-1 text-sm text-slate-400">Custo do fornecedor + acréscimo desejado e preço sugerido para cada marketplace.</p>
      </div>
      <div className="flex items-end gap-2">
        <label className="text-xs text-slate-400">Acréscimo sobre o custo (%)
          <input type="number" min="0" max="500" value={markup} onChange={event => setMarkup(Math.max(0, Math.min(500, Number(event.target.value))))} className="mt-1 block w-28 rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-white" />
        </label>
        <button onClick={() => setShowSettings(value => !value)} className="flex items-center gap-2 rounded-lg border border-cyan-800 bg-cyan-950/40 px-3 py-2 text-sm"><Settings2 className="h-4 w-4" /> Taxas</button>
      </div>
    </div>

    {showSettings && <div className="grid gap-3 rounded-xl border border-cyan-900 bg-[#071827] p-4 sm:grid-cols-2 xl:grid-cols-4">
      {(Object.keys(rules) as Channel[]).map(channel => <div key={channel} className="space-y-2 rounded-lg border border-slate-800 p-3">
        <strong className="text-sm">{channel}</strong>
        <label className="block text-xs text-slate-400">Comissão (%)
          <input type="number" value={rules[channel].rate} onChange={event => updateRule(channel, 'rate', Number(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-white" />
        </label>
        <label className="block text-xs text-slate-400">Taxa fixa por venda (R$)
          <input type="number" step="0.01" value={rules[channel].fixed} onChange={event => updateRule(channel, 'fixed', Number(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 p-2 text-white" />
        </label>
      </div>)}
      <p className="text-xs text-amber-200 sm:col-span-2 xl:col-span-4">Taxas iniciais são estimativas editáveis. Frete, impostos, embalagem e tarifas variáveis não estão incluídos; confirme as condições da sua conta antes de anunciar.</p>
    </div>}

    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar produto do catálogo..." className="w-full rounded-lg border border-slate-700 bg-[#071827] p-2.5 pl-9 text-sm text-white" />
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setSupplierFilter('all')}
          className={`px-3 py-2 rounded-lg text-xs font-medium border transition ${
            supplierFilter === 'all'
              ? 'bg-cyan-600 text-white border-cyan-500'
              : 'bg-[#071827] text-slate-300 border-slate-800 hover:border-slate-700'
          }`}
        >
          Todos ({products.length})
        </button>

        <button
          type="button"
          onClick={() => setSupplierFilter('in_catalog')}
          className={`px-3 py-2 rounded-lg text-xs font-medium border transition ${
            supplierFilter === 'in_catalog'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-[#071827] text-slate-300 border-slate-800 hover:border-slate-700'
          }`}
        >
          No Site ({products.length - notInCatalogCount})
        </button>

        {notInCatalogCount > 0 && (
          <button
            type="button"
            onClick={() => setSupplierFilter('not_in_catalog')}
            className={`px-3 py-2 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${
              supplierFilter === 'not_in_catalog'
                ? 'bg-amber-600 text-slate-950 font-bold border-amber-500'
                : 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/40'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Fora do Site ({notInCatalogCount})</span>
          </button>
        )}
      </div>
    </div>

    <div className="text-xs text-slate-400">{rows.length} produtos exibidos • acréscimo configurado: {markup}% • preço calculado para, após a comissão e taxa fixa, receber o custo + acréscimo.</div>
    <div className="overflow-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[1000px] text-sm">
        <thead className="bg-[#0a2030] text-slate-300"><tr>
          {['Produto', 'Custo PDVMaster', 'Receber líquido', 'Shopee', 'Mercado Livre', 'TikTok Shop', 'SHEIN'].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 text-left font-semibold">{label}</th>)}
        </tr></thead>
        <tbody>{rows.map(({ product, cost, targetNet, prices }, index) => <tr key={product.id} className={`border-t border-slate-800 ${product.not_in_catalog ? 'bg-[#181216]' : index % 2 ? 'bg-[#07131e]' : 'bg-[#061a27]'}`}>
          <td className="max-w-[320px] px-3 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="truncate font-medium block" title={product.name}>{product.name}</span>
              {product.not_in_catalog && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950/90 text-amber-300 border border-amber-500/80 shadow-xs shrink-0">
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                  <span>FORA DO SITE</span>
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Código: {product.sku || product.id}</div>
          </td>
          <td className="whitespace-nowrap px-3 py-3">{cost !== null && cost > 0 ? money(cost) : <span className="text-amber-300">Sem custo</span>}</td>
          <td className="whitespace-nowrap px-3 py-3 font-semibold text-emerald-300">{targetNet > 0 ? money(targetNet) : '—'}</td>
          {prices.map(result => <td key={result.channel} className="whitespace-nowrap px-3 py-3 font-semibold text-cyan-200">{result.valid ? money(result.price) : '—'}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="text-xs text-slate-500">A lista usa os produtos PDVMaster já sincronizados no banco de dados da aplicação. A atualização automática diretamente no site do fornecedor ainda depende de uma fonte de dados/API ou exportação recorrente disponibilizada pelo PDVMaster.</p>
  </section>;
};
