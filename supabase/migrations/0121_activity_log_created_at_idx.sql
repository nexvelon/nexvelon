-- AUD-3 — index the central Activity feed's default read path (§1 — additive,
-- index-only, no schema change).
--
-- The feed's baseline query is "everything in a date window, newest first"
-- (WHERE created_at BETWEEN … ORDER BY created_at DESC LIMIT n), with optional
-- actor / entity_type / action / free-text filters layered on. The existing
-- indexes cover the FILTERED paths — activity_log_actor_idx (actor_id,
-- created_at DESC) serves the per-user view, activity_log_entity_idx and
-- activity_log_parent_idx serve the per-record tabs — but there is no index for
-- the UNfiltered, time-ordered feed. Without one, the default page is a full
-- scan + sort of a table that grows forever and every module writes to.
--
-- One descending index on created_at serves the default and every date-range
-- query. Free-text (ILIKE on entity_label / parent_label) is deliberately NOT
-- indexed: it always runs inside the already-bounded date window, so a trigram
-- GIN index (an extension + ongoing write cost on a high-write table) is not
-- justified.

CREATE INDEX IF NOT EXISTS activity_log_created_at_idx
  ON public.activity_log (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse):
--   DROP INDEX IF EXISTS public.activity_log_created_at_idx;
