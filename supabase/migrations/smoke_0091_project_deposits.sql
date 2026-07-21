-- smoke_0091_project_deposits.sql
-- Verify: both tables + §3 clauses; amount>0 CHECKs; deposit method CHECK;
-- the widened invoice_payments method CHECK (accepts 'deposit_applied');
-- RESTRICT blocking deletion of a deposit that has applications and of an
-- invoice that has applications; and CASCADE removing the paired settlement
-- when an application is deleted. Probe rows are torn down.

-- 1. Tables exist with §3 clauses (RLS on + 2 policies each + GRANTs).
DO $$
DECLARE n int; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_deposits','deposit_applications'] LOOP
    SELECT count(*) INTO n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = t;
    ASSERT n = 1, format('smoke fail: %s table missing', t);

    SELECT count(*) INTO n FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t;
    ASSERT n = 2, format('smoke fail: %s expected 2 policies, found %s', t, n);

    EXECUTE format(
      'SELECT relrowsecurity FROM pg_class WHERE oid = ''public.%I''::regclass', t
    ) INTO n;
    ASSERT n::boolean, format('smoke fail: RLS not enabled on %s', t);

    SELECT count(*) INTO n FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = t
       AND grantee = 'authenticated' AND privilege_type = 'SELECT';
    ASSERT n = 1, format('smoke fail: %s authenticated SELECT grant missing', t);
  END LOOP;
  RAISE NOTICE 'ok: both tables + §3 clauses present';
END $$;

-- 2. invoice_payments.method now accepts 'deposit_applied' and still rejects junk.
DO $$
DECLARE v_inv uuid;
BEGIN
  SELECT id INTO v_inv FROM public.invoices LIMIT 1;
  IF v_inv IS NULL THEN
    RAISE NOTICE 'skip: no invoice seeded to test widened method CHECK';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.invoice_payments (invoice_id, amount, method, paid_at)
    VALUES (v_inv, 1, 'deposit_applied', CURRENT_DATE);
    DELETE FROM public.invoice_payments
     WHERE invoice_id = v_inv AND method = 'deposit_applied' AND amount = 1;
    RAISE NOTICE 'ok: deposit_applied accepted by widened CHECK';
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'smoke fail: deposit_applied rejected — 0091 CHECK not applied';
  END;

  BEGIN
    INSERT INTO public.invoice_payments (invoice_id, amount, method, paid_at)
    VALUES (v_inv, 1, 'bitcoin', CURRENT_DATE);
    RAISE EXCEPTION 'smoke fail: bad method still accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  RAISE NOTICE 'ok: invoice_payments method CHECK enforced';
END $$;

-- 3. amount > 0 + method CHECKs on the new tables.
DO $$
DECLARE v_proj uuid;
BEGIN
  SELECT id INTO v_proj FROM public.projects LIMIT 1;
  IF v_proj IS NULL THEN
    RAISE NOTICE 'skip: no project seeded to test deposit CHECKs';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.project_deposits (project_id, amount, method, received_at)
    VALUES (v_proj, 0, 'cheque', CURRENT_DATE);
    RAISE EXCEPTION 'smoke fail: deposit amount = 0 accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.project_deposits (project_id, amount, method, received_at)
    VALUES (v_proj, 100, 'wire', CURRENT_DATE);
    RAISE EXCEPTION 'smoke fail: bad deposit method accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  RAISE NOTICE 'ok: project_deposits amount + method CHECKs enforced';
END $$;

-- 4. End-to-end: RESTRICT on deposit + invoice, CASCADE on the paired payment.
DO $$
DECLARE
  v_client uuid; v_proj uuid; v_inv uuid; v_dep uuid; v_app uuid; n int;
BEGIN
  SELECT id INTO v_client FROM public.clients LIMIT 1;
  SELECT id INTO v_proj FROM public.projects LIMIT 1;
  IF v_client IS NULL OR v_proj IS NULL THEN
    RAISE NOTICE 'skip: need a client + project to test RESTRICT/CASCADE';
    RETURN;
  END IF;

  INSERT INTO public.invoices (opco, client_id, project_id, status, amount_due)
  VALUES ('integrated_solutions', v_client, v_proj, 'sent', 500)
  RETURNING id INTO v_inv;

  INSERT INTO public.project_deposits (project_id, amount, method, received_at)
  VALUES (v_proj, 300, 'cheque', CURRENT_DATE)
  RETURNING id INTO v_dep;

  INSERT INTO public.deposit_applications (deposit_id, invoice_id, amount, applied_at)
  VALUES (v_dep, v_inv, 200, CURRENT_DATE)
  RETURNING id INTO v_app;

  INSERT INTO public.invoice_payments
    (invoice_id, amount, method, paid_at, deposit_application_id)
  VALUES (v_inv, 200, 'deposit_applied', CURRENT_DATE, v_app);

  -- 4a. deposit with an application cannot be deleted
  BEGIN
    DELETE FROM public.project_deposits WHERE id = v_dep;
    RAISE EXCEPTION 'smoke fail: deleted a deposit that has applications';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok: deposit RESTRICT holds';
  END;

  -- 4b. invoice with an application cannot be deleted
  BEGIN
    DELETE FROM public.invoices WHERE id = v_inv;
    RAISE EXCEPTION 'smoke fail: deleted an invoice that has deposit applications';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok: invoice RESTRICT holds';
  END;

  -- 4c. deleting the application cascades the paired settlement away
  DELETE FROM public.deposit_applications WHERE id = v_app;
  SELECT count(*) INTO n FROM public.invoice_payments
   WHERE deposit_application_id = v_app;
  ASSERT n = 0, 'smoke fail: paired deposit_applied payment survived the CASCADE';
  RAISE NOTICE 'ok: application delete cascades its settlement row';

  -- Tear down the probe.
  DELETE FROM public.invoice_payments WHERE invoice_id = v_inv;
  DELETE FROM public.project_deposits WHERE id = v_dep;
  DELETE FROM public.invoices WHERE id = v_inv;
END $$;
