-- ============================================================================
-- Nexvelon · 0006 · Permissions Chunk 2 — Runtime State & Cache Shell Tables
-- ============================================================================
-- Build phase Chunk 2 of the Permissions module.
--
-- Lands 9 tables in a single atomic transaction. The 5 grant/request tables
-- hold runtime state (user grants, multi-role assignments, the admin-access
-- request workflow). The 4 cache tables are denormalized projections of the
-- A1/A2/A3/Phase-3.3 resolution algorithms — they ship empty and lazy-fill
-- on first miss (Pass 9 §17.5). Both groups are independent of seed data
-- and trigger logic, which arrive in Chunks 3-7.
--
--   Runtime state (Pass 2 / Pass 4 / Pass 7):
--     1. user_permission_overrides         (Pass 2 §11.4)
--     2. user_field_visibility_overrides   (Pass 2 §12.3)
--     3. user_data_scope_overrides         (Pass 2 §13.3)
--     4. request_admin_access              (Pass 7 §15.3)
--     5. user_role_assignments             (Pass 7 §16.4)
--
--   Cache shells (Pass 5 / Pass 9):
--     6. effective_permissions_cache       (Pass 2 §11.5 / Pass 9 §25.1)
--     7. effective_field_visibility_cache  (derived — see Decision 5)
--     8. effective_data_scope_cache        (derived — see Decision 5)
--     9. effective_status_bindings_cache   (Pass 5 §13.3)
--
-- Physical CREATE TABLE order follows FK dependency
-- (user_permission_overrides → request_admin_access → user_role_assignments;
-- definitions tables from Chunk 1 → caches). The user spec's numbered
-- list is preserved in the section labels above.
--
-- ----------------------------------------------------------------------------
-- Decisions (surfaced in PR description)
-- ----------------------------------------------------------------------------
--
-- DECISION 1 — `users(id)` → `auth.users(id)`  [RATIFIED — Chunk 1]
--   Permanent rule. No surfacing needed.
--
-- DECISION 2 — `roles(id)` FK is valid  [RATIFIED — Chunk 1]
--   `public.roles` ships in 0005. All `role_id` FKs land inline here.
--
-- DECISION 3 — Table naming  [RATIFIED design-doc names — 2026-05-13]
--   PR #2 review reverted an initial user-spec rename and locked the
--   design-doc names as canonical going forward. All 4 tables ship under
--   their Pass 2 / Pass 7 names:
--     · `user_permission_overrides`         (Pass 2 §11.4)
--     · `user_field_visibility_overrides`   (Pass 2 §12.3)
--     · `user_data_scope_overrides`         (Pass 2 §13.3)
--     · `request_admin_access`              (Pass 7 §15.3)
--   FK references match the design exactly:
--   `request_admin_access.granted_override_id → user_permission_overrides(id)`.
--   All future chunks (5/6/7 seeds, etc.) use these names without
--   further surfacing.
--
-- DECISION 4 — Composite PRIMARY KEY on cache tables  [ACCEPTED — 2026-05-13]
--   Pass 2 §11.5 / Pass 9 §25.1 declare each cache table with `id UUID
--   PRIMARY KEY DEFAULT gen_random_uuid()` plus a separate
--   `UNIQUE (user_id, permission_id)` constraint. Operator review locked
--   the simpler composite-PK shape (`PRIMARY KEY (a, b)` with no
--   surrogate `id`, no separate UNIQUE constraint). Justification: cache
--   tables receive no inbound FKs, run write-heavy via lazy-fill, and
--   the natural key uniquely identifies each row; the PK index doubles
--   as the hit-path index for lookups by user_id prefix.
--
-- DECISION 5 — Cache shape for field_visibility / data_scope DERIVED  [ACCEPTED — 2026-05-13]
--   Pass 9 §16.1 names `effective_field_visibility_cache` and
--   `effective_data_scope_cache` but the design doc contains no explicit
--   `CREATE TABLE` for either (only `effective_permissions_cache` in
--   Pass 2 §11.5 / Pass 9 §25.1, and `effective_status_bindings_cache`
--   in Pass 5 §13.3 have full schemas). Shapes here are derived from the
--   permissions-cache pattern: composite PK on the natural key, FKs
--   matching the source-table FKs, `computed_at` + nullable `expires_at`
--   timestamps, plus `resolved_*_state` + `resolution_source` per the
--   algorithm signature.
--   This migration file is AUTHORITATIVE for these two cache shapes —
--   the design doc has a gap to be backfilled later (PR #2 operator
--   review, 2026-05-13).
--
-- DECISION 6 — Partial-index predicate substitution  [ACCEPTED — 2026-05-13]
--   The Chunk 2 spec mentions partial indexes
--   `WHERE expires_at IS NULL OR expires_at > NOW()`, but `NOW()` is a
--   STABLE (not IMMUTABLE) function and PostgreSQL rejects volatile
--   expressions in partial-index predicates. The Pass 2 design pattern
--   is used instead: `WHERE revoked_at IS NULL` for the active-grant
--   index, and `WHERE expires_at IS NOT NULL AND revoked_at IS NULL`
--   for the expiry-cleanup index on `user_permission_overrides`
--   (mirroring Pass 2 §11.4 exactly). Operator review confirmed: the
--   spec example was technically wrong; the IMMUTABLE-predicate variant
--   shipped here is canonical.
--
-- DECISION 7 — `permission_resolution_view` DEFERRED to Chunk 4
--   Pass 2 §16 declares this materialized view. Per the Chunk 2 spec,
--   it is NOT included here; it ships when the resolution algorithm
--   lands.
--
-- DECISION 8 — Triggers DEFERRED to Chunks 3/4
--   Cache invalidation triggers (Pass 9 §17.2) and append-only triggers
--   (Pass 6) are out of scope. All 9 tables ship without a single trigger.
--
-- DECISION 9 — Seed data DEFERRED to Chunks 5-7
--   All 9 tables ship empty.
--
-- ----------------------------------------------------------------------------
-- Production safety
-- ----------------------------------------------------------------------------
--   · Single BEGIN..COMMIT — atomic.
--   · Additive only — no existing table altered, dropped, renamed, retyped.
--   · No data manipulation. Pure DDL.
--   · `public.profiles.role`, `auth.users` untouched.
--
-- Rollback (post-deploy, if needed):
--   DROP TABLE in reverse FK-order: effective_status_bindings_cache,
--   effective_data_scope_cache, effective_field_visibility_cache,
--   effective_permissions_cache, user_role_assignments,
--   request_admin_access, user_data_scope_overrides, user_field_visibility_overrides,
--   user_permission_overrides.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. user_permission_overrides  (Pass 2 §11.4)
-- ============================================================================
-- Bidirectional per-user override of role default
-- (§0.4 #1). Mandatory `reason` capture per Pass 2; soft-delete via
-- `revoked_at` preserves history.
CREATE TABLE public.user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permission_definitions(id) ON DELETE CASCADE,

  -- Override
  override_state TEXT NOT NULL CHECK (override_state IN (
    'granted',
    'denied'
  )),

  -- Reason + audit (mandatory)
  reason       TEXT NOT NULL,
  is_temporary BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at   TIMESTAMPTZ,

  -- Metadata
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by        UUID NOT NULL REFERENCES auth.users(id),
  revoked_at        TIMESTAMPTZ,
  revoked_by        UUID REFERENCES auth.users(id),
  revocation_reason TEXT,

  -- Uniqueness — one active row per (user, permission); `revoked_at` in
  -- the unique key lets the same pair be re-granted after revocation.
  CONSTRAINT user_permission_overrides_unique_active UNIQUE (user_id, permission_id, revoked_at)
);

