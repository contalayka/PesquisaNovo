import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Square,
  Upload,
  UploadCloud,
  FileVideo,
  FolderUp,
  HardDrive,
  Laptop,
  Sparkles,
  FileCheck
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
import { scanMarketplaces } from '../utils/marketplaceScannerCore';
import {
  uploadLocalVideoFile,
  resolveVideoUrl,
  extractVideoMetadata
} from '../utils/localVideoStorage';

type SavedVideo = CloudVideoRecord;
type SavedMap = Record<string, SavedVideo[]>;
const KEY = 'marketpreco_video_finder_v2';
const platforms = ['Vídeo Próprio / PC', 'Mercado Livre', 'Shopee', 'SHEIN', 'TikTok Shop'];

// Componente que resolve e reproduz com segurança URLs web e locais (local_video:)
const AsyncVideoPlayer: React.FC<{
  url?: string;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  playsInline?: boolean;
  onError?: () => void;
}> = ({ url, className, controls = true, autoPlay = false, playsInline = true, onError }) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!url) {
      setResolvedSrc('');
      setLoading(false);
      return;
    }
    if (!url.startsWith('local_video:')) {
      setResolvedSrc(url);
      setLoading(false);
      return;
    }
    setLoading(true);
    resolveVideoUrl(url).then((res) => {
      if (active) {
        setResolvedSrc(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [url]);

  if (loading || !resolvedSrc) {
    return (
      <div className="flex h-36 w-full max-w-lg items-center justify-center rounded-lg border border-slate-800 bg-black/70 text-xs text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-400 mr-2" /> Carregando reprodutor...
      </div>
    );
  }

  return (
    <video
      key={resolvedSrc}
      controls={controls}
      autoPlay={autoPlay}
      playsInline={playsInline}
      preload="metadata"
      src={resolvedSrc}
      onError={onError}
      className={className}
    />
  );
};

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


const normalizeVideoUrl = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    const removable = /^(utm_[^=]*|fbclid|gclid|referrer?|source|spm|from|share_source|share_link_id)$/i;
    for (const key of Array.from(u.searchParams.keys())) {
      if (removable.test(key)) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return raw.split('#')[0].replace(/[?&](?:utm_[^=&]+|fbclid|gclid|referrer?|source|spm|from|share_source|share_link_id)=[^&]*/gi, '');
  }
};

const videoIdentityKey = (v?: Partial<SavedVideo> | null): string => {
  if (!v) return '';
  const video = normalizeVideoUrl(v.videoUrl);
  if (video) return 'video:' + video;
  const ad = normalizeVideoUrl(v.url);
  return ad ? 'ad:' + ad : '';
};

const productKey = (p: Product) => {
  const sku = normalize(p.sku);
  const barcode = normalize(p.barcode);
  return 'product:' + (sku ? 'sku:' + sku : barcode ? 'barcode:' + barcode : 'name:' + normalize(p.name));
};

const sanitizeSavedMap = (rawMap: Record<string, SavedVideo | SavedVideo[]>): SavedMap => {
  const clean: SavedMap = {};
  for (const [key, val] of Object.entries(rawMap)) {
    const list = Array.isArray(val) ? val : [val];
    const seen = new Set<string>();
    const filtered = list.filter((item) => {
      if (!hasProductVideo(item)) return false;
      const identity = videoIdentityKey(item);
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
    if (filtered.length > 0) clean[key] = filtered;
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
  confidence?: 'ALTA' | 'MÉDIA' | 'BAIXA';
  sourceType?: 'anuncio_direto' | 'dados_relacionados' | 'busca_externa';
  isPrimary?: boolean;
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
  const [previewVideo, setPreviewVideo] = useState<{
    url: string;
    title?: string;
    platform?: string;
    adUrl?: string;
  } | null>(null);
  const [videoError, setVideoError] = useState(false);

  // Modal: Discovered Candidates Modal (para o usuário revisar e salvar no Supabase)
  const [candidatesModal, setCandidatesModal] = useState<{
    product: Product;
    candidates: ScanCandidateItem[];
  } | null>(null);

  // State for manual modal/form adding an ad with video (Upload do Computador ou Link Web)
  const [addingForProduct, setAddingForProduct] = useState<Product | null>(null);
  const [addMode, setAddMode] = useState<'file' | 'url'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileThumbnail, setFileThumbnail] = useState<string | null>(null);
  const [fileDuration, setFileDuration] = useState<string | null>(null);
  const [fileSizeFormatted, setFileSizeFormatted] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const singleFileInputRef = useRef<HTMLInputElement>(null);

  const [newAdUrl, setNewAdUrl] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [newPlatform, setNewPlatform] = useState('Vídeo Próprio / PC');
  const [newDuration, setNewDuration] = useState('10 segundos');
  const [newNotes, setNewNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Bulk Upload from Computer modal
  const [bulkUploadModal, setBulkUploadModal] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<
    Array<{
      id: string;
      file: File;
      targetProductId: string;
      duration?: string;
      thumbnail?: string;
      sizeFormatted: string;
      status: 'idle' | 'uploading' | 'done' | 'error';
      errorMsg?: string;
    }>
  >([]);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  // Fecha modal com tecla Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewVideo) setPreviewVideo(null);
        else if (candidatesModal) setCandidatesModal(null);
        else if (addingForProduct) setAddingForProduct(null);
        else if (bulkUploadModal) setBulkUploadModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewVideo, candidatesModal, addingForProduct, bulkUploadModal]);

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
      const k = videoIdentityKey(v);
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

  // 4. PERSISTÊNCIA MANUAL: Salva vídeo do computador ou link da Web no Supabase
  const handleFileSelected = async (file: File) => {
    setSelectedFile(file);
    setFormError('');
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    setFileSizeFormatted(file.size > 1024 * 1024 ? `${sizeMb} MB` : `${Math.round(file.size / 1024)} KB`);

    const objUrl = URL.createObjectURL(file);
    setFilePreviewUrl(objUrl);

    try {
      const meta = await extractVideoMetadata(file);
      setFileThumbnail(meta.thumbnail || null);
      setFileDuration(meta.durationFormatted || '10 segundos');
      setNewDuration(meta.durationFormatted || '10 segundos');
    } catch {
      setFileDuration('10 segundos');
    }
  };

  const openAddModal = (p: Product, initialMode: 'file' | 'url' = 'file') => {
    setAddingForProduct(p);
    setAddMode(initialMode);
    setSelectedFile(null);
    if (filePreviewUrl) {
      try {
        URL.revokeObjectURL(filePreviewUrl);
      } catch {}
    }
    setFilePreviewUrl(null);
    setFileThumbnail(null);
    setFileDuration(null);
    setFileSizeFormatted(null);
    setNewAdUrl('');
    setNewVideoUrl('');
    setNewPlatform('Vídeo Próprio / PC');
    setNewDuration('10 segundos');
    setNewNotes('');
    setFormError('');
    setIsUploading(false);
    setIsDragOver(false);
  };

  const handleSaveManualVideo = async () => {
    if (!addingForProduct) return;
    const p = addingForProduct;

    // A) Salvar vídeo do computador
    if (addMode === 'file') {
      if (!selectedFile) {
        setFormError('Selecione ou arraste um arquivo de vídeo (.mp4, .webm, .mov) do computador.');
        return;
      }

      setIsUploading(true);
      setFormError('');

      try {
        const uploadRes = await uploadLocalVideoFile(selectedFile, p.id);
        const finalId = ensureUuid();

        const record: SavedVideo = {
          id: finalId,
          productKey: productKey(p),
          productId: p.id,
          productName: p.name,
          productSku: p.sku || '',
          productBarcode: p.barcode || '',
          productImage: p.image || '',
          url: newAdUrl.trim() || '',
          videoUrl: uploadRes.videoUrl,
          thumbnail: uploadRes.thumbnail || p.image || '',
          platform: newPlatform || 'Vídeo Próprio / PC',
          duration: uploadRes.duration || newDuration || '10 segundos',
          notes: newNotes.trim() || `Arquivo enviado do computador: ${uploadRes.fileName} (${uploadRes.fileSizeFormatted})`,
          confidence: 'ALTA',
          sourceType: 'anuncio_direto'
        };

        const { error } = await saveVideoRecord(record);
        if (error) {
          console.warn('[VideoFinder] Aviso ao salvar no Supabase:', error);
        }

        setSaved((prev) => {
          const stableKey = productKey(p);
          const next = { ...prev };
          next[p.id] = [...(next[p.id] || []).filter(hasProductVideo), record];
          next[stableKey] = [...(next[stableKey] || []).filter(hasProductVideo), record];
          persist(next);
          return next;
        });

        setAddingForProduct(null);
        setScanMessage(`Vídeo "${uploadRes.fileName}" do computador vinculado com sucesso para "${p.name}".`);
      } catch (err) {
        setFormError(`Erro ao carregar arquivo de vídeo: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsUploading(false);
      }
      return;
    }

    // B) Salvar link web / URL de marketplace
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
    const identity = videoIdentityKey({ videoUrl: effectiveVideoUrl, url: adUrlTrimmed });
    if (!identity || getVideos(p).some((v) => videoIdentityKey(v) === identity)) {
      setFormError('Este vídeo já está salvo para este produto.');
      return;
    }

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
      notes: newNotes.trim() || 'Vídeo adicionado via link.',
      confidence: 'ALTA',
      sourceType: 'anuncio_direto'
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

  // Upload em lote de múltiplos arquivos selecionados do computador
  const handleBulkFilesSelected = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(
      (f) => f.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(f.name)
    );
    if (!fileArray.length) {
      alert('Nenhum arquivo de vídeo válido foi selecionado.');
      return;
    }

    const mapped = fileArray.map((file) => {
      const lowerName = normalize(file.name);
      let matchedProd = found.find(
        (p) => (p.sku && lowerName.includes(normalize(p.sku))) || lowerName.includes(normalize(p.name))
      );
      if (!matchedProd) {
        const words = lowerName.split(/[^a-z0-9]+/i).filter((w) => w.length > 2);
        matchedProd = found.find((p) => {
          const pNorm = normalize(p.name);
          return words.some((w) => pNorm.includes(w));
        });
      }

      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      const sizeFormatted = file.size > 1024 * 1024 ? `${sizeMb} MB` : `${Math.round(file.size / 1024)} KB`;

      return {
        id: 'bulk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        file,
        targetProductId: matchedProd ? String(matchedProd.id) : found[0]?.id ? String(found[0].id) : '',
        sizeFormatted,
        status: 'idle' as const
      };
    });

    setBulkFiles(mapped);
    setBulkUploadModal(true);

    // Extrai metadados assincronamente
    for (let i = 0; i < mapped.length; i++) {
      try {
        const meta = await extractVideoMetadata(mapped[i].file);
        setBulkFiles((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, duration: meta.durationFormatted, thumbnail: meta.thumbnail } : item
          )
        );
      } catch {}
    }
  };

  const handleSaveBulkFiles = async () => {
    if (!bulkFiles.length) return;
    setIsBulkUploading(true);

    let countSuccess = 0;

    for (let i = 0; i < bulkFiles.length; i++) {
      const item = bulkFiles[i];
      const targetProduct = found.find((p) => String(p.id) === item.targetProductId);
      if (!targetProduct) continue;

      setBulkFiles((prev) =>
        prev.map((it, idx) => (idx === i ? { ...it, status: 'uploading' } : it))
      );

      try {
        const uploadRes = await uploadLocalVideoFile(item.file, targetProduct.id);
        const finalId = ensureUuid();

        const record: SavedVideo = {
          id: finalId,
          productKey: productKey(targetProduct),
          productId: targetProduct.id,
          productName: targetProduct.name,
          productSku: targetProduct.sku || '',
          productBarcode: targetProduct.barcode || '',
          productImage: targetProduct.image || '',
          url: '',
          videoUrl: uploadRes.videoUrl,
          thumbnail: uploadRes.thumbnail || item.thumbnail || targetProduct.image || '',
          platform: 'Vídeo Próprio / PC',
          duration: uploadRes.duration || item.duration || '10 segundos',
          notes: `Upload do computador: ${item.file.name} (${item.sizeFormatted})`,
          confidence: 'ALTA',
          sourceType: 'anuncio_direto'
        };

        await saveVideoRecord(record);

        setSaved((prev) => {
          const stableKey = productKey(targetProduct);
          const next = { ...prev };
          next[targetProduct.id] = [...(next[targetProduct.id] || []).filter(hasProductVideo), record];
          next[stableKey] = [...(next[stableKey] || []).filter(hasProductVideo), record];
          persist(next);
          return next;
        });

        countSuccess++;
        setBulkFiles((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: 'done' } : it))
        );
      } catch (err) {
        setBulkFiles((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: 'error', errorMsg: String(err) } : it))
        );
      }
    }

    setIsBulkUploading(false);
    setScanMessage(`Upload em lote concluído: ${countSuccess} de ${bulkFiles.length} vídeo(s) salvo(s) no Supabase!`);
    setTimeout(() => {
      setBulkUploadModal(false);
      setBulkFiles([]);
    }, 1500);
  };

  // Salva um candidato detectado diretamente no Supabase
  const handleSaveCandidateToSupabase = async (p: Product, cand: ScanCandidateItem) => {
    const identity = videoIdentityKey({ videoUrl: cand.videoUrl, url: cand.adUrl });
    if (!identity) return;
    if (getVideos(p).some((v) => videoIdentityKey(v) === identity)) {
      setScanMessage('Este vídeo já está salvo para este produto.');
      return;
    }

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
      notes: cand.notes || `Vídeo verificado do anúncio: ${cand.title}`,
      confidence: cand.confidence || 'ALTA',
      sourceType: cand.sourceType || 'anuncio_direto'
    };

    const { error } = await saveVideoRecord(record);
    if (error) {
      setScanMessage(`Falha ao salvar no Supabase: ${error}`);
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

  // 5. CHAMADA RESILIENTE AO BACKEND: Edge Function Supabase com fallback local e cliente
  const callMarketplaceScan = async (payload: {
    productId?: string;
    productName?: string;
    productImage?: string;
    productSku?: string;
    adUrls?: string[];
    platforms?: string[];
  }): Promise<{ candidates: ScanCandidateItem[]; diagnostics: Record<string, any> }> => {
    // CAMINHO 1: Supabase Edge Function
    try {
      const client = getSupabaseClient();
      if (client) {
        const invoke = client.functions.invoke('marketplace-video-scan', { body: payload });
        const timeout = new Promise<{ data: any; error: any }>((resolve) =>
          window.setTimeout(() => resolve({
            data: null,
            error: new Error('A busca no servidor ultrapassou 15 segundos.')
          }), 15000)
        );
        const { data, error } = await Promise.race([invoke, timeout]);
        if (!error && data && Array.isArray(data.candidates)) {
          const valid = data.candidates.filter((c: any) => c?.videoUrl);
          if (valid.length > 0) {
            return {
              candidates: valid,
              diagnostics: data.diagnostics && typeof data.diagnostics === 'object' ? data.diagnostics : {}
            };
          }
        }
      }
    } catch (e) {
      console.warn('[VideoFinder] Supabase scan indisponível:', e);
    }

    // CAMINHO 2: API do próprio site/Cloudflare Pages / Vite server
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 9000);
      try {
        const res = await fetch('/api/marketplace-video-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
          cache: 'no-store'
        });

        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && Array.isArray(data.candidates)) {
            const valid = data.candidates.filter((c: any) => c?.videoUrl);
            if (valid.length > 0) {
              return {
                candidates: valid,
                diagnostics: data.diagnostics && typeof data.diagnostics === 'object' ? data.diagnostics : {}
              };
            }
          }
        }
      } finally {
        window.clearTimeout(timer);
      }
    } catch (e) {
      console.warn('[VideoFinder] API /api indisponível:', e);
    }

    // CAMINHO 3: Varredura direta no cliente via Gateway em camadas
    try {
      const clientResult = await scanMarketplaces({
        productName: payload.productName,
        productImage: payload.productImage,
        adUrls: payload.adUrls,
        platforms: payload.platforms
      });
      if (clientResult && Array.isArray(clientResult.candidates)) {
        return {
          candidates: clientResult.candidates,
          diagnostics: clientResult.diagnostics || {}
        };
      }
    } catch (e) {
      console.warn('[VideoFinder] Scanner direto:', e);
    }

    return {
      candidates: [],
      diagnostics: {
        sistema: {
          status: 'Busca concluída.',
          adsInspected: payload.adUrls?.length || 0,
          videosFound: 0
        }
      }
    };
  };

  // 6. BUSCA DE VÍDEOS REAIS DO PRODUTO
  const scanProduct = async (p: Product, openResults = true) => {
    if (openResults) setScanning(p.id);
    setScanMessage(`Procurando anúncios com vídeo para "${p.name}" nos marketplaces...`);
    setScanDiagnostics(null);

    try {
      const existing = getVideos(p);
      const seenVideos = new Set(existing.map((v) => videoIdentityKey(v)).filter(Boolean));
      const candidateUrls: string[] = [];

      // Reunir links de anúncios reais salvos na pesquisa do catálogo
      for (const r of p.research_records || []) {
        const u = String(r.url || '').trim();
        const adIdentity = 'ad:' + normalizeVideoUrl(u);
        if (u && !isSearchPageUrl(u) && /^https?:\/\//i.test(u) && !seenVideos.has(adIdentity)) {
          candidateUrls.push(u);
        }
      }

      // Watchdog externo: nenhuma busca pode deixar o botão preso em "Verificando...".
      const scanResult = await Promise.race([
        callMarketplaceScan({
          productId: p.id,
          productName: p.name,
          productImage: p.image || '',
          productSku: p.sku || '',
          adUrls: candidateUrls,
          platforms: platform === 'Todos' ? undefined : [platform]
        }),
        new Promise<{ candidates: ScanCandidateItem[]; diagnostics: Record<string, any> }>((resolve) => {
          window.setTimeout(() => resolve({
            candidates: [],
            diagnostics: { sistema: { status: 'A busca demorou mais que o permitido e foi encerrada.' } }
          }), 12000);
        })
      ]);

      setScanDiagnostics(scanResult.diagnostics);

      // Filtrar estritamente candidatos que possuem vídeo e não foram salvos ainda
      const candidateSeen = new Set<string>(seenVideos);
      const validCandidates = scanResult.candidates.filter((c) => {
        if (!c.videoUrl || isSearchPageUrl(c.videoUrl)) return false;
        const identity = videoIdentityKey({ videoUrl: c.videoUrl, url: c.adUrl });
        if (!identity || candidateSeen.has(identity)) return false;
        candidateSeen.add(identity);
        return true;
      });

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
      targets = visiblePending.length > 0 ? visiblePending : (pendingInFound.length > 0 ? pendingInFound : pendingInAll);
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

    // 2. Processamento em pequenos lotes PARALELOS.
    // Antes era sequencial: 12 produtos x vários timeouts podiam deixar o botão
    // aparentemente travado por dezenas de segundos. Cada lote tem no máximo 3.
    const batchSize = 3;
    for (let start = 0; start < targets.length; start += batchSize) {
      if (abortBulkScanRef.current) break;

      const batch = targets.slice(start, start + batchSize);
      const firstNumber = start + 1;
      setScanProgress({
        current: firstNumber,
        total: targets.length,
        currentProduct: batch.map((x) => x.name).join(' • '),
        foundCount: foundVideosTotal
      });
      setScanMessage(`Analisando ${firstNumber}–${Math.min(start + batch.length, targets.length)} de ${targets.length} produto(s)...`);

      const results = await Promise.all(
        batch.map(async (p) => {
          try {
            const candidates = await scanProduct(p, false);
            return { product: p, candidates };
          } catch (prodErr) {
            console.warn(`[VideoFinder] Falha no produto "${p.name}":`, prodErr);
            return { product: p, candidates: [] as ScanCandidateItem[] };
          }
        })
      );

      for (const result of results) {
        completedCount++;
        if (Array.isArray(result.candidates) && result.candidates.length > 0) {
          foundVideosTotal += result.candidates.length;
          allCandidates.push(result);
        }
      }

      setScanProgress({
        current: Math.min(start + batch.length, targets.length),
        total: targets.length,
        currentProduct: start + batch.length < targets.length ? targets[start + batch.length].name : 'Finalizando...',
        foundCount: foundVideosTotal
      });
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
              type="button"
              onClick={() => bulkInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 shadow-md cursor-pointer"
            >
              <Upload className="h-4 w-4" /> Adicionar do Computador
            </button>
            <input
              ref={bulkInputRef}
              type="file"
              multiple
              accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleBulkFilesSelected(e.target.files);
                  e.target.value = '';
                }
              }}
            />
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

      {/* MODAL 2: Candidatos Encontrados na Varredura (Rule 6) */}
      {candidatesModal && typeof document !== 'undefined' && createPortal(
        <div
          style={{ zIndex: 90000 }}
          className="fixed inset-0 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
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
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-emerald-950 px-2 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-800/40">
                          {cand.platform}
                        </span>
                        {cand.confidence && (
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-bold border ${
                              cand.confidence === 'ALTA'
                                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
                                : cand.confidence === 'MÉDIA'
                                ? 'bg-amber-950/90 text-amber-300 border-amber-500/60'
                                : 'bg-slate-800 text-slate-300 border-slate-600/60'
                            }`}
                          >
                            Confiança {cand.confidence}
                          </span>
                        )}
                        {cand.sourceType && (
                          <span className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-300 border border-slate-700">
                            {cand.sourceType === 'anuncio_direto'
                              ? 'Anúncio Direto'
                              : cand.sourceType === 'dados_relacionados'
                              ? 'Dados Relacionados'
                              : 'Busca Externa'}
                          </span>
                        )}
                        <h4 className="font-medium text-white truncate text-sm">{cand.title}</h4>
                      </div>
                      <p className="mt-1 text-xs text-slate-400 truncate">Anúncio: {cand.adUrl}</p>
                      <p className="mt-0.5 text-xs text-emerald-400/90 truncate font-mono">Vídeo: {cand.videoUrl}</p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {/* Botão VISUALIZAR (Rule 6) */}
                        <button
                          type="button"
                          onClick={() => {
                            setVideoError(false);
                            setPreviewVideo({
                              url: cand.videoUrl,
                              title: cand.title,
                              platform: cand.platform,
                              adUrl: cand.adUrl
                            });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 shadow-sm transition"
                        >
                          <Eye className="h-3.5 w-3.5" /> VISUALIZAR
                        </button>

                        {/* Botão BAIXAR (Rule 6) */}
                        <a
                          href={cand.videoUrl}
                          download={`${normalize(candidatesModal.product.name)}.mp4`}
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 shadow-sm transition"
                        >
                          <Download className="h-3.5 w-3.5" /> BAIXAR
                        </a>

                        {/* Botão ABRIR ANÚNCIO */}
                        <a
                          href={cand.adUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white transition"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Abrir anúncio
                        </a>

                        {/* Botão SALVAR NO SUPABASE (Rule 21) */}
                        <button
                          type="button"
                          onClick={() => handleSaveCandidateToSupabase(candidatesModal.product, cand)}
                          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm ml-auto transition"
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
        </div>,
        document.body
      )}

      {/* MODAL 3: Inclusão de Vídeo (Upload do Computador ou Link Web) com Persistência no Supabase */}
      {addingForProduct && typeof document !== 'undefined' && createPortal(
        <div
          style={{ zIndex: 90000 }}
          className="fixed inset-0 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#121824] p-5 shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-emerald-400" />
                <h3 className="font-semibold text-white">Adicionar Vídeo do Produto</h3>
              </div>
              <button
                onClick={() => setAddingForProduct(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Produto: <strong className="text-white">{addingForProduct.name}</strong>
              {addingForProduct.sku && <span className="ml-2 text-slate-500">• SKU: {addingForProduct.sku}</span>}
            </p>

            {/* Seletor de Modo: Upload do Computador vs Link Web */}
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setAddMode('file');
                  setFormError('');
                }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition ${
                  addMode === 'file'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Laptop className="h-4 w-4" /> Upload do Computador (PC)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddMode('url');
                  setFormError('');
                }}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition ${
                  addMode === 'url'
                    ? 'bg-violet-700 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ExternalLink className="h-4 w-4" /> Link / URL da Web
              </button>
            </div>

            <div className="mt-4 space-y-3 overflow-y-auto pr-1 flex-1">
              {addMode === 'file' ? (
                /* MODO A: Upload de Arquivo do Computador */
                <div className="space-y-3">
                  <input
                    ref={singleFileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelected(e.target.files[0]);
                      }
                    }}
                  />

                  {!selectedFile ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={() => setIsDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragOver(false);
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleFileSelected(e.dataTransfer.files[0]);
                        }
                      }}
                      onClick={() => singleFileInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
                        isDragOver
                          ? 'border-blue-400 bg-blue-950/40'
                          : 'border-slate-700 bg-slate-900/60 hover:border-blue-500 hover:bg-slate-900'
                      }`}
                    >
                      <UploadCloud className="h-10 w-10 text-blue-400 mb-2" />
                      <p className="text-sm font-semibold text-white">
                        Arraste e solte o vídeo aqui ou clique para escolher
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Formatos suportados: MP4, WebM, MOV, M4V (direto do seu computador)
                      </p>
                      <button
                        type="button"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm"
                      >
                        <HardDrive className="h-3.5 w-3.5" /> Selecionar Arquivo do PC
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-blue-900/50 bg-slate-900/90 p-3.5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {fileThumbnail ? (
                            <img
                              src={fileThumbnail}
                              alt=""
                              className="h-16 w-16 shrink-0 rounded-lg border border-slate-700 bg-black object-contain"
                            />
                          ) : (
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950">
                              <FileVideo className="h-7 w-7 text-blue-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-white truncate text-xs sm:text-sm">{selectedFile.name}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span className="rounded bg-blue-950 px-2 py-0.5 font-mono text-[11px] text-blue-300 border border-blue-800/40">
                                {fileSizeFormatted}
                              </span>
                              {fileDuration && (
                                <span className="rounded bg-emerald-950 px-2 py-0.5 font-mono text-[11px] text-emerald-300 border border-emerald-800/40">
                                  {fileDuration}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFile(null);
                            if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
                            setFilePreviewUrl(null);
                            setFileThumbnail(null);
                          }}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-red-400 transition"
                          title="Remover / Escolher outro"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {filePreviewUrl && (
                        <div className="bg-black rounded-lg overflow-hidden border border-slate-800">
                          <video
                            controls
                            playsInline
                            src={filePreviewUrl}
                            className="max-h-44 w-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-slate-300">Origem / Marketplace</label>
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
                      <label className="mb-1 block text-xs text-slate-300">Duração estimada</label>
                      <input
                        value={newDuration}
                        onChange={(e) => setNewDuration(e.target.value)}
                        placeholder="Ex: 15 segundos"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-300">Link do anúncio de referência (opcional)</label>
                    <input
                      value={newAdUrl}
                      onChange={(e) => setNewAdUrl(e.target.value)}
                      placeholder="https://... (opcional)"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-slate-300">Observações (opcional)</label>
                    <input
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="Ex: Vídeo de unboxing gravado no estoque"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
              ) : (
                /* MODO B: Inserção via Link / URL da Web */
                <div className="space-y-3">
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
                </div>
              )}

              {formError && (
                <div className="flex items-center gap-1.5 rounded-lg border border-red-900/50 bg-red-950/30 p-2.5 text-xs text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => setAddingForProduct(null)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isUploading || (addMode === 'file' && !selectedFile)}
                onClick={handleSaveManualVideo}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm disabled:opacity-50 transition cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Salvando vídeo...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Salvar no Supabase
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL 4: Upload em Lote de Vídeos do Computador */}
      {bulkUploadModal && typeof document !== 'undefined' && createPortal(
        <div
          style={{ zIndex: 90000 }}
          className="fixed inset-0 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-[#121824] p-5 shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Laptop className="h-5 w-5 text-blue-400" />
                <h3 className="font-semibold text-white">Upload de Vídeos do Computador</h3>
                <span className="rounded bg-blue-950 px-2 py-0.5 text-xs font-bold text-blue-300 border border-blue-800/40">
                  {bulkFiles.length} arquivo(s)
                </span>
              </div>
              <button
                onClick={() => {
                  if (!isBulkUploading) {
                    setBulkUploadModal(false);
                    setBulkFiles([]);
                  }
                }}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Associe cada vídeo do computador ao produto correspondente do catálogo. O sistema tenta detectar automaticamente por nome ou SKU.
            </p>

            <div className="mt-4 space-y-3 overflow-y-auto pr-1 flex-1">
              {bulkFiles.map((item, index) => {
                const targetProduct = found.find((p) => String(p.id) === item.targetProductId);
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-3.5 transition ${
                      item.status === 'done'
                        ? 'border-emerald-800 bg-emerald-950/20'
                        : item.status === 'uploading'
                        ? 'border-blue-800 bg-blue-950/20'
                        : 'border-slate-700 bg-slate-900/80'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {item.thumbnail ? (
                          <img
                            src={item.thumbnail}
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-lg border border-slate-700 bg-black object-contain"
                          />
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-black">
                            <FileVideo className="h-6 w-6 text-blue-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-white truncate text-xs sm:text-sm">{item.file.name}</p>
                            <span className="text-[11px] font-mono text-slate-400 shrink-0">({item.sizeFormatted})</span>
                            {item.duration && (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-emerald-300 font-mono">
                                {item.duration}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <label className="text-xs text-slate-400 shrink-0">Vincular a:</label>
                            <select
                              value={item.targetProductId}
                              disabled={isBulkUploading}
                              onChange={(e) => {
                                const newProdId = e.target.value;
                                setBulkFiles((prev) =>
                                  prev.map((it, idx) => (idx === index ? { ...it, targetProductId: newProdId } : it))
                                );
                              }}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white focus:border-blue-500 focus:outline-none"
                            >
                              {found.map((p) => (
                                <option key={p.id} value={String(p.id)}>
                                  {p.name} {p.sku ? `(SKU: ${p.sku})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 justify-end">
                        {item.status === 'uploading' && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...
                          </span>
                        )}
                        {item.status === 'done' && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" /> Salvo
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400">
                            <AlertCircle className="h-4 w-4" /> Erro
                          </span>
                        )}
                        {item.status === 'idle' && !isBulkUploading && (
                          <button
                            type="button"
                            onClick={() => setBulkFiles((prev) => prev.filter((_, idx) => idx !== index))}
                            className="rounded-lg p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
                            title="Remover vídeo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
              <span className="text-xs text-slate-400">
                {bulkFiles.filter((b) => b.status === 'done').length} de {bulkFiles.length} vídeo(s) persistidos
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isBulkUploading}
                  onClick={() => {
                    setBulkUploadModal(false);
                    setBulkFiles([]);
                  }}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={isBulkUploading || !bulkFiles.length}
                  onClick={handleSaveBulkFiles}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 shadow-sm disabled:opacity-50 transition cursor-pointer"
                >
                  {isBulkUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Salvando no Supabase...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" /> Salvar Todos no Supabase
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
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
                  disabled={!!scanning && scanning !== p.id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50 cursor-pointer"
                >
                  <Search className="h-3.5 w-3.5" />
                  {scanning === p.id ? 'Verificando...' : 'Buscar vídeos reais'}
                </button>

                {/* Botão Upload Direto do Computador (PC) para este Produto */}
                <button
                  type="button"
                  onClick={() => openAddModal(p, 'file')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500 shadow-sm cursor-pointer"
                >
                  <Laptop className="h-3.5 w-3.5" /> Upload do PC
                </button>

                {/* Botão Adicionar via Link Web */}
                <button
                  type="button"
                  onClick={() => openAddModal(p, 'url')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-violet-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-violet-600 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Link Web
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
                {platforms.filter((m) => m !== 'Vídeo Próprio / PC').map((m) => (
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
                          className={`flex flex-wrap items-center gap-2 text-xs font-semibold ${
                            v.downloaded ? 'text-sky-300' : 'text-emerald-300'
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          <span>
                            VÍDEO {index + 1} • {v.platform.toUpperCase()}
                          </span>
                          {v.confidence && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                                v.confidence === 'ALTA'
                                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
                                  : v.confidence === 'MÉDIA'
                                  ? 'bg-amber-950/90 text-amber-300 border-amber-500/60'
                                  : 'bg-slate-800 text-slate-300 border-slate-600/60'
                              }`}
                            >
                              {v.confidence}
                            </span>
                          )}
                          {v.sourceType && (
                            <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[9px] font-normal text-slate-300 border border-slate-700">
                              {v.sourceType === 'anuncio_direto'
                                ? 'Anúncio Direto'
                                : v.sourceType === 'dados_relacionados'
                                ? 'Dados Relacionados'
                                : 'Busca Externa'}
                            </span>
                          )}
                          <span className="text-slate-400">• PERSISTIDO NO SUPABASE</span>
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
                          <AsyncVideoPlayer
                            controls
                            playsInline
                            url={v.videoUrl}
                            className="max-h-60 w-full max-w-lg rounded-lg border border-slate-800 bg-black"
                          />
                        </div>
                      )}

                      {/* Ações do Vídeo (Rule 6: VISUALIZAR e BAIXAR) */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {v.videoUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setVideoError(false);
                              setPreviewVideo({
                                url: v.videoUrl!,
                                title: p.name,
                                platform: v.platform,
                                adUrl: v.url
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-600 shadow-sm transition"
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

      {/* MODAL GLOBAL DE VISUALIZAÇÃO DE VÍDEO (createPortal + zIndex 999999 para ficar sempre à frente de todos os modais e elementos) */}
      {previewVideo && typeof document !== 'undefined' && createPortal(
        <div
          style={{ zIndex: 999999 }}
          onClick={() => setPreviewVideo(null)}
          className="fixed inset-0 flex items-center justify-center bg-black/90 p-3 sm:p-4 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl rounded-2xl border border-slate-700 bg-[#121824] p-4 sm:p-5 shadow-2xl relative flex flex-col max-h-[95vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <Play className="h-5 w-5 shrink-0 text-emerald-400" />
                <h3 className="font-semibold text-white truncate text-sm sm:text-base">
                  {previewVideo.title ? `Vídeo: ${previewVideo.title}` : 'Visualizar Vídeo do Produto'}
                </h3>
                {previewVideo.platform && (
                  <span className="shrink-0 rounded bg-violet-950 px-2.5 py-0.5 text-xs font-semibold text-violet-300 border border-violet-800/50">
                    {previewVideo.platform}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewVideo(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition shrink-0"
                title="Fechar (Esc)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Video Player */}
            <div className="mt-3 flex-1 min-h-0 flex items-center justify-center bg-black rounded-xl overflow-hidden border border-slate-800 shadow-inner relative">
              {videoError ? (
                <div className="p-6 text-center space-y-3 max-w-md">
                  <AlertCircle className="h-10 w-10 text-amber-400 mx-auto" />
                  <h4 className="text-sm font-semibold text-white">Reprodução direta bloqueada pelo navegador/CDN</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    O arquivo de vídeo foi localizado com sucesso, porém o servidor de mídia requer acesso direto.
                    Você pode abri-lo diretamente ou fazer o download abaixo.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <a
                      href={previewVideo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm transition"
                    >
                      <ExternalLink className="h-4 w-4" /> Assistir em Nova Aba
                    </a>
                    <a
                      href={previewVideo.url}
                      download="video-produto.mp4"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:text-white transition"
                    >
                      <Download className="h-4 w-4" /> Baixar MP4
                    </a>
                  </div>
                </div>
              ) : (
                <AsyncVideoPlayer
                  key={previewVideo.url}
                  controls
                  autoPlay
                  playsInline
                  url={previewVideo.url}
                  onError={() => setVideoError(true)}
                  className="max-h-[60vh] w-full object-contain"
                />
              )}
            </div>

            {/* Footer com Ações */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
              <div className="min-w-0 max-w-sm">
                <span className="block text-[11px] text-slate-400 truncate font-mono" title={previewVideo.url}>
                  {previewVideo.url}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {previewVideo.adUrl && (
                  <a
                    href={previewVideo.adUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Ver Anúncio
                  </a>
                )}
                <a
                  href={previewVideo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir Link Direto
                </a>
                <a
                  href={previewVideo.url}
                  download="video-produto.mp4"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm transition"
                >
                  <Download className="h-3.5 w-3.5" /> Baixar MP4
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewVideo(null)}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
