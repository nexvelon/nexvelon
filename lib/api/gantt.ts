import "server-only";

// UIDG-11 — the Gantt data layer. Reads the FULL Gantt shape (tasks with
// start/end/percent/parent nested under jobs, typed+lagged dependencies at both
// levels, baselines, milestones) and owns the writes the DB can't guard:
// dependency cycles and the lag bound. This is a SIBLING of schedule.ts — the
// existing getProjectSchedule / ProjectSchedule (which ProjectScheduleCard reads)
// are deliberately left untouched, so that surface is byte-identical this chunk.
//
// ACYCLICITY (task deps) and the ancestor guard (task nesting, in job-tasks.ts)
// live in the APPLICATION layer, mirroring the existing job-dependency approach —
// a project's task graph is small, so a recursive DB trigger is overkill. The DB
// still bars self-edges, self-parents, out-of-range percent and end<start.

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { businessDateISO } from "@/lib/format";
import { listJobsForProject } from "@/lib/api/projects";
import { jobLabel } from "@/lib/api/sub-agreements";
import { listMilestones } from "@/lib/api/schedule";
import type {
  DbJobTask,
  DbDependencyType,
  DbTaskDependency,
  DbJobDependency,
  DbScheduleBaseline,
  DbScheduleBaselineTask,
  DbScheduleMilestone,
} from "@/lib/types/database";

async function db() {
  return createSupabaseServerClient();
}

/** Lag is in DAYS (2d). Negative = lead. Bounded to ±2 years — a lead/lag beyond
 *  that on a project schedule is a data-entry error, not a real plan. */
export const MAX_LAG_DAYS = 730;

export type GanttErrorCode =
  | "not_found"
  | "self_dependency"
  | "duplicate_edge"
  | "cross_project"
  | "would_create_cycle"
  | "invalid_lag"
  | "invalid_type";

export class GanttError extends Error {
  code: GanttErrorCode;
  constructor(code: GanttErrorCode, message: string) {
    super(message);
    this.name = "GanttError";
    this.code = code;
  }
}

const DEP_TYPES: DbDependencyType[] = ["FS", "SS", "FF", "SF"];

function assertLag(lagDays: number): void {
  if (!Number.isInteger(lagDays) || Math.abs(lagDays) > MAX_LAG_DAYS) {
    throw new GanttError(
      "invalid_lag",
      `Lag must be a whole number of days between −${MAX_LAG_DAYS} and ${MAX_LAG_DAYS}.`
    );
  }
}

function assertType(type: DbDependencyType): void {
  if (!DEP_TYPES.includes(type)) {
    throw new GanttError("invalid_type", "Dependency type must be FS, SS, FF or SF.");
  }
}

// ─── The assembled Gantt (what UIDG-12 renders) ──────────────────────────────

export interface GanttTask {
  id: string;
  title: string;
  job_id: string | null;
  parent_id: string | null;
  status: string;
  priority: string;
  start_date: string | null;
  end_date: string | null;
  due_date: string | null;
  /** The bar span the Gantt draws: start_date, and end_date ?? due_date. */
  bar_start: string | null;
  bar_end: string | null;
  /** No start but an end/due → render as a point marker, not a bar. */
  is_point: boolean;
  /** No start, end AND no due → nothing to place on the timeline yet. */
  has_no_dates: boolean;
  /** Stored manual value (leaf truth). */
  percent_complete: number;
  /** Effective %: manual for a leaf, else the rollup of children (2g). */
  effective_percent: number;
  children: GanttTask[];
}

export interface GanttJobRow {
  job_id: string;
  label: string;
  job_type: string;
  status: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  tasks: GanttTask[]; // top-level tasks on this job (parent_id null)
}

export interface GanttTaskDependencyRow {
  id: string;
  task_id: string;
  depends_on_task_id: string;
  dependency_type: DbDependencyType;
  lag_days: number;
}

export interface GanttJobDependencyRow {
  id: string;
  job_id: string;
  depends_on_job_id: string;
  dependency_type: DbDependencyType;
  lag_days: number;
}

export interface ProjectGantt {
  project_id: string;
  today: string;
  jobs: GanttJobRow[];
  /** Project-level tasks (job_id null), as their own top-level group. */
  project_tasks: GanttTask[];
  task_dependencies: GanttTaskDependencyRow[];
  job_dependencies: GanttJobDependencyRow[];
  milestones: DbScheduleMilestone[];
  baselines: DbScheduleBaseline[];
  range: { from: string; to: string } | null;
  /** The project's target completion date (UIDG-13 critical-path variance), or null.
   *  Optional in the type (older literals omit it); getProjectGantt always sets it. */
  target_end?: string | null;
}

