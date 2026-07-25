import "server-only";

// PROJ2-20 — schedule HOOKS: planned job dates, milestones, simple finish-to-
// start dependencies, and the assembled timeline the Gantt renders. This is the
// hook for Sprint 3's dispatch scheduler, NOT the scheduler itself (no calendar,
// no dispatch, no resource levelling, no drag-to-reschedule).
//
// ACYCLICITY is enforced HERE (not in the DB): addDependency walks the existing
// edges and rejects any that would close a loop. A finish-to-start chain across
// a handful of jobs is small, so a recursive DB trigger would be overkill.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { getJobById, listJobsForProject } from "@/lib/api/projects";
import { jobLabel } from "@/lib/api/sub-agreements";
import type {
  DbJobDependency,
  DbMilestoneStatus,
  DbScheduleMilestone,
  DbScheduleMilestoneInsert,
  DbScheduleMilestoneUpdate,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export type ScheduleErrorCode =
  | "not_found"
  | "invalid_dates"
  | "self_dependency"
  | "duplicate_edge"
  | "would_create_cycle"
  | "cross_project";

export class ScheduleError extends Error {
  code: ScheduleErrorCode;
  constructor(code: ScheduleErrorCode, message: string) {
    super(message);
    this.name = "ScheduleError";
    this.code = code;
  }
}

// ─── Planned dates ───────────────────────────────────────────────────────────

export interface SetPlannedDatesInput {
  jobId: string;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actorId?: string | null;
}

export async function setJobPlannedDates(
  input: SetPlannedDatesInput
): Promise<void> {
  const supabase = await db();
  const { data: cur, error: cErr } = await supabase
    .from("project_jobs")
    .select("planned_start_date, planned_end_date")
    .eq("id", input.jobId)
    .maybeSingle();
  if (cErr) throw new Error(`setJobPlannedDates/load: ${cErr.message}`);
  if (!cur) throw new ScheduleError("not_found", "Job not found.");
  const before = cur as { planned_start_date: string | null; planned_end_date: string | null };

  const update: Record<string, unknown> = {};
  if (input.plannedStart !== undefined) update.planned_start_date = input.plannedStart;
  if (input.plannedEnd !== undefined) update.planned_end_date = input.plannedEnd;
  // Empty-diff no-op (§2.8).
  if (Object.keys(update).length === 0) return;

  const start = update.planned_start_date !== undefined ? (update.planned_start_date as string | null) : before.planned_start_date;
  const end = update.planned_end_date !== undefined ? (update.planned_end_date as string | null) : before.planned_end_date;
  if (start && end && end < start) {
    throw new ScheduleError("invalid_dates", "Planned end can't be before the planned start.");
  }

  const { error } = await supabase
    .from("project_jobs")
    .update({ ...update, updated_by: input.actorId ?? null })
    .eq("id", input.jobId);
  if (error) throw new Error(`setJobPlannedDates: ${error.message}`);
}

// ─── Milestones ──────────────────────────────────────────────────────────────

export async function listMilestones(scope: {
  projectId?: string;
  jobId?: string;
}): Promise<DbScheduleMilestone[]> {
  const supabase = await db();
  let q = supabase.from("schedule_milestones").select("*");
  if (scope.jobId) q = q.eq("job_id", scope.jobId);
  else if (scope.projectId) q = q.eq("project_id", scope.projectId);
  else return [];
  const { data, error } = await q
    .order("target_date", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`listMilestones: ${error.message}`);
  return (data ?? []) as DbScheduleMilestone[];
}

export interface CreateMilestoneInput {
  projectId: string;
  jobId?: string | null;
  title: string;
  targetDate: string;
  notes?: string | null;
  actorId?: string | null;
}

export async function createMilestone(input: CreateMilestoneInput): Promise<DbScheduleMilestone> {
  if (!input.title.trim()) throw new ScheduleError("not_found", "A milestone title is required.");
  const supabase = await db();
  const payload: DbScheduleMilestoneInsert = {
    project_id: input.projectId,
    job_id: input.jobId ?? null,
    title: input.title.trim(),
    target_date: input.targetDate,
    status: "pending",
    notes: input.notes ?? null,
    created_by: input.actorId ?? null,
    updated_by: input.actorId ?? null,
  };
  const { data, error } = await supabase
    .from("schedule_milestones")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createMilestone: ${error.message}`);
  return data as DbScheduleMilestone;
}

export async function updateMilestone(
  id: string,
  patch: { title?: string; targetDate?: string; notes?: string | null },
  actorId: string | null
): Promise<DbScheduleMilestone> {
  const supabase = await db();
  const update: DbScheduleMilestoneUpdate = { updated_by: actorId };
  if (patch.title !== undefined) update.title = patch.title.trim();
  if (patch.targetDate !== undefined) update.target_date = patch.targetDate;
  if (patch.notes !== undefined) update.notes = patch.notes;
  const { data, error } = await supabase
    .from("schedule_milestones")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateMilestone: ${error.message}`);
  return data as DbScheduleMilestone;
}

