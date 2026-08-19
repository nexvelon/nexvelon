// UIDG-14 — resource load: who is scheduled for what, against their capacity, and
// where they're over-committed. PURE (no React, unit-tested), in the style of
// critical-path.ts. The Gantt shows what's scheduled; this shows whether anyone is
// free to do it.
//
// Design (see the PR body): TWO sources, both counted + labelled (2a) — PLANNED
// load from task assignees (a concurrency COUNT — tasks carry no hours, so none is
// fabricated, §2.8) and BOOKED load from dispatch assignments (real HOURS). These
// are different units, kept distinct, never blended. CAPACITY from tech_working_
// hours minus approved absences (2c); a tech with no working-hours rows reads as
// "no capacity set" (null), NEVER 0. Subcontractors appear with capacity "not
// tracked" (2d). PROJECT-SCOPED (2e). A day is over-allocated when booked > capacity
// or ≥2 concurrent planned tasks (2f). Deterministic; O(P·D + T + B).

import { toDayNum, fromDayNum } from "./geometry";
import { makeWorkingCalendar, ALL_DAYS_CALENDAR, type WorkingCalendarConfig } from "./working-calendar";

const MS_DAY = 86_400_000;
const MS_HOUR = 3_600_000;

export const OVER_ALLOC_EPS = 0.01; // hours — exactly-at-capacity is full, not over.
export const MAX_CONCURRENT_OK = 1; // ≥2 concurrent planned tasks → over-allocated.

export type PersonKind = "tech" | "subcontractor";

export interface RlPerson {
  id: string;
  name: string;
  kind: PersonKind;
}
/** A task assignment (planned). Day-grained; no hours. */
export interface RlTask {
  id: string;
  title: string;
  personId: string;
  start: string; // yyyy-mm-dd
  end: string; // yyyy-mm-dd (inclusive)
}
/** A dispatch booking (booked). Timestamped → real hours. Tech only. */
export interface RlBooking {
  techId: string;
  startsAt: string; // ISO timestamptz
  endsAt: string;
  label: string;
}
/** A weekly working-hours row (minutes since midnight). */
export interface RlWorkingHours {
  techId: string;
  dayOfWeek: number; // 0=Sun … 6=Sat (matches JS getUTCDay)
  startMinute: number;
  endMinute: number;
}
/** An approved absence (timestamptz range). */
export interface RlAbsence {
  techId: string;
  startsAt: string;
  endsAt: string;
}

export interface RlInput {
  people: RlPerson[];
  tasks: RlTask[];
  bookings: RlBooking[];
  workingHours: RlWorkingHours[];
  absences: RlAbsence[];
}

export interface RlDay {
  date: string;
  /** null = capacity unknown (no working pattern) — never treated as 0 (§2.8). */
  capacityHours: number | null;
  bookedHours: number;
  /** Titles of the assigned tasks active that day (planned concurrency). */
  plannedTasks: string[];
  /** bookedHours / capacityHours × 100, or null when capacity is unknown. */
  utilisationPct: number | null;
  overAllocated: boolean;
}

export interface RlRow {
  person: RlPerson;
  days: RlDay[];
  totalBookedHours: number;
  totalCapacityHours: number; // sum of KNOWN day capacities
  capacityKnown: boolean;
  overallUtilPct: number | null;
  overAllocatedDays: number;
  maxConcurrentPlanned: number;
  hasWork: boolean; // any task or booking in the window
}

export interface ResourceLoad {
  from: string;
  to: string;
  rows: RlRow[];
  /** false → nothing assigned in the window (honest empty state, not a zero grid). */
  hasAnyAssignment: boolean;
}

// ─── interval helpers (minutes-of-day) ───────────────────────────────────────

type Interval = [number, number];

/** Union of intervals, merged and sorted — so overlapping absences don't double-count. */
function mergeIntervals(list: Interval[]): Interval[] {
  if (list.length === 0) return [];
  const sorted = [...list].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Interval[] = [sorted[0].slice() as Interval];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i][0] <= last[1]) last[1] = Math.max(last[1], sorted[i][1]);
    else out.push(sorted[i].slice() as Interval);
  }
  return out;
}

function overlapLen(a: Interval, b: Interval): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

// ─── capacity ─────────────────────────────────────────────────────────────────

interface TechCal {
  hasRows: boolean;
  /** dow → working intervals (minutes since midnight). */
  byDow: Map<number, Interval[]>;
  absences: Interval[]; // absolute ms ranges
}

function buildTechCalendars(input: RlInput): Map<string, TechCal> {
  const cals = new Map<string, TechCal>();
  const ensure = (techId: string): TechCal => {
    let c = cals.get(techId);
    if (!c) {
      c = { hasRows: false, byDow: new Map(), absences: [] };
      cals.set(techId, c);
    }
    return c;
  };
  for (const w of input.workingHours) {
    const c = ensure(w.techId);
    c.hasRows = true;
    const list = c.byDow.get(w.dayOfWeek) ?? [];
    list.push([w.startMinute, w.endMinute]);
    c.byDow.set(w.dayOfWeek, list);
  }
  for (const a of input.absences) {
    const c = ensure(a.techId);
    c.absences.push([Date.parse(a.startsAt), Date.parse(a.endsAt)]);
  }
  return cals;
}

