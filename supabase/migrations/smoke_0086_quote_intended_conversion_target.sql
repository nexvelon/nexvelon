-- smoke_0086_quote_intended_conversion_target.sql
-- Verify the two columns exist and the shape CHECK rejects/accepts correctly.
-- Each write is wrapped in a savepoint and rolled back so no quote row persists.

-- 1. Columns present.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'quotes'
     AND column_name IN ('intended_target_kind','intended_target_project_id');
  ASSERT n = 2, format('smoke fail: expected 2 target columns, found %s', n);
  RAISE NOTICE 'ok: intended_target_kind + intended_target_project_id present';
END $$;

-- 2 & 3. Shape CHECK — exercise rejects and accepts against a temp quote.
DO $$
DECLARE v_proj uuid;
BEGIN
  SELECT id INTO v_proj FROM public.projects LIMIT 1;

  -- ── Rejections ──
  -- new_project with a project_id set
  BEGIN
    INSERT INTO public.quotes (id, status, data, intended_target_kind, intended_target_project_id)
    VALUES ('smoke-0086-a', 'Draft', '{}'::jsonb, 'new_project', COALESCE(v_proj, gen_random_uuid()));
    RAISE EXCEPTION 'smoke fail: new_project with project_id accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: reject new_project + project_id';
            WHEN foreign_key_violation THEN RAISE NOTICE 'ok (FK): reject new_project + project_id';
  END;

  -- change_order with NULL project_id
  BEGIN
    INSERT INTO public.quotes (id, status, data, intended_target_kind, intended_target_project_id)
    VALUES ('smoke-0086-b', 'Draft', '{}'::jsonb, 'change_order', NULL);
    RAISE EXCEPTION 'smoke fail: change_order with NULL project_id accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: reject change_order + NULL';
  END;

  -- kind NULL with a project_id set
  BEGIN
    INSERT INTO public.quotes (id, status, data, intended_target_kind, intended_target_project_id)
    VALUES ('smoke-0086-c', 'Draft', '{}'::jsonb, NULL, COALESCE(v_proj, gen_random_uuid()));
    RAISE EXCEPTION 'smoke fail: NULL kind with project_id accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: reject NULL kind + project_id';
            WHEN foreign_key_violation THEN RAISE NOTICE 'ok (FK): reject NULL kind + project_id';
  END;

  -- ── Acceptances (rolled back via savepoint) ──
  BEGIN
    SAVEPOINT sp;
    INSERT INTO public.quotes (id, status, data, intended_target_kind, intended_target_project_id)
    VALUES ('smoke-0086-d', 'Draft', '{}'::jsonb, NULL, NULL);
    ROLLBACK TO SAVEPOINT sp;
    RAISE NOTICE 'ok: accept (NULL, NULL)';
  END;

  BEGIN
    SAVEPOINT sp;
    INSERT INTO public.quotes (id, status, data, intended_target_kind, intended_target_project_id)
    VALUES ('smoke-0086-e', 'Draft', '{}'::jsonb, 'new_project', NULL);
    ROLLBACK TO SAVEPOINT sp;
    RAISE NOTICE 'ok: accept (new_project, NULL)';
  END;

  IF v_proj IS NOT NULL THEN
    BEGIN
      SAVEPOINT sp;
      INSERT INTO public.quotes (id, status, data, intended_target_kind, intended_target_project_id)
      VALUES ('smoke-0086-f', 'Draft', '{}'::jsonb, 'change_order', v_proj);
      ROLLBACK TO SAVEPOINT sp;
      RAISE NOTICE 'ok: accept (change_order, project uuid)';
    END;
  ELSE
    RAISE NOTICE 'skip: no project row to test (change_order, uuid) accept';
  END IF;
END $$;
