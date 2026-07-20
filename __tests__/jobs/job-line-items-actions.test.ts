// PROJ2-6a — job line-item server actions. Real permissions matrix; mocked API
// + auth + activity log. Verifies the projects:edit / :view gates, the happy
// path, and best-effort logging (a log failure never fails the mutation).

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
  lineItem: { id: "li1", job_id: "j1" } as { id: string; job_id: string } | null,
  createLineItem: vi.fn(async () => ({ id: "li-new", line_kind: "part", description: "W" })),
  updateLineItem: vi.fn(async () => {}),
  deleteLineItem: vi.fn(async () => {}),
  reorderLineItems: vi.fn(async () => {}),
  cloneLineItem: vi.fn(async () => ({ id: "li-clone" })),
  listLineItemsForJob: vi.fn(async () => [{ id: "li1" }]),
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/api/job-line-items", () => ({
  listLineItemsForJob: h.listLineItemsForJob,
  getLineItemById: async () => h.lineItem,
  createLineItem: h.createLineItem,
  updateLineItem: h.updateLineItem,
  deleteLineItem: h.deleteLineItem,
  reorderLineItems: h.reorderLineItems,
  cloneLineItem: h.cloneLineItem,
  copyQuoteSectionsToJob: vi.fn(),
  syncCostCenterAndJobTotals: vi.fn(),
}));
vi.mock("@/lib/api/projects", () => ({
  getJobById: async () => h.job,
  // stubs for the rest of actions.ts's projects imports (unused here)
  listProjects: vi.fn(),
  getProjectById: vi.fn(),
  createProjectFromQuote: vi.fn(),
  listProjectsForClient: vi.fn(),
  listProjectsForSite: vi.fn(),
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
  setJobStatus: vi.fn(),
  reassignJobFinancialsToMainJob: vi.fn(),
  deleteJobRow: vi.fn(),
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  listJobLineItemsAction,
  createJobLineItemAction,
  updateJobLineItemAction,
  deleteJobLineItemAction,
  reorderJobLineItemsAction,
  cloneJobLineItemAction,
} from "@/app/(app)/projects/actions";

const CREATE_INPUT = {
  jobId: "j1",
  costCenterId: "cc1",
  lineKind: "part" as const,
  itemCode: "SKU",
  description: "Widget",
  category: "Materials",
  quantity: 1,
  unitCost: 10,
  unitPrice: 20,
  discountPct: 0,
  taxable: true,
};

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.job = { id: "j1", project_id: "p1", status: "active" };
  h.lineItem = { id: "li1", job_id: "j1" };
  h.createLineItem.mockClear();
  h.updateLineItem.mockClear();
  h.deleteLineItem.mockClear();
  h.reorderLineItems.mockClear();
  h.cloneLineItem.mockClear();
  h.logActivity.mockClear();
  h.logActivity.mockImplementation(async () => {});
});

describe("job line-item action permission gates", () => {
  it("create/update/delete/reorder/clone are rejected without projects:edit", async () => {
    h.profile = { id: "u1", role: "ViewOnly", status: "Active" };
    expect((await createJobLineItemAction(CREATE_INPUT)).ok).toBe(false);
    expect((await updateJobLineItemAction({ id: "li1", patch: { quantity: 2 } })).ok).toBe(false);
    expect((await deleteJobLineItemAction("li1")).ok).toBe(false);
    expect((await reorderJobLineItemsAction({ jobId: "j1", orderedIds: ["li1"] })).ok).toBe(false);
    expect((await cloneJobLineItemAction("li1")).ok).toBe(false);
    expect(h.createLineItem).not.toHaveBeenCalled();
    expect(h.updateLineItem).not.toHaveBeenCalled();
    expect(h.deleteLineItem).not.toHaveBeenCalled();
  });

  it("list is rejected for an unauthenticated caller (view gate)", async () => {
    // Every seeded role has projects:view, so the gate only rejects when there
    // is no signed-in profile.
    h.profile = null;
    const res = await listJobLineItemsAction("j1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.listLineItemsForJob).not.toHaveBeenCalled();
  });

  it("list returns items for a viewer (Admin)", async () => {
    const res = await listJobLineItemsAction("j1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(Array.isArray(res.data)).toBe(true);
  });
});

describe("job line-item actions — happy path (Admin)", () => {
  it("create inserts + logs on the parent project", async () => {
    const res = await createJobLineItemAction(CREATE_INPUT);
    expect(res.ok).toBe(true);
    expect(h.createLineItem).toHaveBeenCalledTimes(1);
    const [entity, id, action] = h.logActivity.mock.calls[0] as unknown[];
    expect(entity).toBe("project");
    expect(id).toBe("p1");
    expect(action).toBe("update");
  });

  it("create returns not_found when the job is missing", async () => {
    h.job = null;
    const res = await createJobLineItemAction(CREATE_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
    expect(h.createLineItem).not.toHaveBeenCalled();
  });

  it("update resolves the item → job → project and logs a delete-safe update", async () => {
    const res = await updateJobLineItemAction({ id: "li1", patch: { quantity: 5 } });
    expect(res.ok).toBe(true);
    expect(h.updateLineItem).toHaveBeenCalledWith({
      id: "li1",
      patch: { quantity: 5 },
      actorId: "u1",
    });
  });

  it("delete hard-deletes + logs 'delete'", async () => {
    const res = await deleteJobLineItemAction("li1");
    expect(res.ok).toBe(true);
    expect(h.deleteLineItem).toHaveBeenCalledWith("li1");
    const [, , action] = h.logActivity.mock.calls[0] as unknown[];
    expect(action).toBe("delete");
  });

  it("reorder passes the ordered ids through", async () => {
    const res = await reorderJobLineItemsAction({ jobId: "j1", orderedIds: ["b", "a"] });
    expect(res.ok).toBe(true);
    expect(h.reorderLineItems).toHaveBeenCalledWith({
      orderedIds: ["b", "a"],
      actorId: "u1",
    });
  });

  it("clone delegates to cloneLineItem", async () => {
    const res = await cloneJobLineItemAction("li1");
    expect(res.ok).toBe(true);
    expect(h.cloneLineItem).toHaveBeenCalledWith("li1", "u1");
  });

  it("a logging failure does NOT fail the mutation", async () => {
    h.logActivity.mockImplementation(async () => {
      throw new Error("log boom");
    });
    const res = await createJobLineItemAction(CREATE_INPUT);
    expect(res.ok).toBe(true);
    expect(h.createLineItem).toHaveBeenCalled();
  });
});
