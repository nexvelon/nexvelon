// SEC-1 — inventory read actions strip cost from the wire for callers without
// inventory:viewCost. Product cost/avgCost/default-margin and the valuation
// report's value columns must be null (never zeroed, §2.8) without the flag, and
// the real numbers with it.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Product } from "@/lib/types";

const h = vi.hoisted(() => ({
  viewCost: false,
  role: "Technician", // inventory:view, NOT inventory:viewCost
}));

vi.mock("@/lib/permissions/resolve", () => ({
  adaptDbRole: (r: string) => r,
  can: async (resource: string, action: string) => {
    if (resource === "inventory" && action === "viewCost") return h.viewCost;
    if (resource === "inventory" && action === "view") return true; // base tier
    return false;
  },
}));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: h.role, status: "Active" }),
}));

vi.mock("@/lib/api/products", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/products")>()),
  listProducts: async (): Promise<Product[]> => [
    {
      id: "p1",
      sku: "CAM-1",
      name: "Camera",
      manufacturer: "Acme",
      vendor: "V",
      category: "Cameras",
      subcategory: "",
      stock: 5,
      reorderPoint: 2,
      cost: 90,
      avgCost: 88,
      quoteDefaultMargin: 40,
    } as unknown as Product,
  ],
  getInventoryReportData: async () => ({
    totalValuation: 12500,
    valuationByCategory: [{ category: "Cameras", value: 8000, units: 40 }],
    aging: [{ bucket: "0-30", units: 40, value: 8000 }],
    consumption90d: { value: 3000, units: 12 },
  }),
}));

import {
  listProductsAction,
  getInventoryReportDataAction,
} from "@/app/(app)/inventory/actions";

beforeEach(() => {
  h.viewCost = false;
  h.role = "Technician";
});

describe("listProductsAction — SEC-1 cost redaction", () => {
  it("without viewCost → cost/avgCost/default-margin all null", async () => {
    const products = await listProductsAction();
    expect(products[0].cost).toBeNull();
    expect(products[0].avgCost).toBeNull();
    expect(products[0].quoteDefaultMargin).toBeNull();
    // Non-cost fields preserved.
    expect(products[0].stock).toBe(5);
    expect(products[0].sku).toBe("CAM-1");
  });

  it("with viewCost → real cost reaches the wire", async () => {
    h.viewCost = true;
    const products = await listProductsAction();
    expect(products[0].cost).toBe(90);
    expect(products[0].avgCost).toBe(88);
  });
});

describe("getInventoryReportDataAction — SEC-1 value redaction", () => {
  it("without viewCost → value columns null, units preserved", async () => {
    const report = await getInventoryReportDataAction();
    expect(report.totalValuation).toBeNull();
    expect(report.valuationByCategory[0].value).toBeNull();
    expect(report.aging[0].value).toBeNull();
    expect(report.consumption90d.value).toBeNull();
    expect(report.valuationByCategory[0].units).toBe(40);
  });

  it("with viewCost → real values reach the wire", async () => {
    h.viewCost = true;
    const report = await getInventoryReportDataAction();
    expect(report.totalValuation).toBe(12500);
    expect(report.valuationByCategory[0].value).toBe(8000);
  });
});
