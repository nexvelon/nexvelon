// AUD-4 — invoice mutations write a best-effort activity row. These drive the
// lib mutations through a chainable Supabase mock and assert on the logActivity
// calls: the right entity_type, a readable label (incl. the pre-issue draft
// case), the money amount on payment events, issue vs void distinguishable, a
// removed line's label captured before the delete, no SEC-1-redacted field in
// any payload, and best-effort (a logging throw never breaks the mutation).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  // The "current" invoice row returned by invoices SELECT (small reads).
  invoiceSelect: {} as Record<string, unknown>,
  // The full invoice row returned by invoices INSERT/UPDATE.
  invoiceRow: {} as Record<string, unknown>,
  payments: [] as Array<{ amount: number }>,
  line: null as Record<string, unknown> | null,
  paymentRow: null as Record<string, unknown> | null,
  logThrows: false,
  logActivity: vi.fn(async () => {}),
}));

const logActivity = h.logActivity;

vi.mock("@/lib/api/activity-log", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/activity-log")>()),
  logActivity: h.logActivity,
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const { table, op, terminal } = ctx;
  if (table.startsWith("rpc:")) return { data: 7, error: null };
  switch (table) {
    case "invoices":
      if (op === "select") return { data: h.invoiceSelect, error: null };
      return { data: h.invoiceRow, error: null }; // insert / update
    case "invoice_payments":
      if (op === "select" && terminal === "maybeSingle")
        return { data: h.paymentRow, error: null }; // deletePayment's lookup
      if (op === "select") return { data: h.payments, error: null };
      return { data: null, error: null }; // insert / delete
    case "invoice_lines":
      if (op === "select" && terminal === "await") return { data: [], error: null };
      if (op === "select") return { data: h.line, error: null }; // maybeSingle
      return { data: null, error: null };
    case "projects":
      return { data: { project_number: "P-100", title: "Acme HQ" }, error: null };
    case "clients":
      return { data: { name: "Acme Corp" }, error: null };
    case "project_jobs":
      return { data: { id: "job-1" }, error: null };
    case "project_cost_centers":
      return { data: { name: "Cabling", contract_value: 1000 }, error: null };
    default:
      return { data: null, error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeSupabaseMock(resolve, { user: { id: "actor-1" } }),
}));

import {
  createInvoiceForProject,
  issueInvoice,
  setInvoiceStatus,
  recordPayment,
  deletePayment,
  deleteLine,
  addManualLine,
} from "@/lib/api/invoices";

const FULL_ISSUED = {
  id: "inv-1",
  invoice_number: "NV-2026-0007",
  project_id: "proj-1",
  client_id: "cli-1",
  status: "sent",
  issue_date: "2026-09-24",
  amount_due: 1000,
};

beforeEach(() => {
  logActivity.mockReset();
  logActivity.mockImplementation(async () => {
    if (h.logThrows) throw new Error("audit sink down");
  });
  h.logThrows = false;
  h.payments = [];
  h.line = null;
  h.paymentRow = null;
  h.invoiceSelect = {
    id: "inv-1",
    opco: "NV",
    invoice_number: "NV-2026-0007",
    status: "sent",
    amount_due: 1000,
    tax_rate: 13,
    tax_exempt: false,
    holdback_rate: 0,
  };
  h.invoiceRow = { ...FULL_ISSUED };
});

// The spy is untyped (vi.fn); surface each call as a positional tuple for the
// assertions: [entityType, entityId, action, changes, ctx].
type AuditCall = [
  string,
  string,
  string,
  Record<string, { from: unknown; to: unknown }>,
  Record<string, unknown>,
];
function lastCall(): AuditCall {
  const calls = logActivity.mock.calls as unknown as AuditCall[];
  return calls[calls.length - 1];
}

