-- ============================================================================
-- Nexvelon · POLISH-59 — Post-deploy Smoke Verification (0075)
-- ============================================================================
-- Run AFTER 0075_unify_site_codes.sql. Pure-read → COMMIT.
-- Verifies: every client has a client_code; no site is left in the global
-- invite-format 'S-NNN'; client_codes remain unique.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text) ON COMMIT DROP;

INSERT INTO smoke_results
SELECT 'no client has NULL client_code',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.clients WHERE client_code IS NULL
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results
SELECT 'no site uses the global S-NNN invite format',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.sites WHERE site_code ~ '^S-[0-9]+$'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results
SELECT 'client_code values are unique',
  CASE WHEN (
    SELECT count(*) FROM (
      SELECT client_code FROM public.clients
      WHERE client_code IS NOT NULL
      GROUP BY client_code HAVING count(*) > 1
    ) dup
  ) = 0 THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
