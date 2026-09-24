// SEC-1 — upsertQuoteAction write-preservation. A caller without quotes:viewMargin
// receives a quote whose cost/margin were nulled on read; on save those nulls must
// NOT clobber the real values in the jsonb blob. Existing lines restore cost from
// the prior row; a brand-new product line re-derives a truthful cost from the
// catalog (never a fabricated zero, §2.8). The saved quote is re-redacted on return.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Quote } from "@/lib/types";

const h = vi.hoisted(() => ({
  gates: { viewMargin: false, viewInternal: false },
  prior: null as Quote | null,
  saved: undefined as unknown, // captures the quote handed to upsertQuote
  productCost: 90 as number | null, // getProductRowById default_unit_cost
}));

vi.mock("@/lib/permissions/resolve", () => ({
  adaptDbRole: (r: string) => r,
  requireAdmin: vi.fn(),
  can: async (resource: string, action: string) => {
    if (resource === "quotes" && action === "viewMargin") return h.gates.viewMargin;
    if (resource === "quotes" && action === "viewInternal") return h.gates.viewInternal;
    return false;
  },
}));
vi.mock("@/lib/api/quotes", () => ({
  getQuoteById: async () => h.prior,
  upsertQuote: async (q: Quote) => {
    h.saved = q;
    return q;
  },
  listQuotes: vi.fn(),
  listProjectsReferencingQuote: vi.fn(),
  deleteQuote: vi.fn(),
  mintQuoteNumber: vi.fn(),
  findQuoteIdByNumber: vi.fn(),
  updateQuoteNumber: vi.fn(),
  updateQuoteDate: vi.fn(),
}));
vi.mock("@/lib/api/products", () => ({
  getProductRowById: async () => ({ id: "p9", default_unit_cost: h.productCost }),
}));
vi.mock("@/lib/api/projects", () => ({ getProjectRow: async () => null }));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: "SalesRep", status: "Active", email: "s@x.co" }),
}));
vi.mock("@/lib/api/quote-audit", () => ({
  logQuoteAuditEvent: vi.fn(async () => {}),
  getQuoteAuditEvents: vi.fn(),
  deleteQuoteAuditById: vi.fn(),
  deleteAllQuoteAuditForQuote: vi.fn(),
}));
vi.mock("@/lib/api/clients", () => ({ getClients: vi.fn(), getSitesByClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "s@x.co" } } }) },
  }),
}));
vi.mock("@/app/(app)/attachments/actions", () => ({ deleteAttachmentsForEntity: vi.fn() }));
vi.mock("@/lib/quote-audit-diff", () => ({ diffQuote: () => [] }));
vi.mock("@/lib/quotes/picker-adapters", () => ({ adaptClient: vi.fn(), adaptSite: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { upsertQuoteAction } from "@/app/(app)/quotes/actions";

function priorQuote(): Quote {
  return {
    id: "q1",
    number: "2601010900",
    clientId: "c1",
    siteId: "s1",
    status: "Draft",
    createdAt: "2026-01-01",
    expiresAt: "2026-02-01",
    ownerId: "u1",
    items: [],
    sections: [
      {
        id: "s1",
        name: "Equipment",
        items: [
          {
            id: "li1",
            type: "product",
            description: "Camera",
            name: "",
            qty: 2,
            unitCost: 90, // the real cost the SalesRep never saw
            margin: 40,
            unitPrice: 150,
            labour: undefined,
          },
        ],
      },
    ],
    internalNotes: "PM-only note",
    subtotal: 300,
    tax: 0,
    total: 300,
  };
}

// What a redacted SalesRep's browser sends back: cost/margin null, internal gone.
function redactedIncoming(overrides?: Partial<Quote>): Quote {
  const q = priorQuote();
  return {
    ...q,
    internalNotes: undefined,
    sections: [
      {
        ...q.sections![0],
        items: q.sections![0].items.map((it) => ({ ...it, unitCost: null, margin: null })),
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  h.gates = { viewMargin: false, viewInternal: false };
  h.prior = priorQuote();
  h.saved = undefined;
  h.productCost = 90;
});

describe("upsertQuoteAction — SEC-1 write-preservation", () => {
  it("redacted save restores real cost from prior (no null clobber)", async () => {
    const res = await upsertQuoteAction(redactedIncoming());
    expect(res.ok).toBe(true);
    const saved = h.saved as Quote;
    expect(saved.sections![0].items[0].unitCost).toBe(90);
    expect(saved.internalNotes).toBe("PM-only note");
  });

  it("recomputes margin from real cost when the redacted caller changes price", async () => {
    // SalesRep bumps unit price 150 → 200; cost stays 90 → margin = (1-90/200)*100 = 55.
    const incoming = redactedIncoming();
    incoming.sections![0].items[0].unitPrice = 200;
    await upsertQuoteAction(incoming);
    const saved = h.saved as Quote;
    expect(saved.sections![0].items[0].unitCost).toBe(90);
    expect(saved.sections![0].items[0].margin).toBe(55);
  });

  it("brand-new product line derives cost from the catalog (never zero)", async () => {
    const incoming = redactedIncoming();
    incoming.sections![0].items.push({
      id: "li2", // not present in prior
      type: "product",
      productId: "p9",
      description: "New sensor",
      name: "",
      qty: 1,
      unitCost: null,
      margin: null,
      unitPrice: 300,
    });
    await upsertQuoteAction(incoming);
    const saved = h.saved as Quote;
    const line = saved.sections![0].items.find((i) => i.id === "li2")!;
    expect(line.unitCost).toBe(90); // from catalog default_unit_cost
    expect(line.margin).toBe(70); // (1 - 90/300) * 100
  });

  it("the returned quote is re-redacted (real cost not echoed back)", async () => {
    const res = await upsertQuoteAction(redactedIncoming());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.sections![0].items[0].unitCost).toBeNull();
      expect(res.data.internalNotes).toBeUndefined();
    }
  });

  it("a fully-trusted caller (both flags) persists incoming values unchanged", async () => {
    h.gates = { viewMargin: true, viewInternal: true };
    const incoming = priorQuote();
    incoming.sections![0].items[0].unitCost = 77; // a real cost edit
    incoming.sections![0].items[0].margin = 33;
    await upsertQuoteAction(incoming);
    const saved = h.saved as Quote;
    expect(saved.sections![0].items[0].unitCost).toBe(77);
    expect(saved.sections![0].items[0].margin).toBe(33);
  });
});
