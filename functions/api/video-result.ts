interface Env {
  GEMINI_API_KEY?: string;
}

const decodeToken = (value: string) => {
  const normalized =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((value.length + 3) % 4);
  return atob(normalized);
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.GEMINI_API_KEY) {
    return new Response("GEMINI_API_KEY não configurada.", { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("file") || "";
  if (!token || !/^[A-Za-z0-9_-]{3,1000}$/.test(token)) {
    return new Response("Arquivo inválido.", { status: 400 });
  }

  let fileId = "";
  try {
    fileId = decodeToken(token);
  } catch {
    return new Response("Arquivo inválido.", { status: 400 });
  }

  if (!/^[A-Za-z0-9_-]+$/.test(fileId)) {
    return new Response("Arquivo inválido.", { status: 400 });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/files/" +
        encodeURIComponent(fileId) +
        ":download?alt=media&key=" +
        encodeURIComponent(env.GEMINI_API_KEY),
      { redirect: "follow" }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return new Response(
        "O Google não permitiu baixar o vídeo. " + detail.slice(0, 500),
        { status: 502 }
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    // Requisito do marketplace: máximo 30 MB.
    if (bytes.byteLength > 30 * 1024 * 1024) {
      return new Response("O vídeo gerado ultrapassou o limite de 30 MB.", { status: 413 });
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": 'attachment; filename="marketpreco-gemini.mp4"',
      },
    });
  } catch (error) {
    console.error("Erro ao baixar vídeo Gemini:", error);
    return new Response(
      error instanceof Error ? error.message : "Erro desconhecido ao baixar o vídeo.",
      { status: 502 }
    );
  }
};