CREATE INDEX idx_user_permission_overrides_user_active   ON public.user_permission_overrides(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_permission_overrides_permission    ON public.user_permission_overrides(permission_id);
CREATE INDEX idx_user_permission_overrides_expires_active ON public.user_permission_overrides(expires_at)
  WHERE expires_at IS NOT NULL AND revoked_at IS NULL;

-- ============================================================================
-- 2. user_field_visibility_overrides  (Pass 2 §12.3)
-- ============================================================================
-- Per-user override of role-default field visibility.
CREATE TABLE public.user_field_visibility_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_id UUID NOT NULL REFERENCES public.field_visibility_definitions(id) ON DELETE CASCADE,

  override_visibility_state TEXT NOT NULL CHECK (override_visibility_state IN (
    'visible', 'masked', 'hidden'
  )),

  reason       TEXT NOT NULL,
  is_temporary BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at   TIMESTAMPTZ,

  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),

  CONSTRAINT user_field_visibility_overrides_unique_active UNIQUE (user_id, flag_id, revoked_at)
);

CREATE INDEX idx_user_field_visibility_overrides_user_active ON public.user_field_visibility_overrides(user_id) WHERE revoked_at IS NULL;

-- ============================================================================
-- 3. user_data_scope_overrides  (Pass 2 §13.3)
-- ============================================================================
-- Per-user override of role-default data scope per (user, resource).
CREATE TABLE public.user_data_scope_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource          TEXT NOT NULL,
  override_scope_id UUID NOT NULL REFERENCES public.data_scope_definitions(id),

  reason       TEXT NOT NULL,
  is_temporary BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at   TIMESTAMPTZ,

  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID NOT NULL REFERENCES auth.users(id),
  revoked_at TIMESTAMPTZ,

  CONSTRAINT user_data_scope_overrides_unique_active UNIQUE (user_id, resource, revoked_at)
);

