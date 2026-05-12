# NEXVELON_SESSION_X_HANDOFF.md

> **Hand-off for the next Claude Code session.**
> Generated 2026-05-12 against `main` post-Session-X codification.
> Session X completed Pass 9 of the Permissions Design (Effective-Permissions Caching Strategy).
> Pure documentation; no code shipped.
>
> Reading order for a cold start:
>   1. `NEXVELON_PRINCIPLES.md`
>   2. `CLAUDE_CONTEXT.md` "Current Session State"
>   3. **This file** — Session X state + Pass 9 summary
>   4. `NEXVELON_FEATURE_AUDIT.md` v0.14 (final — audit complete)
>   5. `NEXVELON_PERMISSIONS_DESIGN.md` v0.9 — Passes 1-9 of 11 complete
>   6. `NEXVELON_ROADMAP.md`
>   7. `NEXVELON_SESSION_W_HANDOFF.md` — prior session (Pass 8)
>   8. Earlier handoffs (V through A) — historical references

═══════════════════════════════════════════════════════════════════════════════
## 1. CURRENT STATE
═══════════════════════════════════════════════════════════════════════════════

### Session X focus

Completed Pass 9 (Effective-Permissions Caching Strategy). Detailed all four caches' invalidation triggers, lazy-fill patterns, warm-up strategies, eviction, observability, recovery, and multi-tenant Phase 2 prep. Three architectural decisions locked. Seven open questions resolved.

This is the most engineering-dense pass remaining — cache layer is invisible when it works and catastrophic when it breaks. Pass 9 gets the details right so build phase has a clear specification.

### What shipped this session

Pure documentation. No code. No migrations. No runtime changes.

| File | Change |
|---|---|
| `NEXVELON_PERMISSIONS_DESIGN.md` | Replaced v0.8 with v0.9 — Passes 1-8 aggressively condensed to one-paragraph summaries; Pass 9 full content §16-§28 |
| `CLAUDE_CONTEXT.md` | Replaced "Current Session State" with Session X state |
| `NEXVELON_ROADMAP.md` | Item 2 progress note updated: Pass 9 of 11 complete |
| `NEXVELON_SESSION_X_HANDOFF.md` | New file (this document) |

### Build status

**Clean.** `npm run typecheck` → 0 TS errors. `npm run lint` → 5 pre-existing warnings unchanged.

═══════════════════════════════════════════════════════════════════════════════
## 2. PASS 9 SUMMARY (Effective-Permissions Caching Strategy)
═══════════════════════════════════════════════════════════════════════════════

### Four caches specified in detail

| Cache | Hot path for | Size at 500 users | Invalidated by |
|---|---|---|---|
| `effective_permissions_cache` | A1 action grant resolution | ~630k rows / 126MB | Grant/revoke/override events |
| `effective_field_visibility_cache` | A3 field visibility resolution | ~23k rows / 5MB | Visibility changes |
| `effective_data_scope_cache` | A2 data scope resolution | ~3.5k rows / 700KB | Scope changes |
| `effective_status_bindings_cache` | Phase 3.3 binding check | ~400 rows / 50KB | Binding edits |

Total v1 ~132MB fits comfortably in PostgreSQL buffer pool. Phase 2 (5000 users) ~1.3GB still manageable with proper buffer pool sizing.

### Invalidation trigger architecture

Pull invalidation (DELETE matching rows; lazy-fill via algorithm on next read). 8 invalidation event types specified across 4 cache tables.

Trigger functions in plpgsql. Pattern: identify stale rows → DELETE → next read misses → algorithm runs → cache repopulates via INSERT ON CONFLICT DO NOTHING.

Performance: <2ms for 1-50 row invalidations; <100ms for 500-5000 row admin operations.

### Lazy-fill pattern

```sql
INSERT INTO effective_permissions_cache (...)
VALUES (...)
ON CONFLICT (user_id, permission_id) DO NOTHING;
```

Handles concurrent miss races: two requests both miss; both try insert; one wins; other's INSERT no-ops. Both return correct result.

