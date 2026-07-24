-- 0103_warranties_bonds.sql
-- PROJ2-14 + PROJ2-19 — warranty & handover (project/job) and bonds & insurance
-- (project). Batched: both are date-tracked records with a start, an end, a
-- DERIVED active/expiring/expired state (lib/expiry-state.ts — the SUB-2
-- vocabulary generalised), documents, and a surfacing rule.
--
-- §2.1 additive; §3: GRANTs + RLS + policies on BOTH tables (project_jobs
-- pattern). end_date is the truth for warranties (duration_months is a
-- convenience input). project_bonds.status is an OPERATIONAL state (released /
-- cancelled are decisions) and is DISTINCT from the derived expiry state — a
-- bond can be status='active' yet expiry-derived 'expired' (the alarm case); we
-- never auto-flip status on expiry, we surface the mismatch.

BEGIN;

-- ── PROJ2-14: warranty / handover ────────────────────────────────────────────
CREATE TABLE public.warranties (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES public.projects(id)
                          ON DELETE CASCADE,
  job_id             uuid REFERENCES public.project_jobs(id)
                          ON DELETE CASCADE,       -- NULL = project-wide
  scope              text NOT NULL DEFAULT 'workmanship'
                     CHECK (scope IN ('workmanship','equipment',
                                      'manufacturer','extended','other')),
  description        text,
  start_date         date NOT NULL,
  duration_months    integer,                      -- convenience; end_date is truth
  end_date           date NOT NULL,
  handover_date      date,                         -- when the client took possession
  handover_notes     text,
  handover_signed_by text,                         -- client rep name
  provider           text,                         -- 'Nexvelon' or a manufacturer
  reference_number   text,
  notes              text,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.warranties
  ADD CONSTRAINT warranties_date_order_check
  CHECK (end_date >= start_date);
CREATE INDEX warranties_project_idx ON public.warranties (project_id);
CREATE INDEX warranties_job_idx ON public.warranties (job_id);
CREATE INDEX warranties_end_date_idx ON public.warranties (end_date);

CREATE TRIGGER warranties_set_updated_at
  BEFORE UPDATE ON public.warranties
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── PROJ2-19: bonds & insurance (project-level) ──────────────────────────────
CREATE TABLE public.project_bonds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES public.projects(id)
                        ON DELETE CASCADE,
  bond_type        text NOT NULL
                   CHECK (bond_type IN ('performance','labour_material',
                                        'bid','maintenance',
                                        'liability_insurance',
                                        'builders_risk','other')),
  provider         text,                    -- surety / insurer
  policy_number    text,
  coverage_amount  numeric(14,2),
  premium_amount   numeric(14,2),
  effective_date   date,
  expiry_date      date,
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','expired','released','cancelled')),
  attachment_id    uuid REFERENCES public.attachments(id) ON DELETE SET NULL,
  notes            text,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_bonds
  ADD CONSTRAINT project_bonds_date_order_check
  CHECK (effective_date IS NULL OR expiry_date IS NULL
         OR expiry_date >= effective_date);
CREATE INDEX project_bonds_project_idx ON public.project_bonds (project_id);
CREATE INDEX project_bonds_expiry_idx ON public.project_bonds (expiry_date);
CREATE INDEX project_bonds_status_idx ON public.project_bonds (status);

CREATE TRIGGER project_bonds_set_updated_at
  BEFORE UPDATE ON public.project_bonds
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── §3 clauses on both tables (project_jobs pattern) ─────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warranties TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_bonds TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_bonds TO service_role;

ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_bonds ENABLE ROW LEVEL SECURITY;

CREATE POLICY warranties_select_authenticated
  ON public.warranties FOR SELECT TO authenticated USING (true);
CREATE POLICY warranties_all_authenticated
  ON public.warranties FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY project_bonds_select_authenticated
  ON public.project_bonds FOR SELECT TO authenticated USING (true);
CREATE POLICY project_bonds_all_authenticated
  ON public.project_bonds FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TABLE IF EXISTS public.project_bonds;
--   DROP TABLE IF EXISTS public.warranties;
--   COMMIT;
-- Linked attachments survive (project_bonds.attachment_id is SET NULL only on
-- attachment delete; dropping the table doesn't touch attachments).
-- ─────────────────────────────────────────────────────────────────────────────
