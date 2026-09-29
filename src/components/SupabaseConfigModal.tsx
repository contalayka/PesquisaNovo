import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  ExternalLink,
  X,
  Eye,
  EyeOff,
  Trash2,
  Lock,
  Unlock,
  ShieldCheck,
} from 'lucide-react';
import {
  getStoredSupabaseConfig,
  saveStoredSupabaseConfig,
  testSupabaseConnection,
  SUPABASE_SETUP_SQL,
  SUPABASE_MIGRATION_FIX_BIGINT_SQL,
} from '../utils/supabase';
import { SupabaseConfig } from '../types';
import { isMasterUnlocked, setMasterUnlocked, verifyMasterPassword } from '../utils/security';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnectionSuccess: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onConnectionSuccess,
}) => {
  const [config, setConfig] = useState<SupabaseConfig>({ url: '', anonKey: '' });
  const [showKey, setShowKey] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(isMasterUnlocked());
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedMigrationSql, setCopiedMigrationSql] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [showMigrationSql, setShowMigrationSql] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredSupabaseConfig();
      setConfig(stored);
      setIsUnlocked(isMasterUnlocked());
      setPasswordInput('');
      setPasswordError('');
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

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

  const handleDisconnect = () => {
    if (window.confirm('Deseja desconectar e remover as credenciais do Supabase salvas neste navegador?')) {
      const emptyConfig = { url: '', anonKey: '' };
      setConfig(emptyConfig);
      saveStoredSupabaseConfig(emptyConfig);
      setTestResult({ success: false, message: 'Supabase desconectado.' });
      onConnectionSuccess();
    }
  };

  const handleSaveAndTest = async () => {
    setTesting(true);
    setTestResult(null);
    saveStoredSupabaseConfig(config);

    const result = await testSupabaseConnection(config);
    setTesting(false);
    setTestResult(result);

    if (result.success) {
      onConnectionSuccess();
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleCopyMigrationSql = () => {
    navigator.clipboard.writeText(SUPABASE_MIGRATION_FIX_BIGINT_SQL);
    setCopiedMigrationSql(true);
    setTimeout(() => setCopiedMigrationSql(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        id="supabase-config-modal"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Conexão Supabase
                {isUnlocked ? (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Desbloqueado
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Protegido
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sincronização em tempo real entre dispositivos
              </p>
            </div>
          </div>
          <button
            id="btn-close-supabase-modal"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 text-sm">
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 text-xs leading-relaxed">
            Ao conectar o Supabase, todas as pesquisas, alterações de status e novos produtos cadastrados ficam salvos no banco de dados na nuvem e aparecem automaticamente em qualquer outro computador ou celular.
          </div>

          {!isUnlocked ? (
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Credenciais e API Key Protegidas
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                  A chave de API está protegida por senha mestre. Digite a senha para visualizar ou alterar a configuração.
                </p>
              </div>

              <form onSubmit={handleUnlock} className="max-w-xs mx-auto pt-2 space-y-2">
                <div className="relative">
                  <input
                    type="password"
                    placeholder="Digite a Senha Mestre..."
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError('');
                    }}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                {passwordError && (
                  <p className="text-xs text-rose-500 font-semibold">{passwordError}</p>
                )}
                <button
                  type="submit"
                  className="w-full py-2 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Desbloquear Credenciais</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Configurações de Acesso
                </span>
                <button
                  type="button"
                  onClick={handleLock}
                  className="text-xs text-amber-500 hover:text-amber-400 font-semibold inline-flex items-center gap-1"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Bloquear Acesso
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Project URL (Supabase URL)
                </label>
                <input
                  id="input-supabase-url"
                  type="text"
                  placeholder="https://xyzcompany.supabase.co"
                  value={config.url}
                  onChange={(e) => setConfig({ ...config, url: e.target.value.trim() })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Anon Public Key
                </label>
                <div className="relative">
                  <input
                    id="input-supabase-anon-key"
                    type={showKey ? 'text' : 'password'}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={config.anonKey}
                    onChange={(e) => setConfig({ ...config, anonKey: e.target.value.trim() })}
                    className="w-full px-3 py-2 pr-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                    title={showKey ? 'Ocultar chave' : 'Mostrar chave'}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Test Status feedback */}
          {testResult && (
            <div
              className={`p-3 rounded-xl flex items-start gap-2.5 text-xs ${
                testResult.success
                  ? 'bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-rose-100/70 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="font-semibold">{testResult.success ? 'Conectado!' : 'Atenção'}</p>
                <p className="mt-0.5">{testResult.message}</p>
              </div>
            </div>
          )}

          {/* Bigint Fix Box */}
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs space-y-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-amber-900 dark:text-amber-200 text-xs">
                    Erro &quot;invalid input syntax for type bigint&quot;?
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyMigrationSql}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] transition shadow-xs"
                  >
                    <Copy className="w-3 h-3" />
                    {copiedMigrationSql ? 'SQL Copiado!' : 'Copiar Script de Correção'}
                  </button>
                </div>
                <p className="text-amber-800/90 dark:text-amber-300/80 leading-relaxed text-[11px]">
                  Se os produtos possuem códigos com traço (ex: <code className="bg-amber-200/60 dark:bg-amber-900/60 px-1 py-0.5 rounded font-mono font-bold">1790007148-169</code>), SKUs ou letras, execute este script no <strong>SQL Editor</strong> do Supabase para converter as colunas de ID para <code className="font-mono font-bold">TEXT</code> sem perder dados:
                </p>
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowMigrationSql(!showMigrationSql)}
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline"
                  >
                    {showMigrationSql ? 'Ocultar Código do Script' : 'Visualizar Código SQL de Correção'}
                  </button>
                  <a
                    href="https://supabase.com/dashboard/project/_/sql"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 hover:underline"
                  >
                    Abrir SQL Editor <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                {showMigrationSql && (
                  <pre className="mt-2 p-2.5 rounded-lg bg-slate-950 text-slate-200 text-[10px] font-mono overflow-x-auto max-h-36 border border-slate-800 leading-relaxed">
                    {SUPABASE_MIGRATION_FIX_BIGINT_SQL}
                  </pre>
                )}
              </div>
            </div>
          </div>

          {/* SQL Setup collapse */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowSql(!showSql)}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                {showSql ? 'Ocultar Script SQL Completo das Tabelas' : 'Ver Script SQL Completo das Tabelas no Supabase'}
              </button>
              <button
                type="button"
                onClick={handleCopySql}
                className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedSql ? 'Copiado!' : 'Copiar SQL Completo'}
              </button>
            </div>

            {showSql && (
              <pre className="mt-2.5 p-3 rounded-lg bg-slate-950 text-slate-200 text-[11px] font-mono overflow-x-auto max-h-48 border border-slate-800 leading-relaxed">
                {SUPABASE_SETUP_SQL}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 inline-flex items-center gap-1"
            >
              Supabase Dashboard
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {(config.url || config.anonKey) && (
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-xs text-rose-500 hover:text-rose-400 inline-flex items-center gap-1 font-semibold transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Desconectar
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              id="btn-save-test-supabase"
              type="button"
              disabled={testing || !config.url || !config.anonKey}
              onClick={handleSaveAndTest}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-2 transition"
            >
              {testing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Testando...
                </>
              ) : (
                'Salvar e Testar Conexão'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
