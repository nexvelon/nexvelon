-- INV-9-2 (migration 0110) — cycle-count sessions. Consumption reconciliation
-- (Part A) is pure derivation over the cost rollup and needs NO tables; only the
-- cycle-count workflow (Part B) persists.
--
-- A count session snapshots the EXPECTED on-hand at a scope (a stock location
-- and/or a product category), the counter enters a BLIND physical count per
-- line, variances are reviewed, and applying the session posts the corrections
-- through the existing adjustStockQuantity ledger primitive.
--
-- GRAIN (deviation from the brief's per-product-aggregate suggestion, reported):
-- one count line PER STOCK ROW (each carries stock_id). Because the cost model is
-- specific-identification (every inventory_stock row has its own unit_cost) and
-- the apply primitive adjustStockQuantity operates on a single row, per-row lines
-- make apply a clean 1:1 fan-out with no need to invent a multi-lot allocation or
-- a cost for "found" units. A bulk product with 3 lots at a location → 3 lines.

BEGIN;

CREATE TABLE public.inventory_count_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       text NOT NULL UNIQUE,                       -- CNT-YYYY-NNNN
  -- Scope: a location and/or a category. Both NULL = every physically-located
  -- in_stock row (rows deployed to a job cost-center are never counted here).
  location_id     uuid REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  category_id     uuid REFERENCES public.inventory_categories(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','counting','review','applied','cancelled')),
  counted_by      text,
  notes           text,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  applied_at      timestamptz,
  applied_by      uuid,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_count_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES public.inventory_count_sessions(id) ON DELETE CASCADE,
  product_id         uuid REFERENCES public.inventory_products(id) ON DELETE SET NULL,
  stock_id           uuid REFERENCES public.inventory_stock(id) ON DELETE SET NULL,
  product_label      text,                     -- snapshot: product name
  sku_snapshot       text,                     -- snapshot: sku
  serial_snapshot    text,                     -- snapshot: serial (serialized rows)
  unit_cost_snapshot numeric(14,2),            -- snapshot: the row's unit_cost
  expected_qty       numeric(14,2) NOT NULL,   -- captured at session open
  counted_qty        numeric(14,2),            -- entered during the (blind) count
  variance_qty       numeric(14,2),            -- counted − expected (stamped at apply)
  variance_value     numeric(14,2),            -- variance_qty × unit_cost_snapshot
  applied            boolean NOT NULL DEFAULT false,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_count_lines_session_idx ON public.inventory_count_lines (session_id);
CREATE INDEX inventory_count_sessions_status_idx ON public.inventory_count_sessions (status);

CREATE TRIGGER inventory_count_sessions_set_updated_at
  BEFORE UPDATE ON public.inventory_count_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Sequential per-year reference CNT-YYYY-NNNN (mirror next_sub_agreement_number).
CREATE OR REPLACE FUNCTION public.next_count_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE yr text; n integer;
BEGIN
  yr := to_char(current_date, 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(reference FROM 'CNT-'||yr||'-(\d+)$') AS integer)), 0) + 1
    INTO n
    FROM public.inventory_count_sessions
   WHERE reference LIKE 'CNT-'||yr||'-%';
  RETURN 'CNT-'||yr||'-'||LPAD(n::text, 4, '0');
END; $$;

-- §3: NEW tables → GRANTs + RLS + policies (project_jobs pattern).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_count_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_count_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_count_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_count_lines TO service_role;

ALTER TABLE public.inventory_count_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_count_sessions_select_authenticated
  ON public.inventory_count_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY inventory_count_sessions_all_authenticated
  ON public.inventory_count_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY inventory_count_lines_select_authenticated
  ON public.inventory_count_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY inventory_count_lines_all_authenticated
  ON public.inventory_count_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.next_count_reference();
--   DROP TABLE IF EXISTS public.inventory_count_lines;
--   DROP TABLE IF EXISTS public.inventory_count_sessions;
--   COMMIT;
