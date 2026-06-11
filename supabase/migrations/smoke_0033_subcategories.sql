-- ============================================================================
-- Nexvelon · CAT-3 — Post-deploy Smoke Verification (migration 0033)
-- ============================================================================
-- Run AFTER 0033_subcategories.sql has been applied.
--
-- Verifies inventory_vocab.parent_id (uuid, self-FK ON DELETE CASCADE) + its
-- index, and inventory_products.subcategory (text) + its index. Pure-read
-- verify (no test rows written) → COMMIT. FAILs sort first.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'inventory_vocab.parent_id is uuid nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_vocab'
      AND column_name='parent_id' AND data_type='uuid' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'parent_id self-FK ON DELETE CASCADE',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.inventory_vocab'::regclass
      AND confrelid='public.inventory_vocab'::regclass
      AND contype='f' AND confdeltype='c'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index inventory_vocab_parent_id_idx exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='inventory_vocab'
      AND indexname='inventory_vocab_parent_id_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_products.subcategory is text nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='subcategory' AND data_type='text' AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'index inventory_products_subcategory_idx exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='inventory_products'
      AND indexname='inventory_products_subcategory_idx'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
