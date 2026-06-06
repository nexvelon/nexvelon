-- ============================================================================
-- Nexvelon · Chunk D-1 — Post-deploy Smoke Verification (migration 0026)
-- ============================================================================
-- Run AFTER 0026_product_addons.sql has been applied.
--
-- Verifies inventory_products.notify_addons (boolean NOT NULL default false)
-- and .addons (jsonb NOT NULL default '[]'). Pure-read verify — only a TEMP
-- table is written; FAILs sort to the top; COMMIT.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'notify_addons boolean NOT NULL DEFAULT false',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='notify_addons' AND data_type='boolean'
      AND is_nullable='NO' AND column_default LIKE '%false%'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'addons jsonb NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='addons' AND data_type='jsonb' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'addons default is empty array',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_products'
      AND column_name='addons' AND column_default LIKE '%[]%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
