import type { DbRole } from "@/lib/types/database";
import type { Role } from "@/lib/types";

/**
 * Maps the 11-value DB role enum onto the app `Role` used by
 * `lib/permissions.ts` and the `<Can>` consumers. MUST agree with the server
 * adapter `adaptDbRole` (lib/permissions/resolve.ts) — they now do, cell for
 * cell.
 *
 *   LeadTechnician → Technician   (until the matrix models it)
 *   Dispatcher     → ProjectManager (closest semantic peer)
 *   Warehouse      → Warehouse     (DES-1: a first-class matrix role now — the
 *                                   old server→Technician / client→ViewOnly
 *                                   divergence is resolved)
 *   ClientPortal   → ViewOnly      (extremely scoped — its own role later)
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
    case "Warehouse":
      return dbRole;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "ClientPortal":
    case null:
    case undefined:
    default:
      return "ViewOnly";
  }
}
