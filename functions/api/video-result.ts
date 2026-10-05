import { GoogleGenAI } from "@google/genai";

interface Env {
  GEMINI_API_KEY?: string;
}

const decodeToken = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return atob(normalized);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GEMINI_API_KEY) {
    return new Response("GEMINI_API_KEY não configurada.", { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("op") || "";
  if (!token || !/^[A-Za-z0-9_-]{10,2000}$/.test(token)) {
    return new Response("Operação inválida.", { status: 400 });
  }

  let operationName = "";
  try {
    operationName = decodeToken(token);
  } catch {
    return new Response("Operação inválida.", { status: 400 });
  }

  if (!operationName.startsWith("models/") || !operationName.includes("/operations/")) {
    return new Response("Operação Gemini inválida.", { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const operation = await ai.operations.getVideosOperation({
      operation: { name: operationName } as any,
    });

    if (!operation.done) {
      return new Response("O vídeo ainda está sendo gerado.", {
        status: 202,
        headers: { "Retry-After": "5" },
      });
    }

    if (operation.error) {
      return new Response(
        String((operation.error as any).message || "Falha na geração."),
        { status: 502 }
      );
    }

    const video = operation.response?.generatedVideos?.[0]?.video as
      | { uri?: string; videoBytes?: string; mimeType?: string }
      | undefined;

    if (!video) {
      return new Response("O Gemini não retornou o vídeo.", { status: 502 });
    }

    if (video.videoBytes) {
      return new Response(base64ToBytes(video.videoBytes), {
        headers: {
          "Content-Type": video.mimeType || "video/mp4",
          "Cache-Control": "private, max-age=3600",
          "Content-Disposition": "inline; filename=\"marketpreco-gemini-veo.mp4\"",
        },
      });
    }

    if (!video.uri) {
      return new Response("O Gemini não retornou uma URL para o vídeo.", { status: 502 });
    }

    let upstream = await fetch(video.uri, {
      headers: { "x-goog-api-key": env.GEMINI_API_KEY },
      redirect: "manual",
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) {
        return new Response("O Google não informou o endereço final do vídeo.", { status: 502 });
      }
      upstream = await fetch(new URL(location, video.uri).toString(), {
        redirect: "follow",
      });
    }

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      return new Response(
        "O Google não permitiu baixar o vídeo. " + detail.slice(0, 500),
        { status: 502 }
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || "video/mp4");
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("Content-Disposition", 'inline; filename="marketpreco-gemini-veo.mp4"');

    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    console.error("Erro ao entregar vídeo Gemini:", error);
    return new Response(
      error instanceof Error ? error.message : "Erro desconhecido ao entregar o vídeo.",
      { status: 502 }
    );
  }
};
