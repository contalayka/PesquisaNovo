// Cloudflare Pages Function: /api/image
// Entrega imagens de produtos armazenadas no Cloudflare R2 com cache imutável

interface Env {
  IMAGES_BUCKET?: any;
  VIDEOS_BUCKET?: any;
  R2_BUCKET?: any;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const bucket = env.IMAGES_BUCKET || env.VIDEOS_BUCKET || env.R2_BUCKET;
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  if (!key) {
    return new Response('Parâmetro key é obrigatório.', { status: 400 });
  }

  if (!bucket) {
    return new Response('Armazenamento Cloudflare R2 não configurado.', { status: 503 });
  }

  try {
    const object = await bucket.get(key);
    if (!object) {
      return new Response('Imagem não encontrada no Cloudflare R2.', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    if (!headers.get('Content-Type')) {
      headers.set('Content-Type', 'image/jpeg');
    }
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    return new Response(
      'Erro ao carregar imagem do Cloudflare R2: ' + (error instanceof Error ? error.message : String(error)),
      { status: 500 }
    );
  }
};
