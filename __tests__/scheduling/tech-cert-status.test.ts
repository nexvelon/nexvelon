// DES-2 — the derived cert status boundaries (reusing lib/expiry-state) and the
// roll-up counts used by the panel + dashboard surfacing.

import { describe, it, expect } from "vitest";
import {
  techCertState, certStatusCounts, TECH_CERT_WARN_DAYS,
} from "@/lib/scheduling/tech-cert-status";

const TODAY = "2026-07-26";

describe("techCertState boundaries (warnDays = 60)", () => {
  it("no expiry date → no_expiry", () => {
    expect(techCertState({ cert_type: "esa", expiry_date: null }, TODAY)).toBe("no_expiry");
  });
  it("comfortably in date (> 60d) → active (valid)", () => {
    expect(techCertState({ cert_type: "esa", expiry_date: "2026-12-31" }, TODAY)).toBe("active");
  });
  it("exactly warnDays out (60d) → expiring_soon", () => {
    // 2026-07-26 + 60d = 2026-09-24
    expect(techCertState({ cert_type: "esa", expiry_date: "2026-09-24" }, TODAY)).toBe("expiring_soon");
  });
  it("one day past warnDays (61d) → active", () => {
    expect(techCertState({ cert_type: "esa", expiry_date: "2026-09-25" }, TODAY)).toBe("active");
  });
  it("expiring today (0d) → expiring_soon (you still hold it)", () => {
    expect(techCertState({ cert_type: "esa", expiry_date: TODAY }, TODAY)).toBe("expiring_soon");
  });
  it("past → expired", () => {
    expect(techCertState({ cert_type: "esa", expiry_date: "2026-07-25" }, TODAY)).toBe("expired");
  });
  it("default warn window is 60", () => {
    expect(TECH_CERT_WARN_DAYS).toBe(60);
  });
});

describe("certStatusCounts", () => {
  it("rolls certs up by state; at_risk = expired + expiring_soon", () => {
    const counts = certStatusCounts(
      [
        { cert_type: "a", expiry_date: "2026-07-01" }, // expired
        { cert_type: "b", expiry_date: "2026-08-10" }, // expiring_soon
        { cert_type: "c", expiry_date: "2027-01-01" }, // active/valid
        { cert_type: "d", expiry_date: null }, // no_expiry
      ],
      TODAY
    );
    expect(counts).toMatchObject({ valid: 1, expiring_soon: 1, expired: 1, no_expiry: 1, at_risk: 2 });
  });
});
