// UIDG-9 — resolveWindow turns the picker selection into a concrete window for
// the range-following widgets, and makes `custom` a real, validated window
// instead of the old silent MTD stub.

import { describe, it, expect } from "vitest";
import { resolveWindow } from "@/lib/dashboard/range";

const AUG16 = new Date(2026, 7, 16, 12);

describe("resolveWindow — presets", () => {
  it("mtd resolves to this month + a like-for-like comparison, valid", () => {
    const w = resolveWindow("mtd", undefined, AUG16);
    expect(w.from).toBe("2026-08-01");
    expect(w.to).toBe("2026-08-16");
    expect(w.compareFrom).toBe("2026-07-01"); // same days last month
    expect(w.valid).toBe(true);
    expect(w.comparisonBasis).toBe("same days last month");
  });
});

describe("resolveWindow — custom", () => {
  it("uses the entered dates and an equal-length preceding comparison window", () => {
    const w = resolveWindow("custom", { from: "2026-08-01", to: "2026-08-10" });
    expect(w.valid).toBe(true);
    expect(w.from).toBe("2026-08-01");
    expect(w.to).toBe("2026-08-10");
    // 10-day window → prior 10 days ending the day before (Jul 22–31)
    expect(w.compareTo).toBe("2026-07-31");
    expect(w.compareFrom).toBe("2026-07-22");
    expect(w.label).toBe("2026-08-01 → 2026-08-10");
  });

  it("is INVALID (no fetch) when a date is missing", () => {
    expect(resolveWindow("custom", { from: "2026-08-01", to: "" }).valid).toBe(false);
    expect(resolveWindow("custom", {}).valid).toBe(false);
  });

  it("is INVALID when from is after to (rejects a nonsense window)", () => {
    const w = resolveWindow("custom", { from: "2026-08-20", to: "2026-08-01" });
    expect(w.valid).toBe(false);
  });
});
