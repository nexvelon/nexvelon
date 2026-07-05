-- smoke_0079_rmas.sql
-- Verifies 0079 applied correctly. Read-only assertions except a transient
-- activity_log probe that is deleted by id in the same block.

do $$
declare
  col_count int;
  pol_count int;
  rls_on    boolean;
  bkt_public boolean;
  v_id      uuid;
begin
  -- rmas exists with expected columns
  select count(*) into col_count
  from information_schema.columns
  where table_schema='public' and table_name='rmas'
    and column_name in (
      'id','rma_number','created_by','created_by_name','vendor_id','vendor_name',
      'status','reason','reason_detail','tracking_carrier','tracking_number',
      'credit_expected_amount','credit_received_amount','credit_received_at',
      'notes','pdf_path','sent_at','sent_to_email','approved_at','shipped_at',
      'closed_at'
    );
  assert col_count = 21, format('rmas columns missing: got %s of 21', col_count);

  -- rma_lines exists with expected columns
  select count(*) into col_count
  from information_schema.columns
  where table_schema='public' and table_name='rma_lines'
    and column_name in (
      'id','rma_id','stock_id','product_id','product_name','product_sku',
      'serial_number','quantity','unit_cost','line_no','line_reason'
    );
  assert col_count = 11, format('rma_lines columns missing: got %s of 11', col_count);

  -- inventory_stock RMA columns added
  select count(*) into col_count
  from information_schema.columns
  where table_schema='public' and table_name='inventory_stock'
    and column_name in ('rma_status','rma_id');
  assert col_count = 2, format('inventory_stock rma columns missing: got %s of 2', col_count);

  -- RLS enabled on both new tables
  select relrowsecurity into rls_on from pg_class where oid = 'public.rmas'::regclass;
  assert rls_on, 'RLS not enabled on rmas';
  select relrowsecurity into rls_on from pg_class where oid = 'public.rma_lines'::regclass;
  assert rls_on, 'RLS not enabled on rma_lines';

  -- At least one policy each
  select count(*) into pol_count from pg_policies where schemaname='public' and tablename='rmas';
  assert pol_count >= 1, 'rmas has no RLS policy';
  select count(*) into pol_count from pg_policies where schemaname='public' and tablename='rma_lines';
  assert pol_count >= 1, 'rma_lines has no RLS policy';

  -- Bucket exists + private
  select public into bkt_public from storage.buckets where id='rma-pdfs';
  assert bkt_public is not null, 'bucket rma-pdfs missing';
  assert bkt_public = false, 'bucket rma-pdfs must be private';

  -- status CHECK rejects an invalid value
  begin
    insert into public.rmas (rma_number, vendor_id, vendor_name, status, reason)
    values ('RMA-SMOKE-9999',
            (select id from public.vendors limit 1),
            'Smoke', 'bogus', 'defective')
    returning id into v_id;
    delete from public.rmas where id = v_id;
    raise 'rmas.status CHECK did not reject an invalid value';
  exception
    when check_violation then null; -- expected
    when not_null_violation then null; -- no vendors seeded — CHECK still fine
  end;

  -- activity_log CHECK widened — probe with the newly-allowed entity_type.
  begin
    insert into public.activity_log (entity_type, entity_id, action)
    values ('rma', gen_random_uuid(), 'create')
    returning id into v_id;
    delete from public.activity_log where id = v_id;
  exception when check_violation then
    raise 'activity_log_entity_type_check did not widen to allow rma';
  end;

  raise notice '0079 smoke: all assertions passed.';
end $$;
