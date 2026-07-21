// FIN-6 — AP aging, the payables mirror of ar-aging.test.ts. Same shape, same
// boundaries, balance-based via the FIN-5 bill-payment ledger.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  bills: [] as Record<string, unknown>[],
  payments: [] as Record<string, unknown>[],
  vendor: { id: "v1", name: "ADI" } as Record<string, unknown> | null,
}));

function applyFilters(
  rows: Record<string, unknown>[],
  filters: ChainCtx["filters"]
): Record<string, unknown>[] {
  let out = rows;
  for (const f of filters) {
    const [col, val] = f.args as [string, unknown];
    switch (f.method) {
      case "eq":
        out = out.filter((r) => r[col] === val);
        break;
      case "in":
        out = out.filter((r) => (val as unknown[]).includes(r[col]));
        break;
      case "neq":
        out = out.filter((r) => r[col] !== val);
        break;
      case "gte":
        out = out.filter((r) => r[col] != null && (r[col] as string) >= (val as string));
        break;
      case "lte":
        out = out.filter((r) => r[col] != null && (r[col] as string) <= (val as string));
        break;
      default:
        break;
    }
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "vendor_bills") {
    return { data: applyFilters(s.bills, ctx.filters), error: null };
  }
  if (ctx.table === "bill_payments") {
    return { data: applyFilters(s.payments, ctx.filters), error: null };
  }
  if (ctx.table === "vendors") {
    return { data: s.vendor, error: null };
  }
  return { data: [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));

import {
  apBillAgingDays,
  apAgingBucket,
  getApAgingSummary,
  getApAgingByVendor,
  getVendorStatement,
  buildApAgingCsv,
} from "@/lib/api/ap-aging";
import { businessDateISO } from "@/lib/format";

/** A yyyy-mm-dd `n` days before the business "today" the engine will use. */
function daysAgo(n: number): string {
  const today = businessDateISO();
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - n * 86_400_000);
  return t.toISOString().slice(0, 10);
}

beforeEach(() => {
  s.bills = [];
  s.payments = [];
  s.vendor = { id: "v1", name: "ADI" };
});

describe("apBillAgingDays", () => {
  const today = "2026-07-20";

  it("ages from due_date when one is set", () => {
    expect(
      apBillAgingDays({ due_date: "2026-07-10", bill_date: "2026-06-01" }, today)
    ).toBe(10);
  });

  it("falls back to bill_date when there is no due date", () => {
    expect(
      apBillAgingDays({ due_date: null, bill_date: "2026-07-05" }, today)
    ).toBe(15);
  });

  it("is negative before the due date (not yet due)", () => {
    expect(
      apBillAgingDays({ due_date: "2026-08-01", bill_date: "2026-07-01" }, today)
    ).toBe(-12);
  });

  it("returns 0 when the bill carries neither date", () => {
    expect(apBillAgingDays({ due_date: null, bill_date: null }, today)).toBe(0);
  });
});

describe("apAgingBucket boundaries", () => {
  it("maps each boundary to the right bucket", () => {
    expect(apAgingBucket(-5)).toBe("current");
    expect(apAgingBucket(0)).toBe("current");
    expect(apAgingBucket(1)).toBe("1_30");
    expect(apAgingBucket(30)).toBe("1_30");
    expect(apAgingBucket(31)).toBe("31_60");
    expect(apAgingBucket(60)).toBe("31_60");
    expect(apAgingBucket(61)).toBe("61_90");
    expect(apAgingBucket(90)).toBe("61_90");
    expect(apAgingBucket(91)).toBe("90_plus");
  });
});

describe("getApAgingSummary", () => {
  it("buckets open balances and excludes paid / void", async () => {
    s.bills = [
      { id: "b1", vendor_id: "v1", status: "received", total: 100, bill_date: daysAgo(5), due_date: daysAgo(-10), vendor: { name: "ADI" } },
      { id: "b2", vendor_id: "v1", status: "received", total: 200, bill_date: daysAgo(40), due_date: daysAgo(10), vendor: { name: "ADI" } },
      { id: "b3", vendor_id: "v1", status: "partially_paid", total: 300, bill_date: daysAgo(75), due_date: daysAgo(45), vendor: { name: "ADI" } },
      { id: "b4", vendor_id: "v1", status: "received", total: 400, bill_date: daysAgo(150), due_date: daysAgo(120), vendor: { name: "ADI" } },
      // excluded
      { id: "b5", vendor_id: "v1", status: "paid", total: 999, bill_date: daysAgo(200), due_date: daysAgo(170), vendor: { name: "ADI" } },
      { id: "b6", vendor_id: "v1", status: "void", total: 999, bill_date: daysAgo(200), due_date: daysAgo(170), vendor: { name: "ADI" } },
    ];
    const sum = await getApAgingSummary();
    expect(sum.buckets).toEqual({
      current: 100,
      d1_30: 200,
      d31_60: 300,
      d61_90: 0,
      d90_plus: 400,
    });
    expect(sum.total).toBe(1000);
    expect(sum.overdueTotal).toBe(900);
    expect(sum.asOf).toBe(businessDateISO());
  });

  it("a partial payment reduces the bucket its bill lands in", async () => {
    s.bills = [
      { id: "b1", vendor_id: "v1", status: "partially_paid", total: 500, bill_date: daysAgo(60), due_date: daysAgo(40), vendor: { name: "ADI" } },
    ];
    s.payments = [{ bill_id: "b1", amount: 150 }];
    const sum = await getApAgingSummary();
    expect(sum.buckets.d31_60).toBe(350);
    expect(sum.total).toBe(350);
  });

  it("drops bills whose payments fully cover the balance", async () => {
    s.bills = [
      { id: "b1", vendor_id: "v1", status: "partially_paid", total: 100, bill_date: daysAgo(60), due_date: daysAgo(40), vendor: { name: "ADI" } },
    ];
    s.payments = [{ bill_id: "b1", amount: 100 }];
    const sum = await getApAgingSummary();
    expect(sum.total).toBe(0);
  });

  it("ages from bill_date when a bill has no due date", async () => {
    s.bills = [
      { id: "b1", vendor_id: "v1", status: "received", total: 250, bill_date: daysAgo(70), due_date: null, vendor: { name: "ADI" } },
    ];
    const sum = await getApAgingSummary();
    expect(sum.buckets.d61_90).toBe(250);
  });
});

