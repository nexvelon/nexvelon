-- ============================================================================
-- Nexvelon · wipe-test-data.sql
-- ----------------------------------------------------------------------------
-- Pre-Quotes-module cleanup: wipe ALL test data from the production
-- Supabase project while preserving:
--   * The admin user (auth.users + public.profiles row for jayshah.x@gmail.com)
--   * All schema (tables, columns, indexes, FKs, RLS policies)
--   * All triggers + functions (handle_new_user, has_pending_otp, etc.)
--   * Migrations history (supabase_migrations.schema_migrations)
--   * Storage buckets + objects (untouched — wipe runs on the public schema
--     and auth.users only)
--
-- Tables wiped (verified from supabase/migrations/000{1..4}_*.sql):
--   * public.auth_otp       — single-use OTP codes (FK → auth.users CASCADE)
--   * public.auth_audit_log — append-only sign-in audit trail
--                             (FK → auth.users SET NULL — wiped explicitly
--                             so admins start from a clean ledger)
--   * public.contacts       — client/site personnel
--                             (FK → clients CASCADE, FK → sites SET NULL)
--   * public.sites          — operating sites
--                             (FK → clients CASCADE)
--   * public.clients        — master client directory
--   * public.profiles       — mirror of auth.users
--                             (FK → auth.users CASCADE)
--   * auth.users            — Supabase Auth identities
--                             (CASCADE cleans auth.identities, sessions,
--                             mfa_factors, refresh_tokens, etc., plus
--                             public.profiles + public.auth_otp via FK)
--
-- NO "invitations" table exists in the schema — the invite flow uses
-- Supabase Auth's native generateLink({type:'invite'}) plus a profile
-- row with status='Invited'. Invited-but-not-yet-Active profiles get
-- wiped as part of the `profiles WHERE id != admin_id` pass.
--
-- NO other test-data tables exist in supabase/migrations/. The Quotes /
-- Projects / Inventory / etc. modules are still mock-data only — they'll
-- ship in Session B with their own 00NN_<module>_schema.sql migrations.
-- If those land before this script is run, AMEND THIS FILE first.
--
-- Single transaction (BEGIN ... COMMIT). If any DELETE fails, the whole
-- thing rolls back — no partial wipes. Aborts with RAISE EXCEPTION if
-- the admin user isn't found, so the script can never run without a
-- confirmed preservation target.
--
-- Safe to paste into the Supabase SQL Editor. Do NOT execute via the
-- service-role API without manual review.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  admin_id    uuid;
  admin_email constant text := 'jayshah.x@gmail.com';
  row_count   bigint;
