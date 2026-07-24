"use server";

// PROJ2-16 — site-log server actions. Reads gate projects:view, mutations
// projects:edit. Photos upload through the shared signed-URL flow (no browser
// supabase-js). Revalidate the job + project paths.

import { revalidatePath } from "next/cache";
import {
  listLogsForJob,
  getLogById,
  getRecentLogsForProject,
  createLog,
  updateLog,
  submitLog,
  deleteLog,
  addCrew,
  updateCrew,
  removeCrew,
  SiteLogError,
  type SiteLogListRow,
  type SiteLogDetail,
  type CreateLogInput,
  type UpdateLogPatch,
  type AddCrewInput,
} from "@/lib/api/site-logs";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
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

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listLogsForJobAction(
  jobId: string
): Promise<ActionResult<SiteLogListRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listLogsForJob(jobId) };
  } catch (e) {
    return fail(e);
  }
}

export async function getLogByIdAction(
  id: string
): Promise<ActionResult<SiteLogDetail | null>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getLogById(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function getRecentLogsForProjectAction(
  projectId: string,
  days = 7
): Promise<ActionResult<SiteLogListRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getRecentLogsForProject(projectId, days) };
  } catch (e) {
    return fail(e);
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Create a day's log. If one already exists for (job, date), returns
 * log_exists + the existing id so the UI can OPEN that day instead of erroring.
 */
export async function createLogAction(
  input: Omit<CreateLogInput, "actorId">,
  projectId: string
): Promise<
  | { ok: true; data: { id: string } }
  | { ok: false; error: string; existingId?: string }
> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await createLog({ ...input, actorId: gate.actorId });
    rp(projectId, input.jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    if (e instanceof SiteLogError && e.code === "log_exists") {
      return { ok: false, error: "log_exists", existingId: e.existingId };
    }
    return fail(e);
  }
}

export async function updateLogAction(
  id: string,
  projectId: string,
  jobId: string,
  patch: UpdateLogPatch
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await updateLog(id, patch, gate.actorId);
    rp(projectId, jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function submitLogAction(
  id: string,
  projectId: string,
  jobId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await submitLog(id, gate.actorId);
    rp(projectId, jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLogAction(
  id: string,
  projectId: string,
  jobId: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const removed = await deleteLog(id);
    rp(projectId, jobId);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}

export async function addCrewAction(
  input: AddCrewInput,
  projectId: string,
  jobId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await addCrew(input);
    rp(projectId, jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCrewAction(
  id: string,
  projectId: string,
  jobId: string,
  patch: { hours?: number | null; notes?: string | null }
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await updateCrew(id, patch);
    rp(projectId, jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function removeCrewAction(
  id: string,
  projectId: string,
  jobId: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const removed = await removeCrew(id);
    rp(projectId, jobId);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}
