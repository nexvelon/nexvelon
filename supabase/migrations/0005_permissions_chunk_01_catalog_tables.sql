-- ============================================================================
-- Nexvelon · 0005 · Permissions Chunk 1 — Catalog & Definitional Tables
-- ============================================================================
-- Build phase Chunk 1 of the Permissions module, executing the FIRST step of
-- Phase 1 (Foundation) from NEXVELON_PERMISSIONS_DESIGN.md v0.11 §12.1.
--
-- Lands 11 tables in a single atomic transaction:
--
--   Catalog tables (populated in Chunks 5/7):
--     1. permission_definitions            (Pass 2 §11.1)
--     2. field_visibility_definitions      (Pass 2 §12.1, refined by Pass 4)
--     3. data_scope_definitions            (Pass 2 §13.1)
--     4. separation_of_duties_constraints  (Pass 2 §15.1)
--     5. geolocation_retention_policies    (Pass 2 §15.3)
--     6. feature_flags                     (Pass 11 §13)
--
--   Assignment-shell tables (populated in Chunks 6/7):
--     7. role_permissions                  (Pass 2 §11.3)
--     8. role_field_visibility             (Pass 2 §12.2)
--     9. role_data_scopes                  (Pass 2 §13.2)
--    10. status_behavior_bindings          (Pass 5 §13.1)
--    11. status_transition_definitions     (Pass 5 §13.2)
--
-- ----------------------------------------------------------------------------
-- Translation decisions (surfaced in PR description)
-- ----------------------------------------------------------------------------
--
-- DECISION 1 — `users(id)` → `auth.users(id)`
--   The design doc references `users(id)` as if a `public.users` table
--   exists. This repo uses `auth.users` (Supabase Auth) plus
--   `public.profiles` (one row per auth user with a TEXT-enum role column).
--   All `REFERENCES users(id)` in the design are translated to
--   `REFERENCES auth.users(id)` to match the established convention in
--   migrations 0001-0004. Name-translation only, not an invention.
--
-- DECISION 2 — `roles(id)` FK DEFERRED
--   Pass 2 §11.2 defines a `roles` table that is NOT in this chunk's
--   11-table scope. Three junction tables here carry
--   `role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE` per
--   the design. The Chunk 1 spec is explicit: "Do not add FKs to tables
--   that don't exist yet." Each `role_id` column ships as UUID NOT NULL
--   with NO FK CONSTRAINT in this migration. A later chunk (when `roles`
--   ships) must run:
--       ALTER TABLE role_permissions
--         ADD CONSTRAINT role_permissions_role_id_fkey
--         FOREIGN KEY (role_id) REFERENCES public.roles(id)
--         ON DELETE CASCADE;
--   (and analogous for role_field_visibility, role_data_scopes). Marked
--   with `-- TODO Chunk N: ...` comments below.
--
-- DECISION 3 — NO triggers in this chunk
--   Pass 2 §11.5 specifies cache-invalidation triggers; Pass 6 specifies
--   append-only triggers on ledger tables. All deferred per the spec
--   ("Cache invalidation triggers and append-only protection triggers
--   come in Chunks 3 and 4").
--
-- DECISION 4 — NO seed data in this chunk
--   `feature_flags` ships here but remains empty. The 10 flag rows seed
--   in Chunk 5 per the spec.
--
-- ----------------------------------------------------------------------------
-- Production safety
-- ----------------------------------------------------------------------------
--   · Single BEGIN .. COMMIT — atomic; any failure rolls back the whole
--     chunk.
--   · Additive only — no existing table altered, dropped, renamed,
--     retyped, or had columns removed.
--   · `public.profiles.role` (the existing role enum) is untouched.
--     `auth.users` is untouched.
--   · No data manipulation. Pure DDL.
--
-- Rollback (post-deploy, if needed):
--   DROP TABLE in reverse FK-order (status_transition_definitions,
--   status_behavior_bindings, role_data_scopes, role_field_visibility,
--   role_permissions, feature_flags, geolocation_retention_policies,
--   separation_of_duties_constraints, data_scope_definitions,
--   field_visibility_definitions, permission_definitions).
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. permission_definitions  (Pass 2 §11.1)
-- ============================================================================
-- Master action catalog — one row per action. ~1260 rows will be seeded
-- in Chunk 5 from the Pass 1 catalogue.
CREATE TABLE public.permission_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  action_name TEXT NOT NULL UNIQUE,              -- e.g. 'invoices:send'
  resource    TEXT NOT NULL,                     -- e.g. 'invoices'
  verb        TEXT NOT NULL,                     -- e.g. 'send'
  qualifier   TEXT,                              -- e.g. 'my' (NULL if none)

  -- Categorization (Pass 1 §2)
  verb_category TEXT NOT NULL CHECK (verb_category IN (
    'view', 'create', 'edit', 'state_transition',
    'configuration', 'communication', 'admin', 'workflow'
  )),
  qualifier_category TEXT CHECK (qualifier_category IN (
    'scope', 'state', 'modal', 'field_section'
  )),

  -- Module + UI grouping (Pass 1 §5)
  module_code TEXT NOT NULL,                     -- e.g. 'M9'
  ui_category TEXT NOT NULL CHECK (ui_category IN (
    'view', 'create', 'edit', 'state_transition',
    'communication', 'reporting', 'admin_override', 'configuration'
  )),

  -- Description + metadata
  description TEXT NOT NULL,
  notes       TEXT,

  -- Flags
  is_sensitive             BOOLEAN NOT NULL DEFAULT FALSE,
  is_high_impact           BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin_exception       BOOLEAN NOT NULL DEFAULT FALSE,
  is_system_generated      BOOLEAN NOT NULL DEFAULT FALSE,
  is_public_action         BOOLEAN NOT NULL DEFAULT FALSE,
  requires_reason_capture  BOOLEAN NOT NULL DEFAULT FALSE,
  is_append_only_target    BOOLEAN NOT NULL DEFAULT FALSE,
  is_deprecated            BOOLEAN NOT NULL DEFAULT FALSE,

  -- Default UI rendering state (§0.4 #2)
  default_ui_state TEXT NOT NULL DEFAULT 'interactive' CHECK (default_ui_state IN (
    'hidden', 'disabled', 'interactive'
  )),

  -- Lifecycle
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at           TIMESTAMPTZ,
  deprecation_reason      TEXT,
  replaced_by_action_name TEXT,                  -- TEXT, not FK (self-ref by name)

  CONSTRAINT permission_definitions_action_unique UNIQUE (action_name)
);

CREATE INDEX idx_permission_definitions_resource      ON public.permission_definitions(resource);
CREATE INDEX idx_permission_definitions_module        ON public.permission_definitions(module_code);
CREATE INDEX idx_permission_definitions_verb_category ON public.permission_definitions(verb_category);

-- ============================================================================
-- 2. field_visibility_definitions  (Pass 2 §12.1; refined by Pass 4 catalogue)
-- ============================================================================
-- The 47-flag field visibility catalog. Seeded in Chunk 5.
CREATE TABLE public.field_visibility_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  flag_name     TEXT NOT NULL UNIQUE,            -- e.g. 'visibility.clients.banking'
  resource      TEXT NOT NULL,                   -- e.g. 'clients'
  field_section TEXT NOT NULL,                   -- e.g. 'banking'

  -- Categorization
  module_code TEXT NOT NULL,
  sensitivity_level TEXT NOT NULL CHECK (sensitivity_level IN (
    'standard',
    'sensitive',
    'restricted',
    'pii'
  )),

  -- Metadata
  description             TEXT NOT NULL,
  is_never_granted        BOOLEAN NOT NULL DEFAULT FALSE,  -- e.g. PCI full card number
  requires_audit_on_read  BOOLEAN NOT NULL DEFAULT FALSE,  -- e.g. banking
  retention_days          INTEGER,                         -- e.g. geolocation 30d (§0.4 #13)

  -- Lifecycle
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deprecated  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_field_visibility_definitions_resource ON public.field_visibility_definitions(resource);
CREATE INDEX idx_field_visibility_definitions_module   ON public.field_visibility_definitions(module_code);

-- ============================================================================
-- 3. data_scope_definitions  (Pass 2 §13.1)
-- ============================================================================
-- The 7 scope qualifiers (my/team/assigned/project/tier/category/all).
-- Seeded in Chunk 5.
CREATE TABLE public.data_scope_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  scope_code   TEXT NOT NULL UNIQUE,             -- 'my', 'team', 'assigned', etc.
  display_name TEXT NOT NULL,
  description  TEXT,

  -- The actual filter logic (SQL fragment appended to WHERE clauses by A2)
  filter_sql_template TEXT NOT NULL,

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================================
-- 4. separation_of_duties_constraints  (Pass 2 §15.1)
-- ============================================================================
-- The 4 SoD constraints (§0.4 #11). Seeded in Chunk 5.
CREATE TABLE public.separation_of_duties_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Constraint definition
  constraint_name TEXT NOT NULL UNIQUE,          -- e.g. 'ap_bill_creator_not_approver'
  description     TEXT NOT NULL,

  -- The two actions (both FKs are within this chunk)
  action_a_id UUID NOT NULL REFERENCES public.permission_definitions(id),
  action_b_id UUID NOT NULL REFERENCES public.permission_definitions(id),

  -- Scope of mutual exclusion
  scope TEXT NOT NULL CHECK (scope IN (
    'same_record',
    'same_session',
    'cooldown'
  )),
  cooldown_minutes INTEGER,                      -- if scope = 'cooldown'

  -- Co-signing alternative (e.g. hardClose requires A + Acc)
  allows_co_sign     BOOLEAN NOT NULL DEFAULT FALSE,
  co_sign_role_codes TEXT[],                     -- e.g. ARRAY['admin','accounting']

  -- Lifecycle
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_separation_of_duties_action_a ON public.separation_of_duties_constraints(action_a_id);
CREATE INDEX idx_separation_of_duties_action_b ON public.separation_of_duties_constraints(action_b_id);

-- ============================================================================
-- 5. geolocation_retention_policies  (Pass 2 §15.3)
-- ============================================================================
-- §0.4 #13. Default 30-day retention; operator-configurable in Settings.
-- Seeded in Chunk 5 with one row (default policy).
CREATE TABLE public.geolocation_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Policy identity (single row at v1; future-proofed for Phase 2 multi-tenant)
  tenant_id UUID,

  -- Retention configuration
  retention_days INTEGER NOT NULL DEFAULT 30,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,

  -- Purge behavior
  purge_action TEXT NOT NULL DEFAULT 'coordinates_null' CHECK (purge_action IN (
    'coordinates_null',
    'full_delete'
  )),

  -- Audit retention (timestamp + appointment_id always retained per §0.4 #13)
  keep_timestamp_after_purge      BOOLEAN NOT NULL DEFAULT TRUE,
  keep_appointment_id_after_purge BOOLEAN NOT NULL DEFAULT TRUE,

  -- Lifecycle
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL REFERENCES auth.users(id)
);

-- ============================================================================
-- 6. feature_flags  (Pass 11 §13)
-- ============================================================================
-- Runtime-toggleable flags driving the 6-phase rollout. 10 rows seeded in
-- Chunk 5; this migration ships the table EMPTY per spec.
CREATE TABLE public.feature_flags (
  flag_name          TEXT PRIMARY KEY,
  enabled_globally   BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_user_ids   UUID[]  DEFAULT '{}'::UUID[],
  enabled_role_codes TEXT[]  DEFAULT '{}'::TEXT[],
  description        TEXT,
  enabled_at         TIMESTAMPTZ,
  enabled_by         UUID REFERENCES auth.users(id),
  notes              TEXT
);

-- ============================================================================
-- 7. role_permissions  (Pass 2 §11.3)
-- ============================================================================
-- Role × permission junction. The role default grant matrix.
-- Populated in Chunk 6/7.
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  -- TODO Chunk N: ADD CONSTRAINT role_permissions_role_id_fkey
  --   FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;
  -- (deferred per Decision 2 above — `roles` ships in a later chunk)
  role_id       UUID NOT NULL,
  permission_id UUID NOT NULL REFERENCES public.permission_definitions(id) ON DELETE CASCADE,

  -- Grant state (the three-way: granted, denied, default)
  grant_state TEXT NOT NULL CHECK (grant_state IN (
    'granted',
    'denied',
    'default'
  )),

  -- UI rendering state override per §0.4 #2
  ui_state_override TEXT CHECK (ui_state_override IN (
    'hidden', 'disabled', 'interactive'
  )),

  -- Metadata
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  notes      TEXT,

  -- Uniqueness
  CONSTRAINT role_permissions_unique UNIQUE (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role        ON public.role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission  ON public.role_permissions(permission_id);
CREATE INDEX idx_role_permissions_grant_state ON public.role_permissions(grant_state);

-- ============================================================================
-- 8. role_field_visibility  (Pass 2 §12.2)
-- ============================================================================
-- Role × visibility-flag junction. Populated in Chunk 6/7.
CREATE TABLE public.role_field_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  -- TODO Chunk N: ADD CONSTRAINT role_field_visibility_role_id_fkey
  --   FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;
  -- (deferred per Decision 2 above)
  role_id UUID NOT NULL,
  flag_id UUID NOT NULL REFERENCES public.field_visibility_definitions(id) ON DELETE CASCADE,

  -- Visibility state
  visibility_state TEXT NOT NULL CHECK (visibility_state IN (
    'visible',
    'masked',
    'hidden'
  )),

  -- Metadata
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),

  -- Uniqueness
  CONSTRAINT role_field_visibility_unique UNIQUE (role_id, flag_id)
);

CREATE INDEX idx_role_field_visibility_role ON public.role_field_visibility(role_id);

-- ============================================================================
-- 9. role_data_scopes  (Pass 2 §13.2)
-- ============================================================================
-- Role × resource × scope junction. Populated in Chunk 6/7.
CREATE TABLE public.role_data_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- TODO Chunk N: ADD CONSTRAINT role_data_scopes_role_id_fkey
  --   FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;
  -- (deferred per Decision 2 above)
  role_id  UUID NOT NULL,
  resource TEXT NOT NULL,
  scope_id UUID NOT NULL REFERENCES public.data_scope_definitions(id),

  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),

  CONSTRAINT role_data_scopes_unique UNIQUE (role_id, resource)
);

