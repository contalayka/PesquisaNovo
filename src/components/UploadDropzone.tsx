import React, { useRef, useState } from 'react';
import { UploadCloud, FileSpreadsheet, Download, CheckCircle2, ArrowRight, ShieldCheck, Plus } from 'lucide-react';

interface UploadDropzoneProps {
  onFileSelect: (file: File) => void;
  onDownloadTemplate: () => void;
  onOpenAddProduct?: () => void;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onFileSelect,
  onDownloadTemplate,
  onOpenAddProduct,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
    if (e.target) e.target.value = '';
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-extrabold text-white tracking-tight">
          Importe o catálogo de produtos da sua loja
        </h2>
        <p className="text-sm text-slate-400 mt-2 max-w-lg mx-auto">
          Carregue o arquivo CSV ou XLSX com seus produtos para pesquisar anúncios equivalentes na Shopee, TikTok Shop e SHEIN, salvar links no UpSeller e simular preços.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Drop area */}
      <div
        id="dropzone-area"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-950/40 scale-[1.01]'
            : 'border-[#0D2038] bg-[#071426] hover:border-blue-500/60 hover:bg-[#0A1930] shadow-xl'
        }`}
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-950/60 border border-blue-800/60 text-blue-400 flex items-center justify-center">
          <UploadCloud className="w-8 h-8" />
        </div>

        <h3 className="text-base font-bold text-slate-100">
          Clique para selecionar ou arraste sua planilha aqui
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Suporta arquivos Excel (.xlsx, .xls) e CSV (.csv)
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-xs transition">
            <span>Selecionar Arquivo</span>
            <ArrowRight className="w-4 h-4" />
          </div>

          {onOpenAddProduct && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenAddProduct();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#0D2038] bg-[#050B16] hover:bg-[#0A1930] text-slate-200 text-sm font-bold shadow-xs transition"
            >
              <Plus className="w-4 h-4 text-blue-400" />
              <span>Cadastrar Produto Manualmente</span>
            </button>
          )}
        </div>
      </div>

      {/* Guide / Instructions */}
      <div className="mt-8 rounded-2xl bg-[#071426] border border-[#0D2038] p-6 shadow-lg">
        <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Estrutura sugerida das colunas da planilha:</span>
        </h3>

        <dl className="divide-y divide-[#0D2038] text-xs">
          <div className="py-2.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
            <dt className="font-semibold text-slate-200">
              Nome ou Título do Produto <span className="text-rose-400 font-normal">*obrigatório</span>
            </dt>
            <dd className="text-slate-400">
              Usado para pesquisar diretamente nos marketplaces
            </dd>
          </div>

          <div className="py-2.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
            <dt className="font-semibold text-slate-200">
              Custo ou Preço de Custo
            </dt>
            <dd className="text-slate-400">
              Valor unitário do item (ex: 29.90 ou R$ 29,90)
            </dd>
          </div>

          <div className="py-2.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
            <dt className="font-semibold text-slate-200">
              Imagem, Foto ou Link da Imagem
            </dt>
            <dd className="text-slate-400">
              URL da foto para acionar a busca visual por imagem
            </dd>
          </div>
        </dl>

        <div className="mt-4 pt-3 border-t border-[#0D2038] flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Deseja um arquivo de exemplo pré-preenchido?
          </span>
          <button
            type="button"
            id="btn-download-empty-template"
            onClick={(e) => {
              e.stopPropagation();
              onDownloadTemplate();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 hover:underline"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Baixar planilha modelo (.xlsx)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
