-- smoke_0092_vendor_bills.sql
-- Verify: both tables + §3 clauses; bill status CHECK; payment amount>0 and
-- method CHECKs; the job-requires-project shape guard; and RESTRICT blocking
-- deletion of a bill that has payments. Probe rows are torn down.

-- 1. Tables exist with §3 clauses (RLS on + 2 policies each + GRANTs).
DO $$
DECLARE n int; b boolean; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendor_bills','bill_payments'] LOOP
    SELECT count(*) INTO n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = t;
    ASSERT n = 1, format('smoke fail: %s table missing', t);

    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t;
    ASSERT n = 2, format('smoke fail: %s expected 2 policies, found %s', t, n);

    EXECUTE format(
      'SELECT relrowsecurity FROM pg_class WHERE oid = ''public.%I''::regclass', t
    ) INTO b;
    ASSERT b, format('smoke fail: RLS not enabled on %s', t);

    SELECT count(*) INTO n FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = t
       AND grantee = 'authenticated' AND privilege_type = 'SELECT';
    ASSERT n = 1, format('smoke fail: %s authenticated SELECT grant missing', t);
  END LOOP;
  RAISE NOTICE 'ok: vendor_bills + bill_payments + §3 clauses present';
END $$;

-- 2. Bill status CHECK + job-requires-project shape guard.
DO $$
DECLARE v_vendor uuid; v_job uuid;
BEGIN
  SELECT id INTO v_vendor FROM public.vendors LIMIT 1;
  IF v_vendor IS NULL THEN
    RAISE NOTICE 'skip: no vendor seeded to test bill CHECKs';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.vendor_bills (vendor_id, bill_number, bill_date, status)
    VALUES (v_vendor, 'SMOKE-0092-A', CURRENT_DATE, 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad bill status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- job_id without project_id must be rejected
  SELECT id INTO v_job FROM public.project_jobs LIMIT 1;
  IF v_job IS NOT NULL THEN
    BEGIN
      INSERT INTO public.vendor_bills (vendor_id, bill_number, bill_date, job_id)
      VALUES (v_vendor, 'SMOKE-0092-B', CURRENT_DATE, v_job);
      RAISE EXCEPTION 'smoke fail: bill job_id without project_id accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
  END IF;

  RAISE NOTICE 'ok: bill status + job-requires-project CHECKs enforced';
END $$;

-- 3. Payment amount + method CHECKs, then RESTRICT on the parent bill.
DO $$
DECLARE v_vendor uuid; v_bill uuid;
BEGIN
  SELECT id INTO v_vendor FROM public.vendors LIMIT 1;
  IF v_vendor IS NULL THEN
    RAISE NOTICE 'skip: no vendor seeded to test payment CHECKs';
    RETURN;
  END IF;

  INSERT INTO public.vendor_bills
    (vendor_id, bill_number, bill_date, subtotal, tax_amount, total)
  VALUES (v_vendor, 'SMOKE-0092-C', CURRENT_DATE, 100, 13, 113)
  RETURNING id INTO v_bill;

  BEGIN
    INSERT INTO public.bill_payments (bill_id, amount, method, paid_at)
    VALUES (v_bill, 0, 'cheque', CURRENT_DATE);
    RAISE EXCEPTION 'smoke fail: bill payment amount = 0 accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.bill_payments (bill_id, amount, method, paid_at)
    VALUES (v_bill, 50, 'bitcoin', CURRENT_DATE);
    RAISE EXCEPTION 'smoke fail: bad bill payment method accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a real payment, then prove the bill can't be deleted under it
  INSERT INTO public.bill_payments (bill_id, amount, method, paid_at)
  VALUES (v_bill, 50, 'eft', CURRENT_DATE);

  BEGIN
    DELETE FROM public.vendor_bills WHERE id = v_bill;
    RAISE EXCEPTION 'smoke fail: deleted a bill that has payments';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok: bill_payments RESTRICT blocks bill deletion';
  END;

  -- Tear down the probe (payments first, then the bill).
  DELETE FROM public.bill_payments WHERE bill_id = v_bill;
  DELETE FROM public.vendor_bills WHERE id = v_bill;
  RAISE NOTICE 'ok: bill payment CHECKs enforced';
END $$;
