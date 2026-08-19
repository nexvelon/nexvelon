// UIDG-12 — the pure Gantt geometry: bar spans at each zoom, the due-date-only
// marker (2c), collapse + job summary span, drag date maths + snapping (2d),
// dependency-violation flagging, the four arrow-type geometries + lag (2e), the
// virtualization window (2f), and initial-zoom selection (2b).

import { describe, it, expect } from "vitest";
import {
  toDayNum,
  daysBetween,
  addDays,
  chooseInitialZoom,
  axisOrigin,
  dateToX,
  xToDate,
  barGeom,
  flattenRows,
  jobSummarySpan,
  applyDrag,
  isDependencyViolated,
  arrowGeom,
  visibleRowRange,
  axisHeader,
  PX_PER_DAY,
  MIN_BAR_PX,
} from "@/lib/gantt/geometry";
import type { ProjectGantt, GanttTask, GanttJobRow } from "@/lib/api/gantt";

function task(id: string, over: Partial<GanttTask> = {}): GanttTask {
  return {
    id,
    title: id,
    job_id: "j1",
    parent_id: null,
    status: "todo",
    priority: "normal",
    start_date: null,
    end_date: null,
    due_date: null,
    bar_start: null,
    bar_end: null,
    is_point: false,
    has_no_dates: true,
    percent_complete: 0,
    effective_percent: 0,
    children: [],
    ...over,
  };
}

describe("date maths", () => {
  it("day deltas are inclusive-exclusive", () => {
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
    expect(daysBetween("2026-01-01", "2026-01-10")).toBe(9);
    expect(addDays("2026-01-01", 9)).toBe("2026-01-10");
  });
});

describe("chooseInitialZoom (2b) — a long project never opens at day zoom", () => {
  it("a ~2-week project opens at day zoom", () => {
    expect(chooseInitialZoom({ from: "2026-01-01", to: "2026-01-14" })).toBe("day");
  });
  it("an 18-month project opens coarse (month or quarter), not day", () => {
    const z = chooseInitialZoom({ from: "2026-01-01", to: "2027-06-30" });
    expect(z).not.toBe("day");
    expect(["month", "quarter"]).toContain(z);
  });
});

describe("barGeom", () => {
  const origin = axisOrigin({ from: "2026-01-01", to: "2026-02-01" }); // 2025-12-29

  it("a 1-day span is one px-per-day wide (never zero), at day zoom", () => {
    const g = barGeom("2026-01-01", "2026-01-01", origin, "day");
    expect(g.isPoint).toBe(false);
    expect(g.width).toBe(PX_PER_DAY.day); // 1 inclusive day
    expect(g.x).toBe(dateToX("2026-01-01", origin, "day"));
  });

  it("a 10-day span scales with zoom", () => {
    const d = barGeom("2026-01-01", "2026-01-10", origin, "day");
    const m = barGeom("2026-01-01", "2026-01-10", origin, "month");
    expect(d.width).toBeCloseTo(10 * PX_PER_DAY.day);
    expect(m.width).toBeCloseTo(Math.max(MIN_BAR_PX, 10 * PX_PER_DAY.month));
  });

  it("a due-date-only task is a POINT marker, not a zero-width bar (2c)", () => {
    const g = barGeom(null, "2026-01-15", origin, "day");
    expect(g.isPoint).toBe(true);
    expect(g.width).toBe(0);
    expect(g.x).toBe(dateToX("2026-01-15", origin, "day"));
  });

  it("no dates at all → empty (nothing placed)", () => {
    expect(barGeom(null, null, origin, "day").empty).toBe(true);
  });
});

describe("xToDate snaps to whole days", () => {
  const origin = "2026-01-01";
  it("round-trips a date through pixels", () => {
    const x = dateToX("2026-01-08", origin, "day");
    expect(xToDate(x, origin, "day")).toBe("2026-01-08");
    // a sub-day pixel nudge still snaps to the nearest whole day
    expect(xToDate(x + PX_PER_DAY.day * 0.4, origin, "day")).toBe("2026-01-08");
    expect(xToDate(x + PX_PER_DAY.day * 0.6, origin, "day")).toBe("2026-01-09");
  });
});