/**
 * Effective %-complete (2g): a leaf uses its stored value; a task WITH children
 * derives it from the children (rounded average of their effective values) — so a
 * parent's completion is the truth of its children, and any stored manual value on
 * a parent is ignored while it has children. Pure + memoised; safe on a cyclic map
 * (a `visiting` guard stops runaway recursion, though the write layer prevents
 * cycles).
 */
export function computeEffectivePercent(
  taskId: string,
  childrenByParent: Map<string, DbJobTask[]>,
  byId: Map<string, DbJobTask>,
  memo: Map<string, number> = new Map(),
  visiting: Set<string> = new Set()
): number {
  const cached = memo.get(taskId);
  if (cached !== undefined) return cached;
  if (visiting.has(taskId)) return byId.get(taskId)?.percent_complete ?? 0;
  visiting.add(taskId);

  const kids = childrenByParent.get(taskId) ?? [];
  let result: number;
  if (kids.length === 0) {
    result = byId.get(taskId)?.percent_complete ?? 0;
  } else {
    const sum = kids.reduce(
      (acc, k) => acc + computeEffectivePercent(k.id, childrenByParent, byId, memo, visiting),
      0
    );
    result = Math.round(sum / kids.length);
  }
  visiting.delete(taskId);
  memo.set(taskId, result);
  return result;
}

function toGanttTree(tasks: DbJobTask[]): {
  roots: (parentScope: string | null, jobId: string | null) => GanttTask[];
} {
  const byId = new Map<string, DbJobTask>();
  const childrenByParent = new Map<string, DbJobTask[]>();
  for (const t of tasks) byId.set(t.id, t);
  for (const t of tasks) {
    if (t.parent_id) {
      const list = childrenByParent.get(t.parent_id) ?? [];
      list.push(t);
      childrenByParent.set(t.parent_id, list);
    }
  }
  const memo = new Map<string, number>();

  function build(t: DbJobTask): GanttTask {
    const barStart = t.start_date;
    const barEnd = t.end_date ?? t.due_date;
    const kids = (childrenByParent.get(t.id) ?? []).map(build);
    return {
      id: t.id,
      title: t.title,
      job_id: t.job_id,
      parent_id: t.parent_id,
      status: t.status,
      priority: t.priority,
      start_date: t.start_date,
      end_date: t.end_date,
      due_date: t.due_date,
      bar_start: barStart,
      bar_end: barEnd,
      is_point: !barStart && !!barEnd,
      has_no_dates: !barStart && !barEnd,
      percent_complete: t.percent_complete,
      effective_percent: computeEffectivePercent(t.id, childrenByParent, byId, memo),
      children: kids,
    };
  }

  return {
    roots: (parentScope, jobId) =>
      tasks
        .filter((t) => (t.parent_id ?? null) === parentScope && (t.job_id ?? null) === jobId)
        .map(build),
  };
}

/**
 * The WHOLE project schedule in a FIXED number of queries (7), independent of task
 * / dependency / baseline count — NOT one per task:
 *   1 project_jobs · 2 job_tasks · 3 task_dependencies · 4 job_dependencies
 *   5 schedule_milestones · 6 projects (fallback dates) · 7 schedule_baselines.
 * Baseline task snapshots load lazily (getBaselineTasks), not here.
 */
