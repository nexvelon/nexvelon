-- 0078_pickup_slips.sql
-- Sprint 1.6 (INV-3) — parts pickup slips. When stock is issued warehouse →
-- truck (or → a tech/sub), the admin can generate a signed pickup slip: a
-- branded PDF listing the parts, quantities, and serials, with an on-screen
-- signature captured from the receiver. Slips + their lines are snapshotted at
-- creation so later renames/deletes never rewrite an issued artifact.
--
-- Two new tables (pickup_slips + pickup_slip_lines) and a private Storage bucket
-- (pickup-slip-pdfs). Per NEXVELON_PRINCIPLES §3, both tables get explicit
-- GRANTs + RLS enabled + a policy. The activity_log entity_type CHECK is widened
-- to allow 'pickup_slip' audit rows (previously silently dropped).

begin;

-- ============================================
-- pickup_slips — header (one per issue event)
-- ============================================
create table if not exists public.pickup_slips (
  id                    uuid primary key default gen_random_uuid(),
  slip_number           text not null unique,             -- 'PS-YYYY-NNNN'
  issued_at             timestamptz not null default now(),
  issued_by             uuid references auth.users(id) on delete set null,
  issued_by_name        text,                             -- snapshot
  recipient_type        text not null check (recipient_type in ('truck','tech','sub')),
  recipient_id          uuid,                             -- stock_locations.id when truck; else null
  recipient_name        text not null,                    -- snapshot of who received
  signature_data_url    text,                             -- nullable until signed
  signature_captured_at timestamptz,
  pdf_path              text,                             -- Storage path once generated
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists pickup_slips_recipient_idx
  on public.pickup_slips (recipient_type, recipient_id);
create index if not exists pickup_slips_issued_at_idx
  on public.pickup_slips (issued_at desc);

drop trigger if exists pickup_slips_set_updated_at on public.pickup_slips;
create trigger pickup_slips_set_updated_at
  before update on public.pickup_slips
  for each row execute function public.handle_updated_at();

-- ============================================
-- pickup_slip_lines — snapshotted parts on a slip
-- ============================================
create table if not exists public.pickup_slip_lines (
  id             uuid primary key default gen_random_uuid(),
  pickup_slip_id uuid not null references public.pickup_slips(id) on delete cascade,
  stock_id       uuid not null references public.inventory_stock(id),
  product_id     uuid not null references public.inventory_products(id),
  product_name   text not null,                           -- snapshot
  product_sku    text not null,                           -- snapshot
  serial_number  text,                                    -- snapshot if serialized
  quantity       int  not null check (quantity > 0),
  line_no        int  not null,
  movement_id    uuid references public.stock_movements(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists pickup_slip_lines_slip_idx
  on public.pickup_slip_lines (pickup_slip_id);
create index if not exists pickup_slip_lines_product_idx
  on public.pickup_slip_lines (product_id);

-- ============================================
-- GRANTs (§3 — the Data API role must be granted explicitly)
-- ============================================
grant select, insert, update, delete on public.pickup_slips      to authenticated;
grant select, insert, update, delete on public.pickup_slips      to service_role;
grant select, insert, update, delete on public.pickup_slip_lines to authenticated;
grant select, insert, update, delete on public.pickup_slip_lines to service_role;

-- ============================================
-- RLS + policies (§3 — enable + at least one policy each)
-- ============================================
alter table public.pickup_slips      enable row level security;
alter table public.pickup_slip_lines enable row level security;

drop policy if exists "authenticated users manage pickup_slips" on public.pickup_slips;
create policy "authenticated users manage pickup_slips"
  on public.pickup_slips for all to authenticated
  using (true) with check (true);

drop policy if exists "authenticated users manage pickup_slip_lines" on public.pickup_slip_lines;
create policy "authenticated users manage pickup_slip_lines"
  on public.pickup_slip_lines for all to authenticated
  using (true) with check (true);

-- ============================================
-- Storage bucket (private) for generated pickup-slip PDFs.
-- Mirrors 0077 (purchase-order-pdfs): authenticated read (via signed URLs),
-- service-role write.
-- ============================================
insert into storage.buckets (id, name, public)
values ('pickup-slip-pdfs', 'pickup-slip-pdfs', false)
on conflict (id) do nothing;

drop policy if exists "authenticated can read pickup slip PDFs" on storage.objects;
create policy "authenticated can read pickup slip PDFs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'pickup-slip-pdfs');

drop policy if exists "service_role can write pickup slip PDFs" on storage.objects;
create policy "service_role can write pickup slip PDFs"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'pickup-slip-pdfs');

-- ============================================
-- Widen activity_log entity_type CHECK to include 'pickup_slip'.
-- (Same drop-then-add pattern as 0076.)
-- ============================================
alter table public.activity_log
  drop constraint if exists activity_log_entity_type_check;

alter table public.activity_log
  add constraint activity_log_entity_type_check
  check (entity_type in (
    'client',
    'site',
    'contact',
    'purchase_order',
    'vendor',
    'invoice',
    'inventory_product',
    'stock_movement',
    'pickup_slip'
  ));

comment on constraint activity_log_entity_type_check on public.activity_log is
  'Widened per Sprint 1.6 (INV-3) to allow pickup_slip audit rows.';

commit;

-- ============================================
-- Rollback (per NEXVELON_PRINCIPLES.md §1) — documented, not executed.
-- ============================================
-- drop policy if exists "authenticated can read pickup slip PDFs" on storage.objects;
-- drop policy if exists "service_role can write pickup slip PDFs" on storage.objects;
-- delete from storage.buckets where id = 'pickup-slip-pdfs';
-- drop table if exists public.pickup_slip_lines;
-- drop table if exists public.pickup_slips;
-- alter table public.activity_log drop constraint if exists activity_log_entity_type_check;
-- alter table public.activity_log add constraint activity_log_entity_type_check
--   check (entity_type in ('client','site','contact','purchase_order','vendor',
--     'invoice','inventory_product','stock_movement'));
