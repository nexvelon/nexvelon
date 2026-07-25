"use server";

// PROJ2-18 — WIP server actions.
//
// GATING + REDACTION: WIP exposes cost + earned-vs-billed, a cost-side
// management view — so full detail needs financials:edit (the rollup cost-leg
// tier). A financials:VIEW holder gets a REDACTED variant: the BILLING side
// (billed, remaining_to_bill, holdback) stays visible, but every COST-derived
// leg (estimated/actual cost, pct_complete, earned, over_under, remaining_cost)
// is nulled and the position reads 'indeterminate' — the same defense-in-depth
// as the project cost-rollup action (numbers never reach a non-cost client).
// `canSeeCost` lets the UI lay out accordingly.

import {
  getJobWip,
  getProjectWip,
  getWipPortfolio,
  buildWipCsv,
  type JobWip,
  type ProjectWip,
  type WipPortfolio,
} from "@/lib/api/wip";
import { businessDateISO } from "@/lib/format";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbRole } from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return { ok: false, error: message };
}

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

// projects:view to see WIP at all; financials:edit to see the cost side.
async function gate(): Promise<
  { ok: true; canSeeCost: boolean } | { ok: false; error: string }
> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  const role = adaptRole(me.role);
  if (!hasPermission(role, "projects", "view")) {
    return { ok: false, error: "You don't have permission to view this project." };
  }
  return { ok: true, canSeeCost: hasPermission(role, "financials", "edit") };
}

/** Null every cost-derived leg; keep the billing side. */
function redactJob(w: JobWip): JobWip {
  return {
    ...w,
    estimated_cost: null,
    actual_cost: null,
    pct_complete: null,
    earned: null,
    over_under: null,
    remaining_cost: null,
    position: "indeterminate",
  };
}

export interface JobWipResult {
  wip: JobWip | null;
  canSeeCost: boolean;
}

export async function getJobWipAction(jobId: string): Promise<ActionResult<JobWipResult>> {
  try {
    const g = await gate();
    if (!g.ok) return g;
    const wip = await getJobWip(jobId);
    return {
      ok: true,
      data: { wip: wip && !g.canSeeCost ? redactJob(wip) : wip, canSeeCost: g.canSeeCost },
    };
  } catch (e) {
    return fail(e);
  }
}

export interface ProjectWipResult {
  wip: ProjectWip;
  canSeeCost: boolean;
}

export async function getProjectWipAction(
  projectId: string
): Promise<ActionResult<ProjectWipResult>> {
  try {
    const g = await gate();
    if (!g.ok) return g;
    const wip = await getProjectWip(projectId);
    if (!g.canSeeCost) {
      wip.jobs = wip.jobs.map(redactJob);
      wip.rollup = {
        ...wip.rollup,
        estimated_cost: 0,
        actual_cost: 0,
        pct_complete: null,
        earned: 0,
        over_under: 0,
        position: "indeterminate",
      };
    }
    return { ok: true, data: { wip, canSeeCost: g.canSeeCost } };
  } catch (e) {
    return fail(e);
  }
}

/** The portfolio is a cost/earning dashboard — financials:edit outright. */
export async function getWipPortfolioAction(): Promise<ActionResult<WipPortfolio>> {
  try {
    const me = await getCurrentProfile();
    if (!me || !hasPermission(adaptRole(me.role), "financials", "edit")) {
      return { ok: false, error: "You don't have permission to view WIP." };
    }
    return { ok: true, data: await getWipPortfolio() };
  } catch (e) {
    return fail(e);
  }
}

export async function exportWipCsvAction(): Promise<
  ActionResult<{ csv: string; filename: string }>
> {
  try {
    const me = await getCurrentProfile();
    if (!me || !hasPermission(adaptRole(me.role), "financials", "edit")) {
      return { ok: false, error: "You don't have permission to export WIP." };
    }
    const portfolio = await getWipPortfolio();
    return {
      ok: true,
      data: { csv: buildWipCsv(portfolio), filename: `nexvelon-wip-${businessDateISO()}.csv` },
    };
  } catch (e) {
    return fail(e);
  }
}
