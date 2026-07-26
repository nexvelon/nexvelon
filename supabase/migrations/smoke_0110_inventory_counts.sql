-- smoke_0110_inventory_counts.sql
-- Verify: both tables + §3; bad session status rejected; unique reference;
-- next_count_reference returns CNT-YYYY-0001 then +1; lines CASCADE on session
-- delete.
--
-- FIXTURE RULE: inventory_count_sessions.reference + expected_qty are NOT NULL.
-- No projects/vendors touched.

-- 1. Tables + §3.
DO $$
DECLARE n int; b boolean; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_count_sessions','inventory_count_lines'] LOOP
    SELECT count(*) INTO n FROM information_schema.tables
     WHERE table_schema='public' AND table_name=t;
    ASSERT n = 1, format('smoke fail: table %s missing', t);
    SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND tablename=t;
    ASSERT n = 2, format('smoke fail: %s expected 2 policies, found %s', t, n);
    SELECT relrowsecurity INTO b FROM pg_class WHERE oid=('public.'||t)::regclass;
    ASSERT b, format('smoke fail: RLS not enabled on %s', t);
  END LOOP;
  RAISE NOTICE 'ok: tables + §3 present';
END $$;

-- 2. Status CHECK, unique reference, CASCADE, generator (rolled back).
DO $$
DECLARE v_s uuid; v_ref text; v_ref2 text; n int;
BEGIN
  -- bad status rejected
  BEGIN
    INSERT INTO public.inventory_count_sessions (reference, status)
    VALUES ('CNT-SMOKE-BAD', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad session status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- generator: first CNT of the year is 0001
  v_ref := public.next_count_reference();
  ASSERT v_ref = 'CNT-'||to_char(current_date,'YYYY')||'-0001',
    format('smoke fail: first reference %s not CNT-YYYY-0001', v_ref);

  INSERT INTO public.inventory_count_sessions (reference, status)
  VALUES (v_ref, 'open') RETURNING id INTO v_s;

  -- unique reference rejected
  BEGIN
    INSERT INTO public.inventory_count_sessions (reference) VALUES (v_ref);
    RAISE EXCEPTION 'smoke fail: duplicate reference accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- generator advances to 0002 with one row present
  v_ref2 := public.next_count_reference();
  ASSERT v_ref2 = 'CNT-'||to_char(current_date,'YYYY')||'-0002',
    format('smoke fail: second reference %s not CNT-YYYY-0002', v_ref2);

  INSERT INTO public.inventory_count_lines (session_id, expected_qty, counted_qty)
  VALUES (v_s, 5, 4);

  -- CASCADE: deleting the session removes its lines
  DELETE FROM public.inventory_count_sessions WHERE id = v_s;
  SELECT count(*) INTO n FROM public.inventory_count_lines WHERE session_id = v_s;
  ASSERT n = 0, 'smoke fail: count lines not CASCADE-deleted with the session';

  RAISE NOTICE 'ok: status CHECK, unique + CASCADE + generator';
  RAISE EXCEPTION 'rollback smoke 0110';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0110' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
