import "server-only";

// PROJ2-11 — tasks on a Job (job_id set) or on the Project as a whole (job_id
// NULL). Assignee mirrors SUB-6's party model (tech OR subcontractor) but is
// OPTIONAL — an unassigned task is valid.
//
// SCOPE SEPARATION (deliberate): listTasksForJob returns THAT JOB's tasks only.
// Project-level tasks (job_id NULL) are NOT folded into a job's list — a task
// on "the project" is not a task on every job, and silently mixing them would
// make the job's kanban counts lie. The project page shows project-level tasks
// plus a per-job roll-up instead.
//
// NO COMPLIANCE HARD-BLOCK on assigning a subcontractor to a task. SUB-5/SUB-6
// block issuing a work order and putting a sub on site, because those are a
// commercial commitment and a site assignment. A task is neither — it's a
// to-do. Blocking "phone the sub about their WSIB certificate" because their
// WSIB certificate has lapsed would be self-defeating. Deliberate decision.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/api/activity-log";
import { getJobById } from "@/lib/api/projects";
import { jobLabel } from "@/lib/api/sub-agreements";
import type {
  DbJobTask,
  DbJobTaskInsert,
  DbJobTaskUpdate,
  DbTaskPriority,
  DbTaskStatus,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

export const TASK_TITLE_MAX = 200;

export type TaskErrorCode =
  | "not_found"
  | "invalid_title"
  | "invalid_assignee"
  | "job_mismatch";

export class TaskError extends Error {
  code: TaskErrorCode;
  constructor(code: TaskErrorCode, message: string) {
    super(message);
    this.name = "TaskError";
    this.code = code;
  }
}

export interface TaskRow extends DbJobTask {
  assignee_tech_name: string | null;
  assignee_subcontractor_name: string | null;
  /** Whichever assignee is set, or null when unassigned. */
  assignee_name: string | null;
  assignee_kind: "tech" | "subcontractor" | null;
  /** "Main Job" / "CO #2 — Title"; null for a project-level task. */
  job_label: string | null;
}

type TaskJoinRow = DbJobTask & {
  tech: { name: string } | null;
  subcontractor: { name: string } | null;
  job: { job_type: string; co_number: number | null; title: string } | null;
};

const TASK_SELECT =
  "*, tech:techs(name), subcontractor:subcontractors(name), job:project_jobs(job_type, co_number, title)";

function toRow(r: TaskJoinRow): TaskRow {
  const { tech, subcontractor, job, ...t } = r;
  const kind: "tech" | "subcontractor" | null = t.assignee_tech_id
    ? "tech"
    : t.assignee_subcontractor_id
      ? "subcontractor"
      : null;
  return {
    ...(t as DbJobTask),
    assignee_tech_name: tech?.name ?? null,
    assignee_subcontractor_name: subcontractor?.name ?? null,
    assignee_name:
      kind === "tech" ? (tech?.name ?? null) : kind === "subcontractor" ? (subcontractor?.name ?? null) : null,
    assignee_kind: kind,
    job_label: jobLabel(job),
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Tasks pinned to ONE job. Project-level tasks are deliberately excluded. */
export async function listTasksForJob(jobId: string): Promise<TaskRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_tasks")
    .select(TASK_SELECT)
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listTasksForJob: ${error.message}`);
  return ((data ?? []) as unknown as TaskJoinRow[]).map(toRow);
}

/**
 * Tasks for a project. By default PROJECT-LEVEL only (job_id NULL);
 * `includeJobTasks` widens to every task on the project for the summary card.
 */
export async function listTasksForProject(
  projectId: string,
  opts: { includeJobTasks?: boolean } = {}
): Promise<TaskRow[]> {
  const supabase = await db();
  let q = supabase.from("job_tasks").select(TASK_SELECT).eq("project_id", projectId);
  if (!opts.includeJobTasks) q = q.is("job_id", null);
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listTasksForProject: ${error.message}`);
  return ((data ?? []) as unknown as TaskJoinRow[]).map(toRow);
}

export async function getTaskById(id: string): Promise<TaskRow | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_tasks")
    .select(TASK_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getTaskById: ${error.message}`);
  if (!data) return null;
  return toRow(data as unknown as TaskJoinRow);
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export interface CreateTaskInput {
  projectId: string;
  jobId?: string | null;
  title: string;
  description?: string | null;
  priority?: DbTaskPriority;
  assigneeTechId?: string | null;
  assigneeSubcontractorId?: string | null;
  dueDate?: string | null;
  actorId?: string | null;
}

function assertTitle(title: string): string {
  const t = (title ?? "").trim();
  if (!t) throw new TaskError("invalid_title", "A task title is required.");
  if (t.length > TASK_TITLE_MAX) {
    throw new TaskError(
      "invalid_title",
      `Task title is too long (max ${TASK_TITLE_MAX} characters).`
    );
  }
  return t;
}

function assertAssignee(techId?: string | null, subId?: string | null): void {
  if (techId && subId) {
    throw new TaskError(
      "invalid_assignee",
      "A task can be assigned to a technician or a subcontractor, not both."
    );
  }
}

/** Next sort_order within a (job/project, status) column — MAX + 1. */
async function nextSortOrder(
  supabase: Awaited<ReturnType<typeof db>>,
  scope: { projectId: string; jobId: string | null },
  status: DbTaskStatus
): Promise<number> {
  let q = supabase
    .from("job_tasks")
    .select("sort_order")
    .eq("project_id", scope.projectId)
    .eq("status", status);
  q = scope.jobId ? q.eq("job_id", scope.jobId) : q.is("job_id", null);
  const { data, error } = await q;
  if (error) throw new Error(`nextSortOrder: ${error.message}`);
  const rows = (data ?? []) as { sort_order: number | null }[];
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => Number(r.sort_order ?? 0))) + 1;
}

export async function createTask(input: CreateTaskInput): Promise<DbJobTask> {
  const title = assertTitle(input.title);
  assertAssignee(input.assigneeTechId, input.assigneeSubcontractorId);

  const supabase = await db();

  // Cross-table invariant the DB can't CHECK: a job-scoped task's job must
  // belong to the given project (mirrors SUB-6's createAssignment).
  if (input.jobId) {
    const job = await getJobById(input.jobId);
    if (!job) throw new TaskError("not_found", "Job not found.");
    if (job.project_id !== input.projectId) {
      throw new TaskError("job_mismatch", "That job doesn't belong to this project.");
    }
  }

  const sort_order = await nextSortOrder(
    supabase,
    { projectId: input.projectId, jobId: input.jobId ?? null },
    "todo"
  );

  const payload: DbJobTaskInsert = {
    project_id: input.projectId,
    job_id: input.jobId ?? null,
    title,
    description: input.description ?? null,
    status: "todo",
    priority: input.priority ?? "normal",
    assignee_tech_id: input.assigneeTechId ?? null,
    assignee_subcontractor_id: input.assigneeSubcontractorId ?? null,
    due_date: input.dueDate ?? null,
    sort_order,
    source: "internal",
    created_by: input.actorId ?? null,
    updated_by: input.actorId ?? null,
  };

  const { data, error } = await supabase
    .from("job_tasks")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(`createTask: ${error.message}`);

  // Best-effort audit under 'project' (activity_log's entity_type CHECK has no
  // 'task'/'job' value; widening it is out of scope — the task id rides in the
  // payload). Never blocks the write.
  try {
    await logActivity("project", input.projectId, "update", {
      task_created: { from: null, to: title },
    });
  } catch {
    /* audit is best-effort */
  }

  return data as DbJobTask;
}

export interface UpdateTaskPatch {
  title?: string;
  description?: string | null;
  priority?: DbTaskPriority;
  assigneeTechId?: string | null;
  assigneeSubcontractorId?: string | null;
  dueDate?: string | null;
}

/** Edit a task's fields. Empty-diff no-op (§2.8). Status goes via setTaskStatus. */
export async function updateTask(
  id: string,
  patch: UpdateTaskPatch,
  actorId: string | null
): Promise<DbJobTask> {
  const supabase = await db();

  const update: DbJobTaskUpdate = {};
  if (patch.title !== undefined) update.title = assertTitle(patch.title);
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate;
  // Assignee is set as a PAIR so switching kind clears the other side.
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

  // §2.8 — nothing to change: don't write, don't bump updated_at.
  if (Object.keys(update).length === 0) {
    const { data, error } = await supabase
      .from("job_tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`updateTask/noop: ${error.message}`);
    if (!data) throw new TaskError("not_found", "Task not found.");
    return data as DbJobTask;
  }

  const { data, error } = await supabase
    .from("job_tasks")
    .update({ ...update, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateTask: ${error.message}`);
  return data as DbJobTask;
}