### Cache warm-up

**On user login**:
- Async fire-and-forget after auth response
- ~30 critical actions per role resolved
- Time: <100ms; doesn't block login

**On grant change**:
- Post-invalidation, all users with affected role get cache populated
- Async; admin's save action returns immediately

**Cold-start**: relies on natural traffic; 2-5min to reach steady-state >95% hit rate

### Stale-while-revalidate

ONLY for dashboard widgets (<5min staleness). Opt-in via maxStalenessMs parameter.

NEVER for:
- Action authorization
- Field visibility serialization
- Admin operations

Stale reads do NOT count toward audit-on-read.

### Cache eviction

- Daily cron 03:00 UTC: expired temporary overrides (DELETE WHERE expires_at < NOW())
- Weekly cron: deprecated permissions + deactivated users
- Monthly cron: orphan sanity check (should always return 0)

### Size + scale

| Users | Total cache | PostgreSQL config recommended |
|---|---|---|
| 50 small | 14MB | default |
| 500 v1 target | 132MB | shared_buffers 4GB default |
| 2000 mid | 530MB | shared_buffers 4GB OK |
| 5000 multi-tenant | 1.36GB | shared_buffers 8GB |

Status bindings cache NOT user-scoped — significant size saving (only ~400 rows total regardless of user count).

### Read-replica strategy

Capability ready at v1; primary-only default.

- READ_REPLICA_URL env var routes cache reads if set
- Replication lag <10ms typical; acceptable for permission grants
- Triggers for enabling: CPU >70%, latency p99 >5ms, 1000+ concurrent users, multi-region

PostgreSQL streaming replication. Schema and code ready when needed.

### Observability

8 metrics emitted:
- permission_cache.hits_total{cache_name}
- permission_cache.misses_total
- permission_cache.lookup_duration_ms
- permission_cache.invalidation_events_total
- permission_cache.rows_invalidated_total
- permission_cache.size_rows
- permission_cache.size_bytes
- permission_cache.staleness_p99_ms

4 alerts:
- Hit rate <90% for 5min
- Latency p99 >5ms for 5min
- Size growth >10%/hr
- 0 invalidations for >24h with admin activity present

Per-user cache diagnostic API: GET /api/admin/cache-diagnostics?user_id=X returns per-cache status (total/fresh/stale rows + oldest age) for support.

### Recovery + failure modes

**Cold rebuild**: TRUNCATE all 4 cache tables. Next reads miss → repopulate. 2-5min latency degradation under normal load.

**Partial rebuild**: DELETE WHERE user_id = $1 (or permission_id = $1). Next reads repopulate.

**Failures**:
- Cache table unavailable → fall back to base table resolution; metric tracks fallback rate; alert if >1%
- Trigger failure (silent invalidation miss) → detected by audit comparison; alert: invalidation_events stuck at 0 for >24h with admin activity
- Race condition (concurrent read + invalidation) → mitigated by last_invalidated_at check on cache writes; <0.01% probability

### Performance budgets

| Operation | Target |
|---|---|
| Cache hit | <1ms p99 |
| Cache miss + algorithm + write | <5ms p99 |
| Invalidation 1-50 rows | <2ms |
| Invalidation 500-5000 rows | <100ms (admin ops) |
| Warm-up on login (~30 actions) | <100ms async |
| Daily expiry cron | <30s |
| Cold rebuild | <1s + 2-5min recovery |
| Hit rate target | >95% |

### Multi-tenant cache key design Phase 2 prep

v1: no tenant_id; UNIQUE (user_id, permission_id).

Phase 2 additions:

```sql
ALTER TABLE effective_permissions_cache ADD COLUMN tenant_id UUID;
ALTER TABLE effective_permissions_cache 
  DROP CONSTRAINT effective_permissions_cache_unique;
ALTER TABLE effective_permissions_cache 
  ADD CONSTRAINT ... UNIQUE (tenant_id, user_id, permission_id);
```

