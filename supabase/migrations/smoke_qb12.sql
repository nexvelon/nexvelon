-- ============================================================================
-- Nexvelon · QB-12 — Post-deploy Smoke Verification (migration 0010)
-- ============================================================================
-- Run AFTER 0010_margin_tiers.sql has been applied. Dashboard SQL Editor
-- format: one TEMP table, single final SELECT, FAILs first, ROLLBACK
-- (read-only — the DO-block insert test cleans up; whole tx rolls back).
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
  'public.margin_tiers exists', 'true',
  (SELECT (count(*) > 0)::text FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'margin_tiers'),
  CASE WHEN (SELECT count(*) FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'margin_tiers') > 0
       THEN 'PASS' ELSE 'FAIL' END);

-- Checks 2-6: each seed row exists
INSERT INTO smoke_results VALUES (2, 'seed_access_control', 'Access Control seed row exists', 'true',
  (SELECT (count(*) > 0)::text FROM public.margin_tiers WHERE category = 'Access Control'),
  CASE WHEN (SELECT count(*) FROM public.margin_tiers WHERE category = 'Access Control') > 0 THEN 'PASS' ELSE 'FAIL' END);
INSERT INTO smoke_results VALUES (3, 'seed_cctv', 'CCTV seed row exists', 'true',
  (SELECT (count(*) > 0)::text FROM public.margin_tiers WHERE category = 'CCTV'),
  CASE WHEN (SELECT count(*) FROM public.margin_tiers WHERE category = 'CCTV') > 0 THEN 'PASS' ELSE 'FAIL' END);
INSERT INTO smoke_results VALUES (4, 'seed_intrusion', 'Intrusion seed row exists', 'true',
  (SELECT (count(*) > 0)::text FROM public.margin_tiers WHERE category = 'Intrusion'),
  CASE WHEN (SELECT count(*) FROM public.margin_tiers WHERE category = 'Intrusion') > 0 THEN 'PASS' ELSE 'FAIL' END);
INSERT INTO smoke_results VALUES (5, 'seed_intercom', 'Intercom seed row exists', 'true',
  (SELECT (count(*) > 0)::text FROM public.margin_tiers WHERE category = 'Intercom'),
  CASE WHEN (SELECT count(*) FROM public.margin_tiers WHERE category = 'Intercom') > 0 THEN 'PASS' ELSE 'FAIL' END);
INSERT INTO smoke_results VALUES (6, 'seed_cabling_power', 'Cabling & Power seed row exists', 'true',
  (SELECT (count(*) > 0)::text FROM public.margin_tiers WHERE category = 'Cabling & Power'),
  CASE WHEN (SELECT count(*) FROM public.margin_tiers WHERE category = 'Cabling & Power') > 0 THEN 'PASS' ELSE 'FAIL' END);

-- Check 7: category UNIQUE constraint exists
INSERT INTO smoke_results VALUES (7, 'unique_category',
  'category has a UNIQUE constraint', 'true',
  (SELECT (count(*) > 0)::text FROM pg_constraint c
   JOIN pg_class cl ON cl.oid = c.conrelid
   WHERE cl.relname = 'margin_tiers' AND c.contype = 'u'),
  CASE WHEN (SELECT count(*) FROM pg_constraint c
             JOIN pg_class cl ON cl.oid = c.conrelid
             WHERE cl.relname = 'margin_tiers' AND c.contype = 'u') > 0
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 8: tier CHECK constraints reject a negative value
DO $$
BEGIN
  BEGIN
    INSERT INTO public.margin_tiers (category, tier_1, tier_2, tier_3, display_order)
      VALUES ('__smoke_negative__', -5, 10, 10, 999);
    DELETE FROM public.margin_tiers WHERE category = '__smoke_negative__';
    INSERT INTO smoke_results VALUES (8, 'check_tier_nonneg',
      'tier CHECK rejects negative %', 'rejected', 'accepted (BAD)', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_results VALUES (8, 'check_tier_nonneg',
      'tier CHECK rejects negative %', 'rejected', 'rejected', 'PASS');
  END;
END $$;

-- Check 9: display_order index
INSERT INTO smoke_results VALUES (9, 'idx_display_order', 'index on display_order exists', 'true',
  (SELECT (count(*) > 0)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_margin_tiers_display_order'),
  CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_margin_tiers_display_order') > 0 THEN 'PASS' ELSE 'FAIL' END);

-- Check 10: is_active partial index
INSERT INTO smoke_results VALUES (10, 'idx_is_active', 'partial index on is_active exists', 'true',
  (SELECT (count(*) > 0)::text FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_margin_tiers_is_active'),
  CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_margin_tiers_is_active') > 0 THEN 'PASS' ELSE 'FAIL' END);

-- Check 11: RLS enabled
INSERT INTO smoke_results VALUES (11, 'rls_enabled', 'RLS enabled on the table', 'true',
  (SELECT relrowsecurity::text FROM pg_class WHERE relname = 'margin_tiers'),
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE relname = 'margin_tiers') = true THEN 'PASS' ELSE 'FAIL' END);

-- Check 12: updated_at trigger exists
INSERT INTO smoke_results VALUES (12, 'updated_at_trigger', 'updated_at trigger exists', 'true',
  (SELECT (count(*) > 0)::text FROM pg_trigger WHERE tgname = 'set_margin_tiers_updated_at'),
  CASE WHEN (SELECT count(*) FROM pg_trigger WHERE tgname = 'set_margin_tiers_updated_at') > 0 THEN 'PASS' ELSE 'FAIL' END);

-- Check 13: seed count = 5
INSERT INTO smoke_results VALUES (13, 'row_count_5', '5 seed rows present', '5',
  (SELECT count(*)::text FROM public.margin_tiers),
  CASE WHEN (SELECT count(*) FROM public.margin_tiers) = 5 THEN 'PASS' ELSE 'FAIL' END);

-- ----------------------------------------------------------------------------
-- Consolidated panel — FAIL rows first, then ord.
-- ----------------------------------------------------------------------------
SELECT ord, check_id, description, expected, actual, status
FROM smoke_results
ORDER BY (status = 'PASS'), ord;

ROLLBACK;
