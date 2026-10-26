// INV-FIX-1 — the server-side fixes against a mocked database:
//   Gap 5 — billable materials use a QUANTITY-WEIGHTED cost (old plain average
//           proven wrong) with exact per-unit costs; SEC-1 redacts them.
//   Gap 6 — adjusting a lot to zero retires it (no CHECK violation) and keeps its
//           receipt trail.
//   Gap 1 — committing a multi-lot line consumes each lot in order; a failure
//           stops there (never silently re-planned) and reports what committed;
//           committing needs inventory:edit.
//   SEC-1 — lot-draw costs are redacted from the quote blob for cost-blind roles.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChainCtx } from "../helpers/supabaseChainMock";

const h = vi.hoisted(() => ({
  writes: [] as ChainCtx[],
  tables: {} as Record<string, unknown>,
  gates: { inventoryCost: true, quoteMargin: true, quoteInternal: true, vendorBanking: true, anyCost: true },
  canEdit: true,
  lots: [] as Record<string, unknown>[],
  consume: vi.fn<(id: string, qty: number) => Promise<{ consumedRowId: string; serialNumber: string | null }>>(),
}));

vi.mock("@/lib/supabase/server", async () => {
  const { makeSupabaseMock } = await import("../helpers/supabaseChainMock");
  return {
    createClient: async () =>
      makeSupabaseMock((ctx) => {
        if (ctx.op !== "select") h.writes.push({ ...ctx, filters: [...ctx.filters] });
        if (ctx.op === "select" && ctx.table in h.tables) return { data: h.tables[ctx.table], error: null };
        return { data: ctx.op === "select" ? [] : null, error: null };
      }),
  };
});
vi.mock("@/lib/permissions/field-redaction", async (orig) => ({
  ...(await orig<typeof import("@/lib/permissions/field-redaction")>()),
  resolveFieldGates: async () => h.gates,
}));
vi.mock("@/lib/permissions/resolve", async (orig) => ({
  ...(await orig<typeof import("@/lib/permissions/resolve")>()),
  can: async (resource: string, action: string) => (resource === "inventory" && action === "edit" ? h.canEdit : true),
}));
vi.mock("@/lib/auth/profile", () => ({
  getCurrentProfile: async () => ({ id: "u1", role: "Admin", status: "Active", email: "u1@x.co" }),
}));
vi.mock("@/lib/api/activity-log", () => ({ logActivity: vi.fn(async () => {}), computeChanges: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api/products", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/products")>()),
  consumeStock: (id: string, qty: number) => h.consume(id, qty),
  listStockForProduct: async () => h.lots,
}));

import { listBillableMaterialsForProject } from "@/lib/api/invoices";
import { listBillableMaterialsForProjectAction } from "@/app/(app)/invoices/actions";
import { adjustStockQuantity } from "@/lib/api/stock-movements";
import { commitStockDrawsAction, commitStockUnitAction } from "@/app/(app)/inventory/actions";
import { redactQuote } from "@/lib/permissions/field-redaction";
import type { Quote } from "@/lib/types";

beforeEach(() => {
  h.writes = [];
  h.tables = {};
  h.gates = { inventoryCost: true, quoteMargin: true, quoteInternal: true, vendorBanking: true, anyCost: true };
  h.canEdit = true;
  h.lots = [];
  h.consume.mockReset();
});

function billableFixture() {
  h.tables = {
    project_cost_centers: [{ id: "cc1", cc_number: "PJ-1", name: "Access control" }],
    // Two lots of one reader on the job: 2 @ $80 and 1 @ $95.
    inventory_stock: [
      { id: "s1", product_id: "reader", quantity: 2, unit_cost: 80, serial_number: null, custody_status: "in_stock", current_cost_center_id: "cc1" },
      { id: "s2", product_id: "reader", quantity: 1, unit_cost: 95, serial_number: null, custody_status: "in_stock", current_cost_center_id: "cc1" },
    ],
    inventory_products: [{ id: "reader", master_part_number: null, sku: "RDR", name: "Reader", description: null, list_price: 150, is_serialized: false, tracking_mode: "bulk" }],
    invoices: [],
  };
}

