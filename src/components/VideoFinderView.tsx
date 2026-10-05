import React, { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { Video, Search, ExternalLink, Download, CheckCircle2, Circle, ShoppingBag, Clock3, WandSparkles, LoaderCircle, Zap, DownloadCloud } from 'lucide-react';
import { Product, ResearchRecord } from '../types';
import { fetchVideoRecords, saveVideoRecord, saveVideoRecords, CloudVideoRecord } from '../utils/videoRecords';

type SavedVideo = { url: string; videoUrl?: string; platform: string; duration: string; notes?: string; productKey?: string; productName?: string; productSku?: string; productBarcode?: string; productImage?: string };
type SavedMap = Record<string, SavedVideo>;
const KEY = 'marketpreco_video_finder_v2';
const DOWNLOADED_KEY = 'marketpreco_video_downloaded_v1';
const normalizeKeyPart = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const productKey = (product: Product) => {
  const sku = normalizeKeyPart(product.sku);
  const barcode = normalizeKeyPart(product.barcode);
  const identity = sku ? 'sku:' + sku : barcode ? 'barcode:' + barcode : 'name:' + normalizeKeyPart(product.name);
  return 'product:' + identity;
};
const load = (): SavedMap => {
  try {
    const primary = localStorage.getItem(KEY);
    if (primary) return JSON.parse(primary);
    const backup = localStorage.getItem(KEY + '_backup');
    return backup ? JSON.parse(backup) : {};
  } catch {
    try { return JSON.parse(localStorage.getItem(KEY + '_backup') || '{}'); } catch { return {}; }
  }
};

const localStorageSafeLoad = (): SavedMap => {
  try {
    const primary = localStorage.getItem(KEY);
    if (primary) return JSON.parse(primary);
    const backup = localStorage.getItem(KEY + '_backup');
    return backup ? JSON.parse(backup) : {};
  } catch {
    return {};
  }
};

const marketplaceSearchUrl = (name: string, platform: string) => {
  const q = encodeURIComponent(name);
  switch (platform) {
    case 'Shopee': return 'https://shopee.com.br/search?keyword=' + q;
    case 'SHEIN': return 'https://br.shein.com/pdsearch/' + q.replace(/%20/g, '%20');
    case 'TikTok Shop': return 'https://www.tiktok.com/search?q=' + q;
    case 'Mercado Livre': return 'https://lista.mercadolivre.com.br/' + q.replace(/%20/g, '-');
    default: return '';
  }
};
const platformFor = (record: ResearchRecord) => {
  const p = String(record.platform || '').toLowerCase();
  if (p.includes('shopee')) return 'Shopee';
  if (p.includes('shein')) return 'SHEIN';
  if (p.includes('tiktok')) return 'TikTok Shop';
  if (p.includes('mercado livre') || p.includes('mercadolivre')) return 'Mercado Livre';
  return record.platform || 'Marketplace';
};
const marketplaceNames = ['Shopee', 'SHEIN', 'TikTok Shop', 'Mercado Livre'];
const FLOW_EXTENSION_FOLDER = 'https://github.com/contalayka/PesquisaNovo/tree/main/tools/marketpreco-flow-extension';
const buildFlowPrompt = (product: Product) => `Create a premium vertical 10-second marketplace advertisement video for the product "${product.name}". Use the uploaded product image as the EXACT visual reference. Preserve the real product faithfully: shape, colors, packaging, labels, logos, proportions and every visible detail. Keep the product as the main subject. Use smooth premium camera motion, a subtle push-in and gentle rotation, realistic lighting and a clean attractive background. Do not add text, extra products, accessories or features that are not present in the reference image. Photorealistic commercial e-commerce result. 9:16 vertical, 10 seconds, one result, 720p. Use Gemini Omni Flash 1.1.`;

export const VideoFinderView: React.FC<{products: Product[]}> = ({products}) => {
  const found = useMemo(() => products.filter(p => p.status === 'Encontrado'), [products]);
  const [saved, setSaved] = useState<SavedMap>(load);
  const [cloudVideosLoaded, setCloudVideosLoaded] = useState(false);
  const getSaved = (product: Product, map: SavedMap = saved) => map[productKey(product)] || map[product.id];

  React.useEffect(() => {
    let cancelled = false;

    const loadCloudVideos = async () => {
      const cloud = await fetchVideoRecords();
      if (cancelled) return;

      const local = localStorageSafeLoad();
      const merged: SavedMap = { ...(cloud as SavedMap), ...local };

      setSaved(merged);
      try {
        localStorage.setItem(KEY, JSON.stringify(merged));
        localStorage.setItem(KEY + '_backup', JSON.stringify(merged));
      } catch {}

      const records: Record<string, CloudVideoRecord> = {};
      for (const [key, value] of Object.entries(local)) {
        if (cloud[key] || !value) continue;
        const product = products.find(p => productKey(p) === key);
        records[key] = {
          productKey: key,
          productId: product?.id,
          productName: value.productName || product?.name,
          productSku: value.productSku || product?.sku || '',
          productBarcode: value.productBarcode || product?.barcode || '',
          productImage: value.productImage || product?.image || '',
          url: value.url || '',
          videoUrl: value.videoUrl,
          platform: value.platform || 'Shopee',
          duration: value.duration || '10 segundos',
          notes: value.notes || '',
        };
      }
      if (Object.keys(records).length) await saveVideoRecords(records);

      if (!cancelled) setCloudVideosLoaded(true);
    };

    loadCloudVideos().catch(error => {
      console.warn('[Video records] Falha na sincronização inicial:', error);
      if (!cancelled) setCloudVideosLoaded(true);
    });

    return () => { cancelled = true; };
  }, [products]);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('pendentes');
  const [platform, setPlatform] = useState('Todos');
  const [selected, setSelected] = useState<string[]>([]);
  const [downloaded, setDownloaded] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(DOWNLOADED_KEY) || '[]'); } catch { return []; } });
  const [generating, setGenerating] = useState<string[]>([]);
  const [generationMessage, setGenerationMessage] = useState<Record<string,string>>({});
  const [flowExtensionReady, setFlowExtensionReady] = useState(false);
  const [flowQueueRunning, setFlowQueueRunning] = useState(false);
  const [flowQueueMessage, setFlowQueueMessage] = useState('');
  const markDownloaded = (ids: string[]) => setDownloaded(prev => { const next = Array.from(new Set([...prev, ...ids])); try { localStorage.setItem(DOWNLOADED_KEY, JSON.stringify(next)); } catch {} return next; });
  React.useEffect(() => {
    const onFlowMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.source !== 'marketpreco-flow-extension') return;
      if (message.type === 'MARKETPRECO_FLOW_READY') {
        setFlowExtensionReady(true);
        return;
      }
      if (message.type !== 'MARKETPRECO_FLOW_PROGRESS') return;
      const detail = message.detail || {};
      if (detail.status === 'queued') {
        setFlowQueueRunning(true);
        setFlowQueueMessage(detail.message || 'Fila enviada ao Google Flow.');
        return;
      }
      if (detail.status === 'running') {
        setFlowQueueRunning(true);
        setFlowQueueMessage('Gerando: ' + (detail.productName || 'produto') + '…');
        if (detail.productId) setGenerationMessage(prev => ({...prev, [detail.productId]: detail.message || 'Gerando vídeo no Google Flow…'}));
        return;
      }
      if (detail.status === 'completed') {
        setFlowQueueRunning(true);
        setFlowQueueMessage('Concluído: ' + (detail.productName || 'produto') + '. O MP4 foi salvo em Downloads/MARKETPRECO/Google-Flow/.');
        if (detail.productId) {
          setGenerationMessage(prev => ({...prev, [detail.productId]: 'Vídeo gerado e baixado automaticamente pelo Google Flow.'}));
          setGenerating(prev => prev.filter(id => id !== detail.productId));
        }
        return;
      }
      if (detail.status === 'error') {
        setFlowQueueRunning(false);
        setFlowQueueMessage(detail.message || 'Erro na automação do Google Flow.');
        if (detail.productId) {
          setGenerationMessage(prev => ({...prev, [detail.productId]: 'Erro: ' + (detail.message || 'falha na automação do Google Flow')}));
          setGenerating(prev => prev.filter(id => id !== detail.productId));
        }
        return;
      }
      if (detail.status === 'idle') {
        setFlowQueueRunning(false);
        setFlowQueueMessage(detail.message || 'Fila finalizada.');
      }
    };
    window.addEventListener('message', onFlowMessage);
    window.postMessage({source:'marketpreco-app',type:'MARKETPRECO_FLOW_PING'}, window.location.origin);
    return () => window.removeEventListener('message', onFlowMessage);
  }, []);

  const sendToFlowExtension = (items: Product[]) => {
    const valid = items.filter(p => p.image && !generating.includes(p.id));
    if (!valid.length) {
      alert('Selecione produtos que tenham imagem no catálogo.');
      return;
    }
    if (!flowExtensionReady) {
      alert('A extensão MARKETPREÇO • Google Flow não foi detectada nesta página. Vá em chrome://extensions, confirme que ela está ativada e recarregue esta página (Ctrl+F5).');
      return;
    }
    const payload = valid.map(p => ({id:p.id,name:p.name,image:p.image,prompt:buildFlowPrompt(p)}));
    setFlowQueueRunning(true);
    setFlowQueueMessage(payload.length + ' produto(s) sendo enviados para o Google Flow…');
    setGenerating(prev => Array.from(new Set([...prev, ...payload.map(p => p.id)])));
    window.postMessage({source:'marketpreco-app',type:'MARKETPRECO_FLOW_BATCH',products:payload}, window.location.origin);
  };

  const rows = useMemo(() => found.filter(p => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    const s = getSaved(p);
    return (!q || p.name.toLocaleLowerCase('pt-BR').includes(q) || String(p.sku || '').toLocaleLowerCase('pt-BR').includes(q)) &&
      (filter === 'todos' || (filter === 'pendentes' ? !s?.url : filter === 'baixados' ? downloaded.includes(p.id) : filter === 'com_video' ? !!s?.url : !s?.url)) &&
      (platform === 'Todos' || s?.platform === platform);
  }), [found, query, filter, saved, platform, downloaded]);
  const count = found.filter(p => getSaved(p)?.url?.trim()).length;
  const update = (id: string, patch: Partial<SavedVideo>) => {
    const product = products.find(p => p.id === id);
    if (!product) return;

    setSaved(prev => {
      const key = productKey(product);
      const current = getSaved(product, prev) || {url:'', platform:'Shopee', duration:'10 segundos', notes:''};
      const next = {
        ...prev,
        [key]: {
          ...current,
          ...patch,
          productKey: key,
          productName: product.name,
          productSku: product.sku || '',
          productBarcode: product.barcode || '',
          productImage: product.image || ''
        }
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
        localStorage.setItem(KEY + '_backup', JSON.stringify(next));
      } catch {}

      const record = next[key];
      void saveVideoRecord({
        productKey: key,
        productId: product.id,
        productName: product.name,
        productSku: product.sku || '',
        productBarcode: product.barcode || '',
        productImage: product.image || '',
        url: record.url || '',
        videoUrl: record.videoUrl,
        platform: record.platform || 'Shopee',
        duration: record.duration || '10 segundos',
        notes: record.notes || '',
      });

      return next;
    });
  };

  const downloadVideo = async (id: string) => {
    const url = getSaved(found.find(p => p.id === id) as Product)?.videoUrl?.trim();
    if (!url) { alert('Cole primeiro o link direto do arquivo de vídeo (.mp4 ou similar). O link da página do anúncio não é o arquivo do vídeo.'); return; }
    if (!/^https?:\/\//i.test(url)) { alert('Informe uma URL http:// ou https:// válida para o arquivo de vídeo.'); return; }
    const filename = (found.find(p=>p.id===id)?.name || 'video').replace(/[^a-z0-9-_ ]/gi,'').trim().replace(/\s+/g,'_') + '.mp4';
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const blob = await response.blob();
      if (!blob.size) throw new Error('Arquivo vazio');
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      markDownloaded([id]);
    } catch (error) {
      console.error('Falha ao baixar vídeo:', error);
      alert('O navegador não conseguiu baixar este vídeo diretamente. O servidor pode bloquear o acesso externo (CORS) ou exigir uma sessão da plataforma. Use o link direto do arquivo .mp4, ou baixe pelo anúncio/extensão do marketplace. O sistema não abriu outra aba porque isso não seria um download.');
    }
  };
  const downloadSelected = async () => {
    const ids = selected.filter(id => { const product = found.find(p => p.id === id); return !!(product && getSaved(product)?.videoUrl?.trim()) && !downloaded.includes(id); });
    if (!ids.length) { alert('Nenhum vídeo novo com link direto está selecionado. Os vídeos já baixados são ignorados para evitar baixar novamente.'); return; }
    if (ids.length === 1) { await downloadVideo(ids[0]); return; }
    const zip = new JSZip();
    const failures: string[] = [];
    const succeeded: string[] = [];
    for (const id of ids) {
      const product = found.find(p => p.id === id);
      const url = product ? getSaved(product)?.videoUrl?.trim() : '';
      const productName = product?.name || 'video';
      const filename = productName.replace(/[^a-z0-9-_ ]/gi,'').trim().replace(/\s+/g,'_') || 'video';
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const blob = await response.blob();
        if (!blob.size) throw new Error('Arquivo vazio');
        zip.file(filename + '.mp4', blob);
        succeeded.push(id);
      } catch (error) {
        console.error('Falha ao incluir vídeo no ZIP:', productName, error);
        failures.push(productName);
      }
    }
    if (!Object.keys(zip.files).length) {
      alert('Não foi possível baixar nenhum vídeo. Os servidores podem bloquear o acesso externo (CORS). Tente usar os links diretos dos arquivos de vídeo.');
      return;
    }
    try {
      const blob = await zip.generateAsync({type:'blob'});
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = 'MARKETPRECO_videos_selecionados.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
      markDownloaded(succeeded);
      if (failures.length) alert('O ZIP foi criado, mas ' + failures.length + ' vídeo(s) não puderam ser incluídos por bloqueio do servidor: ' + failures.join(', '));
    } catch (error) {
      console.error('Falha ao criar ZIP:', error);
      alert('Não foi possível montar o ZIP. Tente baixar menos vídeos por vez.');
    }
  };

  const generateProductVideo = async (product: Product) => {
    sendToFlowExtension([product]);
  };

  const selectAllVisible = () => setSelected(rows.filter(p=>!downloaded.includes(p.id)).map(p=>p.id));
  const exportCsv = () => {
    const data = [['Produto','SKU','Status','Marketplace','Duração aproximada','Link do anúncio com vídeo','Observações'], ...found.map(p => { const s = getSaved(p); return [p.name,p.sku || '',s?.url ? 'Revisado' : 'Pendente',s?.platform || '',s?.duration || '',s?.url || '',s?.notes || '']; })];
    const csv = '\uFEFF' + data.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g,'""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a'); const u = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})); a.href=u; a.download='MARKETPRECO_videos_marketplaces.csv'; a.click(); URL.revokeObjectURL(u);
  };
  const openResearchListing = (record: ResearchRecord) => {
    if (record.url) window.open(record.url, '_blank', 'noopener,noreferrer');
  };
  return <div className="mx-auto max-w-7xl space-y-5 pb-12">
    <section className="rounded-2xl border border-violet-900/50 bg-gradient-to-br from-[#17152b] to-[#101522] p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-300"><Video className="h-4 w-4"/> MARKETPREÇO • CENTRAL DE VÍDEOS</div><h1 className="text-2xl font-bold text-white sm:text-3xl">Vídeos dos anúncios dos marketplaces</h1><p className="mt-2 max-w-3xl text-sm text-slate-300">Encontre anúncios do mesmo produto nos marketplaces e confira se eles têm vídeo curto, geralmente de 10 segundos. Use primeiro os anúncios já encontrados no seu catálogo.</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>sendToFlowExtension(found.filter(p=>selected.includes(p.id)))} disabled={flowQueueRunning || selected.length===0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-fuchsia-700 px-4 py-3 text-sm font-semibold text-white hover:bg-fuchsia-600 disabled:cursor-not-allowed disabled:opacity-50"><Zap className="h-4 w-4"/> Gerar selecionados no Google Flow ({selected.length})</button><button onClick={downloadSelected} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600"><Download className="h-4 w-4"/> Baixar vídeos selecionados ({selected.length})</button><button onClick={exportCsv} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500"><Download className="h-4 w-4"/> Exportar CSV</button></div></div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{([['Produtos encontrados',found.length,'text-white'],['Anúncios com link de vídeo',count,'text-emerald-300'],['Pendentes de verificação',found.length-count,'text-amber-300'],['Lista filtrada',rows.length,'text-violet-300']] as const).map(([label,n,color])=><div key={String(label)} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-xs text-slate-400">{label}</div><div className={'mt-1 text-2xl font-bold '+color}>{n}</div></div>)}</div>
    </section>
    <section className="rounded-2xl border border-slate-800 bg-[#121824] p-4 sm:p-5"><h2 className="mb-3 flex items-center gap-2 font-semibold text-white"><Search className="h-4 w-4 text-violet-300"/> Mostrar anúncios com vídeo</h2><div className="grid gap-3 sm:grid-cols-[1fr_220px]"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Filtrar nome ou SKU..." className="min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500"/><select value={platform} onChange={e=>setPlatform(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"><option>Todos</option>{marketplaceNames.map(p=><option key={p}>{p}</option>)}</select></div><p className="mt-2 text-xs text-slate-500">{flowExtensionReady ? "Automação Google Flow: conectada ao Chrome." : "Automação Google Flow: instale a extensão local para gerar sem salvar/uploadar imagens manualmente."} A lista mostra os produtos encontrados que ainda precisam ser verificados. Abra os anúncios nos marketplaces e salve o link somente quando confirmar que há vídeo. A busca não usa YouTube nem Google.</p></section>
    <div className="flex flex-wrap items-center gap-2"><button onClick={selectAllVisible} className="rounded-full border border-emerald-800 px-3 py-1.5 text-xs font-semibold text-emerald-200">Selecionar todos visíveis</button><button onClick={()=>sendToFlowExtension(rows)} disabled={flowQueueRunning || !rows.some(p=>p.image)} className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-700 bg-fuchsia-950/30 px-3 py-1.5 text-xs font-semibold text-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-50"><Zap className="h-3.5 w-3.5"/> Gerar lista visível no Flow</button><button onClick={()=>setSelected([])} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300">Limpar seleção</button>{[['com_video','Somente anúncios com vídeo confirmado'],['pendentes','Pendentes de verificação'],['baixados','Vídeos baixados'],['todos','Todos os produtos']].map(([v,l])=><button key={v} onClick={()=>setFilter(v)} className={'rounded-full border px-3 py-1.5 text-xs font-semibold '+(filter===v?'border-violet-500 bg-violet-600/20 text-violet-200':'border-slate-700 bg-[#121824] text-slate-400')}>{l}</button>)}</div>
    {flowQueueMessage && <div className={"rounded-xl border p-3 text-xs "+(flowQueueRunning ? "border-fuchsia-800 bg-fuchsia-950/20 text-fuchsia-200" : "border-slate-700 bg-[#121824] text-slate-300")}><div className="flex items-center gap-2"><DownloadCloud className="h-4 w-4"/><span>{flowQueueMessage}</span>{flowQueueRunning && <LoaderCircle className="h-3.5 w-3.5 animate-spin"/>}</div></div>}
    {!found.length ? <div className="rounded-xl border border-dashed border-slate-700 bg-[#121824] p-10 text-center"><Video className="mx-auto mb-3 h-8 w-8 text-slate-500"/><h3 className="font-semibold text-white">Nenhum produto marcado como Encontrado</h3><p className="mt-1 text-sm text-slate-400">Marque produtos como Encontrado na lista principal para aparecerem aqui.</p></div> : !rows.length ? <div className="rounded-xl border border-slate-800 bg-[#121824] p-8 text-center text-sm text-slate-400">Nenhum produto corresponde aos filtros atuais. Tente “Todos os produtos” ou ajuste a busca e o marketplace.</div> : <div className="space-y-3">{rows.map((p,i)=>{const rec=getSaved(p) || {url:'',platform:'Shopee',duration:'10 segundos',notes:''};const researchLinks=(p.research_records || []).filter(r=>r.url);return <article key={p.id} className="rounded-xl border border-slate-800 bg-[#121824] p-4"><div className="flex flex-col gap-4"><div className="flex min-w-0 gap-3"><input aria-label={'Selecionar '+p.name} type="checkbox" checked={selected.includes(p.id)} onChange={e=>setSelected(prev=>e.target.checked?(prev.includes(p.id)?prev:[...prev,p.id]):prev.filter(id=>id!==p.id))} className="mt-1 h-4 w-4 accent-emerald-500"/>{p.image ? <img src={p.image} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-slate-700 bg-slate-900 object-contain" onError={e=>{e.currentTarget.style.display='none'}}/> : <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-700 bg-slate-900"><Video className="h-6 w-6 text-slate-600"/></div>}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{p.name}</h3>{downloaded.includes(p.id)?<span className="inline-flex items-center gap-1 rounded-full bg-sky-950/60 px-2 py-1 text-[10px] font-bold text-sky-300"><CheckCircle2 className="h-3 w-3"/> VÍDEO BAIXADO</span>:rec.url?<span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 px-2 py-1 text-[10px] font-bold text-emerald-300"><CheckCircle2 className="h-3 w-3"/> LINK REVISADO</span>:<span className="inline-flex items-center gap-1 rounded-full bg-amber-950/50 px-2 py-1 text-[10px] font-bold text-amber-300"><Circle className="h-3 w-3"/> PENDENTE</span>}</div><p className="mt-1 text-xs text-slate-500">SKU: {p.sku || 'Não informado'}</p></div></div>
      {researchLinks.length>0 && <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3"><p className="mb-2 text-xs font-semibold text-emerald-200">Anúncios que você já encontrou</p><div className="flex flex-wrap gap-2">{researchLinks.map((r,idx)=><button key={r.id || idx} onClick={()=>openResearchListing(r)} className="inline-flex items-center gap-1 rounded-md border border-emerald-900 px-2.5 py-1.5 text-xs text-emerald-100 hover:bg-emerald-900/40"><ExternalLink className="h-3 w-3"/>{platformFor(r)}{r.store ? ' · '+r.store : ''}</button>)}</div></div>}
      <div><p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><ShoppingBag className="h-4 w-4 text-violet-300"/> Procurar o produto dentro dos marketplaces ou gerar um vídeo</p><div className="flex flex-wrap gap-2"><button onClick={()=>generateProductVideo(p)} disabled={generating.includes(p.id)||!p.image||flowQueueRunning} title={!p.image ? "Adicione uma imagem ao produto para gerar o vídeo" : flowExtensionReady ? "Enviar automaticamente ao Google Flow usando sua conta local" : "Instale a extensão local do MARKETPREÇO para automatizar o Google Flow"} className="inline-flex items-center gap-1.5 rounded-md border border-fuchsia-500/70 bg-fuchsia-700 px-3 py-2 text-xs font-bold text-white hover:bg-fuchsia-600 disabled:cursor-not-allowed disabled:opacity-50">{generating.includes(p.id)?<LoaderCircle className="h-3.5 w-3.5 animate-spin"/>:<WandSparkles className="h-3.5 w-3.5"/>}{generating.includes(p.id)?"Na fila do Flow…":"Gerar no Google Flow"}</button>{p.image && <a target="_blank" rel="noreferrer" href={`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(p.image)}`} className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/70 bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500"><Search className="h-3.5 w-3.5"/> Google Lens · Buscar pela foto</a>}{marketplaceNames.map(m=><a key={m} target="_blank" rel="noreferrer" href={marketplaceSearchUrl(p.name,m)} className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:border-violet-500 hover:text-white"><ExternalLink className="h-3 w-3"/>{m}</a>)}</div>{generationMessage[p.id] && <p className="mt-2 text-xs text-fuchsia-200">{generationMessage[p.id]}</p>}</div>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_180px_180px]"><div><label className="mb-1 block text-xs font-medium text-slate-400">Link do anúncio que contém o vídeo curto</label><input value={rec.url} onChange={e=>update(p.id,{url:e.target.value})} placeholder="Cole o link do anúncio do marketplace..." className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600"/></div><div><label className="mb-1 block text-xs font-medium text-emerald-300">Link direto do arquivo de vídeo (para baixar)</label><input value={rec.videoUrl || ''} onChange={e=>update(p.id,{videoUrl:e.target.value})} placeholder="Cole a URL direta do vídeo, se disponível..." className="w-full rounded-lg border border-emerald-900 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600"/><button onClick={()=>downloadVideo(p.id)} disabled={!rec.videoUrl?.trim()} className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Download className="h-3 w-3"/> Baixar vídeo</button>{rec.videoUrl?.trim() && <video controls playsInline preload="metadata" src={rec.videoUrl} className="mt-3 max-h-72 w-full rounded-lg border border-slate-700 bg-black" />}</div><div><label className="mb-1 block text-xs font-medium text-slate-400">Marketplace</label><select value={rec.platform} onChange={e=>update(p.id,{platform:e.target.value})} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white">{marketplaceNames.map(m=><option key={m}>{m}</option>)}</select></div><div><label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-400"><Clock3 className="h-3 w-3"/> Duração do vídeo</label><select value={rec.duration} onChange={e=>update(p.id,{duration:e.target.value})} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"><option>Até 10 segundos</option><option>10 segundos</option><option>11–15 segundos</option><option>Mais de 15 segundos</option><option>Não confirmado</option></select></div></div>
      <div className="flex flex-col gap-2 sm:flex-row"><input value={rec.notes || ''} onChange={e=>update(p.id,{notes:e.target.value})} placeholder="Observação: modelo, cor, vendedor ou onde aparece o vídeo..." className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600"/><button onClick={()=>rec.url.trim()&&window.open(rec.url.trim(),'_blank','noopener,noreferrer')} disabled={!rec.url.trim()} className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Abrir anúncio salvo</button><span className="self-center text-[11px] text-slate-500">Produto {i+1} de {rows.length}</span></div>
    </div></article>})}</div>}
    <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-xs leading-relaxed text-amber-100/80"><strong className="text-amber-200">Importante:</strong> os marketplaces não oferecem um método público universal para localizar e extrair automaticamente o arquivo de vídeo de qualquer anúncio. Esta tela guarda o link do anúncio com vídeo e permite baixar vídeos quando você informar uma URL direta do arquivo. O link da página do anúncio, sozinho, não é um arquivo de vídeo; as plataformas podem bloquear downloads automáticos ou exigir integração autorizada. A tela não altera anúncios no UpSeller automaticamente. Reutilize somente conteúdo que você tenha autorização para usar.</div>
  </div>;
};
