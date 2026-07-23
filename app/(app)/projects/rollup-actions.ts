"use server";

// JC-2 — project cost-rollup action. Read-only and open to authenticated
// callers, BUT the financial-sensitive legs (labour, spent, margin) are
// redacted to null for anyone without financials:edit — defense-in-depth so the
// numbers never reach a non-financials client, not just hidden in the UI.
// `canSeeFinancials` lets the view lay out accordingly.

import {
  getProjectCostRollup,
  type ProjectCostRollup,
  type DbJobRollup,
} from "@/lib/api/project-cost-rollup";
import { getJobById } from "@/lib/api/projects";
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
    // PROJ2-3 — must be a project viewer to read the rollup at all. The
    // financials redaction below (canSeeFinancials via financials:edit) is a
    // SECOND gate on top, not a replacement.
    if (!me || !hasPermission(adaptRole(me.role), "projects", "view")) {
      return { ok: false, error: "You don't have permission to view projects." };
    }
    const canSeeFinancials = hasPermission(
      adaptRole(me.role),
      "financials",
      "edit"
    );
    const rollup = await getProjectCostRollup(projectId);
    if (!canSeeFinancials) redactRollup(rollup);

    return { ok: true, data: { rollup, canSeeFinancials } };
  } catch (e) {
    return fail(e);
  }
}

// PROJ2-4a — redact the financial legs (labour/spent/margin) across ALL levels
// of the rollup (project, each cost center, each job) for non-financials callers.
function redactRollup(rollup: ProjectCostRollup): void {
  rollup.perProject.labour = null;
  rollup.perProject.sub_labour = null;
  rollup.perProject.spent = null;
  rollup.perProject.margin = null;
  // PROJ2-4c — po_committed is spend; redact it too. (Project invoiced/
  // billed_pct stay visible — unchanged pre-4c behavior.)
  rollup.perProject.po_committed = null;
  // FIN-5 — billed cost is spend; redact with the other cost legs.
  rollup.perProject.billed_cost = null;
  // PROJ2-6b — the entire variance block is financial; dash it whole.
  rollup.perProject.variance = null;
  for (const k of Object.keys(rollup.perCostCenter)) {
    rollup.perCostCenter[k].labour = null;
    rollup.perCostCenter[k].spent = null;
    rollup.perCostCenter[k].margin = null;
  }
  // PROJ2-4c — at the Job level, redact the full financial leg (incl. invoiced /
  // billed_pct / po_committed) per §5a.
  for (const j of rollup.byJob) {
    j.labour = null;
    j.sub_labour = null;
    j.spent = null;
    j.margin = null;
    j.invoiced = null;
    j.billed_pct = null;
    j.po_committed = null;
    j.billed_cost = null;
    j.variance = null;
  }
}

export interface JobRollupResult {
  rollup: DbJobRollup;
  canSeeFinancials: boolean;
}

// PROJ2-4a — the single-job rollup entry for a given job. projects:view gate +
// identical financials redaction.
export async function getJobRollupAction(
  jobId: string
): Promise<ActionResult<JobRollupResult>> {
  try {
    const me = await getCurrentProfile();
    if (!me || !hasPermission(adaptRole(me.role), "projects", "view")) {
      return { ok: false, error: "You don't have permission to view projects." };
    }
    const job = await getJobById(jobId);
    if (!job) return { ok: false, error: "Job not found." };

    const canSeeFinancials = hasPermission(
      adaptRole(me.role),
      "financials",
      "edit"
    );
    const full = await getProjectCostRollup(job.project_id);
    if (!canSeeFinancials) redactRollup(full);
    const entry = full.byJob.find((j) => j.job_id === jobId);
    if (!entry) return { ok: false, error: "Job rollup not found." };

    return { ok: true, data: { rollup: entry, canSeeFinancials } };
  } catch (e) {
    return fail(e);
  }
}
