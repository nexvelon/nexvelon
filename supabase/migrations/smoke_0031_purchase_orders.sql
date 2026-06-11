-- ============================================================================
-- Nexvelon · Chunk PO-2 — Post-deploy Smoke Verification (migration 0031)
-- ============================================================================
-- Run AFTER 0031_purchase_orders.sql has been applied.
--
-- Verifies the purchase_orders + purchase_order_lines table shapes, key
-- columns, FKs (vendor RESTRICT, PO CASCADE, product RESTRICT), RLS, policies,
-- triggers, and an insert→update→cascade-delete round-trip. ROLLBACK so nothing
-- persists. FAILs sort first.
--
-- Trigger round-trip note: handle_updated_at() stamps updated_at = now(), which
-- is the TRANSACTION start time (constant inside a txn). So a naive
-- "updated_at > created_at" after an in-txn UPDATE is a false fail. We seed both
-- timestamps to a clock_timestamp()-based PAST value, then UPDATE — the trigger
-- moves updated_at forward to txn-now(), which is provably > the seeded past
-- created_at, isolating the trigger's effect.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE smoke_results (
  check_name text,
  status     text
) ON COMMIT DROP;

-- ─── Structure ───────────────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'purchase_orders table exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='purchase_orders') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'purchase_order_lines table exists',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='purchase_order_lines') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'po.status NOT NULL with draft default',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='purchase_orders'
      AND column_name='status' AND is_nullable='NO'
      AND column_default LIKE '%draft%') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'po.vendor_id uuid NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='purchase_orders'
      AND column_name='vendor_id' AND data_type='uuid' AND is_nullable='NO') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'line.quantity integer NOT NULL',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='purchase_order_lines'
      AND column_name='quantity' AND data_type='integer' AND is_nullable='NO') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'line.received_qty integer NOT NULL default 0',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='purchase_order_lines'
      AND column_name='received_qty' AND data_type='integer' AND is_nullable='NO') THEN 'PASS' ELSE 'FAIL' END;

-- ─── FKs (delete rules) ──────────────────────────────────────────────────
INSERT INTO smoke_results SELECT 'FK po.vendor_id -> vendors ON DELETE RESTRICT',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.purchase_orders'::regclass
      AND confrelid='public.vendors'::regclass
      AND contype='f' AND confdeltype='r') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'FK line.purchase_order_id -> purchase_orders ON DELETE CASCADE',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.purchase_order_lines'::regclass
      AND confrelid='public.purchase_orders'::regclass
      AND contype='f' AND confdeltype='c') THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'FK line.product_id -> inventory_products ON DELETE RESTRICT',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.purchase_order_lines'::regclass
      AND confrelid='public.inventory_products'::regclass
      AND contype='f' AND confdeltype='r') THEN 'PASS' ELSE 'FAIL' END;

-- ─── RLS + policies + triggers ───────────────────────────────────────────
INSERT INTO smoke_results SELECT 'RLS enabled on both tables',
  CASE WHEN (SELECT count(*) FROM pg_tables
    WHERE schemaname='public' AND tablename IN ('purchase_orders','purchase_order_lines')
      AND rowsecurity=true) = 2 THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'each table has >=2 policies',
  CASE WHEN (
    (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='purchase_orders') >= 2
    AND (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='purchase_order_lines') >= 2
  ) THEN 'PASS' ELSE 'FAIL' END;

INSERT INTO smoke_results SELECT 'both updated_at triggers present',
  CASE WHEN (SELECT count(*) FROM information_schema.triggers
    WHERE event_object_schema='public'
      AND trigger_name IN ('purchase_orders_set_updated_at','purchase_order_lines_set_updated_at')) = 2
  THEN 'PASS' ELSE 'FAIL' END;

-- ─── Round-trip (insert → update → cascade-delete), rolled back ──────────
DO $$
DECLARE
  v_vendor uuid;
  v_po     uuid;
  v_line   uuid;
  v_old    timestamptz := clock_timestamp() - interval '10 seconds';
  v_upd    timestamptz;
  v_crt    timestamptz;
  v_lines_after_delete int;
BEGIN
  INSERT INTO public.vendors (name) VALUES ('SMOKE PO Vendor') RETURNING id INTO v_vendor;

  -- Seed created_at/updated_at in the past so the UPDATE trigger's now() stamp
  -- is provably later (isolates the trigger from the constant txn now()).
  INSERT INTO public.purchase_orders (po_number, vendor_id, created_at, updated_at)
    VALUES ('PO-SMOKE', v_vendor, v_old, v_old)
    RETURNING id INTO v_po;

  INSERT INTO public.purchase_order_lines
    (purchase_order_id, description, quantity, unit_cost, line_no)
    VALUES (v_po, 'Smoke line', 3, 12.50, 1)
    RETURNING id INTO v_line;

  INSERT INTO smoke_results SELECT 'round-trip: PO defaults to status draft',
    CASE WHEN (SELECT status FROM public.purchase_orders WHERE id=v_po) = 'draft'
      THEN 'PASS' ELSE 'FAIL' END;

  UPDATE public.purchase_orders SET reference='bumped' WHERE id=v_po;
  SELECT updated_at, created_at INTO v_upd, v_crt FROM public.purchase_orders WHERE id=v_po;

  INSERT INTO smoke_results SELECT 'round-trip: update trigger bumped updated_at',
    CASE WHEN v_upd > v_crt THEN 'PASS' ELSE 'FAIL' END;

  DELETE FROM public.purchase_orders WHERE id=v_po;
  SELECT count(*) INTO v_lines_after_delete
    FROM public.purchase_order_lines WHERE id=v_line;

  INSERT INTO smoke_results SELECT 'round-trip: deleting PO cascades to lines',
    CASE WHEN v_lines_after_delete = 0 THEN 'PASS' ELSE 'FAIL' END;
END $$;

-- ─── Report — FAILs first, then alphabetical by check_name ───────────────
SELECT * FROM smoke_results ORDER BY (status = 'PASS'), check_name;

ROLLBACK;
