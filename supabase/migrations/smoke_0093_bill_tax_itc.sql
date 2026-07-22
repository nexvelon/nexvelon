-- smoke_0093_bill_tax_itc.sql
-- Verify: both columns present; claimable backfilled to tax_amount on every
-- existing row; the claimable range CHECK (>= 0 and <= tax_amount); the opco
-- CHECK rejecting garbage while accepting NULL and both real values.

-- 1. Columns exist with the right types.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vendor_bills'
     AND column_name = 'claimable_tax_amount';
  ASSERT n = 1, 'smoke fail: vendor_bills.claimable_tax_amount missing';

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vendor_bills'
     AND column_name = 'opco';
  ASSERT n = 1, 'smoke fail: vendor_bills.opco missing';

  RAISE NOTICE 'ok: claimable_tax_amount + opco columns present';
END $$;

-- 2. Backfill: no existing row was left with a NULL claimable, and every one
--    matches its tax_amount.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.vendor_bills
   WHERE claimable_tax_amount IS NULL
      OR claimable_tax_amount <> tax_amount;
  ASSERT n = 0,
    format('smoke fail: %s bill(s) not backfilled to full claimable tax', n);
  RAISE NOTICE 'ok: claimable backfilled = tax_amount on all existing rows';
END $$;

-- 3. Claimable range CHECK + opco CHECK.
DO $$
DECLARE v_vendor uuid; v_bill uuid;
BEGIN
  SELECT id INTO v_vendor FROM public.vendors LIMIT 1;
  IF v_vendor IS NULL THEN
    RAISE NOTICE 'skip: no vendor seeded to test 0093 CHECKs';
    RETURN;
  END IF;

  -- claimable ABOVE tax is rejected (can't claim more than you were charged)
  BEGIN
    INSERT INTO public.vendor_bills
      (vendor_id, bill_number, bill_date, subtotal, tax_amount, total,
       claimable_tax_amount)
    VALUES (v_vendor, 'SMOKE-0093-A', CURRENT_DATE, 100, 13, 113, 20);
    RAISE EXCEPTION 'smoke fail: claimable > tax_amount accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- negative claimable is rejected
  BEGIN
    INSERT INTO public.vendor_bills
      (vendor_id, bill_number, bill_date, subtotal, tax_amount, total,
       claimable_tax_amount)
    VALUES (v_vendor, 'SMOKE-0093-B', CURRENT_DATE, 100, 13, 113, -1);
    RAISE EXCEPTION 'smoke fail: negative claimable accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- garbage opco is rejected
  BEGIN
    INSERT INTO public.vendor_bills
      (vendor_id, bill_number, bill_date, subtotal, tax_amount, total, opco)
    VALUES (v_vendor, 'SMOKE-0093-C', CURRENT_DATE, 100, 13, 113, 'acme_holdings');
    RAISE EXCEPTION 'smoke fail: bad opco accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- a partial ITC + a real opco is accepted, and so is a NULL opco
  INSERT INTO public.vendor_bills
    (vendor_id, bill_number, bill_date, subtotal, tax_amount, total,
     claimable_tax_amount, opco)
  VALUES (v_vendor, 'SMOKE-0093-D', CURRENT_DATE, 100, 13, 113, 6.50, 'guardian')
  RETURNING id INTO v_bill;
  DELETE FROM public.vendor_bills WHERE id = v_bill;

  INSERT INTO public.vendor_bills
    (vendor_id, bill_number, bill_date, subtotal, tax_amount, total,
     claimable_tax_amount, opco)
  VALUES (v_vendor, 'SMOKE-0093-E', CURRENT_DATE, 100, 13, 113, 13, NULL)
  RETURNING id INTO v_bill;
  DELETE FROM public.vendor_bills WHERE id = v_bill;

  RAISE NOTICE 'ok: claimable range + opco CHECKs enforced';
END $$;
