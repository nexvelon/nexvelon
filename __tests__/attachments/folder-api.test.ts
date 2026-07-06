// PROJ2-4b — folder API helpers. Chainable supabase mock; no DB.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const st = vi.hoisted(() => ({
  parent: {
    id: "parent-1",
    site_id: "site-1",
    project_id: "proj-1",
    job_id: "job-1",
  } as Record<string, unknown> | null,
  siblingSort: [] as { sort_order: number }[],
  insertError: null as { code?: string } | null,
  updateError: null as { code?: string } | null,
  lastInsert: null as Record<string, unknown> | null,
  // for countFolderContents
  projectFolders: [] as Record<string, unknown>[],
  fileCount: 0,
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown; count?: number } {
  if (ctx.table === "attachment_folders") {
    if (ctx.op === "insert") {
      if (st.insertError) return { data: null, error: st.insertError };
      st.lastInsert = ctx.payload as Record<string, unknown>;
      return { data: { id: "new-folder", ...(ctx.payload as object) }, error: null };
    }
    if (ctx.op === "update") return { data: null, error: st.updateError };
    if (ctx.op === "delete") return { data: null, error: null };
    // select
    if (ctx.terminal === "maybeSingle") return { data: st.parent, error: null };
    // sibling sort list OR project folder list — disambiguate by returning
    // whichever the current test set (only one select-await path per call).
    return {
      data: st.projectFolders.length ? st.projectFolders : st.siblingSort,
      error: null,
    };
  }
  if (ctx.table === "attachments") {
    return { data: [], error: null, count: st.fileCount };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));

import {
  createUserFolder,
  renameFolder,
  deleteFolder,
  countFolderContents,
} from "@/lib/api/attachment-folders";

beforeEach(() => {
  st.parent = { id: "parent-1", site_id: "site-1", project_id: "proj-1", job_id: "job-1" };
  st.siblingSort = [];
  st.insertError = null;
  st.updateError = null;
  st.lastInsert = null;
  st.projectFolders = [];
  st.fileCount = 0;
});

describe("createUserFolder", () => {
  it("inherits site/project/job from the parent and is a user_folder", async () => {
    st.siblingSort = [{ sort_order: 4 }];
    await createUserFolder({ parentId: "parent-1", name: "RFIs", actorId: "u1" });
    expect(st.lastInsert).toMatchObject({
      site_id: "site-1",
      project_id: "proj-1",
      job_id: "job-1",
      parent_id: "parent-1",
      name: "RFIs",
      kind: "user_folder",
      is_system: false,
      sort_order: 5, // max sibling + 1
    });
  });

  it("maps a unique violation to 'duplicate_name'", async () => {
    st.insertError = { code: "23505" };
    await expect(
      createUserFolder({ parentId: "parent-1", name: "Photos", actorId: "u1" })
    ).rejects.toThrow("duplicate_name");
  });
});

describe("renameFolder", () => {
  it("updates the name", async () => {
    await expect(
      renameFolder({ folderId: "f1", newName: "New", actorId: "u1" })
    ).resolves.toBeUndefined();
  });
  it("maps a unique violation to 'duplicate_name'", async () => {
    st.updateError = { code: "23505" };
    await expect(
      renameFolder({ folderId: "f1", newName: "Photos", actorId: "u1" })
    ).rejects.toThrow("duplicate_name");
  });
});

describe("deleteFolder", () => {
  it("issues the delete without throwing", async () => {
    await expect(deleteFolder("f1")).resolves.toBeUndefined();
  });
});

describe("countFolderContents", () => {
  it("counts descendants recursively + file count", async () => {
    // folder tree: target has child A; A has child B. (3 folders incl. target)
    st.parent = { id: "target", site_id: "s", project_id: "proj-1", job_id: null };
    st.projectFolders = [
      { id: "target", parent_id: null },
      { id: "A", parent_id: "target" },
      { id: "B", parent_id: "A" },
    ];
    st.fileCount = 7;
    const res = await countFolderContents("target");
    expect(res.subfolderCount).toBe(2); // A + B
    expect(res.fileCount).toBe(7);
  });
});
