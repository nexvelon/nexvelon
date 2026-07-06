-- 0086_quote_intended_conversion_target.sql
-- PROJ2-5 Part 2 — a quote records, at creation, what it is INTENDED to convert
-- into: a brand-new Project on its site, or a Change Order on an existing
-- Project on that site. The convert-to-project step honours the choice.
--
-- Stored as two nullable mirror columns (the full Quote also lives in quotes.data
-- jsonb, but these mirrors are indexable + PostgREST-filterable and cheap).
--
-- §2.1: additive nullable columns, no narrowing.
-- §3:   not a new table — no GRANT/RLS changes.
--
-- Backfill: every existing quote stays NULL → the convert path keeps its current
-- "user picks at convert time" behaviour for legacy quotes.

BEGIN;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS intended_target_kind text
    CHECK (intended_target_kind IN ('new_project','change_order'));

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS intended_target_project_id uuid
    REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quotes_intended_target_project_id_idx
  ON public.quotes (intended_target_project_id);

-- Shape consistency:
--   kind IS NULL           → project_id IS NULL (legacy default)
--   kind='new_project'     → project_id IS NULL
--   kind='change_order'    → project_id IS NOT NULL
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_intended_target_shape_check
  CHECK (
    (intended_target_kind IS NULL AND intended_target_project_id IS NULL)
    OR (intended_target_kind = 'new_project' AND intended_target_project_id IS NULL)
    OR (intended_target_kind = 'change_order' AND intended_target_project_id IS NOT NULL)
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════
-- Rollback (per §1 — documented, not executed).
-- ═══════════════════════════════════════════════════════════
-- ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_intended_target_shape_check;
-- DROP INDEX IF EXISTS quotes_intended_target_project_id_idx;
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS intended_target_project_id;
-- ALTER TABLE public.quotes DROP COLUMN IF EXISTS intended_target_kind;
