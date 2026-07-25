-- smoke_0106_site_log_crew_name_preserve.sql
-- Verify the 0105 regression is fixed: deleting a tech (or sub) that is named on
-- a site-log crew row with NO person_name now PRESERVES the row with the party's
-- name and a NULL FK — instead of failing the party CHECK.
--
-- FIXTURE RULE: public.projects.project_number is NOT NULL UNIQUE.

DO $$
DECLARE v_client uuid; v_proj uuid; v_job uuid; v_tech uuid; v_sub uuid;
        v_log uuid; v_crew_t uuid; v_crew_s uuid; v_name text; v_fk uuid;
BEGIN
  INSERT INTO public.clients (name) VALUES ('Smoke Client 0106') RETURNING id INTO v_client;
  INSERT INTO public.projects (project_number, client_id, title, opco)
    VALUES ('SMOKE-0106', v_client, 'Smoke Project 0106', 'integrated_solutions')
    RETURNING id INTO v_proj;
  INSERT INTO public.project_jobs (project_id, job_type, title)
    VALUES (v_proj, 'main_job', 'Main') RETURNING id INTO v_job;
  INSERT INTO public.techs (name) VALUES ('Preserve Tech') RETURNING id INTO v_tech;
  INSERT INTO public.subcontractors (name) VALUES ('Preserve Sub') RETURNING id INTO v_sub;
  INSERT INTO public.site_logs (project_id, job_id, log_date)
    VALUES (v_proj, v_job, CURRENT_DATE) RETURNING id INTO v_log;

  -- crew rows with a party and NO person_name (the failing case pre-0106)
  INSERT INTO public.site_log_crew (site_log_id, tech_id, hours)
    VALUES (v_log, v_tech, 8) RETURNING id INTO v_crew_t;
  INSERT INTO public.site_log_crew (site_log_id, subcontractor_id, hours)
    VALUES (v_log, v_sub, 8) RETURNING id INTO v_crew_s;

  -- deleting the tech now SUCCEEDS (before 0106 this raised a check_violation)
  DELETE FROM public.techs WHERE id = v_tech;
  SELECT person_name, tech_id INTO v_name, v_fk FROM public.site_log_crew WHERE id = v_crew_t;
  ASSERT v_fk IS NULL, 'smoke fail: tech_id not nulled';
  ASSERT v_name = 'Preserve Tech', format('smoke fail: expected preserved name, got %s', v_name);

  -- same for a subcontractor
  DELETE FROM public.subcontractors WHERE id = v_sub;
  SELECT person_name, subcontractor_id INTO v_name, v_fk FROM public.site_log_crew WHERE id = v_crew_s;
  ASSERT v_fk IS NULL, 'smoke fail: subcontractor_id not nulled';
  ASSERT v_name = 'Preserve Sub', format('smoke fail: expected preserved sub name, got %s', v_name);

  RAISE NOTICE 'ok: tech/sub delete preserves crew person_name (0105 gap fixed)';
  RAISE EXCEPTION 'rollback smoke 0106';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0106' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
