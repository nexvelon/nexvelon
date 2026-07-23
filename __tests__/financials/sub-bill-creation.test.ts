// SUB-4 — the createBill subcontractor path: vendor_id is resolved from the
// sub's linked vendor (schema keeps it NOT NULL), an inactive sub is refused,
// and an unlinked sub returns a typed error the UI can act on. Plus the
// per-subcontractor bill list.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const s = vi.hoisted(() => ({
  subs: [] as Record<string, unknown>[],
  bills: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  seq: 0,
}));

function filt(rows: Record<string, unknown>[], filters: ChainCtx["filters"]) {
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
    case "subcontractors": {
      const rows = filt(s.subs, ctx.filters);
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
      const rows = filt(s.bills, ctx.filters);
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    case "bill_payments":
      return { data: [], error: null };
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
  listBillsForSubcontractor,
  BillError,
} from "@/lib/api/vendor-bills";

const BILL = {
  vendorId: "placeholder-vendor",
  billNumber: "SUB-INV-1",
  billDate: "2026-07-01",
  subtotal: 1000,
  taxAmount: 130,
  total: 1130,
};

beforeEach(() => {
  s.subs = [
    { id: "subA", status: "active", vendor_id: "vendorX" },
    { id: "subB", status: "active", vendor_id: null }, // unlinked
    { id: "subC", status: "inactive", vendor_id: "vendorY" },
    { id: "subD", status: "do_not_use", vendor_id: "vendorZ" },
  ];
  s.bills = [];
  s.inserted = [];
  s.seq = 0;
});

describe("createBill — subcontractor path", () => {
  it("resolves vendor_id from the sub's linked vendor and stamps subcontractor_id", async () => {
    // vendorId in input is a placeholder — the sub's link must win.
    await createBill({ ...BILL, subcontractorId: "subA" });
    expect(s.inserted[0]).toMatchObject({
      vendor_id: "vendorX", // resolved from subA, NOT the placeholder
      subcontractor_id: "subA",
      subtotal: 1000,
    });
  });

  it("rejects an inactive subcontractor with a typed error", async () => {
    await expect(
      createBill({ ...BILL, subcontractorId: "subC" })
    ).rejects.toMatchObject({ code: "subcontractor_inactive" });
    await expect(
      createBill({ ...BILL, subcontractorId: "subD" })
    ).rejects.toBeInstanceOf(BillError);
    expect(s.inserted).toHaveLength(0);
  });

  it("rejects an unlinked subcontractor with subcontractor_not_linked_to_vendor", async () => {
    await expect(
      createBill({ ...BILL, subcontractorId: "subB" })
    ).rejects.toMatchObject({ code: "subcontractor_not_linked_to_vendor" });
    expect(s.inserted).toHaveLength(0);
  });

  it("a plain supplier bill (no subcontractorId) keeps its own vendor and null sub", async () => {
    await createBill({ ...BILL, vendorId: "vendorReal", subcontractorId: null });
    expect(s.inserted[0]).toMatchObject({
      vendor_id: "vendorReal",
      subcontractor_id: null,
    });
  });
});

describe("listBillsForSubcontractor", () => {
  it("returns only that subcontractor's bills", async () => {
    s.bills = [
      { id: "b1", subcontractor_id: "subA", total: 1130, status: "received" },
      { id: "b2", subcontractor_id: "subB", total: 500, status: "received" },
      { id: "b3", subcontractor_id: "subA", total: 200, status: "paid" },
      { id: "b4", subcontractor_id: null, total: 999, status: "received" },
    ];
    const rows = await listBillsForSubcontractor("subA");
    expect(rows.map((r) => r.id).sort()).toEqual(["b1", "b3"]);
  });
});
