// RECUR-2 — the daily late-fee PROPOSAL job: only opted-in contracts, only open
// past-due contract invoices, basis = outstanding balance, idempotent per block,
// audited, and never charges (rows are 'proposed').

import { describe, it, expect, beforeEach } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";
import { proposeDueLateFees } from "@/lib/recurring/late-fee-job";

let contracts: Record<string, unknown>[] = [];
let links: { invoice: Record<string, unknown> | null }[] = [];
let payments: { invoice_id: string; amount: number }[] = [];
let existingFees: { source_invoice_id: string; block_index: number }[] = [];
let inserts: ChainCtx[] = [];

function client() {
  return makeSupabaseMock((ctx) => {
    if (ctx.op === "insert") {
      inserts.push(ctx);
      return { data: null, error: null };
    }
    if (ctx.table === "service_contracts") return { data: contracts, error: null };
    if (ctx.table === "service_contract_invoices") return { data: links, error: null };
    if (ctx.table === "invoice_payments") return { data: payments, error: null };
    if (ctx.table === "service_contract_late_fees") return { data: existingFees, error: null };
    return { data: null, error: null };
  });
}

const contract = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  name: "Fire monitoring — 200 King St",
  client_id: "cli-1",
  late_fee_mode: "percent_monthly",
  late_fee_monthly_pct: 2,
  late_fee_flat_amount: null,
  late_fee_grace_days: 5,
  ...over,
});

const invoice = (over: Record<string, unknown> = {}) => ({
  id: "inv-1",
  invoice_number: "NG-0101",
  status: "sent",
  due_date: "2026-10-31",
  amount_due: 96.05,
  ...over,
});

const feeRows = () =>
  inserts.filter((i) => i.table === "service_contract_late_fees").map((i) => i.payload as Record<string, unknown>);

beforeEach(() => {
  contracts = [contract()];
  links = [{ invoice: invoice() }];
  payments = [];
  existingFees = [];
  inserts = [];
});

describe("late-fee proposals", () => {
  it("proposes block 1 at 2% of the outstanding balance once past grace", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await proposeDueLateFees(client() as any, { asOf: "2026-11-06" });
    expect(r.proposed).toBe(1);
    expect(feeRows()).toEqual([
      expect.objectContaining({
        contract_id: "c1",
        source_invoice_id: "inv-1",
        block_index: 1,
        days_overdue: 6,
        basis_balance: 96.05,
        amount: 1.92,
        mode: "percent_monthly",
        rate_pct: 2,
        status: "proposed", // never charged automatically
      }),
    ]);
    // §5 — an activity row on the contract
    const act = inserts.find((i) => i.table === "activity_log")?.payload as Record<string, unknown>;
    expect(act).toMatchObject({ entity_type: "service_contract", entity_id: "c1", parent_type: "client" });
  });

  it("uses the balance after partial payments", async () => {
    payments = [{ invoice_id: "inv-1", amount: 46.05 }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await proposeDueLateFees(client() as any, { asOf: "2026-11-06" });
    expect(feeRows()[0]).toMatchObject({ basis_balance: 50, amount: 1 });
  });

  it("is idempotent — an assessed block is not proposed again", async () => {
    existingFees = [{ source_invoice_id: "inv-1", block_index: 1 }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await proposeDueLateFees(client() as any, { asOf: "2026-11-06" });
    expect(r.proposed).toBe(0);
    expect(feeRows()).toEqual([]);
  });

  it("skips paid, void, draft and not-yet-due invoices, and invoices with no due date", async () => {
    links = [
      { invoice: invoice({ id: "a", status: "paid" }) },
      { invoice: invoice({ id: "b", status: "void" }) },
      { invoice: invoice({ id: "c", status: "draft" }) },
      { invoice: invoice({ id: "d", due_date: "2026-11-30" }) },
      { invoice: invoice({ id: "e", due_date: null }) },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await proposeDueLateFees(client() as any, { asOf: "2026-11-06" });
    expect(r.proposed).toBe(0);
  });

  it("does nothing within the grace period", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await proposeDueLateFees(client() as any, { asOf: "2026-11-05" });
    expect(r.proposed).toBe(0);
  });
});
