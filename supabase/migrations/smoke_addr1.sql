-- ============================================================================
-- Nexvelon · ADDR-1 — Post-deploy Smoke Verification (migration 0019)
-- ============================================================================
-- Run AFTER 0019_normalize_country_values.sql has been applied.
--
-- Verifies that country values across clients + sites are either NULL,
-- empty string, or one of the 5 canonical enum values (Canada / USA /
-- UAE / India / Ireland).
--
-- 6 checks total (3 columns × 2 tables). FAILs-first ordering surfaces
-- any non-canonical rows at the top of the result panel. ROLLBACK at
-- the end keeps the TEMP table clean for re-runs.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── clients (3 checks) ─────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'clients.country values are valid',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE country IS NOT NULL AND country != ''
      AND country NOT IN ('Canada','USA','UAE','India','Ireland')
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'clients.billing_country values are valid',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE billing_country IS NOT NULL AND billing_country != ''
      AND billing_country NOT IN ('Canada','USA','UAE','India','Ireland')
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'clients.mailing_country values are valid',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE mailing_country IS NOT NULL AND mailing_country != ''
      AND mailing_country NOT IN ('Canada','USA','UAE','India','Ireland')
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── sites (3 checks) ───────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'sites.country values are valid',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.sites
    WHERE country IS NOT NULL AND country != ''
      AND country NOT IN ('Canada','USA','UAE','India','Ireland')
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'sites.billing_country values are valid',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.sites
    WHERE billing_country IS NOT NULL AND billing_country != ''
      AND billing_country NOT IN ('Canada','USA','UAE','India','Ireland')
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'sites.mailing_country values are valid',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.sites
    WHERE mailing_country IS NOT NULL AND mailing_country != ''
      AND mailing_country NOT IN ('Canada','USA','UAE','India','Ireland')
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ──────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

ROLLBACK;
