# NEXVELON_PERMISSIONS_DESIGN.md

> **The permissions architecture for Nexvelon — design phase.**
>
> A new Claude Code session reads, in order:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final)
>   4. `NEXVELON_ROADMAP.md`
>   5. `NEXVELON_SESSION_<latest>_HANDOFF.md`
>   6. **This file** — Permissions design specification
>
> **Status:** v0.2 — Passes 1-2 complete. Pending: Pass 3 (Resolution
> algorithm), Pass 4 (Field visibility engine), Pass 5 (Status
> surface bindings), Pass 6 (Append-only audit), Pass 7 (Request-
> admin-access workflow), Pass 8 (Permissions editor UI), Pass 9
> (Effective-permissions caching strategy), Pass 10 (Cross-cutting
> enforcement patterns), Pass 11 (Migration plan).
>
> Pass 1 (Action Vocabulary Catalog) condensed to summary in §1-§8
> below; full Pass 1 content preserved at commit `9008fad`.
> Pass 2 (Database Schema) full content begins at §10.

---

## 0. How to use this document

### 0.1 Purpose

Design specification for the Nexvelon permissions runtime. Synthesizes everything from the 13-module feature audit into the actual architecture: action vocabulary, database schemas, resolution algorithm, field-level visibility engine, audit patterns, UI surfaces.

### 0.2 Pass overview

| Pass | Scope | Status |
|---|---|---|
| 1 | Action vocabulary catalog | ✅ COMPLETE (v0.1 at commit `9008fad`; condensed below) |
| 2 | Database schema | ✅ COMPLETE (this version) |
| 3 | Permission resolution algorithm | PENDING |
| 4 | Field-level visibility engine | PENDING |
| 5 | Status surface binding layer | PENDING |
| 6 | Append-only audit pattern | PENDING |
| 7 | Request-admin-access workflow | PENDING |
| 8 | Permissions editor UI | PENDING |
| 9 | Effective-permissions caching strategy | PENDING |
| 10 | Cross-cutting enforcement patterns | PENDING |
| 11 | Migration plan | PENDING |

### 0.3 Role abbreviations

**A** Admin, **PM** Project Manager, **SR** Sales Rep, **Tech** Technician, **Sub** Subcontractor (portal), **Acc** Accounting, **VO** View Only. Additional custom roles surfaced through the audit: **Dispatcher** (M12), **Bookkeeper** (M11), **HR-role**, **Executive** (M13). Operators can create unlimited custom roles via the M2 framework.

---

═══════════════════════════════════════════════════════════════════
# Part I — Pass 1 (Action Vocabulary Catalog) — condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 1 content preserved at commit `9008fad`. Below is the condensed reference that Pass 2 and later passes consume.*

## 1. Naming convention

**Format:** `resource:verb[:qualifier]`

- **resource** — plural noun, lowercase, snake_case if multi-word (matches database table name).
- **verb** — single verb in camelCase from a fixed verb taxonomy.
- **qualifier** — optional, drawn from a fixed qualifier taxonomy.

## 2. Verb taxonomy (8 categories, fixed verb set)

1. **View verbs:** `view`, `viewList`, `viewDetail`, `viewMy`, `viewAll`, `viewHistory`, `viewMappings`, `viewAuditLog`, `viewParameters`, `viewHistoricalRuns`, `export`, `exportPdf`, `exportCsv`, `exportExcel`. Plus compound sub-section view verbs (`viewBanking`, `viewLaborRates`, `viewT5018Ytd`, `viewWsib`, `viewWorkerManifest`, `viewSourceTraceability`).
2. **Create verbs:** `create`, `createFrom<source>`, `generate`, `generateNext`, `importCsv`, `importFromTemplate`, `duplicate`.
3. **Edit verbs:** `edit`, `editBasic`, `editAdvanced`, `editDraft`, `editAddress`, `editBilling`, `editBankingDetails`, `editRequirements`, `applyDiscount`, `applyTax`, `applyTemplate`, `applyMultiplier`, `recategorize`, `addLine`, `removeLine`, `setEffectiveDate`.
4. **State-transition verbs:** `submit`, `approve`, `reject`, `dispute`, `send`, `resend`, `void`, `cancel`, `reopen`, `archive`, `unarchive`, `markPaid`, `markComplete`, `recordPayment`, `recordBounce`, `recordRefund`, `recordNoShow`, `recordCompleted`, `recordAcknowledgement`, `recordOnSite`, `recordInProgress`, `promote`, `softClose`, `hardClose`, `reopenPeriod`, `pause`, `resume`, `escalate`, `acknowledge`, `releaseRetention`, `startLienPeriod`, `closeWO`.
5. **Configuration verbs:** `configure`, `configureRoleAccess`, `configureUserOverride`, `configureMappings`, `configureAlertThresholds`, `configureFilingSchedule`, `setBudget`, `runFxRevaluation`, `runPeriodEndChecks`, `runReconciliation`, `triggerSync`.
6. **Communication verbs:** `send`, `sendReminder`, `sendReceipt`, `sendStatement`, `sendBatch`, `notify`, `mentionTeam`.
7. **Admin verbs (A-only typical):** `hardDelete`, `merge`, `overrideSla`, `overrideNormalScheduling`, `recordSlaWaiver`, `manualOverrideWsib`, `manualOverrideInsurance`, `runOnBehalf`, `forcePosting`, `deleteSnapshot`.
8. **Workflow verbs (multi-step):** `executePaymentRun`, `performThreeWayMatch`, `runReport`, `bulkReverse`, `generateBatch`.

## 3. Qualifier taxonomy (4 categories, fixed qualifier set)

