"use server";

// PROJ2-17 + PROJ2-21 — cost-code + margin-snapshot server actions.
//
// GATING:
//   • Cost-code TAXONOMY reads (listCostCodes) — projects:view. The code list is
//     needed by the line-item editor, which every project viewer can see.
//   • Cost-code MUTATIONS (create/edit/activate/delete) — financials:edit. Codes
//     shape cost analysis; managing the taxonomy is a finance-admin action.
//   • The cost BREAKDOWN and margin SNAPSHOTS expose actual cost/margin, so they
//     gate financials:edit — the same tier as the rollup's cost legs.
//   • Taking / deleting a snapshot is a financials:edit mutation.

import { revalidatePath } from "next/cache";
import {
  listCostCodes,
  createCostCode,
  updateCostCode,
  setCostCodeActive,
  deleteCostCode,
  getCostBreakdownByCode,
  type CostCodeBreakdown,
} from "@/lib/api/cost-codes";
import {
  takeSnapshot,
  listSnapshots,
  getSnapshotTrend,
  deleteSnapshot,
  type SnapshotTrendPoint,
} from "@/lib/api/margin-snapshots";
import {
  getJobConsumptionReconciliation,
  type JobConsumptionReconciliation,
} from "@/lib/api/consumption-recon";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action, type Resource } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbCostCategory, DbCostCode, DbMarginSnapshot, DbRole } from "@/lib/types/database";

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

async function require(
  resource: Resource,
  action: Action
): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!hasPermission(adaptRole(me.role), resource, action)) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  return { ok: true, actorId: me.id };
}

// ─── Cost codes ──────────────────────────────────────────────────────────────

export async function listCostCodesAction(
  opts: { activeOnly?: boolean } = {}
): Promise<ActionResult<DbCostCode[]>> {
  try {
    const gate = await require("projects", "view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listCostCodes(opts) };
  } catch (e) {
    return fail(e);
  }
}

export async function createCostCodeAction(input: {
  code: string;
  name: string;
  category: DbCostCategory;
  sortOrder?: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("financials", "edit");
    if (!gate.ok) return gate;
    const row = await createCostCode(input);
    revalidatePath("/financials");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCostCodeAction(
  id: string,
  patch: { name?: string; category?: DbCostCategory; sortOrder?: number }
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("financials", "edit");
    if (!gate.ok) return gate;
    const row = await updateCostCode(id, patch);
    revalidatePath("/financials");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setCostCodeActiveAction(
  id: string,
  isActive: boolean
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("financials", "edit");
    if (!gate.ok) return gate;
    const row = await setCostCodeActive(id, isActive);
    revalidatePath("/financials");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCostCodeAction(
  id: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("financials", "edit");
    if (!gate.ok) return gate;
    const removed = await deleteCostCode(id);
    revalidatePath("/financials");
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}

/** Estimate-vs-actual by code — actual cost, so financials:edit (rollup tier). */
export async function getCostBreakdownByCodeAction(scope: {
  jobId?: string;
  projectId?: string;
}): Promise<ActionResult<CostCodeBreakdown>> {
  try {
    const gate = await require("financials", "edit");
    if (!gate.ok) return gate;
    return { ok: true, data: await getCostBreakdownByCode(scope) };
  } catch (e) {
    return fail(e);
  }
}

// ─── Consumption reconciliation (INV-9-2) ────────────────────────────────────

/** Planned vs actual material draw for a job — cost variance, financials:edit. */
export async function getJobConsumptionReconciliationAction(
  jobId: string
): Promise<ActionResult<JobConsumptionReconciliation>> {
  try {
    const gate = await require("financials", "edit");
    if (!gate.ok) return gate;
    return { ok: true, data: await getJobConsumptionReconciliation(jobId) };
  } catch (e) {
    return fail(e);
  }
}

// ─── Margin snapshots ────────────────────────────────────────────────────────

export async function takeSnapshotAction(input: {
  projectId: string;
  jobId?: string | null;
  reason?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("financials", "edit");
    if (!gate.ok) return gate;
    const row = await takeSnapshot({ ...input, actorId: gate.actorId });
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function listSnapshotsAction(scope: {
  jobId?: string;
  projectId?: string;
}): Promise<ActionResult<DbMarginSnapshot[]>> {
  try {
    const gate = await require("financials", "edit");
    if (!gate.ok) return gate;
    return { ok: true, data: await listSnapshots(scope) };
  } catch (e) {
    return fail(e);
  }
}

export async function getSnapshotTrendAction(scope: {
  jobId?: string;
  projectId?: string;
}): Promise<ActionResult<SnapshotTrendPoint[]>> {
  try {
    const gate = await require("financials", "edit");
    if (!gate.ok) return gate;
    return { ok: true, data: await getSnapshotTrend(scope) };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSnapshotAction(
  id: string,
  projectId: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("financials", "edit");
    if (!gate.ok) return gate;
    const removed = await deleteSnapshot(id);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}
