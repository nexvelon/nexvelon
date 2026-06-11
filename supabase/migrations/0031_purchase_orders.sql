BEGIN;

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number     text NOT NULL,
  vendor_id     uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','issued','partially_received','received','closed','cancelled')),
  order_date    date,
  expected_date date,
  reference     text,
  ship_to       text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_by    uuid
);

CREATE INDEX IF NOT EXISTS purchase_orders_vendor_id_idx ON public.purchase_orders (vendor_id);
CREATE INDEX IF NOT EXISTS purchase_orders_status_idx    ON public.purchase_orders (status);
CREATE INDEX IF NOT EXISTS purchase_orders_po_number_idx ON public.purchase_orders (po_number);

DROP TRIGGER IF EXISTS purchase_orders_set_updated_at ON public.purchase_orders;
CREATE TRIGGER purchase_orders_set_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  description       text,
  quantity          integer NOT NULL CHECK (quantity > 0),
  unit_cost         numeric(12,2) NOT NULL DEFAULT 0,
  received_qty      integer NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  line_no           integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_order_lines_po_id_idx      ON public.purchase_order_lines (purchase_order_id);
CREATE INDEX IF NOT EXISTS purchase_order_lines_product_id_idx ON public.purchase_order_lines (product_id);

DROP TRIGGER IF EXISTS purchase_order_lines_set_updated_at ON public.purchase_order_lines;
CREATE TRIGGER purchase_order_lines_set_updated_at
  BEFORE UPDATE ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_orders_select_authenticated ON public.purchase_orders;
CREATE POLICY purchase_orders_select_authenticated ON public.purchase_orders
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS purchase_orders_write_authenticated ON public.purchase_orders;
CREATE POLICY purchase_orders_write_authenticated ON public.purchase_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS purchase_order_lines_select_authenticated ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_select_authenticated ON public.purchase_order_lines
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS purchase_order_lines_write_authenticated ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_write_authenticated ON public.purchase_order_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
