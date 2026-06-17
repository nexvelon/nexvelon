-- ============================================================================
-- Nexvelon · QUOTE-LABOUR — Post-deploy Smoke Verification (0055)
-- ============================================================================
-- Run AFTER 0055_quote_labour.sql. Pure-read → COMMIT.
-- Verifies: app_settings table + columns; RLS enabled; the two named policies;
-- and the seeded default_labour_sell_rate row (= 125).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ── table + columns ───────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'table app_settings exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='app_settings')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'app_settings.key is text PRIMARY KEY',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='public' AND c.table_name='app_settings'
      AND c.column_name='key' AND c.data_type='text' AND c.is_nullable='NO')
  AND EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class t ON t.oid=con.conrelid
    JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum = ANY(con.conkey)
    WHERE t.relname='app_settings' AND con.contype='p' AND a.attname='key')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'app_settings.value_text is text nullable',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='app_settings'
      AND column_name='value_text' AND data_type='text' AND is_nullable='YES')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'app_settings.value_numeric is numeric nullable',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='app_settings'
      AND column_name='value_numeric' AND data_type='numeric' AND is_nullable='YES')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── RLS ───────────────────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'RLS enabled on app_settings',
  CASE WHEN EXISTS (SELECT 1 FROM pg_class WHERE relname='app_settings' AND relrowsecurity)
  THEN 'PASS' ELSE 'FAIL' END;

-- ── policies by name ──────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'policy app_settings_select_authenticated exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='app_settings'
      AND policyname='app_settings_select_authenticated')
  THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'policy app_settings_write_authenticated exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='app_settings'
      AND policyname='app_settings_write_authenticated')
  THEN 'PASS' ELSE 'FAIL' END;

-- ── seeded row ────────────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'seed default_labour_sell_rate = 125',
  CASE WHEN EXISTS (SELECT 1 FROM public.app_settings
    WHERE key='default_labour_sell_rate' AND value_numeric=125)
  THEN 'PASS' ELSE 'FAIL' END;

SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