BEGIN
  -- ----------------------------------------------------------------------
  -- 0. Look up the admin user. Abort hard if not found.
  -- ----------------------------------------------------------------------
  SELECT id INTO admin_id FROM auth.users WHERE email = admin_email;
  IF admin_id IS NULL THEN
    RAISE EXCEPTION
      'Admin user % not found in auth.users — aborting wipe to prevent locking everyone out.',
      admin_email;
  END IF;
  RAISE NOTICE '──────────────────────────────────────────────────────────';
  RAISE NOTICE 'Preserving admin: % (id=%)', admin_email, admin_id;
  RAISE NOTICE '──────────────────────────────────────────────────────────';

  -- ----------------------------------------------------------------------
  -- 1. public.auth_otp — wipe all rows (including admin's pending OTP if
  --    any; codes are single-use and short-lived, harmless to clear).
  -- ----------------------------------------------------------------------
  SELECT count(*) INTO row_count FROM public.auth_otp;
  RAISE NOTICE 'Deleting % rows from public.auth_otp', row_count;
  DELETE FROM public.auth_otp;

  -- ----------------------------------------------------------------------
  -- 2. public.auth_audit_log — wipe entire audit ledger.
  -- ----------------------------------------------------------------------
  SELECT count(*) INTO row_count FROM public.auth_audit_log;
  RAISE NOTICE 'Deleting % rows from public.auth_audit_log', row_count;
  DELETE FROM public.auth_audit_log;

  -- ----------------------------------------------------------------------
  -- 3. public.contacts — wipe in dependency order before clients/sites.
  --    contacts → clients FK is CASCADE, so a later DELETE on clients
  --    would also delete these, but explicit-first means the row count
  --    notice surfaces honestly.
  -- ----------------------------------------------------------------------
  SELECT count(*) INTO row_count FROM public.contacts;
  RAISE NOTICE 'Deleting % rows from public.contacts', row_count;
  DELETE FROM public.contacts;

  -- ----------------------------------------------------------------------
  -- 4. public.sites — wipe before clients (CASCADE from clients would do
  --    it anyway, but explicit-first gives accurate notices).
  -- ----------------------------------------------------------------------
  SELECT count(*) INTO row_count FROM public.sites;
  RAISE NOTICE 'Deleting % rows from public.sites', row_count;
  DELETE FROM public.sites;

  -- ----------------------------------------------------------------------
  -- 5. public.clients — wipe entire client directory.
  -- ----------------------------------------------------------------------
  SELECT count(*) INTO row_count FROM public.clients;
  RAISE NOTICE 'Deleting % rows from public.clients', row_count;
  DELETE FROM public.clients;

  -- ----------------------------------------------------------------------
  -- 6. public.profiles — wipe every profile EXCEPT the admin's.
  --    profile → auth.users CASCADE would do this implicitly when we
  --    delete auth.users below, but doing it explicitly here means a
  --    rollback-on-error keeps the admin's profile intact.
  -- ----------------------------------------------------------------------
  SELECT count(*) INTO row_count
    FROM public.profiles WHERE id <> admin_id;
  RAISE NOTICE 'Deleting % non-admin rows from public.profiles', row_count;
  DELETE FROM public.profiles WHERE id <> admin_id;

  -- ----------------------------------------------------------------------
  -- 7. auth.users — wipe every user EXCEPT the admin.
  --    Supabase Auth's FK CASCADEs handle auth.identities,
  --    auth.sessions, auth.mfa_factors, auth.refresh_tokens, etc.
  --    public.profiles + public.auth_otp also CASCADE (already empty
  --    from steps 1+6, but harmless).
  -- ----------------------------------------------------------------------
  SELECT count(*) INTO row_count
    FROM auth.users WHERE id <> admin_id;
  RAISE NOTICE
    'Deleting % non-admin rows from auth.users (CASCADE cleans identities/sessions/mfa_factors/refresh_tokens)',
    row_count;
  DELETE FROM auth.users WHERE id <> admin_id;

  RAISE NOTICE '──────────────────────────────────────────────────────────';
  RAISE NOTICE 'Wipe complete. Verification SELECT follows.';
  RAISE NOTICE '──────────────────────────────────────────────────────────';
END;
$$;

-- ============================================================================
-- Verification — one result set with final row counts per affected table.
-- All numbers should be 0 except `profiles` and `auth.users (admin)` which
-- should be 1 (the preserved admin). `auth.users (excluding admin)` should
-- be 0.
-- ============================================================================
SELECT
  'public.auth_otp' AS table_name,
  count(*) AS row_count
  FROM public.auth_otp
UNION ALL SELECT 'public.auth_audit_log', count(*) FROM public.auth_audit_log
UNION ALL SELECT 'public.contacts',       count(*) FROM public.contacts
UNION ALL SELECT 'public.sites',          count(*) FROM public.sites
UNION ALL SELECT 'public.clients',        count(*) FROM public.clients
UNION ALL SELECT 'public.profiles',       count(*) FROM public.profiles
UNION ALL SELECT
  'auth.users (admin)',  count(*) FROM auth.users
  WHERE email = 'jayshah.x@gmail.com'
UNION ALL SELECT
  'auth.users (non-admin, should be 0)', count(*) FROM auth.users
  WHERE email <> 'jayshah.x@gmail.com';

COMMIT;
