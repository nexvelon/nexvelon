-- smoke_0078_pickup_slips.sql
-- Verifies 0078 applied correctly. Read-only assertions except a transient
-- activity_log probe that is deleted by id in the same block.

do $$
declare
  col_count int;
  pol_count int;
  rls_on    boolean;
  bkt_public boolean;
  v_id      uuid;
begin
  -- pickup_slips exists with expected columns
  select count(*) into col_count
  from information_schema.columns
  where table_schema='public' and table_name='pickup_slips'
    and column_name in (
      'id','slip_number','issued_at','issued_by','issued_by_name',
      'recipient_type','recipient_id','recipient_name','signature_data_url',
      'signature_captured_at','pdf_path','notes','created_at','updated_at'
    );
  assert col_count = 14, format('pickup_slips columns missing: got %s of 14', col_count);

  -- pickup_slip_lines exists with expected columns
  select count(*) into col_count
  from information_schema.columns
  where table_schema='public' and table_name='pickup_slip_lines'
    and column_name in (
      'id','pickup_slip_id','stock_id','product_id','product_name',
      'product_sku','serial_number','quantity','line_no','movement_id','created_at'
    );
  assert col_count = 11, format('pickup_slip_lines columns missing: got %s of 11', col_count);

  -- RLS enabled on both tables
  select relrowsecurity into rls_on from pg_class
  where oid = 'public.pickup_slips'::regclass;
  assert rls_on, 'RLS not enabled on pickup_slips';

  select relrowsecurity into rls_on from pg_class
  where oid = 'public.pickup_slip_lines'::regclass;
  assert rls_on, 'RLS not enabled on pickup_slip_lines';

  -- At least one policy on each table
  select count(*) into pol_count from pg_policies
  where schemaname='public' and tablename='pickup_slips';
  assert pol_count >= 1, 'pickup_slips has no RLS policy';

  select count(*) into pol_count from pg_policies
  where schemaname='public' and tablename='pickup_slip_lines';
  assert pol_count >= 1, 'pickup_slip_lines has no RLS policy';

  -- Bucket exists and is private
  select public into bkt_public from storage.buckets where id='pickup-slip-pdfs';
  assert bkt_public is not null, 'bucket pickup-slip-pdfs missing';
  assert bkt_public = false, 'bucket pickup-slip-pdfs must be private';

  -- recipient_type CHECK rejects an invalid value
  begin
    insert into public.pickup_slips (slip_number, recipient_type, recipient_name)
    values ('PS-SMOKE-9999', 'bogus', 'Smoke') returning id into v_id;
    -- should not reach here
    delete from public.pickup_slips where id = v_id;
    raise 'pickup_slips.recipient_type CHECK did not reject an invalid value';
  exception when check_violation then
    null; -- expected
  end;

  -- activity_log CHECK widened — probe with the newly-allowed entity_type.
  begin
    insert into public.activity_log (entity_type, entity_id, action)
    values ('pickup_slip', gen_random_uuid(), 'create')
    returning id into v_id;
    delete from public.activity_log where id = v_id;
  exception when check_violation then
    raise 'activity_log_entity_type_check did not widen to allow pickup_slip';
  end;

  raise notice '0078 smoke: all assertions passed.';
end $$;
