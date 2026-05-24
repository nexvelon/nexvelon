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
import type {
  ActivityAction,
  ActivityChanges,
  ActivityEntityType,
  DbActivityLogWithActor,
} from "@/lib/types/database";

export interface ChangeRecord {
  from: unknown;
  to: unknown;
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
 * Best-effort activity-log write. Swallows ALL errors (including auth /
 * RLS / network failures) so a log-write failure never blocks the main
 * mutation. Errors are logged to the server console for ops debugging.
 *
 * Resolves the actor via the session-cookie supabase client — no extra
 * profiles lookup at write time. Display-name resolution happens at
 * read time in listActivityFor().
 */
export async function logActivity(
  entityType: ActivityEntityType,
  entityId: string,
  action: ActivityAction,
  changes: ActivityChanges = {}
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
    });
    if (error) {
      console.error("[activity_log] insert failed:", error.message);
    }
  } catch (e) {
    console.error("[activity_log] write failed:", e);
    // intentionally swallow — never block the main mutation
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
export async function listActivityFor(
  entityType: ActivityEntityType,
  entityId: string,
  limit = 100
): Promise<DbActivityLogWithActor[]> {
  const supabase = await createSupabaseServerClient();

  const { data: logRows, error: logErr } = await supabase
    .from("activity_log")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (logErr) throw new Error(`listActivityFor: ${logErr.message}`);
  if (!logRows || logRows.length === 0) return [];

  // Resolve unique actor_ids to profile slices in a single query.
  const actorIds = Array.from(
    new Set(
      logRows
        .map((r) => r.actor_id as string | null)
        .filter((id): id is string => id !== null)
    )
  );

  type ActorSlice = {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  };
  const profilesById = new Map<string, ActorSlice>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, first_name, last_name")
      .in("id", actorIds);
    if (profiles) {
      for (const p of profiles as ActorSlice[]) {
        profilesById.set(p.id, p);
      }
    }
  }

  return logRows.map((r) => ({
    ...r,
    actor: r.actor_id ? profilesById.get(r.actor_id) ?? null : null,
  })) as DbActivityLogWithActor[];
}
