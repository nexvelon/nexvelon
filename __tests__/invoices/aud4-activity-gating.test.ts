// AUD-4 — invoice activity is gated exactly as the invoice: financials view.
// loadEntityActivityAction denies a caller without financials:view and serves
// one who has it. This is the same guard SEC-1 relies on from the other side —
// a user who can't see financials never reads an invoice's history.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ role: "Accountant" }));

vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: h.role, status: "Active" }),
}));
vi.mock("@/lib/permissions/resolve", () => ({ adaptDbRole: (r: string) => r }));
vi.mock("@/lib/api/activity-log", () => ({
  listActivityPage: async () => ({ entries: [{ id: "a1" }], hasMore: false }),
}));

import { loadEntityActivityAction } from "@/app/(app)/activity-actions";
import { ACTIVITY_RESOURCE } from "@/lib/activity-access";

beforeEach(() => {
  h.role = "Accountant";
});

describe("AUD-4 — invoice activity gating", () => {
  it("invoice maps to the financials resource", () => {
    expect(ACTIVITY_RESOURCE.invoice).toBe("financials");
  });

  it("a financials-view role (Accountant) can read invoice activity", async () => {
    const res = await loadEntityActivityAction("invoice", "inv-1", 0);
    expect(res.ok).toBe(true);
  });

  it("a role WITHOUT financials view (Technician) is denied", async () => {
    h.role = "Technician";
    const res = await loadEntityActivityAction("invoice", "inv-1", 0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
  });
});
