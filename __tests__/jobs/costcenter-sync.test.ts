// PROJ2-6b — cost-center + job contract_value auto-sync. Line items are the
// source of truth: every line-item mutation re-derives the affected cost
// centers' contract_value (Σ sell totals) and the Job's contract_value
// (Σ CC values + Σ unattributed line sells). Sync is best-effort (§2.8): a
// failure logs a warning and never fails the mutation. deleteCostCenterAction
// re-syncs the Job afterward (its lines went cost_center_id = NULL via the
// SET NULL FK and now count as unattributed).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

type SellRow = { quantity: number; unit_price: number; discount_pct: number };

const s = vi.hoisted(() => ({
  // Fixture state
  linesByCc: {} as Record<string, SellRow[]>, // cc-lines select per cost center
  freeLines: [] as SellRow[], // job's unattributed lines (cost_center_id NULL)
  jobCcRows: [] as { contract_value: number }[], // the job's CC values
  line: null as Record<string, unknown> | null, // getLineItemById result
  failCcLines: false, // make the cc-lines select error (best-effort test)
  // Captures
  ccUpdates: [] as { id: unknown; contract_value: unknown }[],
  jobUpdates: [] as { id: unknown; payload: Record<string, unknown> }[],
  liDeleted: false,
}));

function filterArg(ctx: ChainCtx, method: string, col: string): unknown {
  return ctx.filters.find((f) => f.method === method && f.args[0] === col)
    ?.args[1];
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  switch (ctx.table) {
    case "job_line_items": {
      if (ctx.op === "insert") {
        return {
          data: { id: "li-new", ...(ctx.payload as object) },
          error: null,
        };
      }
      if (ctx.op === "update") return { data: null, error: null };
      if (ctx.op === "delete") {
        s.liDeleted = true;
        return { data: null, error: null };
      }
      // selects
      if (ctx.terminal === "maybeSingle") return { data: s.line, error: null };
      const ccId = filterArg(ctx, "eq", "cost_center_id");
      if (ccId !== undefined) {
        if (s.failCcLines) return { data: null, error: { message: "boom" } };
        return { data: s.linesByCc[ccId as string] ?? [], error: null };
      }
      if (ctx.filters.some((f) => f.method === "is" && f.args[0] === "cost_center_id")) {
        return { data: s.freeLines, error: null };
      }
      // nextSortOrder
      return { data: [{ sort_order: 0 }], error: null };
    }
    case "project_cost_centers": {
      if (ctx.op === "update") {
        s.ccUpdates.push({
          id: filterArg(ctx, "eq", "id"),
          contract_value: (ctx.payload as Record<string, unknown>)
            .contract_value,
        });
        return { data: null, error: null };
      }
      return { data: s.jobCcRows, error: null };
    }
    case "project_jobs": {
      if (ctx.op === "update") {
        s.jobUpdates.push({
          id: filterArg(ctx, "eq", "id"),
          payload: ctx.payload as Record<string, unknown>,
        });
        return { data: null, error: null };
      }
      return { data: null, error: null };
    }
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/quotes", () => ({ getQuoteById: vi.fn() }));

// deleteCostCenterAction dependencies — the projects API is mocked so the
// action runs, but the REAL syncCostCenterAndJobTotals executes against the
// supabase chain mock above.
const h = vi.hoisted(() => ({
  costCenter: {
    id: "cc1",
    project_id: "p1",
    cc_number: "P-001-01",
    name: "Access Control",
    job_id: "j1",
  } as Record<string, unknown> | null,
}));
vi.mock("@/lib/api/projects", () => ({
  getNextCoNumber: vi.fn(),
  getMainJobForProject: vi.fn(),
  getCostCenterById: async () => h.costCenter,
  deleteCostCenter: async () => true,
  // stubs for the rest of actions.ts's projects imports (unused here)
  listProjects: vi.fn(),
  getProjectById: vi.fn(),
  createProjectFromQuote: vi.fn(),
  listProjectsForClient: vi.fn(),
  listProjectsForSite: vi.fn(),
  mergeQuoteIntoProject: vi.fn(),
  addCostCenter: vi.fn(),
  renameCostCenter: vi.fn(),
  getProjectStatus: vi.fn(),
  setProjectStatus: vi.fn(),
  getProjectRow: vi.fn(),
  updateProjectFields: vi.fn(),
  listJobsForProject: vi.fn(),
  getJobById: vi.fn(),
  createChangeOrderJob: vi.fn(),
  updateJobFields: vi.fn(),
  setJobStatus: vi.fn(),
  reassignJobFinancialsToMainJob: vi.fn(),
  deleteJobRow: vi.fn(),
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: "Admin", status: "Active" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createLineItem,
  updateLineItem,
  deleteLineItem,
} from "@/lib/api/job-line-items";
import { deleteCostCenterAction } from "@/app/(app)/projects/actions";

beforeEach(() => {
  s.linesByCc = {};
  s.freeLines = [];
  s.jobCcRows = [];
  s.line = null;
  s.failCcLines = false;
  s.ccUpdates = [];
  s.jobUpdates = [];
  s.liDeleted = false;
  h.costCenter = {
    id: "cc1",
    project_id: "p1",
    cc_number: "P-001-01",
    name: "Access Control",
    job_id: "j1",
  };
});

const CREATE_INPUT = {
  jobId: "j1",
  costCenterId: "cc1",
  lineKind: "part" as const,
  itemCode: null,
  description: "Widget",
  category: null,
  quantity: 2,
  unitCost: 40,
  unitPrice: 100,
  discountPct: 0,
  taxable: true,
  actorId: "u1",
};

describe("syncCostCenterAndJobTotals via createLineItem", () => {
  it("sets CC contract_value = Σ line sells, job = Σ CCs + unattributed lines", async () => {
    // cc1 lines: 2×100 + 1×50×0.9 = 245
    s.linesByCc.cc1 = [
      { quantity: 2, unit_price: 100, discount_pct: 0 },
      { quantity: 1, unit_price: 50, discount_pct: 10 },
    ];
    // Job j1 owns two CCs (245 + 55) + one unattributed line (10) = 310
    s.jobCcRows = [{ contract_value: 245 }, { contract_value: 55 }];
    s.freeLines = [{ quantity: 1, unit_price: 10, discount_pct: 0 }];

    await createLineItem(CREATE_INPUT);

    expect(s.ccUpdates).toEqual([{ id: "cc1", contract_value: 245 }]);
    expect(s.jobUpdates).toHaveLength(1);
    expect(s.jobUpdates[0].id).toBe("j1");
    expect(s.jobUpdates[0].payload.contract_value).toBe(310);
    expect(s.jobUpdates[0].payload.updated_by).toBe("u1");
  });

  it("skips the CC recompute for an unattributed line but still syncs the job", async () => {
    s.jobCcRows = [{ contract_value: 100 }];
    s.freeLines = [{ quantity: 3, unit_price: 20, discount_pct: 0 }];

    await createLineItem({ ...CREATE_INPUT, costCenterId: null });

    expect(s.ccUpdates).toHaveLength(0);
    expect(s.jobUpdates[0].payload.contract_value).toBe(160);
  });
});

describe("updateLineItem — cost-center move", () => {
  it("re-syncs BOTH the old and the new cost center", async () => {
    s.line = { id: "li1", job_id: "j1", cost_center_id: "cc1" };
    s.linesByCc.cc1 = [{ quantity: 1, unit_price: 100, discount_pct: 0 }];
    s.linesByCc.cc2 = [{ quantity: 2, unit_price: 50, discount_pct: 0 }];
    s.jobCcRows = [{ contract_value: 100 }, { contract_value: 100 }];

    await updateLineItem({
      id: "li1",
      patch: { costCenterId: "cc2" },
      actorId: "u1",
    });

    expect(s.ccUpdates.map((u) => u.id).sort()).toEqual(["cc1", "cc2"]);
    expect(s.ccUpdates.find((u) => u.id === "cc1")?.contract_value).toBe(100);
    expect(s.ccUpdates.find((u) => u.id === "cc2")?.contract_value).toBe(100);
    expect(s.jobUpdates).toHaveLength(1);
    expect(s.jobUpdates[0].payload.contract_value).toBe(200);
  });

  it("does not sync on a non-financial patch (description only)", async () => {
    await updateLineItem({
      id: "li1",
      patch: { description: "Renamed" },
      actorId: "u1",
    });
    expect(s.ccUpdates).toHaveLength(0);
    expect(s.jobUpdates).toHaveLength(0);
  });
});

describe("deleteLineItem", () => {
  it("deletes then re-syncs the line's CC and job", async () => {
    s.line = { id: "li1", job_id: "j1", cost_center_id: "cc1" };
    s.linesByCc.cc1 = [];
    s.jobCcRows = [{ contract_value: 0 }];

    await deleteLineItem("li1");

    expect(s.liDeleted).toBe(true);
    expect(s.ccUpdates).toEqual([{ id: "cc1", contract_value: 0 }]);
    expect(s.jobUpdates[0].payload.contract_value).toBe(0);
  });
});

describe("best-effort semantics (§2.8)", () => {
  it("a sync failure never fails the line-item mutation", async () => {
    s.failCcLines = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const created = await createLineItem(CREATE_INPUT);

    expect(created.id).toBe("li-new");
    expect(s.jobUpdates).toHaveLength(0); // sync aborted before the job step
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("deleteCostCenterAction", () => {
  it("re-syncs the job total after the CC delete (lines now unattributed)", async () => {
    // Post-delete state: the job has one remaining CC (100) and the deleted
    // CC's lines now count as unattributed (2×75 = 150) → job total 250.
    s.jobCcRows = [{ contract_value: 100 }];
    s.freeLines = [{ quantity: 2, unit_price: 75, discount_pct: 0 }];

    const res = await deleteCostCenterAction("cc1", "p1");

    expect(res.ok).toBe(true);
    expect(s.ccUpdates).toHaveLength(0); // costCenterIds: [] — job-level only
    expect(s.jobUpdates).toHaveLength(1);
    expect(s.jobUpdates[0].id).toBe("j1");
    expect(s.jobUpdates[0].payload.contract_value).toBe(250);
  });

  it("skips the sync when the CC had no job", async () => {
    h.costCenter = { ...h.costCenter!, job_id: null };
    const res = await deleteCostCenterAction("cc1", "p1");
    expect(res.ok).toBe(true);
    expect(s.jobUpdates).toHaveLength(0);
  });
});
