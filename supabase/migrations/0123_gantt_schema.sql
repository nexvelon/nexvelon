-- 0123_gantt_schema.sql
-- UIDG-11 (PR #383) — the schema that backs a REAL Gantt. The audit (§7) established
-- the current schema cannot: job_dependencies is finish-to-start / job-to-job with
-- no type or lag; job_tasks have a single due_date (no start/end, no %-complete, no
-- parent_id); there is no task-level dependency table; and there are no baselines.
-- Jay's decision: bars are TASKS with jobs as collapsible parent rows, and it lands
-- in ONE migration (doing it twice would mean a second migration touching the same
-- tables — the cost §1 exists to avoid). This chunk ships the schema + the typed
-- read/write layer; the Gantt UI (UIDG-12), critical path (UIDG-13) and resource
-- lane (UIDG-14) build on it.
--
-- §1 additive throughout: every new column is nullable or defaulted, so existing
-- rows stay valid with NO backfill. No existing CHECK is narrowed. Every new table
-- carries the §3 boilerplate (GRANT authenticated+service_role, RLS, policies).
--
-- Decisions (see PR body): task start/end are new; due_date is KEPT and now means
-- the deadline (distinct from the scheduled span). Dependencies are a SEPARATE
-- task_dependencies table (job_dependencies stays the coarse job-ordering hook the
-- existing schedule.ts reads); BOTH levels gain dependency_type + lag_days. Lag is
-- in DAYS (bars are date-typed). Baselines are a SEPARATE immutable snapshot
-- (schedule_baselines + schedule_baseline_tasks) so re-baselining is possible (§2.2).
-- Task nesting is arbitrary via parent_id; depth-1 self-parent is a DB CHECK, deeper
-- cycles are rejected in the data layer.

BEGIN;

-- ── 1. job_tasks: Gantt bar dates, %-complete, nesting ───────────────────────
ALTER TABLE public.job_tasks
  ADD COLUMN IF NOT EXISTS start_date       date,
  ADD COLUMN IF NOT EXISTS end_date         date,
  ADD COLUMN IF NOT EXISTS percent_complete smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_id        uuid REFERENCES public.job_tasks(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.job_tasks.start_date IS
  'UIDG-11 — scheduled Gantt bar start (nullable). Distinct from due_date (the deadline).';
COMMENT ON COLUMN public.job_tasks.end_date IS
  'UIDG-11 — scheduled Gantt bar end (nullable). The read layer falls back to due_date when null.';
COMMENT ON COLUMN public.job_tasks.percent_complete IS
  'UIDG-11 — manual %-complete for a leaf task (0–100); parents derive it from children in the read layer.';
COMMENT ON COLUMN public.job_tasks.parent_id IS
  'UIDG-11 — parent task for arbitrary nesting under a job. Depth-1 self-parent barred by CHECK; deeper cycles in the app layer.';

ALTER TABLE public.job_tasks
  ADD CONSTRAINT job_tasks_date_order_check
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT job_tasks_percent_range_check
    CHECK (percent_complete BETWEEN 0 AND 100),
  ADD CONSTRAINT job_tasks_no_self_parent_check
    CHECK (parent_id IS NULL OR parent_id <> id);

-- Indexes for the UIDG-12 reads: tasks by project ordered by date, tasks by parent.
CREATE INDEX IF NOT EXISTS job_tasks_project_dates_idx ON public.job_tasks (project_id, start_date);
CREATE INDEX IF NOT EXISTS job_tasks_parent_idx ON public.job_tasks (parent_id);

-- ── 2. project_jobs: actual dates (for job-bar baseline variance) ─────────────
ALTER TABLE public.project_jobs
  ADD COLUMN IF NOT EXISTS actual_start_date date,
  ADD COLUMN IF NOT EXISTS actual_end_date   date;

ALTER TABLE public.project_jobs
  ADD CONSTRAINT project_jobs_actual_date_order_check
    CHECK (actual_start_date IS NULL OR actual_end_date IS NULL OR actual_end_date >= actual_start_date);

-- ── 3. job_dependencies: gain type + lag (existing rows → FS / 0) ─────────────
ALTER TABLE public.job_dependencies
  ADD COLUMN IF NOT EXISTS dependency_type text NOT NULL DEFAULT 'FS',
  ADD COLUMN IF NOT EXISTS lag_days        integer NOT NULL DEFAULT 0;

ALTER TABLE public.job_dependencies
  ADD CONSTRAINT job_dependencies_type_check
    CHECK (dependency_type IN ('FS','SS','FF','SF'));

CREATE INDEX IF NOT EXISTS job_dependencies_depends_on_idx
  ON public.job_dependencies (depends_on_job_id);

-- ── 4. task_dependencies (new) — typed, lagged, task→task ─────────────────────
-- project_id is denormalised so a whole project's task edges load in ONE query
-- (no big IN-list). Acyclicity beyond a self-edge is enforced in the data layer.
CREATE TABLE public.task_dependencies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id            uuid NOT NULL REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  dependency_type    text NOT NULL DEFAULT 'FS' CHECK (dependency_type IN ('FS','SS','FF','SF')),
  lag_days           integer NOT NULL DEFAULT 0,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.task_dependencies
  ADD CONSTRAINT task_dependencies_no_self_check CHECK (task_id <> depends_on_task_id);
CREATE UNIQUE INDEX task_dependencies_unique_edge
  ON public.task_dependencies (task_id, depends_on_task_id);
CREATE INDEX task_dependencies_project_idx    ON public.task_dependencies (project_id);
CREATE INDEX task_dependencies_task_idx       ON public.task_dependencies (task_id);
CREATE INDEX task_dependencies_depends_on_idx ON public.task_dependencies (depends_on_task_id);

-- ── 5. baselines (new) — an immutable snapshot of the plan at a point in time ──
CREATE TABLE public.schedule_baselines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  notes       text,
  captured_by uuid,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schedule_baselines_project_idx ON public.schedule_baselines (project_id);

CREATE TABLE public.schedule_baseline_tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id      uuid NOT NULL REFERENCES public.schedule_baselines(id) ON DELETE CASCADE,
  task_id          uuid NOT NULL REFERENCES public.job_tasks(id) ON DELETE CASCADE,
  start_date       date,
  end_date         date,
  percent_complete smallint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX schedule_baseline_tasks_unique
  ON public.schedule_baseline_tasks (baseline_id, task_id);
CREATE INDEX schedule_baseline_tasks_baseline_idx
  ON public.schedule_baseline_tasks (baseline_id);

-- §2.2 — a captured baseline task is a FROZEN snapshot: block UPDATE at the DB
-- (the row can be captured and later discarded, but never edited). Grants below
-- still include UPDATE per the §3 boilerplate; this trigger is the enforcement.
CREATE OR REPLACE FUNCTION public.forbid_baseline_task_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'schedule_baseline_tasks rows are immutable (a captured baseline snapshot cannot be edited)';
END;
$$;
CREATE TRIGGER schedule_baseline_tasks_immutable
  BEFORE UPDATE ON public.schedule_baseline_tasks
  FOR EACH ROW EXECUTE FUNCTION public.forbid_baseline_task_update();

-- ── §3 boilerplate for the three NEW tables (job_tasks / project_jobs /
--    job_dependencies already have grants + RLS; their new columns inherit) ────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_dependencies      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_dependencies      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_baselines     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_baselines     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_baseline_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_baseline_tasks TO service_role;

ALTER TABLE public.task_dependencies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_baselines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_baseline_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_dependencies_select_authenticated
  ON public.task_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY task_dependencies_all_authenticated
  ON public.task_dependencies FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY schedule_baselines_select_authenticated
  ON public.schedule_baselines FOR SELECT TO authenticated USING (true);
CREATE POLICY schedule_baselines_all_authenticated
  ON public.schedule_baselines FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY schedule_baseline_tasks_select_authenticated
  ON public.schedule_baseline_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY schedule_baseline_tasks_all_authenticated
  ON public.schedule_baseline_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP TABLE IF EXISTS public.schedule_baseline_tasks;
--   DROP TABLE IF EXISTS public.schedule_baselines;
--   DROP FUNCTION IF EXISTS public.forbid_baseline_task_update();
--   DROP TABLE IF EXISTS public.task_dependencies;
--   ALTER TABLE public.job_dependencies
--     DROP CONSTRAINT IF EXISTS job_dependencies_type_check,
--     DROP COLUMN IF EXISTS lag_days,
--     DROP COLUMN IF EXISTS dependency_type;
--   DROP INDEX IF EXISTS public.job_dependencies_depends_on_idx;
--   ALTER TABLE public.project_jobs
--     DROP CONSTRAINT IF EXISTS project_jobs_actual_date_order_check,
--     DROP COLUMN IF EXISTS actual_end_date,
--     DROP COLUMN IF EXISTS actual_start_date;
--   ALTER TABLE public.job_tasks
--     DROP CONSTRAINT IF EXISTS job_tasks_no_self_parent_check,
--     DROP CONSTRAINT IF EXISTS job_tasks_percent_range_check,
--     DROP CONSTRAINT IF EXISTS job_tasks_date_order_check,
--     DROP COLUMN IF EXISTS parent_id,
--     DROP COLUMN IF EXISTS percent_complete,
--     DROP COLUMN IF EXISTS end_date,
--     DROP COLUMN IF EXISTS start_date;
--   DROP INDEX IF EXISTS public.job_tasks_parent_idx;
--   DROP INDEX IF EXISTS public.job_tasks_project_dates_idx;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
