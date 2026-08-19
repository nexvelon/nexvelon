// UIDG-13 — critical path + float. PURE (no React, fully unit-tested), in the
// geometry layer's style: the component is a thin renderer over this. A schedule
// exists to answer "which tasks, if they slip, move the finish — and which have
// room"; this module answers it with a forward/backward pass over the dependency
// network, total + free float, and the critical set.
//
// Design (see the PR body): CALENDAR days (2a — the bars are calendar-dated; a
// task has no single resource calendar). Nodes are LEAF tasks + task-less jobs;
// job dependencies enter via a HAMMOCK decomposition with zero-duration boundary
// nodes (2b). Missing dates → zero-duration nodes, never a fabricated duration
// (2c). All arithmetic is half-open in integer day-numbers (EF = ES + dur), so the
// four link types and negative lag fall out of one set of formulae (2d). Kahn topo
// makes it cycle-safe and O(V+E) (2f).

import type { ProjectGantt, GanttTask, GanttJobRow } from "@/lib/api/gantt";
import { toDayNum, fromDayNum } from "./geometry";
import { makeWorkingCalendar, ALL_DAYS_CALENDAR, type WorkingCalendar } from "./working-calendar";

export type DepType = "FS" | "SS" | "FF" | "SF";

/** How many days of positive total float still counts as an early warning (2e). */
export const AT_RISK_DAYS = 3;

export interface CpNode {
  id: string;
  /** Real task id (null for a synthetic job-boundary node — never surfaced). */
  taskId: string | null;
  durationDays: number;
  /** Half-open day-numbers: es = start day, ef = day AFTER finish (= es + dur). */
  es: number;
  ef: number;
  ls: number;
  lf: number;
  totalFloat: number;
  freeFloat: number;
  critical: boolean;
  atRisk: boolean;
}

export interface CriticalPathResult {
  /** false → a residual cycle was found; nothing is marked critical. */
  ok: boolean;
  /** false → too sparse to mean anything (no dependency edges, or no durations);
   *  the UI must NOT designate a critical path (§2.8). */
  meaningful: boolean;
  /** Per REAL task id (synthetic boundary nodes excluded). */
  nodes: Map<string, CpNode>;
  criticalTaskIds: Set<string>;
  atRiskTaskIds: Set<string>;
  projectStart: string | null;
  projectEnd: string | null;
  target: string | null;
  /** projectEnd − target in days (+ = late), or null when no target/end. */
  varianceDays: number | null;
}

interface Edge {
  from: string; // predecessor node id
  to: string; // successor node id
  type: DepType;
  lag: number;
}

interface InternalNode {
  id: string;
  taskId: string | null;
  dur: number;
  /** Anchor day (a "start no earlier than" from the plan), or null (float freely). */
  anchor: number | null;
}

// ─── Build the network from the ProjectGantt ─────────────────────────────────

function leafTasks(gantt: ProjectGantt): GanttTask[] {
  const out: GanttTask[] = [];
  const walk = (t: GanttTask) => {
    if (t.children.length === 0) out.push(t);
    else t.children.forEach(walk);
  };
  gantt.jobs.forEach((j) => j.tasks.forEach(walk));
  gantt.project_tasks.forEach(walk);
  return out;
}

// GANTT-CAL — duration is now WORKING days and the anchor is a WORKING-DAY ORDINAL
// (2c/2d). With an all-days calendar these reduce to the old calendar-day values,
// so the default reproduces prior behaviour exactly.

/** working-day duration + ordinal anchor for a task. No dates → zero-duration, no
 *  anchor. Due-only (point) → zero-duration anchored at the due day (2c). */
function taskDurationAnchor(t: GanttTask, cal: WorkingCalendar): { dur: number; anchor: number | null } {
  if (t.bar_start) {
    const s = toDayNum(t.bar_start);
    const e = toDayNum(t.bar_end ?? t.bar_start);
    return { dur: cal.countWorking(s, e), anchor: cal.toOrd(s) };
  }
  if (t.bar_end) return { dur: 0, anchor: cal.toOrd(toDayNum(t.bar_end)) }; // due-only point
  return { dur: 0, anchor: null }; // dateless
}

function jobDurationAnchor(j: GanttJobRow, cal: WorkingCalendar): { dur: number; anchor: number | null } {
  if (j.planned_start_date) {
    const s = toDayNum(j.planned_start_date);
    const e = toDayNum(j.planned_end_date ?? j.planned_start_date);
    return { dur: cal.countWorking(s, e), anchor: cal.toOrd(s) };
  }
  return { dur: 0, anchor: null };
}

interface Network {
  nodes: Map<string, InternalNode>;
  edges: Edge[];
  hadDepEdges: boolean;
  hadDuration: boolean;
}

