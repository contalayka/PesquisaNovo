import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Product, ResearchRecord, ProductStatus, FilterStatus, GeneratedFile } from './types';
import {
  readSpreadsheetFile,
  convertRowsToProducts,
  mergeCatalogs,
  exportProductsToExcel,
  exportProductsToCsv,
  downloadSampleTemplate,
  ColumnDetectionResult,
  resolveImageUrl,
  isActualImageSource,
} from './utils/excel';
import {
  getStoredSupabaseConfig,
  fetchProductsFromSupabase,
  upsertProductsToSupabase,
  saveResearchRecordToSupabase,
  deleteResearchRecordFromSupabase,
  updateProductStatusInSupabase,
  updateMultipleProductsStatusInSupabase,
  updateProductIsNew,
  updateMultipleProductsIsNew,
  deleteProductsFromSupabase,
  clearAllSupabaseData,
  isSupabaseConfigured,
  subscribeToSupabaseChanges,
} from './utils/supabase';
import {
  GitHubSyncConfig,
  getStoredGitHubConfig,
  isGitHubSyncConfigured,
  pushDataToGitHub,
  pullDataFromGitHub,
} from './utils/githubSync';
import { GitHubSyncPayload } from './types';
import { Header } from './components/Header';
import { Sidebar, SidebarSection } from './components/Sidebar';
import { ProductCard } from './components/ProductCard';
import { ProductTableView } from './components/ProductTableView';
import { SummaryMetrics } from './components/SummaryMetrics';
import { FiltersDrawer, AdvancedFiltersState } from './components/FiltersDrawer';
import { ResearchModal } from './components/ResearchModal';
import { ColumnMapperModal } from './components/ColumnMapperModal';
import { UploadDropzone } from './components/UploadDropzone';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { PriceSimulatorModal } from './components/PriceSimulatorModal';
import { AddProductModal } from './components/AddProductModal';
import { ProductDetailModal } from './components/ProductDetailModal';
import { DashboardView } from './components/DashboardView';
import { CatalogImportView } from './components/CatalogImportView';
import { ConversionView } from './components/ConversionView';
import { MarketplacesView } from './components/MarketplacesView';
import { GeneratedFilesView } from './components/GeneratedFilesView';
import { SettingsView } from './components/SettingsView';
import { InternalInventoryView } from './components/InternalInventoryView';
import { ToastContainer, ToastMessage } from './components/Toast';
import { useDevice } from './utils/device';
import {
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  ArrowUpDown,
  LayoutGrid,
  List,
  X,
  RotateCcw,
  Layers,
  FileSpreadsheet,
  Trash2,
  Undo2,
  ArrowUp,
  RefreshCw,
  Check,
} from 'lucide-react';

const STORAGE_KEY = 'minha_loja_produtos_pesquisa_v2';
const PREV_STORAGE_KEY = 'minha_loja_produtos_backup_prev_v2';
const LAST_IMPORT_IDS_KEY = 'minha_loja_ultima_importacao_ids_v1';
const GENERATED_FILES_STORAGE_KEY = 'pesquisa_produtos_arquivos_gerados_v1';
const SIDEBAR_COLLAPSED_KEY = 'pesquisa_produtos_sidebar_collapsed';
const VIEW_MODE_KEY = 'pesquisa_produtos_view_mode';

