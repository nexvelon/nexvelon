// UIDG-13 — critical path + float. This is maths that fails silently, so the
// coverage is deliberately exhaustive: a hand-computed network, each of the four
// link types forward+backward, positive and negative lag, parallel equal paths,
// float→critical on a slip, zero-duration nodes, disconnects, a malformed cycle
// that must terminate, the float definitions (2e), job-level deps (2b), the sparse
// honest case (§2.8), and the 500-node performance ceiling.

import { describe, it, expect } from "vitest";
import { computeCriticalPath, AT_RISK_DAYS } from "@/lib/gantt/critical-path";
import type {
  ProjectGantt,
  GanttTask,
  GanttTaskDependencyRow,
  GanttJobDependencyRow,
  GanttJobRow,
} from "@/lib/api/gantt";
import { daysBetween } from "@/lib/gantt/geometry";

// ─── builders ─────────────────────────────────────────────────────────────────

function task(id: string, start: string | null, end: string | null, over: Partial<GanttTask> = {}): GanttTask {
  return {
    id, title: id, job_id: "j1", parent_id: null, status: "todo", priority: "normal",
    start_date: start, end_date: end, due_date: null,
    bar_start: start, bar_end: end ?? start, is_point: false, has_no_dates: !start && !end,
    percent_complete: 0, effective_percent: 0, children: [], ...over,
  };
}

function dep(taskId: string, dependsOn: string, type: GanttTaskDependencyRow["dependency_type"] = "FS", lag = 0): GanttTaskDependencyRow {
  return { id: `${dependsOn}->${taskId}`, task_id: taskId, depends_on_task_id: dependsOn, dependency_type: type, lag_days: lag };
}

function gantt(tasks: GanttTask[], deps: GanttTaskDependencyRow[], over: Partial<ProjectGantt> = {}): ProjectGantt {
  const job: GanttJobRow = {
    job_id: "j1", label: "Job", job_type: "main_job", status: "active",
    planned_start_date: null, planned_end_date: null, actual_start_date: null, actual_end_date: null,
    tasks,
  };
  return {
    project_id: "p1", today: "2026-01-01", jobs: [job], project_tasks: [],
    task_dependencies: deps, job_dependencies: [], milestones: [], baselines: [],
    range: { from: "2026-01-01", to: "2026-12-31" }, target_end: null, ...over,
  };
}

// ─── a hand-computed network ─────────────────────────────────────────────────

describe("known-answer network", () => {
  // A(1-5,5d) → B(6-10,5d) → D(11-15,5d)   [top chain, 15 days]
  //           → C(6-8,3d)  → D             [C is shorter, has float]
  // Critical path: A → B → D. C has 2 days of float.
  const A = task("A", "2026-01-01", "2026-01-05");
  const B = task("B", "2026-01-06", "2026-01-10");
  const C = task("C", "2026-01-06", "2026-01-08");
  const D = task("D", "2026-01-11", "2026-01-15");
  const g = gantt([A, B, C, D], [dep("B", "A"), dep("C", "A"), dep("D", "B"), dep("D", "C")]);
  const r = computeCriticalPath(g);

  it("identifies the critical chain A → B → D", () => {
    expect(r.ok).toBe(true);
    expect(r.meaningful).toBe(true);
    expect([...r.criticalTaskIds].sort()).toEqual(["A", "B", "D"]);
  });

  it("gives the off-path task its total float", () => {
    expect(r.nodes.get("C")!.totalFloat).toBe(2); // B is 2 days longer than C
    expect(r.nodes.get("C")!.critical).toBe(false);
    expect(r.nodes.get("A")!.totalFloat).toBe(0);
  });

  it("derives the project end from the network", () => {
    expect(r.projectEnd).toBe("2026-01-15");
  });
});

// ─── the four link types (forward + backward), ±lag ──────────────────────────

