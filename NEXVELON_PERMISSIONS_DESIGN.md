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
> **Status:** v0.3 — Passes 1-3 complete. Pending: Pass 4 (Field
> visibility engine), Pass 5 (Status surface bindings), Pass 6
> (Append-only audit), Pass 7 (Request-admin-access workflow),
> Pass 8 (Permissions editor UI), Pass 9 (Effective-permissions
> caching strategy), Pass 10 (Cross-cutting enforcement patterns),
> Pass 11 (Migration plan).
>
> Pass 1 (Action Vocabulary Catalog) condensed to summary §1-§8;
> full Pass 1 content preserved at commit `9008fad`.
> Pass 2 (Database Schema) condensed to summary §9-§9.7;
> full Pass 2 content preserved at commit `1bafbd4`.
> Pass 3 (Resolution Algorithm) full content begins at §10.

---

## 0. How to use this document

### 0.1 Purpose

Design specification for the Nexvelon permissions runtime. Synthesizes everything from the 13-module feature audit into the actual architecture.

### 0.2 Pass overview

| Pass | Scope | Status |
|---|---|---|
| 1 | Action vocabulary catalog | ✅ COMPLETE (full at commit `9008fad`; condensed below §1-§8) |
| 2 | Database schema | ✅ COMPLETE (full at commit `1bafbd4`; condensed below §9) |
| 3 | Permission resolution algorithm | ✅ COMPLETE (this version) |
| 4 | Field-level visibility engine | PENDING |
| 5 | Status surface binding layer | PENDING |
| 6 | Append-only audit pattern | PENDING |
| 7 | Request-admin-access workflow | PENDING |
| 8 | Permissions editor UI | PENDING |
| 9 | Effective-permissions caching strategy | PENDING |
| 10 | Cross-cutting enforcement patterns | PENDING |
| 11 | Migration plan | PENDING |

### 0.3 Role abbreviations

**A** Admin, **PM** Project Manager, **SR** Sales Rep, **Tech** Technician, **Sub** Subcontractor (portal), **Acc** Accounting, **VO** View Only. Plus **Dispatcher** (M12), **Bookkeeper** (M11), **HR-role**, **Executive** (M13). Operators can create unlimited custom roles via the M2 framework.

---

═══════════════════════════════════════════════════════════════════
# Part I — Pass 1 (Action Vocabulary Catalog) — condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 1 content preserved at commit `9008fad`. Below is the condensed reference.*

## 1. Naming convention

**Format:** `resource:verb[:qualifier]`

- **resource** — plural noun, lowercase, snake_case if multi-word (matches database table name).
- **verb** — single verb in camelCase from a fixed verb taxonomy.
- **qualifier** — optional, drawn from a fixed qualifier taxonomy.

## 2. Verb taxonomy (8 categories, fixed verb set)

view / create / edit / state-transition / configuration / communication / admin / workflow verbs. Full enumeration at commit `9008fad`.

## 3. Qualifier taxonomy (4 categories, fixed qualifier set)

scope (my/team/assigned/project/tier/category/all) / state (draft/pending/approved/sent/paid/void) / modal (read/write/execute/delete/manual/auto) / field-section (banking/labor_rates/profit/internal_notes/executive/payroll/cost_rate/geolocation/worker_manifest/tax_forms/wsib/full_card_number).

## 4. Resource taxonomy

140+ resources across 13 modules, mapped 1:1 to database tables. Full enumeration at commit `9008fad`.

## 5. Action grouping for permissions editor UI

**4-tier hierarchy:** Module → Resource → Category → Individual action.

**Plus 6 cross-cut tabs:** Actions / Field Visibility / Data Scopes / Overrides / Custom Roles / Audit Log.

**Three UI states per §0.4 #2:** hidden / disabled / interactive.

## 6. Cross-references

Action dependencies, mutually exclusive actions per §0.4 #11, action chains (multi-step workflows). Full enumeration at commit `9008fad`.

## 7. Special-case action treatment

