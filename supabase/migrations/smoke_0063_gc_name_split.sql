-- ============================================================================
-- Nexvelon · POLISH-10 — Post-deploy Smoke Verification (0063)
-- ============================================================================
-- Run AFTER 0063_gc_name_split.sql. Pure-read → COMMIT.
-- Verifies: gc_first_name + gc_last_name exist on public.sites and the old
-- gc_name column is gone.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'sites.gc_first_name exists (text)',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='gc_first_name' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'sites.gc_last_name exists (text)',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='gc_last_name' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'sites.gc_name is dropped',
  CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sites'
      AND column_name='gc_name')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
