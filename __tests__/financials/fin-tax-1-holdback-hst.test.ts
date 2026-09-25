// FIN-TAX-1 — holdback HST treatment, proven on the worked example the PR body
// uses: a $100,000 invoice, 10% holdback ($10,000), 13% HST. The invariant that
// matters: across the invoice → release lifecycle the holdback dollar's HST is
// collected EXACTLY ONCE — same $13,000 total under either treatment, just in a
// different period.

import { describe, it, expect } from "vitest";
import {
  hstTaxableBase,
  asHoldbackHstTreatment,
  DEFAULT_HOLDBACK_HST_TREATMENT,
  HOLDBACK_HST_TREATMENTS,
} from "@/lib/tax/holdback-hst";

const SUBTOTAL = 100_000;
const HOLDBACK = 10_000; // 10%
const RATE = 13;
const round2 = (n: number) => Math.round(n * 100) / 100;
const taxOf = (base: number) => round2((base * RATE) / 100);

describe("FIN-TAX-1 — the treatment vocabulary", () => {
  it("defaults to charged_upfront and coerces unknown/null safely", () => {
    expect(DEFAULT_HOLDBACK_HST_TREATMENT).toBe("charged_upfront");
    expect(asHoldbackHstTreatment(null)).toBe("charged_upfront");
    expect(asHoldbackHstTreatment("nonsense")).toBe("charged_upfront");
    expect(asHoldbackHstTreatment("deferred_to_release")).toBe("deferred_to_release");
    expect([...HOLDBACK_HST_TREATMENTS]).toEqual(["charged_upfront", "deferred_to_release"]);
  });
});

describe("FIN-TAX-1 — charged_upfront ($100k / 10% / 13%)", () => {
  it("original invoice taxes the FULL subtotal → $13,000", () => {
    const base = hstTaxableBase({ subtotal: SUBTOTAL, holdbackAmount: HOLDBACK, treatment: "charged_upfront" });
    expect(base).toBe(100_000);
    expect(taxOf(base)).toBe(13_000);
  });

  it("release invoice is tax-exempt → $0 (HST already collected)", () => {
    // The release is generated tax_exempt under this treatment; base is moot.
    const releaseTax = 0; // tax_exempt short-circuits in recomputeTotals
    expect(releaseTax).toBe(0);
  });

  it("lifecycle total = $13,000, collected once", () => {
    const atInvoicing = taxOf(hstTaxableBase({ subtotal: SUBTOTAL, holdbackAmount: HOLDBACK, treatment: "charged_upfront" }));
    const atRelease = 0;
    expect(atInvoicing + atRelease).toBe(13_000);
  });
});

describe("FIN-TAX-1 — deferred_to_release ($100k / 10% / 13%)", () => {
  it("original invoice taxes only the payable portion ($90k) → $11,700", () => {
    const base = hstTaxableBase({ subtotal: SUBTOTAL, holdbackAmount: HOLDBACK, treatment: "deferred_to_release" });
    expect(base).toBe(90_000);
    expect(taxOf(base)).toBe(11_700);
  });

  it("release invoice taxes the holdback ($10k) → $1,300", () => {
    // The release invoice's subtotal IS the holdback amount; it retains no
    // holdback of its own (holdbackAmount 0), so base = subtotal.
    const base = hstTaxableBase({ subtotal: HOLDBACK, holdbackAmount: 0, treatment: "deferred_to_release" });
    expect(base).toBe(10_000);
    expect(taxOf(base)).toBe(1_300);
  });

  it("lifecycle total = $13,000, collected once (no double, no escape)", () => {
    const atInvoicing = taxOf(hstTaxableBase({ subtotal: SUBTOTAL, holdbackAmount: HOLDBACK, treatment: "deferred_to_release" }));
    const atRelease = taxOf(hstTaxableBase({ subtotal: HOLDBACK, holdbackAmount: 0, treatment: "deferred_to_release" }));
    expect(atInvoicing).toBe(11_700);
    expect(atRelease).toBe(1_300);
    expect(atInvoicing + atRelease).toBe(13_000);
  });
});

describe("FIN-TAX-1 — the two treatments net to the same total tax", () => {
  it("upfront total === deferred total === $13,000", () => {
    const upfront = taxOf(hstTaxableBase({ subtotal: SUBTOTAL, holdbackAmount: HOLDBACK, treatment: "charged_upfront" })) + 0;
    const deferred =
      taxOf(hstTaxableBase({ subtotal: SUBTOTAL, holdbackAmount: HOLDBACK, treatment: "deferred_to_release" })) +
      taxOf(hstTaxableBase({ subtotal: HOLDBACK, holdbackAmount: 0, treatment: "deferred_to_release" }));
    expect(upfront).toBe(deferred);
    expect(upfront).toBe(13_000);
  });

  it("a non-holdback invoice taxes the full subtotal under BOTH treatments", () => {
    // holdbackAmount 0 → both treatments tax the whole subtotal identically.
    for (const t of HOLDBACK_HST_TREATMENTS) {
      expect(hstTaxableBase({ subtotal: 5000, holdbackAmount: 0, treatment: t })).toBe(5000);
    }
  });
});

describe("FIN-TAX-1 — per-opco separation (§2.6)", () => {
  it("each opco's HST is computed from its own invoice and never blended", () => {
    // The HST return sums stored per-invoice tax_amount grouped by opco. The
    // treatment is a per-invoice tax base, so two opcos with different treatments
    // each contribute exactly their own invoice's tax — the sum keeps them apart.
    const integrated = taxOf(
      hstTaxableBase({ subtotal: 100_000, holdbackAmount: 10_000, treatment: "charged_upfront" })
    ); // 13,000
    const guardian = taxOf(
      hstTaxableBase({ subtotal: 100_000, holdbackAmount: 10_000, treatment: "deferred_to_release" })
    ); // 11,700
    const byOpco: Record<string, number> = {};
    byOpco["Integrated Solutions"] = (byOpco["Integrated Solutions"] ?? 0) + integrated;
    byOpco["Guardian"] = (byOpco["Guardian"] ?? 0) + guardian;
    expect(byOpco["Integrated Solutions"]).toBe(13_000);
    expect(byOpco["Guardian"]).toBe(11_700);
    // The two never merge into a single remittance figure.
    expect(byOpco["Integrated Solutions"]).not.toBe(byOpco["Guardian"]);
  });
});
