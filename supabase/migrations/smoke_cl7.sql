-- smoke_cl7.sql
-- CL-7: Verify is_accounts_payable + contact_type_custom columns

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text);

-- Check 1: is_accounts_payable exists with correct type + NOT NULL + default false
INSERT INTO smoke_results
SELECT 'is_accounts_payable boolean NOT NULL DEFAULT false',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contacts'
      AND column_name='is_accounts_payable'
      AND data_type='boolean'
      AND is_nullable='NO'
      AND column_default LIKE '%false%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 2: contact_type_custom exists as nullable text
INSERT INTO smoke_results
SELECT 'contact_type_custom text nullable',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contacts'
      AND column_name='contact_type_custom'
      AND data_type='text'
      AND is_nullable='YES'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 3: existing rows defaulted is_accounts_payable=false (no NULL values)
INSERT INTO smoke_results
SELECT 'existing rows have is_accounts_payable=false (no nulls)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.contacts WHERE is_accounts_payable IS NULL
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 4: existing rows have contact_type_custom NULL (column added without default)
INSERT INTO smoke_results
SELECT 'existing rows have contact_type_custom=null',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE contact_type_custom IS NOT NULL AND contact_type_custom != ''
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Report (FAILs first)
SELECT * FROM smoke_results ORDER BY status = 'PASS', check_name;

ROLLBACK;
