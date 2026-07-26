-- ============================================================================
-- Nexvelon · 0114 · Permissions runtime (PERM-1) — lean role_permission_matrix
-- ============================================================================
-- Sprint 8 / PERM-1. A LEAN, standalone mirror of the static permission matrix
-- (lib/permissions.ts · ROLE_PERMISSIONS) in the APP'S OWN vocabulary:
--   7 roles × 11 resources × 11 actions.
--
-- SCOPE DECISION (from the Sprint 8 audit): this DELIBERATELY does NOT wire the
-- dormant v0.11 permission schema (migrations 0005/0006 — 21 empty tables keyed
-- on roles(id)/permission_definitions(id) UUIDs, with a role vocabulary that
-- diverges from the live app). Those tables are left untouched. This table
-- stands alone, keyed on the app's own text role/resource/action, so the seed
-- is a byte-faithful copy of ROLE_PERMISSIONS with no UUID joins and no
-- vocabulary translation.
--
-- STORAGE MODEL: GRANTED-ONLY (absent = denied). One row per granted triple —
-- the faithful mirror of hasPermission's `ROLE_PERMISSIONS[role].some(...)`.
-- 194 granted rows of the 847 possible triples.
--
-- BEHAVIOUR: NONE. hasPermission() still reads the static matrix this chunk.
-- This table is a DORMANT parallel copy; PERM-2 swaps the resolver onto it under
-- the same hasPermission signature. The seed rows are generated FROM
-- ROLE_PERMISSIONS (lib/permissions/seed-matrix.ts → scripts/gen-perm-seed.mjs),
-- never hand-authored, so the DB copy cannot drift from the static matrix.
--
-- Production safety: single BEGIN..COMMIT (atomic); additive only; no existing
-- table altered. Rollback: DROP TABLE public.role_permission_matrix.
-- ============================================================================

BEGIN;

CREATE TABLE public.role_permission_matrix (
  role      text NOT NULL,
  resource  text NOT NULL,
  action    text NOT NULL,
  granted   boolean NOT NULL DEFAULT true,
  PRIMARY KEY (role, resource, action)
);

CREATE INDEX role_permission_matrix_role_idx
  ON public.role_permission_matrix (role);

-- §3 — reference data. Read-only from the app (authenticated SELECT only); the
-- admin editing path lands in PERM-4. service_role has full access (the seed is
-- applied via this migration, not the app).
GRANT SELECT ON public.role_permission_matrix TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permission_matrix TO service_role;

ALTER TABLE public.role_permission_matrix ENABLE ROW LEVEL SECURITY;

CREATE POLICY role_permission_matrix_select_authenticated
  ON public.role_permission_matrix FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permission_matrix_all_service_role
  ON public.role_permission_matrix FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── SEED — one row per GRANTED (role, resource, action) triple ──────────────
