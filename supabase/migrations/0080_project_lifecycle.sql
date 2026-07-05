-- 0080_project_lifecycle.sql
-- PROJ2-1 — project status state machine + activity_log 'project' entity type.
-- Existing projects table (0041); no new tables, so §3 GRANTs don't apply.
--
-- NOTE (deviation from the spec, intentional): the real activity_log schema
-- (0016) is (entity_type, entity_id uuid, action CHECK IN ('create','update',
-- 'delete'), changes jsonb, actor_id, created_at). There is NO `payload` column
-- and `action` is a constrained enum. So this migration only WIDENS the
-- entity_type CHECK to allow 'project'; project events are logged via the
-- existing logActivity() helper with action ∈ (create|update). The action CHECK
-- is left untouched.

BEGIN;

-- 2a. Normalize any pre-existing status to the new value set before the CHECK.
UPDATE public.projects
SET status = 'active'
WHERE status IS NULL
   OR status NOT IN ('active','on_hold','substantially_complete','closed','cancelled');

-- 2b. Status state machine as a CHECK (widened from free-text).
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'active',
    'on_hold',
    'substantially_complete',
    'closed',
    'cancelled'
  ));

-- 2c. Widen activity_log.entity_type CHECK to include 'project' (§2.1 — only
-- widening, every existing value reproduced verbatim from 0079).
ALTER TABLE public.activity_log
  DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE public.activity_log
  ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN (
    'client',
    'site',
    'contact',
    'purchase_order',
    'vendor',
    'invoice',
    'inventory_product',
    'stock_movement',
    'pickup_slip',
    'rma',
    'project'
  ));

COMMENT ON CONSTRAINT activity_log_entity_type_check ON public.activity_log IS
  'Widened per Sprint 2 (PROJ2-1) to allow project audit rows.';

COMMIT;

-- ============================================
-- Rollback (per NEXVELON_PRINCIPLES.md §2.1 — documented, not executed).
-- ============================================
-- ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
-- ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
-- ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
--   CHECK (entity_type IN ('client','site','contact','purchase_order','vendor',
--     'invoice','inventory_product','stock_movement','pickup_slip','rma'));
