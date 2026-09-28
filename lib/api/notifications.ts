import "server-only";

// QUOTE-PORTAL-2 item 7 — the minimal in-app notification data layer
// (migration 0132). Notifications are CREATED server-side (often in the
// unauthenticated portal context, e.g. on signature) via the service-role
// client; a signed-in user READS and marks their own rows via the cookie client
// under RLS.

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import type { DbNotification } from "@/lib/types/database";

export interface NewNotification {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

/** Create notifications for one or more users (service-role; best-effort — a
 *  notification failure must never break the action that triggered it). */
export async function createNotifications(rows: NewNotification[]): Promise<void> {
  const clean = rows.filter((r) => r.userId);
  if (clean.length === 0) return;
  try {
    await createAdminClient()
      .from("notifications")
      .insert(
        clean.map((r) => ({
          user_id: r.userId,
          type: r.type,
          title: r.title,
          body: r.body ?? null,
          link: r.link ?? null,
        }))
      );
  } catch (e) {
    console.error("[notifications] insert failed (non-fatal):", e);
  }
}

/** The current user's most recent notifications (their own rows only, via RLS). */
export async function listMyNotifications(limit = 20): Promise<DbNotification[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as DbNotification[];
}

/** Mark one (or all) of the current user's notifications read. */
export async function markNotificationsRead(id?: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (id) q = q.eq("id", id);
  await q;
}

/** Every Admin's user id — the recipients (besides the sender) of a
 *  "quote signed" notification. Service-role read. */
export async function listAdminUserIds(): Promise<string[]> {
  try {
    const { data } = await createAdminClient()
      .from("profiles")
      .select("id")
      .eq("role", "Admin")
      .eq("status", "Active");
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
  } catch (e) {
    console.error("[notifications] listAdminUserIds failed:", e);
    return [];
  }
}
