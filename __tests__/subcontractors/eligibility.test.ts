// SUB-5 — the compliance HARD BLOCK, in isolation. This is the gate that stops
// a work order being issued to an uninsured / lapsed-WSIB sub. Reuses SUB-2's
// REQUIRED_DOC_TYPES + complianceState, so these tests also guard that reuse.

import { describe, it, expect } from "vitest";
import { canIssueWorkOrder } from "@/lib/subcontractors/eligibility";
import type { DbComplianceDocType } from "@/lib/types/database";

const TODAY = "2026-07-22";
const FAR = "2099-01-01"; // comfortably current
const PAST = "2026-06-01"; // expired relative to TODAY

function doc(doc_type: DbComplianceDocType, expiry_date: string | null) {
  return { doc_type, expiry_date };
}

// A full set of current required docs (WSIB + liability insurance).
const CURRENT_REQUIRED = [
  doc("wsib_clearance", FAR),
  doc("liability_insurance", FAR),
];

describe("canIssueWorkOrder", () => {
  it("active sub with valid required docs → ok", () => {
    expect(canIssueWorkOrder({ status: "active" }, CURRENT_REQUIRED, TODAY)).toEqual({ ok: true });
  });

  it("inactive sub → blocked with a status reason", () => {
    const res = canIssueWorkOrder({ status: "inactive" }, CURRENT_REQUIRED, TODAY);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reasons.join(" ")).toMatch(/inactive|do-not-use/i);
  });

  it("do_not_use sub → blocked", () => {
    const res = canIssueWorkOrder({ status: "do_not_use" }, CURRENT_REQUIRED, TODAY);
    expect(res.ok).toBe(false);
  });

  it("missing a required doc → blocked, reason names the doc", () => {
    // has liability but NO wsib_clearance
    const res = canIssueWorkOrder({ status: "active" }, [doc("liability_insurance", FAR)], TODAY);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reasons.join(" ")).toMatch(/Missing WSIB clearance/i);
  });

  it("expired required doc → blocked, reason includes the expiry date", () => {
    const res = canIssueWorkOrder(
      { status: "active" },
      [doc("wsib_clearance", PAST), doc("liability_insurance", FAR)],
      TODAY
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const joined = res.reasons.join(" ");
      expect(joined).toMatch(/WSIB clearance expired on 2026-06-01/i);
    }
  });

  it("required doc only EXPIRING soon → NOT blocked (warn only)", () => {
    const soon = "2026-08-10"; // within 30 days of TODAY but not past
    const res = canIssueWorkOrder(
      { status: "active" },
      [doc("wsib_clearance", soon), doc("liability_insurance", FAR)],
      TODAY
    );
    expect(res).toEqual({ ok: true });
  });

  it("an OPTIONAL (non-required) doc expired → NOT blocked", () => {
    const res = canIssueWorkOrder(
      { status: "active" },
      [...CURRENT_REQUIRED, doc("license", PAST), doc("auto_insurance", PAST)],
      TODAY
    );
    expect(res).toEqual({ ok: true });
  });

  it("a second CURRENT copy of a required doc satisfies it even if another is expired", () => {
    const res = canIssueWorkOrder(
      { status: "active" },
      [doc("wsib_clearance", PAST), doc("wsib_clearance", FAR), doc("liability_insurance", FAR)],
      TODAY
    );
    expect(res).toEqual({ ok: true });
  });
});
