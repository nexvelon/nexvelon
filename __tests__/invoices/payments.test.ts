// FIN-2 — the invoice payment ledger. recordPayment / deletePayment guard the
// invoice state, cap at the remaining balance (no overpayment in v1), and
// re-derive status from Σ payments. isOverdue is a pure derivation — no stored
// flag — so its truth table is asserted directly.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  invoice: { id: "inv1", status: "sent", amount_due: 100 } as Record<
    string,
    unknown
  > | null,
  payments: [] as Record<string, unknown>[],
  inserted: [] as unknown[],
  statusUpdates: [] as unknown[],
  deleted: [] as ChainCtx["filters"],
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "invoices") {
    if (ctx.op === "update") {
      s.statusUpdates.push(ctx.payload);
      return {
        data: { ...(s.invoice ?? {}), ...(ctx.payload as object) },
        error: null,
      };
    }
    return { data: s.invoice, error: null };
  }
  if (ctx.table === "invoice_payments") {
    // insert/delete mutate the seeded ledger so the follow-up read (and the
    // status re-derivation that depends on it) sees the real post-write state.
    if (ctx.op === "insert") {
      s.inserted.push(ctx.payload);
      const p = ctx.payload as Record<string, unknown>;
      s.payments = [
        ...s.payments,
        { id: `auto-${s.payments.length + 1}`, ...p },
      ];
      return { data: null, error: null };
    }
    if (ctx.op === "delete") {
      s.deleted.push(...ctx.filters);
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      s.payments = s.payments.filter((p) => p.id !== id);
      return { data: null, error: null };
    }
    // select — a single-row lookup (deletePayment) vs the list
    if (ctx.terminal === "maybeSingle") {
      const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
      const row = s.payments.find((p) => p.id === id) ?? null;
      return { data: row, error: null };
    }
    return { data: s.payments, error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => makeSupabaseMock(resolve),
}));

import {
  recordPayment,
  deletePayment,
  InvoicePaymentError,
} from "@/lib/api/invoices";
import { isOverdue, deriveStatusFromPayments } from "@/lib/invoice-status";

const BASE = {
  method: "cheque" as const,
  paidAt: "2026-07-20",
};

beforeEach(() => {
  s.invoice = { id: "inv1", status: "sent", amount_due: 100 };
  s.payments = [];
  s.inserted = [];
  s.statusUpdates = [];
  s.deleted = [];
});

describe("recordPayment — guards", () => {
  it("rejects a draft invoice with invalid_status", async () => {
    s.invoice = { id: "inv1", status: "draft", amount_due: 100 };
    await expect(
      recordPayment({ invoiceId: "inv1", amount: 50, ...BASE })
    ).rejects.toMatchObject({ code: "invalid_status" });
    expect(s.inserted).toHaveLength(0);
  });

  it("rejects a void invoice with invalid_status", async () => {
    s.invoice = { id: "inv1", status: "void", amount_due: 100 };
    await expect(
      recordPayment({ invoiceId: "inv1", amount: 50, ...BASE })
    ).rejects.toBeInstanceOf(InvoicePaymentError);
    expect(s.inserted).toHaveLength(0);
  });

  it("rejects a zero or negative amount", async () => {
    await expect(
      recordPayment({ invoiceId: "inv1", amount: 0, ...BASE })
    ).rejects.toMatchObject({ code: "invalid_amount" });
    await expect(
      recordPayment({ invoiceId: "inv1", amount: -5, ...BASE })
    ).rejects.toMatchObject({ code: "invalid_amount" });
    expect(s.inserted).toHaveLength(0);
  });

  it("rejects an amount above the remaining balance (no overpayment in v1)", async () => {
    s.payments = [{ id: "p1", amount: 60 }];
    // balance = 100 − 60 = 40
    await expect(
      recordPayment({ invoiceId: "inv1", amount: 40.01, ...BASE })
    ).rejects.toMatchObject({ code: "exceeds_balance" });
    expect(s.inserted).toHaveLength(0);
  });
});

