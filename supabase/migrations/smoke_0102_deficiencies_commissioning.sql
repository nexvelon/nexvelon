-- smoke_0102_deficiencies_commissioning.sql
-- Verify: all three tables + §3; deficiency assignee <=1 (both rejected, zero
-- accepted); bad severity/status/result rejected; CASCADE from project, job and
-- run; commissioning_items.deficiency_id SET NULL when a linked deficiency is
-- deleted.
--
-- FIXTURE RULE: public.projects.project_number is NOT NULL UNIQUE — every
-- INSERT INTO projects MUST supply it (learned the hard way; smoke_0101 omitted
-- it and would fail on a constrained DB).

-- 1. Tables + §3 clauses on all three.
DO $$
DECLARE n int; b boolean; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['job_deficiencies','commissioning_runs','commissioning_items'] LOOP
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
  RAISE NOTICE 'ok: all three tables + §3 clauses present';
END $$;

-- 2. CHECKs + assignee rule + CASCADE/SET NULL (all rolled back).
DO $$
DECLARE v_client uuid; v_proj uuid; v_job uuid; v_tech uuid; v_sub uuid;
        v_def uuid; v_run uuid; v_item uuid; n int; v_link uuid;
BEGIN
  INSERT INTO public.clients (name) VALUES ('Smoke Client 0102') RETURNING id INTO v_client;
  INSERT INTO public.projects (project_number, client_id, title, opco)
    VALUES ('SMOKE-0102', v_client, 'Smoke Project 0102', 'integrated_solutions')
    RETURNING id INTO v_proj;
  INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_proj, 'main_job', 'Main') RETURNING id INTO v_job;
  INSERT INTO public.techs (name) VALUES ('Smoke Tech 0102') RETURNING id INTO v_tech;
  INSERT INTO public.subcontractors (name) VALUES ('Smoke Sub 0102') RETURNING id INTO v_sub;

  -- deficiency: BOTH assignees rejected
  BEGIN
    INSERT INTO public.job_deficiencies
      (project_id, job_id, title, assignee_tech_id, assignee_subcontractor_id)
    VALUES (v_proj, v_job, 'x', v_tech, v_sub);
    RAISE EXCEPTION 'smoke fail: deficiency both-assignee accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- deficiency: bad severity rejected
  BEGIN
    INSERT INTO public.job_deficiencies (project_id, job_id, title, severity)
    VALUES (v_proj, v_job, 'x', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad severity accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- deficiency: bad status rejected
  BEGIN
    INSERT INTO public.job_deficiencies (project_id, job_id, title, status)
    VALUES (v_proj, v_job, 'x', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad deficiency status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- deficiency: ZERO assignees accepted
  INSERT INTO public.job_deficiencies (project_id, job_id, title, severity)
  VALUES (v_proj, v_job, 'Unassigned deficiency', 'safety') RETURNING id INTO v_def;
  ASSERT v_def IS NOT NULL, 'smoke fail: unassigned deficiency rejected';

  -- run: bad status rejected
  BEGIN
    INSERT INTO public.commissioning_runs (project_id, job_id, status)
    VALUES (v_proj, v_job, 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad run status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.commissioning_runs (project_id, job_id)
  VALUES (v_proj, v_job) RETURNING id INTO v_run;

  -- item: bad result rejected
  BEGIN
    INSERT INTO public.commissioning_items (run_id, description, result)
    VALUES (v_run, 'Camera 1 online', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad item result accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- item linking the deficiency
  INSERT INTO public.commissioning_items (run_id, description, result, deficiency_id)
  VALUES (v_run, 'Camera 1 online', 'fail', v_def) RETURNING id INTO v_item;

  -- deficiency_id SET NULL when the deficiency is deleted (item survives)
  DELETE FROM public.job_deficiencies WHERE id = v_def;
  SELECT deficiency_id INTO v_link FROM public.commissioning_items WHERE id = v_item;
  ASSERT v_link IS NULL, 'smoke fail: deficiency_id not SET NULL on deficiency delete';
  SELECT count(*) INTO n FROM public.commissioning_items WHERE id = v_item;
  ASSERT n = 1, 'smoke fail: commissioning item destroyed with its deficiency';

  -- CASCADE from run: deleting the run removes its items
  DELETE FROM public.commissioning_runs WHERE id = v_run;
  SELECT count(*) INTO n FROM public.commissioning_items WHERE run_id = v_run;
  ASSERT n = 0, 'smoke fail: items not CASCADE-deleted with the run';

  -- CASCADE from job + project: re-seed then delete the project
  INSERT INTO public.job_deficiencies (project_id, job_id, title) VALUES (v_proj, v_job, 'd');
  INSERT INTO public.commissioning_runs (project_id, job_id) VALUES (v_proj, v_job);
  DELETE FROM public.projects WHERE id = v_proj;
  SELECT count(*) INTO n FROM public.job_deficiencies WHERE project_id = v_proj;
  ASSERT n = 0, 'smoke fail: deficiencies not CASCADE-deleted with the project';
  SELECT count(*) INTO n FROM public.commissioning_runs WHERE project_id = v_proj;
  ASSERT n = 0, 'smoke fail: runs not CASCADE-deleted with the project';

  RAISE NOTICE 'ok: CHECKs, assignee rule, SET NULL, CASCADE all enforced';
  RAISE EXCEPTION 'rollback smoke 0102';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0102' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
