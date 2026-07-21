// FIN-4 — deposits & retainers. The interesting behaviour is the hand-off into
// FIN-2's payment ledger: applying a deposit writes BOTH a deposit_applications
// row and a paired non-cash invoice_payments row, so the invoice's balance and
// derived status stay correct without any change to FIN-2's math. Un-applying
// reverses both (the settlement via ON DELETE CASCADE, simulated here).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  project: { id: "p1" } as Record<string, unknown> | null,
  deposits: [] as Record<string, unknown>[],
  applications: [] as Record<string, unknown>[],
  invoices: [] as Record<string, unknown>[],
  payments: [] as Record<string, unknown>[],
  statusUpdates: [] as unknown[],
  insertedApplications: [] as Record<string, unknown>[],
  insertedPayments: [] as Record<string, unknown>[],
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
    case "projects":
      return { data: s.project, error: null };

    case "project_deposits": {
      if (ctx.op === "insert") {
        const p = ctx.payload as Record<string, unknown>;
        const row = { id: `dep-${++s.seq}`, ...p };
        s.deposits = [...s.deposits, row];
        return { data: row, error: null };
      }
      if (ctx.op === "delete") {
        const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
        s.deposits = s.deposits.filter((d) => d.id !== id);
        return { data: null, error: null };
      }
      const rows = filterRows(s.deposits, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }

    case "deposit_applications": {
      if (ctx.op === "insert") {
        const p = ctx.payload as Record<string, unknown>;
        const row = { id: `app-${++s.seq}`, ...p };
        s.applications = [...s.applications, row];
        s.insertedApplications.push(p);
        return { data: row, error: null };
      }
      if (ctx.op === "delete") {
        const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
        s.applications = s.applications.filter((a) => a.id !== id);
        // Simulate the 0091 ON DELETE CASCADE onto the paired settlement.
        s.payments = s.payments.filter((p) => p.deposit_application_id !== id);
        return { data: null, error: null };
      }
      const rows = filterRows(s.applications, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }

    case "invoices": {
      if (ctx.op === "update") {
        s.statusUpdates.push(ctx.payload);
        const id = ctx.filters.find((f) => f.method === "eq")?.args[1];
        s.invoices = s.invoices.map((i) =>
          i.id === id ? { ...i, ...(ctx.payload as object) } : i
        );
        return {
          data: s.invoices.find((i) => i.id === id) ?? null,
          error: null,
        };
      }
      const rows = filterRows(s.invoices, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }

    case "invoice_payments": {
      if (ctx.op === "insert") {
        const p = ctx.payload as Record<string, unknown>;
        s.payments = [...s.payments, { id: `pay-${++s.seq}`, ...p }];
        s.insertedPayments.push(p);
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
  recordDeposit,
  deleteDeposit,
  applyDepositToInvoice,
  unapplyDeposit,
  getProjectDepositBalance,
  getDepositsHeldTotal,
  DepositError,
} from "@/lib/api/deposits";

const DEP = {
  method: "cheque" as const,
  receivedAt: "2026-07-01",
};

beforeEach(() => {
  s.project = { id: "p1" };
  s.deposits = [];
  s.applications = [];
  s.invoices = [
    { id: "inv1", project_id: "p1", status: "sent", amount_due: 1000 },
  ];
  s.payments = [];
  s.statusUpdates = [];
  s.insertedApplications = [];
  s.insertedPayments = [];
  s.seq = 0;
});

describe("recordDeposit", () => {
  it("inserts a deposit and it shows as available credit", async () => {
    await recordDeposit({ projectId: "p1", amount: 500, ...DEP });
    const bal = await getProjectDepositBalance("p1");
    expect(bal).toEqual({ collected: 500, applied: 0, available: 500 });
  });

  it("rejects a non-positive amount", async () => {
    await expect(
      recordDeposit({ projectId: "p1", amount: 0, ...DEP })
    ).rejects.toMatchObject({ code: "invalid_amount" });
    expect(s.deposits).toHaveLength(0);
  });

  it("rejects an unknown project", async () => {
    s.project = null;
    await expect(
      recordDeposit({ projectId: "nope", amount: 100, ...DEP })
    ).rejects.toBeInstanceOf(DepositError);
  });
});

describe("applyDepositToInvoice — guards", () => {
  beforeEach(async () => {
    await recordDeposit({ projectId: "p1", amount: 400, ...DEP });
  });

  it("rejects when the invoice belongs to another project", async () => {
    s.invoices.push({
      id: "inv2",
      project_id: "p2",
      status: "sent",
      amount_due: 100,
    });
    await expect(
      applyDepositToInvoice({ depositId: "dep-1", invoiceId: "inv2", amount: 50 })
    ).rejects.toMatchObject({ code: "project_mismatch" });
    expect(s.insertedApplications).toHaveLength(0);
  });

  it("rejects a draft / paid / void invoice", async () => {
    for (const status of ["draft", "paid", "void"]) {
      s.invoices = [{ id: "inv1", project_id: "p1", status, amount_due: 1000 }];
      await expect(
        applyDepositToInvoice({ depositId: "dep-1", invoiceId: "inv1", amount: 50 })
      ).rejects.toMatchObject({ code: "invalid_status" });
    }
    expect(s.insertedApplications).toHaveLength(0);
  });

  it("rejects more than the deposit's unapplied remainder", async () => {
    await expect(
      applyDepositToInvoice({ depositId: "dep-1", invoiceId: "inv1", amount: 400.01 })
    ).rejects.toMatchObject({ code: "exceeds_deposit" });
  });

  it("rejects more than the invoice's outstanding balance", async () => {
    // deposit 400 is plenty; the invoice only owes 120 after a cash payment
    s.invoices = [{ id: "inv1", project_id: "p1", status: "partially_paid", amount_due: 1000 }];
    s.payments = [{ id: "pay-0", invoice_id: "inv1", amount: 880, method: "cheque" }];
    await expect(
      applyDepositToInvoice({ depositId: "dep-1", invoiceId: "inv1", amount: 200 })
    ).rejects.toMatchObject({ code: "exceeds_balance" });
  });

  it("rejects a non-positive amount", async () => {
    await expect(
      applyDepositToInvoice({ depositId: "dep-1", invoiceId: "inv1", amount: 0 })
    ).rejects.toMatchObject({ code: "invalid_amount" });
  });
});

describe("applyDepositToInvoice — happy path", () => {
  it("writes the application AND a paired non-cash settlement, then re-derives status", async () => {
    await recordDeposit({ projectId: "p1", amount: 400, ...DEP });
    const res = await applyDepositToInvoice({
      depositId: "dep-1",
      invoiceId: "inv1",
      amount: 400,
      actorId: "u1",
    });

    // application ledger
    expect(s.insertedApplications).toHaveLength(1);
    expect(s.insertedApplications[0]).toMatchObject({
      deposit_id: "dep-1",
      invoice_id: "inv1",
      amount: 400,
      created_by: "u1",
    });

    // paired settlement, tagged non-cash and linked back
    expect(s.insertedPayments).toHaveLength(1);
    expect(s.insertedPayments[0]).toMatchObject({
      invoice_id: "inv1",
      amount: 400,
      method: "deposit_applied",
      deposit_application_id: res.applicationId,
    });

    // 400 of 1000 → still partially paid
    expect(s.statusUpdates).toEqual([{ status: "partially_paid" }]);

    const bal = await getProjectDepositBalance("p1");
    expect(bal).toEqual({ collected: 400, applied: 400, available: 0 });
  });

  it("a deposit covering the whole balance marks the invoice paid", async () => {
    s.invoices = [{ id: "inv1", project_id: "p1", status: "sent", amount_due: 300 }];
    await recordDeposit({ projectId: "p1", amount: 300, ...DEP });
    await applyDepositToInvoice({
      depositId: "dep-1",
      invoiceId: "inv1",
      amount: 300,
    });
    expect(s.statusUpdates).toEqual([{ status: "paid" }]);
  });

  it("a deposit topping up an earlier cash payment marks it paid", async () => {
    s.invoices = [
      { id: "inv1", project_id: "p1", status: "partially_paid", amount_due: 500 },
    ];
    s.payments = [{ id: "pay-0", invoice_id: "inv1", amount: 200, method: "eft" }];
    await recordDeposit({ projectId: "p1", amount: 300, ...DEP });
    await applyDepositToInvoice({
      depositId: "dep-1",
      invoiceId: "inv1",
      amount: 300,
    });
    expect(s.statusUpdates).toEqual([{ status: "paid" }]);
  });

  it("supports partial draw-down across two invoices", async () => {
    s.invoices.push({
      id: "inv2",
      project_id: "p1",
      status: "sent",
      amount_due: 250,
    });
    await recordDeposit({ projectId: "p1", amount: 500, ...DEP });
    await applyDepositToInvoice({ depositId: "dep-1", invoiceId: "inv1", amount: 250 });
    await applyDepositToInvoice({ depositId: "dep-1", invoiceId: "inv2", amount: 250 });
    const bal = await getProjectDepositBalance("p1");
    expect(bal).toEqual({ collected: 500, applied: 500, available: 0 });
    // a third application has nothing left to draw
    await expect(
      applyDepositToInvoice({ depositId: "dep-1", invoiceId: "inv1", amount: 1 })
    ).rejects.toMatchObject({ code: "exceeds_deposit" });
  });
});

describe("unapplyDeposit", () => {
  it("reverses the application, cascades the settlement, and re-derives status", async () => {
    s.invoices = [{ id: "inv1", project_id: "p1", status: "sent", amount_due: 300 }];
    await recordDeposit({ projectId: "p1", amount: 300, ...DEP });
    const res = await applyDepositToInvoice({
      depositId: "dep-1",
      invoiceId: "inv1",
      amount: 300,
    });
    expect(s.statusUpdates).toEqual([{ status: "paid" }]);
    s.statusUpdates = [];

    await unapplyDeposit(res.applicationId);

    expect(s.applications).toHaveLength(0);
    expect(s.payments).toHaveLength(0); // cascaded away
    expect(s.statusUpdates).toEqual([{ status: "sent" }]);

    const bal = await getProjectDepositBalance("p1");
    expect(bal).toEqual({ collected: 300, applied: 0, available: 300 });
  });

  it("leaves an earlier cash payment intact when reversing the deposit", async () => {
    s.invoices = [
      { id: "inv1", project_id: "p1", status: "partially_paid", amount_due: 500 },
    ];
    s.payments = [{ id: "pay-0", invoice_id: "inv1", amount: 200, method: "eft" }];
    await recordDeposit({ projectId: "p1", amount: 300, ...DEP });
    const res = await applyDepositToInvoice({
      depositId: "dep-1",
      invoiceId: "inv1",
      amount: 300,
    });
    s.statusUpdates = [];

    await unapplyDeposit(res.applicationId);
    expect(s.payments).toHaveLength(1);
    expect(s.payments[0]).toMatchObject({ method: "eft", amount: 200 });
    expect(s.statusUpdates).toEqual([{ status: "partially_paid" }]);
  });

  it("is blocked on a void invoice", async () => {
    await recordDeposit({ projectId: "p1", amount: 300, ...DEP });
    const res = await applyDepositToInvoice({
      depositId: "dep-1",
      invoiceId: "inv1",
      amount: 300,
    });
    s.invoices = [{ id: "inv1", project_id: "p1", status: "void", amount_due: 1000 }];
    await expect(unapplyDeposit(res.applicationId)).rejects.toMatchObject({
      code: "invalid_status",
    });
    expect(s.applications).toHaveLength(1);
  });
});

describe("deleteDeposit", () => {
  it("removes an untouched deposit", async () => {
    await recordDeposit({ projectId: "p1", amount: 200, ...DEP });
    await deleteDeposit("dep-1");
    expect(s.deposits).toHaveLength(0);
  });

  it("is blocked once any of it has been applied", async () => {
    await recordDeposit({ projectId: "p1", amount: 200, ...DEP });
    await applyDepositToInvoice({
      depositId: "dep-1",
      invoiceId: "inv1",
      amount: 100,
    });
    await expect(deleteDeposit("dep-1")).rejects.toMatchObject({
      code: "has_applications",
    });
    expect(s.deposits).toHaveLength(1);
  });
});

describe("getDepositsHeldTotal", () => {
  it("is company-wide collected minus applied", async () => {
    await recordDeposit({ projectId: "p1", amount: 400, ...DEP });
    expect(await getDepositsHeldTotal()).toBe(400);
    await applyDepositToInvoice({
      depositId: "dep-1",
      invoiceId: "inv1",
      amount: 150,
    });
    expect(await getDepositsHeldTotal()).toBe(250);
  });
});
