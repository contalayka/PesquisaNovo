// Cloudflare Pages Function: /api/upload-image
// Armazena fotos de produtos permanentemente no Cloudflare R2

interface Env {
  IMAGES_BUCKET?: any;
  VIDEOS_BUCKET?: any;
  R2_BUCKET?: any;
  R2_PUBLIC_URL?: string;
  CLOUDFLARE_R2_PUBLIC_URL?: string;
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

function getBucket(env: Env) {
  return env.IMAGES_BUCKET || env.VIDEOS_BUCKET || env.R2_BUCKET;
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const bucket = getBucket(env);
  if (bucket) {
    return Response.json({
      ok: true,
      provider: 'Cloudflare R2',
      message: 'Armazenamento de imagens Cloudflare R2 ativo!',
      hasPublicUrl: Boolean(env.R2_PUBLIC_URL || env.CLOUDFLARE_R2_PUBLIC_URL),
    });
  }
  return Response.json(
    {
      ok: false,
      provider: 'Cloudflare R2',
      message: 'Nenhum bucket R2 vinculado (IMAGES_BUCKET / VIDEOS_BUCKET / R2_BUCKET).',
    },
    { status: 404 }
  );
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const bucket = getBucket(env);
  if (!bucket) {
    return Response.json(
      {
        error: 'Cloudflare R2 não vinculado no Cloudflare Pages.',
        details: 'Vincule um bucket R2 (IMAGES_BUCKET ou VIDEOS_BUCKET) em Configurações > Functions > R2 bucket bindings.',
      },
      { status: 503 }
    );
  }

  const contentType = request.headers.get('content-type') || '';
  let fileName = request.headers.get('x-file-name') || 'produto.jpg';
  let productId = request.headers.get('x-product-id') || 'geral';
  let mimeType = 'image/jpeg';
  let fileBuffer: ArrayBuffer | null = null;

  try {
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const fileEntry = formData.get('file') as File | null;
      if (!fileEntry) {
        return Response.json({ error: 'Nenhum arquivo de imagem enviado.' }, { status: 400 });
      }
      fileName = fileEntry.name || fileName;
      mimeType = fileEntry.type || 'image/jpeg';
      fileBuffer = await fileEntry.arrayBuffer();

      const prodParam = formData.get('productId');
      if (prodParam && typeof prodParam === 'string') {
        productId = prodParam;
      }
    } else {
      mimeType = contentType.split(';')[0] || 'image/jpeg';
      fileBuffer = await request.arrayBuffer();
    }

    if (!fileBuffer || fileBuffer.byteLength === 0) {
      return Response.json({ error: 'Arquivo de imagem vazio.' }, { status: 400 });
    }

    if (fileBuffer.byteLength > MAX_IMAGE_BYTES) {
      return Response.json({ error: 'A imagem excede o limite de 15 MB.' }, { status: 413 });
    }

    if (!mimeType.startsWith('image/')) {
      return Response.json({ error: 'Tipo de arquivo inválido. Envie apenas imagens.' }, { status: 400 });
    }

    const cleanFileName = decodeURIComponent(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const cleanProductId = decodeURIComponent(productId).replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `images/${cleanProductId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${cleanFileName}`;

    await bucket.put(key, fileBuffer, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        originalName: fileName,
        productId,
        uploadedAt: new Date().toISOString(),
      },
    });

    const publicBase = env.R2_PUBLIC_URL || env.CLOUDFLARE_R2_PUBLIC_URL;
    const imageUrl = publicBase
      ? `${publicBase.replace(/\/$/, '')}/${key}`
      : `/api/image?key=${encodeURIComponent(key)}`;

    return Response.json({
      success: true,
      provider: 'Cloudflare R2',
      key,
      imageUrl,
      fileName,
      sizeBytes: fileBuffer.byteLength,
      mimeType,
    });
  } catch (error) {
    return Response.json(
      {
        error: 'Falha ao salvar imagem no Cloudflare R2: ' + (error instanceof Error ? error.message : String(error)),
      },
      { status: 500 }
    );
  }
};
