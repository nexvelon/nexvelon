import "server-only";

// SUB-6 — job assignments: who is on a job/project. An OPERATIONAL fact,
// distinct from SUB-5's work order (a commercial commitment). An assignment may
// optionally reference a work order (agreement_id). The assignee is one-of-N
// kinds (subcontractor XOR tech) so PROJ2-15 can add in-house techs without a
// rewrite.
//
// THE HARD BLOCK: creating an ACTIVE subcontractor assignment reuses SUB-5's
// eligibility (canAssignSubcontractor → single source of truth). It gates
// CREATION only — a doc lapsing mid-job flags the assignment as at-risk, it is
// never auto-removed.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { logActivity } from "@/lib/api/activity-log";
import { listComplianceDocs } from "@/lib/api/subcontractor-compliance";
import { getSubcontractorById } from "@/lib/api/subcontractors";
import { getJobById } from "@/lib/api/projects";
import { jobLabel } from "@/lib/api/sub-agreements";
import { canAssignSubcontractor } from "@/lib/subcontractors/eligibility";
import type {
  DbAssignmentRole,
  DbAssignmentStatus,
  DbJobAssignment,
  DbJobAssignmentInsert,
  DbJobAssignmentUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type AssignmentErrorCode =
  | "not_found"
  | "invalid_assignee"
  | "job_mismatch"
  | "already_assigned"
  | "invalid_status"
  | "invalid_dates";

export class AssignmentError extends Error {
  code: AssignmentErrorCode;
  constructor(code: AssignmentErrorCode, message: string) {
    super(message);
    this.name = "AssignmentError";
    this.code = code;
  }
}

export interface AssignmentRow extends DbJobAssignment {
  subcontractor_name: string | null;
  subcontractor_status: string | null;
  tech_name: string | null;
  project_number: string | null;
  job_label: string | null;
  agreement_number: string | null;
  /** 'job' when pinned to a specific job, 'project' when project-wide. */
  scope: "job" | "project";
  /** The assignee's display name, whichever kind it is. */
  assignee_name: string;
  /** 'subcontractor' | 'tech' — which kind of assignee this is. */
  assignee_kind: "subcontractor" | "tech";
}

type AssignmentJoinRow = DbJobAssignment & {
  subcontractor: { name: string; status: string } | null;
  tech: { name: string } | null;
  project: { project_number: string | null } | null;
  job: { job_type: string; co_number: number | null; title: string } | null;
  agreement: { agreement_number: string } | null;
};

const ASSIGNMENT_SELECT =
  "*, subcontractor:subcontractors(name, status), tech:techs(name), project:projects(project_number), job:project_jobs(job_type, co_number, title), agreement:sub_agreements(agreement_number)";

function toRow(r: AssignmentJoinRow): AssignmentRow {
  const { subcontractor, tech, project, job, agreement, ...a } = r;
  const kind: "subcontractor" | "tech" = a.subcontractor_id ? "subcontractor" : "tech";
  return {
    ...(a as DbJobAssignment),
    subcontractor_name: subcontractor?.name ?? null,
    subcontractor_status: subcontractor?.status ?? null,
    tech_name: tech?.name ?? null,
    project_number: project?.project_number ?? null,
    job_label: jobLabel(job),
    agreement_number: agreement?.agreement_number ?? null,
    scope: a.job_id ? "job" : "project",
    assignee_kind: kind,
    assignee_name: (kind === "subcontractor" ? subcontractor?.name : tech?.name) ?? "—",
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/**
 * Assignments relevant to a job: those pinned to the job PLUS the project-wide
 * ones (job_id NULL) for the job's project. Each row's `scope` says which.
 * Project-wide rows apply to every job on the project — surfaced here so the job
 * view shows the full crew, not just the job-specific rows.
 */
export async function listAssignmentsForJob(jobId: string): Promise<AssignmentRow[]> {
  const supabase = await db();
  const job = await getJobById(jobId);
  if (!job) return [];
  const { data, error } = await supabase
    .from("job_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("project_id", job.project_id)
    .neq("status", "removed")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listAssignmentsForJob: ${error.message}`);
  return ((data ?? []) as unknown as AssignmentJoinRow[])
    .map(toRow)
    // Job-pinned rows for THIS job, plus every project-wide row.
    .filter((r) => r.job_id === jobId || r.job_id === null);
}

export async function listAssignmentsForProject(projectId: string): Promise<AssignmentRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("project_id", projectId)
    .neq("status", "removed")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listAssignmentsForProject: ${error.message}`);
  return ((data ?? []) as unknown as AssignmentJoinRow[]).map(toRow);
}

export async function listAssignmentsForSubcontractor(
  subcontractorId: string
): Promise<AssignmentRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("subcontractor_id", subcontractorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listAssignmentsForSubcontractor: ${error.message}`);
  return ((data ?? []) as unknown as AssignmentJoinRow[]).map(toRow);
}

/** Active assignment counts per subcontractor (SUB-3 6d — urgency signal). */
export async function countActiveAssignmentsBySub(
  subIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (subIds.length === 0) return out;
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_assignments")
    .select("subcontractor_id, status")
    .in("subcontractor_id", subIds)
    .eq("status", "active");
  if (error) throw new Error(`countActiveAssignmentsBySub: ${error.message}`);
  for (const r of (data ?? []) as { subcontractor_id: string | null }[]) {
    if (!r.subcontractor_id) continue;
    out.set(r.subcontractor_id, (out.get(r.subcontractor_id) ?? 0) + 1);
  }
  return out;
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface CreateAssignmentInput {
  projectId: string;
  jobId?: string | null;
  subcontractorId?: string | null;
  techId?: string | null;
  agreementId?: string | null;
  role?: DbAssignmentRole;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  actorId?: string | null;
}

export type CreateAssignmentResult =
  | { ok: true; assignment: DbJobAssignment }
  | { ok: false; error: "compliance_block"; reasons: string[] };

/**
 * Create an active assignment. Exactly one assignee kind. For a subcontractor,
 * the compliance hard-block runs HERE (server-side) — a blocked sub returns
 * compliance_block + reasons and no row is written. Other invalid inputs throw
 * typed AssignmentErrors.
 */
export async function createAssignment(
  input: CreateAssignmentInput
): Promise<CreateAssignmentResult> {
  const hasSub = !!input.subcontractorId;
  const hasTech = !!input.techId;
  if (hasSub === hasTech) {
    throw new AssignmentError(
      "invalid_assignee",
      "An assignment must have exactly one assignee — a subcontractor or a tech."
    );
  }
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new AssignmentError("invalid_dates", "End date can't be before the start date.");
  }

  const supabase = await db();

  // A job-scoped assignment's job must belong to the given project.
  if (input.jobId) {
    const job = await getJobById(input.jobId);
    if (!job) throw new AssignmentError("not_found", "Job not found.");
    if (job.project_id !== input.projectId) {
      throw new AssignmentError("job_mismatch", "That job doesn't belong to this project.");
    }
  }

  // THE HARD BLOCK — subcontractor only, server-side, no override.
  if (input.subcontractorId) {
    const sub = await getSubcontractorById(input.subcontractorId);
    if (!sub) throw new AssignmentError("not_found", "Subcontractor not found.");
    const docs = await listComplianceDocs(input.subcontractorId);
    const verdict = canAssignSubcontractor(
      { status: sub.status },
      docs.map((d) => ({ doc_type: d.doc_type, expiry_date: d.expiry_date })),
      businessDateISO()
    );
    if (!verdict.ok) {
      return { ok: false, error: "compliance_block", reasons: verdict.reasons };
    }
  }

  const payload: DbJobAssignmentInsert = {
    project_id: input.projectId,
    job_id: input.jobId ?? null,
    subcontractor_id: input.subcontractorId ?? null,
    tech_id: input.techId ?? null,
    agreement_id: input.agreementId ?? null,
    role: input.role ?? "crew",
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
    status: "active",
    notes: input.notes ?? null,
    created_by: input.actorId ?? null,
    updated_by: input.actorId ?? null,
  };

  const { data, error } = await supabase
    .from("job_assignments")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    // The partial unique index surfaces a duplicate active sub-on-job as 23505.
    if (error.message.includes("job_assignments_unique_active_sub") ||
        error.message.includes("duplicate key value")) {
      throw new AssignmentError(
        "already_assigned",
        "This subcontractor is already actively assigned to this job."
      );
    }
    throw new Error(`createAssignment: ${error.message}`);
  }

  if (input.subcontractorId) {
    await logActivity("project", input.projectId, "update", {
      subcontractor_assigned: { from: null, to: input.subcontractorId },
    });
  }

  return { ok: true, assignment: data as DbJobAssignment };
}

export interface UpdateAssignmentPatch {
  role?: DbAssignmentRole;
  startDate?: string | null;
  endDate?: string | null;
  agreementId?: string | null;
  notes?: string | null;
}

/** Edit role/dates/notes/WO-link. Empty-diff no-op (§2.8). */
export async function updateAssignment(
  id: string,
  patch: UpdateAssignmentPatch,
  actorId: string | null
): Promise<DbJobAssignment> {
  const supabase = await db();
  const { data: cur, error: cErr } = await supabase
    .from("job_assignments")
    .select("id, start_date, end_date")
    .eq("id", id)
    .maybeSingle();
  if (cErr) throw new Error(`updateAssignment/load: ${cErr.message}`);
  if (!cur) throw new AssignmentError("not_found", "Assignment not found.");
  const before = cur as { start_date: string | null; end_date: string | null };

  const update: DbJobAssignmentUpdate = {};
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.startDate !== undefined) update.start_date = patch.startDate;
  if (patch.endDate !== undefined) update.end_date = patch.endDate;
  if (patch.agreementId !== undefined) update.agreement_id = patch.agreementId;
  if (patch.notes !== undefined) update.notes = patch.notes;

  // §2.8 empty-diff no-op — nothing to change, don't touch updated_at.
  if (Object.keys(update).length === 0) {
    const { data, error } = await supabase
      .from("job_assignments")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw new Error(`updateAssignment/noop: ${error.message}`);
    return data as DbJobAssignment;
  }

  const effStart = update.start_date !== undefined ? update.start_date : before.start_date;
  const effEnd = update.end_date !== undefined ? update.end_date : before.end_date;
  if (effStart && effEnd && effEnd < effStart) {
    throw new AssignmentError("invalid_dates", "End date can't be before the start date.");
  }

  const { data, error } = await supabase
    .from("job_assignments")
    .update({ ...update, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateAssignment: ${error.message}`);
  return data as DbJobAssignment;
}

const STATUS_TRANSITIONS: Record<DbAssignmentStatus, DbAssignmentStatus[]> = {
  active: ["completed", "removed"],
  completed: ["active", "removed"],
  removed: [],
};

export interface SetAssignmentStatusInput {
  id: string;
  status: DbAssignmentStatus;
  actorId?: string | null;
}

export async function setAssignmentStatus(
  input: SetAssignmentStatusInput
): Promise<DbJobAssignment> {
  const supabase = await db();
  const { data: cur, error: cErr } = await supabase
    .from("job_assignments")
    .select("id, status")
    .eq("id", input.id)
    .maybeSingle();
  if (cErr) throw new Error(`setAssignmentStatus/load: ${cErr.message}`);
  if (!cur) throw new AssignmentError("not_found", "Assignment not found.");
  const from = (cur as { status: DbAssignmentStatus }).status;
  if (from === input.status) {
    throw new AssignmentError("invalid_status", "The assignment is already in that state.");
  }
  if (!STATUS_TRANSITIONS[from].includes(input.status)) {
    throw new AssignmentError(
      "invalid_status",
      `A ${from} assignment can't move to ${input.status}.`
    );
  }
  const { data, error } = await supabase
    .from("job_assignments")
    .update({ status: input.status, updated_by: input.actorId ?? null })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw new Error(`setAssignmentStatus: ${error.message}`);
  return data as DbJobAssignment;
}

/** Hard-delete (an assignment created in error). The UI prefers status='removed'. */
export async function deleteAssignment(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_assignments")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteAssignment: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
