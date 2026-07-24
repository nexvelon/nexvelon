-- 0102_deficiencies_commissioning.sql
-- PROJ2-12 + PROJ2-13 — deficiencies (punch list) and commissioning sign-off,
-- per Job. Shipped together because they share one shape: itemised lists
-- against a job, with status, an optional assignee, evidence, and a completion/
-- sign-off event. Both mirror PROJ2-11's job_tasks conventions (assignee is a
-- tech OR subcontractor OR nobody — num_nonnulls <= 1; sort_order for ordering).
--
-- §2.1 additive; §3: GRANTs + RLS + policies on ALL THREE tables (project_jobs
-- pattern). Stored completion timestamps (closed_at / signed_off_at) are
-- recorded facts about past events, not time-dependent derivations.

BEGIN;

-- ── PROJ2-12: deficiencies (punch list) ──────────────────────────────────────
CREATE TABLE public.job_deficiencies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES public.project_jobs(id) ON DELETE CASCADE,
  reference       text,                      -- e.g. "D-001", free label
  title           text NOT NULL,
  description     text,
  location        text,                      -- "Level 2 east corridor, door 214"
  severity        text NOT NULL DEFAULT 'minor'
                  CHECK (severity IN ('minor','major','safety')),
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','in_progress','ready_for_review',
                                    'closed','waived')),
  raised_by       text,                      -- consultant/client/internal name
  raised_at       date NOT NULL DEFAULT current_date,
  assignee_tech_id uuid REFERENCES public.techs(id) ON DELETE SET NULL,
  assignee_subcontractor_id uuid REFERENCES public.subcontractors(id)
                       ON DELETE SET NULL,
  due_date        date,
  closed_at       timestamptz,
  closed_by       uuid,
  resolution_note text,
  sort_order      integer NOT NULL DEFAULT 0,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- At most one assignee kind (0 or 1) — same rule as job_tasks.
ALTER TABLE public.job_deficiencies
  ADD CONSTRAINT job_deficiencies_assignee_check
  CHECK (num_nonnulls(assignee_tech_id, assignee_subcontractor_id) <= 1);
CREATE INDEX job_deficiencies_job_idx ON public.job_deficiencies (job_id);
CREATE INDEX job_deficiencies_project_idx ON public.job_deficiencies (project_id);
CREATE INDEX job_deficiencies_status_idx ON public.job_deficiencies (status);

CREATE TRIGGER job_deficiencies_set_updated_at
  BEFORE UPDATE ON public.job_deficiencies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── PROJ2-13: commissioning ──────────────────────────────────────────────────
-- A commissioning RUN is one sign-off event for a job; items are the checklist
-- rows within it. Multiple runs allowed (a re-test after fixing deficiencies is
-- a NEW run, so the sign-off history is preserved — you can see the failed run
-- and the passing one).
CREATE TABLE public.commissioning_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES public.project_jobs(id) ON DELETE CASCADE,
  title           text NOT NULL DEFAULT 'Commissioning',
  status          text NOT NULL DEFAULT 'in_progress'
                  CHECK (status IN ('in_progress','completed','signed_off','cancelled')),
  performed_by    text,                      -- technician name (free text v1)
  performed_at    date,
  witnessed_by    text,                      -- client/consultant name
  signed_off_at   timestamptz,
  signed_off_by   uuid,
  -- Signature: a trimmed-PNG data URL, exactly like pickup slips
  -- (signature_data_url) and the invite T&C flow. Reused verbatim.
  signature_data  text,
  signer_name     text,
  signer_title    text,
  pdf_path        text,                      -- certificate once signed
  notes           text,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commissioning_runs_job_idx ON public.commissioning_runs (job_id);
CREATE INDEX commissioning_runs_project_idx ON public.commissioning_runs (project_id);

CREATE TRIGGER commissioning_runs_set_updated_at
  BEFORE UPDATE ON public.commissioning_runs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.commissioning_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.commissioning_runs(id)
                       ON DELETE CASCADE,
  category        text,                      -- "Cameras", "Access control", ...
  description     text NOT NULL,
  expected_result text,
  result          text NOT NULL DEFAULT 'pending'
                  CHECK (result IN ('pending','pass','fail','na')),
  actual_note     text,
  -- A failed item can raise a deficiency; link them. SET NULL so deleting the
  -- deficiency doesn't destroy the commissioning record of the failure.
  deficiency_id   uuid REFERENCES public.job_deficiencies(id) ON DELETE SET NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commissioning_items_run_idx ON public.commissioning_items (run_id);

CREATE TRIGGER commissioning_items_set_updated_at
  BEFORE UPDATE ON public.commissioning_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── §3 clauses on all three tables (project_jobs pattern) ─────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_deficiencies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_deficiencies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissioning_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissioning_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissioning_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissioning_items TO service_role;

ALTER TABLE public.job_deficiencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissioning_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissioning_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_deficiencies_select_authenticated
  ON public.job_deficiencies FOR SELECT TO authenticated USING (true);
CREATE POLICY job_deficiencies_all_authenticated
  ON public.job_deficiencies FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY commissioning_runs_select_authenticated
  ON public.commissioning_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY commissioning_runs_all_authenticated
  ON public.commissioning_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY commissioning_items_select_authenticated
  ON public.commissioning_items FOR SELECT TO authenticated USING (true);
CREATE POLICY commissioning_items_all_authenticated
  ON public.commissioning_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TABLE IF EXISTS public.commissioning_items;
--   DROP TABLE IF EXISTS public.commissioning_runs;
--   DROP TABLE IF EXISTS public.job_deficiencies;
--   COMMIT;
-- Order matters: items reference runs; commissioning_items.deficiency_id
-- references job_deficiencies (SET NULL, so drop order above is safe).
-- ─────────────────────────────────────────────────────────────────────────────
