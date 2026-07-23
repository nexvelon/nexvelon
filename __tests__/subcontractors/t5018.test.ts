// SUB-7 — the T5018 report. The claims that matter: the basis is PAID in the
// calendar year (boundary dates land in the right year), ONLY sub-attributed
// bills count (the over-report guard), void bills are excluded, the $500
// threshold FLAGS rather than filters, and missing business numbers surface.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  bills: [] as Record<string, unknown>[],
  payments: [] as Record<string, unknown>[],
  subs: [] as Record<string, unknown>[],
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const args = f.args as unknown[];
    const col = args[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === args[1]);
    if (f.method === "neq") out = out.filter((r) => r[col] !== args[1]);
    if (f.method === "in")
      out = out.filter((r) => (args[1] as unknown[]).includes(r[col]));
    if (f.method === "not" && args[1] === "is" && args[2] === null)
      out = out.filter((r) => r[col] !== null && r[col] !== undefined);
    if (f.method === "gte") out = out.filter((r) => String(r[col]) >= String(args[1]));
    if (f.method === "lte") out = out.filter((r) => String(r[col]) <= String(args[1]));
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  switch (ctx.table) {
    case "vendor_bills":
      return { data: filt(s.bills, ctx.filters), error: null };
    case "bill_payments":
      return { data: filt(s.payments, ctx.filters), error: null };
    case "subcontractors":
      return { data: filt(s.subs, ctx.filters), error: null };
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));

import {
  getT5018Report,
  getT5018YearsAvailable,
  getSubPaymentYearTotals,
  buildT5018Csv,
  T5018_THRESHOLD,
} from "@/lib/api/t5018";

const SUB_A = {
  id: "subA", name: "Ace Electric", legal_name: "Ace Electric Ltd.",
  business_number: "123456789RT0001", gst_hst_number: "123456789",
  address_line1: "1 Main St", address_line2: null, city: "Brampton",
  province: "ON", postal_code: "L6W1A1",
};
const SUB_B = {
  id: "subB", name: "Bolt Mechanical", legal_name: null,
  business_number: null, gst_hst_number: null,
  address_line1: null, address_line2: null, city: null, province: null, postal_code: null,
};

beforeEach(() => {
  s.subs = [SUB_A, SUB_B];
  s.bills = [
    { id: "b1", subcontractor_id: "subA", status: "paid" },
    { id: "b2", subcontractor_id: "subB", status: "partially_paid" },
    // supplier bill — subcontractor_id null, must NEVER appear on T5018
    { id: "b3", subcontractor_id: null, status: "paid" },
    // void sub bill — its payments must be excluded
    { id: "b4", subcontractor_id: "subA", status: "void" },
  ];
  s.payments = [];
});

describe("getT5018Report — the PAID basis + year boundaries", () => {
  it("sums payments inside the calendar year; Dec 31 in, Jan 1 out", async () => {
    s.payments = [
      { bill_id: "b1", amount: 1000, paid_at: "2025-12-31" }, // last day of 2025
      { bill_id: "b1", amount: 400, paid_at: "2026-01-01" }, // first day of 2026
      { bill_id: "b1", amount: 250, paid_at: "2025-06-15" },
    ];
    const r2025 = await getT5018Report(2025);
    const r2026 = await getT5018Report(2026);
    expect(r2025.rows[0].total_paid).toBe(1250); // 1000 + 250, NOT the Jan 1 payment
    expect(r2025.period).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(r2026.rows[0].total_paid).toBe(400);
    // payment metadata
    expect(r2025.rows[0].first_payment).toBe("2025-06-15");
    expect(r2025.rows[0].last_payment).toBe("2025-12-31");
    expect(r2025.rows[0].payment_count).toBe(2);
  });

  it("counts ONLY sub-attributed bills — supplier-bill payments are excluded (over-report guard)", async () => {
    s.payments = [
      { bill_id: "b1", amount: 600, paid_at: "2025-05-01" },
      // a big payment on a SUPPLIER bill in the same year
      { bill_id: "b3", amount: 99999, paid_at: "2025-05-01" },
    ];
    const r = await getT5018Report(2025);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].subcontractor_id).toBe("subA");
    expect(r.rows[0].total_paid).toBe(600);
    expect(r.totals.total_paid).toBe(600); // the 99999 never leaks in
  });

  it("excludes payments against void bills", async () => {
    s.payments = [
      { bill_id: "b1", amount: 600, paid_at: "2025-05-01" },
      { bill_id: "b4", amount: 5000, paid_at: "2025-05-01" }, // void bill
    ];
    const r = await getT5018Report(2025);
    expect(r.rows[0].total_paid).toBe(600);
  });

  it("subs with zero payments in the year are absent", async () => {
    s.payments = [{ bill_id: "b1", amount: 600, paid_at: "2025-05-01" }];
    const r = await getT5018Report(2025);
    expect(r.rows.some((x) => x.subcontractor_id === "subB")).toBe(false);
    expect(r.totals.subcontractor_count).toBe(1);
  });
});

