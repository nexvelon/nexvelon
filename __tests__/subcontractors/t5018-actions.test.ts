// SUB-7 — gates on the T5018 actions. Payment totals per payee are sensitive
// AP data, so report + export + the per-sub year totals all sit at
// financials:edit (the FIN-6/FIN-7 tier) — a financials:view-only role (PM) is
// refused and the API is never hit.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Accountant", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
  getT5018Report: vi.fn(async () => ({
    year: 2025,
    period: { from: "2025-01-01", to: "2025-12-31" },
    rows: [],
    totals: { subcontractor_count: 0, total_paid: 0, rows_missing_business_number: 0 },
  })),
  getT5018YearsAvailable: vi.fn(async () => [2025]),
  getSubPaymentYearTotals: vi.fn(async () => ({ this_year: 0, last_year: 0 })),
  buildT5018Csv: vi.fn(() => "Legal name\r\n"),
}));

vi.mock("@/lib/api/t5018", () => ({
  getT5018Report: h.getT5018Report,
  getT5018YearsAvailable: h.getT5018YearsAvailable,
  getSubPaymentYearTotals: h.getSubPaymentYearTotals,
  buildT5018Csv: h.buildT5018Csv,
}));
// The financials actions module pulls in the whole FIN surface; stub the rest.
// vi.hoisted so the factory exists before the hoisted vi.mock calls run (the
// SUB-1 lesson).
const STUB = vi.hoisted(
  () => () =>
    new Proxy({}, {
      get: (_t, p) =>
        typeof p === "symbol" || p === "then" || p === "__esModule" ? undefined : vi.fn(),
    })
);
vi.mock("@/lib/api/financials", STUB);
vi.mock("@/lib/api/ar-aging", STUB);
vi.mock("@/lib/api/ap-aging", STUB);
vi.mock("@/lib/api/deposits", STUB);
vi.mock("@/lib/api/vendor-bills", STUB);
vi.mock("@/lib/api/subcontractor-compliance", STUB);
vi.mock("@/lib/api/project-pnl", STUB);
vi.mock("@/lib/api/holdback", STUB);
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  getT5018ReportAction,
  getT5018YearsAction,
  exportT5018CsvAction,
  getSubPaymentYearTotalsAction,
} from "@/app/(app)/financials/actions";

const CALLS = [
  () => getT5018ReportAction(2025),
  () => getT5018YearsAction(),
  () => exportT5018CsvAction(2025),
  () => getSubPaymentYearTotalsAction("subA"),
];
const FNS = [h.getT5018Report, h.getT5018YearsAvailable, h.getSubPaymentYearTotals];

beforeEach(() => {
  h.profile = { id: "u1", role: "Accountant", status: "Active" };
  for (const fn of FNS) fn.mockClear();
});

describe("T5018 gates (financials:edit)", () => {
  it("rejects a financials:view-only role (ProjectManager) without hitting the API", async () => {
    h.profile = { id: "u1", role: "ProjectManager", status: "Active" };
    for (const call of CALLS) {
      const res = await call();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/permission/i);
    }
    for (const fn of FNS) expect(fn).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    h.profile = null;
    for (const call of CALLS) expect((await call()).ok).toBe(false);
  });

  it("passes for Accountant and Admin (financials:edit)", async () => {
    for (const role of ["Accountant", "Admin"]) {
      h.profile = { id: "u1", role, status: "Active" };
      for (const call of CALLS) expect((await call()).ok).toBe(true);
    }
  });

  it("export returns the CSV + a year-stamped filename", async () => {
    const res = await exportT5018CsvAction(2025);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.filename).toBe("nexvelon-t5018-2025.csv");
      expect(res.data.csv).toContain("Legal name");
    }
  });

  it("rejects a nonsense year", async () => {
    expect((await getT5018ReportAction(0)).ok).toBe(false);
    expect((await exportT5018CsvAction(99999)).ok).toBe(false);
    expect(h.getT5018Report).not.toHaveBeenCalled();
  });
});
