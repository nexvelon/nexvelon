-- ============================================================================
-- Nexvelon · QB-11 — Post-deploy Smoke Verification (migration 0009)
-- ============================================================================
-- Run AFTER 0009_classifications_service_applies_to.sql has been applied.
-- Dashboard SQL Editor format: one TEMP table, single final SELECT, FAILs
-- first, ROLLBACK (read-only — the DO-block insert tests clean up after
-- themselves and the whole tx is rolled back regardless).
--
-- NOTE: checks 2/3/4/7 assume the 'Warranty Cost' and 'Service Cost'
-- classifications exist in THIS environment (operator-added via the Phase 3
-- admin UI — they are NOT in the 0008 seed) and that the table has 13 rows.
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

-- Check 1: applies_to CHECK constraint now includes 'service'
INSERT INTO smoke_results VALUES (1, 'check_includes_service',
  'applies_to CHECK constraint includes ''service''', 'true',
  (SELECT (count(*) > 0)::text FROM pg_constraint c
   JOIN pg_class cl ON cl.oid = c.conrelid
   WHERE cl.relname = 'line_item_classifications' AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ILIKE '%service%'),
  CASE WHEN (SELECT count(*) FROM pg_constraint c
             JOIN pg_class cl ON cl.oid = c.conrelid
             WHERE cl.relname = 'line_item_classifications' AND c.contype = 'c'
               AND pg_get_constraintdef(c.oid) ILIKE '%service%') > 0
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 2: Warranty Cost row is applies_to='service'
INSERT INTO smoke_results VALUES (2, 'warranty_is_service',
  'Warranty Cost row has applies_to=service', 'service',
  (SELECT coalesce(max(applies_to), '(missing)') FROM public.line_item_classifications WHERE name = 'Warranty Cost'),
  CASE WHEN (SELECT count(*) FROM public.line_item_classifications WHERE name = 'Warranty Cost' AND applies_to = 'service') > 0 THEN 'PASS' ELSE 'FAIL' END);

-- Check 3: Service Cost row is applies_to='service'
INSERT INTO smoke_results VALUES (3, 'servicecost_is_service',
  'Service Cost row has applies_to=service', 'service',
  (SELECT coalesce(max(applies_to), '(missing)') FROM public.line_item_classifications WHERE name = 'Service Cost'),
  CASE WHEN (SELECT count(*) FROM public.line_item_classifications WHERE name = 'Service Cost' AND applies_to = 'service') > 0 THEN 'PASS' ELSE 'FAIL' END);

-- Check 4: no remaining 'labor' rows named Warranty Cost / Service Cost
INSERT INTO smoke_results VALUES (4, 'no_labor_warranty_service',
  'No Warranty/Service Cost rows still applies_to=labor', '0',
  (SELECT count(*)::text FROM public.line_item_classifications
   WHERE name IN ('Warranty Cost', 'Service Cost') AND applies_to = 'labor'),
  CASE WHEN (SELECT count(*) FROM public.line_item_classifications
             WHERE name IN ('Warranty Cost', 'Service Cost') AND applies_to = 'labor') = 0
       THEN 'PASS' ELSE 'FAIL' END);

-- Check 5: INSERT with applies_to='service' succeeds
DO $$
BEGIN
  BEGIN
    INSERT INTO public.line_item_classifications (name, applies_to, display_order)
      VALUES ('__smoke_service__', 'service', 999);
    DELETE FROM public.line_item_classifications WHERE name = '__smoke_service__';
    INSERT INTO smoke_results VALUES (5, 'insert_service_ok',
      'INSERT applies_to=service succeeds', 'success', 'success', 'PASS');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_results VALUES (5, 'insert_service_ok',
      'INSERT applies_to=service succeeds', 'success', SQLERRM, 'FAIL');
  END;
END $$;

-- Check 6: INSERT with applies_to='invalid' is rejected by the CHECK
DO $$
BEGIN
  BEGIN
    INSERT INTO public.line_item_classifications (name, applies_to, display_order)
      VALUES ('__smoke_invalid__', 'invalid', 999);
    DELETE FROM public.line_item_classifications WHERE name = '__smoke_invalid__';
    INSERT INTO smoke_results VALUES (6, 'insert_invalid_rejected',
      'INSERT applies_to=invalid is rejected', 'rejected', 'accepted (BAD)', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO smoke_results VALUES (6, 'insert_invalid_rejected',
      'INSERT applies_to=invalid is rejected', 'rejected', 'rejected', 'PASS');
  END;
END $$;

-- Check 7: total row count still 13 (no rows lost by the migration)
INSERT INTO smoke_results VALUES (7, 'row_count_13',
  'Total classification rows still 13', '13',
  (SELECT count(*)::text FROM public.line_item_classifications),
  CASE WHEN (SELECT count(*) FROM public.line_item_classifications) = 13 THEN 'PASS' ELSE 'FAIL' END);

-- ----------------------------------------------------------------------------
-- Consolidated panel — FAIL rows first, then ord.
-- ----------------------------------------------------------------------------
SELECT ord, check_id, description, expected, actual, status
FROM smoke_results
ORDER BY (status = 'PASS'), ord;

ROLLBACK;
