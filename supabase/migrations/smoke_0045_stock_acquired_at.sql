-- ============================================================================
-- Nexvelon · PART-DETAIL (Batch B2) — Post-deploy Smoke Verification (0045)
-- ============================================================================
-- Run AFTER 0045_stock_acquired_at.sql. Pure-read → COMMIT.
-- Verifies inventory_stock.acquired_at exists and is timestamptz.
-- (Intentionally simple — no array comparisons.)
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'inventory_stock.acquired_at is timestamptz',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='acquired_at' AND data_type='timestamp with time zone')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
