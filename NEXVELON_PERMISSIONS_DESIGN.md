# NEXVELON_PERMISSIONS_DESIGN.md

> **The permissions architecture for Nexvelon — DESIGN PHASE COMPLETE.**
>
> A new Claude Code session reads, in order:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final)
>   4. `NEXVELON_ROADMAP.md`
>   5. `NEXVELON_SESSION_<latest>_HANDOFF.md`
>   6. **This file** — Permissions design specification
>
> **Status:** v0.11 — DESIGN PHASE COMPLETE. All 11 passes locked.
> Build phase opens after this commit.
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
> Pass 10 condensed §10; full at `215ee01`.
> Pass 11 (Migration Plan) full content begins at §11.

---

## 0. How to use this document

### 0.1 Purpose

Design specification for the Nexvelon permissions runtime. **DESIGN PHASE COMPLETE.**

### 0.2 Pass overview — ALL COMPLETE

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
| 10 | Cross-cutting enforcement patterns | ✅ COMPLETE (`215ee01`) |
| 11 | Migration plan | ✅ COMPLETE (this version) |

### 0.3 Role abbreviations

**A** Admin, **PM** Project Manager, **SR** Sales Rep, **Tech** Technician, **Sub** Subcontractor (portal), **Acc** Accounting, **VO** View Only. Plus **Dispatcher** (M12), **Bookkeeper** (M11), **HR-role**, **Executive** (M13).

---

═══════════════════════════════════════════════════════════════════
# Parts I-X — Passes 1-10 condensed summaries
═══════════════════════════════════════════════════════════════════

*Full content preserved at commits noted in §0.2.*

## 1. Pass 1 — Action vocabulary
`resource:verb[:qualifier]` naming. 8 verb categories. 4 qualifier categories. 140+ resources across 13 modules. 4-tier UI hierarchy + 6 cross-cut tabs. ~1260 actions catalogued.

## 2. Pass 2 — Schema
14 tables across 5 groups + 1 materialized view. Three decisions: one row per action; trigger-invalidated cache; orthogonal data scopes. 16-step migration order at end of pass.

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
4 caches with pull invalidation + 8 invalidation event types. Lazy-fill via INSERT ON CONFLICT. Warm-up on login + grant change. Stale-while-revalidate <5min for dashboards only. Read-replica capability ready. Multi-tenant Phase 2 prep. 8 observability metrics + 4 alerts.

## 10. Pass 10 — Cross-cutting enforcement
13 sections mapping 1:1 to §0.4 commitments. Per-commitment enforcement-point inventory + composition matrix + escalation paths + test scenarios + build priority. 5-layer defense pattern. ~54 integration test scenarios. 8-criteria v1 ship checklist.

---

═══════════════════════════════════════════════════════════════════
# Part XI — Pass 11 (Migration Plan) — FULL CONTENT
═══════════════════════════════════════════════════════════════════

## 11. Overview

The bridge between design and execution. Passes 1-10 specified WHAT to build; Pass 11 specifies HOW to roll it out to production without breaking what already works.

### 11.1 Constraints

- Production live since commit `8d44ef7`; users working in it daily
- Existing system has auth + basic permission checks (Pass 0 baseline)
- 56 migration steps from Passes 2-10 cannot all happen at once
- Botched migration = real users blocked from real work
- Rollback must be possible at every phase
- §0.4 data preservation rules apply throughout

### 11.2 Goal

Ship the full permissions system to production in a sequenced way where each phase is independently valuable, independently rollback-able, and verifiable before proceeding.

### 11.3 Three architectural decisions

**Decision 1: Phased rollout (not big-bang).** 6 phases, each independently deployed and verified. Catch problems while only some users affected; rollback contained.

**Decision 2: Runtime-toggleable feature flags.** DB-stored flag table. Flip without redeploy. Audit trail of who toggled what when.

**Decision 3: Eager backfill strategy.** Phase 1 populates expected rows for all existing users + roles before any activation. Hit rate >95% from day one of subsequent phases. Lazy backfill rejected (first-access cache miss per action would be slow).

## 12. The six rollout phases

The 56 migration steps from Passes 2-10 grouped into six deployment phases.

### 12.1 Phase 1 — Foundation (schema + backfill)

**Goal:** Stand up all permissions tables; populate with defaults; everything dormant.

**Migration steps included** (from Pass 2-10 sequence):
- Steps 1-16: All 14 permissions tables + materialized view (Pass 2)
- Steps 17-23: status_behavior_bindings + transitions + cache (Pass 5)
- Steps 24-32: 8 append-only ledgers + partitioning + triggers (Pass 6)
- Steps 33-39: request_admin_access expansion + user_role_assignments (Pass 7)
- Steps 46-53: Cache invalidation triggers + observability infrastructure (Pass 9)

**Feature flag state:** `permissions.engine.enabled = FALSE` (dormant — code paths skip new tables).

