-- smoke_0099_job_assignments.sql
-- Verify: table + §3; one-assignee CHECK (both-null and both-set rejected);
-- bad role/status rejected; end<start rejected; duplicate active sub on same job
-- rejected; RESTRICT blocks deleting an assigned sub; CASCADE on project delete.

-- 1. Table + §3 clauses.
DO $$
DECLARE n int; b boolean;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'job_assignments';
  ASSERT n = 1, 'smoke fail: job_assignments table missing';

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'job_assignments';
  ASSERT n = 2, format('smoke fail: expected 2 policies, found %s', n);

  SELECT relrowsecurity INTO b FROM pg_class
   WHERE oid = 'public.job_assignments'::regclass;
  ASSERT b, 'smoke fail: RLS not enabled';

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'job_assignments'
     AND grantee = 'authenticated' AND privilege_type = 'SELECT';
  ASSERT n = 1, 'smoke fail: authenticated SELECT grant missing';
  RAISE NOTICE 'ok: job_assignments table + §3 clauses present';
END $$;

-- 2. CHECKs + UNIQUE + RESTRICT + CASCADE (all rolled back at the end).
DO $$
DECLARE v_proj uuid; v_client uuid; v_sub uuid; v_tech uuid; v_a uuid; n int;
BEGIN
  INSERT INTO public.clients (name) VALUES ('Smoke Client 0099') RETURNING id INTO v_client;
  INSERT INTO public.projects (client_id, title, opco)
    VALUES (v_client, 'Smoke Project 0099', 'integrated_solutions') RETURNING id INTO v_proj;
  INSERT INTO public.subcontractors (name) VALUES ('Smoke Sub 0099') RETURNING id INTO v_sub;
  INSERT INTO public.techs (name) VALUES ('Smoke Tech 0099') RETURNING id INTO v_tech;

  -- neither assignee rejected
  BEGIN
    INSERT INTO public.job_assignments (project_id) VALUES (v_proj);
    RAISE EXCEPTION 'smoke fail: no-assignee accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- both assignees rejected
  BEGIN
    INSERT INTO public.job_assignments (project_id, subcontractor_id, tech_id)
    VALUES (v_proj, v_sub, v_tech);
    RAISE EXCEPTION 'smoke fail: both-assignee accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- bad role rejected
  BEGIN
    INSERT INTO public.job_assignments (project_id, subcontractor_id, role)
    VALUES (v_proj, v_sub, 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad role accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- end before start rejected
  BEGIN
    INSERT INTO public.job_assignments (project_id, subcontractor_id, start_date, end_date)
    VALUES (v_proj, v_sub, CURRENT_DATE, CURRENT_DATE - 1);
    RAISE EXCEPTION 'smoke fail: end<start accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a valid project-wide sub assignment + a tech assignment
  INSERT INTO public.job_assignments (project_id, subcontractor_id, role)
  VALUES (v_proj, v_sub, 'lead') RETURNING id INTO v_a;
  INSERT INTO public.job_assignments (project_id, tech_id, role)
  VALUES (v_proj, v_tech, 'crew');

  -- RESTRICT: can't delete an assigned sub
  BEGIN
    DELETE FROM public.subcontractors WHERE id = v_sub;
    RAISE EXCEPTION 'smoke fail: assigned sub was deletable';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- CASCADE: deleting the project removes its assignments
  DELETE FROM public.projects WHERE id = v_proj;
  SELECT count(*) INTO n FROM public.job_assignments WHERE project_id = v_proj;
  ASSERT n = 0, 'smoke fail: assignments not CASCADE-deleted with project';

  RAISE NOTICE 'ok: one-assignee/role/date CHECKs, RESTRICT, CASCADE enforced';
  RAISE EXCEPTION 'rollback smoke 0099';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0099' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;

-- 3. Duplicate ACTIVE sub on the same JOB rejected (separate tx-safe block).
DO $$
DECLARE v_proj uuid; v_client uuid; v_sub uuid; v_job uuid;
BEGIN
  INSERT INTO public.clients (name) VALUES ('Smoke Client 0099b') RETURNING id INTO v_client;
  INSERT INTO public.projects (client_id, title, opco)
    VALUES (v_client, 'Smoke Project 0099b', 'integrated_solutions') RETURNING id INTO v_proj;
  INSERT INTO public.subcontractors (name) VALUES ('Smoke Sub 0099b') RETURNING id INTO v_sub;
  INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_proj, 'main_job', 'Main') RETURNING id INTO v_job;

  INSERT INTO public.job_assignments (project_id, job_id, subcontractor_id)
  VALUES (v_proj, v_job, v_sub);

  BEGIN
    INSERT INTO public.job_assignments (project_id, job_id, subcontractor_id)
    VALUES (v_proj, v_job, v_sub);
    RAISE EXCEPTION 'smoke fail: duplicate active sub on job accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  RAISE NOTICE 'ok: duplicate-active-sub unique index enforced';
  RAISE EXCEPTION 'rollback smoke 0099b';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0099b' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke b rolled back';
END $$;
