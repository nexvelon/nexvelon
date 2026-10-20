// RECUR-2 — the quote → contract model: validation, the mixed one-off +
// recurring split, the signed-terms snapshot, inheritance, and the conversion gate.

import { describe, it, expect } from "vitest";
import {
  buildRecurringSnapshot,
  contractConversionBlockers,
  contractLinesFromSnapshot,
  oneTimeInvoiceLines,
  paymentTermsDays,
  recurringServices,
  serviceContractQuoteIssues,
  taxRatePercent,
  termEndDate,
  type RecurringTermsSnapshot,
} from "@/lib/recurring/quote-terms";
import type { Quote } from "@/lib/types";
import type { MonitoringScheduleInstance } from "@/lib/quote-schedules";

function monitoring(over: Partial<MonitoringScheduleInstance> = {}): MonitoringScheduleInstance {
  return {
    id: "sch-mon",
    kind: "monitoring",
    title: "Monitoring Services",
    subtitle: "Recurring monitoring fees",
    included: true,
    services: [
      { id: "m1", label: "Fire monitoring", monthlyFee: 45 },
      { id: "m2", label: "Elevator monitoring", detail: "2 cabs", monthlyFee: 40 },
      { id: "m3", label: "ULC Certificate", monthlyFee: 0 }, // unpriced placeholder
    ],
    setupLabel: "Account activation",
    setupAmount: 150,
    ...over,
  };
}

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    number: "Q-10500",
    name: "Guardian monitoring — 200 King St",
    clientId: "cli-1",
    siteId: "site-1",
    status: "Approved",
    createdAt: "2026-10-01",
    expiresAt: "2026-10-31",
    ownerId: "u1",
    items: [],
    templateSlug: "guardian",
    intendedTargetKind: "service_contract",
    serviceContract: { cadence: "quarterly", billingTiming: "advance", termMonths: 36, lateFee: { mode: "none" } },
    paymentTerms: "Net 30",
    taxRate: 0.13,
    sections: [
      {
        id: "s1",
        name: "Equipment & Installation",
        items: [
          { id: "l1", type: "product", description: "Fire panel", name: "", qty: 1, unitPrice: 1200, unitCost: 700, margin: 41 },
          { id: "l2", type: "labor", description: "Install", name: "", qty: 8, unitPrice: 145, unitCost: 60, margin: 58 },
        ],
      },
    ],
    schedules: [monitoring()],
    subtotal: 2360,
    tax: 306.8,
    total: 2666.8,
    ...over,
  } as Quote;
}

describe("service-contract quote — validation", () => {
  it("a complete Guardian quote has no issues", () => {
    expect(serviceContractQuoteIssues(quote())).toEqual([]);
  });

  it("requires an explicit cadence (no default)", () => {
    const issues = serviceContractQuoteIssues(quote({ serviceContract: {} }));
    expect(issues.join(" ")).toMatch(/billing cadence/);
  });

  it("requires a priced monitoring service", () => {
    expect(serviceContractQuoteIssues(quote({ schedules: [] })).join(" ")).toMatch(/Monitoring Services schedule/);
    const unpriced = monitoring({ services: [{ id: "x", label: "Fire", monthlyFee: 0 }] });
    expect(serviceContractQuoteIssues(quote({ schedules: [unpriced] })).join(" ")).toMatch(/monthly fee above \$0/);
  });

  it("per-opco: a service contract must be issued by Guardian (never re-picked)", () => {
    const issues = serviceContractQuoteIssues(quote({ templateSlug: "integrated_solutions" }));
    expect(issues.join(" ")).toMatch(/Nexvelon Guardian/);
    expect(buildRecurringSnapshot(quote({ templateSlug: "integrated_solutions" }))).toBeNull();
  });

  it("validates late-fee terms", () => {
    const bad = quote({ serviceContract: { cadence: "monthly", lateFee: { mode: "percent_monthly", monthlyPct: 3 } } });
    expect(serviceContractQuoteIssues(bad).join(" ")).toMatch(/criminal/);
  });

  it("a non-service-contract quote is never flagged", () => {
    expect(serviceContractQuoteIssues(quote({ intendedTargetKind: "new_project" }))).toEqual([]);
    expect(buildRecurringSnapshot(quote({ intendedTargetKind: "new_project" }))).toBeNull();
  });
});

describe("mixed install + monitoring quote — the split", () => {
  it("recurring = only the priced monitoring services", () => {
    expect(recurringServices(quote()).map((s) => s.label)).toEqual(["Fire monitoring", "Elevator monitoring"]);
  });

  it("one-time = the sections, discount and the setup fee — never the monitoring fees", () => {
    const lines = oneTimeInvoiceLines(
      { sections: quote().sections!, subtotal: 2360, discount: 10, discountType: "pct" },
      { label: "Account activation", amount: 150 }
    );
    expect(lines).toEqual([
      { description: "Equipment & Installation", amount: 2360 },
      { description: "Discount", amount: -236 },
      { description: "Account activation", amount: 150 },
    ]);
  });

  it("a monitoring-only quote has no one-time lines", () => {
    expect(oneTimeInvoiceLines({ sections: [], subtotal: 0 }, null)).toEqual([]);
  });
});

