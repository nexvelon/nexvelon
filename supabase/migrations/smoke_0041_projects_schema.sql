-- ============================================================================
-- Nexvelon · PROJ-1 — Post-deploy Smoke Verification (migration 0041)
-- ============================================================================
-- Run AFTER 0041_projects_schema.sql has been applied. Pure-read → COMMIT.
-- Verifies the three tables + key columns, the FK column types (quote FKs =
-- text, client/site = uuid), RLS enabled on all three, the six policies by
-- name, and the four indexes by name.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── Tables exist ────────────────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'table ' || t || ' exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=t
  ) THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY['projects','project_quotes','project_cost_centers']) AS t;

-- ─── Key columns + types ─────────────────────────────────────────────────
-- quote FKs are text
INSERT INTO smoke_results SELECT 'projects.originating_quote_id is text',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projects'
      AND column_name='originating_quote_id' AND data_type='text')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'project_quotes.quote_id is text NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_quotes'
      AND column_name='quote_id' AND data_type='text' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;
-- client/site are uuid
INSERT INTO smoke_results SELECT 'projects.client_id is uuid NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projects'
      AND column_name='client_id' AND data_type='uuid' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'projects.site_id is uuid',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projects'
      AND column_name='site_id' AND data_type='uuid')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'projects.project_number is text NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='projects'
      AND column_name='project_number' AND data_type='text' AND is_nullable='NO')
  THEN 'PASS' ELSE 'FAIL' END;
INSERT INTO smoke_results SELECT 'project_cost_centers.cc_number + name present',
  CASE WHEN (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='project_cost_centers'
      AND column_name IN ('cc_number','name','sort_order')) = 3
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── RLS enabled on all three ────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'RLS enabled on ' || c.relname,
  CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('projects','project_quotes','project_cost_centers');

-- ─── Six policies by name ────────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'policy ' || p || ' exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND policyname=p)
  THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY[
  'projects_select_authenticated','projects_write_authenticated',
  'project_quotes_select_authenticated','project_quotes_write_authenticated',
  'pcc_select_authenticated','pcc_write_authenticated'
]) AS p;

-- ─── Four indexes by name ────────────────────────────────────────────────
INSERT INTO smoke_results
SELECT 'index ' || i || ' exists',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname=i)
  THEN 'PASS' ELSE 'FAIL' END
FROM unnest(ARRAY[
  'projects_client_idx','projects_site_idx',
  'project_quotes_project_idx','project_cost_centers_project_idx'
]) AS i;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

COMMIT;
