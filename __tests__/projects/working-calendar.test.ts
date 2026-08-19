// GANTT-CAL — the working-calendar maths: add across weekends/holidays, count over
// spans, ordinal round-trips, the all-days identity (so the default reproduces
// calendar behaviour), snapping, and config validation.

import { describe, it, expect } from "vitest";
import {
  makeWorkingCalendar,
  addWorkingDaysISO,
  countWorkingDaysISO,
  isWorkingDayISO,
  snapISOToWorkingDay,
  snapDragResult,
  nonWorkingRuns,
  validateCalendarConfig,
  DEFAULT_WORKING_CALENDAR,
  ALL_DAYS_CALENDAR,
} from "@/lib/gantt/working-calendar";
import { toDayNum } from "@/lib/gantt/geometry";

// Mon–Fri, plus one holiday: 2026-03-16 (a Monday).
const cal = makeWorkingCalendar({ workingWeekdays: [1, 2, 3, 4, 5], holidays: ["2026-03-16"] });

describe("isWorkingDay", () => {
  it("weekdays work, weekends and holidays don't", () => {
    expect(isWorkingDayISO(cal, "2026-03-06")).toBe(true); // Friday
    expect(isWorkingDayISO(cal, "2026-03-07")).toBe(false); // Saturday
    expect(isWorkingDayISO(cal, "2026-03-08")).toBe(false); // Sunday
    expect(isWorkingDayISO(cal, "2026-03-16")).toBe(false); // holiday (Monday)
  });
});

describe("addWorkingDays", () => {
  it("adds across a weekend", () => {
    // Fri 2026-03-06 + 1 working day → Mon 2026-03-09 (skips Sat/Sun)
    expect(addWorkingDaysISO(cal, "2026-03-06", 1)).toBe("2026-03-09");
  });
  it("adds across a holiday", () => {
    // Fri 2026-03-13 + 1 working day → Mon 16th is a holiday → Tue 2026-03-17
    expect(addWorkingDaysISO(cal, "2026-03-13", 1)).toBe("2026-03-17");
  });
  it("adds across both a weekend and a holiday", () => {
    // Thu 2026-03-12 + 2 working days: Fri 13 (1), skip Sat/Sun, skip Mon 16 holiday,
    // Tue 17 (2) → 2026-03-17
    expect(addWorkingDaysISO(cal, "2026-03-12", 2)).toBe("2026-03-17");
  });
  it("goes backward (negative = lead)", () => {
    // Mon 2026-03-09 − 1 working day → Fri 2026-03-06
    expect(addWorkingDaysISO(cal, "2026-03-09", -1)).toBe("2026-03-06");
  });
});

describe("countWorkingDays (inclusive)", () => {
  it("a Friday-to-Monday span is 2 working days (Fri, Mon)", () => {
    expect(countWorkingDaysISO(cal, "2026-03-06", "2026-03-09")).toBe(2);
  });
  it("a full Mon–Fri week is 5", () => {
    expect(countWorkingDaysISO(cal, "2026-03-02", "2026-03-06")).toBe(5);
  });
  it("a span containing a holiday drops that day", () => {
    // Mon 16 (holiday) … Fri 20 → Tue,Wed,Thu,Fri = 4
    expect(countWorkingDaysISO(cal, "2026-03-16", "2026-03-20")).toBe(4);
  });
  it("a two-week span", () => {
    // 2026-03-02 (Mon) .. 2026-03-13 (Fri) = 10 working days
    expect(countWorkingDaysISO(cal, "2026-03-02", "2026-03-13")).toBe(10);
  });
});

describe("ordinal round-trips", () => {
  it("fromOrd(toOrd(d)) returns the same working day", () => {
    for (const iso of ["2026-03-02", "2026-03-06", "2026-03-17", "2026-03-31", "2026-07-02"]) {
      const d = toDayNum(iso);
      expect(cal.fromOrd(cal.toOrd(d))).toBe(d);
    }
  });
  it("consecutive working days have consecutive ordinals", () => {
    const fri = toDayNum("2026-03-06");
    const mon = toDayNum("2026-03-09");
    expect(cal.toOrd(mon)).toBe(cal.toOrd(fri) + 1); // weekend collapses
  });
});

