-- ============================================================================
-- Nexvelon · POLISH-45 — Post-deploy Smoke Verification (0069)
-- ============================================================================
-- Run AFTER 0069_hard_delete_client.sql. Pure-read → COMMIT (does NOT delete).
-- Verifies the hard_delete_client(uuid) function exists, is SECURITY DEFINER,
-- and is executable by service_role (not PUBLIC).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text) ON COMMIT DROP;

INSERT INTO smoke_results
SELECT 'hard_delete_client(uuid) exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='hard_delete_client'
      AND pg_get_function_identity_arguments(p.oid) = 'p_client_id uuid'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results
SELECT 'hard_delete_client is SECURITY DEFINER',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='hard_delete_client' AND p.prosecdef
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results
SELECT 'service_role can EXECUTE hard_delete_client',
  CASE WHEN has_function_privilege('service_role',
    'public.hard_delete_client(uuid)', 'EXECUTE')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