- **Scope qualifiers:** `:list`, `:detail`, `:my`, `:team`, `:assigned`, `:project`, `:tier`, `:category`, `:all`
- **State qualifiers:** `:draft`, `:pending`, `:approved`, `:sent`, `:paid`, `:void`
- **Modal qualifiers:** `:read`, `:write`, `:execute`, `:delete`, `:manual`, `:auto`
- **Field-section qualifiers:** `:banking`, `:labor_rates`, `:profit`, `:internal_notes`, `:executive`, `:payroll`, `:cost_rate`, `:geolocation`, `:worker_manifest`, `:tax_forms`, `:wsib`, `:full_card_number`

## 4. Resource taxonomy

140+ resources across 13 modules, mapped 1:1 to database tables. Full enumeration at commit `9008fad`. By module:
- M1 (15 resources) — clients + sites + contacts + service contracts + communication log
- M2 (13 resources) — employees + certifications + territories + absences + users + roles + permissions
- M3 (18 resources) — settings + lookups + workflow rules + templates
- M4 (4 resources) — dashboards + widgets + layouts
- M5 (8 resources) — quotes + lines + revisions + portal access
- M6 (17 resources) — projects + phases + tasks + costs + change orders + commissioning + handover + lien records
- M7 (13 resources) — inventory + stock locations + movements + serials + POs + vendor catalog + FIFO layers
- M8 (10 resources) — vendors + contacts + banking + T5018 + W9/W8-BEN + onboarding + insurance + WSIB + performance
- M9 (14 resources) — invoices + lines + payments + credit notes + statements + AP bills + payment runs + recurring
- M10 (14 resources) — contractors + contacts + labor rates + skills + territories + worker manifest + performance + onboarding + insurance + WSIB + T5018 + WOs + WO lines
- M11 (12 resources) — coa + GL entries + GL lines + bank accounts + bank transactions + bank rec + accounting periods + tax filings + recurring journals + FX revaluation + integrations
- M12 (10 resources) — appointments + resources + recurrence + change log + availability blocks + dispatch + templates + SLA alerts + external sync + travel time
- M13 (9 resources) — reports + definitions + custom + subscriptions + scheduled deliveries + snapshots + execution log + dashboards + categories

## 5. Action grouping for permissions editor UI

**4-tier hierarchy:** Module → Resource → Category → Individual action

**Categories within resource:** View / Create / Edit / State Transitions / Communication / Reporting / Admin Override / Configuration

**Plus 6 cross-cut tabs in the editor:** Actions / Field Visibility / Data Scopes / Overrides / Custom Roles / Audit Log

**Three UI states per §0.4 #2:** hidden / disabled / interactive

## 6. Cross-references

- **Action dependencies** documented (e.g., `invoices:send` requires `invoices:viewDetail` + `clients:viewDetail` + `email_templates:read`)
- **Mutually exclusive actions** per §0.4 #11 (AP bill creator ≠ approver; payment run creator ≠ approver; GL manual entry creator ≠ poster; hard close requires A + Acc co-sign)
- **Action chains** (multi-step workflows): Quote → Project; Project → Invoice (progress claim); AP bill → Payment; Period close; Contractor WO completion

## 7. Special-case action treatment

- **Public actions** (signed URL, no role) — customer quote portal, customer invoice payment portal
- **Admin exceptions** (with reason capture + audit) — 13 specific A-only override actions catalogued
- **System-generated actions** (auto, never user-initiated) — 10+ specific auto-actions catalogued
- **Append-only actions** (write-once, no edit/delete) per §0.4 #10 — 9 specific resources

## 8. Six open questions resolved in Pass 1

1. Compound verbs vs qualifier form — keep both forms; compound for state-distinct, qualifier for scope-distinct.
2. Per-record vs per-class actions — capability granted at class; enforcement at runtime per-record.
3. Role inheritance — NO at v1 (flat with clone-modify); hierarchy Phase 2.
4. Per-tenant custom actions — NO at v1 (fixed catalog); custom Phase 2.
5. Action versioning — new actions default denied; migration scripts add to baseline roles.
6. Action deprecation — mark deprecated; functional for 1 release; clean up second release; audit reads preserved.

---

═══════════════════════════════════════════════════════════════════
# Part II — Pass 2 (Database Schema) — FULL CONTENT
═══════════════════════════════════════════════════════════════════

## 10. Overview

Fourteen tables across five groups. Plus one materialized view (`permission_resolution_view`) that ties everything together for fast queries.

| Group | Tables | Purpose |
|---|---|---|
| Core permissions | `permission_definitions`, `roles`, `role_permissions`, `user_permission_overrides`, `effective_permissions_cache` | Action catalog + role grants + per-user overrides + denormalized cache |
| Field visibility | `field_visibility_definitions`, `role_field_visibility`, `user_field_visibility_overrides` | The 50+ `visibility.*` flags + per-role + per-user |
| Data scopes | `data_scope_definitions`, `role_data_scopes`, `user_data_scope_overrides` | Scope qualifiers (`my`/`team`/`project`/`all`) + per-role + per-user |
| Audit | `permission_audit_log` | Append-only audit of every grant/revoke/override |
| Cross-cutting | `separation_of_duties_constraints`, `regulatory_expiry_overrides`, `geolocation_retention_policies` | Constraints from §0.4 #11, #12, #13 |

## 11. Group 1 — Core permission tables

### 11.1 `permission_definitions` — master action catalog

One row per action in the Pass 1 catalog. ~1260 rows. Populated by migration from this document.

