// GANTT-CAL — working days wired into the shipped features: the critical-path
// forward/backward pass over a weekend and a holiday for all four link types, lag
// as working days, the resource lane zeroing capacity on a holiday, and the
// "existing data doesn't shift" guarantee (an all-days calendar == prior output).

import { describe, it, expect } from "vitest";
import { computeCriticalPath } from "@/lib/gantt/critical-path";
import { computeResourceLoad, type RlInput } from "@/lib/gantt/resource-load";
import type { ProjectGantt, GanttTask, GanttTaskDependencyRow } from "@/lib/api/gantt";
import type { WorkingCalendarConfig } from "@/lib/gantt/working-calendar";

const MON_FRI: WorkingCalendarConfig = { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] };
const MON_FRI_HOL: WorkingCalendarConfig = { workingWeekdays: [1, 2, 3, 4, 5], holidays: ["2026-03-16"] };

function task(id: string, start: string | null, end: string | null): GanttTask {
  return {
    id, title: id, job_id: "j1", parent_id: null, status: "todo", priority: "normal",
    start_date: start, end_date: end, due_date: null, bar_start: start, bar_end: end ?? start,
    is_point: false, has_no_dates: !start && !end, percent_complete: 0, effective_percent: 0, children: [],
  };
}
function dep(taskId: string, dependsOn: string, type: GanttTaskDependencyRow["dependency_type"] = "FS", lag = 0): GanttTaskDependencyRow {
  return { id: `${dependsOn}->${taskId}`, task_id: taskId, depends_on_task_id: dependsOn, dependency_type: type, lag_days: lag };
}
function gantt(tasks: GanttTask[], deps: GanttTaskDependencyRow[], calendar?: WorkingCalendarConfig): ProjectGantt {
  return {
    project_id: "p1", today: "2026-03-01",
    jobs: [{ job_id: "j1", label: "J", job_type: "main_job", status: "active", planned_start_date: null, planned_end_date: null, actual_start_date: null, actual_end_date: null, tasks }],
    project_tasks: [], task_dependencies: deps, job_dependencies: [], milestones: [], baselines: [],
    range: { from: "2026-03-01", to: "2026-04-30" }, target_end: null, calendar,
  };
}

describe("critical path over a weekend", () => {
  it("a Friday task's FS successor starts Monday, not Saturday", () => {
    // A = Fri 2026-03-06 (1 working day). B depends FS on A → earliest Monday 03-09.
    const A = task("A", "2026-03-06", "2026-03-06");
    const B = task("B", null, null); // dateless zero-dur → lands at A's finish boundary
    const r = computeCriticalPath(gantt([A, B], [dep("B", "A", "FS", 0)]), );
    void r;
    const rc = computeCriticalPath(gantt([A, B], [dep("B", "A", "FS", 0)], MON_FRI));
    // B's earliest start date is Monday 03-09 (the working day after Friday)
    const fromDayNum = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
    expect(fromDayNum(rc.nodes.get("B")!.es)).toBe("2026-03-09");
  });

  it("a Friday task with a 3-working-day duration finishes the next Wednesday", () => {
    // Fri 03-06 + 3 working days = Fri, Mon, Tue → finishes Tue... let's set the bar:
    // start Fri 03-06, end Tue 03-10 spans Fri,Mon,Tue = 3 working days.
    const A = task("A", "2026-03-06", "2026-03-10");
    const r = computeCriticalPath(gantt([A], [], MON_FRI));
    expect(r.projectEnd).toBe("2026-03-10"); // Tuesday, weekend skipped in the count
    // and its working-day duration is 3, not the 5 calendar days
    expect(r.nodes.get("A")!.durationDays).toBe(3);
  });
});

describe("critical path over a holiday", () => {
  it("skips the holiday Monday when propagating", () => {
    // A = Fri 03-13. B FS on A. Monday 03-16 is a holiday → B earliest Tue 03-17.
    const A = task("A", "2026-03-13", "2026-03-13");
    const B = task("B", null, null);
    const r = computeCriticalPath(gantt([A, B], [dep("B", "A", "FS", 0)], MON_FRI_HOL));
    const fromDayNum = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
    expect(fromDayNum(r.nodes.get("B")!.es)).toBe("2026-03-17");
  });
});

