import React, { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { Video, Search, ExternalLink, Download, CheckCircle2, Clock3 } from 'lucide-react';
import { Product, ResearchRecord } from '../types';
import { fetchVideoRecords, saveVideoRecord, saveVideoRecords, deleteVideoRecord, markVideoDownloaded, CloudVideoRecord } from '../utils/videoRecords';
import { getSupabaseClient } from '../utils/supabase';

type SavedVideo = CloudVideoRecord;
type SavedMap = Record<string, SavedVideo[]>;
const KEY = 'marketpreco_video_finder_v2';
const platforms = ['Shopee', 'SHEIN', 'TikTok Shop', 'Mercado Livre'];

const normalize = (v: unknown) => String(v ?? '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const productKey = (p: Product) => {
  const sku = normalize(p.sku), barcode = normalize(p.barcode);
  return 'product:' + (sku ? 'sku:' + sku : barcode ? 'barcode:' + barcode : 'name:' + normalize(p.name));
};
const loadLocal = (): SavedMap => {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(KEY + '_backup');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SavedVideo | SavedVideo[]>;
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));
  } catch { return {}; }
};
const persist = (map: SavedMap) => {
  try { localStorage.setItem(KEY, JSON.stringify(map)); localStorage.setItem(KEY + '_backup', JSON.stringify(map)); } catch {}
};
const marketplaceSearchUrl = (name: string, platform: string) => {
  const q = encodeURIComponent(name);
  if (platform === 'Shopee') return 'https://shopee.com.br/search?keyword=' + q;
  if (platform === 'SHEIN') return 'https://br.shein.com/pdsearch/' + q;
  if (platform === 'TikTok Shop') return 'https://www.tiktok.com/search?q=' + q;
  if (platform === 'Mercado Livre') return 'https://lista.mercadolivre.com.br/' + q.replace(/%20/g, '-');
  return '';
};
const platformFor = (r: ResearchRecord) => {
  const p = String(r.platform || '').toLowerCase();
  if (p.includes('shopee')) return 'Shopee';
  if (p.includes('shein')) return 'SHEIN';
  if (p.includes('tiktok')) return 'TikTok Shop';
  if (p.includes('mercado livre') || p.includes('mercadolivre')) return 'Mercado Livre';
  return r.platform || 'Marketplace';
};
const newRecord = (p: Product): SavedVideo => ({
  id: crypto.randomUUID(),
  productKey: productKey(p), productId: p.id, productName: p.name, productSku: p.sku || '',
  productBarcode: p.barcode || '', productImage: p.image || '', url: '', videoUrl: '',
  platform: 'Shopee', duration: '10 segundos', notes: ''
});

