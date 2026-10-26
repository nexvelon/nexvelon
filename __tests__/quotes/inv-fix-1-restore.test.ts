// INV-FIX-1 — a cost-blind caller (no quotes:viewMargin) saving a quote whose
// lines draw from stock: the real lot draws are restored from the stored quote
// (their redacted copy can't clobber them), recorded figures are unchanged, and a
// quantity change on a planned-but-uncommitted line falls back to a LABELLED
// catalog estimate rather than a stale stock cost. (Same harness as the SEC-1
// write-preservation test.)

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


const DRAWS = [
  { stockId: "lot-a", qty: 10, unitCost: 80 },
  { stockId: "lot-b", qty: 5, unitCost: 95 },
];

function prior(over: Record<string, unknown> = {}): Quote {
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
            productId: "p9",
            name: "Reader",
            description: "",
            qty: 15,
            unitCost: 85,
            margin: 43.33,
            unitPrice: 150,
            stockDraws: DRAWS,
            stockSource: "auto",
            costSource: "stock",
            ...over,
          },
        ],
      },
    ],
    subtotal: 2250,
    tax: 0,
    total: 2250,
  } as unknown as Quote;
}

/** What a cost-blind caller holds: the same quote with every cost nulled. */
function redacted(q: Quote, edits: Record<string, unknown> = {}): Quote {
  const it = q.sections![0].items[0];
  return {
    ...q,
    sections: [
      {
        ...q.sections![0],
        items: [
          {
            ...it,
            unitCost: null,
            margin: null,
            stockDraws: it.stockDraws?.map((d) => ({ ...d, unitCost: null })),
            ...edits,
          },
        ],
      },
    ],
  } as unknown as Quote;
}

const savedLine = () => (h.saved as Quote).sections![0].items[0];

beforeEach(() => {
  h.gates = { viewMargin: false, viewInternal: true };
  h.saved = undefined;
  h.productCost = 90;
});

describe("INV-FIX-1 — saves by a cost-blind role", () => {
  it("restore the real draws and leave every recorded figure unchanged", async () => {
    h.prior = prior();
    const res = await upsertQuoteAction(redacted(prior()));
    expect(res.ok).toBe(true);
    const li = savedLine();
    expect(li.stockDraws).toEqual(DRAWS); // costs restored, not nulled
    expect(li.unitCost).toBe(85);
    expect(li.unitPrice).toBe(150);
    expect(li.costSource).toBe("stock");
  });

  it("a quantity change on a planned, uncommitted line falls back to a labelled estimate", async () => {
    h.prior = prior();
    await upsertQuoteAction(redacted(prior(), { qty: 20 }));
    const li = savedLine();
    expect(li.stockDraws).toBeUndefined();
    expect(li.costSource).toBe("catalog_estimate");
    expect(li.unitCost).toBe(90); // the catalog figure, labelled — not the stale $85 stock cost
    expect(li.unitPrice).toBe(150); // price untouched
  });

  it("a committed line keeps its draws even if the quantity is edited", async () => {
    const committed = [{ sourceStockId: "lot-a", consumedRowId: "c1", qty: 10, unitCost: 80 }];
    h.prior = prior({ committedDraws: committed });
    await upsertQuoteAction(redacted(prior({ committedDraws: committed }), { qty: 20 }));
    const li = savedLine();
    expect(li.stockDraws).toEqual(DRAWS);
    expect(li.committedDraws).toEqual(committed);
  });
});
