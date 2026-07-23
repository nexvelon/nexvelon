// SUB-2 — the derived compliance validity module. Pure functions; a fixed
// "today" pins every boundary.

import { describe, it, expect } from "vitest";
import {
  complianceState,
  daysUntilExpiry,
  subcontractorComplianceSummary,
  EXPIRING_SOON_DAYS,
  REQUIRED_DOC_TYPES,
} from "@/lib/subcontractors/compliance-status";

const TODAY = "2026-07-20";

function plus(days: number): string {
  const [y, m, d] = TODAY.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

describe("complianceState boundaries", () => {
  it("null expiry → no_expiry (permanent)", () => {
    expect(complianceState({ expiry_date: null }, TODAY)).toBe("no_expiry");
  });
  it("yesterday → expired", () => {
    expect(complianceState({ expiry_date: plus(-1) }, TODAY)).toBe("expired");
  });
  it("today → expiring_soon (0 days, inclusive)", () => {
    expect(complianceState({ expiry_date: plus(0) }, TODAY)).toBe("expiring_soon");
  });
  it("+1 day → expiring_soon", () => {
    expect(complianceState({ expiry_date: plus(1) }, TODAY)).toBe("expiring_soon");
  });
  it("exactly +30 days → expiring_soon (inclusive)", () => {
    expect(EXPIRING_SOON_DAYS).toBe(30);
    expect(complianceState({ expiry_date: plus(30) }, TODAY)).toBe("expiring_soon");
  });
  it("+31 days → valid", () => {
    expect(complianceState({ expiry_date: plus(31) }, TODAY)).toBe("valid");
  });
});

describe("daysUntilExpiry", () => {
  it("is null for permanent docs, signed otherwise", () => {
    expect(daysUntilExpiry({ expiry_date: null }, TODAY)).toBeNull();
    expect(daysUntilExpiry({ expiry_date: plus(5) }, TODAY)).toBe(5);
    expect(daysUntilExpiry({ expiry_date: plus(-3) }, TODAY)).toBe(-3);
  });
});

describe("subcontractorComplianceSummary", () => {
  it("counts states and picks the worst (expired dominates)", () => {
    const s = subcontractorComplianceSummary(
      [
        { doc_type: "wsib_clearance", expiry_date: plus(90) }, // valid
        { doc_type: "liability_insurance", expiry_date: plus(10) }, // expiring
        { doc_type: "license", expiry_date: plus(-1) }, // expired
      ],
      TODAY
    );
    expect(s.expired).toBe(1);
    expect(s.expiring_soon).toBe(1);
    expect(s.valid).toBe(1);
    expect(s.worst).toBe("expired");
    // both required types are present + current → nothing missing
    expect(s.missing_required).toEqual([]);
  });

  it("flags a required type that is entirely absent", () => {
    const s = subcontractorComplianceSummary(
      [{ doc_type: "wsib_clearance", expiry_date: plus(90) }],
      TODAY
    );
    // liability_insurance never provided
    expect(s.missing_required).toEqual(["liability_insurance"]);
    expect(s.worst).toBe("expired"); // missing-required is red, not amber
  });

  it("treats an EXPIRED required doc as missing (not merely expired)", () => {
    const s = subcontractorComplianceSummary(
      [
        { doc_type: "wsib_clearance", expiry_date: plus(90) },
        { doc_type: "liability_insurance", expiry_date: plus(-5) }, // lapsed
      ],
      TODAY
    );
    expect(s.missing_required).toEqual(["liability_insurance"]);
    expect(s.worst).toBe("expired");
  });

  it("no_expiry docs satisfy a required type", () => {
    const s = subcontractorComplianceSummary(
      [
        { doc_type: "wsib_clearance", expiry_date: null },
        { doc_type: "liability_insurance", expiry_date: plus(200) },
      ],
      TODAY
    );
    expect(s.missing_required).toEqual([]);
    expect(s.worst).toBe("ok");
  });

  it("empty → both required missing", () => {
    const s = subcontractorComplianceSummary([], TODAY);
    expect(s.missing_required).toEqual([...REQUIRED_DOC_TYPES]);
    expect(s.worst).toBe("expired");
  });

  it("all current, one expiring, none missing → expiring_soon", () => {
    const s = subcontractorComplianceSummary(
      [
        { doc_type: "wsib_clearance", expiry_date: plus(15) }, // expiring
        { doc_type: "liability_insurance", expiry_date: plus(200) }, // valid
      ],
      TODAY
    );
    expect(s.worst).toBe("expiring_soon");
    expect(s.missing_required).toEqual([]);
  });
});
