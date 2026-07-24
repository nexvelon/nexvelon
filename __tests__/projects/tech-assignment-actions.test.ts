// PROJ2-15 — gates on the new tech-assignment actions. Reads at projects:view,
// mutations at projects:edit (SUB-6's rationale, unchanged). Technician (view-
// only) is denied create.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  listAssignableTechs: vi.fn(async () => []),
  listAssignmentsForTech: vi.fn(async () => []),
  getProjectTeam: vi.fn(async () => []),
  createAssignment: vi.fn(async () => ({ ok: true, assignment: { id: "a1" } })),
}));

vi.mock("@/lib/api/job-assignments", () => ({
  listAssignmentsForJob: vi.fn(async () => []),
  listAssignmentsForProject: vi.fn(async () => []),
  listAssignmentsForSubcontractor: vi.fn(async () => []),
  listAssignmentsForTech: h.listAssignmentsForTech,
  listAssignableTechs: h.listAssignableTechs,
  getProjectTeam: h.getProjectTeam,
  createAssignment: h.createAssignment,
  updateAssignment: vi.fn(async () => ({ id: "a1" })),
  setAssignmentStatus: vi.fn(async () => ({ id: "a1" })),
  deleteAssignment: vi.fn(async () => true),
}));
vi.mock("@/lib/api/subcontractors", () => ({
  listSubcontractors: vi.fn(async () => []),
  getSubcontractorById: vi.fn(async () => null),
}));
vi.mock("@/lib/api/subcontractor-compliance", () => ({ listComplianceDocs: vi.fn(async () => []) }));
vi.mock("@/lib/api/sub-agreements", () => ({ listAgreements: vi.fn(async () => []) }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listAssignableTechsAction,
  listAssignmentsForTechAction,
  getProjectTeamAction,
  createAssignmentAction,
} from "@/app/(app)/projects/assignment-actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

const READS = [
  () => listAssignableTechsAction(),
  () => listAssignmentsForTechAction("t1"),
  () => getProjectTeamAction("p1"),
];

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [h.listAssignableTechs, h.listAssignmentsForTech, h.getProjectTeam, h.createAssignment]) {
    fn.mockClear();
  }
});

describe("read gate (projects:view)", () => {
  it("passes for a project viewer (Technician)", async () => {
    setRole("Technician");
    for (const call of READS) expect((await call()).ok).toBe(true);
  });
  it("rejects an unauthenticated caller", async () => {
    h.profile = null;
    for (const call of READS) expect((await call()).ok).toBe(false);
    expect(h.listAssignableTechs).not.toHaveBeenCalled();
  });
});

describe("tech-assignment mutation gate (projects:edit)", () => {
  it("rejects a projects:view-only role (Technician) for creating a tech assignment", async () => {
    setRole("Technician");
    const res = await createAssignmentAction({ projectId: "p1", jobId: "job1", techId: "t1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.createAssignment).not.toHaveBeenCalled();
  });

  it("passes for ProjectManager and Admin", async () => {
    for (const role of ["ProjectManager", "Admin"]) {
      setRole(role);
      expect((await createAssignmentAction({ projectId: "p1", jobId: "job1", techId: "t1" })).ok).toBe(true);
    }
  });
});
