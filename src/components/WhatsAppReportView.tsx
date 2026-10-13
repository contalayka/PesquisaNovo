import React, { useEffect, useMemo, useState } from 'react';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
import { jsPDF } from 'jspdf';
import { getSupabaseClient } from '../utils/supabase';
import { CalendarDays, Check, Copy, FileDown, History, LoaderCircle, ScanLine, Trash2, Upload, AlertTriangle } from 'lucide-react';

type Platform = 'Shopee' | 'Mercado Livre' | 'TikTok Shop' | 'SHEIN';
type Order = { id:string; file:string; platform:Platform|''; number:string; confidence:string; duplicate:boolean; include:boolean };
type Batch = { id:string; operational_date:string; created_at:string; file_count:number; total_orders:number; counts:Record<string,number>; pending_count:number };
const PLATFORMS:Platform[]=['Shopee','Mercado Livre','TikTok Shop','SHEIN'];
const input='mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500';
const HISTORY_KEY='marketpreco_shipping_report_history_v1';
const ORDER_KEY='marketpreco_shipping_report_orders_v1';
const emptyCounts=()=>({'Shopee':0,'Mercado Livre':0,'TikTok Shop':0,'SHEIN':0});
function today(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const o=Object.fromEntries(p.map(x=>[x.type,x.value]));return o.year+'-'+o.month+'-'+o.day;}
function brDate(s:string){const [y,m,d]=(s||'').split('-');return y&&m&&d?d+'/'+m+'/'+y:s;}
function norm(s:string){return s.toUpperCase().replace(/[^A-Z0-9]/g,'');}
async function hash(p:string,n:string){const a=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p+':'+norm(n)));return [...new Uint8Array(a)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function platformOf(t:string,fileName=''):Platform|''{
 const s=(t+' '+fileName).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,' ').replace(/[^a-z0-9]+/g,' ').trim();
 // Use the marketplace name printed on the label. Plain substring matching avoids OCR spacing/punctuation variations.
 if(s.includes('shein')||s.includes('sh ein')||/gsh[a-z0-9]{8,}/i.test(t))return 'SHEIN';
 if(s.includes('shopee')||s.includes('spx express')||s.includes('spxbr'))return 'Shopee';
 if(s.includes('mercado livre')||s.includes('mercado envios')||s.includes('mercadolivre')||s.includes('mercado pago'))return 'Mercado Livre';
 if(s.includes('tiktok shop')||s.includes('tik tok shop')||s.includes('tiktok'))return 'TikTok Shop';
 return '';
}
function orderOf(t:string){
 const clean=t.toUpperCase().replace(/\b(SIMPLIFICADO|NORMAL|EXPRESS|STANDARD|ECONOMICO|ECONÔMICO|ETIQUETA|REMETENTE|DESTINATARIO|DESTINATÁRIO|TRANSPORTADORA|RASTREIO|CODIGO|CÓDIGO|PACOTE|VOLUME|ENVIO|POSTAGEM)\b/g,' ');
 const lines=clean.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 // SHEIN shipment/order identifiers such as GSH... are more reliable than generic alphanumeric OCR.
 const shein=clean.match(/\bGSH[0-9A-Z]{8,20}\b/);
 if(shein)return shein[0];
 // Prefer values close to explicit order labels, but reject shipping methods and common OCR noise.
 const labelPatterns=[
  /(?:N[uú]MERO\s*(?:DO\s*)?PEDIDO|ORDER\s*(?:ID|NUMBER|NO\.?|#)|ID\s*DO\s*PEDIDO|PEDIDO)\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\-]{7,29})/i,
  /\b(\d{6,}-\d{6,})\b/,
  /\b(\d{10,22})\b/
 ];
 for(const re of labelPatterns){const m=clean.match(re);if(m?.[1]&&!/^(?:20\d{6,}|0+)$/.test(m[1]))return m[1].trim();}
 // Fallback only accepts long mixed alpha-numeric IDs; never words like SIMPLIFICADO.
 const candidates=clean.match(/\b(?=[A-Z0-9]{10,22}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+\b/g)||[];
 const rejected=new Set(['SIMPLIFICADO','DESTINATARIO','TRANSPORTADORA','ETIQUETA','EXPRESS','STANDARD','ECONOMICO','REMETENTE','RASTREAMENTO']);
 return candidates.find(v=>!rejected.has(v)&&!/^20\d{6,}$/.test(v))||'';
}
async function pages(file:File):Promise<string[]>{ 
 if(file.type.startsWith('image/'))return [URL.createObjectURL(file)];
 const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer(),useSystemFonts:true}).promise;
 const out:string[]=[];
 for(let i=1;i<=pdf.numPages;i++){
  const page=await pdf.getPage(i);const tc=await page.getTextContent();const txt=tc.items.map((x:any)=>x.str||'').join(' ');
  // Keep native PDF text and OCR a rendered page too: marketplace logos/labels are often images.
  const vp=page.getViewport({scale:2.2});const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);const ctx=canvas.getContext('2d');
  let img='';if(ctx){await page.render({canvasContext:ctx,viewport:vp}).promise;img=canvas.toDataURL('image/png');}
  out.push('TEXT:'+txt+'\nIMAGE:'+img);
 }
 return out;
}
async function parseFile(file:File,worker:any,progress:(s:string)=>void):Promise<Order[]>{
 const ps=await pages(file);const out:Order[]=[];
 for(let i=0;i<ps.length;i++){
  progress('Lendo '+file.name+' · '+(i+1)+'/'+ps.length);
  const raw=ps[i];let txt='';
  if(raw.startsWith('TEXT:')&&raw.includes('\nIMAGE:')){
   const cut=raw.indexOf('\nIMAGE:');const native=raw.slice(5,cut);const img=raw.slice(cut+7);
   let ocr='';
   if(img){
    ocr=(await worker.recognize(img)).data.text||'';
    // Marketplace branding is commonly a graphic and may be missed in full-page OCR.
    // Run a second OCR pass on the top banner where the platform logo is printed.
    const banner=document.createElement('canvas');const source=document.createElement('img');source.src=img;
    await new Promise<void>(resolve=>{source.onload=()=>resolve();source.onerror=()=>resolve();});
    if(source.naturalWidth&&source.naturalHeight){
     banner.width=source.naturalWidth;banner.height=Math.max(1,Math.floor(source.naturalHeight*.36));
     const bctx=banner.getContext('2d');if(bctx){
      bctx.drawImage(source,0,0,source.naturalWidth,banner.height,0,0,banner.width,banner.height);
      // Increase contrast and upscale the label header before OCR; logos/platform names are often small.
      const enlarged=document.createElement('canvas');enlarged.width=banner.width*2;enlarged.height=banner.height*2;
      const ectx=enlarged.getContext('2d');
      if(ectx){ectx.filter='contrast(1.6) grayscale(1)';ectx.drawImage(banner,0,0,enlarged.width,enlarged.height);ectx.filter='none';}
      const bannerText=(await worker.recognize(enlarged.width?enlarged:banner)).data.text||'';
      ocr+='\n'+bannerText;
     }
    }
   }
   txt=native+'\n'+ocr;
  }else txt=(await worker.recognize(raw)).data.text||'';
  const p=platformOf(txt,file.name);
  // Some SHEIN PDFs place multiple labels on a single page. Extract every distinct GSH order/shipment ID instead of counting the whole page as one order.
  const gsh=[...txt.toUpperCase().matchAll(/\\bGSH[0-9A-Z]{8,20}\\b/g)].map(m=>m[0]);
  const ids=[...new Set(gsh.length?gsh:[orderOf(txt)].filter(Boolean))];
  if(ids.length===0){out.push({id:crypto.randomUUID(),file:file.name,platform:p,number:'',confidence:'Revisar',duplicate:false,include:true});}
  else for(const n of ids){const detectedPlatform=(p||(/^GSH/i.test(n)?'SHEIN':'')) as Platform|'';out.push({id:crypto.randomUUID(),file:file.name,platform:detectedPlatform,number:n,confidence:detectedPlatform&&n?'Detectado':'Revisar',duplicate:false,include:true});}
 }
 return out;
}
function message(date:string,c:Record<string,number>,pending:number,total:number){return ['*📦 RELATÓRIO DE PEDIDOS*','📅 Data: '+brDate(date),'','🟠 Shopee: '+c['Shopee']+' pedido(s)','🟡 Mercado Livre: '+c['Mercado Livre']+' pedido(s)','⚫ TikTok Shop: '+c['TikTok Shop']+' pedido(s)','⚪ SHEIN: '+c['SHEIN']+' pedido(s)','','━━━━━━━━━━━━━━','📊 *TOTAL GERAL: '+total+' pedido(s)*','⚠️ Pendentes de conferência: '+pending,'','_MARKETPREÇO | Relatório de expedição_'].join('\n');}
export const WhatsAppReportView:React.FC=()=>{
 const [date,setDate]=useState(today);const [files,setFiles]=useState<File[]>([]);const [orders,setOrders]=useState<Order[]>([]);const [history,setHistory]=useState<Batch[]>([]);const [dailyTotals,setDailyTotals]=useState<Record<string,Record<string,number>>>({});const [busy,setBusy]=useState(false);const [progress,setProgress]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');const [copied,setCopied]=useState(false);const [tab,setTab]=useState<'processar'|'historico'>('processar');
 const client=getSupabaseClient();
 useEffect(()=>{try{setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]'));setOrders(JSON.parse(localStorage.getItem(ORDER_KEY)||'[]'));}catch{} void loadHistory();},[]);
 async function loadHistory(){const local=(()=>{try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');}catch{return [];}})();if(!client){setHistory(local);return;}const {data,error}=await client.from('report_batches').select('*').order('created_at',{ascending:false}).limit(100);setHistory(!error&&data?data as Batch[]:local);const {data:rows}=await client.from('report_orders').select('operational_date,marketplace,order_hash').order('operational_date',{ascending:false}).limit(10000);if(rows){const grouped:Record<string,Record<string,number>>={};const seen=new Set<string>();for(const row of rows){const key=row.operational_date+':'+row.order_hash;if(seen.has(key))continue;seen.add(key);grouped[row.operational_date] ||= emptyCounts();grouped[row.operational_date][row.marketplace]=(grouped[row.operational_date][row.marketplace]||0)+1;}setDailyTotals(grouped);}}
 const counts=useMemo(()=>{const c=emptyCounts();const seen=new Set<string>();for(const o of orders){if(!o.include||!o.platform||!o.number)continue;const k=o.platform+':'+norm(o.number);if(seen.has(k))continue;seen.add(k);c[o.platform]++;}return c;},[orders]);
 const pending=orders.filter(o=>!o.platform||!o.number||o.confidence==='Revisar').length;const total=Object.values(counts).reduce<number>((a,b)=>a+Number(b),0);const report=useMemo(()=>message(date,counts,pending,total),[date,counts,pending,total]);
 function setOrder(id:string,patch:Partial<Order>){setOrders(prev=>{const seen=new Set<string>();const next=prev.map(o=>o.id===id?{...o,...patch}:o).map(o=>{if(!o.platform||!o.number)return {...o,duplicate:false};const k=o.platform+':'+norm(o.number);const duplicate=seen.has(k);seen.add(k);return {...o,duplicate,include:duplicate?false:o.include};});localStorage.setItem(ORDER_KEY,JSON.stringify(next));return next;});}
 async function process(){if(!files.length){setError('Selecione arquivos PDF ou imagens.');return;}setBusy(true);setError('');setNotice('');let worker:any;try{worker=await createWorker('por+eng',1,{logger:(m:any)=>{if(m.status==='recognizing text')setProgress('OCR '+Math.round(m.progress*100)+'%');}});const found:Order[]=[];for(const f of files)found.push(...await parseFile(f,worker,setProgress));
 // Compare identifiers with every previously saved operational date, not just the current browser session.
 const ids=found.filter(o=>o.platform&&o.number).map(o=>({o,key:o.platform+':'+norm(o.number)}));const hashes=await Promise.all(ids.map(async x=>({key:x.key,hash:await hash(x.o.platform,x.o.number)})));const known=new Set<string>();if(client&&hashes.length){for(let i=0;i<hashes.length;i+=100){const part=hashes.slice(i,i+100);const {data,error:e}=await client.from('report_orders').select('order_hash').in('order_hash',part.map(x=>x.hash));if(e)throw new Error('Não foi possível conferir pedidos já processados: '+e.message);for(const row of data||[])known.add(row.order_hash);}}
 const already=new Set(hashes.filter(x=>known.has(x.hash)).map(x=>x.key));const tagged=found.map(o=>{const key=o.platform&&o.number?o.platform+':'+norm(o.number):'';return key&&already.has(key)?{...o,duplicate:true,include:false,confidence:'Já processado'}:o;});const combined=[...orders,...tagged];const seen=new Set<string>();const next=combined.map(o=>{if(!o.platform||!o.number)return {...o,confidence:'Revisar',include:true};const k=o.platform+':'+norm(o.number);const duplicate=o.duplicate||seen.has(k);seen.add(k);return {...o,duplicate,include:duplicate?false:o.include};});setOrders(next);localStorage.setItem(ORDER_KEY,JSON.stringify(next));const repeated=tagged.filter(o=>o.duplicate).length;setNotice('Leitura concluída: '+found.length+' etiqueta(s) analisada(s). '+repeated+' pedido(s) já processado(s) ou repetido(s) foram ignorados.');setFiles([]);}catch(e:any){setError('Não foi possível processar os arquivos: '+(e?.message||String(e)));}finally{if(worker)await worker.terminate().catch(()=>{});setBusy(false);setProgress('');}}
 async function save(){setBusy(true);setError('');setNotice('');try{const selected=orders.filter(o=>o.include&&o.platform&&o.number&&!o.duplicate);const unique=new Map<string,Order>();selected.forEach(o=>unique.set(o.platform+':'+norm(o.number),o));const batchCounts=emptyCounts();for(const o of unique.values())batchCounts[o.platform as Platform]++;const id=crypto.randomUUID();const hashes=await Promise.all([...unique.values()].map(async o=>({order_hash:await hash(o.platform,o.number),marketplace:o.platform,order_suffix:norm(o.number).slice(-4),operational_date:date,batch_id:id})));const batch:Batch={id,operational_date:date,created_at:new Date().toISOString(),file_count:new Set(orders.map(o=>o.file)).size,total_orders:hashes.length,counts:batchCounts,pending_count:pending};if(client){const {error:e1}=await client.from('report_batches').insert({id,operational_date:date,file_count:new Set(orders.map(o=>o.file)).size,total_orders:hashes.length,counts:batchCounts,pending_count:pending});if(e1)throw new Error('Falha ao salvar lote no Supabase: '+e1.message+' (confira se a migração shipping_order_reports foi aplicada).');if(hashes.length){const {error:e2}=await client.from('report_orders').upsert(hashes,{onConflict:'order_hash,operational_date'});if(e2)throw new Error('Lote salvo, mas a deduplicação falhou: '+e2.message);}}const local=(()=>{try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]') as Batch[];}catch{return [];}})();localStorage.setItem(HISTORY_KEY,JSON.stringify([batch,...local.filter(b=>b.id!==id)].slice(0,100)));setNotice('Lote salvo. '+hashes.length+' pedido(s) único(s) no lote.');await loadHistory();}catch(e:any){setError(e?.message||String(e));}finally{setBusy(false);}}
 async function copy(){try{await navigator.clipboard.writeText(report);setCopied(true);}catch{const el=document.createElement('textarea');el.value=report;document.body.appendChild(el);el.select();setCopied(document.execCommand('copy'));el.remove();}window.setTimeout(()=>setCopied(false),1500);}
 function pdf(batch?:Batch){const d=batch?.operational_date||date,c=(batch?.counts||counts) as Record<Platform,number>,t=batch?.total_orders??total,p=batch?.pending_count??pending;const doc=new jsPDF();doc.setFillColor(15,23,42);doc.rect(0,0,210,297,'F');doc.setTextColor(52,211,153);doc.setFontSize(20);doc.text('MARKETPREÇO',18,22);doc.setTextColor(255,255,255);doc.setFontSize(15);doc.text('Relatório de expedição',18,34);doc.setFontSize(11);doc.text('Data operacional: '+brDate(d),18,44);let y=65;PLATFORMS.forEach(p=>{doc.setTextColor(255,255,255);doc.text(p,20,y);doc.setTextColor(52,211,153);doc.text(String(c[p]||0)+' pedidos',185,y,{align:'right'});y+=13;});doc.setDrawColor(52,211,153);doc.line(18,y+2,192,y+2);y+=17;doc.setTextColor(255,255,255);doc.setFontSize(15);doc.text('TOTAL GERAL',20,y);doc.setTextColor(52,211,153);doc.text(String(t)+' pedidos',185,y,{align:'right'});y+=12;doc.setTextColor(210,210,220);doc.setFontSize(10);doc.text('Pendentes de conferência: '+p,20,y);doc.save('relatorio-pedidos-'+d+'.pdf');}
 const style:Record<Platform,string>={'Shopee':'border-orange-500/30 bg-orange-500/10 text-orange-300','Mercado Livre':'border-yellow-500/30 bg-yellow-500/10 text-yellow-200','TikTok Shop':'border-slate-500/40 bg-slate-700/40 text-slate-200','SHEIN':'border-white/20 bg-white/5 text-white'};
 return <div className="mx-auto w-full max-w-6xl space-y-5 pb-10">
 <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-emerald-400"><ScanLine className="h-5 w-5"/><span className="text-xs font-semibold uppercase tracking-[0.18em]">Expedição automatizada</span></div><h1 className="mt-1 text-2xl font-bold text-white">Relatórios de pedidos</h1><p className="mt-1 text-sm text-slate-400">Envie etiquetas em PDF ou imagem para identificar marketplace e número do pedido automaticamente.</p></div><button onClick={()=>{if(window.confirm('Tem certeza que deseja limpar a lista atual? Os pedidos e a leitura desta sessão serão removidos da tela. O histórico salvo não será apagado.')){setOrders([]);setFiles([]);localStorage.removeItem(ORDER_KEY);setNotice('Lista limpa. O histórico salvo foi mantido.');setError('');}}} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300"><Trash2 className="h-4 w-4"/>Limpar sessão</button></header>
 <nav className="flex gap-2 border-b border-slate-800 pb-2"><button onClick={()=>setTab('processar')} className={'rounded-lg px-4 py-2 text-sm '+(tab==='processar'?'bg-emerald-600 text-white':'text-slate-400')}>Processar etiquetas</button><button onClick={()=>{setTab('historico');void loadHistory();}} className={'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm '+(tab==='historico'?'bg-emerald-600 text-white':'text-slate-400')}><History className="h-4 w-4"/>Histórico</button></nav>
 {error&&<div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}{notice&&<div className="rounded-xl border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-300">{notice}</div>}
 {tab==='processar'?<><section className="rounded-2xl border border-slate-800 bg-[#121824] p-4 sm:p-5"><label className="block text-sm text-slate-300">Data operacional<input className={input} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-emerald-700/60 bg-slate-950/60 p-5 text-center"><Upload className="h-7 w-7 text-emerald-400"/><span className="mt-2 font-semibold text-white">Selecionar várias etiquetas</span><span className="mt-1 text-xs text-slate-400">PDF, JPG, PNG e WEBP · OCR executado no navegador</span><input className="sr-only" type="file" multiple accept="application/pdf,image/*,.pdf" onChange={e=>setFiles(Array.from(e.target.files||[]))}/></label>{files.length>0&&<div className="mt-3 space-y-1">{files.map((f,i)=><div key={f.name+i} className="rounded bg-slate-950 px-3 py-2 text-sm text-slate-300">{f.name} · {(f.size/1048576).toFixed(1)} MB</div>)}</div>}<button disabled={busy||!files.length} onClick={()=>void process()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy?<LoaderCircle className="h-4 w-4 animate-spin"/>:<ScanLine className="h-4 w-4"/>}{busy?(progress||'Processando…'):'Ler etiquetas automaticamente'}</button></section>
 <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">{PLATFORMS.map(p=><div key={p} className={'rounded-xl border p-3 '+style[p]}><div className="text-xs">{p}</div><div className="mt-1 text-2xl font-bold">{counts[p]}</div><div className="text-xs opacity-70">pedidos únicos</div></div>)}<div className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-3"><div className="text-xs text-emerald-200">Total</div><div className="mt-1 text-2xl font-bold text-white">{total}</div></div></section>
 {orders.length>0&&<section className="rounded-2xl border border-slate-800 bg-[#121824] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-white">Relatório pronto ({total} pedidos)</h2><p className="mt-1 text-xs text-slate-400">As etiquetas foram processadas automaticamente. Itens repetidos são descontados.</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>pdf()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-white"><FileDown className="h-4 w-4"/>PDF</button><button onClick={()=>void copy()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white"><Copy className="h-4 w-4"/>{copied?'Copiado':'WhatsApp'}</button><button disabled={busy} onClick={()=>void save()} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50"><Check className="h-4 w-4"/>Salvar histórico</button></div></div><div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3"><h3 className="text-sm font-semibold text-white">Prévia da mensagem</h3><pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-200">{report}</pre></div><p className="mt-3 text-xs text-slate-500">As etiquetas são processadas no navegador. Não é exibida a lista individual de códigos identificados.</p></section>}</>:<section className="rounded-2xl border border-slate-800 bg-[#121824] p-4 sm:p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-white">Histórico de relatórios</h2><p className="mt-1 text-xs text-slate-400">Lotes salvos por data operacional.</p></div><button onClick={()=>void loadHistory()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">Atualizar</button></div>{Object.keys(dailyTotals).length>0&&<div className="mt-4 space-y-2"><h3 className="text-sm font-semibold text-white">Totais diários sem duplicar pedidos entre lotes</h3>{Object.entries(dailyTotals).sort((a,b)=>b[0].localeCompare(a[0])).map(([d,c])=><div key={d} className="rounded-xl border border-emerald-900/50 bg-emerald-950/10 p-3"><div className="font-semibold text-emerald-200">{brDate(d)} · {Object.values(c).reduce<number>((a,b)=>a+Number(b),0)} pedidos únicos</div><div className="mt-2 flex flex-wrap gap-2">{PLATFORMS.map(p=><span key={p} className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">{p}: {c[p]||0}</span>)}</div></div>)}</div>}{history.length===0?<div className="py-12 text-center text-sm text-slate-500">Nenhum lote salvo.</div>:<div className="mt-4 space-y-3">{history.map(b=><article key={b.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="font-semibold text-white">{brDate(b.operational_date)} · {b.total_orders} pedidos únicos no lote<div className="mt-1 text-xs text-slate-500">{new Date(b.created_at).toLocaleString('pt-BR')} · {b.pending_count} pendente(s)</div></div><button onClick={()=>pdf(b)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-white"><FileDown className="h-4 w-4"/>PDF</button></div><div className="mt-3 flex flex-wrap gap-2">{PLATFORMS.map(p=><span key={p} className={'rounded-full border px-3 py-1 text-xs '+style[p]}>{p}: {b.counts?.[p]||0}</span>)}</div></article>)}</div>}</section>}
 <p className="text-xs leading-5 text-slate-500">OCR pode variar conforme a qualidade e o modelo da etiqueta. Confira os itens ambíguos; o sistema não inventa identificadores.</p></div>;
};
