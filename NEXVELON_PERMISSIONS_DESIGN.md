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
> **Status:** v0.9 — Passes 1-9 complete. Pending: Pass 10 (Cross-cutting
> enforcement patterns), Pass 11 (Migration plan).
>
> Pass 1 condensed §1-§8; full at `9008fad`.
> Pass 2 condensed §9; full at `1bafbd4`.
> Pass 3 condensed §10; full at `ff08703`.
> Pass 4 condensed §11; full at `de1905f`.
> Pass 5 condensed §12; full at `904bfe5`.
> Pass 6 condensed §13; full at `3c21e58`.
> Pass 7 condensed §14; full at `41734b6`.
> Pass 8 condensed §15; full at `c090599`.
> Pass 9 (Effective-Permissions Caching Strategy) full content begins at §16.

---

## 0. How to use this document

### 0.1 Purpose

Design specification for the Nexvelon permissions runtime.

### 0.2 Pass overview

| Pass | Scope | Status |
|---|---|---|
| 1 | Action vocabulary catalog | ✅ COMPLETE (full at `9008fad`) |
| 2 | Database schema | ✅ COMPLETE (full at `1bafbd4`) |
| 3 | Permission resolution algorithm | ✅ COMPLETE (full at `ff08703`) |
| 4 | Field-level visibility engine | ✅ COMPLETE (full at `de1905f`) |
| 5 | Status surface binding layer | ✅ COMPLETE (full at `904bfe5`) |
| 6 | Append-only audit pattern | ✅ COMPLETE (full at `3c21e58`) |
| 7 | Request-admin-access workflow | ✅ COMPLETE (full at `41734b6`) |
| 8 | Permissions editor UI | ✅ COMPLETE (full at `c090599`) |
| 9 | Effective-permissions caching strategy | ✅ COMPLETE (this version) |
| 10 | Cross-cutting enforcement patterns | PENDING |
| 11 | Migration plan | PENDING |

### 0.3 Role abbreviations

**A** Admin, **PM** Project Manager, **SR** Sales Rep, **Tech** Technician, **Sub** Subcontractor (portal), **Acc** Accounting, **VO** View Only. Plus **Dispatcher** (M12), **Bookkeeper** (M11), **HR-role**, **Executive** (M13).

---

═══════════════════════════════════════════════════════════════════
# Parts I-VIII — Passes 1-8 condensed summaries
═══════════════════════════════════════════════════════════════════

*Full content preserved at commits noted in §0.2.*

## 1. Pass 1 — Action vocabulary
`resource:verb[:qualifier]` naming. 8 verb categories. 4 qualifier categories. 140+ resources. 4-tier UI hierarchy + 6 cross-cut tabs.

## 9. Pass 2 — Schema
14 tables across 5 groups + 1 materialized view. Three decisions: one row per action; trigger-invalidated cache; orthogonal data scopes.

## 10. Pass 3 — Resolution algorithm
A1 action grant (7-phase with cache lookup → base resolution → Phase 3 constraints → audit). A2 data scope. A3 field visibility. <5ms p99 compound; <1ms cache hit. Two decisions: invalidate-and-lazy-fill; runtime SoD + DB-trigger.

## 11. Pass 4 — Field visibility engine
Backend serialization pipeline + frontend `<FieldGated>` + view layer for 5 sensitive resources. 12 mask types. Async batched audit-on-read. 47-flag catalog.

## 12. Pass 5 — Status binding layer
Polymorphic `status_behavior_bindings` across 80 status surfaces. 14 standard binding names. Phase 3.3 integration. State transition matrices.

## 13. Pass 6 — Append-only audit
8 ledgers sharing uniform pattern. Monthly partitioning. 21 event types. 3-layer query API. ~38M rows/year combined.

## 14. Pass 7 — Request-admin-access workflow
State machine (Pending → Approved → Granted → Expired/Revoked). 4 request types. `user_role_assignments` table. 30+ column schema. 8 edge cases. 9 new event types (30 total).

## 15. Pass 8 — Permissions editor UI
Workspace architecture (single page, 6 sections). Cross-section linking. Transactional save with conflict detection. Mobile responsive. WCAG 2.1 AA. 2 new event types (32 total).

---

═══════════════════════════════════════════════════════════════════
# Part IX — Pass 9 (Effective-Permissions Caching Strategy) — FULL CONTENT
═══════════════════════════════════════════════════════════════════

## 16. Overview

