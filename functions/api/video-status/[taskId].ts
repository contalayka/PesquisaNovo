import { GoogleGenAI } from "@google/genai";

interface Env {
  GEMINI_API_KEY?: string;
}

const decodeToken = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return atob(normalized);
};

export const onRequestGet: PagesFunction<Env, "taskId"> = async ({ env, params }) => {
  if (!env.GEMINI_API_KEY) {
    return Response.json(
      { error: "A geração com Gemini não está configurada no Cloudflare Pages." },
      { status: 503 }
    );
  }

  const token = String(params.taskId || "");
  if (!token || !/^[A-Za-z0-9_-]{10,2000}$/.test(token)) {
    return Response.json({ error: "ID de geração inválido." }, { status: 400 });
  }

  let operationName = "";
  try {
    operationName = decodeToken(token);
  } catch {
    return Response.json({ error: "ID de geração inválido." }, { status: 400 });
  }

  if (!operationName.startsWith("models/") || !operationName.includes("/operations/")) {
    return Response.json({ error: "Operação Gemini inválida." }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const operation = await ai.operations.getVideosOperation({
      operation: { name: operationName } as any,
    });

    if (operation.error) {
      return Response.json(
        {
          status: "FAILED",
          error:
            (operation.error as any).message ||
            "O Gemini informou um erro na geração.",
        },
      );
    }

    if (!operation.done) {
      return Response.json({ status: "RUNNING" });
    }

    const video = operation.response?.generatedVideos?.[0]?.video as
      | { uri?: string; videoBytes?: string; mimeType?: string }
      | undefined;

    if (!video) {
      return Response.json(
        { status: "FAILED", error: "O Gemini terminou a operação, mas não retornou o vídeo." },
        { status: 502 }
      );
    }

    return Response.json({
      status: "SUCCEEDED",
      videoUrl: "/api/video-result?op=" + encodeURIComponent(token),
      duration: "8 segundos",
    });
  } catch (error) {
    console.error("Erro ao consultar vídeo Gemini:", error);
    const message =
      error instanceof Error ? error.message : "Erro desconhecido ao consultar o Gemini.";
    return Response.json({ error: message }, { status: 502 });
  }
};
