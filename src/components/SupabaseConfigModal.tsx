import React,{useState} from 'react';
import {Database,CheckCircle2,AlertCircle,X,RefreshCw,Cloud} from 'lucide-react';
import {testSupabaseConnection} from '../utils/supabase';
interface Props {isOpen:boolean;onClose:()=>void;onConnectionSuccess:()=>void;}
export const SupabaseConfigModal:React.FC<Props>=({isOpen,onClose,onConnectionSuccess})=>{
 const [testing,setTesting]=useState(false);
 const [result,setResult]=useState<{success:boolean;message:string}|null>(null);
 if(!isOpen)return null;
 const test=async()=>{setTesting(true);setResult(null);const r=await testSupabaseConnection();setResult(r);setTesting(false);if(r.success)onConnectionSuccess();};
 return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
  <section className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl">
   <header className="flex items-center justify-between border-b border-slate-700 pb-4">
    <div className="flex items-center gap-3"><div className="rounded-xl bg-orange-500/15 p-3 text-orange-300"><Cloud size={22}/></div><div><h2 className="font-bold text-lg">Armazenamento Cloudflare</h2><p className="text-xs text-slate-400">Cloudflare Pages + D1</p></div></div>
    <button onClick={onClose} aria-label="Fechar"><X/></button>
   </header>
   <div className="space-y-4 py-5 text-sm">
    <p>O catálogo, as pesquisas e as alterações são armazenados no banco Cloudflare D1 e sincronizados entre os dispositivos pela API do próprio Pages.</p>
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200"><Database className="mb-2" size={20}/>Banco vinculado: <strong>marketpreco_catalog</strong><br/>Binding: <strong>DB</strong></div>
    {result&&<div className={result.success?'text-emerald-300':'text-rose-300'}>{result.success?<CheckCircle2 className="inline mr-2"/>:<AlertCircle className="inline mr-2"/>}{result.message}</div>}
   </div>
   <footer className="flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2">Fechar</button><button disabled={testing} onClick={test} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"><RefreshCw size={16} className={testing?'animate-spin':''}/>{testing?'Verificando...':'Testar Cloudflare'}</button></footer>
  </section>
 </div>;
};
