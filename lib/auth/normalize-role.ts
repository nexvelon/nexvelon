import type { DbRole } from "@/lib/types/database";
import type { Role } from "@/lib/types";

/**
 * Maps the 11-value DB role enum onto the 7-value app `Role` used by
 * `lib/permissions.ts` and the existing `<Can>` consumers.
 *
 * Session A schema introduced four roles that the permissions matrix doesn't
 * yet model:
 *
 *   LeadTechnician → Technician   (until Session B refines the matrix)
 *   Dispatcher     → ProjectManager (closest semantic peer)
 *   Warehouse      → ViewOnly      (read-only inventory until refined)
 *   ClientPortal   → ViewOnly      (extremely scoped — Session B will give
 *                                   it its own dedicated permissions)
 *
 * Session B will replace this file with a real DB-driven role x permission
 * lookup. Until then, this conservative downgrade keeps the existing
 * <Can resource action /> gates working without false-positive grants.
 */
export function normalizeDbRole(dbRole: DbRole | null | undefined): Role {
  switch (dbRole) {
    case "Admin":
    case "ProjectManager":
    case "SalesRep":
    case "Technician":
    case "Subcontractor":
    case "Accountant":
    case "ViewOnly":
      return dbRole;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "Warehouse":
    case "ClientPortal":
    case null:
    case undefined:
    default:
      return "ViewOnly";
  }
}
