-- 0135_rep5_saved_reports.sql
-- REP-5 — reports platform FOUNDATION: saved reports (a reference to one of the
-- existing reports + its saved parameters), schedules, recipients, and the run +
-- delivery history that makes every scheduled email visible.
--
--   1. saved_reports              — name + report_key + params (jsonb; relative date
--                                   specs, never frozen dates) + format + owner.
--   2. report_schedules           — one per saved report: cadence + day + start,
--                                   active / self-paused with a reason.
--   3. report_schedule_recipients — internal USERS only (profiles), never raw emails.
--   4. report_runs                — one row per (schedule, run date) occurrence:
--                                   delivered / partial / failed / skipped + error.
--                                   UNIQUE (schedule_id, run_date) for scheduled
--                                   runs = the double-send guard.
--   5. report_deliveries          — one row per recipient per run: sent / failed /
--                                   skipped + the reason.
--   6. activity_log entity_type += 'saved_report' (§5).
--
-- §1: ADDITIVE ONLY. Five new tables; the activity_log CHECK is a strict widening
--     (the complete 0128 list + one value). saved_reports is soft-deleted
--     (deleted_at) — its run/delivery history is the record of what was emailed.
-- §3: every new table carries the full boilerplate (GRANT authenticated +
--     service_role, RLS, policies; never anon).
-- Apply BEFORE merging the REP-5 PR.

BEGIN;

