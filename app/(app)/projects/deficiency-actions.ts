"use server";

// PROJ2-12 — deficiency server actions. Reads gate projects:view, mutations
// projects:edit (same rationale as PROJ2-11 tasks — deficiencies are project
// data). Also exposes the assignee options (shared with tasks) and the
// project-level open/safety counts for the summary card + the 6d status warning.

import { revalidatePath } from "next/cache";
import {
  listDeficienciesForJob,
  listDeficienciesForProject,
  getDeficiencyById,
  createDeficiency,
  updateDeficiency,
  setDeficiencyStatus,
  reorderDeficiencies,
  deleteDeficiency,
  type DeficiencyRow,
  type CreateDeficiencyInput,
  type UpdateDeficiencyPatch,
} from "@/lib/api/job-deficiencies";
import { getTaskAssigneeOptions, type TaskAssigneeOptions } from "@/lib/api/job-tasks";
import { summarizeDeficiencies, type DeficiencyCounts } from "@/lib/deficiencies/deficiency-status";
import { businessDateISO } from "@/lib/format";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbDeficiencyStatus, DbRole } from "@/lib/types/database";

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

function revalidate(projectId: string, jobId?: string | null): void {
  revalidatePath(`/projects/${projectId}`);
  if (jobId) revalidatePath(`/projects/${projectId}/jobs/${jobId}`);
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listDeficienciesForJobAction(
  jobId: string
): Promise<ActionResult<DeficiencyRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listDeficienciesForJob(jobId) };
  } catch (e) {
    return fail(e);
  }
}

export async function getDeficiencyByIdAction(
  id: string
): Promise<ActionResult<DeficiencyRow | null>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getDeficiencyById(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function getDeficiencyAssigneeOptionsAction(): Promise<
  ActionResult<TaskAssigneeOptions>
> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getTaskAssigneeOptions() };
  } catch (e) {
    return fail(e);
  }
}

/** Project-level deficiency counts — the summary card + the 6d status warning. */
export async function getProjectDeficiencyCountsAction(
  projectId: string
): Promise<ActionResult<DeficiencyCounts>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    const rows = await listDeficienciesForProject(projectId);
    return { ok: true, data: summarizeDeficiencies(rows, businessDateISO()) };
  } catch (e) {
    return fail(e);
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function createDeficiencyAction(
  input: Omit<CreateDeficiencyInput, "actorId">
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await createDeficiency({ ...input, actorId: gate.actorId });
    revalidate(input.projectId, input.jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateDeficiencyAction(
  id: string,
  projectId: string,
  jobId: string,
  patch: UpdateDeficiencyPatch
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await updateDeficiency(id, patch, gate.actorId);
    revalidate(projectId, jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setDeficiencyStatusAction(
  id: string,
  projectId: string,
  jobId: string,
  status: DbDeficiencyStatus
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await setDeficiencyStatus({ id, status, actorId: gate.actorId });
    revalidate(projectId, jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function reorderDeficienciesAction(
  orderedIds: string[],
  status: DbDeficiencyStatus,
  projectId: string,
  jobId: string
): Promise<ActionResult<{ written: number }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const written = await reorderDeficiencies({ orderedIds, status, actorId: gate.actorId });
    revalidate(projectId, jobId);
    return { ok: true, data: { written } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDeficiencyAction(
  id: string,
  projectId: string,
  jobId: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const removed = await deleteDeficiency(id);
    revalidate(projectId, jobId);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}
