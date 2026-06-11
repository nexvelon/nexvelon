-- ============================================================================
-- Nexvelon · CAT-1 — Post-deploy Smoke Verification (migration 0032)
-- ============================================================================
-- Run AFTER 0032_part_identifiers.sql has been applied.
--
-- Verifies the three new inventory_products columns (upc, master_part_number,
-- replacement_part_number) and the two new indexes. Pure-read verify (no test
-- rows written) → COMMIT. FAILs sort first.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'upc is text nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='upc' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'master_part_number is text nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='master_part_number' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'replacement_part_number is text nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='replacement_part_number' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index inventory_products_upc_idx exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='inventory_products'
      AND indexname='inventory_products_upc_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index inventory_products_master_part_number_idx exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='inventory_products'
      AND indexname='inventory_products_master_part_number_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