describe("Gap 5 — billable materials cost is quantity-weighted", () => {
  it("2 @ $80 + 1 @ $95 is $85.00 a unit ($255 total) — not the old plain average of $87.50", async () => {
    billableFixture();
    const [g] = await listBillableMaterialsForProject("p1");
    const oldPlainAverage = (80 + 95) / 2;
    expect(oldPlainAverage).toBe(87.5); // what it used to report
    expect(g.qty).toBe(3);
    expect(g.unit_cost).toBe(85);
    expect(g.total_cost).toBe(255);
    expect(g.unit_cost! * g.qty).toBe(g.total_cost);
    // Exact per-row cost is carried for specific-identification billing.
    expect(g.units.map((u) => [u.stock_id, u.quantity, u.unit_cost])).toEqual([
      ["s1", 2, 80],
      ["s2", 1, 95],
    ]);
  });

  it("SEC-1 — the costs are redacted for a caller without inventory cost visibility", async () => {
    billableFixture();
    h.gates = { ...h.gates, inventoryCost: false };
    const [g] = await listBillableMaterialsForProjectAction("p1");
    expect(g.unit_cost).toBeNull();
    expect(g.total_cost).toBeNull();
    expect(g.units.every((u) => u.unit_cost === null)).toBe(true);
    expect(g.qty).toBe(3); // quantities still shown
  });
});

describe("Gap 6 — a lot can reach zero", () => {
  it("a bulk lot adjusted to 0 is retired, keeps its quantity + receipt trail, and never writes quantity 0", async () => {
    h.tables = {
      inventory_stock: { id: "s1", product_id: "cable", quantity: 7, unit_cost: 0.42, po_number: "1042", acquired_at: "2026-10-01", notes: null, status: "in_stock", product: { is_serialized: false, tracking_mode: "bulk" } },
      profiles: { id: "u1", first_name: "U", last_name: null, display_name: null, email: "u1@x.co" },
    };
    const r = await adjustStockQuantity("s1", 0, "count found none");
    expect(r).toEqual({ quantity: 0, delta: -7 });
    const upd = h.writes.find((w) => w.table === "inventory_stock" && w.op === "update")!.payload as Record<string, unknown>;
    expect(upd.status).toBe("retired");
    expect(upd).not.toHaveProperty("quantity"); // the CHECK (quantity > 0) is never hit
    expect(String(upd.notes)).toMatch(/7 written off: count found none/);
    // Nothing deleted — the lot row (cost, PO, receipt date) survives.
    expect(h.writes.some((w) => w.table === "inventory_stock" && w.op === "delete")).toBe(false);
  });

  it("a serialized unit set to 0 is retired the same way (this used to fail too)", async () => {
    h.tables = {
      inventory_stock: { id: "cam", product_id: "camera", quantity: 1, unit_cost: 410, notes: null, status: "in_stock", serial_number: "SN1", product: { is_serialized: true, tracking_mode: "serialized" } },
      profiles: { id: "u1", first_name: "U", last_name: null, display_name: null, email: "u1@x.co" },
    };
    await adjustStockQuantity("cam", 0, "damaged");
    const upd = h.writes.find((w) => w.table === "inventory_stock" && w.op === "update")!.payload as Record<string, unknown>;
    expect(upd.status).toBe("retired");
    expect(upd).not.toHaveProperty("quantity");
  });

  it("a non-zero adjustment still just sets the quantity", async () => {
    h.tables = {
      inventory_stock: { id: "s1", product_id: "cable", quantity: 7, unit_cost: 0.42, notes: null, status: "in_stock", product: { is_serialized: false, tracking_mode: "bulk" } },
      profiles: { id: "u1", first_name: "U", last_name: null, display_name: null, email: "u1@x.co" },
    };
    await adjustStockQuantity("s1", 4, "recount");
    const upd = h.writes.find((w) => w.table === "inventory_stock" && w.op === "update")!.payload as Record<string, unknown>;
    expect(upd.quantity).toBe(4);
    expect(upd).not.toHaveProperty("status");
  });
});

