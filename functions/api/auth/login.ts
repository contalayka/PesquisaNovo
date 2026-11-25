type PagesFunction<Env = Record<string, unknown>> = (context: { request: Request; env: Env }) => Response | Promise<Response>;
interface Env { AUTH_PASSWORD_HASH: string; AUTH_SESSION_SECRET: string; }
const attempts = new Map<string, { count: number; blockedUntil: number }>();
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function json(data: unknown, status = 200, headers: Record<string,string> = {}) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store, no-cache, must-revalidate', 'X-Content-Type-Options':'nosniff', ...headers } }); }
function safeEqual(a: Uint8Array, b: Uint8Array) { if (a.length !== b.length) return false; let diff=0; for(let i=0;i<a.length;i++) diff |= a[i]^b[i]; return diff===0; }
async function verifyPassword(password: string, encoded: string) {
  const [kind, iterText, saltText, expectedText] = encoded.split('$');
  if (kind !== 'pbkdf2_sha256' || !/^\d+$/.test(iterText) || !saltText || !expectedText) return false;
  const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4)), c=>c.charCodeAt(0));
  const salt=decode(saltText), expected=decode(expectedText), iterations=Number(iterText);
  if (iterations < 100000 || iterations > 1000000 || expected.length !== 32) return false;
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
  return safeEqual(bits,expected);
}
async function sign(payload: string, secret: string) {
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(payload))));
}
export const onRequestPost: PagesFunction<Env> = async ({request,env}) => {
  if (!env.AUTH_PASSWORD_HASH || !env.AUTH_SESSION_SECRET) return json({error:'Autenticação ainda não configurada no servidor.'},503);
  const origin=request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({error:'Origem não permitida.'},403);
  const ip=request.headers.get('CF-Connecting-IP') || 'unknown';
  const now=Date.now(), state=attempts.get(ip) || {count:0,blockedUntil:0};
  if (state.blockedUntil > now) return json({error:'Muitas tentativas. Aguarde alguns minutos.'},429);
  let body: {password?:string};
  try { body=await request.json(); } catch { return json({error:'Solicitação inválida.'},400); }
  const password=typeof body.password==='string' ? body.password : '';
  if (!password || password.length > 256) return json({error:'Informe a senha.'},400);
  const valid=await verifyPassword(password,env.AUTH_PASSWORD_HASH);
  if (!valid) {
    state.count++;
    if (state.count >= 5) { state.count=0; state.blockedUntil=now+5*60*1000; }
    attempts.set(ip,state);
    return json({error:'Senha incorreta. Tente novamente.'},401);
  }
  attempts.delete(ip);
  const payload=b64url(enc.encode(JSON.stringify({iat:Math.floor(now/1000),exp:Math.floor(now/1000)+12*60*60})));
  const signature=await sign(payload,env.AUTH_SESSION_SECRET);
  return json({authenticated:true},200,{ 'Set-Cookie':`mp_session=${payload}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200` });
};
