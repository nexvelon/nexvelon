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
> **Status:** v0.6 — Passes 1-6 complete. Pending: Pass 7 (Request-
> admin-access workflow), Pass 8 (Permissions editor UI), Pass 9
> (Effective-permissions caching strategy), Pass 10 (Cross-cutting
> enforcement patterns), Pass 11 (Migration plan).
>
> Pass 1 (Action Vocabulary Catalog) condensed §1-§8; full at `9008fad`.
> Pass 2 (Database Schema) condensed §9; full at `1bafbd4`.
> Pass 3 (Resolution Algorithm) condensed §10; full at `ff08703`.
> Pass 4 (Field Visibility Engine) condensed §11; full at `de1905f`.
> Pass 5 (Status Surface Binding Layer) condensed §12; full at `904bfe5`.
> Pass 6 (Append-Only Audit Pattern) full content begins at §13.

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
| 5 | Status surface binding layer | ✅ COMPLETE (full at `904bfe5`; condensed §12) |
| 6 | Append-only audit pattern | ✅ COMPLETE (this version) |
| 7 | Request-admin-access workflow | PENDING |
| 8 | Permissions editor UI | PENDING |
| 9 | Effective-permissions caching strategy | PENDING |
| 10 | Cross-cutting enforcement patterns | PENDING |
| 11 | Migration plan | PENDING |

### 0.3 Role abbreviations

**A** Admin, **PM** Project Manager, **SR** Sales Rep, **Tech** Technician, **Sub** Subcontractor (portal), **Acc** Accounting, **VO** View Only. Plus **Dispatcher** (M12), **Bookkeeper** (M11), **HR-role**, **Executive** (M13).

---

═══════════════════════════════════════════════════════════════════
# Part I — Pass 1 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 1 content at commit `9008fad`.*

## 1. Format
`resource:verb[:qualifier]` — plural noun + camelCase verb + optional qualifier.

## 2-8. Taxonomies and treatment
Verb taxonomy (8 categories). Qualifier taxonomy (4 categories: scope/state/modal/field-section). 140+ resources. 4-tier UI hierarchy + 6 cross-cut tabs. Three UI states (hidden/disabled/interactive). Action dependencies, mutual exclusions, chains. Public actions, Admin exceptions, system-generated, append-only special cases. Six open questions resolved.

---

═══════════════════════════════════════════════════════════════════
# Part II — Pass 2 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 2 content at commit `1bafbd4`.*

## 9. 14 tables across 5 groups + 1 materialized view