describe("recordPayment — status derivation", () => {
  it("a partial payment moves sent → partially_paid", async () => {
    await recordPayment({ invoiceId: "inv1", amount: 40, ...BASE });
    expect(s.inserted).toHaveLength(1);
    expect(s.statusUpdates).toEqual([{ status: "partially_paid" }]);
  });

  it("a payment for the full balance moves sent → paid", async () => {
    await recordPayment({ invoiceId: "inv1", amount: 100, ...BASE });
    expect(s.statusUpdates).toEqual([{ status: "paid" }]);
  });

  it("two partials summing to the total end at paid", async () => {
    // first partial — the mock ledger keeps it
    await recordPayment({ invoiceId: "inv1", amount: 60, ...BASE });
    expect(s.statusUpdates).toEqual([{ status: "partially_paid" }]);

    // invoice is now partially_paid; second partial closes it out
    s.invoice = { id: "inv1", status: "partially_paid", amount_due: 100 };
    s.statusUpdates = [];

    await recordPayment({ invoiceId: "inv1", amount: 40, ...BASE });
    expect(s.statusUpdates).toEqual([{ status: "paid" }]);
    expect(s.payments).toHaveLength(2);
  });

  it("records the payment fields it was given", async () => {
    await recordPayment({
      invoiceId: "inv1",
      amount: 25,
      method: "e_transfer",
      paidAt: "2026-07-19",
      reference: "ETR-99",
      notes: "deposit",
      actorId: "u1",
    });
    expect(s.inserted[0]).toMatchObject({
      invoice_id: "inv1",
      amount: 25,
      method: "e_transfer",
      paid_at: "2026-07-19",
      reference: "ETR-99",
      notes: "deposit",
      created_by: "u1",
    });
  });
});

describe("deletePayment — status re-derivation", () => {
  it("paid → partially_paid when one of two payments is removed", async () => {
    s.invoice = { id: "inv1", status: "paid", amount_due: 100 };
    s.payments = [
      { id: "p1", invoice_id: "inv1", amount: 60 },
      { id: "p2", invoice_id: "inv1", amount: 40 },
    ];
    await deletePayment("p2");
    expect(s.statusUpdates).toEqual([{ status: "partially_paid" }]);
    expect(s.payments).toHaveLength(1);
  });

  it("removing the last payment returns the invoice to sent", async () => {
    s.invoice = { id: "inv1", status: "partially_paid", amount_due: 100 };
    s.payments = [{ id: "p1", invoice_id: "inv1", amount: 40 }];
    await deletePayment("p1");
    expect(s.statusUpdates).toEqual([{ status: "sent" }]);
    expect(s.payments).toHaveLength(0);
  });

  it("is blocked on a void invoice", async () => {
    s.invoice = { id: "inv1", status: "void", amount_due: 100 };
    s.payments = [{ id: "p1", invoice_id: "inv1", amount: 40 }];
    await expect(deletePayment("p1")).rejects.toMatchObject({
      code: "invalid_status",
    });
    expect(s.deleted).toHaveLength(0);
  });
});

describe("deriveStatusFromPayments", () => {
  it("maps sums to states with a half-cent tolerance", () => {
    expect(deriveStatusFromPayments(100, 0)).toBe("sent");
    expect(deriveStatusFromPayments(100, 40)).toBe("partially_paid");
    expect(deriveStatusFromPayments(100, 100)).toBe("paid");
    expect(deriveStatusFromPayments(100, 99.999)).toBe("paid"); // tolerance
    expect(deriveStatusFromPayments(100, 99.9)).toBe("partially_paid");
  });
});

describe("isOverdue truth table", () => {
  const now = new Date("2026-07-20T12:00:00Z");

  it("no due date → never overdue", () => {
    expect(isOverdue({ status: "sent", due_date: null }, now)).toBe(false);
  });

  it("future due date → not overdue", () => {
    expect(isOverdue({ status: "sent", due_date: "2026-08-01" }, now)).toBe(false);
  });

  it("past due date on an open invoice → overdue", () => {
    expect(isOverdue({ status: "sent", due_date: "2026-07-19" }, now)).toBe(true);
    expect(
      isOverdue({ status: "partially_paid", due_date: "2026-07-19" }, now)
    ).toBe(true);
  });

  it("past due date but already paid / void / draft → not overdue", () => {
    expect(isOverdue({ status: "paid", due_date: "2026-01-01" }, now)).toBe(false);
    expect(isOverdue({ status: "void", due_date: "2026-01-01" }, now)).toBe(false);
    expect(isOverdue({ status: "draft", due_date: "2026-01-01" }, now)).toBe(false);
  });

  it("due today is not yet overdue", () => {
    expect(isOverdue({ status: "sent", due_date: "2026-07-20" }, now)).toBe(false);
  });
});
