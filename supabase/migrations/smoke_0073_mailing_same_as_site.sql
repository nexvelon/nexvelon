-- ============================================================================
-- Nexvelon · POLISH-55 — Post-deploy Smoke Verification (0073)
-- ============================================================================
-- Run AFTER 0073_mailing_same_as_site.sql. Pure-read → COMMIT.
-- Verifies sites.mailing_same_as_site exists as boolean NOT NULL.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text) ON COMMIT DROP;

INSERT INTO smoke_results
SELECT 'sites.mailing_same_as_site exists (boolean NOT NULL)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='mailing_same_as_site'
      AND data_type='boolean' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status='PASS'), check_name;

COMMIT;
