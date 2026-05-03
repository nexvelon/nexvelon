import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AuthAuditEvent,
  DbAuthAuditLogInsert,
} from "@/lib/types/database";

/**
 * Append a row to public.auth_audit_log via the service-role client.
 *
 * RLS denies authenticated INSERTs on this table (intentional — only server
 * actions write here). Failures are logged but never thrown; an audit-log
 * write should not break a sign-in.
 *
 * Always pass the originating request's IP and user-agent when available.
 * Both come off the Next.js Request headers in the caller — see
 * lib/auth/request-info.ts.
 */
export async function writeAuditLog(
  event: AuthAuditEvent,
  payload: Omit<DbAuthAuditLogInsert, "event"> = {}
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("auth_audit_log").insert({
      event,
      user_id: payload.user_id ?? null,
      email: payload.email ?? null,
      ip: payload.ip ?? null,
      user_agent: payload.user_agent ?? null,
      metadata: payload.metadata ?? null,
    });
    if (error) {
      console.error("[auth_audit_log] insert failed:", error.message, {
        event,
      });
    }
  } catch (e) {
    console.error("[auth_audit_log] threw:", e);
  }
}
