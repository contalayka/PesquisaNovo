interface Env {
  GEMINI_API_KEY?: string;
}

const decodeToken = (value: string) => {
  const normalized =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((value.length + 3) % 4);
  return atob(normalized);
};

export const onRequestGet: PagesFunction<Env, "taskId"> = async ({ env, params }) => {
  if (!env.GEMINI_API_KEY) {
    return Response.json({ error: "GEMINI_API_KEY não configurada." }, { status: 503 });
  }

  const token = String(params.taskId || "");
  if (!token || !/^[A-Za-z0-9_-]{3,1000}$/.test(token)) {
    return Response.json({ error: "ID de geração inválido." }, { status: 400 });
  }

  let fileId = "";
  try {
    fileId = decodeToken(token);
  } catch {
    return Response.json({ error: "ID de geração inválido." }, { status: 400 });
  }

  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return Response.json({ error: "Arquivo Gemini inválido." }, { status: 400 });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/files/" +
        encodeURIComponent(fileId) +
        "?key=" +
        encodeURIComponent(env.GEMINI_API_KEY)
    );
    const data = await response.json() as any;

    if (!response.ok) {
      return Response.json(
        { status: "FAILED", error: data?.error?.message || "Não foi possível consultar o vídeo." },
        { status: 502 }
      );
    }

    const state = String(data?.state || "").toUpperCase();

    if (state === "PROCESSING") {
      return Response.json({ status: "RUNNING" });
    }

    if (state === "FAILED") {
      return Response.json(
        { status: "FAILED", error: data?.error?.message || "O Gemini falhou na geração." },
        { status: 502 }
      );
    }

    if (state !== "ACTIVE") {
      return Response.json({ status: "RUNNING" });
    }

    return Response.json({
      status: "SUCCEEDED",
      videoUrl: "/api/video-result?file=" + encodeURIComponent(token),
      duration: "10 segundos",
      format: "MP4",
      maxSize: "30 MB",
    });
  } catch (error) {
    console.error("Erro ao consultar vídeo Gemini:", error);
    return Response.json(
      { status: "FAILED", error: error instanceof Error ? error.message : "Erro desconhecido." },
      { status: 502 }
    );
  }
};
