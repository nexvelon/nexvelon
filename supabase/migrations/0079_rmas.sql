-- 0079_rmas.sql
-- Sprint 1.6 (INV-4) — Return Merchandise Authorization (RMA). When a received
-- or defective unit must go back to its vendor, admin creates an RMA: an
-- authorization with a reason + line items (snapshotted from stock), a minted
-- RMA number, and a printable PDF. The stock unit is stamped rma_status and the
-- lifecycle (draft → sent → shipped → received_credit → closed, plus a cancel
-- escape from draft/sent) is tracked on the header.
--
-- Two new tables (rmas + rma_lines), two new inventory_stock columns
-- (rma_status + rma_id), a private Storage bucket (rma-pdfs), and the
-- activity_log entity_type CHECK widened to 'rma'. Per NEXVELON_PRINCIPLES §3
-- both new tables get explicit GRANTs + RLS + a policy.

begin;

-- ============================================
-- rmas — header (one per return authorization)
-- ============================================
create table if not exists public.rmas (
  id                     uuid primary key default gen_random_uuid(),
  rma_number             text not null unique,            -- 'RMA-YYYY-NNNN'
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users(id) on delete set null,
  created_by_name        text,                            -- snapshot
  vendor_id              uuid not null references public.vendors(id) on delete restrict,
  vendor_name            text not null,                   -- snapshot
  status                 text not null default 'draft'
    check (status in ('draft','sent','approved','shipped','received_credit','closed','cancelled')),
  reason                 text not null,                   -- defective|wrong_part|over_shipment|warranty|other
  reason_detail          text,
  tracking_carrier       text,                            -- ups|fedex|purolator|other
  tracking_number        text,
  credit_expected_amount numeric(12,2),
  credit_received_amount numeric(12,2),
  credit_received_at     timestamptz,
  notes                  text,
  pdf_path               text,
  sent_at                timestamptz,
  sent_to_email          text,
  approved_at            timestamptz,
  shipped_at             timestamptz,
  closed_at              timestamptz,
  updated_at             timestamptz not null default now()
);

create index if not exists rmas_vendor_idx on public.rmas (vendor_id);
create index if not exists rmas_status_idx on public.rmas (status);
create index if not exists rmas_created_at_idx on public.rmas (created_at desc);

drop trigger if exists rmas_set_updated_at on public.rmas;
create trigger rmas_set_updated_at
  before update on public.rmas
  for each row execute function public.handle_updated_at();

-- ============================================
-- rma_lines — snapshotted parts on an RMA
-- ============================================
create table if not exists public.rma_lines (
  id             uuid primary key default gen_random_uuid(),
  rma_id         uuid not null references public.rmas(id) on delete cascade,
  stock_id       uuid not null references public.inventory_stock(id) on delete restrict,
  product_id     uuid not null references public.inventory_products(id),
  product_name   text not null,                           -- snapshot
  product_sku    text not null,                           -- snapshot
  serial_number  text,                                    -- snapshot if serialized
  quantity       int  not null check (quantity > 0),
  unit_cost      numeric(12,2) not null,                  -- snapshot at RMA creation
  line_no        int  not null,
  line_reason    text,                                    -- optional per-line override
  created_at     timestamptz not null default now()
);

create index if not exists rma_lines_rma_idx on public.rma_lines (rma_id);
create index if not exists rma_lines_stock_idx on public.rma_lines (stock_id);

-- ============================================
-- inventory_stock — RMA state on the unit itself
-- ============================================
alter table public.inventory_stock
  add column if not exists rma_status text
    check (rma_status in ('rma_pending','rma_shipped','rma_credited'));
alter table public.inventory_stock
  add column if not exists rma_id uuid references public.rmas(id) on delete set null;

-- ============================================
-- GRANTs (§3)
-- ============================================
grant select, insert, update, delete on public.rmas      to authenticated;
grant select, insert, update, delete on public.rmas      to service_role;
grant select, insert, update, delete on public.rma_lines to authenticated;
grant select, insert, update, delete on public.rma_lines to service_role;

-- ============================================
-- RLS + policies (§3)
-- ============================================
alter table public.rmas      enable row level security;
alter table public.rma_lines enable row level security;

drop policy if exists "authenticated users manage rmas" on public.rmas;
create policy "authenticated users manage rmas"
  on public.rmas for all to authenticated
  using (true) with check (true);

drop policy if exists "authenticated users manage rma_lines" on public.rma_lines;
create policy "authenticated users manage rma_lines"
  on public.rma_lines for all to authenticated
  using (true) with check (true);

-- ============================================
-- Storage bucket (private) for generated RMA PDFs. Mirrors 0077 / 0078.
-- ============================================
insert into storage.buckets (id, name, public)
values ('rma-pdfs', 'rma-pdfs', false)
on conflict (id) do nothing;

drop policy if exists "authenticated can read RMA PDFs" on storage.objects;
create policy "authenticated can read RMA PDFs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'rma-pdfs');

drop policy if exists "service_role can write RMA PDFs" on storage.objects;
create policy "service_role can write RMA PDFs"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'rma-pdfs');

-- ============================================
-- Widen activity_log entity_type CHECK to include 'rma'.
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
    'pickup_slip',
    'rma'
  ));

comment on constraint activity_log_entity_type_check on public.activity_log is
  'Widened per Sprint 1.6 (INV-4) to allow rma audit rows.';

commit;

-- ============================================
-- Rollback (per NEXVELON_PRINCIPLES.md §1) — documented, not executed.
-- ============================================
-- drop policy if exists "authenticated can read RMA PDFs" on storage.objects;
-- drop policy if exists "service_role can write RMA PDFs" on storage.objects;
-- delete from storage.buckets where id = 'rma-pdfs';
-- alter table public.inventory_stock drop column if exists rma_id;
-- alter table public.inventory_stock drop column if exists rma_status;
-- drop table if exists public.rma_lines;
-- drop table if exists public.rmas;
-- alter table public.activity_log drop constraint if exists activity_log_entity_type_check;
-- alter table public.activity_log add constraint activity_log_entity_type_check
--   check (entity_type in ('client','site','contact','purchase_order','vendor',
--     'invoice','inventory_product','stock_movement','pickup_slip'));
