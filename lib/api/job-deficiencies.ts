import "server-only";

// PROJ2-12 — deficiencies (punch list) on a job. Mirrors lib/api/job-tasks.ts:
// per-job items, tech-OR-sub-OR-nobody assignee, sort_order, kanban/list. The
// closed_at/closed_by stamp lands on close AND on waive (both are a resolution
// decision); leaving a resolved status clears them.
//
// Photos: no new table — they attach through the shared signed-URL attachment
// flow with entity_type='deficiency', entity_id = deficiency id (the
// ENTITY_RESOURCE map gates 'deficiency' → 'projects').

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logActivity, computeChanges } from "@/lib/api/activity-log";
import { getJobById } from "@/lib/api/projects";
import { jobLabel } from "@/lib/api/sub-agreements";
import { isResolvedStatus } from "@/lib/deficiencies/deficiency-status";
import type {
  DbDeficiencySeverity,
  DbDeficiencyStatus,
  DbJobDeficiency,
  DbJobDeficiencyInsert,
  DbJobDeficiencyUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export const DEFICIENCY_TITLE_MAX = 200;

export type DeficiencyErrorCode =
  | "not_found"
  | "invalid_title"
  | "invalid_assignee"
  | "job_mismatch";

export class DeficiencyError extends Error {
  code: DeficiencyErrorCode;
  constructor(code: DeficiencyErrorCode, message: string) {
    super(message);
    this.name = "DeficiencyError";
    this.code = code;
  }
}

export interface DeficiencyRow extends DbJobDeficiency {
  assignee_name: string | null;
  assignee_kind: "tech" | "subcontractor" | null;
  job_label: string | null;
  photo_count: number;
}

type DeficiencyJoinRow = DbJobDeficiency & {
  tech: { name: string } | null;
  subcontractor: { name: string } | null;
  job: { job_type: string; co_number: number | null; title: string } | null;
};

const DEFICIENCY_SELECT =
  "*, tech:techs(name), subcontractor:subcontractors(name), job:project_jobs(job_type, co_number, title)";

function toRow(r: DeficiencyJoinRow, photoCount = 0): DeficiencyRow {
  const { tech, subcontractor, job, ...d } = r;
  const kind: "tech" | "subcontractor" | null = d.assignee_tech_id
    ? "tech"
    : d.assignee_subcontractor_id
      ? "subcontractor"
      : null;
  return {
    ...(d as DbJobDeficiency),
    assignee_name:
      kind === "tech" ? (tech?.name ?? null) : kind === "subcontractor" ? (subcontractor?.name ?? null) : null,
    assignee_kind: kind,
    job_label: jobLabel(job),
    photo_count: photoCount,
  };
}

/** Photo counts for a set of deficiency ids (attachments, entity_type='deficiency'). */
async function photoCounts(
  supabase: Awaited<ReturnType<typeof db>>,
  ids: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .from("attachments")
    .select("entity_id")
    .eq("entity_type", "deficiency")
    .in("entity_id", ids);
  if (error) throw new Error(`deficiency/photoCounts: ${error.message}`);
  for (const r of (data ?? []) as { entity_id: string }[]) {
    out.set(r.entity_id, (out.get(r.entity_id) ?? 0) + 1);
  }
  return out;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listDeficienciesForJob(jobId: string): Promise<DeficiencyRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_deficiencies")
    .select(DEFICIENCY_SELECT)
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listDeficienciesForJob: ${error.message}`);
  const rows = (data ?? []) as unknown as DeficiencyJoinRow[];
  const counts = await photoCounts(supabase, rows.map((r) => r.id));
  return rows.map((r) => toRow(r, counts.get(r.id) ?? 0));
}

export async function listDeficienciesForProject(
  projectId: string
): Promise<DeficiencyRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_deficiencies")
    .select(DEFICIENCY_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listDeficienciesForProject: ${error.message}`);
  return ((data ?? []) as unknown as DeficiencyJoinRow[]).map((r) => toRow(r, 0));
}

