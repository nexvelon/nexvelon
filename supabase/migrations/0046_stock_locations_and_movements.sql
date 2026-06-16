-- 0046_stock_locations_and_movements.sql
-- MOVE-1 (Batch D1): stock locations + append-only movement ledger.
--   • stock_locations    — warehouses + trucks (holder_name = the tech/sub a
--                          truck is assigned to). Seeds one Main Warehouse.
--   • inventory_stock.current_location_id / current_cost_center_id — where a
--     stock row currently sits: EITHER a location OR a job (cost-center), never
--     both. Existing in-stock rows backfill to the Main Warehouse.
--   • stock_movements    — APPEND-ONLY ledger (SELECT + INSERT policies only;
--                          no UPDATE/DELETE). from_/to_ carry a label snapshot
--                          so history survives later renames/deletes.
-- RLS: authenticated SELECT + write on locations; SELECT + INSERT (append-only)
-- on movements. updated_at via the shared handle_updated_at() trigger.
--
-- Applied via the Dashboard SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location_type text NOT NULL DEFAULT 'warehouse',   -- 'warehouse' | 'truck'
  holder_name text,                                    -- for trucks: tech/sub holding it
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.stock_locations (name, location_type)
SELECT 'Main Warehouse', 'warehouse'
WHERE NOT EXISTS (SELECT 1 FROM public.stock_locations WHERE location_type = 'warehouse');

ALTER TABLE public.inventory_stock
  ADD COLUMN IF NOT EXISTS current_location_id    uuid REFERENCES public.stock_locations(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_cost_center_id uuid REFERENCES public.project_cost_centers(id) ON DELETE SET NULL;

UPDATE public.inventory_stock
SET current_location_id = (SELECT id FROM public.stock_locations WHERE location_type='warehouse' ORDER BY created_at LIMIT 1)
WHERE current_location_id IS NULL AND current_cost_center_id IS NULL AND status = 'in_stock';

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
  stock_id   uuid REFERENCES public.inventory_stock(id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 1,
  from_type text, from_id uuid, from_label text,       -- label = snapshot so history survives renames/deletes
  to_type   text, to_id   uuid, to_label   text,       -- types: 'warehouse'|'truck'|'job'|'vendor'|'manual'
  moved_by uuid, moved_by_name text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS stock_movements_stock_idx   ON public.stock_movements(stock_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.stock_locations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.stock_locations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_locations_select_authenticated ON public.stock_locations;
CREATE POLICY stock_locations_select_authenticated ON public.stock_locations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS stock_locations_write_authenticated ON public.stock_locations;
CREATE POLICY stock_locations_write_authenticated ON public.stock_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS stock_movements_select_authenticated ON public.stock_movements;
CREATE POLICY stock_movements_select_authenticated ON public.stock_movements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS stock_movements_insert_authenticated ON public.stock_movements;
CREATE POLICY stock_movements_insert_authenticated ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (true);
-- append-only: SELECT + INSERT only, no UPDATE/DELETE policy

COMMIT;