Pass 2 introduced four caches as architectural placeholders. Pass 3 specified cache as the hot path for permission resolution. Pass 4 added field visibility cache. Pass 5 added status bindings cache. Pass 9 details what those caches actually look like in production: invalidation triggers, warm-up patterns, eviction, observability, recovery.

### 16.1 The four caches

| Cache | Hot path for | Size estimate (500 users) | Invalidated by |
|---|---|---|---|
| `effective_permissions_cache` | A1 action grant resolution | ~630k rows (~126MB) | Grant/revoke/override events |
| `effective_field_visibility_cache` | A3 field visibility resolution | ~23k rows (~5MB) | Visibility changes |
| `effective_data_scope_cache` | A2 data scope resolution | ~3.5k rows (~700KB) | Scope changes |
| `effective_status_bindings_cache` | Phase 3.3 status binding check | ~400 rows (~50KB) | Status binding edits |

Total at v1 scale (500 users): ~132MB. Fits comfortably in PostgreSQL buffer pool (default `shared_buffers = 4GB` typical production setting).

At Phase 2 scale (5000 users): ~1.3GB. Still fits in buffer pool with proper sizing. Partitioning by tenant_id ready when needed.

### 16.2 Why caching matters

Without cache, every permission resolution runs the multi-phase algorithm from Pass 3 § Phase 2:
- Lookup `permission_definitions` row
- Lookup user's role
- Lookup `role_permissions` for (role, permission)
- Lookup active `user_permission_overrides` for (user, permission)
- Resolve UI state
- Return

That's 4 indexed reads per resolution. A typical list endpoint runs 20-100 resolutions. At 1000 concurrent users × 5 RPS × 50 resolutions = 250k resolutions/sec peak.

With cache hit: 1 indexed read per resolution. Same load: 50k reads/sec, well within PostgreSQL capability.

Cache hit rate target: >95% under normal load (Pass 3 §16). Pass 9 specifies the engineering to actually deliver this.

### 16.3 Correctness, performance, operability

Three categories of concerns:

1. **Correctness** — invalidation triggers fire reliably on every grant-change event. No race conditions. No missed events.
2. **Performance** — <1ms cache hits at p99 even when cache grows. Composite indexes on lookup keys.
3. **Operability** — caches observable (hit rate, staleness, size) and recoverable (cold rebuild, partial rebuild).

## 17. Cache invalidation — the trigger architecture

Per Pass 3 §11.4 and Decision 1 (chat walk): **pull invalidation** — triggers DELETE matching cache rows; next read repopulates via algorithm.

### 17.1 Invalidation events per cache

**`effective_permissions_cache`** invalidates on:

| Event | Triggers DELETE on cache rows where |
|---|---|
| INSERT/UPDATE/DELETE on `role_permissions` | `permission_id = NEW.permission_id` AND user has role NEW.role_id |
| INSERT/UPDATE/DELETE on `user_permission_overrides` | `(user_id, permission_id) = (NEW.user_id, NEW.permission_id)` |
| UPDATE on `users.role_id` | `user_id = NEW.id` (all rows for user) |
| INSERT/UPDATE on `user_role_assignments` | `user_id = NEW.user_id` (multi-role support) |
| UPDATE on `permission_definitions.is_deprecated` to TRUE | `permission_id = NEW.id` |
| UPDATE on `users.is_active` to FALSE | `user_id = NEW.id` |

**`effective_field_visibility_cache`** invalidates on:

| Event | Triggers DELETE on cache rows where |
|---|---|
| INSERT/UPDATE/DELETE on `role_field_visibility` | `flag_id = NEW.flag_id` AND user has role NEW.role_id |
| INSERT/UPDATE/DELETE on `user_field_visibility_overrides` | `(user_id, flag_id) = (NEW.user_id, NEW.flag_id)` |
| UPDATE on `users.role_id` | `user_id = NEW.id` |
| UPDATE on `field_visibility_definitions.is_deprecated` | `flag_id = NEW.id` |

**`effective_data_scope_cache`** invalidates on:

| Event | Triggers DELETE on cache rows where |
|---|---|
| INSERT/UPDATE/DELETE on `role_data_scopes` | `resource = NEW.resource` AND user has role NEW.role_id |
| INSERT/UPDATE/DELETE on `user_data_scope_overrides` | `(user_id, resource) = (NEW.user_id, NEW.resource)` |
| UPDATE on `users.role_id` | `user_id = NEW.id` |

