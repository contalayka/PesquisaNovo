type PagesFunction<Env = Record<string, unknown>> = (context: { request: Request; env: Env }) => Response | Promise<Response>;
export const onRequestPost:PagesFunction=async()=>new Response(JSON.stringify({authenticated:false}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':'mp_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'}});
