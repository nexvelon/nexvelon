-- smoke_0077_po_pdfs_bucket.sql
-- Verifies 0077 applied: the private bucket exists and the two RLS policies
-- are present. Read-only assertions.

do $$
declare
  bucket_public boolean;
  policy_count int;
begin
  -- Bucket exists and is private.
  select public into bucket_public
  from storage.buckets
  where id = 'purchase-order-pdfs';
  assert found, 'purchase-order-pdfs bucket does not exist';
  assert bucket_public = false, 'purchase-order-pdfs bucket must be private (public=false)';

  -- Both policies exist on storage.objects.
  select count(*) into policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in ('authenticated can read PO PDFs', 'service_role can write PO PDFs');
  assert policy_count = 2,
    format('expected 2 PO-PDF storage policies, found %s', policy_count);

  raise notice '0077 smoke: all assertions passed.';
end $$;
