// SEC-1 — server-strip field-gated data (REALITY-1 P0-1). These tests assert on
// the PAYLOAD SHAPE that leaves the server: a caller without the governing
// field-visibility flag must receive the gated field as null/absent (never a
// fabricated zero, §2.8), and a caller WITH the flag must receive the real value.
// Redaction fails CLOSED — an unresolved gate redacts. Write-preservation ensures
// a redacted edit never clobbers the values the caller never saw.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Quote } from "@/lib/types";

// ── Shared, per-test-adjustable gate state ──────────────────────────────────
const h = vi.hoisted(() => ({
  can: {
    inventoryViewCost: false,
    quotesViewMargin: false,
    quotesViewInternal: false,
  },
  throwOnResolve: false,
}));

// resolveFieldGates + redactQuote consume `can` from here.
vi.mock("@/lib/permissions/resolve", () => ({
  adaptDbRole: (r: string) => r,
  can: async (resource: string, action: string) => {
    if (h.throwOnResolve) throw new Error("permission backend down");
    if (resource === "inventory" && action === "viewCost") return h.can.inventoryViewCost;
    if (resource === "quotes" && action === "viewMargin") return h.can.quotesViewMargin;
    if (resource === "quotes" && action === "viewInternal") return h.can.quotesViewInternal;
    return false;
  },
}));

beforeEach(() => {
  h.can = { inventoryViewCost: false, quotesViewMargin: false, quotesViewInternal: false };
  h.throwOnResolve = false;
});

// ── resolveFieldGates: fail-closed ──────────────────────────────────────────
describe("resolveFieldGates", () => {
  it("resolves each flag independently", async () => {
    const { resolveFieldGates } = await import("@/lib/permissions/field-redaction");
    h.can.inventoryViewCost = true;
    const g = await resolveFieldGates();
    expect(g.inventoryCost).toBe(true);
    expect(g.quoteMargin).toBe(false);
    expect(g.quoteInternal).toBe(false);
    // anyCost widens cost trust across the shared catalog read.
    expect(g.anyCost).toBe(true);
  });

  it("FAILS CLOSED — a thrown gate redacts everything", async () => {
    const { resolveFieldGates } = await import("@/lib/permissions/field-redaction");
    h.can.inventoryViewCost = true;
    h.can.quotesViewMargin = true;
    h.throwOnResolve = true;
    const g = await resolveFieldGates();
    expect(g).toEqual({
      inventoryCost: false,
      quoteMargin: false,
      quoteInternal: false,
      vendorBanking: false,
      anyCost: false,
    });
  });
});

// ── redactQuote: quote cost / margin / internal ─────────────────────────────
function fixtureQuote(): Quote {
  return {
    id: "q1",
    number: "2601010900",
    clientId: "c1",
    status: "Draft",
    createdAt: "2026-01-01",
    expiresAt: "2026-02-01",
    ownerId: "u1",
    items: [{ productId: "p1", qty: 2, unitPrice: 150 }],
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
            unitCost: 90,
            margin: 40,
            unitPrice: 150,
          },
          {
            id: "li2",
            type: "labor",
            description: "Install",
            name: "",
            qty: 4,
            unitCost: 50,
            margin: 30,
            unitPrice: 72,
            labour: { hours: 4, sellRate: 72, techName: "Jordan T." },
          },
        ],
      },
    ],
    internalNotes: "Client haggles — hold firm at 38%.",
    subtotal: 588,
    tax: 0,
    total: 588,
  };
}

describe("redactQuote", () => {
  it("no flags → cost, margin, internal notes, tech name all stripped", async () => {
    const { redactQuote } = await import("@/lib/permissions/field-redaction");
    const out = redactQuote(fixtureQuote(), { quoteMargin: false, quoteInternal: false });
    const [l1, l2] = out.sections![0].items;
    // Cost/margin ABSENT (null), never zeroed.
    expect(l1.unitCost).toBeNull();
    expect(l1.margin).toBeNull();
    expect(l2.unitCost).toBeNull();
    expect(l2.margin).toBeNull();
    // Selling price + qty preserved (not cost-derived).
    expect(l1.unitPrice).toBe(150);
    expect(l1.qty).toBe(2);
    // Internal notes + tech name gone.
    expect(out.internalNotes).toBeUndefined();
    expect(l2.labour?.techName).toBeUndefined();
    // Labour hours/rate (non-internal) kept.
    expect(l2.labour?.hours).toBe(4);
  });

  it("viewMargin only → cost kept, internal stripped", async () => {
    const { redactQuote } = await import("@/lib/permissions/field-redaction");
    const out = redactQuote(fixtureQuote(), { quoteMargin: true, quoteInternal: false });
    expect(out.sections![0].items[0].unitCost).toBe(90);
    expect(out.sections![0].items[0].margin).toBe(40);
    expect(out.internalNotes).toBeUndefined();
    expect(out.sections![0].items[1].labour?.techName).toBeUndefined();
  });

  it("viewInternal only → internal kept, cost stripped", async () => {
    const { redactQuote } = await import("@/lib/permissions/field-redaction");
    const out = redactQuote(fixtureQuote(), { quoteMargin: false, quoteInternal: true });
    expect(out.sections![0].items[0].unitCost).toBeNull();
    expect(out.internalNotes).toBe("Client haggles — hold firm at 38%.");
    expect(out.sections![0].items[1].labour?.techName).toBe("Jordan T.");
  });

  it("both flags → identity (real values reach the wire)", async () => {
    const { redactQuote } = await import("@/lib/permissions/field-redaction");
    const q = fixtureQuote();
    const out = redactQuote(q, { quoteMargin: true, quoteInternal: true });
    expect(out).toBe(q);
  });
});