export async function getDeficiencyById(id: string): Promise<DeficiencyRow | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_deficiencies")
    .select(DEFICIENCY_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getDeficiencyById: ${error.message}`);
  if (!data) return null;
  const supabase2 = await db();
  const counts = await photoCounts(supabase2, [id]);
  return toRow(data as unknown as DeficiencyJoinRow, counts.get(id) ?? 0);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface CreateDeficiencyInput {
  projectId: string;
  jobId: string;
  reference?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  severity?: DbDeficiencySeverity;
  raisedBy?: string | null;
  assigneeTechId?: string | null;
  assigneeSubcontractorId?: string | null;
  dueDate?: string | null;
  actorId?: string | null;
}

function assertTitle(title: string): string {
  const t = (title ?? "").trim();
  if (!t) throw new DeficiencyError("invalid_title", "A deficiency title is required.");
  if (t.length > DEFICIENCY_TITLE_MAX) {
    throw new DeficiencyError("invalid_title", `Title too long (max ${DEFICIENCY_TITLE_MAX}).`);
  }
  return t;
}

function assertAssignee(techId?: string | null, subId?: string | null): void {
  if (techId && subId) {
    throw new DeficiencyError(
      "invalid_assignee",
      "A deficiency can be assigned to a technician or a subcontractor, not both."
    );
  }
}

async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof db>>,
  jobId: string,
  status: DbDeficiencyStatus
): Promise<number> {
  const { data, error } = await supabase
    .from("job_deficiencies")
    .select("sort_order")
    .eq("job_id", jobId)
    .eq("status", status);
  if (error) throw new Error(`deficiency/nextSortOrder: ${error.message}`);
  const rows = (data ?? []) as { sort_order: number | null }[];
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => Number(r.sort_order ?? 0))) + 1;
}

export async function createDeficiency(
  input: CreateDeficiencyInput
): Promise<DbJobDeficiency> {
  const title = assertTitle(input.title);
  assertAssignee(input.assigneeTechId, input.assigneeSubcontractorId);

  const supabase = await db();
  const job = await getJobById(input.jobId);
  if (!job) throw new DeficiencyError("not_found", "Job not found.");
  if (job.project_id !== input.projectId) {
    throw new DeficiencyError("job_mismatch", "That job doesn't belong to this project.");
  }

  const sort_order = await nextSortOrder(supabase, input.jobId, "open");

  const payload: DbJobDeficiencyInsert = {
    project_id: input.projectId,
    job_id: input.jobId,
    reference: input.reference ?? null,
    title,
    description: input.description ?? null,
    location: input.location ?? null,
    severity: input.severity ?? "minor",
    status: "open",
    raised_by: input.raisedBy ?? null,
    assignee_tech_id: input.assigneeTechId ?? null,
    assignee_subcontractor_id: input.assigneeSubcontractorId ?? null,
    due_date: input.dueDate ?? null,
    sort_order,
    created_by: input.actorId ?? null,
    updated_by: input.actorId ?? null,
  };

  const { data, error } = await supabase
    .from("job_deficiencies")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createDeficiency: ${error.message}`);

  // AUD-2B — audit as a deficiency rolled up to its project ("added a deficiency
  // — <title>"). Best-effort.
  await logActivity("deficiency", (data as DbJobDeficiency).id, "create", {}, {
    parentType: "project",
    parentId: input.projectId,
    entityLabel: title,
  });
  return data as DbJobDeficiency;
}

export interface UpdateDeficiencyPatch {
  reference?: string | null;
  title?: string;
  description?: string | null;
  location?: string | null;
  severity?: DbDeficiencySeverity;
  raisedBy?: string | null;
  assigneeTechId?: string | null;
  assigneeSubcontractorId?: string | null;
  dueDate?: string | null;
  resolutionNote?: string | null;
}

