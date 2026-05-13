-- ============================================================================
-- Nexvelon · Permissions Chunk 2 — Post-deploy Smoke Verification
-- ============================================================================
-- Run AFTER 0006_permissions_chunk_02_runtime_state.sql has been applied.
--
-- This file is designed for the Supabase Dashboard SQL Editor which only
-- renders the LAST query's result panel. All 7 checks aggregate into a
-- single TEMP table; the final SELECT returns one labelled result panel
-- containing every check's pass/fail/review status.
--
-- Each row in the final result has:
--   · ord          — sort order in the report
--   · check_id     — short identifier (e.g. 'C1', 'C2', ...)
--   · description  — human-readable check description
--   · expected     — what the check is testing for
--   · actual       — observed value from the database
--   · status       — 'PASS' / 'FAIL' / 'REVIEW' (REVIEW = needs eyeball diff)
--
-- The TEMP table drops on COMMIT so re-runs are clean.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  ord         NUMERIC,
  check_id    TEXT,
  description TEXT,
  expected    TEXT,
  actual      TEXT,
  status      TEXT
) ON COMMIT DROP;

-- ----------------------------------------------------------------------------
-- Check 1: 9 tables exist
-- ----------------------------------------------------------------------------
INSERT INTO smoke_results
SELECT
  1,
  'C1',
  'All 9 Chunk 2 tables exist in public schema',
  '9',
  COUNT(*)::TEXT,
  CASE WHEN COUNT(*) = 9 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'permission_grants',
    'field_visibility_grants',
    'data_scope_grants',
    'admin_access_requests',
    'user_role_assignments',
    'effective_permissions_cache',
    'effective_field_visibility_cache',
    'effective_data_scope_cache',
    'effective_status_bindings_cache'
  );

-- ----------------------------------------------------------------------------
-- Check 2: Every Chunk 2 table is empty (no seed data this chunk)
-- ----------------------------------------------------------------------------
INSERT INTO smoke_results
WITH counts AS (
  SELECT 'permission_grants'                AS t, COUNT(*) AS n FROM public.permission_grants
  UNION ALL SELECT 'field_visibility_grants',          COUNT(*) FROM public.field_visibility_grants
  UNION ALL SELECT 'data_scope_grants',                COUNT(*) FROM public.data_scope_grants
  UNION ALL SELECT 'admin_access_requests',            COUNT(*) FROM public.admin_access_requests
  UNION ALL SELECT 'user_role_assignments',            COUNT(*) FROM public.user_role_assignments
  UNION ALL SELECT 'effective_permissions_cache',      COUNT(*) FROM public.effective_permissions_cache
  UNION ALL SELECT 'effective_field_visibility_cache', COUNT(*) FROM public.effective_field_visibility_cache
  UNION ALL SELECT 'effective_data_scope_cache',       COUNT(*) FROM public.effective_data_scope_cache
  UNION ALL SELECT 'effective_status_bindings_cache',  COUNT(*) FROM public.effective_status_bindings_cache
)
SELECT
  2,
  'C2',
  'Every Chunk 2 table is empty (sum of row counts across all 9)',
  '0',
  SUM(n)::TEXT,
  CASE WHEN SUM(n) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM counts;

-- ----------------------------------------------------------------------------
-- Check 3: Zero triggers on any Chunk 2 table (triggers ship in Chunk 3/4)
-- ----------------------------------------------------------------------------
INSERT INTO smoke_results
SELECT
  3,
  'C3',
  'Zero triggers exist on any Chunk 2 table',
  '0',
  COUNT(*)::TEXT,
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN (
    'permission_grants',
    'field_visibility_grants',
    'data_scope_grants',
    'admin_access_requests',
    'user_role_assignments',
    'effective_permissions_cache',
    'effective_field_visibility_cache',
    'effective_data_scope_cache',
    'effective_status_bindings_cache'
  );

-- ----------------------------------------------------------------------------
-- Check 4: Total FK count across the 9 tables matches expected
--   permission_grants:             4   (user_id, permission_id, granted_by, revoked_by)
--   field_visibility_grants:       4   (user_id, flag_id, granted_by, revoked_by)
--   data_scope_grants:             3   (user_id, override_scope_id, granted_by)
--   admin_access_requests:         8   (requester, target_permission, target_flag,
--                                       target_scope, target_role, decided_by,
--                                       revoked_by, granted_override)
--   user_role_assignments:         4   (user_id, role_id, granted_by_request_id, revoked_by)
--   effective_permissions_cache:   2   (user_id, permission_id)
--   effective_field_visibility_cache: 2   (user_id, flag_id)
--   effective_data_scope_cache:    2   (user_id, resolved_scope_id)
--   effective_status_bindings_cache: 0
--   ---
--   TOTAL EXPECTED:               29
-- ----------------------------------------------------------------------------
INSERT INTO smoke_results
SELECT
  4,
  'C4',
  'Total FK count across the 9 Chunk 2 tables matches expected',
  '29',
  COUNT(*)::TEXT,
  CASE WHEN COUNT(*) = 29 THEN 'PASS' ELSE 'FAIL' END
