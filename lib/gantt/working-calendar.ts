// GANTT-CAL — the ONE working-calendar implementation (pure, unit-tested), reused
// by the critical path (lib/gantt/critical-path.ts), the resource lane
// (resource-load.ts), drag snapping and the axis shading. Two calendars in one
// codebase would diverge, so everything working-day goes through here.
//
// Model (2d): a working-day ORDINAL remap. toOrd(day) = the count of working days
// before a date (absolute, epoch-based); fromOrd(k) = the date of the k-th working
// day. The CPM passes run unchanged in ordinal space, then convert back. A full
// working week with no holidays makes toOrd the identity — so an all-days calendar
// reproduces calendar-day behaviour exactly (the default until an org calendar is
// configured, §2g).

import { toDayNum, fromDayNum } from "./geometry";

const MS_DAY = 86_400_000;

export interface WorkingCalendarConfig {
  /** Which weekdays are working (0=Sun … 6=Sat). */
  workingWeekdays: number[];
  /** Non-working holiday dates (yyyy-mm-dd). */
  holidays: string[];
}

// Mon–Fri.
export const DEFAULT_WORKING_WEEKDAYS = [1, 2, 3, 4, 5];

// Ontario statutory holidays 2025–2027 (Nexvelon is a Brampton business). Seeded so
// the fix works out of the box; an Admin can override the whole list (2b).
export const ONTARIO_STAT_HOLIDAYS_2025_2027: string[] = [
  // 2025
  "2025-01-01", "2025-02-17", "2025-04-18", "2025-05-19", "2025-07-01",
  "2025-09-01", "2025-10-13", "2025-12-25", "2025-12-26",
  // 2026
  "2026-01-01", "2026-02-16", "2026-04-03", "2026-05-18", "2026-07-01",
  "2026-09-07", "2026-10-12", "2026-12-25", "2026-12-26",
  // 2027
  "2027-01-01", "2027-02-15", "2027-03-26", "2027-05-24", "2027-07-01",
  "2027-09-06", "2027-10-11", "2027-12-25", "2027-12-26",
];

export const DEFAULT_WORKING_CALENDAR: WorkingCalendarConfig = {
  workingWeekdays: DEFAULT_WORKING_WEEKDAYS,
  holidays: ONTARIO_STAT_HOLIDAYS_2025_2027,
};

/** An all-days-working calendar → toOrd/fromOrd are the identity (calendar-day
 *  behaviour). Used as the default when no org calendar is configured. */
export const ALL_DAYS_CALENDAR: WorkingCalendarConfig = {
  workingWeekdays: [0, 1, 2, 3, 4, 5, 6],
  holidays: [],
};

export interface WorkingCalendar {
  config: WorkingCalendarConfig;
  /** All 7 weekdays work and no holidays → calendar-day arithmetic. */
  isAllDays: boolean;
  isWorkingDay(dayNum: number): boolean;
  /** Working days strictly before `dayNum` (the ordinal of `dayNum` if it is a
   *  working day; otherwise the ordinal of the next working day). */
  toOrd(dayNum: number): number;
  /** The day-number of the k-th (0-based) working day. */
  fromOrd(ord: number): number;
  /** Inclusive working days in [aDay, bDay]. */
  countWorking(aDay: number, bDay: number): number;
  /** The nearest working day ≥ dayNum (a no-op if it is already a working day). */
  nextWorkingDay(dayNum: number): number;
  /** The nearest working day ≤ dayNum. */
  prevWorkingDay(dayNum: number): number;
  /** dayNum moved by `n` working days (n may be negative), landing on a working day. */
  addWorkingDays(dayNum: number, n: number): number;
  /** The nearest working day to dayNum (ties → forward). */
  snapToWorkingDay(dayNum: number): number;
}

function dow(dayNum: number): number {
  return new Date(dayNum * MS_DAY).getUTCDay();
}

