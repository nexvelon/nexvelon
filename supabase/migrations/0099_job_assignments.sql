-- 0099_job_assignments.sql
-- SUB-6 — who is assigned to a job/project. An OPERATIONAL fact (who is on this
-- job, in what role, over what dates), distinct from SUB-5's work order (a
-- COMMERCIAL commitment: scope + money + issued PDF). An assignment may
-- optionally REFERENCE a work order (agreement_id) when both exist.
--
-- Designed to also carry IN-HOUSE techs later (PROJ2-15) WITHOUT a rewrite:
-- the assignee is one-of-N kinds — a nullable subcontractor_id AND a nullable
-- tech_id with a CHECK that exactly one is set. The techs table (0054) already
-- exists with a uuid PK, so tech_id gets a real FK now (audited safe).
--
-- §2.1 additive; §3: GRANTs + RLS + policies (project_jobs pattern).

BEGIN;

CREATE TABLE public.job_assignments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES public.projects(id)
                         ON DELETE CASCADE,
  job_id            uuid REFERENCES public.project_jobs(id)
                         ON DELETE CASCADE,      -- NULL = project-wide
  subcontractor_id  uuid REFERENCES public.subcontractors(id)
                         ON DELETE RESTRICT,
  -- PROJ2-15 hook. techs (migration 0054) has a uuid PK, so the FK is safe now.
  tech_id           uuid REFERENCES public.techs(id) ON DELETE RESTRICT,
  agreement_id      uuid REFERENCES public.sub_agreements(id)
                         ON DELETE SET NULL,     -- optional work-order link (2b)
  role              text NOT NULL DEFAULT 'crew'
                    CHECK (role IN ('lead','crew','supervisor',
                                    'specialist','other')),
  start_date        date,
  end_date          date,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','completed','removed')),
  notes             text,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Exactly one assignee kind (the "assignee is one of N kinds" pattern — 2c).
ALTER TABLE public.job_assignments
  ADD CONSTRAINT job_assignments_one_assignee_check
  CHECK (num_nonnulls(subcontractor_id, tech_id) = 1);

-- Date sanity.
ALTER TABLE public.job_assignments
  ADD CONSTRAINT job_assignments_date_order_check
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

CREATE INDEX job_assignments_project_idx ON public.job_assignments (project_id);
CREATE INDEX job_assignments_job_idx ON public.job_assignments (job_id);
CREATE INDEX job_assignments_sub_idx ON public.job_assignments (subcontractor_id);
CREATE INDEX job_assignments_status_idx ON public.job_assignments (status);

-- No duplicate ACTIVE assignment of the same sub to the same job.
CREATE UNIQUE INDEX job_assignments_unique_active_sub
  ON public.job_assignments (job_id, subcontractor_id)
  WHERE status = 'active' AND subcontractor_id IS NOT NULL
        AND job_id IS NOT NULL;

CREATE TRIGGER job_assignments_set_updated_at
  BEFORE UPDATE ON public.job_assignments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- §3: NEW table → GRANTs + RLS + policies (project_jobs pattern).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_assignments TO service_role;

ALTER TABLE public.job_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_assignments_select_authenticated
  ON public.job_assignments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY job_assignments_all_authenticated
  ON public.job_assignments FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TABLE IF EXISTS public.job_assignments;
--   COMMIT;
-- Self-contained. Referenced subcontractors / techs / agreements survive.
-- ─────────────────────────────────────────────────────────────────────────────
