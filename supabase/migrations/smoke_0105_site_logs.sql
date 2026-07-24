-- smoke_0105_site_logs.sql
-- Verify: both tables + §3; bad status rejected; duplicate (job_id, log_date)
-- rejected; crew party CHECK (neither FK nor name rejected; tech-only accepted;
-- name-only accepted; both FKs rejected); CASCADE from project, job, and log.
--
-- FIXTURE RULE: public.projects.project_number is NOT NULL UNIQUE.

-- 1. Tables + §3 clauses.
DO $$
DECLARE n int; b boolean; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_logs','site_log_crew'] LOOP
    SELECT count(*) INTO n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = t;
    ASSERT n = 1, format('smoke fail: table %s missing', t);
    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t;
    ASSERT n = 2, format('smoke fail: %s expected 2 policies, found %s', t, n);
    SELECT relrowsecurity INTO b FROM pg_class WHERE oid = ('public.' || t)::regclass;
    ASSERT b, format('smoke fail: RLS not enabled on %s', t);
    SELECT count(*) INTO n FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = t
       AND grantee = 'authenticated' AND privilege_type = 'SELECT';
    ASSERT n = 1, format('smoke fail: %s authenticated SELECT grant missing', t);
  END LOOP;
  RAISE NOTICE 'ok: both tables + §3 clauses present';
END $$;

-- 2. Behaviour (all rolled back).
DO $$
DECLARE v_client uuid; v_proj uuid; v_job uuid; v_tech uuid; v_sub uuid;
        v_log uuid; n int;
BEGIN
  INSERT INTO public.clients (name) VALUES ('Smoke Client 0105') RETURNING id INTO v_client;
  INSERT INTO public.projects (project_number, client_id, title, opco)
    VALUES ('SMOKE-0105', v_client, 'Smoke Project 0105', 'integrated_solutions')
    RETURNING id INTO v_proj;
  INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_proj, 'main_job', 'Main') RETURNING id INTO v_job;
  INSERT INTO public.techs (name) VALUES ('Smoke Tech 0105') RETURNING id INTO v_tech;
  INSERT INTO public.subcontractors (name) VALUES ('Smoke Sub 0105') RETURNING id INTO v_sub;

  -- bad status rejected
  BEGIN
    INSERT INTO public.site_logs (project_id, job_id, status)
    VALUES (v_proj, v_job, 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a log for today
  INSERT INTO public.site_logs (project_id, job_id, log_date)
  VALUES (v_proj, v_job, CURRENT_DATE) RETURNING id INTO v_log;

  -- duplicate (job, date) rejected
  BEGIN
    INSERT INTO public.site_logs (project_id, job_id, log_date)
    VALUES (v_proj, v_job, CURRENT_DATE);
    RAISE EXCEPTION 'smoke fail: duplicate (job, date) accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- crew party rules:
  -- neither FK nor person_name → rejected
  BEGIN
    INSERT INTO public.site_log_crew (site_log_id, hours) VALUES (v_log, 8);
    RAISE EXCEPTION 'smoke fail: crew row with no party accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- both FKs → rejected
  BEGIN
    INSERT INTO public.site_log_crew (site_log_id, tech_id, subcontractor_id)
    VALUES (v_log, v_tech, v_sub);
    RAISE EXCEPTION 'smoke fail: crew row with both FKs accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- tech-only (no name) accepted
  INSERT INTO public.site_log_crew (site_log_id, tech_id, hours) VALUES (v_log, v_tech, 8);
  -- name-only accepted
  INSERT INTO public.site_log_crew (site_log_id, person_name, hours)
  VALUES (v_log, 'City Inspector', 1);

  -- SET NULL when the tech is deleted (crew row survives)
  DELETE FROM public.techs WHERE id = v_tech;
  SELECT count(*) INTO n FROM public.site_log_crew WHERE site_log_id = v_log AND tech_id IS NOT NULL;
  ASSERT n = 0, 'smoke fail: crew tech_id not SET NULL on tech delete';

  -- CASCADE from log: crew go with the log
  DELETE FROM public.site_logs WHERE id = v_log;
  SELECT count(*) INTO n FROM public.site_log_crew WHERE site_log_id = v_log;
  ASSERT n = 0, 'smoke fail: crew not CASCADE-deleted with the log';

  -- CASCADE from project
  INSERT INTO public.site_logs (project_id, job_id, log_date)
  VALUES (v_proj, v_job, CURRENT_DATE - 1);
  DELETE FROM public.projects WHERE id = v_proj;
  SELECT count(*) INTO n FROM public.site_logs WHERE project_id = v_proj;
  ASSERT n = 0, 'smoke fail: logs not CASCADE-deleted with the project';

  RAISE NOTICE 'ok: status/dup/party CHECKs + SET NULL + CASCADE enforced';
  RAISE EXCEPTION 'rollback smoke 0105';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0105' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
