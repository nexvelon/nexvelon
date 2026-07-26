-- smoke_0113_schedule_audit_cost_seam.sql
-- Verify: schedule_audit + §3 (SELECT + INSERT policies ONLY — append-only, no
-- update/delete policy); bad action rejected; converted_labour_entry_id column +
-- FK; a converted booking's link set + freed on labour_entry delete (SET NULL).
--
-- FIXTURE RULE: techs.name NOT NULL UNIQUE; schedule_jobs.reference/title,
-- labour_entries.cost_center_id/tech_name/hours/cost_rate/amount NOT NULL;
-- project_cost_centers needs a project (projects.project_number NOT NULL).

-- 1. Table + append-only §3.
DO $$
DECLARE n int; b boolean;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema='public' AND table_name='schedule_audit';
  ASSERT n = 1, 'smoke fail: schedule_audit missing';
  SELECT relrowsecurity INTO b FROM pg_class WHERE oid='public.schedule_audit'::regclass;
  ASSERT b, 'smoke fail: RLS not enabled on schedule_audit';
  -- exactly 2 policies: select + insert (NO update/delete)
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename='schedule_audit';
  ASSERT n = 2, format('smoke fail: schedule_audit expected 2 policies (select+insert), found %s', n);
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='schedule_audit' AND cmd IN ('UPDATE','DELETE');
  ASSERT n = 0, 'smoke fail: schedule_audit has an update/delete policy (must be append-only)';

  -- the new column exists
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='schedule_assignments'
     AND column_name='converted_labour_entry_id';
  ASSERT n = 1, 'smoke fail: converted_labour_entry_id column missing';
  RAISE NOTICE 'ok: schedule_audit append-only §3 + cost-seam column present';
END $$;

-- 2. action CHECK, FK link + SET NULL (rolled back).
DO $$
DECLARE
  v_tech uuid; v_client uuid; v_proj uuid; v_job uuid; v_cc uuid;
  v_sjob uuid; v_asg uuid; v_lab uuid; v_link uuid;
  base timestamptz := date_trunc('hour', now());
BEGIN
  INSERT INTO public.techs (name, default_cost_rate) VALUES ('Smoke Tech 0113', 80) RETURNING id INTO v_tech;
  INSERT INTO public.clients (name) VALUES ('Smoke Client 0113') RETURNING id INTO v_client;
  INSERT INTO public.projects (project_number, client_id, title, opco)
    VALUES ('SMOKE-0113', v_client, 'Smoke Project 0113', 'integrated_solutions') RETURNING id INTO v_proj;
  INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_proj, 'main_job', 'Main') RETURNING id INTO v_job;
  INSERT INTO public.project_cost_centers (project_id, job_id, cc_number, name)
    VALUES (v_proj, v_job, 'CC-1', 'Labour') RETURNING id INTO v_cc;

  INSERT INTO public.schedule_jobs (reference, title, project_id, project_job_id)
    VALUES ('SVC-SMOKE-0113', 'Smoke Svc', v_proj, v_job) RETURNING id INTO v_sjob;
  INSERT INTO public.schedule_assignments (schedule_job_id, tech_id, starts_at, ends_at, status)
    VALUES (v_sjob, v_tech, base, base + interval '2 hours', 'completed') RETURNING id INTO v_asg;

  -- bad audit action rejected
  BEGIN
    INSERT INTO public.schedule_audit (action) VALUES ('nonsense');
    RAISE EXCEPTION 'smoke fail: bad audit action accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a valid audit row
  INSERT INTO public.schedule_audit (schedule_assignment_id, schedule_job_id, tech_id, action, actor_id)
  VALUES (v_asg, v_sjob, v_tech, 'created', NULL);

  -- a labour entry + link
  INSERT INTO public.labour_entries (cost_center_id, tech_id, tech_name, hours, cost_rate, amount, note)
  VALUES (v_cc, v_tech, 'Smoke Tech 0113', 2, 80, 160, 'From booking SVC-SMOKE-0113') RETURNING id INTO v_lab;
  UPDATE public.schedule_assignments SET converted_labour_entry_id = v_lab WHERE id = v_asg;
  SELECT converted_labour_entry_id INTO v_link FROM public.schedule_assignments WHERE id = v_asg;
  ASSERT v_link = v_lab, 'smoke fail: cost-seam link not set';

  -- deleting the labour_entry frees the booking (ON DELETE SET NULL)
  DELETE FROM public.labour_entries WHERE id = v_lab;
  SELECT converted_labour_entry_id INTO v_link FROM public.schedule_assignments WHERE id = v_asg;
  ASSERT v_link IS NULL, 'smoke fail: link not SET NULL on labour_entry delete';

  RAISE NOTICE 'ok: action CHECK, cost-seam link set + freed on delete';
  RAISE EXCEPTION 'rollback smoke 0113';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0113' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
