-- smoke_0090_invoice_payments.sql
-- Verify: invoice_payments table + §3 clauses; amount>0 CHECK; method CHECK;
-- invoices status CHECK (incl. new 'partially_paid'); invoice_lines source_type
-- CHECK; and ON DELETE RESTRICT blocking deletion of an invoice with payments.

-- 1. Table exists with §3 clauses (RLS on + both policies + GRANTs).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'invoice_payments';
  ASSERT n = 1, 'smoke fail: invoice_payments table missing';

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'invoice_payments';
  ASSERT n = 2, format('smoke fail: expected 2 policies, found %s', n);

  ASSERT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.invoice_payments'::regclass),
         'smoke fail: RLS not enabled on invoice_payments';

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'invoice_payments'
     AND grantee = 'authenticated' AND privilege_type = 'SELECT';
  ASSERT n = 1, 'smoke fail: authenticated SELECT grant missing';
  RAISE NOTICE 'ok: invoice_payments table + §3 clauses present';
END $$;

-- 2. amount > 0 and method CHECKs reject bad rows.
DO $$
DECLARE v_inv uuid;
BEGIN
  SELECT id INTO v_inv FROM public.invoices LIMIT 1;
  IF v_inv IS NULL THEN
    RAISE NOTICE 'skip: no invoice seeded to test payment CHECKs';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.invoice_payments (invoice_id, amount, method, paid_at)
    VALUES (v_inv, 0, 'cheque', CURRENT_DATE);
    RAISE EXCEPTION 'smoke fail: amount = 0 accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.invoice_payments (invoice_id, amount, method, paid_at)
    VALUES (v_inv, 100, 'bitcoin', CURRENT_DATE);
    RAISE EXCEPTION 'smoke fail: bad method accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  RAISE NOTICE 'ok: payment amount + method CHECKs enforced';
END $$;

-- 3. invoices status CHECK: 'partially_paid' allowed, garbage rejected.
DO $$
DECLARE v_client uuid;
BEGIN
  SELECT id INTO v_client FROM public.clients LIMIT 1;
  IF v_client IS NULL THEN
    RAISE NOTICE 'skip: no client seeded to test status CHECK';
    RETURN;
  END IF;

  -- partially_paid is now a valid state.
  BEGIN
    INSERT INTO public.invoices (opco, client_id, status)
    VALUES ('integrated_solutions', v_client, 'partially_paid');
    RAISE NOTICE 'ok: partially_paid accepted';
    -- clean up the probe row
    DELETE FROM public.invoices
     WHERE client_id = v_client AND status = 'partially_paid'
       AND invoice_number IS NULL
       AND created_at > now() - interval '1 minute';
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'smoke fail: partially_paid rejected by status CHECK';
  END;

  -- garbage status rejected.
  BEGIN
    INSERT INTO public.invoices (opco, client_id, status)
    VALUES ('integrated_solutions', v_client, 'nonsense');
    RAISE EXCEPTION 'smoke fail: bad status accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  RAISE NOTICE 'ok: invoices status CHECK enforced';
END $$;

-- 4. invoice_lines source_type CHECK rejects out-of-set values.
DO $$
DECLARE v_inv uuid;
BEGIN
  SELECT id INTO v_inv FROM public.invoices LIMIT 1;
  IF v_inv IS NULL THEN
    RAISE NOTICE 'skip: no invoice to test source_type CHECK';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.invoice_lines (invoice_id, source_type)
    VALUES (v_inv, 'bogus');
    RAISE EXCEPTION 'smoke fail: bad source_type accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'ok: invoice_lines source_type CHECK enforced';
END $$;

-- 5. ON DELETE RESTRICT: an invoice with a payment cannot be deleted.
--    Runs inside a savepoint and rolls the probe back so no data changes.
DO $$
DECLARE v_client uuid; v_inv uuid;
BEGIN
  SELECT id INTO v_client FROM public.clients LIMIT 1;
  IF v_client IS NULL THEN
    RAISE NOTICE 'skip: no client seeded to test RESTRICT';
    RETURN;
  END IF;

  INSERT INTO public.invoices (opco, client_id, status)
  VALUES ('integrated_solutions', v_client, 'sent')
  RETURNING id INTO v_inv;

  INSERT INTO public.invoice_payments (invoice_id, amount, method, paid_at)
  VALUES (v_inv, 50, 'cash', CURRENT_DATE);

  BEGIN
    DELETE FROM public.invoices WHERE id = v_inv;
    RAISE EXCEPTION 'smoke fail: deleted an invoice that has payments';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'ok: invoice_payments RESTRICT blocks invoice deletion';
  END;

  -- Tear down the probe (payment first, then invoice).
  DELETE FROM public.invoice_payments WHERE invoice_id = v_inv;
  DELETE FROM public.invoices WHERE id = v_inv;
END $$;
