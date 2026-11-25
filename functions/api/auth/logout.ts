export const onRequestPost: PagesFunction = async () =>
  new Response(JSON.stringify({ authenticated: false }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Set-Cookie": "mp_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
    },
  });
