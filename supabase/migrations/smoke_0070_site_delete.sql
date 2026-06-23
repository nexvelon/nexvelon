-- ============================================================================
-- Nexvelon · POLISH-46 — Post-deploy Smoke Verification (0070)
-- ============================================================================
-- Run AFTER 0070_site_delete.sql. Pure-read → COMMIT (does NOT delete anything).
-- Verifies: sites.deleted_at exists; hard_delete_site(uuid) exists, is SECURITY
-- DEFINER, and is executable by service_role.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text) ON COMMIT DROP;

INSERT INTO smoke_results
SELECT 'sites.deleted_at column exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites' AND column_name='deleted_at'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results
SELECT 'hard_delete_site(uuid) exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='hard_delete_site'
      AND pg_get_function_identity_arguments(p.oid) = 'p_site_id uuid'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results
SELECT 'hard_delete_site is SECURITY DEFINER',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='hard_delete_site' AND p.prosecdef
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results
SELECT 'service_role can EXECUTE hard_delete_site',
  CASE WHEN has_function_privilege('service_role',
    'public.hard_delete_site(uuid)', 'EXECUTE')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
