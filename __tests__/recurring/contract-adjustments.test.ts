// RECUR-2 — cancellation credits as applied (open → non-cash settlement; draft →
// negative line; paid → refund due), and late-fee approval (its own tax-exempt
// invoice, issued; a double approval is refused; failure rolls the claim back).

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  contract: null as Record<string, unknown> | null,
  periods: [] as Record<string, unknown>[],
  payments: [] as { invoice_id: string; amount: number }[],
  credited: [] as { period_start: string }[],
  feeClaim: null as Record<string, unknown> | null,
  writes: [] as ChainCtx[],
  applyCredit: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
  addLine: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
  oneOff: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ id: "inv-fee" })),
  issue: vi.fn<(id: string) => Promise<{ id: string }>>(async (id: string) => ({ id })),
  activity: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => {}),
}));

vi.mock("@/lib/supabase/server", async () => {
  const { makeSupabaseMock } = await import("../helpers/supabaseChainMock");
  return {
    createClient: async () =>
      makeSupabaseMock((ctx) => {
        if (ctx.op !== "select") h.writes.push({ ...ctx, filters: [...ctx.filters] });
        if (ctx.table === "service_contracts") return { data: h.contract, error: null };
        if (ctx.table === "service_contract_invoices") return { data: h.periods, error: null };
        if (ctx.table === "invoice_payments") return { data: h.payments, error: null };
        if (ctx.table === "service_contract_credits") {
          if (ctx.op === "insert") return { data: { id: "cr-1", ...(ctx.payload as object) }, error: null };
          return { data: h.credited, error: null };
        }
        if (ctx.table === "service_contract_late_fees") {
          if (ctx.op === "update") {
            const p = ctx.payload as { status?: string };
            if (p.status === "approved" || p.status === "waived") return { data: h.feeClaim, error: null };
            return { data: { ...(h.feeClaim ?? {}), ...(ctx.payload as object) }, error: null };
          }
        }
        return { data: null, error: null };
      }),
  };
});
vi.mock("@/lib/api/invoices", () => ({
  applyContractCreditToInvoice: h.applyCredit,
  addManualLine: h.addLine,
  createOneOffInvoice: h.oneOff,
  issueInvoice: h.issue,
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.activity }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  businessDateISO: () => "2026-10-20",
}));

import {
  approveLateFee,
  cancelContractWithCredits,
  previewCancellation,
  waiveLateFee,
} from "@/lib/api/contract-adjustments";

const period = (status: string, over: Record<string, unknown> = {}) => ({
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  invoice: {
    id: `inv-${status}`,
    invoice_number: status === "draft" ? null : "NG-0101",
    status,
    subtotal: 85,
    tax_rate: 13,
    tax_exempt: false,
    amount_due: 96.05,
  },
  ...over,
});

beforeEach(() => {
  h.contract = {
    id: "c1",
    name: "Fire monitoring",
    client_id: "cli-1",
    site_id: "site-1",
    opco: "guardian",
    status: "active",
    start_date: "2026-01-01",
    billing_timing: "advance",
    tax_rate: 13,
    payment_terms_days: 30,
    late_fee_grace_days: 5,
    cancelled_effective_date: null,
  };
  h.periods = [period("sent")];
  h.payments = [];
  h.credited = [];
  h.writes = [];
  for (const m of [h.applyCredit, h.addLine, h.oneOff, h.issue, h.activity]) m.mockClear();
});

