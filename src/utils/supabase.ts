import { Product, ResearchRecord, ProductStatus, SupabaseConfig } from '../types';

const API = '/api/catalog';
export const SUPABASE_SETUP_SQL = '';
export const SUPABASE_MIGRATION_FIX_BIGINT_SQL = '';
export function getStoredSupabaseConfig(): SupabaseConfig { return { url: 'cloudflare-d1', anonKey: 'managed-by-cloudflare-pages' }; }
export function isSupabaseConfigured(): boolean { return true; }
export function saveStoredSupabaseConfig(_config: SupabaseConfig): void {}
export async function testSupabaseConnection(): Promise<{success:boolean;message:string}> {
  try { const r=await fetch(API,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); const d=await r.json(); return d.success ? {success:true,message:'Catálogo conectado ao Cloudflare D1.'} : {success:false,message:d.error||'Falha no Cloudflare D1.'}; }
  catch(e){ return {success:false,message:e instanceof Error?e.message:'Falha ao conectar ao Cloudflare D1.'}; }
}
async function readCatalog(): Promise<Product[]> {
  const response=await fetch(API,{cache:'no-store'});
  if(!response.ok) throw new Error('Cloudflare D1: falha ao carregar catálogo ('+response.status+').');
  const body=await response.json() as {success:boolean;products?:Product[];error?:string};
  if(!body.success || !Array.isArray(body.products)) throw new Error(body.error||'Resposta inválida do Cloudflare D1.');
  return body.products;
}
async function writeCatalog(products:Product[]):Promise<{error:string|null}> {
  try {
    const response=await fetch(API,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({products})});
    const body=await response.json() as {success:boolean;written?:number;unique?:number;error?:string};
    if(!response.ok || !body.success) return {error:body.error||'Falha ao gravar no Cloudflare D1.'};
    if(body.written!==body.unique || body.unique!==new Map(products.map(p=>[String(p.id),p])).size) return {error:'O Cloudflare D1 não confirmou todos os produtos.'};
    return {error:null};
  } catch(e) { return {error:e instanceof Error?e.message:'Falha ao gravar no Cloudflare D1.'}; }
}
export async function fetchProductsFromSupabase():Promise<{success:boolean;data:Product[];products:Product[];error:string|null}> {
  try { const products=await readCatalog(); return {success:true,data:products,products,error:null}; }
  catch(e){const error=e instanceof Error?e.message:'Falha no Cloudflare D1.';return {success:false,data:[],products:[],error};}
}
export async function upsertProductsToSupabase(products:Product[]):Promise<{error:string|null}> { return writeCatalog(products); }
export async function upsertSingleProduct(product:Product):Promise<{error:string|null}> { return upsertProductsToSupabase([product]); }
export async function pushAllLocalProductsToSupabase(products:Product[]):Promise<{count:number;error:string|null}> { const {error}=await writeCatalog(products);return {count:error?0:products.length,error}; }
export async function saveResearchRecord(record:ResearchRecord):Promise<{error:string|null}> {
  try { const products=await readCatalog(); const i=products.findIndex(p=>String(p.id)===String(record.product_id)); if(i<0)return {error:'Produto não encontrado no Cloudflare D1.'}; const list=products[i].research_records||[]; const n=list.findIndex(r=>String(r.id)===String(record.id)); if(n>=0)list[n]={...list[n],...record};else list.push(record); products[i]={...products[i],research_records:list,status:'Encontrado',updated_at:new Date().toISOString()}; return writeCatalog(products); }
  catch(e){return {error:e instanceof Error?e.message:'Falha ao salvar pesquisa no Cloudflare D1.'};}
}
export const saveResearchRecordToSupabase=saveResearchRecord;
export async function deleteResearchRecord(recordId:string):Promise<{error:string|null}> {
  try {const products=await readCatalog();const target=products.find(p=>(p.research_records||[]).some(r=>String(r.id)===recordId));if(!target)return {error:null};target.research_records=(target.research_records||[]).filter(r=>String(r.id)!==recordId);if(!target.research_records.length)target.status='Pendente';return writeCatalog(products);}
  catch(e){return {error:e instanceof Error?e.message:'Falha ao excluir pesquisa no Cloudflare D1.'};}
}
export const deleteResearchRecordFromSupabase=deleteResearchRecord;
export async function updateProductStatus(productId:string,status:ProductStatus):Promise<{error:string|null}> {
  try {const products=await readCatalog();const p=products.find(x=>String(x.id)===String(productId));if(!p)return {error:'Produto não encontrado no Cloudflare D1.'};p.status=status;p.updated_at=new Date().toISOString();return writeCatalog(products);}
  catch(e){return {error:e instanceof Error?e.message:'Falha ao atualizar status no Cloudflare D1.'};}
}
export const updateProductStatusInSupabase=updateProductStatus;
export async function updateMultipleProductsStatus(ids:(string|number)[],status:ProductStatus):Promise<{error:string|null}> {
  try {const set=new Set(ids.map(String));const products=await readCatalog();for(const p of products)if(set.has(String(p.id))){p.status=status;p.updated_at=new Date().toISOString();}return writeCatalog(products);}
  catch(e){return {error:e instanceof Error?e.message:'Falha ao atualizar status no Cloudflare D1.'};}
}
export const updateMultipleProductsStatusInSupabase=updateMultipleProductsStatus;
export async function updateProductIsNew(id:string,is_new:boolean):Promise<{error:string|null}> {
  try {const products=await readCatalog();const p=products.find(x=>String(x.id)===String(id));if(!p)return {error:'Produto não encontrado.'};p.is_new=is_new;return writeCatalog(products);}
  catch(e){return {error:e instanceof Error?e.message:'Falha no Cloudflare D1.'};}
}
export async function updateMultipleProductsIsNew(ids:(string|number)[],is_new:boolean):Promise<{error:string|null}> {
  try {const set=new Set(ids.map(String));const products=await readCatalog();for(const p of products)if(set.has(String(p.id)))p.is_new=is_new;return writeCatalog(products);}
  catch(e){return {error:e instanceof Error?e.message:'Falha no Cloudflare D1.'};}
}
export async function deleteProductsFromSupabase(ids:(string|number)[]):Promise<{error:string|null}> {
  try {const r=await fetch(API,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:ids.map(String)})});const b=await r.json();return r.ok&&b.success?{error:null}:{error:b.error||'Falha ao excluir no Cloudflare D1.'};}
  catch(e){return {error:e instanceof Error?e.message:'Falha no Cloudflare D1.'};}
}
export async function clearAllSupabaseData():Promise<{error:string|null}> {
  try {const products=await readCatalog();return deleteProductsFromSupabase(products.map(p=>p.id));}
  catch(e){return {error:e instanceof Error?e.message:'Falha ao limpar Cloudflare D1.'};}
}
export interface SupabaseRealtimePayload<T=Record<string,any>> {schema:string;table:string;commit_timestamp:string;eventType:string;new:T;old:Partial<T>;errors?:any[];}
export interface SupabaseRealtimeListeners {onProductChange?:(p:SupabaseRealtimePayload)=>void;onResearchChange?:(p:SupabaseRealtimePayload)=>void;onBatchProductChanges?:(p:SupabaseRealtimePayload[])=>void;onBatchResearchChanges?:(p:SupabaseRealtimePayload[])=>void;onAnyChange?:()=>void;bufferMs?:number;maxBatchSize?:number;}
export function subscribeToSupabaseChanges(listeners:(()=>void)|SupabaseRealtimeListeners):()=>void {
  const callback=typeof listeners==='function'?listeners:listeners.onAnyChange;
  let active=true;let last='';
  const poll=async()=>{try{const rows=await readCatalog();const signature=rows.map(p=>String(p.id)+':'+String(p.updated_at||'')).join('|');if(last&&signature!==last)callback?.();last=signature;}catch(e){console.warn('Sincronização Cloudflare:',e);}};
  void poll();const timer=setInterval(()=>{if(active)void poll();},12000);
  return ()=>{active=false;clearInterval(timer);};
}
