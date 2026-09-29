import React, { useState } from 'react';
import {
  Settings,
  Database,
  Calculator,
  Save,
  Check,
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Copy,
  ShieldAlert,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ShieldCheck,
  Github,
  GitBranch,
  ArrowDownToLine,
  ArrowUpToLine,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { Product, SupabaseConfig } from '../types';
import {
  getStoredSupabaseConfig,
  saveStoredSupabaseConfig,
  testSupabaseConnection,
  SUPABASE_MIGRATION_FIX_BIGINT_SQL,
} from '../utils/supabase';
import {
  GitHubSyncConfig,
  GitHubSyncPayload,
  getStoredGitHubConfig,
  saveStoredGitHubConfig,
  testGitHubConnection,
  pushDataToGitHub,
  pullDataFromGitHub,
  isGitHubSyncConfigured,
} from '../utils/githubSync';
import { isMasterUnlocked, setMasterUnlocked, verifyMasterPassword } from '../utils/security';
import { MarketPrepLogo } from './MarketPrepLogo';

interface SettingsViewProps {
  products: Product[];
  onImportBackup: (imported: Product[]) => void;
  onClearAll: () => void;
  onOpenSupabaseConfig: () => void;
  isSupabaseConnected: boolean;
  onSyncNow?: () => void;
  onForceFullSync?: () => void;
  isSyncingSupabase?: boolean;
  onGitHubPullSuccess?: (
    importedProducts: Product[],
    pricing?: { markup: string; tax: string; packaging: string }
  ) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  products,
  onImportBackup,
  onClearAll,
  onOpenSupabaseConfig,
  isSupabaseConnected,
  onSyncNow,
  onForceFullSync,
  isSyncingSupabase = false,
  onGitHubPullSuccess,
}) => {
  const [config, setConfig] = useState<SupabaseConfig>(getStoredSupabaseConfig());
  const [showKey, setShowKey] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(isMasterUnlocked());
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [copiedMigrationSql, setCopiedMigrationSql] = useState(false);

  // GitHub Remote Sync State
  const [ghConfig, setGhConfig] = useState<GitHubSyncConfig>(getStoredGitHubConfig());
  const [showGhToken, setShowGhToken] = useState(false);
  const [showTokenHelp, setShowTokenHelp] = useState(false);
  const [isTestingGh, setIsTestingGh] = useState(false);
  const [ghTestResult, setGhTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isPushingGh, setIsPushingGh] = useState(false);
  const [isPullingGh, setIsPullingGh] = useState(false);
  const [ghActionFeedback, setGhActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [ghSavedSuccess, setGhSavedSuccess] = useState(false);

  const handleCopyMigrationSql = () => {
    navigator.clipboard.writeText(SUPABASE_MIGRATION_FIX_BIGINT_SQL);
    setCopiedMigrationSql(true);
    setTimeout(() => setCopiedMigrationSql(false), 2500);
  };

  // Pricing default settings (saved in localStorage)
  const [defaultMarkup, setDefaultMarkup] = useState(() => {
    return localStorage.getItem('saas_settings_markup') || '100';
  });
  const [defaultTaxRate, setDefaultTaxRate] = useState(() => {
    return localStorage.getItem('saas_settings_tax') || '6';
  });
  const [defaultPackagingCost, setDefaultPackagingCost] = useState(() => {
    return localStorage.getItem('saas_settings_packaging') || '3.50';
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyMasterPassword(passwordInput)) {
      setMasterUnlocked(true);
      setIsUnlocked(true);
      setPasswordError('');
      setPasswordInput('');
    } else {
      setPasswordError('Senha incorreta. Acesso não autorizado.');
    }
  };

  const handleLock = () => {
    setMasterUnlocked(false);
    setIsUnlocked(false);
    setShowKey(false);
  };

  const handleSavePricing = () => {
    localStorage.setItem('saas_settings_markup', defaultMarkup);
    localStorage.setItem('saas_settings_tax', defaultTaxRate);
    localStorage.setItem('saas_settings_packaging', defaultPackagingCost);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testSupabaseConnection(config);
      setTestResult(res);
      if (res.success) {
        saveStoredSupabaseConfig(config);
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Falha ao conectar.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveGitHubConfig = () => {
    saveStoredGitHubConfig(ghConfig);
    setGhSavedSuccess(true);
    setTimeout(() => setGhSavedSuccess(false), 2500);
  };

  const handleTestGitHubConnection = async () => {
    setIsTestingGh(true);
    setGhTestResult(null);
    setGhActionFeedback(null);
    try {
      const res = await testGitHubConnection(ghConfig);
      setGhTestResult(res);
      if (res.success) {
        saveStoredGitHubConfig(ghConfig);
      }
    } catch (err: any) {
      setGhTestResult({ success: false, message: err?.message || 'Falha ao testar conexão com GitHub.' });
    } finally {
      setIsTestingGh(false);
    }
  };

  const handlePushToGitHub = async () => {
    setIsPushingGh(true);
    setGhActionFeedback(null);
    try {
      const payload: GitHubSyncPayload = {
        version: '2.0',
        updatedAt: new Date().toISOString(),
        source: 'manual-push-settings',
        totalProducts: products.length,
        products,
        pricingSettings: {
          markup: defaultMarkup,
          tax: defaultTaxRate,
          packaging: defaultPackagingCost,
        },
      };
      const res = await pushDataToGitHub(ghConfig, payload);
      if (res.success) {
        setGhActionFeedback({ type: 'success', message: res.message });
        setGhConfig(getStoredGitHubConfig());
      } else {
        setGhActionFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setGhActionFeedback({ type: 'error', message: err?.message || 'Erro ao enviar dados para o GitHub.' });
    } finally {
      setIsPushingGh(false);
    }
  };

  const handlePullFromGitHub = async () => {
    setIsPullingGh(true);
    setGhActionFeedback(null);
    try {
      const res = await pullDataFromGitHub(ghConfig);
      if (res.success && res.data) {
        if (onGitHubPullSuccess) {
          onGitHubPullSuccess(res.data.products, res.data.pricingSettings);
        } else {
          onImportBackup(res.data.products);
        }
        if (res.data.pricingSettings) {
          if (res.data.pricingSettings.markup) setDefaultMarkup(res.data.pricingSettings.markup);
          if (res.data.pricingSettings.tax) setDefaultTaxRate(res.data.pricingSettings.tax);
          if (res.data.pricingSettings.packaging) setDefaultPackagingCost(res.data.pricingSettings.packaging);
        }
        setGhActionFeedback({
          type: 'success',
          message: `${res.data.totalProducts} produtos importados do GitHub com sucesso! Dados sincronizados.`,
        });
        setGhConfig(getStoredGitHubConfig());
      } else {
        setGhActionFeedback({ type: 'error', message: res.message });
      }
    } catch (err: any) {
      setGhActionFeedback({ type: 'error', message: err?.message || 'Erro ao puxar dados do GitHub.' });
    } finally {
      setIsPullingGh(false);
    }
  };

  const isGhConfigured = isGitHubSyncConfigured(ghConfig);

  const handleExportBackup = () => {
    const dataStr = JSON.stringify(products, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_catalogo_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          onImportBackup(parsed);
        }
      } catch (err) {
        // ignore
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="rounded-lg bg-[#121824] border border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-800/40">
            <Settings className="w-3 h-3 text-indigo-400" />
            <span>Configurações</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Configurações do Sistema
          </h1>
          <p className="text-xs text-slate-400">
            Gerencie integrações com banco de dados em nuvem, parâmetros e backups.
          </p>
        </div>
      </div>

      {/* 1. Supabase Cloud Connection */}
      <div className="rounded-lg bg-[#121824] border border-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/40 border border-emerald-800/50 flex items-center justify-center text-emerald-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                Banco de Dados em Nuvem (Supabase)
                {isUnlocked ? (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Desbloqueado
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Protegido
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Sincronização de produtos e pesquisas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isUnlocked && (
              <button
                type="button"
                onClick={handleLock}
                className="px-2.5 py-1 rounded text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-950/40 border border-amber-800/50 inline-flex items-center gap-1"
              >
                <Lock className="w-3 h-3" />
                Bloquear
              </button>
            )}
            <span
              className={`px-2.5 py-1 rounded text-xs font-bold border ${
                isSupabaseConnected
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60'
                  : 'bg-amber-950/60 text-amber-300 border-amber-800/60'
              }`}
            >
              {isSupabaseConnected ? 'Conectado' : 'Modo Offline (Local)'}
            </span>
          </div>
        </div>

        {!isUnlocked ? (
          <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 text-center space-y-2.5">
            <div className="w-8 h-8 mx-auto rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Credenciais Protegidas
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                A visualização e edição das chaves são restritas ao administrador.
              </p>
            </div>

            <form onSubmit={handleUnlock} className="max-w-xs mx-auto pt-1 space-y-2">
              <div className="relative">
                <input
                  type="password"
                  placeholder="Digite a Senha Mestre..."
                  value={passwordInput}
                  onChange={(e) => {
                    setPasswordInput(e.target.value);
                    setPasswordError('');
                  }}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-800 bg-[#121824] text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>
              {passwordError && (
                <p className="text-xs text-rose-400 font-semibold">{passwordError}</p>
              )}
              <button
                type="submit"
                className="w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition flex items-center justify-center gap-1.5"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Desbloquear</span>
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Project URL
                </label>
                <input
                  type="text"
                  value={config.url}
                  onChange={(e) => setConfig({ ...config, url: e.target.value })}
                  placeholder="https://xyz.supabase.co"
                  className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Anon Public Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={config.anonKey}
                    onChange={(e) => setConfig({ ...config, anonKey: e.target.value })}
                    placeholder="eyJhbGciOiJIUzI1NiIsIn..."
                    className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 pr-10 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                    title={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}
              >
                {testResult.success ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                <span>{testResult.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition"
                >
                  {isTesting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Testando...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Testar e Salvar</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onOpenSupabaseConfig}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-semibold transition"
                >
                  Ver Script SQL
                </button>

                <button
                  type="button"
                  onClick={handleCopyMigrationSql}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedMigrationSql ? 'Copiado!' : 'Corrigir IDs'}</span>
                </button>
              </div>

              {(config.url || config.anonKey) && (
                <button
                  type="button"
                  onClick={() => {
                    const emptyConfig = { url: '', anonKey: '' };
                    setConfig(emptyConfig);
                    saveStoredSupabaseConfig(emptyConfig);
                    setTestResult({ success: false, message: 'Supabase desconectado.' });
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-900/60 rounded-lg transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              )}
            </div>
          </>
        )}

        {/* Painel de Sincronização entre Aparelhos (PC & Celular) */}
        {isSupabaseConnected && (
          <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
                  Sincronização Multi-dispositivo
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Este aparelho possui <strong className="text-white tabular-nums">{products.length}</strong> produtos salvos.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onSyncNow && (
                  <button
                    type="button"
                    onClick={onSyncNow}
                    disabled={isSyncingSupabase}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSupabase ? 'animate-spin' : ''}`} />
                    <span>{isSyncingSupabase ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
                  </button>
                )}
                {onForceFullSync && (
                  <button
                    type="button"
                    onClick={onForceFullSync}
                    disabled={isSyncingSupabase}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Enviar Tudo</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. Repositório Remoto GitHub (Sincronização entre Máquinas) */}
      <div className="rounded-lg bg-[#121824] border border-slate-800 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-white">
              <Github className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                Repositório Remoto (GitHub)
                {isGhConfigured ? (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Configurado
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700 flex items-center gap-1">
                    Não configurado
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Sincronize e faça push automático das alterações locais para persistência no repositório remoto
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded text-xs font-bold border ${
                isGhConfigured
                  ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800/60'
                  : 'bg-slate-900 text-slate-400 border-slate-800'
              }`}
            >
              {ghConfig.repo || 'Nenhum repositório'}
            </span>
          </div>
        </div>

        {!isUnlocked ? (
          <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 text-center space-y-2">
            <p className="text-xs text-slate-400">
              Desbloqueie com a Senha Mestre acima para configurar ou alterar o token do GitHub.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome do Usuário (GitHub)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={ghConfig.username}
                    onChange={(e) => {
                      const u = e.target.value;
                      setGhConfig({
                        ...ghConfig,
                        username: u,
                        repo: u && ghConfig.repoName ? `${u}/${ghConfig.repoName}` : ghConfig.repo,
                      });
                    }}
                    placeholder="contalayka"
                    className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Usuário ou organização (Ex: <code>contalayka</code>)
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome do Repositório
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={ghConfig.repoName}
                    onChange={(e) => {
                      const r = e.target.value;
                      setGhConfig({
                        ...ghConfig,
                        repoName: r,
                        repo: ghConfig.username && r ? `${ghConfig.username}/${r}` : ghConfig.repo,
                      });
                    }}
                    placeholder="pesquisaproduto"
                    className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Repositório remoto (Ex: <code>pesquisaproduto</code>)
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Branch
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={ghConfig.branch}
                    onChange={(e) => setGhConfig({ ...ghConfig, branch: e.target.value })}
                    placeholder="main"
                    className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Branch monitorada (padrão: <code>main</code>)
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Credenciais do Repositório (Personal Access Token / PAT)
                </label>
                <button
                  type="button"
                  onClick={() => setShowTokenHelp(!showTokenHelp)}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 transition"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Como gerar o token?</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={showGhToken ? 'text' : 'password'}
                  value={ghConfig.token}
                  onChange={(e) => setGhConfig({ ...ghConfig, token: e.target.value })}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx ou github_pat_..."
                  className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 pr-10 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowGhToken(!showGhToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                  title={showGhToken ? 'Ocultar token' : 'Mostrar token'}
                >
                  {showGhToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Credencial de autenticação com permissão <code>repo</code> para envio automático.
              </p>
            </div>

            {showTokenHelp && (
              <div className="p-3.5 rounded-lg bg-indigo-950/30 border border-indigo-800/50 text-xs text-slate-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Github className="w-3.5 h-3.5 text-indigo-400" /> Como criar seu Token no GitHub em 3 passos:
                  </span>
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-white underline font-semibold"
                  >
                    Abrir GitHub Tokens <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] pl-1">
                  <li>No GitHub, acesse <strong>Settings &gt; Developer Settings &gt; Personal access tokens &gt; Tokens (classic)</strong>.</li>
                  <li>Clique em <strong>Generate new token (classic)</strong>, defina o nome <code>MarketPreco App</code> e marque a caixa de permissão <strong>repo</strong>.</li>
                  <li>Copie o token gerado (começa com <code>ghp_...</code>) e cole no campo acima.</li>
                </ol>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Caminho do Arquivo de Dados no Repositório
                </label>
                <input
                  type="text"
                  value={ghConfig.filePath}
                  onChange={(e) => setGhConfig({ ...ghConfig, filePath: e.target.value })}
                  placeholder="data/app_data_sync.json"
                  className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Arquivo JSON onde a lista de produtos e configurações será persistida.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <span className="block text-xs font-semibold text-white">
                    Push Automático ao Modificar
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Envia automaticamente novos produtos e alterações para o GitHub.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ghConfig.autoPush}
                    onChange={(e) => {
                      const updated = { ...ghConfig, autoPush: e.target.checked };
                      setGhConfig(updated);
                      saveStoredGitHubConfig(updated);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>

            {/* Test result message */}
            {ghTestResult && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  ghTestResult.success
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}
              >
                {ghTestResult.success ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span>{ghTestResult.message}</span>
              </div>
            )}

            {/* Action Feedback message */}
            {ghActionFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  ghActionFeedback.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}
              >
                {ghActionFeedback.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span>{ghActionFeedback.message}</span>
              </div>
            )}

            {/* Buttons Row */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestGitHubConnection}
                  disabled={isTestingGh || !ghConfig.token || !ghConfig.repo}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs transition"
                >
                  {isTestingGh ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Testando Conexão...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Testar Conexão</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSaveGitHubConfig}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition"
                >
                  <Save className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Salvar Configuração</span>
                </button>
                {ghSavedSuccess && (
                  <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Salvo!
                  </span>
                )}
              </div>

              {isGhConfigured && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePushToGitHub}
                    disabled={isPushingGh || isPullingGh}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs transition"
                    title="Envia a lista de produtos atual para o repositório remoto no GitHub"
                  >
                    {isPushingGh ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <ArrowUpToLine className="w-3.5 h-3.5" />
                        <span>Fazer Push Agora ({products.length} itens)</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handlePullFromGitHub}
                    disabled={isPushingGh || isPullingGh}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white font-bold text-xs transition"
                    title="Baixa a versão mais recente dos produtos e configurações gravados no GitHub"
                  >
                    {isPullingGh ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Baixando...</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownToLine className="w-3.5 h-3.5" />
                        <span>Fazer Pull Agora (Importar)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Sync Metadata summary */}
            {ghConfig.lastSyncedAt && (
              <div className="pt-2 text-[11px] text-slate-400 flex flex-wrap items-center gap-3 border-t border-slate-800/80">
                <span>
                  Última sincronização:{' '}
                  <strong className="text-slate-300">
                    {new Date(ghConfig.lastSyncedAt).toLocaleString('pt-BR')}
                  </strong>
                </span>
                <span>
                  Operação:{' '}
                  <strong className="text-slate-300 uppercase">
                    {ghConfig.lastSyncType || 'push'}
                  </strong>
                </span>
                {ghConfig.lastCommitSha && (
                  <span>
                    Commit SHA:{' '}
                    <code className="text-indigo-400 bg-slate-900 px-1 py-0.5 rounded font-mono">
                      {ghConfig.lastCommitSha.slice(0, 7)}
                    </code>
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Parâmetros Padrão de Precificação */}
      <div className="rounded-lg bg-[#121824] border border-slate-800 p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-950/40 border border-indigo-800/50 flex items-center justify-center text-indigo-400">
            <Calculator className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Parâmetros Padrão de Precificação
            </h2>
            <p className="text-xs text-slate-400">
              Valores padrão para o Simulador de Preços
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
            <label className="text-xs font-bold text-slate-300">
              Markup Padrão (%)
            </label>
            <input
              type="number"
              value={defaultMarkup}
              onChange={(e) => setDefaultMarkup(e.target.value)}
              className="w-full rounded-lg bg-[#121824] border border-slate-800 px-3 py-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none tabular-nums"
            />
          </div>

          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
            <label className="text-xs font-bold text-slate-300">
              Impostos DAS (%)
            </label>
            <input
              type="number"
              value={defaultTaxRate}
              onChange={(e) => setDefaultTaxRate(e.target.value)}
              className="w-full rounded-lg bg-[#121824] border border-slate-800 px-3 py-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none tabular-nums"
            />
          </div>

          <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
            <label className="text-xs font-bold text-slate-300">
              Embalagem (R$)
            </label>
            <input
              type="number"
              value={defaultPackagingCost}
              onChange={(e) => setDefaultPackagingCost(e.target.value)}
              className="w-full rounded-lg bg-[#121824] border border-slate-800 px-3 py-1 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none tabular-nums"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSavePricing}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar Parâmetros</span>
          </button>
          {savedSuccess && (
            <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Salvo!
            </span>
          )}
        </div>
      </div>

      {/* 3. Backup & Restore */}
      <div className="rounded-lg bg-[#121824] border border-slate-800 p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-950/40 border border-indigo-800/50 flex items-center justify-center text-indigo-400">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              Backup e Restauração
            </h2>
            <p className="text-xs text-slate-400">
              Exporte todos os produtos e pesquisas em arquivo JSON
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs border border-slate-800 transition"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Exportar Backup (.json)</span>
          </button>

          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs border border-slate-800 transition cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Restaurar Backup (.json)</span>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportBackup}
            />
          </label>
        </div>
      </div>

      {/* 4. Danger Zone */}
      <div className="rounded-lg bg-rose-950/20 border border-rose-900/40 p-5 space-y-2.5">
        <div className="flex items-center gap-2 text-rose-400">
          <ShieldAlert className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">Zona de Risco</h3>
        </div>

        <p className="text-xs text-slate-400">
          A limpeza de dados apaga permanentemente os {products.length} produtos do catálogo local.
        </p>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 font-bold text-xs border border-rose-800/60 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar Todos os Produtos</span>
          </button>
        ) : (
          <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-700 space-y-2">
            <p className="text-xs font-bold text-white">
              Tem certeza absoluta? Esta ação não pode ser desfeita.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  setConfirmDelete(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition"
              >
                Sim, Limpar Tudo
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Sobre o Sistema & Marca Oficial */}
      <div className="rounded-lg bg-[#121824] border border-slate-800 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <MarketPrepLogo variant="compact" size="md" showSubtitle={true} />
        </div>
        <div className="text-right text-xs text-slate-400 space-y-0.5">
          <p className="font-semibold text-slate-300">
            Catálogo • Conversão • Marketplaces
          </p>
          <p className="text-[11px] text-slate-500">
            MarketPreço
          </p>
        </div>
      </div>
    </div>
  );
};
