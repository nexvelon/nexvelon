// PROJ2-17/21 — gates on the cost-analysis actions. The cost-code TAXONOMY read
// (listCostCodes, needed by the line-item editor) sits at projects:view; every
// mutation and every cost/margin read (breakdown, snapshots) sits at
// financials:edit — the rollup cost tier.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  listCostCodes: vi.fn(async () => []),
  createCostCode: vi.fn(async () => ({ id: "c1" })),
  getCostBreakdownByCode: vi.fn(async () => ({ rows: [], totals: { estimated: 0, actual: 0, variance: 0 } })),
  takeSnapshot: vi.fn(async () => ({ id: "s1" })),
  listSnapshots: vi.fn(async () => []),
}));

vi.mock("@/lib/api/cost-codes", () => ({
  listCostCodes: h.listCostCodes,
  createCostCode: h.createCostCode,
  updateCostCode: vi.fn(),
  setCostCodeActive: vi.fn(),
  deleteCostCode: vi.fn(),
  getCostBreakdownByCode: h.getCostBreakdownByCode,
}));
vi.mock("@/lib/api/margin-snapshots", () => ({
  takeSnapshot: h.takeSnapshot,
  listSnapshots: h.listSnapshots,
  getSnapshotTrend: vi.fn(async () => []),
  deleteSnapshot: vi.fn(async () => true),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listCostCodesAction,
  createCostCodeAction,
  getCostBreakdownByCodeAction,
  takeSnapshotAction,
  listSnapshotsAction,
} from "@/app/(app)/projects/cost-analysis-actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [h.listCostCodes, h.createCostCode, h.getCostBreakdownByCode, h.takeSnapshot, h.listSnapshots]) {
    fn.mockClear();
  }
});

describe("cost-code taxonomy read (projects:view)", () => {
  it("passes for a project viewer (Technician)", async () => {
    setRole("Technician");
    expect((await listCostCodesAction()).ok).toBe(true);
  });
  it("rejects an unauthenticated caller", async () => {
    h.profile = null;
    expect((await listCostCodesAction()).ok).toBe(false);
    expect(h.listCostCodes).not.toHaveBeenCalled();
  });
});

describe("cost/margin surfaces require financials:edit", () => {
  const CALLS = [
    () => createCostCodeAction({ code: "X", name: "X", category: "other" }),
    () => getCostBreakdownByCodeAction({ jobId: "job1" }),
    () => takeSnapshotAction({ projectId: "p1", jobId: "job1", reason: "manual" }),
    () => listSnapshotsAction({ jobId: "job1" }),
  ];
  const FNS = [h.createCostCode, h.getCostBreakdownByCode, h.takeSnapshot, h.listSnapshots];

  it("reject a financials:view-only role (ProjectManager) without hitting the API", async () => {
    setRole("ProjectManager");
    for (const call of CALLS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("pass for Accountant and Admin (financials:edit)", async () => {
    for (const role of ["Accountant", "Admin"]) {
      setRole(role);
      for (const call of CALLS) expect((await call()).ok).toBe(true);
    }
  });
});
