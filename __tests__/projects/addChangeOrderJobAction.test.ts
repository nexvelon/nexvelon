// PROJ2-4d — addChangeOrderJobAction. Manual C.O creation (no source quote).
// createChangeOrderJob assigns co_number internally (getNextCoNumber), so here
// we assert the action passes source_quote_id NULL, validates the title, and
// scaffolds the folder tree for the new C.O.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  createdJob: {
    id: "co9",
    project_id: "p1",
    job_type: "change_order",
    co_number: 3,
  },
  createChangeOrderJob: vi.fn(async () => h.createdJob),
  projectRow: { id: "p1", site_id: "site1" } as { id: string; site_id: string | null } | null,
  scaffold: vi.fn(async () => ({ changeOrderFolderId: "f1" })),
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/api/projects", () => ({
  getMainJobForProject: vi.fn(),
  createChangeOrderJob: h.createChangeOrderJob,
  getProjectRow: async () => h.projectRow,
  getJobById: vi.fn(),
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
  updateProjectFields: vi.fn(),
  listJobsForProject: vi.fn(),
  updateJobFields: vi.fn(),
  setJobStatus: vi.fn(),
  reassignJobFinancialsToMainJob: vi.fn(),
  deleteJobRow: vi.fn(),
}));
vi.mock("@/lib/api/attachment-folders", () => ({
  scaffoldFoldersForNewChangeOrder: h.scaffold,
  scaffoldFoldersForNewProject: vi.fn(),
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addChangeOrderJobAction } from "@/app/(app)/projects/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.projectRow = { id: "p1", site_id: "site1" };
  h.createChangeOrderJob.mockClear();
  h.createChangeOrderJob.mockImplementation(async () => h.createdJob);
  h.scaffold.mockClear();
  h.scaffold.mockImplementation(async () => ({ changeOrderFolderId: "f1" }));
  h.logActivity.mockClear();
  h.logActivity.mockImplementation(async () => {});
});

describe("addChangeOrderJobAction", () => {
  it("creates a C.O with source_quote_id NULL and default contract 0", async () => {
    const res = await addChangeOrderJobAction({ projectId: "p1", title: "Extra reader" });
    expect(res.ok).toBe(true);
    expect(h.createChangeOrderJob).toHaveBeenCalledWith({
      projectId: "p1",
      title: "Extra reader",
      sourceQuoteId: null,
      contractValue: 0,
      actorId: "u1",
    });
    if (res.ok) expect(res.data.jobId).toBe("co9");
  });

  it("passes the provided contract value through", async () => {
    await addChangeOrderJobAction({
      projectId: "p1",
      title: "Extra reader",
      contractValue: 1250.75,
    });
    expect(h.createChangeOrderJob).toHaveBeenCalledWith(
      expect.objectContaining({ contractValue: 1250.75, sourceQuoteId: null })
    );
  });

  it("scaffolds the folder tree for the new C.O", async () => {
    await addChangeOrderJobAction({ projectId: "p1", title: "Extra reader" });
    expect(h.scaffold).toHaveBeenCalledWith({
      projectId: "p1",
      jobId: "co9",
      coNumber: 3,
      siteId: "site1",
      actorId: "u1",
    });
  });

  it("rejects an empty title (no create, no scaffold)", async () => {
    const res = await addChangeOrderJobAction({ projectId: "p1", title: "   " });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_title");
    expect(h.createChangeOrderJob).not.toHaveBeenCalled();
    expect(h.scaffold).not.toHaveBeenCalled();
  });

  it("rejects a negative contract value", async () => {
    const res = await addChangeOrderJobAction({
      projectId: "p1",
      title: "Extra",
      contractValue: -5,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_contract_value");
    expect(h.createChangeOrderJob).not.toHaveBeenCalled();
  });

  it("denies a role without projects:edit", async () => {
    h.profile = { id: "u1", role: "ViewOnly", status: "Active" };
    const res = await addChangeOrderJobAction({ projectId: "p1", title: "Extra" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.createChangeOrderJob).not.toHaveBeenCalled();
  });

  it("still succeeds if the folder scaffold throws (best-effort)", async () => {
    h.scaffold.mockImplementation(async () => {
      throw new Error("scaffold boom");
    });
    const res = await addChangeOrderJobAction({ projectId: "p1", title: "Extra" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.jobId).toBe("co9");
  });

  it("logs a 'create' event with source: manual", async () => {
    await addChangeOrderJobAction({ projectId: "p1", title: "Extra" });
    const [entity, id, action, changes] = h.logActivity.mock.calls[0] as unknown[];
    expect(entity).toBe("project");
    expect(id).toBe("p1");
    expect(action).toBe("create");
    expect(changes).toMatchObject({
      job_id: { from: null, to: "co9" },
      co_number: { from: null, to: 3 },
      source: { from: null, to: "manual" },
    });
  });
});
