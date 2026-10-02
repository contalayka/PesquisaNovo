import React, { useState, useEffect } from 'react';
import { Product, ResearchRecord, ProductStatus, ConfidenceLevel } from '../types';
import { formatCurrency, parseNumber } from '../utils/excel';
import { ProductImage } from './ProductImage';
import {
  X,
  ExternalLink,
  Search,
  Save,
  Trash2,
  Tag,
  Globe,
  Link as LinkIcon,
  DollarSign,
  FileText,
  Image as ImageIcon,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Plus,
  Edit2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
  Calculator,
} from 'lucide-react';

interface ResearchModalProps {
  product: Product;
  allProducts?: Product[];
  onSaveRecord: (productId: string, record: ResearchRecord) => void;
  onDeleteRecord: (productId: string, recordId: string) => void;
  onUpdateStatus: (productId: string, status: ProductStatus) => void;
  onNavigate?: (targetProduct: Product) => void;
  onClose: () => void;
  onOpenSimulator?: (product: Product) => void;
}

const COMMON_PLATFORMS = ['Shopee', 'TikTok Shop', 'SHEIN', 'UpSeller ERP', 'Outro'];

export const ResearchModal: React.FC<ResearchModalProps> = ({
  product,
  allProducts = [],
  onSaveRecord,
  onDeleteRecord,
  onUpdateStatus,
  onNavigate,
  onClose,
  onOpenSimulator,
}) => {
  // Option Form State
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [foundName, setFoundName] = useState('');
  const [platform, setPlatform] = useState('Shopee');
  const [store, setStore] = useState('');
  const [url, setUrl] = useState('');
  const [price, setPrice] = useState<string | number>('');
  const [confidence, setConfidence] = useState<ConfidenceLevel>('Média');
  const [note, setNote] = useState('');

  // UI helpers
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copiedName, setCopiedName] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const productRecords = product.research_records || [];

  // Initialize or reset form when product changes
  useEffect(() => {
    setEditingRecordId(null);
    setFoundName(product.name);
    setPlatform('Shopee');
    setStore('');
    setUrl('');
    setPrice('');
    setConfidence('Média');
    setNote('');
    setShowForm(productRecords.length === 0);
  }, [product.id, product.name, productRecords.length]);

  // Find index and next/prev products safely
  const safeProducts = allProducts || [];
  const currentIndex = safeProducts.findIndex((p) => p.id === product.id);
  const prevProduct = currentIndex > 0 ? safeProducts[currentIndex - 1] : null;
  const nextProduct = currentIndex >= 0 && currentIndex < safeProducts.length - 1 ? safeProducts[currentIndex + 1] : null;

  // Find next pending product
  const nextPendingProduct = safeProducts.find(
    (p, idx) => idx > currentIndex && p.status === 'Pendente'
  ) || safeProducts.find((p) => p.status === 'Pendente' && p.id !== product.id) || null;

  // Search URLs
  const query = encodeURIComponent(product.name);
  const shopeeUrl = `https://shopee.com.br/search?keyword=${query}`;
  const shopeeImageUrl = product.image ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(product.image)}` : shopeeUrl;
  const tiktokUrl = `https://www.tiktok.com/search?q=${query}`;
  const sheinUrl = `https://br.shein.com/pdsearch/${query}/`;
  const googleLensUrl = product.image ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(product.image)}` : `https://www.google.com/search?tbm=isch&q=${query}`;
  const googleShopUrl = `https://www.google.com/search?tbm=shop&q=${query}`;

  const hasCode = product.id && !product.id.startsWith('prod_');
  const shopeeCodeUrl = hasCode ? `https://shopee.com.br/search?keyword=${encodeURIComponent(product.id)}` : '';

  const handleCopy = (text: string, type: 'name' | 'image' | string) => {
    navigator.clipboard.writeText(text);
    if (type === 'name') {
      setCopiedName(true);
      setTimeout(() => setCopiedName(false), 2000);
    } else if (type === 'image') {
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2000);
    } else {
      setCopiedLink(type);
      setTimeout(() => setCopiedLink(null), 2000);
    }
  };

  const handleEditRecord = (record: ResearchRecord) => {
    setEditingRecordId(record.id);
    setFoundName(record.found_name);
    setPlatform(record.platform);
    setStore(record.store);
    setUrl(record.url);
    setPrice(record.price);
    setConfidence(record.confidence);
    setNote(record.note);
    setShowForm(true);
  };

  const handleUrlInputChange = (val: string) => {
    setUrl(val);
    const lower = val.toLowerCase();
    if (lower.includes('shopee')) {
      setPlatform('Shopee');
    } else if (lower.includes('shein')) {
      setPlatform('SHEIN');
    } else if (lower.includes('tiktok')) {
      setPlatform('TikTok Shop');
    } else if (lower.includes('upseller')) {
      setPlatform('UpSeller ERP');
    }
  };

  const handleSaveOption = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseNumber(price);

    let cleanUrl = url.trim();
    if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    let finalPlatform = platform.trim();
    if (cleanUrl) {
      const lower = cleanUrl.toLowerCase();
      if (lower.includes('shopee')) {
        finalPlatform = 'Shopee';
      } else if (lower.includes('shein')) {
        finalPlatform = 'SHEIN';
      } else if (lower.includes('tiktok')) {
        finalPlatform = 'TikTok Shop';
      } else if (lower.includes('upseller')) {
        finalPlatform = 'UpSeller ERP';
      }
    }

    const finalName = foundName.trim() || product.name || 'Anúncio Encontrado';

    const record: ResearchRecord = {
      id: editingRecordId || `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      product_id: product.id,
      found_name: finalName,
      platform: finalPlatform,
      store: store.trim(),
      price: parsedPrice,
      url: cleanUrl,
      confidence,
      note: note.trim(),
      researched_at: new Date().toISOString(),
    };

    onSaveRecord(product.id, record);

    // If product status is still Pendente, automatically advance to Encontrado or Revisar
    if (product.status === 'Pendente') {
      onUpdateStatus(product.id, confidence === 'Alta' ? 'Encontrado' : 'Revisar');
    }

    // Reset form
    setEditingRecordId(null);
    setFoundName(product.name);
    setUrl('');
    setPrice('');
    setNote('');
    setShowForm(false);
  };

  const handleStatusClick = (newStatus: ProductStatus) => {
    onUpdateStatus(product.id, newStatus);
    // If marked as Encontrado or Descartado and there is a next pending product, offer quick jump
    if ((newStatus === 'Encontrado' || newStatus === 'Descartado') && nextPendingProduct && onNavigate) {
      onNavigate(nextPendingProduct);
    }
  };

  // Instant margin preview
  const parsedPriceNum = parseNumber(price);
  const costNum = typeof product.cost === 'number' ? product.cost : parseFloat(String(product.cost)) || 0;
  const instantMarkup = costNum > 0 && typeof parsedPriceNum === 'number' && parsedPriceNum > 0
    ? (parsedPriceNum / costNum).toFixed(1)
    : null;
  const instantSpread = typeof parsedPriceNum === 'number' && parsedPriceNum > costNum
    ? parsedPriceNum - costNum
    : null;

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (isInput) return;

      if (e.key === 'ArrowLeft' && prevProduct && onNavigate) {
        e.preventDefault();
        onNavigate(prevProduct);
      } else if (e.key === 'ArrowRight' && nextProduct && onNavigate) {
        e.preventDefault();
        onNavigate(nextProduct);
      } else if (e.key === '4' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        window.open(googleLensUrl, '_blank', 'noopener,noreferrer');
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        handleStatusClick('Encontrado');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleStatusClick('Revisar');
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleStatusClick('Descartado');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevProduct, nextProduct, googleLensUrl, onClose, onNavigate]);

  return (
    <div
      id="research-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="research-modal"
        className="w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-4 flex flex-col max-h-[94vh]"
      >
        {/* Top Header Bar with Navigation */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              Produto {currentIndex >= 0 ? currentIndex + 1 : 1} de {safeProducts.length || 1}
            </span>

            {/* Quick status selector */}
            <div className="flex items-center gap-1.5">
              {(['Pendente', 'Encontrado', 'Revisar', 'Descartado'] as ProductStatus[]).map((s) => {
                const isActive = product.status === s;
                let activeClass = '';
                if (s === 'Pendente') activeClass = 'bg-amber-500 text-white font-bold';
                else if (s === 'Encontrado') activeClass = 'bg-emerald-600 text-white font-bold';
                else if (s === 'Revisar') activeClass = 'bg-purple-600 text-white font-bold';
                else if (s === 'Descartado') activeClass = 'bg-slate-600 text-white font-bold';

                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatusClick(s)}
                    className={`px-2.5 py-1 text-[11px] rounded-lg border transition ${
                      isActive
                        ? activeClass
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Prev / Next buttons */}
            <div className="flex items-center gap-1 mr-2">
              <button
                type="button"
                id="btn-nav-prev"
                disabled={!prevProduct || !onNavigate}
                onClick={() => prevProduct && onNavigate?.(prevProduct)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition"
                title="Produto Anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                id="btn-nav-next"
                disabled={!nextProduct || !onNavigate}
                onClick={() => nextProduct && onNavigate?.(nextProduct)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition"
                title="Próximo Produto"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {nextPendingProduct && onNavigate && (
              <button
                type="button"
                id="btn-jump-next-pending"
                onClick={() => onNavigate(nextPendingProduct)}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Próximo Pendente</span>
              </button>
            )}

            <button
              id="close-research-modal-btn"
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* Reference Product Card */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            {/* Image */}
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center shadow-xs">
              <ProductImage
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover"
                fallbackIconSize="w-8 h-8"
                showEmptyText
              />
            </div>

            {/* Product Details */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  ID: {product.id}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  product.available
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                }`}>
                  {product.available ? 'Disponível' : 'Indisponível'}
                </span>
                {product.is_new && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white">
                    NOVO NO CATÁLOGO
                  </span>
                )}
              </div>

              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
                {product.name}
              </h3>

              {/* Flat Cost Display */}
              <div className="mt-3 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Custo Unitário:
                  </span>
                  <span className="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(product.cost)}
                  </span>
                </div>

                {/* Quick copy tools */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(product.name, 'name')}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition whitespace-nowrap"
                  >
                    {copiedName ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedName ? 'Copiado' : 'Copiar Nome'}</span>
                  </button>

                  {product.image && (
                    <button
                      type="button"
                      onClick={() => handleCopy(product.image, 'image')}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition whitespace-nowrap"
                    >
                      {copiedImage ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <ImageIcon className="w-3.5 h-3.5" />}
                      <span>{copiedImage ? 'URL Copiada' : 'Copiar Foto'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Search Buttons Bar */}
          <div>
            <div className="flex items-center gap-2 mb-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Search className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Pesquisar em Marketplaces (abre em nova guia):</span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Google Lens Imagem - Visual vibrante e alto contraste */}
              <a
                id="search-google-lens-btn"
                href={googleLensUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 hover:from-blue-500 hover:via-indigo-500 hover:to-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-950/40 border border-blue-400/40 hover:scale-[1.02] active:scale-[0.98] transition-all group"
                title="Pesquisar este produto por imagem no Google Lens (abre em nova guia)"
              >
                <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center shrink-0 border border-white/30 group-hover:bg-white/30 transition">
                  <Search className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="text-left leading-tight">
                  <div className="flex items-center gap-1.5 font-extrabold text-white text-xs">
                    <span>Google Lens</span>
                    <ExternalLink className="w-3 h-3 opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition" />
                  </div>
                  <span className="text-[11px] text-blue-100 font-medium">Busca por Imagem [4]</span>
                </div>
              </a>
            </div>

            {hasCode && (
              <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Buscar pelo Código ({product.id}):</span>
                <a
                  href={shopeeCodeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 hover:text-white font-bold transition text-xs inline-flex items-center gap-1"
                >
                  <span>Shopee por Código</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              </div>
            )}
          </div>

          {/* Saved Options List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Opções de Anúncios Salvos ({product.research_records.length})
                </h4>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Copie o link para usar no UpSeller
                </span>
              </div>

              {!showForm && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRecordId(null);
                    setFoundName(product.name);
                    setUrl('');
                    setPrice('');
                    setNote('');
                    setShowForm(true);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 transition shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Opção de Anúncio</span>
                </button>
              )}
            </div>

            {/* List of records */}
            {product.research_records.length > 0 ? (
              <div className="space-y-2.5">
                {product.research_records.map((rec, index) => {
                  const isCopied = copiedLink === rec.id;
                  const numCost = typeof product.cost === 'number' ? product.cost : parseFloat(String(product.cost));
                  const numPrice = typeof rec.price === 'number' ? rec.price : parseFloat(String(rec.price));
                  const diff = !isNaN(numCost) && !isNaN(numPrice) && numCost > 0 ? numPrice - numCost : null;

                  return (
                    <div
                      key={rec.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                            Opção {index + 1}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {rec.platform}
                          </span>
                          {rec.store && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Loja: {rec.store}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            rec.confidence === 'Alta'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : rec.confidence === 'Média'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}>
                            Confiança {rec.confidence}
                          </span>
                        </div>

                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {rec.found_name || 'Sem nome registrado'}
                        </p>

                        <div className="flex items-center gap-4 mt-1.5 text-xs">
                          {rec.price !== '' && (
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                              Preço: {formatCurrency(rec.price)}
                            </span>
                          )}

                          {diff !== null && (
                            <span className={`font-semibold ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              Diferença vs Custo: {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                            </span>
                          )}
                        </div>

                        {rec.note && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">
                            "{rec.note}"
                          </p>
                        )}
                      </div>

                      {/* Record actions */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {rec.url && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCopy(rec.url, rec.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 flex items-center gap-1.5 transition"
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{isCopied ? 'Link Copiado!' : 'Copiar Link UpSeller'}</span>
                            </button>

                            <a
                              href={rec.url.startsWith('http') ? rec.url : `https://${rec.url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                              title="Abrir Anúncio em Nova Aba"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => handleEditRecord(rec)}
                          className="p-2 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          title="Editar Opção"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteRecord(product.id, rec.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950 transition"
                          title="Excluir Opção"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              !showForm && (
                <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400 text-xs">
                  Nenhuma opção de anúncio salva ainda. Use os botões de busca acima e adicione a primeira opção encontrada!
                </div>
              )
            )}
          </div>

          {/* Form to Add / Edit Record */}
          {showForm && (
            <form
              onSubmit={handleSaveOption}
              className="p-5 rounded-2xl border-2 border-indigo-500/40 bg-indigo-50/20 dark:bg-indigo-950/20 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-indigo-100 dark:border-indigo-900">
                <h5 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  {editingRecordId ? 'Editar Opção de Anúncio' : 'Nova Opção de Anúncio Encontrada'}
                </h5>

                {product.research_records.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    Cancelar
                  </button>
                )}
              </div>

              {/* Grid Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Nome Encontrado */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nome Encontrado no Anúncio
                  </label>
                  <input
                    type="text"
                    value={foundName}
                    onChange={(e) => setFoundName(e.target.value)}
                    placeholder={product.name}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* 2. Plataforma */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Plataforma / Marketplace
                  </label>
                  <div className="flex gap-1.5 flex-wrap mb-1.5">
                    {COMMON_PLATFORMS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPlatform(p)}
                        className={`px-2 py-0.5 text-[11px] rounded-md transition ${
                          platform === p
                            ? 'bg-indigo-600 text-white font-bold'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Link do Anúncio */}
                <div className="sm:col-span-2">
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    <span>Link do Anúncio (para copiar no UpSeller)</span>
                    {url && (
                      <a
                        href={url.startsWith('http') ? url : `https://${url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 dark:text-indigo-400 text-xs hover:underline flex items-center gap-1"
                      >
                        Testar link
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => handleUrlInputChange(e.target.value)}
                    placeholder="Cole o link aqui (ex: https://produto.mercadolivre.com.br/... ou https://shopee.com.br/...)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* 4. Preço Encontrado */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Preço Encontrado (R$)
                    </label>
                    {instantMarkup && (
                      <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-300 dark:border-emerald-800">
                        {instantMarkup}x markup {instantSpread ? `(+${formatCurrency(instantSpread)})` : ''}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Ex: 34.90"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* 5. Nível de Confiança */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nível de Confiança da Correspondência
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Alta', 'Média', 'Baixa'] as ConfidenceLevel[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setConfidence(c)}
                        className={`py-1.5 rounded-lg text-xs font-bold transition border ${
                          confidence === c
                            ? c === 'Alta'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : c === 'Média'
                              ? 'bg-amber-500 text-white border-amber-500'
                              : 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6. Observação */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Observação
                  </label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex: Anúncio do mesmo fabricante; inclui 5 unidades; frete grátis Full; conferir tamanho antes de importar no UpSeller..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                  />
                </div>
              </div>

              {/* Form buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm transition"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingRecordId ? 'Salvar Alteração' : 'Salvar Esta Opção'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Bottom Actions Bar */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Ações rápidas:
            </span>
            <button
              type="button"
              onClick={() => handleStatusClick('Encontrado')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 transition"
              title="Atalho: Tecla E"
            >
              Encontrado <span className="text-[10px] opacity-60 font-mono">[E]</span>
            </button>
            <button
              type="button"
              onClick={() => handleStatusClick('Revisar')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 hover:bg-purple-200 transition"
              title="Atalho: Tecla R"
            >
              Revisar <span className="text-[10px] opacity-60 font-mono">[R]</span>
            </button>
            <button
              type="button"
              onClick={() => handleStatusClick('Descartado')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 hover:bg-slate-300 transition"
              title="Atalho: Tecla D"
            >
              Descartar <span className="text-[10px] opacity-60 font-mono">[D]</span>
            </button>

            {onOpenSimulator && (
              <button
                type="button"
                id="btn-open-sim-from-research"
                onClick={() => onOpenSimulator(product)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition flex items-center gap-1.5"
                title="Abrir simulador com os dados deste produto"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Simular Margem</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Keyboard shortcuts subtle indicator */}
            <div className="hidden md:flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
              <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">←/→</span>
              <span>navegar</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">4</span>
              <span>Google Lens</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">Esc</span>
              <span>fechar</span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition shadow-xs"
            >
              Concluir e Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