Core permissions (5): `permission_definitions`, `roles`, `role_permissions`, `user_permission_overrides`, `effective_permissions_cache`. Field visibility (3): `field_visibility_definitions`, `role_field_visibility`, `user_field_visibility_overrides`. Data scopes (3): `data_scope_definitions`, `role_data_scopes`, `user_data_scope_overrides`. Audit (1, append-only): `permission_audit_log` with UPDATE/DELETE blocked at PostgreSQL trigger level. Cross-cutting constraints (3): `separation_of_duties_constraints` (§0.4 #11), `regulatory_expiry_overrides` (§0.4 #12), `geolocation_retention_policies` (§0.4 #13). Plus materialized view `permission_resolution_view`.

Three architectural decisions: one row per action; trigger-invalidated cache; orthogonal data scopes.

---

═══════════════════════════════════════════════════════════════════
# Part III — Pass 3 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 3 content at commit `ff08703`.*

## 10. Three runtime algorithms

**A1 — Action grant resolution** (7-phase): cache lookup → base table resolution → Phase 3 cross-cutting constraint checks (3.1 separation of duties, 3.2 regulatory expiry, 3.3 status binding from Pass 5) → audit logging → return. <5ms p99 compound. <1ms cache hit.

**A2 — Data scope resolution:** returns SQL filter clause + bind parameters.

**A3 — Field visibility resolution:** returns visible/masked/hidden. Honors `is_never_granted` for PCI compliance.

Failure modes: fail-closed for grants/expiry/SoD; fail-open for audit logging and cache warming.

---

═══════════════════════════════════════════════════════════════════
# Part IV — Pass 4 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 4 content at commit `de1905f`.*

## 11. Field visibility engine

Backend serialization pipeline (8 stages, bulk visibility resolution pattern). Frontend `<FieldGated>` component + VisibilityContext provider. Database views layer for 5 highest-sensitivity resources (clients/employees/vendors/contractors/payments). 12 standard mask types library. Async batched audit-on-read (100ms timer / 50-entry size / 1000-entry backpressure / circuit breaker). Complete 47-flag catalog mapped to database columns. 1 never-granted (PCI). 9 audit-on-read. 3 row-level.

---

═══════════════════════════════════════════════════════════════════
# Part V — Pass 5 condensed summary
═══════════════════════════════════════════════════════════════════

*Full Pass 5 content at commit `904bfe5`.*

## 12. Status surface binding layer

Polymorphic `status_behavior_bindings` table across 80 status surfaces. 14 standard binding names (8 action-gating, 6 effect-triggering, 5 UI-driving). `status_transition_definitions` with triggers_effects JSONB. `effective_status_bindings_cache`. New `permission_definitions.binding_dependencies` column. Phase 3.3 added to Pass 3 A1 algorithm (<1ms overhead; preserves <5ms budget). State transition matrices (invoice_statuses 11×11; contractor_wo_statuses with Ontario 60-day lien clock). System-locked enforces audit commitments (§0.4 #8/#11/#12/#13/PCI/Construction Act/lien/append-only). Operator-configurable: custom statuses, late fees, notifications, UI drivers, approval thresholds. Effect executor with idempotent execution. ~2000 binding rows + ~600 transition rows at v1 seed.

---

═══════════════════════════════════════════════════════════════════
# Part VI — Pass 6 (Append-Only Audit Pattern) — FULL CONTENT
═══════════════════════════════════════════════════════════════════

## 13. Overview

Audit lives in two places by now: the permissions runtime (specified in Pass 2's `permission_audit_log`) and the seven append-only ledgers committed across the audit per §0.4 #10:

- `inventory_movements` (M7)
- `commissioning_records` (M6)
- `project_acceptance_records` (M6)
- `vendor_performance_scores` (M8)
- `contractor_performance_scores` (M10)
- `gl_journal_lines` (M11)
- `appointment_change_log` (M12)
- `report_snapshots` (M13) — also append-only per §0.4 #10

Each enforces append-only at the database level (no UPDATE, no DELETE). Each captures who/when/what for forensic + compliance needs. Each scales to millions of rows per year.

Pass 6 specifies the **uniform pattern** they all apply, the **event type taxonomy** for permission audit specifically, the **query API surface** for admins and compliance officers, and **performance at scale** (partitioning, indexing, archival).

### 13.1 What's NOT in Pass 6

Pass 6 does not:
- Replicate the audit logic each ledger captures (that's in each module's spec in `NEXVELON_FEATURE_AUDIT.md`)
- Specify the M11 GL posting logic (that's Pass 11 migration concern + M11 own logic)
- Specify Phase 2 cold storage details (that's deferred)

What Pass 6 *does*:
- Specify the **canonical append-only ledger pattern** that all seven apply
- Define every audit event type in the permissions runtime (`permission_audit_log` is the primary subject)
- Specify the query API surface for admins and reporters
- Lock partitioning strategy for scale

## 14. The append-only ledger pattern

A single pattern applied uniformly across all 8 ledgers (`permission_audit_log` + 7 module ledgers).

### 14.1 Required schema elements

Every append-only ledger MUST have:

```sql
-- These columns are mandatory for any append-only ledger:
CREATE TABLE example_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- WHO
  actor_user_id UUID REFERENCES users(id),       -- NULL for system events
  actor_type TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN (
    'user', 'system', 'public_signed_url', 'integration', 'cron'
  )),
  
  -- WHEN
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- WHAT (event discriminator + payload)
  event_type TEXT NOT NULL,
  before_state JSONB,                            -- snapshot before change (NULL for inserts)
  after_state JSONB,                             -- snapshot after change (NULL for deletes)
  
  -- WHERE (entity context — polymorphic for module ledgers)
  -- ... ledger-specific columns
  
  -- WHY (optional but expected for sensitive events)
  reason TEXT,
  notes TEXT,
  
  -- FORENSIC METADATA
  ip_address INET,
  user_agent TEXT,
  request_id UUID,                               -- correlates with HTTP request log
  source_event_id UUID,                          -- if triggered by another event (chain tracking)
  
  -- PARTITION KEY (for time-based partitioning per §14.3)
  occurred_month DATE GENERATED ALWAYS AS (date_trunc('month', occurred_at)::DATE) STORED
)
PARTITION BY RANGE (occurred_month);
```

Ledger-specific columns are added per ledger (e.g., `inventory_movements` adds `from_location_id`, `to_location_id`, `quantity_change`, `unit_cost_fifo`; `gl_journal_lines` adds `debit`, `credit`, `account_id`).

### 14.2 PostgreSQL trigger to block UPDATE/DELETE

Every append-only ledger has identical trigger logic:

```sql
CREATE OR REPLACE FUNCTION block_ledger_modifications()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; UPDATE and DELETE blocked. To void an entry, insert a reversal event.', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$;

-- Apply to all append-only ledgers
CREATE TRIGGER prevent_update_inventory_movements
  BEFORE UPDATE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION block_ledger_modifications();

CREATE TRIGGER prevent_delete_inventory_movements
  BEFORE DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION block_ledger_modifications();

-- Repeat for all 8 ledgers
```

**Reversal pattern:** to "void" an entry, INSERT a new row with `event_type = 'reversal'`, `source_event_id` pointing to the original. The original is untouched; the new row provides the offsetting effect.

### 14.3 Time-based monthly partitioning

Per Decision 2 (chat walk). PostgreSQL native partitioning.

```sql
-- Parent partitioned table (definition above)
CREATE TABLE permission_audit_log (
  -- columns from §14.1
) PARTITION BY RANGE (occurred_month);

-- Initial partitions (create monthly going forward)
CREATE TABLE permission_audit_log_2026_01 PARTITION OF permission_audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE permission_audit_log_2026_02 PARTITION OF permission_audit_log
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- ... future months created by monthly cron
```

Monthly cron job creates next month's partition 7 days before it's needed:

```sql
-- Runs monthly, 7 days before month-end
CREATE OR REPLACE FUNCTION create_next_month_partitions()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  next_month_start DATE := date_trunc('month', NOW() + INTERVAL '1 month');
  next_month_end DATE := next_month_start + INTERVAL '1 month';
  partition_name TEXT;
BEGIN
  -- Repeat for all 8 ledgers
  partition_name := 'permission_audit_log_' || to_char(next_month_start, 'YYYY_MM');
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF permission_audit_log FOR VALUES FROM (%L) TO (%L)',
    partition_name, next_month_start, next_month_end
  );
  
  -- Repeat for inventory_movements, commissioning_records, etc.
END;
$$;
```

Benefits:
- Indexes per partition stay small (~1M rows per partition for `permission_audit_log` at peak load)
- Queries with date filters (the common case) hit only relevant partitions
- Old partitions can be detached for cold archival in Phase 2 without rewrites
- Vacuum/analyze run per-partition

### 14.4 Indexes per partition

Each partition gets indexes inherited from the parent. Standard set for permission_audit_log:

```sql
CREATE INDEX idx_permission_audit_log_actor_occurred 
  ON permission_audit_log(actor_user_id, occurred_at DESC);

CREATE INDEX idx_permission_audit_log_event_type_occurred 
  ON permission_audit_log(event_type, occurred_at DESC);

CREATE INDEX idx_permission_audit_log_target_user_occurred 
  ON permission_audit_log(target_user_id, occurred_at DESC);

CREATE INDEX idx_permission_audit_log_target_permission_occurred 
  ON permission_audit_log(target_permission_id, occurred_at DESC);

CREATE INDEX idx_permission_audit_log_target_entity 
  ON permission_audit_log(target_entity_id, occurred_at DESC)
  WHERE target_entity_id IS NOT NULL;

CREATE INDEX idx_permission_audit_log_request_id 
  ON permission_audit_log(request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX idx_permission_audit_log_source_event 
  ON permission_audit_log(source_event_id)
  WHERE source_event_id IS NOT NULL;
```

Partial indexes (`WHERE target_entity_id IS NOT NULL`) skip indexing irrelevant rows — saves storage.

### 14.5 The 8 append-only ledgers — quick reference

| Ledger | Module | Primary use | Volume estimate |
|---|---|---|---|
| `permission_audit_log` | (cross-cutting) | Permission grants/revokes/overrides; admin exceptions; sensitive field reads; binding changes | ~10M/year at scale |
| `inventory_movements` | M7 | Stock receive/issue/transfer/write-off; FIFO layer consumption | ~2M/year |
| `commissioning_records` | M6 | Per-equipment test results; ULC verification attachments | ~500k/year |
| `project_acceptance_records` | M6 | Customer sign-off; handover acknowledgments | ~50k/year |
| `vendor_performance_scores` | M8 | Period scoring; grade transitions; auto-degrade events | ~10k/year |
| `contractor_performance_scores` | M10 | Same pattern as vendor | ~10k/year |
| `gl_journal_lines` | M11 | Every accounting line item ever posted | ~20M/year at scale |
| `appointment_change_log` | M12 | Every reschedule/reassign/state-change on appointments | ~5M/year |
| `report_snapshots` | M13 | Immutable historical report instances | ~100k/year |

Total scale: ~38M rows/year combined. Monthly partitions keep individual partition sizes manageable.

## 15. Permission audit event type taxonomy

`permission_audit_log` has 18+ enumerated event types covering everything that happens in the permissions runtime. Each has a defined JSON payload schema.

### 15.1 Event type catalog

| Event type | Triggered by | Required JSONB fields | Optional fields |
|---|---|---|---|
| `role_permission_granted` | Admin grants a permission to a role | `role_id`, `permission_id`, `previous_state`, `new_state`, `ui_state_override` | `notes` |
| `role_permission_revoked` | Admin revokes a permission from a role | `role_id`, `permission_id`, `previous_state` | `notes` |
| `role_permission_ui_state_changed` | Admin changes UI state (hidden/disabled/interactive) for a role permission | `role_id`, `permission_id`, `previous_ui_state`, `new_ui_state` | |
| `user_override_granted` | Admin grants per-user override | `user_id`, `permission_id`, `override_state`, `is_temporary`, `expires_at` | `notes` |
| `user_override_revoked` | Admin revokes per-user override | `user_id`, `permission_id`, `revocation_reason` | |
| `user_override_expired` | System auto-revokes expired temporary override | `user_id`, `permission_id`, `originally_expired_at` | |
| `field_visibility_role_changed` | Admin changes field visibility for a role | `role_id`, `flag_id`, `previous_state`, `new_state` | |
| `field_visibility_user_override_granted` | Admin grants per-user field visibility override | `user_id`, `flag_id`, `override_state` | |
| `field_visibility_user_override_revoked` | Admin revokes per-user field visibility override | `user_id`, `flag_id` | |
| `data_scope_role_changed` | Admin changes scope for a role | `role_id`, `resource`, `previous_scope_id`, `new_scope_id` | |
| `data_scope_user_override_granted` | Admin grants per-user scope override | `user_id`, `resource`, `override_scope_id` | |
| `data_scope_user_override_revoked` | Admin revokes per-user scope override | `user_id`, `resource` | |
| `role_created` | Admin creates new role | `role_id`, `display_name`, `cloned_from_role_id` | |
| `role_archived` | Admin archives role | `role_id` | |
| `admin_exception_invoked` | Admin executes an admin-exception action (e.g., `clients:overrideSla`) | `permission_id`, `target_entity_id`, `target_entity_type`, `reason` | `additional_context` |
| `regulatory_block_overridden` | Admin overrides a §0.4 #12 regulatory block | `override_type`, `target_entity_id`, `blocked_action`, `valid_until`, `reason`, `emergency_justification` | |
| `permission_definition_deprecated` | Admin marks permission deprecated | `permission_id`, `deprecation_reason`, `replaced_by_action_name` | |
| `field_read_with_audit` | User reads a sensitive field (banking, SIN, etc.) | `target_resource`, `target_field_section`, `target_entity_id` | |
| `status_binding_changed` | Admin changes a status binding value | `status_table_name`, `status_row_id`, `binding_name`, `previous_value`, `new_value` | |
| `status_transition_executed` | Action handler executes a state transition | `status_table_name`, `from_status_row_id`, `to_status_row_id`, `entity_type`, `entity_id`, `triggered_action` | `effects_executed` |
| `co_sign_executed` | Second signer completes a co-sign action (e.g., A + Acc hardClose) | `constraint_name`, `entity_type`, `entity_id`, `first_signer_user_id`, `second_signer_user_id` | |

### 15.2 Sample event payloads

**`role_permission_granted`:**
```json
{
  "id": "...",
  "event_type": "role_permission_granted",
  "actor_user_id": "admin_user_123",
  "actor_type": "user",
  "occurred_at": "2026-05-12T14:23:45.123Z",
  "after_state": {
    "role_id": "pm_role",
    "permission_id": "invoices_approve",
    "previous_state": "default",
    "new_state": "granted",
    "ui_state_override": null
  },
  "reason": "PM tier-2 promotion; approval authority added",
  "ip_address": "10.0.0.1",
  "request_id": "req_abc123"
}
```

**`admin_exception_invoked` (clients:overrideSla):**
```json
{
  "id": "...",
  "event_type": "admin_exception_invoked",
  "actor_user_id": "admin_user_456",
  "actor_type": "user",
  "occurred_at": "2026-05-12T16:45:00Z",
  "target_user_id": null,
  "target_permission_id": "clients_overrideSla",
  "target_entity_id": "client_xyz_id",
  "target_entity_type": "client",
  "before_state": {
    "sla_response_time_hours": 4
  },
  "after_state": {
    "sla_response_time_hours": 24
  },
  "reason": "Customer requested temporary relaxation due to internal IT migration; 30-day duration confirmed in email thread."
}
```

**`regulatory_block_overridden` (WSIB expired):**
```json
{
  "id": "...",
  "event_type": "regulatory_block_overridden",
  "actor_user_id": "admin_user_789",
  "actor_type": "user",
  "occurred_at": "2026-05-12T09:15:30Z",
  "target_entity_id": "contractor_abc_id",
  "target_entity_type": "contractor",
  "after_state": {
    "override_type": "contractor_wsib_expired",
    "blocked_action": "contractor_work_orders:create",
    "valid_until": "2026-05-19T23:59:59Z"
  },
  "reason": "WSIB renewal in process; CRA confirmation received; portal lag expected",
  "notes": "Emergency dispatch required for service call SC-2026-0512-003"
}
```

**`field_read_with_audit`:**
```json
{
  "id": "...",
  "event_type": "field_read_with_audit",
  "actor_user_id": "acc_user_001",
  "actor_type": "user",
  "occurred_at": "2026-05-12T11:30:15.789Z",
  "after_state": {
    "target_resource": "vendors",
    "target_field_section": "banking",
    "target_entity_id": "vendor_def_id"
  },
  "request_id": "req_xyz789"
}
```

**`co_sign_executed` (hard close):**
```json
{
  "id": "...",
  "event_type": "co_sign_executed",
  "actor_user_id": "admin_user_456",
  "actor_type": "user",
  "occurred_at": "2026-05-12T23:59:59Z",
  "after_state": {
    "constraint_name": "hard_close_co_sign",
    "entity_type": "accounting_period",
    "entity_id": "period_2026_q1_id",
    "first_signer_user_id": "acc_user_002",
    "first_signer_role": "accounting",
    "first_signed_at": "2026-05-12T17:30:00Z",
    "second_signer_user_id": "admin_user_456",
    "second_signer_role": "admin"
  }
}
```

### 15.3 Event correlation

`request_id` correlates audit events with the originating HTTP request. Standard middleware pattern:

```typescript
// Pseudocode for build phase
function requestIdMiddleware(req, res, next) {
  req.id = req.headers['x-request-id'] || uuidv4();
  // Set on response for client tracking
  res.setHeader('x-request-id', req.id);
  // Set as session-level Postgres setting
  db.query(`SET app.request_id = '${req.id}'`);
  next();
}
```

Trigger functions (or application code) reads `current_setting('app.request_id')` and includes in audit row.

`source_event_id` correlates chained events. Example: a single state transition (`invoices:approve` Sent → Approved) emits:
1. `status_transition_executed` (root event)
2. `creates_gl_entry` effect → `gl_journal_lines` row (source_event_id = root)
3. `auto_notifies_customer` effect → email log (source_event_id = root)

Querying by `source_event_id` reconstructs the full effect chain.

## 16. Audit query API

Three first-class API endpoints for admins + compliance. Plus M13 reports module integration.

### 16.1 Entity-history endpoint

`GET /api/admin/audit/entity-history?entity_type={type}&entity_id={id}&from={date}&to={date}`

Returns full audit trail for a specific entity (e.g., "show all changes to invoice X").

```json
// Response shape
{
  "entity_type": "invoice",
  "entity_id": "...",
  "events": [
    {
      "id": "...",
      "occurred_at": "...",
      "actor": { "user_id": "...", "user_name": "Jane Doe", "role": "PM" },
      "event_type": "status_transition_executed",
      "summary": "Status changed: Draft → Pending Approval",
      "details": { ... }
    },
    ...
  ],
  "total_count": 47,
  "page": 1,
  "page_size": 50
}
```

Permission: `audit:view:entity` — A always; PM for own projects' entities only.

### 16.2 User-actions endpoint

`GET /api/admin/audit/user-actions?user_id={id}&from={date}&to={date}&event_types={list}`

Returns all actions performed by a specific user.

Permission: `audit:view:user` — A only (security review).

### 16.3 Event-stream endpoint

`GET /api/admin/audit/event-stream?event_type={type}&from={date}&to={date}&filter_by_entity_type={type}`

Returns events filtered by type + time window. Compliance use cases ("show all admin exceptions invoked in Q4").

Permission: `audit:view:stream` — A and compliance role only.

### 16.4 Power-user SQL view

For complex queries that don't fit the API pattern, A has direct SELECT access to audit tables through a read-only `audit_log_view` that combines `permission_audit_log` + the 7 module ledgers behind a single query interface:

```sql
CREATE OR REPLACE VIEW audit_log_combined AS
SELECT 
  'permission_audit_log' AS source_table,
  id, actor_user_id, actor_type, occurred_at, event_type,
  target_user_id, target_permission_id, target_resource, target_entity_id,
  before_state, after_state, reason, notes, ip_address, request_id, source_event_id
FROM permission_audit_log
UNION ALL
SELECT 
  'inventory_movements' AS source_table,
  id, actor_user_id, actor_type, occurred_at, event_type,
  NULL AS target_user_id, NULL AS target_permission_id, 
  'inventory_items' AS target_resource, item_id AS target_entity_id,
  before_state, after_state, reason, notes, NULL AS ip_address, request_id, source_event_id
FROM inventory_movements
UNION ALL
-- ... repeat for 6 more ledgers
;
```

Used sparingly — primary access pattern is via API. View available for export-to-CSV via M13.

### 16.5 M13 reports integration

`audit_log_combined` view exposed as a data source in M13 reports module. Pre-built standard reports include:

- "Audit Trail by User" (admin's user_id filter)
- "Admin Exceptions Last 90 Days" (event_type = admin_exception_invoked)
- "Sensitive Field Reads" (event_type = field_read_with_audit, filtered by section = 'banking')
- "Regulatory Override History" (event_type = regulatory_block_overridden)
- "Co-Sign Activity" (event_type = co_sign_executed)
- "Permission Grant Changes Last Quarter" (role_permission_granted / role_permission_revoked)

These appear in M13's Compliance category. Default role access: A and Acc.

## 17. Append-only audit performance at scale

### 17.1 Volume estimates

Per §14.5, ~38M rows/year across 8 ledgers at steady-state. Top contributors:
- `gl_journal_lines` ~20M (~7 lines per accounting entry × ~3M entries/year)
- `permission_audit_log` ~10M (most user actions + sensitive field reads)
- `appointment_change_log` ~5M (scheduling-heavy operations)

### 17.2 Insert performance

- Single-row inserts: <5ms at p99 (target — actually <2ms typical)
- Batched audit-on-read flushes (Pass 4): <5ms per batch of 50
- Async fire-and-forget pattern (no blocking on user request response)

### 17.3 Query performance per partition pattern

With monthly partitioning + the indexes from §14.4:

| Query pattern | Hits which partitions | p99 latency |
|---|---|---|
| "User X actions last 7 days" | 1 partition | <100ms |
| "Entity Y history (all time)" | All historical partitions | 100-500ms (acceptable for admin tool) |
| "All admin exceptions Q4 2025" | 3 partitions | <500ms |
| "Sensitive field reads today" | 1 partition | <200ms |

PostgreSQL partition pruning ensures only relevant partitions are scanned.

### 17.4 Cold archival strategy (Phase 2 deferred)

Phase 2 plan (committed but not implemented at v1):

1. Partitions older than 12 months DETACHed from parent
2. DETACHed partitions converted to compressed Parquet files via `pg_dump` + custom export
3. Parquet files uploaded to S3 Glacier Deep Archive
4. Metadata table tracks which months are archived
5. Compliance query needing >12 months data triggers async restore from S3 (24-48 hour SLA)
6. Restored data attached to parent partition temporarily; detached after query window

At v1, no archival — partitions stay in hot storage permanently. Storage cost acceptable for first 3-5 years.

### 17.5 Vacuum / analyze

PostgreSQL autovacuum handles partition-level vacuum. With partitioning, vacuum runs per-partition; old partitions vacuum once (since they're immutable append-only) and don't need re-running.

Manual ANALYZE per partition after partition creation completes (within hours of first inserts).

## 18. Append-only ledger pattern across the 7 module ledgers

Each module ledger applies the pattern from §14 but adds ledger-specific columns. Specified per ledger:

### 18.1 `inventory_movements` (M7)

```sql
CREATE TABLE inventory_movements (
  -- Standard append-only columns (from §14.1)
  id, actor_user_id, actor_type, occurred_at, event_type, before_state, after_state,
  reason, notes, ip_address, user_agent, request_id, source_event_id, occurred_month,
  
  -- M7-specific columns
  item_id UUID NOT NULL REFERENCES inventory_items(id),
  from_location_id UUID REFERENCES stock_locations(id),
  to_location_id UUID REFERENCES stock_locations(id),
  quantity_change NUMERIC NOT NULL,           -- positive = receive, negative = issue
  unit_cost_fifo NUMERIC,                     -- FIFO cost of this layer
  fifo_layer_id UUID,                         -- which FIFO layer consumed
  serial_numbers TEXT[],                      -- for serialized items
  related_po_id UUID,
  related_project_id UUID
) PARTITION BY RANGE (occurred_month);

-- Event types specific to M7:
-- 'receive', 'issue_to_project', 'transfer', 'write_off', 'adjustment_count',
-- 'reservation_consumed', 'reservation_released', 'fifo_layer_consumed'
```

### 18.2 `commissioning_records` (M6)

```sql
CREATE TABLE commissioning_records (
  -- Standard columns
  ...
  
  -- M6-specific
  project_id UUID NOT NULL REFERENCES projects(id),
  equipment_id UUID NOT NULL,
  test_name TEXT NOT NULL,
  test_result TEXT NOT NULL CHECK (test_result IN ('pass', 'fail', 'pending_recheck')),
  attached_ulc_cert_url TEXT,
  technician_user_id UUID REFERENCES users(id)
);

-- Event types: 'test_executed', 'test_recheck_scheduled', 'ulc_cert_attached'
```

### 18.3 `project_acceptance_records` (M6)

```sql
CREATE TABLE project_acceptance_records (
  -- Standard columns
  ...
  
  -- M6-specific
  project_id UUID NOT NULL REFERENCES projects(id),
  acceptance_type TEXT NOT NULL CHECK (acceptance_type IN ('phase_completion', 'substantial_completion', 'final_handover')),
  customer_signature_image_url TEXT,
  signed_by_customer_name TEXT,
  signed_by_customer_email TEXT,
  warranty_start_date DATE,
  handover_package_url TEXT
);

-- Event types: 'phase_accepted', 'substantial_completion_signed', 'final_handover_signed'
```

### 18.4 `vendor_performance_scores` + `contractor_performance_scores` (M8 + M10)

Identical pattern:

```sql
CREATE TABLE vendor_performance_scores (
  -- Standard columns
  ...
  
  -- M8/M10-specific
  entity_id UUID NOT NULL,                    -- vendor_id or contractor_id
  scoring_period_start DATE NOT NULL,
  scoring_period_end DATE NOT NULL,
  on_time_completion_pct NUMERIC,
  quality_score NUMERIC,
  safety_incidents_count INTEGER,
  total_volume_value NUMERIC,
  computed_grade TEXT CHECK (computed_grade IN ('A', 'B', 'C', 'D')),
  previous_grade TEXT,
  triggered_auto_degrade BOOLEAN NOT NULL DEFAULT FALSE
);

-- Event types: 'period_score_computed', 'auto_degrade_applied', 'preferred_status_removed', 'preferred_status_restored'
```

### 18.5 `gl_journal_lines` (M11)

Largest table by row count. Special partitioning + indexing.

```sql
CREATE TABLE gl_journal_lines (
  -- Standard columns
  ...
  
  -- M11-specific
  journal_entry_id UUID NOT NULL REFERENCES gl_journal_entries(id),
  account_id UUID NOT NULL REFERENCES coa(id),
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  currency_id UUID REFERENCES currency_codes(id),
  exchange_rate NUMERIC,
  foreign_currency_amount NUMERIC,
  line_description TEXT,
  cost_center_id UUID,
  
  CONSTRAINT gl_journal_lines_debit_or_credit CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

-- Event types: 'auto_posted', 'manual_posted', 'reversal_posted'
-- Note: reversals always insert new lines; never modify existing
```

### 18.6 `appointment_change_log` (M12)

```sql
CREATE TABLE appointment_change_log (
  -- Standard columns
  ...
  
  -- M12-specific
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  change_type TEXT NOT NULL CHECK (change_type IN (
    'created', 'rescheduled', 'reassigned', 'cancelled', 'status_changed',
    'customer_confirmed', 'tech_clock_in', 'tech_clock_out', 'sla_breach'
  )),
  before_resource_assignments JSONB,
  after_resource_assignments JSONB,
  geolocation_data JSONB                       -- for clock-in/out events; subject to §0.4 #13 retention
);
```

### 18.7 `report_snapshots` (M13)

```sql
CREATE TABLE report_snapshots (
  -- Standard columns
  ...
  
  -- M13-specific
  report_id UUID NOT NULL REFERENCES report_definitions(id),
  parameters JSONB NOT NULL,
  output_pdf_url TEXT,
  output_csv_url TEXT,
  output_excel_url TEXT,
  generated_for_subscription_id UUID,
  retention_until DATE                         -- per operator policy in Settings
);
```

## 19. Reversal pattern (writing offsets, never modifying)

§0.4 #10's append-only requirement means we never UPDATE or DELETE. To "void" or "correct" a prior entry, INSERT a new row with `event_type = 'reversal'` and `source_event_id` linking back.

### 19.1 Example: GL reversal

Original entry (incorrectly posted by Acc):
```json
{
  "id": "entry_001",
  "event_type": "manual_posted",
  "actor_user_id": "acc_user",
  "occurred_at": "2026-05-10T15:00:00Z",
  "debit": 1000,
  "credit": 0,
  "account_id": "5100 - COGS",
  "line_description": "Invoice INV-2024-555 cost (WRONG ACCOUNT - should be 5200)"
}
```

Reversal:
```json
{
  "id": "entry_002",
  "event_type": "reversal_posted",
  "actor_user_id": "acc_user_other",   // separation of duties; different user
  "occurred_at": "2026-05-11T09:30:00Z",
  "debit": 0,
  "credit": 1000,
  "account_id": "5100 - COGS",
  "line_description": "Reversal of entry_001 - wrong account",
  "source_event_id": "entry_001"
}
```

Correction:
```json
{
  "id": "entry_003",
  "event_type": "manual_posted",
  "actor_user_id": "acc_user_other",
  "occurred_at": "2026-05-11T09:31:00Z",
  "debit": 1000,
  "credit": 0,
  "account_id": "5200 - Materials Direct",
  "line_description": "Correction of entry_001 - posting to correct account",
  "source_event_id": "entry_001"
}
```

Three rows; all permanent. Net effect on COGS account: 0 (cancels). Net effect on Materials Direct: +$1000. Audit trail intact.

### 19.2 Example: Invoice void

Original status_transition_executed:
```json
{
  "id": "event_a",
  "event_type": "status_transition_executed",
  "occurred_at": "...",
  "entity_type": "invoice",
  "entity_id": "INV-001",
  "from_status_row_id": "approved_status_id",
  "to_status_row_id": "sent_status_id"
}
```

Void:
```json
{
  "id": "event_b",
  "event_type": "status_transition_executed",
  "actor_user_id": "admin_user",
  "occurred_at": "...",
  "entity_type": "invoice",
  "entity_id": "INV-001",
  "from_status_row_id": "sent_status_id",
  "to_status_row_id": "void_status_id",
  "source_event_id": "event_a",    // optional but recommended for chain tracking
  "reason": "Customer cancelled order"
}
```

The invoice rows in the main `invoices` table get UPDATEd (status_id changes to void) — `invoices` is not append-only, only the audit log is. The audit log captures the transition immutably.

## 20. Compliance export

### 20.1 What compliance officers need

For external audit (SOC 2, GDPR right-to-access requests, regulatory investigations):

- Filtered audit slice by time + event type + actor + target
- Exported in tamper-evident format (PDF report or signed CSV with hash chain)
- Includes integrity proof (cryptographic hash of each row chained to prior)

### 20.2 Hash chain for tamper-evidence (deferred to Phase 2)

At v1, audit completeness is enforced by trigger-blocked UPDATE/DELETE. No row-level hash chain.

Phase 2 enhancement (for SOC 2 and similar): add `row_hash` column computed at insert time:

```
row_hash = SHA256(prev_row_hash || row_content_json)
```

Any tampering (even at the file system level) breaks the chain. Verification cron runs nightly.

Not at v1 — the trigger-blocked write pattern + audit-immutable architecture is sufficient for most operator compliance needs. SOC 2 audit comes later.

### 20.3 Compliance export endpoint

`POST /api/admin/audit/export`

Body:
```json
{
  "from": "2025-10-01",
  "to": "2025-12-31",
  "event_types": ["admin_exception_invoked", "regulatory_block_overridden"],
  "actor_user_ids": ["..."],
  "target_entity_types": ["client", "vendor"],
  "format": "pdf"  // or "csv", "json"
}
```

Returns: signed URL to download the export. Export PDF includes eight-layer print protection (per §0.4 #9).

Permission: `audit:export` — A and compliance role only.

## 21. Open questions (Pass 6)

1. **Should every state transition emit a `status_transition_executed` audit event?** Decision: YES — uniformly. Storage cost is acceptable; forensic value is high. Phase 3 of Pass 3 algorithm tracks this.

2. **Should view-only field reads (non-sensitive) be audited?** Decision: NO at v1. Only flags with `requires_audit_on_read=TRUE` (the 9 sensitive flags from Pass 4 §17). Non-sensitive reads would explode the audit log.

3. **Should `permission_audit_log` track FAILED action attempts (denied actions)?** Decision: YES for sensitive + admin-exception denials only. NO for routine denials (e.g., SR trying to view banking — repeatedly denied as designed). Sensitive denials may indicate attack or misconfiguration; routine denials are noise.

4. **Should we keep IP addresses in audit logs given privacy concerns?** Decision: YES at v1 — operationally critical for forensic analysis. Retention 12 months for IP only (the IP column nulled after 12 months while other columns retained per row's retention policy). Phase 2 GDPR-compliant configurable retention.

5. **Cross-row hash chain for tamper evidence at v1?** Decision: NO at v1. Append-only enforcement via triggers is sufficient. Hash chain Phase 2.

6. **Should audit retention be configurable per event type?** Decision: NO at v1 — uniform "keep forever" for permissions audit. Module ledgers may have specific retention (e.g., `report_snapshots.retention_until` per snapshot). Phase 2 considers per-event-type configurable retention.

7. **Where do "system" actor events get logged?** Decision: same `permission_audit_log` table; `actor_user_id = NULL`, `actor_type = 'system'`. Distinguishable in queries; not segregated to separate table.

## 22. Performance summary

| Operation | Target | Strategy |
|---|---|---|
| Single audit row insert | <2ms p99 | Indexed insert; partition pruning to current month only |
| Batched insert (50 rows) | <5ms p99 | Single multi-value INSERT statement |
| Entity history query (last 90 days) | <200ms p99 | Index on `target_entity_id` + partition pruning |
| User actions query (last 7 days) | <100ms p99 | Index on `actor_user_id` + partition pruning to 1 partition |
| Compliance export (1 month, all events) | <5s | Full scan of 1 partition; streamed result |
| Cross-ledger combined view query | <2s | UNION ALL view; relies on per-ledger indexes |

## 23. Migration order extension

Adding to Pass 5's 23-step migration order:

- Step 24: Convert `permission_audit_log` to partitioned table (recreate as partitioned; migrate existing rows if any)
- Step 25: Convert other 7 ledgers to partitioned tables (`inventory_movements`, `commissioning_records`, `project_acceptance_records`, `vendor_performance_scores`, `contractor_performance_scores`, `gl_journal_lines`, `appointment_change_log`, `report_snapshots`)
- Step 26: Create initial 3 months of partitions per ledger (current + previous + next)
- Step 27: Install monthly partition-creation cron job
- Step 28: Apply UPDATE/DELETE blocking triggers to all 8 ledgers
- Step 29: Create `audit_log_combined` UNION view
- Step 30: Install indexes per partition (the standard set from §14.4)
- Step 31: Install audit query API endpoints
- Step 32: Seed M13 compliance reports (audit data source registration)

Pass 11 covers production migration logistics.

---

═══════════════════════════════════════════════════════════════════
# 24. What's next (Pass 7 preview)
═══════════════════════════════════════════════════════════════════

**Pass 7: Request-admin-access workflow.**

The M2 audit committed to a request-admin-access workflow: users who need a temporary or permanent permission they don't have can REQUEST it; admins approve/reject; an audit trail of every request + decision is kept. Pass 7 specifies it end-to-end:

- The `request_admin_access` table (specified in Pass 2 §9; expanded here)
- Request lifecycle states (Pending → Approved → Granted → Expired → Revoked, plus Rejected paths)
- Request types (one-time vs ongoing; temporary vs permanent; specific action vs broader role grant)
- The approval workflow (Admin sees request notification; reviews context; approves with optional duration limit; auto-grants user_permission_override)
- Notification routing (Slack/email/in-app to admins on request creation)
- Auto-expiry handling (temporary grants expire via the daily cron from Pass 3)
- Edge cases (multiple pending requests for same user-permission; user re-requesting after rejection; admin self-requesting)
- Integration with Pass 4 audit-on-read for sensitive permissions
- UI surfaces (Pass 8 elaborates on the UI itself; Pass 7 specifies what data flows)

Pass 7 will produce v0.7 of the design doc.

---

**End of v0.6.** Pass 6 (Append-Only Audit Pattern) complete. Uniform append-only ledger pattern specified for all 8 ledgers (permission_audit_log + 7 module ledgers). Time-based monthly partitioning at v1. PostgreSQL UPDATE/DELETE triggers block modifications. 18+ event types enumerated for permission_audit_log with JSON payload schemas. Reversal pattern (write offsets, never modify) catalogued. 3 first-class API endpoints (entity-history, user-actions, event-stream) + M13 compliance reports integration. Cold archival deferred to Phase 2. Hash-chain tamper-evidence deferred to Phase 2. Performance budget specified (<2ms insert; <200ms entity history; <2s cross-ledger view). 7 Pass 6 open questions resolved. Migration order extended (+9 steps; now 32 total).
