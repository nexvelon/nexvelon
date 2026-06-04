-- ============================================================================
-- Nexvelon · INV-3b — Post-deploy Smoke Verification (migration 0022)
-- ============================================================================
-- Run AFTER 0022_inventory_stock_site_allocation.sql has been applied.
--
-- 3 checks: inventory_stock.site_id column exists (uuid nullable) + FK to
-- public.sites + supporting index. Pure-DDL verify — touches only a TEMP table,
-- no real data. FAILs sort to the top of the single result panel.
--
-- COMMIT (not ROLLBACK) because only the TEMP table is mutated (mirrors
-- smoke_inv1 / SITES-2a).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'inventory_stock.site_id column exists (uuid nullable)',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='site_id' AND data_type='uuid' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_stock.site_id FK -> public.sites',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.constraint_schema = ccu.constraint_schema
    WHERE tc.constraint_type='FOREIGN KEY'
      AND tc.table_schema='public' AND tc.table_name='inventory_stock'
      AND kcu.column_name='site_id'
      AND ccu.table_name='sites' AND ccu.column_name='id'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index inventory_stock_site_id_idx exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='inventory_stock'
      AND indexname='inventory_stock_site_id_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
