"use server";

// PROJ2-14/19 — warranty + bond server actions. Reads gate projects:view,
// mutations projects:edit (matching the other project surfaces). Bond
// coverage/premium amounts sit at projects:view: they're commercially sensitive
// but NOT cost/margin (which is the financials:edit line) — a PM viewing their
// own project's bond coverage is normal, and gating it behind financials would
// hide it from the people who manage bonds. Reported in the PR.

import { revalidatePath } from "next/cache";
import {
  listWarrantiesForProject,
  listWarrantiesForJob,
  getWarrantyStatusForProject,
  getExpiringWarranties,
  createWarranty,
  updateWarranty,
  recordHandover,
  deleteWarranty,
  type WarrantyRow,
  type WarrantyStatusRollup,
  type WarrantyAlert,
  type CreateWarrantyInput,
  type UpdateWarrantyPatch,
} from "@/lib/api/warranties";
import {
  listBondsForProject,
  getBondAlerts,
  createBond,
  updateBond,
  setBondStatus,
  deleteBond,
  type BondRow,
  type BondAlert,
  type CreateBondInput,
  type UpdateBondPatch,
} from "@/lib/api/project-bonds";
import { deleteAttachment } from "@/app/(app)/attachments/actions";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbBondStatus, DbRole } from "@/lib/types/database";

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
  action: Action
): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!hasPermission(adaptRole(me.role), "projects", action)) {
    return { ok: false, error: "You don't have permission to manage this project." };
  }
  return { ok: true, actorId: me.id };
}

function rp(projectId: string, jobId?: string | null): void {
  revalidatePath(`/projects/${projectId}`);
  if (jobId) revalidatePath(`/projects/${projectId}/jobs/${jobId}`);
}

// ─── Warranty reads ──────────────────────────────────────────────────────────

export async function listWarrantiesForProjectAction(
  projectId: string
): Promise<ActionResult<WarrantyRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listWarrantiesForProject(projectId) };
  } catch (e) {
    return fail(e);
  }
}

export async function listWarrantiesForJobAction(
  jobId: string
): Promise<ActionResult<WarrantyRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listWarrantiesForJob(jobId) };
  } catch (e) {
    return fail(e);
  }
}

export async function getWarrantyStatusForProjectAction(
  projectId: string
): Promise<ActionResult<WarrantyStatusRollup>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getWarrantyStatusForProject(projectId) };
  } catch (e) {
    return fail(e);
  }
}

// ─── Warranty mutations ──────────────────────────────────────────────────────

export async function createWarrantyAction(
  input: Omit<CreateWarrantyInput, "actorId">
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await createWarranty({ ...input, actorId: gate.actorId });
    rp(input.projectId, input.jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateWarrantyAction(
  id: string,
  projectId: string,
  patch: UpdateWarrantyPatch,
  jobId?: string | null
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await updateWarranty(id, patch, gate.actorId);
    rp(projectId, jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function recordHandoverAction(
  warrantyId: string,
  projectId: string,
  input: { handoverDate: string; signedBy?: string | null; notes?: string | null }
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await recordHandover({ warrantyId, ...input, actorId: gate.actorId });
    rp(projectId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteWarrantyAction(
  id: string,
  projectId: string,
  jobId?: string | null
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const removed = await deleteWarranty(id);
    rp(projectId, jobId);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Bond reads ──────────────────────────────────────────────────────────────

export async function listBondsForProjectAction(
  projectId: string
): Promise<ActionResult<BondRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listBondsForProject(projectId) };
  } catch (e) {
    return fail(e);
  }
}

/** Cross-project bond + warranty risk panel (7d/7e). */
export async function getComplianceAlertsAction(): Promise<
  ActionResult<{ bonds: BondAlert[]; warranties: WarrantyAlert[] }>
> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    const [bonds, warranties] = await Promise.all([getBondAlerts(), getExpiringWarranties()]);
    return { ok: true, data: { bonds, warranties } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Bond mutations ──────────────────────────────────────────────────────────

export async function createBondAction(
  input: Omit<CreateBondInput, "actorId">
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await createBond({ ...input, actorId: gate.actorId });
    rp(input.projectId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateBondAction(
  id: string,
  projectId: string,
  patch: UpdateBondPatch
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await updateBond(id, patch, gate.actorId);
    rp(projectId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setBondStatusAction(
  id: string,
  projectId: string,
  status: DbBondStatus
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await setBondStatus(id, status, gate.actorId);
    rp(projectId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBondAction(
  id: string,
  projectId: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const { removed, attachmentId } = await deleteBond(id);
    // Clean up the certificate blob (best-effort — never blocks the delete).
    if (attachmentId) {
      const res = await deleteAttachment(attachmentId);
      if (!res.ok) {
        console.error(`[bonds] bond ${id} deleted but attachment ${attachmentId} cleanup failed: ${res.error}`);
      }
    }
    rp(projectId);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}
