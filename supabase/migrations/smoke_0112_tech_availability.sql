-- smoke_0112_tech_availability.sql
-- Verify: both tables + §3; day_of_week range CHECK; time/timestamp order CHECKs;
-- unique (tech, dow); bad absence type/status rejected; CASCADE on tech delete.
--
-- FIXTURE RULE: techs.name is NOT NULL UNIQUE. No projects touched.

-- 1. Tables + §3.
DO $$
DECLARE n int; b boolean; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tech_working_hours','tech_absences'] LOOP
    SELECT count(*) INTO n FROM information_schema.tables
     WHERE table_schema='public' AND table_name=t;
    ASSERT n = 1, format('smoke fail: table %s missing', t);
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename=t;
    ASSERT n = 2, format('smoke fail: %s expected 2 policies, found %s', t, n);
    SELECT relrowsecurity INTO b FROM pg_class WHERE oid=('public.'||t)::regclass;
    ASSERT b, format('smoke fail: RLS not enabled on %s', t);
  END LOOP;
  RAISE NOTICE 'ok: two tables + §3 present';
END $$;

-- 2. CHECKs, unique, CASCADE (rolled back).
DO $$
DECLARE v_tech uuid; n int; base timestamptz := date_trunc('day', now());
BEGIN
  INSERT INTO public.techs (name) VALUES ('Smoke Tech 0112') RETURNING id INTO v_tech;

  -- day_of_week range rejected
  BEGIN
    INSERT INTO public.tech_working_hours (tech_id, day_of_week, start_time, end_time)
    VALUES (v_tech, 7, '09:00', '17:00');
    RAISE EXCEPTION 'smoke fail: day_of_week 7 accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- time order rejected
  BEGIN
    INSERT INTO public.tech_working_hours (tech_id, day_of_week, start_time, end_time)
    VALUES (v_tech, 1, '17:00', '09:00');
    RAISE EXCEPTION 'smoke fail: end_time<=start_time accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a valid working-hours row, then a duplicate (tech, dow) rejected
  INSERT INTO public.tech_working_hours (tech_id, day_of_week, start_time, end_time)
  VALUES (v_tech, 1, '09:00', '17:00');
  BEGIN
    INSERT INTO public.tech_working_hours (tech_id, day_of_week, start_time, end_time)
    VALUES (v_tech, 1, '08:00', '16:00');
    RAISE EXCEPTION 'smoke fail: duplicate (tech, dow) accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- absence: bad type rejected
  BEGIN
    INSERT INTO public.tech_absences (tech_id, absence_type, starts_at, ends_at)
    VALUES (v_tech, 'nonsense', base, base + interval '1 day');
    RAISE EXCEPTION 'smoke fail: bad absence_type accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- absence: bad status rejected
  BEGIN
    INSERT INTO public.tech_absences (tech_id, starts_at, ends_at, status)
    VALUES (v_tech, base, base + interval '1 day', 'nope');
    RAISE EXCEPTION 'smoke fail: bad absence status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- absence: timestamp order rejected
  BEGIN
    INSERT INTO public.tech_absences (tech_id, starts_at, ends_at)
    VALUES (v_tech, base + interval '1 day', base);
    RAISE EXCEPTION 'smoke fail: absence ends<=starts accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.tech_absences (tech_id, starts_at, ends_at, status)
  VALUES (v_tech, base, base + interval '1 day', 'approved');

  -- CASCADE: deleting the tech removes hours + absences
  DELETE FROM public.techs WHERE id = v_tech;
  SELECT count(*) INTO n FROM public.tech_working_hours WHERE tech_id = v_tech;
  ASSERT n = 0, 'smoke fail: working hours not CASCADE-deleted';
  SELECT count(*) INTO n FROM public.tech_absences WHERE tech_id = v_tech;
  ASSERT n = 0, 'smoke fail: absences not CASCADE-deleted';

  RAISE NOTICE 'ok: dow/time/status CHECKs, unique(tech,dow), CASCADE';
  RAISE EXCEPTION 'rollback smoke 0112';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0112' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
