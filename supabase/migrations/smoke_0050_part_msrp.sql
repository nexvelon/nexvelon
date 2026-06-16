-- ============================================================================
-- Nexvelon · PART-FORM-2 — Post-deploy Smoke Verification (0050)
-- ============================================================================
-- Run AFTER 0050_part_msrp.sql. Pure-read → COMMIT.
-- Verifies inventory_products.msrp (numeric, nullable) + margin_tier_id (uuid,
-- FK to margin_tiers). (Simple — no array comparisons.)
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'inventory_products.msrp is numeric nullable',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='msrp' AND data_type='numeric' AND is_nullable='YES')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_products.margin_tier_id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='margin_tier_id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'margin_tier_id has FK to margin_tiers',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='inventory_products' AND c.contype='f'
      AND c.conname LIKE '%margin_tier_id%')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
