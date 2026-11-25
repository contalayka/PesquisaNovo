interface Env { DB: D1Database; }
type ProductRow = { id: string; [key: string]: unknown };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate", "X-Content-Type-Options": "nosniff" }
});
const validProduct = (p: unknown): p is ProductRow => !!p && typeof p === "object" && typeof (p as ProductRow).id === "string" && !!(p as ProductRow).id.trim();

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.DB.prepare("SELECT payload FROM products ORDER BY id").all<{payload:string}>();
    const products = (result.results || []).map(row => JSON.parse(row.payload));
    return json({ success: true, products, total: products.length });
  } catch (error) {
    console.error("D1_CATALOG_READ", error);
    return json({ success: false, error: "Falha ao carregar catálogo no Cloudflare D1." }, 500);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const raw = await request.text();
    if (raw.length > 25 * 1024 * 1024) return json({ success:false, error:"Importação excede o limite de 25 MB por envio." }, 413);
    const body = JSON.parse(raw) as { products?: unknown };
    if (!Array.isArray(body.products)) return json({ success:false, error:"Envie a lista completa em products." }, 400);
    if (!body.products.every(validProduct)) return json({ success:false, error:"Há produtos sem ID válido." }, 400);
    const unique = new Map<string, ProductRow>();
    for (const product of body.products) unique.set(product.id.trim(), product);
    const products = [...unique.values()];
    const now = new Date().toISOString();
    let written = 0;
    for (let i = 0; i < products.length; i += 50) {
      const batch = products.slice(i, i + 50).map(product =>
        env.DB.prepare("INSERT INTO products (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at")
          .bind(product.id.trim(), JSON.stringify(product), now)
      );
      await env.DB.batch(batch);
      written += batch.length;
    }
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM products").first<{total:number}>();
    if (written !== products.length) return json({ success:false, error:"Nem todos os registros foram enviados.", written, expected:products.length }, 500);
    return json({ success:true, written, received:body.products.length, unique:products.length, total:Number(count?.total || 0) });
  } catch (error) {
    console.error("D1_CATALOG_WRITE", error);
    return json({ success:false, error:"Falha ao gravar catálogo no Cloudflare D1." }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json() as { ids?: unknown };
    if (!Array.isArray(body.ids) || !body.ids.every(id => typeof id === "string")) return json({success:false,error:"Informe os IDs para exclusão."},400);
    let deleted = 0;
    for (let i=0;i<body.ids.length;i+=50) {
      const ids=(body.ids as string[]).slice(i,i+50);
      if (!ids.length) continue;
      const placeholders=ids.map(()=>"?").join(",");
      const result=await env.DB.prepare(`DELETE FROM products WHERE id IN (${placeholders})`).bind(...ids).run();
      deleted += result.meta.changes || 0;
    }
    return json({success:true,deleted});
  } catch(error) {
    console.error("D1_CATALOG_DELETE",error);
    return json({success:false,error:"Falha ao excluir produtos no Cloudflare D1."},500);
  }
};
