// FIN-5 — vendor bills (AP). Mirrors the FIN-2 invoice-payment tests: guards on
// creation (PO status, arithmetic), then the payment ledger driving the bill's
// derived status, then void protection.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  pos: [] as Record<string, unknown>[],
  bills: [] as Record<string, unknown>[],
  payments: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  statusUpdates: [] as unknown[],
  seq: 0,
}));

function filterRows(
  rows: Record<string, unknown>[],
  filters: ChainCtx["filters"]
): Record<string, unknown>[] {
  let out = rows;
  for (const f of filters) {
    const [col, val] = f.args as [string, unknown];
    if (f.method === "eq") out = out.filter((r) => r[col] === val);
    if (f.method === "in") out = out.filter((r) => (val as unknown[]).includes(r[col]));
    if (f.method === "neq") out = out.filter((r) => r[col] !== val);
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";

  switch (ctx.table) {
    case "purchase_orders": {
      const rows = filterRows(s.pos, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "vendor_bills": {
      if (ctx.op === "insert") {
        const p = ctx.payload as Record<string, unknown>;
        const row = { id: `bill-${++s.seq}`, ...p };
        s.bills = [...s.bills, row];
        s.inserted.push(p);
        return { data: row, error: null };
      }
      if (ctx.op === "update") {
        const p = ctx.payload as Record<string, unknown>;
        if ("status" in p) s.statusUpdates.push({ status: p.status });
        const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
        s.bills = s.bills.map((b) => (b.id === id ? { ...b, ...p } : b));
        return { data: s.bills.find((b) => b.id === id) ?? null, error: null };
      }
      const rows = filterRows(s.bills, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "bill_payments": {
      if (ctx.op === "insert") {
        const p = ctx.payload as Record<string, unknown>;
        s.payments = [...s.payments, { id: `pay-${++s.seq}`, ...p }];
        return { data: null, error: null };
      }
      if (ctx.op === "delete") {
        const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
        s.payments = s.payments.filter((p) => p.id !== id);
        return { data: null, error: null };
      }
      const rows = filterRows(s.payments, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn(async () => {}) }));

import {
  createBill,
  voidBill,
  recordBillPayment,
  deleteBillPayment,
  deriveBillStatus,
  BillError,
} from "@/lib/api/vendor-bills";

const BASE = {
  vendorId: "v1",
  billNumber: "VB-100",
  billDate: "2026-07-01",
  subtotal: 100,
  taxAmount: 13,
  total: 113,
};

beforeEach(() => {
  s.pos = [
    {
      id: "po1",
      status: "received",
      project_id: "proj1",
      job_id: "job1",
    },
  ];
  s.bills = [];
  s.payments = [];
  s.inserted = [];
  s.statusUpdates = [];
  s.seq = 0;
});

describe("createBill", () => {
  it("inherits project + job attribution from the linked PO", async () => {
    await createBill({ ...BASE, purchaseOrderId: "po1" });
    expect(s.inserted[0]).toMatchObject({
      purchase_order_id: "po1",
      project_id: "proj1",
      job_id: "job1",
      status: "received",
      subtotal: 100,
      tax_amount: 13,
      total: 113,
    });
  });

  it("keeps an explicit attribution over the PO's", async () => {
    await createBill({
      ...BASE,
      purchaseOrderId: "po1",
      projectId: "projX",
      jobId: "jobX",
    });
    expect(s.inserted[0]).toMatchObject({
      project_id: "projX",
      job_id: "jobX",
    });
  });

  it("rejects a PO that hasn't been issued", async () => {
    s.pos = [{ id: "po1", status: "draft", project_id: null, job_id: null }];
    await expect(
      createBill({ ...BASE, purchaseOrderId: "po1" })
    ).rejects.toMatchObject({ code: "po_not_issued" });
    expect(s.inserted).toHaveLength(0);
  });

  it("accepts a cancelled-PO bill only via an explicit guard failure", async () => {
    s.pos = [{ id: "po1", status: "cancelled", project_id: null, job_id: null }];
    await expect(
      createBill({ ...BASE, purchaseOrderId: "po1" })
    ).rejects.toBeInstanceOf(BillError);
  });

  it("rejects a header whose subtotal + tax doesn't equal the total", async () => {
    await expect(
      createBill({ ...BASE, total: 120 })
    ).rejects.toMatchObject({ code: "total_mismatch" });
    expect(s.inserted).toHaveLength(0);
  });

  it("allows a standalone bill with no PO", async () => {
    await createBill({ ...BASE });
    expect(s.inserted[0]).toMatchObject({
      purchase_order_id: null,
      project_id: null,
      job_id: null,
    });
  });

  it("rejects a job-attributed bill with no project", async () => {
    await expect(
      createBill({ ...BASE, jobId: "job1" })
    ).rejects.toBeInstanceOf(BillError);
  });
});

describe("recordBillPayment", () => {
  beforeEach(async () => {
    await createBill({ ...BASE, purchaseOrderId: "po1" });
  });

  it("rejects a payment on a void bill", async () => {
    s.bills = s.bills.map((b) => ({ ...b, status: "void" }));
    await expect(
      recordBillPayment({
        billId: "bill-1",
        amount: 10,
        method: "eft",
        paidAt: "2026-07-05",
      })
    ).rejects.toMatchObject({ code: "invalid_status" });
  });

  it("rejects more than the remaining balance", async () => {
    await expect(
      recordBillPayment({
        billId: "bill-1",
        amount: 113.01,
        method: "eft",
        paidAt: "2026-07-05",
      })
    ).rejects.toMatchObject({ code: "exceeds_balance" });
  });

  it("a partial payment moves received → partially_paid", async () => {
    await recordBillPayment({
      billId: "bill-1",
      amount: 50,
      method: "cheque",
      paidAt: "2026-07-05",
    });
    expect(s.statusUpdates).toEqual([{ status: "partially_paid" }]);
  });

  it("paying the balance in full moves it to paid", async () => {
    await recordBillPayment({
      billId: "bill-1",
      amount: 113,
      method: "eft",
      paidAt: "2026-07-05",
    });
    expect(s.statusUpdates).toEqual([{ status: "paid" }]);
  });

  it("two partials summing to the total end at paid", async () => {
    await recordBillPayment({
      billId: "bill-1",
      amount: 60,
      method: "eft",
      paidAt: "2026-07-05",
    });
    await recordBillPayment({
      billId: "bill-1",
      amount: 53,
      method: "eft",
      paidAt: "2026-07-09",
    });
    expect(s.statusUpdates).toEqual([
      { status: "partially_paid" },
      { status: "paid" },
    ]);
  });
});

describe("deleteBillPayment", () => {
  it("re-derives the status back down", async () => {
    await createBill({ ...BASE, purchaseOrderId: "po1" });
    await recordBillPayment({
      billId: "bill-1",
      amount: 113,
      method: "eft",
      paidAt: "2026-07-05",
    });
    expect(s.statusUpdates).toEqual([{ status: "paid" }]);
    s.statusUpdates = [];

    const payId = s.payments[0].id as string;
    await deleteBillPayment(payId);
    expect(s.payments).toHaveLength(0);
    expect(s.statusUpdates).toEqual([{ status: "received" }]);
  });
});

describe("voidBill", () => {
  it("voids a bill with no payments", async () => {
    await createBill({ ...BASE });
    const res = await voidBill("bill-1");
    expect(res.status).toBe("void");
  });

  it("is blocked once a payment exists", async () => {
    await createBill({ ...BASE });
    await recordBillPayment({
      billId: "bill-1",
      amount: 10,
      method: "cash",
      paidAt: "2026-07-05",
    });
    await expect(voidBill("bill-1")).rejects.toMatchObject({
      code: "has_payments",
    });
  });
});

describe("deriveBillStatus", () => {
  it("mirrors the invoice rule, half-cent tolerance included", () => {
    expect(deriveBillStatus(100, 0)).toBe("received");
    expect(deriveBillStatus(100, 40)).toBe("partially_paid");
    expect(deriveBillStatus(100, 100)).toBe("paid");
    expect(deriveBillStatus(100, 99.999)).toBe("paid");
    expect(deriveBillStatus(100, 99.9)).toBe("partially_paid");
  });
});

// FIN-7 — claimable ITC + standalone opco on bill creation.
describe("createBill — claimable ITC (FIN-7)", () => {
  it("defaults claimable to the full tax when not specified", async () => {
    await createBill({ ...BASE });
    expect(s.inserted[0]).toMatchObject({ tax_amount: 13, claimable_tax_amount: 13 });
  });

  it("accepts a reduced claimable for a partial-ITC bill", async () => {
    await createBill({ ...BASE, claimableTaxAmount: 6.5 });
    expect(s.inserted[0]).toMatchObject({ claimable_tax_amount: 6.5 });
  });

  it("clamps a claimable above the tax charged (can't over-claim)", async () => {
    await createBill({ ...BASE, claimableTaxAmount: 99 });
    expect(s.inserted[0]).toMatchObject({ claimable_tax_amount: 13 });
  });

  it("clamps a negative claimable to zero", async () => {
    await createBill({ ...BASE, claimableTaxAmount: -5 });
    expect(s.inserted[0]).toMatchObject({ claimable_tax_amount: 0 });
  });

  it("stores opco on a standalone bill", async () => {
    await createBill({ ...BASE, opco: "guardian" });
    expect(s.inserted[0]).toMatchObject({ project_id: null, opco: "guardian" });
  });

  it("leaves opco NULL on a project-linked bill — the project owns it", async () => {
    await createBill({ ...BASE, purchaseOrderId: "po1", opco: "guardian" });
    expect(s.inserted[0]).toMatchObject({ project_id: "proj1", opco: null });
  });
});
