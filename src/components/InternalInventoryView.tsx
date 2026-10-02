import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Database, FileSpreadsheet, Image as ImageIcon, Search, Upload, X, RefreshCw, ExternalLink } from 'lucide-react';
import { getSupabaseClient } from '../utils/supabase';

type InternalItem = {
  id: string;
  source_key: string;
  product_name: string;
  stock: number;
  unit: string | null;
  status: string | null;
  cost: number | null;
  total_value: number | null;
  image_url: string | null;
  source_row: number | null;
};

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const num = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').trim().replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const keyFor = (r: Record<string, unknown>, row: number) => {
  const findVal = (patterns: string[]) => {
    for (const k of Object.keys(r)) {
      const nk = norm(k);
      if (patterns.some(p => nk === p || nk.includes(p))) {
        const v = r[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
      }
    }
    return null;
  };
  const img = findVal(['foto (url)', 'foto', 'imagem', 'image', 'url foto', 'foto url']) ?? r['Foto (URL)'];
  return [norm(r['Nome']), num(r['Estoque Atual']), norm(r['Unidade']), norm(r['Status']), num(r['Preço Custo (R$)']), num(r['Valor Total (R$)']), String(img ?? '').trim(), row].join('|');
};

export const InternalInventoryView: React.FC = () => {
  const [items, setItems] = useState<InternalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Ativo' | 'Inativo'>('all');
  const [error, setError] = useState('');
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = getSupabaseClient();

  const load = async () => {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    const pageSize = 1000;
    const all: InternalItem[] = [];
    let from = 0;
    let loadError = false;
    while (true) {
      const { data, error: e } = await supabase
        .from('internal_inventory')
        .select('*')
        .order('product_name', { ascending: true })
        .range(from, from + pageSize - 1);
      if (e) {
        setError(e.message);
        loadError = true;
        break;
      }
      const page = (data || []) as InternalItem[];
      all.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    if (!loadError) setItems(all);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const stats = useMemo(() => {
    const active = items.filter(i => norm(i.status) === 'ativo').length;
    const inactive = items.filter(i => norm(i.status) === 'inativo').length;
    const withCost = items.filter(i => i.cost !== null && Number(i.cost) !== 0).length;
    const blankCost = items.filter(i => i.cost === null).length;
    const stock = items.reduce((s, i) => s + (Number(i.stock) || 0), 0);
    const value = items.reduce((s, i) => s + (Number(i.total_value) || 0), 0);
    return { active, inactive, withCost, blankCost, stock, value };
  }, [items]);

  const filtered = useMemo(() => {
    const q = norm(query);
    return items.filter(i => (!q || norm(i.product_name).includes(q)) && (statusFilter === 'all' || i.status === statusFilter));
  }, [items, query, statusFilter]);

  const importFile = async (file: File) => {
    setError('');
    setImporting(true);
    try {
      if (!supabase) throw new Error('Supabase não configurado.');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      const valid = rows.filter(r => norm(r['Nome']) && norm(r['Nome']) !== 'total geral');
      if (valid.length === 0) throw new Error('Nenhum produto válido foi encontrado na planilha.');

      const payload = valid.map((r, index) => {
        const findVal = (patterns: string[]) => {
          for (const k of Object.keys(r)) {
            const nk = norm(k);
            if (patterns.some(p => nk === p || nk.includes(p))) {
              const v = r[k];
              if (v !== undefined && v !== null && String(v).trim() !== '') return v;
            }
          }
          return null;
        };
        const rawImg = findVal(['foto (url)', 'foto', 'imagem', 'image', 'url foto', 'foto url', 'link foto']) ?? r['Foto (URL)'];

        return {
          source_key: keyFor(r, index + 2),
          product_name: String(r['Nome'] ?? '').trim(),
          stock: num(r['Estoque Atual']),
          unit: r['Unidade'] == null ? null : String(r['Unidade']).trim(),
          status: r['Status'] == null ? null : String(r['Status']).trim(),
          cost: r['Preço Custo (R$)'] == null || r['Preço Custo (R$)'] === '' ? null : num(r['Preço Custo (R$)']),
          total_value: r['Valor Total (R$)'] == null || r['Valor Total (R$)'] === '' ? null : num(r['Preço Custo (R$)'] && r['Estoque Atual'] ? num(r['Preço Custo (R$)']) * num(r['Estoque Atual']) : (r['Valor Total (R$)'] ? num(r['Valor Total (R$)']) : null)),
          image_url: rawImg == null ? null : String(rawImg).trim(),
          source_row: index + 2,
          updated_at: new Date().toISOString(),
        };
      });

      const { error: delError } = await supabase.from('internal_inventory').delete().not('id', 'is', null);
      if (delError) throw delError;
      for (let i = 0; i < payload.length; i += 200) {
        const { error: insertError } = await supabase.from('internal_inventory').insert(payload.slice(i, i + 200));
        if (insertError) throw insertError;
      }
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao importar a base interna.');
    } finally {
      setImporting(false);
    }
  };

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const activePct = items.length > 0 ? Math.round((stats.active / items.length) * 100) : 0;
  const inactivePct = items.length > 0 ? 100 - activePct : 0;

  return (
    <section className="space-y-4 pb-6">
      {/* 1. Module Header */}
      <div className="rounded-xl border border-slate-800 bg-[#121824] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider flex-wrap">
              <Database className="h-3.5 w-3.5 text-blue-400" />
              <span>Base Independente</span>
              <span className="text-[10px] text-emerald-300 bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 rounded-full font-mono font-normal">
                v2.4.1 • Fotos 80px & Zoom Ativo
              </span>
            </div>
            <h1 className="mt-1 text-xl sm:text-2xl font-bold text-white tracking-tight">
              Estoque & Custo Interno
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Base interna de consulta e conferência de custos, separada do catálogo principal de precificação.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-semibold text-white transition disabled:opacity-50 shadow-xs"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{importing ? 'Importando...' : 'Importar Planilha XLSX'}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.currentTarget.value = '';
              }}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-950/20 px-4 py-2.5 text-xs text-rose-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* 2. Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[
          { label: 'Total de Itens', value: items.length.toLocaleString('pt-BR'), color: 'text-white' },
          { label: 'Itens Ativos', value: stats.active.toLocaleString('pt-BR'), color: 'text-emerald-400' },
          { label: 'Itens Inativos', value: stats.inactive.toLocaleString('pt-BR'), color: 'text-slate-400' },
          { label: 'Volume em Estoque', value: stats.stock.toLocaleString('pt-BR'), color: 'text-slate-200' },
          { label: 'Valor Total do Estoque', value: fmt(stats.value), color: 'text-emerald-400' },
          { label: 'Com Custo Informado', value: stats.withCost.toLocaleString('pt-BR'), color: 'text-blue-400' },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-slate-800 bg-[#121824] p-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
              {m.label}
            </div>
            <div className={`mt-1 text-base sm:text-lg font-bold font-mono tabular-nums ${m.color}`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Compact Status Bar (User asked: "diminua esse grafico, esta feio") */}
      {items.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-[#121824] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 text-slate-300">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Distribuição:
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-emerald-300 font-semibold">{stats.active} ativos</span>
              <span className="text-slate-500">({activePct}%)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-slate-400 font-semibold">{stats.inactive} inativos</span>
              <span className="text-slate-500">({inactivePct}%)</span>
            </span>
          </div>

          <div className="w-full sm:w-48 h-2 rounded-full bg-slate-800 overflow-hidden flex">
            <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${activePct}%` }} />
            <div className="bg-slate-600 h-full transition-all duration-300" style={{ width: `${inactivePct}%` }} />
          </div>
        </div>
      )}

      {/* 4. Table & Search Controls */}
      <div className="rounded-xl border border-slate-800 bg-[#121824] overflow-hidden">
        <div className="p-3.5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar por nome do produto..."
                className="w-full sm:w-72 rounded-lg border border-slate-700 bg-slate-900 py-1.5 pl-8.5 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <span className="text-xs text-slate-400 font-mono tabular-nums hidden sm:inline">
              {filtered.length} registro(s)
            </span>
          </div>

          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Ativo')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                statusFilter === 'Ativo'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Ativos ({stats.active})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Inativo')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${
                statusFilter === 'Inativo'
                  ? 'bg-slate-800 text-slate-300 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Inativos ({stats.inactive})
            </button>
          </div>
        </div>

        <div className="max-h-[600px] overflow-auto">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-500">
              Carregando registros de estoque interno...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 space-y-1">
              <FileSpreadsheet className="mx-auto h-7 w-7 text-slate-600 mb-2" />
              <p className="font-semibold text-slate-400">Nenhum registro encontrado.</p>
              <p>Importe sua planilha XLSX com as colunas Nome, Estoque Atual, Preço Custo, etc.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#0e1320] text-[10px] uppercase tracking-wider font-semibold text-slate-400 border-b border-slate-800 z-10">
                <tr>
                  <th className="p-3 w-24 text-center">Foto</th>
                  <th className="p-3">Produto</th>
                  <th className="p-3 text-center whitespace-nowrap">Pesquisa por Imagem</th>
                  <th className="p-3 font-mono">Estoque</th>
                  <th className="p-3 font-mono">Custo Unitário</th>
                  <th className="p-3 font-mono">Valor Total</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-2.5 text-center align-middle">
                      <div className="relative group inline-flex items-center justify-center">
                        <div
                          onClick={() => {
                            if (i.image_url) {
                              setPreviewImage({ url: i.image_url, name: i.product_name });
                            }
                          }}
                          title={i.image_url ? 'Passe o mouse para zoom ou clique para ampliar' : undefined}
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-900 border border-slate-700/70 overflow-hidden flex items-center justify-center shadow-md transition-all duration-300 ease-out group-hover:scale-125 group-hover:border-indigo-400 group-hover:shadow-2xl group-hover:z-30 cursor-pointer"
                        >
                          {i.image_url ? (
                            <img
                              src={i.image_url}
                              alt={i.product_name}
                              loading="lazy"
                              className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-slate-600" />
                          )}
                        </div>

                        {/* Card flutuante de alta ampliação ao passar o mouse */}
                        {i.image_url && (
                          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-50 flex flex-col items-center">
                            <div className="w-56 h-56 rounded-2xl bg-slate-950 border-2 border-indigo-500 shadow-2xl overflow-hidden p-1 flex items-center justify-center ring-4 ring-black/80">
                              <img
                                src={i.image_url}
                                alt={i.product_name}
                                className="w-full h-full object-cover rounded-xl"
                              />
                            </div>
                            <span className="mt-1 text-[10px] text-indigo-200 bg-slate-900/95 border border-slate-700 px-2.5 py-0.5 rounded-full shadow-lg whitespace-nowrap font-medium">
                              Zoom • Clique para tela cheia
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-medium text-slate-200">{i.product_name}</td>
                    <td className="p-3 text-center align-middle whitespace-nowrap">
                      <a
                        href={
                          i.image_url
                            ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(i.image_url)}`
                            : `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(i.product_name)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs border border-indigo-400/40 shadow-sm transition hover:scale-[1.02] active:scale-[0.98] group/lens"
                        title={
                          i.image_url
                            ? `Pesquisar "${i.product_name}" no Google Lens por Imagem (abre em nova guia)`
                            : `Buscar "${i.product_name}" no Google Imagens (abre em nova guia)`
                        }
                      >
                        <Search className="w-3.5 h-3.5 text-white group-hover/lens:scale-110 transition-transform" />
                        <span>Google Lens</span>
                        <ExternalLink className="w-3 h-3 text-white/80 group-hover/lens:text-white transition-colors" />
                      </a>
                    </td>
                    <td className="p-3 text-slate-300 font-mono tabular-nums whitespace-nowrap">
                      {Number(i.stock).toLocaleString('pt-BR')} {i.unit || ''}
                    </td>
                    <td className="p-3 font-mono tabular-nums font-semibold text-slate-200 whitespace-nowrap">
                      {i.cost == null ? '—' : fmt(Number(i.cost))}
                    </td>
                    <td className="p-3 font-mono tabular-nums font-semibold text-emerald-400 whitespace-nowrap">
                      {i.total_value == null ? '—' : fmt(Number(i.total_value))}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${
                          norm(i.status) === 'ativo'
                            ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {i.status || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Lightbox de Foto em Alta Resolução */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-lg w-full bg-[#0F172A] border border-slate-700 rounded-2xl overflow-hidden shadow-2xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md">
                {previewImage.name}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full max-h-[70vh] flex items-center justify-center bg-slate-950 rounded-xl overflow-hidden p-2">
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>
            <div className="flex items-center justify-between border-t border-slate-800 pt-3">
              <a
                href={
                  previewImage.url
                    ? `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(previewImage.url)}`
                    : `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(previewImage.name)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-md"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Pesquisar no Google Lens</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
