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
> **Status:** v0.10 — Passes 1-10 complete. Pending: Pass 11 (Migration plan).
>
> Pass 1 condensed §1; full at `9008fad`.
> Pass 2 condensed §2; full at `1bafbd4`.
> Pass 3 condensed §3; full at `ff08703`.
> Pass 4 condensed §4; full at `de1905f`.
> Pass 5 condensed §5; full at `904bfe5`.
> Pass 6 condensed §6; full at `3c21e58`.
> Pass 7 condensed §7; full at `41734b6`.
> Pass 8 condensed §8; full at `c090599`.
> Pass 9 condensed §9; full at `7eb540e`.
> Pass 10 (Cross-Cutting Enforcement Patterns) full content begins at §10.

---

## 0. How to use this document

### 0.1 Purpose

Design specification for the Nexvelon permissions runtime.

### 0.2 Pass overview

| Pass | Scope | Status |
|---|---|---|
| 1 | Action vocabulary catalog | ✅ COMPLETE (`9008fad`) |
| 2 | Database schema | ✅ COMPLETE (`1bafbd4`) |
| 3 | Permission resolution algorithm | ✅ COMPLETE (`ff08703`) |
| 4 | Field-level visibility engine | ✅ COMPLETE (`de1905f`) |
| 5 | Status surface binding layer | ✅ COMPLETE (`904bfe5`) |
| 6 | Append-only audit pattern | ✅ COMPLETE (`3c21e58`) |
| 7 | Request-admin-access workflow | ✅ COMPLETE (`41734b6`) |
| 8 | Permissions editor UI | ✅ COMPLETE (`c090599`) |
| 9 | Effective-permissions caching strategy | ✅ COMPLETE (`7eb540e`) |
| 10 | Cross-cutting enforcement patterns | ✅ COMPLETE (this version) |
| 11 | Migration plan | PENDING |

### 0.3 Role abbreviations

**A** Admin, **PM** Project Manager, **SR** Sales Rep, **Tech** Technician, **Sub** Subcontractor (portal), **Acc** Accounting, **VO** View Only. Plus **Dispatcher** (M12), **Bookkeeper** (M11), **HR-role**, **Executive** (M13).

---

═══════════════════════════════════════════════════════════════════
# Parts I-IX — Passes 1-9 condensed summaries
═══════════════════════════════════════════════════════════════════

*Full content preserved at commits noted in §0.2.*

## 1. Pass 1 — Action vocabulary
`resource:verb[:qualifier]` naming. 8 verb categories. 4 qualifier categories. 140+ resources across 13 modules. 4-tier UI hierarchy + 6 cross-cut tabs. ~1260 actions catalogued.

## 2. Pass 2 — Schema
14 tables across 5 groups + 1 materialized view. Three decisions: one row per action; trigger-invalidated cache; orthogonal data scopes. 16-step migration order.

## 3. Pass 3 — Resolution algorithm
A1 action grant (7-phase: cache lookup → base resolution → Phase 3 constraints with SoD/regulatory/status binding sub-phases → audit). A2 data scope. A3 field visibility. <5ms p99 compound; <1ms cache hit; >95% hit rate target.

## 4. Pass 4 — Field visibility engine
Backend serialization pipeline + frontend `<FieldGated>` wrapper + view layer for 5 sensitive resources. 12 mask types. Async batched audit-on-read. 47-flag catalog with 1 never-granted (PCI), 9 audit-on-read, 3 row-level.

## 5. Pass 5 — Status binding layer
Polymorphic `status_behavior_bindings` across 80 status surfaces. 14 standard binding names (8 action-gating + 6 effect-triggering + 5 UI-driving). Phase 3.3 integration in A1. State transition matrices including Ontario 60-day lien clock enforcement.

## 6. Pass 6 — Append-only audit
8 ledgers sharing uniform pattern. Monthly time-based partitioning. 21 event types in permission_audit_log with JSON payload schemas. 3-layer query API (endpoints + M13 reports + audit_log_combined SQL view). ~38M rows/year combined.

## 7. Pass 7 — Request-admin-access workflow
State machine (Pending → Approved → Granted → Expired/Revoked). 4 request types. New `user_role_assignments` table. 30+ column schema with polymorphic target + dual reasoning capture. 8 edge cases. 9 new event types (30 total).

## 8. Pass 8 — Permissions editor UI
Workspace architecture (single page, 6 sections, persistent header + sidebar + main pane). Cross-section linking. Transactional save with conflict detection. WCAG 2.1 AA. 2 new event types (32 total).

## 9. Pass 9 — Caching strategy
4 caches with pull invalidation + 8 invalidation event types. Lazy-fill via INSERT ON CONFLICT. Warm-up on login + grant change. Stale-while-revalidate <5min for dashboards only. Read-replica capability ready (primary-only default). Multi-tenant Phase 2 prep. 8 observability metrics + 4 alerts.

---

═══════════════════════════════════════════════════════════════════
# Part X — Pass 10 (Cross-Cutting Enforcement Patterns) — FULL CONTENT
═══════════════════════════════════════════════════════════════════

## 10. Overview

The audit committed to 13 cross-cutting commitments in §0.4. Throughout Passes 2-9, we've referenced them piecemeal. Pass 10 catalogues the complete enforcement picture end-to-end: for each commitment, where in the system it's enforced (schema constraint? trigger? algorithm phase? UI state? audit event?).

This is primarily a **synthesis and verification pass**. The architecture is already designed. Pass 10 confirms it covers all 13 commitments completely and catches any gaps.

### 10.1 The 13 cross-cutting commitments

From `NEXVELON_FEATURE_AUDIT.md` v0.14 §0.4:

| # | Commitment | Theme |
|---|---|---|
| 1 | Role default + bidirectional per-user override | Permission model |
| 2 | Three UI states (hidden / disabled / interactive) | UI semantics |
| 3 | Fine-grained by default | Granularity philosophy |
| 4 | Lookup rows carry behavior bindings | Configuration model |
| 5 | Guided creation never lazy | UX commitment |
| 6 | Ten dimensions of permission control | Permission richness |
| 7 | Contractual integrity exception (clients:overrideSlaResponseTime Admin-only) | SLA preservation |
| 8 | Versioned snapshots for legal durability | Immutability |
| 9 | Eight-layer print protection | Document security |
| 10 | Append-only ledgers (7 module ledgers + permission_audit_log) | Forensic trail |
| 11 | Separation of duties enforcement | Financial control |
| 12 | Regulatory expiry auto-block enforcement | Compliance |
| 13 | Geolocation privacy retention (30-day default operator-configurable) | Privacy |

### 10.2 What Pass 10 produces

Five outputs per commitment:

1. **Enforcement point inventory** — every place in the system where this commitment is enforced
2. **Composition rules** — when multiple commitments apply to one action, the precedence order
3. **Exception escalation paths** — who can override, how, with what audit
4. **Test scenarios** — integration test cases for build phase
5. **Build phase priority** — MVP-critical vs Phase 2 hardening

### 10.3 What's NOT in Pass 10

- New schema (Pass 2-9 covered it)
- New algorithms (Pass 3 covered it)
- New UI patterns (Pass 8 covered it)
- Migration logistics (Pass 11)

Pass 10 is the bridge between design and build.

## 11. Commitment §0.4 #1 — Role default + bidirectional per-user override

### 11.1 What it commits

Every action has a role-default grant state (granted/denied/default) per role. Individual users can be granted access beyond their role's default OR denied access despite their role's default — both directions of override supported.

### 11.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| Schema | `role_permissions` table (role × permission junction with grant_state enum) | Pass 2 §11.3 |
| Schema | `user_permission_overrides` table (per-user grants/denials with mandatory reason) | Pass 2 §11.4 |
| Algorithm | A1 Phase 2: base table resolution checks role default THEN applies user override | Pass 3 §11.2 Phase 2 step 3-4 |
| Cache | `effective_permissions_cache` stores resolution result with `resolution_source` discriminator | Pass 2 §11.5 + Pass 9 §17 |
| Trigger | Cache invalidation on role_permissions / user_permission_overrides changes | Pass 9 §17.1 |
| UI | Permissions Editor Section 1 (Actions) cell editing | Pass 8 §17 |
| UI | Permissions Editor Section 4 (Overrides) — Active Overrides sub-tab | Pass 8 §20.2 |
| Audit | Event types: role_permission_granted/revoked, user_override_granted/revoked/expired | Pass 6 §15.1 |

### 11.3 Composition rules

When user has both role default AND active user override:
- Override wins (algorithm Phase 2 step 4)
- Audit captures resolution_source = 'user_override_grant' or 'user_override_deny'

When user override is expired:
- Treated as no override; falls back to role default
- Audit event 'user_override_expired' on transition

### 11.4 Exception escalation

Per-user override grants:
- Direct override (admin grants without request workflow) — A only
- Via request workflow (Pass 7) — A approves (or A+Acc co-sign for highest-stakes per Phase 2)

### 11.5 Test scenarios

1. **Positive — role default granted**: User with PM role attempts `invoices:approve`; granted (role default).
2. **Positive — user override grants beyond role**: SR with `invoices:approve` user override attempts approval; granted.
3. **Positive — user override denies despite role**: PM with `invoices:approve` user override (denied) attempts approval; blocked.
4. **Edge — override expired**: PM with expired `invoices:approve` grant override attempts approval; falls back to role default (granted); audit emitted.
5. **Edge — both grant and deny override exist (impossible by schema)**: UNIQUE constraint on (user, permission) prevents; test confirms.

### 11.6 Build phase priority

**MVP-critical.** Pass 2 schema + Pass 3 algorithm + basic UI must ship in v1. Pass 7 request workflow can ship within v1 cycle but not absolutely blocking.

---

## 12. Commitment §0.4 #2 — Three UI states (hidden / disabled / interactive)

### 12.1 What it commits

Every gated control renders in one of three states: hidden (absent from UI), disabled (visible but greyed out), interactive (fully usable). Operators can override defaults per action per role.

### 12.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| Schema | `permission_definitions.default_ui_state` column | Pass 2 §11.1 |
| Schema | `role_permissions.ui_state_override` column | Pass 2 §11.3 |
| Algorithm | A1 Phase 2 step 5: UI state resolution | Pass 3 §11.2 |
| Cache | `effective_permissions_cache.resolved_ui_state` | Pass 2 §11.5 |
| Frontend | `<FieldGated>` component honors visibility state | Pass 4 §15 |
| Frontend | Action buttons rendered conditionally based on `ui_state` from A1 result | Pass 3 §11.1 |
| UI | Editor Section 1 cell shows current ui_state + dropdown to change | Pass 8 §17.2 |

### 12.3 Composition rules

State priority (highest wins):
1. Explicit deny → ui_state = hidden (or disabled if permission_definitions.default_ui_state = 'disabled')
2. Role permission ui_state_override
3. permission_definitions.default_ui_state

The frontend respects what A1 returns; no client-side override.

### 12.4 Exception escalation