FROM pg_constraint c
JOIN pg_class      t ON t.oid = c.conrelid
JOIN pg_namespace  n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND c.contype = 'f'
  AND t.relname IN (
    'permission_grants',
    'field_visibility_grants',
    'data_scope_grants',
    'admin_access_requests',
    'user_role_assignments',
    'effective_permissions_cache',
    'effective_field_visibility_cache',
    'effective_data_scope_cache',
    'effective_status_bindings_cache'
  );

-- ----------------------------------------------------------------------------
-- Check 5: Partial-index presence on the 4 grant/request tables
--   permission_grants, field_visibility_grants, data_scope_grants,
--   admin_access_requests — each must have at least one partial index
--   (pg_index.indpred IS NOT NULL).
-- ----------------------------------------------------------------------------
INSERT INTO smoke_results
WITH partials AS (
  SELECT DISTINCT t.relname AS tbl
  FROM pg_index i
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname IN (
      'permission_grants',
      'field_visibility_grants',
      'data_scope_grants',
      'admin_access_requests'
    )
    AND i.indpred IS NOT NULL
)
SELECT
  5,
  'C5',
  'Partial-index presence on the 4 grant/request tables',
  '4',
  COUNT(*)::TEXT,
  CASE WHEN COUNT(*) = 4 THEN 'PASS' ELSE 'FAIL' END
FROM partials;

-- ----------------------------------------------------------------------------
-- Check 6: Composite PK structure on the 4 cache tables
--   Each cache table's primary key constraint must have ≥ 2 columns.
--   Total cache tables with composite PK should equal 4.
-- ----------------------------------------------------------------------------
INSERT INTO smoke_results
WITH composite_pks AS (
  SELECT t.relname AS tbl,
         array_length(c.conkey, 1) AS pk_col_count
  FROM pg_constraint c
  JOIN pg_class      t ON t.oid = c.conrelid
  JOIN pg_namespace  n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND c.contype = 'p'
    AND t.relname IN (
      'effective_permissions_cache',
      'effective_field_visibility_cache',
      'effective_data_scope_cache',
      'effective_status_bindings_cache'
    )
)
SELECT
  6,
  'C6',
  'Composite PK (≥2 cols) on all 4 cache tables',
  '4',
  COUNT(*) FILTER (WHERE pk_col_count >= 2)::TEXT,
  CASE WHEN COUNT(*) FILTER (WHERE pk_col_count >= 2) = 4 THEN 'PASS' ELSE 'FAIL' END
FROM composite_pks;

-- ----------------------------------------------------------------------------
-- Check 7: Column listings for spot-diff — admin_access_requests,
--   permission_grants, user_role_assignments. Each row reports the
--   column count and a comma-joined column-name list for visual diff
--   against the design doc (Pass 7 §15.3, Pass 2 §11.4, Pass 7 §16.4).
--   These rows are tagged status = 'REVIEW' (no automated assertion).
-- ----------------------------------------------------------------------------
INSERT INTO smoke_results
SELECT
  7.1,
  'C7.1',
  'admin_access_requests column list (REVIEW — diff vs Pass 7 §15.3; expect 34 columns)',
  '34 columns',
  COUNT(*)::TEXT || ' columns: ' || string_agg(column_name, ', ' ORDER BY ordinal_position),
  'REVIEW'
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_access_requests';

INSERT INTO smoke_results
SELECT
  7.2,
  'C7.2',
  'permission_grants column list (REVIEW — diff vs Pass 2 §11.4 with rename)',
  '12 columns',
  COUNT(*)::TEXT || ' columns: ' || string_agg(column_name, ', ' ORDER BY ordinal_position),
  'REVIEW'
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'permission_grants';

INSERT INTO smoke_results
SELECT
  7.3,
  'C7.3',
  'user_role_assignments column list (REVIEW — diff vs Pass 7 §16.4)',
  '9 columns',
  COUNT(*)::TEXT || ' columns: ' || string_agg(column_name, ', ' ORDER BY ordinal_position),
  'REVIEW'
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_role_assignments';

-- ----------------------------------------------------------------------------
-- Final result: single panel with every check
-- ----------------------------------------------------------------------------
SELECT ord, check_id, description, expected, actual, status
FROM smoke_results
ORDER BY ord;

COMMIT;
