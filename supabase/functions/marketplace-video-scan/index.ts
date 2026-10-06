import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

type Candidate = { platform:string; adUrl:string; videoUrl:string; title?:string; imageUrl?:string };

const json = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

function absolute(u:string, base:string) {
  try { return new URL(u,base).href; } catch { return ""; }
}

function extractLinks(html:string, base:string): Candidate[] {
  const out:Candidate[]=[];
  const seen=new Set<string>();
  const add=(ad:string, video:string, title="")=>{
    ad=absolute(ad,base); video=absolute(video,base);
    if(!ad || !video || !/^https?:/i.test(video)) return;
    const key=ad+"|"+video; if(seen.has(key)) return; seen.add(key);
    out.push({platform:"Marketplace",adUrl:ad,videoUrl:video,title});
  };
  const videoRe=/<(?:video|source)[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  let m;
  while((m=videoRe.exec(html))) add(base,m[1]);
  const jsonRe=/"(?:video(?:Url|URL)?|video_url|playUrl|play_url|playAddr|play_addr|downloadAddr|download_addr)"\s*:\s*"([^"]+)"/gi;
  while((m=jsonRe.exec(html))) add(base,m[1]);
  return out;
}

async function searchEngine(q:string):Promise<{url:string;html:string}[]> {
  const urls=[
    "https://www.google.com/search?q="+encodeURIComponent(q),
    "https://www.bing.com/search?q="+encodeURIComponent(q),
  ];
  const results:{url:string;html:string}[]=[];
  for(const u of urls){
    try {
      const r=await fetch(u,{headers:{"User-Agent":"Mozilla/5.0 (compatible; MARKETPRECO/1.0)"}});
      if(r.ok) results.push({url:u,html:await r.text()});
    } catch {}
  }
  return results;
}

const configs=[
  {name:"Shopee",domain:"shopee.com.br"},
  {name:"SHEIN",domain:"br.shein.com"},
  {name:"TikTok Shop",domain:"shop.tiktok.com"},
  {name:"Mercado Livre",domain:"mercadolivre.com.br"},
];

serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Método não permitido."},405);
  try{
    const body=await req.json();
    const productName=String(body?.productName||"").trim();
    const imageUrl=String(body?.productImage||"").trim();
    const platforms=Array.isArray(body?.platforms)?body.platforms:configs.map(x=>x.name);
    if(!productName) return json({candidates:[],error:"Nome do produto não informado."},400);

    const candidates:Candidate[]=[];
    for(const cfg of configs.filter(c=>platforms.includes(c.name))){
      const queries=[
        `site:${cfg.domain} "${productName}" vídeo`,
        `site:${cfg.domain} "${productName}" video`,
        `site:${cfg.domain} "${productName}"`,
      ];
      for(const q of queries){
        const pages=await searchEngine(q);
        for(const page of pages){
          const links=extractLinks(page.html,page.url);
          for(const x of links) candidates.push({...x,platform:cfg.name});
          const marketplaceUrls=[...page.html.matchAll(/https?:\\/\\/[^"'<\\s]+/gi)].map(m=>m[0].replace(/\\u0026/g,"&"));
          for(const u of marketplaceUrls){
            if(u.includes(cfg.domain)) candidates.push({platform:cfg.name,adUrl:u,videoUrl:""});
          }
        }
      }
    }

    // Deduplicate and only return records with a direct video URL.
    const seen=new Set<string>();
    const clean=candidates.filter(x=>{
      if(!x.adUrl || !x.videoUrl) return false;
      const k=x.platform+"|"+x.adUrl+"|"+x.videoUrl;
      if(seen.has(k)) return false; seen.add(k); return true;
    }).slice(0,Number(body?.maxCandidates)||20);

    return json({candidates:clean,matchedImage:false,note:imageUrl?"A imagem foi recebida; a busca automática usa anúncios indexados e URLs de vídeo expostas publicamente.":"Busca por nome."});
  }catch(e){
    console.error(e);
    return json({candidates:[],error:e instanceof Error?e.message:"Falha na busca."},500);
  }
});
