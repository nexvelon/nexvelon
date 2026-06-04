-- 0021_inventory_schema.sql
-- INV-1: Inventory foundation — specific-identification cost tracking (lock §2.4).
-- Two-table model: inventory_products (catalog) + inventory_stock (one row per
-- physical unit for serialized items; one row per lot for bulk items).
-- "Quantity on hand" / avg / by-location are COMPUTED from inventory_stock at the
-- API layer (INV-2) — never stored — to honor §2.4. Overrides handoff §8's
-- single-table inventory_items + quantity_on_hand sketch.
--
-- Mirrors the 0016_activity_log.sql posture: gen_random_uuid() id default,
-- RLS enabled with authenticated policies. inventory_products is the catalog
-- (operator-entered UNIQUE sku; free-text category/manufacturer/vendor kept as
-- text per §2.1 schema-flexibility precedent — the UI Product unions can grow
-- without a migration). inventory_stock holds one row per physical unit (or lot),
-- each carrying its own unit_cost for specific-identification margin tracking.
-- reorder_point / reorder_qty are columns only here; alert logic ships in INV-5.

BEGIN;

CREATE TABLE IF NOT EXISTS public.inventory_products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku               text NOT NULL,
  name              text NOT NULL,
  description       text,
  category          text,
  manufacturer      text,
  vendor            text,
  tracking_mode     text NOT NULL DEFAULT 'serialized'
                      CHECK (tracking_mode IN ('serialized','bulk')),
  unit_of_measure   text NOT NULL DEFAULT 'each',
  default_unit_cost numeric(12,2),
  list_price        numeric(12,2),
  reorder_point     integer,   -- column only; alert logic ships in INV-5
  reorder_qty       integer,   -- column only; INV-5
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_products_sku_key UNIQUE (sku)
);

CREATE TABLE IF NOT EXISTS public.inventory_stock (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
  serial_number text,                       -- serialized only; NULL for bulk lots
  unit_cost     numeric(12,2) NOT NULL,     -- specific-identification cost (§2.4)
  quantity      integer NOT NULL DEFAULT 1 CHECK (quantity > 0), -- 1 per unit; N per bulk lot
  location      text,
  supplier      text,
  status        text NOT NULL DEFAULT 'in_stock'
                  CHECK (status IN ('in_stock','allocated','consumed','retired')),
  acquired_at   date,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_stock_product_id_idx ON public.inventory_stock (product_id);
CREATE INDEX IF NOT EXISTS inventory_stock_status_idx     ON public.inventory_stock (status);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_stock_serial_unique
  ON public.inventory_stock (serial_number) WHERE serial_number IS NOT NULL;

ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_products_select_authenticated" ON public.inventory_products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_products_write_authenticated" ON public.inventory_products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "inventory_stock_select_authenticated" ON public.inventory_stock
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "inventory_stock_write_authenticated" ON public.inventory_stock
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
