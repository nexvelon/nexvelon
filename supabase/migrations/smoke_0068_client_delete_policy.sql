-- ============================================================================
-- Nexvelon · POLISH-43 — Post-deploy Smoke Verification (0068)
-- ============================================================================
-- Run AFTER 0068_client_delete_policy.sql. Pure-read → COMMIT.
-- Verifies: a FOR DELETE policy now exists on public.clients for authenticated.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text) ON COMMIT DROP;

INSERT INTO smoke_results
SELECT 'clients_delete_authenticated policy exists (cmd=DELETE)',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='clients'
      AND policyname='clients_delete_authenticated' AND cmd='DELETE'
  ) THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
