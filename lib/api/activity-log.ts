import "server-only";

// ACT-1 — activity log helpers.
//
// Three exports:
//   - computeChanges(before, after) — shallow diff used by update actions
//   - logActivity(entityType, entityId, action, changes) — best-effort write
//   - listActivityFor(entityType, entityId, limit) — read for the display
//
// Mirrors the lib/api/clients.ts auth/RLS posture: uses the cookie-aware
// server client so writes attribute to the caller's auth session.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { viewableOwnTypes, viewableParentTypes } from "@/lib/activity-access";
import type { Role } from "@/lib/types";
import type {
  ActivityAction,
  ActivityChanges,
  ActivityEntityType,
  DbActivityLog,
  DbActivityLogWithActor,
} from "@/lib/types/database";

export interface ChangeRecord {
  from: unknown;
  to: unknown;
}

/**
 * AUD-1 — optional roll-up + survival context for a log row.
 *   parent* — the entity this event should ALSO surface on (e.g. an attachment
 *             on a client → parentType: "client", parentId: clientId). The
 *             parent-timeline query includes rows whose parent matches.
 *   *Label  — the entity's / parent's display name captured NOW, so the row
 *             stays readable after the record is deleted (rows survive — no FK).
 */
export interface ActivityContext {
  parentType?: string | null;
  parentId?: string | null;
  entityLabel?: string | null;
  parentLabel?: string | null;
}

/**
 * Shallow diff: compares only the keys present in `after`. Keys whose
 * value is `undefined` in `after` are skipped (they mean "don't touch
 * this column"). JSONB array/object fields are compared via
 * `JSON.stringify` deep-equal. Returns `{}` when nothing changed — the
 * caller should skip logging in that case (no log noise on no-op saves).
 *
 * Pre-condition: `before` must be the row state BEFORE the mutation.
 * Fetch it via the relevant getById helper before calling `update*`.
 */
export function computeChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>
): Record<string, ChangeRecord> {
  const out: Record<string, ChangeRecord> = {};
  for (const key in after) {
    const a = after[key];
    if (a === undefined) continue;
    const b = before[key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out[key] = { from: b ?? null, to: a ?? null };
  }
  return out;
}

/**
 * Best-effort activity-log write.
 *
 * The tension (AUDIT-FIX-1): this is BEST-EFFORT — it never throws and never
 * rolls back the caller's mutation, because §2.8 says an audit-write failure
 * must not break a user's save. But it must never be SILENT either: a missing
 * RLS INSERT policy denied every one of these writes for months and nobody
 * noticed, precisely because the failure was swallowed without a useful log.
 * So on failure we emit a server-side error identifying the caller
 * (entity_type / action / entity_id / actor) — loud enough to catch in ops, but
 * still non-fatal to the request.
 *
 * Resolves the actor via the session-cookie supabase client — no extra
 * profiles lookup at write time. Display-name resolution happens at read time
 * in listActivityFor().
 */
export async function logActivity(
  entityType: ActivityEntityType,
  entityId: string,
  action: ActivityAction,
  changes: ActivityChanges = {},
  ctx: ActivityContext = {}
): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("activity_log").insert({
      entity_type: entityType,
      entity_id: entityId,
      action,
      changes,
      actor_id: user?.id ?? null,
      parent_type: ctx.parentType ?? null,
      parent_id: ctx.parentId ?? null,
      entity_label: ctx.entityLabel ?? null,
      parent_label: ctx.parentLabel ?? null,
    });
    if (error) {
      console.error(
        `[activity_log] insert DENIED/failed — entity_type=${entityType} action=${action} entity_id=${entityId} actor_id=${user?.id ?? "null"}: ${error.message}`
      );
    }
  } catch (e) {
    // Never block the main mutation — but never swallow silently either.
    console.error(
      `[activity_log] write threw — entity_type=${entityType} action=${action} entity_id=${entityId}:`,
      e
    );
  }
}

/**
 * Fetch activity-log entries for an entity, latest-on-top, enriched with
 * the actor's profile slice. Two-query approach (log rows + batched
 * profiles lookup) rather than Supabase nested-select — keeps RLS
 * reasoning simple and avoids cross-schema join surprises with auth.users.
 *
 * Default limit 100; bump if needed. RLS gates SELECT to authenticated
 * users (any authed user can read any log row).
 */
type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type ActorSlice = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

/** Enrich rows with the actor profile slice (one batched profiles lookup). */
async function enrichActors(
  supabase: SupabaseServer,
  logRows: DbActivityLog[]
): Promise<DbActivityLogWithActor[]> {
  const actorIds = Array.from(
    new Set(logRows.map((r) => r.actor_id).filter((id): id is string => id !== null))
  );
  const byId = new Map<string, ActorSlice>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, first_name, last_name")
      .in("id", actorIds);
    for (const p of (profiles as ActorSlice[] | null) ?? []) byId.set(p.id, p);
  }
  return logRows.map((r) => ({
    ...r,
    actor: r.actor_id ? byId.get(r.actor_id) ?? null : null,
  })) as DbActivityLogWithActor[];
}

