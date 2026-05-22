-- smoke_cl5b.sql
-- CL-5b: Verify mailing address columns added to clients

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text);

-- Check 1: mailing_street column exists
INSERT INTO smoke_results
SELECT 'mailing_street column exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='mailing_street'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 2: mailing_unit column exists
INSERT INTO smoke_results
SELECT 'mailing_unit column exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='mailing_unit'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 3: mailing_city column exists
INSERT INTO smoke_results
SELECT 'mailing_city column exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='mailing_city'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 4: mailing_province column exists with default 'ON'
INSERT INTO smoke_results
SELECT 'mailing_province default is ON',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name='mailing_province'
      AND column_default LIKE '%ON%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 5: mailing_postal column exists
INSERT INTO smoke_results
SELECT 'mailing_postal column exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='mailing_postal'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 6: mailing_country column exists with default 'Canada'
INSERT INTO smoke_results
SELECT 'mailing_country default is Canada',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name='mailing_country'
      AND column_default LIKE '%Canada%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 7: mailing_same_as_billing column exists with default false and NOT NULL
INSERT INTO smoke_results
SELECT 'mailing_same_as_billing exists NOT NULL default false',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients'
      AND column_name='mailing_same_as_billing'
      AND is_nullable='NO'
      AND column_default LIKE '%false%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Report (FAILs first)
SELECT * FROM smoke_results ORDER BY status = 'PASS', check_name;

ROLLBACK;