/** Set a milestone's status; 'met' stamps completed_at, leaving it clears it. */
export async function setMilestoneStatus(
  id: string,
  status: DbMilestoneStatus,
  actorId: string | null
): Promise<DbScheduleMilestone> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("schedule_milestones")
    .update({
      status,
      completed_at: status === "met" ? businessDateISO() : null,
      updated_by: actorId,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`setMilestoneStatus: ${error.message}`);
  return data as DbScheduleMilestone;
}

export async function deleteMilestone(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("schedule_milestones")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteMilestone: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// ─── Dependencies ────────────────────────────────────────────────────────────

async function listEdges(
  supabase: Awaited<ReturnType<typeof db>>,
  jobIds: string[]
): Promise<DbJobDependency[]> {
  if (jobIds.length === 0) return [];
  const { data, error } = await supabase
    .from("job_dependencies")
    .select("*")
    .in("job_id", jobIds);
  if (error) throw new Error(`listEdges: ${error.message}`);
  return (data ?? []) as DbJobDependency[];
}

export interface AddDependencyInput {
  jobId: string;
  dependsOnJobId: string;
  actorId?: string | null;
}

/**
 * Add a finish-to-start edge "jobId depends on dependsOnJobId". Rejects a
 * self-edge, a duplicate, a cross-project pair, and — the important one — any
 * edge that would create a CYCLE (walk the existing graph from dependsOnJobId;
 * if it can already reach jobId, the new edge closes a loop).
 */
export async function addDependency(input: AddDependencyInput): Promise<DbJobDependency> {
  if (input.jobId === input.dependsOnJobId) {
    throw new ScheduleError("self_dependency", "A job can't depend on itself.");
  }
  const [job, dep] = await Promise.all([
    getJobById(input.jobId),
    getJobById(input.dependsOnJobId),
  ]);
  if (!job || !dep) throw new ScheduleError("not_found", "Job not found.");
  if (job.project_id !== dep.project_id) {
    throw new ScheduleError("cross_project", "Both jobs must be in the same project.");
  }

  const supabase = await db();
  const projectJobs = await listJobsForProject(job.project_id);
  const edges = await listEdges(supabase, projectJobs.map((j) => j.id));

  // Duplicate?
  if (edges.some((e) => e.job_id === input.jobId && e.depends_on_job_id === input.dependsOnJobId)) {
    throw new ScheduleError("duplicate_edge", "That dependency already exists.");
  }

  // Cycle? Adding jobId → dependsOnJobId. A cycle forms if dependsOnJobId can
  // ALREADY reach jobId by following depends_on edges. Walk from dependsOnJobId.
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.job_id) ?? [];
    list.push(e.depends_on_job_id);
    adj.set(e.job_id, list);
  }
  const seen = new Set<string>();
  const stack = [input.dependsOnJobId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === input.jobId) {
      throw new ScheduleError("would_create_cycle", "That dependency would create a loop.");
    }
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }

  const { data, error } = await supabase
    .from("job_dependencies")
    .insert({ job_id: input.jobId, depends_on_job_id: input.dependsOnJobId })
    .select("*")
    .single();
  if (error) {
    if (error.message.includes("job_dependencies_unique_edge")) {
      throw new ScheduleError("duplicate_edge", "That dependency already exists.");
    }
    throw new Error(`addDependency: ${error.message}`);
  }
  return data as DbJobDependency;
}

