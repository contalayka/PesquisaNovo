import React, { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, Crown, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';

const TAB_SESSION_KEY = 'marketpreco_authenticated_tab_v1';

export function LoginGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      if (sessionStorage.getItem(TAB_SESSION_KEY) !== '1') {
        if (active) setChecking(false);
        return;
      }
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' });
        const data = await response.json();
        if (active && response.ok && data.authenticated) setAuthenticated(true);
        else sessionStorage.removeItem(TAB_SESSION_KEY);
      } catch {
        sessionStorage.removeItem(TAB_SESSION_KEY);
      } finally {
        if (active) setChecking(false);
      }
    };
    checkSession();
    return () => { active = false; };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      });
      const responseText = await response.text();
      let data: { authenticated?: boolean; error?: string } = {};
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        data = {};
      }
      if (!response.ok || !data.authenticated) {
        const message = data.error || (response.status
          ? `O servidor recusou a validação (HTTP ${response.status}).`
          : 'Resposta inválida do servidor.');
        setError(message);
        setPassword('');
        return;
      }
      sessionStorage.setItem(TAB_SESSION_KEY, '1');
      setAuthenticated(true);
      setPassword('');
    } catch (error) {
      console.error('Falha ao chamar /api/auth/login:', error);
      setError('Não foi possível conectar à rota de autenticação. Recarregue a página e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authenticated) return <>{children}</>;

  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-[#0b0e12] text-slate-100 px-5 py-10 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 38%, rgba(183,243,74,.10), transparent 48%)' }} />
      <div className="absolute inset-0 pointer-events-none opacity-[0.12]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: '54px 54px' }} />
      <section className="relative w-full max-w-[440px] rounded-[28px] border border-[#303943] bg-[#151a20]/95 shadow-[0_28px_100px_rgba(0,0,0,.55)] px-7 py-10 sm:px-10">
        <div className="flex flex-col items-center text-center">
          <div className="h-20 w-20 rounded-[24px] border border-[#b7f34a]/35 bg-[#b7f34a]/[0.08] flex items-center justify-center shadow-[0_0_45px_rgba(183,243,74,.10)]">
            <Crown size={38} strokeWidth={1.6} className="text-[#b7f34a]" />
          </div>
          <div className="mt-6 text-[27px] leading-none tracking-[-0.07em] font-extrabold text-white">MARKET<span className="text-[#b7f34a]">PREÇO</span></div>
          <div className="mt-3 text-[11px] font-semibold tracking-[0.24em] uppercase text-slate-500">Central de inteligência comercial</div>
          <div className="mt-9 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <LockKeyhole size={16} className="text-[#b7f34a]" /> Acesso restrito
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">Entre com sua senha para acessar seu catálogo e suas ferramentas.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8">
          <label htmlFor="marketpreco-password" className="mb-2 block text-xs font-semibold text-slate-300">Sua senha</label>
          <div className="relative">
            <input
              id="marketpreco-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
              placeholder="Digite sua senha"
              className="h-14 w-full rounded-xl border border-[#35414d] bg-[#0e1318] pl-4 pr-12 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-[#b7f34a] focus:ring-2 focus:ring-[#b7f34a]/15"
            />
            <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:text-white">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <p role="alert" className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">{error}</p>}
          <button type="submit" disabled={!password || submitting || checking} className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#b7f34a] px-5 font-bold text-[#10150a] shadow-[0_8px_28px_rgba(183,243,74,.16)] transition hover:bg-[#c8ff63] disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? 'Verificando...' : 'Entrar'}
            {!submitting && <ArrowRight size={18} />}
          </button>
        </form>

        <div className="mt-8 flex items-center justify-center gap-2 border-t border-white/[0.07] pt-5 text-[11px] text-slate-500">
          <ShieldCheck size={14} className="text-[#b7f34a]/80" />
          Área privada · Sessão encerrada ao fechar a aba
        </div>
      </section>
      {checking && <div className="absolute inset-0 bg-[#0b0e12]/70" aria-label="Verificando sessão" />}
    </main>
  );
}