```sql
CREATE TABLE permission_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  action_name TEXT NOT NULL UNIQUE,              -- e.g., 'invoices:send'
  resource TEXT NOT NULL,                        -- e.g., 'invoices' (parsed from action_name)
  verb TEXT NOT NULL,                            -- e.g., 'send'
  qualifier TEXT,                                -- e.g., 'my' (NULL if no qualifier)

  -- Categorization (Pass 1 §2)
  verb_category TEXT NOT NULL CHECK (verb_category IN (
    'view', 'create', 'edit', 'state_transition',
    'configuration', 'communication', 'admin', 'workflow'
  )),
  qualifier_category TEXT CHECK (qualifier_category IN (
    'scope', 'state', 'modal', 'field_section'
  )),

  -- Module + UI grouping (Pass 1 §5)
  module_code TEXT NOT NULL,                     -- e.g., 'M9'
  ui_category TEXT NOT NULL CHECK (ui_category IN (
    'view', 'create', 'edit', 'state_transition',
    'communication', 'reporting', 'admin_override', 'configuration'
  )),

  -- Description + metadata
  description TEXT NOT NULL,
  notes TEXT,                                    -- e.g., "Eight-layer protected"

  -- Flags
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,   -- 🔒 — audit on grant
  is_high_impact BOOLEAN NOT NULL DEFAULT FALSE, -- ⚠ — confirmation UI before execution
  is_admin_exception BOOLEAN NOT NULL DEFAULT FALSE, -- A-only override with reason capture
  is_system_generated BOOLEAN NOT NULL DEFAULT FALSE, -- auto-only; not user-initiated
  is_public_action BOOLEAN NOT NULL DEFAULT FALSE, -- signed URL, no role
  requires_reason_capture BOOLEAN NOT NULL DEFAULT FALSE,
  is_append_only_target BOOLEAN NOT NULL DEFAULT FALSE, -- writes to append-only ledger
  is_deprecated BOOLEAN NOT NULL DEFAULT FALSE,

  -- Default UI rendering state (§0.4 #2)
  default_ui_state TEXT NOT NULL DEFAULT 'interactive' CHECK (default_ui_state IN (
    'hidden', 'disabled', 'interactive'
  )),

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  deprecation_reason TEXT,
  replaced_by_action_name TEXT,                  -- if deprecated, what replaces it

  -- Indexes
  CONSTRAINT permission_definitions_action_unique UNIQUE (action_name)
);

CREATE INDEX idx_permission_definitions_resource ON permission_definitions(resource);
CREATE INDEX idx_permission_definitions_module ON permission_definitions(module_code);
CREATE INDEX idx_permission_definitions_verb_category ON permission_definitions(verb_category);
```

**Why this shape:**
- One row per action keeps semantics simple
- `verb`, `qualifier`, `resource` parsed from `action_name` and stored separately for fast filtering
- Categorization columns drive the permissions editor UI (Tier 3 + 6 cross-cut tabs)
- Flag columns (`is_sensitive`, etc.) drive runtime behavior (audit-on-grant, confirmation UI, reason capture)
- `is_deprecated` + `replaced_by_action_name` support the deprecation lifecycle from Pass 1 §8

**Sample rows:**

| action_name | resource | verb | qualifier | verb_category | module_code | ui_category | is_sensitive | is_admin_exception |
|---|---|---|---|---|---|---|---|---|
| `clients:viewList` | clients | viewList | NULL | view | M1 | view | f | f |
| `clients:viewBanking` | clients | viewBanking | NULL | view | M1 | view | t | f |
| `clients:overrideSla` | clients | overrideSla | NULL | admin | M1 | admin_override | t | t |
| `invoices:send` | invoices | send | NULL | communication | M9 | communication | f | f |
| `gl_journal_entries:create:manual` | gl_journal_entries | create | manual | create | M11 | create | t | f |
| `payments:view:full_card_number` | payments | view | full_card_number | view | M9 | view | t | t |
| `inventory_movements:create` | inventory_movements | create | NULL | create | M7 | create | f | f |

### 11.2 `roles` — role definitions

```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  role_code TEXT NOT NULL UNIQUE,                -- 'admin', 'pm', 'sr', 'tech', 'sub', 'acc', 'vo', 'dispatcher', 'bookkeeper', 'hr', 'executive'
  display_name TEXT NOT NULL,
  description TEXT,

  -- Categorization
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE, -- system-defined; cannot be deleted by operator
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Clone tracking (Pass 1 §8: flat model with clone-and-modify)
  cloned_from_role_id UUID REFERENCES roles(id),

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES users(id)
);

CREATE INDEX idx_roles_role_code ON roles(role_code);
CREATE INDEX idx_roles_is_system ON roles(is_system_role) WHERE is_active = TRUE;
```

**Seeded roles (system-defined):**
- `admin` (A)
- `project_manager` (PM)
- `sales_rep` (SR)
- `technician` (Tech)
- `subcontractor` (Sub — portal only at v1)
- `accounting` (Acc)
- `view_only` (VO)
- `dispatcher` (M12)
- `bookkeeper` (M11)
- `hr` (HR-role)
- `executive` (M13)

Operator-created custom roles use `is_system_role = FALSE`.

### 11.3 `role_permissions` — role × permission junction

```sql
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permission_definitions(id) ON DELETE CASCADE,

  -- Grant state (the three-way: granted, denied, inherited-default)
  grant_state TEXT NOT NULL CHECK (grant_state IN (
    'granted',          -- explicitly granted
    'denied',           -- explicitly denied (overrides default)
    'default'           -- use permission_definitions.default_ui_state
  )),

  -- UI rendering state override per §0.4 #2
  ui_state_override TEXT CHECK (ui_state_override IN (
    'hidden', 'disabled', 'interactive'
  )),                                            -- NULL = use permission_definitions.default_ui_state

  -- Metadata
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  notes TEXT,

  -- Uniqueness
  CONSTRAINT role_permissions_unique UNIQUE (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX idx_role_permissions_grant_state ON role_permissions(grant_state);
```

**Why this shape:**
- `grant_state = 'default'` rows can be omitted for storage efficiency (only store explicit grants + denials)
- `ui_state_override` allows operator to render a granted action as `disabled` (visible but greyed) for visibility cues — independent of grant
- Two-column unique constraint prevents duplicate grants per role per permission

**Sample rows (default role grants for Admin):**

