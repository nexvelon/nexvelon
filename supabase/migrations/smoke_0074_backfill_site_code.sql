-- ============================================================================
-- Nexvelon · POLISH-57 — Post-deploy Smoke Verification (0074)
-- ============================================================================
-- Run AFTER 0074_backfill_site_code.sql. Pure-read → COMMIT.
-- Verifies: no site is left with a NULL site_code, and the backfilled global
-- "S-NNN" codes are unique.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text) ON COMMIT DROP;

INSERT INTO smoke_results
SELECT 'no site has NULL site_code',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.sites WHERE site_code IS NULL
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results
SELECT 'global S-NNN codes are unique',
  CASE WHEN (
    SELECT count(*) FROM (
      SELECT site_code FROM public.sites
      WHERE site_code ~ '^S-\d+$'
      GROUP BY site_code HAVING count(*) > 1
    ) dup
  ) = 0 THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
