"use server";
import { adaptDbRole as adaptRole } from "@/lib/permissions/resolve";

// PROJ2-20 — schedule server actions. Reads gate projects:view; mutations
// projects:edit. Revalidate the project + job paths. Cycle/duplicate/cross-
// project rejection lives in the API (addDependency).

import { revalidatePath } from "next/cache";
import {
  setJobPlannedDates,
  listMilestones,
  createMilestone,
  updateMilestone,
  setMilestoneStatus,
  deleteMilestone,
  addDependency,
  removeDependency,
  getProjectSchedule,
  type CreateMilestoneInput,
  type ProjectSchedule,
} from "@/lib/api/schedule";
import {
  getProjectGantt,
  addTaskDependency,
  removeTaskDependency,
  captureBaseline,
  listBaselines,
  getBaselineTasks,
  type ProjectGantt,
} from "@/lib/api/gantt";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
import type {
  DbMilestoneStatus,
  DbScheduleMilestone,
  DbScheduleBaseline,
  DbScheduleBaselineTask,
  DbDependencyType,
} from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return { ok: false, error: message };
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

export async function getProjectScheduleAction(
  projectId: string
): Promise<ActionResult<ProjectSchedule>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getProjectSchedule(projectId) };
  } catch (e) {
    return fail(e);
  }
}

export async function listMilestonesAction(scope: {
  projectId?: string;
  jobId?: string;
}): Promise<ActionResult<DbScheduleMilestone[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listMilestones(scope) };
  } catch (e) {
    return fail(e);
  }
}

// UIDG-11 — the FULL Gantt read (tasks/deps/baselines). Gated projects:view, so a
// user who cannot view projects cannot read the schedule. The existing
// getProjectScheduleAction (ProjectScheduleCard) is untouched.
export async function getProjectGanttAction(
  projectId: string
): Promise<ActionResult<ProjectGantt>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getProjectGantt(projectId) };
  } catch (e) {
    return fail(e);
  }
}

export async function listBaselinesAction(
  projectId: string
): Promise<ActionResult<DbScheduleBaseline[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listBaselines(projectId) };
  } catch (e) {
    return fail(e);
  }
}

export async function getBaselineTasksAction(
  baselineId: string
): Promise<ActionResult<DbScheduleBaselineTask[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getBaselineTasks(baselineId) };
  } catch (e) {
    return fail(e);
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export async function setJobPlannedDatesAction(
  jobId: string,
  projectId: string,
  plannedStart: string | null,
  plannedEnd: string | null
): Promise<ActionResult<{ jobId: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    await setJobPlannedDates({ jobId, plannedStart, plannedEnd, actorId: gate.actorId });
    rp(projectId, jobId);
    return { ok: true, data: { jobId } };
  } catch (e) {
    return fail(e);
  }
}

export async function createMilestoneAction(
  input: Omit<CreateMilestoneInput, "actorId">
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await createMilestone({ ...input, actorId: gate.actorId });
    rp(input.projectId, input.jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMilestoneAction(
  id: string,
  projectId: string,
  patch: { title?: string; targetDate?: string; notes?: string | null }
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await updateMilestone(id, patch, gate.actorId);
    rp(projectId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setMilestoneStatusAction(
  id: string,
  projectId: string,
  status: DbMilestoneStatus
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await setMilestoneStatus(id, status, gate.actorId);
    rp(projectId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMilestoneAction(
  id: string,
  projectId: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const removed = await deleteMilestone(id);
    rp(projectId);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}

export async function addDependencyAction(
  jobId: string,
  dependsOnJobId: string,
  projectId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await addDependency({ jobId, dependsOnJobId, actorId: gate.actorId });
    rp(projectId, jobId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function removeDependencyAction(
  id: string,
  projectId: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const removed = await removeDependency(id);
    rp(projectId);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}

// ─── UIDG-11 — task dependencies + baselines (mutations gate projects:edit) ────

export async function addTaskDependencyAction(
  input: {
    taskId: string;
    dependsOnTaskId: string;
    dependencyType?: DbDependencyType;
    lagDays?: number;
  },
  projectId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await addTaskDependency({ ...input, actorId: gate.actorId });
    rp(projectId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function removeTaskDependencyAction(
  id: string,
  projectId: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const removed = await removeTaskDependency(id);
    rp(projectId);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}

export async function captureBaselineAction(
  input: { projectId: string; name: string; notes?: string | null }
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await captureBaseline({ ...input, actorId: gate.actorId });
    rp(input.projectId);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}
