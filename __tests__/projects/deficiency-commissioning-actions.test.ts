// PROJ2-12/13 — gates on the deficiency + commissioning actions. Both are
// project data, so reads gate projects:view and mutations projects:edit
// (matching PROJ2-11). Technician (projects view-only) is denied mutations.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  // deficiency api
  listDeficienciesForJob: vi.fn(async () => []),
  createDeficiency: vi.fn(async () => ({ id: "d1" })),
  setDeficiencyStatus: vi.fn(async () => ({ id: "d1" })),
  // commissioning api
  listRunsForJob: vi.fn(async () => []),
  createRun: vi.fn(async () => ({ id: "run1" })),
  signOffRun: vi.fn(async () => ({ ok: true, run: { id: "run1" }, pdfPath: null })),
  getCommissioningPdfUrl: vi.fn(async () => null),
}));

vi.mock("@/lib/api/job-deficiencies", () => ({
  listDeficienciesForJob: h.listDeficienciesForJob,
  listDeficienciesForProject: vi.fn(async () => []),
  getDeficiencyById: vi.fn(async () => null),
  createDeficiency: h.createDeficiency,
  updateDeficiency: vi.fn(async () => ({ id: "d1" })),
  setDeficiencyStatus: h.setDeficiencyStatus,
  reorderDeficiencies: vi.fn(async () => 0),
  deleteDeficiency: vi.fn(async () => true),
}));
vi.mock("@/lib/api/job-tasks", () => ({ getTaskAssigneeOptions: vi.fn(async () => ({ techs: [], subcontractors: [] })) }));
vi.mock("@/lib/api/commissioning", () => ({
  listRunsForJob: h.listRunsForJob,
  getRunById: vi.fn(async () => null),
  createRun: h.createRun,
  cancelRun: vi.fn(async () => ({ id: "run1" })),
  addItem: vi.fn(async () => ({ id: "it1" })),
  setItemResult: vi.fn(async () => ({ id: "it1" })),
  reorderItems: vi.fn(async () => 0),
  deleteItem: vi.fn(async () => true),
  raiseDeficiencyFromItem: vi.fn(async () => ({ deficiencyId: "d1" })),
  signOffRun: h.signOffRun,
  getCommissioningPdfUrl: h.getCommissioningPdfUrl,
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listDeficienciesForJobAction,
  createDeficiencyAction,
  setDeficiencyStatusAction,
} from "@/app/(app)/projects/deficiency-actions";
import {
  listRunsForJobAction,
  createRunAction,
  signOffRunAction,
} from "@/app/(app)/projects/commissioning-actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

const READS = [
  () => listDeficienciesForJobAction("job1"),
  () => listRunsForJobAction("job1"),
];
const MUTATIONS = [
  () => createDeficiencyAction({ projectId: "p1", jobId: "job1", title: "t" }),
  () => setDeficiencyStatusAction("d1", "p1", "job1", "closed"),
  () => createRunAction({ projectId: "p1", jobId: "job1" }),
  () => signOffRunAction({ runId: "run1", signerName: "J", signatureData: "x" }, "p1", "job1"),
];
const MUTATION_FNS = [h.createDeficiency, h.setDeficiencyStatus, h.createRun, h.signOffRun];

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [...MUTATION_FNS, h.listDeficienciesForJob, h.listRunsForJob]) fn.mockClear();
});

describe("read gate (projects:view)", () => {
  it("passes for a project viewer (Technician)", async () => {
    setRole("Technician");
    for (const call of READS) expect((await call()).ok).toBe(true);
  });
  it("rejects an unauthenticated caller", async () => {
    h.profile = null;
    for (const call of READS) expect((await call()).ok).toBe(false);
    expect(h.listDeficienciesForJob).not.toHaveBeenCalled();
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
