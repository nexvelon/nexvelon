-- 0124_balance_snapshots.sql
-- SNAP-1 (PR #388) — daily point-in-time BALANCE SNAPSHOTS. The dashboard shows
-- AR/AP/WIP/deposits as live point-in-time figures with nothing to compare against
-- ("AR: $184,000" but is that better or worse than last month?). This table records
-- each balance once per day so those KPIs gain deltas + trend lines.
--
-- §2.2 SNAPSHOT PRINCIPLE — a captured balance is immutable history: a BEFORE UPDATE
-- trigger blocks edits (mirrors 0123's schedule_baseline_tasks freeze). §1 — no
-- narrow CHECK on metric_key or opco: the metric list WILL grow, and the opco
-- dimension is provisioned now (impossible to add to history retroactively) even
-- though this chunk populates only the aggregate 'all' rows. Row-per-metric-per-
-- opco-per-day (long format) so a new metric is a plain INSERT, never a migration.
--
-- captured_date is the America/Toronto calendar day (the app's businessDateISO),
-- so "daily" has a stable boundary and DST never doubles/skips a day. UNIQUE
-- (metric_key, opco, captured_date) → exactly one row per metric per opco per day;
-- capture uses ON CONFLICT DO NOTHING so a re-run is an idempotent no-op.

BEGIN;

CREATE TABLE public.balance_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_date date NOT NULL,                 -- America/Toronto calendar day
  metric_key    text NOT NULL,                 -- e.g. 'ar_outstanding' (no CHECK — grows, §1)
  opco          text NOT NULL DEFAULT 'all',   -- 'all' = the aggregate the dashboard shows
  amount        numeric(16, 2) NOT NULL,       -- currency for $ metrics; whole numbers for counts
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One snapshot per (metric, opco, day) — the idempotency + no-double-capture guard.
CREATE UNIQUE INDEX balance_snapshots_unique
  ON public.balance_snapshots (metric_key, opco, captured_date);
-- The dashboard's read: a metric over a date range.
CREATE INDEX balance_snapshots_metric_date_idx
  ON public.balance_snapshots (metric_key, captured_date);

COMMENT ON TABLE public.balance_snapshots IS
  'SNAP-1 — immutable daily point-in-time balance history (AR/AP/WIP/deposits + counts). One row per metric per opco per America/Toronto day. §2.2 immutable (freeze trigger); §1 no CHECK on metric_key/opco (both grow). The canonical home for point-in-time history — future metrics use this table, not a new one.';

-- §2.2 — a captured snapshot is frozen: block UPDATE at the DB (a row can be
-- inserted and, if ever necessary, deleted, but never edited). Grants below still
-- include UPDATE per the §3 boilerplate; this trigger is the enforcement.
CREATE OR REPLACE FUNCTION public.forbid_balance_snapshot_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'balance_snapshots rows are immutable (a captured daily balance cannot be edited)';
END;
$$;
CREATE TRIGGER balance_snapshots_immutable
  BEFORE UPDATE ON public.balance_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.forbid_balance_snapshot_update();

-- §3 boilerplate.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balance_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balance_snapshots TO service_role;

ALTER TABLE public.balance_snapshots ENABLE ROW LEVEL SECURITY;

-- Reads are open to authenticated callers; the DASHBOARD gates which metrics a
-- role may read in application code (a user who can't see AR can't see AR history),
-- exactly as the live figures are gated. Capture runs as service_role (no session).
CREATE POLICY balance_snapshots_select_authenticated
  ON public.balance_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY balance_snapshots_all_authenticated
  ON public.balance_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- §5 — the capture writes an activity_log audit row (entity_type 'balance_snapshot').
-- Widen the CHECK per §1: reproduce the FULL existing set (0120) and APPEND the new
-- value. Kept in lockstep with ACTIVITY_ENTITY_TYPES (a vitest drift test guards it).
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN (
    'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
    'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
    'ui_theme', 'inventory', 'attachment',
    'job', 'job_task', 'deficiency', 'commissioning_item',
    'subcontractor', 'subcontractor_compliance',
    -- SNAP-1 addition:
    'balance_snapshot'
  ));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Existence check (run after apply — every object must return a row / true):
--   SELECT to_regclass('public.balance_snapshots') IS NOT NULL AS table_ok;
--   SELECT COUNT(*) = 2 AS indexes_ok FROM pg_indexes
--     WHERE tablename = 'balance_snapshots'
--       AND indexname IN ('balance_snapshots_unique', 'balance_snapshots_metric_date_idx');
--   SELECT tgname FROM pg_trigger WHERE tgname = 'balance_snapshots_immutable';
--   SELECT relrowsecurity AS rls_on FROM pg_class WHERE relname = 'balance_snapshots';
--   SELECT COUNT(*) = 2 AS policies_ok FROM pg_policies WHERE tablename = 'balance_snapshots';
--   SELECT has_table_privilege('authenticated', 'public.balance_snapshots', 'INSERT') AS grant_ok;
--   SELECT 'balance_snapshot' = ANY (
--     string_to_array(
--       regexp_replace(pg_get_constraintdef(oid), '.*IN \(''|''\).*', '', 'g'), ''','''
--     ))  AS entity_type_ok
--     FROM pg_constraint WHERE conname = 'activity_log_entity_type_check';
-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse):
--   BEGIN;
--   DROP TABLE IF EXISTS public.balance_snapshots;
--   DROP FUNCTION IF EXISTS public.forbid_balance_snapshot_update();
--   -- restore the pre-SNAP-1 entity_type CHECK (will FAIL if any 'balance_snapshot'
--   -- rows exist — delete them first if truly reverting):
--   ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
--   ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
--     CHECK (entity_type IN (
--       'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
--       'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
--       'ui_theme', 'inventory', 'attachment',
--       'job', 'job_task', 'deficiency', 'commissioning_item',
--       'subcontractor', 'subcontractor_compliance'
--     ));
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