describe("all-days calendar is the identity (default behaviour preserved)", () => {
  const all = makeWorkingCalendar(ALL_DAYS_CALENDAR);
  it("toOrd is the day-number and every count is the calendar span", () => {
    expect(all.isAllDays).toBe(true);
    const d = toDayNum("2026-03-06");
    expect(all.toOrd(d)).toBe(d);
    expect(all.fromOrd(d)).toBe(d);
    expect(countWorkingDaysISO(all, "2026-03-06", "2026-03-09")).toBe(4); // inclusive calendar
    expect(addWorkingDaysISO(all, "2026-03-06", 1)).toBe("2026-03-07");
  });
});

describe("snapToWorkingDay", () => {
  it("snaps a weekend date to the nearest working day", () => {
    expect(snapISOToWorkingDay(cal, "2026-03-07")).toBe("2026-03-06"); // Sat → Fri (closer)
    expect(snapISOToWorkingDay(cal, "2026-03-08")).toBe("2026-03-09"); // Sun → Mon (closer)
    expect(snapISOToWorkingDay(cal, "2026-03-06")).toBe("2026-03-06"); // already working
  });
});

describe("validateCalendarConfig", () => {
  it("keeps valid weekdays + holidays, sorted + deduped", () => {
    const c = validateCalendarConfig({ workingWeekdays: [5, 1, 1, 3], holidays: ["2026-07-01", "2026-07-01", "bad"] });
    expect(c).toEqual({ workingWeekdays: [1, 3, 5], holidays: ["2026-07-01"] });
  });
  it("rejects an empty working week and malformed input", () => {
    expect(validateCalendarConfig({ workingWeekdays: [], holidays: [] })).toBeNull();
    expect(validateCalendarConfig(null)).toBeNull();
    expect(validateCalendarConfig({ workingWeekdays: [1] })).toBeNull();
  });
});

describe("snapDragResult — drag lands on working days (7)", () => {
  it("a MOVE that lands the start on a weekend snaps it, carrying the end", () => {
    // move Thu 03-05→Fri 03-06 by landing start on Sun 03-08 → snaps to Mon 03-09,
    // end carried by the same shift.
    const r = snapDragResult(cal, { start: "2026-03-08", end: "2026-03-09" }, "move");
    expect(isWorkingDayISO(cal, r.start)).toBe(true);
    expect(r.start).toBe("2026-03-09"); // Sun → Mon
    expect(r.end).toBe("2026-03-10"); // shifted +1 with the start
  });
  it("a RESIZE-END on a weekend snaps the end to a working day", () => {
    const r = snapDragResult(cal, { start: "2026-03-06", end: "2026-03-07" }, "resize-end");
    expect(isWorkingDayISO(cal, r.end)).toBe(true);
    expect(r.start).toBe("2026-03-06");
  });
  it("all-days calendar leaves the drag untouched", () => {
    const all = makeWorkingCalendar(ALL_DAYS_CALENDAR);
    expect(snapDragResult(all, { start: "2026-03-07", end: "2026-03-08" }, "move")).toEqual({ start: "2026-03-07", end: "2026-03-08" });
  });
});

describe("nonWorkingRuns — axis shading spans", () => {
  it("groups a weekend into one run and finds the holiday", () => {
    // 2026-03-06 Fri … 2026-03-17 Tue. Weekend 03-07/08, holiday Mon 03-16.
    const runs = nonWorkingRuns(cal, toDayNum("2026-03-06"), toDayNum("2026-03-17"));
    const asIso = runs.map((r) => [new Date(r.from * 86400000).toISOString().slice(0, 10), new Date(r.to * 86400000).toISOString().slice(0, 10)]);
    expect(asIso).toContainEqual(["2026-03-07", "2026-03-08"]); // the weekend run
    expect(asIso).toContainEqual(["2026-03-14", "2026-03-16"]); // Sat+Sun+holiday Mon
  });
  it("an all-days calendar shades nothing", () => {
    const all = makeWorkingCalendar(ALL_DAYS_CALENDAR);
    expect(nonWorkingRuns(all, 0, 100)).toEqual([]);
  });
});

describe("the seeded default is Mon–Fri with holidays", () => {
  it("Canada Day 2026 is not a working day under the default", () => {
    const d = makeWorkingCalendar(DEFAULT_WORKING_CALENDAR);
    expect(isWorkingDayISO(d, "2026-07-01")).toBe(false);
    expect(isWorkingDayISO(d, "2026-06-30")).toBe(true);
  });
});