describe("cancellation credits — applied", () => {
  it("stops billing and settles an open invoice with a non-cash credit", async () => {
    const r = await cancelContractWithCredits("c1", "2026-10-10", "u-ops");
    const status = h.writes.find((w) => w.table === "service_contracts" && w.op === "update")?.payload;
    expect(status).toMatchObject({
      status: "cancelled",
      end_date: "2026-10-10",
      cancelled_effective_date: "2026-10-10",
      next_billing_date: null,
    });
    const credit = h.writes.find((w) => w.table === "service_contract_credits")?.payload as Record<string, number>;
    expect(credit).toMatchObject({
      days_in_period: 31,
      days_used: 10,
      credit_subtotal: 57.58,
      credit_tax: 7.49,
      credit_total: 65.07,
      applied_amount: 65.07,
      refund_due: 0,
    });
    expect(h.applyCredit).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: "inv-sent", amount: 65.07, creditId: "cr-1" })
    );
    expect(r.totals.total).toBe(65.07);
    // §5 — status change + credit each audited
    expect(h.activity.mock.calls.map((c) => Object.keys(c[3] as object))).toEqual([
      ["status", "last_day_of_service"],
      ["cancellation_credit"],
    ]);
  });

  it("takes the credit off a draft as a negative line (not yet issued)", async () => {
    h.periods = [period("draft")];
    await cancelContractWithCredits("c1", "2026-10-10", "u-ops");
    expect(h.addLine).toHaveBeenCalledWith("inv-draft", expect.objectContaining({ unit_price: -57.58 }));
    expect(h.applyCredit).not.toHaveBeenCalled();
  });

  it("records a refund due for a paid invoice and never touches it", async () => {
    h.periods = [period("paid")];
    h.payments = [{ invoice_id: "inv-paid", amount: 96.05 }];
    const r = await cancelContractWithCredits("c1", "2026-10-10", "u-ops");
    expect(r.totals.refundDue).toBe(65.07);
    expect(h.applyCredit).not.toHaveBeenCalled();
    expect(h.addLine).not.toHaveBeenCalled();
  });

  it("is retry-safe: an already-credited period is skipped", async () => {
    h.credited = [{ period_start: "2026-10-01" }];
    const p = await previewCancellation("c1", "2026-10-10");
    expect(p.credits).toEqual([]);
  });

  it("refuses a future last day of service, and one before the start", async () => {
    await expect(previewCancellation("c1", "2026-12-01")).rejects.toThrow(/future/);
    await expect(previewCancellation("c1", "2025-12-01")).rejects.toThrow(/before the contract started/);
  });

  it("explains arrears contracts (no automatic final invoice)", async () => {
    h.contract = { ...h.contract!, billing_timing: "arrears" };
    h.periods = [];
    const p = await previewCancellation("c1", "2026-10-10");
    expect(p.notes.join(" ")).toMatch(/arrears/);
  });
});

describe("late fees — approve / waive", () => {
  const claimed = {
    id: "fee-1",
    contract_id: "c1",
    source_invoice_id: "inv-1",
    block_index: 1,
    days_overdue: 6,
    basis_balance: 96.05,
    amount: 1.92,
    mode: "percent_monthly",
    rate_pct: 2,
    status: "approved",
    source: { invoice_number: "NG-0101" },
    fee: null,
    contract: { name: "Fire monitoring", client: { name: "Acme" } },
  };

  it("charges on its own tax-exempt invoice and issues it", async () => {
    h.feeClaim = claimed;
    const r = await approveLateFee("fee-1", "u-ops");
    expect(r.invoiceId).toBe("inv-fee");
    expect(h.oneOff).toHaveBeenCalledWith(
      expect.objectContaining({
        opco: "guardian",
        clientId: "cli-1",
        taxExempt: true,
        lines: [expect.objectContaining({ amount: 1.92 })],
      })
    );
    expect(h.issue).toHaveBeenCalledWith("inv-fee");
    // the claim is conditional on status = proposed (no double charge)
    const claim = h.writes.find((w) => w.table === "service_contract_late_fees" && w.op === "update");
    expect(claim!.filters).toContainEqual({ method: "eq", args: ["status", "proposed"] });
    expect(h.activity).toHaveBeenCalled();
  });

  it("refuses a fee that was already decided", async () => {
    h.feeClaim = null; // the conditional update matched nothing
    await expect(approveLateFee("fee-1", "u-ops")).rejects.toThrow(/already been approved or waived/);
    expect(h.oneOff).not.toHaveBeenCalled();
  });

  it("rolls the claim back if the fee invoice can't be created", async () => {
    h.feeClaim = claimed;
    h.oneOff.mockRejectedValueOnce(new Error("db down"));
    await expect(approveLateFee("fee-1", "u-ops")).rejects.toThrow(/db down/);
    const rollback = h.writes.filter((w) => w.table === "service_contract_late_fees" && w.op === "update").pop();
    expect(rollback!.payload).toMatchObject({ status: "proposed", decided_by: null });
  });

  it("waiving needs a reason", async () => {
    h.feeClaim = { ...claimed, status: "waived" };
    await expect(waiveLateFee("fee-1", "  ", "u-ops")).rejects.toThrow(/why/);
    await expect(waiveLateFee("fee-1", "Goodwill — first time late", "u-ops")).resolves.toBeTruthy();
  });
});
