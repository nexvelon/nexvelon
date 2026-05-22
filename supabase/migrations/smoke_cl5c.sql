-- smoke_cl5c.sql
-- CL-5c: Verify phones JSONB column + backfill + dropped columns

BEGIN;

CREATE TEMP TABLE smoke_results (check_name text, status text);

-- Check 1: phones JSONB column exists with NOT NULL constraint
INSERT INTO smoke_results
SELECT 'phones JSONB column exists NOT NULL with default []',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contacts'
      AND column_name='phones'
      AND data_type='jsonb'
      AND is_nullable='NO'
      AND column_default LIKE '%[]%'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 2: CHECK constraint enforces array type
INSERT INTO smoke_results
SELECT 'phones CHECK constraint exists',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema='public'
      AND constraint_name='contacts_phones_is_array'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 3: phone column is dropped
INSERT INTO smoke_results
SELECT 'phone column dropped',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contacts' AND column_name='phone'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 4: mobile column is dropped
INSERT INTO smoke_results
SELECT 'mobile column dropped',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contacts' AND column_name='mobile'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 5: Backfill worked — any existing contacts have phones populated as array
-- (will PASS even if no contacts exist; only FAILs if there ARE contacts and phones is null)
INSERT INTO smoke_results
SELECT 'phones backfill — no null/non-array values',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.contacts
    WHERE phones IS NULL OR jsonb_typeof(phones) != 'array'
  ) THEN 'PASS' ELSE 'FAIL' END;

-- Check 6: CHECK constraint actually rejects non-array values (negative test)
DO $$
BEGIN
  INSERT INTO smoke_results VALUES ('CHECK rejects non-array (negative test)', 'FAIL');
  -- Try inserting a non-array — should fail due to CHECK
  INSERT INTO public.contacts (client_id, first_name, last_name, phones)
  VALUES (
    (SELECT id FROM public.clients LIMIT 1),
    'Smoke', 'Test', '{"not": "array"}'::jsonb
  );
EXCEPTION
  WHEN check_violation THEN
    UPDATE smoke_results SET status='PASS' WHERE check_name='CHECK rejects non-array (negative test)';
END $$;

-- Report (FAILs first)
SELECT * FROM smoke_results ORDER BY status = 'PASS', check_name;

ROLLBACK;