**`effective_status_bindings_cache`** invalidates on:

| Event | Triggers DELETE on cache rows where |
|---|---|
| INSERT/UPDATE/DELETE on `status_behavior_bindings` | `(status_table_name, status_row_id) = (NEW.status_table_name, NEW.status_row_id)` |
| INSERT/UPDATE/DELETE on `status_transition_definitions` | None — transitions queried directly, not cached |

### 17.2 Trigger implementation

PostgreSQL triggers attached to the source tables:

```sql
-- Invalidate effective_permissions_cache on role_permissions changes
CREATE OR REPLACE FUNCTION invalidate_perm_cache_on_role_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete cache rows where any user with the affected role has this permission cached
  DELETE FROM effective_permissions_cache
  WHERE permission_id = COALESCE(NEW.permission_id, OLD.permission_id)
    AND user_id IN (
      SELECT user_id 
      FROM user_role_assignments
      WHERE role_id = COALESCE(NEW.role_id, OLD.role_id)
        AND revoked_at IS NULL
        AND (end_at IS NULL OR end_at > NOW())
    );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_invalidate_perm_cache_role_perms
AFTER INSERT OR UPDATE OR DELETE ON role_permissions
FOR EACH ROW EXECUTE FUNCTION invalidate_perm_cache_on_role_change();
```

Similar trigger functions for each invalidation event. Pattern is uniform:
1. Identify which cache rows are now stale
2. DELETE them
3. Next read on those (user, permission) pairs misses cache → runs algorithm → writes fresh entry

### 17.3 Performance of invalidation triggers

A single permission grant change can invalidate many cache rows:

- "Grant `invoices:approve` to PM role" → invalidates cache for all PM users (typically 12 users × 1 permission = 12 rows)
- "Change SR scope on `clients` from `my` to `team`" → invalidates 24 users × 1 scope = 24 rows
- "Deprecate `clients:legacyAction`" → invalidates ALL users with that permission cached (potentially hundreds)

Trigger execution time scales with number of rows invalidated:
- 1-50 rows: <2ms
- 50-500 rows: <10ms
- 500-5000 rows (rare): <100ms

Worst case: deprecating a widely-used permission triggers ~500-row delete. Acceptable for admin-triggered operations.

### 17.4 Avoiding cascade explosion

What if invalidating one cache triggers cascade to another? Example: a `role_permissions` change invalidates `effective_permissions_cache`. Does it also need to invalidate `effective_field_visibility_cache`?

**Decision:** caches are orthogonal — invalidation does NOT cascade across cache tables. Each cache has its own set of triggers tied to its specific source tables. This prevents avalanche on related changes.

Test: changing `role_permissions` should only invalidate `effective_permissions_cache` rows; field visibility cache untouched. Verified by §22 test plan.

### 17.5 Lazy-fill on miss

When a read misses the cache:

1. Cache lookup returns nothing
2. Application falls through to base table resolution (Pass 3 Phase 2)
3. Resolution writes result to cache (INSERT ON CONFLICT DO NOTHING)
4. Next read for same (user, permission) hits cache

The INSERT ON CONFLICT pattern avoids race conditions when two requests miss simultaneously:

```sql
INSERT INTO effective_permissions_cache (
  user_id, permission_id, permission_action_name,
  is_granted, resolution_source, resolved_ui_state,
  computed_at, expires_at
) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
ON CONFLICT (user_id, permission_id) DO NOTHING;
```

If a race happens (two requests both miss; both try to insert), one wins; the other's INSERT is a no-op. Both return correct result.

## 18. Cache warm-up

Cold cache (post-deployment, post-deactivate-reactivate) means first reads are misses. To avoid latency spikes, warm critical paths.

### 18.1 Warm-up on user login

When a user logs in:
1. Authentication completes
2. Background async task fires: "warm cache for user X"
3. Task resolves ~30 critical permissions (dashboard widgets, profile, navigation) and writes to cache
4. Time: ~50-100ms; happens AFTER login response (user not blocked)

Critical permission list per role (~30 permissions each):
- **PM**: dashboard widgets, project list, recent invoices, team scheduling, common actions
- **SR**: dashboard, quote list, client list (own scope)
- **Tech**: dashboard, today's appointments, time clock, ticket queue
- **Acc**: dashboard, AR aging, AP queue, GL recent entries
- **A**: dashboard, pending requests, audit log recent

