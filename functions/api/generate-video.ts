interface Env {
  GEMINI_API_KEY?: string;
}

const encodeToken = (value: string) =>
  btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Secrets do Cloudflare chegam em context.env em runtime. Normalizamos o valor
  // para evitar falhas por espaços acidentais ao cadastrar a chave.
  const geminiApiKey = String(env.GEMINI_API_KEY || "").trim();

  if (!geminiApiKey) {
    return Response.json(
      { error: "GEMINI_API_KEY não está disponível no runtime de Production. Verifique o Secret do projeto e faça um novo deploy após salvá-lo." },
      { status: 503 }
    );
  }

  let body: { imageUrl?: string; productName?: string; promptText?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const imageUrl = String(body.imageUrl || "");
  const productName = String(body.productName || "Produto").slice(0, 180);
  const promptText = String(body.promptText || "").slice(0, 1800);

  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol !== "https:") throw new Error("invalid");
  } catch {
    return Response.json(
      { error: "A imagem do produto precisa ter uma URL pública HTTPS." },
      { status: 400 }
    );
  }

  if (!promptText) {
    return Response.json({ error: "A descrição do vídeo está vazia." }, { status: 400 });
  }

  try {
    const imageResponse = await fetch(imageUrl, {
      headers: { Accept: "image/*" },
      redirect: "follow",
    });

    if (!imageResponse.ok) {
      return Response.json(
        { error: "Não foi possível baixar a imagem do produto." },
        { status: 400 }
      );
    }

    const mimeType = (imageResponse.headers.get("content-type") || "image/jpeg")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      return Response.json(
        { error: "A imagem precisa estar em JPG, PNG ou WebP." },
        { status: 400 }
      );
    }

    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
    if (!imageBytes.length) {
      return Response.json({ error: "A imagem do produto está vazia." }, { status: 400 });
    }

    // Gemini Omni Flash: vídeo MP4 vertical de 10 segundos, adequado ao requisito do marketplace.
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions?key=" +
        encodeURIComponent(geminiApiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemini-omni-1.1-flash",
          input: [
            {
              type: "image",
              data: toBase64(imageBytes),
              mime_type: mimeType,
            },
            {
              type: "text",
              text:
                "Create a polished ecommerce product video. " +
                "Use the supplied product image as the exact product reference. " +
                "Preserve the product's real shape, colors, labels, logo, packaging and details. " +
                "Do not invent another product, accessories, text or branding. " +
                promptText,
            },
          ],
          response_format: {
            type: "video",
            delivery: "uri",
            aspect_ratio: "9:16",
            resolution: "720p",
            duration: "10s",
          },
          generation_config: {
            video_config: {
              task: "image_to_video",
            },
          },
        }),
      }
    );

    const data = await response.json() as any;

    if (!response.ok) {
      console.error("Gemini error:", data);
      const detail =
        data?.error?.message ||
        data?.message ||
        "O Gemini recusou a solicitação de vídeo.";
      return Response.json({ error: detail }, { status: 502 });
    }

    const videoUri = data?.output_video?.uri;
    const interactionId = data?.id;

    if (!videoUri) {
      return Response.json(
        { error: "O Gemini não retornou o arquivo do vídeo. Tente novamente." },
        { status: 502 }
      );
    }

    const fileMatch = String(videoUri).match(/files\/([^/]+)/);
    const fileId = fileMatch?.[1];

    if (!fileId) {
      return Response.json(
        { error: "O Gemini retornou um identificador de vídeo inválido." },
        { status: 502 }
      );
    }

    return Response.json({
      taskId: encodeToken(fileId),
      interactionId,
      provider: "Gemini Omni Flash",
      duration: "10 segundos",
      format: "MP4",
      maxSize: "30 MB",
    });
  } catch (error) {
    console.error("Erro ao iniciar vídeo Gemini:", error);
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return Response.json({ error: "O Gemini não conseguiu iniciar o vídeo: " + message }, { status: 502 });
  }
};
