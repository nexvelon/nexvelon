// PROJ2-4c — PO job attribution validation. Tests assertPoJobAttribution (the
// consistency check createPurchaseOrderAction/updatePurchaseOrderAction delegate
// to) directly for the four cases, against a chainable supabase mock.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  job: { project_id: "proj-1" } as Record<string, unknown> | null,
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "project_jobs") return { data: s.job, error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));

import { assertPoJobAttribution } from "@/lib/api/purchase-orders";

beforeEach(() => {
  s.job = { project_id: "proj-1" };
});

describe("assertPoJobAttribution", () => {
  it("no-ops when neither project_id nor job_id is set (legacy PO)", async () => {
    await expect(
      assertPoJobAttribution({ po_number: "PO-1", vendor_id: "v1" })
    ).resolves.toBeUndefined();
  });

  it("no-ops when only project_id is set (job_id NULL)", async () => {
    await expect(
      assertPoJobAttribution({ po_number: "PO-1", vendor_id: "v1", project_id: "proj-1" })
    ).resolves.toBeUndefined();
  });

  it("passes when job_id belongs to the given project", async () => {
    s.job = { project_id: "proj-1" };
    await expect(
      assertPoJobAttribution({
        po_number: "PO-1",
        vendor_id: "v1",
        project_id: "proj-1",
        job_id: "job-x",
      })
    ).resolves.toBeUndefined();
  });

  it("rejects a job_id with no project_id (mirrors the DB CHECK)", async () => {
    await expect(
      assertPoJobAttribution({ po_number: "PO-1", vendor_id: "v1", job_id: "job-x" })
    ).rejects.toThrow(/requires a project/i);
  });

  it("rejects a job_id that belongs to a different project", async () => {
    s.job = { project_id: "OTHER" };
    await expect(
      assertPoJobAttribution({
        po_number: "PO-1",
        vendor_id: "v1",
        project_id: "proj-1",
        job_id: "job-x",
      })
    ).rejects.toThrow(/doesn't belong/i);
  });
});
