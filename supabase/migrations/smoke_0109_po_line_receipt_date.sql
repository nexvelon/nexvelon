-- smoke_0109_po_line_receipt_date.sql
-- Verify: the two receipt-date columns exist and are NULL by default (no
-- backfill), and can be stamped by an UPDATE (the app stamps them on receive).
--
-- FIXTURE RULE: public.vendors.name is NOT NULL; purchase_orders.po_number and
-- vendor_id are NOT NULL; purchase_order_lines.quantity is NOT NULL (CHECK > 0).
-- No projects touched.

-- 1. Columns present.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='purchase_order_lines'
     AND column_name='last_received_at';
  ASSERT n = 1, 'smoke fail: purchase_order_lines.last_received_at missing';

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='purchase_orders'
     AND column_name='fully_received_at';
  ASSERT n = 1, 'smoke fail: purchase_orders.fully_received_at missing';
  RAISE NOTICE 'ok: receipt-date columns present';
END $$;

-- 2. Default NULL (no backfill) + stampable (rolled back).
DO $$
DECLARE v_vendor uuid; v_po uuid; v_line uuid; d date;
BEGIN
  INSERT INTO public.vendors (name) VALUES ('Smoke Vendor 0109') RETURNING id INTO v_vendor;
  INSERT INTO public.purchase_orders (po_number, vendor_id, status, expected_date)
    VALUES ('SMOKE-PO-0109', v_vendor, 'issued', CURRENT_DATE + 7)
    RETURNING id INTO v_po;
  INSERT INTO public.purchase_order_lines (purchase_order_id, quantity, unit_cost)
    VALUES (v_po, 5, 10) RETURNING id INTO v_line;

  -- No backfill: a freshly-created line/PO has NULL receipt dates.
  SELECT last_received_at INTO d FROM public.purchase_order_lines WHERE id = v_line;
  ASSERT d IS NULL, 'smoke fail: last_received_at should default NULL';
  SELECT fully_received_at INTO d FROM public.purchase_orders WHERE id = v_po;
  ASSERT d IS NULL, 'smoke fail: fully_received_at should default NULL';

  -- The app stamps these on receive; verify the columns accept a date.
  UPDATE public.purchase_order_lines SET last_received_at = CURRENT_DATE WHERE id = v_line;
  SELECT last_received_at INTO d FROM public.purchase_order_lines WHERE id = v_line;
  ASSERT d = CURRENT_DATE, 'smoke fail: last_received_at not stamped';

  UPDATE public.purchase_orders SET fully_received_at = CURRENT_DATE, status = 'received' WHERE id = v_po;
  SELECT fully_received_at INTO d FROM public.purchase_orders WHERE id = v_po;
  ASSERT d = CURRENT_DATE, 'smoke fail: fully_received_at not stamped';

  RAISE NOTICE 'ok: receipt dates default NULL and stamp correctly';
  RAISE EXCEPTION 'rollback smoke 0109';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'rollback smoke 0109' THEN RAISE; END IF;
  RAISE NOTICE 'ok: smoke rolled back';
END $$;
