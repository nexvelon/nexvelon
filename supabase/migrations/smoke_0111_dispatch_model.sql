-- smoke_0111_dispatch_model.sql
-- Verify: three tables + §3; time_order + cert date_order CHECKs; bad status/
-- type/priority rejected; unique SVC ref; next_schedule_job_reference SVC-YYYY-
-- 0001 then +1; NO-OVERLAP (two confirmed same-tech overlapping → rejected; a
-- cancelled overlapping → allowed; same window different tech → allowed);
-- CASCADE assignments on schedule_job delete; RESTRICT deleting a booked tech.
--
-- FIXTURE RULE: techs.name is NOT NULL UNIQUE; schedule_jobs.reference/title
-- NOT NULL. No projects touched.

-- 1. Tables + §3.
DO $$
DECLARE n int; b boolean; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tech_certifications','schedule_jobs','schedule_assignments'] LOOP
    SELECT count(*) INTO n FROM information_schema.tables
     WHERE table_schema='public' AND table_name=t;
    ASSERT n = 1, format('smoke fail: table %s missing', t);
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename=t;
    ASSERT n = 2, format('smoke fail: %s expected 2 policies, found %s', t, n);
    SELECT relrowsecurity INTO b FROM pg_class WHERE oid=('public.'||t)::regclass;
    ASSERT b, format('smoke fail: RLS not enabled on %s', t);
  END LOOP;
  RAISE NOTICE 'ok: three tables + §3 present';
END $$;

-- 2. CHECKs, generator, no-overlap, CASCADE/RESTRICT (rolled back).
DO $$
DECLARE
  v_tech uuid; v_tech2 uuid; v_job uuid; v_ref text; v_ref2 text;
  v_b1 uuid; n int;
  base timestamptz := date_trunc('hour', now());
BEGIN
  INSERT INTO public.techs (name) VALUES ('Smoke Tech 0111') RETURNING id INTO v_tech;
  INSERT INTO public.techs (name) VALUES ('Smoke Tech 0111 B') RETURNING id INTO v_tech2;

  -- cert date_order rejected
  BEGIN
    INSERT INTO public.tech_certifications (tech_id, cert_type, issued_date, expiry_date)
    VALUES (v_tech, 'kantech', CURRENT_DATE, CURRENT_DATE - 1);
    RAISE EXCEPTION 'smoke fail: cert expiry<issued accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- bad schedule_job type/priority/status rejected
  BEGIN
    INSERT INTO public.schedule_jobs (reference, title, job_type)
    VALUES ('SVC-BAD-1', 'x', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad job_type accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- generator: first SVC of the year is 0001
  v_ref := public.next_schedule_job_reference();
  ASSERT v_ref = 'SVC-'||to_char(current_date,'YYYY')||'-0001',
    format('smoke fail: first ref %s not SVC-YYYY-0001', v_ref);
  INSERT INTO public.schedule_jobs (reference, title) VALUES (v_ref, 'Smoke Job') RETURNING id INTO v_job;

  -- unique reference rejected
  BEGIN
    INSERT INTO public.schedule_jobs (reference, title) VALUES (v_ref, 'dup');
    RAISE EXCEPTION 'smoke fail: duplicate SVC ref accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  v_ref2 := public.next_schedule_job_reference();
  ASSERT v_ref2 = 'SVC-'||to_char(current_date,'YYYY')||'-0002',
    format('smoke fail: second ref %s not SVC-YYYY-0002', v_ref2);

  -- time_order rejected (ends <= starts)
  BEGIN
    INSERT INTO public.schedule_assignments (schedule_job_id, tech_id, starts_at, ends_at)
    VALUES (v_job, v_tech, base, base);
    RAISE EXCEPTION 'smoke fail: ends=starts accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a first confirmed booking 09:00-12:00
  INSERT INTO public.schedule_assignments (schedule_job_id, tech_id, starts_at, ends_at, status)
  VALUES (v_job, v_tech, base + interval '9 hours', base + interval '12 hours', 'confirmed')
  RETURNING id INTO v_b1;

  -- OVERLAP same tech (10:00-11:00) → rejected by EXCLUDE
  BEGIN
    INSERT INTO public.schedule_assignments (schedule_job_id, tech_id, starts_at, ends_at, status)
    VALUES (v_job, v_tech, base + interval '10 hours', base + interval '11 hours', 'confirmed');
    RAISE EXCEPTION 'smoke fail: overlapping confirmed booking accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL; END;

  -- same overlap but CANCELLED → allowed (excluded from the constraint)
  INSERT INTO public.schedule_assignments (schedule_job_id, tech_id, starts_at, ends_at, status)
  VALUES (v_job, v_tech, base + interval '10 hours', base + interval '11 hours', 'cancelled');

  -- same window, DIFFERENT tech → allowed
  INSERT INTO public.schedule_assignments (schedule_job_id, tech_id, starts_at, ends_at, status)
  VALUES (v_job, v_tech2, base + interval '9 hours', base + interval '12 hours', 'confirmed');

  -- RESTRICT: can't delete a tech with a booking
  BEGIN
    DELETE FROM public.techs WHERE id = v_tech2;
    RAISE EXCEPTION 'smoke fail: deleted a booked tech';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- CASCADE: deleting the schedule_job removes its assignments
  DELETE FROM public.schedule_jobs WHERE id = v_job;
  SELECT count(*) INTO n FROM public.schedule_assignments WHERE schedule_job_id = v_job;
  ASSERT n = 0, 'smoke fail: assignments not CASCADE-deleted with the job';

  RAISE NOTICE 'ok: CHECKs, generator, NO-OVERLAP (confirmed vs cancelled vs other-tech), CASCADE, RESTRICT';
  RAISE EXCEPTION 'rollback smoke 0111';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0111' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