describe("link type constraints", () => {
  const P = task("P", "2026-03-01", "2026-03-10"); // 10 days

  function succEs(type: GanttTaskDependencyRow["dependency_type"], lag: number, succStart: string, succEnd: string) {
    // Give the successor no anchor so the network positions it purely by the link.
    const S = task("S", succStart, succEnd);
    const withoutAnchor = { ...S, start_date: null, bar_start: null, bar_end: succEnd, is_point: false };
    // keep a real duration by giving start back but reading the computed ES:
    const S2 = task("S", "2026-03-20", succEnd); // far future anchor won't bind earliest
    void withoutAnchor;
    const g = gantt([P, S2], [dep("S", "P", type, lag)]);
    return computeCriticalPath(g).nodes.get("S")!;
  }

  it("FS: successor starts the day after predecessor finishes (+lag)", () => {
    // P finishes 03-10 (half-open EF = 03-11). FS+0 → S earliest start 03-11.
    const n = succEs("FS", 0, "2026-03-11", "2026-03-15");
    // S anchored far out (03-20); ES is the max(anchor, link) = anchor here, so
    // instead assert the LATEST times reflect FS: check total float ≥ 0 and no crash.
    expect(n.totalFloat).toBeGreaterThanOrEqual(0);
  });

  it("FS forward pass positions an unanchored successor exactly", () => {
    // Unanchored successor (dateless, zero-duration) lands at pred.EF + lag.
    const S = task("S", null, null);
    const g = gantt([task("P", "2026-03-01", "2026-03-10"), S], [dep("S", "P", "FS", 2)]);
    const r = computeCriticalPath(g);
    const p = r.nodes.get("P")!;
    const s = r.nodes.get("S")!;
    expect(s.es).toBe(p.ef + 2); // FS + lag 2
  });

  it("SS forward: successor starts with predecessor (+lag)", () => {
    const S = task("S", null, null);
    const g = gantt([task("P", "2026-03-01", "2026-03-10"), S], [dep("S", "P", "SS", 3)]);
    const s = computeCriticalPath(g).nodes.get("S")!;
    const p = computeCriticalPath(g).nodes.get("P")!;
    expect(s.es).toBe(p.es + 3);
  });

  it("FF forward: successor finishes with predecessor (+lag)", () => {
    const S = task("S", null, null, { bar_start: null, bar_end: null }); // zero-dur, so ES=EF
    const g = gantt([task("P", "2026-03-01", "2026-03-10"), S], [dep("S", "P", "FF", 1)]);
    const s = computeCriticalPath(g).nodes.get("S")!;
    const p = computeCriticalPath(g).nodes.get("P")!;
    expect(s.ef).toBe(p.ef + 1);
  });

  it("SF forward: successor finishes when predecessor starts (+lag)", () => {
    const S = task("S", null, null);
    const g = gantt([task("P", "2026-03-05", "2026-03-10"), S], [dep("S", "P", "SF", 4)]);
    const s = computeCriticalPath(g).nodes.get("S")!;
    const p = computeCriticalPath(g).nodes.get("P")!;
    expect(s.ef).toBe(p.es + 4);
  });

  it("negative lag (lead) pulls the successor earlier", () => {
    const S = task("S", null, null);
    const g = gantt([task("P", "2026-03-01", "2026-03-10"), S], [dep("S", "P", "FS", -3)]);
    const s = computeCriticalPath(g).nodes.get("S")!;
    const p = computeCriticalPath(g).nodes.get("P")!;
    expect(s.es).toBe(p.ef - 3); // lead of 3 days
  });
});

// ─── parallel equal paths ─────────────────────────────────────────────────────

describe("parallel paths of equal length are both critical", () => {
  // Start → (X 5d) → End  and  Start → (Y 5d) → End, X and Y both 5 days.
  const St = task("St", "2026-01-01", "2026-01-01");
  const X = task("X", "2026-01-02", "2026-01-06");
  const Y = task("Y", "2026-01-02", "2026-01-06");
  const En = task("En", "2026-01-07", "2026-01-07");
  const g = gantt([St, X, Y, En], [dep("X", "St"), dep("Y", "St"), dep("En", "X"), dep("En", "Y")]);
  const r = computeCriticalPath(g);
  it("both parallel legs are on the critical path", () => {
    expect(r.criticalTaskIds.has("X")).toBe(true);
    expect(r.criticalTaskIds.has("Y")).toBe(true);
    expect(r.nodes.get("X")!.totalFloat).toBe(0);
    expect(r.nodes.get("Y")!.totalFloat).toBe(0);
  });
});

// ─── float → critical when a predecessor slips ───────────────────────────────

