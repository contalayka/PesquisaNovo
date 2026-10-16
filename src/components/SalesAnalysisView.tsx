import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { BarChart3, Upload, Download, RefreshCw, TrendingDown, AlertTriangle, CheckCircle2, ExternalLink, Info } from 'lucide-react';

type Platform = 'Shopee' | 'TikTok Shop' | 'Mercado Livre';
type Listing = {
  id: string; platform: Platform; title: string; listingId: string;
  views: number; orders: number; units: number; revenue: number;
  price: number; cost: number; competitorPrice: number; feePercent: number; targetMarginPercent: number; url: string;
  period: string; updatedAt: string;
};
const KEY = 'marketpreco_sales_analysis_v1';
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim().replace(/R\$\s?/gi, '').replace(/\s/g, '');
  if (!s) return 0;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const parsed = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const normalize = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const findValue = (row: Record<string, unknown>, aliases: string[]) => {
  const keys = Object.keys(row);
  const match = keys.find(k => aliases.some(a => normalize(k) === normalize(a))) ??
    keys.find(k => aliases.some(a => normalize(k).includes(normalize(a))));
  return match ? row[match] : '';
};
const parseRows = (rows: Record<string, unknown>[], platform: Platform): Listing[] => rows.map((r, i) => {
  const title = String(findValue(r, ['produto', 'nome do produto', 'título', 'titulo', 'product name', 'item title', 'nome']) || '').trim();
  if (!title) return null;
  const price = num(findValue(r, ['preço atual', 'preco atual', 'preço', 'preco', 'price', 'valor do produto', 'preço de venda']));
  const views = num(findValue(r, ['visitas', 'visualizações', 'visualizacoes', 'views', 'page views', 'impressions']));
  const orders = num(findValue(r, ['pedidos', 'orders', 'order count', 'quantidade de pedidos']));
  const units = num(findValue(r, ['unidades vendidas', 'vendas', 'units sold', 'sold quantity', 'quantidade vendida'])) || orders;
  const revenue = num(findValue(r, ['faturamento', 'receita', 'revenue', 'sales amount', 'valor vendido', 'gmv']));
  const id = String(findValue(r, ['id do anúncio', 'id do anuncio', 'id do produto', 'item id', 'product id', 'sku', 'seller sku']) || `${platform}-${i}-${normalize(title).slice(0,18)}`);
  const url = String(findValue(r, ['url', 'link do produto', 'link do anúncio', 'link do anuncio', 'product url']) || '');
  const cost = num(findValue(r, ['custo', 'custo unitário', 'custo unitario', 'cost']));
  const competitorPrice = num(findValue(r, ['preço concorrente', 'preco concorrente', 'preço concorrência', 'menor preço concorrente', 'competitor price']));
  const feePercent = num(findValue(r, ['taxa da plataforma (%)', 'comissão (%)', 'comissao (%)', 'taxa percentual', 'fee percent', 'commission percent']));
  const targetMarginPercent = num(findValue(r, ['margem desejada (%)', 'margem alvo (%)', 'target margin percent'])) || 20;
  const period = String(findValue(r, ['período', 'periodo', 'data', 'date range', 'intervalo']) || '');
  return { id, platform, title, listingId: id, views, orders, units, revenue, price, cost, competitorPrice, feePercent, targetMarginPercent, url, period, updatedAt: new Date().toISOString() };
}).filter((x): x is Listing => Boolean(x));