describe("signed terms snapshot + inheritance", () => {
  const rec = buildRecurringSnapshot(quote()) as RecurringTermsSnapshot;

  it("freezes cadence, prices, opco, tax, terms and payment terms", () => {
    expect(rec).toMatchObject({
      version: 1,
      opco: "guardian",
      cadence: "quarterly",
      billingTiming: "advance",
      termMonths: 36,
      paymentTermsDays: 30,
      taxRatePct: 13,
      monthlyTotal: 85,
      periodTotal: 255,
      setup: { label: "Account activation", amount: 150 },
      lateFee: { mode: "none" },
    });
  });

  it("contract lines are priced per billing period (3 × monthly for quarterly)", () => {
    expect(contractLinesFromSnapshot(rec)).toEqual([
      { description: "Fire monitoring (45.00/month × 3)", amount: 135 },
      { description: "Elevator monitoring — 2 cabs (40.00/month × 3)", amount: 120 },
    ]);
    expect(contractLinesFromSnapshot({ ...rec, cadence: "monthly" })).toEqual([
      { description: "Fire monitoring", amount: 45 },
      { description: "Elevator monitoring — 2 cabs", amount: 40 },
    ]);
  });

  it("an edit to the live quote after signing does not change the snapshot", () => {
    const q = quote();
    const signed = buildRecurringSnapshot(q)!;
    (q.schedules![0] as MonitoringScheduleInstance).services[0].monthlyFee = 999;
    q.serviceContract!.cadence = "monthly";
    expect(signed.services[0].monthlyFee).toBe(45);
    expect(signed.cadence).toBe("quarterly");
  });

  it("term end dates hold month-end anchors", () => {
    expect(termEndDate("2026-11-01", 36)).toBe("2029-10-31");
    expect(termEndDate("2026-01-31", 1)).toBe("2026-02-27");
    expect(termEndDate("2026-11-01", null)).toBeNull();
  });

  it("normalises tax and payment terms", () => {
    expect(taxRatePercent(0.13)).toBe(13);
    expect(taxRatePercent(13)).toBe(13);
    expect(taxRatePercent(undefined)).toBe(13);
    expect(paymentTermsDays("Net 15")).toBe(15);
    expect(paymentTermsDays(undefined)).toBeNull();
  });
});

describe("conversion gate", () => {
  const signedTerms = buildRecurringSnapshot(quote());
  const ok = {
    quote: { status: "Approved" as const, intendedTargetKind: "service_contract" as const },
    acceptance: { decision: "accepted" as const },
    signedTerms,
    existingContractId: null,
    canConvert: true,
    canManageContracts: true,
  };

  it("an accepted, signed service-contract quote can convert", () => {
    expect(contractConversionBlockers(ok)).toEqual([]);
  });

  it("cannot convert before acceptance", () => {
    const b = contractConversionBlockers({ ...ok, acceptance: null, quote: { ...ok.quote, status: "Sent" } });
    expect(b.map((x) => x.code)).toEqual(["not_accepted"]);
    expect(contractConversionBlockers({ ...ok, acceptance: { decision: "declined" } }).map((x) => x.code)).toEqual([
      "not_accepted",
    ]);
  });

  it("an old acceptance on a quote reopened since does not count", () => {
    const b = contractConversionBlockers({ ...ok, quote: { ...ok.quote, status: "Draft" } });
    expect(b.map((x) => x.code)).toEqual(["not_accepted"]);
    expect(b[0].message).toMatch(/reopened/);
  });

  it("converting twice is rejected", () => {
    expect(contractConversionBlockers({ ...ok, existingContractId: "c1" }).map((x) => x.code)).toEqual([
      "already_converted",
    ]);
    expect(
      contractConversionBlockers({ ...ok, quote: { ...ok.quote, status: "Converted" } }).map((x) => x.code)
    ).toEqual(["already_converted"]);
  });

  it("wrong type, legacy signature without terms, and permissions each say why", () => {
    expect(
      contractConversionBlockers({ ...ok, quote: { ...ok.quote, intendedTargetKind: "new_project" } }).map((x) => x.code)
    ).toEqual(["wrong_type"]);
    expect(contractConversionBlockers({ ...ok, signedTerms: null }).map((x) => x.code)).toEqual(["no_signed_terms"]);
    const perm = contractConversionBlockers({ ...ok, canManageContracts: false });
    expect(perm[0].code).toBe("no_permission");
    expect(perm[0].message).toMatch(/financials:edit/);
  });
});
