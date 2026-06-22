-- ============================================================================
-- Nexvelon · POLISH-30 — Post-deploy Smoke Verification (0066)
-- ============================================================================
-- Run AFTER 0066_audit_log_delete.sql. Pure-read → COMMIT.
-- Verifies: the DELETE policy exists by name, and the restored_from_audit_id FK
-- is ON DELETE SET NULL (so deleting a referenced version is safe).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'DELETE policy settings_audit_log_delete_authenticated exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='settings_audit_log'
      AND policyname='settings_audit_log_delete_authenticated' AND cmd='DELETE')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'restored_from_audit_id FK is ON DELETE SET NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.settings_audit_log'::regclass AND contype='f'
      AND conname='settings_audit_log_restored_from_audit_id_fkey'
      AND confdeltype='n'  -- 'n' = SET NULL
  ) THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
