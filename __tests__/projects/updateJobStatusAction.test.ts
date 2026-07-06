// PROJ2-4d — updateJobStatusAction. Mirrors updateProjectStatusAction.test.ts:
// mocks the projects API + auth + activity log, keeps the REAL permissions
// matrix and status-transition state machine (Jobs share it — JobStatus ===
// ProjectStatus). The gate is exercised for real roles.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  job: { id: "j1", project_id: "p1", status: "active" } as {
    id: string;
    project_id: string;
    status: string;
  } | null,
  setJobStatus: vi.fn(async () => {}),
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/api/projects", () => ({
  getJobById: async () => h.job,
  setJobStatus: h.setJobStatus,
  // other named exports actions.ts imports (unused in these tests)
  listProjects: vi.fn(),
  getProjectById: vi.fn(),
  createProjectFromQuote: vi.fn(),
  listProjectsForClient: vi.fn(),
  mergeQuoteIntoProject: vi.fn(),
  addCostCenter: vi.fn(),
  renameCostCenter: vi.fn(),
  deleteCostCenter: vi.fn(),
  getProjectStatus: vi.fn(),
  setProjectStatus: vi.fn(),
  getCostCenterById: vi.fn(),
  getProjectRow: vi.fn(),
  updateProjectFields: vi.fn(),
  listJobsForProject: vi.fn(),
  createChangeOrderJob: vi.fn(),
  updateJobFields: vi.fn(),
  reassignJobFinancialsToMainJob: vi.fn(),
  deleteJobRow: vi.fn(),
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateJobStatusAction } from "@/app/(app)/projects/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.job = { id: "j1", project_id: "p1", status: "active" };
  h.setJobStatus.mockClear();
  h.logActivity.mockClear();
  h.logActivity.mockImplementation(async () => {});
});

describe("updateJobStatusAction", () => {
  it("no-ops when newStatus === current (no UPDATE, no log)", async () => {
    const res = await updateJobStatusAction({ jobId: "j1", newStatus: "active" });
    expect(res.ok).toBe(true);
    expect(h.setJobStatus).not.toHaveBeenCalled();
    expect(h.logActivity).not.toHaveBeenCalled();
  });

  it("rejects an invalid transition (active → closed)", async () => {
    const res = await updateJobStatusAction({ jobId: "j1", newStatus: "closed" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_transition");
    expect(h.setJobStatus).not.toHaveBeenCalled();
  });

  it("returns not_found when the job is missing", async () => {
    h.job = null;
    const res = await updateJobStatusAction({ jobId: "nope", newStatus: "on_hold" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
  });

  it("denies a role without projects:edit", async () => {
    h.profile = { id: "u1", role: "ViewOnly", status: "Active" };
    const res = await updateJobStatusAction({ jobId: "j1", newStatus: "on_hold" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.setJobStatus).not.toHaveBeenCalled();
  });

  it("writes the UPDATE + best-effort log on a valid transition", async () => {
    const res = await updateJobStatusAction({
      jobId: "j1",
      newStatus: "on_hold",
      note: "waiting on parts",
    });
    expect(res.ok).toBe(true);
    expect(h.setJobStatus).toHaveBeenCalledWith("j1", "on_hold", "u1");
    expect(h.logActivity).toHaveBeenCalledTimes(1);
    const [entity, id, action, changes] = h.logActivity.mock.calls[0] as unknown[];
    expect(entity).toBe("project");
    expect(id).toBe("p1"); // logged on the parent project
    expect(action).toBe("update");
    expect(changes).toMatchObject({
      job_id: { from: null, to: "j1" },
      status: { from: "active", to: "on_hold" },
      note: { from: null, to: "waiting on parts" },
    });
  });

  it("does NOT fail the action if activity logging throws", async () => {
    h.logActivity.mockImplementation(async () => {
      throw new Error("log boom");
    });
    const res = await updateJobStatusAction({ jobId: "j1", newStatus: "cancelled" });
    expect(res.ok).toBe(true);
    expect(h.setJobStatus).toHaveBeenCalledWith("j1", "cancelled", "u1");
  });
});
