// FIN-TAX-1 — recomputeTotals honours the invoice's OWN treatment snapshot, so
// the stored tax_amount (the single source the HST return sums) matches the
// worked example, and changing the org setting can never alter an issued invoice.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  invoiceRow: {} as Record<string, unknown>,
  lines: [] as Array<{ amount: number }>,
  captured: null as Record<string, unknown> | null,
  getSetting: vi.fn(async () => "deferred_to_release" as string | null),
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  if (ctx.table === "invoices") {
    if (ctx.op === "update") {
      h.captured = ctx.payload as Record<string, unknown>;
      return { data: { ...h.invoiceRow, ...(ctx.payload as object) }, error: null };
    }
    return { data: h.invoiceRow, error: null };
  }
  if (ctx.table === "invoice_lines") return { data: h.lines, error: null };
  return { data: null, error: null };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeSupabaseMock(resolve, { user: { id: "u1" } }),
}));
// recomputeTotals never reads company_settings — a spy proves the snapshot, not
// the live setting, governs an already-created invoice (§2.2).
const getSetting = h.getSetting;
vi.mock("@/lib/api/company-settings", () => ({ getSetting: h.getSetting, setSetting: vi.fn() }));

import { recomputeTotals } from "@/lib/api/invoices";

beforeEach(() => {
  h.captured = null;
  h.lines = [{ amount: 100_000 }];
  getSetting.mockClear();
});

describe("FIN-TAX-1 — recomputeTotals stores the right tax_amount", () => {
  it("charged_upfront: tax on full $100k = $13,000; amount_due nets the holdback", async () => {
    h.invoiceRow = {
      id: "inv1",
      tax_rate: 13,
      tax_exempt: false,
      holdback_rate: 10,
      holdback_hst_treatment: "charged_upfront",
    };
    await recomputeTotals("inv1");
    expect(h.captured).toMatchObject({
      subtotal: 100_000,
      holdback_amount: 10_000,
      tax_amount: 13_000,
      total: 113_000,
      amount_due: 103_000, // 113,000 − 10,000 holdback
    });
    // §2.2: the invoice's own snapshot governed it — the org setting was NOT read.
    expect(getSetting).not.toHaveBeenCalled();
  });

  it("deferred_to_release: tax on payable $90k = $11,700", async () => {
    h.invoiceRow = {
      id: "inv1",
      tax_rate: 13,
      tax_exempt: false,
      holdback_rate: 10,
      holdback_hst_treatment: "deferred_to_release",
    };
    await recomputeTotals("inv1");
    expect(h.captured).toMatchObject({
      subtotal: 100_000,
      holdback_amount: 10_000,
      tax_amount: 11_700,
      total: 111_700,
      amount_due: 101_700, // 111,700 − 10,000 holdback
    });
  });

  it("a legacy NULL treatment reads as charged_upfront (deploy changes nothing)", async () => {
    h.invoiceRow = {
      id: "inv1",
      tax_rate: 13,
      tax_exempt: false,
      holdback_rate: 10,
      holdback_hst_treatment: null,
    };
    await recomputeTotals("inv1");
    expect(h.captured).toMatchObject({ tax_amount: 13_000 });
  });

  it("deferred release invoice (holdback 0) taxes the held sum: $10k → $1,300", async () => {
    h.lines = [{ amount: 10_000 }]; // the release line = the held sum
    h.invoiceRow = {
      id: "rel1",
      tax_rate: 13,
      tax_exempt: false, // taxable release under deferred
      holdback_rate: 0,
      holdback_hst_treatment: "deferred_to_release",
    };
    await recomputeTotals("rel1");
    expect(h.captured).toMatchObject({ subtotal: 10_000, tax_amount: 1_300 });
  });

  it("charged_upfront release invoice is tax-exempt → $0, and says nothing escapes", async () => {
    h.lines = [{ amount: 10_000 }];
    h.invoiceRow = {
      id: "rel1",
      tax_rate: 13,
      tax_exempt: true, // exempt release under charged_upfront
      holdback_rate: 0,
      holdback_hst_treatment: "charged_upfront",
    };
    await recomputeTotals("rel1");
    expect(h.captured).toMatchObject({ subtotal: 10_000, tax_amount: 0 });
  });
});
