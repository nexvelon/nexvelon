// PROJ2-3 — verifies the re-gated project actions enforce the projects:*
// resource. Mocks the projects API + auth + activity log; keeps the REAL
// permissions matrix so role→permission is exercised. Mirrors the existing
// __tests__/projects mock pattern.
//
// Role facts used below (from lib/permissions.ts):
//   Admin       → projects: view/create/edit (+ financials:edit)
//   SalesRep    → projects: view ONLY (no create/edit, no financials)
//   Technician  → projects: view ONLY (no financials)

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  // PROJ2-4a — these now return { project, mainJob } / { project, changeOrderJob }.
  createProjectFromQuote: vi.fn(async () => ({
    project: { id: "p1", project_number: "P-1" },
    mainJob: { id: "main-1" },
  })),
  mergeQuoteIntoProject: vi.fn(async () => ({
    project: { id: "p1", project_number: "P-1" },
    changeOrderJob: { id: "co-1", co_number: 1 },
  })),
  addCostCenter: vi.fn(async () => ({ id: "cc1", cc_number: "PJ-1", name: "CC" })),
  renameCostCenter: vi.fn(async () => ({ id: "cc1", cc_number: "PJ-1", name: "New" })),
  deleteCostCenter: vi.fn(async () => true),
  getCostCenterById: vi.fn(async () => ({
    id: "cc1",
    project_id: "p1",
    cc_number: "PJ-1",
    name: "Old",
  })),
  getProjectCostRollup: vi.fn(async () => ({
    perProject: {
      contract: 100,
      invoiced: 0,
      materials: 10,
      labour: 20,
      spent: 30,
      margin: 70,
      billed_pct: 0,
    },
    perCostCenter: {
      cc1: { contract: 100, materials: 10, labour: 20, spent: 30, margin: 70 },
    },
    // PROJ2-4a — byJob is now part of the rollup; redactRollup iterates it.
    byJob: [
      {
        job_id: "main-1",
        job_type: "main_job",
        co_number: null,
        title: "Main",
        status: "active",
        contract: 100,
        materials: 10,
        labour: 20,
        spent: 30,
        margin: 70,
        invoiced: 0,
        billed_pct: null,
      },
    ],
  })),
}));

vi.mock("@/lib/api/projects", () => ({
  createProjectFromQuote: h.createProjectFromQuote,
  mergeQuoteIntoProject: h.mergeQuoteIntoProject,
  addCostCenter: h.addCostCenter,
  renameCostCenter: h.renameCostCenter,
  deleteCostCenter: h.deleteCostCenter,
  getCostCenterById: h.getCostCenterById,
  // unused by these tests
  listProjects: vi.fn(),
  getProjectById: vi.fn(),
  listProjectsForClient: vi.fn(),
  getProjectStatus: vi.fn(),
  setProjectStatus: vi.fn(),
  getProjectRow: vi.fn(),
  updateProjectFields: vi.fn(),
}));
vi.mock("@/lib/api/project-cost-rollup", () => ({
  getProjectCostRollup: h.getProjectCostRollup,
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createProjectFromQuoteAction,
  mergeQuoteIntoProjectAction,
  addCostCenterAction,
  renameCostCenterAction,
  deleteCostCenterAction,
} from "@/app/(app)/projects/actions";
import { getProjectCostRollupAction } from "@/app/(app)/projects/rollup-actions";
import type { Quote } from "@/lib/types";

const QUOTE = { id: "q1", sections: [] } as unknown as Quote;

function setRole(role: string | null) {
  h.profile = role === null ? null : { id: "u1", role, status: "Active" };
}

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  for (const fn of [
    h.createProjectFromQuote,
    h.mergeQuoteIntoProject,
    h.addCostCenter,
    h.renameCostCenter,
    h.deleteCostCenter,
  ]) {
    fn.mockClear();
  }
});