Public actions (signed URL), Admin exceptions (13 catalogued), system-generated actions (10+ catalogued), append-only actions (9 resources per §0.4 #10). Full enumeration at commit `9008fad`.

## 8. Six open questions resolved in Pass 1

Compound verbs vs qualifier form (both forms accepted); per-record vs per-class actions (capability at class, enforcement runtime per-record); role inheritance (NO at v1); per-tenant custom actions (NO at v1); action versioning (new actions default denied); action deprecation (mark; functional 1 release; clean second; audit reads preserved).

---

═══════════════════════════════════════════════════════════════════
# Part II — Pass 2 (Database Schema) — condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 2 content preserved at commit `1bafbd4`. Below is the condensed reference.*

## 9. Schema overview — 14 tables across 5 groups + 1 materialized view

### 9.1 Group 1 — Core permission tables (5)

- `permission_definitions` — ~1260-row action catalog (one row per action; columns: action_name UNIQUE, resource, verb, qualifier, verb_category, qualifier_category, module_code, ui_category, description, is_sensitive, is_high_impact, is_admin_exception, is_system_generated, is_public_action, requires_reason_capture, is_append_only_target, is_deprecated, default_ui_state, lifecycle timestamps)
- `roles` — role definitions (11 system + custom; flat model with cloned_from_role_id)
- `role_permissions` — junction with grant_state (granted/denied/default) + ui_state_override (hidden/disabled/interactive)
- `user_permission_overrides` — per-user with mandatory reason, is_temporary + expires_at, soft-delete via revoked_at
- `effective_permissions_cache` — denormalized for <1ms runtime lookups; permission_action_name + permission_id; resolution_source field; resolved_ui_state; expires_at for temporary overrides; UNIQUE on (user_id, permission_id); INDEX on (user_id, permission_action_name) for hot-path lookup

### 9.2 Group 2 — Field visibility tables (3)

- `field_visibility_definitions` — 50+ `visibility.*` flags (flag_name UNIQUE, resource, field_section, sensitivity_level, is_never_granted, requires_audit_on_read, retention_days)
- `role_field_visibility` — per-role with 3 states: visible/masked/hidden
- `user_field_visibility_overrides` — per-user overrides

### 9.3 Group 3 — Data scope tables (3, orthogonal to grants)

- `data_scope_definitions` — 7 scope qualifiers with SQL filter templates (my/team/assigned/project/tier/category/all)
- `role_data_scopes` — per-role per-resource
- `user_data_scope_overrides`

### 9.4 Group 4 — Audit (1 table, append-only)

- `permission_audit_log` — UPDATE/DELETE blocked at PostgreSQL trigger level; 18 enumerated event_types; polymorphic target columns; JSONB before/after state snapshots

### 9.5 Group 5 — Cross-cutting constraints (3 tables)

- `separation_of_duties_constraints` — §0.4 #11; action_a_id + action_b_id; scope (same_record/same_session/cooldown); allows_co_sign + co_sign_role_codes
- `regulatory_expiry_overrides` — §0.4 #12; reason capture + emergency justification + validity window + revocation tracking
- `geolocation_retention_policies` — §0.4 #13; default 30 days; purge_action (coordinates_null default; full_delete Phase 2 option)

### 9.6 Plus materialized view

- `permission_resolution_view` — admin UI view of current effective state per user; runtime hot path uses effective_permissions_cache instead

### 9.7 Three architectural decisions locked in Pass 2

1. One row per action in permission_definitions
2. Trigger-invalidated cache strategy (no TTL)
3. Orthogonal data scopes (separate from grants)

Plus six Pass 2 open questions resolved (cache TTL: NO; per-record scope overrides: NO; materialized view refresh: nightly + on-demand; audit retention: permanent at v1; temporary override cleanup: leave row; RLS vs application-layer: BOTH).

16-step migration order specified. Seeding scripts cover ~1260 permission_definitions + ~50 field visibility flags + 7 scope definitions + 11 roles + ~9k role_permissions.

---

═══════════════════════════════════════════════════════════════════
# Part III — Pass 3 (Resolution Algorithm) — FULL CONTENT
═══════════════════════════════════════════════════════════════════

## 10. Overview

Three intertwined algorithms, used in different combinations per request type:

| Algorithm | Inputs | Outputs | Used for |
|---|---|---|---|
| **A1** — Action grant resolution | `user_id`, `action_name`, optional `target_entity_id`, optional `context` | `is_granted`, `ui_state`, `resolution_source`, `reason_if_denied` | UI button rendering; API authorization gate |
| **A2** — Data scope resolution | `user_id`, `resource` | `sql_filter_clause` (with bind parameters) | WHERE-clause construction on every list/detail query |
| **A3** — Field visibility resolution | `user_id`, `resource`, `field_section` | `visible / masked / hidden` | Per-field serialization in API responses; per-field UI rendering |

A typical request flow uses all three:

```
GET /api/clients (list endpoint)
  ↓
  A1: is_granted("clients:viewList") → if denied, 403
  ↓
  A2: scope_filter for "clients" → "(created_by = $u OR owner_id = $u)" for SR-with-my-scope
  ↓
  Database query: SELECT * FROM clients WHERE [scope_filter] LIMIT 50
  ↓
  For each row: A3 → mask/hide field sections per role
  ↓
  Return JSON
```

## 11. Algorithm A1 — Action grant resolution

### 11.1 Inputs and outputs

```
Function: resolve_action_grant(user_id, action_name, target_entity_id?, context?)

Returns:
  {
    is_granted: boolean,
    ui_state: 'hidden' | 'disabled' | 'interactive',
    resolution_source: string,
    reason_if_denied: string | null,
    cache_hit: boolean,           // diagnostic
    resolution_time_ms: number    // diagnostic
  }

Context (optional, depending on action):
  {
    current_entity_state?: string,    // for state-gated actions
    current_time?: timestamp,
    user_location?: { lat, lng }
  }
```

### 11.2 Seven-phase algorithm

```
PHASE 1: Cache lookup
  Query effective_permissions_cache
    WHERE user_id = $user_id
      AND permission_action_name = $action_name
  
  If hit AND (expires_at IS NULL OR expires_at > NOW()):
    PROCEED TO PHASE 3 with is_granted, ui_state from cache
  Else:
    Cache miss; proceed to PHASE 2

PHASE 2: Base table resolution (cache miss path)
  1. Look up permission_definitions row for action_name
     If not found: return { is_granted: false, ui_state: 'hidden', resolution_source: 'permission_undefined' }
     If is_deprecated: return { is_granted: false, ui_state: 'hidden', resolution_source: 'permission_deprecated' }
  
  2. Look up user's role_id from users table
  
  3. Look up role_permissions row for (role_id, permission_id)
     - If row exists with grant_state = 'granted': base_grant = TRUE
     - If row exists with grant_state = 'denied': base_grant = FALSE
     - If row exists with grant_state = 'default' OR no row: base_grant = (permission_definitions.default_ui_state = 'interactive')
     - Track resolution_source = 'role_default'
  
  4. Look up active user_permission_overrides for (user_id, permission_id)
     WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
     - If override_state = 'granted': final_grant = TRUE, resolution_source = 'user_override_grant'
     - If override_state = 'denied': final_grant = FALSE, resolution_source = 'user_override_deny'
     - If no active override: final_grant = base_grant
  
  5. Resolve UI state:
     - Start with permission_definitions.default_ui_state
     - Override with role_permissions.ui_state_override if set
     - If final_grant = FALSE: ui_state = 'hidden' (unless explicitly set to 'disabled' by override)
     - If final_grant = TRUE: ui_state = role_permissions.ui_state_override OR permission_definitions.default_ui_state OR 'interactive'
  
  6. Write to effective_permissions_cache (lazy fill)

PHASE 3: Cross-cutting constraint checks
  Only run if final_grant = TRUE (constraints can only deny, not grant)
  
  3.1 Separation of duties check
    For each row in separation_of_duties_constraints WHERE (action_a_id = $perm OR action_b_id = $perm):
      - If scope = 'same_record' AND target_entity_id is provided:
        Query history table for the OPPOSITE action on the SAME target_entity_id BY THE SAME user_id
        If found AND constraint does not allow_co_sign:
          final_grant = FALSE
          resolution_source = 'separation_of_duties_violation:' + constraint_name
          reason_if_denied = "Cannot perform this action; you previously performed [other_action] on this record per separation of duties (§0.4 #11)"
      
      - If scope = 'cooldown' AND target_entity_id provided:
        Query history for opposite action within cooldown_minutes window
        Apply similar logic
  
  3.2 Regulatory expiry check (only for actions in §0.4 #12 list)
    If action_name in ['purchase_orders:create', 'contractor_work_orders:create', 'appointments:create', ...]:
      Determine target's regulatory entity (vendor / contractor / employee)
      Query their current insurance / WSIB / certification expiry
      If expired:
        Query regulatory_expiry_overrides for active override
        If no active override:
          final_grant = FALSE
          resolution_source = 'regulatory_expiry_block'
          reason_if_denied = "[Vendor/Contractor/Worker] [insurance/WSIB/certification] expired on [date]; cannot proceed (§0.4 #12). Admin can override with reason capture."

PHASE 4: Audit logging
  If permission_definitions.is_sensitive OR permission_definitions.is_admin_exception:
    Insert row to permission_audit_log
      event_type = 'permission_check_sensitive' OR 'admin_exception_invoked'
      actor_user_id = user_id
      target_permission_id = perm_id
      target_entity_id = target_entity_id
      before_state = NULL
      after_state = { is_granted, resolution_source, reason_if_denied }
      occurred_at = NOW()

PHASE 5: Return resolved result

PHASE 6: (Skipped — merged into Phase 1-5)

PHASE 7: (Skipped — merged into Phase 1-5)
```

### 11.3 Performance characteristics

- **Cache hit path (Phase 1 only):** <1ms (single indexed SELECT)
- **Cache miss path (Phases 1-2):** 2-3ms (3-4 indexed SELECTs + 1 INSERT to cache)
- **With cross-cutting constraint checks (Phases 1-3):** 3-5ms depending on number of constraints applicable
- **With audit logging (Phases 1-4):** +1-2ms for the INSERT (async fire-and-forget in build phase)

Cache hit rate target: >95% under normal load. Cache invalidation events are rare (admin operations); reads dominate.

### 11.4 Cache invalidation triggers (per Pass 2 §9.1)

When any of these events occur, affected `effective_permissions_cache` rows are deleted (lazy refill on next read):

| Event | Invalidates |
|---|---|
| INSERT/UPDATE/DELETE on `role_permissions` for permission P | All rows in cache where `permission_id = P` |
| INSERT/UPDATE/DELETE on `user_permission_overrides` for (user U, permission P) | Cache row for (U, P) |
| UPDATE on `users.role_id` for user U | All rows for user U |
| UPDATE on `permission_definitions.is_deprecated` for permission P | All rows where permission_id = P |
| Daily cron job | Rows where `expires_at < NOW()` (cleans expired temporary overrides) |

PostgreSQL triggers handle 1-4. Cron job handles 5. Detailed trigger SQL in Pass 9 (caching strategy).

### 11.5 Sample resolution traces

**Trace 1: SR user attempts `clients:viewList` (granted normally)**

```
Input: { user_id: sr_user_1, action_name: "clients:viewList" }

PHASE 1: Cache lookup
  Hit. Row: (sr_user_1, "clients:viewList", is_granted=TRUE, ui_state=interactive, source=role_default, expires_at=NULL)
  PROCEED TO PHASE 3 (cross-cutting checks)

PHASE 3.1: Separation of duties
  No constraints for clients:viewList → skip

PHASE 3.2: Regulatory expiry
  clients:viewList not in §0.4 #12 list → skip

PHASE 4: Audit
  permission_definitions.is_sensitive = FALSE → skip

PHASE 5: Return
  { is_granted: TRUE, ui_state: 'interactive', resolution_source: 'role_default', reason_if_denied: null, cache_hit: TRUE, resolution_time_ms: 0.8 }
```

**Trace 2: PM attempts `ap_bills:approve` on bill they created (denied by separation of duties)**

```
Input: { user_id: pm_user_1, action_name: "ap_bills:approve", target_entity_id: ap_bill_42 }

PHASE 1: Cache lookup
  Hit. (pm_user_1, "ap_bills:approve", is_granted=TRUE, ui_state=interactive, source=role_default)
  PROCEED TO PHASE 3

PHASE 3.1: Separation of duties
  Constraint found: ap_bill_creator_not_approver
  Query: SELECT id FROM ap_bills WHERE id = ap_bill_42 AND created_by = pm_user_1
  Result: row found (pm_user_1 created ap_bill_42)
  Constraint allows_co_sign = FALSE
  
  → final_grant = FALSE
  → resolution_source = 'separation_of_duties_violation:ap_bill_creator_not_approver'
  → reason_if_denied = "Cannot approve this AP bill; you previously created it. Per separation of duties (§0.4 #11), the same user cannot both create and approve an AP bill."

PHASE 5: Return
  { is_granted: FALSE, ui_state: 'disabled' (visible but greyed with hover tooltip), resolution_source: 'separation_of_duties_violation:ap_bill_creator_not_approver', reason_if_denied: "Cannot approve...", cache_hit: TRUE, resolution_time_ms: 1.4 }
```

**Trace 3: PM attempts `contractor_work_orders:create` with contractor whose WSIB just expired**

```
Input: { user_id: pm_user_1, action_name: "contractor_work_orders:create", target_entity_id: contractor_xyz }

PHASE 1: Cache lookup → hit, granted by role default
PHASE 3.1: No separation of duties constraint
PHASE 3.2: Regulatory expiry check
  contractor_work_orders:create IS in §0.4 #12 list
  Query: SELECT wsib_clearance_expiry FROM contractors WHERE id = contractor_xyz
  Result: 2026-04-15 (already expired as of 2026-05-12)
  Query: SELECT id FROM regulatory_expiry_overrides 
         WHERE target_entity_id = contractor_xyz 
           AND override_type = 'contractor_wsib_expired' 
           AND blocked_action = 'contractor_work_orders:create'
           AND valid_until > NOW() 
           AND revoked_at IS NULL
  Result: no active override
  
  → final_grant = FALSE
  → resolution_source = 'regulatory_expiry_block'
  → reason_if_denied = "Cannot create work order; Contractor XYZ's WSIB clearance expired 2026-04-15. Admin can override with reason capture. (§0.4 #12)"

PHASE 5: Return
  { is_granted: FALSE, ui_state: 'disabled', resolution_source: 'regulatory_expiry_block', reason_if_denied: "Cannot create work order; Contractor XYZ's WSIB clearance expired 2026-04-15...", ... }
```

**Trace 4: Tech attempts `payments:view:full_card_number` (never granted to anyone, PCI compliance)**

```
Input: { user_id: tech_user_1, action_name: "payments:view:full_card_number" }

PHASE 1: Cache lookup → hit, is_granted=FALSE (permission_definitions row has is_never_granted=TRUE in field_visibility_definitions; corresponding action permission denied by default for all roles)
PHASE 5: Return
  { is_granted: FALSE, ui_state: 'hidden', resolution_source: 'pci_compliance_locked', reason_if_denied: "Full credit card numbers cannot be viewed by any user (PCI compliance). Last 4 digits only are visible via payments:view:bank_account_info_masked", ... }
```

## 12. Algorithm A2 — Data scope resolution

### 12.1 Inputs and outputs

```
Function: resolve_data_scope(user_id, resource)

Returns:
  {
    scope_code: 'my' | 'team' | 'assigned' | 'project' | 'tier' | 'category' | 'all',
    sql_filter_clause: string,           // e.g., "(created_by = :current_user OR owner_id = :current_user)"
    bind_parameters: object,             // { current_user: user_id, scope_filter_value: null }
    resolution_source: 'role_default' | 'user_override',
    cache_hit: boolean
  }
```

### 12.2 Algorithm

```
PHASE 1: Cache lookup
  Query effective_data_scope_cache (built lazily; see Pass 9)
    WHERE user_id = $user_id AND resource = $resource
  If hit: return cached scope_code + sql_filter_clause
  Else: PHASE 2

PHASE 2: Base table resolution
  1. Look up user's role_id
  2. Query role_data_scopes for (role_id, resource)
     If found: base_scope_id = row.scope_id
     If not found: base_scope_id = scope corresponding to 'my' (most restrictive default)
  3. Query user_data_scope_overrides for (user_id, resource)
     WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
     If found: final_scope_id = override.override_scope_id, resolution_source = 'user_override'
     Else: final_scope_id = base_scope_id, resolution_source = 'role_default'
  4. Look up data_scope_definitions for final_scope_id → get scope_code + filter_sql_template
  5. Substitute $current_user with user_id in template → produce sql_filter_clause
  6. Cache result

PHASE 3: Return
```

### 12.3 Filter SQL templates (from Pass 2 §9.3)

| scope_code | filter_sql_template |
|---|---|
| `my` | `(created_by = :current_user OR owner_id = :current_user)` |
| `team` | `(team_id IN (SELECT team_id FROM employee_teams WHERE user_id = :current_user))` |
| `assigned` | `(assigned_to = :current_user)` |
| `project` | `(project_id IN (SELECT id FROM projects WHERE pm_user_id = :current_user OR :current_user = ANY(assigned_techs)))` |
| `tier` | `(tier_id = :scope_filter_value)` |
| `category` | `(category_id = :scope_filter_value)` |
| `all` | `(TRUE)` |

### 12.4 Application layer integration

Application query builder takes the scope filter and combines with the user's query:

```typescript
// Pseudocode for build phase reference
const scope = await resolveDataScope(userId, "clients");
const userQuery = "WHERE archived_at IS NULL ORDER BY name";
const finalQuery = `SELECT * FROM clients WHERE ${scope.sql_filter_clause} AND ${userQuery}`;
// Execute with bind: { current_user: userId, ...scope.bind_parameters }
```

### 12.5 RLS policy integration (defense-in-depth)

Per Pass 2 §9.7 decision 6: scope filters enforced at BOTH application and PostgreSQL RLS levels.

PostgreSQL RLS policies (generated from scope filter templates):

```sql
CREATE POLICY clients_user_scope_policy ON clients
  FOR SELECT
  USING (
    -- Inject the appropriate scope filter based on current_user's role+overrides
    current_user_has_scope_all('clients')
    OR (
      current_user_has_scope_team('clients') 
      AND team_id IN (SELECT team_id FROM employee_teams WHERE user_id = current_setting('app.current_user_id')::uuid)
    )
    OR (
      current_user_has_scope_my('clients') 
      AND (created_by = current_setting('app.current_user_id')::uuid OR owner_id = current_setting('app.current_user_id')::uuid)
    )
    -- ... other scope branches
  );
```

`current_user_has_scope_*` are helper SQL functions that query `effective_data_scope_cache` for the current user.

The application sets `app.current_user_id` setting at the start of every connection via Supabase's session context (or equivalent in self-hosted Postgres).

This means: even if application code forgets to apply scope filter, the database enforces it. Defense-in-depth.

## 13. Algorithm A3 — Field visibility resolution

### 13.1 Inputs and outputs

```
Function: resolve_field_visibility(user_id, resource, field_section)

Returns:
  {
    visibility_state: 'visible' | 'masked' | 'hidden',
    requires_audit_on_read: boolean,   // if banking, etc.
    resolution_source: string,
    cache_hit: boolean
  }
```

### 13.2 Algorithm

```
PHASE 1: Cache lookup (effective_field_visibility_cache, built lazily)
  Query for (user_id, resource, field_section)
  If hit: return cached state
  Else: PHASE 2

PHASE 2: Base table resolution
  1. Construct flag_name from resource + field_section: e.g., "visibility.clients.banking"
  2. Query field_visibility_definitions for flag_name
     If is_never_granted = TRUE: return { visibility_state: 'hidden' or 'masked' depending on resource convention, resolution_source: 'pci_compliance_locked' }
  3. Get user's role_id
  4. Query role_field_visibility for (role_id, flag_id) → base_state
     If no row: default to 'hidden' (most restrictive)
  5. Query user_field_visibility_overrides for active override
     If found: final_state = override.override_visibility_state, source = 'user_override'
     Else: final_state = base_state, source = 'role_default'
  6. Get requires_audit_on_read from field_visibility_definitions
  7. Cache and return

PHASE 3: Audit on read (if requires_audit_on_read AND final_state = 'visible')
  Insert row to permission_audit_log
    event_type = 'field_read_with_audit'
    target_resource = resource
    target_field = field_section
    actor_user_id = user_id
```

### 13.3 Three visibility states

| State | Behavior |
|---|---|
| **visible** | Field fully rendered in API response; UI shows actual value |
| **masked** | Field rendered with masked value (`••• ••• 1234` for card; `***@example.com` for email). PCI compliance support — `payments.fullCardNumber` is `is_never_granted=TRUE` but the masked-form path remains usable for last-4 display. |
| **hidden** | Field completely absent from API response; UI doesn't render the field at all |

### 13.4 Application layer integration

Serialization pipeline applies field visibility to each record:

```typescript
// Pseudocode
const record = await db.query("SELECT * FROM clients WHERE id = $1", [clientId]);
const sections = ['banking', 'internal_notes', 'discount_reason'];

for (const section of sections) {
  const visibility = await resolveFieldVisibility(userId, 'clients', section);
  if (visibility.state === 'hidden') {
    deleteFieldsFromSection(record, section);
  } else if (visibility.state === 'masked') {
    maskFieldsInSection(record, section); // e.g., banking_account_number → '••••5678'
  }
  if (visibility.requires_audit_on_read && visibility.state === 'visible') {
    auditFieldRead(userId, 'clients', section, record.id); // async
  }
}
```

## 14. Compound resolution — request flow walkthrough

The three algorithms compose to handle a typical request.

### 14.1 GET /api/clients (list endpoint)

```
1. Authentication middleware
   - Validates JWT/session token
   - Sets context: user_id

2. Action grant check (A1)
   resolve_action_grant(user_id, "clients:viewList")
   - If is_granted = FALSE: return 403 with reason_if_denied
   - If is_granted = TRUE but ui_state = 'disabled': proceed (API allows; UI may render differently)

3. Data scope filter (A2)
   resolve_data_scope(user_id, "clients")
   - Get scope.sql_filter_clause: "(created_by = $u OR owner_id = $u)" for SR

4. Query construction
   final_query = `
     SELECT * FROM clients 
     WHERE ${scope.sql_filter_clause}
     AND archived_at IS NULL
     ORDER BY name
     LIMIT 50
   `
   results = db.query(final_query, { current_user: user_id })

5. Field visibility (A3) per record
   For each result row:
     for section in ['banking', 'internal_notes', 'discount_reason']:
       visibility = resolve_field_visibility(user_id, "clients", section)
       Apply mask/hide per visibility.state
       If requires_audit_on_read and visible: log read

6. Return JSON
```

### 14.2 POST /api/invoices/{id}/approve (action endpoint)

```
1. Authentication

2. Action grant check (A1) with target_entity_id
   resolve_action_grant(user_id, "invoices:approve", target_entity_id=invoice_id)
   - Phase 3.1 runs: check separation of duties (creator ≠ approver)
   - If denied: return 403

3. Execute action
   UPDATE invoices SET status='Approved', approved_by=$u, approved_at=NOW() WHERE id=$1

4. Post-action audit
   INSERT INTO permission_audit_log (
     event_type='action_executed',
     actor_user_id=$u,
     target_permission_id=$invoices_approve_perm_id,
     target_entity_id=$invoice_id,
     after_state={status: 'Approved'}
   )

5. Trigger downstream events
   - emit event 'invoice.approved'
   - downstream: invalidate cache, send notification, etc.
```

### 14.3 GET /api/scheduling/calendar (heavy permission-aware endpoint)

```
1. Authentication

2. Action grant check (A1)
   resolve_action_grant(user_id, "scheduling:viewCalendar")
   - If denied: return 403

3. Data scope filter for appointments (A2)
   scope = resolve_data_scope(user_id, "appointments")
   - For Tech: scope = 'my' → filter by created_by or assigned_to
   - For PM: scope = 'team' → filter by team_id
   - For Dispatcher: scope = 'all'

4. Data scope filter for resources (employees, contractors, vehicles)
   - Tech may only see own resources in calendar
   - PM sees team
   - Dispatcher sees all

5. Construct query joining appointments + appointment_resources + resources with all scope filters

6. For each appointment:
   - Apply field visibility (A3) for sensitive fields like cost_rate, geolocation_history

7. Compute SLA status indicators
   - For each appointment, check current SLA position
   - Return visual indicator codes (red/orange/yellow/green)

8. Return enriched JSON
```

## 15. Compound resolution edge cases

### 15.1 Granted by user_override but blocked by regulatory expiry

User has `contractor_work_orders:create` granted via user_override (overrode role default). But contractor's WSIB is expired.

Resolution:
- Phase 2: final_grant = TRUE (user_override grants it)
- Phase 3.2: WSIB expired AND no override → final_grant = FALSE, source = 'regulatory_expiry_block'

**User override does NOT bypass regulatory expiry.** §0.4 #12 supersedes user-level overrides. Only `regulatory_expiry_overrides` entries (which themselves require A approval + reason) bypass.

### 15.2 Co-sign action — hard close

User attempts `accounting_periods:hardClose` (the co-sign action).

Resolution:
- Phase 2: final_grant = TRUE for Admin
- Phase 3.1: separation of duties constraint `hard_close_co_sign` found
  - allows_co_sign = TRUE
  - co_sign_role_codes = ['admin', 'accounting']
  - Check: has the OTHER role already initiated softClose for this period?
    - Query accounting_periods WHERE id = $period AND soft_closed_at IS NOT NULL AND soft_closed_by_role IN ['admin', 'accounting']
    - If NO: deny — softClose must come first
    - If YES and soft_closed_by user has a DIFFERENT role: allow (co-sign satisfied)
    - If YES and soft_closed_by user has SAME role: deny — second role must co-sign

### 15.3 Public action (signed URL, no role)

`quote_portal_access:acceptQuote` — customer accesses via signed URL, no authentication.

Resolution:
- Algorithm A1 is NOT called (no user_id)
- Separate "signed URL validator" runs:
  - Verify token signature
  - Check expiration
  - Check scope (single-quote-id)
  - If valid: execute action under "anonymous_customer" identity
  - Audit captures: token_id, source_ip, timestamp, action

### 15.4 System-generated action

`gl_journal_entries:create:auto` — system creates GL entry on M9 invoice send event.

Resolution:
- Algorithm A1 is NOT called for user-level checks
- Executes under "system" identity
- Audit captures: triggering_event ('invoice.sent'), source_entity_id, action, NULL actor_user_id

### 15.5 Temporary override mid-resolution

User has temporary user_permission_override granted with expires_at = NOW() + 1 hour. After 1 hour:

- Phase 1: cache row's expires_at < NOW() → treated as cache miss
- Phase 2: query active overrides filters out the expired one → falls back to role_default
- Cache row replaced with new resolved state
- Audit logged: event_type='user_override_expired'

## 16. Resolution algorithm performance budget

Target p99 for compound resolution on a typical list endpoint:

| Phase | Budget |
|---|---|
| Authentication | <2ms |
| A1 (action grant) | <1ms cache hit; <3ms miss |
| A2 (data scope) | <1ms cache hit |
| Database query with scope filter | <20ms (depends on data size) |
| A3 (field visibility) per record | <0.5ms cache hit; per section per record |
| Total for 50-record list | <50ms p99 |

Detail endpoint (single record): <15ms p99.

Action endpoint (POST with constraint checks): <30ms p99.

### 16.1 Optimization techniques

**Bulk resolution.** When fetching 50 records, don't run A3 individually for each record's banking section. Resolve once per (user, resource, field_section) and apply to all records.

**Cache warm-up.** On user login, prefetch cache rows for the user's expected actions (their dashboard widgets' required actions). Reduces first-render miss penalty.

