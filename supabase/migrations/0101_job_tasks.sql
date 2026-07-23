-- 0101_job_tasks.sql
-- PROJ2-11 — tasks per Job (and per Project). Replaces the disabled "Tasks" tab
-- on the Job detail page with a real task system: status, priority, due dates,
-- an optional assignee, and kanban ordering.
--
-- ASSIGNEE MODEL: mirrors SUB-6's job_assignments party model (a tech OR a
-- subcontractor) rather than inventing a second convention — but with a
-- deliberate difference: SUB-6 requires EXACTLY one assignee
-- (num_nonnulls = 1, an assignment without an assignee is meaningless), while a
-- TASK may be UNASSIGNED (num_nonnulls <= 1). "Someone must do this, we haven't
-- decided who" is a normal, valid task state.
--
-- CLIENT-PORTAL HOOK: `source` distinguishes an internally-created task from
-- one that originated as a client service request. Nothing writes
-- 'client_request' yet — the column exists now so the portal chunk needs no
-- migration, and an externally-originated task is representable without a
-- rewrite.
--
-- completed_at is STORED, not derived (contrast SUB-2's compliance validity,
-- which is derived precisely because it changes with the passage of time).
-- "When was this finished" is a recorded fact about a past event; it can't be
-- recomputed from status alone. Set when status → 'done', cleared when moved
-- back out of 'done' (see lib/api/job-tasks.ts).
--
-- §2.1 additive; §3: GRANTs + RLS + policies (project_jobs pattern).

BEGIN;

CREATE TABLE public.job_tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES public.projects(id)
                        ON DELETE CASCADE,
  job_id           uuid REFERENCES public.project_jobs(id)
                        ON DELETE CASCADE,       -- NULL = project-level task
  title            text NOT NULL,
  description      text,
  status           text NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo','in_progress','blocked',
                                     'done','cancelled')),
  priority         text NOT NULL DEFAULT 'normal'
                   CHECK (priority IN ('low','normal','high','urgent')),
  -- Assignee: a tech OR a subcontractor OR nobody. SET NULL (not RESTRICT) —
  -- removing a person shouldn't destroy the task, just orphan its assignment.
  assignee_tech_id uuid REFERENCES public.techs(id) ON DELETE SET NULL,
  assignee_subcontractor_id uuid REFERENCES public.subcontractors(id)
                        ON DELETE SET NULL,
  due_date         date,
  completed_at     timestamptz,
  sort_order       integer NOT NULL DEFAULT 0,   -- ordering within a status column
  source           text NOT NULL DEFAULT 'internal'
                   CHECK (source IN ('internal','client_request')),
  created_by       uuid,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- AT MOST one assignee kind (0 or 1) — unlike SUB-6's exactly-one. An
-- unassigned task is valid.
ALTER TABLE public.job_tasks
  ADD CONSTRAINT job_tasks_assignee_check
  CHECK (num_nonnulls(assignee_tech_id, assignee_subcontractor_id) <= 1);

-- A job-scoped task's job must belong to its project. This is a CROSS-TABLE
-- invariant, so it can't be a CHECK — it is enforced in the API
-- (createTask → 'job_mismatch'), the same way SUB-6 enforces it.

CREATE INDEX job_tasks_project_idx ON public.job_tasks (project_id);
CREATE INDEX job_tasks_job_idx ON public.job_tasks (job_id);
CREATE INDEX job_tasks_status_idx ON public.job_tasks (status);
CREATE INDEX job_tasks_due_date_idx ON public.job_tasks (due_date);
CREATE INDEX job_tasks_assignee_tech_idx ON public.job_tasks (assignee_tech_id);
CREATE INDEX job_tasks_assignee_sub_idx
  ON public.job_tasks (assignee_subcontractor_id);

CREATE TRIGGER job_tasks_set_updated_at
  BEFORE UPDATE ON public.job_tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- §3: NEW table → GRANTs + RLS + policies (project_jobs pattern).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_tasks TO service_role;

ALTER TABLE public.job_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_tasks_select_authenticated
  ON public.job_tasks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY job_tasks_all_authenticated
  ON public.job_tasks FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TABLE IF EXISTS public.job_tasks;
--   COMMIT;
-- Self-contained. Referenced projects / jobs / techs / subcontractors survive.
-- ─────────────────────────────────────────────────────────────────────────────
