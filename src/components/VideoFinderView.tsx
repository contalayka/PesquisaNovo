import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  Video,
  Search,
  ExternalLink,
  Download,
  CheckCircle2,
  Clock3,
  Plus,
  Trash2,
  X,
  AlertCircle,
  Play,
  Eye,
  Info,
  Loader2,
  Square
} from 'lucide-react';
import { Product, ResearchRecord } from '../types';
import {
  fetchVideoRecords,
  saveVideoRecord,
  saveVideoRecords,
  deleteVideoRecord,
  markVideoDownloaded,
  CloudVideoRecord,
  ensureUuid
} from '../utils/videoRecords';
import { getSupabaseClient } from '../utils/supabase';

type SavedVideo = CloudVideoRecord;
type SavedMap = Record<string, SavedVideo[]>;
const KEY = 'marketpreco_video_finder_v2';
const platforms = ['Shopee', 'SHEIN', 'TikTok Shop', 'Mercado Livre'];

export const isSearchPageUrl = (url?: string | null): boolean => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('/search') ||
    lower.includes('/pdsearch') ||
    lower.includes('lista.mercadolivre') ||
    lower.includes('registration?confirmation_url') ||
    lower.includes('tiktok.com/search')
  );
};

export const hasProductVideo = (v?: SavedVideo | null): boolean => {
  if (!v) return false;
  const adUrl = String(v.url || '').trim();
  const videoUrl = String(v.videoUrl || '').trim();

  // Páginas genéricas de busca de marketplace NUNCA são anúncios com vídeo
  if (isSearchPageUrl(adUrl) || isSearchPageUrl(videoUrl)) return false;

  // Precisa ter link direto de vídeo válido
  if (videoUrl && !isSearchPageUrl(videoUrl)) return true;

  // Ou a URL do anúncio precisa ser um arquivo direto de vídeo ou vídeo do TikTok
  if (
    adUrl &&
    (/\.(mp4|webm|m3u8|mov)([?#]|$)/i.test(adUrl) || /tiktok\.com\/.*\/video\//i.test(adUrl))
  ) {
    return true;
  }

  return false;
};

const normalize = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

const productKey = (p: Product) => {
  const sku = normalize(p.sku);
  const barcode = normalize(p.barcode);
  return 'product:' + (sku ? 'sku:' + sku : barcode ? 'barcode:' + barcode : 'name:' + normalize(p.name));
};

const sanitizeSavedMap = (rawMap: Record<string, SavedVideo | SavedVideo[]>): SavedMap => {
  const clean: SavedMap = {};
  for (const [key, val] of Object.entries(rawMap)) {
    const list = Array.isArray(val) ? val : [val];
    const filtered = list.filter(hasProductVideo);
    if (filtered.length > 0) {
      clean[key] = filtered;
    }
  }
  return clean;
};

const loadLocal = (): SavedMap => {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(KEY + '_backup');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SavedVideo | SavedVideo[]>;
    return sanitizeSavedMap(parsed);
  } catch {
    return {};
  }
};

const persist = (map: SavedMap) => {
  try {
    const clean = sanitizeSavedMap(map);
    localStorage.setItem(KEY, JSON.stringify(clean));
    localStorage.setItem(KEY + '_backup', JSON.stringify(clean));
  } catch {}
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

interface ScanCandidateItem {
  platform: string;
  title: string;
  adUrl: string;
  videoUrl: string;
  thumbnail?: string;
  duration?: string;
  notes?: string;
}

export const VideoFinderView: React.FC<{ products: Product[] }> = ({ products }) => {
  const found = useMemo(() => products.filter((p) => p.status === 'Encontrado'), [products]);
  const [saved, setSaved] = useState<SavedMap>(loadLocal);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('com_video');
  const [platform, setPlatform] = useState('Todos');
  const [selected, setSelected] = useState<string[]>([]);
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState('');
  const [scanDiagnostics, setScanDiagnostics] = useState<Record<string, any> | null>(null);
  const [downloaded, setDownloaded] = useState<string[]>([]);

  // Modal: Fullscreen Video Player / Preview (Rule 6: botão VISUALIZAR)
  const [previewVideo, setPreviewVideo] = useState<{ url: string; title?: string; platform?: string } | null>(null);

  // Modal: Discovered Candidates Modal (para o usuário revisar e salvar no Supabase)
  const [candidatesModal, setCandidatesModal] = useState<{
    product: Product;
    candidates: ScanCandidateItem[];
  } | null>(null);

  // State for manual modal/form adding an ad with video
  const [addingForProduct, setAddingForProduct] = useState<Product | null>(null);
  const [newAdUrl, setNewAdUrl] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newPlatform, setNewPlatform] = useState('Shopee');
  const [newDuration, setNewDuration] = useState('10 segundos');
  const [newNotes, setNewNotes] = useState('');
  const [formError, setFormError] = useState('');

  // 1. CARREGAMENTO INICIAL: Sincronização robusta do Supabase para garantir persistência mesmo em janela anônima
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cloud = await fetchVideoRecords();
      if (cancelled) return;
      const local = loadLocal();
      const merged: SavedMap = { ...local };

      for (const [key, records] of Object.entries(cloud)) {
        const validRecords = records.filter(hasProductVideo);
        if (validRecords.length === 0) continue;
        const byId = new Map(
          (merged[key] || []).map((r) => [r.id || [r.platform, r.url, r.videoUrl].join('|'), r])
        );
        for (const r of validRecords) {
          byId.set(r.id || [r.platform, r.url, r.videoUrl].join('|'), r);
        }
        merged[key] = Array.from(byId.values());
      }

      const cleanMerged = sanitizeSavedMap(merged);
      setSaved(cleanMerged);
      persist(cleanMerged);
      setDownloaded(
        (Object.values(cleanMerged) as SavedVideo[][])
          .flat()
          .filter((v) => v.id && v.downloaded)
          .map((v) => v.id as string)
      );
    })().catch((err) => {
      console.warn('[VideoFinder] Erro ao sincronizar com Supabase:', err);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. CORRESPONDÊNCIA MULTI-CHAVE: Encontra vídeos por ID do produto, Chave de produto, Nome ou SKU
  const getVideos = (p: Product, map = saved): SavedVideo[] => {
    const normName = normalize(p.name);
    const stableKey = productKey(p);

    const strId = String(p.id ?? '').trim();
    const byId = strId ? map[strId] || [] : [];
    const byIdPrefix = strId ? map['id:' + strId] || [] : [];
    const byKey = map[stableKey] || [];
    const byName = map['name:' + normName] || [];
    const byProdName = map['product:name:' + normName] || [];
    const bySku = p.sku ? map['sku:' + normalize(p.sku)] || [] : [];

    const all = [...byId, ...byIdPrefix, ...byKey, ...byName, ...byProdName, ...bySku];
    const seen = new Set<string>();
    const unique: SavedVideo[] = [];

    for (const v of all) {
      const k = v.id || v.videoUrl || v.url;
      if (k && !seen.has(k)) {
        seen.add(k);
        if (hasProductVideo(v)) {
          unique.push(v);
        }
      }
    }
    return unique;
  };

  const isVideoDownloaded = (v: SavedVideo) => Boolean(v.downloaded || (v.id && downloaded.includes(v.id)));

  const productsWithVideoCount = useMemo(() => {
    return found.filter((p) => getVideos(p).length > 0).length;
  }, [found, saved]);

  const productsDownloadedCount = useMemo(() => {
    return found.filter((p) => getVideos(p).some(isVideoDownloaded)).length;
  }, [found, saved, downloaded]);

  const totalVideosCount = useMemo(() => {
    return found.reduce((total, p) => total + getVideos(p).length, 0);
  }, [found, saved]);

  const visible = useMemo(() => {
    return found.filter((p) => {
      const q = normalize(query);
      const videos = getVideos(p);
      const hasVideo = videos.length > 0;
      const hasDownloaded = videos.some(isVideoDownloaded);

      const matchesText = !q || normalize(p.name).includes(q) || normalize(p.sku).includes(q);

      let matchesFilter = true;
      if (filter === 'com_video') {
        matchesFilter = hasVideo;
      } else if (filter === 'sem_video' || filter === 'pendentes') {
        matchesFilter = !hasVideo;
      } else if (filter === 'baixados') {
        matchesFilter = hasDownloaded;
      } else if (filter === 'todos') {
        matchesFilter = true;
      }

      const matchesPlatform =
        platform === 'Todos' ||
        (hasVideo
          ? videos.some((v) => v.platform === platform)
          : (p.research_records || []).some((r) => platformFor(r) === platform));

      return matchesText && matchesFilter && matchesPlatform;
    });
  }, [found, query, filter, platform, saved, downloaded]);

  // 3. REMOÇÃO DE VÍDEO DO SUPABASE E LOCAL
  const removeVideo = async (p: Product, record: SavedVideo) => {
    setSaved((prev) => {
      const normName = normalize(p.name);
      const stableKey = productKey(p);
      const next: SavedMap = { ...prev };

      const filterOut = (list?: SavedVideo[]) => (list || []).filter((v) => v.id !== record.id);
      if (next[p.id]) next[p.id] = filterOut(next[p.id]);
      if (next[stableKey]) next[stableKey] = filterOut(next[stableKey]);
      if (next['name:' + normName]) next['name:' + normName] = filterOut(next['name:' + normName]);

      persist(next);
      return next;
    });

    if (record.id) {
      await deleteVideoRecord(record.id);
    }
  };

  // 4. PERSISTÊNCIA MANUAL: Salva anúncio com vídeo no Supabase e atualiza interface
  const openAddModal = (p: Product) => {
    setAddingForProduct(p);
    setNewAdUrl('');
    setNewVideoUrl('');
    setNewPlatform('Shopee');
    setNewDuration('10 segundos');
    setNewNotes('');
    setFormError('');
  };

  const handleSaveManualVideo = async () => {
    if (!addingForProduct) return;
    const adUrlTrimmed = newAdUrl.trim();
    const videoUrlTrimmed = newVideoUrl.trim();

    if (isSearchPageUrl(adUrlTrimmed)) {
      setFormError('Links de busca de marketplace não são permitidos. Insira a URL do anúncio ou do vídeo.');
      return;
    }

    const isDirect =
      /\.(mp4|webm|m3u8|mov)([?#]|$)/i.test(adUrlTrimmed) || /tiktok\.com\/.*\/video\//i.test(adUrlTrimmed);
    if (!videoUrlTrimmed && !isDirect) {
      setFormError('Informe a URL direta do arquivo de vídeo (.mp4 ou stream do anúncio).');
      return;
    }

    const effectiveVideoUrl = videoUrlTrimmed || (isDirect ? adUrlTrimmed : '');
    const p = addingForProduct;
    const finalId = ensureUuid();

    const record: SavedVideo = {
      id: finalId,
      productKey: productKey(p),
      productId: p.id,
      productName: p.name,
      productSku: p.sku || '',
      productBarcode: p.barcode || '',
      productImage: p.image || '',
      url: adUrlTrimmed || effectiveVideoUrl,
      videoUrl: effectiveVideoUrl,
      platform: newPlatform,
      duration: newDuration,
      notes: newNotes.trim() || 'Vídeo adicionado manualmente.'
    };

    // Salvar no Supabase
    const { error } = await saveVideoRecord(record);
    if (error) {
      setFormError(`Erro ao persistir no Supabase: ${error}`);
      return;
    }

    // Atualizar estado e persistência local
    setSaved((prev) => {
      const stableKey = productKey(p);
      const next = { ...prev };
      next[p.id] = [...(next[p.id] || []).filter(hasProductVideo), record];
      next[stableKey] = [...(next[stableKey] || []).filter(hasProductVideo), record];
      persist(next);
      return next;
    });

    setAddingForProduct(null);
    setScanMessage(`Vídeo persistido com sucesso no Supabase para "${p.name}".`);
  };

  // Salva um candidato detectado diretamente no Supabase
  const handleSaveCandidateToSupabase = async (p: Product, cand: ScanCandidateItem) => {
    const finalId = ensureUuid();
    const record: SavedVideo = {
      id: finalId,
      productKey: productKey(p),
      productId: p.id,
      productName: p.name,
      productSku: p.sku || '',
      productBarcode: p.barcode || '',
      productImage: cand.thumbnail || p.image || '',
      url: cand.adUrl,
      videoUrl: cand.videoUrl,
      platform: cand.platform,
      duration: cand.duration || '10 segundos',
      notes: cand.notes || `Vídeo verificado do anúncio: ${cand.title}`
    };

    const { error } = await saveVideoRecord(record);
    if (error) {
      alert(`Falha ao salvar no Supabase: ${error}`);
      return;
    }

    setSaved((prev) => {
      const stableKey = productKey(p);
      const next = { ...prev };
      next[p.id] = [...(next[p.id] || []).filter(hasProductVideo), record];
      next[stableKey] = [...(next[stableKey] || []).filter(hasProductVideo), record];
      persist(next);
      return next;
    });

    // Remove dos candidatos exibidos no modal
    if (candidatesModal) {
      const remaining = candidatesModal.candidates.filter((c) => c.videoUrl !== cand.videoUrl);
      if (remaining.length === 0) {
        setCandidatesModal(null);
      } else {
        setCandidatesModal({ ...candidatesModal, candidates: remaining });
      }
    }

    setScanMessage(`Vídeo salvo e persistido no Supabase com sucesso!`);
  };

  // State for search progress bar & cancellation
  const [scanProgress, setScanProgress] = useState<{
    current: number;
    total: number;
    currentProduct?: string;
    foundCount: number;
  } | null>(null);
  const abortBulkScanRef = useRef<boolean>(false);

  // 5. CHAMADA RESILIENTE AO BACKEND: Edge Function Supabase com fallback local
  const callMarketplaceScan = async (payload: {
    productId?: string;
    productName?: string;
    productImage?: string;
    productSku?: string;
    adUrls?: string[];
    platforms?: string[];
  }): Promise<{ candidates: ScanCandidateItem[]; diagnostics: Record<string, any> }> => {
    let candidates: ScanCandidateItem[] = [];
    let diagnostics: Record<string, any> = {};
    let edgeSucceeded = false;

    const client = getSupabaseClient();

    // 1. Tentar Edge Function Supabase 'marketplace-video-scan' com tokens de autenticação
    if (client) {
      try {
        const timeoutMs = 12000;
        const invokePromise = client.functions.invoke('marketplace-video-scan', { body: payload });
        const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error('Tempo limite excedido na Edge Function.') }), timeoutMs)
        );
        const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
        if (!error && data) {
          edgeSucceeded = true;
          if (Array.isArray(data.candidates)) {
            candidates = [...data.candidates];
          }
          if (data.diagnostics && typeof data.diagnostics === 'object') {
            diagnostics = { ...data.diagnostics };
          }
        }
        if (error) {
          console.warn('[marketplace-video-scan] Edge Function aviso:', error.message);
        }
      } catch (e) {
        console.warn('[marketplace-video-scan] Exceção na Edge Function, acionando fallback:', e);
      }
    }

    // 2. Apenas se a Edge Function falhou ou não respondeu, executar varredura via /api com timeout
    if (!edgeSucceeded) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch('/api/marketplace-video-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.candidates)) {
            candidates = [...json.candidates];
          }
          if (json?.diagnostics && typeof json.diagnostics === 'object') {
            diagnostics = { ...diagnostics, ...json.diagnostics };
          }
        }
      } catch (err) {
        console.warn('[marketplace-video-scan] Fallback /api:', err);
      }
    }

    return { candidates, diagnostics };
  };

  // 6. BUSCA DE VÍDEOS REAIS DO PRODUTO
  const scanProduct = async (p: Product, openResults = true) => {
    if (openResults) setScanning(p.id);
    setScanMessage(`Procurando anúncios com vídeo para "${p.name}" nos marketplaces...`);
    setScanDiagnostics(null);

    try {
      const existing = getVideos(p);
      const seenVideos = new Set(existing.map((v) => (v.videoUrl || v.url || '').trim()));
      const candidateUrls: string[] = [];

      // Reunir links de anúncios reais salvos na pesquisa do catálogo
      for (const r of p.research_records || []) {
        const u = String(r.url || '').trim();
        if (u && !isSearchPageUrl(u) && /^https?:\/\//i.test(u) && !seenVideos.has(u)) {
          candidateUrls.push(u);
        }
      }

      const scanResult = await callMarketplaceScan({
        productId: p.id,
        productName: p.name,
        productImage: p.image || '',
        productSku: p.sku || '',
        adUrls: candidateUrls,
        platforms: platform === 'Todos' ? undefined : [platform]
      });

      setScanDiagnostics(scanResult.diagnostics);

      // Filtrar estritamente candidatos que possuem vídeo e não foram salvos ainda
      const validCandidates = scanResult.candidates.filter(
        (c) => c.videoUrl && !isSearchPageUrl(c.videoUrl) && !seenVideos.has(c.videoUrl)
      );

      if (validCandidates.length > 0) {
        if (openResults) {
          setCandidatesModal({
            product: p,
            candidates: validCandidates
          });
        }
        setScanMessage(`${validCandidates.length} anúncio(s) com vídeo encontrado(s) para "${p.name}"!`);
        return validCandidates;
      }

      setScanMessage(
        `Nenhum anúncio com vídeo utilizável detectado para "${p.name}". Apenas anúncios com vídeo real são exibidos.`
      );
      return [];
    } catch (e) {
      setScanMessage(e instanceof Error ? e.message : 'Falha na busca de vídeos.');
      return [];
    } finally {
      if (openResults) {
        setScanning(null);
      }
    }
  };

  const cancelBulkScan = () => {
    abortBulkScanRef.current = true;
    setScanMessage('Interrompendo busca de vídeos...');
  };

  const scanPending = async () => {
    // 1. Identificar produtos que precisam de vídeo
    const pendingInFound = found.filter((p) => getVideos(p).length === 0);
    const pendingInAll = products.filter((p) => getVideos(p).length === 0);
    let targets: Product[] = [];

    if (selected.length > 0) {
      targets = products.filter((p) => selected.includes(p.id) && getVideos(p).length === 0);
    }

    if (!targets.length) {
      const visiblePending = visible.filter((p) => getVideos(p).length === 0);
      targets = (visiblePending.length > 0 ? visiblePending : (pendingInFound.length > 0 ? pendingInFound : pendingInAll)).slice(0, 12);
    }

    if (!targets.length) {
      setScanMessage('Todos os produtos já possuem anúncios com vídeo salvos.');
      setScanProgress(null);
      return;
    }

    // Configura a barra de progresso imediatamente para o primeiro item
    setScanProgress({
      current: 1,
      total: targets.length,
      currentProduct: targets[0].name,
      foundCount: 0
    });
    setScanMessage(`Analisando 1 de ${targets.length} — ${targets[0].name}`);

    const allCandidates: Array<{ product: Product; candidates: ScanCandidateItem[] }> = [];
    let completedCount = 0;
    let foundVideosTotal = 0;

    // 2. Processamento SEQUENCIAL e INDIVIDUAL (isolando erros de cada produto)
    for (let i = 0; i < targets.length; i++) {
      if (abortBulkScanRef.current) break;

      const p = targets[i];
      const currentNumber = i + 1;
      const pct = Math.round((i / targets.length) * 100);

      setScanProgress({
        current: currentNumber,
        total: targets.length,
        currentProduct: p.name,
        foundCount: foundVideosTotal
      });
      setScanMessage(`Analisando ${currentNumber} de ${targets.length} (${pct}%) — ${p.name}`);

      try {
        const candidates = await scanProduct(p, false);
        completedCount++;

        if (Array.isArray(candidates) && candidates.length > 0) {
          foundVideosTotal += candidates.length;
          allCandidates.push({ product: p, candidates });
          setScanProgress((prev) => (prev ? { ...prev, foundCount: foundVideosTotal } : null));
        }
      } catch (prodErr) {
        console.warn(`[VideoFinder] Falha no produto "${p.name}":`, prodErr);
        completedCount++;
      }
    }

    // 3. Resultado final da varredura
    if (abortBulkScanRef.current) {
      setScanMessage(`Busca interrompida pelo usuário: ${completedCount} de ${targets.length} produto(s) verificado(s).`);
    } else if (foundVideosTotal > 0) {
      setScanMessage(
        `Varredura concluída: ${completedCount} de ${targets.length} produto(s) analisado(s), ${foundVideosTotal} anúncio(s) com vídeo real encontrado(s)!`
      );
      if (allCandidates.length > 0) {
        setCandidatesModal({
          product: allCandidates[0].product,
          candidates: allCandidates[0].candidates
        });
      }
    } else {
      setScanMessage('Busca concluída. Nenhum anúncio com vídeo real foi encontrado.');
    }

    setTimeout(() => {
      setScanProgress(null);
    }, 4000);
  };

  // Handler explícito do botão principal: feedback imediato e liberação garantida
  const handleStartVideoScan = async () => {
    if (scanning) {
      console.warn('[VideoFinder] Varredura já em andamento.');
      return;
    }

    // Feedback imediato ANTES de qualquer chamada assíncrona
    setScanning('__bulk__');
    setScanMessage('Iniciando busca de vídeos...');
    abortBulkScanRef.current = false;
    setScanDiagnostics(null);
    setCandidatesModal(null);

    try {
      await scanPending();
    } catch (err) {
      console.error('[VideoFinder] Erro durante a varredura:', err);
      setScanMessage(
        err instanceof Error ? `Erro na busca de vídeos: ${err.message}` : 'Erro desconhecido ao executar busca de vídeos.'
      );
    } finally {
      setScanning(null);
    }
  };

  // 7. DOWNLOAD DIRETO DE VÍDEO (Rule 10: botão BAIXAR)
  const downloadOne = async (p: Product, v: SavedVideo) => {
    if (!v.videoUrl?.trim()) {
      alert('Este registro não possui a URL direta do arquivo de vídeo.');
      return;
    }
    try {
      const response = await fetch(v.videoUrl);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const blob = await response.blob();
      const a = document.createElement('a');
      const name = normalize(p.name).replace(/[^a-z0-9-_]+/g, '_') || 'video';
      a.href = URL.createObjectURL(blob);
      a.download = name + '.mp4';
      a.click();
      if (v.id) markDownloaded([v.id]);
    } catch {
      // Fallback: abrir a URL diretamente se o navegador bloquear requisição de origem cruzada
      const a = document.createElement('a');
      a.href = v.videoUrl;
      a.target = '_blank';
      a.download = `${normalize(p.name)}.mp4`;
      a.click();
      if (v.id) markDownloaded([v.id]);
    }
  };

  const markDownloaded = (ids: string[]) => {
    if (!ids.length) return;
    setDownloaded((prev) => Array.from(new Set([...prev, ...ids])));
    setSaved((prev) => {
      const next: SavedMap = Object.fromEntries(
        (Object.entries(prev) as [string, SavedVideo[]][]).map(([key, records]) => [
          key,
          records.map((v) => (ids.includes(v.id || '') ? { ...v, downloaded: true } : v))
        ])
      );
      persist(next);
      const allVideos = (Object.values(next) as SavedVideo[][]).flat();
      void saveVideoRecords(allVideos.filter((v) => v.id && ids.includes(v.id)));
      return next;
    });
    for (const id of ids) {
      void markVideoDownloaded(id);
    }
  };

  const downloadSelected = async () => {
    const items: { p: Product; v: SavedVideo }[] = [];
    for (const p of found) {
      for (const v of getVideos(p)) {
        if (selected.includes(v.id || '') && v.videoUrl?.trim() && !downloaded.includes(v.id || '')) {
          items.push({ p, v });
        }
      }
    }
    if (!items.length) {
      alert('Selecione anúncios com vídeo direto que ainda não foram baixados.');
      return;
    }
    if (items.length === 1) return downloadOne(items[0].p, items[0].v);
    const zip = new JSZip();
    const done: string[] = [];
    for (const { p, v } of items) {
      try {
        const res = await fetch(v.videoUrl!);
        if (!res.ok) continue;
        const blob = await res.blob();
        zip.file(
          (normalize(p.name).replace(/[^a-z0-9-_]+/g, '_') || 'video') + '_' + (v.id || Date.now()) + '.mp4',
          blob
        );
        if (v.id) done.push(v.id);
      } catch {}
    }
    if (!Object.keys(zip.files).length) {
      alert('Nenhum vídeo pôde ser baixado em lote via ZIP devido a bloqueio CORS. Baixe individualmente.');
      return;
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'MARKETPRECO_videos_marketplaces.zip';
    a.click();
    markDownloaded(done);
  };

  const exportCsv = () => {
    const rows = [['Produto', 'SKU', 'Marketplace', 'Link do anúncio', 'Link direto do vídeo', 'Duração', 'Observações']];
    for (const p of found) {
      for (const v of getVideos(p)) {
        rows.push([p.name, p.sku || '', v.platform, v.url || '', v.videoUrl || '', v.duration || '', v.notes || '']);
      }
    }
    const csv = '\uFEFF' + rows.map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'MARKETPRECO_videos_marketplaces.csv';
    a.click();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      {/* Top Banner */}
      <section className="rounded-2xl border border-violet-900/50 bg-gradient-to-br from-[#17152b] to-[#101522] p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-300">
              <Video className="h-4 w-4" /> MARKETPREÇO • CENTRAL DE VÍDEOS
            </div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Vídeos dos anúncios dos marketplaces</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Exibe somente anúncios reais que contêm o vídeo do produto (Shopee, SHEIN, TikTok Shop e Mercado Livre).
              Todos os links salvos são sincronizados e persistidos no Supabase.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleStartVideoScan}
              disabled={!!scanning}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <Search className="h-4 w-4" />
              {scanning ? 'Verificando...' : 'Buscar vídeos reais'}
            </button>
            <button
              onClick={downloadSelected}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              <Download className="h-4 w-4" /> Baixar selecionados
            </button>
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Produtos encontrados', found.length, 'todos'],
            ['Com anúncios de vídeo', productsWithVideoCount, 'com_video'],
            ['Sem vídeo cadastrado', found.length - productsWithVideoCount, 'sem_video'],
            ['Já baixados', productsDownloadedCount, 'baixados']
          ].map(([label, n, targetFilter]) => (
            <button
              key={String(label)}
              type="button"
              onClick={() => setFilter(String(targetFilter))}
              className="rounded-xl border border-white/10 bg-black/20 p-3 text-left transition hover:border-emerald-500/50 hover:bg-black/30"
            >
              <div className="text-xs text-slate-400">{label}</div>
              <div className="mt-1 text-2xl font-bold text-white">{n}</div>
            </button>
          ))}
        </div>

        {/* Barra de Progresso Interativa de Varredura */}
        {scanProgress && (
          <div className="mt-4 rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-emerald-300">
                Varredura em andamento: {scanProgress.current} de {scanProgress.total} produto(s) ({Math.round((scanProgress.current / (scanProgress.total || 1)) * 100)}%)
              </span>
              <div className="flex items-center gap-3">
                {scanProgress.foundCount > 0 && (
                  <span className="rounded bg-emerald-800/80 px-2 py-0.5 font-bold text-white">
                    {scanProgress.foundCount} vídeo(s) encontrado(s)
                  </span>
                )}
                {scanning === '__bulk__' && (
                  <button
                    type="button"
                    onClick={cancelBulkScan}
                    className="rounded bg-rose-900/80 hover:bg-rose-800 border border-rose-700/60 px-2.5 py-1 text-xs font-semibold text-white transition"
                  >
                    Parar busca
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round((scanProgress.current / (scanProgress.total || 1)) * 100))}%` }}
              />
            </div>
            {scanProgress.currentProduct && (
              <p className="mt-2 truncate text-xs text-slate-300">
                Analisando no momento: <span className="font-medium text-white">{scanProgress.currentProduct}</span>
              </p>
            )}
          </div>
        )}

        {scanMessage && (
          <div className="mt-3 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-3.5 py-2 text-xs text-emerald-200">
            {scanMessage}
          </div>
        )}

        {/* Diagnósticos da varredura por marketplace (Rule 31) */}
        {scanDiagnostics && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="font-semibold text-slate-300">Status dos Marketplaces:</span>
            {Object.entries(scanDiagnostics).map(([plat, diag]: [string, any]) => (
              <span
                key={plat}
                className="inline-flex items-center gap-1 rounded bg-slate-900/80 px-2 py-0.5 border border-slate-700"
              >
                <strong className="text-slate-200">{plat}:</strong>
                <span>{diag.videosFound > 0 ? `${diag.videosFound} vídeo(s)` : diag.status || 'OK'}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Filter and Search Bar */}
      <section className="rounded-2xl border border-slate-800 bg-[#121824] p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por nome ou SKU..."
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
          />
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
          >
            <option>Todos</option>
            {platforms.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          ['com_video', 'Com vídeo', productsWithVideoCount],
          ['sem_video', 'Sem vídeo', found.length - productsWithVideoCount],
          ['baixados', 'Já baixados', productsDownloadedCount],
          ['todos', 'Todos os encontrados', found.length]
        ].map(([f, label, count]) => {
          const isActive = filter === f || (f === 'sem_video' && filter === 'pendentes');
          return (
            <button
              key={String(f)}
              onClick={() => setFilter(String(f))}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
              }`}
            >
              {label} <span className="ml-1 opacity-70">({count})</span>
            </button>
          );
        })}
        {selected.length > 0 && (
          <button onClick={() => setSelected([])} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300">
            Limpar seleção ({selected.length})
          </button>
        )}
      </div>

      {/* MODAL 1: Visualizar Vídeo (Rule 6: botão VISUALIZAR) */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-[#121824] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Play className="h-5 w-5 text-emerald-400" />
                <h3 className="font-semibold text-white">Visualizar Vídeo do Produto</h3>
                {previewVideo.platform && (
                  <span className="rounded bg-violet-950 px-2 py-0.5 text-[11px] font-semibold text-violet-300 border border-violet-800/50">
                    {previewVideo.platform}
                  </span>
                )}
              </div>
              <button onClick={() => setPreviewVideo(null)} className="rounded-lg p-1 text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex justify-center bg-black rounded-xl overflow-hidden border border-slate-800">
              <video
                controls
                autoPlay
                playsInline
                src={previewVideo.url}
                className="max-h-[65vh] w-full object-contain"
              />
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-slate-400 truncate max-w-md">{previewVideo.title || previewVideo.url}</span>
              <a
                href={previewVideo.url}
                download="video-produto.mp4"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
              >
                <Download className="h-4 w-4" /> Baixar MP4
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Candidatos Encontrados na Varredura (Rule 6) */}
      {candidatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-[#121824] p-5 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-white">Anúncios com Vídeo Encontrados</h3>
                <p className="text-xs text-slate-400">
                  Produto: <strong className="text-white">{candidatesModal.product.name}</strong>
                </p>
              </div>
              <button onClick={() => setCandidatesModal(null)} className="rounded-lg p-1 text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 overflow-y-auto pr-1 flex-1">
              {candidatesModal.candidates.map((cand, idx) => (
                <div key={cand.videoUrl + idx} className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">
                  <div className="flex gap-3">
                    {cand.thumbnail ? (
                      <img
                        src={cand.thumbnail}
                        alt=""
                        className="h-20 w-20 shrink-0 rounded-lg border border-slate-700 bg-black object-contain"
                      />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-black">
                        <Video className="h-8 w-8 text-slate-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-emerald-950 px-2 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-800/40">
                          {cand.platform}
                        </span>
                        <h4 className="font-medium text-white truncate text-sm">{cand.title}</h4>
                      </div>
                      <p className="mt-1 text-xs text-slate-400 truncate">Anúncio: {cand.adUrl}</p>
                      <p className="mt-0.5 text-xs text-emerald-400/90 truncate font-mono">Vídeo: {cand.videoUrl}</p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {/* Botão VISUALIZAR (Rule 6) */}
                        <button
                          type="button"
                          onClick={() => setPreviewVideo({ url: cand.videoUrl, title: cand.title, platform: cand.platform })}
                          className="inline-flex items-center gap-1.5 rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600"
                        >
                          <Eye className="h-3.5 w-3.5" /> VISUALIZAR
                        </button>

                        {/* Botão BAIXAR (Rule 6) */}
                        <a
                          href={cand.videoUrl}
                          download={`${normalize(candidatesModal.product.name)}.mp4`}
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
                        >
                          <Download className="h-3.5 w-3.5" /> BAIXAR
                        </a>

                        {/* Botão ABRIR ANÚNCIO */}
                        <a
                          href={cand.adUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Abrir anúncio
                        </a>

                        {/* Botão SALVAR NO SUPABASE (Rule 21) */}
                        <button
                          type="button"
                          onClick={() => handleSaveCandidateToSupabase(candidatesModal.product, cand)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm ml-auto"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Salvar no Supabase
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-slate-800 pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setCandidatesModal(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Inclusão Manual com Persistência no Supabase */}
      {addingForProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#121824] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-emerald-400" />
                <h3 className="font-semibold text-white">Adicionar anúncio com vídeo</h3>
              </div>
              <button onClick={() => setAddingForProduct(null)} className="rounded-lg p-1 text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Produto: <strong className="text-white">{addingForProduct.name}</strong>
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Link da página do anúncio</label>
                <input
                  value={newAdUrl}
                  onChange={(e) => setNewAdUrl(e.target.value)}
                  placeholder="https://shopee.com.br/... ou Mercado Livre"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-emerald-300">
                  Link direto do arquivo de vídeo (.mp4 ou stream) *
                </label>
                <input
                  value={newVideoUrl}
                  onChange={(e) => setNewVideoUrl(e.target.value)}
                  placeholder="https://...arquivo.mp4 ou stream de vídeo"
                  className="w-full rounded-lg border border-emerald-900 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Obrigatório: o vídeo será persistido no Supabase e continuará disponível ao recarregar.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Marketplace</label>
                  <select
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  >
                    {platforms.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Duração aproximada</label>
                  <select
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                  >
                    <option>Até 10 segundos</option>
                    <option>10 segundos</option>
                    <option>11–15 segundos</option>
                    <option>Mais de 15 segundos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-300">Observações (opcional)</label>
                <input
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Ex: Anúncio verificado com teste de uso"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </div>

              {formError && (
                <div className="flex items-center gap-1.5 rounded-lg border border-red-900/50 bg-red-950/30 p-2.5 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setAddingForProduct(null)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveManualVideo}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
              >
                Salvar no Supabase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LISTAGEM DE PRODUTOS */}
      <div className="space-y-4">
        {visible.map((p) => {
          const videos = getVideos(p);
          const researchLinks = (p.research_records || []).filter((r) => r.url && !isSearchPageUrl(r.url));

          return (
            <article key={p.id} className="rounded-xl border border-slate-800 bg-[#121824] p-4 sm:p-5">
              {/* Cabeçalho do Produto */}
              <div className="flex gap-3">
                {p.image ? (
                  <img
                    src={p.image}
                    alt=""
                    className="h-16 w-16 rounded-lg border border-slate-700 bg-slate-900 object-contain"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-700 bg-slate-900">
                    <Video className="h-6 w-6 text-slate-600" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white">{p.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>SKU: {p.sku || 'Não informado'}</span>
                    <span>•</span>
                    <span className={videos.length > 0 ? 'font-semibold text-emerald-400' : 'text-slate-500'}>
                      {videos.length === 0
                        ? 'Nenhum anúncio com vídeo'
                        : `${videos.length} anúncio(s) com vídeo no Supabase`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => scanProduct(p)}
                  disabled={!!scanning}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                >
                  <Search className="h-3.5 w-3.5" />
                  {scanning === p.id || (scanning === '__bulk__' && scanProgress?.currentProduct === p.name)
                    ? 'Verificando...'
                    : 'Buscar vídeos reais'}
                </button>

                <button
                  type="button"
                  onClick={() => openAddModal(p)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-violet-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-violet-600"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar anúncio com vídeo
                </button>

                {/* Auxiliares de pesquisa externa */}
                {p.image && (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(p.image)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/70 bg-blue-600 px-2.5 py-2 text-xs font-bold text-white"
                  >
                    <Search className="h-3 w-3" /> Foto
                  </a>
                )}
                {platforms.map((m) => (
                  <a
                    key={m}
                    target="_blank"
                    rel="noreferrer"
                    href={marketplaceSearchUrl(p.name, m)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-300 hover:border-slate-500"
                  >
                    <ExternalLink className="h-3 w-3" /> {m}
                  </a>
                ))}
              </div>

              {/* Anúncios do Catálogo */}
              {researchLinks.length > 0 && (
                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-300">
                      Anúncios registrados no catálogo ({researchLinks.length})
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {researchLinks.map((r, i) => (
                      <a
                        key={r.id || i}
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-300 hover:border-emerald-600 hover:text-white"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {platformFor(r)}
                        {r.store ? ' · ' + r.store : ''}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Estado Vazio */}
              {videos.length === 0 && (
                <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-5 text-center">
                  <Video className="mx-auto mb-2 h-7 w-7 text-slate-500" />
                  <h4 className="text-sm font-semibold text-slate-300">Nenhum anúncio com vídeo salvo</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    Apenas anúncios que possuem vídeo real do produto aparecem aqui. Clique em "Buscar vídeos reais"
                    para inspecionar ou em "Adicionar anúncio com vídeo" para salvar no Supabase.
                  </p>
                </div>
              )}

              {/* LISTA DE VÍDEOS SALVOS NO SUPABASE */}
              {videos.length > 0 && (
                <div className="mt-4 space-y-3">
                  {videos.map((v, index) => (
                    <div key={v.id || index} className="rounded-xl border border-slate-700 bg-slate-950/70 p-3.5">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div
                          className={`flex items-center gap-2 text-xs font-semibold ${
                            v.downloaded ? 'text-sky-300' : 'text-emerald-300'
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>
                            VÍDEO {index + 1} • {v.platform.toUpperCase()} • PERSISTIDO NO SUPABASE
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeVideo(p, v)}
                          className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-3 w-3" /> Excluir
                        </button>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_170px_170px]">
                        <div>
                          <label className="mb-1 block text-xs text-slate-400">Link da página do anúncio</label>
                          <div className="flex gap-2">
                            <input
                              readOnly
                              value={v.url || ''}
                              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:outline-none"
                            />
                            {v.url && (
                              <a
                                href={v.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs text-slate-200 hover:text-white"
                                title="Abrir anúncio no navegador"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-semibold text-emerald-300">
                            Link direto do vídeo ({v.platform})
                          </label>
                          <input
                            readOnly
                            value={v.videoUrl || ''}
                            className="w-full rounded-lg border border-emerald-900 bg-slate-900 px-3 py-2 text-xs text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs text-slate-400">Marketplace</label>
                          <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">
                            {v.platform}
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 flex items-center gap-1 text-xs text-slate-400">
                            <Clock3 className="h-3 w-3" /> Duração
                          </label>
                          <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">
                            {v.duration || '10 segundos'}
                          </div>
                        </div>
                      </div>

                      {/* Video Player Embutido */}
                      {v.videoUrl && (
                        <div className="mt-3">
                          <video
                            controls
                            playsInline
                            preload="metadata"
                            src={v.videoUrl}
                            className="max-h-60 w-full max-w-lg rounded-lg border border-slate-800 bg-black"
                          />
                        </div>
                      )}

                      {/* Ações do Vídeo (Rule 6: VISUALIZAR e BAIXAR) */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {v.videoUrl && (
                          <button
                            type="button"
                            onClick={() => setPreviewVideo({ url: v.videoUrl!, title: p.name, platform: v.platform })}
                            className="inline-flex items-center gap-1 rounded-md bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-600"
                          >
                            <Eye className="h-3 w-3" /> Visualizar
                          </button>
                        )}

                        {v.url && (
                          <a
                            href={v.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white"
                          >
                            <ExternalLink className="h-3 w-3" /> Abrir anúncio
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => downloadOne(p, v)}
                          disabled={!v.videoUrl}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
                        >
                          <Download className="h-3 w-3" /> Baixar vídeo (.mp4)
                        </button>

                        <label className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={selected.includes(v.id || '')}
                            onChange={(e) =>
                              setSelected((s) =>
                                e.target.checked
                                  ? [...new Set([...s, v.id || ''])]
                                  : s.filter((id) => id !== v.id)
                              )
                            }
                            disabled={!v.videoUrl}
                            className="accent-emerald-500"
                          />
                          Selecionar para ZIP
                        </label>
                      </div>

                      {v.notes && <p className="mt-2 text-xs text-slate-400">Obs: {v.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {!visible.length && (
        <div className="rounded-xl border border-slate-800 bg-[#121824] p-8 text-center text-sm text-slate-400">
          Nenhum produto corresponde aos filtros atuais. Tente selecionar o filtro "Todos os encontrados" ou ajuste o filtro por nome.
        </div>
      )}

      <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 text-xs leading-relaxed text-amber-100/80">
        <strong className="text-amber-200">Garantia de Persistência no Supabase:</strong> Todos os vídeos salvos ou
        selecionados são persistidos diretamente na tabela <code>video_records</code> do Supabase, permanecendo
        acessíveis ao recarregar a página ou abrir em uma janela anônima.
      </div>
    </div>
  );
};
