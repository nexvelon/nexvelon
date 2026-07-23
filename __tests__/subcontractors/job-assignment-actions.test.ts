// SUB-6 — gates on the assignment actions. GATE CHOICE (see assignment-actions
// header): assignments are project data, so reads gate projects:view and
// mutations projects:edit. A Technician (projects view-only) is denied
// create/status; a ProjectManager (projects:edit) is allowed. Reads pass for a
// project viewer.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  listAssignmentsForJob: vi.fn(async () => []),
  createAssignment: vi.fn(async () => ({ ok: true, assignment: { id: "a1" } })),
  setAssignmentStatus: vi.fn(async () => ({ id: "a1" })),
}));

vi.mock("@/lib/api/job-assignments", () => ({
  listAssignmentsForJob: h.listAssignmentsForJob,
  listAssignmentsForProject: vi.fn(async () => []),
  listAssignmentsForSubcontractor: vi.fn(async () => []),
  createAssignment: h.createAssignment,
  updateAssignment: vi.fn(async () => ({ id: "a1" })),
  setAssignmentStatus: h.setAssignmentStatus,
  deleteAssignment: vi.fn(async () => true),
}));
vi.mock("@/lib/api/subcontractors", () => ({
  listSubcontractors: vi.fn(async () => []),
  getSubcontractorById: vi.fn(async () => ({ id: "sub1", status: "active" })),
}));
vi.mock("@/lib/api/subcontractor-compliance", () => ({ listComplianceDocs: vi.fn(async () => []) }));
vi.mock("@/lib/api/sub-agreements", () => ({ listAgreements: vi.fn(async () => []) }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listAssignmentsForJobAction,
  createAssignmentAction,
  setAssignmentStatusAction,
} from "@/app/(app)/projects/assignment-actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

const MUTATIONS = [
  () => createAssignmentAction({ projectId: "p1", jobId: "job1", subcontractorId: "sub1" }),
  () => setAssignmentStatusAction("a1", "p1", "completed"),
];
const MUTATION_FNS = [h.createAssignment, h.setAssignmentStatus];

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [...MUTATION_FNS, h.listAssignmentsForJob]) fn.mockClear();
});

describe("assignment read gate (projects:view)", () => {
  it("passes for a project viewer (Technician)", async () => {
    setRole("Technician");
    expect((await listAssignmentsForJobAction("job1")).ok).toBe(true);
  });
  it("rejects an unauthenticated caller (every app role has projects:view)", async () => {
    h.profile = null;
    expect((await listAssignmentsForJobAction("job1")).ok).toBe(false);
    expect(h.listAssignmentsForJob).not.toHaveBeenCalled();
  });
});

describe("assignment mutation gate (projects:edit)", () => {
  it("rejects a projects:view-only role (Technician) for create / status", async () => {
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
