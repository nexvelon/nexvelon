-- 0054_labour.sql
-- JC-1: labour foundation — managed techs + labour entries on cost-centers.
--   techs          — admin-managed worker list (name + optional default cost
--                    rate + active flag).
--   labour_entries — hours logged against a project_cost_centers row. tech_name
--                    and cost_rate are SNAPSHOTS taken at entry time so later
--                    tech renames / rate changes never rewrite history. amount
--                    (= hours * cost_rate) is persisted for fast per-cost-center
--                    rollups. cost_center_id is ON DELETE RESTRICT (a cost
--                    center with labour can't be deleted); tech_id is ON DELETE
--                    SET NULL (the snapshot keeps the name).
-- RLS: authenticated SELECT + write; financials:edit is enforced at the action
-- layer. updated_at via the shared handle_updated_at() trigger.
--
-- Applied via the Dashboard SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.techs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  default_cost_rate numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.labour_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_center_id uuid NOT NULL REFERENCES public.project_cost_centers(id) ON DELETE RESTRICT,
  tech_id uuid REFERENCES public.techs(id) ON DELETE SET NULL,
  tech_name text NOT NULL,                              -- snapshot so renames don't rewrite history
  worked_on date NOT NULL DEFAULT CURRENT_DATE,
  hours numeric NOT NULL,
  cost_rate numeric NOT NULL,                           -- snapshot of the rate at entry time
  amount numeric NOT NULL,                              -- hours * cost_rate, persisted for fast rollup
  note text,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS labour_entries_cost_center_idx ON public.labour_entries(cost_center_id);
CREATE INDEX IF NOT EXISTS labour_entries_tech_idx        ON public.labour_entries(tech_id);
CREATE INDEX IF NOT EXISTS labour_entries_worked_on_idx   ON public.labour_entries(worked_on);

DROP TRIGGER IF EXISTS set_updated_at ON public.techs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.techs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON public.labour_entries;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.labour_entries FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.techs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labour_entries  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS techs_select_authenticated ON public.techs;
CREATE POLICY techs_select_authenticated ON public.techs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS techs_write_authenticated ON public.techs;
CREATE POLICY techs_write_authenticated ON public.techs FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS labour_entries_select_authenticated ON public.labour_entries;
CREATE POLICY labour_entries_select_authenticated ON public.labour_entries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS labour_entries_write_authenticated ON public.labour_entries;
CREATE POLICY labour_entries_write_authenticated ON public.labour_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
