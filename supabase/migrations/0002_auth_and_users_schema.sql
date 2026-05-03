-- ============================================================================
-- Nexvelon · 0002 · Auth + users schema
-- ============================================================================
-- Replaces the localStorage demo login with real Supabase Auth.
--
-- Adds:
--   * profiles         · one row per auth.users entry (name / role / status /
--                        contact metadata). Auto-created via on_auth_user_created
--                        trigger from raw_user_meta_data on insert into auth.users.
--   * auth_audit_log   · append-only authentication-event audit trail.
--   * auth_otp         · email-OTP 2FA codes (single-use, 10-min expiry,
--                        bcrypt-hashed, max 5 attempts).
--   * is_admin()       · SECURITY DEFINER helper for RLS "Admin only" checks.
--   * guard_profile_updates · BEFORE UPDATE trigger that prevents non-admins
--                             from changing their own role / status / etc.
--   * handle_new_user  · AFTER INSERT trigger on auth.users that creates the
--                        matching profiles row.
--
-- Tightens existing RLS:
--   * Drops the "for all" permissive policies on clients / sites / contacts
--     and replaces them with per-action policies (SELECT / INSERT / UPDATE
--     for any authenticated user; no DELETE — soft-delete via deleted_at).
--
-- Per-role row scoping (e.g. SalesRep sees only own clients) lands in
-- Session C.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- profiles
-- ============================================================================
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null unique,
  first_name      text,
  last_name       text,
  display_name    text,
  avatar_url      text,
  phone           text,
  mobile          text,
  title           text,
  department      text,
  employee_type   text not null default 'Employee'
                    check (employee_type in ('Employee','Subcontractor','Contractor')),
  role            text not null default 'ViewOnly'
                    check (role in (
                      'Admin','ProjectManager','SalesRep','LeadTechnician',
                      'Technician','Dispatcher','Warehouse','Accountant',
                      'Subcontractor','ViewOnly','ClientPortal'
                    )),
  status          text not null default 'Invited'
                    check (status in ('Active','Invited','Suspended','Terminated')),
  last_login_at   timestamptz,
  last_login_ip   inet,
  mfa_enrolled    boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id) on delete set null,
  terminated_at   timestamptz,
  notes           text
);

comment on table  public.profiles            is 'Mirror of auth.users with role / status / contact metadata.';
comment on column public.profiles.role       is 'Application role. Drives <Can> gates and (eventually) RLS scope.';
comment on column public.profiles.status     is 'Lifecycle state. Only "Active" can sign in.';

create index profiles_role_idx   on public.profiles (role);
create index profiles_status_idx on public.profiles (status);
-- email already has implicit unique index from the UNIQUE constraint.

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();


-- ----------------------------------------------------------------------------
-- handle_new_user · AFTER INSERT on auth.users → auto-create profiles row.
--
-- Reads raw_user_meta_data, which we populate during inviteUserByEmail():
--   first_name, last_name, role, created_by (uuid).
-- Defaults role to 'ViewOnly' if missing/invalid; status is always 'Invited'
-- on creation (flips to 'Active' after the user sets their password and
-- enrolls in MFA — handled in /auth/set-password).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
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

  insert into public.profiles (id, email, first_name, last_name, role, status, created_by)
  values (
    new.id,
    new.email,
    nullif(meta->>'first_name', ''),
    nullif(meta->>'last_name', ''),
    v_role,
    'Invited',
    v_created_by
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates a public.profiles row whenever a new auth.users entry is inserted. SECURITY DEFINER so it bypasses RLS on profiles.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- auth_audit_log
-- ============================================================================
create table public.auth_audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  email       text,
  event       text not null,
  ip          inet,
  user_agent  text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.auth_audit_log is
  'Append-only authentication audit trail. Inserts go through server actions running with the service role.';

create index auth_audit_log_user_id_idx    on public.auth_audit_log (user_id);
create index auth_audit_log_event_idx      on public.auth_audit_log (event);
create index auth_audit_log_created_at_idx on public.auth_audit_log (created_at desc);


-- ============================================================================
-- auth_otp · email-based 2FA
-- ============================================================================
create table public.auth_otp (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);

comment on table  public.auth_otp           is 'Email-OTP 2FA codes. Single-use, 10-minute expiry, max 5 attempts.';
comment on column public.auth_otp.code_hash is 'bcrypt hash of the 6-digit code. The plaintext code is never stored — it lives only in the email.';

create index auth_otp_user_id_idx    on public.auth_otp (user_id);
create index auth_otp_created_at_idx on public.auth_otp (created_at desc);


-- ============================================================================
-- helpers
-- ============================================================================

-- is_admin() · SECURITY DEFINER so RLS policies on profiles don't recurse
-- when they call this. Returns true only when the caller is an active Admin.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'Admin'
      and status = 'Active'
  );
