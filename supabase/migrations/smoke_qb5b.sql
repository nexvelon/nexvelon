-- ============================================================================
-- Nexvelon · QB-5b — Post-deploy Smoke Verification (migration 0008)
-- ============================================================================
-- Run AFTER 0008_line_item_classifications.sql has been applied.
--
-- Designed for the Supabase Dashboard SQL Editor, which only renders the
-- LAST query's result panel. Every check INSERTs one row into a TEMP table;
-- the single final SELECT returns one panel with all checks, FAILs first.
-- Column shape matches the established smoke_chunk_01/02 / smoke_cl2 convention
-- (ord, check_id, description, expected, actual, status). Read-only: ROLLBACK.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  ord         integer,
  check_id    text,
  description text,
  expected    text,
  actual      text,
  status      text
);

-- Check 1: table exists
INSERT INTO smoke_results VALUES (1, 'table_exists',
  'public.line_item_classifications exists', 'true',
  (SELECT (count(*) > 0)::text FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'line_item_classifications'),
  CASE WHEN (SELECT count(*) FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'line_item_classifications') > 0
       THEN 'PASS' ELSE 'FAIL' END);

-- Checks 2-6: each seed row exists
INSERT INTO smoke_results VALUES (2, 'seed_materials', 'Materials seed row exists', 'true',
  (SELECT (count(*) > 0)::text FROM public.line_item_classifications WHERE name = 'Materials'),
  CASE WHEN (SELECT count(*) FROM public.line_item_classifications WHERE name = 'Materials') > 0 THEN 'PASS' ELSE 'FAIL' END);
INSERT INTO smoke_results VALUES (3, 'seed_subcontractor', 'Subcontractor Labour seed row exists', 'true',
  (SELECT (count(*) > 0)::text FROM public.line_item_classifications WHERE name = 'Subcontractor Labour'),
  CASE WHEN (SELECT count(*) FROM public.line_item_classifications WHERE name = 'Subcontractor Labour') > 0 THEN 'PASS' ELSE 'FAIL' END);
INSERT INTO smoke_results VALUES (4, 'seed_technician', 'Technician Labour seed row exists', 'true',
  (SELECT (count(*) > 0)::text FROM public.line_item_classifications WHERE name = 'Technician Labour'),
  CASE WHEN (SELECT count(*) FROM public.line_item_classifications WHERE name = 'Technician Labour') > 0 THEN 'PASS' ELSE 'FAIL' END);
INSERT INTO smoke_results VALUES (5, 'seed_pm', 'Project Management seed row exists', 'true',
  (SELECT (count(*) > 0)::text FROM public.line_item_classifications WHERE name = 'Project Management'),
  CASE WHEN (SELECT count(*) FROM public.line_item_classifications WHERE name = 'Project Management') > 0 THEN 'PASS' ELSE 'FAIL' END);
INSERT INTO smoke_results VALUES (6, 'seed_misc', 'Misc seed row exists', 'true',
  (SELECT (count(*) > 0)::text FROM public.line_item_classifications WHERE name = 'Misc'),
  CASE WHEN (SELECT count(*) FROM public.line_item_classifications WHERE name = 'Misc') > 0 THEN 'PASS' ELSE 'FAIL' END);

-- Check 7: applies_to CHECK constraint enforces the enum
INSERT INTO smoke_results VALUES (7, 'check_applies_to',
  'applies_to CHECK constraint covers product/labor/misc/both', 'all four present',
  (SELECT string_agg(v, ',' ORDER BY v) FROM (
     SELECT unnest(ARRAY['product','labor','misc','both']) AS v
   ) t WHERE EXISTS (
     SELECT 1 FROM pg_constraint c
     JOIN pg_class cl ON cl.oid = c.conrelid
     WHERE cl.relname = 'line_item_classifications'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%' || t.v || '%'
   )),
  CASE WHEN (SELECT count(*) FROM pg_constraint c
             JOIN pg_class cl ON cl.oid = c.conrelid
             WHERE cl.relname = 'line_item_classifications' AND c.contype = 'c'
               AND pg_get_constraintdef(c.oid) ILIKE '%product%'
               AND pg_get_constraintdef(c.oid) ILIKE '%labor%'
               AND pg_get_constraintdef(c.oid) ILIKE '%misc%'
               AND pg_get_constraintdef(c.oid) ILIKE '%both%') > 0
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 8: name UNIQUE constraint
INSERT INTO smoke_results VALUES (8, 'unique_name',
  'name has a UNIQUE constraint', 'true',
  (SELECT (count(*) > 0)::text FROM pg_constraint c
   JOIN pg_class cl ON cl.oid = c.conrelid
   WHERE cl.relname = 'line_item_classifications' AND c.contype = 'u'),
  CASE WHEN (SELECT count(*) FROM pg_constraint c
             JOIN pg_class cl ON cl.oid = c.conrelid
             WHERE cl.relname = 'line_item_classifications' AND c.contype = 'u') > 0
       THEN 'PASS' ELSE 'FAIL' END);

-- Checks 9-11: indexes exist
INSERT INTO smoke_results VALUES (9, 'idx_applies_to', 'index on applies_to exists', 'true',
  (SELECT (count(*) > 0)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_line_item_classifications_applies_to'),
  CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_line_item_classifications_applies_to') > 0 THEN 'PASS' ELSE 'FAIL' END);
INSERT INTO smoke_results VALUES (10, 'idx_display_order', 'index on display_order exists', 'true',
  (SELECT (count(*) > 0)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_line_item_classifications_display_order'),
  CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_line_item_classifications_display_order') > 0 THEN 'PASS' ELSE 'FAIL' END);
INSERT INTO smoke_results VALUES (11, 'idx_is_active', 'partial index on is_active exists', 'true',
  (SELECT (count(*) > 0)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_line_item_classifications_is_active'),
  CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_line_item_classifications_is_active') > 0 THEN 'PASS' ELSE 'FAIL' END);

-- Check 12: RLS enabled
INSERT INTO smoke_results VALUES (12, 'rls_enabled', 'RLS enabled on the table', 'true',
  (SELECT relrowsecurity::text FROM pg_class WHERE relname = 'line_item_classifications'),
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE relname = 'line_item_classifications') = true THEN 'PASS' ELSE 'FAIL' END);

-- Check 13: updated_at trigger exists
INSERT INTO smoke_results VALUES (13, 'updated_at_trigger', 'updated_at trigger exists', 'true',
  (SELECT (count(*) > 0)::text FROM pg_trigger WHERE tgname = 'set_line_item_classifications_updated_at'),
  CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgname = 'set_line_item_classifications_updated_at') > 0 THEN 'PASS' ELSE 'FAIL' END);

-- Check 14: seed count matches expected
INSERT INTO smoke_results VALUES (14, 'seed_count', '5 seed rows present', '5',
  (SELECT count(*)::text FROM public.line_item_classifications),
  CASE WHEN (SELECT count(*) FROM public.line_item_classifications) = 5 THEN 'PASS' ELSE 'FAIL' END);

-- ----------------------------------------------------------------------------
-- Consolidated panel — FAIL rows first, then ord.
-- ----------------------------------------------------------------------------
SELECT ord, check_id, description, expected, actual, status
FROM smoke_results
ORDER BY (status = 'PASS'), ord;

ROLLBACK;
