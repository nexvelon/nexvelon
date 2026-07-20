// PROJ2-8 — moveProjectToSite (lib) + moveProjectToSiteAction (the cross-client
// confirm gate). Same-site rejected; cross-client requires the explicit confirm
// flag; on the move the project + folder tree + invoices follow the new
// site/client, and quotes are NEVER rewritten (§2.2).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

type Captured = {
  payload: Record<string, unknown>;
  filters: Array<{ method: string; args: unknown[] }>;
};

const s = vi.hoisted(() => ({
  project: null as Record<string, unknown> | null,
  siteRow: null as Record<string, unknown> | null,
  updates: {} as Record<string, Captured[]>,
  profile: { id: "u1", role: "Admin", status: "Active" } as Record<
    string,
    unknown
  > | null,
  log: vi.fn(async () => {}),
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.op === "update") {
    const list = s.updates[ctx.table] ?? [];
    list.push({
      payload: ctx.payload as Record<string, unknown>,
      filters: ctx.filters,
    });
    s.updates[ctx.table] = list;
    return { data: null, error: null };
  }
  if (ctx.table === "sites") return { data: s.siteRow, error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/projects", () => ({
  getProjectRow: async () => s.project,
  getJobById: vi.fn(),
  getNextCoNumber: vi.fn(),
  getMainJobForProject: async () => null,
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
  updateProjectFields: vi.fn(),
  listJobsForProject: vi.fn(),
  createChangeOrderJob: vi.fn(),
  updateJobFields: vi.fn(),
  setJobStatus: vi.fn(),
  reassignJobFinancialsToMainJob: vi.fn(),
  deleteJobRow: vi.fn(),
}));
vi.mock("@/lib/api/job-line-items", () => ({
  syncCostCenterAndJobTotals: vi.fn(async () => {}),
  listLineItemsForJob: vi.fn(),
  getLineItemById: vi.fn(),
  createLineItem: vi.fn(),
  updateLineItem: vi.fn(),
  deleteLineItem: vi.fn(),
  reorderLineItems: vi.fn(),
  cloneLineItem: vi.fn(),
  copyQuoteSectionsToJob: vi.fn(),
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: s.log }));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => s.profile,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { moveProjectToSite } from "@/lib/api/job-move";
import { moveProjectToSiteAction } from "@/app/(app)/projects/actions";

beforeEach(() => {
  s.project = { id: "p1", client_id: "c1", site_id: "s1" };
  s.siteRow = {
    id: "s2",
    name: "North Plant",
    client_id: "c2",
    client: { name: "Beta Corp" },
  };
  s.updates = {};
  s.profile = { id: "u1", role: "Admin", status: "Active" };
  s.log.mockClear();
});

describe("moveProjectToSite (lib)", () => {
  it("rejects a move to the same site", async () => {
    s.project = { id: "p1", client_id: "c1", site_id: "s2" };
    const res = await moveProjectToSite({
      projectId: "p1",
      targetSiteId: "s2",
      actorId: "u1",
    });
    expect(res).toEqual({ ok: false, error: "same_site" });
    expect(s.updates).toEqual({});
  });

  it("updates project, folder tree, and invoices — and never touches quotes", async () => {
    const res = await moveProjectToSite({
      projectId: "p1",
      targetSiteId: "s2",
      actorId: "u1",
    });
    expect(res).toEqual({ ok: true });

    const pU = s.updates.projects![0];
    expect(pU.payload).toMatchObject({ site_id: "s2", client_id: "c2" });
    expect(pU.filters).toContainEqual({ method: "eq", args: ["id", "p1"] });

    const fU = s.updates.attachment_folders![0];
    expect(fU.payload).toEqual({ site_id: "s2" });
    expect(fU.filters).toContainEqual({
      method: "eq",
      args: ["project_id", "p1"],
    });

    const iU = s.updates.invoices![0];
    expect(iU.payload).toEqual({ site_id: "s2", client_id: "c2" });
    expect(iU.filters).toContainEqual({
      method: "eq",
      args: ["project_id", "p1"],
    });

    // §2.2 — quotes are historical documents; no update ever lands on them.
    expect(s.updates.quotes).toBeUndefined();
  });
});

describe("moveProjectToSiteAction (cross-client confirm gate)", () => {
  it("requires the confirm flag for a cross-client move", async () => {
    const res = await moveProjectToSiteAction({
      projectId: "p1",
      targetSiteId: "s2",
    });
    expect(res).toEqual({
      ok: false,
      error: "cross_client_confirm_required",
      target_client_name: "Beta Corp",
    });
    expect(s.updates).toEqual({}); // nothing moved
  });

  it("moves cross-client with the confirm flag set", async () => {
    const res = await moveProjectToSiteAction({
      projectId: "p1",
      targetSiteId: "s2",
      confirmCrossClient: true,
    });
    expect(res).toEqual({ ok: true });
    expect(s.updates.projects![0].payload).toMatchObject({
      site_id: "s2",
      client_id: "c2",
    });
    expect(s.updates.quotes).toBeUndefined();
  });

  it("same-client move needs no confirm", async () => {
    s.siteRow = { id: "s2", name: "Annex", client_id: "c1", client: { name: "Acme" } };
    const res = await moveProjectToSiteAction({
      projectId: "p1",
      targetSiteId: "s2",
    });
    expect(res).toEqual({ ok: true });
    expect(s.updates.projects![0].payload).toMatchObject({
      site_id: "s2",
      client_id: "c1",
    });
  });
});
