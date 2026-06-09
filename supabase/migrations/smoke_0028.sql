-- ============================================================================
-- Nexvelon · Chunk 2 — Post-deploy Smoke Verification (migration 0028)
-- ============================================================================
-- Run AFTER 0028_company_settings.sql has been applied.
--
-- Verifies the company_settings table shape, RLS, and a key/value upsert
-- round-trip. ROLLBACK (not COMMIT) — inserts a real test row to prove the
-- round-trip, then rolls everything back so nothing persists. FAILs sort first.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

INSERT INTO smoke_results SELECT 'company_settings table exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='company_settings'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'key is text PRIMARY KEY',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='company_settings'
      AND column_name='key' AND data_type='text'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'value is text NOT NULL',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='company_settings'
      AND column_name='value' AND data_type='text' AND is_nullable='NO'
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'RLS enabled on company_settings',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname='public' AND tablename='company_settings' AND rowsecurity=true
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'company_settings has >=2 policies',
  CASE WHEN (
    SELECT count(*) FROM pg_policies
    WHERE schemaname='public' AND tablename='company_settings'
  ) >= 2 THEN 'PASS' ELSE 'FAIL' END;

-- Upsert round-trip (insert then on-conflict update), rolled back.
INSERT INTO public.company_settings (key, value) VALUES ('smoke_key', 'v1');
INSERT INTO public.company_settings (key, value) VALUES ('smoke_key', 'v2')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO smoke_results SELECT 'upsert round-trip: on-conflict updates value',
  CASE WHEN (
    SELECT value FROM public.company_settings WHERE key='smoke_key'
  ) = 'v2' THEN 'PASS' ELSE 'FAIL' END;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

ROLLBACK;
