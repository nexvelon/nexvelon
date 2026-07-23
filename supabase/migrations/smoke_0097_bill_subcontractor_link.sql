-- smoke_0097_bill_subcontractor_link.sql
-- Verify: column present + indexed; every existing bill is NULL (no backfill);
-- a bill can be inserted with a valid subcontractor_id; RESTRICT blocks deleting
-- a subcontractor that has bills.

-- 1. Column present, indexed, and NO existing row was classified.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vendor_bills'
     AND column_name = 'subcontractor_id';
  ASSERT n = 1, 'smoke fail: vendor_bills.subcontractor_id missing';

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'vendor_bills'
     AND indexname = 'vendor_bills_subcontractor_id_idx';
  ASSERT n = 1, 'smoke fail: subcontractor_id index missing';

  SELECT count(*) INTO n FROM public.vendor_bills WHERE subcontractor_id IS NOT NULL;
  ASSERT n = 0, format('smoke fail: expected 0 pre-classified bills, found %s', n);
  RAISE NOTICE 'ok: column + index present, no historical bill retro-classified';
END $$;

-- 2. A bill can carry a subcontractor_id; RESTRICT blocks deleting that sub.
DO $$
DECLARE v_vendor uuid; v_sub uuid; v_bill uuid;
BEGIN
  INSERT INTO public.vendors (name) VALUES ('Smoke Vendor 0097') RETURNING id INTO v_vendor;
  INSERT INTO public.subcontractors (name, vendor_id)
  VALUES ('Smoke Sub 0097', v_vendor) RETURNING id INTO v_sub;

  INSERT INTO public.vendor_bills
    (vendor_id, subcontractor_id, bill_number, bill_date, subtotal, tax_amount, total, status)
  VALUES (v_vendor, v_sub, 'SUB-BILL-1', CURRENT_DATE, 1000, 130, 1130, 'received')
  RETURNING id INTO v_bill;

  -- RESTRICT: deleting the subcontractor while a bill references it must fail.
  BEGIN
    DELETE FROM public.subcontractors WHERE id = v_sub;
    RAISE EXCEPTION 'smoke fail: subcontractor with bills was deletable (RESTRICT not enforced)';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;

  -- cleanup (bill first, then the now-unreferenced sub + vendor)
  DELETE FROM public.vendor_bills WHERE id = v_bill;
  DELETE FROM public.subcontractors WHERE id = v_sub;
  DELETE FROM public.vendors WHERE id = v_vendor;
  RAISE NOTICE 'ok: sub bill insert works; ON DELETE RESTRICT enforced';
END $$;
