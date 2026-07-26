"use server";
import { adaptDbRole as adaptRole } from "@/lib/permissions/resolve";

// SCHED-1 — scheduling server actions. Gate on the existing 'scheduling'
// resource: reads → scheduling:view, mutations → scheduling:edit (Dispatcher
// maps to ProjectManager, which carries scheduling create/edit; Technician has
// scheduling:view only). Technician certifications ride the SAME scheduling gate
// (a Dispatcher manages the certs they book against) rather than the admin-only
// settings gate — reported in the PR.
//
// Best-effort activity logging (§2.8): a schedule_job with a project logs against
// 'project' (no scheduling entity_type exists yet). The dedicated append-only
// schedule change log is SCHED-4 territory.

import { revalidatePath } from "next/cache";
import {
  listTechCertifications,
  getCertsByTech,
  createTechCertification,
  updateTechCertification,
  deleteTechCertification,
  type UpdateTechCertPatch,
} from "@/lib/api/tech-certifications";
import {
  listScheduleJobs,
  getScheduleJobById,
  createScheduleJob,
  createScheduleJobFromProjectJob,
  updateScheduleJob,
  setScheduleJobStatus,
  deleteScheduleJob,
  type ListScheduleJobsFilter,
  type CreateScheduleJobInput,
  type UpdateScheduleJobPatch,
} from "@/lib/api/schedule-jobs";
import {
  createBooking,
  moveBooking,
  cancelBooking,
  completeBooking,
  type BookingResult,
} from "@/lib/api/schedule-assignments";
import { getDispatchBoard, type DispatchBoard } from "@/lib/api/dispatch-board";
import {
  convertBookingToLabour,
  unconvertBooking,
  type ConvertResult,
} from "@/lib/api/schedule-cost";
import {
  listScheduleAudit,
  type ListScheduleAuditFilter,
} from "@/lib/api/schedule-audit";
import {
  getWorkingHours,
  setWorkingHours,
  listAbsences,
  requestAbsence,
  setAbsenceStatus,
  type ListAbsencesFilter,
  type WorkingHoursInput,
} from "@/lib/api/tech-availability";
import { listTechs } from "@/lib/api/techs";
import { logActivity } from "@/lib/api/activity-log";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action, type Resource } from "@/lib/permissions";
import type {
  DbAbsenceStatus,
  DbAbsenceType,
  DbScheduleAudit,
  DbScheduleJob,
  DbScheduleJobStatus,
  DbTech,
  DbTechAbsence,
  DbTechCertification,
  DbTechWorkingHours,
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
  action: Action,
  resource: Resource = "scheduling"
): Promise<{ ok: true; actorId: string } | { ok: false; error: string }> {
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: "You're not signed in." };
  if (!hasPermission(adaptRole(me.role), resource, action)) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  return { ok: true, actorId: me.id };
}

// ─── Tech certifications ──────────────────────────────────────────────────────

export async function listTechCertificationsAction(
  techId: string
): Promise<ActionResult<DbTechCertification[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listTechCertifications(techId) };
  } catch (e) {
    return fail(e);
  }
}

export async function getCertsByTechAction(
  techIds: string[]
): Promise<ActionResult<Record<string, DbTechCertification[]>>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getCertsByTech(techIds) };
  } catch (e) {
    return fail(e);
  }
}

export async function createTechCertificationAction(input: {
  techId: string;
  certType: string;
  certName?: string | null;
  issuer?: string | null;
  referenceNumber?: string | null;
  issuedDate?: string | null;
  expiryDate?: string | null;
  attachmentId?: string | null;
  notes?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await createTechCertification({ ...input, actorId: gate.actorId });
    revalidatePath("/settings");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTechCertificationAction(
  id: string,
  patch: UpdateTechCertPatch
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    await updateTechCertification({ id, patch, actorId: gate.actorId });
    revalidatePath("/settings");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTechCertificationAction(
  id: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    return { ok: true, data: { removed: await deleteTechCertification(id) } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Tech availability: working hours + absences (SCHED-3) ────────────────────

export async function getWorkingHoursAction(
  techId: string
): Promise<ActionResult<DbTechWorkingHours[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getWorkingHours(techId) };
  } catch (e) {
    return fail(e);
  }
}

export async function setWorkingHoursAction(
  techId: string,
  rows: WorkingHoursInput[]
): Promise<ActionResult<{ ok: true }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    await setWorkingHours(techId, rows);
    revalidatePath("/settings");
    revalidatePath("/scheduling");
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return fail(e);
  }
}

export async function listAbsencesAction(
  filter: ListAbsencesFilter = {}
): Promise<ActionResult<DbTechAbsence[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listAbsences(filter) };
  } catch (e) {
    return fail(e);
  }
}