describe("getApAgingByVendor", () => {
  it("aggregates a vendor across buckets and tracks the oldest bill", async () => {
    s.bills = [
      { id: "b1", vendor_id: "v1", status: "received", total: 100, bill_date: daysAgo(20), due_date: daysAgo(10), vendor: { name: "ADI" } },
      { id: "b2", vendor_id: "v1", status: "received", total: 200, bill_date: daysAgo(130), due_date: daysAgo(100), vendor: { name: "ADI" } },
      { id: "b3", vendor_id: "v2", status: "received", total: 50, bill_date: daysAgo(10), due_date: daysAgo(2), vendor: { name: "Anixter" } },
    ];
    const rows = await getApAgingByVendor();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      vendor_id: "v1",
      vendor_name: "ADI",
      d1_30: 100,
      d90_plus: 200,
      total: 300,
      oldest_days: 100,
    });
    expect(rows[1]).toMatchObject({
      vendor_id: "v2",
      vendor_name: "Anixter",
      total: 50,
      oldest_days: 2,
    });
  });
});

describe("getVendorStatement", () => {
  it("lists non-void bills and reconciles billed − paid = balance", async () => {
    s.bills = [
      {
        id: "b1", vendor_id: "v1", status: "partially_paid",
        bill_number: "VB-1", bill_date: daysAgo(40), due_date: daysAgo(10),
        total: 1130, purchase_order: { po_number: "PO-1" },
      },
      {
        id: "b2", vendor_id: "v1", status: "paid",
        bill_number: "VB-2", bill_date: daysAgo(80), due_date: daysAgo(50),
        total: 500, purchase_order: null,
      },
      // void never appears on a statement of account
      { id: "b3", vendor_id: "v1", status: "void", bill_number: "VB-3", bill_date: daysAgo(5), due_date: null, total: 777, purchase_order: null },
    ];
    s.payments = [
      { bill_id: "b1", amount: 400 },
      { bill_id: "b2", amount: 500 },
    ];

    const stmt = await getVendorStatement("v1");
    expect(stmt).not.toBeNull();
    if (!stmt) return;

    expect(stmt.vendor_name).toBe("ADI");
    expect(stmt.lines).toHaveLength(2);
    expect(stmt.lines.map((l) => l.bill_number)).toEqual(["VB-1", "VB-2"]);
    expect(stmt.lines[0].po_number).toBe("PO-1");
    expect(stmt.lines[0].balance).toBe(730);
    expect(stmt.lines[0].bucket).toBe("1_30");
    expect(stmt.lines[1].balance).toBe(0);

    expect(stmt.totals).toEqual({ billed: 1630, paid: 900, balance: 730 });
    // the identity the statement footer prints — no holdback on the AP side
    expect(stmt.totals.billed - stmt.totals.paid).toBe(stmt.totals.balance);
  });

  it("returns null for a vendor that doesn't exist", async () => {
    s.vendor = null;
    expect(await getVendorStatement("nope")).toBeNull();
  });
});

describe("buildApAgingCsv", () => {
  it("emits a header plus one row per open bill with a balance", async () => {
    s.bills = [
      { id: "b1", vendor_id: "v1", status: "received", bill_number: "VB-1", bill_date: daysAgo(40), due_date: daysAgo(10), total: 226, vendor: { name: "ADI" }, purchase_order: { po_number: "PO-1" } },
      { id: "b2", vendor_id: "v2", status: "received", bill_number: "VB-2", bill_date: daysAgo(120), due_date: daysAgo(95), total: 100, vendor: { name: "Anixter" }, purchase_order: null },
      // fully covered → omitted
      { id: "b3", vendor_id: "v1", status: "partially_paid", bill_number: "VB-3", bill_date: daysAgo(5), due_date: daysAgo(1), total: 50, vendor: { name: "ADI" }, purchase_order: null },
    ];
    s.payments = [{ bill_id: "b3", amount: 50 }];

    const csv = await buildApAgingCsv();
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe(
      "Vendor,Bill,PO,Bill date,Due date,Total,Paid,Balance,Days past due,Bucket"
    );
    expect(rows).toHaveLength(3);
    // oldest-first
    expect(rows[1]).toContain("Anixter");
    expect(rows[1]).toContain("90+");
    expect(rows[2]).toContain("ADI");
    expect(rows[2]).toContain("226.00");
  });

  it("quotes fields containing commas", async () => {
    s.bills = [
      { id: "b1", vendor_id: "v1", status: "received", bill_number: "VB-1", bill_date: daysAgo(10), due_date: daysAgo(5), total: 10, vendor: { name: "ADI, Inc." }, purchase_order: null },
    ];
    const csv = await buildApAgingCsv();
    expect(csv.split("\r\n")[1]).toContain('"ADI, Inc."');
  });
});
