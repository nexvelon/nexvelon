# NEXVELON_SESSION_Z_HANDOFF.md

> **Hand-off for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-Z codification.
> Session Z completed Pass 11 of the Permissions Design (Migration Plan) — THE FINAL DESIGN PASS.
> 🏁 **PERMISSIONS DESIGN PHASE FORMALLY CLOSES.**
> Build phase opens after this commit.
>
> Reading order for a cold start (Build Phase Session A):
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session Z state + Pass 11 summary + design phase closure
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final — audit complete)
>   5. `NEXVELON_PERMISSIONS_DESIGN.md` v0.11 — ALL 11 PASSES COMPLETE
>   6. `NEXVELON_ROADMAP.md`
>   7. `NEXVELON_SESSION_Y_HANDOFF.md` — prior session (Pass 10)
>   8. Earlier handoffs (X through A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE — DESIGN PHASE COMPLETE
═══════════════════════════════════════════════════════════════════════════════

### Session Z focus

Completed Pass 11 (Migration Plan) — THE FINAL DESIGN PASS. Specified 6-phase rollout plan with cohort-based deployment, runtime-toggleable feature flags, eager backfill, backward compatibility, per-phase rollback, smoke tests, go-live cutover, monitoring, risk register, and 10-criterion success definition.

🏁 **PERMISSIONS DESIGN PHASE FORMALLY CLOSES.**

After this commit lands, the next session is **Build Phase Session A** — Phase 1 of Pass 11's rollout plan (Foundation: schema + backfill).

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_PERMISSIONS_DESIGN.md` | Replaced v0.10 with v0.11 — Pass 10 condensed to §10 summary (full at 215ee01); Pass 11 full content §11-§25. FINAL version. |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session Z state. Design phase formally closes. |
| `NEXVELON_ROADMAP.md` | Item 2 progress note: 🏁 COMPLETE (11 of 11 passes). Item 3 progress note: 🚧 IN PROGRESS (Phase 1 next). |
| `NEXVELON_SESSION_Z_HANDOFF.md` | New file (this document) — final design phase handoff. |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged.

═══════════════════════════════════════════════════════════════════════════════
## 2. PASS 11 SUMMARY (Migration Plan — FINAL PASS)
═══════════════════════════════════════════════════════════════════════════════

### Six-phase rollout plan

| Phase | Duration | Goal | Cohort |
|---|---|---|---|
| 1 | 1-2 weeks | Foundation: schema + backfill; all flags FALSE; system dormant | (none — backend only) |
| 2 | 2 weeks | Resolution algorithm online (read-only); cache populates | Cohort A (~5 users) |
| 3 | 2 weeks | Field visibility + data scopes active | Cohort B (~15-20) |
| 4 | 3 weeks | Cross-cutting constraints (SoD + regulatory + binding) | Cohort C (~30-40) |
| 5 | 2-3 weeks | Editor UI + request workflow live | Cohort D (~70-80) |
| 6 | 2 weeks + 4 weeks observation | Full activation + cutover | Cohort E (ALL ~120) |

Plus Phase 6.1 cleanup (~4 weeks post-cutover): remove legacy code paths.

### Three architectural decisions

1. **Phased rollout (not big-bang)** — each phase independently rollback-able
2. **Runtime-toggleable feature flags** — DB-stored; flip without redeploy; audit trail
3. **Eager backfill** — Phase 1 populates expected rows for existing users + roles; >95% hit rate from day 1

### 10 feature flags catalogued

permissions.engine.enabled, permissions.field_visibility.enabled, permissions.data_scopes.enabled, permissions.cross_cutting.enabled, permissions.audit_on_read.enabled, permissions.append_only_triggers.enabled, permissions.editor.enabled, permissions.request_workflow.enabled, permissions.cache_warmup.enabled, permissions.read_replica.enabled.

### Backward compatibility via dual-path pattern

```typescript
if (await isFeatureEnabled('permissions.engine.enabled', userId)) {
  return await resolveActionGrant(userId, actionName).is_granted;
}
return await legacyPermissionCheck(userId, actionName);
```

Both paths exist simultaneously during rollout.

### 5 cohorts A-E covering ~120 users

- Cohort A (Phase 2): A + 2-3 designated PMs
- Cohort B (Phase 3): + remaining PMs + all Acc
- Cohort C (Phase 4): + all SRs
- Cohort D (Phase 5): + all Tech
- Cohort E (Phase 6): ALL — global activation

### Performance baseline + per-phase regression thresholds

| Metric | Baseline | Phase 2 target | Phase 6 target |
|---|---|---|---|
| Request latency p99 | <200ms | <230ms (+15%) | <250ms (+25%) |
| List endpoint p99 | <300ms | <340ms (+13%) | <370ms (+23%) |
| Permission check overhead | N/A | <5ms p99 | <5ms p99 |
| Cache hit rate | N/A | >50% (24h) | >95% (sustained) |
| Database CPU | <40% | <50% | <55% |

Investigation triggers if metrics regress >50% beyond targets.

### ~80 smoke test checks across 6 phases

Per-phase checklists for verifying phase deployment correctness before declaring complete:
- Phase 1 (~15 checks): schema existence, row counts, trigger compilation, partition creation, baseline preservation
- Phase 2 (~10 checks): cohort A activation, no false-negatives/positives, cache hit rate climbing, audit firing
- Phase 3 (~10 checks): field visibility per role per flag, masking working, audit-on-read firing, RLS enforcement
- Phase 4 (~12 checks): immutable snapshots, SoD enforcement, regulatory blocks, co-sign workflow, lien clock
- Phase 5 (~10 checks): editor sections, request workflow E2E, auto-expiry, mobile responsive
- Phase 6 (~10 checks): v1 ship checklist from Pass 10 §25.3, performance under load, no regressions

### Rollback procedures per phase

| Phase | Rollback method | Time |
|---|---|---|
| 1 | DROP TABLE in reverse FK order | ~30 min |
| 2 | Flag flip permissions.engine.enabled=FALSE | <1 min |
| 3 | Flag flip permissions.field_visibility.enabled + permissions.data_scopes.enabled=FALSE | <1 min |
| 4 | Flag flip permissions.cross_cutting.enabled=FALSE | <1 min |
| 5 | Flag flip permissions.editor.enabled=FALSE | <5 min (disables editor; manual DB grants until restore) |
| 6 | Global flag flip OR cohort-soft rollback | 1-30 min |

After Phase 6.1 cleanup (~4 weeks post-cutover): point-of-no-return; legacy code removed.

### Go-live cutover plan

- T-48h: Final go/no-go decision in stakeholder meeting
- T-24h: Communications to all users (1-2 hour slowness expected)
- T-0: Flip permissions.engine.enabled=TRUE globally
- T+15min: Verify cache hit rate climbing (rollback if <30%)
- T+60min: Verify cache hit rate >85% (rollback if <85%)
- T+24h: Verify cache hit rate >95% sustained; smoke tests pass
- T+1 week: No regressions; user feedback positive → Phase 6 successful

### Risk register

| Risk | Mitigation |
|---|---|
| Trigger breaks during deploy | Staging dry-run; manual rollback |
| Cache invalidation race condition | last_invalidated_at check; monitoring alerts |
| Field visibility false-exposure | Defense-in-depth: app + view + RLS |
| Cross-cutting blocks legitimate work | Phased cohort catches false-positives |
| Performance regression | Per-phase regression thresholds; rollback triggers |

Plus 3 operational risks (admin over-grant; cohort frustration; edge cases) and 2 schedule risks (phase duration overruns; holiday/blackout periods).

### 10-criterion success definition

1. All 6 phases without major incident
2. v1 ship checklist passes for 4 consecutive weeks
3. No data leak or wrong-permission incidents
4. Performance baselines maintained
5. Cache hit rate >95% sustained 4 weeks
6. All 13 §0.4 commitments enforced
7. Audit captures all activities; compliance officer satisfied
8. At least one Pass 7 request approval E2E
9. At least one operator-defined custom role in use
10. Operator docs auto-generated and helpful

### Six Pass 11 open questions resolved

1. Run rollout in staging first: YES
2. v1.1 patch release post-launch: YES (4-week window)
3. Operator opt-out of phases: NO
4. Phase stuck >4 weeks: stakeholder review
5. Single go-live for all customers: NO (per-tenant Phase 2)
6. Public rollout plan: high-level summary; detailed internal

### Migration order extended (+0 new infrastructure steps)

Pass 11 doesn't add new migration steps; it sequences the existing 56 into 6 phases. Total stays at 56.

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE DESIGN PHASE METRICS
═══════════════════════════════════════════════════════════════════════════════

**Sessions used:** 11 (P through Z)

**Cumulative outputs:**
- ~1260 actions catalogued and grant-mapped per role
- 14+ database tables across 5 functional groups + 1 materialized view
- 3 runtime resolution algorithms (A1 / A2 / A3)
- 47-flag field visibility catalog with 12 standard mask types
- 80 status surfaces with polymorphic behavior bindings
- 8 append-only ledgers with uniform pattern + monthly partitioning
- Request-admin-access workflow with 4 types + 7-state lifecycle
- Permissions editor UI with 6 sections + cross-section linking + WCAG 2.1 AA
- 4-cache architecture with pull invalidation + warm-up + observability
- 32 audit event types
- 13 §0.4 cross-cutting commitments fully enforcement-mapped
- 56 migration steps in 6-phase deployment plan
- ~54 integration test scenarios specified
- ~50 open design questions resolved
- ~35 architectural decisions locked
- ~30 Phase 2 hardening items deferred and catalogued

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT — BUILD PHASE OPENS
═══════════════════════════════════════════════════════════════════════════════

🚧 **Build Phase Session A** begins with Phase 1 from `NEXVELON_PERMISSIONS_DESIGN.md` v0.11 §12.1.

### Phase 1 (Foundation: schema + backfill) — first build step

**Goal:** Stand up all permissions tables; populate with defaults; everything dormant.

**Activities:**
1. Deploy ~23 new permissions tables (Pass 2 + Pass 5 + Pass 6 + Pass 7)
2. Build 8 append-only ledgers with monthly partitioning + UPDATE/DELETE triggers (Pass 6)
3. Build all cache invalidation trigger functions (Pass 9)
4. Seed ~1260 permission_definitions from Pass 1 catalogue
5. Seed 11 roles + ~9000 role_permissions
6. Seed 47 field_visibility_definitions + role_field_visibility
7. Seed 7 data_scope_definitions + role_data_scopes
8. Seed ~2000 status_behavior_bindings + ~600 status_transition_definitions
9. Seed 4 separation_of_duties_constraints
10. Seed geolocation_retention_policies (30-day default)
11. Migrate existing users.role_id to user_role_assignments
12. Create initial 3 months of partitions per append-only ledger
13. Install monthly partition-creation cron
14. Apply UPDATE/DELETE triggers to all 8 ledgers
15. Install daily expiry cron + weekly cleanup crons (Pass 9)
16. Build observability instrumentation

**Feature flag state:** ALL flags FALSE. System dormant. Existing app continues to function unchanged.

**Smoke tests:** ~15 checks (Pass 11 §16.1) including all table existences + row counts + trigger compilation + partition creation + baseline preservation (existing user permissions resolve identically pre/post).

**Duration:** 1-2 weeks.

**Rollback:** All schema changes in single migration transaction; rollback restores prior state via DROP TABLE in reverse FK order (~30 min).

### After Phase 1 completes, sequence continues:

Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 6.1 cleanup. Total ~12-16 weeks of build.

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER (BUILD PHASE)
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. **Permissions Design Phase COMPLETE — all 11 passes locked. Build phase opening with Phase 1 (Foundation: schema + backfill).** Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md` v0.14, `NEXVELON_PERMISSIONS_DESIGN.md` v0.11, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. **Build phase begins with Phase 1**: deploy permissions schema + backfill existing user/role data; feature flags off; system dormant; verify backfill correctness. Working with Claude Code in parallel.

**End of Session Z handoff. END OF DESIGN PHASE.**
