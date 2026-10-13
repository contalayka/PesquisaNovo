create table if not exists public.report_batches (
 id uuid primary key, operational_date date not null, created_at timestamptz not null default now(),
 file_count integer not null default 0 check (file_count >= 0),
 total_orders integer not null default 0 check (total_orders >= 0),
 counts jsonb not null default '{"Shopee":0,"Mercado Livre":0,"TikTok Shop":0,"SHEIN":0}'::jsonb,
 pending_count integer not null default 0 check (pending_count >= 0)
);
create table if not exists public.report_orders (
 order_hash text not null, operational_date date not null,
 marketplace text not null check (marketplace in ('Shopee','Mercado Livre','TikTok Shop','SHEIN')),
 order_suffix text not null default '', batch_id uuid not null references public.report_batches(id) on delete cascade,
 created_at timestamptz not null default now(), primary key (order_hash, operational_date)
);
create index if not exists report_batches_operational_date_idx on public.report_batches (operational_date desc, created_at desc);
create index if not exists report_orders_date_marketplace_idx on public.report_orders (operational_date, marketplace);
alter table public.report_batches enable row level security;
alter table public.report_orders enable row level security;
drop policy if exists report_batches_anon_all on public.report_batches;
create policy report_batches_anon_all on public.report_batches for all to anon using (true) with check (true);
drop policy if exists report_orders_anon_all on public.report_orders;
create policy report_orders_anon_all on public.report_orders for all to anon using (true) with check (true);
grant select, insert, update, delete on public.report_batches to anon, authenticated;
grant select, insert, update, delete on public.report_orders to anon, authenticated;
notify pgrst, 'reload schema';