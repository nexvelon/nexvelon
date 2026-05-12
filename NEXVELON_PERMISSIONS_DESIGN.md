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
> **Status:** v0.5 — Passes 1-5 complete. Pending: Pass 6 (Append-only
> audit), Pass 7 (Request-admin-access workflow), Pass 8 (Permissions
> editor UI), Pass 9 (Effective-permissions caching strategy), Pass 10
> (Cross-cutting enforcement patterns), Pass 11 (Migration plan).
>
> Pass 1 (Action Vocabulary Catalog) condensed §1-§8; full at `9008fad`.
> Pass 2 (Database Schema) condensed §9; full at `1bafbd4`.
> Pass 3 (Resolution Algorithm) condensed §10; full at `ff08703`.
> Pass 4 (Field Visibility Engine) condensed §11; full at `de1905f`.
> Pass 5 (Status Surface Binding Layer) full content begins at §12.

---

## 0. How to use this document

### 0.1 Purpose

Design specification for the Nexvelon permissions runtime.

### 0.2 Pass overview

| Pass | Scope | Status |
|---|---|---|
| 1 | Action vocabulary catalog | ✅ COMPLETE (full at `9008fad`; condensed §1-§8) |
| 2 | Database schema | ✅ COMPLETE (full at `1bafbd4`; condensed §9) |
| 3 | Permission resolution algorithm | ✅ COMPLETE (full at `ff08703`; condensed §10) |
| 4 | Field-level visibility engine | ✅ COMPLETE (full at `de1905f`; condensed §11) |
| 5 | Status surface binding layer | ✅ COMPLETE (this version) |
| 6 | Append-only audit pattern | PENDING |
| 7 | Request-admin-access workflow | PENDING |
| 8 | Permissions editor UI | PENDING |
| 9 | Effective-permissions caching strategy | PENDING |
| 10 | Cross-cutting enforcement patterns | PENDING |
| 11 | Migration plan | PENDING |

### 0.3 Role abbreviations

**A** Admin, **PM** Project Manager, **SR** Sales Rep, **Tech** Technician, **Sub** Subcontractor (portal), **Acc** Accounting, **VO** View Only. Plus **Dispatcher** (M12), **Bookkeeper** (M11), **HR-role**, **Executive** (M13).

---

═══════════════════════════════════════════════════════════════════
# Part I — Pass 1 (Action Vocabulary Catalog) — condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 1 content at commit `9008fad`.*

## 1. Format
`resource:verb[:qualifier]` — plural noun + camelCase verb + optional qualifier.

## 2-3. Verb + Qualifier taxonomies
Verb (8 categories): view / create / edit / state-transition / configuration / communication / admin / workflow. Qualifier (4 categories): scope / state / modal / field-section.

## 4. Resource taxonomy
140+ resources across 13 modules, mapped 1:1 to database tables.

## 5. Action grouping for permissions editor UI
4-tier hierarchy (Module → Resource → Category → Individual action) + 6 cross-cut tabs. Three UI states per §0.4 #2: hidden/disabled/interactive.

