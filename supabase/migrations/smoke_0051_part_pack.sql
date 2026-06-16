-- ============================================================================
-- Nexvelon · PART-FIX-1 — Post-deploy Smoke Verification (0051)
-- ============================================================================
-- Run AFTER 0051_part_pack.sql. Pure-read → COMMIT.
-- Verifies inventory_products.pack_size (numeric, nullable) +
-- track_individual_units (boolean NOT NULL default false).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'inventory_products.pack_size is numeric nullable',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='pack_size' AND data_type='numeric' AND is_nullable='YES')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_products.track_individual_units is boolean NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='track_individual_units' AND data_type='boolean'
      AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'track_individual_units default is false',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='track_individual_units' AND column_default LIKE '%false%')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
