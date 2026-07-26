// DASH-3 — revenue trend + top clients gate financials:view; inventory health
// gates inventory:view. A missing permission → { ok:false } (the UI shows the
// Restricted placeholder).

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string; role: string; status: string;
  } | null,
}));

vi.mock("@/lib/api/dashboard", () => ({
  getRevenueTrend: vi.fn(async () => []),
  getTopClientsByRevenue: vi.fn(async () => []),
  getInventoryHealth: vi.fn(async () => ({ by_category: [], low_stock: [], low_stock_count: 0 })),
  // other exports the actions module imports
  getDashboardKpis: vi.fn(),
  getDashboardAlerts: vi.fn(),
  getRecentActivity: vi.fn(),
  getQuotesByStatus: vi.fn(),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));

import {
  getRevenueTrendAction,
  getTopClientsByRevenueAction,
  getInventoryHealthAction,
} from "@/app/(app)/dashboard/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("financials:view gate (revenue trend + top clients)", () => {
  it("Accountant (financials:view) passes", async () => {
    h.profile = { id: "u1", role: "Accountant", status: "Active" };
    expect((await getRevenueTrendAction()).ok).toBe(true);
    expect((await getTopClientsByRevenueAction()).ok).toBe(true);
  });
  it("Technician (no financials:view) is restricted", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await getRevenueTrendAction()).ok).toBe(false);
    expect((await getTopClientsByRevenueAction()).ok).toBe(false);
  });
});

describe("inventory:view gate (inventory health)", () => {
  it("Technician (inventory:view) passes", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    expect((await getInventoryHealthAction()).ok).toBe(true);
  });
  it("Subcontractor (no inventory:view) is restricted", async () => {
    h.profile = { id: "u1", role: "Subcontractor", status: "Active" };
    expect((await getInventoryHealthAction()).ok).toBe(false);
  });
  it("unauthenticated denied", async () => {
    h.profile = null;
    expect((await getInventoryHealthAction()).ok).toBe(false);
  });
});
