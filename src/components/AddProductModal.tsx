import React, { useState } from 'react';
import { Product, ResearchRecord, ConfidenceLevel } from '../types';
import { parseNumber } from '../utils/excel';
import { X, Plus, Link as LinkIcon, Package } from 'lucide-react';

interface AddProductModalProps {
  onClose: () => void;
  onAddProduct: (product: Product) => void;
}

const COMMON_PLATFORMS = ['Shopee', 'TikTok Shop', 'SHEIN', 'UpSeller', 'Outro'];

export const AddProductModal: React.FC<AddProductModalProps> = ({ onClose, onAddProduct }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [cost, setCost] = useState('');
  const [image, setImage] = useState('');
  const [available, setAvailable] = useState(true);

  // Optional initial research link
  const [adLink, setAdLink] = useState('');
  const [adPrice, setAdPrice] = useState('');
  const [adPlatform, setAdPlatform] = useState('Shopee');
  const [adConfidence] = useState<ConfidenceLevel>('Alta');
  const [adNote] = useState('');

  const [imageError, setImageError] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-detect marketplace when pasting link
  const handleLinkChange = (value: string) => {
    setAdLink(value);
    const lower = value.toLowerCase();
    if (lower.includes('shopee')) {
      setAdPlatform('Shopee');
    } else if (lower.includes('shein')) {
      setAdPlatform('SHEIN');
    } else if (lower.includes('tiktok')) {
      setAdPlatform('TikTok Shop');
    } else if (lower.includes('upseller')) {
      setAdPlatform('UpSeller');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg('O nome do produto é obrigatório.');
      return;
    }

    const parsedCost = parseNumber(cost);
    if (parsedCost === '' || isNaN(Number(parsedCost))) {
      setErrorMsg('Informe um valor de custo válido (ex: 29.90 ou 29,90).');
      return;
    }

    const prodId = code.trim() ? code.trim() : `prod_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Normalize ad link if provided
    let cleanAdLink = adLink.trim();
    if (cleanAdLink && !cleanAdLink.startsWith('http://') && !cleanAdLink.startsWith('https://')) {
      cleanAdLink = `https://${cleanAdLink}`;
    }

    const researchRecords: ResearchRecord[] = [];
    if (cleanAdLink || adPrice) {
      const parsedAdPrice = parseNumber(adPrice);
      researchRecords.push({
        id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        product_id: prodId,
        found_name: cleanName,
        platform: adPlatform,
        store: '',
        price: parsedAdPrice,
        url: cleanAdLink,
        confidence: adConfidence,
        note: adNote.trim(),
        researched_at: new Date().toISOString(),
      });
    }

    const newProduct: Product = {
      id: prodId,
      name: cleanName,
      cost: parsedCost,
      available,
      image: image.trim(),
      status: researchRecords.length > 0 ? 'Encontrado' : 'Pendente',
      is_new: true,
      sku: code.trim() || undefined,
      research_records: researchRecords,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    onAddProduct(newProduct);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-xl bg-[#0F172A] shadow-2xl border border-slate-800 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-[#0B0F19]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Adicionar Novo Produto
              </h3>
              <p className="text-[11px] text-slate-400">
                Cadastre o item e vincule o link do anúncio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nome do Produto <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Fita Adesiva Transparente 45mm x 100m"
              className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-[#121824] text-white text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Código e Custo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Código / SKU / Ref (Opcional)
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ex: SKU-1049"
                className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-[#121824] text-white text-xs font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Custo de Tabela (R$) <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs text-slate-400">R$</span>
                <input
                  type="text"
                  required
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="24.90"
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-800 bg-[#121824] text-white text-xs font-bold font-mono tabular-nums focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Imagem URL e Preview */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              URL da Imagem (Opcional)
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={image}
                onChange={(e) => {
                  setImage(e.target.value);
                  setImageError(false);
                }}
                placeholder="https://exemplo.com/foto.jpg"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-800 bg-[#121824] text-white text-xs focus:border-indigo-500 focus:outline-none"
              />
              {image && !imageError && (
                <div className="w-8 h-8 rounded-lg border border-slate-800 overflow-hidden shrink-0 bg-[#121824] flex items-center justify-center">
                  <img
                    src={image}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setImageError(true)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Disponibilidade */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="product-available-check"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded border-slate-700 bg-slate-800 focus:ring-indigo-500 cursor-pointer"
            />
            <label htmlFor="product-available-check" className="text-xs font-medium text-slate-300 cursor-pointer select-none">
              Item Disponível em Estoque
            </label>
          </div>

          {/* Link do Anúncio (Opcional - já salva junto!) */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400">
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Link do Anúncio Concorrente (Opcional)</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                URL do Anúncio (Shopee, TikTok Shop, SHEIN, etc.)
              </label>
              <input
                type="text"
                value={adLink}
                onChange={(e) => handleLinkChange(e.target.value)}
                placeholder="Cole o link aqui (ex: https://shopee.com.br/...)"
                className="w-full px-3 py-2 rounded-lg border border-slate-800 bg-[#121824] text-white text-xs font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {adLink.trim() && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-[#121824] border border-slate-800 animate-in fade-in">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Plataforma
                  </label>
                  <select
                    value={adPlatform}
                    onChange={(e) => setAdPlatform(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-white text-xs focus:border-indigo-500 focus:outline-none cursor-pointer"
                  >
                    {COMMON_PLATFORMS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Preço Encontrado (R$)
                  </label>
                  <input
                    type="text"
                    value={adPrice}
                    onChange={(e) => setAdPrice(e.target.value)}
                    placeholder="Ex: 49.90"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-white text-xs font-bold tabular-nums focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Salvar Produto</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
