// INV-9-1 — getVendorMetricsAction gate + spend redaction.
//   read gate  : inventory:view (the tier vendor reads ride today)
//   spend gate : financials:view — absent → cost figures come back null, while
//                operational metrics (on-time, lead time, fill rate, qty) stay.

import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  profile: { id: "u1", role: "Admin", status: "Active" } as {
    id: string;
    role: string;
    status: string;
  } | null,
  metrics: {
    vendor_id: "v1",
    year: 2026,
    ytd_spend: 1500,
    spend_by_month: [
      { month: 3, amount: 1000 },
      { month: 7, amount: 500 },
    ],
    po_count: 3,
    bill_count: 2,
    on_time: { received_pos: 2, on_time_pos: 1, pct: 50 },
    avg_lead_time_days: 14,
    fill_rate: { ordered: 27, received: 19, pct: 70.37 },
    price_variance: { amount: 400, pct: 66.67, matched_pos: 1 },
    top_parts: [{ product_id: "pA", name: "Widget A", qty: 14, spend: 740 }],
    metrics_since: "2026-03-10",
  },
}));

vi.mock("@/lib/api/vendor-metrics", () => ({
  getVendorMetrics: vi.fn(async () => h.metrics),
}));
vi.mock("@/lib/auth/profile", () => ({ getCurrentProfile: async () => h.profile }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getVendorMetricsAction } from "@/app/(app)/vendors/actions";

beforeEach(() => {
  h.profile = { id: "u1", role: "Admin", status: "Active" };
});

describe("getVendorMetricsAction", () => {
  it("rejects an unauthenticated caller", async () => {
    h.profile = null;
    const res = await getVendorMetricsAction("v1", 2026);
    expect(res.ok).toBe(false);
  });

  it("rejects a role without inventory:view (Subcontractor)", async () => {
    h.profile = { id: "u1", role: "Subcontractor", status: "Active" };
    const res = await getVendorMetricsAction("v1", 2026);
    expect(res.ok).toBe(false);
  });

  it("Admin sees spend (canSeeSpend true, figures intact)", async () => {
    const res = await getVendorMetricsAction("v1", 2026);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.canSeeSpend).toBe(true);
    expect(res.data.metrics.ytd_spend).toBe(1500);
    expect(res.data.metrics.top_parts[0].spend).toBe(740);
    expect(res.data.metrics.price_variance.amount).toBe(400);
  });

  it("Technician (inventory:view, no financials:view) gets spend redacted, ops intact", async () => {
    h.profile = { id: "u1", role: "Technician", status: "Active" };
    const res = await getVendorMetricsAction("v1", 2026);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.canSeeSpend).toBe(false);
    // Cost-side → null (never a fabricated number).
    expect(res.data.metrics.ytd_spend).toBeNull();
    expect(res.data.metrics.spend_by_month.every((m) => m.amount === null)).toBe(true);
    expect(res.data.metrics.price_variance.amount).toBeNull();
    expect(res.data.metrics.price_variance.pct).toBeNull();
    expect(res.data.metrics.top_parts[0].spend).toBeNull();
    // Operational metrics survive.
    expect(res.data.metrics.on_time.pct).toBe(50);
    expect(res.data.metrics.avg_lead_time_days).toBe(14);
    expect(res.data.metrics.fill_rate.pct).toBe(70.37);
    expect(res.data.metrics.top_parts[0].qty).toBe(14);
    expect(res.data.metrics.price_variance.matched_pos).toBe(1);
  });
});
