// duplicateQuoteAction — quotes:create gate, deep-clone into a fresh Draft with
// a new sequential number, reset status/date/conversion-intent + cleared
// committed-stock markers, attachments not copied, source untouched.

import { describe, it, expect, beforeEach, vi } from "vitest";

function makeSource() {
  return {
    id: "q-src",
    number: "Q-10000",
    name: "Original",
    status: "Approved",
    clientId: "c1",
    siteId: "s1",
    createdAt: "2026-01-01",
    quoteDate: "2026-01-01",
    intendedTargetKind: "change_order",
    intendedTargetProjectId: "p1",
    projectId: "p1",
    rejectionReason: "old reason",
    closingReason: "old close",
    sections: [
      {
        id: "sec1",
        name: "Access Control",
        items: [
          {
            id: "li1",
            type: "product",
            name: "Reader",
            qty: 2,
            unitCost: 5,
            unitPrice: 10,
            margin: 50,
            committedStockId: "stk1",
            serialNumber: "SN1",
          },
        ],
      },
    ],
    terms: "TERMS TEXT",
    schedules: [],
    subtotal: 20,
    tax: 0,
    total: 20,
  };
}

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active", email: "u1@x.co" } as {
    id: string;
    role: string;
    status: string;
    email: string;
  } | null,
  source: null as ReturnType<typeof makeSource> | null,
  upserted: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/api/quotes", () => ({
  getQuoteById: async () => h.source,
  upsertQuote: async (q: Record<string, unknown>) => {
    h.upserted = q;
    return q;
  },
  mintQuoteNumber: async () => "Q-10007",
  listQuotes: vi.fn(),
  listProjectsReferencingQuote: vi.fn(),
  deleteQuote: vi.fn(),
  findQuoteIdByNumber: vi.fn(),
  updateQuoteNumber: vi.fn(),
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
vi.mock("@/app/(app)/attachments/actions", () => ({ deleteAttachmentsForEntity: vi.fn() }));
vi.mock("@/lib/quote-audit-diff", () => ({ diffQuote: () => [] }));
vi.mock("@/lib/quotes/picker-adapters", () => ({ adaptClient: vi.fn(), adaptSite: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { duplicateQuoteAction } from "@/app/(app)/quotes/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active", email: "u1@x.co" };
  h.source = makeSource();
  h.upserted = null;
});

describe("duplicateQuoteAction", () => {
  it("creates a fresh Draft: new id + sequential number + today's date, intent reset", async () => {
    const res = await duplicateQuoteAction("q-src");
    expect(res.ok).toBe(true);
    const d = h.upserted!;
    expect(d.id).not.toBe("q-src");
    if (res.ok) expect(res.newQuoteId).toBe(d.id);
    expect(d.number).toBe("Q-10007");
    expect(d.status).toBe("Draft");
    // quoteDate defaults to today (YYYY-MM-DD) and matches createdAt.
    expect(d.quoteDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.quoteDate).toBe(d.createdAt);
    // Fresh conversion intent + no project link.
    expect(d.intendedTargetKind).toBeUndefined();
    expect(d.intendedTargetProjectId).toBeUndefined();
    expect(d.projectId).toBeUndefined();
    // Fresh Draft carries no revision/closing history.
    expect(d.rejectionReason).toBeUndefined();
    expect(d.closingReason).toBeUndefined();
  });

  it("copies content verbatim but clears committed-stock / serial markers", async () => {
    await duplicateQuoteAction("q-src");
    const d = h.upserted as unknown as ReturnType<typeof makeSource>;
    expect(d.terms).toBe("TERMS TEXT");
    expect(d.sections).toHaveLength(1);
    const item = d.sections[0].items[0];
    expect(item.name).toBe("Reader");
    expect(item.qty).toBe(2);
    expect(item.committedStockId).toBeUndefined();
    expect(item.serialNumber).toBeUndefined();
  });

  it("leaves the SOURCE quote untouched (deep clone, not mutation)", async () => {
    await duplicateQuoteAction("q-src");
    expect(h.source!.status).toBe("Approved");
    expect(h.source!.number).toBe("Q-10000");
    expect(h.source!.sections[0].items[0].committedStockId).toBe("stk1");
    expect(h.source!.intendedTargetKind).toBe("change_order");
  });

  it("returns not-found when the source is missing", async () => {
    h.source = null;
    const res = await duplicateQuoteAction("nope");
    expect(res.ok).toBe(false);
  });

  it("denies a role without quotes:create (Technician)", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active", email: "t@x.co" };
    const res = await duplicateQuoteAction("q-src");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden");
    expect(h.upserted).toBeNull();
  });
});
