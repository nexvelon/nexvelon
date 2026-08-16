// AUD-2 — which permission resource gates each entity's Activity tab. A user who
// can't view the entity can't read its activity. Reuses the existing per-resource
// view gate (no new permission key). The entity_type here is the HOST whose tab
// it is (children roll up to it), so quotes/schedule/users/settings are absent —
// those keep their own dedicated audit surfaces (quote_audit_log, etc.).

import type { ActivityEntityType } from "@/lib/types/database";
import { ACTIVITY_ENTITY_TYPES } from "@/lib/types/database";
import { hasPermission, type Resource } from "@/lib/permissions";
import type { Role } from "@/lib/types";

export const ACTIVITY_PAGE_SIZE = 25;

// AUD-3 — the central Activity feed spans EVERY entity, so it needs a resource
// for every entity_type (ACTIVITY_RESOURCE below is partial — only the entities
// that host a tab). A row is shown in the feed only if the caller can `view` the
// resource its entity_type maps to here; this is the single leakage guard.
//
// `attachment` is the one exception: an attachment always rolls up to a parent
// (client/project/site/…), so its visibility follows the PARENT's resource, not
// a fixed one — the feed query gates it by parent_type (see scopeFeedFilter).
// Its entry here is a harmless placeholder (attachment is never itself a parent).
export const FEED_RESOURCE: Record<ActivityEntityType, Resource> = {
  client: "clients",
  site: "clients",
  contact: "clients",
  purchase_order: "inventory",
  vendor: "inventory",
  invoice: "financials",
  inventory_product: "inventory",
  stock_movement: "inventory",
  pickup_slip: "inventory",
  rma: "inventory",
  project: "projects",
  ui_theme: "settings",
  inventory: "inventory",
  attachment: "clients", // placeholder — gated by parent_type, see scopeFeedFilter
  job: "projects",
  job_task: "projects",
  deficiency: "projects",
  commissioning_item: "projects",
  subcontractor: "subcontractors",
  subcontractor_compliance: "subcontractors",
};

// AUD-3 — human labels for each entity_type, for the feed's type column + the
// entity-type multi-select filter.
export const ENTITY_TYPE_LABEL: Record<ActivityEntityType, string> = {
  client: "Client",
  site: "Site",
  contact: "Contact",
  purchase_order: "Purchase order",
  vendor: "Vendor",
  invoice: "Invoice",
  inventory_product: "Product",
  stock_movement: "Stock movement",
  pickup_slip: "Pickup slip",
  rma: "RMA",
  project: "Project",
  ui_theme: "Theme",
  inventory: "Product",
  attachment: "Document",
  job: "Job",
  job_task: "Task",
  deficiency: "Deficiency",
  commissioning_item: "Commissioning item",
  subcontractor: "Subcontractor",
  subcontractor_compliance: "Compliance document",
};

/** AUD-3 — the detail-page href for a feed row, or null when the type has no
 *  standalone page (task/stock movement/etc.) — those always render as text.
 *  Caller links only when the record is also still live (liveRecordKeys). */
export function feedHref(
  entityType: ActivityEntityType,
  entityId: string,
  parentId: string | null
): string | null {
  switch (entityType) {
    case "client":
      return `/clients/${entityId}`;
    case "site":
      return `/sites/${entityId}`;
    case "project":
      return `/projects/${entityId}`;
    case "job":
      return parentId ? `/projects/${parentId}/jobs/${entityId}` : null;
    case "vendor":
      return `/vendors/${entityId}`;
    case "inventory":
      return `/inventory/${entityId}`;
    case "subcontractor":
      return `/subcontractors/${entityId}`;
    default:
      return null;
  }
}

/** Entity types the caller may see the OWN rows of (attachment excluded — it is
 *  gated by its parent). */
export function viewableOwnTypes(role: Role): ActivityEntityType[] {
  return ACTIVITY_ENTITY_TYPES.filter(
    (t) => t !== "attachment" && hasPermission(role, FEED_RESOURCE[t], "view")
  );
}

/** Parent types the caller may see rolled-up (attachment) rows under. A parent
 *  type is just another entity_type value stored in `parent_type`. */
export function viewableParentTypes(role: Role): ActivityEntityType[] {
  return ACTIVITY_ENTITY_TYPES.filter((t) =>
    hasPermission(role, FEED_RESOURCE[t], "view")
  );
}

/** AUD-3 — may `viewer` open `target`'s per-user activity view? A user may ALWAYS
 *  view their own; viewing anyone else needs the supervisory users:view gate. */
export function canViewUserActivity(
  role: Role,
  viewerId: string,
  targetId: string
): boolean {
  return viewerId === targetId || hasPermission(role, "users", "view");
}

export const ACTIVITY_RESOURCE: Partial<Record<ActivityEntityType, Resource>> = {
  client: "clients",
  site: "clients",
  contact: "clients",
  project: "projects",
  purchase_order: "inventory",
  vendor: "inventory",
  inventory: "inventory",
  inventory_product: "inventory",
  stock_movement: "inventory",
  pickup_slip: "inventory",
  rma: "inventory",
  // AUD-2B — job + its children share the projects gate; subcontractor + its
  // compliance docs share the subcontractors gate.
  job: "projects",
  job_task: "projects",
  deficiency: "projects",
  commissioning_item: "projects",
  subcontractor: "subcontractors",
  subcontractor_compliance: "subcontractors",
};
