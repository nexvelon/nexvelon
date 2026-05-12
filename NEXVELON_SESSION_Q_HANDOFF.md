# NEXVELON_SESSION_Q_HANDOFF.md

> **Hand-off for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-Q codification.
> Session Q completed Pass 2 of the Permissions Design (Database Schema).
> Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session Q state + Pass 2 summary
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final — audit complete)
>   5. `NEXVELON_PERMISSIONS_DESIGN.md` v0.2 — Passes 1-2 of 11 complete
>   6. `NEXVELON_ROADMAP.md`
>   7. `NEXVELON_SESSION_P_HANDOFF.md` — prior session (Pass 1)
>   8. Earlier handoffs (O through A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session Q focus

Completed Pass 2 of the Permissions Design (Database Schema). Specified 14 tables across 5 groups plus 1 materialized view. Locked three core architectural decisions: one-row-per-action catalog, trigger-invalidated cache strategy, orthogonal data scope tables. Resolved six open questions. Migration order specified for production-safe rollout.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_PERMISSIONS_DESIGN.md` | Replaced v0.1 with v0.2 — Pass 1 condensed to summary §1-§8; Pass 2 full content in §10-§19 |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session Q state |
| `NEXVELON_ROADMAP.md` | Item 2 progress note updated: Pass 2 of 11 complete |
| `NEXVELON_SESSION_Q_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged.

═══════════════════════════════════════════════════════════════════════════════
## 2. PASS 2 SUMMARY (Database Schema)
═══════════════════════════════════════════════════════════════════════════════

### 14 tables across 5 groups

**Group 1 — Core permission tables (5):**
- `permission_definitions` — ~1260-row action catalog
- `roles` — role definitions (11 seeded + custom)
- `role_permissions` — role × permission junction with grant_state + ui_state_override
- `user_permission_overrides` — per-user with mandatory reason + temporary expiration support
- `effective_permissions_cache` — denormalized for <1ms runtime lookups

**Group 2 — Field visibility tables (3):**
- `field_visibility_definitions` — 50+ `visibility.*` flags
- `role_field_visibility` — per-role with 3 states (visible/masked/hidden)
- `user_field_visibility_overrides` — per-user overrides

**Group 3 — Data scope tables (3):**
- `data_scope_definitions` — 7 scope qualifiers with SQL filter templates
- `role_data_scopes` — per-role per-resource (orthogonal to grants)
- `user_data_scope_overrides` — per-user overrides

**Group 4 — Audit table (1, append-only):**
- `permission_audit_log` — UPDATE/DELETE blocked at trigger level; provably immutable

**Group 5 — Cross-cutting constraint tables (3):**
- `separation_of_duties_constraints` — §0.4 #11; supports co-sign for hard close
- `regulatory_expiry_overrides` — §0.4 #12; reason capture + validity window
- `geolocation_retention_policies` — §0.4 #13; operator-configurable retention

**Plus 1 materialized view:**
- `permission_resolution_view` — admin UI view of current effective state per user; nightly + on-demand refresh

### Three architectural decisions locked

1. **One row per action in permission_definitions.** Simplest semantics. 1260 rows is trivial. Granularity mirrors Pass 1 catalog.
2. **Trigger-invalidated cache strategy.** effective_permissions_cache stores resolved (user × permission) result. Invalidated on grant/revoke/override via PostgreSQL triggers. <1ms lookups at runtime.
3. **Orthogonal data scopes.** Scopes are about "which records?" — separate from grants about "what verbs?". Mixable: same action with different scope per role.

### Other key design choices

- **Three-way grant state** in role_permissions: granted / denied / default. 'default' rows can be omitted for storage.
- **UI state override** orthogonal to grant state. Operator can render granted-action as `disabled` for visibility cues.
- **Three field visibility states:** visible / masked / hidden. `masked` enables PCI compliance (show last-4 of card).
- **Append-only audit** with PostgreSQL UPDATE/DELETE triggers — provably immutable.
- **Co-sign support** in separation_of_duties_constraints — hard close requires A + Acc with both signatures captured.
- **RLS as defense-in-depth** — both PostgreSQL Row-Level Security AND application-layer query construction.
- **Geolocation retention:** 'coordinates_null' default purge action; timestamp + appointment_id always retained for audit.

### Migration order

16-step migration:
1-14: Tables in FK dependency order
15: Effective permissions cache (built last; populated by initial resolution run)
16: Materialized view

Plus seeding scripts in order: permission_definitions (~1260 rows) → field_visibility_definitions (~50) → data_scope_definitions (7) → roles (11 system) → role_permissions (~9k) → role_field_visibility → role_data_scopes → separation_of_duties_constraints → geolocation_retention_policies.

### Six open questions resolved in Pass 2

1. Cache TTL: NO TTL at v1 (triggers handle); Phase 2 revisit if staleness becomes a problem
2. Per-record scope overrides: NO at v1; Phase 2 consideration if needed
3. Materialized view refresh: nightly + on-demand via permissions editor
4. Audit log retention: keep permanently at v1; Phase 2 operator-configurable with cold-storage
5. Temporary override cleanup: leave row for auditability; nightly job updates cache
6. RLS vs application-layer: BOTH (defense-in-depth)

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

**Feature audit:** 🏁 COMPLETE — 13 of 13 modules walked.
- ~1260 cumulative actions
- 76 permissions design implications
- ~594 acceptance criteria
- 13 cross-cutting commitments locked

**Permissions design:** 2 of 11 passes complete.
- Pass 1: Action Vocabulary Catalog — verb/qualifier/resource taxonomies + cross-references + special-case treatment
- Pass 2: Database Schema — 14 tables + 1 materialized view; migration order; three architectural decisions; six open questions resolved

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT — Pass 3 (Resolution Algorithm)
═══════════════════════════════════════════════════════════════════════════════

Pass 3 defines the runtime algorithm answering "can user X do action Y on entity Z?" in <5ms using the Pass 2 schema.

**Inputs:** user_id, action_name, optional target_entity_id, optional context (current state, time, location).

**Outputs:** is_granted (boolean), ui_state (hidden/disabled/interactive), resolution_source (debug + audit), reason_if_denied.

**Algorithm phases:**
1. Cache lookup in effective_permissions_cache (hot path <1ms)
2. If cache miss, resolve from base tables (role default + user override + UI state)
3. Apply cross-cutting constraints (separation of duties, regulatory expiry)
4. Apply data scope filter to resulting query
5. Apply field visibility to response
6. Cache result
7. Log to audit if is_sensitive or is_admin_exception flagged

Plus equivalent algorithms for field visibility resolution, data scope resolution, and compound resolution (action + scope + visibility together).

Pass 3 will produce v0.3 of the design doc.

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. **Permissions Design Pass 2 of 11 complete (audit phase already closed).** Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md` v0.14, `NEXVELON_PERMISSIONS_DESIGN.md` v0.2, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you. Next pending work: Permissions Design Pass 3 (Resolution Algorithm).

**End of Session Q handoff.**
