-- ============================================================================
-- Nexvelon · MOVE-1 (Batch D1) — Post-deploy Smoke Verification (0046)
-- ============================================================================
-- Run AFTER 0046_stock_locations_and_movements.sql. Pure-read → COMMIT.
-- Verifies: stock_locations + stock_movements + key columns; the two new
-- inventory_stock columns + FK types (uuid); the seeded Main Warehouse row;
-- RLS on both; the policies by name (movements = SELECT + INSERT only, no
-- write-all); the two indexes by name. (Simple — no array comparisons.)
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── Tables ──────────────────────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'table ' || t || ' exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=t)
  THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY['stock_locations','stock_movements']) AS t;

-- ─── stock_locations columns ─────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'stock_locations.name is text NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_locations'
      AND column_name='name' AND data_type='text' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'stock_locations location_type/holder_name/is_active present',
  CASE WHEN (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_locations'
      AND column_name IN ('location_type','holder_name','is_active')) = 3
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── stock_movements columns ─────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'stock_movements.product_id is uuid NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_movements'
      AND column_name='product_id' AND data_type='uuid' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'stock_movements from_/to_ + moved_by columns present',
  CASE WHEN (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_movements'
      AND column_name IN ('from_type','from_id','from_label','to_type','to_id',
                          'to_label','moved_by','moved_by_name','quantity','note')) = 10
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── inventory_stock new columns + FK types (uuid) ───────────────────────
INSERT INTO smoke_results SELECT 'inventory_stock.current_location_id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='current_location_id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'inventory_stock.current_cost_center_id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='current_cost_center_id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── Seeded Main Warehouse ───────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'Main Warehouse seeded',
  CASE WHEN EXISTS (SELECT 1 FROM public.stock_locations
    WHERE name='Main Warehouse' AND location_type='warehouse')
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── RLS enabled on both ─────────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'RLS enabled on ' || c.relname,
  CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('stock_locations','stock_movements');

-- ─── Policies by name ────────────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'policy ' || p || ' exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND policyname=p)
  THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY[
  'stock_locations_select_authenticated','stock_locations_write_authenticated',
  'stock_movements_select_authenticated','stock_movements_insert_authenticated'
]) AS p;

-- movements must NOT have a write-all (FOR ALL) policy — append-only.
INSERT INTO smoke_results SELECT 'stock_movements has no write-all policy',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='stock_movements' AND cmd='ALL')
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── Indexes by name ─────────────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'index ' || i || ' exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname=i)
  THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY['stock_movements_product_idx','stock_movements_stock_idx']) AS i;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
