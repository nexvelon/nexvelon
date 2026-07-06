// PROJ2-4c — createInvoiceForProjectAction stamps job_id (Main Job by default;
// explicit jobId respected + validated). Real API + real permissions against a
// chainable supabase mock.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  job: { id: "main-job", project_id: "proj-1" } as Record<string, unknown> | null,
  invoiceInsert: null as Record<string, unknown> | null,
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  switch (ctx.table) {
    case "projects":
      return { data: { opco: "integrated_solutions", client_id: "c1", site_id: "s1" }, error: null };
    case "project_jobs":
      // both the main-job lookup and the explicit-job validation land here.
      return { data: s.job, error: null };
    case "invoices":
      s.invoiceInsert = ctx.payload as Record<string, unknown>;
      return { data: { id: "inv-1", ...(ctx.payload as object) }, error: null };
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => s.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createInvoiceForProjectAction } from "@/app/(app)/invoices/actions";

beforeEach(() => {
  s.profile = { id: "u1", role: "Admin", status: "Active" };
  s.job = { id: "main-job", project_id: "proj-1" };
  s.invoiceInsert = null;
});

describe("createInvoiceForProjectAction — job stamping", () => {
  it("stamps job_id = Main Job when no jobId is supplied", async () => {
    s.job = { id: "main-job", project_id: "proj-1" }; // main-job lookup result
    const res = await createInvoiceForProjectAction("proj-1");
    expect(res.ok).toBe(true);
    expect(s.invoiceInsert).toMatchObject({ project_id: "proj-1", job_id: "main-job" });
  });

  it("respects an explicit jobId that belongs to the project", async () => {
    s.job = { id: "co-1", project_id: "proj-1" };
    const res = await createInvoiceForProjectAction("proj-1", "co-1");
    expect(res.ok).toBe(true);
    expect(s.invoiceInsert).toMatchObject({ job_id: "co-1" });
  });

  it("rejects an explicit jobId from a different project", async () => {
    s.job = { id: "co-1", project_id: "OTHER" };
    const res = await createInvoiceForProjectAction("proj-1", "co-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/belong/i);
    expect(s.invoiceInsert).toBeNull();
  });

  it("denies a role without financials:edit", async () => {
    s.profile = { id: "u1", role: "SalesRep", status: "Active" };
    const res = await createInvoiceForProjectAction("proj-1");
    expect(res.ok).toBe(false);
    expect(s.invoiceInsert).toBeNull();
  });
});
