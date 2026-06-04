-- ============================================================================
-- Nexvelon · Chunk C-2a — Post-deploy Smoke Verification (migration 0025)
-- ============================================================================
-- Run AFTER 0025_nonserial_and_po.sql has been applied.
--
-- Verifies the tracking_mode CHECK now permits 'non_serialized' WITHOUT having
-- dropped 'serialized'/'bulk' (widen-not-narrow, §2.1), and that
-- inventory_stock.po_number exists. Pure-read via information_schema (no INSERT,
-- so a not-yet-widened constraint can't abort the result panel) — touches only
-- a TEMP table. FAILs sort to the top; COMMIT (only the TEMP table is written).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'tracking_mode CHECK now allows non_serialized',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='inventory_products'
      AND ccu.column_name='tracking_mode'
      AND cc.check_clause ILIKE '%non_serialized%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'tracking_mode CHECK still allows serialized + bulk (widen, not narrow)',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='inventory_products'
      AND ccu.column_name='tracking_mode'
      AND cc.check_clause ILIKE '%serialized%' AND cc.check_clause ILIKE '%bulk%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_stock.po_number column exists (text nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='po_number' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
