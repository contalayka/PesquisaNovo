import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import Tesseract from 'tesseract.js';
import { BarChart3, Upload, Download, RefreshCw, TrendingDown, AlertTriangle, CheckCircle2, ExternalLink, Info } from 'lucide-react';

type Platform = 'Shopee' | 'TikTok Shop' | 'Mercado Livre';
type Listing = {
  id: string; platform: Platform; title: string; listingId: string;
  views: number; orders: number; units: number; revenue: number;
  price: number; cost: number; competitorPrice: number; feePercent: number; targetMarginPercent: number; url: string;
  period: string; updatedAt: string;
  totalSales?: number; sales30Days?: number; impressions30Days?: number; stock?: number;
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
  const [imageBusy, setImageBusy] = useState(false);
  const [mlItemIds, setMlItemIds] = useState('');
  const [mlDateFrom, setMlDateFrom] = useState(() => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [mlDateTo, setMlDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [mlBusy, setMlBusy] = useState(false);
  const [shopeeAdminKey, setShopeeAdminKey] = useState(() => {
    try { return sessionStorage.getItem('marketpreco_marketplace_admin_key') || ''; } catch { return ''; }
  });
  const [shopeeBusy, setShopeeBusy] = useState(false);
  const [shopeeStatus, setShopeeStatus] = useState<{configured:boolean;connected:boolean;message:string} | null>(null);
  const [shopeeDateFrom, setShopeeDateFrom] = useState(() => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
  const [shopeeDateTo, setShopeeDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { setNotice('Armazenamento local cheio. Exporte um backup para não perder os dados.'); } }, [items]);
  useEffect(() => {
    let active = true;
    fetch('/api/marketplace/shopee/status')
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (active && data) setShopeeStatus({ configured: Boolean(data.configured), connected: Boolean(data.connected), message: String(data.message || '') }); })
      .catch(() => { if (active) setShopeeStatus(null); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('marketplace') === 'shopee-connected') {
      setNotice('Shopee conectada com sucesso! Agora você pode sincronizar pedidos no painel Shopee.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  const visible = useMemo(() => filter === 'todos' ? items : items.filter(x => x.platform === filter), [items, filter]);
  const totals = useMemo(() => visible.reduce((a, x) => ({ views: a.views + x.views, orders: a.orders + x.orders, units: a.units + x.units, revenue: a.revenue + x.revenue }), { views: 0, orders: 0, units: 0, revenue: 0 }), [visible]);
  const conversion = totals.views > 0 ? totals.orders / totals.views * 100 : 0;
  const syncMercadoLivreVisits = async () => {
    const ids = [...new Set(mlItemIds.split(/[\\s,;]+/).map(id => id.trim().toUpperCase()).filter(Boolean))];
    if (!ids.length) { setNotice('Informe pelo menos um ID de anúncio do Mercado Livre (ex.: MLB123456789).'); return; }
    setMlBusy(true); setNotice('');
    try {
      const response = await fetch('/api/marketplace/mercadolivre-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: ids, dateFrom: mlDateFrom, dateTo: mlDateTo }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setNotice(data.error || 'Não foi possível consultar as visitas.');
        return;
      }
      const visitsById = new Map<string, number>((data.results || []).map((x: {itemId: string; visits: number}) => [x.itemId, x.visits]));
      setItems(prev => {
        const updated = prev.map(item => item.platform === 'Mercado Livre' && visitsById.has(item.listingId)
          ? { ...item, views: visitsById.get(item.listingId) || 0, period: `${mlDateFrom} a ${mlDateTo}`, updatedAt: new Date().toISOString() }
          : item);
        const knownIds = new Set(updated.filter(item => item.platform === 'Mercado Livre').map(item => item.listingId));
        visitsById.forEach((views, itemId) => {
          if (!knownIds.has(itemId)) updated.push({
            id: itemId, platform: 'Mercado Livre', title: itemId, listingId: itemId,
            views, orders: 0, units: 0, revenue: 0, price: 0, cost: 0,
            competitorPrice: 0, feePercent: 0, targetMarginPercent: 20, url: '',
            period: `${mlDateFrom} a ${mlDateTo}`, updatedAt: new Date().toISOString(),
          });
        });
        return updated;
      });
      setNotice(`Consulta concluída: ${visitsById.size} anúncio(s) retornaram dados de visitas. Anúncios que ainda não estavam na lista foram adicionados para você completar preço e custo.`);
    } catch {
      setNotice('Falha de conexão com a função do Cloudflare Pages. Verifique se a versão com a integração está publicada.');
    } finally { setMlBusy(false); }
  };
  const connectShopee = async () => {
    if (!shopeeAdminKey.trim()) { setNotice('Informe a chave administrativa configurada no Cloudflare para conectar a Shopee.'); return; }
    setShopeeBusy(true); setNotice('');
    try {
      sessionStorage.setItem('marketpreco_marketplace_admin_key', shopeeAdminKey.trim());
      const response = await fetch('/api/marketplace/shopee/connect', { headers: { 'X-Marketplace-Admin-Key': shopeeAdminKey.trim() } });
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) { setNotice(data.error || 'Não foi possível iniciar a conexão Shopee.'); return; }
      window.location.assign(data.authorizationUrl);
    } catch {
      setNotice('Falha de conexão ao iniciar a autorização Shopee. Confira se a versão de teste está atualizada.');
    } finally { setShopeeBusy(false); }
  };
  const syncShopeeOrders = async () => {
    if (!shopeeAdminKey.trim()) { setNotice('Informe a chave administrativa configurada no Cloudflare.'); return; }
    setShopeeBusy(true); setNotice('');
    try {
      sessionStorage.setItem('marketpreco_marketplace_admin_key', shopeeAdminKey.trim());
      const response = await fetch('/api/marketplace/shopee/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Marketplace-Admin-Key': shopeeAdminKey.trim() },
        body: JSON.stringify({ dateFrom: shopeeDateFrom, dateTo: shopeeDateTo }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) { setNotice(data.error || 'Não foi possível sincronizar pedidos da Shopee.'); return; }
      const synced = Array.isArray(data.listings) ? data.listings as Array<{listingId:string;title:string;views:number;orders:number;units:number;revenue:number;url:string;period:string}> : [];
      setItems(prev => {
        const map = new Map<string, Listing>(prev.map(item => [`${item.platform}|${item.listingId}`, item] as const));
        for (const row of synced) {
          const key = `Shopee|${row.listingId}`;
          const existing = map.get(key);
          map.set(key, existing ? {
            ...existing, title: row.title || existing.title, orders: row.orders, units: row.units,
            revenue: row.revenue, period: row.period, updatedAt: new Date().toISOString(),
          } : {
            id: `Shopee-${row.listingId}`, platform: 'Shopee', title: row.title, listingId: row.listingId,
            views: row.views || 0, orders: row.orders, units: row.units, revenue: row.revenue,
            price: 0, cost: 0, competitorPrice: 0, feePercent: 0, targetMarginPercent: 20,
            url: row.url || '', period: row.period, updatedAt: new Date().toISOString(),
          });
        }
        return Array.from(map.values());
      });
      setNotice(`Shopee sincronizada: ${data.orderCount} pedido(s) encontrados e ${synced.length} produto(s) com vendas no período. ${data.note || ''}`);
    } catch {
      setNotice('Falha de conexão ao sincronizar a Shopee.');
    } finally { setShopeeBusy(false); }
  };
  const onShopeeImageUpload = async (file?: File) => {
    if (!file) { setNotice('Selecione uma imagem para iniciar a leitura.'); return; } setImageBusy(true); setNotice('Carregando o leitor de texto da imagem… isso pode levar alguns segundos na primeira tentativa.');
    try {
      const result = await Tesseract.recognize(file, 'por+eng', { logger: m => { if (m.status) setNotice('Lendo imagem Shopee: '+m.status+(typeof m.progress==='number'?' '+Math.round(m.progress*100)+'%':'')); } });
      const words = (result.data as any).words as Array<{text:string; bbox:{x0:number;y0:number;x1:number;y1:number}}> | undefined;
      const norm = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const raw = (words||[]).filter(w=>w.text?.trim()).map(w=>({text:w.text.trim(),x:w.bbox.x0,y:(w.bbox.y0+w.bbox.y1)/2})).sort((a,b)=>a.y-b.y||a.x-b.x);
      const bands:Array<{y:number;words:typeof raw}> = [];
      for(const w of raw){let band=bands.find(x=>Math.abs(x.y-w.y)<=20);if(!band){band={y:w.y,words:[]};bands.push(band)}band.words.push(w);band.y=band.words.reduce((s,x)=>s+x.y,0)/band.words.length;}
      const lines=bands.sort((a,b)=>a.y-b.y).map(b=>({y:b.y,text:b.words.sort((a,b)=>a.x-b.x).map(w=>w.text).join(' ')}));
      const parseCount=(s:string)=>{const k=/k/i.test(s);const n=Number(s.replace(/k/i,'').replace(/,/g,'.').replace(/\.(?=\d{3}(\D|$))/g,''));return Number.isFinite(n)?n*(k?1000:1):0};
      const metric=(text:string,labels:string[])=>{for(const label of labels){const i=norm(text).indexOf(norm(label));if(i>=0){const m=text.slice(i+label.length).match(/[\d][\d.,]*\s*k?/i);if(m)return parseCount(m[0]);}}return 0};
      const anchors=lines.filter(l=>/vendas/i.test(l.text)&&!/30\s*dias/i.test(l.text));
      const groups:Array<{y:number;lines:typeof lines}> = anchors.map(anchor=>({y:anchor.y,lines:[anchor]})).sort((a,b)=>a.y-b.y);
      // Assign every OCR line to its nearest product anchor, using midpoints between rows.
      for(const line of lines){if(groups.some(g=>g.lines.includes(line)))continue;let best=groups[0];for(const g of groups){if(Math.abs(g.y-line.y)<Math.abs(best.y-line.y))best=g;}if(best)best.lines.push(line);}
      if(!groups.length){const priceLines=lines.filter(l=>/R\$\s*[\d.,]+/.test(l.text));for(const line of priceLines)groups.push({y:line.y,lines:lines.filter(x=>Math.abs(x.y-line.y)<100)});}      const rows:Listing[]=[];
      for(const g of groups){const text=g.lines.sort((a,b)=>a.y-b.y).map(l=>l.text).join(' | ');const tm=text.match(/Vendas\s*([\d.,]+\s*k?)/i);const totalSales=tm?parseCount(tm[1]):0;const sales30Days=metric(text,['Vendas (30 Dias)','Vendas 30 Dias']);const impressions30Days=metric(text,['Impressões (30 Dias)','Impressoes (30 Dias)','Impressões 30 Dias','Impressoes 30 Dias']);const sm=text.match(/Estoque\s*:?\s*([\d.,]+)/i);const stock=sm?parseCount(sm[1]):0;const pm=text.match(/R\$\s*([\d.,]+)/);const price=pm?num(pm[1]):0;const title=(g.lines.map(l=>l.text).find(t=>!/vendas|estoque|impress|performance|preço|preco/i.test(t)&&/[A-Za-zÀ-ÿ]{3}/.test(t))||g.lines.map(l=>l.text).join(' ')).replace(/\s+/g,' ').trim().slice(0,160);if(!title||(!totalSales&&!sales30Days&&!impressions30Days&&!stock&&!price))continue;const id='Shopee-IMG-'+norm(title).replace(/[^a-z0-9]/g,'').slice(0,24);rows.push({id,platform:'Shopee',title,listingId:id,views:impressions30Days,orders:sales30Days,units:totalSales,revenue:0,price,cost:0,competitorPrice:0,feePercent:0,targetMarginPercent:20,url:'',period:'Captura Shopee',updatedAt:new Date().toISOString(),totalSales,sales30Days,impressions30Days,stock});}
      if(!rows.length)throw new Error('Não consegui separar os produtos nesta imagem. Envie uma captura nítida com as linhas completas e a coluna Performance visível.');
      setItems(prev=>{const map=new Map<string,Listing>(prev.map(x=>[x.platform+'|'+x.listingId,x]));for(const row of rows){const key='Shopee|'+row.listingId;const old=map.get(key)||[...map.values()].find(x=>x.platform==='Shopee'&&x.title===row.title);map.set('Shopee|'+(old?.listingId||row.listingId),old?{...old,...row,id:old.id,listingId:old.listingId,price:row.price||old.price,cost:old.cost,competitorPrice:old.competitorPrice,feePercent:old.feePercent,targetMarginPercent:old.targetMarginPercent}:row)}return [...map.values()]});
      setNotice('Imagem Shopee analisada: '+rows.length+' produto(s) reconhecido(s). Confira os nomes e métricas; OCR pode confundir linhas ou números.');
    } catch(e){setNotice(e instanceof Error?e.message:'Não foi possível analisar a imagem da Shopee.')} finally{setImageBusy(false)}
  };

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
      <section className="rounded-xl border border-orange-900/50 bg-[#1a1309] p-5">
        <div className="flex items-center gap-2"><Upload className="h-5 w-5 text-orange-300"/><h2 className="text-lg font-semibold">Analisar imagem de métricas — Shopee</h2></div>
        <p className="mt-2 text-sm leading-6 text-slate-400">Envie uma captura da lista de produtos da Shopee. O OCR tenta ler vendas acumuladas, vendas dos últimos 30 dias, impressões dos últimos 30 dias, estoque e preço. Confira os dados extraídos, pois imagens pouco nítidas podem gerar erros.</p>
        <label className="mt-4 flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-orange-700 bg-orange-950/20 px-4 py-6 text-center hover:bg-orange-950/40">
          {imageBusy ? <RefreshCw className="mb-2 h-6 w-6 animate-spin text-orange-300"/> : <Upload className="mb-2 h-6 w-6 text-orange-300"/>}
          <span className="font-medium">{imageBusy ? 'Lendo imagem e métricas…' : 'Selecionar imagem da Shopee'}</span>
          <span className="mt-1 text-xs text-slate-400">PNG, JPG ou WEBP • nome do produto e Performance visíveis</span>
          <input className="mt-3 block w-full max-w-md text-sm text-slate-200 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-500 file:px-4 file:py-2 file:font-semibold file:text-black hover:file:bg-orange-400" type="file" accept="image/*" disabled={imageBusy} onChange={e=>{const file=e.currentTarget.files?.[0];if(file){setNotice('Arquivo selecionado: '+file.name+'. Iniciando leitura OCR…');void onShopeeImageUpload(file);}e.currentTarget.value='';}}/>
        </label>
      </section>

      <section className="rounded-xl border border-orange-900/50 bg-[#1a1309] p-5">
        <div className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-orange-300"/><h2 className="text-lg font-semibold">Conectar Shopee</h2></div>
        <p className="mt-2 text-sm leading-6 text-slate-400">Autorize sua loja pela página oficial da Shopee. Depois, sincronize pedidos e faturamento por produto, sem precisar importar planilha. A API padrão não traz visitas nesta consulta.</p>
        <div className={`mt-3 rounded-lg border p-3 text-sm ${shopeeStatus?.connected ? 'border-emerald-800 bg-emerald-950/30 text-emerald-200' : shopeeStatus?.configured ? 'border-amber-800 bg-amber-950/30 text-amber-200' : 'border-slate-700 bg-slate-950/70 text-slate-300'}`}>
          <div className="font-medium">{shopeeStatus?.connected ? 'Shopee conectada' : shopeeStatus?.configured ? 'Pronta para conectar' : 'Configuração pendente'}</div>
          <div className="mt-1 text-xs leading-5">{shopeeStatus?.message || 'Verificando a configuração da integração…'}</div>
        </div>
        <label className="mt-3 block text-xs text-slate-400">Chave administrativa do MarketPreço (configurada no Cloudflare)</label>
        <input type="password" autoComplete="current-password" value={shopeeAdminKey} onChange={e=>setShopeeAdminKey(e.target.value)} placeholder="Chave de acesso da integração" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"/>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-400">Data inicial<input type="date" value={shopeeDateFrom} max={shopeeDateTo} onChange={e=>setShopeeDateFrom(e.target.value)} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"/></label>
          <label className="text-xs text-slate-400">Data final<input type="date" value={shopeeDateTo} min={shopeeDateFrom} max={new Date().toISOString().slice(0,10)} onChange={e=>setShopeeDateTo(e.target.value)} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"/></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={shopeeBusy} onClick={()=>void connectShopee()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-700 px-4 py-2 text-sm font-medium hover:bg-orange-600 disabled:opacity-50">{shopeeBusy?<RefreshCw className="h-4 w-4 animate-spin"/>:<ExternalLink className="h-4 w-4"/>}Conectar minha loja</button>
          <button disabled={shopeeBusy} onClick={()=>void syncShopeeOrders()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-700 px-4 py-2 text-sm font-medium hover:bg-orange-950/60 disabled:opacity-50"><RefreshCw className="h-4 w-4"/>Sincronizar pedidos</button>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Requer app aprovado na Shopee Open Platform e configuração das credenciais e do KV no Cloudflare. A chave administrativa é mantida apenas nesta sessão do navegador. Pedidos sincronizados não incluem visitas nem garantem cálculo líquido de taxas.</p>
      </section>
      <section className="rounded-xl border border-cyan-900/50 bg-[#061a25] p-5">
        <div className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-cyan-300"/><h2 className="text-lg font-semibold">Consultar visitas — Mercado Livre</h2></div>
        <p className="mt-2 text-sm leading-6 text-slate-400">Primeira integração real: consulta de visitas dos seus anúncios pela API oficial. Os IDs precisam estar importados como anúncios do Mercado Livre para atualizar as linhas correspondentes.</p>
        <label className="mt-3 block text-xs text-slate-400">IDs dos anúncios (MLB...)</label>
        <textarea value={mlItemIds} onChange={e=>setMlItemIds(e.target.value)} placeholder="MLB123456789, MLB987654321" rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"/>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-400">Data inicial<input type="date" value={mlDateFrom} max={mlDateTo} onChange={e=>setMlDateFrom(e.target.value)} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"/></label>
          <label className="text-xs text-slate-400">Data final<input type="date" value={mlDateTo} min={mlDateFrom} max={new Date().toISOString().slice(0,10)} onChange={e=>setMlDateTo(e.target.value)} className="mt-1 block w-full rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100"/></label>
        </div>
        <button disabled={mlBusy} onClick={()=>void syncMercadoLivreVisits()} className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium hover:bg-cyan-600 disabled:opacity-50">{mlBusy?<RefreshCw className="h-4 w-4 animate-spin"/>:<RefreshCw className="h-4 w-4"/>}{mlBusy?'Consultando API…':'Consultar visitas'}</button>
        <p className="mt-3 text-xs leading-5 text-slate-500"><Info className="mr-1 inline h-3 w-3"/> Requer o Secret MERCADOLIVRE_ACCESS_TOKEN configurado no Cloudflare Pages. Tokens não são enviados ao navegador. Esta primeira etapa consulta visitas; pedidos, faturamento e renovação OAuth automática ainda não estão implementados. Shopee e TikTok Shop continuam via relatório por enquanto.</p>
      </section>
    </div>
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-[#06141f]">
      <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-semibold">Anúncios importados</h2><p className="text-xs text-slate-400">{visible.length} anúncio(s) na visualização</p></div>
        <div className="flex flex-wrap gap-2">{(['todos','Shopee','TikTok Shop','Mercado Livre'] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`rounded-md border px-2.5 py-1.5 text-xs ${filter===f?'border-cyan-500 bg-cyan-950/40 text-cyan-200':'border-slate-700 text-slate-400'}`}>{f==='todos'?'Todas':f}</button>)}<button onClick={()=>{setItems([]);setNotice('Dados removidos deste navegador.');}} className="rounded-md border border-red-900/60 px-2.5 py-1.5 text-xs text-red-300">Limpar</button></div>
      </div>
      {visible.length===0 ? <div className="p-10 text-center"><BarChart3 className="mx-auto h-8 w-8 text-slate-600"/><p className="mt-3 font-medium">Nenhum anúncio analisado ainda</p><p className="mt-1 text-sm text-slate-500">Importe um relatório de desempenho para começar.</p></div> :
      <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-900/70 text-xs uppercase text-slate-400"><tr>{['Plataforma / anúncio','Impressões / visitas','Vendas (30 dias)','Vendas acumuladas','Estoque','Conversão','Preço atual','Custo','Comissão %','Margem alvo %','Concorrente','Preço sugerido','Diagnóstico'].map(h=><th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{visible.map(x=>{const rec=recommendation(x);const rate=x.views>0?x.orders/x.views*100:0;return <tr key={x.platform+x.id} className="align-top hover:bg-slate-900/40"><td className="max-w-[250px] px-3 py-3"><div className="font-medium text-slate-200">{x.title}</div><div className="mt-1 text-xs text-slate-500">{x.platform} • {x.listingId}</div>{x.url&&<a href={x.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline">Abrir anúncio <ExternalLink className="h-3 w-3"/></a>}</td><td className="px-3 py-3">{(x.impressions30Days ?? x.views).toLocaleString('pt-BR')}</td><td className="px-3 py-3">{(x.sales30Days ?? x.orders).toLocaleString('pt-BR')}</td><td className="px-3 py-3">{(x.totalSales ?? x.units).toLocaleString('pt-BR')}</td><td className="px-3 py-3">{x.stock === undefined ? '—' : x.stock.toLocaleString('pt-BR')}</td><td className="px-3 py-3">{rate.toLocaleString('pt-BR',{maximumFractionDigits:2})}%</td><td className="px-3 py-3"><input aria-label="Preço atual" className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1" value={x.price||''} placeholder="R$" onChange={e=>update(x.id,'price',e.target.value)}/></td><td className="px-3 py-3"><input aria-label="Custo" className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1" value={x.cost||''} placeholder="R$" onChange={e=>update(x.id,'cost',e.target.value)}/></td><td className="px-3 py-3"><input aria-label="Comissão da plataforma em porcentagem" className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1" type="number" min="0" max="99" value={x.feePercent||''} placeholder="%" onChange={e=>update(x.id,'feePercent',e.target.value)}/></td><td className="px-3 py-3"><input aria-label="Margem desejada em porcentagem" className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1" type="number" min="0" max="99" value={x.targetMarginPercent||''} placeholder="20%" onChange={e=>update(x.id,'targetMarginPercent',e.target.value)}/></td><td className="px-3 py-3"><input aria-label="Preço concorrente" className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1" value={x.competitorPrice||''} placeholder="R$" onChange={e=>update(x.id,'competitorPrice',e.target.value)}/></td><td className="px-3 py-3">{rec ? <><div className="font-semibold text-emerald-300">{money(rec.target)}</div>{rec.margin!==null&&<div className="text-xs text-slate-500">Margem após comissão: {rec.margin.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</div>}{rec.invalidRates&&<div className="text-xs text-red-300">Comissão + margem ≥ 100%</div>}</> : <span className="text-xs text-slate-500">Informe preço</span>}</td><td className="px-3 py-3">{rec?.belowCost ? <span className="inline-flex items-center gap-1 text-xs text-red-300"><AlertTriangle className="h-3 w-3"/>Preço competitivo abaixo do piso</span> : x.views>=100&&x.orders===0 ? <span className="inline-flex items-center gap-1 text-xs text-amber-300"><TrendingDown className="h-3 w-3"/>Muitas visitas, sem pedidos</span> : x.orders>0 ? <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 className="h-3 w-3"/>Já converte</span> : <span className="text-xs text-slate-500">Precisa de mais dados</span>}</td></tr>})}</tbody></table></div>}
    </section>
    <p className="text-xs leading-5 text-slate-500">Observação: o sistema compara o menor entre o preço concorrente informado e 5% abaixo do preço atual com o preço mínimo calculado a partir do custo, comissão informada e margem desejada (padrão 20%). Comissão zerada significa que você ainda não informou a taxa; frete, impostos, cupons e outros custos não entram no cálculo. Confirme todos os custos antes de usar a sugestão.</p>
  </div>;
};