-- Generated from lib/permissions.ts ROLE_PERMISSIONS via
-- scripts/gen-perm-seed.mjs (see lib/permissions/seed-matrix.ts). 194 rows.
-- DO NOT hand-edit: regenerate if the static matrix changes.
INSERT INTO public.role_permission_matrix (role, resource, action) VALUES
  ('Admin', 'dashboard', 'view'),
  ('Admin', 'dashboard', 'create'),
  ('Admin', 'dashboard', 'edit'),
  ('Admin', 'dashboard', 'delete'),
  ('Admin', 'dashboard', 'approve'),
  ('Admin', 'dashboard', 'convert'),
  ('Admin', 'dashboard', 'viewMargin'),
  ('Admin', 'dashboard', 'viewInternal'),
  ('Admin', 'dashboard', 'viewCost'),
  ('Admin', 'dashboard', 'viewAll'),
  ('Admin', 'dashboard', 'manage'),
  ('Admin', 'quotes', 'view'),
  ('Admin', 'quotes', 'create'),
  ('Admin', 'quotes', 'edit'),
  ('Admin', 'quotes', 'delete'),
  ('Admin', 'quotes', 'approve'),
  ('Admin', 'quotes', 'convert'),
  ('Admin', 'quotes', 'viewMargin'),
  ('Admin', 'quotes', 'viewInternal'),
  ('Admin', 'quotes', 'viewCost'),
  ('Admin', 'quotes', 'viewAll'),
  ('Admin', 'quotes', 'manage'),
  ('Admin', 'projects', 'view'),
  ('Admin', 'projects', 'create'),
  ('Admin', 'projects', 'edit'),
  ('Admin', 'projects', 'delete'),
  ('Admin', 'projects', 'approve'),
  ('Admin', 'projects', 'convert'),
  ('Admin', 'projects', 'viewMargin'),
  ('Admin', 'projects', 'viewInternal'),
  ('Admin', 'projects', 'viewCost'),
  ('Admin', 'projects', 'viewAll'),
  ('Admin', 'projects', 'manage'),
  ('Admin', 'clients', 'view'),
  ('Admin', 'clients', 'create'),
  ('Admin', 'clients', 'edit'),
  ('Admin', 'clients', 'delete'),
  ('Admin', 'clients', 'approve'),
  ('Admin', 'clients', 'convert'),
  ('Admin', 'clients', 'viewMargin'),
  ('Admin', 'clients', 'viewInternal'),
  ('Admin', 'clients', 'viewCost'),
  ('Admin', 'clients', 'viewAll'),
  ('Admin', 'clients', 'manage'),
  ('Admin', 'inventory', 'view'),
  ('Admin', 'inventory', 'create'),
  ('Admin', 'inventory', 'edit'),
  ('Admin', 'inventory', 'delete'),
  ('Admin', 'inventory', 'approve'),
  ('Admin', 'inventory', 'convert'),
  ('Admin', 'inventory', 'viewMargin'),
  ('Admin', 'inventory', 'viewInternal'),
  ('Admin', 'inventory', 'viewCost'),
  ('Admin', 'inventory', 'viewAll'),
  ('Admin', 'inventory', 'manage'),
  ('Admin', 'subcontractors', 'view'),
  ('Admin', 'subcontractors', 'create'),
  ('Admin', 'subcontractors', 'edit'),
  ('Admin', 'subcontractors', 'delete'),
  ('Admin', 'subcontractors', 'approve'),
  ('Admin', 'subcontractors', 'convert'),
  ('Admin', 'subcontractors', 'viewMargin'),
  ('Admin', 'subcontractors', 'viewInternal'),
  ('Admin', 'subcontractors', 'viewCost'),
  ('Admin', 'subcontractors', 'viewAll'),
  ('Admin', 'subcontractors', 'manage'),
  ('Admin', 'scheduling', 'view'),
  ('Admin', 'scheduling', 'create'),
  ('Admin', 'scheduling', 'edit'),
  ('Admin', 'scheduling', 'delete'),
  ('Admin', 'scheduling', 'approve'),
  ('Admin', 'scheduling', 'convert'),
  ('Admin', 'scheduling', 'viewMargin'),
  ('Admin', 'scheduling', 'viewInternal'),
  ('Admin', 'scheduling', 'viewCost'),
  ('Admin', 'scheduling', 'viewAll'),
  ('Admin', 'scheduling', 'manage'),
  ('Admin', 'financials', 'view'),
  ('Admin', 'financials', 'create'),
  ('Admin', 'financials', 'edit'),
  ('Admin', 'financials', 'delete'),
  ('Admin', 'financials', 'approve'),
  ('Admin', 'financials', 'convert'),
  ('Admin', 'financials', 'viewMargin'),
  ('Admin', 'financials', 'viewInternal'),
  ('Admin', 'financials', 'viewCost'),
  ('Admin', 'financials', 'viewAll'),
  ('Admin', 'financials', 'manage'),
  ('Admin', 'reports', 'view'),
  ('Admin', 'reports', 'create'),
  ('Admin', 'reports', 'edit'),
  ('Admin', 'reports', 'delete'),
  ('Admin', 'reports', 'approve'),
  ('Admin', 'reports', 'convert'),
  ('Admin', 'reports', 'viewMargin'),
  ('Admin', 'reports', 'viewInternal'),
  ('Admin', 'reports', 'viewCost'),
  ('Admin', 'reports', 'viewAll'),
  ('Admin', 'reports', 'manage'),
  ('Admin', 'users', 'view'),
  ('Admin', 'users', 'create'),
  ('Admin', 'users', 'edit'),
  ('Admin', 'users', 'delete'),
  ('Admin', 'users', 'approve'),
  ('Admin', 'users', 'convert'),
  ('Admin', 'users', 'viewMargin'),
  ('Admin', 'users', 'viewInternal'),
  ('Admin', 'users', 'viewCost'),
  ('Admin', 'users', 'viewAll'),
  ('Admin', 'users', 'manage'),
  ('Admin', 'settings', 'view'),
  ('Admin', 'settings', 'create'),
  ('Admin', 'settings', 'edit'),
  ('Admin', 'settings', 'delete'),
  ('Admin', 'settings', 'approve'),
  ('Admin', 'settings', 'convert'),
  ('Admin', 'settings', 'viewMargin'),
  ('Admin', 'settings', 'viewInternal'),
  ('Admin', 'settings', 'viewCost'),
  ('Admin', 'settings', 'viewAll'),
  ('Admin', 'settings', 'manage'),
  ('SalesRep', 'dashboard', 'view'),
  ('SalesRep', 'quotes', 'view'),
  ('SalesRep', 'projects', 'view'),
  ('SalesRep', 'clients', 'view'),
  ('SalesRep', 'inventory', 'view'),
  ('SalesRep', 'subcontractors', 'view'),
  ('SalesRep', 'scheduling', 'view'),
  ('SalesRep', 'reports', 'view'),
  ('SalesRep', 'quotes', 'create'),
  ('SalesRep', 'quotes', 'edit'),
  ('SalesRep', 'clients', 'create'),
  ('SalesRep', 'clients', 'edit'),
  ('ProjectManager', 'dashboard', 'view'),
  ('ProjectManager', 'quotes', 'view'),
  ('ProjectManager', 'projects', 'view'),
  ('ProjectManager', 'clients', 'view'),
  ('ProjectManager', 'inventory', 'view'),
  ('ProjectManager', 'subcontractors', 'view'),
  ('ProjectManager', 'scheduling', 'view'),
  ('ProjectManager', 'financials', 'view'),
  ('ProjectManager', 'reports', 'view'),
  ('ProjectManager', 'settings', 'view'),
  ('ProjectManager', 'projects', 'create'),
  ('ProjectManager', 'projects', 'edit'),
  ('ProjectManager', 'scheduling', 'create'),
  ('ProjectManager', 'scheduling', 'edit'),
  ('ProjectManager', 'quotes', 'create'),
  ('ProjectManager', 'quotes', 'edit'),
  ('ProjectManager', 'subcontractors', 'create'),
  ('ProjectManager', 'subcontractors', 'edit'),
  ('ProjectManager', 'quotes', 'approve'),
  ('ProjectManager', 'quotes', 'convert'),
  ('ProjectManager', 'quotes', 'viewMargin'),
  ('ProjectManager', 'quotes', 'viewInternal'),
  ('ProjectManager', 'inventory', 'edit'),
  ('ProjectManager', 'inventory', 'viewCost'),
  ('ProjectManager', 'scheduling', 'viewAll'),
  ('ProjectManager', 'clients', 'edit'),
  ('Technician', 'dashboard', 'view'),
  ('Technician', 'projects', 'view'),
  ('Technician', 'scheduling', 'view'),
  ('Technician', 'inventory', 'view'),
  ('Technician', 'clients', 'view'),
  ('Technician', 'subcontractors', 'view'),
  ('Subcontractor', 'dashboard', 'view'),
  ('Subcontractor', 'scheduling', 'view'),
  ('Subcontractor', 'projects', 'view'),
  ('Accountant', 'dashboard', 'view'),
  ('Accountant', 'quotes', 'view'),
  ('Accountant', 'projects', 'view'),
  ('Accountant', 'clients', 'view'),
  ('Accountant', 'inventory', 'view'),
  ('Accountant', 'subcontractors', 'view'),
  ('Accountant', 'scheduling', 'view'),
  ('Accountant', 'financials', 'view'),
  ('Accountant', 'reports', 'view'),
  ('Accountant', 'settings', 'view'),
  ('Accountant', 'financials', 'create'),
  ('Accountant', 'financials', 'edit'),
  ('Accountant', 'financials', 'approve'),
  ('Accountant', 'quotes', 'viewMargin'),
  ('Accountant', 'quotes', 'viewInternal'),
  ('Accountant', 'inventory', 'viewCost'),
  ('Accountant', 'scheduling', 'viewAll'),
  ('ViewOnly', 'dashboard', 'view'),
  ('ViewOnly', 'quotes', 'view'),
  ('ViewOnly', 'projects', 'view'),
  ('ViewOnly', 'clients', 'view'),
  ('ViewOnly', 'inventory', 'view'),
  ('ViewOnly', 'subcontractors', 'view'),
  ('ViewOnly', 'scheduling', 'view'),
  ('ViewOnly', 'financials', 'view'),
  ('ViewOnly', 'reports', 'view');

COMMIT;

-- END OF 0114_role_permission_matrix.sql
