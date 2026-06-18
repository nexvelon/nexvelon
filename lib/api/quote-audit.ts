import "server-only";

// AUDIT-1 — read/write helpers for public.quote_audit_log (migration 0038).
// The table is append-only & immutable: writes go through the SERVICE-ROLE
// client (BYPASSRLS) because there is no INSERT policy; reads go through the
// normal authenticated client, where the admin-only SELECT RLS policy enforces
// that only Admins see any rows.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DbQuoteAuditLog } from "@/lib/types/database";

export interface QuoteAuditEventInput {
  quoteId: string;
  actorId: string | null;
  actorName: string | null;
  eventType: string;
  changes?: Record<string, unknown>;
}

/**
 * Insert ONE audit row. Service-role write (the table has no INSERT policy by
 * design). Best-effort: a failure here must never block the underlying quote
 * save, but it IS the audit trail, so we console.error on failure.
 */
export async function logQuoteAuditEvent(
  input: QuoteAuditEventInput
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("quote_audit_log").insert({
      quote_id: input.quoteId,
      actor_id: input.actorId,
      actor_name: input.actorName,
      event_type: input.eventType,
      changes: input.changes ?? {},
    });
    if (error) {
      console.error("[quote_audit_log] insert failed:", error.message);
    }
  } catch (e) {
    console.error("[quote_audit_log] write failed:", e);
  }
}

/**
 * Read a quote's audit trail oldest-first. Uses the normal server client, so
 * the admin-only SELECT RLS policy applies — a non-admin caller simply gets no
 * rows back ([]).
 */
export async function getQuoteAuditEvents(
  quoteId: string
): Promise<DbQuoteAuditLog[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("quote_audit_log")
    .select("*")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[quote_audit_log] read failed:", error.message);
    return [];
  }
  return (data ?? []) as DbQuoteAuditLog[];
}

// ── Admin hard-delete ─────────────────────────────────────────────────────────
// quote_audit_log is normally immutable (no DELETE policy), so these go through
// the SERVICE-ROLE client to bypass RLS. They are intentional HARD deletes — the
// rows are erased outright and nothing is logged about the deletion. The caller
// is responsible for enforcing the Admin gate.

/** Permanently delete a single audit row. Returns true if a row was removed. */
export async function deleteQuoteAuditById(id: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quote_audit_log")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteQuoteAuditById: ${error.message}`);
  return (data ?? []).length > 0;
}

/** Permanently delete the whole audit trail for a quote. Returns the count of
 *  rows removed. */
export async function deleteAllQuoteAuditForQuote(
  quoteId: string
): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quote_audit_log")
    .delete()
    .eq("quote_id", quoteId)
    .select("id");
  if (error) throw new Error(`deleteAllQuoteAuditForQuote: ${error.message}`);
  return (data ?? []).length;
}
