-- smoke_0094_holdback_release.sql
-- Verify: table + §3 clauses; amount>0 CHECK; status CHECK; the one-live-per-
-- project unique index; RESTRICT blocking deletion of a project with a release;
-- and invoices.is_holdback_release defaulting to false.

-- 1. Table + §3 clauses.
DO $$
DECLARE n int; b boolean;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'holdback_releases';
  ASSERT n = 1, 'smoke fail: holdback_releases table missing';

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'holdback_releases';
  ASSERT n = 2, format('smoke fail: expected 2 policies, found %s', n);

  SELECT relrowsecurity INTO b FROM pg_class
   WHERE oid = 'public.holdback_releases'::regclass;
  ASSERT b, 'smoke fail: RLS not enabled on holdback_releases';

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'holdback_releases'
     AND grantee = 'authenticated' AND privilege_type = 'SELECT';
  ASSERT n = 1, 'smoke fail: authenticated SELECT grant missing';
  RAISE NOTICE 'ok: holdback_releases table + §3 clauses present';
END $$;

-- 2. invoices.is_holdback_release defaults false.
DO $$
DECLARE v_client uuid; v_inv uuid; v_flag boolean;
BEGIN
  SELECT id INTO v_client FROM public.clients LIMIT 1;
  IF v_client IS NULL THEN
    RAISE NOTICE 'skip: no client to test is_holdback_release default';
    RETURN;
  END IF;
  INSERT INTO public.invoices (opco, client_id, status)
  VALUES ('integrated_solutions', v_client, 'draft')
  RETURNING id, is_holdback_release INTO v_inv, v_flag;
  ASSERT v_flag = false, 'smoke fail: is_holdback_release did not default false';
  DELETE FROM public.invoices WHERE id = v_inv;
  RAISE NOTICE 'ok: invoices.is_holdback_release defaults false';
END $$;

-- 3. amount>0 + status CHECKs, one-live-per-project index, and RESTRICT.
DO $$
DECLARE v_proj uuid; v_rel uuid;
BEGIN
  SELECT id INTO v_proj FROM public.projects LIMIT 1;
  IF v_proj IS NULL THEN
    RAISE NOTICE 'skip: no project to test holdback_releases CHECKs';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.holdback_releases
      (project_id, amount, substantial_completion_date, eligible_release_date)
    VALUES (v_proj, 0, CURRENT_DATE, CURRENT_DATE + 60);
    RAISE EXCEPTION 'smoke fail: amount = 0 accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.holdback_releases
      (project_id, amount, substantial_completion_date, eligible_release_date, status)
    VALUES (v_proj, 100, CURRENT_DATE, CURRENT_DATE + 60, 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a real pending release
  INSERT INTO public.holdback_releases
    (project_id, amount, substantial_completion_date, eligible_release_date)
  VALUES (v_proj, 500, CURRENT_DATE, CURRENT_DATE + 60)
  RETURNING id INTO v_rel;

  -- a SECOND live release for the same project is rejected by the unique index
  BEGIN
    INSERT INTO public.holdback_releases
      (project_id, amount, substantial_completion_date, eligible_release_date)
    VALUES (v_proj, 200, CURRENT_DATE, CURRENT_DATE + 60);
    RAISE EXCEPTION 'smoke fail: second live release accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- the project cannot be deleted while a release references it
  BEGIN
    DELETE FROM public.projects WHERE id = v_proj;
    RAISE EXCEPTION 'smoke fail: deleted a project that has a holdback release';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok: project RESTRICT holds';
  END;

  -- Tear down the probe.
  DELETE FROM public.holdback_releases WHERE id = v_rel;
  RAISE NOTICE 'ok: amount/status CHECKs + one-live index + RESTRICT enforced';
END $$;
