-- ============================================================================
-- Nexvelon · SERIAL-1 (Batch D2) — Post-deploy Smoke Verification (0047)
-- ============================================================================
-- Run AFTER 0047_serialized_parts.sql. Pure-read → COMMIT.
-- Verifies inventory_products.is_serialized (boolean) and
-- inventory_stock.serial_number (text). (Simple — no array comparisons.)
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'inventory_products.is_serialized is boolean NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='is_serialized' AND data_type='boolean' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_stock.serial_number is text',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='serial_number' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
