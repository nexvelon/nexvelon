// FIN-3 — the AR aging engine. Pure helpers (agingDays / agingBucket) are
// asserted against a fixed "today"; the DB-backed reads seed invoices at known
// offsets from the real business date so no test-only clock injection is
// needed. Balances come from the FIN-2 payment ledger, so partial payments must
// shrink the bucket they land in rather than the invoice's face value.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  invoices: [] as Record<string, unknown>[],
  payments: [] as Record<string, unknown>[],
  client: { id: "c1", name: "Acme" } as Record<string, unknown> | null,
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
  if (ctx.table === "invoices") {
    return { data: applyFilters(s.invoices, ctx.filters), error: null };
  }
  if (ctx.table === "invoice_payments") {
    return { data: applyFilters(s.payments, ctx.filters), error: null };
  }
  if (ctx.table === "clients") {
    return { data: s.client, error: null };
  }
  return { data: [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));

import {
  agingDays,
  agingBucket,
  getArAgingSummary,
  getArAgingByClient,
  getClientStatement,
  buildArAgingCsv,
} from "@/lib/api/ar-aging";
import { businessDateISO } from "@/lib/format";

/** A yyyy-mm-dd `n` days before the business "today" the engine will use. */
function daysAgo(n: number): string {
  const today = businessDateISO();
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - n * 86_400_000);
  return t.toISOString().slice(0, 10);
}

beforeEach(() => {
  s.invoices = [];
  s.payments = [];
  s.client = { id: "c1", name: "Acme" };
});

describe("agingDays", () => {
  const today = "2026-07-20";

  it("ages from due_date when one is set", () => {
    expect(
      agingDays({ due_date: "2026-07-10", issue_date: "2026-06-01" }, today)
    ).toBe(10);
  });

  it("falls back to issue_date when there is no due date", () => {
    expect(agingDays({ due_date: null, issue_date: "2026-07-05" }, today)).toBe(15);
  });

  it("is negative before the due date (not yet due)", () => {
    expect(
      agingDays({ due_date: "2026-08-01", issue_date: "2026-07-01" }, today)
    ).toBe(-12);
  });

  it("returns 0 when the invoice carries neither date", () => {
    expect(agingDays({ due_date: null, issue_date: null }, today)).toBe(0);
  });
});

describe("agingBucket boundaries", () => {
  it("maps each boundary to the right bucket", () => {
    expect(agingBucket(-5)).toBe("current");
    expect(agingBucket(0)).toBe("current");
    expect(agingBucket(1)).toBe("1_30");
    expect(agingBucket(30)).toBe("1_30");
    expect(agingBucket(31)).toBe("31_60");
    expect(agingBucket(60)).toBe("31_60");
    expect(agingBucket(61)).toBe("61_90");
    expect(agingBucket(90)).toBe("61_90");
    expect(agingBucket(91)).toBe("90_plus");
  });
});

describe("getArAgingSummary", () => {
  it("buckets open balances and excludes draft / paid / void", async () => {
    s.invoices = [
      // not yet due → current
      { id: "i1", client_id: "c1", status: "sent", amount_due: 100, issue_date: daysAgo(5), due_date: daysAgo(-10) },
      // 10 days past due → 1_30
      { id: "i2", client_id: "c1", status: "sent", amount_due: 200, issue_date: daysAgo(40), due_date: daysAgo(10) },
      // 45 days past due → 31_60
      { id: "i3", client_id: "c1", status: "sent", amount_due: 300, issue_date: daysAgo(75), due_date: daysAgo(45) },
      // 120 days past due → 90_plus
      { id: "i4", client_id: "c1", status: "sent", amount_due: 400, issue_date: daysAgo(150), due_date: daysAgo(120) },
      // excluded entirely
      { id: "i5", client_id: "c1", status: "draft", amount_due: 999, issue_date: null, due_date: null },
      { id: "i6", client_id: "c1", status: "paid", amount_due: 999, issue_date: daysAgo(200), due_date: daysAgo(170) },
      { id: "i7", client_id: "c1", status: "void", amount_due: 999, issue_date: daysAgo(200), due_date: daysAgo(170) },
    ];
    const sum = await getArAgingSummary();
    expect(sum.buckets).toEqual({
      current: 100,
      d1_30: 200,
      d31_60: 300,
      d61_90: 0,
      d90_plus: 400,
    });
    expect(sum.total).toBe(1000);
    expect(sum.overdueTotal).toBe(900); // everything except `current`
    expect(sum.asOf).toBe(businessDateISO());
  });

  it("a partial payment reduces the bucket its invoice lands in", async () => {
    s.invoices = [
      { id: "i1", client_id: "c1", status: "partially_paid", amount_due: 500, issue_date: daysAgo(60), due_date: daysAgo(40) },
    ];
    s.payments = [{ invoice_id: "i1", amount: 150 }];
    const sum = await getArAgingSummary();
    expect(sum.buckets.d31_60).toBe(350); // 500 − 150, aged at 40 days
    expect(sum.total).toBe(350);
  });

  it("drops invoices whose payments fully cover the balance", async () => {
    s.invoices = [
      { id: "i1", client_id: "c1", status: "partially_paid", amount_due: 100, issue_date: daysAgo(60), due_date: daysAgo(40) },
    ];
    s.payments = [{ invoice_id: "i1", amount: 100 }];
    const sum = await getArAgingSummary();
    expect(sum.total).toBe(0);
    expect(sum.buckets.d31_60).toBe(0);
  });

  it("ages from issue_date when an invoice has no due date", async () => {
    s.invoices = [
      { id: "i1", client_id: "c1", status: "sent", amount_due: 250, issue_date: daysAgo(70), due_date: null },
    ];
    const sum = await getArAgingSummary();
    expect(sum.buckets.d61_90).toBe(250);
  });
});

