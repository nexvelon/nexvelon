-- smoke_0118_activity_log_insert_policy.sql
-- Run AFTER applying 0118. Verifies the INSERT policy exists and the entity_type
-- CHECK now allows the previously-rejected values. Runs as the migration role
-- (service_role), which bypasses RLS — so it verifies the CHECK + the policy's
-- existence, not the authenticated-session path (that is verified at runtime by
-- exercising a real action; see the PR).
do $$
declare
  v_id uuid;
  v_policy_count int;
begin
  -- 1. The authenticated INSERT policy exists.
  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'activity_log'
    and policyname = 'activity_log_insert_authenticated'
    and cmd = 'INSERT';
  if v_policy_count <> 1 then
    raise 'activity_log_insert_authenticated INSERT policy is missing';
  end if;

  -- 2. Append-only preserved: NO update/delete policy exists.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'activity_log'
      and cmd in ('UPDATE', 'DELETE')
  ) then
    raise 'activity_log must stay append-only — an UPDATE/DELETE policy exists';
  end if;

  -- 3. CHECK now allows 'inventory' (was rejected before 0118).
  begin
    insert into public.activity_log (entity_type, entity_id, action)
    values ('inventory', gen_random_uuid(), 'update') returning id into v_id;
    delete from public.activity_log where id = v_id;
  exception when check_violation then
    raise 'activity_log_entity_type_check did not widen to allow inventory';
  end;

  -- 4. CHECK now allows 'attachment' (was rejected before 0118).
  begin
    insert into public.activity_log (entity_type, entity_id, action)
    values ('attachment', gen_random_uuid(), 'create') returning id into v_id;
    delete from public.activity_log where id = v_id;
  exception when check_violation then
    raise 'activity_log_entity_type_check did not widen to allow attachment';
  end;

  -- 5. CHECK still rejects an unlisted value.
  begin
    insert into public.activity_log (entity_type, entity_id, action)
    values ('not_a_real_kind', gen_random_uuid(), 'create') returning id into v_id;
    delete from public.activity_log where id = v_id;
    raise 'activity_log_entity_type_check did not reject an unlisted value';
  exception when check_violation then null; -- expected
  end;

  raise notice '0118 smoke: all assertions passed.';
end $$;
