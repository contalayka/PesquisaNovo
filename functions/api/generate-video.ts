interface Env {
  RUNWAYML_API_SECRET?: string;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.RUNWAYML_API_SECRET) {
    return Response.json(
      { error: "A geração de vídeo ainda não está configurada. Cadastre RUNWAYML_API_SECRET nas variáveis secretas do Cloudflare Pages." },
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
    return Response.json({ error: "A imagem do produto precisa ter uma URL pública HTTPS." }, { status: 400 });
  }
  if (!promptText) {
    return Response.json({ error: "A descrição do vídeo está vazia." }, { status: 400 });
  }

  const runwayResponse = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RUNWAYML_API_SECRET}`,
      "X-Runway-Version": "2024-11-06",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gen4.5",
      promptImage: imageUrl,
      promptText: `Product: ${productName}. ${promptText}`,
      ratio: "768:1280",
      duration: 10
    })
  });

  const data = await runwayResponse.json().catch(() => ({})) as { id?: string; error?: { message?: string }; message?: string };
  if (!runwayResponse.ok) {
    return Response.json(
      { error: data.error?.message || data.message || "O serviço de vídeo recusou a solicitação. Confira a chave e os créditos da conta." },
      { status: runwayResponse.status === 401 || runwayResponse.status === 403 ? 502 : 502 }
    );
  }
  if (!data.id) return Response.json({ error: "O serviço não retornou um ID para a geração." }, { status: 502 });
  return Response.json({ taskId: data.id });
};
