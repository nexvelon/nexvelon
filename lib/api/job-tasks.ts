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
import { logActivity, computeChanges } from "@/lib/api/activity-log";
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
  | "job_mismatch"
  // UIDG-11 — Gantt scheduling fields.
  | "invalid_dates"
  | "invalid_percent"
  | "invalid_parent"
  | "would_create_cycle";

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
  // UIDG-11 — Gantt scheduling fields (all optional; a task with none renders as a
  // point at its due date, not a bar).
  startDate?: string | null;
  endDate?: string | null;
  percentComplete?: number;
  parentId?: string | null;
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

// ─── UIDG-11 — Gantt field validators (the DB mirrors these as CHECKs; these give
//     a clean error before the write and are the single home UIDG-12 reuses) ────

/** end >= start when both are set. Mirrors job_tasks_date_order_check. */
export function assertTaskDates(start?: string | null, end?: string | null): void {
  if (start && end && end < start) {
    throw new TaskError("invalid_dates", "A task's end date can't be before its start date.");
  }
}

/** percent_complete ∈ [0, 100]. Mirrors job_tasks_percent_range_check. */
export function assertPercent(pct?: number | null): void {
  if (pct === undefined || pct === null) return;
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new TaskError("invalid_percent", "Percent complete must be between 0 and 100.");
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
  // UIDG-11 — validate the scheduling fields before the write (DB CHECKs mirror
  // these; a new task can't close a parent cycle, so no ancestor walk here).
  assertTaskDates(input.startDate, input.endDate);
  assertPercent(input.percentComplete);

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

  // A parent must exist and be in the same project (cross-table — no DB CHECK).
  if (input.parentId) {
    await assertParentEligible(supabase, input.parentId, input.projectId);
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
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
    percent_complete: input.percentComplete ?? 0,
    parent_id: input.parentId ?? null,
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

  // AUD-2B — audit as a job_task rolled up to its project, carrying the title so
  // the row reads "added a task — <title>". Best-effort (logActivity never throws).
  await logActivity("job_task", (data as DbJobTask).id, "create", {}, {
    parentType: "project",
    parentId: input.projectId,
    entityLabel: title,
  });

  return data as DbJobTask;
}

export interface UpdateTaskPatch {
  title?: string;
  description?: string | null;
  priority?: DbTaskPriority;
  assigneeTechId?: string | null;
  assigneeSubcontractorId?: string | null;
  dueDate?: string | null;
  // UIDG-11 — Gantt scheduling fields. Re-parenting goes via setTaskParent (it
  // needs the ancestor-cycle guard), NOT here.
  startDate?: string | null;
  endDate?: string | null;
  percentComplete?: number;
}

/** Edit a task's fields. Empty-diff no-op (§2.8). Status goes via setTaskStatus,
 *  re-parenting via setTaskParent. Validates dates/percent against the current row
 *  so a partial patch (only start, only end) is still checked as a pair. */
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
  if (patch.startDate !== undefined) update.start_date = patch.startDate;
  if (patch.endDate !== undefined) update.end_date = patch.endDate;
  if (patch.percentComplete !== undefined) {
    assertPercent(patch.percentComplete);
    update.percent_complete = patch.percentComplete;
  }
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

  // Fetch current row up-front: needed for the no-op branch and to diff for audit.
  const { data: before, error: beforeErr } = await supabase
    .from("job_tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (beforeErr) throw new Error(`updateTask/before: ${beforeErr.message}`);
  if (!before) throw new TaskError("not_found", "Task not found.");

  // Validate the effective start/end PAIR (a patch may set only one side).
  const cur = before as DbJobTask;
  const effStart = update.start_date !== undefined ? (update.start_date as string | null) : cur.start_date;
  const effEnd = update.end_date !== undefined ? (update.end_date as string | null) : cur.end_date;
  assertTaskDates(effStart, effEnd);

  // §2.8 — nothing to change: don't write, don't bump updated_at.
  if (Object.keys(update).length === 0) {
    return before as DbJobTask;
  }

  const { data, error } = await supabase
    .from("job_tasks")
    .update({ ...update, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`updateTask: ${error.message}`);

  // AUD-2B — audit the field-level diff, rolled up to the project.
  const row = data as DbJobTask;
  const changes = computeChanges(
    before as unknown as Record<string, unknown>,
    update as Record<string, unknown>
  );
  if (Object.keys(changes).length > 0) {
    await logActivity("job_task", id, "update", changes, {
      parentType: "project",
      parentId: row.project_id,
      entityLabel: row.title,
    });
  }
  return row;
}

// ─── UIDG-11 — re-parenting (arbitrary nesting, cycle-guarded) ────────────────

/** A parent must exist and live in the same project (cross-table — no DB CHECK). */
async function assertParentEligible(
  supabase: Awaited<ReturnType<typeof db>>,
  parentId: string,
  projectId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("job_tasks")
    .select("id, project_id")
    .eq("id", parentId)
    .maybeSingle();
  if (error) throw new Error(`assertParentEligible: ${error.message}`);
  if (!data) throw new TaskError("invalid_parent", "The parent task doesn't exist.");
  if ((data as { project_id: string }).project_id !== projectId) {
    throw new TaskError("invalid_parent", "A task's parent must be in the same project.");
  }
}

/**
 * Set (or clear) a task's parent, enforcing acyclicity beyond depth-1 (the DB
 * CHECK bars only self-parenting). A cycle forms when the task is ALREADY an
 * ancestor of the proposed parent — so walk UP from the parent; if we reach the
 * task, reject with a message naming the loop. One query loads the project's
 * (id, parent_id, title) tree; the walk is in-memory.
 */
export async function setTaskParent(
  id: string,
  parentId: string | null,
  actorId: string | null
): Promise<DbJobTask> {
  const supabase = await db();
  if (parentId && parentId === id) {
    throw new TaskError("invalid_parent", "A task can't be its own parent.");
  }

  const { data: taskRow, error: tErr } = await supabase
    .from("job_tasks")
    .select("id, project_id, parent_id, title")
    .eq("id", id)
    .maybeSingle();
  if (tErr) throw new Error(`setTaskParent/load: ${tErr.message}`);
  if (!taskRow) throw new TaskError("not_found", "Task not found.");
  const task = taskRow as { id: string; project_id: string; parent_id: string | null; title: string };

  if (parentId) {
    await assertParentEligible(supabase, parentId, task.project_id);

    const { data: treeRows, error: treeErr } = await supabase
      .from("job_tasks")
      .select("id, parent_id, title")
      .eq("project_id", task.project_id);
    if (treeErr) throw new Error(`setTaskParent/tree: ${treeErr.message}`);
    const tree = new Map<string, { parent: string | null; title: string }>();
    for (const r of (treeRows ?? []) as { id: string; parent_id: string | null; title: string }[]) {
      tree.set(r.id, { parent: r.parent_id, title: r.title });
    }

    const chain: string[] = [];
    const seen = new Set<string>();
    let cur: string | null = parentId;
    while (cur) {
      chain.push(cur);
      if (cur === id) {
        const nameOf = (t: string) => tree.get(t)?.title ?? t;
        const loop = [...chain].reverse().map(nameOf); // [task … parent]
        loop.push(loop[0]); // … → task (closes the loop)
        throw new TaskError("would_create_cycle", `That parent would create a loop: ${loop.join(" → ")}.`);
      }
      if (seen.has(cur)) break;
      seen.add(cur);
      cur = tree.get(cur)?.parent ?? null;
    }
  }

  // §2.8 — no-op when unchanged.
  if ((task.parent_id ?? null) === (parentId ?? null)) {
    const full = await getTaskById(id);
    return full as unknown as DbJobTask;
  }

  const { data, error } = await supabase
    .from("job_tasks")
    .update({ parent_id: parentId, updated_by: actorId })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(`setTaskParent: ${error.message}`);

  const row = data as DbJobTask;
  await logActivity(
    "job_task",
    id,
    "update",
    { parent_id: { from: task.parent_id, to: parentId } },
    { parentType: "project", parentId: row.project_id, entityLabel: row.title }
  );
  return row;
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
  // AUD-2B — capture prior status so we only audit real transitions.
  const { data: before } = await supabase
    .from("job_tasks")
    .select("status")
    .eq("id", input.id)
    .maybeSingle<{ status: DbTaskStatus }>();
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

  // AUD-2B — a status move is a meaningful audit event ("updated a task — <title>",
  // Status: todo → done on expand). Only log when it actually changed.
  const row = data as DbJobTask;
  if (before && before.status !== input.status) {
    await logActivity(
      "job_task",
      row.id,
      "update",
      { status: { from: before.status, to: input.status } },
      { parentType: "project", parentId: row.project_id, entityLabel: row.title }
    );
  }
  return row;
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
  // AUD-2B — capture title + project BEFORE the delete so the "removed a task —
  // <title>" row is readable afterwards.
  const { data: before } = await supabase
    .from("job_tasks")
    .select("project_id, title")
    .eq("id", id)
    .maybeSingle<{ project_id: string; title: string }>();
  const { data, error } = await supabase
    .from("job_tasks")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`deleteTask: ${error.message}`);
  const removed = (data?.length ?? 0) > 0;
  if (removed && before) {
    await logActivity("job_task", id, "delete", {}, {
      parentType: "project",
      parentId: before.project_id,
      entityLabel: before.title,
    });
  }
  return removed;
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
