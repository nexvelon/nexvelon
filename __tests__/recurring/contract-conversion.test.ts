// RECUR-2 — the quote → contract conversion engine against a mocked database:
// gated on a signed acceptance, cannot run twice, inherits price/cadence/opco from
// the SIGNED snapshot (not the live quote), splits a mixed quote, links the
// accepted snapshot, locks the quote, and writes the §5 activity rows.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";
import { buildRecurringSnapshot } from "@/lib/recurring/quote-terms";
import type { Quote } from "@/lib/types";

const h = vi.hoisted(() => ({
  quote: null as Record<string, unknown> | null,
  acceptance: null as Record<string, unknown> | null,
  snapshot: null as Record<string, unknown> | null,
  existing: [] as { id: string; name: string }[],
  insertError: null as { code?: string; message: string } | null,
  linesError: null as { message: string } | null,
  writes: [] as ChainCtx[],
  oneOff: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ id: "inv-oneoff" })),
  activity: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => {}),
  quoteAudit: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => {}),
}));

vi.mock("@/lib/supabase/server", async () => {
  const { makeSupabaseMock: mk } = await import("../helpers/supabaseChainMock");
  return {
    createClient: async () =>
      mk((ctx) => {
        if (ctx.op !== "select") h.writes.push({ ...ctx, filters: [...ctx.filters] });
        if (ctx.table === "quotes") {
          if (ctx.op === "update") return { data: null, error: null };
          return { data: h.quote, error: null };
        }
        if (ctx.table === "quote_acceptances") return { data: h.acceptance ? [h.acceptance] : [], error: null };
        if (ctx.table === "quote_portal_sends") return { data: { id: "send-1", snapshot: h.snapshot }, error: null };
        if (ctx.table === "service_contracts") {
          if (ctx.op === "insert") {
            if (h.insertError) return { data: null, error: h.insertError };
            return { data: { id: "con-1", ...(ctx.payload as object) }, error: null };
          }
          if (ctx.op === "delete") return { data: null, error: null };
          return { data: h.existing, error: null };
        }
        if (ctx.table === "service_contract_lines") return { data: null, error: h.linesError };
        return { data: null, error: null };
      }),
  };
});
vi.mock("@/lib/api/invoices", () => ({ createOneOffInvoice: h.oneOff }));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: h.activity }));
vi.mock("@/lib/api/quote-audit", () => ({ logQuoteAuditEvent: h.quoteAudit }));

import { convertQuoteToContract, getContractConversionState } from "@/lib/api/contract-conversion";
void makeSupabaseMock;

const PERMS = { canConvert: true, canManageContracts: true };
const ACTOR = { id: "u-ops", name: "Ops Person" };

function signedQuote(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    number: "Q-10500",
    name: "Guardian monitoring — 200 King St",
    clientId: "cli-1",
    siteId: "site-1",
    status: "Approved",
    createdAt: "2026-10-01",
    expiresAt: "2026-10-31",
    ownerId: "u1",
    items: [],
    templateSlug: "guardian",
    intendedTargetKind: "service_contract",
    serviceContract: {
      cadence: "quarterly",
      billingTiming: "advance",
      termMonths: 36,
      lateFee: { mode: "percent_monthly", monthlyPct: 2, graceDays: 5 },
    },
    paymentTerms: "Net 30",
    taxRate: 0.13,
    sections: [
      {
        id: "s1",
        name: "Equipment & Installation",
        items: [
          { id: "l1", type: "product", description: "Fire panel", name: "", qty: 1, unitPrice: 1200, unitCost: 700, margin: 41 },
        ],
      },
    ],
    schedules: [
      {
        id: "sch",
        kind: "monitoring",
        title: "Monitoring Services",
        subtitle: "",
        included: true,
        services: [
          { id: "m1", label: "Fire monitoring", monthlyFee: 45 },
          { id: "m2", label: "Elevator monitoring", monthlyFee: 40 },
        ],
        setupLabel: "Account activation",
        setupAmount: 150,
      },
    ],
    subtotal: 1200,
    tax: 156,
    total: 1356,
    ...over,
  } as Quote;
}