CREATE INDEX idx_role_data_scopes_role     ON public.role_data_scopes(role_id);
CREATE INDEX idx_role_data_scopes_resource ON public.role_data_scopes(resource);

-- ============================================================================
-- 10. status_behavior_bindings  (Pass 5 §13.1)
-- ============================================================================
-- Polymorphic — one table for all bindings across all 80 status surfaces.
-- ~2000 rows seeded in Chunk 7 once the per-module status lookup tables
-- exist (those tables ship with each module's later build chunks).
CREATE TABLE public.status_behavior_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic reference to the status row
  status_table_name TEXT NOT NULL,               -- e.g. 'invoice_statuses'
  status_row_id     UUID NOT NULL,               -- the specific status row

  -- The binding
  binding_name     TEXT NOT NULL,                -- e.g. 'allows_edit'
  binding_category TEXT NOT NULL CHECK (binding_category IN (
    'action_gate',
    'effect_trigger',
    'ui_driver'
  )),

  -- The value (typed)
  value_boolean BOOLEAN,
  value_text    TEXT,
  value_integer INTEGER,
  value_numeric NUMERIC,
  value_jsonb   JSONB,
  value_type    TEXT NOT NULL CHECK (value_type IN (
    'boolean', 'text', 'integer', 'numeric', 'jsonb'
  )),

  -- Reason / context (helps UIs explain "cannot edit" etc.)
  deny_reason_template TEXT,

  -- Operator vs system control
  is_system_locked BOOLEAN NOT NULL DEFAULT FALSE,

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),

  -- Uniqueness
  CONSTRAINT status_behavior_bindings_unique UNIQUE (status_table_name, status_row_id, binding_name)
);