describe("AUD-4 — invoice audit rows", () => {
  it("createInvoiceForProject logs a create with the pre-issue DRAFT label", async () => {
    // A fresh draft: no number yet.
    h.invoiceRow = { id: "inv-1", invoice_number: null, project_id: "proj-1", client_id: "cli-1", status: "draft" };
    await createInvoiceForProject("proj-1");
    const [entityType, entityId, action, changes, ctx] = lastCall();
    expect(entityType).toBe("invoice");
    expect(entityId).toBe("inv-1");
    expect(action).toBe("create");
    expect(changes).toEqual({});
    // The draft names the project (or client) — never a bare "updated an invoice".
    expect(ctx.entityLabel).toBe("Draft invoice — P-100");
    expect(ctx.parentType).toBe("project");
    expect(ctx.parentId).toBe("proj-1");
  });

  it("issueInvoice is unmistakable — status→sent AND the stamped number", async () => {
    h.invoiceSelect = { opco: "NV", invoice_number: null, status: "draft" };
    h.invoiceRow = { ...FULL_ISSUED };
    await issueInvoice("inv-1");
    const [type, , action, changes, ctx] = lastCall();
    expect(type).toBe("invoice");
    expect(action).toBe("update");
    expect(changes.status).toEqual({ from: "draft", to: "sent" });
    // The number is stamped on issue: from null → a real, non-empty number.
    expect(changes.invoice_number.from).toBeNull();
    expect(typeof changes.invoice_number.to).toBe("string");
    expect((changes.invoice_number.to as string).length).toBeGreaterThan(0);
    // The row label switches from the draft fallback to the real number.
    expect(ctx.entityLabel).toBe("Invoice NV-2026-0007");
  });

  it("void is unmistakable and distinct from issue", async () => {
    h.invoiceSelect = { status: "sent" };
    h.invoiceRow = { ...FULL_ISSUED, status: "void" };
    await setInvoiceStatus("inv-1", "void");
    const [, , action, changes] = lastCall();
    expect(action).toBe("update");
    expect(changes.status).toEqual({ from: "sent", to: "void" });
    expect(changes.invoice_number).toBeUndefined(); // no number stamp → not an issue
  });

  it("recordPayment carries the AMOUNT and the status transition", async () => {
    h.invoiceSelect = { id: "inv-1", status: "sent", amount_due: 1000 };
    h.invoiceRow = { ...FULL_ISSUED, status: "paid" };
    await recordPayment({ invoiceId: "inv-1", amount: 1000, method: "cheque", paidAt: "2026-09-24" });
    const [type, , , changes] = lastCall();
    expect(type).toBe("invoice");
    expect(String(changes.payment_recorded.to)).toContain("$1,000.00");
    expect(String(changes.payment_recorded.to)).toContain("cheque");
    expect(changes.status).toEqual({ from: "sent", to: "paid" });
  });

  it("deletePayment records the reversed amount", async () => {
    h.paymentRow = { invoice_id: "inv-1", amount: 400, method: "cheque" };
    h.invoiceSelect = { status: "partially_paid", amount_due: 1000 };
    h.invoiceRow = { ...FULL_ISSUED, status: "sent" };
    await deletePayment("pay-1");
    const [type, , , changes] = lastCall();
    expect(type).toBe("invoice");
    expect(String(changes.payment_reversed.from)).toContain("$400.00");
  });

  it("deleteLine captures the removed line's label BEFORE the delete (survives)", async () => {
    h.line = { description: "Fibre patch panel", amount: 250 };
    await deleteLine("inv-1", "line-9");
    const [, , action, changes] = lastCall();
    expect(action).toBe("update");
    expect(String(changes.line_removed.from)).toContain("Fibre patch panel");
    expect(String(changes.line_removed.from)).toContain("$250.00");
    expect(changes.line_removed.to).toBeNull();
  });

  it("no invoice audit payload leaks a SEC-1-redacted field", async () => {
    await addManualLine("inv-1", { description: "Labour", quantity: 2, unit_price: 100 });
    await recordPayment({ invoiceId: "inv-1", amount: 200, method: "eft", paidAt: "2026-09-24" });
    const forbidden = /unit_cost|margin|internalNotes|internal_notes|avgCost|quoteDefaultMargin/i;
    for (const call of logActivity.mock.calls as unknown as unknown[][]) {
      const changes = (call[3] ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(changes)) {
        expect(key).not.toMatch(forbidden);
        expect(JSON.stringify(changes[key])).not.toMatch(forbidden);
      }
    }
  });

  it("best-effort — a logging failure never breaks the payment", async () => {
    h.logThrows = true;
    h.invoiceSelect = { id: "inv-1", status: "sent", amount_due: 500 };
    h.invoiceRow = { ...FULL_ISSUED, status: "paid" };
    const res = await recordPayment({ invoiceId: "inv-1", amount: 500, method: "cash", paidAt: "2026-09-24" });
    // The payment still settled despite the audit throw.
    expect(res.invoice.status).toBe("paid");
  });
});
