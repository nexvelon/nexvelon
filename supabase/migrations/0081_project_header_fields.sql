-- 0081_project_header_fields.sql
-- PROJ2-2 — additive header fields on public.projects. All nullable (§2.1 —
-- widening only, no CHECK, no narrowing). Existing table, so no §3 GRANTs/RLS.
--
-- pm_user_id / lead_tech_id are plain uuid with NO FK (matches the
-- created_by/updated_by convention on this table); PROJ2-4 introduces
-- project_assignments and a real user picker.

BEGIN;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS description       text,
  ADD COLUMN IF NOT EXISTS start_date        date,
  ADD COLUMN IF NOT EXISTS target_completion date,
  ADD COLUMN IF NOT EXISTS actual_completion date,
  ADD COLUMN IF NOT EXISTS pm_user_id        uuid,
  ADD COLUMN IF NOT EXISTS lead_tech_id      uuid;

-- Backfill: any project already past the finish line gets an actual completion
-- date derived from its last update (best available proxy). No-op when none
-- exist. actual_completion is a date; updated_at is timestamptz → cast.
UPDATE public.projects
SET actual_completion = (updated_at AT TIME ZONE 'UTC')::date
WHERE status IN ('substantially_complete','closed')
  AND actual_completion IS NULL;

COMMIT;

-- ============================================
-- Rollback (per NEXVELON_PRINCIPLES.md §2.1 — documented, not executed).
-- ============================================
-- ALTER TABLE public.projects
--   DROP COLUMN IF EXISTS description,
--   DROP COLUMN IF EXISTS start_date,
--   DROP COLUMN IF EXISTS target_completion,
--   DROP COLUMN IF EXISTS actual_completion,
--   DROP COLUMN IF EXISTS pm_user_id,
--   DROP COLUMN IF EXISTS lead_tech_id;
