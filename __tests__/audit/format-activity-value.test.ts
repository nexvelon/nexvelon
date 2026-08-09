// AUDIT-FIX-2 — the activity-diff value formatter must surface REAL values for
// every shape a change can hold, never a bare count or a type name.

import { describe, it, expect } from "vitest";
import {
  formatActivityValue as fmt,
  humanizeField,
} from "@/lib/audit/format-activity-value";

describe("formatActivityValue — scalars", () => {
  it("strings render verbatim", () => {
    expect(fmt("VIP")).toBe("VIP");
  });
  it("numbers render verbatim", () => {
    expect(fmt(42)).toBe("42");
    expect(fmt(0)).toBe("0");
  });
  it("booleans render Yes / No (not true/false)", () => {
    expect(fmt(true)).toBe("Yes");
    expect(fmt(false)).toBe("No");
  });
});

describe("formatActivityValue — empties are explicit and distinguishable", () => {
  it("null / undefined → (empty)", () => {
    expect(fmt(null)).toBe("(empty)");
    expect(fmt(undefined)).toBe("(empty)");
  });
  it("empty string → (blank)", () => {
    expect(fmt("")).toBe("(blank)");
  });
  it("empty array → (none)", () => {
    expect(fmt([])).toBe("(none)");
  });
  it("empty object → (none)", () => {
    expect(fmt({})).toBe("(none)");
  });
});

describe("formatActivityValue — dates render in display format", () => {
  it("date-only string", () => {
    expect(fmt("2026-04-30")).toBe("Apr 30, 2026");
  });
  it("ISO datetime string", () => {
    expect(fmt("2026-04-30T13:05:00Z")).toMatch(/^Apr 30, 2026 at \d{1,2}:\d{2} (AM|PM)$/);
  });
  it("a non-date string is left alone", () => {
    expect(fmt("not-a-date")).toBe("not-a-date");
  });
});

describe("formatActivityValue — arrays show real values, never a count", () => {
  it("the reported case: ['VIP'] → 'VIP' (not '[1 item]')", () => {
    expect(fmt(["VIP"])).toBe("VIP");
  });
  it("array of strings joins on comma", () => {
    expect(fmt(["VIP", "Priority", "Net-30"])).toBe("VIP, Priority, Net-30");
  });
  it("array of objects renders each object's label", () => {
    const phones = [
      { label: "Office", number: "416-555-1234" },
      { label: "Mobile", number: "647-555-9999" },
    ];
    expect(fmt(phones)).toBe("Office: 416-555-1234, Mobile: 647-555-9999");
  });
  it("over-cap arrays show content first, then '+N more'", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g", "h"]; // 8 > cap of 6
    const out = fmt(many);
    expect(out).toBe("a, b, c, d, e, f +2 more");
    expect(out).not.toMatch(/^\[/); // never a bare count
  });
});

describe("formatActivityValue — objects render a meaningful label", () => {
  it("prefers a name/label key over a JSON dump", () => {
    expect(fmt({ id: "x1", name: "Acme Corp" })).toBe("Acme Corp");
  });
  it("nested object with no obvious label → compact key: value pairs", () => {
    expect(fmt({ street: "1 King St", city: "Toronto" })).toBe(
      "Street: 1 King St, City: Toronto"
    );
  });
  it("never renders [object Object]", () => {
    const out = fmt({ a: { deep: 1 }, label: "Primary" });
    expect(out).not.toContain("[object Object]");
    expect(out).toBe("Primary");
  });
});

describe("formatActivityValue — uuids and safety", () => {
  it("a foreign-key uuid renders verbatim (shown, not hidden)", () => {
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(fmt(uuid)).toBe(uuid);
  });
  it("never emits the literal 'undefined' or 'null' or a type name", () => {
    for (const v of [null, undefined, {}, [], "", 0, false]) {
      const out = fmt(v);
      expect(out).not.toContain("undefined");
      expect(out).not.toContain("[object");
      expect(out).not.toBe("null");
    }
  });
  it("a very long string is truncated with an ellipsis", () => {
    const long = "x".repeat(500);
    const out = fmt(long);
    expect(out.length).toBeLessThan(220);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("humanizeField", () => {
  it("snake_case → Title Case", () => {
    expect(humanizeField("billing_postal")).toBe("Billing Postal");
    expect(humanizeField("tags")).toBe("Tags");
  });
});
