// MAIL-2 / §2.6 — a PO resolves its operating company from the attributed
// project; a standalone PO (no project) defaults to Integrated Solutions and
// NEVER silently resolves to Guardian.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  projectRow: null as { opco: string } | null,
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "projects") return { data: h.projectRow, error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeSupabaseMock(resolve),
}));

import { resolvePurchaseOrderOpco } from "@/lib/api/purchase-orders";

beforeEach(() => {
  h.projectRow = null;
});

describe("resolvePurchaseOrderOpco", () => {
  it("an Integrated Solutions project → integrated_solutions", async () => {
    h.projectRow = { opco: "integrated_solutions" };
    expect(await resolvePurchaseOrderOpco({ project_id: "p1" })).toBe("integrated_solutions");
  });

  it("a Guardian project → guardian", async () => {
    h.projectRow = { opco: "guardian" };
    expect(await resolvePurchaseOrderOpco({ project_id: "p1" })).toBe("guardian");
  });

  it("a standalone PO (no project) → integrated_solutions (documented default, not a guess)", async () => {
    expect(await resolvePurchaseOrderOpco({ project_id: null })).toBe("integrated_solutions");
  });

  it("an unexpected/missing project opco never resolves to Guardian", async () => {
    h.projectRow = null; // project row not found
    expect(await resolvePurchaseOrderOpco({ project_id: "p-ghost" })).toBe("integrated_solutions");
    h.projectRow = { opco: "" }; // blank/garbage
    expect(await resolvePurchaseOrderOpco({ project_id: "p2" })).toBe("integrated_solutions");
  });
});
