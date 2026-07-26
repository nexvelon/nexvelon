// SCHED-2 — the pure drop-target → booking-window computation (the only
// non-rendering logic behind drag-to-assign). TZ-independent: we assert the
// duration and the local wall-clock hour, not an exact UTC string.

import { describe, it, expect } from "vitest";
import {
  computeSlot,
  parseDroppableId,
  slotMinutes,
  makeDroppableId,
  DEFAULT_SLOT_MINUTES,
} from "@/lib/scheduling/board-slots";

describe("parseDroppableId", () => {
  it("round-trips tech::day::hour", () => {
    const id = makeDroppableId("techA", "2026-08-01", 9);
    expect(id).toBe("techA::2026-08-01::9");
    expect(parseDroppableId(id)).toEqual({ techId: "techA", dayStr: "2026-08-01", hour: 9 });
  });
  it("rejects a malformed id", () => {
    expect(parseDroppableId("nope")).toBeNull();
    expect(parseDroppableId("a::b::notanumber")).toBeNull();
  });
});

describe("slotMinutes", () => {
  it("uses estimated_hours when present", () => {
    expect(slotMinutes(3)).toBe(180);
    expect(slotMinutes(1.5)).toBe(90);
  });
  it("falls back to the default slot when null/zero", () => {
    expect(slotMinutes(null)).toBe(DEFAULT_SLOT_MINUTES);
    expect(slotMinutes(undefined)).toBe(DEFAULT_SLOT_MINUTES);
    expect(slotMinutes(0)).toBe(DEFAULT_SLOT_MINUTES);
  });
});

describe("computeSlot", () => {
  it("starts at the dropped day+hour (local) and lasts the given duration", () => {
    const { startsAt, endsAt } = computeSlot("2026-08-01", 9, 180);
    // duration is exact regardless of timezone
    expect(new Date(endsAt).getTime() - new Date(startsAt).getTime()).toBe(180 * 60_000);
    // local wall-clock hour is the dropped hour
    expect(new Date(startsAt).getHours()).toBe(9);
    expect(new Date(startsAt).getMinutes()).toBe(0);
  });

  it("a null-estimate drop yields the 2h default slot", () => {
    const { startsAt, endsAt } = computeSlot("2026-08-01", 14, slotMinutes(null));
    expect(new Date(endsAt).getTime() - new Date(startsAt).getTime()).toBe(DEFAULT_SLOT_MINUTES * 60_000);
    expect(new Date(startsAt).getHours()).toBe(14);
  });
});
