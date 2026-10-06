import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
type Candidate={platform:string;adUrl:string;videoUrl:string;title?:string};

const cfgs=[
 {name:"Shopee",domain:"shopee.com.br",search:(n:string)=>"https://shopee.com.br/search?keyword="+encodeURIComponent(n)},
 {name:"SHEIN",domain:"br.shein.com",search:(n:string)=>"https://br.shein.com/pdsearch/"+encodeURIComponent(n)},
 {name:"TikTok Shop",domain:"shop.tiktok.com",search:(n:string)=>"https://shop.tiktok.com/search?keyword="+encodeURIComponent(n)},
 {name:"Mercado Livre",domain:"mercadolivre.com.br",search:(n:string)=>"https://lista.mercadolivre.com.br/"+encodeURIComponent(n).replace(/%20/g,"-")}
];

function abs(u:string,b:string){try{return new URL(u,b).href}catch{return""}}

async function page(url:string){
 try{const r=await fetch(url,{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36","Accept":"text/html,application/xhtml+xml"}});if(!r.ok)return null;return {url:r.url,html:await r.text()}}catch{return null}
}

function videoUrls(html:string,base:string){
 const out:string[]=[];const seen=new Set<string>();let m;
 const add=(u:string)=>{u=abs(u,base).replace(/\\u0026/g,"&");if(/^https?:/i.test(u)&&!/\\.m3u8(?:[?#]|$)/i.test(u)&&!seen.has(u)){seen.add(u);out.push(u)}};
 const a=/<(?:video|source)[^>]+(?:src|data-src|data-video-src)=["']([^"']+)["']/gi;
 while((m=a.exec(html)))add(m[1]);
 const b=/"(?:videoUrl|videoURL|video_url|playUrl|play_url|playAddr|play_addr|downloadAddr|download_addr|mediaUrl|media_url)"\s*:\s*"([^\"]+)"/gi;
 while((m=b.exec(html)))add(m[1]);
 return out.slice(0,10);
}

function marketplaceLinks(html:string,base:string,domain:string){
 const out:string[]=[];const seen=new Set<string>();
 const add=(u:string)=>{u=abs(u.replace(/\\/g,""),base);if(u.includes(domain)&&!seen.has(u)){seen.add(u);out.push(u)}};
 let m;
 const re=/(https?:\\/\\/[^"'<\\s]+)/gi;
 while((m=re.exec(html)))add(m[1]);
 return out.filter(u=>!u.includes("/search")&&!u.includes("/pdsearch")&&!u.includes("/lista/")).slice(0,20);
}

async function engines(q:string){
 const out:any[]=[];
 for(const host of ["https://www.google.com/search?q=","https://www.bing.com/search?q="]){
  const p=await page(host+encodeURIComponent(q));if(p)out.push(p);
 }
 return out;
}

serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Método não permitido."},405);
 try{
  const b=await req.json();const name=String(b?.productName||"").trim();
  if(!name)return json({candidates:[],error:"Nome do produto não informado."},400);
  const wanted=Array.isArray(b?.platforms)?b.platforms:cfgs.map(x=>x.name);
  const candidates:Candidate[]=[];const seen=new Set<string>();
  const add=(platform:string,ad:string,video:string)=>{if(!ad||!video)return;const k=platform+"|"+ad+"|"+video;if(seen.has(k))return;seen.add(k);candidates.push({platform,adUrl:ad,videoUrl:video,title:name})};

  for(const c of cfgs.filter(x=>wanted.includes(x.name))){
   const ads=new Set<string>();
   const direct=await page(c.search(name));
   if(direct){
    for(const v of videoUrls(direct.html,direct.url))add(c.name,direct.url,v);
    for(const u of marketplaceLinks(direct.html,direct.url,c.domain))ads.add(u);
   }
   for(const q of [`site:${c.domain} "${name}"`,`site:${c.domain} "${name}" vídeo`,`site:${c.domain} "${name}" video`]){
    for(const p of await engines(q))for(const u of marketplaceLinks(p.html,p.url,c.domain))ads.add(u);
   }
   let checked=0;
   for(const ad of ads){
    if(checked++>=12)break;
    const p=await page(ad);if(!p)continue;
    for(const v of videoUrls(p.html,p.url))add(c.name,p.url,v);
    if(candidates.filter(x=>x.platform===c.name).length>=5)break;
   }
  }
  return json({candidates:candidates.slice(0,Number(b?.maxCandidates)||20),matchedImage:false,note:"Pesquisa anúncios públicos e retorna apenas páginas que expõem uma URL direta de vídeo."});
 }catch(e){console.error(e);return json({candidates:[],error:e instanceof Error?e.message:"Falha na busca."},500)}
});