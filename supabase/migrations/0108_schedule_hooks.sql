-- 0108_schedule_hooks.sql
-- PROJ2-20 — schedule HOOKS: lightweight planned dates + milestones + simple
-- finish-to-start dependencies, feeding a read-first Gantt. This is deliberately
-- the HOOK that Sprint 3's dispatch/scheduling module builds on — NOT the
-- scheduler. Sprint 3 owns the calendar/swimlane dispatch surface and its own
-- tables (schedule_jobs / schedule_assignments / tech_certifications); nothing
-- here collides with those.
--
-- §2.1 additive. project_jobs currently has NO date fields at all (only the
-- project carries start/target/actual), so planned_start/end are net-new — no
-- existing job date to reuse.

BEGIN;

-- Planned schedule on jobs (nullable; distinct from the project's
-- actual_completion, which is the real event).
ALTER TABLE public.project_jobs
  ADD COLUMN IF NOT EXISTS planned_start_date date,
  ADD COLUMN IF NOT EXISTS planned_end_date date;

ALTER TABLE public.project_jobs
  ADD CONSTRAINT project_jobs_planned_date_order_check
  CHECK (planned_start_date IS NULL OR planned_end_date IS NULL
         OR planned_end_date >= planned_start_date);

-- Named dated markers on a project/job for the timeline.
CREATE TABLE public.schedule_milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id        uuid REFERENCES public.project_jobs(id) ON DELETE CASCADE,
  title         text NOT NULL,
  target_date   date NOT NULL,
  completed_at  date,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','met','missed','cancelled')),
  sort_order    integer NOT NULL DEFAULT 0,
  notes         text,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schedule_milestones_project_idx ON public.schedule_milestones (project_id);
CREATE INDEX schedule_milestones_job_idx ON public.schedule_milestones (job_id);
CREATE INDEX schedule_milestones_date_idx ON public.schedule_milestones (target_date);

CREATE TRIGGER schedule_milestones_set_updated_at
  BEFORE UPDATE ON public.schedule_milestones
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Simple finish-to-start job dependency (the Gantt's ordering hint, NOT a
-- scheduling engine). ACYCLICITY is enforced in the API on create (walk the
-- existing edges, reject an edge that would close a loop) — a finish-to-start
-- chain across a handful of jobs is small, so a recursive DB trigger is
-- overkill for v1. The DB still bars self-edges and duplicates.
CREATE TABLE public.job_dependencies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid NOT NULL REFERENCES public.project_jobs(id) ON DELETE CASCADE,
  depends_on_job_id uuid NOT NULL REFERENCES public.project_jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_dependencies
  ADD CONSTRAINT job_dependencies_no_self_check
  CHECK (job_id <> depends_on_job_id);
CREATE UNIQUE INDEX job_dependencies_unique_edge
  ON public.job_dependencies (job_id, depends_on_job_id);
CREATE INDEX job_dependencies_job_idx ON public.job_dependencies (job_id);

-- §3 clauses on the two new tables (project_jobs already has grants; its new
-- columns inherit).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_milestones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_dependencies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_dependencies TO service_role;

ALTER TABLE public.schedule_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY schedule_milestones_select_authenticated
  ON public.schedule_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY schedule_milestones_all_authenticated
  ON public.schedule_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY job_dependencies_select_authenticated
  ON public.job_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY job_dependencies_all_authenticated
  ON public.job_dependencies FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TABLE IF EXISTS public.job_dependencies;
--   DROP TABLE IF EXISTS public.schedule_milestones;
--   ALTER TABLE public.project_jobs
--     DROP CONSTRAINT IF EXISTS project_jobs_planned_date_order_check,
--     DROP COLUMN IF EXISTS planned_end_date,
--     DROP COLUMN IF EXISTS planned_start_date;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