CREATE INDEX idx_user_data_scope_overrides_user_active ON public.user_data_scope_overrides(user_id) WHERE revoked_at IS NULL;

-- ============================================================================
-- 4. request_admin_access  (Pass 7 §15.3)
-- ============================================================================
-- The full Pass 7 state machine — 34 columns covering
-- 4 request types (`permission_grant` / `field_visibility_grant` /
-- `data_scope_grant` / `role_temporary_assignment`), 7 statuses
-- (pending/approved/granted/rejected/cancelled/expired/revoked),
-- polymorphic target columns, dual reasoning capture, forensic metadata,
-- pending-expiry timer, and usage-tracking counters.
CREATE TABLE public.request_admin_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  requester_user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Request type
  request_type TEXT NOT NULL CHECK (request_type IN (
    'permission_grant',
    'field_visibility_grant',
    'data_scope_grant',
    'role_temporary_assignment'
  )),

  -- Target (polymorphic per request_type)
  target_permission_id UUID REFERENCES public.permission_definitions(id),
  target_flag_id       UUID REFERENCES public.field_visibility_definitions(id),
  target_resource      TEXT,
  target_scope_id      UUID REFERENCES public.data_scope_definitions(id),
  target_role_id       UUID REFERENCES public.roles(id),

  -- Context
  related_entity_type TEXT,
  related_entity_id   UUID,

  -- Duration
  duration_type TEXT NOT NULL CHECK (duration_type IN (
    'one_time',
    'temporary',
    'permanent'
  )),
  start_at TIMESTAMPTZ,
  end_at   TIMESTAMPTZ,

  -- State
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'granted', 'rejected', 'cancelled', 'expired', 'revoked'
  )),

  -- Lifecycle timestamps
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at   TIMESTAMPTZ,
  granted_at    TIMESTAMPTZ,
  decided_at    TIMESTAMPTZ,
  expired_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,

  -- People
  decided_by_user_id UUID REFERENCES auth.users(id),
  revoked_by_user_id UUID REFERENCES auth.users(id),

  -- Reasoning (both sides)
  requester_justification  TEXT NOT NULL,
  admin_decision_rationale TEXT,
  revocation_reason        TEXT,

  -- The granted override (back-reference; populated on grant for
  -- request_type = 'permission_grant'. Field-visibility, data-scope,
  -- and role-temporary-assignment grants record their back-ref on the
  -- grant-side table; see Pass 7 §16 for the per-type flow.)
  granted_override_id UUID REFERENCES public.user_permission_overrides(id),

  -- Forensic metadata
  request_ip_address INET,
  request_user_agent TEXT,

  -- Routing (Phase 2 placeholder; v1 always NULL)
  routing_rule_id UUID,

  -- Pending expiry (auto-expire if not decided within window)
  pending_expires_at TIMESTAMPTZ,

  -- Activity tracking (for audit + usage analytics)
  use_count     INTEGER NOT NULL DEFAULT 0,
  first_used_at TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ
);

CREATE INDEX idx_request_admin_access_requester         ON public.request_admin_access(requester_user_id, requested_at DESC);
CREATE INDEX idx_request_admin_access_status_pending    ON public.request_admin_access(status) WHERE status = 'pending';
CREATE INDEX idx_request_admin_access_status_granted    ON public.request_admin_access(status, end_at) WHERE status = 'granted';
CREATE INDEX idx_request_admin_access_decided_by        ON public.request_admin_access(decided_by_user_id, decided_at DESC);
CREATE INDEX idx_request_admin_access_target_permission ON public.request_admin_access(target_permission_id);
CREATE INDEX idx_request_admin_access_pending_expires   ON public.request_admin_access(pending_expires_at) WHERE status = 'pending';