function buildNetwork(gantt: ProjectGantt, cal: WorkingCalendar): Network {
  const nodes = new Map<string, InternalNode>();
  const edges: Edge[] = [];

  const tasks = leafTasks(gantt);
  const leafIds = new Set(tasks.map((t) => t.id));
  let hadDuration = false;
  for (const t of tasks) {
    const { dur, anchor } = taskDurationAnchor(t, cal);
    if (dur > 0) hadDuration = true;
    const id = `t:${t.id}`;
    nodes.set(id, { id, taskId: t.id, dur, anchor });
  }

  // Task edges — only between leaf-task nodes (a dep touching a container is dropped).
  let hadDepEdges = false;
  for (const d of gantt.task_dependencies) {
    if (!leafIds.has(d.task_id) || !leafIds.has(d.depends_on_task_id)) continue;
    edges.push({ from: `t:${d.depends_on_task_id}`, to: `t:${d.task_id}`, type: d.dependency_type, lag: d.lag_days });
    hadDepEdges = true;
  }

  // Job boundaries (hammock). A job with tasks gets jobStart/jobEnd; a task-less
  // job is a single node acting as both.
  const jobStart = new Map<string, string>();
  const jobEnd = new Map<string, string>();
  for (const j of gantt.jobs) {
    const jtasks = tasks.filter((t) => t.job_id === j.job_id);
    if (jtasks.length === 0) {
      const { dur, anchor } = jobDurationAnchor(j, cal);
      if (dur > 0) hadDuration = true;
      const id = `j:${j.job_id}`;
      nodes.set(id, { id, taskId: null, dur, anchor });
      jobStart.set(j.job_id, id);
      jobEnd.set(j.job_id, id);
    } else {
      const sId = `js:${j.job_id}`;
      const eId = `je:${j.job_id}`;
      nodes.set(sId, { id: sId, taskId: null, dur: 0, anchor: null });
      nodes.set(eId, { id: eId, taskId: null, dur: 0, anchor: null });
      jobStart.set(j.job_id, sId);
      jobEnd.set(j.job_id, eId);
      const ids = jtasks.map((t) => `t:${t.id}`);
      for (const tid of ids) {
        edges.push({ from: sId, to: tid, type: "SS", lag: 0 }); // job starts no later than its tasks
        edges.push({ from: tid, to: eId, type: "FS", lag: 0 }); // job ends when its last task ends
      }
    }
  }

  // Job dependencies → boundary edges (2b).
  for (const d of gantt.job_dependencies) {
    const ps = jobStart.get(d.depends_on_job_id);
    const pe = jobEnd.get(d.depends_on_job_id);
    const ss = jobStart.get(d.job_id);
    const se = jobEnd.get(d.job_id);
    if (!ps || !pe || !ss || !se) continue;
    const lag = d.lag_days;
    switch (d.dependency_type) {
      case "FS": edges.push({ from: pe, to: ss, type: "FS", lag }); break;
      case "SS": edges.push({ from: ps, to: ss, type: "SS", lag }); break;
      case "FF": edges.push({ from: pe, to: se, type: "FF", lag }); break;
      case "SF": edges.push({ from: ps, to: se, type: "SF", lag }); break;
    }
    hadDepEdges = true;
  }

  return { nodes, edges, hadDepEdges, hadDuration };
}

// ─── Topological order (Kahn — cycle-safe, deterministic) ────────────────────

function topoOrder(net: Network): string[] | null {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of net.nodes.keys()) {
    indeg.set(id, 0);
    adj.set(id, []);
  }
  for (const e of net.edges) {
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  // Deterministic: seed + drain by sorted id, never map order.
  const ready = [...net.nodes.keys()].filter((id) => (indeg.get(id) ?? 0) === 0).sort();
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    const outs = [...adj.get(id)!].sort();
    for (const nx of outs) {
      const d = (indeg.get(nx) ?? 0) - 1;
      indeg.set(nx, d);
      if (d === 0) {
        // insert keeping `ready` sorted
        let i = ready.length;
        while (i > 0 && ready[i - 1] > nx) i--;
        ready.splice(i, 0, nx);
      }
    }
  }
  return order.length === net.nodes.size ? order : null; // null → residual cycle
}

// ─── The passes ──────────────────────────────────────────────────────────────