export async function updateDeficiency(
  id: string,
  patch: UpdateDeficiencyPatch,
  actorId: string | null
): Promise<DbJobDeficiency> {
  const supabase = await db();
  const update: DbJobDeficiencyUpdate = {};
  if (patch.reference !== undefined) update.reference = patch.reference;
  if (patch.title !== undefined) update.title = assertTitle(patch.title);
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.location !== undefined) update.location = patch.location;
  if (patch.severity !== undefined) update.severity = patch.severity;
  if (patch.raisedBy !== undefined) update.raised_by = patch.raisedBy;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  if (patch.resolutionNote !== undefined) update.resolution_note = patch.resolutionNote;
  if (
    patch.assigneeTechId !== undefined ||
    patch.assigneeSubcontractorId !== undefined
  ) {
    const techId = patch.assigneeTechId ?? null;
    const subId = patch.assigneeSubcontractorId ?? null;
    assertAssignee(techId, subId);
    update.assignee_tech_id = techId;
    update.assignee_subcontractor_id = subId;
  }

  const { data: before, error: beforeErr } = await supabase
    .from("job_deficiencies")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (beforeErr) throw new Error(`updateDeficiency/before: ${beforeErr.message}`);
  if (!before) throw new DeficiencyError("not_found", "Deficiency not found.");

  if (Object.keys(update).length === 0) {
    return before as DbJobDeficiency;
  }

  const { data, error } = await supabase
    .from("job_deficiencies")
    .update({ ...update, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateDeficiency: ${error.message}`);

  // AUD-2B — audit the field-level diff, rolled up to the project.
  const row = data as DbJobDeficiency;
  const changes = computeChanges(
    before as unknown as Record<string, unknown>,
    update as Record<string, unknown>
  );
  if (Object.keys(changes).length > 0) {
    await logActivity("deficiency", id, "update", changes, {
      parentType: "project",
      parentId: row.project_id,
      entityLabel: row.title,
    });
  }
  return row;
}

export interface SetDeficiencyStatusInput {
  id: string;
  status: DbDeficiencyStatus;
  actorId?: string | null;
}

/**
 * Move status. Entering closed/waived stamps closed_at + closed_by (a decision
 * was made); leaving a resolved status clears them.
 */
export async function setDeficiencyStatus(
  input: SetDeficiencyStatusInput
): Promise<DbJobDeficiency> {
  const supabase = await db();
  const resolved = isResolvedStatus(input.status);
  const { data: before } = await supabase
    .from("job_deficiencies")
    .select("status")
    .eq("id", input.id)
    .maybeSingle<{ status: DbDeficiencyStatus }>();
  const { data, error } = await supabase
    .from("job_deficiencies")
    .update({
      status: input.status,
      closed_at: resolved ? new Date().toISOString() : null,
      closed_by: resolved ? (input.actorId ?? null) : null,
      updated_by: input.actorId ?? null,
    })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw new Error(`setDeficiencyStatus: ${error.message}`);

  // AUD-2B — audit a real status transition, rolled up to the project.
  const row = data as DbJobDeficiency;
  if (before && before.status !== input.status) {
    await logActivity(
      "deficiency",
      row.id,
      "update",
      { status: { from: before.status, to: input.status } },
      { parentType: "project", parentId: row.project_id, entityLabel: row.title }
    );
  }
  return row;
}

export interface ReorderDeficienciesInput {
  orderedIds: string[];
  status: DbDeficiencyStatus;
  actorId?: string | null;
}

/** Persist a kanban column's order (sort_order = index) + apply the status. */
export async function reorderDeficiencies(
  input: ReorderDeficienciesInput
): Promise<number> {
  const supabase = await db();
  const resolved = isResolvedStatus(input.status);
  const closedAt = resolved ? new Date().toISOString() : null;
  let written = 0;
  for (const [index, id] of input.orderedIds.entries()) {
    const { error } = await supabase
      .from("job_deficiencies")
      .update({
        sort_order: index,
        status: input.status,
        closed_at: closedAt,
        closed_by: resolved ? (input.actorId ?? null) : null,
        updated_by: input.actorId ?? null,
      })
      .eq("id", id);
    if (error) throw new Error(`reorderDeficiencies: ${error.message}`);
    written += 1;
  }
  return written;
}

export async function deleteDeficiency(id: string): Promise<boolean> {
  const supabase = await db();
  // AUD-2B — capture title + project before the delete for a readable row.
  const { data: before } = await supabase
    .from("job_deficiencies")
    .select("project_id, title")
    .eq("id", id)
    .maybeSingle<{ project_id: string; title: string }>();
  const { data, error } = await supabase
    .from("job_deficiencies")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteDeficiency: ${error.message}`);
  const removed = (data?.length ?? 0) > 0;
  if (removed && before) {
    await logActivity("deficiency", id, "delete", {}, {
      parentType: "project",
      parentId: before.project_id,
      entityLabel: before.title,
    });
  }
  return removed;
}
