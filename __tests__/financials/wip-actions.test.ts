// PROJ2-18 — gates + redaction on the WIP actions. Full detail needs
// financials:edit; a financials:VIEW holder gets the billing side but the cost
// legs (estimated/actual/pct/earned/over_under/remaining_cost) nulled. The
// portfolio + CSV are financials:edit outright.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  jobWip: {
    job_id: "j1", title: "Main", job_type: "main_job", co_number: null,
    contract: 1000, estimated_cost: 600, actual_cost: 300, pct_complete: 0.5,
    pct_complete_method: "cost_to_cost", earned: 500, billed: 400, over_under: -100,
    position: "underbilled", holdback_retained: 40, remaining_to_bill: 600, remaining_cost: 300,
  },
  getJobWip: vi.fn(),
  getWipPortfolio: vi.fn(async () => ({ rows: [], totals: { overbilled: 0, underbilled: 0, net: 0 } })),
  buildWipCsv: vi.fn(() => "Project\r\n"),
}));

vi.mock("@/lib/api/wip", () => ({
  getJobWip: h.getJobWip,
  getProjectWip: vi.fn(async () => ({ project_id: "p1", jobs: [], rollup: {} })),
  getWipPortfolio: h.getWipPortfolio,
  buildWipCsv: h.buildWipCsv,
}));
vi.mock("@/lib/api/projects", () => ({ getJobById: vi.fn() }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));

import {
  getJobWipAction,
  getWipPortfolioAction,
  exportWipCsvAction,
} from "@/app/(app)/projects/wip-actions";

const setRole = (role: string) => (h.profile = { id: "u1", role, status: "Active" });

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.getJobWip.mockReset();
  h.getJobWip.mockResolvedValue({ ...h.jobWip });
  h.getWipPortfolio.mockClear();
});

describe("getJobWipAction — gate + redaction", () => {
  it("financials:edit (Accountant) sees the full cost side", async () => {
    setRole("Accountant");
    const res = await getJobWipAction("j1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.canSeeCost).toBe(true);
      expect(res.data.wip?.earned).toBe(500);
      expect(res.data.wip?.over_under).toBe(-100);
    }
  });

  it("financials:VIEW-only (ProjectManager) gets the billing side but cost legs NULLED", async () => {
    setRole("ProjectManager");
    const res = await getJobWipAction("j1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.canSeeCost).toBe(false);
      const w = res.data.wip!;
      // cost-derived legs redacted
      expect(w.estimated_cost).toBeNull();
      expect(w.actual_cost).toBeNull();
      expect(w.pct_complete).toBeNull();
      expect(w.earned).toBeNull();
      expect(w.over_under).toBeNull();
      expect(w.remaining_cost).toBeNull();
      expect(w.position).toBe("indeterminate");
      // billing side stays visible
      expect(w.billed).toBe(400);
      expect(w.remaining_to_bill).toBe(600);
      expect(w.holdback_retained).toBe(40);
    }
  });

  it("rejects a caller with no project view (Subcontractor has it; use unauthenticated)", async () => {
    h.profile = null;
    expect((await getJobWipAction("j1")).ok).toBe(false);
    expect(h.getJobWip).not.toHaveBeenCalled();
  });
});

describe("portfolio + CSV require financials:edit", () => {
  it("reject a financials:view-only role (ProjectManager)", async () => {
    setRole("ProjectManager");
    expect((await getWipPortfolioAction()).ok).toBe(false);
    expect((await exportWipCsvAction()).ok).toBe(false);
    expect(h.getWipPortfolio).not.toHaveBeenCalled();
  });

  it("pass for Accountant; CSV carries a filename + header", async () => {
    setRole("Accountant");
    expect((await getWipPortfolioAction()).ok).toBe(true);
    const csv = await exportWipCsvAction();
    expect(csv.ok).toBe(true);
    if (csv.ok) {
      expect(csv.data.filename).toMatch(/^nexvelon-wip-.*\.csv$/);
      expect(csv.data.csv).toContain("Project");
    }
  });
});
