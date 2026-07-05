// PROJ2-2 — editProjectAction. Mocks the projects API + auth + activity log,
// keeps the real permissions matrix. Mirrors the PROJ2-1 action tests.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  current: null as Record<string, unknown> | null,
  updateProjectFields: vi.fn(async () => {}),
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/api/projects", () => ({
  getProjectRow: async () => h.current,
  updateProjectFields: h.updateProjectFields,
  // other named exports actions.ts imports (unused here)
  getProjectStatus: vi.fn(),
  setProjectStatus: vi.fn(),
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

import { editProjectAction } from "@/app/(app)/projects/actions";

function baseRow() {
  return {
    id: "p1",
    title: "Old title",
    description: "Old desc",
    start_date: "2026-01-01",
    target_completion: "2026-06-01",
    pm_user_id: null,
    lead_tech_id: null,
  };
}

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.current = baseRow();
  h.updateProjectFields.mockClear();
  h.logActivity.mockClear();
  h.logActivity.mockImplementation(async () => {});
});

describe("editProjectAction", () => {
  it("denies a role without projects:edit", async () => {
    h.profile = { id: "u1", role: "ViewOnly", status: "Active" };
    const res = await editProjectAction({ projectId: "p1", title: "New" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission/i);
    expect(h.updateProjectFields).not.toHaveBeenCalled();
  });

  it("no-ops on an empty diff (all provided fields match current)", async () => {
    const res = await editProjectAction({
      projectId: "p1",
      title: "Old title",
      description: "Old desc",
      start_date: "2026-01-01",
    });
    expect(res.ok).toBe(true);
    expect(h.updateProjectFields).not.toHaveBeenCalled();
    expect(h.logActivity).not.toHaveBeenCalled();
  });

  it("rejects an empty title", async () => {
    const res = await editProjectAction({ projectId: "p1", title: "   " });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_title");
  });

  it("rejects a title over 200 chars", async () => {
    const res = await editProjectAction({
      projectId: "p1",
      title: "x".repeat(201),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_title");
  });

  it("rejects a description over 2000 chars", async () => {
    const res = await editProjectAction({
      projectId: "p1",
      description: "x".repeat(2001),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_description");
  });

  it("rejects an unparseable date", async () => {
    const res = await editProjectAction({
      projectId: "p1",
      start_date: "not-a-date",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_start_date");
  });

  it("writes ONLY the changed field + logs the diff", async () => {
    const res = await editProjectAction({
      projectId: "p1",
      title: "Old title", // unchanged
      description: "New desc", // changed
    });
    expect(res.ok).toBe(true);
    expect(h.updateProjectFields).toHaveBeenCalledTimes(1);
    const [id, patch, actor] = h.updateProjectFields.mock.calls[0] as unknown[];
    expect(id).toBe("p1");
    expect(patch).toEqual({ description: "New desc" }); // title omitted (unchanged)
    expect(actor).toBe("u1");
    expect(h.logActivity).toHaveBeenCalledTimes(1);
    const [entity, , action, changes] = h.logActivity.mock.calls[0] as unknown[];
    expect(entity).toBe("project");
    expect(action).toBe("update");
    expect(changes).toMatchObject({
      description: { from: "Old desc", to: "New desc" },
    });
  });

  it("normalizes an empty-string date to null in the diff", async () => {
    const res = await editProjectAction({ projectId: "p1", start_date: "" });
    expect(res.ok).toBe(true);
    const [, patch] = h.updateProjectFields.mock.calls[0] as unknown[];
    expect(patch).toEqual({ start_date: null });
  });

  it("does NOT fail the action if activity logging throws", async () => {
    h.logActivity.mockImplementation(async () => {
      throw new Error("log boom");
    });
    const res = await editProjectAction({ projectId: "p1", description: "New" });
    expect(res.ok).toBe(true);
    expect(h.updateProjectFields).toHaveBeenCalledTimes(1);
  });
});
