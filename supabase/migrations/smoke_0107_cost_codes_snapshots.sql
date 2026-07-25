-- smoke_0107_cost_codes_snapshots.sql
-- Verify: both tables + §3; 5 seeded cost codes; duplicate code rejected; bad
-- category rejected; margin_snapshots inserts; CASCADE from project/job;
-- job_line_items.cost_code_id SET NULL when a code is deleted.
--
-- FIXTURE RULE: public.projects.project_number is NOT NULL UNIQUE.

-- 1. Tables + §3 + seed.
DO $$
DECLARE n int; b boolean; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cost_codes','margin_snapshots'] LOOP
    SELECT count(*) INTO n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = t;
    ASSERT n = 1, format('smoke fail: table %s missing', t);
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename=t;
    ASSERT n = 2, format('smoke fail: %s expected 2 policies, found %s', t, n);
    SELECT relrowsecurity INTO b FROM pg_class WHERE oid = ('public.'||t)::regclass;
    ASSERT b, format('smoke fail: RLS not enabled on %s', t);
  END LOOP;

  SELECT count(*) INTO n FROM public.cost_codes
   WHERE code IN ('LAB','MAT','SUB','EQP','OTH');
  ASSERT n = 5, format('smoke fail: expected 5 seeded codes, found %s', n);

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='job_line_items' AND column_name='cost_code_id';
  ASSERT n = 1, 'smoke fail: job_line_items.cost_code_id missing';
  RAISE NOTICE 'ok: tables + §3 + 5 seeded codes + cost_code_id column present';
END $$;

-- 2. CHECKs + CASCADE + SET NULL (rolled back).
DO $$
DECLARE v_client uuid; v_proj uuid; v_job uuid; v_code uuid; v_cc uuid;
        v_line uuid; v_snap uuid; n int; v_link uuid;
BEGIN
  -- duplicate code rejected
  BEGIN
    INSERT INTO public.cost_codes (code, name, category) VALUES ('MAT', 'dup', 'materials');
    RAISE EXCEPTION 'smoke fail: duplicate code accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- bad category rejected
  BEGIN
    INSERT INTO public.cost_codes (code, name, category) VALUES ('ZZZ', 'x', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad category accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.cost_codes (code, name, category) VALUES ('TST', 'Test', 'other')
    RETURNING id INTO v_code;

  INSERT INTO public.clients (name) VALUES ('Smoke Client 0107') RETURNING id INTO v_client;
  INSERT INTO public.projects (project_number, client_id, title, opco)
    VALUES ('SMOKE-0107', v_client, 'Smoke Project 0107', 'integrated_solutions')
    RETURNING id INTO v_proj;
  INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_proj, 'main_job', 'Main') RETURNING id INTO v_job;
  INSERT INTO public.project_cost_centers (project_id, job_id, name)
    VALUES (v_proj, v_job, 'CC') RETURNING id INTO v_cc;

  -- a line item coded to TST; deleting the code SET NULLs it
  INSERT INTO public.job_line_items
    (job_id, cost_center_id, line_kind, quantity, unit_cost, cost_code_id)
    VALUES (v_job, v_cc, 'part', 1, 10, v_code) RETURNING id INTO v_line;
  DELETE FROM public.cost_codes WHERE id = v_code;
  SELECT cost_code_id INTO v_link FROM public.job_line_items WHERE id = v_line;
  ASSERT v_link IS NULL, 'smoke fail: line cost_code_id not SET NULL on code delete';

  -- margin_snapshots insert
  INSERT INTO public.margin_snapshots
    (project_id, job_id, reason, contract, actual_cost, actual_revenue, margin, margin_pct,
     by_code)
    VALUES (v_proj, v_job, 'manual', 1000, 600, 900, 400, 40.0,
     '{"MAT":{"estimated":100,"actual":120}}'::jsonb)
    RETURNING id INTO v_snap;
  ASSERT v_snap IS NOT NULL, 'smoke fail: snapshot insert failed';

  -- CASCADE from project
  DELETE FROM public.projects WHERE id = v_proj;
  SELECT count(*) INTO n FROM public.margin_snapshots WHERE project_id = v_proj;
  ASSERT n = 0, 'smoke fail: snapshots not CASCADE-deleted with the project';

  RAISE NOTICE 'ok: dup/category CHECKs, SET NULL, snapshot insert, CASCADE enforced';
  RAISE EXCEPTION 'rollback smoke 0107';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0107' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
