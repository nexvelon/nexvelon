"use server";

// PROJ2-13 — commissioning server actions. Reads gate projects:view, mutations
// projects:edit. The sign-off's compliance-style block (items_pending) and the
// best-effort PDF live in the API; these actions surface the results.

import { revalidatePath } from "next/cache";
import {
  listRunsForJob,
  getRunById,
  createRun,
  cancelRun,
  addItem,
  setItemResult,
  reorderItems,
  deleteItem,
  raiseDeficiencyFromItem,
  signOffRun,
  getCommissioningPdfUrl,
  type CommissioningRunRow,
  type CommissioningRunDetail,
  type AddItemInput,
} from "@/lib/api/commissioning";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbCommissioningItemResult, DbRole } from "@/lib/types/database";

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

function revalidate(projectId: string, jobId: string): void {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/jobs/${jobId}`);
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listRunsForJobAction(
  jobId: string
): Promise<ActionResult<CommissioningRunRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listRunsForJob(jobId) };
  } catch (e) {
    return fail(e);
  }
}

export async function getRunByIdAction(
  id: string
): Promise<ActionResult<CommissioningRunDetail | null>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getRunById(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function getCommissioningPdfUrlAction(
  runId: string
): Promise<ActionResult<{ url: string | null }>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: { url: await getCommissioningPdfUrl(runId) } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createRunAction(input: {
  projectId: string;
  jobId: string;
  title?: string;
  performedBy?: string | null;
  performedAt?: string | null;
  duplicateFromRunId?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const run = await createRun({ ...input, actorId: gate.actorId });
    revalidate(input.projectId, input.jobId);
    return { ok: true, data: { id: run.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelRunAction(
  id: string,
  projectId: string,
  jobId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const run = await cancelRun(id, gate.actorId);
    revalidate(projectId, jobId);
    return { ok: true, data: { id: run.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function addItemAction(
  input: AddItemInput,
  projectId: string,
  jobId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const item = await addItem(input);
    revalidate(projectId, jobId);
    return { ok: true, data: { id: item.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setItemResultAction(
  id: string,
  result: DbCommissioningItemResult,
  projectId: string,
  jobId: string,
  actualNote?: string | null
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const item = await setItemResult(id, result, actualNote);
    revalidate(projectId, jobId);
    return { ok: true, data: { id: item.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function reorderItemsAction(
  orderedIds: string[],
  projectId: string,
  jobId: string
): Promise<ActionResult<{ written: number }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const written = await reorderItems(orderedIds);
    revalidate(projectId, jobId);
    return { ok: true, data: { written } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteItemAction(
  id: string,
  projectId: string,
  jobId: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const removed = await deleteItem(id);
    revalidate(projectId, jobId);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}

export async function raiseDeficiencyFromItemAction(
  itemId: string,
  projectId: string,
  jobId: string
): Promise<ActionResult<{ deficiencyId: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const res = await raiseDeficiencyFromItem({ itemId, actorId: gate.actorId });
    revalidate(projectId, jobId);
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

export async function signOffRunAction(
  input: {
    runId: string;
    signerName: string;
    signerTitle?: string | null;
    signatureData: string;
    witnessedBy?: string | null;
  },
  projectId: string,
  jobId: string
): Promise<
  | { ok: true; data: { id: string; pdfUrl: string | null }; warning?: string }
  | { ok: false; error: string; pendingCount?: number }
> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const res = await signOffRun({ ...input, actorId: gate.actorId });
    if (!res.ok) {
      return "pendingCount" in res
        ? { ok: false, error: "items_pending", pendingCount: res.pendingCount }
        : { ok: false, error: res.error };
    }
    revalidate(projectId, jobId);
    const url = await getCommissioningPdfUrl(input.runId);
    return { ok: true, data: { id: res.run.id, pdfUrl: url }, warning: res.warning };
  } catch (e) {
    return fail(e);
  }
}
