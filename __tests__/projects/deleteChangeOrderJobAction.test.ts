// PROJ2-4d — deleteChangeOrderJobAction. Main Jobs are undeletable; Change
// Orders reassign their financial records to the Main Job, recompute the Main
// Job contract_value, then hard-delete the row. Real permissions; the
// reassignment (steps 1–5) is exercised in the lib helper's own tests — here we
// assert orchestration: the guard, the helper call, the delete, and the log.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  job: {
    id: "co1",
    project_id: "p1",
    job_type: "change_order",
    co_number: 2,
  } as {
    id: string;
    project_id: string;
    job_type: string;
    co_number: number | null;
  } | null,
  reassign: vi.fn(async () => ({
    mainJobId: "main1",
    reassignedCostCenters: 3,
    reassignedInvoices: 2,
    reassignedPurchaseOrders: 1,
  })),
  deleteJobRow: vi.fn(async () => {}),
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/api/projects", () => ({
  getNextCoNumber: vi.fn(),
  getMainJobForProject: vi.fn(),
  getJobById: async () => h.job,
  reassignJobFinancialsToMainJob: h.reassign,
  deleteJobRow: h.deleteJobRow,
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
  setJobStatus: vi.fn(),
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteChangeOrderJobAction } from "@/app/(app)/projects/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.job = { id: "co1", project_id: "p1", job_type: "change_order", co_number: 2 };
  h.reassign.mockClear();
  h.reassign.mockImplementation(async () => ({
    mainJobId: "main1",
    reassignedCostCenters: 3,
    reassignedInvoices: 2,
    reassignedPurchaseOrders: 1,
  }));
  h.deleteJobRow.mockClear();
  h.logActivity.mockClear();
  h.logActivity.mockImplementation(async () => {});
});

describe("deleteChangeOrderJobAction", () => {
  it("rejects a Main Job → cannot_delete_main_job (no reassign, no delete)", async () => {
    h.job = { id: "main1", project_id: "p1", job_type: "main_job", co_number: null };
    const res = await deleteChangeOrderJobAction({ jobId: "main1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("cannot_delete_main_job");
    expect(h.reassign).not.toHaveBeenCalled();
    expect(h.deleteJobRow).not.toHaveBeenCalled();
  });

  it("returns not_found for a missing job", async () => {
    h.job = null;
    const res = await deleteChangeOrderJobAction({ jobId: "nope" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_found");
  });

  it("denies a role without projects:edit", async () => {
    h.profile = { id: "u1", role: "ViewOnly", status: "Active" };
    const res = await deleteChangeOrderJobAction({ jobId: "co1" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.reassign).not.toHaveBeenCalled();
  });

  it("reassigns financials to the Main Job, then deletes the C.O row", async () => {
    const res = await deleteChangeOrderJobAction({ jobId: "co1" });
    expect(res.ok).toBe(true);
    // reassignment (cost centers + invoices + POs + main contract recompute).
    expect(h.reassign).toHaveBeenCalledWith("co1", "p1");
    expect(h.deleteJobRow).toHaveBeenCalledWith("co1");
    if (res.ok) {
      expect(res.data).toEqual({
        reassignedCostCenters: 3,
        reassignedInvoices: 2,
        reassignedPurchaseOrders: 1,
      });
    }
  });

  it("deletes AFTER reassigning (invoices.job_id is ON DELETE RESTRICT)", async () => {
    const order: string[] = [];
    h.reassign.mockImplementation(async () => {
      order.push("reassign");
      return {
        mainJobId: "main1",
        reassignedCostCenters: 1,
        reassignedInvoices: 1,
        reassignedPurchaseOrders: 0,
      };
    });
    h.deleteJobRow.mockImplementation(async () => {
      order.push("delete");
    });
    await deleteChangeOrderJobAction({ jobId: "co1" });
    expect(order).toEqual(["reassign", "delete"]);
  });

  it("best-effort log carries the reassignment counts", async () => {
    await deleteChangeOrderJobAction({ jobId: "co1" });
    expect(h.logActivity).toHaveBeenCalledTimes(1);
    const [entity, id, action, changes] = h.logActivity.mock.calls[0] as unknown[];
    expect(entity).toBe("project");
    expect(id).toBe("p1");
    expect(action).toBe("delete");
    expect(changes).toMatchObject({
      deleted_job_id: { from: "co1", to: null },
      main_job_id: { from: null, to: "main1" },
      reassigned_cost_centers: { from: null, to: 3 },
      reassigned_invoices: { from: null, to: 2 },
      reassigned_purchase_orders: { from: null, to: 1 },
    });
  });

  it("does NOT fail the action if activity logging throws", async () => {
    h.logActivity.mockImplementation(async () => {
      throw new Error("log boom");
    });
    const res = await deleteChangeOrderJobAction({ jobId: "co1" });
    expect(res.ok).toBe(true);
    expect(h.deleteJobRow).toHaveBeenCalledWith("co1");
  });
});