**Stale-while-revalidate for non-critical reads.** Some checks (like dashboard widget visibility) can return stale cache entries (<5 minutes old) while async revalidation occurs. Not used for sensitive actions or admin exceptions.

**RLS bypass for system queries.** Auto-posted GL entries, cron jobs, internal services use a privileged context that bypasses RLS. Audit captures every system query.

## 17. Failure modes and error handling

| Failure | Behavior |
|---|---|
| Cache table unavailable (e.g., during migration) | Fall back to base table resolution (slower but correct) |
| Base table query timeout | Return is_granted=FALSE with resolution_source='resolution_timeout'; log to error monitoring; 503 to user |
| permission_definitions row missing for action_name | Return is_granted=FALSE with resolution_source='permission_undefined'; alert admin |
| Cross-cutting constraint check timeout | Fail closed — deny the action with reason 'constraint_check_timeout' |
| Audit log INSERT failure | Action proceeds (don't block business operations); error monitored; reconciliation cron retries failed inserts |

### 17.1 Fail-closed vs fail-open

**Fail-closed** for: action grants, regulatory expiry checks, separation of duties. Better to inconvenience a user than allow an unauthorized action.

**Fail-open** for: audit logging (action proceeds, audit retried), cache warming (fall back to base tables).

## 18. Debug and observability

### 18.1 Resolution trace API (Admin-only)

`GET /api/admin/permission-debug?user_id=X&action_name=Y&target_entity_id=Z`

Returns the FULL resolution trace:

```json
{
  "input": { "user_id": "...", "action_name": "ap_bills:approve", "target_entity_id": "..." },
  "phases": [
    {
      "phase": "PHASE_1_CACHE_LOOKUP",
      "result": "HIT",
      "cache_row": { "is_granted": true, "ui_state": "interactive", "resolution_source": "role_default", "computed_at": "2026-05-12T10:30:00Z" },
      "duration_ms": 0.8
    },
    {
      "phase": "PHASE_3_1_SEPARATION_OF_DUTIES",
      "constraint_checked": "ap_bill_creator_not_approver",
      "result": "VIOLATION",
      "details": { "creator_user_id": "...", "current_user_id": "...", "match": true },
      "duration_ms": 1.2
    }
  ],
  "final_result": { "is_granted": false, "ui_state": "disabled", "resolution_source": "separation_of_duties_violation:ap_bill_creator_not_approver", "reason_if_denied": "..." },
  "total_duration_ms": 2.0
}
```

Used by support staff to answer "why was that user blocked?"

### 18.2 Resolution metrics

Emit to observability (Datadog/Prometheus):

- `permission_resolution.duration_ms` histogram by action_name + phase
- `permission_resolution.cache_hit_rate` gauge
- `permission_resolution.denials_total` counter by reason
- `permission_audit_log.inserts_total` counter by event_type

## 19. Open questions (Pass 3)

1. **Should cache be per-user or global?** Per-user (each row keyed by user_id). Global cache for permission definitions (only invalidates on deprecation; small enough to keep in app memory).

2. **Stale-while-revalidate threshold for non-critical reads.** Threshold of 5 minutes for dashboard-related reads. Critical paths (action execution) always check fresh.

3. **Resolution algorithm versioning.** When algorithm logic changes, how do we roll out? Decision: algorithm is in a single Postgres function `resolve_action_grant_v1`. New versions get new function names; rollout via feature flag. Old function deprecated after migration.

4. **A/B testing permission changes.** Can admins test a permission change without affecting prod users? Decision: NO at v1 (would require shadow cache). Phase 2 consideration.

5. **Real-time permission revocation.** When admin revokes a user's permission, how fast does it take effect? Decision: cache invalidation triggers immediately on the revocation event. Effective within milliseconds for the next request. WebSocket push to active sessions Phase 2.

6. **Multi-tenant resolution.** Currently single-tenant; multi-tenant deferred. When added, every query gets a `tenant_id` filter; cache key becomes (tenant_id, user_id, action_name). Resolution algorithm unchanged otherwise.

---

═══════════════════════════════════════════════════════════════════
# 20. What's next (Pass 4 preview)
═══════════════════════════════════════════════════════════════════

**Pass 4: Field-level visibility engine.**

Pass 3 covered field visibility at the algorithmic level (A3). Pass 4 covers the engine details:

- **Serialization layer** — how API response transformers apply field visibility (Pass 4 specifies the response transformation pipeline: query result → apply visibility → return)
- **UI layer integration** — how React components consume visibility flags (`<FieldGated flagName="visibility.clients.banking">...</FieldGated>` wrappers)
- **Mask formatting library** — standard mask patterns per field type (card last-4, email partial, phone last-4, address city-only)
- **Audit-on-read implementation** — async audit logging that doesn't block the response; backpressure handling
- **Bulk visibility resolution** — optimizing for list endpoints where the same field section is resolved 50+ times
- **Visibility-aware database views** — Postgres views that apply visibility transformations at the database layer (defense-in-depth + simpler app code)
- **Per-tenant field visibility customization** — Phase 2 placeholder for operator-customized field definitions

Plus the catalog of every `visibility.*` flag mapping to its database column(s).

Pass 4 will produce v0.4 of the design doc.

---

**End of v0.3.** Pass 3 (Resolution Algorithm) complete. Three intertwined algorithms (A1 action grant, A2 data scope, A3 field visibility) specified with seven-phase resolution flow, sample resolution traces, performance budgets, RLS integration, edge cases (granted-but-blocked, co-sign, public actions, system-generated, temporary overrides), failure modes, debug API. Six Pass 3 open questions resolved.
