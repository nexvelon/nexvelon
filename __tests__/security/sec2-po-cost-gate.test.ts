// SEC-2 — a purchase order is a cost document. Both the detail action and the PDF
// action are gated on inventory:viewCost, so a role that can't see costs on
// screen can't pull them via the detail payload or generate the cost PDF either.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({ viewCost: false }));

vi.mock("@/lib/permissions/resolve", () => ({
  adaptDbRole: (r: string) => r,
  requireAdmin: vi.fn(),
  can: async (resource: string, action: string) =>
    resource === "inventory" && action === "viewCost" ? h.viewCost : false,
}));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: "Technician", status: "Active" }),
}));
vi.mock("@/lib/api/purchase-orders", () => ({
  getPurchaseOrderById: async () => ({
    header: { id: "po1", vendor_id: "v1", vendor_name: "ADI" },
    lines: [{ id: "l1", unit_cost: 42, quantity: 3 }],
  }),
  buildPurchaseOrderPdfProps: async () => ({ title: "PO", lines: [{ unit_cost: 42 }] }),
  getPurchaseOrders: async () => [],
  // re-exported types / other fns referenced by the actions module:
  getLastVendorIdForProduct: vi.fn(),
  createPurchaseOrder: vi.fn(),
  updatePurchaseOrder: vi.fn(),
  deletePurchaseOrder: vi.fn(),
  receivePurchaseOrderLines: vi.fn(),
  setPurchaseOrderStatus: vi.fn(),
  stampPurchaseOrder: vi.fn(),
  assertPoJobAttribution: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  getPurchaseOrderAction,
  getPurchaseOrderPdfPropsAction,
} from "@/app/(app)/purchase-orders/actions";

beforeEach(() => {
  h.viewCost = false;
});

describe("SEC-2 PO cost gating", () => {
  it("detail action is DENIED without inventory:viewCost", async () => {
    const res = await getPurchaseOrderAction("po1");
    expect(res.ok).toBe(false);
  });

  it("detail action returns costs WITH inventory:viewCost", async () => {
    h.viewCost = true;
    const res = await getPurchaseOrderAction("po1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.lines[0].unit_cost).toBe(42);
  });

  it("PDF action is DENIED without inventory:viewCost", async () => {
    const res = await getPurchaseOrderPdfPropsAction("po1");
    expect(res.ok).toBe(false);
  });

  it("PDF action succeeds WITH inventory:viewCost", async () => {
    h.viewCost = true;
    const res = await getPurchaseOrderPdfPropsAction("po1");
    expect(res.ok).toBe(true);
  });
});