describe("getArAgingByClient", () => {
  it("aggregates a client across buckets and tracks the oldest invoice", async () => {
    s.invoices = [
      { id: "i1", client_id: "c1", status: "sent", amount_due: 100, issue_date: daysAgo(20), due_date: daysAgo(10), client: { name: "Acme" } },
      { id: "i2", client_id: "c1", status: "sent", amount_due: 200, issue_date: daysAgo(130), due_date: daysAgo(100), client: { name: "Acme" } },
      { id: "i3", client_id: "c2", status: "sent", amount_due: 50, issue_date: daysAgo(10), due_date: daysAgo(2), client: { name: "Beta" } },
    ];
    const rows = await getArAgingByClient();
    expect(rows).toHaveLength(2);
    // ordered by total DESC — c1 (300) before c2 (50)
    expect(rows[0]).toMatchObject({
      client_id: "c1",
      client_name: "Acme",
      d1_30: 100,
      d90_plus: 200,
      total: 300,
      oldest_days: 100,
    });
    expect(rows[1]).toMatchObject({
      client_id: "c2",
      client_name: "Beta",
      total: 50,
      oldest_days: 2,
    });
  });
});

describe("getClientStatement", () => {
  it("lists issued invoices and reconciles invoiced − holdback − paid = balance", async () => {
    s.invoices = [
      {
        id: "i1", client_id: "c1", status: "partially_paid",
        invoice_number: "NIS-1", issue_date: daysAgo(40), due_date: daysAgo(10),
        total: 1130, amount_due: 1030, holdback_amount: 100,
      },
      {
        id: "i2", client_id: "c1", status: "paid",
        invoice_number: "NIS-2", issue_date: daysAgo(80), due_date: daysAgo(50),
        total: 500, amount_due: 500, holdback_amount: 0,
      },
      // draft + void never appear on a customer-facing statement
      { id: "i3", client_id: "c1", status: "draft", invoice_number: null, issue_date: null, due_date: null, total: 999, amount_due: 999, holdback_amount: 0 },
      { id: "i4", client_id: "c1", status: "void", invoice_number: "NIS-3", issue_date: daysAgo(5), due_date: null, total: 777, amount_due: 777, holdback_amount: 0 },
    ];
    s.payments = [
      { invoice_id: "i1", amount: 400 },
      { invoice_id: "i2", amount: 500 },
    ];

    const stmt = await getClientStatement("c1");
    expect(stmt).not.toBeNull();
    if (!stmt) return;

    expect(stmt.client_name).toBe("Acme");
    expect(stmt.lines).toHaveLength(2); // draft + void excluded
    expect(stmt.lines.map((l) => l.invoice_number)).toEqual(["NIS-1", "NIS-2"]);

    // i1: 1030 due − 400 paid = 630 outstanding, aged 10 days → 1_30
    const first = stmt.lines[0];
    expect(first.balance).toBe(630);
    expect(first.paid).toBe(400);
    expect(first.bucket).toBe("1_30");
    // i2 fully settled
    expect(stmt.lines[1].balance).toBe(0);

    expect(stmt.totals).toEqual({
      invoiced: 1630, // 1130 + 500
      holdback: 100,
      paid: 900, // 400 + 500
      balance: 630,
    });
    // the identity the statement footer prints
    expect(
      stmt.totals.invoiced - stmt.totals.holdback - stmt.totals.paid
    ).toBe(stmt.totals.balance);
  });

  it("returns null for a client that doesn't exist", async () => {
    s.client = null;
    expect(await getClientStatement("nope")).toBeNull();
  });
});

describe("buildArAgingCsv", () => {
  it("emits a header plus one row per open invoice with a balance", async () => {
    s.invoices = [
      { id: "i1", client_id: "c1", status: "sent", invoice_number: "NIS-1", issue_date: daysAgo(40), due_date: daysAgo(10), total: 226, amount_due: 226, client: { name: "Acme" } },
      { id: "i2", client_id: "c2", status: "sent", invoice_number: "NIS-2", issue_date: daysAgo(120), due_date: daysAgo(95), total: 100, amount_due: 100, client: { name: "Beta" } },
      // fully covered → omitted
      { id: "i3", client_id: "c1", status: "partially_paid", invoice_number: "NIS-3", issue_date: daysAgo(5), due_date: daysAgo(1), total: 50, amount_due: 50, client: { name: "Acme" } },
    ];
    s.payments = [{ invoice_id: "i3", amount: 50 }];

    const csv = await buildArAgingCsv();
    const rows = csv.split("\r\n");
    expect(rows[0]).toBe(
      "Client,Invoice,Issue date,Due date,Total,Paid,Balance,Days past due,Bucket"
    );
    expect(rows).toHaveLength(3); // header + 2 open invoices
    // sorted oldest-first
    expect(rows[1]).toContain("Beta");
    expect(rows[1]).toContain("90+");
    expect(rows[2]).toContain("Acme");
    expect(rows[2]).toContain("226.00");
  });

  it("quotes fields containing commas", async () => {
    s.invoices = [
      { id: "i1", client_id: "c1", status: "sent", invoice_number: "NIS-1", issue_date: daysAgo(10), due_date: daysAgo(5), total: 10, amount_due: 10, client: { name: "Acme, Inc." } },
    ];
    const csv = await buildArAgingCsv();
    expect(csv.split("\r\n")[1]).toContain('"Acme, Inc."');
  });
});
