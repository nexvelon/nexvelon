// SCHED-3 — the pure availability matrix + utilization. TZ-independent: bookings
// are built from LOCAL Date components so getDay/getHours round-trip in any TZ.

import { describe, it, expect } from "vitest";
import {
  isTechAvailable,
  availableMinutesInWindow,
  bookedMinutesInWindow,
  utilizationPct,
} from "@/lib/scheduling/availability";

// A local wall-clock ISO for a given y/m(0-based)/d/h.
const local = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m, d, h, min, 0, 0).toISOString();

// 2026-08-03 is a Monday.
const MON = { y: 2026, m: 7, d: 3 };
const weekdays9to5 = [1, 2, 3, 4, 5].map((dow) => ({ day_of_week: dow, start_time: "09:00", end_time: "17:00" }));

describe("isTechAvailable", () => {
  it("within working hours → available", () => {
    const r = isTechAvailable(local(MON.y, MON.m, MON.d, 10), local(MON.y, MON.m, MON.d, 12), {
      workingHours: weekdays9to5,
      absences: [],
    });
    expect(r.verdict).toBe("available");
    expect(r.within_hours).toBe(true);
  });

  it("outside working hours → off_hours (warn, not block)", () => {
    const r = isTechAvailable(local(MON.y, MON.m, MON.d, 19), local(MON.y, MON.m, MON.d, 21), {
      workingHours: weekdays9to5,
      absences: [],
    });
    expect(r.verdict).toBe("off_hours");
    expect(r.within_hours).toBe(false);
    expect(r.on_approved_absence).toBe(false);
  });

  it("an APPROVED absence covering the whole slot → on_leave (block)", () => {
    const r = isTechAvailable(local(MON.y, MON.m, MON.d, 10), local(MON.y, MON.m, MON.d, 12), {
      workingHours: weekdays9to5,
      absences: [{ starts_at: local(MON.y, MON.m, MON.d, 0), ends_at: local(MON.y, MON.m, MON.d + 1, 0), status: "approved" }],
    });
    expect(r.verdict).toBe("on_leave");
    expect(r.on_approved_absence).toBe(true);
  });

  it("a REQUESTED (not approved) absence does NOT block", () => {
    const r = isTechAvailable(local(MON.y, MON.m, MON.d, 10), local(MON.y, MON.m, MON.d, 12), {
      workingHours: weekdays9to5,
      absences: [{ starts_at: local(MON.y, MON.m, MON.d, 0), ends_at: local(MON.y, MON.m, MON.d + 1, 0), status: "requested" }],
    });
    expect(r.verdict).toBe("available");
    expect(r.on_approved_absence).toBe(false);
  });

  it("hours UNKNOWN (no rows) → unknown: no warn, no block", () => {
    const r = isTechAvailable(local(MON.y, MON.m, MON.d, 22), local(MON.y, MON.m, MON.d, 23), {
      workingHours: [],
      absences: [],
    });
    expect(r.verdict).toBe("unknown");
    expect(r.within_hours).toBeNull();
  });
});

describe("utilization", () => {
  it("booked ÷ available, capped at 100", () => {
    expect(utilizationPct(240, 480)).toBe(50);
    expect(utilizationPct(600, 480)).toBe(100); // capped
  });

  it("is NULL (not 0) when hours are unset", () => {
    expect(utilizationPct(120, null)).toBeNull();
    expect(utilizationPct(0, 0)).toBeNull();
  });

  it("availableMinutesInWindow: one 8h weekday, null when hours unknown", () => {
    // Mon 00:00 → Tue 00:00 with a Mon 09-17 template = 480 min.
    const avail = availableMinutesInWindow(weekdays9to5, [], local(MON.y, MON.m, MON.d, 0), local(MON.y, MON.m, MON.d + 1, 0));
    expect(avail).toBe(480);
    expect(availableMinutesInWindow([], [], local(MON.y, MON.m, MON.d, 0), local(MON.y, MON.m, MON.d + 1, 0))).toBeNull();
  });

  it("an approved absence reduces available minutes", () => {
    const avail = availableMinutesInWindow(
      weekdays9to5,
      [{ starts_at: local(MON.y, MON.m, MON.d, 9), ends_at: local(MON.y, MON.m, MON.d, 13), status: "approved" }],
      local(MON.y, MON.m, MON.d, 0),
      local(MON.y, MON.m, MON.d + 1, 0)
    );
    expect(avail).toBe(240); // 8h − 4h leave
  });

  it("bookedMinutesInWindow sums non-cancelled overlap", () => {
    const booked = bookedMinutesInWindow(
      [
        { starts_at: local(MON.y, MON.m, MON.d, 9), ends_at: local(MON.y, MON.m, MON.d, 12), status: "confirmed" },
        { starts_at: local(MON.y, MON.m, MON.d, 13), ends_at: local(MON.y, MON.m, MON.d, 14), status: "cancelled" }, // excluded
      ],
      local(MON.y, MON.m, MON.d, 0),
      local(MON.y, MON.m, MON.d + 1, 0)
    );
    expect(booked).toBe(180);
  });
});