function setSigned(q: Quote) {
  h.quote = { id: q.id, data: q, client_id: q.clientId, site_id: q.siteId };
  h.acceptance = {
    id: "acc-1",
    send_id: "send-1",
    quote_id: q.id,
    decision: "accepted",
    signer_name: "Dana Client",
    signer_title: "Facilities Manager",
    accepted_at: "2026-10-15T14:00:00Z",
    signed_pdf_path: "signed/q1.pdf",
    record_hash: "abc123def456789",
  };
  h.snapshot = {
    number: q.number,
    sections: [{ name: "Equipment & Installation", items: [{ qty: 1, unitPrice: 1200 }] }],
    subtotal: 1200,
    tax: 156,
    total: 1356,
    recurring: buildRecurringSnapshot(q),
  };
}

const DECISIONS = {
  startDate: "2026-11-01",
  billingMode: "draft_for_approval" as const,
  activate: true,
  createOneTimeInvoice: true,
};

beforeEach(() => {
  h.existing = [];
  h.insertError = null;
  h.linesError = null;
  h.writes = [];
  h.oneOff.mockClear();
  h.activity.mockClear();
  h.quoteAudit.mockClear();
  setSigned(signedQuote());
});

function contractInsert() {
  return h.writes.find((w) => w.table === "service_contracts" && w.op === "insert")?.payload as Record<string, unknown>;
}

describe("conversion — happy path", () => {
  it("inherits price, cadence, opco, terms and links the accepted snapshot", async () => {
    const res = await convertQuoteToContract("q1", DECISIONS, ACTOR, PERMS);
    expect(res.contract.id).toBe("con-1");
    const c = contractInsert();
    expect(c).toMatchObject({
      opco: "guardian",
      client_id: "cli-1",
      site_id: "site-1",
      cadence: "quarterly",
      billing_timing: "advance",
      billing_mode: "draft_for_approval",
      status: "active",
      start_date: "2026-11-01",
      end_date: "2029-10-31", // 36-month term
      next_billing_date: expect.any(String),
      tax_rate: 13,
      payment_terms_days: 30,
      late_fee_mode: "percent_monthly",
      late_fee_monthly_pct: 2,
      late_fee_grace_days: 5,
      source_quote_id: "q1",
      source_send_id: "send-1",
      source_acceptance_id: "acc-1",
      source_quote_number: "Q-10500",
      source_signed_by: "Dana Client",
      source_signed_at: "2026-10-15T14:00:00Z",
      source_signed_pdf_path: "signed/q1.pdf",
      source_record_hash: "abc123def456789",
    });
    expect((c.source_terms as { periodTotal: number }).periodTotal).toBe(255);

    const lines = h.writes.find((w) => w.table === "service_contract_lines")?.payload as { amount: number }[];
    expect(lines.map((l) => l.amount)).toEqual([135, 120]); // 3 × 45, 3 × 40
  });

  it("locks the quote as Converted with the contract link", async () => {
    await convertQuoteToContract("q1", DECISIONS, ACTOR, PERMS);
    const upd = h.writes.find((w) => w.table === "quotes" && w.op === "update")?.payload as {
      status: string;
      data: Quote;
    };
    expect(upd.status).toBe("Converted");
    expect(upd.data.contractId).toBe("con-1");
    expect(upd.data.status).toBe("Converted");
  });

  it("splits a mixed install + monitoring quote: one-time items go on a one-off invoice", async () => {
    const res = await convertQuoteToContract("q1", DECISIONS, ACTOR, PERMS);
    expect(res.oneTimeInvoiceId).toBe("inv-oneoff");
    expect(h.oneOff).toHaveBeenCalledWith(
      expect.objectContaining({
        opco: "guardian", // the entity the client signed with
        clientId: "cli-1",
        taxRatePct: 13,
        lines: [
          { description: "Equipment & Installation", amount: 1200 },
          { description: "Account activation", amount: 150 },
        ],
      })
    );
    // …and the recurring lines never include the one-time amounts.
    const lines = h.writes.find((w) => w.table === "service_contract_lines")?.payload as { description: string }[];
    expect(lines.map((l) => l.description).join(" ")).not.toMatch(/Installation|activation/);
  });

  it("does not raise the one-off invoice when the operator opts out", async () => {
    const res = await convertQuoteToContract("q1", { ...DECISIONS, createOneTimeInvoice: false }, ACTOR, PERMS);
    expect(res.oneTimeInvoiceId).toBeNull();
    expect(h.oneOff).not.toHaveBeenCalled();
  });

  it("writes the activity row and the quote audit event (§5)", async () => {
    await convertQuoteToContract("q1", DECISIONS, ACTOR, PERMS);
    expect(h.activity).toHaveBeenCalledWith(
      "service_contract",
      "con-1",
      "create",
      expect.objectContaining({ from_quote: { from: null, to: "Q-10500" } }),
      expect.objectContaining({ parentType: "client", parentId: "cli-1" })
    );
    expect(h.quoteAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "converted_to_contract" }));
  });
});