$$;

comment on function public.is_admin() is
  'True if auth.uid() points at an active Admin. Bypasses RLS via SECURITY DEFINER.';


-- guard_profile_updates() · BEFORE UPDATE trigger.
-- Non-admins may update their own profiles row but may NOT change
-- privilege-bearing fields (role, status, etc.) — those flip only via the
-- service role or an Admin's session.
create or replace function public.guard_profile_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role (no JWT) bypasses entirely. The on_auth_user_created
  -- trigger and admin server actions need to be able to set any column.
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.id <> auth.uid() then
    raise exception 'profile_update_forbidden: cannot edit another user' using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.created_by is distinct from old.created_by
     or new.terminated_at is distinct from old.terminated_at
     or new.mfa_enrolled is distinct from old.mfa_enrolled
     or new.last_login_at is distinct from old.last_login_at
     or new.last_login_ip is distinct from old.last_login_ip then
    raise exception 'profile_update_forbidden: that field is admin-only' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_updates on public.profiles;
create trigger profiles_guard_updates
  before update on public.profiles
  for each row execute function public.guard_profile_updates();


-- ============================================================================
-- RLS · profiles
-- ============================================================================
alter table public.profiles enable row level security;

-- SELECT: own row, plus any non-ClientPortal row (so internal users can see
-- each other's names; ClientPortal users see only themselves). Tightened in
-- Session B once per-user permission overrides land.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or role <> 'ClientPortal'
  );

-- UPDATE: own row OR Admin. The guard_profile_updates trigger restricts
-- which columns non-admins may actually touch.
drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- DELETE: Admins only. (Default flow is to set status='Terminated', not
-- DELETE — but Admins retain the escape hatch for compliance scrubs.)
drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete"
  on public.profiles
  for delete
  to authenticated
  using (public.is_admin());

-- INSERT: no policy → all client-side inserts denied. Rows are created
-- exclusively by the on_auth_user_created trigger (SECURITY DEFINER) and
-- by the service role.


-- ============================================================================
-- RLS · auth_audit_log (Admin-only SELECT, all writes via service role)
-- ============================================================================
alter table public.auth_audit_log enable row level security;

drop policy if exists "auth_audit_log_admin_select" on public.auth_audit_log;
create policy "auth_audit_log_admin_select"
  on public.auth_audit_log
  for select
  to authenticated
  using (public.is_admin());

-- No INSERT/UPDATE/DELETE policies → only service-role writes (via server
-- actions) succeed. Rows are append-only by convention.


-- ============================================================================
-- RLS · auth_otp (no client-side access at all)
-- ============================================================================
alter table public.auth_otp enable row level security;
-- No policies → all authenticated reads/writes denied. Server actions running
-- under the service role are the only way to insert / verify codes.


-- ============================================================================
-- Tighten clients / sites / contacts
-- ============================================================================
-- Drop the catch-all "for all" policies from migration 0001 and replace with
-- per-action policies. SELECT / INSERT / UPDATE allowed for any authenticated
-- user; no DELETE policy (rows are soft-deleted via deleted_at).
-- ============================================================================

-- clients ---------------------------------------------------------------------
drop policy if exists "authenticated_all_clients" on public.clients;
drop policy if exists "clients_select_authenticated" on public.clients;
drop policy if exists "clients_insert_authenticated" on public.clients;
drop policy if exists "clients_update_authenticated" on public.clients;

create policy "clients_select_authenticated"
  on public.clients for select to authenticated using (true);
create policy "clients_insert_authenticated"
  on public.clients for insert to authenticated with check (true);
create policy "clients_update_authenticated"
  on public.clients for update to authenticated using (true) with check (true);

-- sites -----------------------------------------------------------------------
drop policy if exists "authenticated_all_sites" on public.sites;
drop policy if exists "sites_select_authenticated" on public.sites;
drop policy if exists "sites_insert_authenticated" on public.sites;
drop policy if exists "sites_update_authenticated" on public.sites;

create policy "sites_select_authenticated"
  on public.sites for select to authenticated using (true);
create policy "sites_insert_authenticated"
  on public.sites for insert to authenticated with check (true);
create policy "sites_update_authenticated"
  on public.sites for update to authenticated using (true) with check (true);

-- contacts --------------------------------------------------------------------
drop policy if exists "authenticated_all_contacts" on public.contacts;
drop policy if exists "contacts_select_authenticated" on public.contacts;
drop policy if exists "contacts_insert_authenticated" on public.contacts;
drop policy if exists "contacts_update_authenticated" on public.contacts;

create policy "contacts_select_authenticated"
  on public.contacts for select to authenticated using (true);
create policy "contacts_insert_authenticated"
  on public.contacts for insert to authenticated with check (true);
create policy "contacts_update_authenticated"
  on public.contacts for update to authenticated using (true) with check (true);
