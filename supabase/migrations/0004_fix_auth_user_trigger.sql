-- ============================================================================
-- Nexvelon · 0004 · Fix on_auth_user_created trigger + harden handle_new_user
-- ============================================================================
-- Bug B fix (2026-05-10).
--
-- Symptom: clicking the bootstrap-script invite email landed the user on
-- /auth/set-password, which errored with "We can't find your profile"
-- because the public.profiles row that the on_auth_user_created trigger
-- should have created during the auth.users INSERT was missing.
--
-- Diagnosis:
--   * pg_get_functiondef(handle_new_user) matched migration 0002 exactly.
--   * public.profiles columns matched migration 0002 exactly.
--   * pg_get_triggerdef(on_auth_user_created) returned:
--       CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--         FOR EACH ROW EXECUTE FUNCTION handle_new_user()
--     i.e. WITHOUT the `public.` schema prefix. Under the search_path
--     active while the auth.users insert fires, the unqualified
--     `handle_new_user` reference doesn't resolve, the trigger call
--     silently no-ops, and no profiles row is ever created. Migration
--     0002 wrote the trigger with `public.handle_new_user()` — drift
--     happened somewhere along the way (re-apply / manual edit).
--
-- This migration:
--   1. Recreates handle_new_user() with the same body, plus an inner
--      EXCEPTION block around the INSERT that RAISE-WARNINGs and
--      swallows the error. We never want a profile-insert failure to
--      roll back the parent auth.users insert — the user would still
--      get a Supabase identity but a missing profile, exactly Bug B's
--      shape; we'd rather see a warning in the logs and have a profile
--      reconciliation path than block sign-up entirely.
--   2. Defensive `coalesce(new.email, '')` on the email column even
--      though auth.users.email is NOT NULL.
--   3. Drops + recreates the trigger with the explicit `public.` prefix.
--
-- Idempotent. `create or replace function` + `drop trigger if exists`
-- mean this migration is safe to run twice.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  meta         jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role       text  := coalesce(meta->>'role', 'ViewOnly');
  v_created_by uuid;
begin
  if v_role not in (
    'Admin','ProjectManager','SalesRep','LeadTechnician','Technician',
    'Dispatcher','Warehouse','Accountant','Subcontractor','ViewOnly','ClientPortal'
  ) then
    v_role := 'ViewOnly';
  end if;

  begin
    v_created_by := nullif(meta->>'created_by', '')::uuid;
  exception when others then
    v_created_by := null;
  end;

  begin
    insert into public.profiles (id, email, first_name, last_name, role, status, created_by)
    values (
      new.id,
      coalesce(new.email, ''),
      nullif(meta->>'first_name', ''),
      nullif(meta->>'last_name', ''),
      v_role,
      'Invited',
      v_created_by
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning '[handle_new_user] failed for user_id=% email=% sqlstate=% message=%',
      new.id, new.email, sqlstate, sqlerrm;
    -- intentionally don't re-raise — let the auth.users insert succeed
    -- even if the profile insert fails. The warning surfaces in Supabase
    -- Logs; we'll reconcile a missing profile out-of-band.
  end;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates a public.profiles row whenever a new auth.users entry is inserted. SECURITY DEFINER so it bypasses RLS on profiles. Profile-insert failures are logged via RAISE WARNING and swallowed so they cannot roll back the parent auth.users insert.';

-- Recreate the trigger with the explicit public. schema prefix.
-- (The drift this migration fixes was the missing prefix on the live trigger.)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