export const VideoFinderView: React.FC<{ products: Product[] }> = ({ products }) => {
  const found = useMemo(() => products.filter(p => p.status === 'Encontrado'), [products]);
  const [saved, setSaved] = useState<SavedMap>(loadLocal);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('pendentes');
  const [platform, setPlatform] = useState('Todos');
  const [selected, setSelected] = useState<string[]>([]);
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState('');
  const [downloaded, setDownloaded] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cloud = await fetchVideoRecords();
      if (cancelled) return;
      const local = loadLocal();
      const merged: SavedMap = { ...local };
      for (const [key, records] of Object.entries(cloud)) {
        const byId = new Map((merged[key] || []).map(r => [r.id || [r.platform, r.url, r.videoUrl].join('|'), r]));
        for (const r of records) byId.set(r.id || [r.platform, r.url, r.videoUrl].join('|'), r);
        merged[key] = Array.from(byId.values());
      }
      setSaved(merged); persist(merged);
      setDownloaded(Object.values(merged).flat().filter(v => v.id && v.downloaded).map(v => v.id as string));
      const missing: CloudVideoRecord[] = [];
      for (const [key, records] of Object.entries(local)) {
        if (cloud[key]?.length) continue;
        missing.push(...records.map(r => ({ ...r, productKey: key })));
      }
      if (missing.length) await saveVideoRecords(missing);
    })().catch(console.warn);
    return () => { cancelled = true; };
  }, []);

  const getVideos = (p: Product, map = saved) => map[productKey(p)] || [];
  const visible = useMemo(() => found.filter(p => {
    const q = normalize(query);
    const videos = getVideos(p);
    const hasVideo = videos.some(v => v.url?.trim() || v.videoUrl?.trim());
    const hasDownloaded = videos.some(v => v.id && downloaded.includes(v.id));
    return (!q || normalize(p.name).includes(q) || normalize(p.sku).includes(q)) &&
      (filter === 'todos' || (filter === 'pendentes' ? !hasVideo : filter === 'com_video' ? hasVideo : hasDownloaded)) &&
      (platform === 'Todos' || videos.some(v => v.platform === platform));
  }), [found, query, filter, platform, saved, downloaded]);

  const videoCount = Object.values(saved).reduce((n, list) => n + list.filter(v => v.url?.trim() || v.videoUrl?.trim()).length, 0);

  const addVideo = (p: Product) => {
    const record = newRecord(p);
    setSaved(prev => {
      const key = productKey(p), next = { ...prev, [key]: [...(prev[key] || []), record] };
      persist(next); void saveVideoRecord(record); return next;
    });
  };
  const updateVideo = (p: Product, record: SavedVideo, patch: Partial<SavedVideo>) => {
    setSaved(prev => {
      const key = productKey(p), nextList = (prev[key] || []).map(v => v.id === record.id ? { ...v, ...patch } : v);
      const next = { ...prev, [key]: nextList }; persist(next);
      const updated = nextList.find(v => v.id === record.id); if (updated) void saveVideoRecord(updated);
      return next;
    });
  };
  const removeVideo = (p: Product, record: SavedVideo) => {
    setSaved(prev => {
      const key = productKey(p), next = { ...prev, [key]: (prev[key] || []).filter(v => v.id !== record.id) };
      persist(next); return next;
    });
    if (record.id) void deleteVideoRecord(record.id);
  };

  const scanProduct = async (p: Product) => {
    const client = getSupabaseClient();
    if (!client) { alert('Supabase não está conectado.'); return 0; }
    setScanning(p.id);
    setScanMessage('Procurando anúncios e conferindo vídeos reais...');
    try {
      const { data, error } = await client.functions.invoke('marketplace-video-scan', {
        body: { productName: p.name, productImage: p.image || '', platforms, maxCandidates: 20 }
      });
      if (error) throw error;
      const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
      const existing = getVideos(p);
      const seen = new Set(existing.map(v => (v.url || '') + '|' + (v.videoUrl || '')));
      const fresh: SavedVideo[] = candidates
        .filter((x: any) => x?.adUrl && x?.videoUrl)
        .filter((x: any) => !seen.has(String(x.adUrl) + '|' + String(x.videoUrl)))
        .map((x: any) => ({
          id: crypto.randomUUID(),
          productKey: productKey(p),
          productId: p.id,
          productName: p.name,
          productSku: p.sku || '',
          productBarcode: p.barcode || '',
          productImage: p.image || '',
          url: String(x.adUrl),
          videoUrl: String(x.videoUrl),
          platform: String(x.platform || 'Marketplace'),
          duration: 'Não confirmado',
          notes: 'Encontrado automaticamente em anúncio real.'
        }));
      if (fresh.length) {
        const next = { ...saved, [productKey(p)]: [...existing, ...fresh] };
        setSaved(next); persist(next);
        const result = await saveVideoRecords(fresh);
        if (result.error) throw new Error(result.error);
      }
      setScanMessage(fresh.length ? `${fresh.length} vídeo(s) real(is) encontrado(s).` : 'Nenhum anúncio com vídeo direto foi encontrado nesta rodada.');
      return fresh.length;
    } catch (e) {
      setScanMessage(e instanceof Error ? e.message : 'Falha na busca automática.');
      return 0;
    } finally {
      setTimeout(() => setScanning(current => current === p.id ? null : current), 700);
    }
  };

  const scanPending = async () => {
    const targets = visible.filter(p => !getVideos(p).some(v => v.url?.trim() || v.videoUrl?.trim()));
    if (!targets.length) { alert('Não há produtos pendentes nesta lista.'); return; }
    setScanMessage('Busca sequencial iniciada...');
    let total = 0;
    for (const p of targets) {
      total += await scanProduct(p);
      if (total >= 5) break;
    }
    setScanMessage(`Busca concluída: ${total} vídeo(s) real(is) novo(s).`);
  };
  const markDownloaded = (ids: string[]) => {
    if (!ids.length) return;
    setDownloaded(prev => Array.from(new Set([...prev, ...ids])));
    setSaved(prev => {
      const next: SavedMap = Object.fromEntries(Object.entries(prev).map(([key, records]) => [key, records.map(v => ids.includes(v.id || '') ? { ...v, downloaded: true } : v)]));
      persist(next);
      void saveVideoRecords(ids.flatMap(id => Object.values(next).flat().filter(v => v.id === id)));
      return next;
    });
  };

  const downloadOne = async (p: Product, v: SavedVideo) => {
    if (!v.videoUrl?.trim()) { alert('Este registro ainda não possui a URL direta do arquivo de vídeo.'); return; }
    try {
      const response = await fetch(v.videoUrl);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const blob = await response.blob();
      const a = document.createElement('a'), name = normalize(p.name).replace(/[^a-z0-9-_]+/g, '_') || 'video';
      a.href = URL.createObjectURL(blob); a.download = name + '.mp4'; a.click();
      markDownloaded(v.id ? [v.id] : []);
    } catch { alert('O download direto foi bloqueado pelo servidor do vídeo. O link do anúncio continua salvo.'); }
  };
  const downloadSelected = async () => {
    const items: { p: Product; v: SavedVideo }[] = [];
    for (const p of found) for (const v of getVideos(p)) if (selected.includes(v.id || '') && v.videoUrl?.trim() && !downloaded.includes(v.id || '')) items.push({ p, v });
    if (!items.length) { alert('Selecione vídeos com URL direta que ainda não foram baixados.'); return; }
    if (items.length === 1) return downloadOne(items[0].p, items[0].v);
    const zip = new JSZip(), done: string[] = [];
    for (const { p, v } of items) {
      try {
        const res = await fetch(v.videoUrl!); if (!res.ok) continue;
        const blob = await res.blob();
        zip.file((normalize(p.name).replace(/[^a-z0-9-_]+/g, '_') || 'video') + '_' + (v.id || Date.now()) + '.mp4', blob);
        if (v.id) done.push(v.id);
      } catch {}
    }
    if (!Object.keys(zip.files).length) { alert('Nenhum vídeo pôde ser baixado. O servidor pode bloquear acesso externo.'); return; }
    const blob = await zip.generateAsync({ type: 'blob' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'MARKETPRECO_videos_selecionados.zip'; a.click(); markDownloaded(done);
  };
  const exportCsv = () => {
    const rows = [['Produto','SKU','Marketplace','Link do anúncio','Link direto do vídeo','Duração','Observações']];
    for (const p of found) for (const v of getVideos(p)) rows.push([p.name, p.sku || '', v.platform, v.url || '', v.videoUrl || '', v.duration || '', v.notes || '']);
    const csv = '\uFEFF' + rows.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'MARKETPRECO_videos_marketplaces.csv'; a.click();
  };

  return <div className="mx-auto max-w-7xl space-y-5 pb-12">
    <section className="rounded-2xl border border-violet-900/50 bg-gradient-to-br from-[#17152b] to-[#101522] p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-300"><Video className="h-4 w-4"/> MARKETPREÇO • CENTRAL DE VÍDEOS</div><h1 className="text-2xl font-bold text-white sm:text-3xl">Vídeos dos anúncios dos marketplaces</h1><p className="mt-2 max-w-3xl text-sm text-slate-300">Encontre anúncios reais do mesmo produto e salve todos os vídeos encontrados. A Central não gera vídeos por IA.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={scanPending} disabled={!!scanning} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Search className="h-4 w-4"/>{scanning ? "Conferindo..." : "Buscar vídeos reais"}</button><button onClick={downloadSelected} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"><Download className="h-4 w-4"/> Baixar selecionados</button><button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white">Exportar CSV</button></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Produtos encontrados', found.length], ['Vídeos salvos', videoCount], ['Pendentes', found.filter(p => !getVideos(p).some(v => v.url?.trim() || v.videoUrl?.trim())).length], ['Na lista', visible.length]].map(([label,n]) => <div key={String(label)} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-xs text-slate-400">{label}</div><div className="mt-1 text-2xl font-bold text-white">{n}</div></div>)}</div>
      {scanMessage && <div className="mt-3 rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">{scanMessage}</div>}
    </section>

    <section className="rounded-2xl border border-slate-800 bg-[#121824] p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filtrar nome ou SKU..." className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"/><select value={platform} onChange={e => setPlatform(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"><option>Todos</option>{platforms.map(p => <option key={p}>{p}</option>)}</select></div>
      <p className="mt-2 text-xs text-slate-500">Busca e conferência usam somente anúncios reais de Shopee, SHEIN, TikTok Shop e Mercado Livre. Não usa YouTube nem geração de vídeo.</p>
    </section>

    <div className="flex flex-wrap items-center gap-2">
      {[
        ['pendentes','Novos',found.filter(p => getVideos(p).length > 0 && getVideos(p).some(v => !v.downloaded)).length],
        ['com_video','Com vídeo',found.filter(p => getVideos(p).some(v => v.url?.trim() || v.videoUrl?.trim())).length],
        ['baixados','Já baixados',found.filter(p => getVideos(p).some(v => v.downloaded)).length],
        ['todos','Todos',found.length]
      ].map(([f,label,count]) => <button key={String(f)} onClick={() => setFilter(String(f))} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === f ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>{label} <span className="ml-1 opacity-70">{count}</span></button>)}
      <button onClick={() => setSelected([])} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300">Limpar seleção</button>
    </div>

    <div className="space-y-4">{visible.map(p => {
      const videos = getVideos(p), researchLinks = (p.research_records || []).filter(r => r.url);
      return <article key={p.id} className="rounded-xl border border-slate-800 bg-[#121824] p-4">
        <div className="flex gap-3">{p.image ? <img src={p.image} alt="" className="h-16 w-16 rounded-lg border border-slate-700 bg-slate-900 object-contain"/> : <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-700"><Video className="h-6 w-6 text-slate-600"/></div>}<div className="min-w-0 flex-1"><h3 className="font-semibold text-white">{p.name}</h3><p className="text-xs text-slate-500">SKU: {p.sku || 'Não informado'} · {videos.length} vídeo(s) salvo(s)</p></div></div>

        <div className="mt-4 flex flex-wrap gap-2">
          {p.image && <a target="_blank" rel="noreferrer" href={'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(p.image)} className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/70 bg-blue-600 px-3 py-2 text-xs font-bold text-white"><Search className="h-3.5 w-3.5"/> Buscar pela foto</a>}
          {platforms.map(m => <a key={m} target="_blank" rel="noreferrer" href={marketplaceSearchUrl(p.name, m)} className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200"><ExternalLink className="h-3 w-3"/>{m}</a>)}
          <button onClick={() => scanProduct(p)} disabled={scanning === p.id} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Search className="h-3.5 w-3.5"/>{scanning === p.id ? "Conferindo..." : "Buscar vídeos reais"}</button><button onClick={() => addVideo(p)} className="inline-flex items-center gap-1.5 rounded-md bg-violet-700 px-3 py-2 text-xs font-bold text-white">+ Adicionar outro vídeo</button>
        </div>

        {researchLinks.length > 0 && <div className="mt-4 rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3"><p className="mb-2 text-xs font-semibold text-emerald-200">Anúncios já encontrados</p><div className="flex flex-wrap gap-2">{researchLinks.map((r, i) => <button key={r.id || i} onClick={() => window.open(r.url, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-md border border-emerald-900 px-2.5 py-1.5 text-xs text-emerald-100"><ExternalLink className="h-3 w-3"/>{platformFor(r)}</button>)}</div></div>}

        {videos.length === 0 && <div className="mt-4 rounded-lg border border-dashed border-slate-700 p-5 text-center text-sm text-slate-500">Nenhum vídeo salvo para este produto.</div>}
        <div className="mt-4 space-y-3">{videos.map((v, index) => <div key={v.id || index} className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className={`flex items-center gap-2 text-xs font-semibold ${v.downloaded ? 'text-sky-300' : 'text-emerald-300'}`}><CheckCircle2 className="h-4 w-4"/> VÍDEO {index + 1} {v.downloaded ? '• JÁ BAIXADO' : '• NOVO'}</div><button onClick={() => removeVideo(p, v)} className="text-xs text-red-400">Remover registro</button></div>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_170px_170px]">
            <div><label className="mb-1 block text-xs text-slate-400">Link do anúncio com vídeo</label><input value={v.url || ''} onChange={e => updateVideo(p, v, { url: e.target.value })} placeholder="https://..." className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"/></div>
            <div><label className="mb-1 block text-xs text-emerald-300">Link direto do vídeo</label><input value={v.videoUrl || ''} onChange={e => updateVideo(p, v, { videoUrl: e.target.value })} placeholder="URL .mp4 ou arquivo de vídeo" className="w-full rounded-lg border border-emerald-900 bg-slate-900 px-3 py-2.5 text-sm text-white"/>{v.videoUrl && <video controls playsInline preload="metadata" src={v.videoUrl} className="mt-2 max-h-64 w-full rounded-lg bg-black"/>}</div>
            <div><label className="mb-1 block text-xs text-slate-400">Marketplace</label><select value={v.platform} onChange={e => updateVideo(p, v, { platform: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white">{platforms.map(m => <option key={m}>{m}</option>)}</select></div>
            <div><label className="mb-1 flex items-center gap-1 text-xs text-slate-400"><Clock3 className="h-3 w-3"/> Duração</label><select value={v.duration} onChange={e => updateVideo(p, v, { duration: e.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"><option>Até 10 segundos</option><option>10 segundos</option><option>11–15 segundos</option><option>Mais de 15 segundos</option><option>Não confirmado</option></select></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => v.url && window.open(v.url, '_blank', 'noopener,noreferrer')} disabled={!v.url} className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Abrir anúncio</button><button onClick={() => downloadOne(p, v)} disabled={!v.videoUrl} className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Download className="h-3 w-3"/> Baixar</button><label className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300"><input type="checkbox" checked={selected.includes(v.id || '')} onChange={e => setSelected(s => e.target.checked ? [...new Set([...s, v.id || ''])] : s.filter(id => id !== v.id))} disabled={!v.videoUrl} className="accent-emerald-500"/> Selecionar para ZIP</label></div>
          <input value={v.notes || ''} onChange={e => updateVideo(p, v, { notes: e.target.value })} placeholder="Observação..." className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300"/>
        </div>)}</div>
      </article>;
    })}</div>
    {!visible.length && <div className="rounded-xl border border-slate-800 bg-[#121824] p-8 text-center text-sm text-slate-400">Nenhum produto corresponde aos filtros atuais.</div>}
    <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-xs leading-relaxed text-amber-100/80"><strong className="text-amber-200">Importante:</strong> o link da página do anúncio não é necessariamente o arquivo de vídeo. Algumas plataformas bloqueiam acesso externo ou usam URLs temporárias. O registro do anúncio é preservado mesmo quando o download direto não é possível.</div>
  </div>;
};