export interface ActivityPage {
  entries: DbActivityLogWithActor[];
  hasMore: boolean;
}

/**
 * AUD-2 — one page of an entity's timeline (its OWN rows PLUS any child event
 * rolled up to it via parent_type/parent_id), latest-first. Fetches limit+1 to
 * report `hasMore` for lazy "load more". Never loads a whole two-year history at
 * once — the caller pages via `offset`.
 */
export async function listActivityPage(
  entityType: ActivityEntityType,
  entityId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<ActivityPage> {
  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .or(
      `and(entity_type.eq.${entityType},entity_id.eq.${entityId}),` +
        `and(parent_type.eq.${entityType},parent_id.eq.${entityId})`
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit); // limit+1 rows → detect a next page

  if (error) throw new Error(`listActivityPage: ${error.message}`);
  const rows = (data ?? []) as DbActivityLog[];
  const hasMore = rows.length > limit;
  const entries = await enrichActors(supabase, hasMore ? rows.slice(0, limit) : rows);
  return { entries, hasMore };
}

/** Back-compat single-shot reader (used by the older client tab wiring). */
export async function listActivityFor(
  entityType: ActivityEntityType,
  entityId: string,
  limit = 100
): Promise<DbActivityLogWithActor[]> {
  return (await listActivityPage(entityType, entityId, { limit, offset: 0 })).entries;
}

// ─── AUD-3 — the central Activity feed (cross-entity, permission-scoped) ──────

export interface ActivityFeedFilters {
  /** Restrict to one actor. */
  actorId?: string | null;
  /** Multi-select entity types; empty/undefined = every type the caller may see. */
  entityTypes?: ActivityEntityType[];
  /** created / updated / deleted. */
  action?: ActivityAction | null;
  /** ISO timestamps bounding the window (inclusive). Both required — the feed is
   *  never unbounded. */
  from: string;
  to: string;
  /** Free text matched against entity_label + parent_label (case-insensitive). */
  q?: string;
  limit?: number;
  offset?: number;
}

export interface ActivityFeed {
  entries: DbActivityLogWithActor[];
  hasMore: boolean;
}

/** Build the PostgREST permission `.or()` clause that guarantees no row for a
 *  record the caller cannot view is ever returned. Own-entity rows are gated by
 *  their own type's resource; `attachment` rows are gated by their PARENT type.
 *  Returns null when the caller may see nothing (caller should short-circuit). */
function scopeFeedClause(
  role: Role,
  requested: ActivityEntityType[] | undefined
): string | null {
  const req = requested && requested.length > 0 ? new Set(requested) : null;

  let own = viewableOwnTypes(role);
  if (req) own = own.filter((t) => req.has(t));

  // attachment is parent-gated; include it only if requested (or no filter) AND
  // the caller can see at least one parent type.
  const attachmentRequested = !req || req.has("attachment");
  const parents = attachmentRequested ? viewableParentTypes(role) : [];

  const clauses: string[] = [];
  if (own.length > 0) clauses.push(`entity_type.in.(${own.join(",")})`);
  if (parents.length > 0) {
    clauses.push(
      `and(entity_type.eq.attachment,parent_type.in.(${parents.join(",")}))`
    );
  }
  if (clauses.length === 0) return null;
  return clauses.join(",");
}

/**
 * AUD-3 — one page of the central feed. Every path is bounded (a required
 * [from,to] window) and paginated (limit+1 → hasMore). The `role` scopes the
 * query so a row for a record the caller can't view is never fetched — this is
 * the sole leakage guard, applied identically by the page and the export.
 */
export async function listActivityFeed(
  role: Role,
  filters: ActivityFeedFilters
): Promise<ActivityFeed> {
  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;

  const permClause = scopeFeedClause(role, filters.entityTypes);
  if (!permClause) return { entries: [], hasMore: false };

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("activity_log")
    .select("*")
    .or(permClause)
    .gte("created_at", filters.from)
    .lte("created_at", filters.to);

  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.q && filters.q.trim()) {
    // Escape PostgREST reserved chars in the LIKE pattern.
    const term = filters.q.trim().replace(/[%,()]/g, " ");
    query = query.or(`entity_label.ilike.%${term}%,parent_label.ilike.%${term}%`);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);
  if (error) throw new Error(`listActivityFeed: ${error.message}`);

  const rows = (data ?? []) as DbActivityLog[];
  const hasMore = rows.length > limit;
  const entries = await enrichActors(
    supabase,
    hasMore ? rows.slice(0, limit) : rows
  );
  return { entries, hasMore };
}

