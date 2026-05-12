# NEXVELON_SESSION_R_HANDOFF.md

> **Hand-off for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-R codification.
> Session R completed Pass 3 of the Permissions Design (Resolution Algorithm).
> Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session R state + Pass 3 summary
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final — audit complete)
>   5. `NEXVELON_PERMISSIONS_DESIGN.md` v0.3 — Passes 1-3 of 11 complete
>   6. `NEXVELON_ROADMAP.md`
>   7. `NEXVELON_SESSION_Q_HANDOFF.md` — prior session (Pass 2)
>   8. Earlier handoffs (P through A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session R focus

Completed Pass 3 of the Permissions Design (Resolution Algorithm). Specified three intertwined runtime algorithms (A1 action grant, A2 data scope, A3 field visibility) with seven-phase A1 resolution flow, performance budgets, RLS integration, edge cases, failure modes, debug API, observability metrics. Six open questions resolved.

This is the runtime spec. Pass 2 gave us tables; Pass 3 gives us the algorithm that ties them together at <5ms p99.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_PERMISSIONS_DESIGN.md` | Replaced v0.2 with v0.3 — Pass 2 condensed to §9 summary (full at 1bafbd4); Pass 3 full content §10-§19 |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session R state |
| `NEXVELON_ROADMAP.md` | Item 2 progress note updated: Pass 3 of 11 complete |
| `NEXVELON_SESSION_R_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged.

═══════════════════════════════════════════════════════════════════════════════
## 2. PASS 3 SUMMARY (Resolution Algorithm)
═══════════════════════════════════════════════════════════════════════════════

### Three intertwined algorithms

**A1 — Action grant resolution.** 7-phase: cache lookup (Phase 1) → base table resolution on miss (Phase 2: permission_definitions → role_permissions → user_permission_overrides → UI state resolution) → cross-cutting constraint checks (Phase 3: separation of duties, regulatory expiry) → audit logging (Phase 4) → return.

**A2 — Data scope resolution.** Returns SQL filter clause + bind parameters. Uses data_scope_definitions filter_sql_template; substitutes :current_user.

**A3 — Field visibility resolution.** Returns visible / masked / hidden. Honors is_never_granted (PCI). Triggers audit-on-read for sensitive fields (banking).

### Compound resolution

Typical request runs all three:
1. A1 — can user access endpoint?
2. A2 — which records?
3. A3 — which fields per record?

Three worked walkthroughs: GET /api/clients (list), POST /api/invoices/{id}/approve (action), GET /api/scheduling/calendar (heavy permission-aware).

### Performance budget

- <5ms p99 compound resolution
- <1ms cache hit (Phase 1 only)
- <3ms cache miss (Phases 1-2)
- <5ms with constraint checks (Phases 1-3)
- <50ms p99 typical 50-record list endpoint
- <15ms p99 detail endpoint
- <30ms p99 action endpoint
- Cache hit rate target: >95% under normal load

### Cache invalidation triggers (5)

PostgreSQL triggers handle:
1. INSERT/UPDATE/DELETE on role_permissions
2. INSERT/UPDATE/DELETE on user_permission_overrides
3. UPDATE on users.role_id
4. UPDATE on permission_definitions.is_deprecated

Daily cron handles:
5. Rows where expires_at < NOW() (expired temporary overrides)

### Five worked resolution traces

1. SR `clients:viewList` → cache hit, granted by role default
2. PM `ap_bills:approve` on bill they created → denied by separation of duties
3. PM `contractor_work_orders:create` with expired-WSIB contractor → denied by regulatory expiry block
4. Tech `payments:view:full_card_number` → denied by PCI compliance lock (never granted)
5. (Plus co-sign + public action + system-generated + temp override edge cases)

### Five edge cases handled

1. **Granted-but-blocked-by-regulatory-expiry**: user_override does NOT bypass §0.4 #12; only regulatory_expiry_overrides entries (require A + reason) bypass
2. **Co-sign action** (hard close): allows_co_sign + co_sign_role_codes; algorithm checks "has OTHER role initiated softClose first?"
3. **Public action** (signed URL): A1 NOT called; separate signed URL validator
4. **System-generated action**: A1 NOT called; executes under "system" identity; audit captures NULL actor_user_id
5. **Expired temporary override**: cache row's expires_at < NOW() → cache miss → fallback to role default → audit event 'user_override_expired'

### Failure modes

- **Fail-closed** for: action grants, regulatory expiry checks, separation of duties
- **Fail-open** for: audit logging (retried by reconciliation cron), cache warming
- **Cache table unavailable**: fall back to base table resolution (slower but correct)
- **permission_definitions row missing**: return is_granted=FALSE + alert admin
- **Constraint check timeout**: fail-closed; deny with reason 'constraint_check_timeout'

### Debug API (Admin-only)

`GET /api/admin/permission-debug?user_id=X&action_name=Y&target_entity_id=Z` returns full resolution trace with phase-by-phase breakdown, durations, and final result.

### Six Pass 3 open questions resolved

1. Cache scope: per-user (not global)
2. Stale-while-revalidate: 5min threshold for dashboard reads only
3. Algorithm versioning: function name versioning (resolve_action_grant_v1)
4. A/B testing permissions: NO at v1; Phase 2
5. Real-time revocation: invalidation triggers; effective within ms for next request
6. Multi-tenant: deferred Phase 2

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

**Feature audit:** 🏁 COMPLETE — 13 of 13 modules walked.

**Permissions design:** 3 of 11 passes complete.
- Pass 1: Action Vocabulary Catalog
- Pass 2: Database Schema (14 tables + 1 materialized view)
- Pass 3: Resolution Algorithm (3 algorithms; 7-phase A1; performance budget; failure modes; debug API)

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT — Pass 4 (Field-Level Visibility Engine)
═══════════════════════════════════════════════════════════════════════════════

Pass 4 details the engine implementing Algorithm A3 from Pass 3 at the serialization + UI layers.

**Covers:**
- Serialization pipeline (query result → apply visibility → return)
- React component wrappers (`<FieldGated flagName="visibility.clients.banking">...</FieldGated>`)
- Mask formatting library (card last-4, email partial, phone last-4, address city-only)
- Audit-on-read async implementation (doesn't block response; backpressure handling)
- Bulk visibility resolution for list endpoints
- Visibility-aware Postgres views (defense-in-depth + simpler app code)
- Per-tenant field visibility customization (Phase 2 placeholder)
- Catalog of every visibility.* flag mapped to its database column(s)

Pass 4 will produce v0.4 of the design doc.

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. **Permissions Design Pass 3 of 11 complete (audit phase already closed).** Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md` v0.14, `NEXVELON_PERMISSIONS_DESIGN.md` v0.3, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you. Next pending work: Permissions Design Pass 4 (Field Visibility Engine).

**End of Session R handoff.**
