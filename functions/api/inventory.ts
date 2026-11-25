interface Env { DB: D1Database; }
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
export const onRequestGet:PagesFunction<Env>=async({env})=>{
 try{const r=await env.DB.prepare("SELECT payload FROM app_data WHERE key='internal_inventory'").first<{payload:string}>();const items=r?JSON.parse(r.payload):[];return json({success:true,items:Array.isArray(items)?items:[]});}
 catch(e){console.error("D1_INVENTORY_READ",e);return json({success:false,error:"Falha ao carregar estoque interno no Cloudflare."},500);}
};
export const onRequestPut:PagesFunction<Env>=async({request,env})=>{
 try{const body=await request.json() as {items?:unknown};if(!Array.isArray(body.items))return json({success:false,error:"Lista de estoque inválida."},400);const payload=JSON.stringify(body.items);if(payload.length>20*1024*1024)return json({success:false,error:"Arquivo excede 20 MB."},413);await env.DB.prepare("INSERT INTO app_data(key,payload,updated_at) VALUES('internal_inventory',?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at").bind(payload,new Date().toISOString()).run();return json({success:true,total:body.items.length});}
 catch(e){console.error("D1_INVENTORY_WRITE",e);return json({success:false,error:"Falha ao salvar estoque interno no Cloudflare."},500);}
};
