// DASH-2 SECURITY FIX — getInventoryReportDataAction and emailLowStockReportAction
// were UNGATED. They now require inventory:view. Subcontractor (no inventory:view)
// is rejected; Admin passes.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
}));

vi.mock("@/lib/api/products", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/products")>()),
  getInventoryReportData: vi.fn(async () => ({ totalValuation: 0, valuationByCategory: [], aging: [], consumption90d: { value: 0, units: 0 } })),
  listProducts: vi.fn(async () => []),
}));
vi.mock("@/lib/auth/email", () => ({ sendLowStockAlert: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  getInventoryReportDataAction,
  emailLowStockReportAction,
} from "@/app/(app)/inventory/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("inventory report actions now gate inventory:view", () => {
  it("Subcontractor (no inventory:view) is rejected", async () => {
    h.profile = { id: "u1", role: "Subcontractor", status: "Active" };
    await expect(getInventoryReportDataAction()).rejects.toThrow(/permission/i);
    const email = await emailLowStockReportAction();
    expect(email.sent).toBe(false);
    expect(email.reason).toMatch(/permission/i);
  });

  it("Admin passes", async () => {
    h.profile = { id: "u1", role: "Admin", status: "Active" };
    await expect(getInventoryReportDataAction()).resolves.toBeTruthy();
    const email = await emailLowStockReportAction();
    // no low stock (listProducts mocked []) → sent false but NOT a permission reason
    expect(email.reason ?? "").not.toMatch(/permission/i);
  });
});
