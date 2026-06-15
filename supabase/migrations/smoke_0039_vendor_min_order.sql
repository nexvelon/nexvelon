-- ============================================================================
-- Nexvelon · PARTS-4 — Post-deploy Smoke Verification (migration 0039)
-- ============================================================================
-- Run AFTER 0039_vendor_min_order.sql has been applied.
--
-- Verifies both new vendor columns exist with the expected types/nullability,
-- and that excluded_parts defaults to an empty jsonb array. Pure-read → COMMIT.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'vendors.min_order_amount is numeric, nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vendors'
      AND column_name='min_order_amount' AND data_type='numeric' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'vendors.excluded_parts is jsonb NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vendors'
      AND column_name='excluded_parts' AND data_type='jsonb' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'vendors.excluded_parts defaults to []',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='vendors'
      AND column_name='excluded_parts'
      AND column_default LIKE '%[]%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
