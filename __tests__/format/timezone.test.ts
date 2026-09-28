// TZ-1 — the business date/time formatters convert UTC to America/Toronto with
// DST-correct offsets (never a hardcoded offset), the legal helper names the
// zone, and date-only values don't shift across a day boundary.

import { describe, it, expect } from "vitest";
import { businessDateTime, businessDateTimeZoned, businessDate } from "@/lib/format";

describe("businessDateTimeZoned — legal signing time, zone named", () => {
  it("the reported bug: 21:07 UTC in September renders 5:07 PM EDT (UTC-4), not 9:07 PM", () => {
    // 2026-09-28T21:07Z was displayed as 9:07 PM (raw UTC). Toronto is EDT (-4).
    const out = businessDateTimeZoned("2026-09-28T21:07:00Z");
    expect(out).toBe("September 28, 2026 at 5:07 PM EDT");
  });

  it("standard time: 22:30 UTC in January renders 5:30 PM EST (UTC-5)", () => {
    const out = businessDateTimeZoned("2026-01-15T22:30:00Z");
    expect(out).toBe("January 15, 2026 at 5:30 PM EST");
  });

  it("names the zone (DST-aware) — EDT in summer, EST in winter", () => {
    expect(businessDateTimeZoned("2026-07-01T12:00:00Z")).toMatch(/EDT$/);
    expect(businessDateTimeZoned("2026-02-01T12:00:00Z")).toMatch(/EST$/);
  });
});

describe("businessDateTime — Toronto local, no zone", () => {
  it("converts the same September instant to 5:07 PM Toronto", () => {
    expect(businessDateTime("2026-09-28T21:07:00Z")).toContain("5:07");
    expect(businessDateTime("2026-09-28T21:07:00Z")).toContain("PM");
  });
});

describe("businessDate — date-only, no off-by-one", () => {
  it("a bare YYYY-MM-DD renders the same calendar day (no shift back in a UTC- zone)", () => {
    expect(businessDate("2026-09-25")).toBe("Sep 25, 2026");
    expect(businessDate("2026-12-31")).toBe("Dec 31, 2026"); // must not roll to Dec 30 or Jan 1
    expect(businessDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("a DST-transition day is stable", () => {
    // 2026-03-08 is the spring-forward day in Toronto; the date must stay Mar 8.
    expect(businessDate("2026-03-08")).toBe("Mar 8, 2026");
  });
});
