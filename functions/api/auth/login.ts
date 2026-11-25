interface Env {
  AUTH_PASSWORD_HASH: string;
  AUTH_SESSION_SECRET: string;
}
const encoder = new TextEncoder();

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Content-Type-Options": "nosniff", ...extra,
  }});
}
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function unb64url(value: string): Uint8Array {
  const s=value.replace(/-/g,"+").replace(/_/g,"/");
  const b=atob(s+"=".repeat((4-s.length%4)%4));
  return Uint8Array.from(b,c=>c.charCodeAt(0));
}
function equalBytes(a: Uint8Array,b: Uint8Array): boolean {
  if(a.length!==b.length) return false;
  let d=0; for(let i=0;i<a.length;i++) d|=a[i]^b[i]; return d===0;
}
async function hmac(keyBytes: Uint8Array, data: string): Promise<Uint8Array> {
  const raw=keyBytes.buffer.slice(keyBytes.byteOffset,keyBytes.byteOffset+keyBytes.byteLength) as ArrayBuffer;
  const key=await crypto.subtle.importKey("raw",raw,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=encoder.encode(data);
  const buf=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
  return new Uint8Array(await crypto.subtle.sign("HMAC",key,buf));
}
async function sign(payload: string, secret: string): Promise<string> {
  return b64url(await hmac(encoder.encode(secret),payload));
}
function readStoredHash(stored: string) {
  const p=stored.split("$");
  if(p.length!==4 || p[0]!=="pbkdf2_sha256") throw new Error("Formato de hash inválido");
  const iterations=Number(p[1]), salt=unb64url(p[2]), digest=unb64url(p[3]);
  if(!Number.isSafeInteger(iterations)||iterations<100000||iterations>1000000||salt.length<8||salt.length>64||digest.length!==32)
    throw new Error("Parâmetros do hash inválidos");
  return {iterations,salt,digest};
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if(!env.AUTH_PASSWORD_HASH || !env.AUTH_SESSION_SECRET) return json({error:"Autenticação não configurada."},503);
  const origin=request.headers.get("Origin");
  if(origin && origin!==new URL(request.url).origin) return json({error:"Origem não permitida."},403);
  try {
    const {iterations,salt}=readStoredHash(env.AUTH_PASSWORD_HASH);
    const now=Math.floor(Date.now()/1000);
    const nonce=b64url(crypto.getRandomValues(new Uint8Array(32)));
    const payload=b64url(encoder.encode(JSON.stringify({nonce,exp:now+60})));
    const token=payload+"."+await sign(payload,env.AUTH_SESSION_SECRET);
    return json({salt:b64url(salt),iterations,challenge:token});
  } catch(e) {
    console.error("AUTH_CHALLENGE_FAILED",e instanceof Error?e.message:"UnknownError");
    return json({error:"Não foi possível iniciar a verificação."},500);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if(!env.AUTH_PASSWORD_HASH || !env.AUTH_SESSION_SECRET) return json({error:"Autenticação não configurada no servidor."},503);
    const origin=request.headers.get("Origin");
    if(origin && origin!==new URL(request.url).origin) return json({error:"Origem não permitida."},403);
    const body=await request.json().catch(()=>null) as {challenge?:unknown; proof?:unknown}|null;
    if(typeof body?.challenge!=="string" || typeof body?.proof!=="string") return json({error:"Solicitação inválida."},400);
    const [payload,signature,...extra]=body.challenge.split(".");
    if(!payload||!signature||extra.length) return json({error:"Desafio inválido."},401);
    const expectedTokenSig=await sign(payload,env.AUTH_SESSION_SECRET);
    if(!equalBytes(encoder.encode(signature),encoder.encode(expectedTokenSig))) return json({error:"Desafio inválido."},401);
    const challenge=JSON.parse(new TextDecoder().decode(unb64url(payload))) as {nonce?:string;exp?:number};
    if(typeof challenge.nonce!=="string" || !Number.isSafeInteger(challenge.exp) || !challenge.exp || challenge.exp<Math.floor(Date.now()/1000))
      return json({error:"Desafio expirado. Tente novamente."},401);
    const {digest}=readStoredHash(env.AUTH_PASSWORD_HASH);
    const expectedProof=b64url(await hmac(digest,challenge.nonce));
    if(!equalBytes(encoder.encode(body.proof),encoder.encode(expectedProof))) return json({error:"Senha incorreta. Tente novamente."},401);

    const now=Math.floor(Date.now()/1000);
    const sessionPayload=b64url(encoder.encode(JSON.stringify({iat:now,exp:now+12*60*60})));
    const sessionSignature=await sign(sessionPayload,env.AUTH_SESSION_SECRET);
    return json({authenticated:true},200,{"Set-Cookie":`mp_session=${sessionPayload}.${sessionSignature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`});
  } catch(error) {
    const detail=error instanceof Error?error.message:"UnknownError";
    console.error("AUTH_LOGIN_FAILURE",detail);
    return json({error:"Erro interno ao iniciar a sessão.",diagnostic:detail},500);
  }
};
