// PROJ2-4a — createProjectFromQuoteAction rewire: Main Job created, cost
// centers hung off it, original quote linked. Real API + real permissions
// against a chainable supabase mock.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  pq: null as Record<string, unknown> | null, // project_quotes insert payload
  cc: null as Record<string, unknown>[] | null, // cost-center insert payload
  jobInsert: null as Record<string, unknown> | null, // project_jobs insert payload
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  switch (ctx.table) {
    case "projects":
      // insert → the new project row
      return {
        data: { id: "p1", project_number: "P-1", title: "My project" },
        error: null,
      };
    case "project_quotes":
      s.pq = ctx.payload as Record<string, unknown>;
      return { data: null, error: null };
    case "project_jobs":
      if (ctx.op === "insert") {
        s.jobInsert = ctx.payload as Record<string, unknown>;
        return { data: { id: "main-1", ...(ctx.payload as object) }, error: null };
      }
      return { data: [], error: null };
    case "project_cost_centers":
      s.cc = ctx.payload as Record<string, unknown>[];
      return { data: null, error: null };
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => s.profile }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createProjectFromQuoteAction } from "@/app/(app)/projects/actions";
import type { Quote } from "@/lib/types";

const QUOTE = {
  id: "q1",
  clientId: "c1",
  siteId: "site1",
  name: "My project",
  templateSlug: "integrated_solutions",
  sections: [
    { name: "Sec A", items: [] },
    { name: "Sec B", items: [] },
  ],
} as unknown as Quote;

beforeEach(() => {
  s.profile = { id: "u1", role: "Admin", status: "Active" };
  s.pq = null;
  s.cc = null;
  s.jobInsert = null;
});

describe("createProjectFromQuoteAction (PROJ2-4a)", () => {
  it("creates a Main Job and hangs every cost center off it", async () => {
    const res = await createProjectFromQuoteAction(QUOTE);
    expect(res.ok).toBe(true);

    // Main Job inserted
    expect(s.jobInsert).toMatchObject({ job_type: "main_job", co_number: null });

    // original quote link
    expect(s.pq).toMatchObject({ quote_id: "q1", role: "original" });

    // one cost center per section, each pointing at the new Main Job
    expect(s.cc).toHaveLength(2);
    for (const row of s.cc!) {
      expect(row.job_id).toBe("main-1");
      expect(row.source_quote_id).toBe("q1");
    }
  });

  it("denies a role without projects:create", async () => {
    s.profile = { id: "u1", role: "SalesRep", status: "Active" };
    const res = await createProjectFromQuoteAction(QUOTE);
    expect(res.ok).toBe(false);
    expect(s.jobInsert).toBeNull();
  });
});
