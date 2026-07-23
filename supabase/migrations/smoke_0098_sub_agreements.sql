-- smoke_0098_sub_agreements.sql
-- Verify: table + §3 clauses; bad status rejected; UNIQUE agreement_number;
-- job-requires-project CHECK; RESTRICT blocks deleting a sub with agreements;
-- next_sub_agreement_number returns WO-10000 on empty and max+1 otherwise.

-- 1. Table + §3 clauses.
DO $$
DECLARE n int; b boolean;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'sub_agreements';
  ASSERT n = 1, 'smoke fail: sub_agreements table missing';

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'sub_agreements';
  ASSERT n = 2, format('smoke fail: expected 2 policies, found %s', n);

  SELECT relrowsecurity INTO b FROM pg_class
   WHERE oid = 'public.sub_agreements'::regclass;
  ASSERT b, 'smoke fail: RLS not enabled';

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'sub_agreements'
     AND grantee = 'authenticated' AND privilege_type = 'SELECT';
  ASSERT n = 1, 'smoke fail: authenticated SELECT grant missing';
  RAISE NOTICE 'ok: sub_agreements table + §3 clauses present';
END $$;

-- 2. next_sub_agreement_number on an EMPTY table → WO-10000.
DO $$
DECLARE v text;
BEGIN
  -- Only meaningful when the table is empty; guard so a re-run doesn't fail.
  IF (SELECT count(*) FROM public.sub_agreements) = 0 THEN
    SELECT public.next_sub_agreement_number() INTO v;
    ASSERT v = 'WO-10000', format('smoke fail: expected WO-10000 on empty, got %s', v);
    RAISE NOTICE 'ok: next_sub_agreement_number → WO-10000 on empty';
  ELSE
    RAISE NOTICE 'skip: table non-empty, empty-case not asserted';
  END IF;
END $$;

-- 3. CHECKs + UNIQUE + RESTRICT + max+1 numbering (all rolled back).
DO $$
DECLARE v_sub uuid; v_proj uuid; v_agr uuid; v text;
BEGIN
  INSERT INTO public.subcontractors (name) VALUES ('Smoke Sub 0098') RETURNING id INTO v_sub;

  -- bad status rejected
  BEGIN
    INSERT INTO public.sub_agreements (agreement_number, subcontractor_id, title, status)
    VALUES ('WO-90001', v_sub, 'x', 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- job set without a project rejected
  BEGIN
    INSERT INTO public.sub_agreements (agreement_number, subcontractor_id, title, job_id)
    VALUES ('WO-90002', v_sub, 'x', gen_random_uuid());
    RAISE EXCEPTION 'smoke fail: job-without-project accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a valid draft
  INSERT INTO public.sub_agreements (agreement_number, subcontractor_id, title)
  VALUES ('WO-50000', v_sub, 'Install') RETURNING id INTO v_agr;

  -- UNIQUE agreement_number
  BEGIN
    INSERT INTO public.sub_agreements (agreement_number, subcontractor_id, title)
    VALUES ('WO-50000', v_sub, 'dup');
    RAISE EXCEPTION 'smoke fail: duplicate agreement_number accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- max+1 numbering picks up WO-50000 → WO-50001
  SELECT public.next_sub_agreement_number() INTO v;
  ASSERT v = 'WO-50001', format('smoke fail: expected WO-50001, got %s', v);

  -- RESTRICT: deleting the sub while an agreement references it must fail.
  BEGIN
    DELETE FROM public.subcontractors WHERE id = v_sub;
    RAISE EXCEPTION 'smoke fail: sub with agreements was deletable (RESTRICT not enforced)';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  RAISE NOTICE 'ok: status/job CHECKs, UNIQUE, max+1, RESTRICT all enforced';
  RAISE EXCEPTION 'rollback smoke 0098';   -- undo all of the above
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0098' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
