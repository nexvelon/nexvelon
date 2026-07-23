"use server";

// PROJ2-11 — job/project task server actions. GATE: reads at projects:view,
// mutations at projects:edit — tasks are project data, the same rationale
// SUB-6's assignment actions use (and a task can be assigned to an in-house
// tech, which has nothing to do with the subcontractors resource).

import { revalidatePath } from "next/cache";
import {
  listTasksForJob,
  listTasksForProject,
  getTaskById,
  createTask,
  updateTask,
  setTaskStatus,
  reorderTasks,
  deleteTask,
  getTaskAssigneeOptions,
  type TaskRow,
  type CreateTaskInput,
  type UpdateTaskPatch,
  type TaskAssigneeOptions,
} from "@/lib/api/job-tasks";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbRole, DbTaskStatus } from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return { ok: false, error: message };
}

// DbRole (11) → app Role (7); mirrors the rollup/assignment action helpers.
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

function revalidateTask(projectId: string, jobId?: string | null): void {
  revalidatePath(`/projects/${projectId}`);
  if (jobId) revalidatePath(`/projects/${projectId}/jobs/${jobId}`);
}

// ─── Reads (projects:view) ───────────────────────────────────────────────────

export async function listTasksForJobAction(
  jobId: string
): Promise<ActionResult<TaskRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    if (!jobId) return { ok: true, data: [] };
    return { ok: true, data: await listTasksForJob(jobId) };
  } catch (e) {
    return fail(e);
  }
}

export async function listTasksForProjectAction(
  projectId: string,
  opts: { includeJobTasks?: boolean } = {}
): Promise<ActionResult<TaskRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    if (!projectId) return { ok: true, data: [] };
    return { ok: true, data: await listTasksForProject(projectId, opts) };
  } catch (e) {
    return fail(e);
  }
}

export async function getTaskByIdAction(
  id: string
): Promise<ActionResult<TaskRow | null>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getTaskById(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function getTaskAssigneeOptionsAction(): Promise<
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

// ─── Mutations (projects:edit) ───────────────────────────────────────────────

export async function createTaskAction(
  input: Omit<CreateTaskInput, "actorId">
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await createTask({ ...input, actorId: gate.actorId });
    revalidateTask(input.projectId, input.jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTaskAction(
  id: string,
  projectId: string,
  patch: UpdateTaskPatch,
  jobId?: string | null
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await updateTask(id, patch, gate.actorId);
    revalidateTask(projectId, jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setTaskStatusAction(
  id: string,
  projectId: string,
  status: DbTaskStatus,
  jobId?: string | null
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await setTaskStatus({ id, status, actorId: gate.actorId });
    revalidateTask(projectId, jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function reorderTasksAction(
  orderedIds: string[],
  status: DbTaskStatus,
  projectId: string,
  jobId?: string | null
): Promise<ActionResult<{ written: number }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const written = await reorderTasks({ orderedIds, status, actorId: gate.actorId });
    revalidateTask(projectId, jobId);
    return { ok: true, data: { written } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTaskAction(
  id: string,
  projectId: string,
  jobId?: string | null
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const removed = await deleteTask(id);
    revalidateTask(projectId, jobId);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}