export function computeCriticalPath(gantt: ProjectGantt): CriticalPathResult {
  const empty: CriticalPathResult = {
    ok: true,
    meaningful: false,
    nodes: new Map(),
    criticalTaskIds: new Set(),
    atRiskTaskIds: new Set(),
    projectStart: null,
    projectEnd: null,
    target: gantt.target_end ?? null,
    varianceDays: null,
  };

  // GANTT-CAL — the passes run in WORKING-DAY ordinal space. With no calendar the
  // all-days calendar is the identity, reproducing calendar-day behaviour exactly.
  const cal = makeWorkingCalendar(gantt.calendar ?? ALL_DAYS_CALENDAR);

  const net = buildNetwork(gantt, cal);
  if (net.nodes.size === 0) return empty;

  const order = topoOrder(net);
  if (!order) return { ...empty, ok: false }; // cycle → honest failure, no hang

  const byId = net.nodes;
  const outEdges = new Map<string, Edge[]>();
  const inEdges = new Map<string, Edge[]>();
  for (const id of byId.keys()) {
    outEdges.set(id, []);
    inEdges.set(id, []);
  }
  for (const e of net.edges) {
    outEdges.get(e.from)!.push(e);
    inEdges.get(e.to)!.push(e);
  }

  // Project start = earliest anchor; anchorless roots start there so they float.
  const anchors = [...byId.values()].map((n) => n.anchor).filter((a): a is number => a != null);
  const projectStartDay = anchors.length ? Math.min(...anchors) : 0;

  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  // Forward pass.
  for (const id of order) {
    const n = byId.get(id)!;
    let start = n.anchor ?? projectStartDay;
    for (const e of inEdges.get(id)!) {
      const pes = es.get(e.from)!;
      const pef = ef.get(e.from)!;
      let req: number;
      switch (e.type) {
        case "FS": req = pef + e.lag; break;
        case "SS": req = pes + e.lag; break;
        case "FF": req = pef + e.lag - n.dur; break;
        case "SF": req = pes + e.lag - n.dur; break;
      }
      if (req > start) start = req;
    }
    es.set(id, start);
    ef.set(id, start + n.dur);
  }

  const F = Math.max(...[...ef.values()]); // project finish (half-open)

  // Backward pass (reverse topo).
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const n = byId.get(id)!;
    const outs = outEdges.get(id)!;
    let latestFinish = outs.length === 0 ? F : Infinity;
    for (const e of outs) {
      const sls = ls.get(e.to)!;
      const slf = lf.get(e.to)!;
      let allowLf: number;
      switch (e.type) {
        case "FS": allowLf = sls - e.lag; break;
        case "SS": allowLf = sls - e.lag + n.dur; break;
        case "FF": allowLf = slf - e.lag; break;
        case "SF": allowLf = slf - e.lag + n.dur; break;
      }
      if (allowLf < latestFinish) latestFinish = allowLf;
    }
    lf.set(id, latestFinish);
    ls.set(id, latestFinish - n.dur);
  }

  // Float + designation.
  const nodes = new Map<string, CpNode>();
  const criticalTaskIds = new Set<string>();
  const atRiskTaskIds = new Set<string>();
  const meaningful = net.hadDepEdges && net.hadDuration;

  for (const id of order) {
    const n = byId.get(id)!;
    const tf = ls.get(id)! - es.get(id)!;
    // Free float — clamp ≥ 0; terminal nodes fall back to total float.
    const outs = outEdges.get(id)!;
    let ff: number;
    if (outs.length === 0) {
      ff = tf;
    } else {
      ff = Infinity;
      for (const e of outs) {
        const sEs = es.get(e.to)!;
        const sEf = ef.get(e.to)!;
        let slack: number;
        switch (e.type) {
          case "FS": slack = sEs - (ef.get(id)! + e.lag); break;
          case "SS": slack = sEs - (es.get(id)! + e.lag); break;
          case "FF": slack = sEf - (ef.get(id)! + e.lag); break;
          case "SF": slack = sEf - (es.get(id)! + e.lag); break;
        }
        if (slack < ff) ff = slack;
      }
    }
    ff = Math.max(0, ff);

    const critical = meaningful && tf <= 0;
    const atRisk = meaningful && tf > 0 && tf <= AT_RISK_DAYS;
    if (n.taskId) {
      if (critical) criticalTaskIds.add(n.taskId);
      if (atRisk) atRiskTaskIds.add(n.taskId);
      nodes.set(n.taskId, {
        id, taskId: n.taskId, durationDays: n.dur, // working days
        // Convert ordinals back to calendar day-numbers for callers/tests.
        es: cal.fromOrd(es.get(id)!), ef: cal.fromOrd(ef.get(id)!),
        ls: cal.fromOrd(ls.get(id)!), lf: cal.fromOrd(lf.get(id)!),
        totalFloat: tf, freeFloat: ff, critical, atRisk,
      });
    }
  }

  // F is the half-open finish ordinal → the last working day is fromOrd(F−1).
  const projectEnd = anchors.length ? fromDayNum(cal.fromOrd(F - 1)) : null;
  const target = gantt.target_end ?? null;
  // Variance is CALENDAR days (real elapsed time a client feels), even though the
  // schedule is computed in working days.
  const varianceDays =
    projectEnd && target ? toDayNum(projectEnd) - toDayNum(target) : null;

  return {
    ok: true,
    meaningful,
    nodes,
    criticalTaskIds,
    atRiskTaskIds,
    projectStart: anchors.length ? fromDayNum(cal.fromOrd(projectStartDay)) : null,
    projectEnd,
    target,
    varianceDays,
  };
}