describe("flattenRows — collapse + job summary (2c)", () => {
  const child1 = task("c1", { bar_start: "2026-01-02", bar_end: "2026-01-05", is_point: false, has_no_dates: false });
  const child2 = task("c2", { bar_start: "2026-01-06", bar_end: "2026-01-12", is_point: false, has_no_dates: false });
  const parent = task("p1", { children: [child1, child2] });
  const job: GanttJobRow = {
    job_id: "j1",
    label: "Main Job",
    job_type: "main_job",
    status: "active",
    planned_start_date: null,
    planned_end_date: null,
    actual_start_date: null,
    actual_end_date: null,
    tasks: [parent],
  };
  const gantt: ProjectGantt = {
    project_id: "pr1",
    today: "2026-01-07",
    jobs: [job],
    project_tasks: [],
    task_dependencies: [],
    job_dependencies: [],
    milestones: [],
    baselines: [],
    range: { from: "2026-01-02", to: "2026-01-12" },
  };

  it("job summary span covers all descendant bars", () => {
    expect(jobSummarySpan(job)).toEqual({ start: "2026-01-02", end: "2026-01-12" });
  });

  it("expanded shows job + parent + children in order", () => {
    const rows = flattenRows(gantt, new Set());
    expect(rows.map((r) => r.id)).toEqual(["j1", "p1", "c1", "c2"]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 2]);
  });

  it("collapsing the job hides its children but keeps the summary bar", () => {
    const rows = flattenRows(gantt, new Set(["j1"]));
    expect(rows.map((r) => r.id)).toEqual(["j1"]);
    expect(rows[0].barStart).toBe("2026-01-02");
    expect(rows[0].barEnd).toBe("2026-01-12");
  });

  it("collapsing a parent task hides only its subtree", () => {
    const rows = flattenRows(gantt, new Set(["p1"]));
    expect(rows.map((r) => r.id)).toEqual(["j1", "p1"]);
  });
});

describe("applyDrag (2d) — snap to whole days, no inversion", () => {
  it("move shifts start and end together by the snapped day delta", () => {
    const r = applyDrag("2026-01-01", "2026-01-10", PX_PER_DAY.day * 3, "day", "move");
    expect(r).toEqual({ start: "2026-01-04", end: "2026-01-13" });
  });
  it("a sub-day pixel delta snaps (0.4 day → 0 at day zoom)", () => {
    const r = applyDrag("2026-01-01", "2026-01-10", PX_PER_DAY.day * 0.4, "day", "move");
    expect(r).toEqual({ start: "2026-01-01", end: "2026-01-10" });
  });
  it("resize-end never crosses start", () => {
    const r = applyDrag("2026-01-05", "2026-01-10", -PX_PER_DAY.day * 20, "day", "resize-end");
    expect(r.end).toBe("2026-01-05"); // clamped to start
  });
  it("the same pixel delta means fewer days at a coarser zoom", () => {
    const day = applyDrag("2026-01-01", "2026-01-10", 100, "day", "move");
    const month = applyDrag("2026-01-01", "2026-01-10", 100, "month", "move");
    expect(daysBetween("2026-01-01", day.start)).toBeLessThan(daysBetween("2026-01-01", month.start));
  });
});

