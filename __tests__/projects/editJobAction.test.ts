// PROJ2-4d — editJobAction. Mirrors editProjectAction's rules: projects:edit
// gate, per-field validation, empty-diff no-op (§2.8), and a diff that writes
// only the changed fields. Real permissions matrix; mocked API + auth + log.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  job: {
    id: "j1",
    project_id: "p1",
    title: "Original title",
    contract_value: 1000,
  } as {
    id: string;
    project_id: string;
    title: string;
    contract_value: number;
  } | null,
  updateJobFields: vi.fn(async () => {}),
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/api/projects", () => ({
  getNextCoNumber: vi.fn(),
  getMainJobForProject: vi.fn(),
  getJobById: async () => h.job,
  updateJobFields: h.updateJobFields,
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
  setJobStatus: vi.fn(),
  reassignJobFinancialsToMainJob: vi.fn(),
  deleteJobRow: vi.fn(),
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { editJobAction } from "@/app/(app)/projects/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.job = {
    id: "j1",
    project_id: "p1",
    title: "Original title",
    contract_value: 1000,
  };
  h.updateJobFields.mockClear();
  h.logActivity.mockClear();
  h.logActivity.mockImplementation(async () => {});
});

describe("editJobAction", () => {
  it("empty diff → no write, no log", async () => {
    const res = await editJobAction({
      jobId: "j1",
      title: "Original title",
      contract_value: 1000,
    });
    expect(res.ok).toBe(true);
    expect(h.updateJobFields).not.toHaveBeenCalled();
    expect(h.logActivity).not.toHaveBeenCalled();
  });

  it("rejects an empty title", async () => {
    const res = await editJobAction({ jobId: "j1", title: "   " });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_title");
    expect(h.updateJobFields).not.toHaveBeenCalled();
  });

  it("rejects a title over 200 chars", async () => {
    const res = await editJobAction({ jobId: "j1", title: "x".repeat(201) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_title");
  });

  it("rejects a negative contract_value", async () => {
    const res = await editJobAction({ jobId: "j1", contract_value: -1 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_contract_value");
    expect(h.updateJobFields).not.toHaveBeenCalled();
  });

  it("denies a role without projects:edit", async () => {
    h.profile = { id: "u1", role: "ViewOnly", status: "Active" };
    const res = await editJobAction({ jobId: "j1", title: "New" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.updateJobFields).not.toHaveBeenCalled();
  });

  it("writes ONLY the changed field (partial diff)", async () => {
    // Change title only; contract_value is unchanged (1000) → not in the diff.
    const res = await editJobAction({
      jobId: "j1",
      title: "Renamed job",
      contract_value: 1000,
    });
    expect(res.ok).toBe(true);
    expect(h.updateJobFields).toHaveBeenCalledTimes(1);
    const [jobId, diff, actorId] = h.updateJobFields.mock.calls[0] as unknown[];
    expect(jobId).toBe("j1");
    expect(actorId).toBe("u1");
    expect(diff).toEqual({ title: "Renamed job" });
    // Log carries job_id + the single field change.
    const [entity, id, action, changes] = h.logActivity.mock.calls[0] as unknown[];
    expect(entity).toBe("project");
    expect(id).toBe("p1");
    expect(action).toBe("update");
    expect(changes).toMatchObject({
      job_id: { from: null, to: "j1" },
      title: { from: "Original title", to: "Renamed job" },
    });
  });

  it("writes both fields when both change", async () => {
    const res = await editJobAction({
      jobId: "j1",
      title: "Renamed",
      contract_value: 2500.5,
    });
    expect(res.ok).toBe(true);
    const [, diff] = h.updateJobFields.mock.calls[0] as unknown[];
    expect(diff).toEqual({ title: "Renamed", contract_value: 2500.5 });
  });

  it("does NOT fail the action if activity logging throws", async () => {
    h.logActivity.mockImplementation(async () => {
      throw new Error("log boom");
    });
    const res = await editJobAction({ jobId: "j1", title: "Renamed" });
    expect(res.ok).toBe(true);
    expect(h.updateJobFields).toHaveBeenCalled();
  });
});
