// PROJ2-4b — folder scaffolding for new projects / change orders.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const st = vi.hoisted(() => ({
  singles: [] as Record<string, unknown>[], // insert-single payloads (folders)
  defaults: null as Record<string, unknown>[] | null, // insert-array (defaults)
  wrapper: { id: "wrap-1", site_id: "site-1" } as Record<string, unknown> | null,
  counter: 0,
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown; count?: number } {
  if (ctx.table === "attachment_folders") {
    if (ctx.op === "insert" && ctx.terminal === "single") {
      st.singles.push(ctx.payload as Record<string, unknown>);
      st.counter += 1;
      return { data: { id: `f${st.counter}`, ...(ctx.payload as object) }, error: null };
    }
    if (ctx.op === "insert") {
      // array insert (defaults)
      st.defaults = ctx.payload as Record<string, unknown>[];
      return { data: null, error: null };
    }
    if (ctx.terminal === "maybeSingle") return { data: st.wrapper, error: null };
    // select-await → the project-ordinal count
    return { data: null, error: null, count: 0 };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));

import {
  scaffoldFoldersForNewProject,
  scaffoldFoldersForNewChangeOrder,
} from "@/lib/api/attachment-folders";

beforeEach(() => {
  st.singles = [];
  st.defaults = null;
  st.wrapper = { id: "wrap-1", site_id: "site-1" };
  st.counter = 0;
});

describe("scaffoldFoldersForNewProject", () => {
  it("creates project_container + main_job + change_orders + 19 defaults", async () => {
    await scaffoldFoldersForNewProject({
      projectId: "proj-1",
      siteId: "site-1",
      mainJobId: "mj-1",
      actorId: "u1",
    });
    // three single folder inserts in order
    expect(st.singles.map((s) => s.kind)).toEqual([
      "project_container",
      "main_job",
      "change_orders",
    ]);
    // 19 defaults under main job, ordered 0..18, all default_subfolder
    expect(st.defaults).toHaveLength(19);
    expect(st.defaults!.every((d) => d.kind === "default_subfolder")).toBe(true);
    expect(st.defaults!.map((d) => d.sort_order)).toEqual(
      Array.from({ length: 19 }, (_, i) => i)
    );
    expect(st.defaults![0]).toMatchObject({ job_id: "mj-1", parent_id: "f2" });
  });
});

describe("scaffoldFoldersForNewChangeOrder", () => {
  it("creates a change_order folder + 19 defaults under the wrapper", async () => {
    await scaffoldFoldersForNewChangeOrder({
      projectId: "proj-1",
      jobId: "co-job-1",
      coNumber: 2,
      siteId: "site-1",
      actorId: "u1",
    });
    expect(st.singles).toHaveLength(1);
    expect(st.singles[0]).toMatchObject({
      kind: "change_order",
      name: "C.O #2",
      slug: "co_2",
      parent_id: "wrap-1",
      job_id: "co-job-1",
    });
    expect(st.defaults).toHaveLength(19);
    expect(st.defaults!.every((d) => d.kind === "default_subfolder")).toBe(true);
  });
});