/** A tech's available capacity (hours) for one calendar day: working intervals for
 *  that DOW minus the approved-absence overlap. null when the tech has no pattern. */
function capacityForDay(cal: TechCal | undefined, dayNum: number): number | null {
  if (!cal || !cal.hasRows) return null; // no working pattern → unknown
  const dow = new Date(dayNum * MS_DAY).getUTCDay();
  const working = mergeIntervals(cal.byDow.get(dow) ?? []);
  if (working.length === 0) return 0; // a defined schedule with a day off

  const dayStartMs = dayNum * MS_DAY;
  // Approved-absence minutes-of-day, clipped to [0,1440] and merged.
  const absMins: Interval[] = [];
  for (const [aStart, aEnd] of cal.absences) {
    const s = Math.max(0, Math.min(1440, (aStart - dayStartMs) / 60000));
    const e = Math.max(0, Math.min(1440, (aEnd - dayStartMs) / 60000));
    if (e > s) absMins.push([s, e]);
  }
  const absMerged = mergeIntervals(absMins);

  let minutes = 0;
  for (const wi of working) {
    let avail = wi[1] - wi[0];
    for (const ai of absMerged) avail -= overlapLen(wi, ai);
    minutes += Math.max(0, avail);
  }
  return minutes / 60;
}

// ─── the computation ─────────────────────────────────────────────────────────

export function computeResourceLoad(
  input: RlInput,
  from: string,
  to: string,
  calendar?: WorkingCalendarConfig
): ResourceLoad {
  const fromDay = toDayNum(from);
  const toDay = toDayNum(to);
  const cals = buildTechCalendars(input);
  // GANTT-CAL — org non-working days (holidays) zero a tech's KNOWN capacity, so
  // load and scheduling agree. Default all-days → no change (calendar-day behaviour).
  const orgCal = makeWorkingCalendar(calendar ?? ALL_DAYS_CALENDAR);

  // Index work by person.
  const tasksByPerson = new Map<string, RlTask[]>();
  for (const t of input.tasks) {
    const list = tasksByPerson.get(t.personId) ?? [];
    list.push(t);
    tasksByPerson.set(t.personId, list);
  }
  const bookingsByTech = new Map<string, RlBooking[]>();
  for (const b of input.bookings) {
    const list = bookingsByTech.get(b.techId) ?? [];
    list.push(b);
    bookingsByTech.set(b.techId, list);
  }

  const rows: RlRow[] = [];
  let hasAnyAssignment = false;

  // Deterministic person order (name, then id).
  const people = [...input.people].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  for (const person of people) {
    const tasks = tasksByPerson.get(person.id) ?? [];
    const bookings = person.kind === "tech" ? bookingsByTech.get(person.id) ?? [] : [];
    if (tasks.length === 0 && bookings.length === 0) continue; // nothing in scope for them
    hasAnyAssignment = true;

    const cal = person.kind === "tech" ? cals.get(person.id) : undefined;
    const days: RlDay[] = [];
    let totalBooked = 0;
    let totalCapacity = 0;
    let capacityKnown = false;
    let overAllocatedDays = 0;
    let maxConcurrent = 0;

    for (let d = fromDay; d <= toDay; d++) {
      const date = fromDayNum(d);
      const dayStartMs = d * MS_DAY;
      const dayEndMs = dayStartMs + MS_DAY;

      // planned concurrency (task titles active this day)
      const plannedTasks: string[] = [];
      for (const t of tasks) {
        if (toDayNum(t.start) <= d && d <= toDayNum(t.end)) plannedTasks.push(t.title);
      }

      // booked hours (real, from dispatch)
      let booked = 0;
      for (const b of bookings) {
        const s = Date.parse(b.startsAt);
        const e = Date.parse(b.endsAt);
        booked += Math.max(0, Math.min(e, dayEndMs) - Math.max(s, dayStartMs)) / MS_HOUR;
      }

      let capacityHours = person.kind === "tech" ? capacityForDay(cal, d) : null;
      // A known capacity on an org holiday drops to 0 (business closed); an unknown
      // capacity stays unknown (we still don't know their hours).
      if (capacityHours != null && !orgCal.isWorkingDay(d)) capacityHours = 0;
      if (capacityHours != null) {
        capacityKnown = true;
        totalCapacity += capacityHours;
      }
      totalBooked += booked;
      if (plannedTasks.length > maxConcurrent) maxConcurrent = plannedTasks.length;

      const overAllocated =
        (capacityHours != null && booked > capacityHours + OVER_ALLOC_EPS) ||
        plannedTasks.length > MAX_CONCURRENT_OK;
      if (overAllocated) overAllocatedDays++;

      days.push({
        date,
        capacityHours,
        bookedHours: round2(booked),
        plannedTasks,
        utilisationPct:
          capacityHours != null && capacityHours > 0 ? round2((booked / capacityHours) * 100) : null,
        overAllocated,
      });
    }

    rows.push({
      person,
      days,
      totalBookedHours: round2(totalBooked),
      totalCapacityHours: round2(totalCapacity),
      capacityKnown,
      overallUtilPct: capacityKnown && totalCapacity > 0 ? round2((totalBooked / totalCapacity) * 100) : null,
      overAllocatedDays,
      maxConcurrentPlanned: maxConcurrent,
      hasWork: true,
    });
  }

  return { from, to, rows, hasAnyAssignment };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
