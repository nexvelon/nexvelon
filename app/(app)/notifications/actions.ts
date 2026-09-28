"use server";

// QUOTE-PORTAL-2 item 7 — server actions backing the topbar notifications bell.
// Reads/writes the signed-in user's own notifications (RLS-scoped).

import { listMyNotifications, markNotificationsRead } from "@/lib/api/notifications";
import type { DbNotification } from "@/lib/types/database";

export async function getMyNotificationsAction(): Promise<DbNotification[]> {
  try {
    return await listMyNotifications(20);
  } catch {
    return [];
  }
}

export async function markAllNotificationsReadAction(): Promise<{ ok: true }> {
  try {
    await markNotificationsRead();
  } catch {
    /* non-fatal */
  }
  return { ok: true };
}

export async function markNotificationReadAction(id: string): Promise<{ ok: true }> {
  try {
    await markNotificationsRead(id);
  } catch {
    /* non-fatal */
  }
  return { ok: true };
}
