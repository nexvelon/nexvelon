// UIDG-14 — resource load. Per-day allocation from tasks (planned concurrency) and
// bookings (real hours), capacity from working hours minus absences, the no-hours /
// no-capacity / subcontractor honesty cases, the over-allocation threshold, the
// aggregates, determinism, and the performance bound.

import { describe, it, expect } from "vitest";
import {
  computeResourceLoad,
  type RlInput,
  type RlPerson,
} from "@/lib/gantt/resource-load";

const tech = (id: string, name: string): RlPerson => ({ id, name, kind: "tech" });
const sub = (id: string, name: string): RlPerson => ({ id, name, kind: "subcontractor" });

// A Mon–Fri 08:00–16:00 (8h) pattern for a tech. 2026-03-02 is a Monday.
function nineToFive(techId: string) {
  return [1, 2, 3, 4, 5].map((dow) => ({ techId, dayOfWeek: dow, startMinute: 8 * 60, endMinute: 16 * 60 }));
}

function base(over: Partial<RlInput> = {}): RlInput {
  return { people: [], tasks: [], bookings: [], workingHours: [], absences: [], ...over };
}

function dayOf(load: ReturnType<typeof computeResourceLoad>, personId: string, date: string) {
  const row = load.rows.find((r) => r.person.id === personId)!;
  return row.days.find((d) => d.date === date)!;
}

describe("planned load — concurrency count from task assignments (2a/2b)", () => {
  it("counts each assigned task as one concurrency slot per active day", () => {
    const input = base({
      people: [tech("t1", "Alex")],
      workingHours: nineToFive("t1"),
      tasks: [
        { id: "a", title: "Wiring", personId: "t1", start: "2026-03-02", end: "2026-03-04" },
        { id: "b", title: "Panel", personId: "t1", start: "2026-03-03", end: "2026-03-03" },
      ],
    });
    const load = computeResourceLoad(input, "2026-03-02", "2026-03-05");
    expect(dayOf(load, "t1", "2026-03-02").plannedTasks).toEqual(["Wiring"]);
    // two concurrent tasks on the 3rd
    expect(dayOf(load, "t1", "2026-03-03").plannedTasks.sort()).toEqual(["Panel", "Wiring"]);
    expect(dayOf(load, "t1", "2026-03-03").overAllocated).toBe(true); // ≥2 concurrent
    expect(dayOf(load, "t1", "2026-03-04").overAllocated).toBe(false);
  });

  it("a task with no hours never counts as zero load or a full day — it is one slot", () => {
    const input = base({
      people: [tech("t1", "Alex")],
      workingHours: nineToFive("t1"),
      tasks: [{ id: "a", title: "T", personId: "t1", start: "2026-03-02", end: "2026-03-02" }],
    });
    const d = dayOf(computeResourceLoad(input, "2026-03-02", "2026-03-02"), "t1", "2026-03-02");
    expect(d.plannedTasks.length).toBe(1);
    expect(d.bookedHours).toBe(0); // planned tasks don't fabricate booked hours
    expect(d.overAllocated).toBe(false); // one slot is fine
  });
});

describe("booked load — real hours from dispatch (2a/2b)", () => {
  it("apportions a booking's hours to the day", () => {
    const input = base({
      people: [tech("t1", "Alex")],
      workingHours: nineToFive("t1"),
      bookings: [{ techId: "t1", startsAt: "2026-03-02T08:00:00Z", endsAt: "2026-03-02T14:00:00Z", label: "SVC-1" }],
    });
    const d = dayOf(computeResourceLoad(input, "2026-03-02", "2026-03-02"), "t1", "2026-03-02");
    expect(d.bookedHours).toBe(6);
    expect(d.capacityHours).toBe(8);
    expect(d.utilisationPct).toBe(75);
    expect(d.overAllocated).toBe(false);
  });

  it("flags over-allocation when booked hours exceed capacity (2f)", () => {
    const input = base({
      people: [tech("t1", "Alex")],
      workingHours: nineToFive("t1"),
      bookings: [{ techId: "t1", startsAt: "2026-03-02T06:00:00Z", endsAt: "2026-03-02T20:00:00Z", label: "long" }],
    });
    const d = dayOf(computeResourceLoad(input, "2026-03-02", "2026-03-02"), "t1", "2026-03-02");
    expect(d.bookedHours).toBe(14);
    expect(d.overAllocated).toBe(true); // 14 > 8
  });

  it("exactly at capacity is full, NOT over (threshold is strictly above)", () => {
    const input = base({
      people: [tech("t1", "Alex")],
      workingHours: nineToFive("t1"),
      bookings: [{ techId: "t1", startsAt: "2026-03-02T08:00:00Z", endsAt: "2026-03-02T16:00:00Z", label: "full" }],
    });
    const d = dayOf(computeResourceLoad(input, "2026-03-02", "2026-03-02"), "t1", "2026-03-02");
    expect(d.bookedHours).toBe(8);
    expect(d.utilisationPct).toBe(100);
    expect(d.overAllocated).toBe(false);
  });
});