export async function getProjectGantt(projectId: string): Promise<ProjectGantt> {
  const supabase = await db();
  const today = businessDateISO();

  const [jobs, taskRes, taskDepRes, milestones, projRes, baselineRes] = await Promise.all([
    listJobsForProject(projectId),
    supabase.from("job_tasks").select("*").eq("project_id", projectId).order("sort_order", { ascending: true }),
    supabase.from("task_dependencies").select("*").eq("project_id", projectId),
    listMilestones({ projectId }),
    supabase.from("projects").select("start_date, target_completion, actual_completion").eq("id", projectId).maybeSingle(),
    supabase.from("schedule_baselines").select("*").eq("project_id", projectId).order("captured_at", { ascending: false }),
  ]);
  if (taskRes.error) throw new Error(`getProjectGantt/tasks: ${taskRes.error.message}`);
  if (taskDepRes.error) throw new Error(`getProjectGantt/taskDeps: ${taskDepRes.error.message}`);
  if (baselineRes.error) throw new Error(`getProjectGantt/baselines: ${baselineRes.error.message}`);

  const jobIds = jobs.map((j) => j.id);
  const { data: jobDepData, error: jobDepErr } = jobIds.length
    ? await supabase.from("job_dependencies").select("*").in("job_id", jobIds)
    : { data: [], error: null };
  if (jobDepErr) throw new Error(`getProjectGantt/jobDeps: ${jobDepErr.message}`);

  const tasks = (taskRes.data ?? []) as DbJobTask[];
  const tree = toGanttTree(tasks);

  const jobRows: GanttJobRow[] = jobs.map((j) => ({
    job_id: j.id,
    label: jobLabel(j) ?? j.title,
    job_type: j.job_type,
    status: j.status,
    planned_start_date: j.planned_start_date,
    planned_end_date: j.planned_end_date,
    actual_start_date: j.actual_start_date,
    actual_end_date: j.actual_end_date,
    tasks: tree.roots(null, j.id),
  }));
  const projectTasks = tree.roots(null, null);

  // Axis range: every bar span + milestone date.
  let minDate: string | null = null;
  let maxDate: string | null = null;
  const consider = (d: string | null | undefined) => {
    if (!d) return;
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  };
  for (const t of tasks) {
    consider(t.start_date);
    consider(t.end_date ?? t.due_date);
  }
  for (const j of jobs) {
    consider(j.planned_start_date);
    consider(j.planned_end_date);
  }
  for (const m of milestones) consider(m.target_date);
  // Fallback: a project whose tasks/jobs have no dates yet still gets a sensible
  // axis window from the project's own start/target (query #6).
  if (!minDate && !maxDate) {
    const proj = (projRes.data ?? {}) as { start_date?: string | null; target_completion?: string | null };
    consider(proj.start_date);
    consider(proj.target_completion);
  }

  return {
    project_id: projectId,
    today,
    jobs: jobRows,
    project_tasks: projectTasks,
    task_dependencies: ((taskDepRes.data ?? []) as DbTaskDependency[]).map((e) => ({
      id: e.id,
      task_id: e.task_id,
      depends_on_task_id: e.depends_on_task_id,
      dependency_type: e.dependency_type,
      lag_days: e.lag_days,
    })),
    job_dependencies: ((jobDepData ?? []) as DbJobDependency[]).map((e) => ({
      id: e.id,
      job_id: e.job_id,
      depends_on_job_id: e.depends_on_job_id,
      dependency_type: e.dependency_type,
      lag_days: e.lag_days,
    })),
    milestones,
    baselines: (baselineRes.data ?? []) as DbScheduleBaseline[],
    range: minDate && maxDate ? { from: minDate, to: maxDate } : null,
    target_end: ((projRes.data ?? {}) as { target_completion?: string | null }).target_completion ?? null,
  };
}

// ─── Task dependencies (typed + lagged, cycle-guarded) ───────────────────────

export interface AddTaskDependencyInput {
  taskId: string;
  dependsOnTaskId: string;
  dependencyType?: DbDependencyType;
  lagDays?: number;
  actorId?: string | null;
}

/**
 * Add a typed, lagged edge "taskId depends on dependsOnTaskId". Rejects a
 * self-edge, a cross-project pair, a bad type/lag, and — the important one — any
 * edge that would create a CYCLE (walk the existing task graph from
 * dependsOnTaskId; if it can already reach taskId, the edge closes a loop, and the
 * error NAMES the cycle).
 */
export async function addTaskDependency(input: AddTaskDependencyInput): Promise<DbTaskDependency> {
  const type = input.dependencyType ?? "FS";
  const lag = input.lagDays ?? 0;
  assertType(type);
  assertLag(lag);
  if (input.taskId === input.dependsOnTaskId) {
    throw new GanttError("self_dependency", "A task can't depend on itself.");
  }

  const supabase = await db();
  const { data: pair, error: pErr } = await supabase
    .from("job_tasks")
    .select("id, project_id, title")
    .in("id", [input.taskId, input.dependsOnTaskId]);
  if (pErr) throw new Error(`addTaskDependency/pair: ${pErr.message}`);
  const rows = (pair ?? []) as { id: string; project_id: string; title: string }[];
  const task = rows.find((r) => r.id === input.taskId);
  const dep = rows.find((r) => r.id === input.dependsOnTaskId);
  if (!task || !dep) throw new GanttError("not_found", "Task not found.");
  if (task.project_id !== dep.project_id) {
    throw new GanttError("cross_project", "Both tasks must be in the same project.");
  }

  const { data: edgeData, error: eErr } = await supabase
    .from("task_dependencies")
    .select("*")
    .eq("project_id", task.project_id);
  if (eErr) throw new Error(`addTaskDependency/edges: ${eErr.message}`);
  const edges = (edgeData ?? []) as DbTaskDependency[];

  if (edges.some((e) => e.task_id === input.taskId && e.depends_on_task_id === input.dependsOnTaskId)) {
    throw new GanttError("duplicate_edge", "That dependency already exists.");
  }

  // Titles for a readable cycle message.
  const { data: titleData } = await supabase
    .from("job_tasks")
    .select("id, title")
    .eq("project_id", task.project_id);
  const titleOf = new Map<string, string>();
  for (const r of (titleData ?? []) as { id: string; title: string }[]) titleOf.set(r.id, r.title);

  // Cycle? Adding taskId → dependsOnTaskId. A loop forms if dependsOnTaskId can
  // ALREADY reach taskId. Path-tracking DFS from dependsOnTaskId.
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.task_id) ?? [];
    list.push(e.depends_on_task_id);
    adj.set(e.task_id, list);
  }
  const path = findPath(adj, input.dependsOnTaskId, input.taskId);
  if (path) {
    // path: dependsOn … → taskId. The new edge taskId → dependsOn closes it.
    const names = [input.taskId, ...path].map((t) => titleOf.get(t) ?? t);
    throw new GanttError("would_create_cycle", `That dependency would create a loop: ${names.join(" → ")}.`);
  }

  const { data, error } = await supabase
    .from("task_dependencies")
    .insert({
      project_id: task.project_id,
      task_id: input.taskId,
      depends_on_task_id: input.dependsOnTaskId,
      dependency_type: type,
      lag_days: lag,
      created_by: input.actorId ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (error.message.includes("task_dependencies_unique_edge")) {
      throw new GanttError("duplicate_edge", "That dependency already exists.");
    }
    throw new Error(`addTaskDependency: ${error.message}`);
  }
  return data as DbTaskDependency;
}

