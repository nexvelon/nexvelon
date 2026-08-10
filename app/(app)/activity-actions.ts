"use server";

// AUD-2 — lazy "load more" for an entity's Activity tab. Permission-gated by the
// entity's own view resource (no new key). Best-effort read; never mutates.

import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import { adaptDbRole as adaptRole } from "@/lib/permissions/resolve";
import { listActivityPage, type ActivityPage } from "@/lib/api/activity-log";
import { ACTIVITY_RESOURCE, ACTIVITY_PAGE_SIZE } from "@/lib/activity-access";
import type { ActivityEntityType } from "@/lib/types/database";

export type ActivityResult =
  | { ok: true; page: ActivityPage }
  | { ok: false; error: string };

export async function loadEntityActivityAction(
  entityType: ActivityEntityType,
  entityId: string,
  offset: number
): Promise<ActivityResult> {
  const me = await getCurrentProfile();
  const resource = ACTIVITY_RESOURCE[entityType];
  if (!me || !resource || !hasPermission(adaptRole(me.role), resource, "view")) {
    return { ok: false, error: "You do not have permission to view this activity." };
  }
  try {
    const page = await listActivityPage(entityType, entityId, {
      limit: ACTIVITY_PAGE_SIZE,
      offset,
    });
    return { ok: true, page };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load activity." };
  }
}
