// AUD-2B — action-layer audit coverage for the entities logged in the actions
// tier: a stock adjustment writes ONE readable row rolled up to the product, and
// subcontractor + compliance CRUD write rows on the right timeline. Libs are
// stubbed; logActivity is a spy (real elsewhere via importActual).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  logActivity: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: "Admin", status: "Active" }),
}));
vi.mock("@/lib/permissions/resolve", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, can: async () => true, requireAdmin: async () => ({ ok: true, actorId: "u1" }) };
});
vi.mock("@/lib/api/activity-log", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, logActivity: h.logActivity };
});

// ── stock-movements action deps ──────────────────────────────────────────────
vi.mock("@/lib/api/stock-movements", () => ({
  adjustStockQuantity: vi.fn(async () => ({ ok: true })),
  moveStock: vi.fn(), markDelivered: vi.fn(), markInstalled: vi.fn(),
  markLost: vi.fn(), markReturned: vi.fn(), markConsumed: vi.fn(),
  getStockProject: vi.fn(), listMovementsByProduct: vi.fn(),
  deleteReceivedBatchRows: vi.fn(), setBatchRowQuantity: vi.fn(),
  deleteMovementById: vi.fn(), deleteAllMovementsForProduct: vi.fn(),
}));
vi.mock("@/lib/api/products", () => ({
  getProductRowById: vi.fn(async () => ({ id: "prod1", name: "Acme Widget", sku: "AW-1" })),
}));

// ── subcontractor action deps ────────────────────────────────────────────────
vi.mock("@/lib/api/subcontractors", () => ({
  createSubcontractor: vi.fn(async () => ({ id: "s1", name: "Ace Electric" })),
  getSubcontractorById: vi.fn(async () => ({ id: "s1", name: "Ace Electric" })),
  updateSubcontractor: vi.fn(), deleteSubcontractor: vi.fn(async () => true),
  linkVendor: vi.fn(), listSubcontractors: vi.fn(), listSubcontractorTrades: vi.fn(),
}));
vi.mock("@/lib/api/subcontractor-compliance", () => ({
  createComplianceDoc: vi.fn(async () => ({ id: "cd1", doc_type: "wsib", title: null })),
  updateComplianceDoc: vi.fn(), deleteComplianceDoc: vi.fn(),
  getComplianceDocById: vi.fn(), listComplianceDocs: vi.fn(),
  getComplianceSummary: vi.fn(), getComplianceSummariesForSubs: vi.fn(),
  getComplianceRisk: vi.fn(),
}));
vi.mock("@/lib/api/vendors", () => ({ getVendors: vi.fn() }));
vi.mock("@/app/(app)/attachments/actions", () => ({ deleteAttachment: vi.fn() }));

import { adjustStockQuantityAction } from "@/app/(app)/inventory/movement-actions";
import {
  createSubcontractorAction,
  createComplianceDocAction,
} from "@/app/(app)/subcontractors/actions";

beforeEach(() => h.logActivity.mockClear());

describe("stock movement — one readable row rolled up to the product", () => {
  it("adjustStockQuantityAction logs a single stock_movement row naming the product", async () => {
    const res = await adjustStockQuantityAction("prod1", "unit1", 7, "recount");
    expect(res.ok).toBe(true);
    expect(h.logActivity).toHaveBeenCalledTimes(1);
    expect(h.logActivity).toHaveBeenCalledWith(
      "stock_movement",
      "prod1",
      "update",
      { quantity: { from: null, to: 7 }, reason: { from: null, to: "recount" } },
      { parentType: "inventory", parentId: "prod1", entityLabel: "Adjusted quantity · Acme Widget" }
    );
  });
});

describe("subcontractor + compliance — audit coverage", () => {
  it("createSubcontractorAction logs a subcontractor create on its own timeline", async () => {
    const res = await createSubcontractorAction({ name: "Ace Electric" } as never);
    expect(res.ok).toBe(true);
    expect(h.logActivity).toHaveBeenCalledWith("subcontractor", "s1", "create", {}, {
      entityLabel: "Ace Electric",
    });
  });

  it("createComplianceDocAction rolls the doc up to its subcontractor", async () => {
    const res = await createComplianceDocAction({
      subcontractorId: "s1",
      docType: "wsib",
    } as never);
    expect(res.ok).toBe(true);
    expect(h.logActivity).toHaveBeenCalledWith("subcontractor_compliance", "cd1", "create", {}, {
      parentType: "subcontractor",
      parentId: "s1",
      entityLabel: "wsib",
    });
  });
});