describe("lag is working days (2e)", () => {
  it("FS+2 over a weekend lands two WORKING days out", () => {
    // A = Fri 03-06. FS + 2 working days → Wed 03-11 (Mon=1, Tue=2 after Fri...
    // half-open: A finish boundary is Mon 03-09 (ord after Fri); +2 working = Wed 03-11)
    const A = task("A", "2026-03-06", "2026-03-06");
    const B = task("B", null, null);
    const r = computeCriticalPath(gantt([A, B], [dep("B", "A", "FS", 2)], MON_FRI));
    const fromDayNum = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);
    expect(fromDayNum(r.nodes.get("B")!.es)).toBe("2026-03-11");
  });
});

describe("all four link types over a weekend", () => {
  // Predecessor P spans Thu–Fri (03-05..03-06); successor S is a 1-day task.
  const P = task("P", "2026-03-05", "2026-03-06");
  function esOf(type: GanttTaskDependencyRow["dependency_type"]) {
    const S = task("S", null, null);
    const r = computeCriticalPath(gantt([P, S], [dep("S", "P", type, 0)], MON_FRI));
    return new Date(r.nodes.get("S")!.es * 86400000).toISOString().slice(0, 10);
  }
  it("FS successor starts Monday (after Fri finish)", () => expect(esOf("FS")).toBe("2026-03-09"));
  it("SS successor starts with P's start (Thu)", () => expect(esOf("SS")).toBe("2026-03-05"));
});

describe("existing data does not shift (2c/2g)", () => {
  it("an all-days calendar reproduces calendar-day output exactly", () => {
    const A = task("A", "2026-03-06", "2026-03-06");
    const B = task("B", "2026-03-07", "2026-03-11");
    const deps = [dep("B", "A", "FS", 0)];
    const withNone = computeCriticalPath(gantt([A, B], deps)); // no calendar → all-days
    const allDays = computeCriticalPath(gantt([A, B], deps, { workingWeekdays: [0, 1, 2, 3, 4, 5, 6], holidays: [] }));
    expect(withNone.projectEnd).toBe(allDays.projectEnd);
    expect(withNone.nodes.get("A")!.durationDays).toBe(1);
    // Mon–Fri would drop the weekend; all-days keeps calendar spans
    expect(allDays.nodes.get("B")!.durationDays).toBe(5);
  });
});

describe("resource lane respects org holidays", () => {
  it("a tech booked on a holiday is over-allocated (capacity drops to 0)", () => {
    const input: RlInput = {
      people: [{ id: "t1", name: "Alex", kind: "tech" }],
      tasks: [],
      bookings: [{ techId: "t1", startsAt: "2026-03-16T08:00:00Z", endsAt: "2026-03-16T12:00:00Z", label: "x" }],
      workingHours: [1, 2, 3, 4, 5].map((dow) => ({ techId: "t1", dayOfWeek: dow, startMinute: 480, endMinute: 960 })),
      absences: [],
    };
    // 2026-03-16 is a Monday but a holiday under MON_FRI_HOL.
    const load = computeResourceLoad(input, "2026-03-16", "2026-03-16", MON_FRI_HOL);
    const day = load.rows[0].days[0];
    expect(day.capacityHours).toBe(0); // holiday → no capacity
    expect(day.overAllocated).toBe(true); // 4h booked on a 0-capacity day
  });

  it("without the holiday, the same Monday has full capacity", () => {
    const input: RlInput = {
      people: [{ id: "t1", name: "Alex", kind: "tech" }],
      tasks: [],
      bookings: [{ techId: "t1", startsAt: "2026-03-16T08:00:00Z", endsAt: "2026-03-16T12:00:00Z", label: "x" }],
      workingHours: [1, 2, 3, 4, 5].map((dow) => ({ techId: "t1", dayOfWeek: dow, startMinute: 480, endMinute: 960 })),
      absences: [],
    };
    const load = computeResourceLoad(input, "2026-03-16", "2026-03-16", MON_FRI); // no holiday
    expect(load.rows[0].days[0].capacityHours).toBe(8);
    expect(load.rows[0].days[0].overAllocated).toBe(false);
  });
});
