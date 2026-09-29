import React, { useState, useMemo } from 'react';
import { ColumnDetectionResult, formatCurrency, resolveImageUrl } from '../utils/excel';
import { ProductImage } from './ProductImage';
import { Check, Columns3, AlertCircle, X, ShieldCheck, Image as ImageIcon, AlertTriangle, Sparkles } from 'lucide-react';

interface ColumnMapperModalProps {
  detection: ColumnDetectionResult;
  onConfirm: (
    nameCol: string,
    costCol: string,
    imageCol: string,
    availableCol?: string,
    idCol?: string,
    statusCol?: string
  ) => void;
  onCancel: () => void;
}

export const ColumnMapperModal: React.FC<ColumnMapperModalProps> = ({
  detection,
  onConfirm,
  onCancel,
}) => {
  const [nameCol, setNameCol] = useState(detection.suggestedNameCol || '');
  const [costCol, setCostCol] = useState(detection.suggestedCostCol || '');
  const [imageCol, setImageCol] = useState(detection.suggestedImageCol || '');
  const [idCol, setIdCol] = useState(detection.suggestedIdCol || '');
  const [availableCol, setAvailableCol] = useState(detection.suggestedAvailableCol || '');
  const [statusCol, setStatusCol] = useState(detection.suggestedStatusCol || '');

  // Precompute sample value for each header to display in dropdown options
  const samplesByHeader = useMemo(() => {
    const map = new Map<string, string>();
    detection.headers.forEach((h) => {
      for (const row of detection.rows) {
        const val = row[h];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          const s = String(val).trim();
          map.set(h, s.length > 25 ? `${s.slice(0, 25)}...` : s);
          break;
        }
      }
    });
    return map;
  }, [detection]);

  // Check if selected name column looks like a numeric code instead of a product description
  const nameLooksLikeCode = useMemo(() => {
    if (!nameCol) return false;
    let numericCount = 0;
    let checkedCount = 0;
    for (const row of detection.rows.slice(0, 15)) {
      const v = row[nameCol];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        checkedCount++;
        const s = String(v).trim();
        if (/^\d+$/.test(s) || s.length < 5) {
          numericCount++;
        }
      }
    }
    return checkedCount > 0 && numericCount / checkedCount > 0.6;
  }, [nameCol, detection.rows]);

  const previewRows = detection.rows.slice(0, 3);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameCol) {
      alert('Por favor, selecione a coluna com o Nome do produto.');
      return;
    }
    onConfirm(nameCol, costCol, imageCol, availableCol, idCol, statusCol);
  };

  return (
    <div
      id="column-mapper-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div
        id="column-mapper-modal"
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] my-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Columns3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Confirmar Dados da Planilha
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {detection.headers.length} colunas detectadas • {detection.rows.length} produtos encontrados
                {detection.extractedImagesCount && detection.extractedImagesCount > 0 ? (
                  <span className="ml-2 font-bold text-emerald-600 dark:text-emerald-400">
                    • {detection.extractedImagesCount} fotos extraídas
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <button
            id="close-mapper-btn"
            onClick={onCancel}
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {/* Badge if embedded images were extracted */}
          {detection.extractedImagesCount && detection.extractedImagesCount > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-2.5">
              <ImageIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold">
                  {detection.extractedImagesCount} foto{detection.extractedImagesCount > 1 ? 's' : ''} encontrada{detection.extractedImagesCount > 1 ? 's' : ''} e extraída{detection.extractedImagesCount > 1 ? 's' : ''} da planilha!
                </p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                  As imagens embutidas foram convertidas e vinculadas automaticamente aos respectivos produtos.
                </p>
              </div>
            </div>
          )}

          {/* Warning if Name selected looks like code */}
          {nameLooksLikeCode && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Atenção: A coluna selecionada para Nome parece conter Códigos ou Números!</p>
                <p className="text-[11px] mt-0.5 text-amber-800 dark:text-amber-300">
                  Para que a pesquisa de produtos na Shopee, TikTok Shop e SHEIN funcione pelo nome do produto, certifique-se de escolher a coluna com a <strong>descrição/nome textual</strong> do produto, e coloque o código na coluna &quot;Código / ID&quot;.
                </p>
              </div>
            </div>
          )}

          {/* Callout */}
          <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 text-xs text-indigo-900 dark:text-indigo-300 space-y-1">
            <p className="font-semibold flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              Importação Segura e Preservação de Dados:
            </p>
            <p className="text-[11px] leading-relaxed">
              • O sistema extrai automaticamente imagens de URLs, links do Google Drive e hiperlinks do Excel.<br />
              • Produtos que você já pesquisou mantêm todas as opções e anotações salvas.<br />
              • Itens duplicados com custos ou fotos distintas são preservados individualmente.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Nome Coluna (Obrigatório) */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Coluna do Nome do Produto <span className="text-rose-500">*</span>
              </label>
              <select
                id="select-name-column"
                value={nameCol}
                onChange={(e) => setNameCol(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">Selecione a coluna com o Nome do Produto...</option>
                {detection.headers.map((h) => {
                  const sample = samplesByHeader.get(h);
                  return (
                    <option key={h} value={h}>
                      {h} {sample ? `(Ex: "${sample}")` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Custo Coluna */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Coluna do Preço de Custo
              </label>
              <select
                id="select-cost-column"
                value={costCol}
                onChange={(e) => setCostCol(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">(Nenhuma coluna de custo)</option>
                {detection.headers.map((h) => {
                  const sample = samplesByHeader.get(h);
                  return (
                    <option key={h} value={h}>
                      {h} {sample ? `(Ex: "${sample}")` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Imagem Coluna */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Coluna da Imagem / Foto (Link)
              </label>
              <select
                id="select-image-column"
                value={imageCol}
                onChange={(e) => setImageCol(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">(Nenhuma coluna de imagem)</option>
                {detection.headers.map((h) => {
                  const sample = samplesByHeader.get(h);
                  return (
                    <option key={h} value={h}>
                      {h} {sample ? `(Ex: "${sample}")` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* ID / Código Coluna */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Coluna do Código / ID (Opcional)
              </label>
              <select
                id="select-id-column"
                value={idCol}
                onChange={(e) => setIdCol(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">(Gerar ID automaticamente)</option>
                {detection.headers.map((h) => {
                  const sample = samplesByHeader.get(h);
                  return (
                    <option key={h} value={h}>
                      {h} {sample ? `(Ex: "${sample}")` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Disponibilidade Coluna */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Coluna de Disponibilidade (Opcional)
              </label>
              <select
                id="select-available-column"
                value={availableCol}
                onChange={(e) => setAvailableCol(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">(Todos disponíveis por padrão)</option>
                {detection.headers.map((h) => {
                  const sample = samplesByHeader.get(h);
                  return (
                    <option key={h} value={h}>
                      {h} {sample ? `(Ex: "${sample}")` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Visual Live Preview of mapped products */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 p-3.5">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5">
              <AlertCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Prévia visual de como os produtos serão importados:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              {previewRows.map((r, i) => {
                const pName = String(r[nameCol] || '(sem nome)');
                const pCost = r[costCol] !== undefined && r[costCol] !== '' ? formatCurrency(r[costCol] as string | number) : '-';
                const rawImg = imageCol ? r[imageCol] : '';
                const pImg = resolveImageUrl(rawImg, r, pName);
                const pId = idCol ? String(r[idCol] || '') : '';

                return (
                  <div
                    key={i}
                    className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-12 h-12 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center">
                        <ProductImage
                          src={pImg}
                          alt={pName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        {pId && (
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 block truncate">
                            Cód: {pId}
                          </span>
                        )}
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-xs line-clamp-2 leading-tight">
                          {pName}
                        </span>
                      </div>
                    </div>
                    <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Custo:</span>
                      <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{pCost}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              id="cancel-mapping-btn"
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              id="confirm-import-btn"
              type="submit"
              className="inline-flex items-center space-x-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition"
            >
              <Check className="w-4 h-4" />
              <span>Importar {detection.rows.length} Produtos</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