export interface ActivityUserSummary {
  /** Exact count in range (permission-scoped to the viewer). */
  total: number;
  byType: { entityType: ActivityEntityType; count: number }[];
  mostRecentAt: string | null;
  /** True when total exceeds the breakdown sample — byType is over the most
   *  recent SUMMARY_SAMPLE rows, not the whole range. */
  capped: boolean;
}

const SUMMARY_SAMPLE = 1000;

/**
 * AUD-3 — the compact header stats for the per-user view: exact total in range,
 * a by-entity-type breakdown, and the most-recent timestamp. Permission-scoped
 * to the VIEWER's role (same guard as the feed), so a monitor sees the counts of
 * exactly the rows they are entitled to see — never a leak of hidden activity.
 */
export async function activityUserSummary(
  role: Role,
  userId: string,
  from: string,
  to: string
): Promise<ActivityUserSummary> {
  const permClause = scopeFeedClause(role, undefined);
  if (!permClause) return { total: 0, byType: [], mostRecentAt: null, capped: false };
  const supabase = await createSupabaseServerClient();

  const base = () =>
    supabase
      .from("activity_log")
      .select("entity_type, created_at", { count: "exact" })
      .or(permClause)
      .eq("actor_id", userId)
      .gte("created_at", from)
      .lte("created_at", to);

  const { data, count, error } = await base()
    .order("created_at", { ascending: false })
    .limit(SUMMARY_SAMPLE);
  if (error) throw new Error(`activityUserSummary: ${error.message}`);

  const rows = (data ?? []) as { entity_type: ActivityEntityType; created_at: string }[];
  const counts = new Map<ActivityEntityType, number>();
  for (const r of rows) counts.set(r.entity_type, (counts.get(r.entity_type) ?? 0) + 1);
  const byType = [...counts.entries()]
    .map(([entityType, c]) => ({ entityType, count: c }))
    .sort((a, b) => b.count - a.count);

  const total = count ?? rows.length;
  return {
    total,
    byType,
    mostRecentAt: rows[0]?.created_at ?? null,
    capped: total > SUMMARY_SAMPLE,
  };
}

export interface ActivityActor {
  id: string;
  name: string;
}

/** AUD-3 — the actor options for the feed's "who" filter. Reads profiles via the
 *  authenticated client (same slice enrichActors already reads), so any signed-in
 *  user can populate the dropdown; no admin gate. */
export async function listActivityActors(): Promise<ActivityActor[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, first_name, last_name")
    .order("display_name", { ascending: true });
  return ((data as ActorSlice[] | null) ?? []).map((p) => ({
    id: p.id,
    name:
      p.display_name ||
      [p.first_name, p.last_name].filter(Boolean).join(" ") ||
      "Unknown user",
  }));
}

// Entity types that have a real detail route — only these can become links, and
// only when the record still physically exists (a hard-deleted record has no
// row, so it renders as plain text). Types absent here never link.
const FEED_LINK_TABLE: Partial<Record<ActivityEntityType, string>> = {
  client: "clients",
  site: "sites",
  project: "projects",
  job: "project_jobs",
  vendor: "vendors",
  inventory: "inventory_products",
  subcontractor: "subcontractors",
};

/**
 * AUD-3 — for a page of entries, return the set of `${entity_type}:${entity_id}`
 * keys whose underlying record still exists (batched, one small query per table
 * present on the page). A key absent from the set is an orphan → render its label
 * as text, never a link. Bounded by page size, so at most a handful of IN queries.
 */
export async function liveRecordKeys(
  entries: DbActivityLogWithActor[]
): Promise<Set<string>> {
  const byTable = new Map<string, { table: string; ids: Set<string> }>();
  for (const e of entries) {
    const table = FEED_LINK_TABLE[e.entity_type];
    if (!table) continue;
    if (!byTable.has(table)) byTable.set(table, { table, ids: new Set() });
    byTable.get(table)!.ids.add(e.entity_id);
  }
  if (byTable.size === 0) return new Set();

  const supabase = await createSupabaseServerClient();
  const live = new Set<string>();
  // Reverse lookup table → entity_type for key reconstruction.
  const tableToType = new Map<string, ActivityEntityType>();
  for (const [t, table] of Object.entries(FEED_LINK_TABLE)) {
    if (table) tableToType.set(table, t as ActivityEntityType);
  }
  await Promise.all(
    [...byTable.values()].map(async ({ table, ids }) => {
      const { data } = await supabase
        .from(table)
        .select("id")
        .in("id", [...ids]);
      const type = tableToType.get(table)!;
      for (const r of (data ?? []) as { id: string }[]) {
        live.add(`${type}:${r.id}`);
      }
    })
  );
  return live;
}