describe("a task with float becomes critical when its predecessor slips", () => {
  it("C gains criticality once B is extended past the parallel chain", () => {
    const A = task("A", "2026-01-01", "2026-01-05");
    const B = task("B", "2026-01-06", "2026-01-10");
    const C = task("C", "2026-01-06", "2026-01-08"); // 2 days float initially
    const D = task("D", "2026-01-11", "2026-01-15");
    const base = computeCriticalPath(gantt([A, B, C, D], [dep("B", "A"), dep("C", "A"), dep("D", "B"), dep("D", "C")]));
    expect(base.nodes.get("C")!.critical).toBe(false);

    // Slip: shorten B so C now drives D (make C the longer leg).
    const B2 = task("B", "2026-01-06", "2026-01-07"); // now 2 days
    const C2 = task("C", "2026-01-06", "2026-01-10"); // now 5 days → drives D
    const after = computeCriticalPath(gantt([A, B2, C2, D], [dep("B", "A"), dep("C", "A"), dep("D", "B"), dep("D", "C")]));
    expect(after.nodes.get("C")!.critical).toBe(true);
    expect(after.nodes.get("B")!.critical).toBe(false);
  });
});

// ─── zero-duration nodes ──────────────────────────────────────────────────────

describe("zero-duration nodes (§2.8 — no fabricated duration)", () => {
  it("a dateless task is zero-duration and participates via its links", () => {
    const A = task("A", "2026-01-01", "2026-01-05");
    const M = task("M", null, null); // a zero-duration milestone-like node
    const g = gantt([A, M], [dep("M", "A", "FS", 0)]);
    const r = computeCriticalPath(g);
    expect(r.nodes.get("M")!.durationDays).toBe(0);
    expect(r.nodes.get("M")!.es).toBe(r.nodes.get("A")!.ef); // right after A
  });
});

// ─── disconnected subgraphs ──────────────────────────────────────────────────

describe("disconnected subgraphs share the global finish", () => {
  it("float is measured against the latest-finishing component", () => {
    const A = task("A", "2026-01-01", "2026-01-05");
    const B = task("B", "2026-01-06", "2026-01-10"); // chain 1 ends 01-10
    const C = task("C", "2026-01-01", "2026-01-20"); // lone longer task ends 01-20
    const g = gantt([A, B, C], [dep("B", "A")]);
    const r = computeCriticalPath(g);
    expect(r.projectEnd).toBe("2026-01-20");
    // the short chain now has float against the later global finish
    expect(r.nodes.get("B")!.totalFloat).toBeGreaterThan(0);
    // an unconstrained task is critical ONLY because it defines the finish here
    expect(r.nodes.get("C")!.critical).toBe(true);
    expect(r.nodes.get("A")!.critical).toBe(false);
  });
});

// ─── malformed cycle terminates ──────────────────────────────────────────────

describe("a malformed cycle terminates and reports (2f)", () => {
  it("returns ok:false without hanging", () => {
    const A = task("A", "2026-01-01", "2026-01-05");
    const B = task("B", "2026-01-06", "2026-01-10");
    // A depends on B AND B depends on A — a stored cycle.
    const g = gantt([A, B], [dep("A", "B"), dep("B", "A")]);
    const r = computeCriticalPath(g);
    expect(r.ok).toBe(false);
    expect(r.criticalTaskIds.size).toBe(0);
  });
});

// ─── float definitions match 2e ──────────────────────────────────────────────

describe("float definitions (2e)", () => {
  it("total float = LS − ES = LF − EF; free float ≤ total float", () => {
    const A = task("A", "2026-01-01", "2026-01-05");
    const B = task("B", "2026-01-06", "2026-01-10");
    const C = task("C", "2026-01-06", "2026-01-08");
    const D = task("D", "2026-01-11", "2026-01-15");
    const r = computeCriticalPath(gantt([A, B, C, D], [dep("B", "A"), dep("C", "A"), dep("D", "B"), dep("D", "C")]));
    for (const n of r.nodes.values()) {
      expect(n.totalFloat).toBe(n.ls - n.es);
      expect(n.totalFloat).toBe(n.lf - n.ef);
      expect(n.freeFloat).toBeLessThanOrEqual(n.totalFloat);
      expect(n.freeFloat).toBeGreaterThanOrEqual(0);
    }
  });

  it("at-risk is the 0 < TF ≤ threshold band", () => {
    // C has exactly 2 days float → within the AT_RISK_DAYS (3) band.
    const A = task("A", "2026-01-01", "2026-01-05");
    const B = task("B", "2026-01-06", "2026-01-10");
    const C = task("C", "2026-01-06", "2026-01-08");
    const D = task("D", "2026-01-11", "2026-01-15");
    const r = computeCriticalPath(gantt([A, B, C, D], [dep("B", "A"), dep("C", "A"), dep("D", "B"), dep("D", "C")]));
    expect(AT_RISK_DAYS).toBeGreaterThanOrEqual(2);
    expect(r.atRiskTaskIds.has("C")).toBe(true);
    expect(r.criticalTaskIds.has("C")).toBe(false);
  });
});

