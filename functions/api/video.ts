// Cloudflare Pages Function: /api/video
// Entrega e faz streaming de vídeos armazenados no Cloudflare R2 com suporte a Range requests (206 Partial Content)

interface Env {
  VIDEOS_BUCKET?: any; // R2Bucket
  R2_BUCKET?: any;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const bucket = env.VIDEOS_BUCKET || env.R2_BUCKET;
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";

  if (!key) {
    return new Response("Parâmetro 'key' é obrigatório.", { status: 400 });
  }

  if (!bucket) {
    return new Response("Armazenamento Cloudflare R2 não configurado no Cloudflare Pages.", { status: 503 });
  }

  try {
    const rangeHeader = request.headers.get("range");
    let object: any;

    if (rangeHeader) {
      object = await bucket.get(key, { range: request.headers });
    } else {
      object = await bucket.get(key);
    }

    if (!object) {
      return new Response("Vídeo não encontrado no Cloudflare R2.", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    if (!headers.get("Content-Type")) {
      headers.set("Content-Type", "video/mp4");
    }

    const status = object.range ? 206 : 200;
    return new Response(object.body, {
      status,
      headers
    });
  } catch (error) {
    console.error("Erro ao buscar vídeo no Cloudflare R2:", error);
    return new Response("Erro ao carregar vídeo do Cloudflare: " + (error instanceof Error ? error.message : String(error)), {
      status: 500
    });
  }
};