export async function requestAbsenceAction(input: {
  techId: string;
  type?: DbAbsenceType;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await requestAbsence({ ...input, actorId: gate.actorId });
    revalidatePath("/scheduling");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

// Approve / deny / cancel — gated scheduling:edit (dispatcher/admin). A tighter
// "approvals-only" gate isn't warranted for a solo-operator context; reported.
export async function setAbsenceStatusAction(
  id: string,
  status: DbAbsenceStatus
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    await setAbsenceStatus({ id, status, actorId: gate.actorId });
    revalidatePath("/scheduling");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Schedule jobs (the dispatchable backlog) ─────────────────────────────────

export async function listScheduleJobsAction(
  filter: ListScheduleJobsFilter = {}
): Promise<ActionResult<DbScheduleJob[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listScheduleJobs(filter) };
  } catch (e) {
    return fail(e);
  }
}

export async function createScheduleJobAction(
  input: Omit<CreateScheduleJobInput, "actorId">
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await createScheduleJob({ ...input, actorId: gate.actorId });
    if (row.project_id) {
      try {
        // No scheduling entity_type exists yet; log against the project (§2.8,
        // best-effort). The dedicated append-only schedule change log is SCHED-4.
        await logActivity("project", row.project_id, "update", {});
      } catch {
        /* best-effort */
      }
    }
    revalidatePath("/scheduling");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function createScheduleJobFromProjectJobAction(input: {
  projectJobId: string;
  requiredCerts?: string[];
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await createScheduleJobFromProjectJob({ ...input, actorId: gate.actorId });
    revalidatePath("/scheduling");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateScheduleJobAction(
  id: string,
  patch: UpdateScheduleJobPatch
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    await updateScheduleJob({ id, patch, actorId: gate.actorId });
    revalidatePath("/scheduling");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setScheduleJobStatusAction(
  id: string,
  status: DbScheduleJobStatus
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    await setScheduleJobStatus(id, status, gate.actorId);
    revalidatePath("/scheduling");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteScheduleJobAction(
  id: string
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    return { ok: true, data: { removed: await deleteScheduleJob(id) } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Bookings (the guarded write path) ────────────────────────────────────────

export async function createBookingAction(input: {
  scheduleJobId: string;
  techId: string;
  startsAt: string;
  endsAt: string;
  status?: "tentative" | "confirmed";
  notes?: string | null;
}): Promise<ActionResult<BookingResult>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const result = await createBooking({ ...input, actorId: gate.actorId });
    revalidatePath("/scheduling");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function moveBookingAction(input: {
  id: string;
  startsAt: string;
  endsAt: string;
  techId?: string;
}): Promise<ActionResult<BookingResult>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const result = await moveBooking({ ...input, actorId: gate.actorId });
    revalidatePath("/scheduling");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelBookingAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    await cancelBooking({ id, actorId: gate.actorId });
    revalidatePath("/scheduling");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function completeBookingAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    await completeBooking({ id, actorId: gate.actorId });
    revalidatePath("/scheduling");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ─── Board + pickers ──────────────────────────────────────────────────────────

export async function getDispatchBoardAction(window: {
  from: string;
  to: string;
}): Promise<ActionResult<DispatchBoard>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getDispatchBoard(window) };
  } catch (e) {
    return fail(e);
  }
}

// ─── The cost seam + audit trail (SCHED-4) ────────────────────────────────────

// Convert a COMPLETED booking into a labour cost entry — gated financials:edit
// because it CREATES cost (not merely a scheduling action). Returns the typed
// ConvertResult so the UI surfaces not_completed / already_converted /
// no_cost_center honestly.
export async function convertBookingToLabourAction(input: {
  assignmentId: string;
  hours?: number;
}): Promise<ActionResult<ConvertResult>> {
  try {
    const gate = await require("edit", "financials");
    if (!gate.ok) return gate;
    const result = await convertBookingToLabour({ ...input, actorId: gate.actorId });
    revalidatePath("/scheduling");
    return { ok: true, data: result };
  } catch (e) {
    return fail(e);
  }
}

export async function unconvertBookingAction(
  assignmentId: string
): Promise<ActionResult<{ ok: true }>> {
  try {
    const gate = await require("edit", "financials");
    if (!gate.ok) return gate;
    const res = await unconvertBooking({ assignmentId, actorId: gate.actorId });
    if (!res.ok) return { ok: false, error: res.error };
    revalidatePath("/scheduling");
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return fail(e);
  }
}

export async function listScheduleAuditAction(
  filter: ListScheduleAuditFilter
): Promise<ActionResult<DbScheduleAudit[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listScheduleAudit(filter) };
  } catch (e) {
    return fail(e);
  }
}

export async function listSchedulingTechsAction(): Promise<ActionResult<DbTech[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listTechs() };
  } catch (e) {
    return fail(e);
  }
}

export async function getScheduleJobAction(
  id: string
): Promise<ActionResult<DbScheduleJob | null>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await getScheduleJobById(id) };
  } catch (e) {
    return fail(e);
  }
}
