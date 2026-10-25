// REP-5 — per-opco separation (§2.6) for opco-scoped saved reports: a saved copy
// limited to one company contains only that company's rows and says so; an
// unscoped copy keeps both companies as separate rows (never blended).

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/api/project-pnl", () => ({
  getOpcoPnl: async () => [
    { opco: "integrated_solutions", project_count: 3, revenue: 1000, materials: 200, labour: 100, sub_labour: 50, canonical_direct: 350, gross_profit: 650, gross_margin_pct: 65 },
    { opco: "guardian", project_count: 2, revenue: 500, materials: 50, labour: 50, sub_labour: 0, canonical_direct: 100, gross_profit: 400, gross_margin_pct: 80 },
  ],
  getPnlPortfolio: async () => [],
}));
vi.mock("@/lib/api/financials", () => ({
  getHstNetPosition: async (range: { from?: string; to?: string }) => ({
    byOpco: [
      { opco: "integrated_solutions", collected: 130, itc: 30, net: 100 },
      { opco: "guardian", collected: 65, itc: 5, net: 60 },
    ],
    totals: { collected: 195, itc: 35, net: 160 },
    unassignedItc: 0,
    from: range.from ?? null,
    to: range.to ?? null,
  }),
}));

import { buildReportDataset } from "@/lib/reports/build";
import { NO_FIELD_GATES } from "@/lib/reports/access";

describe("per-opco separation", () => {
  it("a Guardian-only saved P&L contains only Guardian and is labelled", async () => {
    const ds = await buildReportDataset("opco-pnl", { opco: "guardian" }, NO_FIELD_GATES);
    expect(ds.rows).toHaveLength(1);
    expect(JSON.stringify(ds.rows)).not.toMatch(/Integrated/);
    expect(ds.meta).toContainEqual({ label: "Company", value: "Guardian only" });
    expect(ds.filename).toMatch(/guardian$/);
  });

  it("unscoped keeps both companies as separate rows, with no blended total", async () => {
    const ds = await buildReportDataset("opco-pnl", {}, NO_FIELD_GATES);
    expect(ds.rows).toHaveLength(2);
    expect(ds.totals).toBeUndefined();
  });

  it("HST scoped to one company drops the other's position", async () => {
    const ds = await buildReportDataset("hst", { from: "2026-10-01", to: "2026-10-31", opco: "integrated_solutions" }, NO_FIELD_GATES);
    expect(ds.rows).toHaveLength(1);
    expect(JSON.stringify(ds.rows)).not.toMatch(/Guardian/);
  });
});
