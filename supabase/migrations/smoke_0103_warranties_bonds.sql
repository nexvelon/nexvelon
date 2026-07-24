-- smoke_0103_warranties_bonds.sql
-- Verify: both tables + §3; bad scope/bond_type/status rejected; end<start
-- rejected on both; CASCADE from project and job; attachment_id SET NULL.
--
-- FIXTURE RULE: public.projects.project_number is NOT NULL UNIQUE — every
-- INSERT INTO projects MUST supply it.

-- 1. Tables + §3 clauses.
DO $$
DECLARE n int; b boolean; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['warranties','project_bonds'] LOOP
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

-- 2. CHECKs + CASCADE + SET NULL (all rolled back).
DO $$
DECLARE v_client uuid; v_proj uuid; v_job uuid; v_att uuid; v_bond uuid;
        v_warr uuid; n int; v_link uuid;
BEGIN
  INSERT INTO public.clients (name) VALUES ('Smoke Client 0103') RETURNING id INTO v_client;
  INSERT INTO public.projects (project_number, client_id, title, opco)
    VALUES ('SMOKE-0103', v_client, 'Smoke Project 0103', 'integrated_solutions')
    RETURNING id INTO v_proj;
  INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_proj, 'main_job', 'Main') RETURNING id INTO v_job;

  -- warranty: bad scope rejected
  BEGIN
    INSERT INTO public.warranties (project_id, scope, start_date, end_date)
    VALUES (v_proj, 'nonsense', CURRENT_DATE, CURRENT_DATE + 365);
    RAISE EXCEPTION 'smoke fail: bad warranty scope accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- warranty: end < start rejected
  BEGIN
    INSERT INTO public.warranties (project_id, start_date, end_date)
    VALUES (v_proj, CURRENT_DATE, CURRENT_DATE - 1);
    RAISE EXCEPTION 'smoke fail: warranty end<start accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- valid warranty on the job
  INSERT INTO public.warranties (project_id, job_id, start_date, end_date)
  VALUES (v_proj, v_job, CURRENT_DATE, CURRENT_DATE + 365) RETURNING id INTO v_warr;

  -- bond: bad type rejected
  BEGIN
    INSERT INTO public.project_bonds (project_id, bond_type)
    VALUES (v_proj, 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad bond_type accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- bond: bad status rejected
  BEGIN
    INSERT INTO public.project_bonds (project_id, bond_type, status)
    VALUES (v_proj, 'performance', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad bond status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- bond: expiry < effective rejected
  BEGIN
    INSERT INTO public.project_bonds (project_id, bond_type, effective_date, expiry_date)
    VALUES (v_proj, 'performance', CURRENT_DATE, CURRENT_DATE - 1);
    RAISE EXCEPTION 'smoke fail: bond expiry<effective accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- attachment SET NULL on delete
  INSERT INTO public.attachments (entity_type, entity_id, path, filename)
  VALUES ('project_bond', v_proj::text, 'project_bond/x/cert.pdf', 'bond.pdf')
  RETURNING id INTO v_att;
  INSERT INTO public.project_bonds (project_id, bond_type, attachment_id)
  VALUES (v_proj, 'performance', v_att) RETURNING id INTO v_bond;
  DELETE FROM public.attachments WHERE id = v_att;
  SELECT attachment_id INTO v_link FROM public.project_bonds WHERE id = v_bond;
  ASSERT v_link IS NULL, 'smoke fail: bond attachment_id not SET NULL on attachment delete';

  -- CASCADE from job: the job warranty goes when the job is deleted
  DELETE FROM public.project_jobs WHERE id = v_job;
  SELECT count(*) INTO n FROM public.warranties WHERE id = v_warr;
  ASSERT n = 0, 'smoke fail: warranty not CASCADE-deleted with the job';

  -- CASCADE from project
  DELETE FROM public.projects WHERE id = v_proj;
  SELECT count(*) INTO n FROM public.project_bonds WHERE project_id = v_proj;
  ASSERT n = 0, 'smoke fail: bonds not CASCADE-deleted with the project';

  RAISE NOTICE 'ok: CHECKs, CASCADE, SET NULL all enforced';
  RAISE EXCEPTION 'rollback smoke 0103';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0103' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
