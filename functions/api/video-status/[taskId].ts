interface Env {
  RUNWAYML_API_SECRET?: string;
}

export const onRequestGet: PagesFunction<Env, "taskId"> = async ({ request, env, params }) => {
  if (!env.RUNWAYML_API_SECRET) {
    return Response.json({ error: "A geração de vídeo ainda não está configurada no Cloudflare Pages." }, { status: 503 });
  }
  const taskId = String(params.taskId || "");
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(taskId)) {
    return Response.json({ error: "ID de geração inválido." }, { status: 400 });
  }
  const upstream = await fetch(`https://api.dev.runwayml.com/v1/tasks/${encodeURIComponent(taskId)}`, {
    headers: {
      "Authorization": `Bearer ${env.RUNWAYML_API_SECRET}`,
      "X-Runway-Version": "2024-11-06"
    }
  });
  const data = await upstream.json().catch(() => ({})) as {
    status?: string;
    output?: string[] | string;
    failure?: string;
    error?: { message?: string };
    message?: string;
  };
  if (!upstream.ok) {
    return Response.json({ error: data.error?.message || data.message || "Não foi possível consultar o status da geração." }, { status: 502 });
  }
  return Response.json({
    status: data.status || "UNKNOWN",
    output: data.output || [],
    failure: data.failure || ""
  });
};
