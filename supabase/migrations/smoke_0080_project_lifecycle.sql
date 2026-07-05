-- smoke_0080_project_lifecycle.sql
-- Verify projects.status CHECK + activity_log 'project' widening.
-- Corrected to the REAL activity_log schema (0016): columns are
-- (entity_type, entity_id uuid, action CHECK IN ('create','update','delete'),
-- changes jsonb, actor_id) — there is NO `payload` column and `action` is an
-- enum, so the probe uses action='create' + changes (not a free-text action).

-- 1. Status CHECK rejects a bad value.
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.projects LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'skip: no projects to test status CHECK';
  ELSE
    BEGIN
      UPDATE public.projects SET status = 'garbage_status' WHERE id = v_id;
      RAISE EXCEPTION 'smoke fail: bad status accepted';
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'ok: bad status rejected';
    END;
  END IF;
END $$;

-- 2. Status CHECK accepts each valid value, then RESTORES the original (no net
--    data change — captures the original status and writes it back at the end).
DO $$
DECLARE v_id uuid; v_orig text; s text;
BEGIN
  SELECT id, status INTO v_id, v_orig FROM public.projects LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'skip: no projects to test valid statuses';
    RETURN;
  END IF;
  FOREACH s IN ARRAY ARRAY['active','on_hold','substantially_complete','closed','cancelled']
  LOOP
    BEGIN
      UPDATE public.projects SET status = s WHERE id = v_id;
    EXCEPTION WHEN check_violation THEN
      RAISE EXCEPTION 'smoke fail: valid status % rejected', s;
    END;
  END LOOP;
  -- Restore the original status so the smoke leaves no trace.
  UPDATE public.projects SET status = v_orig WHERE id = v_id;
  RAISE NOTICE 'ok: all five statuses accepted (original restored)';
END $$;

-- 3. activity_log accepts entity_type = 'project' (real columns: action enum +
--    changes jsonb). Probe inserted then deleted by id.
DO $$
DECLARE v_project_id uuid; v_log_id uuid;
BEGIN
  SELECT id INTO v_project_id FROM public.projects LIMIT 1;
  IF v_project_id IS NULL THEN
    RAISE NOTICE 'skip: no projects to test activity_log';
    RETURN;
  END IF;
  INSERT INTO public.activity_log (entity_type, entity_id, action, changes, actor_id)
  VALUES ('project', v_project_id, 'create', '{}'::jsonb, NULL)
  RETURNING id INTO v_log_id;
  DELETE FROM public.activity_log WHERE id = v_log_id;
  RAISE NOTICE 'ok: activity_log accepts project';
END $$;
