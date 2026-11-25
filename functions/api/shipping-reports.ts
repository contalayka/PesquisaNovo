interface Env { DB: D1Database; }
type StoredBatch = {
  id: string;
  operational_date: string;
  created_at: string;
  file_count: number;
  total_orders: number;
  counts: Record<string, number>;
  pending_count: number;
  labels?: unknown[];
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate" }
});
async function ensureTables(db: D1Database) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS report_batches (id TEXT PRIMARY KEY, operational_date TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_report_batches_date ON report_batches(operational_date, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS report_orders (order_hash TEXT NOT NULL, operational_date TEXT NOT NULL, marketplace TEXT NOT NULL, batch_id TEXT NOT NULL, PRIMARY KEY(order_hash, operational_date))"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_report_orders_date ON report_orders(operational_date)")
  ]);
}
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    await ensureTables(env.DB);
    const [batchRows, orderRows] = await Promise.all([
      env.DB.prepare("SELECT payload FROM report_batches ORDER BY created_at DESC LIMIT 500").all<{payload:string}>(),
      env.DB.prepare("SELECT order_hash, operational_date, marketplace FROM report_orders ORDER BY operational_date DESC LIMIT 50000").all<{order_hash:string;operational_date:string;marketplace:string}>()
    ]);
    return json({
      success: true,
      batches: (batchRows.results || []).map(row => JSON.parse(row.payload)),
      orders: orderRows.results || []
    });
  } catch (error) {
    console.error("D1_SHIPPING_REPORT_READ", error);
    return json({ success:false, error:"Falha ao carregar o histórico de pedidos no Cloudflare." }, 500);
  }
};
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const raw = await request.text();
    if (raw.length > 8 * 1024 * 1024) return json({success:false,error:"Lote excede 8 MB."},413);
    const body = JSON.parse(raw) as { batch?: StoredBatch; orders?: Array<{order_hash:string;marketplace:string;operational_date:string;batch_id:string}> };
    const b = body.batch;
    if (!b || typeof b.id !== "string" || typeof b.operational_date !== "string" || !Array.isArray(b.labels)) {
      return json({success:false,error:"Lote de pedidos inválido."},400);
    }
    const orders = Array.isArray(body.orders) ? body.orders : [];
    if (orders.some(o => !o || typeof o.order_hash !== "string" || typeof o.marketplace !== "string" || typeof o.operational_date !== "string")) {
      return json({success:false,error:"Há identificadores de pedidos inválidos."},400);
    }
    await ensureTables(env.DB);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO report_batches (id, operational_date, created_at, payload) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
        .bind(b.id, b.operational_date, b.created_at || new Date().toISOString(), JSON.stringify(b)),
      ...orders.map(o => env.DB.prepare("INSERT INTO report_orders (order_hash, operational_date, marketplace, batch_id) VALUES (?, ?, ?, ?) ON CONFLICT(order_hash, operational_date) DO NOTHING")
        .bind(o.order_hash, o.operational_date, o.marketplace, o.batch_id || b.id))
    ]);
    return json({success:true, saved:true, batchId:b.id, orderCount:orders.length});
  } catch (error) {
    console.error("D1_SHIPPING_REPORT_WRITE", error);
    return json({success:false,error:"Falha ao salvar o histórico de pedidos no Cloudflare."},500);
  }
};
