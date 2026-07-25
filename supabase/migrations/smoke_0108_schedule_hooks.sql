-- smoke_0108_schedule_hooks.sql
-- Verify: milestones + dependencies tables + §3; bad milestone status rejected;
-- planned end<start rejected; self-dependency rejected; duplicate edge rejected;
-- CASCADE from project and job.
--
-- FIXTURE RULE: public.projects.project_number is NOT NULL UNIQUE.

-- 1. Tables + §3.
DO $$
DECLARE n int; b boolean; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schedule_milestones','job_dependencies'] LOOP
    SELECT count(*) INTO n FROM information_schema.tables
     WHERE table_schema='public' AND table_name=t;
    ASSERT n = 1, format('smoke fail: table %s missing', t);
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename=t;
    ASSERT n = 2, format('smoke fail: %s expected 2 policies, found %s', t, n);
    SELECT relrowsecurity INTO b FROM pg_class WHERE oid=('public.'||t)::regclass;
    ASSERT b, format('smoke fail: RLS not enabled on %s', t);
  END LOOP;

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='project_jobs'
     AND column_name IN ('planned_start_date','planned_end_date');
  ASSERT n = 2, 'smoke fail: planned_start/end columns missing on project_jobs';
  RAISE NOTICE 'ok: tables + §3 + planned columns present';
END $$;

-- 2. CHECKs + CASCADE (rolled back).
DO $$
DECLARE v_client uuid; v_proj uuid; v_job1 uuid; v_job2 uuid; v_ms uuid; n int;
BEGIN
  INSERT INTO public.clients (name) VALUES ('Smoke Client 0108') RETURNING id INTO v_client;
  INSERT INTO public.projects (project_number, client_id, title, opco)
    VALUES ('SMOKE-0108', v_client, 'Smoke Project 0108', 'integrated_solutions')
    RETURNING id INTO v_proj;
  INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_proj, 'main_job', 'Main') RETURNING id INTO v_job1;
  INSERT INTO public.project_jobs (project_id, job_type, title, co_number)
    VALUES (v_proj, 'change_order', 'CO1', 1) RETURNING id INTO v_job2;

  -- planned end < start rejected
  BEGIN
    UPDATE public.project_jobs
       SET planned_start_date = CURRENT_DATE, planned_end_date = CURRENT_DATE - 1
     WHERE id = v_job1;
    RAISE EXCEPTION 'smoke fail: planned end<start accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- valid planned dates
  UPDATE public.project_jobs
     SET planned_start_date = CURRENT_DATE, planned_end_date = CURRENT_DATE + 10
   WHERE id = v_job1;

  -- bad milestone status rejected
  BEGIN
    INSERT INTO public.schedule_milestones (project_id, title, target_date, status)
    VALUES (v_proj, 'x', CURRENT_DATE, 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad milestone status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.schedule_milestones (project_id, job_id, title, target_date)
  VALUES (v_proj, v_job1, 'Rough-in complete', CURRENT_DATE + 5) RETURNING id INTO v_ms;

  -- self-dependency rejected
  BEGIN
    INSERT INTO public.job_dependencies (job_id, depends_on_job_id)
    VALUES (v_job1, v_job1);
    RAISE EXCEPTION 'smoke fail: self-dependency accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a valid edge, then a duplicate rejected
  INSERT INTO public.job_dependencies (job_id, depends_on_job_id) VALUES (v_job2, v_job1);
  BEGIN
    INSERT INTO public.job_dependencies (job_id, depends_on_job_id) VALUES (v_job2, v_job1);
    RAISE EXCEPTION 'smoke fail: duplicate edge accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- CASCADE from job: deleting job1 removes its milestone + the edge referencing it
  DELETE FROM public.project_jobs WHERE id = v_job1;
  SELECT count(*) INTO n FROM public.schedule_milestones WHERE id = v_ms;
  ASSERT n = 0, 'smoke fail: milestone not CASCADE-deleted with the job';
  SELECT count(*) INTO n FROM public.job_dependencies WHERE depends_on_job_id = v_job1;
  ASSERT n = 0, 'smoke fail: dependency edge not CASCADE-deleted with the job';

  -- CASCADE from project
  DELETE FROM public.projects WHERE id = v_proj;
  SELECT count(*) INTO n FROM public.schedule_milestones WHERE project_id = v_proj;
  ASSERT n = 0, 'smoke fail: milestones not CASCADE-deleted with the project';

  RAISE NOTICE 'ok: date-order/status CHECKs, self+dup edge guards, CASCADE enforced';
  RAISE EXCEPTION 'rollback smoke 0108';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0108' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
