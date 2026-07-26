-- ============================================================================
-- Nexvelon · 0116 · Permissions (DES-1) — Warehouse baseline + role-edit audit
-- ============================================================================
-- Two additive changes:
--
--   1. Seed the Warehouse role's baseline into role_permission_matrix.
--      Warehouse is promoted from a DbRole ALIAS (was server→Technician /
--      client→ViewOnly) to a first-class matrix role: view-everything (like
--      ViewOnly) + manage inventory (create/edit + viewCost). 12 granted rows,
--      generated from ROLE_PERMISSIONS' new Warehouse entry (lib/permissions.ts)
--      via the same generator as 0114 — NOT hand-authored.
--
--   2. Widen permission_audit.change_type to record ROLE-BASELINE edits
--      (role_baseline_grant / role_baseline_revoke), alongside the existing
--      per-user grant/deny/revoke and role_change. Widening a CHECK is additive
--      (§2.1) — never narrowed.
--
-- WRITE POSTURE (unchanged): role_permission_matrix stays SELECT-only for
-- authenticated (0114). Role-baseline edits are written by the Admin-gated
-- setRoleBaselineAction via the SERVICE-ROLE client — authenticated is NOT
-- granted write on the matrix. No RLS/grant change here.
--
-- Production safety: single BEGIN..COMMIT (atomic); additive only; idempotent
-- seed (ON CONFLICT DO NOTHING). Rollback: delete the Warehouse rows + restore
-- the narrower CHECK (see foot).
-- ============================================================================

BEGIN;

-- 1. Warehouse baseline (generated from ROLE_PERMISSIONS.Warehouse).
INSERT INTO public.role_permission_matrix (role, resource, action, granted) VALUES
('Warehouse', 'dashboard', 'view'),
  ('Warehouse', 'quotes', 'view'),
  ('Warehouse', 'projects', 'view'),
  ('Warehouse', 'clients', 'view'),
  ('Warehouse', 'inventory', 'view'),
  ('Warehouse', 'subcontractors', 'view'),
  ('Warehouse', 'scheduling', 'view'),
  ('Warehouse', 'financials', 'view'),
  ('Warehouse', 'reports', 'view'),
  ('Warehouse', 'inventory', 'create'),
  ('Warehouse', 'inventory', 'edit'),
  ('Warehouse', 'inventory', 'viewCost')
ON CONFLICT (role, resource, action) DO NOTHING;

-- 2. Widen permission_audit.change_type for role-baseline edits (additive).
ALTER TABLE public.permission_audit DROP CONSTRAINT IF EXISTS permission_audit_change_type_check;
ALTER TABLE public.permission_audit ADD CONSTRAINT permission_audit_change_type_check
  CHECK (change_type IN (
    'grant', 'deny', 'revoke', 'role_change',
    'role_baseline_grant', 'role_baseline_revoke'
  ));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback:
--   BEGIN;
--   DELETE FROM public.role_permission_matrix WHERE role = 'Warehouse';
--   ALTER TABLE public.permission_audit DROP CONSTRAINT IF EXISTS permission_audit_change_type_check;
--   ALTER TABLE public.permission_audit ADD CONSTRAINT permission_audit_change_type_check
--     CHECK (change_type IN ('grant','deny','revoke','role_change'));
--   COMMIT;
-- ============================================================================
