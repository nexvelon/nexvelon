// PROJ2-14/19 — gates on the warranty + bond actions. Reads at projects:view,
// mutations at projects:edit. Bond coverage/premium reads sit at projects:view
// (commercially sensitive but not cost/margin). Technician (view-only) is
// denied mutations.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  listWarrantiesForProject: vi.fn(async () => []),
  listBondsForProject: vi.fn(async () => []),
  createWarranty: vi.fn(async () => ({ id: "w1" })),
  recordHandover: vi.fn(async () => ({ id: "w1" })),
  createBond: vi.fn(async () => ({ id: "b1" })),
  setBondStatus: vi.fn(async () => ({ id: "b1" })),
}));

vi.mock("@/lib/api/warranties", () => ({
  listWarrantiesForProject: h.listWarrantiesForProject,
  listWarrantiesForJob: vi.fn(async () => []),
  getWarrantyStatusForProject: vi.fn(async () => ({})),
  getExpiringWarranties: vi.fn(async () => []),
  createWarranty: h.createWarranty,
  updateWarranty: vi.fn(async () => ({ id: "w1" })),
  recordHandover: h.recordHandover,
  deleteWarranty: vi.fn(async () => true),
}));
vi.mock("@/lib/api/project-bonds", () => ({
  listBondsForProject: h.listBondsForProject,
  getBondAlerts: vi.fn(async () => []),
  createBond: h.createBond,
  updateBond: vi.fn(async () => ({ id: "b1" })),
  setBondStatus: h.setBondStatus,
  deleteBond: vi.fn(async () => ({ removed: true, attachmentId: null })),
}));
vi.mock("@/app/(app)/attachments/actions", () => ({ deleteAttachment: vi.fn() }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listWarrantiesForProjectAction,
  listBondsForProjectAction,
  createWarrantyAction,
  recordHandoverAction,
  createBondAction,
  setBondStatusAction,
} from "@/app/(app)/projects/warranty-bond-actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

const READS = [
  () => listWarrantiesForProjectAction("p1"),
  () => listBondsForProjectAction("p1"),
];
const MUTATIONS = [
  () => createWarrantyAction({ projectId: "p1", startDate: "2026-01-01", durationMonths: 12 }),
  () => recordHandoverAction("w1", "p1", { handoverDate: "2026-07-01" }),
  () => createBondAction({ projectId: "p1", bondType: "performance" }),
  () => setBondStatusAction("b1", "p1", "released"),
];
const MUTATION_FNS = [h.createWarranty, h.recordHandover, h.createBond, h.setBondStatus];

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [...MUTATION_FNS, h.listWarrantiesForProject, h.listBondsForProject]) fn.mockClear();
});

describe("read gate (projects:view)", () => {
  it("passes for a project viewer (Technician)", async () => {
    setRole("Technician");
    for (const call of READS) expect((await call()).ok).toBe(true);
  });
  it("rejects an unauthenticated caller", async () => {
    h.profile = null;
    for (const call of READS) expect((await call()).ok).toBe(false);
    expect(h.listWarrantiesForProject).not.toHaveBeenCalled();
  });
});

describe("mutation gate (projects:edit)", () => {
  it("rejects a projects:view-only role (Technician) for every mutation", async () => {
    setRole("Technician");
    for (const call of MUTATIONS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of MUTATION_FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("passes for ProjectManager and Admin", async () => {
    for (const role of ["ProjectManager", "Admin"]) {
      setRole(role);
      for (const call of MUTATIONS) expect((await call()).ok).toBe(true);
    }
  });
});
