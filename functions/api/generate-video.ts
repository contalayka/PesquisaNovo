import { GoogleGenAI } from "@google/genai";

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
  if (!env.GEMINI_API_KEY) {
    return Response.json(
      {
        error:
          "A geração com Gemini ainda não está configurada. Cadastre GEMINI_API_KEY nas variáveis secretas do Cloudflare Pages.",
      },
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
    return Response.json(
      { error: "A descrição do vídeo está vazia." },
      { status: 400 }
    );
  }

  try {
    const imageResponse = await fetch(imageUrl, {
      headers: { Accept: "image/*" },
      redirect: "follow",
    });

    if (!imageResponse.ok) {
      return Response.json(
        { error: "Não foi possível baixar a imagem do produto para enviar ao Gemini." },
        { status: 400 }
      );
    }

    const mimeType = (
      imageResponse.headers.get("content-type") || "image/jpeg"
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      return Response.json(
        { error: "A imagem do produto precisa estar em JPG, PNG ou WebP." },
        { status: 400 }
      );
    }

    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
    if (!imageBytes.length) {
      return Response.json(
        { error: "A imagem do produto está vazia." },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const operation = await ai.models.generateVideos({
      model: "veo-3.1-fast-generate-preview",
      prompt: `Product: ${productName}. ${promptText}`,
      image: {
        imageBytes: toBase64(imageBytes),
        mimeType,
      },
      config: {
        aspectRatio: "9:16",
        durationSeconds: 8,
        resolution: "720p",
      },
    });

    if (!operation.name) {
      return Response.json(
        { error: "O Gemini não retornou o identificador da geração." },
        { status: 502 }
      );
    }

    return Response.json({
      taskId: encodeToken(operation.name),
      provider: "Gemini Veo 3.1 Fast",
      duration: "8 segundos",
    });
  } catch (error) {
    console.error("Erro ao iniciar vídeo Gemini:", error);
    const message =
      error instanceof Error ? error.message : "Erro desconhecido ao chamar o Gemini.";

    return Response.json(
      {
        error:
          message.includes("API key") || message.includes("API_KEY")
            ? "A chave GEMINI_API_KEY foi recusada pelo Google. Confira a chave do Google AI Studio e o faturamento do projeto."
            : "O Gemini não conseguiu iniciar a geração do vídeo. " + message,
      },
      { status: 502 }
    );
  }
};
