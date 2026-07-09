// updateQuoteNumberAction — quotes:edit gate, format validation, duplicate
// detection with a force override. Real permissions matrix; mocked API + auth +
// audit. Mirrors saveQuoteAction-target.test.ts's mock set (this actions file
// pulls in several modules transitively).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active", email: "u1@x.co" } as {
    id: string;
    role: string;
    status: string;
    email: string;
  } | null,
  existingId: null as string | null,
  updateQuoteNumber: vi.fn(async () => {}),
}));

vi.mock("@/lib/api/quotes", () => ({
  getQuoteById: vi.fn(),
  upsertQuote: vi.fn(),
  listQuotes: vi.fn(),
  listProjectsReferencingQuote: vi.fn(),
  deleteQuote: vi.fn(),
  mintQuoteNumber: vi.fn(),
  findQuoteIdByNumber: async () => h.existingId,
  updateQuoteNumber: h.updateQuoteNumber,
  updateQuoteDate: vi.fn(),
}));
vi.mock("@/lib/api/projects", () => ({ getProjectRow: vi.fn() }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("@/lib/api/quote-audit", () => ({
  logQuoteAuditEvent: vi.fn(async () => {}),
  getQuoteAuditEvents: vi.fn(),
  deleteQuoteAuditById: vi.fn(),
  deleteAllQuoteAuditForQuote: vi.fn(),
}));
vi.mock("@/lib/api/clients", () => ({ getClients: vi.fn(), getSitesByClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "u1@x.co" } } }) },
  }),
}));
vi.mock("@/app/(app)/attachments/actions", () => ({
  deleteAttachmentsForEntity: vi.fn(),
}));
vi.mock("@/lib/quote-audit-diff", () => ({ diffQuote: () => [] }));
vi.mock("@/lib/quotes/picker-adapters", () => ({ adaptClient: vi.fn(), adaptSite: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateQuoteNumberAction } from "@/app/(app)/quotes/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active", email: "u1@x.co" };
  h.existingId = null;
  h.updateQuoteNumber.mockClear();
});

describe("updateQuoteNumberAction", () => {
  it("rejects an invalid format", async () => {
    const res = await updateQuoteNumberAction({ quoteId: "q1", newNumber: "not a number!" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_format");
    expect(h.updateQuoteNumber).not.toHaveBeenCalled();
  });

  it("returns duplicate_exists + existing_quote_id without force", async () => {
    h.existingId = "q2";
    const res = await updateQuoteNumberAction({ quoteId: "q1", newNumber: "Q-10001" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("duplicate_exists");
      expect(res.existing_quote_id).toBe("q2");
    }
    expect(h.updateQuoteNumber).not.toHaveBeenCalled();
  });

  it("writes anyway with force, even when a duplicate exists", async () => {
    h.existingId = "q2";
    const res = await updateQuoteNumberAction({
      quoteId: "q1",
      newNumber: "Q-10001",
      force: true,
    });
    expect(res.ok).toBe(true);
    expect(h.updateQuoteNumber).toHaveBeenCalledWith("q1", "Q-10001");
  });

  it("succeeds for a unique sequential number", async () => {
    const res = await updateQuoteNumberAction({ quoteId: "q1", newNumber: "Q-10002" });
    expect(res.ok).toBe(true);
    expect(h.updateQuoteNumber).toHaveBeenCalledWith("q1", "Q-10002");
  });

  it("allows an admin-custom prefixed identifier (INV-2024-1)", async () => {
    const res = await updateQuoteNumberAction({ quoteId: "q1", newNumber: "INV-2024-1" });
    expect(res.ok).toBe(true);
    expect(h.updateQuoteNumber).toHaveBeenCalledWith("q1", "INV-2024-1");
  });

  it("denies a role without quotes:edit (Technician)", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active", email: "t@x.co" };
    const res = await updateQuoteNumberAction({ quoteId: "q1", newNumber: "Q-10003" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
    expect(h.updateQuoteNumber).not.toHaveBeenCalled();
  });
});
