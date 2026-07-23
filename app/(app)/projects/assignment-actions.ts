"use server";

// SUB-6 — job-assignment server actions. GATE CHOICE: assignments are project
// data (who is on this job/project) and will extend to in-house techs in
// PROJ2-15, which is pure project staffing — NOT a subcontractor concern. So
// reads gate projects:view and mutations gate projects:edit, matching the
// project cost-rollup actions. (subcontractors:* would be the wrong gate: a PM
// staffing their own job shouldn't need subcontractor-admin rights, and a tech
// assignment has nothing to do with the subcontractor resource at all.)
//
// The compliance hard-block is enforced in the API (createAssignment); the
// eligibility action here only powers the UI's disable-and-explain.

import { revalidatePath } from "next/cache";
import {
  listAssignmentsForJob,
  listAssignmentsForProject,
  listAssignmentsForSubcontractor,
  createAssignment,
  updateAssignment,
  setAssignmentStatus,
  deleteAssignment,
  type AssignmentRow,
  type CreateAssignmentInput,
  type UpdateAssignmentPatch,
} from "@/lib/api/job-assignments";
import { listSubcontractors } from "@/lib/api/subcontractors";
import { listComplianceDocs } from "@/lib/api/subcontractor-compliance";
import { getSubcontractorById } from "@/lib/api/subcontractors";
import { listAgreements } from "@/lib/api/sub-agreements";
import { canAssignSubcontractor, type EligibilityResult } from "@/lib/subcontractors/eligibility";
import { businessDateISO } from "@/lib/format";
import { getCurrentProfile } from "@/lib/auth/profile";
import { hasPermission, type Action } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import type { DbAssignmentStatus, DbRole } from "@/lib/types/database";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown): { ok: false; error: string } {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return { ok: false, error: message };
}

// DbRole (11) → app Role (7); mirrors the rollup/invoices action helpers.
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

// ─── Reads (projects:view) ───────────────────────────────────────────────────

export async function listAssignmentsForJobAction(
  jobId: string
): Promise<ActionResult<AssignmentRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listAssignmentsForJob(jobId) };
  } catch (e) {
    return fail(e);
  }
}

export async function listAssignmentsForProjectAction(
  projectId: string
): Promise<ActionResult<AssignmentRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listAssignmentsForProject(projectId) };
  } catch (e) {
    return fail(e);
  }
}

export async function listAssignmentsForSubcontractorAction(
  subcontractorId: string
): Promise<ActionResult<AssignmentRow[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    return { ok: true, data: await listAssignmentsForSubcontractor(subcontractorId) };
  } catch (e) {
    return fail(e);
  }
}

/** Active subcontractors for the assign dialog's picker. */
export async function listActiveSubcontractorOptionsAction(): Promise<
  ActionResult<{ id: string; name: string; email: string | null }[]>
> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    const subs = await listSubcontractors({ status: "active" });
    return {
      ok: true,
      data: subs.map((s) => ({ id: s.id, name: s.name, email: s.email })),
    };
  } catch (e) {
    return fail(e);
  }
}

/** Issued/active work orders for a sub on a job, to optionally link an assignment. */
export async function listLinkableWorkOrdersAction(
  jobId: string,
  subcontractorId: string
): Promise<ActionResult<{ id: string; agreement_number: string; title: string }[]>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    if (!jobId || !subcontractorId) return { ok: true, data: [] };
    const rows = await listAgreements({ jobId, subcontractorId });
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        agreement_number: r.agreement_number,
        title: r.title,
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

/** The assignment eligibility verdict — powers the UI's disable-and-explain. */
export async function getAssignmentEligibilityAction(
  subcontractorId: string
): Promise<ActionResult<EligibilityResult>> {
  try {
    const gate = await require("view");
    if (!gate.ok) return gate;
    const sub = await getSubcontractorById(subcontractorId);
    if (!sub) return { ok: false, error: "Subcontractor not found." };
    const docs = await listComplianceDocs(subcontractorId);
    const verdict = canAssignSubcontractor(
      { status: sub.status },
      docs.map((d) => ({ doc_type: d.doc_type, expiry_date: d.expiry_date })),
      businessDateISO()
    );
    return { ok: true, data: verdict };
  } catch (e) {
    return fail(e);
  }
}

// ─── Mutations (projects:edit) ───────────────────────────────────────────────

export async function createAssignmentAction(
  input: Omit<CreateAssignmentInput, "actorId">
): Promise<
  | { ok: true; data: { id: string } }
  | { ok: false; error: string; reasons?: string[] }
> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const res = await createAssignment({ ...input, actorId: gate.actorId });
    if (!res.ok) {
      return { ok: false, error: "compliance_block", reasons: res.reasons };
    }
    revalidatePath(`/projects/${input.projectId}`);
    if (input.subcontractorId) revalidatePath(`/subcontractors/${input.subcontractorId}`);
    return { ok: true, data: { id: res.assignment.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateAssignmentAction(
  id: string,
  projectId: string,
  patch: UpdateAssignmentPatch
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await updateAssignment(id, patch, gate.actorId);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setAssignmentStatusAction(
  id: string,
  projectId: string,
  status: DbAssignmentStatus,
  subcontractorId?: string | null
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const row = await setAssignmentStatus({ id, status, actorId: gate.actorId });
    revalidatePath(`/projects/${projectId}`);
    if (subcontractorId) revalidatePath(`/subcontractors/${subcontractorId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteAssignmentAction(
  id: string,
  projectId: string,
  subcontractorId?: string | null
): Promise<ActionResult<{ removed: boolean }>> {
  try {
    const gate = await require("edit");
    if (!gate.ok) return gate;
    const removed = await deleteAssignment(id);
    revalidatePath(`/projects/${projectId}`);
    if (subcontractorId) revalidatePath(`/subcontractors/${subcontractorId}`);
    return { ok: true, data: { removed } };
  } catch (e) {
    return fail(e);
  }
}
