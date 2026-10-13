import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Copy, MessageCircle, RotateCcw } from 'lucide-react';

type PlatformCounts = {
  shopee: string;
  mercadoLivre: string;
  tiktokShop: string;
  shein: string;
};

const STORAGE_KEY = 'marketpreco_relatorio_whatsapp_v1';

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatDate(date: string) {
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return year && month && day ? `${day}/${month}/${year}` : date;
}

const emptyCounts: PlatformCounts = {
  shopee: '0',
  mercadoLivre: '0',
  tiktokShop: '0',
  shein: '0',
};

export const WhatsAppReportView: React.FC = () => {
  const [operationalDate, setOperationalDate] = useState(todayInSaoPaulo);
  const [counts, setCounts] = useState<PlatformCounts>(emptyCounts);
  const [pending, setPending] = useState('0');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed.operationalDate) setOperationalDate(parsed.operationalDate);
      if (parsed.counts) setCounts({ ...emptyCounts, ...parsed.counts });
      if (parsed.pending !== undefined) setPending(String(parsed.pending));
    } catch (error) {
      console.warn('Não foi possível recuperar o rascunho do relatório.', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ operationalDate, counts, pending }));
    } catch (error) {
      console.warn('Não foi possível salvar o rascunho do relatório.', error);
    }
  }, [operationalDate, counts, pending]);

  const values = useMemo(() => ({
    shopee: Math.max(0, Number.parseInt(counts.shopee, 10) || 0),
    mercadoLivre: Math.max(0, Number.parseInt(counts.mercadoLivre, 10) || 0),
    tiktokShop: Math.max(0, Number.parseInt(counts.tiktokShop, 10) || 0),
    shein: Math.max(0, Number.parseInt(counts.shein, 10) || 0),
  }), [counts]);

  const total = values.shopee + values.mercadoLivre + values.tiktokShop + values.shein;
  const pendingTotal = Math.max(0, Number.parseInt(pending, 10) || 0);

  const reportText = useMemo(() => [
    '*📦 RELATÓRIO DE PEDIDOS*',
    `📅 Data: ${formatDate(operationalDate)}`,
    '',
    `🟠 Shopee: ${values.shopee} ${values.shopee === 1 ? 'pedido' : 'pedidos'}`,
    `🟡 Mercado Livre: ${values.mercadoLivre} ${values.mercadoLivre === 1 ? 'pedido' : 'pedidos'}`,
    `⚫ TikTok Shop: ${values.tiktokShop} ${values.tiktokShop === 1 ? 'pedido' : 'pedidos'}`,
    `⚪ SHEIN: ${values.shein} ${values.shein === 1 ? 'pedido' : 'pedidos'}`,
    '',
    '━━━━━━━━━━━━━━',
    `📊 *TOTAL GERAL: ${total} ${total === 1 ? 'pedido' : 'pedidos'}*`,
    `⚠️ Pendentes de conferência: ${pendingTotal}`,
    '',
    '_MARKETPREÇO | Relatório de expedição_',
  ].join('\n'), [operationalDate, values, total, pendingTotal]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = reportText;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(success);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const updateCount = (key: keyof PlatformCounts, value: string) => {
    if (value !== '' && (!/^\d+$/.test(value) || Number(value) < 0)) return;
    setCounts((previous) => ({ ...previous, [key]: value }));
  };

  const resetDraft = () => {
    setOperationalDate(todayInSaoPaulo());
    setCounts(emptyCounts);
    setPending('0');
    setCopied(false);
  };

  const inputClass = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500';

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-400">
            <MessageCircle className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">Expedição</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white">Relatório para WhatsApp</h1>
          <p className="mt-1 text-sm text-slate-400">Monte uma mensagem clara com a data e a quantidade de pedidos por plataforma.</p>
        </div>
        <button type="button" onClick={resetDraft} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white">
          <RotateCcw className="h-4 w-4" /> Limpar contagem
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-slate-800 bg-[#121824] p-4 sm:p-5">
          <h2 className="text-base font-semibold text-white">Dados do relatório</h2>
          <label className="mt-4 block text-sm font-medium text-slate-300">
            <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-emerald-400" /> Data operacional</span>
            <input className={inputClass} type="date" value={operationalDate} onChange={(event) => setOperationalDate(event.target.value)} />
          </label>

          <div className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-slate-300">
              🟠 Shopee
              <input className={inputClass} type="number" min="0" step="1" inputMode="numeric" value={counts.shopee} onChange={(event) => updateCount('shopee', event.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-300">
              🟡 Mercado Livre
              <input className={inputClass} type="number" min="0" step="1" inputMode="numeric" value={counts.mercadoLivre} onChange={(event) => updateCount('mercadoLivre', event.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-300">
              ⚫ TikTok Shop
              <input className={inputClass} type="number" min="0" step="1" inputMode="numeric" value={counts.tiktokShop} onChange={(event) => updateCount('tiktokShop', event.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-300">
              ⚪ SHEIN
              <input className={inputClass} type="number" min="0" step="1" inputMode="numeric" value={counts.shein} onChange={(event) => updateCount('shein', event.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-300">
              Pendentes de conferência
              <input className={inputClass} type="number" min="0" step="1" inputMode="numeric" value={pending} onChange={(event) => setPending(event.target.value === '' ? '' : String(Math.max(0, Number.parseInt(event.target.value, 10) || 0)))} />
            </label>
          </div>
          <div className="mt-5 rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4">
            <p className="text-sm text-emerald-200">Total informado</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-white">{total}</p>
            <p className="mt-1 text-xs text-slate-400">Soma das quantidades digitadas acima.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#121824] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">Prévia da mensagem</h2>
            <span className="rounded-full border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-1 text-xs text-emerald-300">WhatsApp</span>
          </div>
          <pre className="mt-4 min-h-[360px] whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-950 p-4 font-sans text-sm leading-6 text-slate-200">{reportText}</pre>
          <button type="button" onClick={handleCopy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.99]">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Texto copiado!' : 'Copiar texto para WhatsApp'}
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-500">Os campos são preenchidos manualmente nesta versão. A leitura automática das etiquetas e a contagem por OCR precisam ser integradas ao módulo de processamento de etiquetas.</p>
        </section>
      </div>
    </div>
  );
};