export const SalesAnalysisView: React.FC = () => {
  const [items, setItems] = useState<Listing[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const [platform, setPlatform] = useState<Platform>('Shopee');
  const [filter, setFilter] = useState<'todos' | Platform>('todos');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { setNotice('Armazenamento local cheio. Exporte um backup para não perder os dados.'); } }, [items]);
  const visible = useMemo(() => filter === 'todos' ? items : items.filter(x => x.platform === filter), [items, filter]);
  const totals = useMemo(() => visible.reduce((a, x) => ({ views: a.views + x.views, orders: a.orders + x.orders, units: a.units + x.units, revenue: a.revenue + x.revenue }), { views: 0, orders: 0, units: 0, revenue: 0 }), [visible]);
  const conversion = totals.views > 0 ? totals.orders / totals.views * 100 : 0;
  const onUpload = async (file?: File) => {
    if (!file) return;
    setBusy(true); setNotice('');
    try {
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (!rows.length) throw new Error('A planilha está vazia ou não tem cabeçalhos reconhecíveis.');
      const parsed = parseRows(rows, platform);
      if (!parsed.length) throw new Error('Não encontrei uma coluna de produto/título. Confira o relatório e tente novamente.');
      setItems(prev => {
        const map = new Map<string, Listing>(prev.map(x => [`${x.platform}|${x.listingId}`, x] as const));
        parsed.forEach(x => {
          const key = `${x.platform}|${x.listingId}`;
          const existing = map.get(key);
          map.set(key, existing ? {
            ...existing,
            ...x,
            // Relatórios sem esses campos não devem apagar valores preenchidos manualmente.
            price: x.price || existing.price,
            cost: x.cost || existing.cost,
            competitorPrice: x.competitorPrice || existing.competitorPrice,
            feePercent: x.feePercent || existing.feePercent,
            targetMarginPercent: x.targetMarginPercent || existing.targetMarginPercent || 20,
          } : x);
        });
        return Array.from(map.values());
      });
      setNotice(`${parsed.length} anúncio(s) importado(s) de ${file.name}. Confira os campos antes de usar as recomendações.`);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.'); }
    finally { setBusy(false); }
  };
  const update = (id: string, field: 'cost' | 'competitorPrice' | 'price' | 'feePercent' | 'targetMarginPercent', value: string) => setItems(prev => prev.map(x => x.id === id && x.platform === (filter === 'todos' ? x.platform : filter) ? { ...x, [field]: num(value) } : x));
  const exportBackup = () => {
    const ws = XLSX.utils.json_to_sheet(items);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Anuncios');
    XLSX.writeFile(wb, 'marketpreco-analise-vendas.xlsx');
  };
  const recommendation = (x: Listing) => {
    const candidates = [x.competitorPrice > 0 ? x.competitorPrice : 0, x.price > 0 ? x.price * 0.95 : 0].filter(v => v > 0);
    if (!candidates.length) return null;
    const target = Math.min(...candidates);
    const feeValue = Number.isFinite(Number(x.feePercent)) ? Number(x.feePercent) : 0;
    const marginValue = Number.isFinite(Number(x.targetMarginPercent)) ? Number(x.targetMarginPercent) : 20;
    const feeRate = Math.min(Math.max(feeValue, 0), 99) / 100;
    const marginRate = Math.min(Math.max(marginValue, 0), 99) / 100;
    const denominator = 1 - feeRate - marginRate;
    const floor = x.cost > 0 && denominator > 0 ? x.cost / denominator : 0;
    const suggested = Math.max(target, floor);
    const estimatedMargin = suggested > 0 ? (suggested * (1 - feeRate) - x.cost) / suggested * 100 : null;
    return { target: suggested, margin: x.cost > 0 ? estimatedMargin : null, belowCost: floor > 0 && target < floor, invalidRates: denominator <= 0 };
  };
  return <div className="space-y-5 text-slate-100">
    <div className="rounded-2xl border border-cyan-900/50 bg-gradient-to-br from-[#071b2a] to-[#04111b] p-5 md:p-7">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-emerald-300"><BarChart3 className="h-5 w-5"/><span className="text-xs font-semibold uppercase tracking-[.18em]">MarketPreço • Inteligência comercial</span></div>
          <h1 className="text-2xl font-bold md:text-3xl">Análise de vendas e preços</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Identifique anúncios com muitas visitas e poucas vendas, compare preços e estime um preço competitivo sem alterar seus anúncios automaticamente.</p>
        </div>
        <button onClick={exportBackup} className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-800 px-4 py-2 text-sm hover:bg-cyan-950/50"><Download className="h-4 w-4"/> Exportar backup</button>
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[['Visitas / visualizações', totals.views.toLocaleString('pt-BR'), 'Do relatório importado'], ['Pedidos', totals.orders.toLocaleString('pt-BR'), 'Pedidos atribuídos aos anúncios'], ['Conversão', `${conversion.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`, 'Pedidos ÷ visitas'], ['Faturamento', money(totals.revenue), 'Valor informado no relatório']].map(([label,value,sub]) => <div key={label} className="rounded-xl border border-slate-800 bg-[#071722] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{sub}</p></div>)}
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,.7fr)]">
      <section className="rounded-xl border border-slate-800 bg-[#06141f] p-5">
        <h2 className="text-lg font-semibold">Importar relatório de desempenho</h2>
        <p className="mt-1 text-sm text-slate-400">Use CSV ou Excel (.xlsx). Escolha a plataforma antes de importar. Os dados ficam neste navegador.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(['Shopee','TikTok Shop','Mercado Livre'] as Platform[]).map(p => <button key={p} onClick={() => setPlatform(p)} className={`rounded-lg border px-3 py-2 text-sm ${platform===p?'border-emerald-400 bg-emerald-400/10 text-emerald-200':'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>{p}</button>)}
        </div>
        <label className="mt-4 flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-cyan-800 bg-cyan-950/20 px-4 py-7 text-center hover:bg-cyan-950/40">
          {busy ? <RefreshCw className="mb-2 h-6 w-6 animate-spin text-cyan-300"/> : <Upload className="mb-2 h-6 w-6 text-cyan-300"/>}
          <span className="font-medium">{busy ? 'Lendo arquivo…' : 'Selecionar relatório CSV ou Excel'}</span>
          <span className="mt-1 text-xs text-slate-400">Primeira aba do arquivo • cabeçalho na primeira linha</span>
          <input className="hidden" type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={e => { void onUpload(e.target.files?.[0]); e.currentTarget.value=''; }}/>
        </label>
        {notice && <p className="mt-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3 text-sm text-slate-300">{notice}</p>}
        <div className="mt-4 rounded-lg border border-slate-800 p-3 text-xs leading-5 text-slate-400"><Info className="mr-1 inline h-4 w-4 text-cyan-300"/> Colunas reconhecidas incluem produto/título, visitas/visualizações, pedidos, unidades vendidas, faturamento, preço, custo, taxa/comissão percentual, margem desejada e preço concorrente. Se um relatório usar nomes diferentes, complete ou corrija os dados na tabela.</div>
      </section>
      <section className="rounded-xl border border-amber-900/40 bg-[#17150e] p-5">
        <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-300"/><h2 className="text-lg font-semibold">Conexão automática</h2></div>
        <p className="mt-3 text-sm leading-6 text-slate-300">A verificação do código atual não encontrou autenticação nem sincronização de desempenho com as contas de Shopee, TikTok Shop ou Mercado Livre. Esta tela não finge estar conectada: por enquanto, os dados entram por relatório.</p>
        <p className="mt-3 text-sm leading-6 text-slate-400">Para ativar sincronização real, será necessário configurar OAuth/API de cada plataforma e armazenar tokens com segurança no servidor. Não coloque senhas, tokens ou chaves secretas nesta tela.</p>
        <div className="mt-4 flex items-center gap-2 text-xs text-amber-200"><Info className="h-4 w-4"/> Nenhuma alteração automática de preço é feita.</div>
      </section>
    </div>
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#06141f]">
      <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-semibold">Anúncios importados</h2><p className="text-xs text-slate-400">{visible.length} anúncio(s) na visualização</p></div>
        <div className="flex flex-wrap gap-2">{(['todos','Shopee','TikTok Shop','Mercado Livre'] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`rounded-md border px-2.5 py-1.5 text-xs ${filter===f?'border-cyan-500 bg-cyan-950/40 text-cyan-200':'border-slate-700 text-slate-400'}`}>{f==='todos'?'Todas':f}</button>)}<button onClick={()=>{setItems([]);setNotice('Dados removidos deste navegador.');}} className="rounded-md border border-red-900/60 px-2.5 py-1.5 text-xs text-red-300">Limpar</button></div>
      </div>
      {visible.length===0 ? <div className="p-10 text-center"><BarChart3 className="mx-auto h-8 w-8 text-slate-600"/><p className="mt-3 font-medium">Nenhum anúncio analisado ainda</p><p className="mt-1 text-sm text-slate-500">Importe um relatório de desempenho para começar.</p></div> :
      <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-900/70 text-xs uppercase text-slate-400"><tr>{['Plataforma / anúncio','Visitas','Pedidos','Conversão','Preço atual','Custo','Comissão %','Margem alvo %','Concorrente','Preço sugerido','Diagnóstico'].map(h=><th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{visible.map(x=>{const rec=recommendation(x);const rate=x.views>0?x.orders/x.views*100:0;return <tr key={x.platform+x.id} className="align-top hover:bg-slate-900/40"><td className="max-w-[250px] px-3 py-3"><div className="font-medium text-slate-200">{x.title}</div><div className="mt-1 text-xs text-slate-500">{x.platform} • {x.listingId}</div>{x.url&&<a href={x.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline">Abrir anúncio <ExternalLink className="h-3 w-3"/></a>}</td><td className="px-3 py-3">{x.views.toLocaleString('pt-BR')}</td><td className="px-3 py-3">{x.orders.toLocaleString('pt-BR')}</td><td className="px-3 py-3">{rate.toLocaleString('pt-BR',{maximumFractionDigits:2})}%</td><td className="px-3 py-3"><input aria-label="Preço atual" className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1" value={x.price||''} placeholder="R$" onChange={e=>update(x.id,'price',e.target.value)}/></td><td className="px-3 py-3"><input aria-label="Custo" className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1" value={x.cost||''} placeholder="R$" onChange={e=>update(x.id,'cost',e.target.value)}/></td><td className="px-3 py-3"><input aria-label="Comissão da plataforma em porcentagem" className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1" type="number" min="0" max="99" value={x.feePercent||''} placeholder="%" onChange={e=>update(x.id,'feePercent',e.target.value)}/></td><td className="px-3 py-3"><input aria-label="Margem desejada em porcentagem" className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1" type="number" min="0" max="99" value={x.targetMarginPercent||''} placeholder="20%" onChange={e=>update(x.id,'targetMarginPercent',e.target.value)}/></td><td className="px-3 py-3"><input aria-label="Preço concorrente" className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1" value={x.competitorPrice||''} placeholder="R$" onChange={e=>update(x.id,'competitorPrice',e.target.value)}/></td><td className="px-3 py-3">{rec ? <><div className="font-semibold text-emerald-300">{money(rec.target)}</div>{rec.margin!==null&&<div className="text-xs text-slate-500">Margem após comissão: {rec.margin.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</div>}{rec.invalidRates&&<div className="text-xs text-red-300">Comissão + margem ≥ 100%</div>}</> : <span className="text-xs text-slate-500">Informe preço</span>}</td><td className="px-3 py-3">{rec?.belowCost ? <span className="inline-flex items-center gap-1 text-xs text-red-300"><AlertTriangle className="h-3 w-3"/>Preço competitivo abaixo do piso</span> : x.views>=100&&x.orders===0 ? <span className="inline-flex items-center gap-1 text-xs text-amber-300"><TrendingDown className="h-3 w-3"/>Muitas visitas, sem pedidos</span> : x.orders>0 ? <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-3 w-3"/>Já converte</span> : <span className="text-xs text-slate-500">Precisa de mais dados</span>}</td></tr>})}</tbody></table></div>}
    </section>
    <p className="text-xs leading-5 text-slate-500">Observação: o sistema compara o menor entre o preço concorrente informado e 5% abaixo do preço atual com o preço mínimo calculado a partir do custo, comissão informada e margem desejada (padrão 20%). Comissão zerada significa que você ainda não informou a taxa; frete, impostos, cupons e outros custos não entram no cálculo. Confirme todos os custos antes de usar a sugestão.</p>
  </div>;
};
