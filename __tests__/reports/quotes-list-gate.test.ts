// REP-3 security fix — listQuotesAction was ungated (RLS-only). It now requires
// quotes:view (the pipeline report consumes it, and the quotes list surface
// already sits behind quotes access).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as { id: string; role: string; status: string } | null,
}));

vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/api/quotes", () => ({
  listQuotes: vi.fn(async () => []),
  getQuoteById: vi.fn(),
  deleteQuote: vi.fn(),
  listProjectsReferencingQuote: vi.fn(),
  upsertQuote: vi.fn(),
  mintQuoteNumber: vi.fn(),
  findQuoteIdByNumber: vi.fn(),
  updateQuoteNumber: vi.fn(),
  updateQuoteDate: vi.fn(),
}));

import { listQuotesAction } from "@/app/(app)/quotes/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("listQuotesAction gate", () => {
  it("denies a role without quotes:view (Technician)", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await listQuotesAction()).ok).toBe(false);
  });
  it("denies a signed-out caller", async () => {
    h.profile = null;
    expect((await listQuotesAction()).ok).toBe(false);
  });
  it("allows a role with quotes:view (Admin, SalesRep)", async () => {
    for (const role of ["Admin", "SalesRep"]) {
      h.profile = { id: "u1", role, status: "Active" };
      expect((await listQuotesAction()).ok).toBe(true);
    }
  });
});