**Backfill activities:**
- Seed `permission_definitions` with ~1260 rows from Pass 1 catalogue
- Seed `roles` with 11 system roles
- Seed `role_permissions` with default grants per Pass 1 catalogue role columns
- Seed `field_visibility_definitions` with 47 flags from Pass 4
- Seed `role_field_visibility` with role defaults from Pass 4 §17
- Seed `data_scope_definitions` with 7 scope qualifiers
- Seed `role_data_scopes` with default scopes per role
- Seed `status_behavior_bindings` with ~2000 rows + `status_transition_definitions` with ~600 rows
- Seed `separation_of_duties_constraints` with 4 constraints
- Seed `geolocation_retention_policies` with default 30-day retention
- Migrate existing `users.role_id` to `user_role_assignments` (mark `is_primary=TRUE`)
- Build initial 3 months of partitions per append-only ledger
- Install monthly partition-creation cron
- Apply UPDATE/DELETE triggers to all 8 ledgers

**Verification before declaring Phase 1 complete:**
- All 14+9+8+7 tables exist with correct schema
- Row counts match expectations (1260 permission_definitions, 11 roles, ~9000 role_permissions, etc.)
- All triggers compile and fire correctly on test inserts
- Backfill scripts idempotent (re-running produces same result)
- Existing app continues to function (flag is FALSE; no behavior change)

**Duration:** 1-2 weeks elapsed; mostly waiting on backfill validation.

**Rollback procedure:** All schema changes deployed in a single migration transaction with explicit `BEGIN ... COMMIT`. If anything fails, rollback restores prior state. After commit, rollback requires DROP TABLE for all new objects + data preservation per §0.4 (audit log preserved if any rows already written).

### 12.2 Phase 2 — Resolution algorithm online (read-only)

**Goal:** A1 algorithm + cache reads work; writes still skip new system.

**Migration steps included:**
- Steps 40-44: Build editor frontend bundle + backend endpoints (Pass 8) — deployed but flag-gated
- Build A1 resolution algorithm code (Pass 3) — deployed
- Build A2 + A3 algorithms code (Pass 3) — deployed
- Build effective_permissions_cache invalidation triggers (Pass 9 §17)
- Build observability instrumentation (Pass 9 §23)
- Build warm-up service (Pass 9 §18)

**Feature flag state:**
- `permissions.engine.enabled = TRUE` for A and 2-3 designated PM users (cohort A)
- All other users still on old permission checks

**Verification activities:**
- Cohort A users (Admin + designated PMs) use system; observe via audit log + metrics
- Cache hit rate metrics validate >95% target
- Permission resolution latency p99 measured (<5ms compound target)
- No false denials reported by cohort A
- Audit log entries appearing correctly

**Duration:** 2 weeks (cohort observation period).

**Rollback procedure:** Flip `permissions.engine.enabled = FALSE` for cohort A. Their permissions revert to old system within seconds (cache irrelevant when flag off). No data loss; just code path change.

### 12.3 Phase 3 — Field visibility + data scopes activate

**Goal:** Frontend serialization pipeline + `<FieldGated>` wrapper + data scope filters live in production.

**Migration steps included:**
- Build `<FieldGated>` component + VisibilityContext provider (Pass 4)
- Build serialization transformer pipeline (Pass 4)
- Build 12 mask formatter functions (Pass 4)
- Build async batched audit-on-read service (Pass 4)
- Build 5 database views for sensitive resources (Pass 4 §16.2)
- Build data scope filter injection in query layer (Pass 3 A2)
- Configure RLS policies (Pass 3 §12.5)

**Feature flag state:**
- `permissions.field_visibility.enabled = TRUE` for cohort B (all PMs + Accounting)
- `permissions.data_scopes.enabled = TRUE` for cohort B

**Verification activities:**
- Field visibility rendering correctly per Pass 4 §17 catalogue across cohort B users
- Banking sections masked for non-Acc users
- Internal notes hidden from SRs
- Profit margins hidden from non-PM users
- Audit-on-read events firing for banking access
- Data scope filters returning correct subsets
- No data leak via raw API access (defense-in-depth: app transformer + view + RLS)

**Duration:** 2 weeks.

**Rollback procedure:** Flip flags FALSE; users revert to seeing all fields and all scopes (old behavior). Cached visibility entries invalidated.

### 12.4 Phase 4 — Status bindings + cross-cutting constraints

**Goal:** Phase 3.3 status binding check + Phase 3.1 SoD + Phase 3.2 regulatory expiry all live.

**Migration steps included:**
- Build A1 Phase 3 cross-cutting constraint logic (Pass 3 + Pass 5 + Pass 10)
- Build effect executor for status transitions (Pass 5 §16.3)
- Build separation_of_duties runtime check + DB trigger defense-in-depth (Pass 3 + Pass 10)
- Build regulatory_expiry_overrides workflow (Pass 3 + Pass 10)
- Build Ontario 60-day lien clock enforcement (Pass 5 §19.2)
- Build co-sign workflow (Pass 5 §15.2 + Pass 10 §21)

**Feature flag state:**
- `permissions.cross_cutting.enabled = TRUE` for cohort C (all PMs + SRs + Accounting)
- Tech + Admin remain on full system

