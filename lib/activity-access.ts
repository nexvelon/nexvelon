// AUD-2 — which permission resource gates each entity's Activity tab. A user who
// can't view the entity can't read its activity. Reuses the existing per-resource
// view gate (no new permission key). The entity_type here is the HOST whose tab
// it is (children roll up to it), so quotes/schedule/users/settings are absent —
// those keep their own dedicated audit surfaces (quote_audit_log, etc.).

import type { ActivityEntityType } from "@/lib/types/database";
import type { Resource } from "@/lib/permissions";

export const ACTIVITY_PAGE_SIZE = 25;

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
};
