-- smoke_0081_project_header_fields.sql
-- Verify the additive project header columns + backfill.

-- 1. Each new column exists with the expected type.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='projects'
    AND (
      (column_name='description'       AND data_type='text') OR
      (column_name='start_date'        AND data_type='date') OR
      (column_name='target_completion' AND data_type='date') OR
      (column_name='actual_completion' AND data_type='date') OR
      (column_name='pm_user_id'        AND data_type='uuid') OR
      (column_name='lead_tech_id'      AND data_type='uuid')
    );
  ASSERT n = 6, format('smoke fail: expected 6 header columns, got %s', n);
  RAISE NOTICE 'ok: all 6 header columns present with expected types';
END $$;

-- 2. Insert-then-rollback a row with all new fields set (needs a real client).
DO $$
DECLARE v_client uuid;
BEGIN
  SELECT id INTO v_client FROM public.clients LIMIT 1;
  IF v_client IS NULL THEN
    RAISE NOTICE 'skip: no clients to test full-field insert';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.projects (
      project_number, opco, client_id, title, status,
      description, start_date, target_completion, actual_completion,
      pm_user_id, lead_tech_id
    ) VALUES (
      'SMOKE-0081-PROJ', 'integrated_solutions', v_client, 'Smoke', 'active',
      'brief', '2026-01-01', '2026-06-01', NULL,
      gen_random_uuid(), gen_random_uuid()
    );
    RAISE NOTICE 'ok: full-field insert accepted';
    RAISE EXCEPTION 'rollback_smoke';  -- force rollback of this block
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'rollback_smoke' THEN RAISE; END IF;
  END;
END $$;
-- The probe row is discarded by the exception above; confirm it's gone.
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.projects WHERE project_number='SMOKE-0081-PROJ'),
    'smoke fail: probe project row leaked';
  RAISE NOTICE 'ok: probe row rolled back';
END $$;

-- 3. Backfill left no substantially_complete/closed row with NULL completion.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.projects
  WHERE status IN ('substantially_complete','closed')
    AND actual_completion IS NULL;
  ASSERT n = 0, format('smoke fail: %s completed/closed rows missing actual_completion', n);
  RAISE NOTICE 'ok: backfill complete (no completed/closed row without actual_completion)';
END $$;