describe("getT5018Report — flags", () => {
  it("below_threshold at 499.99 / 500.00 / 500.01 (constant = $500)", async () => {
    expect(T5018_THRESHOLD).toBe(500);
    for (const [amt, below] of [
      [499.99, true],
      [500.0, false],
      [500.01, false],
    ] as const) {
      s.payments = [{ bill_id: "b1", amount: amt, paid_at: "2025-05-01" }];
      const r = await getT5018Report(2025);
      expect(r.rows[0].below_threshold).toBe(below);
    }
  });

  it("missing_business_number flags the row and the totals counter", async () => {
    s.payments = [
      { bill_id: "b1", amount: 1000, paid_at: "2025-05-01" }, // subA has a BN
      { bill_id: "b2", amount: 800, paid_at: "2025-05-01" }, // subB has none
    ];
    const r = await getT5018Report(2025);
    const a = r.rows.find((x) => x.subcontractor_id === "subA")!;
    const b = r.rows.find((x) => x.subcontractor_id === "subB")!;
    expect(a.missing_business_number).toBe(false);
    expect(b.missing_business_number).toBe(true);
    expect(r.totals.rows_missing_business_number).toBe(1);
  });

  it("name falls back: legal_name when present, else operating name", async () => {
    s.payments = [
      { bill_id: "b1", amount: 1000, paid_at: "2025-05-01" },
      { bill_id: "b2", amount: 800, paid_at: "2025-05-01" },
    ];
    const r = await getT5018Report(2025);
    expect(r.rows.find((x) => x.subcontractor_id === "subA")!.name).toBe("Ace Electric Ltd.");
    expect(r.rows.find((x) => x.subcontractor_id === "subB")!.name).toBe("Bolt Mechanical");
  });
});

describe("getT5018YearsAvailable", () => {
  it("returns only years with sub payment activity, newest first", async () => {
    s.payments = [
      { bill_id: "b1", amount: 100, paid_at: "2024-03-01" },
      { bill_id: "b2", amount: 100, paid_at: "2026-07-01" },
      { bill_id: "b3", amount: 100, paid_at: "2023-01-01" }, // supplier bill — no year
      { bill_id: "b1", amount: 100, paid_at: "2024-11-01" }, // dup year
    ];
    expect(await getT5018YearsAvailable()).toEqual([2026, 2024]);
  });

  it("empty with no activity", async () => {
    expect(await getT5018YearsAvailable()).toEqual([]);
  });
});

describe("getSubPaymentYearTotals (6b)", () => {
  it("splits this-year vs last-year for one sub", async () => {
    s.payments = [
      { bill_id: "b1", amount: 300, paid_at: "2026-02-01" },
      { bill_id: "b1", amount: 200, paid_at: "2025-09-01" },
      { bill_id: "b1", amount: 100, paid_at: "2024-01-01" }, // outside window
    ];
    const t = await getSubPaymentYearTotals("subA", 2026);
    expect(t).toEqual({ this_year: 300, last_year: 200 });
  });
});

describe("buildT5018Csv", () => {
  it("header + one quoted row per payee", async () => {
    s.subs = [{ ...SUB_A, legal_name: 'Ace "The Best" Ltd.' }, SUB_B];
    s.payments = [{ bill_id: "b1", amount: 1234.5, paid_at: "2025-05-01" }];
    const csv = buildT5018Csv(await getT5018Report(2025));
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2); // header + 1 payee
    expect(lines[0]).toContain("Legal name,Business number,GST/HST number");
    expect(lines[0]).toContain("Below $500 threshold,Missing business number");
    // quotes escaped, amount fixed to 2dp, flags rendered
    expect(lines[1]).toContain('"Ace ""The Best"" Ltd."');
    expect(lines[1]).toContain("1234.50");
    expect(lines[1]).toContain("no,no");
  });
});
