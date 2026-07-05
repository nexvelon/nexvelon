// PROJ2-1 — updateProjectStatusAction. Mocks the projects API + auth + activity
// log; keeps the real permissions matrix so the projects:edit gate is exercised
// for real roles. Mirrors the __tests__/quotes mocking conventions.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  currentStatus: "active" as string | null, // null → project not found
  setProjectStatus: vi.fn(async (..._args: unknown[]) => {}),
  logActivity: vi.fn(async (..._args: unknown[]) => {}),
}));

vi.mock("@/lib/api/projects", () => ({
  // used by updateProjectStatusAction
  getProjectStatus: async (id: string) =>
    h.currentStatus === null ? null : { id, status: h.currentStatus },
  setProjectStatus: h.setProjectStatus,
  // other named exports actions.ts imports (unused in these tests)
  getCostCenterById: vi.fn(),
  listProjects: vi.fn(),
  getProjectById: vi.fn(),
  createProjectFromQuote: vi.fn(),
  listProjectsForClient: vi.fn(),
  mergeQuoteIntoProject: vi.fn(),
  addCostCenter: vi.fn(),
  renameCostCenter: vi.fn(),
  deleteCostCenter: vi.fn(),
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateProjectStatusAction } from "@/app/(app)/projects/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.currentStatus = "active";
  h.setProjectStatus.mockClear();
  h.logActivity.mockClear();
  h.logActivity.mockImplementation(async () => {});
});

describe("updateProjectStatusAction", () => {
  it("no-ops when newStatus === current (no UPDATE, no log)", async () => {
    h.currentStatus = "active";
    const res = await updateProjectStatusAction({
      projectId: "p1",
      newStatus: "active",
    });
    expect(res.ok).toBe(true);
    expect(h.setProjectStatus).not.toHaveBeenCalled();
    expect(h.logActivity).not.toHaveBeenCalled();
  });

  it("rejects an invalid transition", async () => {
    h.currentStatus = "active"; // active → closed is not allowed
    const res = await updateProjectStatusAction({
      projectId: "p1",
      newStatus: "closed",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_transition");
    expect(h.setProjectStatus).not.toHaveBeenCalled();
  });

  it("returns not_found when the project is missing", async () => {
    h.currentStatus = null;
    const res = await updateProjectStatusAction({
      projectId: "nope",
      newStatus: "on_hold",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
  });

  it("denies a role without projects:edit", async () => {
    h.profile = { id: "u1", role: "ViewOnly", status: "Active" };
    const res = await updateProjectStatusAction({
      projectId: "p1",
      newStatus: "on_hold",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.setProjectStatus).not.toHaveBeenCalled();
  });

  it("writes the UPDATE + best-effort log on a valid transition", async () => {
    h.currentStatus = "active";
    const res = await updateProjectStatusAction({
      projectId: "p1",
      newStatus: "on_hold",
      note: "waiting on parts",
    });
    expect(res.ok).toBe(true);
    expect(h.setProjectStatus).toHaveBeenCalledWith("p1", "on_hold", "u1");
    expect(h.logActivity).toHaveBeenCalledTimes(1);
    const [entity, id, action, changes] = h.logActivity.mock.calls[0];
    expect(entity).toBe("project");
    expect(id).toBe("p1");
    expect(action).toBe("update");
    expect(changes).toMatchObject({
      status: { from: "active", to: "on_hold" },
      note: { from: null, to: "waiting on parts" },
    });
  });

  it("does NOT fail the action if activity logging throws", async () => {
    h.currentStatus = "active";
    h.logActivity.mockImplementation(async () => {
      throw new Error("log boom");
    });
    const res = await updateProjectStatusAction({
      projectId: "p1",
      newStatus: "cancelled",
    });
    expect(res.ok).toBe(true);
    expect(h.setProjectStatus).toHaveBeenCalledWith("p1", "cancelled", "u1");
  });
});
