import React, { useRef, useState, useEffect } from 'react';
import {
  Search,
  Bell,
  Plus,
  Calculator,
  Upload,
  Download,
  Menu,
  Database,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Clock,
  AlertCircle,
  CheckCircle2,
  Check,
  X,
  Settings,
  RefreshCw,
  Undo2,
  Github,
} from 'lucide-react';
import { AppView } from '../types';
import { useDevice } from '../utils/device';
import { MarketPrepLogo } from './MarketPrepLogo';
import { GitHubSyncConfig, getGitHubSyncStatusInfo } from '../utils/githubSync';

interface HeaderProps {
  currentSection: AppView;
  totalCount: number;
  newCount: number;
  isSupabaseConnected: boolean;
  onOpenSupabaseConfig: () => void;
  onOpenSimulator: () => void;
  onOpenAddProduct: () => void;
  onStartNextPending: () => void;
  pendingCount: number;
  onFileSelect: (file: File) => void;
  onExportExcel: () => void;
  onExportCsv: () => void;
  onDownloadTemplate: () => void;
  onClearAll: () => void;
  onRemoveLastImport?: () => void;
  canUndoImport?: boolean;
  onOpenMobileSidebar: () => void;
  onOpenSettings?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onNavigateToProducts?: () => void;
  onSyncSupabase?: () => void;
  isSyncingSupabase?: boolean;
  // GitHub Integration Props
  isGitHubConnected?: boolean;
  githubConfig?: GitHubSyncConfig;
  isSyncingGitHub?: boolean;
  onManualGitHubSync?: () => void;
  onOpenGitHubSettings?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentSection,
  totalCount,
  newCount,
  isSupabaseConnected,
  onOpenSupabaseConfig,
  onOpenSimulator,
  onOpenAddProduct,
  onStartNextPending,
  pendingCount,
  onFileSelect,
  onExportExcel,
  onExportCsv,
  onDownloadTemplate,
  onClearAll,
  onRemoveLastImport,
  canUndoImport = false,
  onOpenMobileSidebar,
  onOpenSettings,
  searchQuery = '',
  onSearchChange,
  onNavigateToProducts,
  onSyncSupabase,
  isSyncingSupabase = false,
  isGitHubConnected = false,
  githubConfig,
  isSyncingGitHub = false,
  onManualGitHubSync,
  onOpenGitHubSettings,
}) => {
  const device = useDevice();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const ghSyncInfo = githubConfig ? getGitHubSyncStatusInfo(githubConfig) : null;

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Keyboard shortcut Ctrl+K / Cmd+K to focus top search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
    if (e.target) e.target.value = '';
  };

  const handleSearchInput = (val: string) => {
    if (onSearchChange) {
      onSearchChange(val);
      if (val && currentSection !== 'produtos' && onNavigateToProducts) {
        onNavigateToProducts();
      }
    }
  };

  const getSectionTitle = () => {
    switch (currentSection) {
      case 'inicio':
        return 'Visão Geral';
      case 'produtos':
        return 'Catálogo de Produtos';
      case 'importar':
        return 'Importar Planilha';
      case 'conversao':
        return 'Conversão para Marketplaces';
      case 'marketplaces':
        return 'Canais & Regras';
      case 'estoque_interno':
        return 'Estoque & Custo Interno';
      case 'configuracoes':
        return 'Configurações do Sistema';
      default:
        return 'Produtos';
    }
  };

  return (
    <header className="border-b border-slate-800 bg-[#0c101a] sticky top-0 z-20 transition-colors">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        {/* =======================================================
            1. BRAND & SECTION (Left Zone)
           ======================================================= */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Mobile hamburger menu */}
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 transition border border-slate-800"
            aria-label="Abrir menu"
            title="Abrir menu lateral"
          >
            <Menu className="w-4 h-4 text-slate-300" />
          </button>

          {/* Logo compacto no Header (mobile) */}
          <div className="md:hidden flex items-center gap-2">
            <MarketPrepLogo variant="icon" size="xs" className="shrink-0" />
          </div>

          <span className="text-slate-600 hidden sm:inline text-xs font-mono">/</span>

          {/* Section Breadcrumb */}
          <span className="text-xs font-semibold text-slate-200 tracking-tight truncate max-w-[140px] sm:max-w-none">
            {getSectionTitle()}
          </span>

          {/* Database cloud status */}
          <button
            type="button"
            onClick={onOpenSupabaseConfig}
            className={`hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border transition ${
              isSupabaseConnected
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-950/60'
                : 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-950/60'
            }`}
            title={isSupabaseConnected ? 'Banco de Dados Nuvem Conectado' : 'Armazenamento Local'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isSupabaseConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>{isSupabaseConnected ? 'Nuvem' : 'Local'}</span>
          </button>

          {/* Indicador Global de Última Sincronização GitHub (Verde / Amarelo / Vermelho) */}
          {githubConfig && (
            <button
              type="button"
              onClick={onOpenGitHubSettings || onOpenSettings}
              className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border transition ${
                ghSyncInfo?.status === 'green'
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60 hover:bg-emerald-950/60'
                  : ghSyncInfo?.status === 'yellow'
                  ? 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-950/60'
                  : 'bg-rose-950/40 text-rose-300 border-rose-800/60 hover:bg-rose-950/60'
              }`}
              title={`${ghSyncInfo?.tooltip || 'GitHub'} — Clique para abrir configurações`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  ghSyncInfo?.status === 'green'
                    ? 'bg-emerald-400 ring-2 ring-emerald-400/20'
                    : ghSyncInfo?.status === 'yellow'
                    ? 'bg-amber-400 ring-2 ring-amber-400/20'
                    : 'bg-rose-400 ring-2 ring-rose-400/20'
                }`}
              />
              <Github className="w-3 h-3 text-slate-300" />
              <span className="hidden xl:inline">GitHub:</span>
              <span className="font-mono text-[10px]">{ghSyncInfo?.relativeTime}</span>
            </button>
          )}
        </div>

        {/* =======================================================
            2. SEARCH FIELD (Center Zone)
           ======================================================= */}
        <div className="flex-1 max-w-xl mx-auto">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchInput(e.target.value)}
              placeholder="Buscar por produto, SKU ou EAN..."
              className="w-full h-8.5 rounded-lg border border-slate-800 bg-[#121724] pl-8.5 pr-14 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:bg-[#151c2e] focus:ring-1 focus:ring-blue-500 focus:outline-none transition"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => handleSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800 rounded">
                ⌘K
              </kbd>
            )}
          </div>
        </div>

        {/* =======================================================
            3. ACTIONS & PROFILE (Right Zone)
           ======================================================= */}
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileChange}
          />

          {canUndoImport && onRemoveLastImport && (
            <button
              type="button"
              onClick={onRemoveLastImport}
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium border border-rose-500/30 bg-rose-950/20 text-rose-300 hover:bg-rose-950/40 transition"
              title="Desfazer última importação"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Desfazer importação</span>
            </button>
          )}

          {/* Action: Exportar Menu */}
          <div className="relative">
            <button
              type="button"
              disabled={totalCount === 0}
              onClick={() => setShowExportMenu(!showExportMenu)}
              className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium border transition ${
                totalCount > 0
                  ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
                  : 'bg-slate-900/50 text-slate-600 border-slate-800/50 cursor-not-allowed'
              }`}
              title="Exportar catálogo"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Exportar</span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>

            {showExportMenu && totalCount > 0 && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-48 rounded-lg bg-[#141a26] border border-slate-800 shadow-xl py-1 z-40 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      onExportExcel();
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Planilha Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onExportCsv();
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-400" />
                    <span>Arquivo CSV (.csv)</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Action: Sincronizar Agora (Forçar pull/push no GitHub e nuvem antes de fechar o navegador) */}
          <button
            type="button"
            onClick={onManualGitHubSync || onSyncSupabase || onOpenSupabaseConfig}
            disabled={isSyncingGitHub || isSyncingSupabase}
            className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold shadow-sm transition active:scale-95 ${
              isGitHubConnected
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border border-blue-500/40'
                : isSupabaseConnected
                ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
                : 'bg-amber-950/30 hover:bg-amber-950/50 text-amber-300 border border-amber-800/50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Sincronizar Agora — Forçar pull/push no GitHub e nuvem antes de fechar o navegador"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isSyncingGitHub || isSyncingSupabase
                  ? 'animate-spin text-white'
                  : isGitHubConnected
                  ? 'text-blue-200'
                  : 'text-slate-400'
              }`}
            />
            <span className="hidden sm:inline">
              {isSyncingGitHub || isSyncingSupabase ? 'Sincronizando...' : 'Sincronizar Agora'}
            </span>
            <span className="sm:hidden">
              {isSyncingGitHub || isSyncingSupabase ? 'Sync...' : 'Sync'}
            </span>
          </button>

          {/* =======================================================
              NOTIFICAÇÕES
             ======================================================= */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition border border-transparent hover:border-slate-800"
              title="Notificações"
              aria-label="Notificações"
            >
              <Bell className="w-4 h-4" />
              {pendingCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400" />
              )}
            </button>

            {showNotifications && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowNotifications(false)} />
                <div className="absolute right-0 top-full mt-2 w-80 rounded-lg bg-[#141a26] border border-slate-800 shadow-xl p-3 z-40 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
                    <span className="font-semibold text-white">Notificações</span>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {pendingCount} pendente(s)
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {pendingCount > 0 ? (
                      <div
                        onClick={() => {
                          onStartNextPending();
                          setShowNotifications(false);
                        }}
                        className="cursor-pointer p-2.5 rounded-md bg-amber-950/20 border border-amber-800/30 hover:bg-amber-950/35 transition flex items-start gap-2.5"
                      >
                        <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-amber-200">Pesquisas Pendentes</p>
                          <p className="text-[11px] text-amber-300/80 mt-0.5">
                            {pendingCount} produto(s) aguardando pesquisa de concorrência.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-md bg-emerald-950/20 border border-emerald-800/30 flex items-center gap-2 text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Todas as pesquisas do catálogo estão em dia.</span>
                      </div>
                    )}

                    <div className="p-2.5 rounded-md bg-slate-900/60 border border-slate-800 flex items-start gap-2.5">
                      <Database className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-slate-200">
                          {isSupabaseConnected ? 'Sincronização Nuvem Ativa' : 'Modo Armazenamento Local'}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isSupabaseConnected
                            ? 'Dados replicados de forma segura.'
                            : 'Produtos armazenados no navegador.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* =======================================================
              PERFIL
             ======================================================= */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-800 transition border border-transparent hover:border-slate-800"
              title="Conta do Usuário"
            >
              <div className="w-6.5 h-6.5 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-200 shrink-0">
                LD
              </div>
              <span className="text-xs font-medium text-slate-200 hidden lg:inline">
                Leonardo D.
              </span>
              <ChevronDown className="w-3 h-3 text-slate-500 hidden lg:inline" />
            </button>

            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowProfileMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-60 rounded-lg bg-[#141a26] border border-slate-800 shadow-xl p-2.5 z-40 text-xs">
                  <div className="flex items-center gap-2.5 p-2 border-b border-slate-800 pb-2.5 mb-1.5">
                    <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      LD
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">Leonardo Duarte</p>
                      <p className="text-[11px] text-slate-400 truncate">leoduarte13@gmail.com</p>
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    {onOpenSettings && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenSettings();
                          setShowProfileMenu(false);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2 transition"
                      >
                        <Settings className="w-3.5 h-3.5 text-slate-400" />
                        <span>Configurações do Sistema</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        onOpenSupabaseConfig();
                        setShowProfileMenu(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-2 transition"
                    >
                      <Database className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Conexão Supabase</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