/** Count the values in a sorted ascending array that are < x. */
function countLessThan(sorted: number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function makeWorkingCalendar(config: WorkingCalendarConfig): WorkingCalendar {
  const workSet = new Set(config.workingWeekdays);
  const workdaysPerWeek = workSet.size;
  const holidayDays = config.holidays.map(toDayNum);
  const holidaySet = new Set(holidayDays);
  // Holidays that land on a working weekday (only those reduce the ordinal count).
  const workingHolidaySorted = [...new Set(holidayDays.filter((d) => workSet.has(dow(d))))].sort((a, b) => a - b);

  const isAllDays = workdaysPerWeek === 7 && workingHolidaySorted.length === 0;

  const isWorkingDay = (dayNum: number): boolean => workSet.has(dow(dayNum)) && !holidaySet.has(dayNum);

  // Working weekdays in [0, dayNum), ignoring holidays.
  const weekdayWorkBefore = (dayNum: number): number => {
    if (dayNum <= 0) {
      // rare (pre-epoch); fall back to a direct scan bounded by |dayNum|
      let c = 0;
      for (let x = dayNum; x < 0; x++) if (workSet.has(dow(x))) c++;
      return -c;
    }
    const fullWeeks = Math.floor(dayNum / 7);
    let count = fullWeeks * workdaysPerWeek;
    for (let x = fullWeeks * 7; x < dayNum; x++) if (workSet.has(dow(x))) count++;
    return count;
  };

  const toOrd = (dayNum: number): number =>
    weekdayWorkBefore(dayNum) - countLessThan(workingHolidaySorted, dayNum);

  const nextWorkingDay = (dayNum: number): number => {
    let d = dayNum;
    // bounded: at most a week of weekend + a run of holidays
    for (let i = 0; i < 400 && !isWorkingDay(d); i++) d++;
    return d;
  };
  const prevWorkingDay = (dayNum: number): number => {
    let d = dayNum;
    for (let i = 0; i < 400 && !isWorkingDay(d); i++) d--;
    return d;
  };

  const fromOrd = (ord: number): number => {
    if (isAllDays) return ord;
    // The k-th working day is nextWorkingDay(smallest d with toOrd(d) ≥ ord).
    // toOrd is monotonic non-decreasing → binary search a generous day window.
    const approx = Math.round((ord * 7) / Math.max(1, workdaysPerWeek));
    let lo = approx - 60;
    let hi = approx + 60 + workingHolidaySorted.length + 14;
    // widen if the guess was off
    while (toOrd(lo) > ord) lo -= 120;
    while (toOrd(hi) < ord + 1) hi += 120;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (toOrd(mid) >= ord) hi = mid;
      else lo = mid + 1;
    }
    return nextWorkingDay(lo);
  };

  const countWorking = (aDay: number, bDay: number): number => {
    if (bDay < aDay) return 0;
    return toOrd(bDay + 1) - toOrd(aDay);
  };

  const addWorkingDays = (dayNum: number, n: number): number => {
    if (n === 0) return isWorkingDay(dayNum) ? dayNum : nextWorkingDay(dayNum);
    let d = dayNum;
    const step = n > 0 ? 1 : -1;
    let remaining = Math.abs(n);
    while (remaining > 0) {
      d += step;
      if (isWorkingDay(d)) remaining--;
    }
    return d;
  };

  const snapToWorkingDay = (dayNum: number): number => {
    if (isWorkingDay(dayNum)) return dayNum;
    const fwd = nextWorkingDay(dayNum);
    const back = prevWorkingDay(dayNum);
    return fwd - dayNum <= dayNum - back ? fwd : back;
  };

  return {
    config,
    isAllDays,
    isWorkingDay,
    toOrd,
    fromOrd,
    countWorking,
    nextWorkingDay,
    prevWorkingDay,
    addWorkingDays,
    snapToWorkingDay,
  };
}

// ─── ISO-string conveniences (the callers work in yyyy-mm-dd) ─────────────────

export function isWorkingDayISO(cal: WorkingCalendar, iso: string): boolean {
  return cal.isWorkingDay(toDayNum(iso));
}
export function snapISOToWorkingDay(cal: WorkingCalendar, iso: string): string {
  return fromDayNum(cal.snapToWorkingDay(toDayNum(iso)));
}
export function addWorkingDaysISO(cal: WorkingCalendar, iso: string, n: number): string {
  return fromDayNum(cal.addWorkingDays(toDayNum(iso), n));
}
export function countWorkingDaysISO(cal: WorkingCalendar, fromIso: string, toIso: string): number {
  return cal.countWorking(toDayNum(fromIso), toDayNum(toIso));
}

/** Consecutive runs of NON-working days (weekends + holidays) in [fromDay, toDay],
 *  for axis shading (2f). Returns inclusive day-number pairs; the caller maps them
 *  to pixels. Empty for an all-days calendar. */
export function nonWorkingRuns(
  cal: WorkingCalendar,
  fromDay: number,
  toDay: number
): Array<{ from: number; to: number }> {
  if (cal.isAllDays) return [];
  const runs: Array<{ from: number; to: number }> = [];
  let runStart: number | null = null;
  for (let d = fromDay; d <= toDay; d++) {
    if (!cal.isWorkingDay(d)) {
      if (runStart === null) runStart = d;
    } else if (runStart !== null) {
      runs.push({ from: runStart, to: d - 1 });
      runStart = null;
    }
  }
  if (runStart !== null) runs.push({ from: runStart, to: toDay });
  return runs;
}

/** Snap a dragged/resized {start,end} onto working days: a MOVE snaps the start
 *  and carries the end by the same shift (preserving the span); a RESIZE snaps the
 *  dragged edge (never inverting the bar). All-days calendar → unchanged. */
export function snapDragResult(
  cal: WorkingCalendar,
  next: { start: string; end: string },
  mode: "move" | "resize-start" | "resize-end"
): { start: string; end: string } {
  if (cal.isAllDays) return next;
  if (mode === "move") {
    const ns = cal.snapToWorkingDay(toDayNum(next.start));
    const shift = ns - toDayNum(next.start);
    return { start: fromDayNum(ns), end: fromDayNum(toDayNum(next.end) + shift) };
  }
  if (mode === "resize-start") {
    const ns = cal.snapToWorkingDay(toDayNum(next.start));
    const endDay = toDayNum(next.end);
    return { start: fromDayNum(Math.min(ns, endDay)), end: next.end };
  }
  const ne = cal.snapToWorkingDay(toDayNum(next.end));
  const startDay = toDayNum(next.start);
  return { start: next.start, end: fromDayNum(Math.max(ne, startDay)) };
}

// ─── Config validation (for the settings action) ─────────────────────────────

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Coerce arbitrary stored/incoming JSON into a valid config, else null. */
export function validateCalendarConfig(raw: unknown): WorkingCalendarConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { workingWeekdays?: unknown; holidays?: unknown };
  if (!Array.isArray(o.workingWeekdays) || !Array.isArray(o.holidays)) return null;
  const weekdays = [...new Set(o.workingWeekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (weekdays.length === 0) return null; // a week with no working days is nonsense
  const holidays = [...new Set(o.holidays.filter((h): h is string => typeof h === "string" && ISO_RE.test(h)))].sort();
  return { workingWeekdays: weekdays, holidays };
}
