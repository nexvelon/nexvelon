-- AUD-2B — widen the activity_log entity_type CHECK so the last uncovered
-- entities can write their own audit rows (§1 — only widen, never narrow).
--
-- Adds six child/entity values that AUD-1 and AUD-2 deferred because logging
-- their create/update/delete required a distinct entity_type:
--   job                       — a project's job, so a Job gets its own timeline
--   job_task                  — a task on a job/project
--   deficiency                — a punch-list deficiency on a job
--   commissioning_item        — a line on a commissioning run
--   subcontractor             — a subcontractor record
--   subcontractor_compliance  — a compliance document on a subcontractor
--
-- 'stock_movement' is NOT added here — it was already in the constraint since
-- 0118; AUD-2B only starts *writing* those rows.
--
-- The allowed list is kept in lockstep with ACTIVITY_ENTITY_TYPES
-- (lib/types/database.ts); the AUDIT-FIX-1 vitest drift test asserts they match,
-- so this migration and that constant MUST land together. No data change, no
-- backfill — rows land from apply-time forward.

BEGIN;

-- §1 — reproduce the FULL existing set (0118) and APPEND the six new values.
-- Dropping any existing value would be a narrowing regression.
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN (
    'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
    'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
    'ui_theme', 'inventory', 'attachment',
    -- AUD-2B additions:
    'job', 'job_task', 'deficiency', 'commissioning_item',
    'subcontractor', 'subcontractor_compliance'
  ));

COMMENT ON CONSTRAINT activity_log_entity_type_check ON public.activity_log IS
  'AUDIT-FIX-1 / AUD-2B — kept in sync with ACTIVITY_ENTITY_TYPES (lib/types/database.ts); a vitest test guards drift. Only widen, never narrow (§1).';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse). Reverting the CHECK to the pre-0120 set
-- will FAIL if any of the six new entity_type values have been written since;
-- delete those rows first if you truly need to revert.
--   BEGIN;
--   ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
--   ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
--     CHECK (entity_type IN (
--       'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
--       'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
--       'ui_theme', 'inventory', 'attachment'
--     ));
--   COMMIT;