describe("conversion — §2.2: built from the signed snapshot, not the live quote", () => {
  it("a quote edit after signing does not change what the contract bills", async () => {
    const live = signedQuote();
    setSigned(live); // snapshot frozen at $45 + $40
    // …then the live quote is edited (fee raised, cadence changed).
    const edited = signedQuote({ serviceContract: { cadence: "monthly" } });
    (edited.schedules![0] as { services: { monthlyFee: number }[] }).services[0].monthlyFee = 999;
    h.quote = { id: "q1", data: edited, client_id: "cli-1", site_id: "site-1" };

    await convertQuoteToContract("q1", DECISIONS, ACTOR, PERMS);
    expect(contractInsert().cadence).toBe("quarterly");
    const lines = h.writes.find((w) => w.table === "service_contract_lines")?.payload as { amount: number }[];
    expect(lines.map((l) => l.amount)).toEqual([135, 120]);
  });
});

describe("conversion — gates", () => {
  it("cannot convert before acceptance", async () => {
    h.acceptance = null;
    await expect(convertQuoteToContract("q1", DECISIONS, ACTOR, PERMS)).rejects.toThrow(/hasn't accepted/);
    expect(contractInsert()).toBeUndefined();
  });

  it("converting twice is rejected — by the gate and by the database", async () => {
    h.existing = [{ id: "con-0", name: "Existing" }];
    await expect(convertQuoteToContract("q1", DECISIONS, ACTOR, PERMS)).rejects.toThrow(/already been converted/);

    h.existing = [];
    h.insertError = { code: "23505", message: "duplicate key" }; // a racing second click
    await expect(convertQuoteToContract("q1", DECISIONS, ACTOR, PERMS)).rejects.toThrow(/already been converted/);
  });

  it("requires a start date and a billing mode", async () => {
    await expect(convertQuoteToContract("q1", { ...DECISIONS, startDate: "" }, ACTOR, PERMS)).rejects.toThrow(
      /date the service starts/
    );
  });

  it("per-opco: refuses when the signed terms name another company than the letterhead", async () => {
    const q = signedQuote();
    setSigned(q);
    h.quote = { id: "q1", data: { ...q, templateSlug: "integrated_solutions" }, client_id: "cli-1", site_id: "site-1" };
    await expect(convertQuoteToContract("q1", DECISIONS, ACTOR, PERMS)).rejects.toThrow(/different company/);
    expect(contractInsert()).toBeUndefined();
  });

  it("removes a half-made contract if its pricing lines fail, so a retry works", async () => {
    h.linesError = { message: "boom" };
    await expect(convertQuoteToContract("q1", DECISIONS, ACTOR, PERMS)).rejects.toThrow(/lines/);
    expect(h.writes.some((w) => w.table === "service_contracts" && w.op === "delete")).toBe(true);
  });

  it("the state explains every blocker without hiding the action", async () => {
    h.acceptance = null;
    const s = await getContractConversionState("q1", { canConvert: true, canManageContracts: false });
    expect(s!.blockers.map((b) => b.code)).toEqual(["no_permission", "not_accepted"]);
  });
});
