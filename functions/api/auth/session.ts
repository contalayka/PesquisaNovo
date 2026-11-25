interface Env { AUTH_SESSION_SECRET: string; }
const enc=new TextEncoder();
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function sign(payload:string,secret:string){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(payload))));}
function equal(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
export const onRequestGet:PagesFunction<Env>=async({request,env})=>{
 const cookie=request.headers.get('Cookie')||'';
 const token=cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('mp_session='))?.slice(11)||'';
 const [payload,signature]=token.split('.');
 if(!payload||!signature||!env.AUTH_SESSION_SECRET)return Response.json({authenticated:false},{status:401,headers:{'Cache-Control':'no-store'}});
 const expected=await sign(payload,env.AUTH_SESSION_SECRET);
 if(!equal(signature,expected))return Response.json({authenticated:false},{status:401,headers:{'Cache-Control':'no-store'}});
 try{const raw=atob(payload.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-payload.length%4)%4));const data=JSON.parse(decodeURIComponent(Array.from(raw,c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));if(!data.exp||data.exp<Math.floor(Date.now()/1000))throw new Error('expired');return Response.json({authenticated:true},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({authenticated:false},{status:401,headers:{'Cache-Control':'no-store'}});}
};
