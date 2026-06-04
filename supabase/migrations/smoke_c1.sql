-- ============================================================================
-- Nexvelon · Chunk C-1 — Post-deploy Smoke Verification (migration 0024)
-- ============================================================================
-- Run AFTER 0024_product_search_aliases.sql has been applied.
--
-- Verifies inventory_products.search_aliases exists as text[] NOT NULL with a
-- '{}' default. Pure-read verify — touches only a TEMP table. FAILs sort to the
-- top of the single result panel; COMMIT (only the TEMP table is written).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'inventory_products.search_aliases column exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='search_aliases'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'search_aliases is an array type (text[])',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='search_aliases'
      AND data_type='ARRAY' AND udt_name='_text'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'search_aliases is NOT NULL with default {}',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='search_aliases'
      AND is_nullable='NO' AND column_default LIKE '%{}%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