-- ============================================================================
-- 5. user_role_assignments  (Pass 7 §16.4)
-- ============================================================================
-- Replaces the static `profiles.role` enum with a
-- multi-row model — each user may have one PRIMARY assignment plus zero
-- or more additive assignments (e.g. role_temporary_assignment grants
-- from request_admin_access). A1 resolution unions permissions across
-- all active assignments for a user.
--
-- Pass 7's per-Pass schema does not declare indexes on this table; the
-- two below are added to support the Pass 9 §17.2 invalidation trigger
-- queries (cache invalidation needs to look up users by role_id, and
-- A1 resolution needs to look up roles by user_id). Surfaced in PR.
CREATE TABLE public.user_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES auth.users(id),
  role_id UUID NOT NULL REFERENCES public.roles(id),

  is_primary BOOLEAN NOT NULL DEFAULT FALSE,

  granted_by_request_id UUID REFERENCES public.request_admin_access(id),

  start_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at     TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id),

  -- At most one PRIMARY row per user. DEFERRABLE so a single transaction
  -- can swap the primary by inserting the new row and updating the old
  -- (per Pass 7 §16.4).
  CONSTRAINT user_role_assignments_unique_primary
    UNIQUE (user_id, is_primary) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_user_role_assignments_user_active ON public.user_role_assignments(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_role_assignments_role_active ON public.user_role_assignments(role_id) WHERE revoked_at IS NULL;

-- ============================================================================
-- 6. effective_permissions_cache  (Pass 2 §11.5 / Pass 9 §25.1)
-- ============================================================================
-- A1 hot path. One row per (user, permission). Ships
-- empty; lazy-fills on miss (Pass 9 §17.5). Composite PK per Decision 4.
CREATE TABLE public.effective_permissions_cache (
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_id          UUID NOT NULL REFERENCES public.permission_definitions(id) ON DELETE CASCADE,
  permission_action_name TEXT NOT NULL,

  is_granted BOOLEAN NOT NULL,
  resolution_source TEXT NOT NULL CHECK (resolution_source IN (
    'role_default',
    'user_override_grant',
    'user_override_deny'
  )),

  resolved_ui_state TEXT NOT NULL CHECK (resolved_ui_state IN (
    'hidden', 'disabled', 'interactive'
  )),

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,

  PRIMARY KEY (user_id, permission_id)
);

-- Cache hit-path index on action_name (the algorithm's `WHERE user_id =
-- ? AND permission_action_name = ?` query — Pass 2 §11.5 + Pass 9 §25.1).
CREATE INDEX idx_effective_permissions_cache_lookup ON public.effective_permissions_cache(user_id, permission_action_name);
-- For the daily expiry cleanup cron (Pass 9 §20.1).
CREATE INDEX idx_effective_permissions_cache_expires ON public.effective_permissions_cache(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- 7. effective_field_visibility_cache  (DERIVED — see Decision 5)
-- ============================================================================
-- A3 hot path. Shape derived from the permissions-
-- cache pattern: composite PK on (user_id, flag_id), FKs to source
-- tables, computed_at + nullable expires_at.
CREATE TABLE public.effective_field_visibility_cache (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_id UUID NOT NULL REFERENCES public.field_visibility_definitions(id) ON DELETE CASCADE,

  resolved_visibility_state TEXT NOT NULL CHECK (resolved_visibility_state IN (
    'visible', 'masked', 'hidden'
  )),
  resolution_source TEXT NOT NULL CHECK (resolution_source IN (
    'role_default',
    'user_override_grant',
    'user_override_deny'
  )),

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,

  PRIMARY KEY (user_id, flag_id)
);

CREATE INDEX idx_effective_field_visibility_cache_expires ON public.effective_field_visibility_cache(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- 8. effective_data_scope_cache  (DERIVED — see Decision 5)
-- ============================================================================
-- A2 hot path. Composite PK on (user_id, resource).
-- `resource` is a TEXT identifier (no FK; resource list lives in
-- permission_definitions.resource, not a separate dimension table).
CREATE TABLE public.effective_data_scope_cache (
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,

  resolved_scope_id UUID NOT NULL REFERENCES public.data_scope_definitions(id),
  resolution_source TEXT NOT NULL CHECK (resolution_source IN (
    'role_default',
    'user_override_grant',
    'user_override_deny'
  )),

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,

  PRIMARY KEY (user_id, resource)
);

CREATE INDEX idx_effective_data_scope_cache_expires ON public.effective_data_scope_cache(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- 9. effective_status_bindings_cache  (Pass 5 §13.3)
-- ============================================================================
-- Phase 3.3 hot path. Polymorphic — `status_table_name`
-- + `status_row_id` identifies the source row across all 80 status
-- surfaces. No FKs (the status rows live in per-module tables that ship
-- with later module-build chunks).
CREATE TABLE public.effective_status_bindings_cache (
  status_table_name TEXT NOT NULL,
  status_row_id     UUID NOT NULL,

  bindings JSONB NOT NULL,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (status_table_name, status_row_id)
);

COMMIT;

-- ============================================================================
-- END OF 0006_permissions_chunk_02_runtime_state.sql
-- ============================================================================
