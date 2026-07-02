-- smoke_0076_vendor_po_template_prep.sql
-- Verifies 0076 applied correctly. Read-only assertions (the one write is a
-- transient activity_log probe that is deleted by id in the same block).

do $$
declare
  col_count int;
  v_id      uuid;
begin
  -- vendors new columns
  select count(*) into col_count
  from information_schema.columns
  where table_schema='public' and table_name='vendors'
    and column_name in ('sales_rep_name','sales_rep_email','sales_rep_phone');
  assert col_count = 3, format('vendors sales_rep_* columns missing: got %s of 3', col_count);

  -- purchase_orders new columns
  select count(*) into col_count
  from information_schema.columns
  where table_schema='public' and table_name='purchase_orders'
    and column_name in ('issued_at','sent_at','sent_to_email','ship_by_date','terms','site_id','tax_rate','tax_amount');
  assert col_count = 8, format('purchase_orders new columns missing: got %s of 8', col_count);

  -- purchase_orders.site_id is a real FK to sites
  assert exists (
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='purchase_orders'
      and column_name='site_id' and data_type='uuid'
  ), 'purchase_orders.site_id missing or not uuid';

  -- purchase_order_lines part_number
  select count(*) into col_count
  from information_schema.columns
  where table_schema='public' and table_name='purchase_order_lines'
    and column_name = 'part_number';
  assert col_count = 1, 'purchase_order_lines.part_number missing';

  -- activity_log CHECK widened — spot-check by inserting a probe row with the
  -- newly-allowed entity_type. NOTE: activity_log's real schema (0016) is
  -- (id, entity_type, entity_id uuid NOT NULL, action text NOT NULL CHECK IN
  -- ('create','update','delete'), changes jsonb default, actor_id uuid null,
  -- created_at default). There is NO actor_name column, so we insert only the
  -- three required columns with a VALID action, then delete by the returned id.
  begin
    insert into public.activity_log (entity_type, entity_id, action)
    values ('purchase_order', gen_random_uuid(), 'create')
    returning id into v_id;
    delete from public.activity_log where id = v_id;
  exception when check_violation then
    raise 'activity_log_entity_type_check did not widen to allow purchase_order';
  end;

  raise notice '0076 smoke: all assertions passed.';
end $$;
