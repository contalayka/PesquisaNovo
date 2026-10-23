import React from 'react';
import {
  LayoutDashboard,
  Package,
  UploadCloud,
  Settings,
  Plus,
  Database,
  X,
  Calculator,
  BadgeDollarSign,
  ShoppingBasket,
  Menu,
  RefreshCw,
  Video,
  MessageCircle,
  CheckCircle2,
} from 'lucide-react';
import { AppView } from '../types';
import { MarketPrepLogo } from './MarketPrepLogo';

export type SidebarSection = AppView;

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenMobile?: () => void;
  currentSection: AppView;
  onSelectSection: (section: AppView) => void;
  totalCount: number;
  pendingCount: number;
  foundCount: number;
  generatedFilesCount?: number;
  isSupabaseConnected: boolean;
  onOpenSupabaseConfig: () => void;
  onOpenAddProduct: () => void;
  onOpenSimulator?: () => void;
  onSyncSupabase?: () => void;
  isSyncingSupabase?: boolean;
  activeFilterStatus?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen,
  onCloseMobile,
  onOpenMobile,
  currentSection,
  onSelectSection,
  totalCount,
  pendingCount,
  foundCount,
  generatedFilesCount = 0,
  isSupabaseConnected,
  onOpenSupabaseConfig,
  onOpenAddProduct,
  onOpenSimulator,
  onSyncSupabase,
  isSyncingSupabase = false,
  activeFilterStatus,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const isCollapsed = !isHovered;

  const navItems: {
    id: AppView;
    label: string;
    icon: React.ElementType;
    badge?: string | number | null;
    badgeClass?: string;
  }[] = [
    {
      id: 'inicio',
      label: 'Visão Geral',
      icon: LayoutDashboard,
    },
    {
      id: 'produtos',
      label: 'Produtos',
      icon: Package,
      badge: totalCount > 0 ? totalCount : null,
      badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    },
    {
      id: 'produtos_encontrados',
      label: 'Encontrados',
      icon: CheckCircle2,
      badge: foundCount > 0 ? `${foundCount}` : null,
      badgeClass: 'bg-emerald-950/70 text-emerald-300 border-emerald-600/50',
    },
    {
      id: 'importar',
      label: 'Importar Catálogo',
      icon: UploadCloud,
    },
    {
      id: 'precificacao',
      label: 'Precificação em Massa',
      icon: BadgeDollarSign,
    },
    {
      id: 'catalogo_atacado',
      label: 'Catálogo Atacado PDVMaster',
      icon: ShoppingBasket,
    },
    {
      id: 'estoque_interno',
      label: 'Estoque / Custo Interno',
      icon: Database,
    },
    {
      id: 'videos',
      label: 'Buscar Vídeos',
      icon: Video,
      badge: foundCount > 0 ? foundCount : null,
      badgeClass: 'bg-violet-950/50 text-violet-300 border-violet-800/40',
    },
    {
      id: 'relatorios',
      label: 'Relatórios de Pedidos',
      icon: MessageCircle,
    },
    {
      id: 'configuracoes',
      label: 'Configurações',
      icon: Settings,
    },
  ];

  const handleNavClick = (section: AppView) => {
    onSelectSection(section);
    onCloseMobile();
  };

  const renderSidebarContent = (isMobileDrawer = false) => {
    const collapsed = isMobileDrawer ? false : isCollapsed;

    return (
      <div
        className={`flex flex-col h-full bg-[#03131e] border-r border-cyan-900/40 text-slate-300 select-none overflow-hidden transition-[width] duration-200 ease-out ${
          isMobileDrawer ? 'w-full' : (collapsed ? 'w-[68px]' : 'w-[236px]')
        }`}
      >
        {/* Brand area */}
        <div
          className={`h-14 px-3.5 flex items-center border-b border-slate-800 shrink-0 bg-[#02101a] ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          <button
            type="button"
            onClick={() => handleNavClick('inicio')}
            className="cursor-pointer overflow-hidden flex items-center gap-2.5 text-left border-none bg-transparent p-0"
            title="MarketPreço — Página Inicial"
            aria-label="MarketPreço — Página Inicial"
          >
            {collapsed ? (
              <MarketPrepLogo variant="icon" size="sm" />
            ) : (
              <MarketPrepLogo variant="compact" size="md" showSubtitle={true} />
            )}
          </button>

          {/* Mobile Close Button */}
          {isMobileDrawer && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Primary Action CTA */}
        <div className="p-2.5 border-b border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => {
              onOpenAddProduct();
              onCloseMobile();
            }}
            className={`w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-300 hover:brightness-110 text-[#032019] text-white font-semibold text-xs py-2 transition shadow-xs ${
              collapsed ? 'px-0' : 'px-3'
            }`}
            title={collapsed ? 'Adicionar Novo Produto' : undefined}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="truncate">Novo Produto</span>}
          </button>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const isActive =
              item.id === 'produtos_encontrados'
                ? currentSection === 'produtos' && activeFilterStatus === 'Encontrado'
                : item.id === 'produtos'
                ? currentSection === 'produtos' && activeFilterStatus !== 'Encontrado'
                : currentSection === item.id;

            const Icon = item.icon;

            return (
              <div key={item.id} className="relative group">
                <button
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  title={collapsed ? `${item.label}${item.badge ? ` (${item.badge})` : ''}` : undefined}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-400/15 text-emerald-300 font-semibold shadow-[inset_3px_0_0_#00f5a0]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  } ${collapsed ? 'justify-center' : 'justify-between'}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isActive ? 'text-emerald-300' : 'text-slate-400 group-hover:text-slate-300'
                      }`}
                    />
                    {!collapsed && (
                      <span className="truncate font-medium text-slate-200">{item.label}</span>
                    )}
                  </div>

                  {!collapsed && item.badge && (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums border ${
                        item.badgeClass || 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>

                {/* Tooltip for Collapsed Desktop Sidebar */}
                {collapsed && !isMobileDrawer && (
                  <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700 text-white text-xs font-medium shadow-lg whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer Tools & Database Status */}
        <div className="p-2.5 border-t border-slate-800 shrink-0 bg-[#0b0f1a] space-y-1.5">
          {onOpenSimulator && (
            <button
              type="button"
              onClick={() => {
                onOpenSimulator();
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 text-xs transition ${
                collapsed ? 'justify-center' : 'justify-start'
              }`}
              title="Simulador de Preços & Margens"
            >
              <Calculator className="w-4 h-4 shrink-0 text-slate-400" />
              {!collapsed && (
                <span className="font-medium truncate text-xs">Simulador de Margem</span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onOpenSupabaseConfig();
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2 p-1.5 rounded-lg border text-xs transition ${
              isSupabaseConnected
                ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300 hover:bg-emerald-950/30'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800'
            } ${collapsed ? 'justify-center' : 'justify-start'}`}
            title="Status do Armazenamento"
          >
            <Database className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            {!collapsed && (
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold truncate text-[11px] text-slate-200">
                  {isSupabaseConnected ? 'Nuvem Conectada' : 'Armazenamento Local'}
                </p>
              </div>
            )}
            {!collapsed && (
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isSupabaseConnected ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
            )}
          </button>

          {!collapsed && (
            <div className="px-2 pt-1.5 text-[10px] text-slate-500 font-mono text-center truncate">
              v2.4.1 • Zoom 80px Ativo
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`hidden md:block relative shrink-0 self-stretch overflow-visible shadow-lg transition-[width] duration-200 ease-out min-h-screen ${
          isCollapsed ? 'w-[68px]' : 'w-[236px]'
        }`}
        aria-label="Barra lateral"
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {renderSidebarContent(true)}
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Navegação rápida móvel"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0e1320] border-t border-slate-800 px-1 py-1 flex items-center justify-around"
      >
        <button
          type="button"
          onClick={() => handleNavClick('inicio')}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-md transition ${
            currentSection === 'inicio'
              ? 'text-blue-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">Início</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavClick('produtos')}
          className={`flex-1 relative flex flex-col items-center justify-center py-1 px-1 rounded-md transition ${
            currentSection === 'produtos'
              ? 'text-blue-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">Produtos</span>
          {totalCount > 0 && (
            <span className="absolute top-0 right-2 px-1 min-w-3.5 h-3.5 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center leading-none">
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleNavClick('importar')}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-md transition ${
            currentSection === 'importar'
              ? 'text-blue-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <UploadCloud className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">Importar</span>
        </button>


        <button
          type="button"
          onClick={() => handleNavClick('estoque_interno')}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-md transition ${
            currentSection === 'estoque_interno'
              ? 'text-blue-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">Estoque</span>
        </button>

        <button
          type="button"
          onClick={() => handleNavClick('configuracoes')}
          className={`flex-1 relative flex flex-col items-center justify-center py-1 px-1 rounded-md transition ${
            currentSection === 'configuracoes'
              ? 'text-blue-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">Ajustes</span>
        </button>

        {/* Sync */}
        {onSyncSupabase && (
          <button
            type="button"
            onClick={onSyncSupabase}
            disabled={isSyncingSupabase}
            className="flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-md transition text-slate-400 hover:text-blue-300"
            title="Sincronizar nuvem"
          >
            <RefreshCw
              className={`w-4 h-4 mb-0.5 text-slate-400 ${
                isSyncingSupabase ? 'animate-spin text-blue-400' : ''
              }`}
            />
            <span className="text-[10px]">Sync</span>
          </button>
        )}

        {/* Mobile Menu */}
        <button
          type="button"
          onClick={() => {
            if (isMobileOpen) {
              onCloseMobile();
            } else if (onOpenMobile) {
              onOpenMobile();
            }
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-md transition ${
            isMobileOpen
              ? 'text-blue-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Abrir menu lateral"
        >
          <Menu className="w-4 h-4 mb-0.5" />
          <span className="text-[10px]">Mais</span>
        </button>
      </nav>
    </>
  );
};