/** DFS from `start` to `target`, returning the node path [start … target] or null. */
function findPath(adj: Map<string, string[]>, start: string, target: string): string[] | null {
  const stack: { node: string; path: string[] }[] = [{ node: start, path: [start] }];
  const seen = new Set<string>();
  while (stack.length) {
    const { node, path } = stack.pop()!;
    if (node === target) return path;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of adj.get(node) ?? []) stack.push({ node: next, path: [...path, next] });
  }
  return null;
}

export async function removeTaskDependency(id: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`removeTaskDependency: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// ─── Baselines (immutable snapshots) ─────────────────────────────────────────

export interface CaptureBaselineInput {
  projectId: string;
  name: string;
  notes?: string | null;
  actorId?: string | null;
}

/**
 * Capture the current task schedule as an immutable baseline (§2.2). Writes the
 * header, then a frozen snapshot row per task (start/end/percent as they are now).
 * Re-baselining = calling this again; each capture is its own row set. The DB
 * blocks any later UPDATE of the snapshot rows.
 */
export async function captureBaseline(input: CaptureBaselineInput): Promise<DbScheduleBaseline> {
  const name = input.name.trim();
  if (!name) throw new GanttError("not_found", "A baseline name is required.");
  const supabase = await db();

  const { data: header, error: hErr } = await supabase
    .from("schedule_baselines")
    .insert({
      project_id: input.projectId,
      name,
      notes: input.notes ?? null,
      captured_by: input.actorId ?? null,
    })
    .select("*")
    .single();
  if (hErr) throw new Error(`captureBaseline/header: ${hErr.message}`);
  const baseline = header as DbScheduleBaseline;

  const { data: taskData, error: tErr } = await supabase
    .from("job_tasks")
    .select("id, start_date, end_date, percent_complete")
    .eq("project_id", input.projectId);
  if (tErr) throw new Error(`captureBaseline/tasks: ${tErr.message}`);
  const snapshot = ((taskData ?? []) as {
    id: string;
    start_date: string | null;
    end_date: string | null;
    percent_complete: number;
  }[]).map((t) => ({
    baseline_id: baseline.id,
    task_id: t.id,
    start_date: t.start_date,
    end_date: t.end_date,
    percent_complete: t.percent_complete,
  }));

  if (snapshot.length > 0) {
    const { error: sErr } = await supabase.from("schedule_baseline_tasks").insert(snapshot);
    if (sErr) throw new Error(`captureBaseline/snapshot: ${sErr.message}`);
  }
  return baseline;
}

export async function listBaselines(projectId: string): Promise<DbScheduleBaseline[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("schedule_baselines")
    .select("*")
    .eq("project_id", projectId)
    .order("captured_at", { ascending: false });
  if (error) throw new Error(`listBaselines: ${error.message}`);
  return (data ?? []) as DbScheduleBaseline[];
}

export async function getBaselineTasks(baselineId: string): Promise<DbScheduleBaselineTask[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("schedule_baseline_tasks")
    .select("*")
    .eq("baseline_id", baselineId);
  if (error) throw new Error(`getBaselineTasks: ${error.message}`);
  return (data ?? []) as DbScheduleBaselineTask[];
}
