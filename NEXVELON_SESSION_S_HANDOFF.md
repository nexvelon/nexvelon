# NEXVELON_SESSION_S_HANDOFF.md

> **Hand-off for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-S codification.
> Session S completed Pass 4 of the Permissions Design (Field Visibility Engine).
> Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session S state + Pass 4 summary
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final — audit complete)
>   5. `NEXVELON_PERMISSIONS_DESIGN.md` v0.4 — Passes 1-4 of 11 complete
>   6. `NEXVELON_ROADMAP.md`
>   7. `NEXVELON_SESSION_R_HANDOFF.md` — prior session (Pass 3)
>   8. Earlier handoffs (Q through A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session S focus

Completed Pass 4 of the Permissions Design (Field-Level Visibility Engine). Implements Algorithm A3 from Pass 3 across backend serialization pipeline + frontend React component wrapper architecture. Mask formatting library with 12 standard types. Async batched audit-on-read implementation. Defense-in-depth Postgres views for 5 highest-sensitivity resources. Complete 47-flag catalog mapped to database columns and mask types and role defaults. Six open questions resolved.

This is the engineering spec for field visibility. Pass 3 gave us the algorithm; Pass 4 gives us how it runs in production at scale.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_PERMISSIONS_DESIGN.md` | Replaced v0.3 with v0.4 — Pass 3 condensed to §10 summary (full at ff08703); Pass 4 full content §11-§21 |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session S state |
| `NEXVELON_ROADMAP.md` | Item 2 progress note updated: Pass 4 of 11 complete |
| `NEXVELON_SESSION_S_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged.

═══════════════════════════════════════════════════════════════════════════════
## 2. PASS 4 SUMMARY (Field-Level Visibility Engine)
═══════════════════════════════════════════════════════════════════════════════

### Two-layer architecture

**Backend layer** — applies visibility *to the response* before serialization. Hidden = field absent from JSON; masked = masked value in JSON; visible = raw value.

**Frontend layer** — applies visibility *to the UI shell* before render. Hidden = component not rendered; masked = read-only masked display; visible = normal field with edit if granted.

Both query Pass 3 A3 resolver. The forbidden combination: backend exposes + frontend renders. Caught by integration tests.

**Plus database view layer** — Postgres views for 5 highest-sensitivity resources (clients, employees, vendors, contractors, payments). SQL function `user_field_visibility(flag_name)` consults `effective_field_visibility_cache` per query. Defense-in-depth.

### Backend serialization pipeline (8 stages)

1. Auth middleware → user_id, role_id in context
2. Action grant check (A1) → 403 if denied
3. Data scope resolution (A2) → inject WHERE clause
4. Database query (use view for sensitive 5; base table for others)
5. Bulk visibility resolution (A3) — resolve ONCE per (user, resource, section)
6. Serialization transformer — apply plan to every row
7. Async audit-on-read enqueue (for visible sensitive reads)
8. JSON response

### Bulk visibility resolution pattern

Naive: 50 records × 5 sections = 250 resolver calls.
Bulk: 5 resolver calls (build plan once) + 50 row transformations (apply plan).

```typescript
const plan = await buildVisibilityPlan(userId, 'clients');  // 5 calls
const transformed = rows.map(row => transformRow(row, plan, 'clients'));  // 50 transforms
```

### 12 standard mask types

card_last_4 / card_brand_last_4 / bank_account_last_4 / routing_number_redacted / sin_last_3 / ssn_last_4 / email_partial / email_full_redact / phone_last_4 / address_city_only / redacted / generic.

Pure functions; deterministic; no I/O. Mask character `•` (U+2022) universal.

### Async batched audit-on-read

- 100ms periodic flush timer
- 50-entry size-based flush
- 1000-entry backpressure threshold (forces synchronous flush)
- Circuit breaker on 3+ failures within 1 minute
- Reconciliation cron daily (checks completeness)
- Audit ordering per user preserved (FIFO buffer)
- Worst case: ops sees latency spike; completeness preserved

### Frontend `<FieldGated>` component

```typescript
<FieldGated flagName="visibility.clients.banking">
  <BankingPanel client={client} />
</FieldGated>

<FieldGated flagName="visibility.payments.fullCardNumber" maskedValue={`•••• •••• •••• ${last4}`}>
  <FullCardNumber value={fullNumber} />
</FieldGated>
```

Plus hooks: `useVisibility(flagName)` returns state; `useCanDoAction(actionName)` returns is_granted.

VisibilityContext provider fetches plan once per page; all `<FieldGated>` descendants read from context.

### Defense-in-depth view layer (5 resources only)

`v_clients_with_visibility`, `v_employees_with_visibility`, `v_vendors_with_visibility`, `v_contractors_with_visibility`, `v_payments_with_visibility`.

Each view applies SQL `CASE` per column based on `user_field_visibility(flag_name)` function result. App reads view; never sees raw value for users who shouldn't see it.

Other 42 flags handled by application transformer alone (would explode view count to maintain views for all 47).

### Complete 47-flag catalog (§17)

Every flag mapped to database columns + mask type + role defaults across all 13 modules.

Stats:
- 47 distinct flags
- 1 never-granted flag (`visibility.payments.fullCardNumber`)
- 9 flags with `requires_audit_on_read=TRUE`
- 3 flags affecting row-level not field-level (`fullCalendarAcrossTeams`, `privateAppointments`, `crossUserData`)

### Performance characteristics

- Plan build: <5ms once per request
- Per-row transform: <0.1ms (no I/O)
- 50-row list total overhead: <10ms transformation
- Audit-on-read async enqueue: <0.01ms (non-blocking)
- View overhead: <5% additional query time

### Failure modes

- Visibility plan fetch fails → fail-closed (all gated fields treated as hidden)
- Audit-on-read flush fails → action proceeds; cron retries
- View SQL function fails → fall back to base table; warning logged
- Mask function throws → return generic mask; never expose raw value

### Three architectural decisions locked

1. Masking layer: application transformer (primary) + Postgres views (defense-in-depth for 5 sensitive resources only)
2. Frontend wrapper: per-field `<FieldGated>` standard; section-level wrappers OK for clearly-bounded sections
3. Audit-on-read: async batched (100ms/50-entry/1000-backpressure/circuit breaker)

### Six Pass 4 open questions resolved

1. View layer coverage: 5 highest-sensitivity resources only
2. `<FieldGated>` tooltip on hidden: NO at v1
3. Audit-on-read for masked reads: NO; only visible audits
4. Cross-field masking dependencies: same field_section = atomic unit
5. Mask i18n: NO; `•` universal
6. Test strategy: integration tests with snapshot per role; ~520 test cases (47 flags × 11 roles)

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

**Feature audit:** 🏁 COMPLETE — 13 of 13 modules walked.

**Permissions design:** 4 of 11 passes complete.
- Pass 1: Action Vocabulary Catalog
- Pass 2: Database Schema (14 tables + 1 materialized view)
- Pass 3: Resolution Algorithm (3 algorithms; 7-phase A1)
- Pass 4: Field-Level Visibility Engine (2 layers + view defense-in-depth)

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT — Pass 5 (Status Surface Binding Layer)
═══════════════════════════════════════════════════════════════════════════════

Pass 5 covers the 80 status surfaces × their behavior bindings from the audit (per §0.4 #4 — "lookup-table rows carry behavior bindings").

**Covers:**
- Schema extension: `status_behavior_bindings` table extending Pass 2 schema
- 80 status surfaces × their bindings inventory (full catalog from audit M1-M13)
- How action handlers consult bindings (e.g., `invoices:edit` checks `current_status.allows_edit` before proceeding)
- State transition matrix per status surface (which transitions valid; which require A approval)
- Integration with Pass 3 algorithms (binding checks happen in Phase 3 alongside cross-cutting constraints)
- Operator-configurable bindings vs system-locked
- UI signaling: how status binding state drives UI rendering (e.g., disabled Edit button when current status doesn't allow edit)

Pass 5 will produce v0.5 of the design doc.

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. **Permissions Design Pass 4 of 11 complete (audit phase already closed).** Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md` v0.14, `NEXVELON_PERMISSIONS_DESIGN.md` v0.4, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you. Next pending work: Permissions Design Pass 5 (Status Surface Binding Layer).

**End of Session S handoff.**
