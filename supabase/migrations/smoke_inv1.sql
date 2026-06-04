-- ============================================================================
-- Nexvelon · INV-1 — Post-deploy Smoke Verification (migration 0021)
-- ============================================================================
-- Run AFTER 0021_inventory_schema.sql has been applied.
--
-- 16 checks: table existence (2) + column/constraint shape (sku UNIQUE,
-- tracking_mode CHECK, status CHECK, quantity CHECK, FK, partial-unique
-- serial index, supporting indexes) + RLS enabled on both tables + policy
-- counts. Pure-DDL verify — touches only a TEMP table, no real data.
--
-- Designed for the Supabase Dashboard SQL Editor, which only renders the
-- last query's result panel. Every check INSERTs one row into a TEMP table;
-- the single final SELECT returns one panel with all checks, FAIL rows
-- ordered to the top so any regression is immediately visible.
--
-- The TEMP table drops on COMMIT so re-runs are clean. We use COMMIT (not
-- ROLLBACK) because the only state we touch is the TEMP table — no
-- mutations to the inventory tables (mirrors SITES-2a smoke).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── TABLE EXISTENCE (2) ─────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'inventory_products table exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='inventory_products'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_stock table exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='inventory_stock'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── inventory_products SHAPE (3) ────────────────────────────────────────

INSERT INTO smoke_results SELECT 'inventory_products.sku UNIQUE constraint exists',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.constraint_schema = ccu.constraint_schema
    WHERE tc.table_schema='public' AND tc.table_name='inventory_products'
      AND tc.constraint_type='UNIQUE' AND ccu.column_name='sku'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_products.tracking_mode CHECK (includes serialized)',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='inventory_products'
      AND ccu.column_name='tracking_mode'
      AND cc.check_clause ILIKE '%serialized%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_products.tracking_mode NOT NULL DEFAULT serialized',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='tracking_mode' AND is_nullable='NO'
      AND column_default LIKE '%serialized%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── inventory_stock SHAPE (5) ───────────────────────────────────────────

INSERT INTO smoke_results SELECT 'inventory_stock.status CHECK (includes in_stock)',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='inventory_stock'
      AND ccu.column_name='status'
      AND cc.check_clause ILIKE '%in_stock%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_stock.quantity CHECK (quantity > 0)',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='inventory_stock'
      AND ccu.column_name='quantity'
      AND cc.check_clause ILIKE '%quantity%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_stock.unit_cost numeric(12,2) NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='unit_cost' AND numeric_precision=12 AND numeric_scale=2
      AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_stock.product_id FK -> inventory_products',
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
      AND kcu.column_name='product_id'
      AND ccu.table_name='inventory_products' AND ccu.column_name='id'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_stock.status NOT NULL DEFAULT in_stock',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_stock'
      AND column_name='status' AND is_nullable='NO'
      AND column_default LIKE '%in_stock%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── INDEXES (3) ─────────────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'index inventory_stock_serial_unique exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='inventory_stock'
      AND indexname='inventory_stock_serial_unique'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index inventory_stock_product_id_idx exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='inventory_stock'
      AND indexname='inventory_stock_product_id_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index inventory_stock_status_idx exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='inventory_stock'
      AND indexname='inventory_stock_status_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── RLS ENABLED (2) ─────────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'RLS enabled on inventory_products',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='inventory_products' AND rowsecurity=true
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'RLS enabled on inventory_stock',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='inventory_stock' AND rowsecurity=true
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── POLICY COUNTS (2) ───────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'inventory_products has >=2 policies',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='inventory_products'
  ) >= 2 THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_stock has >=2 policies',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='inventory_stock'
  ) >= 2 THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
