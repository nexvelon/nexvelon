-- ============================================================================
-- Nexvelon · PART-FORM (Batch B1) — Post-deploy Smoke Verification (0044)
-- ============================================================================
-- Run AFTER 0044_manufacturers_and_part_notes.sql. Pure-read → COMMIT.
-- Verifies: the manufacturers table + its columns, RLS enabled, the two
-- policies by name, and that inventory_products.notes exists (text).
-- (Intentionally simple — no name[]/text[] array comparisons.)
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── manufacturers table + columns ───────────────────────────────────────
INSERT INTO smoke_results SELECT 'table manufacturers exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='manufacturers')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'manufacturers.id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='manufacturers'
      AND column_name='id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'manufacturers.name is text NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='manufacturers'
      AND column_name='name' AND data_type='text' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'manufacturers timestamps present',
  CASE WHEN (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='manufacturers'
      AND column_name IN ('created_at','updated_at')) = 2
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── RLS enabled ─────────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'RLS enabled on manufacturers',
  CASE WHEN (SELECT c.relrowsecurity FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='manufacturers')
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── Policies by name ────────────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'policy ' || p || ' exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='manufacturers' AND policyname=p)
  THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY[
  'manufacturers_select_authenticated',
  'manufacturers_write_authenticated'
]) AS p;

-- ─── inventory_products.notes ────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'inventory_products.notes is text',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='notes' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical ─────────────────────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
