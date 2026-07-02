-- 0076_vendor_po_template_prep.sql
-- Sprint 1.5 (Vendor PO Template) — schema prep for PDF + email flow.
-- Additive: new columns on existing tables + activity_log CHECK widening.

-- ============================================
-- vendors: add explicit sales-rep contact
-- ============================================
alter table public.vendors add column if not exists sales_rep_name  text;
alter table public.vendors add column if not exists sales_rep_email text;
alter table public.vendors add column if not exists sales_rep_phone text;

comment on column public.vendors.sales_rep_email is
  'Explicit sales rep email for PO delivery. Distinct from vendors.email (general contact).';

-- ============================================
-- purchase_orders: fields for PDF, tax, delivery, drop-ship
-- ============================================
alter table public.purchase_orders add column if not exists issued_at       timestamptz;
alter table public.purchase_orders add column if not exists sent_at         timestamptz;
alter table public.purchase_orders add column if not exists sent_to_email   text;
alter table public.purchase_orders add column if not exists ship_by_date    date;
alter table public.purchase_orders add column if not exists terms           text;
alter table public.purchase_orders add column if not exists site_id         uuid references public.sites(id) on delete set null;
alter table public.purchase_orders add column if not exists tax_rate        numeric(5,4);
alter table public.purchase_orders add column if not exists tax_amount      numeric(12,2);

comment on column public.purchase_orders.issued_at    is 'When admin transitioned draft→issued.';
comment on column public.purchase_orders.sent_at      is 'When PDF was emailed to vendor sales rep.';
comment on column public.purchase_orders.sent_to_email is 'Address the PO PDF was emailed to (audit snapshot).';
comment on column public.purchase_orders.site_id      is 'Drop-ship destination site. NULL = ship to our office.';
comment on column public.purchase_orders.tax_rate     is 'HST rate applied (e.g. 0.13). Snapshot at issue time.';
comment on column public.purchase_orders.tax_amount   is 'HST amount in dollars. Snapshot at issue time.';

-- Index for drop-ship queries
create index if not exists idx_purchase_orders_site_id on public.purchase_orders(site_id);

-- ============================================
-- purchase_order_lines: denormalize part_number for durable PDFs
-- ============================================
alter table public.purchase_order_lines add column if not exists part_number text;

comment on column public.purchase_order_lines.part_number is
  'Part number snapshot at line creation. Denormalized so historical PO PDFs remain accurate even if inventory_products SKU later changes.';

-- ============================================
-- activity_log: widen entity_type CHECK
-- The existing CHECK (from 0016) only allowed ('client','site','contact')
-- so PO/quote/vendor/invoice logActivity() calls have been silently
-- rejected (best-effort, error swallowed).
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
    'stock_movement'
  ));

comment on constraint activity_log_entity_type_check on public.activity_log is
  'Widened per Sprint 1.5 (PO-1). Previously only client/site/contact — caused silent drops of PO/vendor/invoice audit events.';

-- Note: quotes deliberately continue using their own quote_audit_log table
-- (per 0038). Not added here to preserve that separation.

-- ============================================
-- Rollback (reverse migration) — additive only, so the reversal simply drops
-- the new columns/index and restores the original 0016 CHECK. Documented per
-- NEXVELON_PRINCIPLES.md §1 (data-preservation). Not executed here.
-- ============================================
-- alter table public.vendors drop column if exists sales_rep_name;
-- alter table public.vendors drop column if exists sales_rep_email;
-- alter table public.vendors drop column if exists sales_rep_phone;
-- drop index if exists idx_purchase_orders_site_id;
-- alter table public.purchase_orders drop column if exists issued_at;
-- alter table public.purchase_orders drop column if exists sent_at;
-- alter table public.purchase_orders drop column if exists sent_to_email;
-- alter table public.purchase_orders drop column if exists ship_by_date;
-- alter table public.purchase_orders drop column if exists terms;
-- alter table public.purchase_orders drop column if exists site_id;
-- alter table public.purchase_orders drop column if exists tax_rate;
-- alter table public.purchase_orders drop column if exists tax_amount;
-- alter table public.purchase_order_lines drop column if exists part_number;
-- alter table public.activity_log drop constraint if exists activity_log_entity_type_check;
-- alter table public.activity_log add constraint activity_log_entity_type_check
--   check (entity_type in ('client','site','contact'));
