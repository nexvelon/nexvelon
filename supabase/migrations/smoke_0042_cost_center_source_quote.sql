-- ============================================================================
-- Nexvelon · PROJ-2 — Post-deploy Smoke Verification (migration 0042)
-- ============================================================================
-- Run AFTER 0042_cost_center_source_quote.sql has been applied. Pure-read.
-- Verifies project_cost_centers.source_quote_id exists + is text, the FK to
-- quotes, and the index by name.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'project_cost_centers.source_quote_id is text',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_cost_centers'
      AND column_name='source_quote_id' AND data_type='text'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'source_quote_id FK -> quotes(id) exists',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type='FOREIGN KEY'
      AND tc.table_schema='public' AND tc.table_name='project_cost_centers'
      AND kcu.column_name='source_quote_id'
      AND ccu.table_name='quotes'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index project_cost_centers_source_quote_idx exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='project_cost_centers_source_quote_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
