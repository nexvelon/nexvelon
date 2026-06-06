-- ============================================================================
-- Nexvelon · Chunk F-1a — Post-deploy Smoke Verification (migration 0027)
-- ============================================================================
-- Run AFTER 0027_quotes.sql has been applied.
--
-- Verifies the quotes table shape, the status CHECK, RLS, and a jsonb
-- insert/select round-trip. Uses ROLLBACK (not COMMIT) — it inserts a real test
-- row to prove the round-trip, then rolls everything (incl. the TEMP table) back
-- so no quote is persisted. FAILs sort to the top.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── TABLE + COLUMNS ─────────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'quotes table exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='quotes'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'id is text PRIMARY KEY',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quotes'
      AND column_name='id' AND data_type='text'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'data is jsonb NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quotes'
      AND column_name='data' AND data_type='jsonb' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'mirror columns present (number/client_id/site_id/status/owner_id/total)',
  CASE WHEN (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quotes'
      AND column_name IN ('number','client_id','site_id','status','owner_id','total')
  ) = 6 THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'status CHECK constraint includes Converted',
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_column_usage ccu
      ON cc.constraint_name = ccu.constraint_name
     AND cc.constraint_schema = ccu.constraint_schema
    WHERE ccu.table_schema='public' AND ccu.table_name='quotes'
      AND ccu.column_name='status' AND cc.check_clause LIKE '%Converted%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- ─── RLS ─────────────────────────────────────────────────────────────────

INSERT INTO smoke_results SELECT 'RLS enabled on quotes',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='quotes' AND rowsecurity=true
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'quotes has >=2 policies',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='quotes'
  ) >= 2 THEN 'PASS' ELSE 'FAIL' END;

-- ─── JSONB ROUND-TRIP (insert a test row, read it back, rolled back) ──────

INSERT INTO public.quotes (id, number, status, total, data)
VALUES (
  'q-smoke-f1a',
  'Q-SMOKE-0001',
  'Draft',
  1234.56,
  '{"id":"q-smoke-f1a","sections":[{"id":"sec-1","name":"S","items":[]}],"total":1234.56}'::jsonb
);

INSERT INTO smoke_results SELECT 'jsonb round-trip: data->>id readable',
  CASE WHEN (
    SELECT data->>'id' FROM public.quotes WHERE id='q-smoke-f1a'
  ) = 'q-smoke-f1a' THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'jsonb round-trip: nested sections array preserved',
  CASE WHEN (
    SELECT jsonb_array_length(data->'sections') FROM public.quotes WHERE id='q-smoke-f1a'
  ) = 1 THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

-- ROLLBACK so the smoke test row never persists.
ROLLBACK;