| role_id (admin) | permission_id (clients:viewList) | grant_state | ui_state_override |
|---|---|---|---|
| admin | clients:viewList | granted | NULL (default interactive) |
| admin | clients:overrideSla | granted | NULL |
| admin | clients:hardDelete | granted | NULL (UI shows ⚠ confirmation per is_high_impact flag) |
| admin | payments:view:full_card_number | denied | hidden (PCI compliance — never granted to anyone) |

### 11.4 `user_permission_overrides` — per-user overrides

Per §0.4 #1: bidirectional per-user override. A user can be granted an action their role denies, or denied an action their role grants.

```sql
CREATE TABLE user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permission_definitions(id) ON DELETE CASCADE,

  -- Override
  override_state TEXT NOT NULL CHECK (override_state IN (
    'granted',          -- grant beyond role default
    'denied'            -- deny despite role default
  )),

  -- Reason + audit (mandatory for high-sensitivity overrides)
  reason TEXT NOT NULL,                          -- always captured
  is_temporary BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,                        -- if temporary

  -- Metadata
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID NOT NULL REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  revocation_reason TEXT,

  -- Uniqueness (only one active override per user per permission)
  CONSTRAINT user_permission_overrides_unique_active UNIQUE (user_id, permission_id, revoked_at)
);

CREATE INDEX idx_user_permission_overrides_user ON user_permission_overrides(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_permission_overrides_permission ON user_permission_overrides(permission_id);
CREATE INDEX idx_user_permission_overrides_expires ON user_permission_overrides(expires_at) WHERE expires_at IS NOT NULL AND revoked_at IS NULL;
```