describe("createProjectFromQuoteAction — projects:create", () => {
  it("denies a role without projects:create (SalesRep)", async () => {
    setRole("SalesRep");
    const res = await createProjectFromQuoteAction(QUOTE);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.createProjectFromQuote).not.toHaveBeenCalled();
  });

  it("passes the gate for a role with projects:create (Admin)", async () => {
    setRole("Admin");
    const res = await createProjectFromQuoteAction(QUOTE);
    expect(res.ok).toBe(true);
    expect(h.createProjectFromQuote).toHaveBeenCalledTimes(1);
  });
});

describe("mergeQuoteIntoProjectAction — projects:edit", () => {
  it("denies a role without projects:edit (SalesRep)", async () => {
    setRole("SalesRep");
    const res = await mergeQuoteIntoProjectAction(QUOTE, "p1");
    expect(res.ok).toBe(false);
    expect(h.mergeQuoteIntoProject).not.toHaveBeenCalled();
  });

  it("passes the gate for projects:edit (Admin)", async () => {
    setRole("Admin");
    const res = await mergeQuoteIntoProjectAction(QUOTE, "p1");
    expect(res.ok).toBe(true);
    expect(h.mergeQuoteIntoProject).toHaveBeenCalledTimes(1);
  });
});

describe("cost-center actions — projects:edit", () => {
  it("addCostCenterAction denies without projects:edit", async () => {
    setRole("SalesRep");
    const res = await addCostCenterAction("p1", "New CC");
    expect(res.ok).toBe(false);
    expect(h.addCostCenter).not.toHaveBeenCalled();
  });
  it("addCostCenterAction passes with projects:edit", async () => {
    setRole("Admin");
    const res = await addCostCenterAction("p1", "New CC");
    expect(res.ok).toBe(true);
    expect(h.addCostCenter).toHaveBeenCalledTimes(1);
  });

  it("renameCostCenterAction denies without projects:edit", async () => {
    setRole("SalesRep");
    const res = await renameCostCenterAction("cc1", "p1", "New");
    expect(res.ok).toBe(false);
    expect(h.renameCostCenter).not.toHaveBeenCalled();
  });
  it("renameCostCenterAction passes with projects:edit", async () => {
    setRole("Admin");
    const res = await renameCostCenterAction("cc1", "p1", "New");
    expect(res.ok).toBe(true);
    expect(h.renameCostCenter).toHaveBeenCalledTimes(1);
  });

  it("deleteCostCenterAction denies without projects:edit", async () => {
    setRole("SalesRep");
    const res = await deleteCostCenterAction("cc1", "p1");
    expect(res.ok).toBe(false);
    expect(h.deleteCostCenter).not.toHaveBeenCalled();
  });
  it("deleteCostCenterAction passes with projects:edit", async () => {
    setRole("Admin");
    const res = await deleteCostCenterAction("cc1", "p1");
    expect(res.ok).toBe(true);
    expect(h.deleteCostCenter).toHaveBeenCalledTimes(1);
  });
});

describe("getProjectCostRollupAction — projects:view gate + financials redaction", () => {
  it("denies an unauthenticated caller (no projects:view)", async () => {
    setRole(null);
    const res = await getProjectCostRollupAction("p1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.getProjectCostRollup).not.toHaveBeenCalled();
  });

  it("enters for a project viewer but REDACTS financials without financials:edit", async () => {
    setRole("Technician"); // projects:view, no financials
    const res = await getProjectCostRollupAction("p1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.canSeeFinancials).toBe(false);
      expect(res.data.rollup.perProject.labour).toBeNull();
      expect(res.data.rollup.perProject.spent).toBeNull();
      expect(res.data.rollup.perProject.margin).toBeNull();
      expect(res.data.rollup.perCostCenter.cc1.labour).toBeNull();
    }
  });

  it("shows financials for a financials:edit holder (Admin)", async () => {
    setRole("Admin");
    const res = await getProjectCostRollupAction("p1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.canSeeFinancials).toBe(true);
      expect(res.data.rollup.perProject.labour).toBe(20);
      expect(res.data.rollup.perProject.margin).toBe(70);
    }
  });
});
