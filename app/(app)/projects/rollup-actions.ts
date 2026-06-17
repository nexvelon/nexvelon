"use server";

// JC-2 — project cost-rollup action. Read-only and open to authenticated
// callers, BUT the financial-sensitive legs (labour, spent, margin) are
// redacted to null for anyone without financials:edit — defense-in-depth so the
// numbers never reach a non-financials client, not just hidden in the UI.
// `canSeeFinancials` lets the view lay out accordingly.

import {
  getProjectCostRollup,
  type ProjectCostRollup,
} from "@/lib/api/project-cost-rollup";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { DbRole } from "@/lib/types/database";
import type { Role } from "@/lib/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Unknown error";
  return { ok: false, error: message };
}

// DbRole (11) → app Role (7); mirrors the invoices/labour action helpers.
function adaptRole(r: DbRole): Role {
  switch (r) {
    case "Admin":
    case "ProjectManager":
    case "SalesRep":
    case "Technician":
    case "Subcontractor":
    case "Accountant":
    case "ViewOnly":
      return r;
    case "LeadTechnician":
      return "Technician";
    case "Dispatcher":
      return "ProjectManager";
    case "Warehouse":
      return "Technician";
    case "ClientPortal":
      return "ViewOnly";
  }
}

export interface ProjectRollupResult {
  rollup: ProjectCostRollup;
  canSeeFinancials: boolean;
}

export async function getProjectCostRollupAction(
  projectId: string
): Promise<ActionResult<ProjectRollupResult>> {
  try {
    const me = await getCurrentProfile();
    const canSeeFinancials = !!(
      me && hasPermission(adaptRole(me.role), "financials", "edit")
    );
    const rollup = await getProjectCostRollup(projectId);

    if (!canSeeFinancials) {
      rollup.perProject.labour = null;
      rollup.perProject.spent = null;
      rollup.perProject.margin = null;
      for (const k of Object.keys(rollup.perCostCenter)) {
        rollup.perCostCenter[k].labour = null;
        rollup.perCostCenter[k].spent = null;
        rollup.perCostCenter[k].margin = null;
      }
    }

    return { ok: true, data: { rollup, canSeeFinancials } };
  } catch (e) {
    return fail(e);
  }
}