**Why this shape:**
- `reason` is `NOT NULL` — overrides ALWAYS have a reason (§0.4 #1 requires audit on override)
- `is_temporary` + `expires_at` enable time-bound grants (e.g., "grant Bob `invoices:approve` until end of vacation period")
- Soft delete via `revoked_at` rather than DELETE — full history preserved
- Unique constraint includes `revoked_at` so a permission can be granted-revoked-granted-revoked sequentially

**Sample rows:**

| user_id | permission_id | override_state | reason | is_temporary | expires_at |
|---|---|---|---|---|---|
| user_xyz (PM) | invoices:approve | granted | "Acting Acc coverage for 2 weeks" | TRUE | 2026-05-26 |
| user_abc (SR) | clients:viewBanking | denied | "Performance review — temporarily revoked pending audit" | FALSE | NULL |

### 11.5 `effective_permissions_cache` — denormalized resolution result

Per Decision 2 in the chat walk: cache the resolved permissions per user for <1ms lookups. Invalidated on grant/revoke/override events.

```sql
CREATE TABLE effective_permissions_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permission_definitions(id) ON DELETE CASCADE,
  permission_action_name TEXT NOT NULL,           -- denormalized for direct lookup; redundant with permission_id but fast

  -- Resolved state
  is_granted BOOLEAN NOT NULL,
  resolution_source TEXT NOT NULL CHECK (resolution_source IN (
    'role_default',                              -- granted/denied by role default
    'user_override_grant',                       -- granted by user override
    'user_override_deny'                         -- denied by user override
  )),

  -- UI state resolved
  resolved_ui_state TEXT NOT NULL CHECK (resolved_ui_state IN (
    'hidden', 'disabled', 'interactive'
  )),

  -- Cache freshness
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                        -- for temporary overrides

  -- Uniqueness (one row per user per permission)
  CONSTRAINT effective_permissions_cache_unique UNIQUE (user_id, permission_id)
);

-- Critical performance index — most queries are by user + action_name
CREATE INDEX idx_effective_permissions_cache_lookup ON effective_permissions_cache(user_id, permission_action_name);
CREATE INDEX idx_effective_permissions_cache_user ON effective_permissions_cache(user_id);
CREATE INDEX idx_effective_permissions_cache_expires ON effective_permissions_cache(expires_at) WHERE expires_at IS NOT NULL;
```

**Why this shape:**
- One row per user × permission. ~500 users × ~1260 permissions = ~630k rows. Acceptable.
- `permission_action_name` denormalized so common runtime query `WHERE user_id = ? AND permission_action_name = ?` hits an index without a JOIN
- `resolution_source` documents *why* the permission resolved as it did — useful for debugging + audit display
- `expires_at` set when resolution included a temporary user override; nightly job re-resolves expired rows

**Cache invalidation triggers (Pass 9 expands this):**
- Insert/update/delete on `role_permissions` → invalidate all rows where `permission_id` matches
- Insert/update/delete on `user_permission_overrides` → invalidate matching `(user_id, permission_id)` row
- User role change in `users` table → invalidate all rows for that user
- Permission deprecation in `permission_definitions` → invalidate matching `permission_id` rows

## 12. Group 2 — Field visibility tables

Per §0.4 #6 ten-dimensional model: field-level visibility is orthogonal to action grants. SR with `clients:viewDetail` granted still doesn't see banking section without `clients:view:banking` (or the equivalent field visibility flag).

### 12.1 `field_visibility_definitions`

```sql
CREATE TABLE field_visibility_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  flag_name TEXT NOT NULL UNIQUE,                -- e.g., 'visibility.clients.banking'
  resource TEXT NOT NULL,                        -- 'clients'
  field_section TEXT NOT NULL,                   -- 'banking'

  -- Categorization
  module_code TEXT NOT NULL,
  sensitivity_level TEXT NOT NULL CHECK (sensitivity_level IN (
    'standard',          -- internal notes, etc.
    'sensitive',         -- payroll, banking, SIN
    'restricted',        -- exec comp, full card number (never granted)
    'pii'                -- customer PII
  )),

  -- Metadata
  description TEXT NOT NULL,
  is_never_granted BOOLEAN NOT NULL DEFAULT FALSE, -- e.g., full_card_number (PCI compliance)
  requires_audit_on_read BOOLEAN NOT NULL DEFAULT FALSE, -- e.g., banking
  retention_days INTEGER,                        -- nullable; used for geolocation per §0.4 #13

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deprecated BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_field_visibility_definitions_resource ON field_visibility_definitions(resource);
CREATE INDEX idx_field_visibility_definitions_module ON field_visibility_definitions(module_code);
```

**Seeded rows (the 50+ `visibility.*` flags from the audit):**

| flag_name | resource | field_section | sensitivity | requires_audit_on_read | is_never_granted |
|---|---|---|---|---|---|
| `visibility.clients.banking` | clients | banking | sensitive | TRUE | FALSE |
| `visibility.clients.internalNotes` | clients | internal_notes | standard | FALSE | FALSE |
| `visibility.employees.banking` | employees | banking | sensitive | TRUE | FALSE |
| `visibility.employees.sin` | employees | sin | sensitive | TRUE | FALSE |
| `visibility.employees.payroll` | employees | payroll | sensitive | FALSE | FALSE |
| `visibility.employees.cost_rate` | employees | cost_rate | sensitive | FALSE | FALSE |
| `visibility.invoices.profit` | invoices | profit | sensitive | FALSE | FALSE |
| `visibility.invoices.discountReason` | invoices | discount_reason | standard | FALSE | FALSE |
| `visibility.payments.fullCardNumber` | payments | full_card_number | restricted | FALSE | TRUE |
| `visibility.payments.bankAccountInfo` | payments | bank_account_info | sensitive | TRUE | FALSE |
| `visibility.vendors.banking` | vendors | banking | sensitive | TRUE | FALSE |
| `visibility.vendors.t5018YtdAmount` | vendors | t5018_ytd | sensitive | FALSE | FALSE |
| `visibility.contractors.banking` | contractors | banking | sensitive | TRUE | FALSE |
| `visibility.contractors.laborRates` | contractors | labor_rates | sensitive | FALSE | FALSE |
| `visibility.contractors.workerManifest` | contractors | worker_manifest | sensitive | FALSE | FALSE |
| `visibility.financials.bankBalances` | financials | bank_balances | sensitive | FALSE | FALSE |
| `visibility.financials.executiveCompensation` | financials | exec_comp | restricted | FALSE | FALSE |
| `visibility.scheduling.geolocationHistory` | scheduling | geolocation | sensitive | FALSE | FALSE (retention 30 days per §0.4 #13) |

### 12.2 `role_field_visibility`

```sql
CREATE TABLE role_field_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  flag_id UUID NOT NULL REFERENCES field_visibility_definitions(id) ON DELETE CASCADE,

  -- Visibility state
  visibility_state TEXT NOT NULL CHECK (visibility_state IN (
    'visible',           -- field rendered
    'masked',            -- field shown but value masked (e.g., '••• ••• 1234' for card)
    'hidden'             -- field completely absent
  )),

  -- Metadata
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),

  -- Uniqueness
  CONSTRAINT role_field_visibility_unique UNIQUE (role_id, flag_id)
);

CREATE INDEX idx_role_field_visibility_role ON role_field_visibility(role_id);
```

**Why `masked` as a state:** PCI compliance requires showing last-4 of credit cards. So `payments.fullCardNumber` is never `visible` (per `is_never_granted` flag), but the display shows the masked form (`••• ••• 1234`) which is a separate read path with `masked` state.

### 12.3 `user_field_visibility_overrides`

```sql
CREATE TABLE user_field_visibility_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flag_id UUID NOT NULL REFERENCES field_visibility_definitions(id) ON DELETE CASCADE,

  override_visibility_state TEXT NOT NULL CHECK (override_visibility_state IN (
    'visible', 'masked', 'hidden'
  )),

  reason TEXT NOT NULL,
  is_temporary BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,

  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID NOT NULL REFERENCES users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),

  CONSTRAINT user_field_visibility_overrides_unique_active UNIQUE (user_id, flag_id, revoked_at)
);

CREATE INDEX idx_user_field_visibility_overrides_user ON user_field_visibility_overrides(user_id) WHERE revoked_at IS NULL;
```

## 13. Group 3 — Data scope tables

Per Decision 3 in the chat walk: scopes are orthogonal to grants. Scopes answer "which records?"; grants answer "what verbs?".

### 13.1 `data_scope_definitions`

```sql
CREATE TABLE data_scope_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  scope_code TEXT NOT NULL UNIQUE,               -- 'my', 'team', 'assigned', 'project', 'tier', 'category', 'all'
  display_name TEXT NOT NULL,
  description TEXT,

  -- The actual filter logic (SQL fragment that's appended to WHERE clauses)
  filter_sql_template TEXT NOT NULL,             -- e.g., 'created_by = $current_user OR assigned_to = $current_user' for 'my'

  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
```

**Seeded rows:**

| scope_code | display_name | filter_sql_template |
|---|---|---|
| `my` | My records | `(created_by = $current_user OR owner_id = $current_user)` |
| `team` | Team records | `(team_id IN (SELECT team_id FROM employee_teams WHERE user_id = $current_user))` |
| `assigned` | Assigned to me | `(assigned_to = $current_user)` |
| `project` | My projects | `(project_id IN (SELECT id FROM projects WHERE pm_user_id = $current_user OR assigned_techs @> ARRAY[$current_user]))` |
| `tier` | Specific tier | `(tier_id = $scope_filter_value)` |
| `category` | Specific category | `(category_id = $scope_filter_value)` |
| `all` | All records | `(TRUE)` — no filter |

### 13.2 `role_data_scopes`

```sql
CREATE TABLE role_data_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,                        -- 'clients', 'invoices', etc.
  scope_id UUID NOT NULL REFERENCES data_scope_definitions(id),

  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),

  CONSTRAINT role_data_scopes_unique UNIQUE (role_id, resource)
);

CREATE INDEX idx_role_data_scopes_role ON role_data_scopes(role_id);
CREATE INDEX idx_role_data_scopes_resource ON role_data_scopes(resource);
```

**Sample rows (default role scopes):**

| role_id | resource | scope_id |
|---|---|---|
| admin | clients | all |
| project_manager | clients | team |
| sales_rep | clients | my |
| technician | clients | assigned |
| accounting | clients | all |
| project_manager | projects | team |
| project_manager | invoices | project |
| sales_rep | invoices | my |
| technician | appointments | my |

### 13.3 `user_data_scope_overrides`

```sql
CREATE TABLE user_data_scope_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  override_scope_id UUID NOT NULL REFERENCES data_scope_definitions(id),

  reason TEXT NOT NULL,
  is_temporary BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,

  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID NOT NULL REFERENCES users(id),
  revoked_at TIMESTAMPTZ,

  CONSTRAINT user_data_scope_overrides_unique_active UNIQUE (user_id, resource, revoked_at)
);

CREATE INDEX idx_user_data_scope_overrides_user ON user_data_scope_overrides(user_id) WHERE revoked_at IS NULL;
```

## 14. Group 4 — Audit table (append-only)

Per §0.4 #10: every permission change is logged immutably.

### 14.1 `permission_audit_log`

```sql
CREATE TABLE permission_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What changed
  event_type TEXT NOT NULL CHECK (event_type IN (
    'role_permission_granted',
    'role_permission_revoked',
    'role_permission_ui_state_changed',
    'user_override_granted',
    'user_override_revoked',
    'user_override_expired',
    'field_visibility_role_changed',
    'field_visibility_user_override_granted',
    'field_visibility_user_override_revoked',
    'data_scope_role_changed',
    'data_scope_user_override_granted',
    'data_scope_user_override_revoked',
    'role_created',
    'role_archived',
    'admin_exception_invoked',       -- e.g., clients:overrideSla executed
    'regulatory_block_overridden',   -- e.g., WSIB expired but admin overrode
    'permission_definition_deprecated'
  )),

  -- Who, when
  actor_user_id UUID REFERENCES users(id),       -- nullable if system event
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Target
  target_role_id UUID REFERENCES roles(id),
  target_user_id UUID REFERENCES users(id),
  target_permission_id UUID REFERENCES permission_definitions(id),
  target_flag_id UUID REFERENCES field_visibility_definitions(id),
  target_resource TEXT,
  target_entity_id UUID,                         -- e.g., the client for clients:overrideSla

  -- Change details
  before_state JSONB,                            -- snapshot before change
  after_state JSONB,                             -- snapshot after change
  reason TEXT,                                   -- mandatory for overrides
  notes TEXT,

  -- Append-only enforcement (Pass 6 elaborates)
  CONSTRAINT permission_audit_log_no_updates CHECK (TRUE) -- enforced by trigger blocking UPDATE/DELETE
);

CREATE INDEX idx_permission_audit_log_actor ON permission_audit_log(actor_user_id, occurred_at DESC);
CREATE INDEX idx_permission_audit_log_target_user ON permission_audit_log(target_user_id, occurred_at DESC);
CREATE INDEX idx_permission_audit_log_target_permission ON permission_audit_log(target_permission_id);
CREATE INDEX idx_permission_audit_log_event_type ON permission_audit_log(event_type, occurred_at DESC);
CREATE INDEX idx_permission_audit_log_occurred ON permission_audit_log(occurred_at DESC);

-- Triggers to prevent UPDATE and DELETE (enforces append-only)
CREATE OR REPLACE FUNCTION block_audit_modifications()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'permission_audit_log is append-only — UPDATE and DELETE blocked';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_audit_update
BEFORE UPDATE ON permission_audit_log
FOR EACH ROW EXECUTE FUNCTION block_audit_modifications();

CREATE TRIGGER prevent_audit_delete
BEFORE DELETE ON permission_audit_log
FOR EACH ROW EXECUTE FUNCTION block_audit_modifications();
```

**Why this shape:**
- `event_type` enumerates every audit-worthy event from across the design
- Multiple `target_*` columns allow polymorphic targeting (role, user, permission, flag, resource, specific entity)
- `before_state` + `after_state` as JSONB enable arbitrary state shapes
- `reason` is `NULL`-able at the column level but enforced as `NOT NULL` at insert time by application code for events that require reason capture
- UPDATE and DELETE blocked at trigger level — the table is provably append-only

## 15. Group 5 — Cross-cutting constraint tables

### 15.1 `separation_of_duties_constraints`

Per §0.4 #11. Stores mutually-exclusive action pairs.

```sql
CREATE TABLE separation_of_duties_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Constraint definition
  constraint_name TEXT NOT NULL UNIQUE,          -- e.g., 'ap_bill_creator_not_approver'
  description TEXT NOT NULL,

  -- The two actions
  action_a_id UUID NOT NULL REFERENCES permission_definitions(id),
  action_b_id UUID NOT NULL REFERENCES permission_definitions(id),

  -- Scope of mutual exclusion
  scope TEXT NOT NULL CHECK (scope IN (
    'same_record',      -- same user can't do both on same record (e.g., AP bill creator ≠ approver of same bill)
    'same_session',     -- not within the same session
    'cooldown'          -- minimum time gap between actions
  )),
  cooldown_minutes INTEGER,                      -- if scope = 'cooldown'

  -- Co-signing alternative
  allows_co_sign BOOLEAN NOT NULL DEFAULT FALSE, -- e.g., hardClose requires A + Acc; both record their action
  co_sign_role_codes TEXT[],                     -- e.g., ['admin', 'accounting'] for hard close

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_separation_of_duties_action_a ON separation_of_duties_constraints(action_a_id);
CREATE INDEX idx_separation_of_duties_action_b ON separation_of_duties_constraints(action_b_id);
```

**Seeded rows from the audit:**

| constraint_name | action_a | action_b | scope | allows_co_sign | co_sign_role_codes |
|---|---|---|---|---|---|
| `ap_bill_creator_not_approver` | `ap_bills:create` | `ap_bills:approve` | same_record | FALSE | NULL |
| `payment_run_creator_not_approver` | `ap_payment_runs:create` | `ap_payment_runs:approve` | same_record | FALSE | NULL |
| `gl_entry_creator_not_poster` | `gl_journal_entries:create:manual` | `gl_journal_entries:post` | same_record | FALSE | NULL |
| `hard_close_co_sign` | `accounting_periods:softClose` | `accounting_periods:hardClose` | same_record | TRUE | ARRAY['admin', 'accounting'] |

### 15.2 `regulatory_expiry_overrides`

Per §0.4 #12. Tracks the manual overrides of regulatory auto-blocks (WSIB expired, insurance expired, certification expired).

```sql
CREATE TABLE regulatory_expiry_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was overridden
  override_type TEXT NOT NULL CHECK (override_type IN (
    'vendor_insurance_expired',
    'vendor_wsib_expired',
    'contractor_insurance_expired',
    'contractor_wsib_expired',
    'contractor_certification_expired',
    'employee_certification_expired'
  )),
  target_entity_id UUID NOT NULL,                -- the vendor/contractor/employee being overridden

  -- The specific blocked action that was permitted
  blocked_action TEXT NOT NULL,                  -- e.g., 'purchase_orders:create', 'contractor_work_orders:create', 'appointments:create'
  permitted_target_entity_id UUID,               -- e.g., the specific PO/WO/appointment that was permitted

  -- Reason + audit
  override_reason TEXT NOT NULL,                 -- always captured
  emergency_justification TEXT,                  -- additional context for emergency cases

  -- Who, when
  overridden_by UUID NOT NULL REFERENCES users(id),
  overridden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Validity window
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,                       -- nullable; permanent override if not set
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  revocation_reason TEXT
);

CREATE INDEX idx_regulatory_expiry_overrides_target ON regulatory_expiry_overrides(target_entity_id, override_type);
CREATE INDEX idx_regulatory_expiry_overrides_active ON regulatory_expiry_overrides(target_entity_id, valid_until) WHERE revoked_at IS NULL;
```

**Sample rows:**

| override_type | target_entity_id | blocked_action | override_reason | overridden_by | valid_until |
|---|---|---|---|---|---|
| `contractor_wsib_expired` | contractor_xyz | `contractor_work_orders:create` | "Emergency dispatch; WSIB renewal in process; vendor copy received from CRA but Ontario portal not yet updated" | admin_user | 2026-05-19 (7 days) |
| `vendor_insurance_expired` | vendor_abc | `purchase_orders:create` | "Critical inventory order; renewal docs received today; will update tomorrow" | admin_user | 2026-05-13 (1 day) |

### 15.3 `geolocation_retention_policies`

Per §0.4 #13. Operator-configurable retention for geolocation data captured during mobile clock-in/out.

```sql
CREATE TABLE geolocation_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Policy identity (single row for tenant; future-proofed for multi-tenant)
  tenant_id UUID,                                -- nullable for v1 single-tenant; populated for Phase 2 multi-tenant

  -- Retention configuration
  retention_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Purge behavior
  purge_action TEXT NOT NULL DEFAULT 'coordinates_null' CHECK (purge_action IN (
    'coordinates_null',     -- set lat/lng to NULL; keep timestamp + appointment_id for audit
    'full_delete'           -- fully delete row (Phase 2 option; loss of audit trail)
  )),

  -- Audit retention (timestamp + appointment_id always retained per §0.4 #13)
  keep_timestamp_after_purge BOOLEAN NOT NULL DEFAULT TRUE,
  keep_appointment_id_after_purge BOOLEAN NOT NULL DEFAULT TRUE,

  -- Lifecycle
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL REFERENCES users(id)
);
```

## 16. Materialized view — `permission_resolution_view`

For ad-hoc admin queries (not the runtime hot path, which uses `effective_permissions_cache`). Useful for the permissions editor UI to show "current effective state" for any user.

```sql
CREATE MATERIALIZED VIEW permission_resolution_view AS
SELECT
  u.id AS user_id,
  u.email AS user_email,
  pd.id AS permission_id,
  pd.action_name AS action_name,
  pd.resource AS resource,
  pd.verb_category AS verb_category,
  pd.module_code AS module_code,

  -- Role default state
  COALESCE(rp.grant_state, 'default') AS role_default_state,
  COALESCE(rp.ui_state_override, pd.default_ui_state) AS role_ui_state,

  -- User override (if any)
  upo.override_state AS user_override_state,
  upo.reason AS user_override_reason,
  upo.expires_at AS user_override_expires_at,

  -- Resolved final state
  CASE
    WHEN upo.override_state = 'denied' THEN FALSE
    WHEN upo.override_state = 'granted' THEN TRUE
    WHEN rp.grant_state = 'denied' THEN FALSE
    WHEN rp.grant_state = 'granted' THEN TRUE
    WHEN rp.grant_state = 'default' THEN (pd.default_ui_state = 'interactive')
    ELSE FALSE
  END AS effective_is_granted,

  -- Resolution provenance
  CASE
    WHEN upo.override_state IS NOT NULL THEN 'user_override'
    WHEN rp.grant_state IS NOT NULL THEN 'role_default'
    ELSE 'permission_default'
  END AS resolution_source

FROM users u
CROSS JOIN permission_definitions pd
LEFT JOIN role_permissions rp ON rp.role_id = u.role_id AND rp.permission_id = pd.id
LEFT JOIN user_permission_overrides upo
  ON upo.user_id = u.id
  AND upo.permission_id = pd.id
  AND upo.revoked_at IS NULL
  AND (upo.expires_at IS NULL OR upo.expires_at > NOW())
WHERE u.is_active = TRUE AND pd.is_deprecated = FALSE;

CREATE UNIQUE INDEX idx_permission_resolution_view_user_perm ON permission_resolution_view(user_id, permission_id);

-- Refresh policy: nightly + on-demand via admin UI
-- Note: `effective_permissions_cache` is the runtime hot path; this view is for admin UI.
```

## 17. Migration order

Per §0.4 #1: production-safe migrations. Tables created in dependency order:

1. `permission_definitions` (no FKs)
2. `roles` (FK to itself via `cloned_from_role_id` — initially NULL)
3. `role_permissions` (FKs to roles + permission_definitions)
4. `user_permission_overrides` (FKs to users + permission_definitions)
5. `field_visibility_definitions` (no FKs)
6. `role_field_visibility` (FKs to roles + field_visibility_definitions)
7. `user_field_visibility_overrides` (FKs to users + field_visibility_definitions)
8. `data_scope_definitions` (no FKs)
9. `role_data_scopes` (FKs to roles + data_scope_definitions)
10. `user_data_scope_overrides` (FKs to users + data_scope_definitions)
11. `permission_audit_log` (FKs to users, roles, permission_definitions, field_visibility_definitions)
12. `separation_of_duties_constraints` (FKs to permission_definitions)
13. `regulatory_expiry_overrides` (FK to users)
14. `geolocation_retention_policies` (FK to users)
15. `effective_permissions_cache` (FKs to users + permission_definitions) — built last, populated by initial resolution run
16. `permission_resolution_view` (depends on all of the above)

Seeding scripts run after table creation:
1. Seed `permission_definitions` from Pass 1 catalog (~1260 rows)
2. Seed `field_visibility_definitions` from audit flags (~50 rows)
3. Seed `data_scope_definitions` from scope qualifier taxonomy (7 rows)
4. Seed `roles` with system roles (11 rows: 7 base + 4 specialized)
5. Seed `role_permissions` with default grants per role (≈9k rows)
6. Seed `role_field_visibility` with default visibility per role
7. Seed `role_data_scopes` with default scopes per role
8. Seed `separation_of_duties_constraints` from §0.4 #11 catalog
9. Seed `geolocation_retention_policies` with default 30-day retention

Migration 11 (Pass 11) covers production rollout details.

## 18. Open questions (Pass 2)

1. **Cache TTL.** Should `effective_permissions_cache` have a hard TTL (e.g., 1 hour) in addition to invalidation triggers? Decision: NO TTL at v1. Triggers handle invalidation; TTL would cause flapping. Phase 2: revisit if cache staleness becomes a problem.

2. **Resource-level vs entity-level scope.** Current design has scope per `(role, resource)`. Should we support per-record scope overrides (e.g., "user X gets `team` scope on clients EXCEPT for specific high-value client where they get `my`")? Decision: NO at v1; would explode override surface area. Phase 2 consideration if needed.

3. **Materialized view refresh cadence.** `permission_resolution_view` — nightly OK? Decision: nightly + on-demand refresh via permissions editor (auto-triggers refresh on save).

4. **Audit log retention.** Should `permission_audit_log` rows ever be archived? Decision: keep permanently at v1 (regulatory compliance default). Phase 2: operator-configurable retention with cold-storage archival.

5. **`is_temporary` cleanup.** Expired overrides — auto-revoke at expiration, or leave the row and let resolution treat expired as inactive? Decision: leave the row (auditability); resolution algorithm filters by `expires_at`. Nightly job updates `effective_permissions_cache` for expired entries.

6. **PostgreSQL RLS integration.** Should data scope filters be enforced via PostgreSQL Row-Level Security policies or application-layer query construction? Decision: BOTH. RLS as defense-in-depth (last line); application-layer for permission-aware UI rendering. Pass 3 (resolution algorithm) details the integration.

---

═══════════════════════════════════════════════════════════════════
# 19. What's next (Pass 3 preview)
═══════════════════════════════════════════════════════════════════

**Pass 3: Permission resolution algorithm.**

Given the schema from Pass 2, Pass 3 defines the runtime algorithm that answers:

> "Can user X do action Y on entity Z (where applicable)?"

In <5ms even at scale.

Inputs:
- `user_id`
- `action_name` (e.g., `invoices:send`)
- Optional: `target_entity_id` (for entity-level checks like separation of duties)
- Optional: `context` (current entity state, time, location for geolocation-dependent actions)

Output:
- `is_granted: boolean`
- `ui_state: 'hidden' | 'disabled' | 'interactive'`
- `resolution_source: string` (for debug + audit)
- `reason_if_denied: string`

Algorithm phases:
1. Cache lookup in `effective_permissions_cache` (hot path; <1ms)
2. If cache miss, resolve from base tables:
   - Look up role default in `role_permissions`
   - Apply user override from `user_permission_overrides` (if active)
   - Resolve UI state
3. Apply cross-cutting constraints:
   - Separation of duties check against `separation_of_duties_constraints` + history
   - Regulatory expiry check against `regulatory_expiry_overrides` + source data freshness
4. Apply data scope filter to resulting query
5. Apply field visibility to response (Pass 4 detail)
6. Cache result in `effective_permissions_cache`
7. Log to `permission_audit_log` if `is_sensitive` or `is_admin_exception` flagged

Plus the equivalent algorithm for:
- Field visibility resolution
- Data scope resolution
- Compound resolution (action grant + scope + visibility together)

Pass 3 will produce v0.3 of this design doc.

---

**End of v0.2.** Pass 2 (Database Schema) complete. 14 tables specified across 5 groups, plus 1 materialized view. Schema covers: core permissions (action catalog + role grants + per-user overrides + denormalized cache), field visibility (50+ `visibility.*` flags + per-role + per-user), data scopes (7 scope qualifiers + per-role + per-user), audit (append-only with UPDATE/DELETE triggers), and cross-cutting constraints (separation of duties, regulatory expiry overrides, geolocation retention). Migration order specified for production-safe rollout. Six open questions resolved.