Warm-up logic:
```typescript
// Pseudocode for build phase
async function warmCacheOnLogin(userId: string) {
  const userRole = await getUserRole(userId);
  const criticalActions = CRITICAL_ACTIONS_PER_ROLE[userRole.code];
  
  // Resolve all in parallel; each write to cache
  await Promise.all(
    criticalActions.map(action => resolveActionGrant(userId, action))
  );
}
```

Async / fire-and-forget. Failure is non-fatal (next read just misses cache).

### 18.2 Warm-up on grant change

When admin grants a permission to a role, all users with that role need cache populated for the new permission.

```typescript
// After granting role_permission
async function warmCacheAfterGrant(roleId: string, permissionId: string) {
  const usersWithRole = await getUsersWithRole(roleId);
  await Promise.all(
    usersWithRole.map(user => 
      resolveActionGrant(user.id, getActionNameForPermission(permissionId))
    )
  );
}
```

Fires after invalidation trigger removes stale rows. Async; admin's save action completes immediately; warm happens in background.

### 18.3 Cold-start warm-up

Server restart drops in-memory caches (PostgreSQL buffer pool warming) but disk cache persists. After restart:

1. PostgreSQL buffer pool warms over first few minutes as queries hit indexes
2. Application doesn't actively warm — relies on natural traffic
3. First user requests may be 2-5ms slower than warm; acceptable

For planned maintenance (deploy windows), optional pre-warm script:
- Run on staging before cutover
- Iterates active users × top 50 most-used actions
- Pre-populates cache rows
- Production swap takes effect on warm cache

Not v1 mandatory; build phase decision.

## 19. Stale-while-revalidate

Per Pass 3 §16.1: dashboard widget reads can tolerate <5min stale data. Pass 9 specifies the threshold mechanism.

### 19.1 Where stale-while-revalidate applies

ONLY for these non-critical reads:
- Dashboard widget data (count badges, sparklines, summary tiles)
- Notification panel "unread count" type queries
- Background polling for activity indicators

**Never** for:
- Action authorization checks (always fresh)
- Field visibility resolution at API serialization (always fresh)
- Admin operations (always fresh)

### 19.2 Implementation

Cache rows have `computed_at TIMESTAMPTZ`. Resolver checks:

```typescript
async function resolveActionGrantWithStaleness(
  userId: string, 
  actionName: string, 
  options: { allowStale?: boolean; maxStalenessMs?: number } = {}
) {
  const cached = await db.queryOne(`
    SELECT *, EXTRACT(EPOCH FROM (NOW() - computed_at)) * 1000 AS age_ms
    FROM effective_permissions_cache
    WHERE user_id = $1 AND permission_action_name = $2
  `, [userId, actionName]);
  
  if (cached) {
    const isFresh = cached.age_ms < (options.maxStalenessMs ?? 0);
    const isStaleButAcceptable = options.allowStale && cached.age_ms < (options.maxStalenessMs ?? 300_000);
    
    if (isFresh) {
      return cached;  // Fresh hit
    }
    
    if (isStaleButAcceptable) {
      // Return stale immediately; trigger background revalidation
      setImmediate(() => revalidateAndCache(userId, actionName));
      return { ...cached, was_stale: true };
    }
  }
  
  // Cache miss OR stale beyond threshold — full resolution
  return await resolveActionGrant(userId, actionName);
}
```

Call sites that allow staleness explicitly opt in:
```typescript
// Dashboard widget — allows up to 5min stale
const grant = await resolveActionGrantWithStaleness(userId, 'dashboard:viewWidget:invoiceCount', { 
  allowStale: true, 
  maxStalenessMs: 300_000 
});

// Action authorization — never stale
const grant = await resolveActionGrant(userId, 'invoices:approve');  // standard fresh path
```

### 19.3 Audit considerations

Stale reads do NOT count toward audit-on-read (per Pass 4 § audit only fires for visible reads that hit cache on the fresh path). Otherwise stale cache = audit gap.

## 20. Cache eviction

Beyond invalidation (which removes specific stale rows), cache also evicts:

1. Expired temporary overrides
2. Deprecated permissions
3. Deactivated users
4. Orphaned rows (referential integrity)

### 20.1 Daily cron: temporary override expiry

Per Pass 3 §11.4 (event 5) and Pass 7 §17.8:

```sql
-- Daily cron, runs at 03:00 UTC (low traffic)
DELETE FROM effective_permissions_cache
WHERE expires_at < NOW();

DELETE FROM effective_field_visibility_cache
WHERE expires_at < NOW();

DELETE FROM effective_data_scope_cache
WHERE expires_at < NOW();
```

`expires_at` is set when the cache row was computed with an active temporary override. After expiry, fresh resolution will return the role-default state.

### 20.2 Deprecated permission cleanup

When admin marks a permission deprecated, the trigger from §17.2 removes ALL cache rows for that permission. Periodic cleanup ensures consistency:

```sql
-- Weekly cron
DELETE FROM effective_permissions_cache
WHERE permission_id IN (
  SELECT id FROM permission_definitions WHERE is_deprecated = TRUE
);
```

Belt-and-suspenders pattern. Trigger should handle this in real-time; cron catches anything missed.

### 20.3 Deactivated user cleanup

Trigger on `users.is_active = FALSE` invalidates that user's cache. Weekly cron cleanup:

```sql
-- Weekly cron
DELETE FROM effective_permissions_cache
WHERE user_id IN (SELECT id FROM users WHERE is_active = FALSE);
```

### 20.4 Orphaned rows

Cache rows referencing deleted users or permissions (rare; cascades should prevent this):

```sql
-- Monthly cron — sanity check
DELETE FROM effective_permissions_cache
WHERE user_id NOT IN (SELECT id FROM users)
   OR permission_id NOT IN (SELECT id FROM permission_definitions);
```

Should always return 0 rows. If non-zero, indicates cascade missed somewhere → ops alert.

## 21. Cache size and growth

### 21.1 Size estimates by scale

| Users | effective_permissions_cache | effective_field_visibility | effective_data_scope | effective_status_bindings | Total |
|---|---|---|---|---|---|
| 50 (small) | 63k rows / 13MB | 2.3k / 500KB | 350 / 70KB | 400 / 50KB | ~14MB |
| 500 (v1 target) | 630k / 126MB | 23k / 5MB | 3.5k / 700KB | 400 / 50KB | ~132MB |
| 2000 (mid) | 2.5M / 504MB | 94k / 20MB | 14k / 2.8MB | 400 / 50KB | ~530MB |
| 5000 (multi-tenant) | 6.3M / 1.3GB | 235k / 50MB | 35k / 7MB | 400 / 50KB | ~1.36GB |

PostgreSQL `shared_buffers` default 4GB easily accommodates v1 + mid scale. Phase 2 multi-tenant requires either: increased buffer pool, partition-by-tenant, or both.

### 21.2 Row growth assumptions

