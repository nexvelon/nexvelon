// PROJ2-20 — gates on the schedule actions. Reads at projects:view; mutations
// at projects:edit. A Technician (project view-only) is denied every mutation.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  getProjectSchedule: vi.fn(async () => ({ project_id: "p1", today: "2026-07-24", jobs: [], milestones: [], range: null })),
  setJobPlannedDates: vi.fn(async () => {}),
  createMilestone: vi.fn(async () => ({ id: "m1" })),
  addDependency: vi.fn(async () => ({ id: "e1" })),
  setMilestoneStatus: vi.fn(async () => ({ id: "m1" })),
}));

vi.mock("@/lib/api/schedule", () => ({
  getProjectSchedule: h.getProjectSchedule,
  listMilestones: vi.fn(async () => []),
  setJobPlannedDates: h.setJobPlannedDates,
  createMilestone: h.createMilestone,
  updateMilestone: vi.fn(async () => ({ id: "m1" })),
  setMilestoneStatus: h.setMilestoneStatus,
  deleteMilestone: vi.fn(async () => true),
  addDependency: h.addDependency,
  removeDependency: vi.fn(async () => true),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  getProjectScheduleAction,
  setJobPlannedDatesAction,
  createMilestoneAction,
  setMilestoneStatusAction,
  addDependencyAction,
} from "@/app/(app)/projects/schedule-actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

const MUTATIONS = [
  () => setJobPlannedDatesAction("jA", "p1", "2026-05-01", "2026-05-10"),
  () => createMilestoneAction({ projectId: "p1", title: "MS", targetDate: "2026-06-01" }),
  () => setMilestoneStatusAction("m1", "p1", "met"),
  () => addDependencyAction("jB", "jA", "p1"),
];
const MUTATION_FNS = [h.setJobPlannedDates, h.createMilestone, h.setMilestoneStatus, h.addDependency];

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [...MUTATION_FNS, h.getProjectSchedule]) fn.mockClear();
});

describe("read gate (projects:view)", () => {
  it("passes for a project viewer (Technician)", async () => {
    setRole("Technician");
    expect((await getProjectScheduleAction("p1")).ok).toBe(true);
  });
  it("rejects an unauthenticated caller", async () => {
    h.profile = null;
    expect((await getProjectScheduleAction("p1")).ok).toBe(false);
    expect(h.getProjectSchedule).not.toHaveBeenCalled();
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
