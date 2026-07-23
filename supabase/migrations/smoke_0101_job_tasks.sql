-- smoke_0101_job_tasks.sql
-- Verify: table + §3; bad status/priority/source rejected; both-assignees
-- rejected; ZERO assignees ACCEPTED (unassigned is valid); CASCADE on project
-- and job delete; SET NULL when an assigned tech / subcontractor is deleted.

-- 1. Table + §3 clauses.
DO $$
DECLARE n int; b boolean;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'job_tasks';
  ASSERT n = 1, 'smoke fail: job_tasks table missing';

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'job_tasks';
  ASSERT n = 2, format('smoke fail: expected 2 policies, found %s', n);

  SELECT relrowsecurity INTO b FROM pg_class
   WHERE oid = 'public.job_tasks'::regclass;
  ASSERT b, 'smoke fail: RLS not enabled';

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'job_tasks'
     AND grantee = 'authenticated' AND privilege_type = 'SELECT';
  ASSERT n = 1, 'smoke fail: authenticated SELECT grant missing';
  RAISE NOTICE 'ok: job_tasks table + §3 clauses present';
END $$;

-- 2. CHECKs + unassigned-is-valid + CASCADE/SET NULL (all rolled back).
DO $$
DECLARE v_client uuid; v_proj uuid; v_job uuid; v_tech uuid; v_sub uuid;
        v_task uuid; v_assignee uuid; n int;
BEGIN
  INSERT INTO public.clients (name) VALUES ('Smoke Client 0101') RETURNING id INTO v_client;
  INSERT INTO public.projects (client_id, title, opco)
    VALUES (v_client, 'Smoke Project 0101', 'integrated_solutions') RETURNING id INTO v_proj;
  INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_proj, 'main_job', 'Main') RETURNING id INTO v_job;
  INSERT INTO public.techs (name) VALUES ('Smoke Tech 0101') RETURNING id INTO v_tech;
  INSERT INTO public.subcontractors (name) VALUES ('Smoke Sub 0101') RETURNING id INTO v_sub;

  -- bad status rejected
  BEGIN
    INSERT INTO public.job_tasks (project_id, title, status)
    VALUES (v_proj, 'x', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- bad priority rejected
  BEGIN
    INSERT INTO public.job_tasks (project_id, title, priority)
    VALUES (v_proj, 'x', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad priority accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- bad source rejected
  BEGIN
    INSERT INTO public.job_tasks (project_id, title, source)
    VALUES (v_proj, 'x', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad source accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- BOTH assignees rejected
  BEGIN
    INSERT INTO public.job_tasks
      (project_id, title, assignee_tech_id, assignee_subcontractor_id)
    VALUES (v_proj, 'x', v_tech, v_sub);
    RAISE EXCEPTION 'smoke fail: both assignees accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- ZERO assignees ACCEPTED — an unassigned task is valid (differs from SUB-6).
  INSERT INTO public.job_tasks (project_id, job_id, title)
  VALUES (v_proj, v_job, 'Unassigned task') RETURNING id INTO v_task;
  ASSERT v_task IS NOT NULL, 'smoke fail: unassigned task rejected';

  -- SET NULL when the assigned tech is deleted (task survives).
  INSERT INTO public.job_tasks (project_id, job_id, title, assignee_tech_id)
  VALUES (v_proj, v_job, 'Tech task', v_tech) RETURNING id INTO v_assignee;
  DELETE FROM public.techs WHERE id = v_tech;
  SELECT assignee_tech_id INTO v_tech FROM public.job_tasks WHERE id = v_assignee;
  ASSERT v_tech IS NULL, 'smoke fail: assignee_tech_id not SET NULL on tech delete';
  SELECT count(*) INTO n FROM public.job_tasks WHERE id = v_assignee;
  ASSERT n = 1, 'smoke fail: task destroyed when its tech was deleted';

  -- SET NULL when the assigned subcontractor is deleted.
  INSERT INTO public.job_tasks (project_id, job_id, title, assignee_subcontractor_id)
  VALUES (v_proj, v_job, 'Sub task', v_sub) RETURNING id INTO v_assignee;
  DELETE FROM public.subcontractors WHERE id = v_sub;
  SELECT assignee_subcontractor_id INTO v_sub FROM public.job_tasks WHERE id = v_assignee;
  ASSERT v_sub IS NULL, 'smoke fail: assignee_subcontractor_id not SET NULL on sub delete';

  -- CASCADE on JOB delete (job tasks go; the project-level ones stay).
  INSERT INTO public.job_tasks (project_id, title) VALUES (v_proj, 'Project-level task');
  DELETE FROM public.project_jobs WHERE id = v_job;
  SELECT count(*) INTO n FROM public.job_tasks WHERE job_id = v_job;
  ASSERT n = 0, 'smoke fail: job tasks not CASCADE-deleted with the job';
  SELECT count(*) INTO n FROM public.job_tasks WHERE project_id = v_proj;
  ASSERT n = 1, format('smoke fail: expected the project-level task to survive, found %s', n);

  -- CASCADE on PROJECT delete.
  DELETE FROM public.projects WHERE id = v_proj;
  SELECT count(*) INTO n FROM public.job_tasks WHERE project_id = v_proj;
  ASSERT n = 0, 'smoke fail: tasks not CASCADE-deleted with the project';

  RAISE NOTICE 'ok: CHECKs, unassigned-valid, SET NULL, CASCADE all enforced';
  RAISE EXCEPTION 'rollback smoke 0101';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0101' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
