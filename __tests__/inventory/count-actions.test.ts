// INV-9-2 — cycle-count action gates: reads need inventory:view, mutations need
// inventory:edit. Technician has view but not edit; ProjectManager/Admin have
// both; Subcontractor has neither.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
}));

vi.mock("@/lib/api/inventory-counts", () => ({
  createCountSession: vi.fn(async () => ({ id: "sess1" })),
  listCountSessions: vi.fn(async () => []),
  getCountSession: vi.fn(async () => ({ session: { id: "sess1" }, lines: [] })),
  getCountVarianceSummary: vi.fn(async () => ({})),
  enterCount: vi.fn(async () => {}),
  submitForReview: vi.fn(async () => {}),
  applyCount: vi.fn(async () => ({ applied: 0, adjusted: 0, skipped_uncounted: 0, failed: 0 })),
  cancelCount: vi.fn(async () => {}),
}));
vi.mock("@/lib/api/stock-locations", () => ({ listStockLocations: vi.fn(async () => []) }));
vi.mock("@/lib/api/categories", () => ({ listCategories: vi.fn(async () => []) }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listCountSessionsAction,
  createCountSessionAction,
  applyCountAction,
} from "@/app/(app)/inventory/count-actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("read gate (inventory:view)", () => {
  it("Technician can read the session list", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await listCountSessionsAction()).ok).toBe(true);
  });
  it("Subcontractor (no inventory:view) is denied reads", async () => {
    h.profile = { id: "u1", role: "Subcontractor", status: "Active" };
    expect((await listCountSessionsAction()).ok).toBe(false);
  });
  it("unauthenticated is denied", async () => {
    h.profile = null;
    expect((await listCountSessionsAction()).ok).toBe(false);
  });
});

describe("mutation gate (inventory:edit)", () => {
  it("Technician (view-only) cannot create or apply a count", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await createCountSessionAction({})).ok).toBe(false);
    expect((await applyCountAction("sess1")).ok).toBe(false);
  });
  it("ProjectManager and Admin can create + apply", async () => {
    for (const role of ["ProjectManager", "Admin"]) {
      h.profile = { id: "u1", role, status: "Active" };
      expect((await createCountSessionAction({})).ok).toBe(true);
      expect((await applyCountAction("sess1")).ok).toBe(true);
    }
  });
});
