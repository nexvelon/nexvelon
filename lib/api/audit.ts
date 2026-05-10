import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DbAuthAuditLog, DbProfile } from "@/lib/types/database";

// ============================================================================
// Server-only audit-log API.
//
// RLS on public.auth_audit_log restricts SELECT to is_admin() (migration
// 0002). The cookie-aware server client carries the caller's JWT, so any
// non-admin attempting to read here is denied at the DB layer — no extra
// gate needed in this file. The Users page still verifies the caller is
// Admin before mounting the surface, as defence in depth.
// ============================================================================

/**
 * Combined audit-event row — the raw DbAuthAuditLog plus the matching
 * profile (joined client-side; auth_audit_log.user_id references
 * auth.users(id), not public.profiles(id), so we can't lean on PostgREST
 * embedding directly).
 */
export interface AuditEventWithProfile extends DbAuthAuditLog {
  profile: Pick<
    DbProfile,
    "id" | "email" | "first_name" | "last_name" | "display_name" | "role"
  > | null;
}

/**
 * Most-recent audit-log rows, newest first. Joins each row with its
 * profile in a single second round-trip so we can render a name in the
 * UI.
 *
 * Returns `[]` on empty result. Throws on real query errors.
 */
export async function getRecentAuditLog(
  limit = 100
): Promise<AuditEventWithProfile[]> {
  const supabase = await createClient();

  const { data: events, error } = await supabase
    .from("auth_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    // RLS denial surfaces here as a 401-ish error — bubble up so the
    // caller can render an empty / restricted state if appropriate.
    throw new Error(`getRecentAuditLog: ${error.message}`);
  }

  const rows = (events ?? []) as DbAuthAuditLog[];
  if (rows.length === 0) return [];

  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id))
  );

  const profileById = new Map<
    string,
    AuditEventWithProfile["profile"]
  >();
  if (userIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, email, first_name, last_name, display_name, role")
      .in("id", userIds);
    if (pErr) {
      // Profile join is best-effort — don't fail the whole audit-log read.
      console.error(
        "[getRecentAuditLog] profile join failed:",
        pErr.message
      );
    } else {
      for (const p of profiles ?? []) {
        profileById.set(p.id, p as AuditEventWithProfile["profile"]);
      }
    }
  }

  return rows.map((r) => ({
    ...r,
    profile: r.user_id ? profileById.get(r.user_id) ?? null : null,
  }));
}
