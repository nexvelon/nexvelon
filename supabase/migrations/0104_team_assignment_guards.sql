-- 0104_team_assignment_guards.sql
-- PROJ2-15 — in-house technician assignment. SUB-6 (migration 0099) already
-- built job_assignments with a real tech_id FK and the
-- num_nonnulls(subcontractor_id, tech_id) = 1 constraint, so the table fully
-- supports tech assignment. Two guards were, however, sub-only or absent:
--
--   1. Duplicate-active guard. SUB-6 added job_assignments_unique_active_sub for
--      the SUBCONTRACTOR side only. The tech side was unguarded — the same tech
--      could be actively assigned to one job twice. This mirrors the sub guard.
--
--   2. Single active lead per job. The role enum has 'lead' but nothing stopped
--      two active leads on one job. A job has one lead; enforce it in the DB.
--
-- §2.1 additive — indexes only, no column/table changes. Partial unique indexes
-- (the same technique as the sub guard) so only ACTIVE rows are constrained: a
-- removed/completed assignment never blocks a new active one, and re-assigning
-- after removal just works.

BEGIN;

-- 1. No duplicate ACTIVE assignment of the same tech to the same job.
CREATE UNIQUE INDEX job_assignments_unique_active_tech
  ON public.job_assignments (job_id, tech_id)
  WHERE status = 'active' AND tech_id IS NOT NULL AND job_id IS NOT NULL;

-- 2. At most ONE active 'lead' per job (across techs AND subs — a job has a
--    single lead regardless of whether they're in-house or a subcontractor).
CREATE UNIQUE INDEX job_assignments_single_active_lead
  ON public.job_assignments (job_id)
  WHERE role = 'lead' AND status = 'active' AND job_id IS NOT NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse, for the next operator):
--   BEGIN;
--   DROP INDEX IF EXISTS public.job_assignments_single_active_lead;
--   DROP INDEX IF EXISTS public.job_assignments_unique_active_tech;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