export interface SetTaskStatusInput {
  id: string;
  status: DbTaskStatus;
  actorId?: string | null;
}

/**
 * Move a task's status. completed_at is STAMPED when entering 'done' and
 * CLEARED when leaving it — so a task reopened after completion doesn't keep a
 * stale completion timestamp.
 */
export async function setTaskStatus(
  input: SetTaskStatusInput
): Promise<DbJobTask> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_tasks")
    .update({
      status: input.status,
      completed_at: input.status === "done" ? new Date().toISOString() : null,
      updated_by: input.actorId ?? null,
    })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw new Error(`setTaskStatus: ${error.message}`);
  return data as DbJobTask;
}

export interface ReorderTasksInput {
  /** Task ids in their new visual order within the column. */
  orderedIds: string[];
  /** The column they now live in — also applied, so this doubles as a move. */
  status: DbTaskStatus;
  actorId?: string | null;
}

/**
 * Persist a kanban column's order: sort_order = array index. Also writes the
 * column's status, so dragging a card into a different column is one call.
 * Entering/leaving 'done' maintains completed_at exactly as setTaskStatus does.
 */
export async function reorderTasks(input: ReorderTasksInput): Promise<number> {
  const supabase = await db();
  const completedAt = input.status === "done" ? new Date().toISOString() : null;
  let written = 0;
  for (const [index, id] of input.orderedIds.entries()) {
    const { error } = await supabase
      .from("job_tasks")
      .update({
        sort_order: index,
        status: input.status,
        completed_at: completedAt,
        updated_by: input.actorId ?? null,
      })
      .eq("id", id);
    if (error) throw new Error(`reorderTasks: ${error.message}`);
    written += 1;
  }
  return written;
}

export async function deleteTask(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("job_tasks")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteTask: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// ─── Assignee options (the shared party picker) ──────────────────────────────

export interface TaskAssigneeOptions {
  techs: { id: string; name: string }[];
  subcontractors: { id: string; name: string }[];
}

/** Active techs + active subcontractors for the task assignee picker. */
export async function getTaskAssigneeOptions(): Promise<TaskAssigneeOptions> {
  const supabase = await db();
  const [{ data: techData, error: tErr }, { data: subData, error: sErr }] =
    await Promise.all([
      supabase.from("techs").select("id, name").eq("is_active", true).order("name"),
      supabase
        .from("subcontractors")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
    ]);
  if (tErr) throw new Error(`getTaskAssigneeOptions/techs: ${tErr.message}`);
  if (sErr) throw new Error(`getTaskAssigneeOptions/subs: ${sErr.message}`);
  return {
    techs: (techData ?? []) as { id: string; name: string }[],
    subcontractors: (subData ?? []) as { id: string; name: string }[],
  };
}