CREATE INDEX idx_status_bindings_lookup  ON public.status_behavior_bindings(status_table_name, status_row_id);
CREATE INDEX idx_status_bindings_by_name ON public.status_behavior_bindings(binding_name, status_table_name);

-- ============================================================================
-- 11. status_transition_definitions  (Pass 5 §13.2)
-- ============================================================================
-- The valid state transitions per status surface. ~600 rows seeded in
-- Chunk 7 once per-module status lookup tables exist.
CREATE TABLE public.status_transition_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source + target (polymorphic; no FKs — status rows live in per-module
  -- status lookup tables that ship later)
  status_table_name   TEXT NOT NULL,
  from_status_row_id  UUID NOT NULL,
  to_status_row_id    UUID NOT NULL,

  -- Transition properties
  is_allowed                BOOLEAN NOT NULL DEFAULT TRUE,
  requires_admin_approval   BOOLEAN NOT NULL DEFAULT FALSE,
  requires_reason_capture   BOOLEAN NOT NULL DEFAULT FALSE,
  required_action_name      TEXT,                -- e.g. 'invoices:send'

  -- Effects on transition
  triggers_effects JSONB,

  -- Operator vs system
  is_system_locked BOOLEAN NOT NULL DEFAULT FALSE,

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Uniqueness
  CONSTRAINT status_transitions_unique UNIQUE (status_table_name, from_status_row_id, to_status_row_id)
);

CREATE INDEX idx_status_transitions_from ON public.status_transition_definitions(status_table_name, from_status_row_id);
CREATE INDEX idx_status_transitions_to   ON public.status_transition_definitions(status_table_name, to_status_row_id);

COMMIT;

-- ============================================================================
-- END OF 0005_permissions_chunk_01_catalog_tables.sql
-- ============================================================================
