# NEXVELON_SESSION_T_HANDOFF.md

> **Hand-off for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-T codification.
> Session T completed Pass 5 of the Permissions Design (Status Surface Binding Layer).
> Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session T state + Pass 5 summary
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final — audit complete)
>   5. `NEXVELON_PERMISSIONS_DESIGN.md` v0.5 — Passes 1-5 of 11 complete
>   6. `NEXVELON_ROADMAP.md`
>   7. `NEXVELON_SESSION_S_HANDOFF.md` — prior session (Pass 4)
>   8. Earlier handoffs (R through A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session T focus

Completed Pass 5 of the Permissions Design (Status Surface Binding Layer). Implements audit §0.4 #4 ("lookup-table rows carry behavior bindings") across the 80 status surfaces catalogued M1-M13. New schema with polymorphic bindings table; 14 standard binding names; state transition definitions with effect executor; integration with Pass 3 A1 algorithm. State transition matrices specified including Ontario 60-day lien clock enforcement. Operator vs system bindings catalogued. Seven open questions resolved.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_PERMISSIONS_DESIGN.md` | Replaced v0.4 with v0.5 — Pass 4 condensed to §11 summary (full at de1905f); Pass 5 full content §12-§23 |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session T state |
| `NEXVELON_ROADMAP.md` | Item 2 progress note updated: Pass 5 of 11 complete |
| `NEXVELON_SESSION_T_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged.

═══════════════════════════════════════════════════════════════════════════════
## 2. PASS 5 SUMMARY (Status Surface Binding Layer)
═══════════════════════════════════════════════════════════════════════════════

### New schema

3 new tables + 1 column added to existing:
- `status_behavior_bindings` (polymorphic): status_table_name + status_row_id + binding_name + value (typed) + is_system_locked + lifecycle
- `status_transition_definitions`: from_status_row_id + to_status_row_id + is_allowed + requires_admin_approval + requires_reason_capture + required_action_name + triggers_effects JSONB + is_system_locked
- `effective_status_bindings_cache`: serialized JSONB map per status row for hot path
- `permission_definitions.binding_dependencies` JSONB column: tells resolver which bindings to check for this action

### 14 standard binding names across 3 categories

**Action-gating (8):**
- allows_edit, allows_delete, allows_send, allows_payment, allows_reversal, allows_state_transition, is_terminal, requires_admin_to_modify

**Effect-triggering (6):**
- triggers_notification_template, triggers_late_fee, creates_gl_entry, starts_lien_clock, auto_notifies_customer, triggers_holdback_release

**UI-driving (5):**
- display_color, display_badge, display_priority, display_icon, display_show_in_filter_chips

### 80 status surfaces × bindings inventory

~2000 binding rows + ~600 transition rows at v1 seed. Coverage:
- M1 (15 surfaces): client_statuses, client_tiers, customer_types, site_statuses, service_contract_statuses, onboarding_gate_types, etc.
- M2 (11 surfaces): employee_statuses, certification_types, employee_absence_types, etc.
- M5 (5 surfaces): quote_statuses, quote_revision_statuses, etc.
- M6 (8 surfaces): project_statuses, change_order_statuses, commissioning_statuses, etc.
- M7 (6 surfaces): inventory_movement_types, purchase_order_statuses, inventory_adjustment_reasons, etc.
- M8 (4 surfaces): vendor_statuses, vendor_onboarding_gate_types, vendor_performance_grades, etc.
- M9 (5 surfaces): invoice_statuses (11 statuses), invoice_types, payment_statuses, ap_bill_statuses, credit_note_statuses
- M10 (5 surfaces): contractor_statuses, contractor_wo_statuses (12 statuses), contractor_categories, contractor_onboarding_gate_types, contractor_labor_rate_types
- M11 (6 surfaces): gl_entry_statuses, period_statuses, tax_filing_statuses, etc.
- M12 (4 surfaces): appointment_statuses, dispatch_record_statuses, sla_breach_statuses, priority_levels
- M13 (4 surfaces): report_statuses, report_categories, etc.

### Action handler integration

```typescript
// Standard pattern
const bindings = await getEffectiveBindings('invoice_statuses', invoice.status_id);
if (!bindings.allows_edit) {
  throw new BindingDeniedError(...);
}
```

### State transition handler with effect executor

```typescript
const transition = await getTransition('invoice_statuses', invoice.status_id, targetStatus.id);
if (!transition.is_allowed) throw TransitionDeniedError;
if (transition.requires_admin_approval && !user.isAdmin) throw AdminApprovalRequiredError;
if (transition.requires_reason_capture && !context.reason) throw ReasonRequiredError;

await db.update('invoices', invoice.id, { status_id: targetStatus.id });
await executeEffects(transition.triggers_effects, context);
```

### Effect types (executor)

- create_gl_entry — synchronous, atomic with transition (single transaction)
- send_email — async via job queue
- update_field — synchronous
- schedule_followup — async via scheduler queue

All effects idempotent; deduplication via side table.

### Integration with Pass 3 A1

New Phase 3.3 added between regulatory expiry (3.2) and audit logging (Phase 4):

```
PHASE 3.3: Status binding check
  3.3.1: Determine binding dependencies for this action (from permission_definitions.binding_dependencies)
  3.3.2: For each dependency:
    - Fetch target entity
    - Get bindings from cache
    - Compare to expected
    - If mismatch: final_grant = FALSE, capture reason, return
  3.3.3: If all pass, final_grant unchanged
```

Overhead: <1ms (single indexed cache lookup + comparison). Total A1 budget preserved at <5ms p99.

### State transition matrices (samples)

invoice_statuses 11×11 matrix: Draft → Pending → Approved → Sent (locked) → Viewed → Partial Paid → Paid (terminal); plus Void/Cancelled/Refunded branches. Sent → editable: NEVER (system-locked per §0.4 #8).

contractor_wo_statuses with Ontario 60-day lien clock: Lien Period → Closed requires current_date >= lien_started_at + 60 days; otherwise transition denied with reason captured. Handler enforces; system-locked.

### Operator-configurable vs system-locked

**System-locked (🔒)** enforce audit commitments:
- §0.4 #8 immutable snapshots: allows_edit=FALSE on Sent statuses
- §0.4 #11 separation of duties: co-sign requirement on hardClose
- §0.4 #12 regulatory expiry: WSIB expired → On Hold transition
- §0.4 #13 geolocation retention: 30-day default
- PCI compliance: full_card_number visibility
- Canadian Construction Act: 45-day holdback release timing
- Ontario lien deadline: 60-day clock on Trade Contractor WOs
- Append-only ledgers: inventory movements, commissioning, GL entries

**Operator-configurable (🟢):**
- Custom statuses added by operator
- Late fee thresholds
- Notification template assignments
- UI drivers (colors, badges, priorities, icons)
- Approval thresholds
- Retention day count (above minimum)
- Reorder thresholds

**Hybrid bindings:** existence locked, value tunable (partial-edit UI).

### Performance

- Cache hit: <1ms (single indexed read returning full JSONB binding map)
- ~400 status rows × ~5 bindings = ~50KB fits in memory; effectively zero-cost
- Effects async fire-and-forget where possible
- GL entry creation synchronous + atomic with transition (single transaction)

### Failure modes

- Cache lookup fails → fall back to base table query
- Binding row not found for expected binding → fail-closed (FALSE for action gates)
- Transition not found → deny with generic reason
- Async effect failure → retry per policy
- Synchronous effect failure (e.g., GL entry) → rollback transition

### Migration order extended

7 new steps after Pass 2's 16-step migration:
17. Create status_behavior_bindings table
18. Create status_transition_definitions table
19. Create effective_status_bindings_cache table
20. Add binding_dependencies column to permission_definitions
21. Seed status_behavior_bindings from audit catalog (~2000 rows)
22. Seed status_transition_definitions from audit (~600 rows)
23. Populate effective_status_bindings_cache (lazy fill via first read)

### Two architectural decisions locked

1. Bindings as polymorphic separate table (not columns on each of 80 status tables) — flexibility for new bindings; simpler operator UI; easier cross-status reporting
2. Binding check fits inside Pass 3 A1 Phase 3 as third cross-cutting constraint (after separation of duties + regulatory expiry); uniform treatment

### Seven Pass 5 open questions resolved

1. Binding version history: YES (audit logged)
2. Multi-status entities: handlers query bindings per-status; no automated combination
3. Effect execution at scale: async queue + ops monitoring
4. Operator-added binding names: NO at v1; Phase 2
5. Conditional bindings: NO at v1; handler logic; Phase 2 consideration
6. Cross-status binding dependencies: handler queries sequentially at v1; Phase 2 rule engine
7. UI representation of locked bindings: SHOW with explanatory tooltip; transparency over concealment

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

**Feature audit:** 🏁 COMPLETE — 13 of 13 modules walked.

**Permissions design:** 5 of 11 passes complete.
- Pass 1: Action Vocabulary Catalog
- Pass 2: Database Schema (14 tables + 1 materialized view)
- Pass 3: Resolution Algorithm (3 algorithms; 7-phase A1)
- Pass 4: Field-Level Visibility Engine (2 layers + view defense-in-depth)
- Pass 5: Status Surface Binding Layer (polymorphic bindings + transitions + effects + Phase 3.3 integration)

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT — Pass 6 (Append-Only Audit Pattern)
═══════════════════════════════════════════════════════════════════════════════

Pass 6 details the audit pattern across the entire permissions runtime.

**Covers:**
- Insert-only enforcement (PostgreSQL triggers blocking UPDATE/DELETE — specified in Pass 2; fully detailed here)
- 18+ enumerated event types and when each fires
- JSON payload schema per event type
- Audit query patterns (admin debugging, compliance export, security review)
- Append-only ledger pattern propagation to other modules (M6 commissioning, M7 inventory movements, M11 GL — extending §0.4 #10 application across modules)
- Retention policies and Phase 2 cold storage archival strategy
- Audit data extraction for compliance reports
- Performance: how audit log scales to ~10M entries/year without degrading

Pass 6 will produce v0.6 of the design doc.

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. **Permissions Design Pass 5 of 11 complete (audit phase already closed).** Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md` v0.14, `NEXVELON_PERMISSIONS_DESIGN.md` v0.5, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you. Next pending work: Permissions Design Pass 6 (Append-Only Audit Pattern).

**End of Session T handoff.**