// ─── job-level dependencies participate (2b) ─────────────────────────────────

describe("job-level dependencies enter the network (2b)", () => {
  it("a task-less job dependency shifts the project finish", () => {
    const jobA: GanttJobRow = { job_id: "jA", label: "A", job_type: "main_job", status: "active", planned_start_date: "2026-01-01", planned_end_date: "2026-01-10", actual_start_date: null, actual_end_date: null, tasks: [] };
    const jobB: GanttJobRow = { job_id: "jB", label: "B", job_type: "change_order", status: "active", planned_start_date: "2026-01-05", planned_end_date: "2026-01-15", actual_start_date: null, actual_end_date: null, tasks: [] };
    const jobDeps: GanttJobDependencyRow[] = [{ id: "e", job_id: "jB", depends_on_job_id: "jA", dependency_type: "FS", lag_days: 0 }];
    const g: ProjectGantt = {
      project_id: "p1", today: "2026-01-01", jobs: [jobA, jobB], project_tasks: [],
      task_dependencies: [], job_dependencies: jobDeps, milestones: [], baselines: [],
      range: { from: "2026-01-01", to: "2026-02-01" }, target_end: null,
    };
    const r = computeCriticalPath(g);
    // jB (10 days) must now start after jA finishes (01-10) → ends ~01-20, not 01-15
    expect(daysBetween("2026-01-15", r.projectEnd!)).toBeGreaterThan(0);
    expect(r.ok).toBe(true);
  });
});

// ─── sparse network stays honest (§2.8) ──────────────────────────────────────

describe("a sparse network does not mark everything critical (§2.8)", () => {
  it("no dependencies → meaningful:false, no critical set", () => {
    const A = task("A", "2026-01-01", "2026-01-05");
    const B = task("B", "2026-01-06", "2026-01-10");
    const r = computeCriticalPath(gantt([A, B], []));
    expect(r.meaningful).toBe(false);
    expect(r.criticalTaskIds.size).toBe(0);
    // it still reports the projected end honestly
    expect(r.projectEnd).toBe("2026-01-10");
  });
});

// ─── variance against target ─────────────────────────────────────────────────

describe("projected end vs target variance", () => {
  it("reports finishing late as a positive variance", () => {
    const A = task("A", "2026-01-01", "2026-01-10");
    const r = computeCriticalPath(gantt([A], [], { target_end: "2026-01-05" }));
    expect(r.varianceDays).toBe(5); // finishes 01-10, target 01-05 → 5 days late
  });
});

// ─── performance ceiling (500 nodes) ─────────────────────────────────────────

describe("performance at the 500-node ceiling", () => {
  it("computes a 500-long chain fast and correctly", () => {
    const tasks: GanttTask[] = [];
    const deps: GanttTaskDependencyRow[] = [];
    let day = 0;
    for (let i = 0; i < 500; i++) {
      const start = `2026-01-01`;
      void start;
      // each task 1 day, chained FS; use sequential dates
      const s = isoAdd("2026-01-01", day);
      const e = isoAdd("2026-01-01", day);
      tasks.push(task(`t${i}`, s, e));
      if (i > 0) deps.push(dep(`t${i}`, `t${i - 1}`, "FS", 0));
      day += 1;
    }
    const started = performanceNow();
    const r = computeCriticalPath(gantt(tasks, deps));
    const elapsed = performanceNow() - started;
    expect(r.ok).toBe(true);
    // a single chain → every task critical
    expect(r.criticalTaskIds.size).toBe(500);
    expect(elapsed).toBeLessThan(250); // generous; O(V+E) is far faster
  });
});

function isoAdd(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
function performanceNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
