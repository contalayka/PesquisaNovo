import React, { useEffect, useMemo, useState } from 'react';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
(pdfjsLib as any).GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
import { jsPDF } from 'jspdf';
import { getSupabaseClient } from '../utils/supabase';
import {
  CalendarDays,
  Check,
  Copy,
  FileDown,
  History,
  LoaderCircle,
  ScanLine,
  Trash2,
  Upload,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
} from 'lucide-react';
import {
  Platform,
  PLATFORMS,
  ProcessedLabel,
  ShippingReportSummary,
  createEmptyCounts,
  detectPlatform,
  extractOrderNumber,
  segmentPageIntoLabels,
  processLabelBlock,
  deduplicateAndSummarize,
  computeOrderHash,
  formatBrDate,
  formatWhatsAppMessage,
  normalizeOrderCode,
} from '../utils/shippingReportEngine';

type Batch = {
  id: string;
  operational_date: string;
  created_at: string;
  file_count: number;
  total_orders: number;
  counts: Record<string, number>;
  pending_count: number;
};

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500';
const HISTORY_KEY = 'marketpreco_shipping_report_history_v1';
const ORDER_KEY = 'marketpreco_shipping_report_orders_v1';

function getTodayIsoDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const obj = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

export const WhatsAppReportView: React.FC = () => {
  const [date, setDate] = useState<string>(getTodayIsoDate);
  const [files, setFiles] = useState<File[]>([]);
  const [labels, setLabels] = useState<ProcessedLabel[]>([]);
  const [history, setHistory] = useState<Batch[]>([]);
  const [dailyTotals, setDailyTotals] = useState<Record<string, Record<string, number>>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'processar' | 'historico'>('processar');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const client = getSupabaseClient();

  // Carrega histórico e etiquetas do cache local ao iniciar
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem(HISTORY_KEY);
      if (savedHistory) setHistory(JSON.parse(savedHistory));
      const savedLabels = localStorage.getItem(ORDER_KEY);
      if (savedLabels) setLabels(JSON.parse(savedLabels));
    } catch (e) {
      console.warn('Falha ao ler cache local de relatórios:', e);
    }
    void loadHistory();
  }, []);

  async function loadHistory() {
    const local = (() => {
      try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      } catch {
        return [];
      }
    })();

    if (!client) {
      setHistory(local);
      return;
    }

    try {
      const { data, error: err } = await client
        .from('report_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!err && data) {
        setHistory(data as Batch[]);
      } else {
        setHistory(local);
      }

      const { data: rows } = await client
        .from('report_orders')
        .select('operational_date,marketplace,order_hash')
        .order('operational_date', { ascending: false })
        .limit(10000);

      if (rows) {
        const grouped: Record<string, Record<string, number>> = {};
        const seen = new Set<string>();
        for (const row of rows) {
          const key = `${row.operational_date}:${row.order_hash}`;
          if (seen.has(key)) continue;
          seen.add(key);
          grouped[row.operational_date] ||= createEmptyCounts();
          grouped[row.operational_date][row.marketplace] =
            (grouped[row.operational_date][row.marketplace] || 0) + 1;
        }
        setDailyTotals(grouped);
      }
    } catch (e) {
      console.warn('Erro ao carregar histórico do Supabase:', e);
      setHistory(local);
    }
  }

  // Resumo consolidado calculado dinamicamente pelo motor oficial
  const summary: ShippingReportSummary = useMemo(() => {
    return deduplicateAndSummarize(labels, new Set(), date);
  }, [labels, date]);

  const reportText = useMemo(() => {
    return formatWhatsAppMessage(summary);
  }, [summary]);

  /**
   * Processamento robusto de arquivos:
   * 1. Extrai texto nativo de PDFs com PDF.js (rápido e preciso).
   * 2. Se o texto nativo não for suficiente ou a página for imagem, aciona OCR pontual.
   * 3. Segmenta etiquetas em nível de página/grid.
   * 4. Deduplica em 3 níveis.
   */
  async function processFiles() {
    if (!files.length) {
      setError('Selecione ao menos um arquivo PDF ou imagem com etiquetas de envio.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    setProgress('Inicializando leitor de etiquetas...');

    let worker: any = null;

    try {
      const rawExtractedLabels: ProcessedLabel[] = [];

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          // Imagem única
          setProgress(`Processando imagem: ${file.name}...`);
          if (!worker) {
            worker = await createWorker('por+eng', 1, {
              logger: (m: any) => {
                if (m.status === 'recognizing text') {
                  setProgress(`OCR na imagem ${file.name}: ${Math.round(m.progress * 100)}%`);
                }
              },
            });
          }
          const ocrRes = await worker.recognize(file);
          const text = ocrRes.data.text || '';
          const segments = segmentPageIntoLabels(text);
          segments.forEach((seg, idx) => {
            rawExtractedLabels.push(processLabelBlock(seg, file.name, 1, idx));
          });
        } else {
          // Documento PDF
          setProgress(`Lendo documento PDF: ${file.name}...`);
          const arrayBuf = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({
            data: arrayBuf,
            useSystemFonts: true,
          }).promise;

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            setProgress(`Lendo página ${pageNum} de ${pdf.numPages} (${file.name})...`);
            const page = await pdf.getPage(pageNum);

            // 1. Extrai texto nativo do PDF preservando quebras de linha reais
            const tc = await page.getTextContent();
            let nativeText = '';
            let lastY: number | null = null;
            for (const item of (tc.items || []) as any[]) {
              if (!item.str) continue;
              const curY = item.transform ? item.transform[5] : null;
              if (lastY !== null && curY !== null && Math.abs(curY - lastY) > 5) {
                nativeText += '\n';
              } else if (
                nativeText.length > 0 &&
                !nativeText.endsWith('\n') &&
                !nativeText.endsWith(' ')
              ) {
                nativeText += ' ';
              }
              nativeText += item.str;
              if (item.hasEOL) {
                nativeText += '\n';
              }
              if (curY !== null) {
                lastY = curY;
              }
            }
            nativeText = nativeText.trim();

            let pageText = nativeText;

            // 2. OCR obrigatório em PDFs: o texto nativo pode reconhecer o código de pedido
            // como um Order SN da Shopee e ignorar o logotipo SHEIN, que costuma ser uma imagem.
            // Isso é especialmente importante em etiquetas UpSeller com pedido numérico/alfanumérico.
            try {
              if (!worker) {
                setProgress('Carregando mecanismo de OCR...');
                worker = await createWorker('por+eng', 1, {
                  logger: (m: any) => {
                    if (m.status === 'recognizing text') {
                      setProgress(
                        `OCR página ${pageNum}/${pdf.numPages}: ${Math.round(m.progress * 100)}%`
                      );
                    }
                  },
                });
              }

              const vp = page.getViewport({ scale: 2.5 });
              const canvas = document.createElement('canvas');
              canvas.width = Math.ceil(vp.width);
              canvas.height = Math.ceil(vp.height);
              const ctx = canvas.getContext('2d');

              if (ctx) {
                await page.render({ canvasContext: ctx, viewport: vp }).promise;
                const ocrRes = await worker.recognize(canvas);
                const ocrText = ocrRes.data.text || '';
                // Texto nativo primeiro, OCR depois: detectPlatform prioriza marca explícita SHEIN
                // sobre padrões de pedido que também podem aparecer em etiquetas SHEIN.
                pageText = [nativeText, ocrText].filter(Boolean).join('\\n');
              }
            } catch (ocrErr) {
              // OCR é adicional; se falhar, ainda tentamos processar o texto nativo do PDF.
              console.warn(`Erro no OCR da página ${pageNum}:`, ocrErr);
              pageText = nativeText;
            }

            // 4. Segmenta em etiquetas (suporta 1 etiqueta térmica por página ou várias em A4)
            const segments = segmentPageIntoLabels(pageText);
            segments.forEach((seg, idx) => {
              rawExtractedLabels.push(processLabelBlock(seg, file.name, pageNum, idx));
            });
          }
        }
      }

      // Consulta hashes de pedidos já processados em lotes anteriores no Supabase
      const knownHashes = new Set<string>();
      if (client && rawExtractedLabels.length) {
        setProgress('Conferindo deduplicação com histórico salvo...');
        const candidateItems = rawExtractedLabels.filter((l) => l.platform && l.orderNumber);
        const hashesToCheck = await Promise.all(
          candidateItems.map(async (l) => ({
            key: `${l.platform}:${normalizeOrderCode(l.orderNumber)}`,
            hash: await computeOrderHash(l.platform, l.orderNumber),
          }))
        );

        for (let i = 0; i < hashesToCheck.length; i += 100) {
          const chunk = hashesToCheck.slice(i, i + 100);
          const { data: existingRows } = await client
            .from('report_orders')
            .select('order_hash')
            .in(
              'order_hash',
              chunk.map((c) => c.hash)
            );

          if (existingRows) {
            for (const r of existingRows) {
              const matched = chunk.find((c) => c.hash === r.order_hash);
              if (matched) knownHashes.add(matched.key);
            }
          }
        }
      }

      // Executa consolidação estrita com deduplicação em 3 níveis
      const calculated = deduplicateAndSummarize(rawExtractedLabels, knownHashes, date);

      setLabels(calculated.items);
      try {
        localStorage.setItem(ORDER_KEY, JSON.stringify(calculated.items));
      } catch (e) {
        console.warn('Erro ao salvar no localStorage:', e);
      }

      const confirmedCount = calculated.totalUniqueOrders;
      const pendingCount = calculated.realPendingCount;
      const dupCount = calculated.duplicateCount;

      let msg = `Leitura concluída com sucesso: ${rawExtractedLabels.length} etiqueta(s) analisada(s). ${confirmedCount} pedido(s) único(s) contabilizado(s).`;
      if (dupCount > 0) {
        msg += ` ${dupCount} duplicata(s) descartada(s).`;
      }
      if (pendingCount > 0) {
        msg += ` ${pendingCount} etiqueta(s) pendente(s) de conferência.`;
      }

      setNotice(msg);
      setFiles([]);
    } catch (err: any) {
      console.error('Erro ao processar etiquetas:', err);
      setError(`Não foi possível processar os arquivos: ${err?.message || String(err)}`);
    } finally {
      if (worker) {
        await worker.terminate().catch(() => {});
      }
      setBusy(false);
      setProgress('');
    }
  }

  // Salva lote e pedidos únicos no histórico e no Supabase
  async function saveBatch() {
    if (summary.totalUniqueOrders === 0 && summary.realPendingCount === 0) {
      setError('Nenhum pedido para salvar no histórico.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');

    try {
      const validOrders = summary.items.filter((l) => l.include && !l.duplicate && l.platform && l.orderNumber);
      const batchId = crypto.randomUUID();

      const hashesToInsert = await Promise.all(
        validOrders.map(async (l) => ({
          order_hash: await computeOrderHash(l.platform, l.orderNumber),
          marketplace: l.platform,
          order_suffix: normalizeOrderCode(l.orderNumber).slice(-4),
          operational_date: date,
          batch_id: batchId,
        }))
      );

      const batch: Batch = {
        id: batchId,
        operational_date: date,
        created_at: new Date().toISOString(),
        file_count: new Set(summary.items.map((i) => i.file)).size || 1,
        total_orders: summary.totalUniqueOrders,
        counts: summary.counts,
        pending_count: summary.realPendingCount,
      };

      if (client) {
        const { error: eBatch } = await client.from('report_batches').insert({
          id: batch.id,
          operational_date: batch.operational_date,
          file_count: batch.file_count,
          total_orders: batch.total_orders,
          counts: batch.counts,
          pending_count: batch.pending_count,
        });

        if (eBatch) {
          throw new Error(`Falha ao salvar lote no Supabase: ${eBatch.message}`);
        }

        if (hashesToInsert.length) {
          const { error: eOrders } = await client
            .from('report_orders')
            .upsert(hashesToInsert, { onConflict: 'order_hash,operational_date' });
          if (eOrders) {
            throw new Error(`Falha ao registrar deduplicação no Supabase: ${eOrders.message}`);
          }
        }
      }

      // Atualiza histórico local
      const local = (() => {
        try {
          return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as Batch[];
        } catch {
          return [];
        }
      })();

      const nextHistory = [batch, ...local.filter((b) => b.id !== batchId)].slice(0, 100);
      setHistory(nextHistory);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      } catch (e) {
        console.warn('Erro ao salvar histórico local:', e);
      }

      setNotice(`Lote salvo com sucesso! ${summary.totalUniqueOrders} pedido(s) registrado(s) para ${formatBrDate(date)}.`);
      await loadHistory();
    } catch (err: any) {
      console.error('Erro ao salvar lote:', err);
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  // Copia mensagem oficial para o WhatsApp
  async function copyToWhatsApp() {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
    } catch {
      const el = document.createElement('textarea');
      el.value = reportText;
      document.body.appendChild(el);
      el.select();
      setCopied(document.execCommand('copy'));
      el.remove();
    }
    window.setTimeout(() => setCopied(false), 2000);
  }

  // Gera PDF formatado do relatório
  function exportPdf(batch?: Batch) {
    const d = batch?.operational_date || date;
    const c = (batch?.counts || summary.counts) as Record<Platform, number>;
    const t = batch?.total_orders ?? summary.totalUniqueOrders;
    const p = batch?.pending_count ?? summary.realPendingCount;

    const doc = new jsPDF();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 297, 'F');

    // Header
    doc.setTextColor(52, 211, 153);
    doc.setFontSize(22);
    doc.text('MARKETPREÇO', 18, 22);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.text('Relatório de Expedição de Pedidos', 18, 34);

    doc.setFontSize(11);
    doc.setTextColor(148, 163, 184);
    doc.text(`Data operacional: ${formatBrDate(d)}`, 18, 44);

    let y = 65;
    PLATFORMS.forEach((plat) => {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.text(plat, 20, y);

      doc.setTextColor(52, 211, 153);
      doc.setFontSize(13);
      doc.text(`${c[plat] || 0} pedido(s)`, 185, y, { align: 'right' });
      y += 14;
    });

    doc.setDrawColor(52, 211, 153);
    doc.setLineWidth(0.5);
    doc.line(18, y + 2, 192, y + 2);
    y += 18;

    // Total Geral
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('TOTAL GERAL', 20, y);

    doc.setTextColor(52, 211, 153);
    doc.setFontSize(16);
    doc.text(`${t} pedido(s)`, 185, y, { align: 'right' });

    y += 14;
    doc.setTextColor(203, 213, 225);
    doc.setFontSize(10);
    doc.text(`Pendentes de conferência: ${p}`, 20, y);

    doc.save(`relatorio-pedidos-${d}.pdf`);
  }

  // Limpa lista atual com confirmação segura sem apagar o histórico salvo
  function handleClearClick() {
    setShowConfirmClear(true);
  }

  function executeClearSession() {
    setLabels([]);
    setFiles([]);
    localStorage.removeItem(ORDER_KEY);
    setNotice('Lista atual limpa com sucesso. O histórico salvo permanece seguro.');
    setError('');
    setShowConfirmClear(false);
  }


  // Permite confirmar ou alterar a plataforma/pedido de uma etiqueta com pendência em 1 clique
  function handleResolvePending(itemId: string, targetPlatform: Platform, newOrder?: string) {
    setLabels((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const finalOrder = (newOrder !== undefined ? newOrder : it.orderNumber || '').trim();
        return {
          ...it,
          platform: targetPlatform,
          orderNumber: finalOrder,
          confidence: finalOrder ? 'Detectado' : 'Revisar',
          pendingReason: finalOrder ? '' : 'Número do pedido não encontrado',
          include: Boolean(finalOrder),
        };
      })
    );
    setNotice(`Etiqueta atualizada para ${targetPlatform} com sucesso!`);
  }

  const platformCardStyles: Record<Platform, { border: string; bg: string; text: string; iconColor: string }> = {
    'Shopee': {
      border: 'border-orange-500/40',
      bg: 'bg-orange-500/10',
      text: 'text-orange-300',
      iconColor: 'bg-orange-500',
    },
    'Mercado Livre': {
      border: 'border-yellow-500/40',
      bg: 'bg-yellow-500/10',
      text: 'text-yellow-200',
      iconColor: 'bg-yellow-500',
    },
    'TikTok Shop': {
      border: 'border-slate-500/40',
      bg: 'bg-slate-800/40',
      text: 'text-slate-200',
      iconColor: 'bg-slate-400',
    },
    'SHEIN': {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-300',
      iconColor: 'bg-emerald-400',
    },
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-12">
      {/* 1. Header do Módulo */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-400">
            <ScanLine className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">
              Expedição Automatizada
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white tracking-tight">
            Relatórios de Pedidos
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Envie etiquetas em PDF ou imagem para identificação e contabilização automática dos pedidos por marketplace.
          </p>
        </div>

        <button
          type="button"
          onClick={handleClearClick}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-300 hover:border-slate-600 hover:text-white transition cursor-pointer"
        >
          <Trash2 className="h-4 w-4 text-slate-400" />
          <span>Limpar sessão</span>
        </button>
      </header>

      {/* 2. Navegação por Abas */}
      <nav className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setTab('processar')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition cursor-pointer ${
            tab === 'processar'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          Processar Etiquetas
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('historico');
            void loadHistory();
          }}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition cursor-pointer ${
            tab === 'historico'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Histórico</span>
        </button>
      </nav>

      {/* Alertas e Notificações */}
      {error && (
        <div className="rounded-xl border border-red-900/70 bg-red-950/40 p-3.5 text-sm text-red-200 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-emerald-900/70 bg-emerald-950/40 p-3.5 text-sm text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{notice}</span>
        </div>
      )}

      {tab === 'processar' ? (
        <>
          {/* Seção 1: Upload e Seleção */}
          <section className="rounded-2xl border border-slate-800 bg-[#121824] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="block text-sm font-medium text-slate-300">
                Data Operacional
                <input
                  className={inputClass}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <div className="text-xs text-slate-400 sm:text-right pt-2 sm:pt-0">
                Identificação nativa para Mercado Livre, TikTok Shop, SHEIN e Shopee.
              </div>
            </div>

            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-emerald-700/60 bg-slate-950/60 p-6 text-center hover:border-emerald-500 hover:bg-slate-950/80 transition">
              <Upload className="h-8 w-8 text-emerald-400" />
              <span className="mt-2 font-semibold text-white">
                Selecionar arquivos de etiquetas
              </span>
              <span className="mt-1 text-xs text-slate-400">
                Formatos aceitos: PDF (térmico ou A4), JPG, PNG e WEBP
              </span>
              <input
                className="sr-only"
                type="file"
                multiple
                accept="application/pdf,image/*,.pdf"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
            </label>

            {files.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                <div className="text-xs font-semibold text-slate-400 px-1 pb-1">
                  {files.length} arquivo(s) selecionado(s):
                </div>
                {files.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300"
                  >
                    <span className="truncate pr-2">{f.name}</span>
                    <span className="font-mono text-slate-400 shrink-0">
                      {(f.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={busy || !files.length}
              onClick={() => void processFiles()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-3.5 font-semibold text-white transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {busy ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <ScanLine className="h-5 w-5" />
              )}
              <span>
                {busy
                  ? progress || 'Processando etiquetas...'
                  : `Ler etiquetas automaticamente (${files.length} arquivo(s))`}
              </span>
            </button>
          </section>

          {/* Seção 2: Cards com os 4 Marketplaces + Total Geral */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {PLATFORMS.map((plat) => {
              const style = platformCardStyles[plat];
              const count = summary.counts[plat] || 0;
              return (
                <div
                  key={plat}
                  className={`rounded-xl border p-4 transition ${style.border} ${style.bg} ${style.text}`}
                >
                  <div className="text-xs font-medium uppercase tracking-wider">{plat}</div>
                  <div className="mt-1 text-2xl sm:text-3xl font-bold font-mono tracking-tight">
                    {count}
                  </div>
                  <div className="text-[11px] opacity-75 mt-0.5">pedidos únicos</div>
                </div>
              );
            })}

            <div className="col-span-2 sm:col-span-1 rounded-xl border border-emerald-800/80 bg-emerald-950/30 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Total Geral
              </div>
              <div className="mt-1 text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white">
                {summary.totalUniqueOrders}
              </div>
              <div className="text-[11px] text-emerald-300/80 mt-0.5">pedidos confirmados</div>
            </div>
          </section>

          {/* Seção 3: Relatório Pronto e Ações Rápidas */}
          {labels.length > 0 && (
            <section className="rounded-2xl border border-slate-800 bg-[#121824] p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Relatório Concluído ({summary.totalUniqueOrders} pedidos únicos)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Data: <span className="text-white font-medium">{formatBrDate(date)}</span> •{' '}
                    {summary.realPendingCount > 0 ? (
                      <span className="text-amber-400 font-semibold">
                        {summary.realPendingCount} pendência(s) de conferência
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-medium">100% das etiquetas reconhecidas</span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportPdf()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer"
                  >
                    <FileDown className="h-4 w-4 text-emerald-400" />
                    <span>Baixar PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void copyToWhatsApp()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-white transition shadow-sm cursor-pointer"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span>{copied ? 'Copiado!' : 'Copiar WhatsApp'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveBatch()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 px-3.5 py-2 text-xs font-semibold text-white transition shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="h-4 w-4" />
                    <span>Salvar no Histórico</span>
                  </button>
                </div>
              </div>

              {/* Painel Interativo de Resolução Imediata de Pendências */}
              {summary.realPendingCount > 0 && (
                <div className="rounded-xl border border-amber-900/70 bg-amber-950/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                    <span>{summary.realPendingCount} etiqueta(s) pendente(s) de conferência</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    O sistema detectou páginas onde o logotipo é imagem ou a identificação precisa de confirmação. Você pode confirmá-las com 1 clique abaixo:
                  </p>
                  <div className="space-y-2">
                    {summary.items
                      .filter((it) => it.confidence === 'Revisar' && !it.duplicate)
                      .map((it) => (
                        <div
                          key={it.id}
                          className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="text-slate-200 font-medium">
                              Página #{it.page} ({it.file})
                            </div>
                            <div className="text-amber-400 text-[11px] mt-0.5">
                              Motivo: {it.pendingReason || 'Pendente de conferência'}
                            </div>
                            {it.orderNumber && (
                              <div className="text-emerald-400 font-mono text-[11px] mt-0.5">
                                Identificador extraído: {it.orderNumber}
                              </div>
                            )}
                            {it.rawSnippet && (
                              <div className="text-slate-400 font-mono text-[11px] mt-1 truncate max-w-md">
                                Trecho: {it.rawSnippet}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <span className="text-[11px] text-slate-400 mr-1">Confirmar como:</span>
                            <button
                              type="button"
                              onClick={() => handleResolvePending(it.id, 'SHEIN')}
                              className="px-2.5 py-1 rounded bg-rose-950/80 border border-rose-700/60 text-rose-300 hover:bg-rose-900 font-medium cursor-pointer transition"
                            >
                              SHEIN
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolvePending(it.id, 'Shopee')}
                              className="px-2.5 py-1 rounded bg-amber-950/80 border border-amber-700/60 text-amber-300 hover:bg-amber-900 font-medium cursor-pointer transition"
                            >
                              Shopee
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolvePending(it.id, 'TikTok Shop')}
                              className="px-2.5 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700 font-medium cursor-pointer transition"
                            >
                              TikTok Shop
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolvePending(it.id, 'Mercado Livre')}
                              className="px-2.5 py-1 rounded bg-yellow-950/80 border border-yellow-700/60 text-yellow-300 hover:bg-yellow-900 font-medium cursor-pointer transition"
                            >
                              Mercado Livre
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Prévia da Mensagem Oficial WhatsApp */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-2">
                  <span>Prévia da mensagem pronta para envio no WhatsApp</span>
                  <span className="text-[11px] text-slate-500">Texto formatado</span>
                </div>
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-200 select-all p-3 rounded-lg bg-[#0B0F19] border border-slate-800/80">
                  {reportText}
                </pre>
              </div>

              {/* Painel Interno de Diagnóstico Opcional (não polui a tela do usuário) */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowDiagnostics((prev) => !prev)}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-300 transition"
                >
                  {showDiagnostics ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {showDiagnostics
                      ? 'Ocultar diagnóstico detalhado da leitura'
                      : `Ver diagnóstico detalhado da leitura (${summary.items.length} itens analisados)`}
                  </span>
                </button>

                {showDiagnostics && (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3 max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[11px] uppercase text-slate-500 border-b border-slate-800">
                        <tr>
                          <th className="p-2">Pág.</th>
                          <th className="p-2">Arquivo</th>
                          <th className="p-2">Marketplace</th>
                          <th className="p-2">Identificador</th>
                          <th className="p-2">Status / Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.items.map((item, idx) => (
                          <tr
                            key={item.id || idx}
                            className="border-b border-slate-900 hover:bg-slate-900/40"
                          >
                            <td className="p-2 text-slate-400 font-mono">#{item.page}</td>
                            <td className="p-2 max-w-44 truncate text-slate-300" title={item.file}>
                              {item.file}
                            </td>
                            <td className="p-2 font-medium text-white">
                              {item.platform || (
                                <span className="text-amber-400">Não identificada</span>
                              )}
                            </td>
                            <td className="p-2 font-mono text-emerald-300">
                              {item.orderNumber || <span className="text-slate-500">—</span>}
                            </td>
                            <td className="p-2">
                              {item.duplicate ? (
                                <span className="text-amber-400">Duplicata descartada</span>
                              ) : item.confidence === 'Detectado' ? (
                                <span className="text-emerald-400">Confirmado</span>
                              ) : (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-amber-400 mr-1">
                                    {item.pendingReason || 'Pendente'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleResolvePending(item.id, 'SHEIN')}
                                    className="px-1.5 py-0.5 text-[10px] rounded bg-rose-950 border border-rose-700/60 text-rose-300 hover:bg-rose-900"
                                  >
                                    + SHEIN
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResolvePending(item.id, 'Shopee')}
                                    className="px-1.5 py-0.5 text-[10px] rounded bg-amber-950 border border-amber-700/60 text-amber-300 hover:bg-amber-900"
                                  >
                                    + Shopee
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        /* Seção Histórico de Lotes Salvos */
        <section className="rounded-2xl border border-slate-800 bg-[#121824] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Histórico de Lotes</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Relatórios salvos no banco e localmente por data operacional.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadHistory()}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition"
            >
              Atualizar
            </button>
          </div>

          {/* Totais consolidados por data */}
          {Object.keys(dailyTotals).length > 0 && (
            <div className="space-y-2 pt-1">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Totais Diários Únicos (sem duplicar pedidos entre lotes)
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(dailyTotals)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .map(([d, c]) => {
                    const dayTotal = Object.values(c).reduce<number>((a, b) => a + Number(b), 0);
                    return (
                      <div
                        key={d}
                        className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-3.5 space-y-2"
                      >
                        <div className="flex items-center justify-between text-sm font-semibold text-white">
                          <span>{formatBrDate(d)}</span>
                          <span className="text-emerald-400 font-mono">{dayTotal} pedido(s)</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {PLATFORMS.map((p) => (
                            <span
                              key={p}
                              className="rounded-md border border-slate-800 bg-slate-900/80 px-2 py-0.5 text-[11px] text-slate-300"
                            >
                              {p}: <strong className="text-white">{c[p] || 0}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {history.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Nenhum lote salvo no histórico.
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Lotes Registrados
              </h3>
              {history.map((batch) => (
                <article
                  key={batch.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3 hover:border-slate-700 transition"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white text-sm">
                        {formatBrDate(batch.operational_date)} •{' '}
                        <span className="text-emerald-400 font-mono font-bold">
                          {batch.total_orders} pedido(s) único(s)
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {new Date(batch.created_at).toLocaleString('pt-BR')} • {batch.pending_count || 0}{' '}
                        pendência(s)
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => exportPdf(batch)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                    >
                      <FileDown className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Baixar PDF</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {PLATFORMS.map((p) => (
                      <span
                        key={p}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300"
                      >
                        {p}: <strong className="text-white">{batch.counts?.[p] || 0}</strong>
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Modal de Confirmação para Limpar Sessão */}
      {showConfirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="text-lg font-bold text-white">Limpar lista da sessão?</h3>
            </div>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Tem certeza que deseja limpar a lista atual da tela? Os pedidos da sessão atual serão
              descartados da visualização. O histórico de lotes salvos no sistema{' '}
              <strong className="text-emerald-400">NÃO</strong> será apagado.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmClear(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeClearSession}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 transition shadow-lg shadow-red-600/30 cursor-pointer"
              >
                Sim, limpar lista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
