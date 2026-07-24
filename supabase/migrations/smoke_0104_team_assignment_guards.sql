-- smoke_0104_team_assignment_guards.sql
-- Verify: both partial unique indexes exist; duplicate active tech on the same
-- job rejected; the same tech on a DIFFERENT job accepted; a removed assignment
-- doesn't block a new active one; at most one active lead per job.
--
-- FIXTURE RULE: public.projects.project_number is NOT NULL UNIQUE.

-- 1. Indexes present.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'job_assignments'
     AND indexname = 'job_assignments_unique_active_tech';
  ASSERT n = 1, 'smoke fail: unique_active_tech index missing';
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'job_assignments'
     AND indexname = 'job_assignments_single_active_lead';
  ASSERT n = 1, 'smoke fail: single_active_lead index missing';
  RAISE NOTICE 'ok: both partial unique indexes present';
END $$;

-- 2. Behaviour (all rolled back).
DO $$
DECLARE v_client uuid; v_proj uuid; v_job1 uuid; v_job2 uuid;
        v_tech1 uuid; v_tech2 uuid; v_sub uuid; v_a uuid;
BEGIN
  INSERT INTO public.clients (name) VALUES ('Smoke Client 0104') RETURNING id INTO v_client;
  INSERT INTO public.projects (project_number, client_id, title, opco)
    VALUES ('SMOKE-0104', v_client, 'Smoke Project 0104', 'integrated_solutions')
    RETURNING id INTO v_proj;
  INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_proj, 'main_job', 'Main') RETURNING id INTO v_job1;
  INSERT INTO public.project_jobs (project_id, job_type, title, co_number)
    VALUES (v_proj, 'change_order', 'CO1', 1) RETURNING id INTO v_job2;
  INSERT INTO public.techs (name) VALUES ('Smoke Tech 0104 A') RETURNING id INTO v_tech1;
  INSERT INTO public.techs (name) VALUES ('Smoke Tech 0104 B') RETURNING id INTO v_tech2;
  INSERT INTO public.subcontractors (name) VALUES ('Smoke Sub 0104') RETURNING id INTO v_sub;

  -- tech1 active on job1 (crew)
  INSERT INTO public.job_assignments (project_id, job_id, tech_id, role)
  VALUES (v_proj, v_job1, v_tech1, 'crew') RETURNING id INTO v_a;

  -- duplicate active tech on the SAME job rejected
  BEGIN
    INSERT INTO public.job_assignments (project_id, job_id, tech_id, role)
    VALUES (v_proj, v_job1, v_tech1, 'crew');
    RAISE EXCEPTION 'smoke fail: duplicate active tech on same job accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- same tech on a DIFFERENT job accepted
  INSERT INTO public.job_assignments (project_id, job_id, tech_id, role)
  VALUES (v_proj, v_job2, v_tech1, 'crew');

  -- remove the job1 assignment → a NEW active one is allowed
  UPDATE public.job_assignments SET status = 'removed' WHERE id = v_a;
  INSERT INTO public.job_assignments (project_id, job_id, tech_id, role)
  VALUES (v_proj, v_job1, v_tech1, 'crew');  -- no unique_violation

  -- single active lead per job: tech2 lead on job1 OK
  INSERT INTO public.job_assignments (project_id, job_id, tech_id, role)
  VALUES (v_proj, v_job1, v_tech2, 'lead');
  -- a SECOND active lead on job1 (a sub, this time) rejected
  BEGIN
    INSERT INTO public.job_assignments (project_id, job_id, subcontractor_id, role)
    VALUES (v_proj, v_job1, v_sub, 'lead');
    RAISE EXCEPTION 'smoke fail: second active lead on same job accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  RAISE NOTICE 'ok: dup-active-tech + single-active-lead guards enforced';
  RAISE EXCEPTION 'rollback smoke 0104';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0104' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