describe("capacity from working hours & absences (2c)", () => {
  it("a defined schedule with no row for the day-of-week is a real day off (0), not unknown", () => {
    const input = base({ people: [tech("t1", "Alex")], workingHours: nineToFive("t1"), tasks: [{ id: "x", title: "T", personId: "t1", start: "2026-03-07", end: "2026-03-07" }] });
    // 2026-03-07 is a Saturday → no working row → capacity 0 (day off)
    const d = dayOf(computeResourceLoad(input, "2026-03-07", "2026-03-07"), "t1", "2026-03-07");
    expect(d.capacityHours).toBe(0);
  });

  it("an approved absence subtracts from capacity", () => {
    const input = base({
      people: [tech("t1", "Alex")],
      workingHours: nineToFive("t1"),
      absences: [{ techId: "t1", startsAt: "2026-03-02T08:00:00Z", endsAt: "2026-03-02T12:00:00Z" }], // 4h off
      tasks: [{ id: "x", title: "T", personId: "t1", start: "2026-03-02", end: "2026-03-02" }],
    });
    const d = dayOf(computeResourceLoad(input, "2026-03-02", "2026-03-02"), "t1", "2026-03-02");
    expect(d.capacityHours).toBe(4); // 8h − 4h absence
  });

  it("a tech with NO working-hours rows reads as no-capacity (null), NEVER 0 or over-allocated (2c)", () => {
    const input = base({
      people: [tech("t1", "Alex")],
      workingHours: [], // none defined
      bookings: [{ techId: "t1", startsAt: "2026-03-02T08:00:00Z", endsAt: "2026-03-02T20:00:00Z", label: "x" }],
    });
    const row = computeResourceLoad(input, "2026-03-02", "2026-03-02").rows.find((r) => r.person.id === "t1")!;
    expect(row.capacityKnown).toBe(false);
    const d = row.days[0];
    expect(d.capacityHours).toBeNull();
    expect(d.utilisationPct).toBeNull();
    expect(d.overAllocated).toBe(false); // 12h booked but capacity unknown → not flagged
  });
});

describe("subcontractors (2d)", () => {
  it("a sub appears with no capacity, planned concurrency only", () => {
    const input = base({
      people: [sub("s1", "Sparks Ltd")],
      tasks: [
        { id: "a", title: "Rough-in", personId: "s1", start: "2026-03-02", end: "2026-03-02" },
        { id: "b", title: "Trim", personId: "s1", start: "2026-03-02", end: "2026-03-02" },
      ],
    });
    const load = computeResourceLoad(input, "2026-03-02", "2026-03-02");
    const row = load.rows.find((r) => r.person.id === "s1")!;
    expect(row.capacityKnown).toBe(false);
    expect(row.overallUtilPct).toBeNull();
    // two concurrent sub tasks → over-allocated on concurrency
    expect(row.days[0].overAllocated).toBe(true);
  });
});

describe("aggregates match the per-day sums, deterministically", () => {
  it("totals and overall utilisation reconcile", () => {
    const input = base({
      people: [tech("t1", "Alex")],
      workingHours: nineToFive("t1"),
      bookings: [
        { techId: "t1", startsAt: "2026-03-02T08:00:00Z", endsAt: "2026-03-02T12:00:00Z", label: "a" }, // 4h
        { techId: "t1", startsAt: "2026-03-03T08:00:00Z", endsAt: "2026-03-03T16:00:00Z", label: "b" }, // 8h
      ],
    });
    const row = computeResourceLoad(input, "2026-03-02", "2026-03-03").rows[0];
    expect(row.totalBookedHours).toBe(12);
    expect(row.totalCapacityHours).toBe(16); // two 8h days
    expect(row.overallUtilPct).toBe(75);
    expect(row.days.reduce((s, d) => s + d.bookedHours, 0)).toBe(row.totalBookedHours);
  });

  it("people are ordered by name (deterministic)", () => {
    const input = base({
      people: [tech("t2", "Zed"), tech("t1", "Amy")],
      tasks: [
        { id: "a", title: "T", personId: "t1", start: "2026-03-02", end: "2026-03-02" },
        { id: "b", title: "T", personId: "t2", start: "2026-03-02", end: "2026-03-02" },
      ],
    });
    const load = computeResourceLoad(input, "2026-03-02", "2026-03-02");
    expect(load.rows.map((r) => r.person.name)).toEqual(["Amy", "Zed"]);
  });
});

describe("honest empty state (§2.8)", () => {
  it("nobody with work in the window → hasAnyAssignment false, no rows", () => {
    const input = base({ people: [tech("t1", "Alex")], workingHours: nineToFive("t1") });
    const load = computeResourceLoad(input, "2026-03-02", "2026-03-05");
    expect(load.hasAnyAssignment).toBe(false);
    expect(load.rows).toHaveLength(0);
  });
});

describe("performance bound", () => {
  it("500 tasks / 30 people over ~550 days computes quickly", () => {
    const people = Array.from({ length: 30 }, (_, i) => tech(`t${i}`, `Tech ${String(i).padStart(2, "0")}`));
    const workingHours = people.flatMap((p) => nineToFive(p.id));
    const tasks = Array.from({ length: 500 }, (_, i) => ({
      id: `k${i}`, title: `Task ${i}`, personId: `t${i % 30}`,
      start: iso("2026-01-01", i), end: iso("2026-01-01", i + 3),
    }));
    const started = now();
    const load = computeResourceLoad(base({ people, workingHours, tasks }), "2026-01-01", "2027-07-01");
    const elapsed = now() - started;
    expect(load.rows.length).toBe(30);
    expect(elapsed).toBeLessThan(500);
  });
});

function iso(from: string, days: number): string {
  return new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
