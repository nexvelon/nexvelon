// PROJ2-4b — folder server actions gate on projects:edit. Mocks the folder API
// + auth + activity log; keeps the real permissions matrix.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  createUserFolder: vi.fn(async () => ({
    id: "f1",
    project_id: "proj-1",
    site_id: "site-1",
  })),
  renameFolder: vi.fn(async () => {}),
  deleteFolder: vi.fn(async () => {}),
  getFolderById: vi.fn(async () => ({
    id: "f1",
    project_id: "proj-1",
    site_id: "site-1",
    name: "RFIs",
  })),
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/api/attachment-folders", () => ({
  createUserFolder: h.createUserFolder,
  renameFolder: h.renameFolder,
  deleteFolder: h.deleteFolder,
  getFolderById: h.getFolderById,
  reorderFolder: vi.fn(),
  countFolderContents: vi.fn(),
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.logActivity }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createUserFolderAction,
  renameFolderAction,
  deleteFolderAction,
} from "@/app/(app)/attachments/folder-actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
  h.createUserFolder.mockClear();
  h.renameFolder.mockClear();
  h.deleteFolder.mockClear();
  h.logActivity.mockClear();
});

describe("createUserFolderAction — projects:edit", () => {
  it("denies without projects:edit (SalesRep)", async () => {
    h.profile = { id: "u1", role: "SalesRep", status: "Active" };
    const res = await createUserFolderAction({ parentId: "p", name: "X" });
    expect(res.ok).toBe(false);
    expect(h.createUserFolder).not.toHaveBeenCalled();
  });
  it("passes with projects:edit (Admin)", async () => {
    const res = await createUserFolderAction({ parentId: "p", name: "X" });
    expect(res.ok).toBe(true);
    expect(h.createUserFolder).toHaveBeenCalledTimes(1);
  });
  it("maps duplicate_name to a friendly message", async () => {
    h.createUserFolder.mockRejectedValueOnce(new Error("duplicate_name"));
    const res = await createUserFolderAction({ parentId: "p", name: "Photos" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/already exists/i);
  });
});

describe("renameFolderAction — projects:edit", () => {
  it("denies without projects:edit", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    const res = await renameFolderAction({ folderId: "f1", newName: "Y" });
    expect(res.ok).toBe(false);
    expect(h.renameFolder).not.toHaveBeenCalled();
  });
  it("passes with projects:edit", async () => {
    const res = await renameFolderAction({ folderId: "f1", newName: "Y" });
    expect(res.ok).toBe(true);
    expect(h.renameFolder).toHaveBeenCalledTimes(1);
  });
});

describe("deleteFolderAction — projects:edit + best-effort log", () => {
  it("denies without projects:edit", async () => {
    h.profile = { id: "u1", role: "ViewOnly", status: "Active" };
    const res = await deleteFolderAction("f1");
    expect(res.ok).toBe(false);
    expect(h.deleteFolder).not.toHaveBeenCalled();
  });
  it("deletes + logs against the project", async () => {
    const res = await deleteFolderAction("f1");
    expect(res.ok).toBe(true);
    expect(h.deleteFolder).toHaveBeenCalledWith("f1");
    expect(h.logActivity).toHaveBeenCalledTimes(1);
    const [entity, id] = h.logActivity.mock.calls[0] as unknown[];
    expect(entity).toBe("project");
    expect(id).toBe("proj-1");
  });
});
