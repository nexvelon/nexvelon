-- 0077_po_pdfs_bucket.sql
-- Sprint 1.5 (PO-4) — private Storage bucket for issued purchase-order PDFs.
-- The issue flow renders the PO PDF, uploads a durable copy here (service-role),
-- and also attaches it to the vendor email. Authenticated users may read (via
-- signed URLs); only the service role writes.

-- Private bucket for issued PO PDFs.
insert into storage.buckets (id, name, public)
values ('purchase-order-pdfs', 'purchase-order-pdfs', false)
on conflict (id) do nothing;

-- RLS on storage.objects, scoped to this bucket. Drop-then-create for idempotency
-- (matches the project's migration convention).
drop policy if exists "authenticated can read PO PDFs" on storage.objects;
create policy "authenticated can read PO PDFs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'purchase-order-pdfs');

drop policy if exists "service_role can write PO PDFs" on storage.objects;
create policy "service_role can write PO PDFs"
  on storage.objects for insert
  to service_role
  with check (bucket_id = 'purchase-order-pdfs');

-- ============================================
-- Rollback (per NEXVELON_PRINCIPLES.md §1) — not executed here.
-- ============================================
-- drop policy if exists "authenticated can read PO PDFs" on storage.objects;
-- drop policy if exists "service_role can write PO PDFs" on storage.objects;
-- delete from storage.buckets where id = 'purchase-order-pdfs';
