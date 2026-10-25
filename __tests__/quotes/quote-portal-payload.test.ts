// QUOTE-PORTAL-2 non-negotiable — no internal figure (cost/margin/notes/tech)
// reaches the portal, the attached PDF, or the countersigned PDF. Asserted on the
// PAYLOAD (the DocProps + the snapshot), not the render.

import { describe, it, expect, vi } from "vitest";

// Keep the render module cheap to import (no real @react-pdf / QuoteDocument).
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn(async () => Buffer.from("pdf")),
  Document: () => null, Page: () => null, Text: () => null, View: () => null, Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock("@/components/modules/quotes/builder/QuoteDocument", () => ({ QuoteDocument: () => null }));

import { buildSafeQuoteDocProps } from "@/lib/pdf/render-quote";
import { buildQuoteSnapshot } from "@/lib/api/quote-portal";
import type { Quote, BuilderLineItem } from "@/lib/types";

function internalLine(): BuilderLineItem {
  return {
    id: "li1",
    type: "product",
    description: "Axis P3268 dome camera",
    name: "Camera",
    classification: "hardware",
    qty: 4,
    unitPrice: 899,
    sku: "AX-P3268",
    upc: "0730882111",
    masterPartNumber: "MPN-99",
    vendor: "Anixter",
    serialNumber: "SN-1",
    unitCost: 512.34,
    margin: 0.43,
    notes: "buy grey-market, do not tell client",
    stockUnitId: "stk-777",
    committedStockId: "commit-777",
    labour: { hours: 6, sellRate: 120, techName: "Dwayne (internal)", show: { hours: true, rate: false } },
  } as unknown as BuilderLineItem;
}

function makeQuote(): Quote {
  return {
    id: "q1",
    number: "Q-1001",
    name: "Camera refresh",
    status: "Draft",
    clientId: "c1",
    siteId: "s1",
    createdAt: "2026-09-01",
    quoteDate: "2026-09-25",
    expiresAt: "2026-10-25",
    ownerId: "u1",
    taxRate: 13,
    subtotal: 3596,
    tax: 467.48,
    total: 4063.48,
    sections: [{ id: "sec1", name: "Cameras", items: [internalLine()] }],
    internalNotes: "margin thin",
  } as unknown as Quote;
}

const FORBIDDEN = ["unitcost", "margin", "techname", "stockunitid", "committedstockid", "grey-market", "512.34", "internalnotes"];

describe("SEC-1 — safe render payload (DocProps)", () => {
  it("carries no internal figure; keeps client-safe fields", () => {
    const props = buildSafeQuoteDocProps(makeQuote(), {});
    const blob = JSON.stringify(props).toLowerCase();
    for (const f of FORBIDDEN) expect(blob, `payload leaked "${f}"`).not.toContain(f);
    const line = props.sections[0].items[0] as unknown as Record<string, unknown>;
    expect(line.unitPrice).toBe(899);
    expect(line.description).toBe("Axis P3268 dome camera");
    // labour keeps client price fields but never the technician name
    expect(JSON.stringify(props.sections[0].items[0])).toContain("sellRate");
    expect(JSON.stringify(props.sections[0].items[0])).not.toContain("Dwayne");
  });

  it("a countersigned payload (with acceptance) still leaks nothing internal", () => {
    const props = buildSafeQuoteDocProps(makeQuote(), {}, {
      name: "Dana Buyer",
      title: "Facilities Manager",
      signedAt: "2026-09-26T12:00:00Z",
      signatureImage: "data:image/png;base64,AAAA",
    });
    const blob = JSON.stringify(props).toLowerCase();
    for (const f of FORBIDDEN) expect(blob).not.toContain(f);
    expect(props.acceptance?.name).toBe("Dana Buyer");
  });
});

describe("SEC-1 — the portal snapshot", () => {
  it("carries no internal figure", () => {
    const snap = buildQuoteSnapshot(makeQuote(), { clientName: "Acme" });
    const blob = JSON.stringify(snap).toLowerCase();
    for (const f of FORBIDDEN) expect(blob, `snapshot leaked "${f}"`).not.toContain(f);
    expect(snap.total).toBe(4063.48);
  });
});

// RECUR-2 — the signed snapshot carries the recurring terms (so the contract is
// built from what was signed) and still no internal figure.
describe("RECUR-2 — recurring terms in the signed snapshot", () => {
  const serviceQuote = (): Quote =>
    ({
      ...makeQuote(),
      templateSlug: "guardian",
      intendedTargetKind: "service_contract",
      serviceContract: { cadence: "monthly", billingTiming: "advance", termMonths: 12 },
      paymentTerms: "Net 30",
      taxRate: 0.13,
      schedules: [
        {
          id: "sch",
          kind: "monitoring",
          title: "Monitoring Services",
          subtitle: "",
          included: true,
          services: [{ id: "m1", label: "Fire monitoring", monthlyFee: 85 }],
        },
      ],
    }) as Quote;

  it("freezes cadence + monthly fees for a complete service-contract quote", () => {
    const snap = buildQuoteSnapshot(serviceQuote());
    expect(snap.recurring).toMatchObject({
      cadence: "monthly",
      opco: "guardian",
      monthlyTotal: 85,
      periodTotal: 85,
      paymentTermsDays: 30,
      taxRatePct: 13,
      termMonths: 12,
    });
    const json = JSON.stringify(snap);
    for (const leak of ["512.34", "grey-market", "Dwayne", "stk-777"]) expect(json).not.toContain(leak);
  });

  it("is absent on an ordinary project quote and on an incomplete one", () => {
    expect(buildQuoteSnapshot(makeQuote()).recurring).toBeUndefined();
    expect(buildQuoteSnapshot({ ...serviceQuote(), serviceContract: {} }).recurring).toBeUndefined();
  });

  it("the PDF payload prints the agreement terms only for a service-contract quote", () => {
    expect(buildSafeQuoteDocProps(serviceQuote()).recurringTerms).toMatchObject({ cadence: "monthly" });
    expect(buildSafeQuoteDocProps(makeQuote()).recurringTerms).toBeNull();
  });
});
