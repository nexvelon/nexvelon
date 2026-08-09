-- 0118_activity_log_insert_policy.sql
-- AUDIT-FIX-1 (PR: audit-fix-1) — restore activity_log writes.
--
-- WHY THIS EXISTS: UIDG-3 (PR #368) discovered that public.activity_log has a
-- SELECT policy but NO INSERT policy for the `authenticated` role. Its 0016
-- design assumed writes would come via the service-role, but the lib/api/
-- activity-log.ts `logActivity` helper writes with the cookie/authenticated
-- client. With RLS enabled and no authenticated INSERT policy, every one of
-- those ~70 audit writes has been silently RLS-denied since 0016 — the write
-- fails, nothing throws, no row lands. NEXVELON_PRINCIPLES §5 makes auditing a
-- launch gate, so this closes the hole for every module at once.
--
-- Two jobs:
--   A. Add an authenticated INSERT policy (append-only: NO update/delete policy).
--   B. Widen the entity_type CHECK to cover every value application code passes
--      — critically 'inventory' and 'attachment', which callers use today but the
--      current CHECK rejects (they would start failing loudly once RLS is fixed).
--
-- The allowed entity_type list is kept in lockstep with lib/types/database.ts
-- (ACTIVITY_ENTITY_TYPES); a vitest test asserts this CHECK matches that
-- constant so the two cannot drift again.

BEGIN;

-- ── A) Authenticated INSERT policy ───────────────────────────────────────────
-- Append-only: SELECT + INSERT for authenticated (no UPDATE/DELETE grant), full
-- DML for service_role. Matches the sibling audit tables (settings_audit_log
-- 0064, schedule_audit 0113, permission_audit 0115), except the WITH CHECK ties
-- each row to the acting user (actor_id = auth.uid()) rather than the looser
-- `WITH CHECK (true)` — appropriate for the table whose integrity this chunk
-- exists to fix. logActivity always stamps actor_id from the same session, so no
-- legitimate write is rejected; service-role/system writes (e.g. the ui_theme
-- audit) bypass RLS. NO UPDATE or DELETE policy is added — the log stays
-- append-only (§5).
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO service_role;

CREATE POLICY activity_log_insert_authenticated
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- ── B) Widen the entity_type CHECK (§1 — only widen, never narrow) ───────────
-- Every value already allowed, PLUS the two application-code values the current
-- constraint rejects: 'inventory' (used throughout inventory/actions.ts) and
-- 'attachment' (attachments/actions.ts). Keep this list identical to
-- ACTIVITY_ENTITY_TYPES in lib/types/database.ts.
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type IN (
    'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
    'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
    'ui_theme', 'inventory', 'attachment'
  ));

COMMENT ON CONSTRAINT activity_log_entity_type_check ON public.activity_log IS
  'AUDIT-FIX-1 — kept in sync with ACTIVITY_ENTITY_TYPES (lib/types/database.ts); a vitest test guards drift. Only widen, never narrow (§1).';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback (per §1 — the exact reverse). Note: reverting the CHECK to the
-- pre-0118 set will FAIL if any 'inventory'/'attachment' rows have been written
-- since; delete those first if you truly need to revert.
--   BEGIN;
--   DROP POLICY IF EXISTS activity_log_insert_authenticated ON public.activity_log;
--   REVOKE INSERT ON public.activity_log FROM authenticated;
--   ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
--   ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
--     CHECK (entity_type IN (
--       'client', 'site', 'contact', 'purchase_order', 'vendor', 'invoice',
--       'inventory_product', 'stock_movement', 'pickup_slip', 'rma', 'project',
--       'ui_theme'
--     ));
--   COMMIT;