export default function App() {
  // Local storage cache for products
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((p: any) => {
            // Self-heal product image if missing, corrupted or set to scraper metadata/landing page
            let finalImage = p.image;
            if (
              !finalImage ||
              !isActualImageSource(finalImage) ||
              String(finalImage).includes('web_scraper') ||
              String(finalImage).includes('start_url') ||
              String(finalImage).endsWith('/decoracao') ||
              String(finalImage).endsWith('/decoracao/')
            ) {
              finalImage = resolveImageUrl(finalImage, p.rawColumns, p.name);
            }

            return {
              ...p,
              image: finalImage,
              status: p.status || (p.research?.site ? 'Encontrado' : 'Pendente'),
              available: p.available !== undefined ? p.available : true,
              research_records: Array.isArray(p.research_records)
                ? p.research_records
                : p.research && (p.research.site || p.research.link)
                ? [
                    {
                      id: `legacy_${p.id}`,
                      product_id: p.id,
                      found_name: p.research.foundName || p.name,
                      platform: p.research.site || 'Mercado Livre',
                      store: '',
                      price: p.research.foundPrice || '',
                      url: p.research.link || '',
                      confidence: 'Média',
                      note: p.research.observation || '',
                      researched_at: new Date().toISOString(),
                    },
                  ]
                : [],
            };
          });
        }
      }
    } catch (e) {
      console.error('Erro ao ler do localStorage', e);
    }
    return [];
  });

  const device = useDevice();

  // Return to the top with one click or with the Home key (except while typing).
  const scrollToTop = useCallback(() => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }, []);

  useEffect(() => {
    const handleHomeKey = (event: KeyboardEvent) => {
      if (event.key !== 'Home') return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable =
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target?.isContentEditable;

      if (isEditable) return;
      event.preventDefault();
      scrollToTop();
    };

    window.addEventListener('keydown', handleHomeKey);
    return () => window.removeEventListener('keydown', handleHomeKey);
  }, [scrollToTop]);

  // Layout and view states
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [currentSidebarSection, setCurrentSidebarSection] = useState<SidebarSection>('inicio');
  const [productForDetails, setProductForDetails] = useState<Product | null>(null);

  // Auto-adapt layout whenever device changes or user resizes window (e.g., Computer vs Android vs Tablet)
  useEffect(() => {
    if (device.isMobile) {
      // On mobile/Android devices, sidebar drawer should be closed by default, navigation is via bottom dock & top header
      setIsMobileSidebarOpen(false);
    }
  }, [device.isMobile]);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      return saved === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });

  const [mobileGridCols, setMobileGridCols] = useState<'2' | '1'>(() => {
    try {
      const saved = localStorage.getItem('pesquisa_produtos_mobile_grid_cols');
      return saved === '1' ? '1' : '2';
    } catch {
      return '2';
    }
  });

  const handleToggleMobileGridCols = (cols: '2' | '1') => {
    setMobileGridCols(cols);
    try {
      localStorage.setItem('pesquisa_produtos_mobile_grid_cols', cols);
    } catch {}
  };

  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<
    | 'original'
    | 'name_asc'
    | 'name_desc'
    | 'lowest_cost'
    | 'highest_cost'
    | 'lowest_price'
    | 'highest_price'
    | 'pending_first'
    | 'with_records'
  >('original');

  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFiltersState>({
    status: 'all',
    platform: 'all',
    minCost: '',
    maxCost: '',
    onlyNew: false,
    onlyWithRecords: false,
    onlyAvailable: false,
  });

  const [isFiltersDrawerOpen, setIsFiltersDrawerOpen] = useState(false);

  // Modal and feedback states
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activeResearchProduct, setActiveResearchProduct] = useState<Product | null>(null);
  const [simulatorProduct, setSimulatorProduct] = useState<Product | null>(null);
  const [showSimulatorModal, setShowSimulatorModal] = useState(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [detectionPending, setDetectionPending] = useState<ColumnDetectionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState<boolean>(() =>
    isSupabaseConfigured()
  );
  const [githubConfig, setGithubConfig] = useState<GitHubSyncConfig>(() => getStoredGitHubConfig());
  const [isSyncingGitHub, setIsSyncingGitHub] = useState(false);
  const [previousProducts, setPreviousProducts] = useState<Product[] | null>(() => {
    try {
      const saved = localStorage.getItem(PREV_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>(() => {
    try {
      const saved = localStorage.getItem(GENERATED_FILES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleAddGeneratedFiles = useCallback((newFiles: GeneratedFile[]) => {
    setGeneratedFiles((prev) => {
      const updated = [...newFiles, ...prev].slice(0, 50);
      try {
        localStorage.setItem(GENERATED_FILES_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Falha ao salvar arquivos gerados no localStorage', e);
      }
      return updated;
    });
  }, []);

  const handleClearGeneratedFiles = useCallback(() => {
    setGeneratedFiles([]);
    try {
      localStorage.removeItem(GENERATED_FILES_STORAGE_KEY);
    } catch (e) {
      console.error('Falha ao limpar arquivos gerados', e);
    }
  }, []);

  // Persistence for viewMode
  const handleChangeViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {}
  };

  const addToast = useCallback(
    (title: string, description?: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      setToasts((prev) => [...prev, { id, title, description, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3500);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // GitHub Auto-push debounced effect (Persistência automática no repositório remoto)
  const ghAutoPushTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const isGhFirstRender = React.useRef(true);

  useEffect(() => {
    if (isGhFirstRender.current) {
      isGhFirstRender.current = false;
      return;
    }

    const ghConfig = getStoredGitHubConfig();
    if (!ghConfig.autoPush || !isGitHubSyncConfigured(ghConfig)) {
      return;
    }

    if (ghAutoPushTimerRef.current) {
      clearTimeout(ghAutoPushTimerRef.current);
    }

    ghAutoPushTimerRef.current = setTimeout(async () => {
      try {
        const payload: GitHubSyncPayload = {
          version: '2.0',
          updatedAt: new Date().toISOString(),
          source: 'app-auto-push',
          totalProducts: products.length,
          products,
          pricingSettings: {
            markup: localStorage.getItem('saas_settings_markup') || '100',
            tax: localStorage.getItem('saas_settings_tax') || '6',
            packaging: localStorage.getItem('saas_settings_packaging') || '3.50',
          },
        };
        const res = await pushDataToGitHub(ghConfig, payload);
        if (res.success) {
          setGithubConfig(getStoredGitHubConfig());
          addToast(
            'GitHub Sincronizado',
            `Push automático: ${products.length} itens persistidos no repositório remoto.`,
            'success'
          );
        }
      } catch (err) {
        console.warn('Falha no auto-push do GitHub:', err);
      }
    }, 3500);

    return () => {
      if (ghAutoPushTimerRef.current) {
        clearTimeout(ghAutoPushTimerRef.current);
      }
    };
  }, [products, addToast]);

  // Se abrir o app em máquina sem produtos locais, sincroniza automaticamente do GitHub se configurado
  useEffect(() => {
    const ghConfig = getStoredGitHubConfig();
    const hasLocal = localStorage.getItem(STORAGE_KEY);
    if (!hasLocal && isGitHubSyncConfigured(ghConfig)) {
      pullDataFromGitHub(ghConfig)
        .then((res) => {
          if (res.success && res.data && res.data.products.length > 0) {
            setProducts(res.data.products);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data.products));
            if (res.data.pricingSettings) {
              if (res.data.pricingSettings.markup)
                localStorage.setItem('saas_settings_markup', res.data.pricingSettings.markup);
              if (res.data.pricingSettings.tax)
                localStorage.setItem('saas_settings_tax', res.data.pricingSettings.tax);
              if (res.data.pricingSettings.packaging)
                localStorage.setItem('saas_settings_packaging', res.data.pricingSettings.packaging);
            }
            setGithubConfig(getStoredGitHubConfig());
            addToast(
              'Repositório GitHub',
              `${res.data.products.length} produtos carregados do repositório remoto nesta máquina.`,
              'info'
            );
          }
        })
        .catch(console.error);
    }
  }, [addToast]);

  // Sincronização manual global solicitada pelo usuário no botão do topo
  const handleManualGlobalSync = useCallback(async () => {
    const ghConfig = getStoredGitHubConfig();
    const isGhReady = isGitHubSyncConfigured(ghConfig);
    const isSupaReady = isSupabaseConfigured();

    if (!isGhReady && !isSupaReady) {
      setCurrentSidebarSection('configuracoes');
      addToast(
        'Configurar Sincronização',
        'Cadastre seu token e repositório nas Configurações para habilitar a sincronização.',
        'info'
      );
      return;
    }

    setIsSyncingGitHub(true);

    let ghSuccess = false;
    let ghMessage = '';

    if (isGhReady) {
      try {
        const payload: GitHubSyncPayload = {
          version: '2.0',
          updatedAt: new Date().toISOString(),
          source: 'manual-header-button',
          totalProducts: products.length,
          products,
          pricingSettings: {
            markup: localStorage.getItem('saas_settings_markup') || '100',
            tax: localStorage.getItem('saas_settings_tax') || '6',
            packaging: localStorage.getItem('saas_settings_packaging') || '3.50',
          },
        };
        const res = await pushDataToGitHub(
          ghConfig,
          payload,
          `Sincronização manual antes de fechar o navegador: ${products.length} produtos [${new Date().toLocaleString('pt-BR')}]`
        );
        ghSuccess = res.success;
        ghMessage = res.message;
        if (res.success) {
          setGithubConfig(getStoredGitHubConfig());
        }
      } catch (err: any) {
        ghMessage = err?.message || 'Erro ao sincronizar com GitHub';
      }
    }

    if (isSupaReady) {
      try {
        await upsertProductsToSupabase(products);
      } catch (e) {
        console.warn('Erro ao sincronizar Supabase no botão manual:', e);
      }
    }

    setIsSyncingGitHub(false);

    if (isGhReady) {
      if (ghSuccess) {
        addToast(
          'Sincronização Concluída',
          `Push realizado no GitHub com sucesso! As alterações estão seguras para fechar o navegador.`,
          'success'
        );
      } else {
        addToast('Falha na Sincronização GitHub', ghMessage, 'error');
      }
    } else if (isSupaReady) {
      addToast(
        'Nuvem Sincronizada',
        'Dados salvos no Supabase com sucesso!',
        'success'
      );
    }
  }, [products, addToast]);

  // Keyboard shortcut Ctrl+K to search
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('search-product-input')?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Sync products to localStorage with debounce to maintain 60fps fluidity during rapid batch updates
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
      } catch (e) {
        console.error('Falha ao salvar no localStorage', e);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [products]);

  // Supabase cloud synchronization state
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const silentSyncTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const productsRef = React.useRef<Product[]>(products);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // Load from Supabase on mount, tab focus, or manual sync with automatic push of pending local products
  const loadFromSupabase = useCallback(
    async (isSilent = false) => {
      if (!isSupabaseConfigured()) {
        setIsSupabaseConnected(false);
        return;
      }

      if (!isSilent) setIsLoading(true);
      setIsSyncingSupabase(true);

      try {
        const { success, data, error } = await fetchProductsFromSupabase();

        if (success && data) {
          setIsSupabaseConnected(true);
          setLastSyncedAt(new Date());

          // Normalize remote data from cloud
          const normalizedData = data.map((item) => ({
            ...item,
            is_new: Boolean(item.is_new),
          }));

          const remoteIdSet = new Set(normalizedData.map((p) => String(p.id).trim()));

          // Retrieve current local products either from ref or directly from localStorage
          let localList = productsRef.current;
          if (!localList || localList.length === 0) {
            try {
              const stored = localStorage.getItem(STORAGE_KEY);
              if (stored) {
                localList = JSON.parse(stored);
              }
            } catch (e) {
              console.warn('Erro ao ler do localStorage em loadFromSupabase:', e);
            }
          }

          // 1. Detect only genuine newly created local drafts that aren't on Supabase yet
          const unsyncedToPush = (localList || []).filter(
            (lp) => (lp as any)._isLocalDraft && !remoteIdSet.has(String(lp.id).trim())
          );

          let pushedCount = 0;
          if (unsyncedToPush.length > 0) {
            console.log(`Encontrados ${unsyncedToPush.length} rascunhos locais pendentes. Enviando para o Supabase...`);
            const { error: pushErr } = await upsertProductsToSupabase(unsyncedToPush);
            if (!pushErr) {
              pushedCount = unsyncedToPush.length;
              for (const pushed of unsyncedToPush) {
                normalizedData.push(pushed);
                remoteIdSet.add(String(pushed.id).trim());
              }
              console.log(`${pushedCount} rascunhos sincronizados com sucesso na nuvem!`);
            } else {
              console.error('Erro ao enviar rascunhos pendentes para o Supabase:', pushErr);
            }
          }

          // 2. Reconcile: Supabase cloud is the primary source of truth for products, is_new flag, and status
          const mergedList: Product[] = [];

          for (const remoteProd of normalizedData) {
            const remoteId = String(remoteProd.id).trim();
            const localProd = (localList || []).find((lp) => String(lp.id).trim() === remoteId);

            mergedList.push({
              ...localProd,
              ...remoteProd,
              // Cloud state is the source of truth across all devices (PC and mobile)
              is_new: Boolean(remoteProd.is_new),
              status: (remoteProd.status as ProductStatus) || 'Pendente',
              cost:
                remoteProd.cost !== undefined && remoteProd.cost !== null
                  ? Number(remoteProd.cost)
                  : (localProd?.cost ?? 0),
              name: remoteProd.name || localProd?.name || `Produto #${remoteProd.id}`,
              image: remoteProd.image !== undefined ? remoteProd.image : (localProd?.image || null),
              research_records:
                remoteProd.research_records !== undefined
                  ? remoteProd.research_records
                  : (localProd?.research_records || []),
              rawColumns: { ...(localProd?.rawColumns || {}), ...(remoteProd?.rawColumns || {}) },
            });
          }

          // 3. Keep only explicit local drafts if any failed to push
          for (const localProd of localList || []) {
            const localId = String(localProd.id).trim();
            if ((localProd as any)._isLocalDraft && !remoteIdSet.has(localId)) {
              mergedList.push(localProd);
            }
          }

          // Update local state and persist to local storage for offline use
          setProducts(mergedList);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedList));
          } catch (e) {
            console.warn('Erro ao salvar no localStorage:', e);
          }

          if (!isSilent) {
            if (pushedCount > 0) {
              addToast(
                'Sincronização Completa!',
                `${pushedCount} novos produtos deste aparelho foram enviados para a nuvem. Agora todos os seus aparelhos (PC, celular) possuem os mesmos ${mergedList.length} produtos.`,
                'success'
              );
            } else {
              addToast(
                'Nuvem Sincronizada',
                `${mergedList.length} produtos verificados e sincronizados com a nuvem.`,
                'success'
              );
            }
          }
        } else {
          setIsSupabaseConnected(false);
          if (!isSilent && error) {
            addToast('Erro ao Sincronizar', error, 'error');
          }
        }
      } catch (err: unknown) {
        console.error('Falha em loadFromSupabase:', err);
      } finally {
        if (!isSilent) setIsLoading(false);
        setIsSyncingSupabase(false);
      }
    },
    [addToast]
  );

  // Force full sync: uploads all current products on this device to Supabase, then fetches complete catalog
  const handleForceFullCloudSync = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setShowSupabaseModal(true);
      return;
    }
    setIsLoading(true);
    setIsSyncingSupabase(true);
    try {
      let currentList = productsRef.current;
      if (!currentList || currentList.length === 0) {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) currentList = JSON.parse(raw);
        } catch {}
      }

      if (currentList && currentList.length > 0) {
        const { error: pushErr } = await upsertProductsToSupabase(currentList);
        if (pushErr) {
          addToast('Falha no Envio', `Erro ao sincronizar com Supabase: ${pushErr}`, 'error');
          return;
        }
      }

      await loadFromSupabase(false);
    } catch (e) {
      console.error(e);
      addToast('Erro', 'Falha ao sincronizar com a nuvem.', 'error');
    } finally {
      setIsLoading(false);
      setIsSyncingSupabase(false);
    }
  }, [loadFromSupabase, addToast]);

  // Initial load and High-Performance Real-time listener with batch processing
  useEffect(() => {
    loadFromSupabase(true);

    if (!isSupabaseConfigured()) return;

    // Real-time changes subscription with postgres_changes batch listener
    const unsubscribe = subscribeToSupabaseChanges({
      bufferMs: 35,
      maxBatchSize: 25,
      onBatchProductChanges: (batch) => {
        if (!batch || batch.length === 0) return;

        const deletes = new Set<string>();
        const updates = new Map<
          string,
          {
            partial: Partial<Product>;
            newStatus?: ProductStatus;
          }
        >();
        const inserts = new Map<string, Product>();
        const statusChanges: Array<{ id: string; name?: string; newStatus: ProductStatus }> = [];

        for (const payload of batch) {
          if (payload.eventType === 'DELETE' && payload.old) {
            const delId = String(payload.old.id).trim();
            deletes.add(delId);
            updates.delete(delId);
            inserts.delete(delId);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const updateId = String(payload.new.id).trim();
            if (deletes.has(updateId)) continue;

            const newStatus = payload.new.status ? (payload.new.status as ProductStatus) : undefined;
            const partial: Partial<Product> = {
              ...(payload.new.name !== undefined ? { name: String(payload.new.name) } : {}),
              ...(newStatus !== undefined ? { status: newStatus } : {}),
              ...(payload.new.is_new !== undefined && payload.new.is_new !== null
                ? { is_new: Boolean(payload.new.is_new) }
                : {}),
              ...(payload.new.cost !== undefined && payload.new.cost !== null
                ? { cost: Number(payload.new.cost) }
                : {}),
              ...(payload.new.image !== undefined ? { image: payload.new.image || null } : {}),
              updated_at: payload.new.updated_at || new Date().toISOString(),
            };

            updates.set(updateId, { partial, newStatus });

            if (newStatus) {
              statusChanges.push({
                id: updateId,
                name: payload.new.name,
                newStatus,
              });
            }
          } else if (payload.eventType === 'INSERT' && payload.new) {
            const insertId = String(payload.new.id).trim();
            if (deletes.has(insertId)) continue;

            const newProd: Product = {
              id: insertId,
              name: payload.new.name || `Produto #${insertId}`,
              cost: payload.new.cost !== undefined && payload.new.cost !== null ? Number(payload.new.cost) : 0,
              available: payload.new.available !== false,
              image: payload.new.image || null,
              status: (payload.new.status as ProductStatus) || 'Pendente',
              is_new: payload.new.is_new !== undefined ? Boolean(payload.new.is_new) : true,
              research_records: [],
              created_at: payload.new.created_at || new Date().toISOString(),
              updated_at: payload.new.updated_at || new Date().toISOString(),
            };

            inserts.set(insertId, newProd);
          }
        }

        // Single instant state update for all batch operations
        setProducts((prev) => {
          let current = prev;

          // 1. Process deletes in a single O(N) pass
          if (deletes.size > 0) {
            current = current.filter((p) => !deletes.has(String(p.id).trim()));
          }

          // 2. Process updates in a single O(N) pass with O(1) map lookups
          const existingIds = new Set<string>();
          if (updates.size > 0) {
            current = current.map((p) => {
              const pId = String(p.id).trim();
              existingIds.add(pId);
              const updateInfo = updates.get(pId);
              if (updateInfo) {
                return {
                  ...p,
                  ...updateInfo.partial,
                };
              }
              return p;
            });
          } else {
            for (const p of current) {
              existingIds.add(String(p.id).trim());
            }
          }

          // 3. Process inserts: only prepend items not already in the list
          if (inserts.size > 0) {
            const toAdd: Product[] = [];
            for (const [insId, newProd] of inserts.entries()) {
              if (!existingIds.has(insId)) {
                toAdd.push(newProd);
                existingIds.add(insId);
              }
            }
            if (toAdd.length > 0) {
              current = [...toAdd, ...current];
            }
          }

          return current;
        });

        // Live update active modal products if their product changed
        if (updates.size > 0) {
          setProductForDetails((prev) => {
            if (!prev) return null;
            const updateInfo = updates.get(String(prev.id).trim());
            return updateInfo ? { ...prev, ...updateInfo.partial } : prev;
          });
          setActiveResearchProduct((prev) => {
            if (!prev) return null;
            const updateInfo = updates.get(String(prev.id).trim());
            return updateInfo ? { ...prev, ...updateInfo.partial } : prev;
          });
          setSimulatorProduct((prev) => {
            if (!prev) return null;
            const updateInfo = updates.get(String(prev.id).trim());
            return updateInfo ? { ...prev, ...updateInfo.partial } : prev;
          });
        }

        // Batch toasts notifications without UI clutter
        if (statusChanges.length === 1) {
          const item = statusChanges[0];
          addToast(
            'Tempo Real: Status Atualizado',
            `"${item.name || `Item #${item.id}`}" alterado para "${item.newStatus}".`,
            'info'
          );
        } else if (statusChanges.length > 1) {
          addToast(
            'Tempo Real: Lote Atualizado',
            `${statusChanges.length} produtos atualizados simultaneamente via nuvem.`,
            'info'
          );
        }

        if (inserts.size > 0 && statusChanges.length === 0) {
          addToast(
            'Tempo Real: Novos Produtos',
            `${inserts.size} produto(s) sincronizado(s) em tempo real.`,
            'info'
          );
        }

        if (deletes.size > 0) {
          setSelectedProductIds((prev) => prev.filter((id) => !deletes.has(String(id))));
        }
      },

      onBatchResearchChanges: (batch) => {
        if (!batch || batch.length === 0) return;

        interface ResearchChangeAccumulator {
          deletedRecordIds: Set<string>;
          upsertedRecords: ResearchRecord[];
          newStatus?: ProductStatus;
        }

        const researchByProduct = new Map<string, ResearchChangeAccumulator>();

        for (const payload of batch) {
          const rawProdId =
            payload.new?.product_id !== undefined
              ? payload.new.product_id
              : payload.old?.product_id;

          if (!rawProdId) continue;
          const prodId = String(rawProdId).trim();

          if (!researchByProduct.has(prodId)) {
            researchByProduct.set(prodId, {
              deletedRecordIds: new Set<string>(),
              upsertedRecords: [],
            });
          }

          const acc = researchByProduct.get(prodId)!;

          if (payload.eventType === 'DELETE' && payload.old) {
            const recId = String(payload.old.id || payload.old.product_id);
            acc.deletedRecordIds.add(recId);
          } else if (payload.new) {
            const raw = payload.new;
            const recId = String(raw.id || `${prodId}_${Date.now()}`);
            const statusVal = raw.status as ProductStatus | undefined;

            if (statusVal) {
              acc.newStatus = statusVal;
            }

            const record: ResearchRecord = {
              id: recId,
              product_id: prodId,
              found_name: raw.found_name || '',
              platform: (raw.platform as any) || 'Outro',
              store: raw.store || '',
              price: raw.price !== undefined && raw.price !== null && raw.price !== '' ? Number(raw.price) : '',
              url: raw.url || '',
              confidence: (raw.confidence as any) || 'Média',
              note: raw.note || '',
              researched_at: raw.researched_at || raw.updated_at || new Date().toISOString(),
            };

            acc.upsertedRecords.push(record);
          }
        }

        // Instant in-memory update for all research records across products
        setProducts((prev) => {
          return prev.map((p) => {
            const pId = String(p.id).trim();
            const changes = researchByProduct.get(pId);
            if (!changes) return p;

            let records = [...(p.research_records || [])];

            // Remove deleted
            if (changes.deletedRecordIds.size > 0) {
              records = records.filter((r) => !changes.deletedRecordIds.has(String(r.id)));
            }

            // Upsert new/updated
            for (const rec of changes.upsertedRecords) {
              const idx = records.findIndex((r) => String(r.id) === String(rec.id));
              if (idx >= 0) {
                records[idx] = { ...records[idx], ...rec };
              } else {
                records.unshift(rec);
              }
            }

            return {
              ...p,
              research_records: records,
              ...(changes.newStatus ? { status: changes.newStatus } : {}),
              updated_at: new Date().toISOString(),
            };
          });
        });

        // Also update open research modal in real-time
        setActiveResearchProduct((prev) => {
          if (!prev) return null;
          const pId = String(prev.id).trim();
          const changes = researchByProduct.get(pId);
          if (!changes) return prev;

          let records = [...(prev.research_records || [])];
          if (changes.deletedRecordIds.size > 0) {
            records = records.filter((r) => !changes.deletedRecordIds.has(String(r.id)));
          }
          for (const rec of changes.upsertedRecords) {
            const idx = records.findIndex((r) => String(r.id) === String(rec.id));
            if (idx >= 0) {
              records[idx] = { ...records[idx], ...rec };
            } else {
              records.unshift(rec);
            }
          }
          return {
            ...prev,
            research_records: records,
            ...(changes.newStatus ? { status: changes.newStatus } : {}),
          };
        });

        // Debounced background silent verification (2.5s) to ensure eventual multi-table consistency without flashing the UI
        if (silentSyncTimerRef.current) {
          clearTimeout(silentSyncTimerRef.current);
        }
        silentSyncTimerRef.current = setTimeout(() => {
          loadFromSupabase(true);
        }, 2500);
      },
    });

    // Refresh when user focuses the tab or unlocks phone / switches back to browser tab
    const handleRefresh = () => {
      loadFromSupabase(true);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadFromSupabase(true);
      }
    };
    window.addEventListener('focus', handleRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic sync every 20 seconds while page is open/active
    const periodicSyncTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadFromSupabase(true);
      }
    }, 20000);

    return () => {
      clearInterval(periodicSyncTimer);
      unsubscribe();
      if (silentSyncTimerRef.current) {
        clearTimeout(silentSyncTimerRef.current);
        silentSyncTimerRef.current = null;
      }
      window.removeEventListener('focus', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadFromSupabase, addToast]);

  // Dismiss banner after 4s
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Handle file select
  const handleFileSelect = async (file: File) => {
    setErrorMessage(null);
    try {
      const detection = await readSpreadsheetFile(file);
      setDetectionPending(detection);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao ler o arquivo.';
      setErrorMessage(msg);
    }
  };

  // Confirm column mapping and merge import
  const handleConfirmMapping = async (
    nameCol: string,
    costCol: string,
    imageCol: string,
    availableCol?: string,
    idCol?: string,
    statusCol?: string
  ) => {
    if (!detectionPending) return;
    const importedRows = convertRowsToProducts(
      detectionPending.rows,
      nameCol,
      costCol,
      imageCol,
      availableCol,
      idCol,
      statusCol
    );

    if (importedRows.length === 0) {
      setErrorMessage('Nenhum produto válido encontrado com o mapeamento selecionado.');
      setDetectionPending(null);
      return;
    }

    // Save backup of current products state before import for easy undo/rollback
    if (products.length > 0) {
      setPreviousProducts(products);
      try {
        localStorage.setItem(PREV_STORAGE_KEY, JSON.stringify(products));
      } catch (e) {
        console.error('Falha ao salvar backup no localStorage', e);
      }
    }

    const { merged: mergedProducts, newCount: importedNewCount, preservedCount, newProducts } = mergeCatalogs(
      products,
      importedRows
    );

    setProducts(mergedProducts);
    try {
      localStorage.setItem(LAST_IMPORT_IDS_KEY, JSON.stringify(newProducts.map((p) => String(p.id))));
    } catch (e) {
      console.error('Falha ao salvar IDs da última importação', e);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedProducts));
    } catch (e) {
      console.error('Falha ao salvar produtos no localStorage', e);
    }
    setDetectionPending(null);
    setCurrentSidebarSection('produtos');

    if (products.length > 0) {
      setSuccessMessage(
        `Importação concluída: ${importedNewCount} novos produtos adicionados. ${preservedCount} já existentes foram ignorados e permaneceram intactos.`
      );
    } else {
      setSuccessMessage(`${mergedProducts.length} produtos carregados com sucesso!`);
    }

    if (isSupabaseConfigured()) {
      setIsLoading(true);
      // IMPORTAÇÃO É SOMENTE ADITIVA: envie ao Supabase apenas os produtos realmente novos.
      // Produtos existentes não são enviados novamente, portanto nunca são sobrescritos.
      if (newProducts.length > 0) {
        await upsertProductsToSupabase(newProducts);
      }
      setIsLoading(false);
    }
  };

  // Save updated product details (shipping, dimensions, category, etc.)
  const handleSaveProductDetails = async (updatedProduct: Product) => {
    setProducts((prev) => {
      const next = prev.map((p) => (p.id === updatedProduct.id ? updatedProduct : p));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Falha ao salvar no localStorage', e);
      }
      return next;
    });

    if (isSupabaseConfigured()) {
      try {
        await upsertProductsToSupabase([updatedProduct]);
      } catch (e) {
        console.warn('Erro ao atualizar produto no Supabase:', e);
      }
    }

    setProductForDetails(null);
    addToast('Produto Atualizado', `Dados de "${updatedProduct.name}" salvos com sucesso.`, 'success');
  };

  // Add single product manually
  const handleAddProduct = async (newProduct: Product) => {
    let nextList: Product[] = [];
    setProducts((prev) => {
      nextList = [newProduct, ...prev];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextList));
      } catch (e) {
        console.error('Falha ao salvar no localStorage', e);
      }
      return nextList;
    });

    setShowAddProductModal(false);

    if (isSupabaseConfigured()) {
      try {
        await upsertProductsToSupabase([newProduct]);
      } catch (e) {
        console.warn('Erro ao sincronizar produto com Supabase:', e);
      }
    }

    addToast('Produto Adicionado!', `"${newProduct.name}" foi salvo com sucesso no catálogo.`, 'success');
  };

  // Save research record
  const handleSaveRecord = async (productId: string, record: ResearchRecord) => {
    let updatedProductToSync: Product | null = null;

    setProducts((prev) => {
      const next = prev.map((p) => {
        if (p.id === productId) {
          const currentRecords = p.research_records || [];
          const existingIdx = currentRecords.findIndex((r) => r.id === record.id);
          let newRecords: ResearchRecord[];
          if (existingIdx >= 0) {
            newRecords = [...currentRecords];
            newRecords[existingIdx] = record;
          } else {
            newRecords = [record, ...currentRecords];
          }

          const newStatus: ProductStatus =
            p.status === 'Pendente'
              ? record.confidence === 'Alta'
                ? 'Encontrado'
                : 'Revisar'
              : p.status;

          const updatedProduct: Product = {
            ...p,
            research_records: newRecords,
            status: newStatus,
            updated_at: new Date().toISOString(),
          };
          updatedProductToSync = updatedProduct;
          return updatedProduct;
        }
        return p;
      });

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Falha ao salvar no localStorage', e);
      }

      return next;
    });

    if (isSupabaseConfigured()) {
      try {
        await saveResearchRecordToSupabase(record);
        if (updatedProductToSync) {
          await updateProductStatusInSupabase(productId, (updatedProductToSync as Product).status);
          await upsertProductsToSupabase([updatedProductToSync]);
        }
      } catch (e) {
        console.warn('Erro ao salvar no Supabase:', e);
      }
    }
    addToast('Opção Salva com Sucesso', `${record.platform} ${record.price ? '- R$ ' + record.price : ''}`, 'success');
  };

  // Delete research record
  const handleDeleteRecord = async (productId: string, recordId: string) => {
    let finalStatus: ProductStatus = 'Pendente';

    setProducts((prev) => {
      const next = prev.map((p) => {
        if (p.id === productId) {
          const currentRecords = p.research_records || [];
          const newRecords = currentRecords.filter((r) => r.id !== recordId);
          finalStatus = newRecords.length === 0 ? 'Pendente' : p.status;
          return {
            ...p,
            research_records: newRecords,
            status: finalStatus,
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      });

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Falha ao salvar no localStorage', e);
      }

      return next;
    });

    if (isSupabaseConfigured()) {
      try {
        await deleteResearchRecordFromSupabase(recordId);
        await updateProductStatusInSupabase(productId, finalStatus);
      } catch (e) {
        console.error('Erro ao excluir no Supabase:', e);
      }
    }
    addToast('Opção Removida', 'O anúncio foi removido com sucesso.', 'info');
  };

  // Update product status (single)
  const handleUpdateStatus = useCallback(async (productId: string, status: ProductStatus) => {
    setProducts((prev) => {
      const next = prev.map((p) => {
        if (p.id === productId) {
          return { ...p, status, updated_at: new Date().toISOString() };
        }
        return p;
      });

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Falha ao salvar no localStorage', e);
      }

      return next;
    });

    if (isSupabaseConfigured()) {
      try {
        const { error } = await updateProductStatusInSupabase(productId, status);
        if (error) {
          console.error('Erro ao salvar status no Supabase:', error);
          if (error.includes('bigint') || error.includes('22P02')) {
            addToast(
              'Ajuste de ID no Supabase',
              `Status salvo localmente! Para sincronizar "${productId}" na nuvem, copie o script "Corrigir IDs (Bigint → Text)" no menu Supabase.`,
              'warning'
            );
          } else {
            addToast('Aviso de Sincronização', `Status salvo localmente, mas houve erro na nuvem: ${error}`, 'error');
          }
          return;
        }
      } catch (err) {
        console.error('Exceção ao sincronizar status no Supabase:', err);
      }
    }
    addToast('Status Atualizado', `Produto marcado como "${status}"`, 'info');
  }, []);

  // Batch update product status
  const handleBatchUpdateStatus = async (status: ProductStatus) => {
    if (selectedProductIds.length === 0) return;

    const idsToUpdate = [...selectedProductIds];
    const idSet = new Set(idsToUpdate.map(String));

    setProducts((prev) => {
      const next = prev.map((p) => {
        if (idSet.has(String(p.id))) {
          return { ...p, status, updated_at: new Date().toISOString() };
        }
        return p;
      });

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Falha ao salvar no localStorage', e);
      }

      return next;
    });

    if (isSupabaseConfigured()) {
      try {
        const { error } = await updateMultipleProductsStatusInSupabase(idsToUpdate, status);
        if (error) {
          console.error('Erro ao atualizar status em lote no Supabase:', error);
          if (error.includes('bigint') || error.includes('22P02')) {
            addToast(
              'Ajuste de ID no Supabase',
              `Status salvo localmente! Para sincronizar na nuvem, execute o script "Corrigir IDs (Bigint → Text)" em Configurações > Supabase.`,
              'warning'
            );
          } else {
            addToast('Aviso de Sincronização', `Status salvo localmente, mas houve erro na nuvem: ${error}`, 'warning');
          }
        } else {
          addToast(
            'Status em Lote Atualizado',
            `${idsToUpdate.length} produto(s) marcado(s) como "${status}" e sincronizado(s) na nuvem.`,
            'success'
          );
        }
      } catch (e) {
        console.error('Erro ao atualizar status em lote no Supabase:', e);
      }
    } else {
      addToast(
        'Status em Lote Atualizado',
        `${idsToUpdate.length} produto(s) marcado(s) como "${status}".`,
        'success'
      );
    }
    setSelectedProductIds([]);
  };

  // Dismiss single "is_new" tag
  const handleDismissNew = useCallback((productId: string) => {
    setProducts((prev) => {
      const next = prev.map((p) => (p.id === productId ? { ...p, is_new: false } : p));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Falha ao salvar no localStorage', e);
      }
      return next;
    });

    if (isSupabaseConfigured()) {
      updateProductIsNew(productId, false).catch((err) =>
        console.error('Erro ao atualizar is_new no Supabase:', err)
      );
    }
  }, []);

  // Dismiss "is_new" tag in batch for selected products
  const handleBatchDismissNew = useCallback(async () => {
    if (selectedProductIds.length === 0) return;
    const idsToUpdate = [...selectedProductIds];

    setProducts((prev) => {
      const next = prev.map((p) => (idsToUpdate.includes(p.id) ? { ...p, is_new: false } : p));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Falha ao salvar no localStorage', e);
      }
      return next;
    });

    if (isSupabaseConfigured()) {
      try {
        await updateMultipleProductsIsNew(idsToUpdate, false);
      } catch (e) {
        console.error('Erro ao desmarcar produtos como novo no Supabase:', e);
      }
    }

    addToast(
      'Etiquetas Atualizadas',
      `${idsToUpdate.length} produto(s) desmarcado(s) como novo.`,
      'success'
    );
  }, [selectedProductIds, addToast]);

  // Dismiss all products currently marked as "is_new"
  const handleDismissAllNew = useCallback(async () => {
    const newItems = products.filter((p) => p.is_new);
    if (newItems.length === 0) {
      addToast('Aviso', 'Nenhum produto marcado como novo no momento.', 'info');
      return;
    }

    const idsToUpdate = newItems.map((p) => p.id);
    setProducts((prev) => {
      const next = prev.map((p) => ({ ...p, is_new: false }));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Falha ao salvar no localStorage', e);
      }
      return next;
    });

    if (isSupabaseConfigured()) {
      try {
        await updateMultipleProductsIsNew(idsToUpdate, false);
      } catch (e) {
        console.error('Erro ao desmarcar todos como novo no Supabase:', e);
      }
    }

    addToast(
      'Todos Desmarcados',
      `Todos os ${idsToUpdate.length} produtos foram desmarcados como novos.`,
      'success'
    );
  }, [products, addToast]);

  // Undo / Rollback last import operation or remove all newly imported items
  const handleUndoLastImport = async () => {
    let lastImportIds: string[] = [];
    try {
      const saved = localStorage.getItem(LAST_IMPORT_IDS_KEY);
      lastImportIds = saved ? JSON.parse(saved) : [];
    } catch {}

    // Backward-compatible fallback for imports made before this key existed.
    if (lastImportIds.length === 0) {
      try {
        const savedBackup = localStorage.getItem(PREV_STORAGE_KEY);
        if (savedBackup) {
          const previous = JSON.parse(savedBackup) as Product[];
          const prevIds = new Set(previous.map((p) => String(p.id)));
          lastImportIds = products.filter((p) => !prevIds.has(String(p.id))).map((p) => String(p.id));
        }
      } catch {}
    }

    if (lastImportIds.length === 0 && previousProducts && previousProducts.length > 0) {
      const prevIds = new Set(previousProducts.map((p) => String(p.id)));
      lastImportIds = products.filter((p) => !prevIds.has(String(p.id))).map((p) => String(p.id));
    }

    if (lastImportIds.length === 0) {
      addToast('Aviso', 'Não há produtos da última importação para desfazer.', 'info');
      return;
    }

    const idSet = new Set(lastImportIds);
    const itemsToRemove = products.filter((p) => idSet.has(String(p.id)));
    if (itemsToRemove.length === 0) {
      addToast('Aviso', 'Os produtos da última importação já não estão no catálogo.', 'info');
      return;
    }

    if (!window.confirm(
      `Deseja desfazer a última importação? ${itemsToRemove.length} produto(s) adicionados por ela serão removidos. Os demais produtos permanecerão intactos.`
    )) return;

    const remaining = products.filter((p) => !idSet.has(String(p.id)));
    setProducts(remaining);
    setSelectedProductIds([]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
      localStorage.removeItem(LAST_IMPORT_IDS_KEY);
    } catch (e) {
      console.error('Falha ao salvar rollback da importação', e);
    }

    if (isSupabaseConfigured()) {
      setIsLoading(true);
      try {
        await deleteProductsFromSupabase(itemsToRemove.map((p) => p.id));
      } finally {
        setIsLoading(false);
      }
    }

    addToast('Importação Desfeita', `${itemsToRemove.length} produto(s) da última importação foram removidos. Produtos anteriores permaneceram intactos.`, 'info');
    setSuccessMessage('Última importação desfeita com sucesso.');
  };
  // Clear all data
  const handleClearAll = async () => {
    if (
      window.confirm(
        'ATENÇÃO: Deseja apagar todos os produtos e pesquisas salvas? Essa ação não pode ser desfeita.'
      )
    ) {
      setProducts([]);
      setSelectedProductIds([]);
      localStorage.removeItem(STORAGE_KEY);
      if (isSupabaseConfigured()) {
        await clearAllSupabaseData();
      }
      setSuccessMessage('Todos os produtos foram removidos.');
      addToast('Dados Zerados', 'Todos os produtos foram removidos.', 'info');
    }
  };

  // Export handlers
  const handleExportExcel = () => {
    exportProductsToExcel(products);
    addToast('Exportando Excel', 'Download da planilha XLSX gerado.', 'success');
  };

  const handleExportCsv = () => {
    exportProductsToCsv(products);
    addToast('Exportando CSV', 'Download do arquivo CSV gerado.', 'success');
  };

  // Open research modal
  const handleOpenResearch = useCallback((product: Product) => {
    setActiveResearchProduct(product);
  }, []);

  // Open details modal
  const handleOpenDetails = useCallback((product: Product) => {
    setProductForDetails(product);
  }, []);

  // Start next pending product
  const handleStartNextPending = () => {
    const nextPending = products.find((p) => p.status === 'Pendente');
    if (nextPending) {
      handleOpenResearch(nextPending);
    } else {
      setSuccessMessage('Parabéns! Não há produtos pendentes no momento.');
    }
  };

  // Open simulator for a specific product
  const handleOpenSimulator = useCallback((product?: Product) => {
    if (product) {
      setSimulatorProduct(product);
    } else {
      setSimulatorProduct(null);
    }
    setShowSimulatorModal(true);
  }, []);

  // Status counts
  const totalCount = products.length;
  const statusCounts = useMemo(() => {
    const counts = {
      Pendente: 0,
      Encontrado: 0,
      Revisar: 0,
      Descartado: 0,
    };
    for (const p of products) {
      const statusKey = (p.status as any) === 'Pesquisando' ? 'Pendente' : p.status;
      if (counts[statusKey] !== undefined) {
        counts[statusKey]++;
      } else {
        counts.Pendente++;
      }
    }
    return counts;
  }, [products]);

  const newCount = useMemo(() => {
    return products.filter((p) => p.is_new).length;
  }, [products]);

  const selectedNewCount = useMemo(() => {
    if (selectedProductIds.length === 0) return 0;
    const selectedSet = new Set(selectedProductIds.map(String));
    return products.filter((p) => selectedSet.has(String(p.id)) && p.is_new).length;
  }, [selectedProductIds, products]);

  // Available platforms extracted from data
  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const r of p.research_records) {
        if (r.platform) set.add(r.platform);
      }
    }
    return Array.from(set);
  }, [products]);

  // Combined Filter Logic
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const minC = advancedFilters.minCost !== '' ? parseFloat(advancedFilters.minCost) : null;
    const maxC = advancedFilters.maxCost !== '' ? parseFloat(advancedFilters.maxCost) : null;

    return products.filter((p) => {
      // Text Search
      const matchesSearch =
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query) ||
        p.research_records.some(
          (r) =>
            r.found_name.toLowerCase().includes(query) ||
            r.platform.toLowerCase().includes(query) ||
            r.store.toLowerCase().includes(query)
        );

      if (!matchesSearch) return false;

      // Status
      if (advancedFilters.status !== 'all') {
        const normalizedStatus = (p.status as any) === 'Pesquisando' ? 'Pendente' : p.status;
        if (normalizedStatus !== advancedFilters.status) return false;
      }

      // Only New
      if (advancedFilters.onlyNew && !p.is_new) return false;

      // Only with records
      if (advancedFilters.onlyWithRecords && p.research_records.length === 0) return false;

      // Only available
      if (advancedFilters.onlyAvailable && !p.available) return false;

      // Platform filter
      if (advancedFilters.platform !== 'all') {
        const hasPlatform = p.research_records.some(
          (r) => r.platform.toLowerCase() === advancedFilters.platform.toLowerCase()
        );
        if (!hasPlatform) return false;
      }

      // Cost range
      const numCost = typeof p.cost === 'number' ? p.cost : parseFloat(String(p.cost)) || 0;
      if (minC !== null && !isNaN(minC) && numCost < minC) return false;
      if (maxC !== null && !isNaN(maxC) && numCost > maxC) return false;

      return true;
    });
  }, [products, searchQuery, advancedFilters]);

  // Sort logic
  const filteredAndSortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    if (sortBy === 'name_asc') {
      return list.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })
      );
    } else if (sortBy === 'name_desc') {
      return list.sort((a, b) =>
        (b.name || '').localeCompare(a.name || '', 'pt-BR', { sensitivity: 'base' })
      );
    } else if (sortBy === 'pending_first') {
      const statusWeight: Record<ProductStatus, number> = {
        Pendente: 0,
        Revisar: 1,
        Encontrado: 2,
        Descartado: 3,
      };
      return list.sort((a, b) => {
        const statusA = (a.status as any) === 'Pesquisando' ? 'Pendente' : a.status;
        const statusB = (b.status as any) === 'Pesquisando' ? 'Pendente' : b.status;
        return (statusWeight[statusA] || 0) - (statusWeight[statusB] || 0);
      });
    } else if (sortBy === 'lowest_cost') {
      return list.sort((a, b) => {
        const cA = typeof a.cost === 'number' ? a.cost : parseFloat(String(a.cost).replace(',', '.')) || 0;
        const cB = typeof b.cost === 'number' ? b.cost : parseFloat(String(b.cost).replace(',', '.')) || 0;
        return cA - cB;
      });
    } else if (sortBy === 'highest_cost') {
      return list.sort((a, b) => {
        const cA = typeof a.cost === 'number' ? a.cost : parseFloat(String(a.cost).replace(',', '.')) || 0;
        const cB = typeof b.cost === 'number' ? b.cost : parseFloat(String(b.cost).replace(',', '.')) || 0;
        return cB - cA;
      });
    } else if (sortBy === 'lowest_price') {
      const getBestPrice = (p: Product) => {
        if (!p.research_records || p.research_records.length === 0) return 99999999;
        const prices = p.research_records
          .map((r) =>
            typeof r.price === 'number' ? r.price : parseFloat(String(r.price).replace(',', '.')) || 0
          )
          .filter((v) => v > 0);
        return prices.length > 0 ? Math.min(...prices) : 99999999;
      };
      return list.sort((a, b) => getBestPrice(a) - getBestPrice(b));
    } else if (sortBy === 'highest_price') {
      const getBestPrice = (p: Product) => {
        if (!p.research_records || p.research_records.length === 0) return -1;
        const prices = p.research_records
          .map((r) =>
            typeof r.price === 'number' ? r.price : parseFloat(String(r.price).replace(',', '.')) || 0
          )
          .filter((v) => v > 0);
        return prices.length > 0 ? Math.max(...prices) : -1;
      };
      return list.sort((a, b) => getBestPrice(b) - getBestPrice(a));
    } else if (sortBy === 'with_records') {
      return list.sort((a, b) => (b.research_records?.length || 0) - (a.research_records?.length || 0));
    }
    return list;
  }, [filteredProducts, sortBy]);

  // Active filters count for badge
  const activeFiltersCount = useMemo(() => {
    return [
      advancedFilters.status !== 'all',
      advancedFilters.platform !== 'all',
      advancedFilters.minCost !== '',
      advancedFilters.maxCost !== '',
      advancedFilters.onlyNew,
      advancedFilters.onlyWithRecords,
      advancedFilters.onlyAvailable,
    ].filter(Boolean).length;
  }, [advancedFilters]);

  const handleResetFilters = () => {
    setAdvancedFilters({
      status: 'all',
      platform: 'all',
      minCost: '',
      maxCost: '',
      onlyNew: false,
      onlyWithRecords: false,
      onlyAvailable: false,
    });
    setSearchQuery('');
  };

  // Table selection handlers
  const handleToggleSelectProduct = useCallback((productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }, []);

  const isAllFilteredSelected = useMemo(() => {
    return (
      filteredAndSortedProducts.length > 0 &&
      filteredAndSortedProducts.every((p) => selectedProductIds.includes(p.id))
    );
  }, [filteredAndSortedProducts, selectedProductIds]);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedProductIds((prev) => {
      const allSelected =
        filteredAndSortedProducts.length > 0 &&
        filteredAndSortedProducts.every((p) => prev.includes(p.id));
      if (allSelected) {
        return [];
      }
      return filteredAndSortedProducts.map((p) => p.id);
    });
  }, [filteredAndSortedProducts]);

  const handleSortChange = useCallback((sort: any) => {
    setSortBy(sort);
  }, []);

  // Synchronize active research product
  const currentActiveProduct = useMemo(() => {
    if (!activeResearchProduct) return null;
    return products.find((p) => p.id === activeResearchProduct.id) || activeResearchProduct;
  }, [activeResearchProduct, products]);

  // Sidebar navigation handler
  const handleSelectSidebarSection = (section: SidebarSection) => {
    setCurrentSidebarSection(section);
    setIsMobileSidebarOpen(false);
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {}
    if (section === 'inicio') {
      setAdvancedFilters((prev) => ({ ...prev, status: 'all' }));
      setSearchQuery('');
    }
  };

  return (
    <div className="min-h-screen bg-[#050B16] text-slate-100 flex transition-colors duration-200">
      {/* 1. SIDEBAR — stays in compact 72px rail and auto-expands gracefully on mouse hover */}
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onOpenMobile={() => setIsMobileSidebarOpen(true)}
        currentSection={currentSidebarSection}
        onSelectSection={handleSelectSidebarSection}
        totalCount={totalCount}
        pendingCount={statusCounts.Pendente}
        foundCount={statusCounts.Encontrado}
        generatedFilesCount={generatedFiles.length}
        isSupabaseConnected={isSupabaseConnected}
        onOpenSupabaseConfig={() => setShowSupabaseModal(true)}
        onOpenSimulator={() => handleOpenSimulator()}
        onOpenAddProduct={() => setShowAddProductModal(true)}
        onSyncSupabase={() => loadFromSupabase(false)}
        isSyncingSupabase={isSyncingSupabase}
      />

      {/* Main App Container — premium dark workspace, with stable 72px compact sidebar rail space on desktop */}
      <div className="flex-1 min-w-0 flex flex-col md:pl-[72px] transition-all duration-200 ease-in-out">
        {/* 2. HEADER */}
        <Header
          currentSection={currentSidebarSection}
          totalCount={totalCount}
          newCount={newCount}
          isSupabaseConnected={isSupabaseConnected}
          onOpenSupabaseConfig={() => setShowSupabaseModal(true)}
          onOpenSimulator={() => handleOpenSimulator()}
          onOpenAddProduct={() => setShowAddProductModal(true)}
          onStartNextPending={handleStartNextPending}
          pendingCount={statusCounts.Pendente}
          onFileSelect={handleFileSelect}
          onExportExcel={handleExportExcel}
          onExportCsv={handleExportCsv}
          onDownloadTemplate={downloadSampleTemplate}
          onClearAll={handleClearAll}
          onRemoveLastImport={handleUndoLastImport}
          canUndoImport={(() => {
            try {
              const ids = JSON.parse(localStorage.getItem(LAST_IMPORT_IDS_KEY) || '[]');
              if (Array.isArray(ids) && ids.length > 0) return true;
              const backup = localStorage.getItem(PREV_STORAGE_KEY);
              return Boolean(backup);
            } catch { return false; }
          })()}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onOpenSettings={() => handleSelectSidebarSection('configuracoes')}
          onSyncSupabase={() => loadFromSupabase(false)}
          isSyncingSupabase={isSyncingSupabase}
          isGitHubConnected={isGitHubSyncConfigured(githubConfig)}
          githubConfig={githubConfig}
          isSyncingGitHub={isSyncingGitHub}
          onManualGitHubSync={handleManualGlobalSync}
          onOpenGitHubSettings={() => handleSelectSidebarSection('configuracoes')}
        />

        {/* Floating back-to-top control */}
        <button
          type="button"
          onClick={scrollToTop}
          className="hidden md:flex fixed right-6 bottom-6 z-40 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-1.5 text-xs font-medium text-slate-300 shadow-lg transition hover:bg-slate-800 hover:text-white"
          title="Voltar ao topo"
          aria-label="Voltar ao topo da página"
        >
          <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
          <span>Topo</span>
        </button>

        {/* 3. MAIN CONTENT */}
        <main className="flex-1 w-full max-w-none px-4 sm:px-6 lg:px-8 py-5 pb-24 md:pb-8 space-y-4">
          {/* Alerts */}
          {errorMessage && (
            <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/60 flex items-center justify-between text-rose-200 text-xs font-medium">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-300 hover:text-white uppercase tracking-wider text-[11px]"
              >
                Fechar
              </button>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-between text-emerald-200 text-xs font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="text-emerald-300 hover:text-white uppercase tracking-wider text-[11px]"
              >
                Fechar
              </button>
            </div>
          )}

          {/* VIEW: DASHBOARD (INÍCIO) */}
          {currentSidebarSection === 'inicio' && (
            <DashboardView
              products={products}
              statusCounts={statusCounts}
              totalCount={totalCount}
              onNavigateToProducts={(filterStatus) => {
                if (filterStatus && filterStatus !== 'all') {
                  setAdvancedFilters((prev) => ({ ...prev, status: filterStatus }));
                } else {
                  setAdvancedFilters((prev) => ({ ...prev, status: 'all' }));
                }
                setCurrentSidebarSection('produtos');
              }}
              onNavigateToImport={() => setCurrentSidebarSection('importar')}
              onNavigateToConversion={() => setCurrentSidebarSection('conversao')}
              onOpenResearch={(p) => setActiveResearchProduct(p)}
              onOpenSimulator={(p) => handleOpenSimulator(p)}
              onStartNextPending={handleStartNextPending}
            />
          )}

          {/* VIEW: IMPORTAR CATÁLOGO */}
          {currentSidebarSection === 'importar' && (
            <CatalogImportView
              currentProductCount={totalCount}
              currentProducts={products}
              onFileSelect={handleFileSelect}
              parseResult={
                detectionPending
                  ? {
                      headers: detectionPending.headers,
                      rows: detectionPending.rows,
                      fileName: 'Planilha Importada',
                      totalRows: detectionPending.rows.length,
                    }
                  : null
              }
              detectedMappings={
                detectionPending
                  ? {
                      name: detectionPending.suggestedNameCol || '',
                      cost: detectionPending.suggestedCostCol || '',
                      image: detectionPending.suggestedImageCol || '',
                      available: detectionPending.suggestedAvailableCol || '',
                      id: detectionPending.suggestedIdCol || '',
                      status: detectionPending.suggestedStatusCol || '',
                    }
                  : null
              }
              onConfirmImport={(mappings, mode) => {
                if (detectionPending) {
                  if (mode === 'replace') {
                    if (products.length > 0) {
                      setPreviousProducts(products);
                      try {
                        localStorage.setItem(PREV_STORAGE_KEY, JSON.stringify(products));
                      } catch (e) {
                        console.error('Falha ao salvar backup no localStorage', e);
                      }
                    }
                    const importedRows = convertRowsToProducts(
                      detectionPending.rows,
                      mappings.name,
                      mappings.cost,
                      mappings.image,
                      mappings.available,
                      mappings.id,
                      mappings.status
                    );
                    setProducts(importedRows);
                    try {
                      localStorage.setItem(STORAGE_KEY, JSON.stringify(importedRows));
                    } catch (e) {
                      console.error('Falha ao salvar no localStorage', e);
                    }
                    setDetectionPending(null);
                    setCurrentSidebarSection('produtos');
                    if (isSupabaseConfigured()) {
                      upsertProductsToSupabase(importedRows).catch(console.error);
                    }
                    addToast('Catálogo Carregado', `${importedRows.length} produtos carregados com imagens automáticas.`, 'success');
                  } else {
                    handleConfirmMapping(
                      mappings.name,
                      mappings.cost,
                      mappings.image,
                      mappings.available,
                      mappings.id,
                      mappings.status
                    );
                  }
                }
              }}
              onCancelImport={() => setDetectionPending(null)}
              onDownloadTemplate={downloadSampleTemplate}
              onNavigateToProducts={() => setCurrentSidebarSection('produtos')}
              onUndoLastImport={handleUndoLastImport}
              canUndoImport={(() => {
                try {
                  const ids = JSON.parse(localStorage.getItem(LAST_IMPORT_IDS_KEY) || '[]');
                  if (Array.isArray(ids) && ids.length > 0) return true;
                  const backup = localStorage.getItem(PREV_STORAGE_KEY);
                  return Boolean(backup);
                } catch { return false; }
              })()}
            />
          )}

          {/* VIEW: CONVERSÃO DE ARQUIVOS */}
          {currentSidebarSection === 'conversao' && (
            <ConversionView
              products={products}
              onAddGeneratedFiles={(files) => {
                handleAddGeneratedFiles(files);
                addToast('Arquivo Gerado', `${files.length} arquivo(s) gerado(s) com sucesso.`, 'success');
              }}
              onNavigateToFiles={() => setCurrentSidebarSection('arquivos')}
            />
          )}

          {/* VIEW: MARKETPLACES */}
          {currentSidebarSection === 'marketplaces' && (
            <MarketplacesView
              products={products}
              onNavigateToConversion={() => setCurrentSidebarSection('conversao')}
            />
          )}

          {/* VIEW: ARQUIVOS GERADOS */}
          {currentSidebarSection === 'arquivos' && (
            <GeneratedFilesView
              files={generatedFiles}
              products={products}
              onClearFiles={handleClearGeneratedFiles}
              onNavigateToConversion={() => setCurrentSidebarSection('conversao')}
            />
          )}

          {/* VIEW: ESTOQUE / CUSTO INTERNO — base totalmente separada do catálogo principal */}
          {currentSidebarSection === 'estoque_interno' && <InternalInventoryView />}

          {/* VIEW: CONFIGURAÇÕES */}
          {currentSidebarSection === 'configuracoes' && (
            <SettingsView
              products={products}
              onImportBackup={(imported) => {
                setProducts(imported);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
                if (isSupabaseConfigured()) {
                  upsertProductsToSupabase(imported).catch(console.error);
                }
                addToast('Backup Restaurado', `${imported.length} produtos carregados com sucesso.`, 'success');
              }}
              onGitHubPullSuccess={(imported, pricing) => {
                setProducts(imported);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
                if (pricing) {
                  if (pricing.markup) localStorage.setItem('saas_settings_markup', pricing.markup);
                  if (pricing.tax) localStorage.setItem('saas_settings_tax', pricing.tax);
                  if (pricing.packaging) localStorage.setItem('saas_settings_packaging', pricing.packaging);
                }
                if (isSupabaseConfigured()) {
                  upsertProductsToSupabase(imported).catch(console.error);
                }
                addToast('Sincronização GitHub', `${imported.length} produtos carregados do repositório remoto!`, 'success');
              }}
              onClearAll={handleClearAll}
              onOpenSupabaseConfig={() => setShowSupabaseModal(true)}
              isSupabaseConnected={isSupabaseConnected}
              onSyncNow={() => loadFromSupabase(false)}
              onForceFullSync={handleForceFullCloudSync}
              isSyncingSupabase={isSyncingSupabase}
            />
          )}

          {/* VIEW: PRODUTOS */}
          {currentSidebarSection === 'produtos' && (
            <>
              {totalCount === 0 ? (
                /* Empty State / Initial Upload Screen */
                <UploadDropzone
                  onFileSelect={handleFileSelect}
                  onDownloadTemplate={downloadSampleTemplate}
                  onOpenAddProduct={() => setShowAddProductModal(true)}
                />
              ) : (
                /* Visual Hierarchy Structure */
                <div className="space-y-4">
                  {/* Card de Status & Sincronização Móvel Exclusivo para Celular */}
                  <div className="md:hidden rounded-lg bg-[#121824] border border-slate-800 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isSupabaseConnected
                              ? 'bg-emerald-400'
                              : 'bg-amber-400'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white flex items-center gap-1.5 flex-wrap">
                            <span>{isSupabaseConnected ? 'Nuvem Conectada' : 'Modo Local'}</span>
                            <span className="text-[11px] text-slate-400 font-normal">
                              • {totalCount} produtos
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {lastSyncedAt
                              ? `Sincronizado às ${lastSyncedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                              : 'Tempo real ativo com Supabase'}
                          </div>
                        </div>
                      </div>

                      {/* Botão de sincronização no topo mobile */}
                      <button
                        type="button"
                        onClick={() => loadFromSupabase(false)}
                        disabled={isSyncingSupabase}
                        className="px-2.5 py-1 rounded bg-blue-600 active:bg-blue-700 text-white font-medium text-xs flex items-center gap-1 transition shrink-0 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isSyncingSupabase ? 'animate-spin' : ''}`}
                        />
                        <span>{isSyncingSupabase ? 'Sync...' : 'Sincronizar'}</span>
                      </button>
                    </div>

                    {/* Alerta de produtos novos no mobile */}
                    {newCount > 0 && (
                      <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-blue-300 font-medium">
                          {newCount} {newCount === 1 ? 'produto novo' : 'produtos novos'}
                        </span>
                        <button
                          type="button"
                          onClick={handleDismissAllNew}
                          className="text-xs text-blue-400 font-medium hover:underline"
                        >
                          Desmarcar todos
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 4. BARRA DE PESQUISA & ORDENAÇÃO */}
                  <div className="bg-[#121824] rounded-lg border border-slate-800 p-3 flex flex-col sm:flex-row items-center gap-2.5">
                    <div className="relative flex-1 w-full">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="search-product-input"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nome, SKU, anúncio concorrente... (⌘K)"
                        className="w-full rounded-md border border-slate-700 bg-slate-900 pl-8.5 pr-14 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-white"
                        >
                          Limpar
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <div className="relative flex-1 sm:flex-initial">
                        <select
                          id="sort-products-select"
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as any)}
                          className="w-full sm:w-auto appearance-none rounded-md border border-slate-700 bg-slate-900 pl-7 pr-7 py-1.5 text-xs font-medium text-slate-200 focus:border-blue-500 focus:outline-none cursor-pointer"
                        >
                          <option value="original">Ordem de Cadastro</option>
                          <optgroup label="Nome">
                            <option value="name_asc">Nome (A → Z)</option>
                            <option value="name_desc">Nome (Z → A)</option>
                          </optgroup>
                          <optgroup label="Valores">
                            <option value="lowest_cost">Menor Custo</option>
                            <option value="highest_cost">Maior Custo</option>
                            <option value="lowest_price">Menor Preço de Venda</option>
                            <option value="highest_price">Maior Preço de Venda</option>
                          </optgroup>
                          <optgroup label="Status">
                            <option value="pending_first">Pendentes Primeiro</option>
                            <option value="with_records">Com Mais Pesquisas</option>
                          </optgroup>
                        </select>
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* 5. STATUS TABS */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                    {[
                      { id: 'all', label: 'Todos', count: totalCount },
                      { id: 'Pendente', label: 'Pendentes', count: statusCounts.Pendente, color: 'text-amber-400' },
                      { id: 'Encontrado', label: 'Encontrados', count: statusCounts.Encontrado, color: 'text-emerald-400' },
                      { id: 'Revisar', label: 'Revisar', count: statusCounts.Revisar, color: 'text-purple-400' },
                      { id: 'Descartado', label: 'Descartados', count: statusCounts.Descartado, color: 'text-slate-400' },
                    ].map((tab) => {
                      const isActive = advancedFilters.status === tab.id && !advancedFilters.onlyNew;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() =>
                            setAdvancedFilters((prev) => ({
                              ...prev,
                              status: tab.id as any,
                              onlyNew: false,
                            }))
                          }
                          className={`px-3 py-1 rounded text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5 border ${
                            isActive
                              ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                              : 'bg-[#121824] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          <span>{tab.label}</span>
                          <span className={`text-[11px] font-mono tabular-nums opacity-90 ${tab.color || ''}`}>({tab.count})</span>
                        </button>
                      );
                    })}

                    {/* Quick Tab: Apenas Novos */}
                    {newCount > 0 && (
                      <div className="flex items-center gap-1 ml-1">
                        <button
                          type="button"
                          onClick={() =>
                            setAdvancedFilters((prev) => ({
                              ...prev,
                              onlyNew: !prev.onlyNew,
                            }))
                          }
                          className={`px-3 py-1 rounded text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5 border ${
                            advancedFilters.onlyNew
                              ? 'bg-blue-600 text-white border-blue-500'
                              : 'bg-blue-950/30 border-blue-800/60 text-blue-300 hover:bg-blue-900/40'
                          }`}
                        >
                          <span>Apenas Novos</span>
                          <span className="text-[10px] font-mono tabular-nums font-bold px-1 py-0.2 rounded bg-blue-500/20 text-blue-200">
                            {newCount}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={handleDismissAllNew}
                          className="px-2 py-1 rounded text-xs transition whitespace-nowrap flex items-center gap-1 border bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800"
                          title="Remover marcação 'Novo' de todos os produtos"
                        >
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="hidden sm:inline">Desmarcar Todos como Novo</span>
                          <span className="sm:hidden">Limpar Novos</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 6. RESUMO DE MÉTRICAS */}
                  <SummaryMetrics
                    totalCount={totalCount}
                    statusCounts={statusCounts}
                    activeStatus={advancedFilters.status}
                    onFilterStatus={(status) =>
                      setAdvancedFilters((prev) => ({ ...prev, status }))
                    }
                  />

                  {/* BATCH ACTIONS BAR */}
                  {selectedProductIds.length > 0 && (
                    <div className="rounded-lg bg-[#141d2d] border border-blue-800/60 p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs text-white">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-blue-300">
                          {selectedProductIds.length} de {filteredAndSortedProducts.length} selecionados
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Batch Action: Desmarcar como Novo */}
                        {selectedNewCount > 0 && (
                          <button
                            type="button"
                            onClick={handleBatchDismissNew}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium border border-slate-700 transition"
                          >
                            <span>Desmarcar Novo ({selectedNewCount})</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            const selectedList = products.filter((p) => selectedProductIds.includes(p.id));
                            exportProductsToExcel(selectedList);
                            addToast('Exportação Concluída', `${selectedList.length} itens exportados para Excel.`, 'success');
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 font-medium border border-slate-700 transition flex items-center gap-1"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>Excel</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCurrentSidebarSection('conversao');
                          }}
                          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition flex items-center gap-1"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>Exportar Canais</span>
                        </button>

                        {/* Batch Action: Marcar como Revisar */}
                        <button
                          type="button"
                          onClick={() => handleBatchUpdateStatus('Revisar')}
                          className="px-2.5 py-1 rounded bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 font-medium border border-purple-800/60 transition"
                        >
                          <span>Revisar ({selectedProductIds.length})</span>
                        </button>

                        {/* Batch Action: Marcar como Encontrado */}
                        <button
                          type="button"
                          onClick={() => handleBatchUpdateStatus('Encontrado')}
                          className="px-2.5 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 font-medium border border-emerald-800/60 transition"
                        >
                          <span>Encontrado ({selectedProductIds.length})</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`Deseja remover os ${selectedProductIds.length} produtos selecionados?`)) {
                              return;
                            }
                            const idsToRemove = [...selectedProductIds];
                            const remaining = products.filter((p) => !idsToRemove.includes(p.id));
                            setProducts(remaining);
                            setSelectedProductIds([]);
                            try {
                              localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
                            } catch (e) {
                              console.error('Falha ao salvar no localStorage', e);
                            }
                            if (isSupabaseConfigured()) {
                              setIsLoading(true);
                              await deleteProductsFromSupabase(idsToRemove);
                              setIsLoading(false);
                            }
                            addToast('Produtos Removidos', `${idsToRemove.length} produtos excluídos.`, 'info');
                          }}
                          className="px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 font-medium border border-rose-800/60 transition flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedProductIds([])}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium border border-slate-700 transition"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 7. CONTROLS BAR: Filters & Grade/Lista */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        id="btn-select-all"
                        onClick={handleToggleSelectAll}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                          isAllFilteredSelected
                            ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                            : 'bg-[#121824] text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                        <span>
                          {isAllFilteredSelected
                            ? 'Deselecionar Todos'
                            : 'Selecionar Todos'}
                        </span>
                      </button>

                      <button
                        type="button"
                        id="btn-open-filters-drawer"
                        onClick={() => setIsFiltersDrawerOpen(true)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                          activeFiltersCount > 0
                            ? 'bg-blue-600/20 text-blue-300 border-blue-500/50'
                            : 'bg-[#121824] text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <Filter className="w-3.5 h-3.5 text-blue-400" />
                        <span>Filtros</span>
                        {activeFiltersCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums font-bold bg-blue-600 text-white">
                            {activeFiltersCount}
                          </span>
                        )}
                      </button>

                      {activeFiltersCount > 0 && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-slate-400 hover:text-white transition"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Limpar filtros</span>
                        </button>
                      )}

                      <span className="text-xs text-slate-400 font-mono tabular-nums">
                        {filteredAndSortedProducts.length} de {totalCount} produtos
                      </span>
                    </div>

                    {/* View Switcher */}
                    <div className="flex items-center gap-1.5 self-end sm:self-auto flex-wrap justify-end">
                      <div className="flex md:hidden items-center p-0.5 rounded bg-[#121824] border border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleToggleMobileGridCols('2')}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                            mobileGridCols === '2'
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          2 colunas
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleMobileGridCols('1')}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                            mobileGridCols === '1'
                              ? 'bg-slate-800 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          1 coluna
                        </button>
                      </div>

                      <div className="flex items-center p-0.5 rounded-lg bg-[#121824] border border-slate-800">
                        <button
                          type="button"
                          id="btn-view-grid"
                          onClick={() => handleChangeViewMode('grid')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition ${
                            viewMode === 'grid'
                              ? 'bg-slate-800 text-white shadow-xs'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                          <span>Grade</span>
                        </button>

                        <button
                          type="button"
                          id="btn-view-list"
                          onClick={() => handleChangeViewMode('list')}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition ${
                            viewMode === 'list'
                              ? 'bg-slate-800 text-white shadow-xs'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <List className="w-3.5 h-3.5" />
                          <span>Lista</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 8. PRODUTOS: Grade ou Lista */}
                  {filteredAndSortedProducts.length === 0 ? (
                    <div className="text-center py-16 bg-[#071426] rounded-2xl border border-[#0D2038] p-8 shadow-sm">
                      <div className="w-12 h-12 rounded-2xl bg-[#050B16] border border-[#0D2038] text-slate-500 flex items-center justify-center mx-auto mb-3">
                        <Filter className="w-6 h-6" />
                      </div>
                      <h3 className="text-base font-bold text-slate-200">
                        Nenhum produto encontrado
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        {searchQuery
                          ? `Nenhum produto com o termo "${searchQuery}" corresponde aos critérios aplicados.`
                          : 'Nenhum item do catálogo atende aos filtros atuais.'}
                      </p>
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="mt-4 px-4 py-2 text-xs font-bold text-blue-400 hover:text-blue-300 bg-blue-950/40 border border-blue-800/60 rounded-xl transition"
                      >
                        Limpar todos os filtros
                      </button>
                    </div>
                  ) : viewMode === 'grid' ? (
                    /* Grade View - 2 colunas no mobile por padrão, 3 no tablet, 4 no desktop */
                    <div className={`grid ${mobileGridCols === '2' ? 'grid-cols-2' : 'grid-cols-1'} sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-4 md:gap-5 min-w-0 w-full`}>
                      {filteredAndSortedProducts.map((prod) => (
                        <ProductCard
                          key={prod.id}
                          product={prod}
                          isSelected={selectedProductIds.includes(prod.id)}
                          onToggleSelect={handleToggleSelectProduct}
                          onOpenResearch={handleOpenResearch}
                          onOpenSimulator={handleOpenSimulator}
                          onOpenDetails={handleOpenDetails}
                          onDismissNew={handleDismissNew}
                          onUpdateStatus={handleUpdateStatus}
                        />
                      ))}
                    </div>
                  ) : (
                    /* List / Compact Table View */
                    <ProductTableView
                      products={filteredAndSortedProducts}
                      selectedProductIds={selectedProductIds}
                      onToggleSelect={handleToggleSelectProduct}
                      onToggleSelectAll={handleToggleSelectAll}
                      onOpenResearch={handleOpenResearch}
                      onOpenSimulator={handleOpenSimulator}
                      onOpenDetails={handleOpenDetails}
                      onDismissNew={handleDismissNew}
                      onUpdateStatus={handleUpdateStatus}
                      sortBy={sortBy}
                      onSortChange={handleSortChange}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Product Details Modal (Info, Shipping, Marketplaces) */}
      {productForDetails && (
        <ProductDetailModal
          product={productForDetails}
          isOpen={!!productForDetails}
          onClose={() => setProductForDetails(null)}
          onSave={handleSaveProductDetails}
        />
      )}

      {/* Filters Drawer */}
      <FiltersDrawer
        isOpen={isFiltersDrawerOpen}
        onClose={() => setIsFiltersDrawerOpen(false)}
        filters={advancedFilters}
        onChangeFilters={setAdvancedFilters}
        onResetFilters={handleResetFilters}
        totalFilteredCount={filteredAndSortedProducts.length}
        totalCount={totalCount}
        availablePlatforms={availablePlatforms}
      />

      {/* Column Mapping Modal (when triggered outside the dedicated import view) */}
      {detectionPending && currentSidebarSection !== 'importar' && (
        <ColumnMapperModal
          detection={detectionPending}
          onConfirm={handleConfirmMapping}
          onCancel={() => setDetectionPending(null)}
        />
      )}

      {/* Research Modal */}
      {currentActiveProduct && (
        <ResearchModal
          product={currentActiveProduct}
          allProducts={products}
          onClose={() => setActiveResearchProduct(null)}
          onNavigate={(targetProduct) => setActiveResearchProduct(targetProduct)}
          onSaveRecord={handleSaveRecord}
          onDeleteRecord={handleDeleteRecord}
          onUpdateStatus={handleUpdateStatus}
          onOpenSimulator={(p) => handleOpenSimulator(p)}
        />
      )}

      {/* Price Simulator Modal */}
      {showSimulatorModal && (
        <PriceSimulatorModal
          initialProduct={simulatorProduct}
          allProducts={products}
          onClose={() => {
            setShowSimulatorModal(false);
            setSimulatorProduct(null);
          }}
        />
      )}

      {/* Supabase Config Modal */}
      {showSupabaseModal && (
        <SupabaseConfigModal
          onClose={() => setShowSupabaseModal(false)}
          onConfigSaved={() => {
            setIsSupabaseConnected(true);
            loadFromSupabase();
          }}
        />
      )}

      {/* Add Product Modal */}
      {showAddProductModal && (
        <AddProductModal
          onClose={() => setShowAddProductModal(false)}
          onAddProduct={handleAddProduct}
        />
      )}

      {/* Toast Notifications Overlay */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