**Verification activities:**
- Sent invoice edits blocked (immutable snapshots §0.4 #8)
- AP bill creator cannot approve own (SoD §0.4 #11)
- Hard close requires A + Acc co-sign (§0.4 #11)
- Expired-insurance vendor PO creation blocked unless overridden (§0.4 #12)
- Override actions require reason capture and emit audit events
- Lien deadline enforcement: cannot close Trade Contractor WO before 60 days

**Duration:** 3 weeks (more complex behavior validation).

**Rollback procedure:** Flag FALSE → cross-cutting constraints skip Phase 3; users revert to action grant only.

### 12.5 Phase 5 — Permissions editor UI live

**Goal:** Admin can manage permissions through full editor; request workflow live.

**Migration steps included:**
- Step 40-45: Permissions editor frontend (all 6 sections — Pass 8)
- Pass 7 request workflow: submit + approve + grant fire + notify
- Notification routing (in-app + email + Slack)
- Pending request auto-expiry cron
- Scheduled grant cron

**Feature flag state:**
- `permissions.editor.enabled = TRUE` for all Admin users
- Request workflow available to all users (submission); approval only to Admin

**Verification activities:**
- Admin can grant/revoke from editor; changes propagate via cache invalidation
- Users submit requests; admins receive notifications
- Approval triggers user_permission_override; permission becomes active within seconds
- Auto-expiry runs; expired grants revert
- Audit captures all activities

**Duration:** 2-3 weeks.

**Rollback procedure:** Disable editor for admins; revert to direct DB grant management (manual SQL). Existing grants preserved.

### 12.6 Phase 6 — Full activation + cutover

**Goal:** All users on new system; old permission code paths removed; system is authoritative.

**Migration steps included:**
- Steps 54-56: Integration test suite + commitment verification API + operator documentation generator (Pass 10)
- Build remaining audit query endpoints (Pass 6 §16)
- Build M13 compliance reports (Pass 6 §16.5)
- Build cache diagnostic API endpoint (Pass 9 §23.3)
- Flip ALL users to new permissions system

**Feature flag state:**
- `permissions.engine.enabled = TRUE` for ALL users
- Old permission code paths begin deprecation

**Verification activities:**
- All v1 ship checklist criteria from Pass 10 §25.3 pass:
  - [ ] All 13 commitments enforced at runtime
  - [ ] All 13 integration tests passing (~54 tests)
  - [ ] Pass 10 §24 composition matrix verified
  - [ ] Audit emits all 32 event types correctly
  - [ ] Permissions editor renders all 6 sections
  - [ ] Cache hit rate >95% under simulated load
  - [ ] All admin exceptions require reason capture
  - [ ] All append-only ledgers reject UPDATE/DELETE with P0001

**Duration:** 2 weeks of cutover + 4 weeks parallel observation.

**Rollback procedure:** After full cutover, rollback becomes a major operation (revert deploys + data preservation work). Treat as emergency-only. Soft rollback per cohort (return cohort to old code path) is preferred if issues arise.

**Old code paths removed:** ~4 weeks after Phase 6 successful cutover, the old permission check code paths are removed from codebase. Phase 6.1 (mini-phase) cleanup.

## 13. Feature flag table

Runtime-toggleable flags stored in DB. Each flag controls one rollout dimension.

```sql
CREATE TABLE feature_flags (
  flag_name TEXT PRIMARY KEY,
  enabled_globally BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_user_ids UUID[] DEFAULT '{}'::UUID[],
  enabled_role_codes TEXT[] DEFAULT '{}'::TEXT[],
  description TEXT,
  enabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES users(id),
  notes TEXT
);
```

Application checks flag at request time:
```typescript
// Pseudocode
async function isFeatureEnabled(flagName: string, userId: string): Promise<boolean> {
  const flag = await db.queryOne('SELECT * FROM feature_flags WHERE flag_name = $1', [flagName]);
  if (!flag) return false;
  if (flag.enabled_globally) return true;
  if (flag.enabled_user_ids?.includes(userId)) return true;
  const userRole = await getUserRole(userId);
  if (flag.enabled_role_codes?.includes(userRole.code)) return true;
  return false;
}
```

### 13.1 Flag catalogue

| Flag name | Controls | Phase introduced |
|---|---|---|
| `permissions.engine.enabled` | A1 algorithm + cache reads | Phase 2 |
| `permissions.field_visibility.enabled` | Pass 4 backend pipeline + frontend `<FieldGated>` | Phase 3 |
| `permissions.data_scopes.enabled` | A2 data scope filter injection + RLS | Phase 3 |
| `permissions.cross_cutting.enabled` | Phase 3.1/3.2/3.3 constraints in A1 | Phase 4 |
| `permissions.audit_on_read.enabled` | Async batched sensitive field audit | Phase 3 |
| `permissions.append_only_triggers.enabled` | UPDATE/DELETE blocking on ledgers | Phase 1 (off until tested) |
| `permissions.editor.enabled` | Permissions editor UI access for admins | Phase 5 |
| `permissions.request_workflow.enabled` | Pass 7 request submission and approval | Phase 5 |
| `permissions.cache_warmup.enabled` | Async warm-up on login | Phase 2 |
| `permissions.read_replica.enabled` | Cache reads route to replica vs primary | (deferred per Pass 9 §22) |

Flags flipped via admin tool (Phase 5 includes a feature flag editor sub-page).

### 13.2 Per-cohort rollout pattern

Each phase has a defined cohort (subset of users) that activates first. Cohort sequence:

- **Cohort A (Phase 2):** A + 2-3 designated PM users (~5 users)
- **Cohort B (Phase 3):** Cohort A + remaining PMs + all Acc (~15-20 users)
- **Cohort C (Phase 4):** Cohort B + all SRs (~30-40 users)
- **Cohort D (Phase 5):** Cohort C + all Tech (~70-80 users)
- **Cohort E (Phase 6):** ALL users — global activation

Cohort sizing assumes ~120 total users in v1 production. Numbers adjust by tenant.

## 14. Backward compatibility during rollout

The existing app must keep working as the new system progressively comes online.

### 14.1 The dual-path pattern

For each gated check, the application code looks like:

```typescript
// Pseudocode for build phase
async function checkPermission(userId: string, actionName: string): Promise<boolean> {
  if (await isFeatureEnabled('permissions.engine.enabled', userId)) {
    // New system: full A1 algorithm
    return await resolveActionGrant(userId, actionName).is_granted;
  }
  
  // Old system: legacy check
  return await legacyPermissionCheck(userId, actionName);
}
```

Both paths exist simultaneously during rollout. Flag determines which runs per user.

### 14.2 Schema additions are backward-compatible

All new tables are ADDITIVE — no existing tables are dropped or restructured during rollout. The existing `users.role_id` column remains; new `user_role_assignments` table is populated FROM it (preserving primary role). The old column stays for backward compat.

After Phase 6 successful cutover (and Phase 6.1 cleanup), `users.role_id` can be deprecated (kept as cached convenience; new code reads from `user_role_assignments`).

### 14.3 API contracts

Existing API endpoints continue to return the same shape. New permission-gated endpoints either:
- Use the dual-path check (some users see new logic; others see old)
- Are new endpoints that don't replace existing ones (so old paths keep working)

After Phase 6 + cleanup: old endpoints deprecated; clients migrated to new endpoints over time.

### 14.4 Existing user grants

At Phase 1 backfill:
- For each existing user with role X, populate `user_role_assignments` row (`is_primary=TRUE`)
- For each existing user with custom permission overrides (if any in old system), populate equivalent `user_permission_overrides` row
- No user loses permissions during transition

Verification: spot-check 20 random existing users; verify their effective permissions before vs after Phase 1 produce identical results.

## 15. Performance baseline + monitoring

Before Phase 2 activation, establish performance baseline. During phases, watch for regressions.

### 15.1 Baseline metrics (collected before Phase 2)

| Metric | Target baseline (pre-permissions) |
|---|---|
| Average request latency p99 | <200ms |
| List endpoint latency p99 (50 records) | <300ms |
| Authentication overhead | <20ms |
| Database CPU | <40% |
| Database connection pool utilization | <60% |

### 15.2 During-rollout monitoring

After each phase, compare to baseline:

| Metric | Phase 2 target | Phase 6 target |
|---|---|---|
| Request latency p99 | <230ms (+15%) | <250ms (+25%) |
| List endpoint p99 | <340ms (+13%) | <370ms (+23%) |
| Permission check overhead | <5ms p99 | <5ms p99 |
| Cache hit rate | N/A | >95% |
| Database CPU | <50% | <55% |

If metrics exceed targets, investigation needed before proceeding to next phase. Rollback ready if numbers regress >50%.

### 15.3 Alerts during rollout

Per Pass 9 §23.2 + additional rollout-specific:

- `permission_cache.hit_rate < 90%` for >5 minutes → investigate
- `permission_resolution.duration_ms.p99 > 5ms` for >5 minutes → DB load issue
- `permission_audit_log.insert_failure_rate > 0.1%` → trigger or table issue
- `feature_flag_check_latency.p99 > 5ms` → flag check shouldn't be slow
- `legacy_permission_check.duration_ms > 100ms` → old system degrading

### 15.4 Rollout dashboard

Custom dashboard for the rollout period showing:
- Current phase (1-6)
- Active flags + their cohort scope
- Metric comparison to baseline
- Recent rollback events (if any)
- User feedback channel (any reported issues from new vs old system)

After Phase 6 + cleanup, rollout dashboard becomes general permissions ops dashboard.

## 16. Smoke test checklist (per phase)

After each phase deployment, run smoke tests before declaring phase complete.

### 16.1 Phase 1 smoke (schema + backfill)

- [ ] All 23+ new permissions tables exist with correct schema (DESCRIBE TABLE output matches spec)
- [ ] Row counts match: 1260 permission_definitions, 47 field_visibility_definitions, 7 data_scope_definitions, 11 roles, ~9000 role_permissions, ~50 role_field_visibility, ~25 role_data_scopes, ~2000 status_behavior_bindings, ~600 status_transition_definitions, 4 separation_of_duties_constraints
- [ ] All triggers compile (no NOTICE/WARNING on creation)
- [ ] Trigger smoke test: INSERT a test row into role_permissions; verify effective_permissions_cache invalidation event fires (logged to ops)
- [ ] Append-only ledger triggers fire: UPDATE attempt on inventory_movements raises P0001
- [ ] Monthly partition cron schedule created in cron service
- [ ] Initial 3 partitions per ledger exist (current + previous + next month)
- [ ] All existing user permissions resolve identically to pre-deploy (spot check 20 users)
- [ ] Feature flag table populated with all 10 flags, all `enabled_globally=FALSE`
- [ ] Application logs show NO permission resolution attempts via new system (flags FALSE)
- [ ] Production app remains functional (random user testing)

### 16.2 Phase 2 smoke (resolution algorithm)

- [ ] Cohort A users have `permissions.engine.enabled = TRUE`
- [ ] Cohort A users see no functional changes (default grants produce identical results to old system)
- [ ] Permission audit log shows entries for cohort A users
- [ ] Cache hit rate metric reports >50% within 30 minutes (warming up)
- [ ] Cache hit rate metric reports >95% after 24 hours
- [ ] Permission resolution duration p99 <5ms
- [ ] No FALSE negatives reported (denied actions that should be granted)
- [ ] No FALSE positives reported (granted actions that should be denied)
- [ ] Warm-up service fires on cohort A logins; logs warm-up completion
- [ ] Cache invalidation triggers fire on admin permission changes; verified via DB log

### 16.3 Phase 3 smoke (field visibility + scopes)

- [ ] Cohort B users see banking sections per role: A/Acc visible, others masked/hidden
- [ ] Cohort B users see profit fields per role: A/PM/Acc visible, others hidden
- [ ] Cohort B users see internal notes per role: A/PM/Acc visible, others hidden
- [ ] PCI compliance: `payments.fullCardNumber` never visible to any user including Admin
- [ ] Audit-on-read events firing for banking field access by Acc users
- [ ] Async audit-on-read flush completing within 100ms target
- [ ] Data scope filters return correct subsets: SR sees own clients only; PM sees team; A sees all
- [ ] RLS policies prevent direct database query bypass (test: try to SELECT all clients as a non-Admin user session)
- [ ] View layer (`v_clients_with_visibility`, etc.) masks correctly when read directly

### 16.4 Phase 4 smoke (cross-cutting)

- [ ] Sent invoice edit attempt blocked with clear error message
- [ ] AP bill creator approval attempt blocked with SoD reason
- [ ] Hard close requires both A and Acc signatures; single-role attempt blocked
- [ ] Expired-insurance vendor PO creation blocked with regulatory reason
- [ ] Admin can create regulatory override with reason capture; PO then permitted
- [ ] Ontario 60-day lien clock: Trade Contractor WO close attempt at day 30 blocked; at day 61 allowed
- [ ] Effect executor: invoice send triggers GL entry creation, customer notification, etc.
- [ ] All denials emit appropriate audit events
- [ ] Cross-cutting tests pass: ~54 integration tests per Pass 10 §26

### 16.5 Phase 5 smoke (editor + requests)

- [ ] Admin accesses permissions editor at expected URL
- [ ] All 6 editor sections render correctly
- [ ] Admin can grant a test permission to a user; verify next request reflects (cache invalidates)
- [ ] User submits request via UI; admin receives notification (in-app + email)
- [ ] Admin approves request; user_permission_override row created; permission becomes active
- [ ] Auto-expiry cron runs; expired temporary grant reverts user to role default
- [ ] All editor activity audited as `editor_batch_save` events
- [ ] Mobile responsive: admin approves request from phone (large tap targets working)
- [ ] WCAG 2.1 AA accessibility: keyboard navigation through editor works; screen reader announces state changes

### 16.6 Phase 6 smoke (full activation)

- [ ] All users have `permissions.engine.enabled = TRUE`
- [ ] All v1 ship checklist criteria from Pass 10 §25.3 pass:
  - All 13 commitments enforced
  - All 13 integration tests passing
  - Composition matrix verified
  - Audit emits all 32 event types
  - Editor renders all 6 sections
  - Cache hit rate >95% under load
  - All admin exceptions require reason capture
  - All append-only ledgers reject modifications
- [ ] No regression alerts firing
- [ ] User feedback: positive or neutral (no major complaints from cohort)
- [ ] Permission resolution duration p99 <5ms under production load
- [ ] Old permission check code paths still present (will be removed in Phase 6.1)

## 17. Rollback procedures per phase

For each phase, the exact procedure to revert if things break.

### 17.1 Phase 1 rollback (schema deployment)

**If Phase 1 deploy fails:** Transaction rolls back automatically (all DDL in BEGIN..COMMIT).

**If issues discovered post-deploy:**
- New tables can be DROPPED in reverse FK order
- Existing tables untouched throughout Phase 1 (only additive)
- Cron jobs disabled
- Triggers dropped
- Estimated rollback time: 30 minutes

Data preservation: any rows already written to new tables can be exported to backup before DROP.

### 17.2 Phase 2 rollback (algorithm online)

**Step 1:** Flip `permissions.engine.enabled = FALSE` for cohort A users.

**Step 2:** Users immediately revert to legacy permission checks on next request.

**Step 3 (if needed):** Disable cache writes by flipping `permissions.cache_warmup.enabled = FALSE`.

**Step 4 (if needed):** Truncate effective_permissions_cache. Empty cache; system functional via legacy path.

Estimated rollback time: <1 minute (just flag flip).

### 17.3 Phase 3 rollback (field visibility + scopes)

**Step 1:** Flip `permissions.field_visibility.enabled = FALSE` for cohort B users.

**Step 2:** Frontend re-renders without `<FieldGated>` masking; all fields visible per old system.

**Step 3:** Flip `permissions.data_scopes.enabled = FALSE`. Scope filters stop being injected; queries return as before.

**Step 4:** Async audit-on-read service idles (no more events from this).

Estimated rollback time: <1 minute per flag flip.

**Concerns:** Some sensitive data may have been exposed during the affected window — capture by auditing access logs.

### 17.4 Phase 4 rollback (cross-cutting constraints)

**Step 1:** Flip `permissions.cross_cutting.enabled = FALSE` for cohort C users.

**Step 2:** Phase 3 of A1 algorithm becomes no-op; cross-cutting checks skipped.

**Step 3:** Users can again perform actions that should have been blocked (Sent invoice edits, SoD violations, expired regulatory).

**Step 4:** Database triggers (defense-in-depth for SoD; append-only) remain active — second line of defense.

Estimated rollback time: <1 minute.

**Concerns:** Reverting cross-cutting opens compliance holes. Don't rollback unless absolutely necessary; prefer fixing forward.

### 17.5 Phase 5 rollback (editor + requests)

**Step 1:** Flip `permissions.editor.enabled = FALSE`. Admin cannot access editor UI.

**Step 2:** Existing role/permission grants remain functional (data persisted).

**Step 3:** Admin manages grants via direct DB SQL until editor is restored.

**Step 4:** Pending requests in workflow remain visible to admins via SQL query; can be approved manually.

Estimated rollback time: 5 minutes (flag flip + manual DB operations re-enable).

### 17.6 Phase 6 rollback (full activation)

This is the hardest rollback. After cutover, the system is authoritative; old code paths deprecating.

**If issues discovered:**
1. Flip `permissions.engine.enabled = FALSE` globally
2. ALL users revert to legacy permission system
3. Cache becomes stale; no harm if not used
4. Investigate; fix forward preferred

**Soft rollback per cohort (recommended approach):**
- Identify the cohort experiencing issues
- Disable `permissions.engine.enabled` for that cohort only
- Investigate; fix; re-enable

**Hard rollback (last resort):**
- Disable all permissions flags globally
- Reactivate legacy permission system
- Address issues
- Re-attempt Phase 6 from scratch

After Phase 6.1 cleanup (~4 weeks post-cutover), old code paths removed and hard rollback no longer possible. Treat Phase 6.1 as point-of-no-return.

## 18. Go-live cutover plan

The final flip from "new system optional" to "new system authoritative."

### 18.1 Pre-cutover checklist

- All Phase 1-5 smoke tests passing for 2+ weeks
- Cache hit rate >95% sustained for 2+ weeks
- Zero high-severity production incidents related to permissions for 2+ weeks
- User feedback channel reports neutral-or-positive sentiment
- Performance baseline shows no significant regression
- All v1 ship checklist criteria (Pass 10 §25.3) verified

### 18.2 Cutover sequence

1. **T-48h:** Final go/no-go decision in stakeholder meeting. Operator + Admin user confirms.
2. **T-24h:** Communications to all users: "Permissions system upgrading 2026-XX-XX 09:00 UTC; expect 1-2 hours of slightly slower response."
3. **T-0:** Flip `permissions.engine.enabled = TRUE` globally. Triggers warm-up on next-active users.
4. **T+15min:** Verify metrics: cache hit rate climbing to >50%; latency targets being met.
5. **T+60min:** Verify metrics: cache hit rate >85%.
6. **T+24h:** Verify metrics: hit rate >95% sustained. Run smoke tests.
7. **T+1 week:** Verify metrics: no regressions; user feedback positive. Phase 6 deemed successful.

If any verification step fails:
- T+15min: rollback (flag global FALSE); investigate within 1 hour
- T+60min: rollback if hit rate <30%; investigate
- T+24h: rollback if hit rate <85%; investigate

### 18.3 Post-cutover (Phase 6.1)

After 4 weeks of stable Phase 6:
- Remove legacy permission code paths from codebase
- Deprecate `users.role_id` (keep column; new code reads from `user_role_assignments`)
- Documentation update: legacy patterns removed
- Final design phase closure announcement

## 19. Monitoring activation timeline

Observability metrics from Pass 9 §23 activated incrementally per phase.

### 19.1 Phase 1 metrics

- `permission_definitions.total_rows`
- `roles.total_rows`
- `feature_flags.total_rows`
- All append-only ledger row counts
- Migration script run logs

### 19.2 Phase 2 metrics (Pass 9 §23 baseline)

- `permission_cache.hits_total`
- `permission_cache.misses_total`
- `permission_cache.lookup_duration_ms`
- `permission_resolution.duration_ms`
- `permission_cache.size_rows`

### 19.3 Phase 3 metrics

- `field_visibility.audit_on_read_count`
- `field_visibility.flush_duration_ms`
- `data_scope.filter_application_count`
- `view_layer.read_count_per_resource`

### 19.4 Phase 4 metrics

- `separation_of_duties.violations_blocked`
- `regulatory_expiry.blocks_triggered`
- `regulatory_expiry.overrides_invoked`
- `status_transitions.executed_count`
- `effect_executor.tasks_queued`

### 19.5 Phase 5 metrics

- `permission_editor.batch_saves_total`
- `permission_editor.conflict_detected_count`
- `request_admin_access.submitted_count`
- `request_admin_access.approved_count`
- `request_admin_access.rejected_count`
- `request_admin_access.expired_count`

### 19.6 Phase 6 metrics

- Full Pass 9 §23 catalogue active
- Custom dashboards built for ops team
- Alerts configured per Pass 9 §23.2 thresholds

## 20. Risk register

Risks identified during planning + mitigation strategies.

### 20.1 High-impact risks

| Risk | Mitigation |
|---|---|
| **Trigger function breaks during deploy** | Test in staging extensively; staged deployment; manual rollback to drop trigger if needed |
| **Cache invalidation race condition causes stale grants** | `last_invalidated_at` check on writes; Pass 9 §24.3; monitoring alerts on extended staleness |
| **Field visibility false-exposure of banking data** | Defense-in-depth: app transformer + view + RLS; spot-check audits; clear error messaging on visibility plan failures |
| **Cross-cutting constraint blocks legitimate work** | Phased cohort rollout catches false-positives before global; clear admin exception path |
| **Performance regression from caching overhead** | Baseline metrics; per-phase regression thresholds; rollback triggers |

### 20.2 Operational risks

| Risk | Mitigation |
|---|---|
| **Admin accidentally grants too-broad permission** | Conflict detection in editor (Pass 8 §23.3); audit captures all changes |
| **Cohort users frustrated by behavior change** | Communications; cohort feedback loop; willing to roll back if needed |
| **Edge case discovered post-launch** | Phased rollout; ability to disable specific phases; soft rollback |

### 20.3 Schedule risks

| Risk | Mitigation |
|---|---|
| **Phase X takes longer than 2-week target** | Build phase plans 30% buffer; if Phase 3 takes 4 weeks instead of 2, that's acceptable; pipeline tolerates |
| **Holiday/blackout periods disrupt rollout** | Plan rollouts to avoid year-end, fiscal close, major holidays |

## 21. Communication plan

User-facing communications throughout rollout.

### 21.1 Pre-Phase 1

Email to all users from operator: "Major permissions upgrade coming. Phased rollout over 12-16 weeks. Most users see no change initially. Detailed permissions for some sensitive fields gradually rolling out. Questions to ops@nexvelonglobal.com."

### 21.2 Per-phase communications

- T-24h: "Phase X going live tomorrow morning. Expected behavior changes for cohort N: ..."
- T+0: "Phase X is live. If you experience unexpected behavior, contact ops."
- T+24h: "Phase X performing as expected. Thanks for patience."

### 21.3 Phase 5 specific (user-facing)

When request workflow goes live, users get an in-app banner: "New: if you need temporary access to a feature, click 'Request Access'."

### 21.4 Phase 6 cutover

Full announcement: "Permissions upgrade complete. New features: granular access control, role-based dashboards, audit trail for sensitive actions. Documentation at /docs/permissions."

## 22. Success criteria

The rollout is considered successful when ALL of these are TRUE:

1. **All 6 phases deployed without major incident** (no >2-hour outage; no widespread user complaints)
2. **v1 ship checklist (Pass 10 §25.3) passes for 4 consecutive weeks**
3. **No user reports data leak or wrong-permission incident**
4. **Performance baselines maintained (within targets)**
5. **Cache hit rate sustained >95% across 4 consecutive weeks**
6. **All 13 §0.4 commitments demonstrably enforced**
7. **Audit log captures all activities; compliance officer satisfied with coverage**
8. **At least one Phase 7-style request approval has gone through workflow end-to-end successfully**
9. **At least one operator-defined custom role has been created and is in use**
10. **Operator-facing documentation auto-generated and helpful to support tickets**

## 23. Open questions (Pass 11)

1. **Should we run rollout in staging environment first?** Decision: YES — full Phase 1-6 dry run in staging before production Phase 1. Staging-prod parity check required. Build phase confirms staging is comparable.

2. **Should we plan a v1.1 patch release for issues discovered post-launch?** Decision: YES — block out 4 weeks post-Phase-6 for v1.1 patch deploys addressing discovered edge cases. Phase 2 cleanup work falls into this.

3. **Should we allow operators to opt-out of certain phases?** Decision: NO — phases are sequenced; opt-out breaks dependencies. Operator can request earlier Phase 6 cutover if confident; cannot skip phases.

4. **What if a Phase X gets stuck for >4 weeks?** Decision: stakeholder review; could be: legitimate complexity discovered (extend phase), implementation issue (fix and proceed), or fundamental design issue (revisit design). Don't proceed to next phase until current passes.

5. **Should we have a single "go-live" date for all customers?** Decision: NO — each tenant rollout independently in Phase 2 (multi-tenant). v1 single-tenant has one go-live.

6. **Should we publish the rollout plan publicly to users?** Decision: high-level summary to users; detailed plan internal only. User communications focus on what they'll experience, not internal mechanics.

## 24. Cumulative summary — Permissions Design Phase

### 24.1 What was designed

Across 11 passes:
- ~1260 actions normalized with `resource:verb[:qualifier]` vocabulary
- 23+ database tables across 5 functional groups + 1 materialized view
- 3 runtime resolution algorithms (A1, A2, A3) with <5ms p99 compound resolution
- 47-flag field visibility catalog with 12 standard mask types
- 80 status surfaces with polymorphic behavior bindings
- 8 append-only ledgers with uniform pattern + monthly partitioning
- Request-admin-access workflow with 4 request types + 7-state lifecycle
- Permissions editor UI with 6 sections + cross-section linking + accessibility
- 4-cache architecture with pull invalidation + warm-up + observability
- 13 §0.4 cross-cutting commitments fully enforcement-mapped
- 56-step migration order with 6-phase deployment plan

### 24.2 What's locked across the phase

- **Total events in `permission_audit_log` catalogue: 32** (21 from Pass 6 + 9 from Pass 7 + 2 from Pass 8)
- **Performance targets: <5ms p99 compound resolution; >95% cache hit rate**
- **All 13 §0.4 commitments have MVP-critical v1 implementation specified**
- **Phase 2 hardening backlog catalogued (~30 items across all passes)**

### 24.3 What ships in v1

Per Pass 10 §25 build phase priorities — all 13 commitments at MVP-critical level with specific v1 implementations. Phase 2 hardening for advanced cases.

### 24.4 What's deferred to Phase 2

~30 items across all passes. Major categories:
- Multi-tenant partitioning
- Multi-region replica
- Cryptographic snapshot integrity (hash chain)
- Cold archival to S3 Glacier
- Multi-step approval workflows
- GDPR-compliant configurable retention
- ML-based suggestions
- Plugin architecture for operator-defined custom actions/bindings/flags
- SOC 2 Type II hardening

### 24.5 Build phase pipeline

After Pass 11 commits:
1. Update ROADMAP item 2 to "✅ COMPLETE — 11 of 11 passes locked"
2. Update ROADMAP item 3 to "🚧 IN PROGRESS — Permissions module build"
3. Build phase starts with Phase 1 from Pass 11 §12.1 (Foundation: schema + backfill)

---

═══════════════════════════════════════════════════════════════════
# 25. End of design phase
═══════════════════════════════════════════════════════════════════

This is the final design pass. After commit, the permissions design phase formally closes.

### 25.1 What the next Claude Code session does

For the NEXT session opening (build phase Session A):

> Continuing Nexvelon build. **Permissions Design Phase COMPLETE — all 11 passes locked. Build phase opening with Phase 1 (Foundation: schema + backfill).** Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md` v0.14, `NEXVELON_PERMISSIONS_DESIGN.md` v0.11, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Build phase begins with Phase 1: deploy permissions schema + backfill existing user/role data. Feature flags off; system dormant; verify backfill correctness.

### 25.2 Design phase metrics

- Sessions used: 11 (Sessions P-Z including this)
- Cumulative architectural decisions locked: ~35
- Cumulative open questions resolved: ~50
- Total event types catalogued: 32
- Migration steps documented: 56
- Integration test scenarios specified: ~54

### 25.3 Acknowledgments

The design works because:
- The audit (Sessions A-O) did rigorous module-level capture
- The design phase (Sessions P-Z) synthesized that into a working system
- The decision to do design-then-build (vs incremental) protected against rework

Build phase will validate the design. Expect to discover gaps; the design is a strong foundation, not an oracle.

---

**End of v0.11. END OF DESIGN PHASE.** Pass 11 (Migration Plan) complete. Six-phase rollout plan specified: Foundation (schema + backfill) → Resolution algorithm online (read-only) → Field visibility + data scopes → Cross-cutting constraints → Permissions editor + requests → Full activation + cutover. Runtime-toggleable feature flag table with 10 flags. Eager backfill strategy. Backward compatibility via dual-path pattern (legacy + new permission checks). Cohort-based rollout (5 cohorts A through E covering ~120 users). Performance baseline targets specified per phase. Smoke test checklists per phase (~80 checks total). Rollback procedures per phase (estimated rollback times ~1 minute to 30 minutes). Go-live cutover plan with T-48h, T-24h, T-0, T+15min, T+60min, T+24h, T+1week milestones. Risk register catalogued (5 high-impact + 3 operational + 2 schedule). Communication plan. 10-criterion success definition. 6 Pass 11 open questions resolved. Cumulative summary of all 11 passes locked. Design phase formally closes; build phase opens with Phase 1.