describe("isDependencyViolated — flag, don't block (2d)", () => {
  const pred = { start: "2026-01-01", end: "2026-01-10" };
  it("FS: successor starting before predecessor end is violated", () => {
    expect(isDependencyViolated({ dependency_type: "FS", lag_days: 0 }, pred, { start: "2026-01-05", end: "2026-01-08" })).toBe(true);
    expect(isDependencyViolated({ dependency_type: "FS", lag_days: 0 }, pred, { start: "2026-01-11", end: "2026-01-14" })).toBe(false);
  });
  it("FS+lag: the gap must clear the lag too", () => {
    // pred ends 01-10, +3 lag → successor must start ≥ 01-13
    expect(isDependencyViolated({ dependency_type: "FS", lag_days: 3 }, pred, { start: "2026-01-12", end: "2026-01-14" })).toBe(true);
    expect(isDependencyViolated({ dependency_type: "FS", lag_days: 3 }, pred, { start: "2026-01-13", end: "2026-01-14" })).toBe(false);
  });
  it("SS / FF evaluate the right endpoints", () => {
    expect(isDependencyViolated({ dependency_type: "SS", lag_days: 0 }, pred, { start: "2025-12-31", end: "2026-01-02" })).toBe(true);
    expect(isDependencyViolated({ dependency_type: "FF", lag_days: 0 }, pred, { start: "2026-01-01", end: "2026-01-09" })).toBe(true);
  });
});

describe("arrowGeom (2e) — four types + lag", () => {
  const pred = { x: 100, width: 40, cy: 20 }; // ends at 140
  const succ = { x: 200, width: 40, cy: 60 }; // ends at 240

  it("FS routes predecessor END → successor START", () => {
    const a = arrowGeom({ dependency_type: "FS", lag_days: 0 }, pred, succ, "day");
    expect(a.sx).toBe(140);
    expect(a.tx).toBe(200);
    expect(a.lag).toBeNull();
    expect(a.path).toContain("M 140 20");
  });
  it("SS routes START → START, FF routes END → END, SF START → END", () => {
    expect(arrowGeom({ dependency_type: "SS", lag_days: 0 }, pred, succ, "day")).toMatchObject({ sx: 100, tx: 200 });
    expect(arrowGeom({ dependency_type: "FF", lag_days: 0 }, pred, succ, "day")).toMatchObject({ sx: 140, tx: 240 });
    expect(arrowGeom({ dependency_type: "SF", lag_days: 0 }, pred, succ, "day")).toMatchObject({ sx: 100, tx: 240 });
  });
  it("a non-zero lag renders a labelled dashed segment (FS+3 ≠ FS+0)", () => {
    const a = arrowGeom({ dependency_type: "FS", lag_days: 3 }, pred, succ, "day");
    expect(a.lag).not.toBeNull();
    expect(a.lag!.label).toBe("+3d");
    expect(Math.abs(a.lag!.x2 - a.lag!.x1)).toBeCloseTo(3 * PX_PER_DAY.day);
  });
});

describe("visibleRowRange (2f) — only the visible window is rendered", () => {
  it("windows a 500-row project to a small slice", () => {
    const { start, end } = visibleRowRange(0, 680, 500); // ~20 rows tall viewport
    expect(start).toBe(0);
    expect(end).toBeLessThan(60); // nowhere near 500
  });
  it("scrolling advances the window with overscan", () => {
    const r = visibleRowRange(3400, 680, 500);
    expect(r.start).toBeGreaterThan(80);
    expect(r.end).toBeGreaterThan(r.start);
    expect(r.end).toBeLessThanOrEqual(500);
  });
});

describe("axisHeader — two-tier, bounded to the visible window", () => {
  it("day zoom: unit band is day-of-month, top band is months", () => {
    const origin = "2026-01-01";
    const h = axisHeader(origin, "day", "2026-01-01", "2026-01-05");
    expect(h.unit.map((t) => t.label)).toEqual(["1", "2", "3", "4", "5"]);
    expect(h.top.length).toBeGreaterThanOrEqual(1);
    expect(h.top[0].label).toMatch(/Jan 2026/);
  });
  it("quarter zoom: unit band is quarters, top band is years", () => {
    const h = axisHeader("2026-01-01", "quarter", "2026-01-01", "2026-12-31");
    expect(h.unit.map((t) => t.label)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(h.top[0].label).toBe("2026");
  });
});
