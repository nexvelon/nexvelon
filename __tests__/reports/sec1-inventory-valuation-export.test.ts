// SEC-1 — the inventory-valuation report is reachable at inventory:view, but its
// cost-derived VALUE columns require inventory:viewCost. Both the on-screen
// dataset and the CSV/XLSX/PDF export must blank the value for a caller without
// viewCost (null → empty cell, never a fabricated zero, §2.8), while the unit
// counts always render.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  viewCost: false,
  role: "Technician", // has inventory:view, NOT inventory:viewCost
}));

vi.mock("@/lib/permissions/resolve", () => ({
  adaptDbRole: (r: string) => r,
  can: async (resource: string, action: string) =>
    resource === "inventory" && action === "viewCost" ? h.viewCost : false,
}));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: h.role, status: "Active" }),
}));
vi.mock("@/lib/api/products", () => ({
  getInventoryReportData: async () => ({
    totalValuation: 12500,
    valuationByCategory: [
      { category: "Cameras", value: 8000, units: 40 },
      { category: "Cabling", value: 4500, units: 900 },
    ],
    aging: [{ bucket: "0-30", units: 940, value: 12500 }],
    consumption90d: { value: 3000, units: 120 },
  }),
}));

import {
  getOperationalReportAction,
  exportOperationalReportAction,
} from "@/app/(app)/reports/operational-actions";

beforeEach(() => {
  h.viewCost = false;
  h.role = "Technician";
});

describe("inventory-valuation — SEC-1 value redaction", () => {
  it("without viewCost → value columns null, units preserved", async () => {
    const res = await getOperationalReportAction({ reportKey: "inventory-valuation" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ds = res.data;
    // Every value cell blanked...
    for (const row of ds.rows) expect(row.value).toBeNull();
    expect(ds.totals?.value).toBeNull();
    // ...but units survive.
    expect(ds.rows[0].units).toBe(40);
    expect(ds.totals?.units).toBe(940);
  });

  it("with viewCost → real values reach the dataset", async () => {
    h.viewCost = true;
    const res = await getOperationalReportAction({ reportKey: "inventory-valuation" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.rows[0].value).toBe(8000);
    expect(res.data.totals?.value).toBe(12500);
  });

  it("CSV export omits the value figures when viewCost is absent", async () => {
    const res = await exportOperationalReportAction({
      reportKey: "inventory-valuation",
      format: "csv",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const csv = res.data.data;
    // The real (formatted) figures must never appear in the exported bytes.
    expect(csv).not.toContain("8,000");
    expect(csv).not.toContain("12,500");
    expect(csv).not.toContain("$");
    // The category label + unit count still export.
    expect(csv).toContain("Cameras");
    expect(csv).toContain("40");
  });

  it("CSV export includes the value figures WITH viewCost", async () => {
    h.viewCost = true;
    const res = await exportOperationalReportAction({
      reportKey: "inventory-valuation",
      format: "csv",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.data).toContain("$8,000.00");
  });
});
