-- ============================================================================
-- Nexvelon · PART-FIX-2 — Post-deploy Smoke Verification (0052)
-- ============================================================================
-- Run AFTER 0052_category_tree.sql. Pure-read → COMMIT.
-- Verifies inventory_categories + columns + the self parent FK + the
-- UNIQUE(parent_id, name) + RLS + the two policies by name; and
-- inventory_products.category_id. (Simple — no array comparisons.)
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'table inventory_categories exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='inventory_categories')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_categories.name is text NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_categories'
      AND column_name='name' AND data_type='text' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_categories.parent_id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_categories'
      AND column_name='parent_id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;

-- self FK on parent_id
INSERT INTO smoke_results SELECT 'inventory_categories.parent_id has self FK',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_class rt ON rt.oid=c.confrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='inventory_categories'
      AND rt.relname='inventory_categories' AND c.contype='f')
  THEN 'PASS' ELSE 'FAIL' END;

-- UNIQUE (parent_id, name)
INSERT INTO smoke_results SELECT 'UNIQUE(parent_id, name) exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='inventory_categories' AND c.contype='u'
      AND (SELECT count(*) FROM unnest(c.conkey)) = 2)
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index inventory_categories_parent_idx exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='inventory_categories_parent_idx')
  THEN 'PASS' ELSE 'FAIL' END;

-- RLS + policies
INSERT INTO smoke_results SELECT 'RLS enabled on inventory_categories',
  CASE WHEN (SELECT c.relrowsecurity FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='inventory_categories')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results
SELECT 'policy ' || p || ' exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='inventory_categories' AND policyname=p)
  THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY[
  'inventory_categories_select_authenticated',
  'inventory_categories_write_authenticated'
]) AS p;

INSERT INTO smoke_results SELECT 'inventory_products.category_id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='category_id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
