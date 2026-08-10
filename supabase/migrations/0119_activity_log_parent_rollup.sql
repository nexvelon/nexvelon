-- 0119_activity_log_parent_rollup.sql
-- AUD-1 — child-entity roll-up + audit survival readability.
--
-- WHY: a document uploaded to a client logs against the ATTACHMENT
-- (entity_type='attachment', entity_id=attachment.id), but the client's Activity
-- tab queries (entity_type='client', entity_id=client.id) — so child events never
-- surfaced on the parent timeline. This adds a parent link so a parent timeline
-- can include its descendants, while each row keeps its OWN entity_type (correct
-- for the AUD-2 central feed, which filters by entity type). No second migration
-- needed later.
--
-- SURVIVAL: activity_log rows already SURVIVE parent deletion — entity_id has NO
-- foreign key (0016), nothing deletes rows, and hard_delete_client (0069) states
-- "Preserved on purpose: activity_log". The real gap was READABILITY: a surviving
-- row stored only a uuid, so after the parent is gone it read as a dangling id.
-- The denormalised entity_label / parent_label columns fix that — a row keeps the
-- display name captured at action time. § data-preservation: additive only; no FK
-- (a FK would reintroduce the cascade risk the audit trail exists to avoid).
--
-- All four columns are nullable text/uuid with NO CHECK / NO FK — parent_type is
-- free text (validated in app code) so it can never need narrowing (§1).

BEGIN;

ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS parent_type   text;
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS parent_id     uuid;
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS entity_label  text;
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS parent_label  text;

COMMENT ON COLUMN public.activity_log.parent_type IS
  'AUD-1 — the parent entity a child event rolls up to (e.g. an attachment on a client → parent_type=client). Free text; no FK so the row survives parent deletion.';
COMMENT ON COLUMN public.activity_log.entity_label IS
  'AUD-1 — the entity''s display name captured at action time, so a surviving row stays readable after the record is deleted.';

-- Parent-timeline read path: "everything that rolls up to THIS parent, newest
-- first". Complements activity_log_entity_idx (the own-entity path).
CREATE INDEX IF NOT EXISTS activity_log_parent_idx
  ON public.activity_log (parent_type, parent_id, created_at DESC);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse). Dropping the columns discards the
-- roll-up links + denormalised labels captured since; only revert if truly
-- undoing this chunk.
--   BEGIN;
--   DROP INDEX IF EXISTS public.activity_log_parent_idx;
--   ALTER TABLE public.activity_log DROP COLUMN IF EXISTS parent_label;
--   ALTER TABLE public.activity_log DROP COLUMN IF EXISTS entity_label;
--   ALTER TABLE public.activity_log DROP COLUMN IF EXISTS parent_id;
--   ALTER TABLE public.activity_log DROP COLUMN IF EXISTS parent_type;
--   COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Existence check — run AFTER applying; expect 4 columns + 1 index (5 rows).
--   SELECT 'column' AS kind, column_name AS name
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='activity_log'
--      AND column_name IN ('parent_type','parent_id','entity_label','parent_label')
--   UNION ALL
--   SELECT 'index', indexname FROM pg_indexes
--    WHERE schemaname='public' AND tablename='activity_log'
--      AND indexname='activity_log_parent_idx'
--   ORDER BY 1, 2;
