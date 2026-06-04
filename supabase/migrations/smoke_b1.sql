-- ============================================================================
-- Nexvelon · Chunk B-1 — Post-deploy Smoke Verification (migration 0023)
-- ============================================================================
-- Run AFTER 0023_inventory_vocab.sql has been applied.
--
-- Verifies the inventory_vocab table shape, the seeded vocab per kind, the
-- UNIQUE(kind,name) constraint, and RLS. Pure-read verify — touches only a
-- TEMP table, no mutations. FAILs sort to the top of the single result panel.
-- COMMIT (not ROLLBACK) since only the TEMP table is written.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── TABLE + COLUMNS ─────────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'inventory_vocab table exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='inventory_vocab'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_vocab has kind/name/display_order/is_active columns',
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='inventory_vocab'
      AND column_name IN ('kind','name','display_order','is_active')
  ) = 4 THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'kind CHECK constraint exists (includes storage_location)',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='inventory_vocab'
      AND ccu.column_name='kind'
      AND cc.check_clause ILIKE '%storage_location%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── SEED COUNTS PER KIND ────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'unit_of_measure seeded = 7 rows',
  CASE WHEN (
    SELECT count(*) FROM public.inventory_vocab WHERE kind='unit_of_measure'
  ) = 7 THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'storage_location includes Default',
  CASE WHEN EXISTS (
    SELECT 1 FROM public.inventory_vocab
    WHERE kind='storage_location' AND name='Default'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'category includes Conduits/Fittings',
  CASE WHEN EXISTS (
    SELECT 1 FROM public.inventory_vocab
    WHERE kind='category' AND name='Conduits/Fittings'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'manufacturer seeded (>=13 rows)',
  CASE WHEN (
    SELECT count(*) FROM public.inventory_vocab WHERE kind='manufacturer'
  ) >= 13 THEN 'PASS' ELSE 'FAIL' END;

-- ─── CONSTRAINTS + RLS ───────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'UNIQUE(kind,name) constraint exists',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.constraint_schema = ccu.constraint_schema
    WHERE tc.table_schema='public' AND tc.table_name='inventory_vocab'
      AND tc.constraint_type='UNIQUE' AND ccu.column_name IN ('kind','name')
    GROUP BY tc.constraint_name
    HAVING count(DISTINCT ccu.column_name) = 2
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'RLS enabled on inventory_vocab',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='inventory_vocab' AND rowsecurity=true
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'inventory_vocab has >=2 policies',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='inventory_vocab'
  ) >= 2 THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
