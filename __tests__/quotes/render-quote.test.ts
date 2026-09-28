// @vitest-environment node
//
// QUOTE-PORTAL-2 regression — the server-side quote PDF render. The QP-2 flow
// tests mocked lib/pdf/render-quote entirely, so the REAL render path (importing
// the actual QuoteDocument + @react-pdf renderToBuffer) was never exercised — that
// is why a "use client" QuoteDocument passed the build AND the test suite while
// being broken at runtime (Next turns a "use client" module imported by the server
// into a client reference that cannot be invoked; vitest does not apply that
// transform, so it can't reproduce the exact error — see the static guard below).
//
// This file exercises the render for real (no mock): it must produce a valid PDF.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { renderQuotePdf, buildSafeQuoteDocProps } from "@/lib/pdf/render-quote";
import { createDefaultSchedules } from "@/lib/quote-schedules";
import type { Quote, BuilderLineItem } from "@/lib/types";

function line(): BuilderLineItem {
  return {
    id: "li1", type: "product", description: "Axis P3268 dome camera", name: "Camera",
    classification: "hardware", qty: 4, unitPrice: 899, unitCost: 512, margin: 0.4,
    notes: "internal", sku: "AX-P3268",
  } as unknown as BuilderLineItem;
}
function makeQuote(): Quote {
  return {
    id: "q1", number: "Q-1001", name: "Camera refresh", status: "Sent",
    clientId: "c1", siteId: "s1", createdAt: "2026-09-01", quoteDate: "2026-09-25",
    expiresAt: "2026-10-25", ownerId: "u1", taxRate: 13,
    subtotal: 3596, tax: 467.48, total: 4063.48,
    sections: [{ id: "sec1", name: "Cameras", items: [line()] }],
    schedules: createDefaultSchedules(),
    templateSlug: "integrated_solutions",
  } as unknown as Quote;
}

function isPdf(buf: Buffer): boolean {
  return buf.length > 1000 && buf.subarray(0, 5).toString("latin1") === "%PDF-";
}

describe("renderQuotePdf — real server render (would have caught the RSC bug's neighbours)", () => {
  it("renders the unsigned quote to a valid PDF Buffer", async () => {
    const props = buildSafeQuoteDocProps(makeQuote(), {});
    const pdf = await renderQuotePdf(props);
    expect(isPdf(pdf)).toBe(true);
  }, 30_000);

  it("renders the COUNTERSIGNED quote (with the signature page) to a valid PDF", async () => {
    const props = buildSafeQuoteDocProps(makeQuote(), {}, {
      name: "Dana Buyer", title: "Facilities Manager", email: "dana@acme.com",
      signedAt: "2026-09-26T14:30:00Z",
      signatureImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ip: "203.0.113.5",
    });
    const pdf = await renderQuotePdf(props);
    expect(isPdf(pdf)).toBe(true);
  }, 30_000);
});

// The invariant that actually broke: a document rendered by the SERVER must be
// isomorphic (no "use client"), or Next hands the server a client reference it
// cannot invoke. vitest can't reproduce Next's transform, so we assert the
// invariant statically across EVERY server-rendered @react-pdf document.
describe("server-rendered PDF documents must not be 'use client'", () => {
  const docs = [
    "components/modules/quotes/builder/QuoteDocument.tsx",
    "components/modules/purchase-orders/PurchaseOrderDocument.tsx",
    "components/modules/inventory/PickupSlipDocument.tsx",
    "components/modules/inventory/RmaDocument.tsx",
    "components/modules/subcontractors/WorkOrderDocument.tsx",
    "components/modules/projects/CommissioningCertificate.tsx",
  ];
  for (const rel of docs) {
    it(`${rel} has no "use client" directive`, () => {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      // The DIRECTIVE is a bare string statement at the top — not a mention in a
      // comment. Check the first non-empty, non-comment line.
      const firstCode = src
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("/*") && !l.startsWith("*"));
      expect(firstCode).not.toMatch(/^["']use client["'];?$/);
    });
  }
});