## 6-7. Cross-references + special-case treatment
Action dependencies, mutually exclusive (§0.4 #11), action chains. Public actions (signed URL), Admin exceptions (13), system-generated (10+), append-only (9 resources per §0.4 #10).

## 8. Six Pass 1 open questions resolved
Compound verbs vs qualifier (both); per-record vs per-class (capability at class); role inheritance (NO at v1); per-tenant custom actions (NO at v1); action versioning (new actions default denied); action deprecation (mark; 1 release; clean).

---

═══════════════════════════════════════════════════════════════════
# Part II — Pass 2 (Database Schema) — condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 2 content at commit `1bafbd4`.*

## 9. 14 tables across 5 groups + 1 materialized view

**Group 1 — Core permissions (5):** `permission_definitions`, `roles`, `role_permissions`, `user_permission_overrides`, `effective_permissions_cache`.

**Group 2 — Field visibility (3):** `field_visibility_definitions`, `role_field_visibility`, `user_field_visibility_overrides`.

**Group 3 — Data scopes (3):** `data_scope_definitions`, `role_data_scopes`, `user_data_scope_overrides`.

**Group 4 — Audit (1, append-only):** `permission_audit_log` with UPDATE/DELETE blocked at PostgreSQL trigger level.

**Group 5 — Cross-cutting constraints (3):** `separation_of_duties_constraints` (§0.4 #11), `regulatory_expiry_overrides` (§0.4 #12), `geolocation_retention_policies` (§0.4 #13).

**Plus materialized view:** `permission_resolution_view`.

Three architectural decisions locked: one row per action; trigger-invalidated cache; orthogonal data scopes.

---

═══════════════════════════════════════════════════════════════════
# Part III — Pass 3 (Resolution Algorithm) — condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 3 content at commit `ff08703`.*

## 10. Three runtime algorithms

**A1 — Action grant resolution** (7-phase): cache lookup → base table resolution on miss → cross-cutting constraint checks (separation of duties + regulatory expiry; Pass 5 adds **status binding check** as third constraint) → audit logging → return.

**A2 — Data scope resolution:** returns SQL filter clause + bind parameters.

**A3 — Field visibility resolution:** returns visible / masked / hidden.

Performance budget: <5ms p99 compound; <1ms cache hit; <50ms p99 typical list endpoint. Cache hit rate target >95%.

Failure modes: fail-closed for action grants, regulatory expiry, separation of duties. Fail-open for audit logging and cache warming.

Two architectural decisions: invalidate-and-lazy-fill cache; separation of duties runtime + DB-trigger.

---

═══════════════════════════════════════════════════════════════════
# Part IV — Pass 4 (Field-Level Visibility Engine) — condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 4 content at commit `de1905f`.*

## 11. Two-layer architecture

**Backend layer:** 8-stage serialization pipeline. Bulk visibility resolution (resolve ONCE per user-resource-section per request). 12 standard mask types library (card_last_4, sin_last_3, email_partial, etc.). Mask character `•` (U+2022).

**Frontend layer:** `<FieldGated flagName="...">` component with VisibilityContext provider. Hooks: `useVisibility`, `useCanDoAction`.

**Plus database view layer:** Postgres views for 5 highest-sensitivity resources (clients, employees, vendors, contractors, payments). SQL function `user_field_visibility(flag_name)` consults `effective_field_visibility_cache`.

**Async batched audit-on-read:** 100ms timer / 50-entry size / 1000-entry backpressure / circuit breaker / reconciliation cron.

**Complete 47-flag catalog** mapped to database columns + mask types + role defaults across all 13 modules. 1 never-granted (PCI). 9 audit-on-read. 3 row-level (handled by scope/predicate).

Three architectural decisions: app transformer primary + Postgres views for sensitive 5 (defense-in-depth); per-field `<FieldGated>` standard; async batched audit-on-read.

---

═══════════════════════════════════════════════════════════════════
# Part V — Pass 5 (Status Surface Binding Layer) — FULL CONTENT
═══════════════════════════════════════════════════════════════════

## 12. Overview

Per audit §0.4 #4: "lookup-table rows carry behavior bindings." 80 status surfaces across 13 modules each carry flags that drive runtime behavior. Pass 5 turns these from "documented in audit" into "queried by runtime."

### 12.1 Why this matters

A naive ERP scatters business logic across action handlers:

```typescript
// BAD: business logic hardcoded in handler
async function editInvoice(invoice) {
  if (invoice.status_name === 'Sent' 
      || invoice.status_name === 'Paid' 
      || invoice.status_name === 'Void') {
    throw new Error('Cannot edit invoice in this status');
  }
  // ... edit logic
}
```

Every status check duplicated. Every status name hardcoded. Adding a new status requires code changes everywhere it's referenced.

The behavior-binding model inverts this:

```typescript
// GOOD: business logic owned by lookup row
async function editInvoice(invoice) {
  const bindings = await getStatusBindings('invoice_statuses', invoice.status_id);
  if (!bindings.allows_edit) {
    throw new Error(bindings.deny_reason ?? 'Cannot edit invoice in this status');
  }
  // ... edit logic
}
```

The lookup row owns the rules. Adding a new status (say `Pending Customer Approval` between `Sent` and `Approved`) means inserting a row with configured bindings — no code change anywhere.

### 12.2 Three properties of bindings

**Property 1 — Action-gating bindings:** affect whether an action is permitted on an entity in this status. Examples: `allows_edit`, `allows_send`, `allows_payment`, `allows_state_transition_to_X`.

**Property 2 — Effect-triggering bindings:** affect what happens when an entity *enters* this status. Examples: `triggers_late_fee`, `starts_lien_clock`, `auto_notify_customer`, `creates_gl_entry`.

**Property 3 — UI-driving bindings:** affect how the entity in this status renders. Examples: `display_color`, `display_badge`, `display_priority`, `is_terminal` (greys out further actions).

All three properties supported by Pass 5 schema.

## 13. Schema extension

### 13.1 New table: `status_behavior_bindings`

Polymorphic — one table for all bindings across all 80 status surfaces.

```sql
CREATE TABLE status_behavior_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic reference to the status row
  status_table_name TEXT NOT NULL,              -- e.g., 'invoice_statuses', 'appointment_statuses'
  status_row_id UUID NOT NULL,                   -- the specific status row in that table
  
  -- The binding
  binding_name TEXT NOT NULL,                    -- e.g., 'allows_edit', 'triggers_late_fee', 'is_terminal'
  binding_category TEXT NOT NULL CHECK (binding_category IN (
    'action_gate',          -- gates a permitted action on entity in this status
    'effect_trigger',       -- triggers a downstream effect on entering this status
    'ui_driver'             -- drives UI rendering
  )),
  
  -- The value (typed)
  value_boolean BOOLEAN,
  value_text TEXT,
  value_integer INTEGER,
  value_numeric NUMERIC,
  value_jsonb JSONB,
  value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'text', 'integer', 'numeric', 'jsonb')),
  
  -- Reason / context (helps UIs explain "cannot edit" etc.)
  deny_reason_template TEXT,                     -- used when binding denies an action; e.g., "Cannot edit Sent invoices"
  
  -- Operator vs system control
  is_system_locked BOOLEAN NOT NULL DEFAULT FALSE,    -- TRUE: operators cannot modify in Settings; system enforces
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  
  -- Uniqueness
  CONSTRAINT status_behavior_bindings_unique UNIQUE (status_table_name, status_row_id, binding_name)
);

-- Critical performance indexes — runtime queries by (status_table_name, status_row_id) returning all bindings
CREATE INDEX idx_status_bindings_lookup ON status_behavior_bindings(status_table_name, status_row_id);
CREATE INDEX idx_status_bindings_by_name ON status_behavior_bindings(binding_name, status_table_name);
```

**Why polymorphic over per-table columns:**

- 80 status tables × ~6 bindings each = 480 columns spread across schema. Bindings are NOT identity attributes; they're behavior attributes. Better to colocate behavior than scatter it.
- New bindings are easy: add a row, no schema migration.
- Operator UI for managing bindings (Pass 8) reads from one table.
- Reporting on "which statuses across all modules trigger late fees" is trivial.

### 13.2 New table: `status_transition_definitions`

Defines which state transitions are valid per status surface.

```sql
CREATE TABLE status_transition_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source + target
  status_table_name TEXT NOT NULL,               -- e.g., 'invoice_statuses'
  from_status_row_id UUID NOT NULL,
  to_status_row_id UUID NOT NULL,
  
  -- Transition properties
  is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  requires_admin_approval BOOLEAN NOT NULL DEFAULT FALSE,
  requires_reason_capture BOOLEAN NOT NULL DEFAULT FALSE,
  required_action_name TEXT,                     -- which action triggers this transition (e.g., 'invoices:send' triggers Draft → Sent)
  
  -- Effects on transition
  triggers_effects JSONB,                        -- list of effect descriptors; runtime executes these on transition
  
  -- Operator vs system
  is_system_locked BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Uniqueness
  CONSTRAINT status_transitions_unique UNIQUE (status_table_name, from_status_row_id, to_status_row_id)
);

CREATE INDEX idx_status_transitions_from ON status_transition_definitions(status_table_name, from_status_row_id);
CREATE INDEX idx_status_transitions_to ON status_transition_definitions(status_table_name, to_status_row_id);
```

The state transition matrix per status surface is the set of rows in this table filtered by `status_table_name`.

### 13.3 Cache table: `effective_status_bindings_cache`

Bindings queried often in hot paths. Cache them.

```sql
CREATE TABLE effective_status_bindings_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  status_table_name TEXT NOT NULL,
  status_row_id UUID NOT NULL,
  
  -- Serialized binding map for this status row
  bindings JSONB NOT NULL,                       -- { 'allows_edit': false, 'allows_send': false, 'is_terminal': false, ... }
  
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT effective_status_bindings_cache_unique UNIQUE (status_table_name, status_row_id)
);

CREATE INDEX idx_effective_status_bindings_lookup ON effective_status_bindings_cache(status_table_name, status_row_id);
```

Invalidated by triggers on `status_behavior_bindings` INSERT/UPDATE/DELETE.

Hot-path read: `SELECT bindings FROM effective_status_bindings_cache WHERE status_table_name = 'invoice_statuses' AND status_row_id = $1` — single indexed lookup, returns full JSONB binding map. <1ms.

## 14. The 14 standard binding names

Across 80 status surfaces, these are the recurring binding names. New bindings can be added; this is the v1 baseline.

### 14.1 Action-gating bindings (8)

| Binding name | Type | Purpose |
|---|---|---|
| `allows_edit` | boolean | Can entity be edited in this status? |
| `allows_delete` | boolean | Can entity be hard-deleted? (rare; usually Admin-only) |
| `allows_send` | boolean | Can entity be sent (invoice send, quote send)? |
| `allows_payment` | boolean | Can payment be recorded against this entity? |
| `allows_reversal` | boolean | Can entity be reversed (void → reopen)? |
| `allows_state_transition` | jsonb | List of status_ids this entity can transition to from current status |
| `is_terminal` | boolean | No further state transitions allowed (e.g., Paid, Void) |
| `requires_admin_to_modify` | boolean | Modifications require Admin role even with role grant |

### 14.2 Effect-triggering bindings (6)

| Binding name | Type | Purpose |
|---|---|---|
| `triggers_notification_template` | text | Template name to send on entering this status (e.g., 'invoice_sent') |
| `triggers_late_fee` | boolean | Reaching this status with overdue date starts late fee accumulation |
| `creates_gl_entry` | boolean | Reaching this status posts to GL (e.g., invoice Sent → AR posting) |
| `starts_lien_clock` | boolean | Reaching this status starts Ontario 60-day lien clock for trade contractors |
| `auto_notifies_customer` | boolean | Customer email triggered on entering this status |
| `triggers_holdback_release` | boolean | Reaching this status triggers 45-day holdback release timer per Canadian Construction Act |

### 14.3 UI-driving bindings (5)

| Binding name | Type | Purpose |
|---|---|---|
| `display_color` | text | Hex color or semantic name (e.g., `'#10b981'` or `'success'`) |
| `display_badge` | text | Badge variant for UI (e.g., 'success', 'warning', 'danger', 'neutral') |
| `display_priority` | integer | Sort/list priority; higher = more prominent |
| `display_icon` | text | Icon name for UI |
| `display_show_in_filter_chips` | boolean | Whether this status appears in filter chip lists |

## 15. The 80 status surfaces × bindings inventory

Catalog by module. Conventions:

- ✓ = binding present + value typical default
- ⊘ = binding present + value explicitly FALSE/NULL
- — = binding not applicable to this status surface
- 🔒 = system-locked (operators cannot modify)
- 🟢 = operator-configurable in Settings

### 15.1 M1 — Clients + Sites + Contacts (15 status surfaces)

| Status surface | Notable bindings |
|---|---|
| `client_statuses` (Lead/Active/On Hold/Archived) | Lead→Active: allows_state_transition (PM/SR). On Hold: 🔒 allows_send=FALSE, blocks new dispatches. Archived: 🔒 is_terminal=TRUE. |
| `client_tiers` (Standard/Premium/VIP/Strategic) | display_priority for UI sort. 🟢 operator-configurable thresholds. |
| `customer_types` (16 seeded types) | UI driver only; no action gating. |
| `site_statuses` (Active/Inactive/Decommissioned) | Decommissioned: 🔒 is_terminal, blocks new appointments. |
| `service_contract_statuses` (Draft/Active/Paused/Renewed/Expired/Cancelled) | Active: ✓ allows_recurring_billing. Cancelled/Expired: 🔒 is_terminal. Renewed: triggers new contract creation. |
| `client_onboarding_gate_types` | Each gate type has binding `gate_blocks_quote_send` and `gate_blocks_contract_send`. |
| `client_communication_log_types` | UI driver. |
| `client_communication_preferences` | Bindings drive notification routing (email/SMS/none). |
| `payment_methods` | 🔒 fixed bindings drive payment processing flow. |
| `payment_terms` (Net 15/30/45/60/On Receipt) | 🟢 operator can add custom terms. |
| `client_holdback_config_types` (Excl Tax/Incl Tax/None) | 🔒 fixed; affects invoice calculation. |
| `client_tags` | UI driver only. |
| `address_types`, `contact_types`, `relationship_types` | UI drivers. |
| `client_credit_statuses` (Good Standing/On Hold/Collections) | 🔒 On Hold + Collections: blocks new sale. |

### 15.2 M2 — Employees + Permissions (11 status surfaces)

| Status surface | Notable bindings |
|---|---|
| `employee_statuses` (Active/On Leave/Terminated/Resigned) | 🔒 Terminated/Resigned: is_terminal, blocks login. On Leave: allows scheduling=FALSE. |
| `employee_employment_types` (Full-time/Part-time/Contractor/Temp) | Affects payroll calculation. |
| `certification_types` (25+) | Each has `gate_blocks_action` mapping to actions requiring this cert (e.g., ULC required for fire alarm install). 🔒 |
| `territory_statuses` | UI driver. |
| `employee_absence_types` (Vacation/Sick/Personal/Bereavement) | Affects scheduling availability. |
| `employee_role_levels` (Apprentice/Journey/Senior/Master) | Affects labor rate calculation. |
| `request_admin_access_statuses` (Pending/Approved/Rejected/Expired) | 🔒 |
| (more) | |

### 15.3 M3-M13 — Status surfaces

Similar coverage. Notable highlights:

**M5 Quotes:**
- `quote_statuses` (Draft/Pending Approval/Approved/Sent/Viewed/Accepted/Rejected/Expired/Cancelled) — Sent: 🔒 allows_edit=FALSE; triggers snapshot capture; immutable. Accepted: triggers project creation. Viewed: auto-set from portal access.

**M6 Projects:**
- `project_statuses` (Planning/In Progress/Completed/On Hold/Cancelled) — Cancelled: 🔒 is_terminal.
- `change_order_statuses` — Approved: triggers GL adjustment; updates project budget.
- `commissioning_statuses` — Verified: ULC verification auto-attaches.

**M7 Inventory:**
- `inventory_movement_types` — 🔒 each type triggers specific GL postings (Receive: Inventory DR, AP CR; Issue: COGS DR, Inventory CR; etc.).
- `purchase_order_statuses` (Draft/Sent/Acknowledged/Partial Receipt/Received/Closed/Cancelled) — Cancelled allowed only before receipt.
- `inventory_adjustment_reasons` — Each reason has specific GL account mapping.

**M8 Vendors:**
- `vendor_statuses` (Lead/Active/Inactive/On Hold/Archived) — On Hold: blocks PO creation.
- `vendor_onboarding_gate_types` — Each gate has `blocks_po_creation` binding.
- `vendor_performance_grades` (A/B/C/D) — Grade C/D triggers preferred-status auto-removal.

**M9 Invoices:**
- `invoice_statuses` (11 statuses) — Sent: 🔒 allows_edit=FALSE, immutable snapshot; Paid: 🔒 is_terminal; Overdue: triggers_late_fee per client config; Void: requires_admin_to_modify.
- `payment_statuses` — Bounced: reverses invoice payment + alert.
- `ap_bill_statuses` (Received/Pending Approval/Approved for Payment/Paid/Disputed/Void) — Approved for Payment: allows addition to payment run; 🔒 separation of duties enforced (Pass 3 §11.3).
- `credit_note_statuses` — Applied: reduces target invoice balance.

**M10 Subcontractors:**
- `contractor_statuses` (Lead/Active/Inactive/On Hold/Archived) — On Hold: blocks WO creation. WSIB expired triggers automatic On Hold (Pass 3 cross-cutting constraint).
- `contractor_wo_statuses` (12 statuses) — Lien Period: starts_lien_clock=TRUE (Ontario 60-day); allows_payment=FALSE; Closed: only allowed after lien deadline passed (60 days from substantial completion).

**M11 Financials:**
- `gl_entry_statuses` (Draft/Posted/Reversed/Locked) — Locked: 🔒 is_terminal, no edits allowed (period closed).
- `period_statuses` (Open/Soft Close/Hard Close/Reopened) — Hard Close requires A+Acc co-sign per Pass 3 §15.2. Reopened: requires_admin + reason capture.
- `tax_filing_statuses` — Filed: 🔒 is_terminal in current period.

**M12 Scheduling:**
- `appointment_statuses` (Tentative/Confirmed/En Route/On Site/In Progress/Completed/Cancelled by Customer/Cancelled by Us/No Show/Rescheduled) — Cancelled by Customer triggers cancellation fee assessment.
- `dispatch_record_statuses` — In Progress: SLA clock active; sla_breach_alerts may auto-generate.
- `sla_breach_statuses` (Approaching 75%/Imminent 90%/Breached/Acknowledged/Waived/Resolved) — Waived: requires Admin + reason (Pass 3 admin exception).
- `priority_levels` (P0 Critical/P1 High/P2 Normal/P3 Low) — affects SLA window calculation.

**M13 Reports:**
- `report_statuses` (Active/Archived/Draft/Deprecated) — Deprecated: 🔒 hides from new subscriptions but allows existing schedules.
- `tax_filing_statuses` — overlap with M11.

### 15.4 Total inventory

- **80 status surfaces** across 13 modules
- Each surface has 3-10 status rows
- Average ~5 bindings per status row
- ~400 status rows total × ~5 bindings = **~2000 binding rows** at v1 seed
- Plus ~600 transition rows in `status_transition_definitions`

## 16. Action handler integration

### 16.1 Standard binding check pattern

Every action handler that's gated by entity state follows this pattern:

```typescript
// Pseudocode for build phase reference
async function editInvoice(invoice: Invoice, updates: Partial<Invoice>) {
  // 1. Standard A1 action grant check (Pass 3)
  await assertActionGrant(currentUser.id, 'invoices:edit', invoice.id);
  
  // 2. NEW: Status binding check
  const bindings = await getEffectiveBindings('invoice_statuses', invoice.status_id);
  if (!bindings.allows_edit) {
    throw new BindingDeniedError({
      action: 'invoices:edit',
      entity: invoice,
      binding: 'allows_edit',
      reason: bindings.deny_reason_template ?? 'Cannot edit invoice in this status'
    });
  }
  
  // 3. Proceed with edit
  await db.update('invoices', invoice.id, updates);
  
  // 4. Audit (standard)
  await auditAction({ ... });
}
```

`getEffectiveBindings` queries `effective_status_bindings_cache`:

```typescript
async function getEffectiveBindings(statusTableName: string, statusRowId: string): Promise<BindingMap> {
  const cached = await db.query(
    'SELECT bindings FROM effective_status_bindings_cache WHERE status_table_name = $1 AND status_row_id = $2',
    [statusTableName, statusRowId]
  );
  
  if (cached.rows[0]) return cached.rows[0].bindings;
  
  // Cache miss — resolve from base table, write back
  return await resolveAndCacheBindings(statusTableName, statusRowId);
}
```

### 16.2 State transition handlers

Transitions (e.g., `invoices:approve` moving Pending → Approved) consult `status_transition_definitions`:

```typescript
async function approveInvoice(invoice: Invoice) {
  await assertActionGrant(currentUser.id, 'invoices:approve', invoice.id);
  
  const targetStatus = await getStatusRowByName('invoice_statuses', 'Approved');
  
  // Check transition is allowed
  const transition = await getTransition('invoice_statuses', invoice.status_id, targetStatus.id);
  if (!transition || !transition.is_allowed) {
    throw new TransitionDeniedError({
      from: invoice.status_name,
      to: 'Approved',
      reason: 'Transition not defined for this status pair'
    });
  }
  
  // Check admin approval if required
  if (transition.requires_admin_approval && !currentUser.isAdmin) {
    throw new AdminApprovalRequiredError(...);
  }
  
  // Reason capture if required
  if (transition.requires_reason_capture && !context.reason) {
    throw new ReasonRequiredError(...);
  }
  
  // Update status
  await db.update('invoices', invoice.id, { status_id: targetStatus.id });
  
  // Execute triggered effects
  await executeEffects(transition.triggers_effects, { invoice, targetStatus, context });
  
  // Audit
  await auditAction({ ... });
}
```

### 16.3 Effect execution

`triggers_effects` JSONB on a transition row is a list of effect descriptors:

```json
[
  { "type": "create_gl_entry", "template": "invoice_approved" },
  { "type": "send_email", "template_name": "invoice_approved_internal" },
  { "type": "update_field", "field": "approved_by", "value": "$currentUser" },
  { "type": "schedule_followup", "delay_days": 7, "task_template": "invoice_followup" }
]
```

Effect executor:

```typescript
async function executeEffects(effects: Effect[], context: EffectContext) {
  for (const effect of effects) {
    switch (effect.type) {
      case 'create_gl_entry':
        await glService.createFromTemplate(effect.template, context);
        break;
      case 'send_email':
        await emailService.sendFromTemplate(effect.template_name, context);
        break;
      case 'update_field':
        await db.updateField(context.entity, effect.field, resolveValue(effect.value, context));
        break;
      case 'schedule_followup':
        await scheduler.schedule({
          delay_days: effect.delay_days,
          template: effect.task_template,
          context
        });
        break;
      // ... more effect types
    }
  }
}
```

Effects are idempotent — re-running shouldn't double-create. The effect executor records execution to a side table for deduplication.

## 17. Integration with Pass 3 algorithms

Per Decision 2 (chat walk): binding checks fit inside Phase 3 of A1 as another cross-cutting constraint.

### 17.1 Updated Phase 3 of Pass 3 A1

Pass 3 Phase 3 originally had:
- 3.1: Separation of duties check
- 3.2: Regulatory expiry check

Now extended to:
- 3.1: Separation of duties check
- 3.2: Regulatory expiry check
- **3.3: Status binding check (new)**

```
PHASE 3.3: Status binding check (NEW)
  Inputs: action_name, target_entity_id, context
  
  3.3.1: Determine if this action has a binding dependency
    - Look up permission_definitions for action_name
    - Read new column `binding_dependencies` (jsonb)
      e.g., for 'invoices:edit': [{ entity_type: 'invoice', status_table: 'invoice_statuses', binding: 'allows_edit', expected: true }]
    - If no binding_dependencies: skip; final_grant unchanged
    
  3.3.2: For each binding dependency:
    - Fetch the target entity (e.g., invoice with id = target_entity_id)
    - Get its status_id
    - Get bindings via effective_status_bindings_cache
    - Compare to expected value
    - If mismatch:
      final_grant = FALSE
      resolution_source = 'status_binding_violation:' + binding_name
      reason_if_denied = "[Entity] is in status [X]; this status does not allow [action]"
      Return immediately (don't check other dependencies)
  
  3.3.3: If all checks pass, final_grant unchanged
```

### 17.2 Schema extension for binding dependencies

Pass 2's `permission_definitions` gets a new column:

```sql
ALTER TABLE permission_definitions
ADD COLUMN binding_dependencies JSONB;

-- Example value for 'invoices:edit':
-- [{ "entity_type": "invoice", "status_table": "invoice_statuses", "binding": "allows_edit", "expected": true }]
```

Population at seed time per the action catalog from Pass 1.

### 17.3 Performance budget impact

Per Pass 3 §16, original budget for cross-cutting constraint checks was 0-2ms.

Adding binding check:
- effective_status_bindings_cache lookup: <0.5ms (single indexed read)
- comparison logic: negligible
- Total Phase 3.3 overhead: <1ms

Adjusted Phase 3 total budget: 1-3ms with all three checks. Total A1 budget unchanged (<5ms p99 compound).

### 17.4 Updated resolution traces

Adding a binding-check example to Pass 3's worked traces:

**Trace 6: User attempts `invoices:edit` on Sent invoice**

```
Input: { user_id, action_name: "invoices:edit", target_entity_id: invoice_42 }

PHASE 1: Cache lookup → hit, granted by role default for PM
PHASE 3.1: No separation of duties for invoices:edit → skip
PHASE 3.2: No regulatory expiry concern → skip
PHASE 3.3: Status binding check
  binding_dependencies = [{ entity_type: 'invoice', status_table: 'invoice_statuses', binding: 'allows_edit', expected: true }]
  Fetch invoice_42 → status_id = <Sent>
  Get bindings via cache → { allows_edit: false, allows_send: false, is_terminal: false, ... }
  Comparison: allows_edit (false) !== expected (true) → MISMATCH
  
  → final_grant = FALSE
  → resolution_source = 'status_binding_violation:allows_edit'
  → reason_if_denied = "Invoice INV-2024-001 is in status Sent; this status does not allow edit. Per immutable send snapshot policy (§0.4 #8)."

PHASE 5: Return
  { is_granted: FALSE, ui_state: 'disabled', resolution_source: '...', reason_if_denied: '...', ... }
```

## 18. Operator-configurable vs system-locked bindings

Some bindings are operator-tunable in Settings. Others are system-locked because they enforce architectural commitments from the audit (§0.4 series).

### 18.1 System-locked bindings (cannot be modified by operators)

Per audit cross-cutting commitments:

- **§0.4 #8 — Immutable snapshots:** `allows_edit = FALSE` on Sent statuses of quotes, invoices, change orders, contractor WOs is 🔒 system-locked.
- **§0.4 #11 — Separation of duties:** Co-sign requirement on `accounting_periods:hardClose` is 🔒.
- **§0.4 #12 — Regulatory expiry:** WSIB expired → On Hold transition is 🔒.
- **§0.4 #13 — Geolocation retention:** 30-day retention default is 🔒 (but threshold value is operator-configurable per Pass 2).
- **PCI compliance:** `payments.fullCardNumber` visibility is 🔒.
- **Canadian Construction Act:** 45-day holdback release timing on retention release invoices is 🔒.
- **Ontario lien deadline:** 60-day clock on Trade Contractor WOs is 🔒.
- **Append-only ledgers:** Inventory movements, commissioning records, GL entries: `allows_edit=FALSE, allows_delete=FALSE` is 🔒.

These show as locked (greyed) in the permissions editor (Pass 8). Tooltip explains why.

### 18.2 Operator-configurable bindings

Operator can tune in Settings:

- Custom status added by operator (e.g., 'Pending Customer Approval' in quote_statuses) → all its bindings configurable
- Late fee thresholds (`triggers_late_fee` plus accumulator config)
- Notification template assignments (`triggers_notification_template`)
- Display colors / badges / priorities / icons (UI drivers)
- Approval thresholds (e.g., quotes:approve thresholds in M5 — managed via Settings per Pass 1 catalog)
- Per-tenant retention day count (under the 30-day default minimum for compliance)
- Reorder thresholds for inventory

### 18.3 Hybrid bindings

Some bindings are partially system-locked: the existence is system-required but the specific value is operator-tunable.

Example: `triggers_late_fee` binding on `invoice_statuses.Overdue` row.

- 🔒 system: binding MUST exist; cannot be deleted
- 🟢 operator: value can be tuned (default `true`; can disable per-tenant)

UI shows these as partial-edit (some sub-fields editable, some locked).

## 19. State transition matrices (sample)

For each status surface, the set of rows in `status_transition_definitions` forms a state transition matrix.

### 19.1 Example: `invoice_statuses` matrix

| From → To | Draft | Pending Approval | Approved | Sent | Viewed | Partial Paid | Paid | Overdue | Void | Cancelled | Refunded |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Draft** | self | ✓ submit | ✓ approve (skip) | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ✓ void | ✓ cancel | ⊘ |
| **Pending Approval** | ✓ reject (back to Draft) | self | ✓ approve | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ✓ void | ✓ cancel | ⊘ |
| **Approved** | ⊘ | ⊘ | self | ✓ send | ⊘ | ⊘ | ⊘ | ⊘ | ✓ void | ✓ cancel | ⊘ |
| **Sent** | ⊘ (locked) | ⊘ | ⊘ | self | ✓ auto (portal viewed) | ✓ partial payment | ✓ full payment | ✓ overdue (date-trigger) | ✓ void (A+reason) | ⊘ | ⊘ |
| **Viewed** | ⊘ | ⊘ | ⊘ | ⊘ | self | ✓ partial | ✓ full | ✓ overdue | ✓ void (A) | ⊘ | ⊘ |
| **Partial Paid** | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | self | ✓ full | ✓ overdue (if past due) | ✓ void (A+reason) | ⊘ | ⊘ |
| **Paid** | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | self | ⊘ | ⊘ | ⊘ | ✓ refund (A) |
| **Overdue** | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ✓ partial | ✓ full | self | ✓ void | ⊘ | ⊘ |
| **Void** | ✓ reopen (A only) | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | self | ⊘ | ⊘ |
| **Cancelled** | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | self | ⊘ |
| **Refunded** | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | ⊘ | self |

Each ✓ corresponds to a row in `status_transition_definitions` with the relevant `required_action_name` populated.

### 19.2 Example: `contractor_wo_statuses` matrix

The 60-day lien clock is enforced through this matrix.

Lien Period (post-substantial-completion) → Closed: transition only allowed if (current_date >= lien_period_started_at + 60 days). Otherwise denied with reason "Lien deadline has not passed; cannot close work order yet (Ontario Construction Act)."

This check is implemented in the transition handler:

```typescript
if (fromStatus.name === 'Lien Period' && toStatus.name === 'Closed') {
  const lienStartedAt = await getLienPeriodStartedAt(workOrder.id);
  const lienDeadlinePassed = isAfter(new Date(), addDays(lienStartedAt, 60));
  if (!lienDeadlinePassed) {
    throw new TransitionDeniedError({ reason: 'Lien deadline has not passed (Ontario Construction Act 60-day)' });
  }
}
```

System-locked: `requires_admin_approval=TRUE` for this transition pre-60-days, with audit captured.

## 20. Performance characteristics

### 20.1 Cache lookup performance

- `effective_status_bindings_cache`: indexed by `(status_table_name, status_row_id)`. <1ms hit.
- ~400 status rows total → cache fits in memory at ~50KB. Effectively zero-cost.

### 20.2 Cache invalidation

PostgreSQL triggers:
- INSERT/UPDATE/DELETE on `status_behavior_bindings` → invalidate matching row in cache
- INSERT/UPDATE/DELETE on `status_transition_definitions` → no cache impact directly (transitions are runtime lookups; could add a transition cache in Pass 9 if needed)

Cache warming: bindings cache populated lazily on first read per status row.

### 20.3 Effect execution

Effects are async fire-and-forget where possible:
- `send_email`: enqueued to job queue
- `create_gl_entry`: synchronous (atomic with state transition)
- `schedule_followup`: async (added to scheduler queue)
- `update_field`: synchronous

GL entry creation must be synchronous and atomic with the state transition (single transaction). Other effects can be async with retry on failure.

## 21. Failure modes

| Failure | Behavior |
|---|---|
| Cache lookup fails | Fall back to base table query (slower but correct) |
| Binding row not found for expected binding | Treat as `false` for action gates (fail-closed); `null` for triggers; default value for UI drivers |
| Transition not found in `status_transition_definitions` | Deny transition; surface generic "Transition not defined" |
| Effect execution fails (async) | Retry per effect type policy; alert on repeated failures |
| Effect execution fails (synchronous, e.g., GL entry creation) | Roll back the transition; return error to caller |

## 22. Migration order extension

Adding to Pass 2's 16-step migration order:

- Step 17: Create `status_behavior_bindings` table
- Step 18: Create `status_transition_definitions` table
- Step 19: Create `effective_status_bindings_cache` table
- Step 20: Add `binding_dependencies` column to `permission_definitions`
- Step 21: Seed `status_behavior_bindings` from audit catalog (~2000 rows)
- Step 22: Seed `status_transition_definitions` from audit (~600 rows)
- Step 23: Populate `effective_status_bindings_cache` from initial bindings (lazy fill via first read after seed)

## 23. Open questions (Pass 5)

1. **Should bindings have version history?** When an operator changes `triggers_late_fee` from true to false, should we audit? Decision: YES — same audit pattern as permissions (logged to `permission_audit_log` with event_type='status_binding_changed').

2. **Multi-status entities** — e.g., invoice has `status` AND `payment_status`. Should bindings combine? Decision: handlers query bindings per-status; combine logic in the handler when needed. No automated combination.

3. **Performance of effect execution at scale** — when an invoice transitions Sent → Paid, fires 3-5 effects. 1000 invoices/day = 3000-5000 effect executions. Sustainable? Decision: YES via async queue for non-atomic effects; ops dashboard monitors queue depth.

4. **Operator-added bindings** — can operators add NEW binding names beyond the 14 standard? Decision: NO at v1 (fixed binding name catalog). Phase 2 consideration when plugin architecture lands.

5. **Conditional bindings** — should bindings have conditions (e.g., `allows_edit=TRUE only if user is creator within 30 minutes`)? Decision: NO at v1 — bindings are static per status row. Conditional logic stays in action handlers when needed. Phase 2 may add conditional bindings.

6. **Cross-status binding dependencies** — e.g., invoice `allows_payment` should also check if client is `On Stop` (client status). How? Decision: at v1, handler queries bindings from multiple status surfaces sequentially. Phase 2 could add a cross-status rule engine.

7. **UI representation of locked bindings** — should the permissions editor show locked bindings at all, or hide them? Decision: SHOW but render as greyed/locked with explanatory tooltip ("This binding enforces §0.4 #8 immutable snapshot policy"). Transparency over concealment.

---

═══════════════════════════════════════════════════════════════════
# 24. What's next (Pass 6 preview)
═══════════════════════════════════════════════════════════════════

**Pass 6: Append-only audit pattern.**

The `permission_audit_log` table was specified in Pass 2. Pass 6 details the audit pattern across the entire permissions runtime:

- Insert-only enforcement (PostgreSQL triggers blocking UPDATE/DELETE — already specified)
- 18+ enumerated event types and when each fires
- JSON payload schema per event type
- Audit query patterns (admin debugging, compliance export, security review)
- Append-only ledger pattern propagation to other modules (M6 commissioning, M7 inventory movements, M11 GL — extending §0.4 #10)
- Retention policies and archival strategy (Phase 2 cold storage)
- Audit data extraction for compliance reports
- Performance: how audit log scales to ~10M entries/year without degrading

Pass 6 will produce v0.6 of the design doc.

---

**End of v0.5.** Pass 5 (Status Surface Binding Layer) complete. New schema: `status_behavior_bindings` table (polymorphic across 80 status surfaces) + `status_transition_definitions` + `effective_status_bindings_cache`. Three binding property categories: action-gating (8 bindings), effect-triggering (6), UI-driving (5) — 14 standard binding names total. 80 status surfaces × ~5 bindings = ~2000 binding rows + ~600 transition rows at v1 seed. Integration with Pass 3 A1 algorithm via new Phase 3.3 status binding check (<1ms overhead; preserves <5ms total budget). State transition matrices specified for invoice_statuses and contractor_wo_statuses examples (Ontario 60-day lien clock enforcement). Operator-configurable vs system-locked bindings catalogued (cross-cutting commitments §0.4 #8/#11/#12/#13/PCI/Construction Act/lien/append-only ledgers are 🔒). Seven Pass 5 open questions resolved.