-- ── 1. saved_reports ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- One of the existing report keys (lib/reports/catalog.ts). No CHECK (§1 — the
  -- catalog grows); the app validates.
  report_key text NOT NULL,
  -- SavedReportParams: { range?: {kind:'relative',preset}|{kind:'fixed',from,to}|{kind:'none'},
  --                      year?: …, limit?: int, opco?: text }. Resolved at RUN time.
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  format text NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf','xlsx','csv')),
  -- The person whose permissions a schedule runs under (with each recipient's).
  -- SET NULL if the profile is ever removed → the schedule pauses itself.
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS saved_reports_owner_idx
  ON public.saved_reports(owner_id) WHERE deleted_at IS NULL;

-- ── 2. report_schedules ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.report_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_report_id uuid NOT NULL UNIQUE REFERENCES public.saved_reports(id) ON DELETE CASCADE,
  -- Fixed enum (a CHECK is safe — cadences don't grow without a design change).
  cadence text NOT NULL CHECK (cadence IN ('daily','weekly','monthly','quarterly')),
  day_of_week int CHECK (day_of_week BETWEEN 0 AND 6),     -- weekly: 0 = Sunday
  day_of_month int CHECK (day_of_month BETWEEN 1 AND 28),  -- monthly / quarterly
  start_date date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  -- Set when a person pauses it, or when the runner pauses it because the owner
  -- can no longer run the report (shown in the app).
  paused_reason text,
  paused_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_schedules_day_shape_chk CHECK (
    (cadence = 'daily' AND day_of_week IS NULL AND day_of_month IS NULL)
    OR (cadence = 'weekly' AND day_of_week IS NOT NULL AND day_of_month IS NULL)
    OR (cadence IN ('monthly','quarterly') AND day_of_month IS NOT NULL AND day_of_week IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS report_schedules_active_idx
  ON public.report_schedules(active);

-- ── 3. report_schedule_recipients ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.report_schedule_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.report_schedules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_schedule_recipients_uniq UNIQUE (schedule_id, user_id)
);
CREATE INDEX IF NOT EXISTS report_schedule_recipients_user_idx
  ON public.report_schedule_recipients(user_id);

-- ── 4. report_runs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_report_id uuid NOT NULL REFERENCES public.saved_reports(id) ON DELETE RESTRICT,
  -- SET NULL: removing a schedule keeps its history.
  schedule_id uuid REFERENCES public.report_schedules(id) ON DELETE SET NULL,
  run_date date NOT NULL,                        -- the occurrence's business date
  trigger text NOT NULL CHECK (trigger IN ('schedule','manual')),
  -- running | delivered | partial | failed | skipped. No CHECK (§1 — may grow).
  status text NOT NULL DEFAULT 'running',
  params_resolved jsonb,                         -- the concrete dates actually used
  row_count int,
  recipients_sent int NOT NULL DEFAULT 0,
  recipients_skipped int NOT NULL DEFAULT 0,
  error text,
  created_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
-- The double-send guard: a scheduled occurrence is claimed exactly once.
CREATE UNIQUE INDEX IF NOT EXISTS report_runs_schedule_occurrence_uniq
  ON public.report_runs(schedule_id, run_date)
  WHERE trigger = 'schedule';
CREATE INDEX IF NOT EXISTS report_runs_saved_report_idx
  ON public.report_runs(saved_report_id, started_at DESC);
CREATE INDEX IF NOT EXISTS report_runs_status_idx
  ON public.report_runs(status, started_at DESC);

-- ── 5. report_deliveries ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.report_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email text,
  -- sent | failed | skipped. No CHECK (§1).
  status text NOT NULL,
  reason text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_deliveries_run_idx
  ON public.report_deliveries(run_id);

-- ── §3 boilerplate — GRANT + RLS + policies (never anon) ──────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_reports TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedule_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedule_recipients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_deliveries TO service_role;

ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedule_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_deliveries ENABLE ROW LEVEL SECURITY;

-- Row access open to authenticated (the project-wide pattern, e.g. 0128); the app
-- decides who may see or manage which saved report (owner or Admin), and the
-- scheduled runner (service_role) decides who may RECEIVE what.
CREATE POLICY saved_reports_select_authenticated
  ON public.saved_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY saved_reports_all_authenticated
  ON public.saved_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY report_schedules_select_authenticated
  ON public.report_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY report_schedules_all_authenticated
  ON public.report_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY report_schedule_recipients_select_authenticated
  ON public.report_schedule_recipients FOR SELECT TO authenticated USING (true);
CREATE POLICY report_schedule_recipients_all_authenticated
  ON public.report_schedule_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY report_runs_select_authenticated
  ON public.report_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY report_runs_all_authenticated
  ON public.report_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY report_deliveries_select_authenticated
  ON public.report_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY report_deliveries_all_authenticated
  ON public.report_deliveries FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── §5 — widen activity_log entity_type for 'saved_report' ────────────────────
-- Reproduces the COMPLETE existing list (0128) + the new value. Keep in lockstep
-- with ACTIVITY_ENTITY_TYPES in lib/types/database.ts (the AUDIT-FIX-1 drift test).
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN (
    'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
    'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
    'ui_theme', 'inventory', 'attachment',
    'job', 'job_task', 'deficiency', 'commissioning_item',
    'subcontractor', 'subcontractor_compliance',
    'balance_snapshot',
    'service_contract',
    -- REP-5 addition:
    'saved_report'
  ));

COMMIT;

-- ── Existence check (run after applying — every line should match its comment) ─
--   -- Tables (expect 5)
--   SELECT table_name FROM information_schema.tables WHERE table_schema='public'
--     AND table_name IN ('saved_reports','report_schedules','report_schedule_recipients',
--                        'report_runs','report_deliveries');
--
--   -- Named constraints (expect 3)
--   SELECT conname FROM pg_constraint WHERE conname IN (
--     'report_schedules_day_shape_chk','report_schedule_recipients_uniq','activity_log_entity_type_check');
--
--   -- CHECK constraints on the new tables (expect 6): saved_reports_format_check,
--   -- report_schedules_cadence_check, report_schedules_day_of_week_check,
--   -- report_schedules_day_of_month_check, report_schedules_day_shape_chk, report_runs_trigger_check
--   SELECT conrelid::regclass, conname FROM pg_constraint WHERE contype='c' AND conrelid IN (
--     'public.saved_reports'::regclass,'public.report_schedules'::regclass,'public.report_runs'::regclass)
--     ORDER BY 1,2;
--
--   -- UNIQUE on report_schedules.saved_report_id (expect 1)
--   SELECT conname FROM pg_constraint WHERE conrelid='public.report_schedules'::regclass AND contype='u';
--
--   -- Foreign keys (expect 8)
--   SELECT conname FROM pg_constraint WHERE contype='f' AND conrelid IN (
--     'public.saved_reports'::regclass,'public.report_schedules'::regclass,
--     'public.report_schedule_recipients'::regclass,'public.report_runs'::regclass,
--     'public.report_deliveries'::regclass);
--   -- = saved_reports_owner_id_fkey, report_schedules_saved_report_id_fkey,
--   --   report_schedule_recipients_schedule_id_fkey, report_schedule_recipients_user_id_fkey,
--   --   report_runs_saved_report_id_fkey, report_runs_schedule_id_fkey,
--   --   report_deliveries_run_id_fkey, report_deliveries_user_id_fkey
--
--   -- Named indexes (expect 7)
--   SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN (
--     'saved_reports_owner_idx','report_schedules_active_idx','report_schedule_recipients_user_idx',
--     'report_runs_schedule_occurrence_uniq','report_runs_saved_report_idx','report_runs_status_idx',
--     'report_deliveries_run_idx');
--
--   -- Grants (expect 20 rows: 5 tables × 2 roles × 4 privileges, no anon in the migration)
--   SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND grantee IN ('authenticated','service_role')
--      AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
--      AND table_name IN ('saved_reports','report_schedules','report_schedule_recipients',
--                         'report_runs','report_deliveries');
--
--   -- RLS on (expect 5 rows, all t)
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('saved_reports','report_schedules',
--     'report_schedule_recipients','report_runs','report_deliveries');
--
--   -- Policies (expect 10)
--   SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND tablename IN (
--     'saved_reports','report_schedules','report_schedule_recipients','report_runs','report_deliveries');
--
--   -- activity_log admits saved_report (expect t)
--   SELECT pg_get_constraintdef(oid) LIKE '%saved_report%' FROM pg_constraint
--    WHERE conname='activity_log_entity_type_check';
--
-- ── Reverse migration (commented — additive change; reverse order) ────────────
--   BEGIN;
--   DROP TABLE IF EXISTS public.report_deliveries;
--   DROP TABLE IF EXISTS public.report_runs;
--   DROP TABLE IF EXISTS public.report_schedule_recipients;
--   DROP TABLE IF EXISTS public.report_schedules;
--   DROP TABLE IF EXISTS public.saved_reports;
--   ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
--   ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
--     CHECK (entity_type IN (
--       'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
--       'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
--       'ui_theme', 'inventory', 'attachment',
--       'job', 'job_task', 'deficiency', 'commissioning_item',
--       'subcontractor', 'subcontractor_compliance', 'balance_snapshot', 'service_contract'
--     ));
--   COMMIT;
-- Reversible only while no 'saved_report' activity rows exist (the re-added CHECK
-- would reject them) — delete those rows first. Dropping the tables discards the
-- record of what was emailed to whom; export it first.
