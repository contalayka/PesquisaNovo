// Cloudflare Pages Function: /api/upload-video
// Armazena vídeos no Cloudflare R2

interface Env {
  VIDEOS_BUCKET?: any; // R2Bucket binding no Cloudflare Pages
  R2_BUCKET?: any;
  R2_PUBLIC_URL?: string;
  CLOUDFLARE_R2_PUBLIC_URL?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const bucket = env.VIDEOS_BUCKET || env.R2_BUCKET;

  // Verificação de status / teste de conectividade
  const url = new URL(request.url);
  if (url.searchParams.get("check") === "1") {
    if (bucket) {
      return Response.json({
        ok: true,
        provider: "Cloudflare R2",
        message: "Binding VIDEOS_BUCKET conectado e ativo no Cloudflare Pages!",
        hasPublicUrl: Boolean(env.R2_PUBLIC_URL || env.CLOUDFLARE_R2_PUBLIC_URL)
      });
    }
    return Response.json({
      ok: false,
      provider: "Cloudflare R2",
      message: "Binding VIDEOS_BUCKET não encontrado em context.env no Cloudflare Pages.",
      instructions: "No painel Cloudflare Pages > Configurações > Functions > R2 bucket bindings > Adicione 'VIDEOS_BUCKET'."
    }, { status: 404 });
  }

  const contentType = request.headers.get("content-type") || "";

  let fileName = request.headers.get("x-file-name") || "video.mp4";
  let productId = request.headers.get("x-product-id") || "geral";
  let fileBuffer: ArrayBuffer | null = null;
  let mimeType = "video/mp4";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const fileEntry = formData.get("file") as File | null;
      if (!fileEntry) {
        return Response.json({ error: "Nenhum arquivo enviado no campo 'file'." }, { status: 400 });
      }
      fileName = fileEntry.name || fileName;
      mimeType = fileEntry.type || "video/mp4";
      fileBuffer = await fileEntry.arrayBuffer();

      const prodParam = formData.get("productId");
      if (prodParam && typeof prodParam === "string") {
        productId = prodParam;
      }
    } else {
      // Body binário direto
      mimeType = contentType.split(";")[0] || "video/mp4";
      fileBuffer = await request.arrayBuffer();
    }

    if (!fileBuffer || fileBuffer.byteLength === 0) {
      return Response.json({ error: "Arquivo de vídeo está vazio." }, { status: 400 });
    }

    // Limite Cloudflare R2 / Pages: 100MB por requisição padrão
    if (fileBuffer.byteLength > 100 * 1024 * 1024) {
      return Response.json({ error: "O vídeo ultrapassa o limite de 100 MB." }, { status: 413 });
    }

    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const cleanProductId = productId.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const key = `videos/${cleanProductId}/${timestamp}_${randomSuffix}_${cleanFileName}`;

    if (!bucket) {
      return Response.json({
        error: "Armazenamento Cloudflare R2 não vinculado.",
        details: "Vincule o bucket R2 no Cloudflare Pages: Configurações > Functions > R2 bucket bindings com a variável 'VIDEOS_BUCKET'.",
        key
      }, { status: 503 });
    }

    // Salvar no Cloudflare R2
    await bucket.put(key, fileBuffer, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: "public, max-age=31536000, immutable"
      },
      customMetadata: {
        originalName: fileName,
        productId,
        uploadedAt: new Date().toISOString()
      }
    });

    const publicBase = env.R2_PUBLIC_URL || env.CLOUDFLARE_R2_PUBLIC_URL;
    let publicUrl = "";
    if (publicBase) {
      publicUrl = `${publicBase.replace(/\/$/, "")}/${key}`;
    } else {
      publicUrl = `/api/video?key=${encodeURIComponent(key)}`;
    }

    return Response.json({
      success: true,
      provider: "Cloudflare R2",
      key,
      videoUrl: publicUrl,
      fileName,
      sizeBytes: fileBuffer.byteLength,
      mimeType
    });
  } catch (error) {
    console.error("Erro ao salvar vídeo no Cloudflare R2:", error);
    return Response.json({
      error: "Falha ao processar upload no Cloudflare: " + (error instanceof Error ? error.message : String(error))
    }, { status: 500 });
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const bucket = env.VIDEOS_BUCKET || env.R2_BUCKET;
  const url = new URL(request.url);

  if (url.searchParams.get("check") === "1" || url.pathname.endsWith("/check")) {
    if (bucket) {
      return Response.json({
        ok: true,
        provider: "Cloudflare R2",
        message: "Cloudflare R2 (VIDEOS_BUCKET) está ativo e funcionando!",
        hasPublicUrl: Boolean(env.R2_PUBLIC_URL || env.CLOUDFLARE_R2_PUBLIC_URL)
      });
    }
    return Response.json({
      ok: false,
      provider: "Cloudflare R2",
      message: "Binding VIDEOS_BUCKET não vinculado no Cloudflare Pages.",
      instructions: "No painel Cloudflare Pages > Configurações > Functions > R2 bucket bindings > adicione 'VIDEOS_BUCKET'."
    }, { status: 404 });
  }

  return Response.json({
    service: "Cloudflare Video Storage API",
    methods: ["POST (upload)", "GET (?check=1)"]
  });
};