UI state changes done by Admin only via Editor Section 1. No request workflow for UI state changes (it's a configuration concern, not a grant concern).

### 12.5 Test scenarios

1. **Default interactive renders normally** — granted action with default ui_state shows as enabled button
2. **Default disabled greys but visible** — granted action with disabled ui_state shows greyed; hover tooltip explains "Available but UI disabled"
3. **Default hidden absent from UI** — denied action with hidden default doesn't render
4. **Override interactive → disabled** — admin changes pm role override to disabled; PM users see greyed button on next request
5. **Override hidden → interactive (sensitive action)** — admin reveals hidden action; users see clickable; warning displayed about exposing

### 12.6 Build phase priority

**MVP-critical.** UI state semantics drive the entire admin experience.

---

## 13. Commitment §0.4 #3 — Fine-grained by default

### 13.1 What it commits

Permissions are granular. Not "client management" as a single permission, but `clients:viewList` + `clients:viewDetail` + `clients:create` + `clients:editBasic` + `clients:editAdvanced` + ... — each addressable independently.

### 13.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| Vocabulary | Pass 1 catalogues ~1260 distinct actions (vs ~150 if coarse-grained) | Pass 1 §1 |
| Schema | `permission_definitions` 1-row-per-action (Pass 2 decision 1) | Pass 2 §11.1 |
| Algorithm | A1 resolves at action granularity | Pass 3 §11.2 |
| UI | Editor Section 1 shows full hierarchy with leaf-level cells | Pass 8 §17 |
| Field | Pass 4's 47 visibility flags are even more granular than actions (per-section per-resource) | Pass 4 §17 |

### 13.3 Composition rules

No composition concerns — granularity is a vocabulary property, not a runtime check.

### 13.4 Exception escalation

N/A — fine-grained is the only granularity supported. Custom roles can group actions for convenience (Pass 8 §21 wizard) but the underlying grants stay granular.

### 13.5 Test scenarios

1. **Granted view list but not detail** — SR has `clients:viewList` granted, `clients:viewDetail` denied; list view works, click-through to detail blocks
2. **Granted basic edit but not advanced** — PM has `clients:editBasic`, denied `clients:editAdvanced` (which includes tier/holdback); attempts to edit basic name → works; attempts to edit tier → blocks
3. **Field-level granularity beyond action** — Acc has `vendors:viewDetail` granted but `visibility.vendors.banking` hidden; vendor detail renders without banking section

### 13.6 Build phase priority

**MVP-critical.** Granularity philosophy underpins everything; no shortcuts.

---

## 14. Commitment §0.4 #4 — Lookup rows carry behavior bindings

### 14.1 What it commits

Status rows (invoice statuses, appointment statuses, etc.) carry behavior flags like `allows_edit`, `triggers_late_fee`, `is_terminal`. Action handlers consult these bindings; operators can configure (within system-locked constraints).

### 14.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| Schema | `status_behavior_bindings` polymorphic table | Pass 5 §13.1 |
| Schema | `status_transition_definitions` | Pass 5 §13.2 |
| Schema | `effective_status_bindings_cache` | Pass 5 §13.3 |
| Schema | `permission_definitions.binding_dependencies` JSONB column | Pass 5 §17.2 |
| Algorithm | A1 Phase 3.3 status binding check | Pass 5 §17.1 |
| Cache | Bindings cache invalidates on status_behavior_bindings changes | Pass 9 §17.1 |
| UI | Settings UI for operator-configurable bindings (not part of Permissions Editor; lives in M3 Settings module) | M3 audit spec |
| Audit | Event type `status_binding_changed` | Pass 6 §15.1 |
| Audit | Event type `status_transition_executed` | Pass 6 §15.1 |

### 14.3 Composition rules

When A1 Phase 3.3 binding check denies AND Phase 3.1 SoD also denies — both reasons captured in audit; UI shows first violation only (priority: SoD > binding > regulatory).

When binding allows but role default denies — role default wins (binding only adds constraints, doesn't grant).

### 14.4 Exception escalation

System-locked bindings (enforcing §0.4 #8/#11/#12/#13/PCI/Construction Act/lien/append-only) cannot be modified by operators. UI renders them as 🔒. No override path.

Operator-configurable bindings can be tuned in Settings; audit captures changes.

### 14.5 Test scenarios

1. **Granted action blocked by binding** — PM with `invoices:edit` attempts to edit Sent invoice; A1 Phase 3.3 denies (allows_edit=FALSE on Sent status); reason captured
2. **Custom status with custom bindings** — operator adds "Pending Customer Approval" status; configures allows_edit=TRUE; PM can edit invoice in that custom status
3. **System-locked binding cannot be operator-changed** — operator attempts UI edit on Sent.allows_edit; UI rejects with tooltip
4. **Binding cache invalidates on operator change** — operator changes binding value; cache invalidated; next user request reflects new binding

### 14.6 Build phase priority

**MVP-critical.** Pass 5 bindings are integral to action enforcement.

---

## 15. Commitment §0.4 #5 — Guided creation never lazy

### 15.1 What it commits

Entity creation flows guide users through required fields and dependent decisions; never accept a barely-populated row that requires later completion to be valid. Examples: creating a project pulls required fields from settings (project number sequence, default cost center); creating an invoice requires linked client + line items; creating a contractor WO requires labor rates + scope.

### 15.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| Schema | NOT NULL constraints on critical columns | Per-module schemas |
| Schema | CHECK constraints validating state at insert | Per-module schemas |
| Frontend | Multi-step creation wizards in M5/M6/M7/M9/M10/M12 (per audit) | M-specific UI specs |
| Status bindings | Status='Draft' may allow incomplete state; transition to 'Pending Approval' requires complete | Pass 5 §14 |
| Action chains | Pass 1 §6 action chains enforce sequence (e.g., Quote → Project flow) | Pass 1 §6 |

### 15.3 Composition rules

This commitment lives mostly outside the permissions runtime — it's a UX commitment enforced at the module level. The permissions layer enables it by:
- Gating which fields are visible (Pass 4 — admin might add a field that PMs see and SRs don't)
- Gating which actions trigger transitions (Pass 5 — only granted users can `submit`)

### 15.4 Exception escalation

N/A — guided creation is a UX commitment; not bypassable.

### 15.5 Test scenarios

1. **Required fields enforced at schema** — attempt to INSERT invoice with null client_id; rejected by NOT NULL
2. **Multi-step wizard cannot skip steps** — UI prevents jumping to Step 3 without Step 1+2 complete
3. **Transition to Pending blocks on incomplete state** — Draft invoice with empty line items cannot transition to Pending (status binding `allows_state_transition` filters out Pending → only Draft → Draft or Draft → Void allowed)

### 15.6 Build phase priority

**MVP-critical at module level, NOT a permissions concern.** Permissions runtime enables the commitment but enforcement is module-specific.

---

## 16. Commitment §0.4 #6 — Ten dimensions of permission control

### 16.1 What it commits

The permission model supports ten distinct dimensions of control: action grants, field visibility, data scope, UI state, status bindings, separation of duties, regulatory expiry, geolocation retention, sensitive field audit-on-read, request-based grants.

### 16.2 Enforcement points

Pass 10 §11-§22 collectively enforce these 10 dimensions. Cross-reference:

| Dimension | Pass | Enforcement |
|---|---|---|
| 1. Action grants | Pass 2-3 | role_permissions + user_permission_overrides + A1 |
| 2. Field visibility | Pass 4 | field_visibility_definitions + 47-flag catalog + A3 |
| 3. Data scope | Pass 3 | data_scope_definitions + A2 + RLS |
| 4. UI state | Pass 2-3 | ui_state_override + A1 |
| 5. Status bindings | Pass 5 | status_behavior_bindings + Phase 3.3 |
| 6. Separation of duties | Pass 3 | separation_of_duties_constraints + Phase 3.1 |
| 7. Regulatory expiry | Pass 3 | regulatory_expiry_overrides + Phase 3.2 |
| 8. Geolocation retention | Pass 2 | geolocation_retention_policies + daily purge |
| 9. Sensitive field audit-on-read | Pass 4 | requires_audit_on_read flag + async batched |
| 10. Request-based grants | Pass 7 | request_admin_access workflow |

### 16.3 Composition rules

All ten dimensions evaluate independently. Compound decision = AND of all applicable dimensions. If any denies, action denied.

### 16.4 Exception escalation

N/A — composition is automatic.

### 16.5 Test scenarios

Cross-dimensional scenarios:

1. **All dimensions allow** — PM with role grant + field visibility + scope + active UI + binding allow + no SoD + WSIB valid + no geolocation + no audit-on-read + no request needed → action proceeds normally
2. **Action grant + binding compose** — PM has `invoices:edit` granted but Sent status binding denies → blocked at Phase 3.3
3. **Field visibility within granted detail** — Acc has `vendors:viewDetail` granted but `visibility.vendors.banking` hidden → vendor detail renders without banking
4. **Scope filters records but visible records still field-gated** — SR sees own clients (scope) but each client's banking section hidden (visibility)

### 16.6 Build phase priority

**MVP-critical.** Each dimension is one of the design passes; ship all together.

---

## 17. Commitment §0.4 #7 — Contractual integrity exception (clients:overrideSlaResponseTime Admin-only)

### 17.1 What it commits

Some actions are reserved for Admin alone, with reason capture and audit. The canonical example: changing a client's contracted SLA response time is Admin-only because it materially alters legal contract terms.

### 17.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| Schema | `permission_definitions.is_admin_exception` flag = TRUE | Pass 2 §11.1 |
| Schema | `permission_definitions.requires_reason_capture` = TRUE | Pass 2 §11.1 |
| Algorithm | A1 Phase 4: if is_admin_exception, audit always emitted | Pass 3 §11.2 |
| UI | Editor renders admin-exception rows with 🔒 indicator (for non-admins) and ⚠ for admins | Pass 8 §17.1 |
| UI | Action execution requires reason capture before submit | Per-module UI specs |
| Audit | Event type `admin_exception_invoked` | Pass 6 §15.1 |

### 17.3 The 13 admin exceptions (from Pass 1 §7)

Catalogued in `permission_definitions`:

- `clients:overrideSlaResponseTime` (§0.4 #7 canonical example)
- `clients:editTier`
- `clients:editHoldbackConfig`
- `clients:hardDelete`
- `vendors:manualOverrideInsurance`
- `vendors:manualOverrideWsib`
- `contractors:manualOverrideWsib`
- `contractors:manualOverrideInsurance`
- `appointments:overrideCertExpiry`
- `sla_breach_alerts:recordSlaWaiver`
- `dispatch_records:overrideNormalScheduling` (A or Dispatcher with reason)
- `accounting_periods:reopenPeriod`
- `report_snapshots:deleteSnapshot`

### 17.4 Composition rules

Admin exception flag overrides general permission grant: even if a PM has `clients:overrideSlaResponseTime` via override, the action ALSO requires reason capture and emits audit. Admin role itself doesn't bypass these requirements.

### 17.5 Exception escalation

These are themselves the exception path. No further override exists. If business need requires bypassing audit/reason capture, that's a schema change requiring code modification — not an operational override.

### 17.6 Test scenarios

1. **Admin executes with reason** — A invokes `clients:overrideSlaResponseTime`; reason captured; action proceeds; audit row written
2. **Non-admin with override fails reason check** — PM granted via user_override attempts the action without reason; UI blocks
3. **Audit row contains all required fields** — admin_exception_invoked audit row has actor_user_id, target_permission_id, target_entity_id, before_state, after_state, reason
4. **Cannot bypass audit via direct DB write** — even if admin manually updates clients table SQL, the audit doesn't auto-emit; ops alert if such writes detected (Phase 2 SOC2 hardening)

### 17.7 Build phase priority

**MVP-critical.** Auditability of admin exceptions is non-negotiable.

---

## 18. Commitment §0.4 #8 — Versioned snapshots for legal durability

### 18.1 What it commits

Sent invoices, sent quotes, signed change orders, signed contractor WOs, signed project acceptance records are immutable. Once sent/signed, the snapshot is frozen for legal durability. Edits forbidden.

### 18.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| Schema | Status bindings: `allows_edit = FALSE` on Sent/Signed/Approved statuses | Pass 5 §15 |
| Algorithm | A1 Phase 3.3 binding check denies edit on Sent invoices | Pass 5 §17.1 |
| Append-only | `report_snapshots`, `commissioning_records`, `project_acceptance_records` are append-only ledgers (Pass 6) | Pass 6 §18 |
| Schema | Snapshot copies of customer/vendor/contractor data fields embedded in invoices/quotes/etc. — not referenced by FK that could change | Per-module schemas |
| UI | Permissions Editor §17.5 renders `allows_edit=FALSE` on Sent as 🔒 system-locked | Pass 8 §17.5 |
| Audit | Reversal pattern for corrections (Pass 6 §19) | Pass 6 §19 |

### 18.3 Composition rules

Even Admin cannot edit a Sent invoice. To "correct" a Sent invoice, the workflow is:
1. Issue credit note (reverses original)
2. Issue new corrected invoice
3. Original invoice untouched; audit trail of full sequence preserved

System-locked binding: cannot be modified by operators.

### 18.4 Exception escalation

No exception path. Only workflow: reversal via credit note + new invoice. Audit captures full sequence.

### 18.5 Test scenarios

1. **Sent invoice edit attempt blocked** — admin attempts to edit Sent invoice; A1 Phase 3.3 denies; UI shows "Cannot edit Sent invoice" tooltip
2. **Credit note reversal works** — credit note created against Sent invoice; original untouched; audit captures both events with source_event_id linking
3. **Direct DB UPDATE blocked by trigger** (Phase 2 hardening) — even if app bypassed, append-only triggers on related ledgers catch attempts
4. **Snapshot data embedded** — Sent invoice has copy of customer address from time of sending; even if customer address later changes, sent invoice still shows old address

### 18.6 Build phase priority

**MVP-critical.** Legal durability is non-negotiable.

---

## 19. Commitment §0.4 #9 — Eight-layer print protection

### 19.1 What it commits

Sensitive printed documents (invoices, quotes, financial reports, compliance exports) have eight layers of protection: watermark, header/footer info, page numbering, recipient name, timestamp, document ID, status banner, "Print copy" indicator.

### 19.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| PDF templates | M3 Settings → PDF Templates with eight-layer protection baked in | M3 audit spec |
| Action | `*:exportPdf` actions render through protected template | Pass 1 §6 |
| Compliance export | `/api/admin/audit/export` PDF format uses eight-layer template | Pass 6 §20.3 |
| UI | Print preview shows all 8 layers before download | Per-module UI |
| Audit | Event types capture export actions; including the eight-layer-protected PDF | Pass 6 §15.1 |

### 19.3 Composition rules

All PDFs from the system (invoice PDF, quote PDF, audit export PDF, compliance report PDF) inherit eight-layer template. No bypass for "internal" PDFs — all eight layers always applied.

### 19.4 Exception escalation

Operators can configure WHICH info appears in which layer via M3 Settings → PDF Templates. They cannot REMOVE layers — at least all 8 must be configured.

### 19.5 Test scenarios

1. **Invoice PDF has all 8 layers** — generate invoice PDF; verify watermark + header + page numbers + recipient + timestamp + doc ID + status banner + print indicator present
2. **Operator customizes layer content** — admin changes watermark text in Settings; new PDFs reflect; existing snapshots untouched
3. **Audit export PDF includes 8 layers** — POST /api/admin/audit/export with format=pdf; downloaded PDF has full protection

### 19.6 Build phase priority

**MVP-critical for outbound documents** (invoices/quotes); **lower priority for internal-only** (audit exports — important but build phase can ship v1 with simplified template, harden later).

---

## 20. Commitment §0.4 #10 — Append-only ledgers

### 20.1 What it commits

Eight ledgers (permission_audit_log + 7 module ledgers: inventory_movements, commissioning_records, project_acceptance_records, vendor_performance_scores, contractor_performance_scores, gl_journal_lines, appointment_change_log, report_snapshots) are append-only. UPDATE and DELETE blocked at database level. Reversals via insert offsetting events.

### 20.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| Schema | 8 ledger tables with uniform pattern (Pass 6 §14.1) | Pass 6 §18 |
| Trigger | PostgreSQL UPDATE/DELETE triggers blocking modifications (Pass 6 §14.2) | Pass 6 §14.2 |
| Partitioning | Monthly time-based partitioning for scale (Pass 6 §14.3) | Pass 6 §14.3 |
| Algorithm | Append-only resources flagged in `permission_definitions.is_append_only_target` | Pass 2 §11.1 |
| Cache | N/A — these tables not cached (writes-heavy) |
| UI | Editor Section 1 shows 🔒 on `inventory_movements:edit`, `:hardDelete`, etc. | Pass 8 §17.5 |
| Audit | `permission_audit_log` IS itself an append-only ledger | Pass 6 §14 |

### 20.3 Composition rules

Append-only is absolute at the database level. No application-level bypass. Even Admin cannot UPDATE or DELETE.

Application-level "corrections" use reversal pattern: INSERT new offsetting row with source_event_id linking to original.

### 20.4 Exception escalation

No exception path. Absolute.

### 20.5 Test scenarios

1. **UPDATE blocked by trigger** — `UPDATE inventory_movements SET quantity_change = ...` raises exception P0001
2. **DELETE blocked by trigger** — same
3. **INSERT (new row) works** — `INSERT INTO inventory_movements (...)` succeeds normally
4. **Reversal pattern functions** — credit note creates reversal entries in `gl_journal_lines`; original entries untouched; net effect correct
5. **Partition pruning works** — `SELECT * FROM permission_audit_log WHERE occurred_at >= '2026-05-01'` hits only May partition

### 20.6 Build phase priority

**MVP-critical.** Cannot ship without append-only enforcement.

---

## 21. Commitment §0.4 #11 — Separation of duties enforcement

### 21.1 What it commits

Same user cannot perform conflicting actions on the same record (e.g., AP bill creator cannot also approve). Co-signing supported for high-stakes actions (A + Acc for hardClose).

### 21.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| Schema | `separation_of_duties_constraints` table | Pass 2 §15.1 |
| Algorithm | A1 Phase 3.1 SoD check | Pass 3 §11.2 |
| Database trigger | Defense-in-depth: CHECK at INSERT/UPDATE prevents same-user creator+approver | Pass 3 decision 2 |
| Status binding | Some transitions require co-sign via `status_transition_definitions.requires_co_sign + co_sign_role_codes` | Pass 5 §14, §15.2 |
| Cache | Cache invalidates on `separation_of_duties_constraints` changes (rare admin operation) | Pass 9 §17.1 |
| UI | Editor shows "Cannot approve own AP bills" tooltip on action button | Pass 8 §17 |
| Audit | Event types: violations logged as denial; co-sign captured as `co_sign_executed` | Pass 6 §15.1 |

### 21.3 The 4 separation-of-duties constraints (from Pass 2 §15.1)

| Constraint | Conflicting actions |
|---|---|
| `ap_bill_creator_not_approver` | `ap_bills:create` vs `ap_bills:approve` (same bill) |
| `payment_run_creator_not_approver` | `ap_payment_runs:create` vs `ap_payment_runs:approve` (same run) |
| `gl_entry_creator_not_poster` | `gl_journal_entries:create:manual` vs `gl_journal_entries:post` (same entry) |
| `hard_close_co_sign` | `accounting_periods:hardClose` requires A + Acc co-sign |

### 21.4 Composition rules

If SoD blocks AND user has override (Pass 7 grant), SoD STILL blocks — overrides cannot bypass separation of duties. The override is for granting an action capability; SoD is per-record (you can't be both creator and approver of the SAME record).

If SoD blocks AND co-sign supported: first signer recorded; second signer (different role) completes.

### 21.5 Exception escalation

For three same_record constraints (AP bill, payment run, GL entry): no override path. Must reassign the second action to a different user.

For hard close: co-sign IS the path. Both roles must explicitly sign with audit.

### 21.6 Test scenarios

1. **AP bill creator denied approval of own** — PM creates ap_bill_42; later attempts approval; Phase 3.1 denies; reason captured
2. **AP bill creator can approve different bill** — PM creates ap_bill_42; can approve ap_bill_43 created by SR; SoD only applies same-record
3. **Hard close co-sign flow** — Acc invokes softClose; A invokes hardClose; Phase 3.1 sees softClose by different role; allows; audit captures co_sign_executed
4. **Hard close blocked when same-role co-sign** — Acc1 invokes softClose; Acc2 attempts hardClose; Phase 3.1 denies (both Acc role)
5. **User override does not bypass SoD** — even with `ap_bills:approve` granted via user override, PM still can't approve bill they created

### 21.7 Build phase priority

**MVP-critical.** Financial control is non-negotiable.

---

## 22. Commitment §0.4 #12 — Regulatory expiry auto-block enforcement

### 22.1 What it commits

Expired insurance / WSIB / certifications auto-block dependent actions (PO creation for expired-insurance vendor; WO creation for expired-WSIB contractor; appointment scheduling for expired-cert employee).

### 22.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| Schema | `regulatory_expiry_overrides` table | Pass 2 §15.2 |
| Schema | Source data (vendor/contractor/employee tables) carries expiry dates | Per-module schemas |
| Algorithm | A1 Phase 3.2 regulatory expiry check | Pass 3 §11.2 |
| Status binding | Some statuses (e.g., vendor "On Hold") system-locked when regulatory expired | Pass 5 §18.1 |
| Cache | Cache rebuilds when expiry status flips (cron-based or manual override insert) | Pass 9 §17.1 |
| UI | Editor renders override events with reason capture required | Pass 8 §20.5 |
| Audit | Event type `regulatory_block_overridden` | Pass 6 §15.1 |

### 22.3 The 6 regulatory expiry types

From Pass 2 §15.2:
- vendor_insurance_expired
- vendor_wsib_expired
- contractor_insurance_expired
- contractor_wsib_expired
- contractor_certification_expired
- employee_certification_expired

### 22.4 Composition rules

Regulatory expiry STILL applies when user has role grant + user override. The Pass 3 algorithm explicitly states: "User override does NOT bypass regulatory expiry. §0.4 #12 supersedes user-level overrides."

Only an `regulatory_expiry_overrides` entry (which itself requires A approval with reason) bypasses.

### 22.5 Exception escalation

Override path: A invokes admin exception (per §0.4 #7) → creates `regulatory_expiry_overrides` row with reason + emergency_justification + valid_until window. The override applies during the window; auto-expires.

Audit event: `regulatory_block_overridden`.

### 22.6 Test scenarios

1. **Expired-insurance vendor PO blocked** — PM attempts `purchase_orders:create` for vendor with expired insurance; Phase 3.2 denies; reason captured
2. **Override permits action during window** — A creates override valid 7 days; same PM attempts; Phase 3.2 sees override; allows; audit captures both block + override
3. **Override expires correctly** — 8 days later; same PM attempts; Phase 3.2 denies again (override now invalid)
4. **User override does NOT bypass expiry** — PM with `purchase_orders:create` granted via user override AND no regulatory override → still blocked at Phase 3.2
5. **Audit chain reconstruction** — regulatory_block_overridden event chains via source_event_id back to the blocking event for traceability

### 22.7 Build phase priority

**MVP-critical.** Regulatory compliance is non-negotiable.

---

## 23. Commitment §0.4 #13 — Geolocation privacy retention (30-day default operator-configurable)

### 23.1 What it commits

Geolocation data (clock-in/out coordinates from M12 mobile) retained 30 days by default; operator-configurable. After retention, coordinates set to NULL while timestamp + appointment_id retained for audit.

### 23.2 Enforcement points

| Layer | Mechanism | Location |
|---|---|---|
| Schema | `geolocation_retention_policies` table | Pass 2 §15.3 |
| Schema | `appointment_change_log.geolocation_data` JSONB column | Pass 6 §18.6 |
| Field visibility | `visibility.scheduling.geolocationHistory` flag with `retention_days` (Pass 4 §17.10) | Pass 4 §17.10 |
| Daily cron | Purges coordinates >retention_days old; preserves timestamp + appointment_id | Pass 6 §18.6 + new cron |
| Settings UI | M3 Settings → Privacy → Geolocation Retention (operator-configurable) | M3 audit spec |
| Audit | Daily purge run creates audit event `geolocation_data_purged` (new event type to add Pass 11) | Pass 11 |

### 23.3 Composition rules

Operator-configurable retention. Default 30 days. Minimum 7 days (per audit). Operator cannot set 0 days (compliance baseline).

Purge action: `coordinates_null` default (sets lat/lng to NULL but keeps timestamp + appointment_id). Phase 2 option: `full_delete` (removes row entirely; loses audit trail).

### 23.4 Exception escalation

No override at user level. Operator can extend retention (e.g., 90 days for compliance investigations) in Settings.

### 23.5 Test scenarios

1. **Retention 30 days default** — appointment 31 days old has coordinates purged; timestamp + appointment_id remain
2. **Operator extends retention** — admin sets retention 60 days; new purge runs respect new value
3. **Field visibility honors retention** — Tech viewing own geolocation_history sees recent coordinates but old ones NULL
4. **Audit captures purge run** — daily cron writes `geolocation_data_purged` event with row count

### 23.6 Build phase priority

**MVP-critical for v1 cycle** but can ship v1 day-1 with manual purge; daily cron added shortly after.

---

## 24. Cross-cutting composition matrix

When multiple commitments apply to one action, this matrix shows precedence:

| Commitment | Can be bypassed by | Cannot be bypassed by |
|---|---|---|
| #1 Role default | User override (Pass 7) | — |
| #1 User override | Regulatory expiry (#12), SoD (#11), Append-only (#10), Snapshots (#8) | — |
| #2 UI state | Admin reconfiguration | — |
| #3 Granularity | (not bypassable) | — |
| #4 Status bindings | System-locked exceptions | Operator config (for system-locked) |
| #7 Admin exceptions | (themselves the exception path) | — |
| #8 Immutable snapshots | (not bypassable; use reversal) | — |
| #10 Append-only | (not bypassable; use reversal) | — |
| #11 Separation of duties | Co-sign for hard close only | User override |
| #12 Regulatory expiry | Admin override with reason | User override |
| #13 Geolocation retention | Operator extending retention | User-level access |

Read this matrix: row commitment cannot be bypassed by anything in "User override" column unless explicitly listed under "Can be bypassed by."

### 24.1 Layered defense

The architecture has multiple layers of defense for each commitment:

```
Request → Auth → A1 (algorithm Phase 1-3) → Schema constraint → DB trigger
   ↓        ↓        ↓                          ↓                ↓
   1        2        3                          4                5
```

Most commitments enforced at layers 3-5. Pass 8 UI prevents most violations at layer 0 (don't render the button if denied). But true enforcement is server-side; UI is hygiene only.

### 24.2 Audit coverage verification

Every commitment denial emits an audit event. Pass 6 §15.1 catalogue covers:

| Commitment | Denial event |
|---|---|
| #1 user_override_deny | `user_override_revoked` (when admin revokes); resolution_source captured in cache hit |
| #2 UI state change | `role_permission_ui_state_changed` |
| #4 binding denial | resolution_source='status_binding_violation' in cache hit log |
| #7 admin exception execution | `admin_exception_invoked` |
| #8 snapshot edit attempt | denied at A1 Phase 3.3; resolution_source captured |
| #10 append-only attempt | trigger raises P0001 (no row written; alert via failed query metric) |
| #11 SoD denial | resolution_source='separation_of_duties_violation' |
| #11 co-sign | `co_sign_executed` |
| #12 expiry block | resolution_source='regulatory_expiry_block' |
| #12 override | `regulatory_block_overridden` |
| #13 purge | `geolocation_data_purged` (new event type Pass 11 will add) |

## 25. Build phase priorities

### 25.1 MVP-critical (must ship with v1)

All 13 commitments are MVP-critical at v1 in some form. None can be deferred entirely. Variations in what "v1 implementation" looks like:

| Commitment | v1 implementation | Phase 2 hardening |
|---|---|---|
| #1 Role + override | Pass 2 schema + Pass 3 algorithm + UI editing | Multi-step approval workflow for high-stakes |
| #2 UI states | All 3 states supported | Conditional state (e.g., disabled if X, hidden if Y) |
| #3 Granularity | All ~1260 actions catalogued | Operator-defined custom granularity |
| #4 Bindings | 80 surfaces with 14 binding names | Operator-defined custom binding names |
| #5 Guided creation | Multi-step wizards in all modules | AI-suggested completion |
| #6 Ten dimensions | All 10 implemented per Passes 2-9 | Cross-dimensional rule engine |
| #7 Admin exceptions | 13 catalogued + reason capture | Auto-approval rules for low-risk |
| #8 Snapshots | allows_edit=FALSE on Sent statuses | Cryptographic snapshot integrity (hash chain) |
| #9 Print protection | Eight-layer baseline template | Operator-configurable layer customization |
| #10 Append-only | 8 ledgers with triggers + partitioning | Cold archival to S3 Glacier |
| #11 SoD | 4 constraints + co-sign for hardClose | Multi-step approval for highest-stakes |
| #12 Regulatory expiry | 6 expiry types + override with reason | Multi-step approval for emergency overrides |
| #13 Geolocation | 30-day default + daily purge | GDPR-compliant configurable per-user retention |

### 25.2 Build phase sequencing recommendations

When building, recommended order:

1. **Foundation** (cannot defer): Pass 2 schema + Pass 3 algorithm + Pass 6 append-only ledgers
2. **Engines** (block UI development): Pass 4 field visibility + Pass 5 status bindings + Pass 9 caching
3. **Workflow** (admin operations): Pass 7 request workflow + Pass 10 commitment enforcement
4. **UI** (visible to users): Pass 8 permissions editor
5. **Audit + ops**: Pass 6 query API + observability (Pass 9)

### 25.3 v1 ship checklist

Before v1 production ship, all of these must pass:

- [ ] All 13 commitments have working enforcement at runtime (not just schema)
- [ ] All 13 have integration tests passing
- [ ] Pass 10 §24 composition matrix verified via test cases
- [ ] Audit emits all event types from Pass 6 §15.1 + Pass 7 + Pass 8 catalogue (32 total)
- [ ] Permissions editor renders all 6 sections correctly
- [ ] Cache hit rate >95% under simulated load
- [ ] All A-only admin exceptions require reason capture
- [ ] All append-only ledgers reject UPDATE/DELETE with P0001 exception

## 26. Integration test surface

Build phase must implement these test scenarios. Per-commitment scenarios from §11-§23 plus cross-cutting scenarios:

### 26.1 Cross-cutting scenarios

1. **Three-dimensional grant** — PM with role grant + active user override + valid SoD context → action proceeds
2. **Override doesn't bypass regulatory** — User override granted; regulatory expiry blocks; action denied
3. **Co-sign requires different roles** — Acc1 + Acc2 cannot co-sign hardClose (same role); A + Acc can
4. **Append-only + reversal cycle** — GL post → reversal post → correction post; all three rows preserved; net effect correct
5. **Status binding + admin exception interact** — admin invokes `clients:overrideSlaResponseTime`; binding `allows_edit` on client status is TRUE; admin exception flag also TRUE; both checks pass; reason captured; audit emitted
6. **Cache invalidation cascade** — grant change invalidates effective_permissions_cache; next read repopulates; UI reflects new state
7. **Audit on every commitment denial** — for each of 13 commitments, denial scenario captured in audit log

### 26.2 Negative scenarios (commitment bypass attempts)

1. **Cannot edit Sent invoice via direct DB UPDATE** — Phase 2 hardening (audit comparison detects)
2. **Cannot bypass append-only via DELETE** — trigger raises P0001
3. **Cannot bypass SoD via two-user-collusion** — first user creates; second user (different) approves; allowed; no violation
4. **Cannot bypass regulatory expiry via user override** — explicit test confirmed

### 26.3 Edge cases

1. **Concurrent commitment evaluations** — two requests simultaneously check SoD on same record; both succeed/fail consistently (race condition mitigation per Pass 9 §24.3)
2. **Cache miss under load** — many simultaneous cache misses for same (user, permission); INSERT ON CONFLICT handles race
3. **Cron timing edge cases** — temporary override expires at 03:00 UTC; cron runs at 03:00 UTC; race window <1 minute acceptable

## 27. Operator-facing documentation

Pass 10 produces a synthesis document for operators (not directly part of design doc):

For each commitment, operator-facing docs explain:
- **What it does** in plain language
- **Why it exists** (compliance / financial control / customer trust)
- **What operators can configure** vs system-locked
- **How to respond** to common scenarios (e.g., "How do I grant temporary banking access?" → request workflow)

Build phase produces this as part of M3 Settings → Help section.

## 28. Open questions (Pass 10)

1. **Should denial reasons be visible to end users or just admins?** Decision: short, actionable reason visible to users ("Cannot edit; invoice has been sent"); detailed reasoning only in admin audit log. Avoid leaking system internals to non-admins.

2. **Should there be a "test mode" that simulates commitment enforcement without actually applying?** Decision: NO at v1; admin reads audit log to trace what happened. Phase 2 may add for dry-run scenarios.

3. **How granular should the audit be for cross-cutting composition?** (When multiple commitments evaluate, should each be logged separately or combined?). Decision: A1 logs the FINAL resolution result with resolution_source naming the FIRST violation found. Verbose multi-layer audit Phase 2 if needed.

4. **Should the composition matrix (§24) be enforceable at schema level?** Decision: NO at v1 — enforced via algorithm; schema enforces individual commitments. Composition is computed at runtime.

5. **Cross-tenant commitment differences in Phase 2?** Decision: Phase 2 — some operators may want stricter SoD or weaker than baseline. Schema additions needed: per-tenant `commitment_overrides` table. Not at v1.

6. **Compliance certifications (SOC 2, ISO 27001) — how does Pass 10 align?** Decision: Pass 10 enforcement satisfies most common compliance frameworks at v1. Audit log + append-only + access controls + retention + separation of duties — all standard frameworks ask for these. SOC 2 Type II audit may identify gaps; addressed in Phase 2 hardening.

## 29. Migration order extension

Pass 10 doesn't add new schema. But it adds **integration test infrastructure**:

- Step 54: Build integration test suite with 13 commitment scenarios + cross-cutting + edge cases
- Step 55: Build commitment enforcement verification API (admin endpoint to spot-check enforcement)
- Step 56: Build operator-facing commitment documentation generator (auto-generated from Pass 10 catalogue)

Now 56 total migration steps.

---

═══════════════════════════════════════════════════════════════════
# 30. What's next (Pass 11 preview — final pass)
═══════════════════════════════════════════════════════════════════

**Pass 11: Migration plan.**

The full design is now specified across Passes 1-10. Pass 11 lays out the production rollout plan:

- The 56 migration steps from Pass 2 + 5-9 + 10 condensed into deployment phases
- Production-safe migration sequencing (data preservation rules from §0.4)
- Backward compatibility during rollout (the app keeps working as migrations apply)
- Feature flags for incremental enablement (e.g., enable cache layer per cache, not all at once)
- Rollback procedures per phase (if migration fails halfway, how to recover)
- Smoke testing checklist after each phase
- Performance baseline establishment
- Go-live cutover plan
- Monitoring activation timeline

Pass 11 produces v0.11 — the final version of the design doc. After Pass 11, design phase closes and build phase opens.

---

**End of v0.10.** Pass 10 (Cross-Cutting Enforcement Patterns) complete. 13 commitments from §0.4 catalogued with complete enforcement-point inventory across all passes (schema constraints, trigger code, algorithm phases, UI states, audit events). 13 sections (§11-§23) mapping 1:1 to commitments. Composition matrix specifying precedence when multiple commitments apply. Build phase priorities classified (all 13 MVP-critical with v1 vs Phase 2 hardening distinctions). Integration test surface specified with 26 test scenarios (cross-cutting + per-commitment + negative bypass attempts + edge cases). v1 ship checklist with 8 criteria. Operator-facing documentation framework. 6 Pass 10 open questions resolved. Migration order extended +3 steps (now 56 total).