describe("Gap 1 — committing a multi-lot line", () => {
  beforeEach(() => {
    h.lots = [
      { id: "lot-a", quantity: 10, unit_cost: 80, status: "in_stock" },
      { id: "lot-b", quantity: 10, unit_cost: 95, status: "in_stock" },
    ];
  });

  it("consumes 10 from lot A then 5 from lot B, each traced to its lot, at its own cost", async () => {
    h.consume.mockImplementation(async (id) => ({ consumedRowId: `${id}-used`, serialNumber: null }));
    const r = await commitStockDrawsAction({ productId: "reader", ref: "Q-1", draws: [{ stockId: "lot-a", qty: 10 }, { stockId: "lot-b", qty: 5 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(h.consume.mock.calls).toEqual([["lot-a", 10], ["lot-b", 5]]);
    expect(r.data.committed).toEqual([
      { sourceStockId: "lot-a", consumedRowId: "lot-a-used", qty: 10, unitCost: 80, serialNumber: null },
      { sourceStockId: "lot-b", consumedRowId: "lot-b-used", qty: 5, unitCost: 95, serialNumber: null },
    ]);
    expect(r.data.committed.reduce((s, c) => s + c.qty * c.unitCost!, 0)).toBe(1275);
    expect(r.data.error).toBeNull();
  });

  it("if a lot ran short since planning, it stops there — never re-plans onto another lot", async () => {
    h.consume.mockImplementationOnce(async () => ({ consumedRowId: "a-used", serialNumber: null }));
    h.consume.mockImplementationOnce(async () => {
      throw new Error("Insufficient stock: only 2 available (needed 5).");
    });
    const r = await commitStockDrawsAction({ productId: "reader", ref: "Q-1", draws: [{ stockId: "lot-a", qty: 10 }, { stockId: "lot-b", qty: 5 }] });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.committed.map((c) => c.sourceStockId)).toEqual(["lot-a"]); // recorded, not lost
    expect(r.data.error).toMatch(/only 2 available.*Re-plan/);
    expect(h.consume).toHaveBeenCalledTimes(2); // no third attempt elsewhere
  });

  it("needs inventory:edit — and so does the legacy single-lot commit (it had no gate)", async () => {
    h.canEdit = false;
    const a = await commitStockDrawsAction({ productId: "reader", ref: "Q-1", draws: [{ stockId: "lot-a", qty: 1 }] });
    const b = await commitStockUnitAction("lot-a", "reader", 1, "Q-1");
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    expect(h.consume).not.toHaveBeenCalled();
  });

  it("SEC-1 — committed costs go back only to cost-trusted callers", async () => {
    h.gates = { ...h.gates, anyCost: false };
    h.consume.mockImplementation(async (id) => ({ consumedRowId: `${id}-used`, serialNumber: null }));
    const r = await commitStockDrawsAction({ productId: "reader", ref: "Q-1", draws: [{ stockId: "lot-a", qty: 2 }] });
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.committed[0].unitCost).toBeNull();
  });
});

describe("SEC-1 — lot draws in the quote blob", () => {
  it("draw costs are redacted for a role without quotes:viewMargin", () => {
    const q = {
      id: "q1",
      sections: [
        {
          id: "s",
          name: "S",
          items: [
            {
              id: "li",
              type: "product",
              productId: "reader",
              name: "Reader",
              description: "",
              qty: 15,
              unitCost: 85,
              margin: 43,
              unitPrice: 150,
              stockDraws: [{ stockId: "lot-a", qty: 10, unitCost: 80 }, { stockId: "lot-b", qty: 5, unitCost: 95 }],
              committedDraws: [{ sourceStockId: "lot-a", consumedRowId: "c", qty: 10, unitCost: 80 }],
            },
          ],
        },
      ],
    } as unknown as Quote;
    const out = redactQuote(q, { quoteMargin: false, quoteInternal: true });
    const it0 = out.sections![0].items[0];
    expect(it0.unitCost).toBeNull();
    expect(it0.stockDraws!.every((d) => d.unitCost === null)).toBe(true);
    expect(it0.committedDraws!.every((d) => d.unitCost === null)).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/"unitCost":(80|95|85)/);
  });
});
