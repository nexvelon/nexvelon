-- 0107_cost_codes_snapshots.sql
-- PROJ2-17 (cost codes) + PROJ2-21 (margin snapshots). Two cost-analysis layers
-- over the existing rollup engine: cost codes categorise its numbers; snapshots
-- freeze them at a point in time.
--
-- §2.1 additive; §3 on the new tables. cost_code_id on job_line_items is
-- nullable (uncoded lines fall back to their line_kind category, so nothing is
-- lost). margin_snapshots are IMMUTABLE (§2.2) — no updated_at, no update path.

BEGIN;

-- ── PROJ2-17: cost codes (org-level taxonomy, seeded defaults) ────────────────
CREATE TABLE public.cost_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,          -- e.g. 'LAB','MAT','SUB','EQP'
  name          text NOT NULL,
  category      text NOT NULL
                CHECK (category IN ('labour','materials','subcontractor',
                                    'equipment','other')),
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER cost_codes_set_updated_at
  BEFORE UPDATE ON public.cost_codes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Optional cost code on line items (nullable — additive).
ALTER TABLE public.job_line_items
  ADD COLUMN cost_code_id uuid REFERENCES public.cost_codes(id) ON DELETE SET NULL;
CREATE INDEX job_line_items_cost_code_idx
  ON public.job_line_items (cost_code_id);

-- Seed the default taxonomy (idempotent).
INSERT INTO public.cost_codes (code, name, category, sort_order) VALUES
  ('LAB','Labour','labour',1),
  ('MAT','Materials','materials',2),
  ('SUB','Subcontractor','subcontractor',3),
  ('EQP','Equipment','equipment',4),
  ('OTH','Other','other',9)
ON CONFLICT (code) DO NOTHING;

-- ── PROJ2-21: margin snapshots (immutable point-in-time captures) ─────────────
CREATE TABLE public.margin_snapshots (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id         uuid REFERENCES public.project_jobs(id) ON DELETE CASCADE,
                 -- NULL = whole-project snapshot
  snapshot_at    timestamptz NOT NULL DEFAULT now(),
  reason         text,                          -- 'approval','50%','completion','manual', free text
  contract       numeric(14,2) NOT NULL DEFAULT 0,
  quoted_cost    numeric(14,2) NOT NULL DEFAULT 0,
  estimated_cost numeric(14,2) NOT NULL DEFAULT 0,
  actual_cost    numeric(14,2) NOT NULL DEFAULT 0,
  actual_revenue numeric(14,2) NOT NULL DEFAULT 0,
  margin         numeric(14,2) NOT NULL DEFAULT 0,   -- contract − actual_cost
  margin_pct     numeric(6,2),
  by_code        jsonb,                          -- {code: {estimated, actual}} frozen
  taken_by       uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- No updated_at / no trigger — snapshots are immutable (§2.2).
CREATE INDEX margin_snapshots_project_idx ON public.margin_snapshots (project_id);
CREATE INDEX margin_snapshots_job_idx ON public.margin_snapshots (job_id);
CREATE INDEX margin_snapshots_at_idx ON public.margin_snapshots (snapshot_at);

-- ── §3 clauses on both new tables ────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.margin_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.margin_snapshots TO service_role;

ALTER TABLE public.cost_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.margin_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY cost_codes_select_authenticated
  ON public.cost_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY cost_codes_all_authenticated
  ON public.cost_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY margin_snapshots_select_authenticated
  ON public.margin_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY margin_snapshots_all_authenticated
  ON public.margin_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TABLE IF EXISTS public.margin_snapshots;
--   ALTER TABLE public.job_line_items DROP COLUMN IF EXISTS cost_code_id;
--   DROP TABLE IF EXISTS public.cost_codes;
--   COMMIT;
-- Drop the column before cost_codes (the FK depends on it).
-- ─────────────────────────────────────────────────────────────────────────────