- `effective_permissions_cache`: at most 1 row per (user, permission) = bounded by users × 1260
- `effective_field_visibility_cache`: 1 row per (user, flag) = bounded by users × 47
- `effective_data_scope_cache`: 1 row per (user, resource) = bounded by users × ~25 (most users don't have scope on all 140 resources)
- `effective_status_bindings_cache`: 1 row per status_row = bounded by status rows (~400), NOT user-scoped (shared)

Status bindings cache is NOT user-scoped — bindings are the same for all users on a given status row. Significant size saving.

### 21.3 PostgreSQL configuration

Recommended for v1 scale:

```
shared_buffers = 4GB         # buffer pool (default)
work_mem = 32MB              # for query operations
effective_cache_size = 12GB  # OS file cache estimate
```

For Phase 2 multi-tenant scale (5000+ users):

```
shared_buffers = 8GB
work_mem = 64MB
effective_cache_size = 24GB
```

Build phase tunes based on actual production memory + workload.

### 21.4 Disk usage

Cache tables on disk:
- v1 (500 users): ~132MB + indexes (~50MB) = ~180MB total
- Phase 2 (5000 users): ~1.36GB + indexes (~500MB) = ~1.9GB total

Trivial compared to other tables (e.g., `gl_journal_lines` will dwarf this).

## 22. Read-replica strategy

Per Decision 3 (chat walk): read replica capability ready at v1, configured to primary by default.

### 22.1 PostgreSQL streaming replication

Standard PostgreSQL primary-replica setup:
- Primary handles writes + reads
- Replica handles reads only
- Replication lag <10ms typical (asynchronous streaming)
- Replica failover possible (manual at v1; automated Phase 2)

### 22.2 Application routing

Two database connection URLs:

```bash
DATABASE_URL=postgres://primary.example.com/nexvelon
READ_REPLICA_URL=postgres://replica.example.com/nexvelon  # optional
```

Application code routes cache reads:

```typescript
// Pseudocode
function getCacheReadClient() {
  if (process.env.READ_REPLICA_URL) {
    return readReplicaClient;
  }
  return primaryClient;
}

async function resolveActionGrantFromCache(userId, actionName) {
  const client = getCacheReadClient();
  return await client.queryOne(
    'SELECT * FROM effective_permissions_cache WHERE user_id = $1 AND permission_action_name = $2',
    [userId, actionName]
  );
}
```

Writes always go to primary. Triggers fire on primary; replica receives via streaming.

### 22.3 Replica lag risk

Permission grant changes flow:
1. Admin saves change → write to primary
2. Trigger invalidates cache rows on primary (DELETE)
3. Replica receives DELETE via streaming (within ~10ms typical)
4. During the 10ms window, replica still has stale cache row

**Decision (v1):** acceptable. 10ms staleness window doesn't compromise security — old cache row would have been deleted within 10ms anyway. Practical impact: a permission change might appear effective for 10ms longer or shorter than the precise transaction commit time. Negligible.

Mitigation if needed (Phase 2): synchronous replication mode for permission-critical writes.

### 22.4 When to enable replica

Triggers for enabling read replica:
- Primary DB CPU consistently >70% under load
- Cache read latency p99 exceeding 5ms
- 1000+ concurrent users
- Multi-region deployment requirements (Phase 2)

At v1 with single-region + <500 users: primary-only is fine. Schema and code ready for replica when needed.

## 23. Cache observability

Cache health metrics surfaced to ops dashboard.

### 23.1 Metrics emitted

```
permission_cache.hits_total{cache_name}        — counter; incremented per hit
permission_cache.misses_total{cache_name}      — counter; per miss
permission_cache.lookup_duration_ms{cache_name} — histogram; p50/p99/max
permission_cache.invalidation_events_total     — counter; per invalidation trigger fire
permission_cache.rows_invalidated_total        — counter; sum of rows deleted per trigger
permission_cache.size_rows{cache_name}         — gauge; row count
permission_cache.size_bytes{cache_name}        — gauge; table size
permission_cache.staleness_p99_ms{cache_name}  — gauge; max age of cache row in seconds
permission_cache.warmup_duration_ms            — histogram; warm-up time
```

Dashboard charts in ops console:
- Hit rate over time (target >95%)
- Lookup latency over time (target <1ms p99)
- Cache size over time (alert if grows >2x historical baseline)
- Invalidation event rate (high rate = lots of admin activity)

### 23.2 Alerts

- Hit rate drops below 90% for >5 minutes → investigate (recent grant changes? deployment? bug?)
- Lookup latency p99 >5ms for >5 minutes → potential index issue or DB load
- Cache size growth >10% per hour → unexpected (could indicate failed invalidations)
- 0 invalidation events for >24 hours → triggers might be broken (admin hasn't made changes? or triggers silently failing?)

### 23.3 Per-user diagnostics

Admin debug API extends Pass 3 §18:

```
GET /api/admin/cache-diagnostics?user_id=X
{
  user_id: "...",
  cache_status: {
    effective_permissions_cache: {
      total_rows: 1260,
      fresh_rows: 1252,
      stale_rows: 8,
      oldest_row_age_seconds: 87
    },
    effective_field_visibility_cache: { ... },
    ...
  },
  recent_invalidations: [
    { event: "user_override_granted", target_permission: "invoices:approve", at: "..." },
    ...
  ]
}
```

Used by support staff diagnosing "why is user X seeing stale permissions?" scenarios.

## 24. Recovery and rebuild

### 24.1 Cold rebuild (drop and rebuild all caches)

Rare; emergency operation. Effectively wipes cache; everything re-resolves on next read.

```sql
-- Operations playbook
TRUNCATE TABLE effective_permissions_cache;
TRUNCATE TABLE effective_field_visibility_cache;
TRUNCATE TABLE effective_data_scope_cache;
TRUNCATE TABLE effective_status_bindings_cache;
```

Effects:
- Next 100% of permission resolutions miss cache → run algorithm
- Recovery: ~2-5 minutes of elevated latency under normal load as cache repopulates
- Hit rate climbs back to >95% within 30 minutes

When to use:
- Suspected cache corruption (rare; defense-in-depth: re-resolution is always correct)
- After schema migration affecting cache structure
- After bug fix in resolution algorithm (force re-compute with fixed logic)

### 24.2 Partial rebuild (single user or permission)

For "fix this specific stale entry" scenarios:

```sql
-- Drop one user's cache
DELETE FROM effective_permissions_cache WHERE user_id = $1;

-- Drop one permission across all users
DELETE FROM effective_permissions_cache WHERE permission_id = $1;
```

Next reads miss → re-resolve → cache populates with fresh data.

### 24.3 Failure modes

**Cache table unavailable** (rare; e.g., during migration):

```typescript
async function resolveActionGrant(userId, actionName) {
  try {
    const cached = await getCacheReadClient().queryOne(...);
    if (cached) return cached;
  } catch (err) {
    logger.warn('Cache read failed; falling back to base tables', { err });
    metrics.increment('permission_cache.fallback_to_base_total');
  }
  
  // Fall through to base table resolution (Pass 3 Phase 2)
  return await resolveFromBaseTables(userId, actionName);
}
```

System continues to function; slower without cache. Alerts fire if fallback rate >1% of resolutions.

**Trigger failure** (rare; e.g., PostgreSQL function compile error):

- Invalidation doesn't happen → stale cache returned
- Detected by audit comparison (audit log shows grant changed; cache hasn't refreshed)
- Mitigation: manual cache rebuild or wait for expires_at (if temp grant) or trigger fix + rebuild

Alert: invalidation_events_total stuck at 0 for >24 hours while admin activity exists.

**Race condition** (rare; concurrent reads + invalidation):

- Read A misses cache, starts resolution
- Invalidation B fires (DELETE)
- Read A finishes, writes stale result to cache
- Read C hits the now-stale entry

Mitigation: triggers track `last_invalidated_at` per (user, permission); resolution writes include `computed_at >= last_invalidated_at` check. If race detected, retry resolution.

Probability: <0.01% under normal load. Cost of mitigation: 1 extra check per cache write. Acceptable.

## 25. Multi-tenant cache key design (Phase 2 prep)

At v1, single-tenant. Cache tables don't have `tenant_id`. Phase 2 multi-tenant adds it.

### 25.1 v1 schema (no tenant_id)

```sql
CREATE TABLE effective_permissions_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  permission_id UUID NOT NULL REFERENCES permission_definitions(id),
  permission_action_name TEXT NOT NULL,
  is_granted BOOLEAN NOT NULL,
  resolution_source TEXT NOT NULL,
  resolved_ui_state TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  CONSTRAINT effective_permissions_cache_unique UNIQUE (user_id, permission_id)
);

CREATE INDEX idx_effective_permissions_cache_lookup 
  ON effective_permissions_cache(user_id, permission_action_name);
```

### 25.2 Phase 2 multi-tenant addition

Add `tenant_id` column + composite key:

```sql
ALTER TABLE effective_permissions_cache 
  ADD COLUMN tenant_id UUID REFERENCES tenants(id);

ALTER TABLE effective_permissions_cache 
  DROP CONSTRAINT effective_permissions_cache_unique;

ALTER TABLE effective_permissions_cache 
  ADD CONSTRAINT effective_permissions_cache_unique 
  UNIQUE (tenant_id, user_id, permission_id);

CREATE INDEX idx_effective_permissions_cache_lookup_mt 
  ON effective_permissions_cache(tenant_id, user_id, permission_action_name);
```

Plus optional partition by tenant_id:

```sql
-- Partition table for very large multi-tenant deployments
CREATE TABLE effective_permissions_cache PARTITION BY HASH (tenant_id);

CREATE TABLE effective_permissions_cache_p0 PARTITION OF effective_permissions_cache
  FOR VALUES WITH (MODULUS 16, REMAINDER 0);
-- ... 15 more partitions
```

### 25.3 Trigger updates

Triggers need to scope invalidation to tenant:

```sql
-- Phase 2 invalidation
DELETE FROM effective_permissions_cache
WHERE tenant_id = $current_tenant_id
  AND permission_id = ...
  AND user_id IN (...);
```

Build phase implements when multi-tenant goes live.

## 26. Performance summary

| Operation | Target | Strategy |
|---|---|---|
| Cache hit (single lookup) | <1ms p99 | Composite index on (user_id, permission_action_name) |
| Cache miss → algorithm + write | <5ms p99 | Pass 3 Phase 2 algorithm + INSERT ON CONFLICT |
| Invalidation trigger (1-50 rows) | <2ms | Simple DELETE by index |
| Invalidation trigger (500-5000 rows) | <100ms | Acceptable for admin operations |
| Warm-up on login (~30 actions) | <100ms async | Parallel resolution; not blocking login |
| Daily expiry cron | <30s | Indexed DELETE by expires_at |
| Cold rebuild via TRUNCATE | <1s + recovery | TRUNCATE instant; cache repopulates as traffic comes |
| Hit rate target | >95% | Warm-up + reasonable invalidation patterns |

## 27. Open questions (Pass 9)

1. **Should cache rows have TTL beyond expires_at?** Decision: NO. expires_at is the only TTL (for temporary overrides). Without TTL, entries persist until invalidated. Triggers handle invalidation. Adding TTL would force unnecessary re-computation. (Confirmed Pass 2 §9.7 decision 1.)

2. **Should warm-up be synchronous on first request after login?** Decision: NO — async. User shouldn't wait for warm. First request post-login may have a few cache misses; that's acceptable (each is <5ms).

3. **Should we cache the NEGATIVE result of permission resolution (denied)?** Decision: YES. Cache row stores `is_granted = FALSE` same as TRUE. Otherwise denied actions would always miss cache and re-resolve.

4. **Pre-warm caches in CI/staging before production deploy?** Decision: NO at v1. Production cache warms naturally via traffic in 2-5 minutes. Build phase may add pre-warm script if observed latency unacceptable.

5. **Multi-region replica strategy?** Decision: deferred to Phase 2. v1 is single-region. When multi-region: read replicas per region; writes still primary; permission grant propagation eventual.

6. **Cache warming for non-logged-in resources (e.g., public quote portal)?** Decision: NO cache needed — signed URL validator does its own check; doesn't go through A1.

7. **Should we expose cache lookup latency to end-user telemetry?** Decision: ops dashboard only at v1. Not user-facing. Phase 2 may add user-facing performance breakdown.

## 28. Migration order extension

Adding to Pass 8's 45-step migration order:

- Step 46: Create cache invalidation trigger functions (8 total triggers across 4 cache tables)
- Step 47: Apply triggers to source tables (role_permissions, user_permission_overrides, users, etc.)
- Step 48: Build warm-up service (login hook + grant change hook)
- Step 49: Build daily expiry cron job
- Step 50: Build weekly cleanup cron jobs (deprecated permissions, deactivated users, orphans)
- Step 51: Build cache observability instrumentation (metrics emission)
- Step 52: Build cache diagnostic API endpoint (per §23.3)
- Step 53: Set up read-replica configuration (optional; primary-only default at v1)

Now 53 total migration steps.

---

═══════════════════════════════════════════════════════════════════
# 29. What's next (Pass 10 preview)
═══════════════════════════════════════════════════════════════════

**Pass 10: Cross-cutting enforcement patterns.**

We've referenced §0.4 commitments throughout — separation of duties (§0.4 #11), regulatory expiry auto-block (§0.4 #12), geolocation retention (§0.4 #13). Pass 5's state bindings hooked into them. Pass 7's request workflow integrates with #11 + #13. Pass 9's cache invalidates appropriately.

But the COMPLETE enforcement pattern across all 13 cross-cutting commitments hasn't been specified end-to-end. Pass 10 catalogues:

- All 13 cross-cutting commitments and their enforcement points across passes
- How they compose (e.g., separation of duties + regulatory expiry + status binding combined check)
- Exception escalation paths (when does an override require A approval vs A+Acc co-sign?)
- Cross-cutting test surface (what scenarios verify the commitments hold?)
- Audit coverage (every enforcement event captured)
- Build phase priorities (which commitments are MVP-critical vs Phase 2 hardening)

Pass 10 will produce v0.10 of the design doc.

---

**End of v0.9.** Pass 9 (Effective-Permissions Caching Strategy) complete. Four caches specified with detailed invalidation triggers, lazy-fill pattern, warm-up patterns (on login + grant change), stale-while-revalidate (<5min dashboard only), eviction (daily expiry cron + weekly cleanup), size budgeting (v1 ~132MB; Phase 2 ~1.3GB), read-replica capability ready, multi-tenant cache key design Phase 2 prep, observability (8 metrics + alerts), failure modes (table unavailable, trigger failure, race conditions). Three architectural decisions locked: pull invalidation (not push), single table with composite index (partitioning Phase 2), read-replica ready (primary-only default). Seven Pass 9 open questions resolved. Migration order extended +8 steps (now 53 total).
