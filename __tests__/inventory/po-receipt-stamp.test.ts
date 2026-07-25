// INV-9-1 — receiving stamps the receipt dates that lead-time / on-time need.
//   - each line advanced by a receipt gets last_received_at = today
//   - a PO reaching 'received' gets fully_received_at = today (partial does not)

import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeSupabaseMock, type ChainCtx } from "../helpers/supabaseChainMock";

const TODAY = "2026-07-24";

const h = vi.hoisted(() => ({
  header: { id: "po1", po_number: "PO-1", vendor_id: "ven1", status: "issued" } as Record<string, unknown>,
  lines: [] as Record<string, unknown>[],
  lineUpdates: [] as Record<string, unknown>[],
  headerUpdates: [] as Record<string, unknown>[],
}));

function resolve(ctx: ChainCtx): { data: unknown; error: unknown } {
  const single = ctx.terminal === "single" || ctx.terminal === "maybeSingle";
  switch (ctx.table) {
    case "purchase_orders":
      if (ctx.op === "update") {
        h.headerUpdates.push(ctx.payload as Record<string, unknown>);
        return { data: { ...h.header, ...(ctx.payload as object) }, error: null };
      }
      return { data: h.header, error: null }; // select("*") load + select("status")
    case "vendors":
      return { data: { name: "Acme Supply" }, error: null };
    case "purchase_order_lines":
      if (ctx.op === "update") {
        h.lineUpdates.push(ctx.payload as Record<string, unknown>);
        return { data: null, error: null };
      }
      return { data: single ? h.lines[0] : h.lines, error: null };
    case "inventory_products":
      return { data: [{ id: "prodX", tracking_mode: "bulk" }], error: null };
    default:
      return { data: single ? null : [], error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => makeSupabaseMock(resolve) }));
vi.mock("@/lib/format", async (orig) => ({
  ...(await orig<typeof import("@/lib/format")>()),
  businessDateISO: () => TODAY,
}));
vi.mock("@/lib/api/products", () => ({ receiveStock: vi.fn(async () => ({ created: 1 })) }));

import { receivePurchaseOrderLines } from "@/lib/api/purchase-orders";

beforeEach(() => {
  h.header = { id: "po1", po_number: "PO-1", vendor_id: "ven1", status: "issued" };
  h.lines = [
    { id: "L1", purchase_order_id: "po1", product_id: "prodX", quantity: 5, unit_cost: 10, received_qty: 0 },
  ];
  h.lineUpdates = [];
  h.headerUpdates = [];
});

describe("receivePurchaseOrderLines receipt stamping", () => {
  it("stamps last_received_at on the line and fully_received_at when fully received", async () => {
    await receivePurchaseOrderLines("po1", [{ lineId: "L1", quantity: 5 }]);

    expect(h.lineUpdates).toHaveLength(1);
    expect(h.lineUpdates[0]).toMatchObject({ received_qty: 5, last_received_at: TODAY });

    // PO went issued → received, so the header carries fully_received_at.
    const headerPatch = h.headerUpdates.find((p) => p.status === "received");
    expect(headerPatch).toBeTruthy();
    expect(headerPatch!.fully_received_at).toBe(TODAY);
  });

  it("a PARTIAL receipt stamps the line but not fully_received_at", async () => {
    await receivePurchaseOrderLines("po1", [{ lineId: "L1", quantity: 3 }]);

    expect(h.lineUpdates[0]).toMatchObject({ received_qty: 3, last_received_at: TODAY });

    const headerPatch = h.headerUpdates.find((p) => p.status === "partially_received");
    expect(headerPatch).toBeTruthy();
    expect(headerPatch!.fully_received_at).toBeUndefined();
  });
});
