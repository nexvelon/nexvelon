// INV-9-3 — listPickupSlipsForProduct returns the slips that issued a product,
// with is_signed derived from signature presence and has_pdf from pdf_path; and
// getPickupSlipPdfUrl returns a signed URL (null when the slip has no PDF).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  lines: [] as Record<string, unknown>[],
  slips: [] as Record<string, unknown>[],
  signCalls: [] as string[],
}));

function applyFilters(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
  let out = rows;
  for (const f of filters) {
    const a = f.args as unknown[];
    const col = a[0] as string;
    if (f.method === "eq") out = out.filter((r) => r[col] === a[1]);
    else if (f.method === "in") out = out.filter((r) => (a[1] as unknown[]).includes(r[col]));
  }
  return out;
}

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  if (ctx.table === "pickup_slip_lines") {
    return { data: applyFilters(h.lines, ctx.filters), error: null };
  }
  if (ctx.table === "pickup_slips") {
    const rows = applyFilters(h.slips, ctx.filters);
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
  return { data: single ? null : [], error: null };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/storage/pickup-slip-pdfs", () => ({
  signPickupSlipPdf: vi.fn(async (path: string) => {
    h.signCalls.push(path);
    return `https://signed/${path}`;
  }),
}));

import {
  listPickupSlipsForProduct,
  getPickupSlipPdfUrl,
} from "@/lib/api/pickup-slips";

beforeEach(() => {
  h.signCalls = [];
  h.lines = [
    { pickup_slip_id: "slip1", product_id: "pA" },
    { pickup_slip_id: "slip1", product_id: "pB" },
    { pickup_slip_id: "slip2", product_id: "pA" },
    { pickup_slip_id: "slip3", product_id: "pC" },
  ];
  h.slips = [
    { id: "slip1", slip_number: "PS-2026-0001", recipient_type: "truck", recipient_name: "Truck 1", issued_at: "2026-05-01T00:00:00Z", signature_data_url: "data:image/png;base64,x", pdf_path: "slip1/ps.pdf" },
    { id: "slip2", slip_number: "PS-2026-0002", recipient_type: "tech", recipient_name: "Jamie", issued_at: "2026-06-01T00:00:00Z", signature_data_url: null, pdf_path: null },
  ];
});

describe("listPickupSlipsForProduct", () => {
  it("returns only slips touching the product, with derived signed/pdf + total line count", async () => {
    const rows = await listPickupSlipsForProduct("pA");
    expect(rows.map((r) => r.id).sort()).toEqual(["slip1", "slip2"]); // not slip3 (pC)

    const s1 = rows.find((r) => r.id === "slip1")!;
    expect(s1).toMatchObject({
      reference: "PS-2026-0001",
      recipient_type: "truck",
      recipient_label: "Truck 1",
      is_signed: true, // signature present
      has_pdf: true, // pdf_path present
      line_count: 2, // slip1 has 2 lines total (pA + pB)
    });

    const s2 = rows.find((r) => r.id === "slip2")!;
    expect(s2).toMatchObject({ is_signed: false, has_pdf: false, line_count: 1 });
  });

  it("returns [] when no slip references the product", async () => {
    expect(await listPickupSlipsForProduct("pZ")).toEqual([]);
  });
});

describe("getPickupSlipPdfUrl", () => {
  it("returns a signed URL for a slip with a pdf_path", async () => {
    const url = await getPickupSlipPdfUrl("slip1");
    expect(url).toBe("https://signed/slip1/ps.pdf");
    expect(h.signCalls).toEqual(["slip1/ps.pdf"]);
  });

  it("returns null (and never signs) when the slip has no pdf_path", async () => {
    const url = await getPickupSlipPdfUrl("slip2");
    expect(url).toBeNull();
    expect(h.signCalls).toHaveLength(0);
  });
});
