// SCHED-1 — the tech certification hard-block (pure module). Mirrors the SUB
// eligibility tests: inactive/missing/expired block; expiring-soon warns not
// blocks; a non-required cert being expired never blocks.

import { describe, it, expect } from "vitest";
import { isTechEligibleForJob } from "@/lib/scheduling/tech-eligibility";

const TODAY = "2026-07-25";
const active = { is_active: true };

describe("isTechEligibleForJob", () => {
  it("blocks an inactive tech", () => {
    const r = isTechEligibleForJob({ is_active: false }, [], { required_certs: [] }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/inactive/i);
  });

  it("blocks when a required cert is missing entirely", () => {
    const r = isTechEligibleForJob(active, [], { required_certs: ["kantech"] }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/Missing Kantech/i);
  });

  it("blocks when the required cert is held but expired", () => {
    const certs = [{ cert_type: "kantech", expiry_date: "2026-01-01" }];
    const r = isTechEligibleForJob(active, certs, { required_certs: ["kantech"] }, TODAY);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/expired on 2026-01-01/i);
  });

  it("does NOT block an expiring-soon cert (warn only)", () => {
    // 2026-08-10 is 16 days out → expiring_soon, still valid today.
    const certs = [{ cert_type: "kantech", expiry_date: "2026-08-10" }];
    const r = isTechEligibleForJob(active, certs, { required_certs: ["kantech"] }, TODAY);
    expect(r.ok).toBe(true);
  });

  it("passes when the tech holds all required certs valid (incl. no-expiry)", () => {
    const certs = [
      { cert_type: "kantech", expiry_date: "2027-01-01" },
      { cert_type: "genetec", expiry_date: null },
    ];
    const r = isTechEligibleForJob(active, certs, { required_certs: ["kantech", "genetec"] }, TODAY);
    expect(r.ok).toBe(true);
  });

  it("an expired NON-required cert does not block", () => {
    const certs = [
      { cert_type: "kantech", expiry_date: "2027-01-01" }, // required, valid
      { cert_type: "genetec", expiry_date: "2020-01-01" }, // expired but not required
    ];
    const r = isTechEligibleForJob(active, certs, { required_certs: ["kantech"] }, TODAY);
    expect(r.ok).toBe(true);
  });

  it("a second VALID copy satisfies even when another copy is expired", () => {
    const certs = [
      { cert_type: "kantech", expiry_date: "2020-01-01" }, // old, expired
      { cert_type: "kantech", expiry_date: "2027-01-01" }, // renewed, valid
    ];
    const r = isTechEligibleForJob(active, certs, { required_certs: ["kantech"] }, TODAY);
    expect(r.ok).toBe(true);
  });
});