Plus optional HASH PARTITION BY tenant_id (16 partitions) for very large multi-tenant deployments.

### Three architectural decisions locked

1. **Pull invalidation (not push)** — resolution algorithm is only source of truth; cache is dumb storage; no logic duplication in triggers
2. **Single cache table with composite index, partition-ready** — v1 fits buffer pool; Phase 2 partitions by tenant_id when scaling beyond 2-5M rows
3. **Read-replica capability ready, primary-only default** — env var configuration; build phase decides when to enable

### Seven Pass 9 open questions resolved

1. TTL beyond expires_at: NO
2. Synchronous warm-up first request: NO (async)
3. Cache NEGATIVE results: YES
4. Pre-warm CI/staging: NO at v1
5. Multi-region replica: Phase 2
6. Public resources cache: NO (validator does own check)
7. User-facing telemetry: NO at v1

### Phase 2 deferrals

- Multi-tenant partitioning by tenant_id
- Multi-region replica strategy
- Synchronous replication for permission-critical writes
- Pre-warm script for planned maintenance windows
- User-facing performance breakdown

### Migration order extended (+8 steps; now 53 total)

Steps 46-53: trigger functions creation + trigger application to source tables + warm-up service (login hook + grant change hook) + daily expiry cron + weekly cleanup crons + observability instrumentation + cache diagnostic API endpoint + read-replica configuration option.

═══════════════════════════════════════════════════════════════════════════════
## 3. CUMULATIVE PROGRESS
═══════════════════════════════════════════════════════════════════════════════

**Feature audit:** 🏁 COMPLETE — 13 of 13 modules walked.

**Permissions design:** 9 of 11 passes complete.
- Pass 1: Action Vocabulary Catalog
- Pass 2: Database Schema
- Pass 3: Resolution Algorithm
- Pass 4: Field-Level Visibility Engine
- Pass 5: Status Surface Binding Layer
- Pass 6: Append-Only Audit Pattern
- Pass 7: Request-Admin-Access Workflow
- Pass 8: Permissions Editor UI
- Pass 9: Effective-Permissions Caching Strategy (4 caches + invalidation triggers + warm-up + eviction + read-replica + multi-tenant prep + observability)

═══════════════════════════════════════════════════════════════════════════════
## 4. WHAT'S NEXT — Pass 10 (Cross-Cutting Enforcement Patterns)
═══════════════════════════════════════════════════════════════════════════════

Pass 10 catalogues the complete enforcement pattern across all 13 §0.4 cross-cutting commitments end-to-end.

**Covers:**
- All 13 cross-cutting commitments (§0.4 #1-13) and their enforcement points across passes
- How they compose (e.g., separation of duties + regulatory expiry + status binding combined check)
- Exception escalation paths (when override needs A approval vs A+Acc co-sign vs auto-block)
- Cross-cutting test surface (scenarios verifying commitments hold)
- Audit coverage (every enforcement event captured)
- Build phase priorities (MVP-critical vs Phase 2 hardening)

Pass 10 will produce v0.10 of the design doc.

═══════════════════════════════════════════════════════════════════════════════
## 5. NEXT SESSION OPENER
═══════════════════════════════════════════════════════════════════════════════

> Continuing Nexvelon build. **Permissions Design Pass 9 of 11 complete (audit phase already closed).** Before responding to anything, read these files in order: `NEXVELON_PRINCIPLES.md`, `CLAUDE_CONTEXT.md`, `NEXVELON_FEATURE_AUDIT.md` v0.14, `NEXVELON_PERMISSIONS_DESIGN.md` v0.9, `NEXVELON_ROADMAP.md`, then the latest `NEXVELON_SESSION_*_HANDOFF.md`. Then ask what to work on. Repo: github.com/nexvelon/nexvelon. Live: https://app.nexvelonglobal.com. Working with Claude Code in parallel — I'll paste its outputs back to you. Next pending work: Permissions Design Pass 10 (Cross-Cutting Enforcement Patterns).

**End of Session X handoff.**
