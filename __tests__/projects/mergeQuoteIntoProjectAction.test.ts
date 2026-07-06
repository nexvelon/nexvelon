// PROJ2-4a — mergeQuoteIntoProjectAction rewire: a C.O Job is created and the
// merged quote's cost centers hang off it; cross-client/opco merges rejected.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  project: { id: "p1", project_number: "P-1", opco: "integrated_solutions", client_id: "c1" } as Record<
    string,
    unknown
  >,
  existingCos: [] as { co_number: number }[], // project_jobs select (getNextCoNumber)
  jobInsert: null as Record<string, unknown> | null,
  cc: null as Record<string, unknown>[] | null,
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  switch (ctx.table) {
    case "projects":
      return { data: s.project, error: null }; // maybeSingle load
    case "project_quotes":
      return { data: null, error: null }; // change_order link insert
    case "project_jobs":
      if (ctx.op === "insert") {
        s.jobInsert = ctx.payload as Record<string, unknown>;
        return { data: { id: "co-1", ...(ctx.payload as object) }, error: null };
      }
      return { data: s.existingCos, error: null }; // getNextCoNumber select
    case "project_cost_centers":
      if (ctx.op === "insert") {
        s.cc = ctx.payload as Record<string, unknown>[];
        return { data: null, error: null };
      }
      return { data: [], error: null }; // currentCostCenterMax select
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

import { mergeQuoteIntoProjectAction } from "@/app/(app)/projects/actions";
import type { Quote } from "@/lib/types";

function quote(overrides: Partial<Record<string, unknown>> = {}): Quote {
  return {
    id: "q2",
    clientId: "c1",
    siteId: "site1",
    name: "Change order A",
    templateSlug: "integrated_solutions",
    sections: [{ name: "Extra work", items: [] }],
    ...overrides,
  } as unknown as Quote;
}

beforeEach(() => {
  s.profile = { id: "u1", role: "Admin", status: "Active" };
  s.project = { id: "p1", project_number: "P-1", opco: "integrated_solutions", client_id: "c1" };
  s.existingCos = [];
  s.jobInsert = null;
  s.cc = null;
});

describe("mergeQuoteIntoProjectAction (PROJ2-4a)", () => {
  it("creates a C.O Job with co_number 1 on the first merge; CCs point at it", async () => {
    const res = await mergeQuoteIntoProjectAction(quote(), "p1");
    expect(res.ok).toBe(true);
    expect(s.jobInsert).toMatchObject({ job_type: "change_order", co_number: 1 });
    expect(s.cc).toHaveLength(1);
    expect(s.cc![0].job_id).toBe("co-1");
    expect(s.cc![0].source_quote_id).toBe("q2");
  });

  it("uses co_number 2 for the second change order", async () => {
    s.existingCos = [{ co_number: 1 }];
    const res = await mergeQuoteIntoProjectAction(quote(), "p1");
    expect(res.ok).toBe(true);
    expect(s.jobInsert).toMatchObject({ co_number: 2 });
  });

  it("rejects a cross-client merge", async () => {
    const res = await mergeQuoteIntoProjectAction(quote({ clientId: "other" }), "p1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/client/i);
    expect(s.jobInsert).toBeNull();
  });

  it("rejects a cross-opco merge", async () => {
    const res = await mergeQuoteIntoProjectAction(quote({ templateSlug: "guardian" }), "p1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/entity|opco/i);
    expect(s.jobInsert).toBeNull();
  });
});