export async function removeDependency(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_dependencies")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`removeDependency: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// ─── Assembled timeline (what the Gantt renders) ─────────────────────────────

export interface ScheduleJobRow {
  job_id: string;
  label: string;
  job_type: string;
  status: string;
  /** The bar start/end used for rendering (planned, else inferred). */
  start: string;
  end: string;
  /** True when start/end are inferred (created_at / project fallback), not planned. */
  inferred: boolean;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_completion: string | null;
  is_overdue: boolean;
  has_no_dates: boolean;
  depends_on: string[]; // job_ids this row depends on
}

export interface ProjectSchedule {
  project_id: string;
  today: string;
  jobs: ScheduleJobRow[];
  milestones: DbScheduleMilestone[];
  /** The window spanned by all bars + milestones, for axis scaling. */
  range: { from: string; to: string } | null;
}

function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export async function getProjectSchedule(projectId: string): Promise<ProjectSchedule> {
  const supabase = await db();
  const today = businessDateISO();

  const [jobs, milestones] = await Promise.all([
    listJobsForProject(projectId),
    listMilestones({ projectId }),
  ]);

  // Project actual_completion is the fallback end when a job has no planned end.
  const { data: projRow } = await supabase
    .from("projects")
    .select("actual_completion, target_completion, start_date")
    .eq("id", projectId)
    .maybeSingle();
  const proj = (projRow ?? {}) as {
    actual_completion?: string | null;
    target_completion?: string | null;
    start_date?: string | null;
  };

  const edges = await listEdges(supabase, jobs.map((j) => j.id));
  const dependsBy = new Map<string, string[]>();
  for (const e of edges) {
    const list = dependsBy.get(e.job_id) ?? [];
    list.push(e.depends_on_job_id);
    dependsBy.set(e.job_id, list);
  }

  let minDate: string | null = null;
  let maxDate: string | null = null;
  const rows: ScheduleJobRow[] = jobs.map((j) => {
    const hasNoDates = !j.planned_start_date && !j.planned_end_date;
    // Inferred bar: start from planned/project-start/created_at; end from
    // planned/project target/actual completion, else start + 14 days.
    const inferredStart =
      j.planned_start_date ?? proj.start_date ?? j.created_at.slice(0, 10);
    const start = j.planned_start_date ?? inferredStart;
    const end =
      j.planned_end_date ??
      proj.target_completion ??
      proj.actual_completion ??
      addDaysIso(start, 14);
    const inferred = !j.planned_start_date || !j.planned_end_date;

    if (!minDate || start < minDate) minDate = start;
    if (!maxDate || end > maxDate) maxDate = end;

    const isOverdue =
      !!j.planned_end_date &&
      j.planned_end_date < today &&
      j.status !== "closed" &&
      j.status !== "cancelled";

    return {
      job_id: j.id,
      label: jobLabel(j) ?? j.title,
      job_type: j.job_type,
      status: j.status,
      start,
      end,
      inferred,
      planned_start_date: j.planned_start_date,
      planned_end_date: j.planned_end_date,
      actual_completion: null,
      is_overdue: isOverdue,
      has_no_dates: hasNoDates,
      depends_on: dependsBy.get(j.id) ?? [],
    };
  });

  for (const m of milestones) {
    if (!minDate || m.target_date < minDate) minDate = m.target_date;
    if (!maxDate || m.target_date > maxDate) maxDate = m.target_date;
  }

  return {
    project_id: projectId,
    today,
    jobs: rows,
    milestones,
    range: minDate && maxDate ? { from: minDate, to: maxDate } : null,
  };
}
